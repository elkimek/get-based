// light-device-session-engine.js — shared dose math for light-device sessions.
//
// UI/store modules own dialogs and persistence. This module owns the repeated
// session calculations: mode resolution, body-area fraction, distance scaling,
// spectrum synthesis, and SAD-lux fallback.

import type { SpectralDevice, SpectralDistribution } from './sun-spectrum-device.js';
import { BODY_REGIONS } from './sun-body-silhouette.js';
import {
  computeChannelDoses as computeSpectrumChannelDoses,
  effectiveDeviceForMode as getEffectiveDeviceForMode,
  erythemalSED as computeErythemalSED,
  fractionOfMED as computeFractionOfMED,
  ocularActinicUVdose as computeOcularActinicUVdose,
  synthesizeDeviceSpectrum as synthesizeSpectrumForDevice,
  validateModeCoupling as validateDeviceModeCoupling,
} from './sun-spectrum.js';

export const DEVICE_ENGINE_VERSION = 8;

const RED_NIR_SPECTRUM_START_NM = 600;
const RED_NIR_SPECTRUM_LENGTH = 81;

interface IrradianceReading {
  distanceCm: number;
  mwPerCm2: number;
  peakMwPerCm2?: number[];
  uvIndex?: number;
  // On-axis W/m²/nm, in the same 5 nm cells as the action-spectrum grid.
  redNirSpectrum?: number[];
}

export interface DeviceModel extends SpectralDevice {
  recommendedDistanceCm?: number | null;
  irradianceByDistanceCm?: IrradianceReading[] | null;
  distanceModel?: string | null; lux?: number | null;
  melanopicDER?: number | null; melanopicEdiLux?: number | null;
  melanopicBasis?: string | null; irradianceBasis?: string | null;
}
interface DeviceSessionDoseInput {
  device?: DeviceModel | null | undefined; durationMin?: number | undefined;
  distanceCm?: number | undefined; bodyArea?: string | undefined;
  bodyAreas?: string[] | null | undefined; eyesProtected?: boolean | undefined;
  bodyPlacements?: string[][] | null | undefined;
  mode?: string | null | undefined;
}
interface DeviceEngineDeps {
  validateModeCoupling: typeof validateDeviceModeCoupling;
  effectiveDeviceForMode: typeof getEffectiveDeviceForMode;
  synthesizeDeviceSpectrum: typeof synthesizeSpectrumForDevice;
  computeChannelDoses(options: Parameters<typeof computeSpectrumChannelDoses>[0]): Record<string, number>;
  erythemalSED: typeof computeErythemalSED;
  fractionOfMED: typeof computeFractionOfMED;
  ocularActinicUVdose: typeof computeOcularActinicUVdose;
}
interface DeviceSafety {
  hasUV: boolean; uvDoseStatus: string;
  erythemalSED: number | null; conservativeBaseMedFraction: number | null;
  ocularActinicUV: number | null; ocularUvaJPerM2: number | null; unsafeEyeExposure: boolean;
}
interface DeviceMetrics {
  photopicLux?: number | null; melanopicEdiLux?: number | null; melanopicStatus?: string;
}

export const DEVICE_BODY_AREA_FRACTIONS: Record<string, number> = {
  face: 0.04,
  arms: 0.10,
  torso: 0.13,
  legs: 0.30,
  'whole-body': 0.92,
  targeted: 0.05,
};

export const DEVICE_TYPE_CHANNELS = {
  // Type-only fallbacks stay narrow. Hybrid channels are derived from the
  // actual firing wavelengths, not granted by a broad `uvb` label.
  uvb: ['vitamin_d', 'pomc'],
  uva: ['pomc', 'no_cv'],
  combined: ['pbm_red', 'pbm_nir'],
  'pbm-targeted': ['pbm_red', 'pbm_nir'],
  sad: ['circadian'],
  'dawn-sim': ['circadian'],
  'full-spectrum': ['circadian'],
};

function _runtimeDeps(deps: Partial<DeviceEngineDeps> = {}) {
  return {
    validateModeCoupling: deps.validateModeCoupling || validateDeviceModeCoupling,
    effectiveDeviceForMode: deps.effectiveDeviceForMode || getEffectiveDeviceForMode,
    synthesizeDeviceSpectrum: deps.synthesizeDeviceSpectrum || synthesizeSpectrumForDevice,
    computeChannelDoses: deps.computeChannelDoses || computeSpectrumChannelDoses,
    erythemalSED: deps.erythemalSED || computeErythemalSED,
    fractionOfMED: deps.fractionOfMED || computeFractionOfMED,
    ocularActinicUVdose: deps.ocularActinicUVdose || computeOcularActinicUVdose,
  };
}

export function resolveDeviceMode(device: DeviceModel | null | undefined, mode: string | null = null, deps: Partial<DeviceEngineDeps> = {}) {
  if (!Array.isArray(device?.modes) || device.modes.length === 0) return mode ?? null;
  const found = device.modes.find(m => m.id === mode);
  const defaultMode = device.modes.find(m => m.default) || device.modes[0]!;
  let resolvedMode = found ? found.id : defaultMode.id;
  const { validateModeCoupling } = _runtimeDeps(deps);
  if (validateModeCoupling) {
    const validation = validateModeCoupling(device, resolvedMode);
    if (!validation.ok) resolvedMode = defaultMode.id;
  }
  return resolvedMode;
}

function deviceModePhases(device: DeviceModel | null | undefined, mode: string | null | undefined) {
  const modes = device?.modes;
  if (!Array.isArray(modes)) return null;
  const phases = modes.find(candidate => candidate.id === mode)?.phases;
  return Array.isArray(phases) && phases.length > 0 && phases.every(phase =>
    phase && Number.isFinite(phase.minutes) && phase.minutes > 0
    && modes.some(candidate => candidate.id === phase.mode && !candidate.phases && validateDeviceModeCoupling(device, candidate.id).ok)
  ) ? phases : null;
}

export function deviceProgramMinutes(device: DeviceModel | null | undefined, mode: string | null | undefined) {
  return deviceModePhases(device, mode)?.reduce((minutes, phase) => minutes + phase.minutes, 0) ?? null;
}

export function bodyFractionForDeviceSession({ bodyAreas = null, bodyArea = 'torso' }: Pick<DeviceSessionDoseInput, 'bodyAreas' | 'bodyArea'> = {}, bodyRegions: Array<{ key: string; fraction: number }> | null = BODY_REGIONS) {
  if (Array.isArray(bodyAreas) && bodyAreas.length > 0) {
    const fracByKey = Object.fromEntries((bodyRegions || []).map(r => [r.key, r.fraction]));
    const area = [...new Set(bodyAreas)].reduce((sum, key) => sum + (fracByKey[key] || 0), 0);
    return area > 0 ? area : DEVICE_BODY_AREA_FRACTIONS.targeted!;
  }
  return DEVICE_BODY_AREA_FRACTIONS[bodyArea] ?? 0.10;
}

function measuredSpectrumInput(device: DeviceModel | null | undefined, distanceCm: number) {
  const peakCount = device?.peakWavelengths?.length;
  const table = device?.irradianceByDistanceCm;
  if (!peakCount || !Array.isArray(table) || table.length < 2 || !table.every(row =>
    row && Number.isFinite(row.distanceCm) && row.distanceCm > 0
    && Array.isArray(row.peakMwPerCm2) && row.peakMwPerCm2.length === peakCount
    && row.peakMwPerCm2.every(value => Number.isFinite(value) && value >= 0)
  )) return null;
  const sorted = table.slice().sort((a, b) => a.distanceCm - b.distanceCm);
  const first = sorted[0]!, last = sorted[sorted.length - 1]!;
  const actual = Math.max(first.distanceCm, Math.min(last.distanceCm, distanceCm));
  const upper = sorted.findIndex(row => row.distanceCm >= actual);
  const a = sorted[Math.max(0, upper - 1)]!, b = sorted[upper]!;
  if (!a || !b) return null;
  const t = a === b ? 0 : (actual - a.distanceCm) / (b.distanceCm - a.distanceCm);
  const peakShares = a.peakMwPerCm2!.map((value, index) => value + t * (b.peakMwPerCm2![index]! - value));
  const validRedNir = (values: number[] | undefined): values is number[] => Array.isArray(values)
    && values.length === RED_NIR_SPECTRUM_LENGTH && values.every(value => Number.isFinite(value) && value >= 0);
  return {
    peakShares,
    mwPerCm2At15cm: peakShares.reduce((sum, value) => sum + value, 0),
    uvIndex: typeof a.uvIndex === 'number' && a.uvIndex >= 0 && Number.isFinite(a.uvIndex)
      && typeof b.uvIndex === 'number' && b.uvIndex >= 0 && Number.isFinite(b.uvIndex)
      ? a.uvIndex + t * (b.uvIndex - a.uvIndex) : null,
    redNirSpectrum: validRedNir(a.redNirSpectrum) && validRedNir(b.redNirSpectrum)
      ? a.redNirSpectrum.map((value, index) => value + t * (b.redNirSpectrum![index]! - value)) : null,
  };
}

export function deviceDistanceFactor(device: DeviceModel | null | undefined, distanceCm = 15) {
  const baseRangeCm = device?.recommendedDistanceCm || 15;
  const measuredDistance = Number.isFinite(distanceCm) ? distanceCm : 15;
  const table = Array.isArray(device?.irradianceByDistanceCm)
    ? device.irradianceByDistanceCm
        .filter(p => Number.isFinite(p?.distanceCm) && Number.isFinite(p?.mwPerCm2) && p.distanceCm > 0 && p.mwPerCm2 >= 0)
        .slice().sort((a, b) => a.distanceCm - b.distanceCm)
    : [];
  if (table.length >= 2) {
    const sample = (cm: number) => {
      if (cm <= table[0]!.distanceCm) return table[0]!.mwPerCm2;
      if (cm >= table[table.length - 1]!.distanceCm) return table[table.length - 1]!.mwPerCm2;
      for (let i = 0; i < table.length - 1; i++) {
        const a = table[i]!, b = table[i + 1]!;
        if (cm < a.distanceCm || cm > b.distanceCm) continue;
        const t = (cm - a.distanceCm) / (b.distanceCm - a.distanceCm);
        return a.mwPerCm2 + t * (b.mwPerCm2 - a.mwPerCm2);
      }
      return null;
    };
    const reference = sample(baseRangeCm);
    const actual = sample(Math.max(measuredDistance, 1));
    if (reference! > 0 && actual != null) return Math.max(0, Math.min(5, actual / reference!));
  }
  // Extended panels in their near field do not obey point-source inverse
  // square. Only apply that model when the device explicitly declares it.
  if (device?.distanceModel === 'point-source') {
    const rawDistFactor = (baseRangeCm / Math.max(measuredDistance, 5)) ** 2;
    return Math.min(rawDistFactor, 3.0);
  }
  return 1;
}

export function deviceEmitsUV(device: DeviceModel | null | undefined, mode: string | null = null, deps: Partial<DeviceEngineDeps> = {}) {
  if (!device) return false;
  const { effectiveDeviceForMode } = _runtimeDeps(deps);
  const resolvedMode = resolveDeviceMode(device, mode, deps);
  const effective = effectiveDeviceForMode
    ? effectiveDeviceForMode(device, resolvedMode)
    : device;
  const peaks = Array.isArray(effective?.peakWavelengths)
    ? effective.peakWavelengths.filter(nm => Number.isFinite(nm))
    : [];
  if (peaks.some(nm => nm >= 180 && nm < 400)) return true;
  // A vendor-defined red/NIR-only mode on a hybrid UV device is genuinely
  // non-UV. Without a usable mode subset, however, the declared UVA/UVB type
  // is the safer source of truth when wavelength specs are missing or wrong.
  const hasResolvedModeSubset = Array.isArray(device?.modes)
    && device.modes.length > 0
    && !!device.modes.find(candidate => candidate.id === resolvedMode)
    && peaks.length > 0;
  if (hasResolvedModeSubset) return false;
  return device?.type === 'uvb' || device?.type === 'uva';
}

function _distanceModelInfo(device: DeviceModel | null | undefined, distanceCm: number) {
  const referenceCm = Number(device?.recommendedDistanceCm) || 15;
  const actualCm = Number.isFinite(distanceCm) && distanceCm > 0 ? distanceCm : referenceCm;
  const table = Array.isArray(device?.irradianceByDistanceCm)
    ? device.irradianceByDistanceCm
        .filter(point => Number.isFinite(point?.distanceCm) && Number.isFinite(point?.mwPerCm2) && point.distanceCm > 0)
        .slice().sort((a, b) => a.distanceCm - b.distanceCm)
    : [];
  if (table.length >= 2) {
    const min = table[0]!.distanceCm;
    const max = table[table.length - 1]!.distanceCm;
    return actualCm < min || actualCm > max
      ? { basis: 'measured-boundary', warning: `Recorded distance is outside the ${min}–${max} cm measured range; the nearest measured value was used without extrapolation.` }
      : { basis: 'measured-table', warning: null };
  }
  if (device?.distanceModel === 'point-source') return { basis: 'point-source', warning: null };
  if (Math.abs(actualCm - referenceCm) > Math.max(1, referenceCm * 0.05)) {
    return {
      basis: 'reference-only',
      warning: `Recorded distance differs from the ${referenceCm} cm reference, but this panel has no measured distance curve; no distance correction was invented.`,
    };
  }
  return { basis: 'reference-distance', warning: null };
}

function _unweightedUvaDose({ spectrum, durationSec = 0 }: { spectrum?: SpectralDistribution | null; durationSec?: number }) {
  if (!spectrum || durationSec <= 0) return 0;
  const dlambda = 5;
  let uvaIrradiance = 0;
  for (let index = 0; index < spectrum.irradiance.length; index++) {
    const nm = spectrum.wavelengths[index]!;
    if (nm < 315 || nm > 400) continue;
    uvaIrradiance += (Number(spectrum.irradiance[index]) || 0) * dlambda;
  }
  return uvaIrradiance * durationSec;
}

function computeSingleDeviceExposure({
  device,
  durationMin = 0,
  distanceCm = 15,
  bodyArea = 'torso',
  bodyAreas = null,
  eyesProtected = true,
  mode = null,
}: DeviceSessionDoseInput = {}, deps: Partial<DeviceEngineDeps> = {}) {
  const referenceUnknown = device?.recommendedDistanceCm === null;
  // Explicit unknown reference distance is not the legacy omitted 15 cm default.
  // Keep the original reported specification; withhold numerical reference estimates.
  if (referenceUnknown) device = { ...device, mwPerCm2At15cm: null, lux: null, melanopicDER: null, melanopicEdiLux: null };
  const resolvedMode = resolveDeviceMode(device, mode, deps);
  const bodyExposureFraction = bodyFractionForDeviceSession({ bodyAreas, bodyArea });
  const distanceFactor = deviceDistanceFactor(device, distanceCm);
  const safeDurationMin = Number.isFinite(durationMin) && durationMin > 0 ? durationMin : 0;
  const durationSec = safeDurationMin * 60;
  const { effectiveDeviceForMode, synthesizeDeviceSpectrum, computeChannelDoses, erythemalSED, fractionOfMED, ocularActinicUVdose } = _runtimeDeps(deps);
  const measured = referenceUnknown ? null : measuredSpectrumInput(device, distanceCm);
  const spectralDevice = measured ? { ...device, ...measured } : device;
  const effectiveDevice = effectiveDeviceForMode(spectralDevice, resolvedMode);
  const effectivePeaks = Array.isArray(effectiveDevice?.peakWavelengths)
    ? effectiveDevice.peakWavelengths.filter(nm => Number.isFinite(nm))
    : [];
  const hasPeaks = effectivePeaks.length > 0;
  const hasIrradiance = ((effectiveDevice?.mwPerCm2At15cm || 0) as number) > 0;
  const hasUV = deviceEmitsUV(device, resolvedMode, deps);
  const isAmbientEyeDevice = ['sad', 'dawn-sim', 'full-spectrum'].includes(device?.type as string) && !hasUV;
  // Therapy panels never earn an eye-channel benefit merely because goggles
  // were omitted. Ambient eye-light devices are the only device class whose
  // normal use intentionally places open eyes in the illuminated environment.
  const eyeMode = isAmbientEyeDevice && !eyesProtected ? 'direct' : 'closed-eyes';
  let doses: Record<string, number> = {};
  let safety: DeviceSafety = {
    hasUV,
    uvDoseStatus: hasUV ? 'unavailable' : 'not-applicable',
    erythemalSED: hasUV ? null : 0,
    conservativeBaseMedFraction: hasUV ? null : 0,
    ocularActinicUV: hasUV ? null : 0,
    ocularUvaJPerM2: hasUV ? null : 0,
    unsafeEyeExposure: hasUV && !eyesProtected,
  };
  const metrics: DeviceMetrics = {};
  const warnings: string[] = referenceUnknown ? ['Reference distance is unknown; reference-based numerical estimates are withheld.'] : [];
  const distanceInfo = _distanceModelInfo(device, distanceCm);
  if (distanceInfo.warning) warnings.push(distanceInfo.warning);
  const sourcePeaks = Array.isArray(device?.peakWavelengths)
    ? device.peakWavelengths.filter(nm => Number.isFinite(nm))
    : [];
  const sourceHasUV = sourcePeaks.some(nm => nm >= 180 && nm < 400) || ['uvb', 'uva'].includes(device?.type as string);
  const sourceHasNonUV = sourcePeaks.some(nm => nm >= 400);
  const hasDeclaredPeakShares = !!measured || (Array.isArray(device?.peakShares)
    && device.peakShares.length === sourcePeaks.length
    && device.peakShares.some(share => Number(share) > 0)
    && device.peakShareBasis !== 'heuristic');
  const distanceSupportsUvDose = ['measured-table', 'point-source', 'reference-distance'].includes(distanceInfo.basis);
  const uvDoseQuantifiable = hasUV && hasIrradiance && distanceSupportsUvDose
    && (!(sourceHasUV && sourceHasNonUV) || hasDeclaredPeakShares);

  if (synthesizeDeviceSpectrum && computeChannelDoses && hasPeaks && hasIrradiance) {
    const baseSpec = synthesizeDeviceSpectrum(effectiveDevice!);
    const redNirPeaks = sourcePeaks.filter(nm => nm >= RED_NIR_SPECTRUM_START_NM);
    const measuredRedNir = measured?.redNirSpectrum && redNirPeaks.length > 0
      && redNirPeaks.every(nm => effectivePeaks.includes(nm)) ? measured.redNirSpectrum : null;
    const spectrum = {
      wavelengths: baseSpec.wavelengths,
      irradiance: baseSpec.irradiance.map((value, index) => {
        const nm = baseSpec.wavelengths[index]!;
        if (measuredRedNir && nm >= RED_NIR_SPECTRUM_START_NM) {
          return measuredRedNir[(nm - RED_NIR_SPECTRUM_START_NM) / 5] ?? 0;
        }
        return measured ? value : value * distanceFactor;
      }),
    };
    doses = computeChannelDoses({
      spectrum,
      durationMin: safeDurationMin,
      bodyExposureFraction,
      eyeExposure: { mode: eyeMode, durationSec },
    });
    let sed = uvDoseQuantifiable && erythemalSED ? erythemalSED({
      spectrum,
      durationMin: safeDurationMin,
      bodyExposureFraction,
    }) : null;
    if (sed !== null && measured?.uvIndex != null) {
      // Vendor UVI is CIE-weighted for the full UV spectrum. Use the modeled
      // fraction of that weighted output when only one UV group is on.
      const fullSED = erythemalSED({ spectrum: synthesizeDeviceSpectrum(spectralDevice), durationMin: safeDurationMin, bodyExposureFraction });
      if (fullSED > 0) {
        const measuredSED = measured.uvIndex * 0.025 * durationSec / 100;
        sed *= measuredSED / fullSED;
        if (doses.pomc !== undefined) doses.pomc *= measuredSED / fullSED;
      }
    }
    const ocularActinicUV = uvDoseQuantifiable && !eyesProtected && ocularActinicUVdose
      ? ocularActinicUVdose({ spectrum, eyeExposure: { mode: 'direct', durationSec } })
      : (uvDoseQuantifiable ? 0 : null);
    const ocularUvaJPerM2 = uvDoseQuantifiable && !eyesProtected
      ? _unweightedUvaDose({ spectrum, durationSec })
      : (uvDoseQuantifiable ? 0 : null);
    if (hasUV && !uvDoseQuantifiable) {
      // A hybrid panel's total irradiance does not reveal how much power is
      // in UV. Never manufacture UVB/vitamin-D or burn numbers from the
      // generic red/NIR-heavy split used for wellness-channel visualization.
      for (const key of ['vitamin_d', 'pomc', 'no_cv', 'violet_eye']) delete doses[key];
      warnings.push(!distanceSupportsUvDose
        ? 'UV output is present, but the recorded distance is outside the measured range or differs from an unmodeled reference distance. UV-derived channels, eye dose, vitamin D, and burn estimates are withheld.'
        : 'UV output is present, but no measured or declared UV band split is available. UV-derived channels, eye dose, vitamin D, and burn estimates are withheld.');
    }
    safety = {
      hasUV,
      uvDoseStatus: uvDoseQuantifiable ? 'modeled' : (hasUV ? 'unavailable' : 'not-applicable'),
      erythemalSED: sed,
      conservativeBaseMedFraction: uvDoseQuantifiable && fractionOfMED
        ? fractionOfMED({ sed, fitzpatrick: 'I' } as Parameters<typeof computeFractionOfMED>[0])
        : (hasUV ? null : 0),
      ocularActinicUV,
      ocularUvaJPerM2,
      unsafeEyeExposure: hasUV && !eyesProtected,
    };
  } else {
    // Lux-only SAD data is photopic. It cannot become M-EDI without a
    // measured spectrum or a declared melanopic daylight efficacy ratio.
    const lux = device?.lux || 0;
    const directMelanopicEdi = Number(device?.melanopicEdiLux);
    const photopicLux = lux * distanceFactor;
    const melanopicDER = Number(device?.melanopicDER);
    metrics.photopicLux = photopicLux > 0 ? photopicLux : null;
    metrics.melanopicEdiLux = null;
    metrics.melanopicStatus = 'spectrum-required';
    if (!eyesProtected && Number.isFinite(directMelanopicEdi) && directMelanopicEdi > 0) {
      const melanopicEdiLux = directMelanopicEdi * distanceFactor;
      doses.circadian = melanopicEdiLux * 0.0013262 * durationSec;
      metrics.melanopicEdiLux = melanopicEdiLux;
      metrics.melanopicStatus = 'device-medi';
    } else if (!eyesProtected && photopicLux > 0 && Number.isFinite(melanopicDER) && melanopicDER > 0) {
      const melanopicEdiLux = photopicLux * melanopicDER;
      doses.circadian = melanopicEdiLux * 0.0013262 * durationSec;
      metrics.melanopicEdiLux = melanopicEdiLux;
      metrics.melanopicStatus = 'device-der';
    }
    if (hasUV) warnings.push('This UV mode has no usable spectral irradiance, so UV dose, vitamin D, and burn estimates are unavailable.');
    else if (photopicLux <= 0 && !(Number.isFinite(directMelanopicEdi) && directMelanopicEdi > 0)) warnings.push('No usable irradiance or eye-level light measurement is stored for this device, so numerical light signals are unavailable.');
    else if (photopicLux > 0 && (!Number.isFinite(melanopicDER) || melanopicDER <= 0)) warnings.push('Photopic lux is stored, but melanopic EDI needs a measured spectrum or declared melanopic DER.');
    if (Number.isFinite(directMelanopicEdi) && directMelanopicEdi > 0 && device?.melanopicBasis === 'vendor-claim') {
      warnings.push('Melanopic EDI is vendor-stated; the measurement method is not independently verified here.');
    }
  }

  const irradianceBasis = device?.irradianceBasis || 'unknown';
  if (hasIrradiance && ['curated-estimate', 'unknown'].includes(irradianceBasis)) {
    warnings.push(irradianceBasis === 'curated-estimate'
      ? 'Reference irradiance is a curated estimate rather than a device-specific radiometer measurement.'
      : 'The provenance of the stored reference irradiance is not recorded.');
  }
  if (measured) warnings.push('Uses on-axis vendor measurements at continuous output. Dose can vary across the panel footprint and with program intensity or pulsing.');
  const modelStatus = warnings.some(warning => /unavailable|withheld|no usable/i.test(warning))
    ? 'partial'
    : (distanceInfo.basis === 'reference-only' || distanceInfo.basis === 'measured-boundary' ? 'reference-only' : 'computed');

  return {
    doses,
    mode: resolvedMode,
    bodyExposureFraction,
    distanceFactor,
    eyeMode,
    durationSec,
    safety,
    metrics,
    model: {
      status: modelStatus,
      spectralBasis: hasPeaks && hasIrradiance
        ? (hasDeclaredPeakShares ? (device?.peakShareBasis || 'declared') : 'heuristic')
        : 'insufficient-specs',
      irradianceBasis,
      distanceBasis: distanceInfo.basis,
      warnings,
    },
    distanceModel: Array.isArray(device?.irradianceByDistanceCm) && device.irradianceByDistanceCm.length >= 2
      ? 'measured-table'
      : device?.distanceModel === 'point-source' ? 'point-source' : 'reference-only',
    engineVersion: DEVICE_ENGINE_VERSION,
  };
}

type DeviceExposure = ReturnType<typeof computeSingleDeviceExposure>;
const LOCAL_FLUENCE_CHANNELS = ['nir_solar', 'pbm_red', 'pbm_nir'];
const UV_CHANNELS = ['vitamin_d', 'pomc', 'no_cv', 'violet_eye'];

export function computeDeviceSessionDoses(input: DeviceSessionDoseInput = {}, deps: Partial<DeviceEngineDeps> = {}): DeviceExposure {
  const mode = resolveDeviceMode(input.device, input.mode, deps);
  const phases = deviceModePhases(input.device, mode);
  const grouped = Array.isArray(input.bodyPlacements) && input.bodyPlacements.length > 0 ? input.bodyPlacements : null;
  if (!phases && !grouped) return computeSingleDeviceExposure(input, deps);
  const placements = grouped ?? [input.bodyAreas];

  const totalMinutes = Math.max(0, Number.isFinite(input.durationMin) ? input.durationMin! : 0);
  const minutesPerPlacement = totalMinutes / placements.length;
  const timing = phases ?? [{ mode, minutes: minutesPerPlacement }];
  const exposures: DeviceExposure[] = [];
  const doses: Record<string, number> = {};
  const localDoses = new Map<string, Record<string, number>>();
  let highestOverlap = 1;
  const counts = new Map<string, number>();
  for (const areas of placements) {
    const keys = [...new Set(areas?.length ? areas : [input.bodyArea || 'torso'])];
    for (const key of keys) {
      const count = (counts.get(key) || 0) + 1;
      counts.set(key, count);
      highestOverlap = Math.max(highestOverlap, count);
    }
    let remaining = minutesPerPlacement;
    for (const phase of timing) {
      const minutes = Math.min(remaining, phase.minutes);
      const exposure = computeSingleDeviceExposure({ ...input, mode: phase.mode, durationMin: minutes, bodyAreas: areas }, deps);
      exposures.push(exposure);
      for (const [key, dose] of Object.entries(exposure.doses)) {
        if (LOCAL_FLUENCE_CHANNELS.includes(key)) {
          for (const region of keys) {
            const local = localDoses.get(region) ?? {};
            local[key] = (local[key] ?? 0) + dose;
            localDoses.set(region, local);
          }
        } else doses[key] = (doses[key] ?? 0) + dose;
      }
      remaining -= minutes;
      if (remaining <= 0) break;
    }
  }
  for (const local of localDoses.values()) {
    for (const [key, dose] of Object.entries(local)) doses[key] = Math.max(doses[key] ?? 0, dose);
  }
  const first = exposures[0]!;
  const uv = exposures.filter(exposure => exposure.safety.hasUV);
  const unknownUV = uv.some(exposure => exposure.safety.erythemalSED === null);
  if (unknownUV) for (const channel of UV_CHANNELS) delete doses[channel];
  // All passes share timing and distance. SED is the highest local dose,
  // while an unshielded eye estimate sums all UV phases as direct exposure.
  const sed = unknownUV ? null : uv.reduce((sum, exposure) => sum + (exposure.safety.erythemalSED ?? 0), 0) / placements.length * highestOverlap;
  const warnings = [...new Set(exposures.flatMap(exposure => exposure.model.warnings))];
  if (highestOverlap > 1) warnings.push('Regions selected in multiple placements accumulate local dose. A partly overlapping region is modeled as fully overlapping.');
  if (placements.length > 1 && uv.some(exposure => exposure.safety.unsafeEyeExposure)) warnings.push('Unshielded eye dose assumes direct exposure in every UV placement.');
  return {
    ...first,
    mode,
    doses,
    durationSec: totalMinutes * 60,
    bodyExposureFraction: bodyFractionForDeviceSession({ bodyArea: input.bodyArea, bodyAreas: placements.flatMap(areas => areas ?? []) }),
    safety: {
      hasUV: uv.length > 0,
      uvDoseStatus: unknownUV ? 'unavailable' : uv.length ? 'modeled' : 'not-applicable',
      erythemalSED: sed,
      conservativeBaseMedFraction: sed === null ? null : _runtimeDeps(deps).fractionOfMED({ sed, fitzpatrick: 'I' }),
      ocularActinicUV: unknownUV ? null : uv.reduce((sum, exposure) => sum + (exposure.safety.ocularActinicUV ?? 0), 0),
      ocularUvaJPerM2: unknownUV ? null : uv.reduce((sum, exposure) => sum + (exposure.safety.ocularUvaJPerM2 ?? 0), 0),
      unsafeEyeExposure: uv.some(exposure => exposure.safety.unsafeEyeExposure),
    },
    model: { ...first.model, status: exposures.some(exposure => exposure.model.status === 'partial') ? 'partial' : first.model.status, warnings },
  };
}
