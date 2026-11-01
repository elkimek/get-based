// Pure Sun source edits and private, nonrecursive evidence retention.
import type { ProfileData } from '../types/app-state.js';
import type { SunSessionRecord } from './sun-sessions-store.js';
import { profileDataValuesEqual } from './profile-data-writes.js';
import { sunSessionInputKey, EYE_MODES, LENS_TINTS, POSTURE_OPTIONS, SURFACE_OPTIONS } from './sun-session-model.js';
export type SunSessionInputPatch = Partial<Pick<SunSessionRecord, 'startedAt' | 'endedAt' | 'durationMin' | 'notes' | 'bodyExposure' | 'eyeExposure' | 'posture' | 'surfaceAlbedo' | 'location'>>;
export function resetSunSessionCalculation(row: SunSessionRecord) { row.doses = null; row.safety = null; row.atmosphere = null; delete row.engineVersion; }
export function sunSessionMissingInputs(row: Pick<SunSessionRecord, 'reportedInputsVersion' | 'bodyExposure' | 'eyeExposure' | 'posture' | 'surfaceAlbedo' | 'endedAt' | 'durationMin'>): string[] {
  if (row.reportedInputsVersion !== 1) return [];
  const missing: string[] = [], body = row.bodyExposure, eye = row.eyeExposure;
  if (body?.fraction == null || !Number.isFinite(body.fraction) || body.fraction < 0 || body.fraction > 1) missing.push('exposed skin');
  if (body?.sunscreenSPF == null || !Number.isFinite(body.sunscreenSPF) || body.sunscreenSPF < 0 || body.sunscreenSPF > 100) missing.push('sunscreen use');
  if (typeof body?.glassBetween !== 'boolean') missing.push('glass between body and sunlight');
  if (!POSTURE_OPTIONS.some(option => option.key === row.posture)) missing.push('posture'); if (!SURFACE_OPTIONS.some(option => option.key === row.surfaceAlbedo)) missing.push('ground surface');
  if (!EYE_MODES.some(option => option.key === eye?.mode)) missing.push('eye exposure');
  if (row.endedAt != null && (eye?.durationSec == null || !Number.isFinite(eye.durationSec) || eye.durationSec < 0 || eye.durationSec > Number(row.durationMin) * 60)) missing.push('eye-exposure duration');
  if (['sunglasses', 'clear-glasses'].includes(eye?.mode || '') && !LENS_TINTS.some(option => option.key === eye?.lensTint)) missing.push('lens tint');
  return missing;
}
export function sunSessionHasPendingIntervals(row: { exposureSegments?: unknown[] }) {
  return !!row.exposureSegments?.some(segment => segment && typeof segment === 'object' && 'calculationStatus' in segment
    && ['pending', 'needs-inputs'].includes(String(segment.calculationStatus)));
}
export function protectSunSessionCalculationAdoption(live: ProfileData, source: ProfileData, committed: ProfileData) {
  for (const row of live.sunSessions || []) {
    const saved = committed.sunSessions?.find(candidate => candidate.id === row.id), before = source.sunSessions?.find(candidate => candidate.id === row.id);
    if (!saved || saved.calculationStatus !== 'computed' || before && ['doses', 'safety', 'atmosphere', 'engineVersion', 'calculationStatus', 'calculationHistory'].every(key => profileDataValuesEqual(saved[key], before[key]))) continue;
    if (sunSessionInputKey(row, live) !== sunSessionInputKey(saved, committed)) { resetSunSessionCalculation(row); row.calculationStatus = row.location ? 'pending' : 'needs-location'; }
  }
}
export function retainSunSessionEvidence(row: SunSessionRecord, at: number, data: ProfileData, kind: 'edit' | 'calculation' = 'edit') {
  const { editHistory, calculationHistory, ...record } = row, field = kind === 'edit' ? 'editHistory' : 'calculationHistory';
  const history: unknown = kind === 'edit' ? editHistory : calculationHistory;
  if (history != null && !Array.isArray(history)) throw new Error('Review older Sun source history in its editor.');
  row[field] = [...structuredClone(history || []) as unknown[], { recordedAt: at, record: structuredClone(record), defaults: structuredClone(data.sunDefaults || {}), skinType: data.lightCircadian?.skinType ?? null }];
}
export function editSunSessionInputs(row: SunSessionRecord, patch: SunSessionInputPatch, at: number, data: ProfileData) {
  const allowed = ['startedAt', 'endedAt', 'durationMin', 'notes', 'bodyExposure', 'eyeExposure', 'posture', 'surfaceAlbedo', 'location'];
  const updates = Object.fromEntries(Object.entries(patch).filter(([key]) => allowed.includes(key))), before = structuredClone(row);
  if ('notes' in updates && (typeof updates.notes !== 'string' || updates.notes.length > 4000)) throw new Error('Supply session notes up to 4000 characters.');
  const physical = Object.keys(updates).some(key => key !== 'notes'), timing = ['startedAt', 'endedAt', 'durationMin'].some(key => key in updates);
  if (physical && !row.endedAt) throw new Error('Use the active Sun session controls before editing recorded inputs.');
  const oldDuration = row.durationMin;
  if (Object.entries(updates).every(([key, value]) => profileDataValuesEqual(row[key], value))) return { changed: false, recalculate: false };
  retainSunSessionEvidence(row, at, data); Object.assign(row, structuredClone(updates));
  if (timing) {
    if ('endedAt' in updates) {
      const duration = (row.endedAt! - row.startedAt) / 60000;
      if ('durationMin' in updates && Math.abs(duration - row.durationMin!) > 1e-8) throw new Error('Reported start, end and duration disagree.');
      row.durationMin = duration;
    } else row.endedAt = row.startedAt + Number(row.durationMin) * 60000;
    if (!Number.isFinite(row.startedAt) || !Number.isFinite(row.endedAt) || !Number.isFinite(row.durationMin) || row.startedAt < 0 || row.durationMin! <= 0 || row.durationMin! > 1440) throw new Error('Supply consistent Sun session times and a duration from 0 to 1440 minutes.');
    if (!('eyeExposure' in updates) && row.eyeExposure?.durationSec != null && oldDuration != null && row.eyeExposure.durationSec === Math.round(oldDuration * 60)) row.eyeExposure.durationSec = Math.round(row.durationMin! * 60);
    row.accumulatedPausedMs = 0; delete row.resumedAt;
  }
  if (row.eyeExposure?.durationSec != null && (!Number.isFinite(row.eyeExposure.durationSec) || row.eyeExposure.durationSec < 0 || row.eyeExposure.durationSec > row.durationMin! * 60)) throw new Error('Reported eye exposure exceeds the corrected session duration. Correct both facts together.');
  if (physical) { row.exposureSegments = []; resetSunSessionCalculation(row); row.calculationStatus = row.location ? 'pending' : 'needs-location'; }
  delete row.aiAnalysis; row.updatedAt = at;
  return { changed: !profileDataValuesEqual(before, row), recalculate: physical };
}
