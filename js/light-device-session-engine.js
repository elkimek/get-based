// light-device-session-engine.js — shared dose math for light-device sessions.
//
// UI modules own dialogs and persistence. This module owns the repeated
// session calculations: mode resolution, body-area fraction, distance scaling,
// spectrum synthesis, and SAD-lux fallback.

import { BODY_REGIONS } from './sun-body-silhouette.js';

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
    validateModeCoupling: deps.validateModeCoupling || w.validateModeCoupling,
    effectiveDeviceForMode: deps.effectiveDeviceForMode || w.effectiveDeviceForMode,
    synthesizeDeviceSpectrum: deps.synthesizeDeviceSpectrum || w.synthesizeDeviceSpectrum,
    computeChannelDoses: deps.computeChannelDoses || w.computeChannelDoses,
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
  const { effectiveDeviceForMode, synthesizeDeviceSpectrum, computeChannelDoses } = _runtimeDeps(deps);
  const hasPeaks = Array.isArray(device?.peakWavelengths) && device.peakWavelengths.length > 0;
  const hasIrradiance = (device?.mwPerCm2At15cm || 0) > 0;
  let doses = {};

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
  } else {
    // Lux-only fallback (SAD lamps without per-band irradiance / peaks).
    const lux = device?.lux || 0;
    if (!eyesProtected && lux > 0) doses.circadian = lux * distanceFactor * durationSec / 100;
  }

  return {
    doses,
    mode: resolvedMode,
    bodyExposureFraction,
    distanceFactor,
    eyeMode,
    durationSec,
  };
}
