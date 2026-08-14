// @ts-check
// light-device-session-engine.js — shared dose math for light-device sessions.
//
// UI/store modules own dialogs and persistence. This module owns the repeated
// session calculations: mode resolution, body-area fraction, distance scaling,
// spectrum synthesis, and SAD-lux fallback.

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

export const DEVICE_ENGINE_VERSION = 5;

/**
 * @typedef {object} DeviceSessionDoseInput
 * @property {any} [device]
 * @property {number} [durationMin=0]
 * @property {number} [distanceCm]
 * @property {string} [bodyArea]
 * @property {string[]|null} [bodyAreas]
 * @property {boolean} [eyesProtected]
 * @property {string|null} [mode]
 */

export const DEVICE_BODY_AREA_FRACTIONS = {
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

function _runtimeDeps(deps = {}) {
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

/**
 * @param {any} device
 * @param {string|null} [mode]
 * @param {any} [deps]
 */
export function resolveDeviceMode(device, mode = null, deps = {}) {
  if (!Array.isArray(device?.modes) || device.modes.length === 0) return mode ?? null;
  const found = device.modes.find(m => m.id === mode);
  const defaultMode = device.modes.find(m => m.default) || device.modes[0];
  let resolvedMode = found ? found.id : defaultMode.id;
  const { validateModeCoupling } = _runtimeDeps(deps);
  if (validateModeCoupling) {
    const validation = validateModeCoupling(device, resolvedMode);
    if (!validation.ok) resolvedMode = defaultMode.id;
  }
  return resolvedMode;
}

/**
 * @param {{ bodyAreas?: string[] | null, bodyArea?: string }} [selection]
 * @param {Array<{ key: string, fraction: number }> | null} [bodyRegions]
 */
export function bodyFractionForDeviceSession({ bodyAreas = null, bodyArea = 'torso' } = {}, bodyRegions = BODY_REGIONS) {
  if (Array.isArray(bodyAreas) && bodyAreas.length > 0) {
    const fracByKey = Object.fromEntries((bodyRegions || []).map(r => [r.key, r.fraction]));
    const area = bodyAreas.reduce((sum, key) => sum + (fracByKey[key] || 0), 0);
    return area > 0 ? area : DEVICE_BODY_AREA_FRACTIONS.targeted;
  }
  return DEVICE_BODY_AREA_FRACTIONS[bodyArea] ?? 0.10;
}

export function deviceDistanceFactor(device, distanceCm = 15) {
  const baseRangeCm = device?.recommendedDistanceCm || 15;
  const measuredDistance = Number.isFinite(distanceCm) ? distanceCm : 15;
  const table = Array.isArray(device?.irradianceByDistanceCm)
    ? device.irradianceByDistanceCm
        .filter(p => Number.isFinite(p?.distanceCm) && Number.isFinite(p?.mwPerCm2) && p.distanceCm > 0 && p.mwPerCm2 >= 0)
        .slice().sort((a, b) => a.distanceCm - b.distanceCm)
    : [];
  if (table.length >= 2) {
    const sample = (cm) => {
      if (cm <= table[0].distanceCm) return table[0].mwPerCm2;
      if (cm >= table[table.length - 1].distanceCm) return table[table.length - 1].mwPerCm2;
      for (let i = 0; i < table.length - 1; i++) {
        const a = table[i], b = table[i + 1];
        if (cm < a.distanceCm || cm > b.distanceCm) continue;
        const t = (cm - a.distanceCm) / (b.distanceCm - a.distanceCm);
        return a.mwPerCm2 + t * (b.mwPerCm2 - a.mwPerCm2);
      }
      return null;
    };
    const reference = sample(baseRangeCm);
    const actual = sample(Math.max(measuredDistance, 1));
    if (reference > 0 && actual != null) return Math.max(0, Math.min(5, actual / reference));
  }
  // Extended panels in their near field do not obey point-source inverse
  // square. Only apply that model when the device explicitly declares it.
  if (device?.distanceModel === 'point-source') {
    const rawDistFactor = (baseRangeCm / Math.max(measuredDistance, 5)) ** 2;
    return Math.min(rawDistFactor, 3.0);
  }
  return 1;
}

export function deviceEmitsUV(device, mode = null, deps = {}) {
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

function _distanceModelInfo(device, distanceCm) {
  const referenceCm = Number(device?.recommendedDistanceCm) || 15;
  const actualCm = Number.isFinite(distanceCm) && distanceCm > 0 ? distanceCm : referenceCm;
  const table = Array.isArray(device?.irradianceByDistanceCm)
    ? device.irradianceByDistanceCm
        .filter(point => Number.isFinite(point?.distanceCm) && Number.isFinite(point?.mwPerCm2) && point.distanceCm > 0)
        .slice().sort((a, b) => a.distanceCm - b.distanceCm)
    : [];
  if (table.length >= 2) {
    const min = table[0].distanceCm;
    const max = table[table.length - 1].distanceCm;
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

function _unweightedUvaDose({ spectrum, durationSec = 0 }) {
  if (!spectrum || durationSec <= 0) return 0;
  const dlambda = 5;
  let uvaIrradiance = 0;
  for (let index = 0; index < spectrum.irradiance.length; index++) {
    const nm = spectrum.wavelengths[index];
    if (nm < 315 || nm > 400) continue;
    uvaIrradiance += (Number(spectrum.irradiance[index]) || 0) * dlambda;
  }
  return uvaIrradiance * durationSec;
}

/**
 * @param {DeviceSessionDoseInput} [input]
 * @param {any} [deps]
 */
export function computeDeviceSessionDoses({
  device,
  durationMin = 0,
  distanceCm = 15,
  bodyArea = 'torso',
  bodyAreas = null,
  eyesProtected = true,
  mode = null,
} = {}, deps = {}) {
  const resolvedMode = resolveDeviceMode(device, mode, deps);
  const bodyExposureFraction = bodyFractionForDeviceSession({ bodyAreas, bodyArea });
  const distanceFactor = deviceDistanceFactor(device, distanceCm);
  const safeDurationMin = Number.isFinite(durationMin) && durationMin > 0 ? durationMin : 0;
  const durationSec = safeDurationMin * 60;
  const { effectiveDeviceForMode, synthesizeDeviceSpectrum, computeChannelDoses, erythemalSED, fractionOfMED, ocularActinicUVdose } = _runtimeDeps(deps);
  const effectiveDevice = effectiveDeviceForMode
    ? effectiveDeviceForMode(device, resolvedMode)
    : device;
  const effectivePeaks = Array.isArray(effectiveDevice?.peakWavelengths)
    ? effectiveDevice.peakWavelengths.filter(nm => Number.isFinite(nm))
    : [];
  const hasPeaks = effectivePeaks.length > 0;
  const hasIrradiance = (effectiveDevice?.mwPerCm2At15cm || 0) > 0;
  const hasUV = deviceEmitsUV(device, resolvedMode, deps);
  const isAmbientEyeDevice = ['sad', 'dawn-sim', 'full-spectrum'].includes(device?.type) && !hasUV;
  // Therapy panels never earn an eye-channel benefit merely because goggles
  // were omitted. Ambient eye-light devices are the only device class whose
  // normal use intentionally places open eyes in the illuminated environment.
  const eyeMode = isAmbientEyeDevice && !eyesProtected ? 'direct' : 'closed-eyes';
  let doses = {};
  let safety = {
    hasUV,
    uvDoseStatus: hasUV ? 'unavailable' : 'not-applicable',
    erythemalSED: hasUV ? null : 0,
    conservativeBaseMedFraction: hasUV ? null : 0,
    ocularActinicUV: hasUV ? null : 0,
    ocularUvaJPerM2: hasUV ? null : 0,
    unsafeEyeExposure: hasUV && !eyesProtected,
  };
  const metrics = {};
  const warnings = [];
  const distanceInfo = _distanceModelInfo(device, distanceCm);
  if (distanceInfo.warning) warnings.push(distanceInfo.warning);
  const sourcePeaks = Array.isArray(device?.peakWavelengths)
    ? device.peakWavelengths.filter(nm => Number.isFinite(nm))
    : [];
  const sourceHasUV = sourcePeaks.some(nm => nm >= 180 && nm < 400) || ['uvb', 'uva'].includes(device?.type);
  const sourceHasNonUV = sourcePeaks.some(nm => nm >= 400);
  const hasDeclaredPeakShares = Array.isArray(device?.peakShares)
    && device.peakShares.length === sourcePeaks.length
    && device.peakShares.some(share => Number(share) > 0)
    && device.peakShareBasis !== 'heuristic';
  const distanceSupportsUvDose = ['measured-table', 'point-source', 'reference-distance'].includes(distanceInfo.basis);
  const uvDoseQuantifiable = hasUV && hasIrradiance && distanceSupportsUvDose
    && (!(sourceHasUV && sourceHasNonUV) || hasDeclaredPeakShares);

  if (synthesizeDeviceSpectrum && computeChannelDoses && hasPeaks && hasIrradiance) {
    const baseSpec = synthesizeDeviceSpectrum(effectiveDevice);
    const spectrum = {
      wavelengths: baseSpec.wavelengths,
      irradiance: (baseSpec.irradiance || []).map(v => v * distanceFactor),
    };
    doses = computeChannelDoses({
      spectrum,
      durationMin: safeDurationMin,
      bodyExposureFraction,
      eyeExposure: { mode: eyeMode, durationSec },
    });
    const sed = uvDoseQuantifiable && erythemalSED ? erythemalSED({
      spectrum,
      durationMin: safeDurationMin,
      bodyExposureFraction,
    }) : null;
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
        ? fractionOfMED({ sed, fitzpatrick: 'I' })
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
