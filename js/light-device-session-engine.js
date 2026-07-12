// @ts-check
// light-device-session-engine.js — shared dose math for light-device sessions.
//
// UI/store modules own dialogs and persistence. This module owns the repeated
// session calculations: mode resolution, body-area fraction, distance scaling,
// spectrum synthesis, and SAD-lux fallback.

import { BODY_REGIONS } from './sun-body-silhouette.js';
import {
  validateModeCoupling as defaultValidateModeCoupling,
  effectiveDeviceForMode as defaultEffectiveDeviceForMode,
  synthesizeDeviceSpectrum as defaultSynthesizeDeviceSpectrum,
  computeChannelDoses as defaultComputeChannelDoses,
  erythemalSED as defaultErythemalSED,
  retinalUVdose as defaultRetinalUVdose,
  heuristicPeakShares as defaultHeuristicPeakShares,
} from './sun-spectrum.js';

/**
 * @typedef {object} DeviceSessionDoseInput
 * @property {any} [device]
 * @property {number} [durationMin]
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
  uvb: ['vitamin_d', 'pomc', 'no_cv', 'violet_eye', 'circadian', 'pbm_red', 'pbm_nir'],
  uva: ['no_cv', 'violet_eye', 'pbm_red', 'pbm_nir'],
  combined: ['pbm_red', 'pbm_nir'],
  'pbm-targeted': ['pbm_red', 'pbm_nir'],
  sad: ['circadian'],
  'dawn-sim': ['circadian'],
  'full-spectrum': ['circadian'],
};

function _runtimeDeps(deps = {}) {
  const w = typeof window !== 'undefined' ? window : {};
  return {
    validateModeCoupling: deps.validateModeCoupling || w.validateModeCoupling || defaultValidateModeCoupling,
    effectiveDeviceForMode: deps.effectiveDeviceForMode || w.effectiveDeviceForMode || defaultEffectiveDeviceForMode,
    synthesizeDeviceSpectrum: deps.synthesizeDeviceSpectrum || w.synthesizeDeviceSpectrum || defaultSynthesizeDeviceSpectrum,
    computeChannelDoses: deps.computeChannelDoses || w.computeChannelDoses || defaultComputeChannelDoses,
    erythemalSED: deps.erythemalSED || w.erythemalSED || defaultErythemalSED,
    retinalUVdose: deps.retinalUVdose || w.retinalUVdose || defaultRetinalUVdose,
    heuristicPeakShares: deps.heuristicPeakShares || w.heuristicPeakShares || defaultHeuristicPeakShares,
  };
}

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
  const rawDistFactor = (baseRangeCm / Math.max(measuredDistance, 5)) ** 2;
  return Math.min(rawDistFactor, 3.0);
}

/**
 * @param {DeviceSessionDoseInput} [input]
 * @param {any} [deps]
 */
export function computeDeviceSessionDoses({
  device,
  durationMin,
  distanceCm = 15,
  bodyArea = 'torso',
  bodyAreas = null,
  eyesProtected = true,
  mode = null,
} = {}, deps = {}) {
  const resolvedMode = resolveDeviceMode(device, mode, deps);
  const bodyExposureFraction = bodyFractionForDeviceSession({ bodyAreas, bodyArea });
  const distanceFactor = deviceDistanceFactor(device, distanceCm);
  const durationSec = durationMin * 60;
  const eyeMode = eyesProtected ? 'closed-eyes' : 'direct';
  const { effectiveDeviceForMode, synthesizeDeviceSpectrum, computeChannelDoses, erythemalSED, retinalUVdose, heuristicPeakShares } = _runtimeDeps(deps);
  const hasPeaks = Array.isArray(device?.peakWavelengths) && device.peakWavelengths.length > 0;
  const hasIrradiance = (device?.mwPerCm2At15cm || 0) > 0;
  let doses = {};
  let physicalDoses = null;
  let safety = null;

  if (synthesizeDeviceSpectrum && computeChannelDoses && hasPeaks && hasIrradiance) {
    const effectiveDevice = effectiveDeviceForMode
      ? effectiveDeviceForMode(device, resolvedMode)
      : device;
    const baseSpec = synthesizeDeviceSpectrum(effectiveDevice);
    const spectrum = {
      wavelengths: baseSpec.wavelengths,
      irradiance: (baseSpec.irradiance || []).map(v => v * distanceFactor),
    };
    doses = computeChannelDoses({
      spectrum,
      durationMin,
      bodyExposureFraction,
      eyeExposure: { mode: eyeMode, durationSec },
    });
    const totalFluence = (Number(effectiveDevice?.mwPerCm2At15cm) || 0) * distanceFactor * durationSec / 1000;
    const peaks = effectiveDevice.peakWavelengths || [];
    const hasDeclaredShares = Array.isArray(effectiveDevice.peakShares) && effectiveDevice.peakShares.length === peaks.length;
    const rawShares = hasDeclaredShares
      ? effectiveDevice.peakShares
      : (heuristicPeakShares ? heuristicPeakShares(peaks, effectiveDevice.type) : peaks.map(() => 1 / Math.max(1, peaks.length)));
    const positiveShares = rawShares.map(value => Math.max(0, Number(value) || 0));
    const shareTotal = positiveShares.reduce((sum, value) => sum + value, 0);
    const shares = shareTotal > 0
      ? positiveShares.map(value => value / shareTotal)
      : peaks.map(() => 1 / Math.max(1, peaks.length));
    const shareIn = (min, max) => peaks.reduce((sum, nm, i) => sum + (nm >= min && nm < max ? (shares[i] || 0) : 0), 0);
    physicalDoses = {
      totalJPerCm2: totalFluence,
      uvbJPerCm2: totalFluence * shareIn(280, 320),
      uvaJPerCm2: totalFluence * shareIn(320, 400),
      redJPerCm2: totalFluence * shareIn(600, 700),
      nirJPerCm2: totalFluence * shareIn(700, 1100),
      source: hasDeclaredShares ? 'declared-spectrum' : 'heuristic-spectrum',
    };
    if (erythemalSED) {
      const sed = erythemalSED({ spectrum, durationMin, incidenceMultiplier: 1 });
      const retinalUV = retinalUVdose
        ? retinalUVdose({ spectrum, eyeExposure: { mode: eyeMode, durationSec }, zenithDeg: null })
        : 0;
      safety = {
        sed,
        ocularEffectiveDose: retinalUV,
        retinalUV, // compatibility mirror for pre-v2 session consumers
        estimated: true,
        source: physicalDoses.source,
      };
    }
  } else {
    // Lux-only fallback (SAD lamps without per-band irradiance / peaks).
    // Photopic lux is not melanopic irradiance. Prefer a declared melanopic
    // EDI; otherwise use a clearly approximate daylight-like mDER of 0.75.
    const lux = device?.lux || 0;
    const melanopicEdiLux = Number.isFinite(device?.melanopicEdiLux)
      ? device.melanopicEdiLux
      : lux * 0.75;
    if (!eyesProtected && melanopicEdiLux > 0) {
      doses.circadian = melanopicEdiLux * distanceFactor * 0.0013262 * durationSec;
    }
  }

  return {
    doses,
    physicalDoses,
    safety,
    mode: resolvedMode,
    bodyExposureFraction,
    distanceFactor,
    eyeMode,
    durationSec,
  };
}
