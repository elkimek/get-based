// Normalize reported facts through the native input owner; never manufacture model inputs.
import type { SunSessionRecord } from './sun-sessions-store.js';
import type { SunSessionInputPatch } from './sun-session-mutations.js';
import { EXPOSURE_PRESETS } from './sun-session-model.js';
import { BODY_REGIONS } from './sun-body-regions.js';
import { sunSessionTime } from './sun-session-proposals.js';
export function normalizeSunSessionPatch(patch: Record<string, unknown>, row: SunSessionRecord | null, savedLocation: SunSessionRecord['location']): SunSessionInputPatch {
  const result: SunSessionInputPatch = {};
  for (const key of ['startedAt', 'endedAt'] as const) if (key in patch) result[key] = sunSessionTime(patch[key]);
  if ('durationMin' in patch) result.durationMin = patch.durationMin as number;
  if ('notes' in patch) result.notes = patch.notes as string;
  for (const key of ['posture', 'surfaceAlbedo'] as const) if (key in patch) result[key] = patch[key] as string | null;
  if (['regions', 'exposurePreset', 'sunscreenSPF', 'glassBetween', 'rotatedSides'].some(key => key in patch)) {
    const body = structuredClone(row?.bodyExposure || {});
    if ('regions' in patch) { body.regions = [...patch.regions as string[]]; body.fraction = body.regions.reduce((sum, key) => sum + BODY_REGIONS.find(region => region.key === key)!.fraction, 0); body.preset = body.regions.length ? 'detailed' : 'covered'; }
    if ('exposurePreset' in patch) {
      if (patch.exposurePreset === null) { delete body.preset; delete body.regions; body.fraction = null; }
      else { body.preset = patch.exposurePreset as string; body.regions = []; body.fraction = body.preset === 'covered' ? 0 : EXPOSURE_PRESETS.find(option => option.key === body.preset)!.fraction; }
    }
    if ('sunscreenSPF' in patch) body.sunscreenSPF = patch.sunscreenSPF as number | null;
    for (const key of ['glassBetween', 'rotatedSides'] as const) if (key in patch) { if (patch[key] === null) delete body[key]; else body[key] = patch[key] as boolean; }
    result.bodyExposure = body;
  }
  if (['eyeMode', 'lensTint', 'eyeDurationMin'].some(key => key in patch)) {
    const eye = structuredClone(row?.eyeExposure || {});
    for (const [key, target] of [['eyeMode', 'mode'], ['lensTint', 'lensTint']] as const) if (key in patch) { if (patch[key] === null) delete eye[target]; else eye[target] = patch[key] as string; }
    if ('eyeDurationMin' in patch) eye.durationSec = patch.eyeDurationMin === null ? null : Number(patch.eyeDurationMin) * 60;
    result.eyeExposure = eye;
  }
  if ('useSavedLocation' in patch) {
    if (patch.useSavedLocation && !savedLocation) throw new Error('No saved app location is available. Choose one through location settings or report coordinates.');
    result.location = patch.useSavedLocation ? structuredClone(savedLocation ?? null) : null;
  }
  if ('latitude' in patch) result.location = { lat: Number(patch.latitude), lon: Number(patch.longitude), ...('altitudeM' in patch ? { altitudeM: Number(patch.altitudeM) } : {}) };
  return result;
}
