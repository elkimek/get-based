// Pure bounded session commands and readable effects. Precise saved GPS stays local.
import type { AgentDataProposal } from '../shared/agent-data-contract.js';
import { agentDataObject, parseAgentDataPatch, validAgentDate, validateFieldNames } from '../shared/agent-data-contract.js';
import { EXPOSURE_PRESETS, POSTURE_OPTIONS, SURFACE_OPTIONS, EYE_MODES, LENS_TINTS } from './sun-session-model.js';
import { BODY_REGIONS } from './sun-body-regions.js';
import { isSunLiveAction } from './sun-session-lifecycle.js';
export const SUN_EYE_MODES = EYE_MODES.map(option => option.key);
export const SUN_LENS_TINTS = LENS_TINTS.map(option => option.key);
export const sunSessionChoices = {
  exposurePresets: EXPOSURE_PRESETS, regions: BODY_REGIONS.map(({ key, label }) => ({ key, label })),
  eyeModes: EYE_MODES.map(({ key, label }) => ({ key, label })), lensTints: LENS_TINTS, postures: POSTURE_OPTIONS, surfaces: SURFACE_OPTIONS,
};
export const sunSessionFields = {
  startedAt: 'Actual ISO timestamp with explicit UTC offset; a date alone is insufficient', endedAt: 'Optional actual end timestamp with UTC offset', durationMin: 'Reported duration, greater than zero and at most 1440 minutes',
  notes: 'Text, max 4000 characters', exposurePreset: [...EXPOSURE_PRESETS.map(option => option.key), 'covered', null], regions: [...BODY_REGIONS.map(region => region.key)],
  sunscreenSPF: 'Reported 0 for none, 1–100, or null if unknown', glassBetween: 'Reported boolean, or null to clear', rotatedSides: 'Reported boolean, or null to clear',
  eyeMode: [...SUN_EYE_MODES, null], lensTint: [...SUN_LENS_TINTS, null], eyeDurationMin: 'Reported duration of eye exposure, 0–session duration, or null if unknown',
  posture: [...POSTURE_OPTIONS.map(option => option.key), null], surfaceAlbedo: [...SURFACE_OPTIONS.map(option => option.key), null],
  useSavedLocation: 'true selects the current app location; false clears the session location', latitude: 'Explicitly reported latitude -90..90, with longitude', longitude: 'Explicitly reported longitude -180..180, with latitude', altitudeM: 'Reported altitude in meters, -500..10000',
};
export interface SunSessionEffects { recalculates: boolean; estimateState: string; retainedHistory: boolean; removedHistoryCount: number; removedSession: boolean; locationChange: string; liveAction?: string; }
export interface SunSessionPlan { after: Record<string, unknown> | null; effects: SunSessionEffects; }
export interface SunSessionSnapshot { version: 1 | 2; id: string; record: Record<string, unknown> | null; revision: string; savedLocationAvailable: boolean; start?: { skinTypeConfigured: boolean; savedLocationSpecific: boolean; activeSessionId: string | null }; plan?: SunSessionPlan; }
export function sunSessionTime(value: unknown): number {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) || !validAgentDate(value.slice(0, 10)) || !Number.isFinite(Date.parse(value))) throw new Error('Report an actual valid timestamp with a UTC offset.');
  return Date.parse(value);
}
export function validateSunSessionPatch(operation: string, patch: Record<string, unknown>) {
  if (isSunLiveAction(operation)) {
    const field = operation === 'setCoverage' ? 'regions' : operation === 'setSunscreen' ? 'sunscreenSPF' : null;
    validateFieldNames(patch, field ? [field] : []);
    if (field && !(field in patch)) throw new Error(`Report ${field} for this live action.`);
    if (field === 'regions' && (!Array.isArray(patch.regions) || patch.regions.some(key => !BODY_REGIONS.some(region => region.key === key)) || new Set(patch.regions).size !== patch.regions.length)) throw new Error('Choose exact body-region keys without duplicates.');
    if (field === 'sunscreenSPF' && (typeof patch.sunscreenSPF !== 'number' || !Number.isFinite(patch.sunscreenSPF) || patch.sunscreenSPF < 0 || patch.sunscreenSPF > 100)) throw new Error('Report SPF 0 for none, or a value from 1 to 100.');
    return;
  }
  if (!['add', 'update', 'remove', 'start'].includes(operation)) throw new Error('Use declared live-session controls for timer actions.');
  if (operation === 'start') {
    validateFieldNames(patch, Object.keys(sunSessionFields).filter(key => !['startedAt', 'endedAt', 'durationMin', 'eyeDurationMin'].includes(key)));
    if (patch.useSavedLocation !== true && !('latitude' in patch)) throw new Error('Explicitly choose a specific saved location or report coordinates for the live timer.');
  }
  validateFieldNames(patch, operation === 'remove' ? [] : Object.keys(sunSessionFields)); if (operation === 'remove') return;
  if (!Object.keys(patch).length) throw new Error('Supply at least one reported session fact.');
  for (const field of ['startedAt', 'endedAt']) if (field in patch) sunSessionTime(patch[field]);
  if (operation === 'add' && (!('startedAt' in patch) || !('durationMin' in patch) && !('endedAt' in patch))) throw new Error('A completed Sun session needs its actual start and duration or end.');
  for (const [key, min, max] of [['durationMin', 0.000001, 1440], ['sunscreenSPF', 0, 100], ['eyeDurationMin', 0, 1440], ['latitude', -90, 90], ['longitude', -180, 180], ['altitudeM', -500, 10000]] as const) {
    const value = patch[key]; if (key in patch && !(value === null && ['sunscreenSPF', 'eyeDurationMin'].includes(key)) && (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max)) throw new Error(`Report ${key} in its supported range.`);
  }
  for (const field of ['glassBetween', 'rotatedSides']) if (field in patch && patch[field] !== null && typeof patch[field] !== 'boolean') throw new Error(`Report ${field} as a boolean or null.`);
  if ('useSavedLocation' in patch && typeof patch.useSavedLocation !== 'boolean') throw new Error('Choose whether to use the saved app location or clear it.');
  if (('latitude' in patch) !== ('longitude' in patch) || 'altitudeM' in patch && !('latitude' in patch) || 'useSavedLocation' in patch && 'latitude' in patch) throw new Error('Choose one location source; reported coordinates need both latitude and longitude.');
  if ('regions' in patch && 'exposurePreset' in patch) throw new Error('Choose reported regions or one exposure preset.');
  if ('regions' in patch && (!Array.isArray(patch.regions) || patch.regions.some(key => !BODY_REGIONS.some(region => region.key === key)) || new Set(patch.regions).size !== patch.regions.length)) throw new Error('Choose exact body-region keys without duplicates.');
  for (const key of ['exposurePreset', 'eyeMode', 'lensTint', 'posture', 'surfaceAlbedo'] as const) if (key in patch && !(sunSessionFields[key] as readonly unknown[]).includes(patch[key])) throw new Error(`Choose a supported ${key}, or null for unknown.`);
  if ('notes' in patch && (typeof patch.notes !== 'string' || patch.notes.length > 4000)) throw new Error('Session notes must be text up to 4000 characters.');
}
export function parseSunSessionSnapshot(proposal: AgentDataProposal): SunSessionSnapshot {
  const snapshot = agentDataObject(JSON.parse(proposal.baseline));
  if (proposal.resource !== 'sunSessions' || snapshot.version !== 1 && snapshot.version !== 2 || snapshot.id !== proposal.recordId || typeof snapshot.revision !== 'string' || !/^[a-f0-9]{64}$/.test(snapshot.revision) || typeof snapshot.savedLocationAvailable !== 'boolean') throw new Error('Read the exact Sun session again for a current review.');
  if (snapshot.version === 2) {
    const start = agentDataObject(snapshot.start);
    if (typeof start.skinTypeConfigured !== 'boolean' || typeof start.savedLocationSpecific !== 'boolean' || !(start.activeSessionId === null || typeof start.activeSessionId === 'string')) throw new Error('Invalid Sun timer prerequisite review.');
  } else if (proposal.operation === 'start') throw new Error('Read a current create snapshot before starting a timer.');
  if (snapshot.record !== null) agentDataObject(snapshot.record); return snapshot as unknown as SunSessionSnapshot;
}
export function displaySunSessionRecord(value: unknown): Record<string, unknown> | null {
  const source = agentDataObject(value), record = 'revision' in source ? source.record : source; if (record === null) return null;
  const row = agentDataObject(record);
  const fields = ['id', 'startedAt', 'endedAt', 'durationMin', 'notes', 'exposurePreset', 'regions', 'skinFraction', 'sunscreenSPF', 'glassBetween', 'rotatedSides', 'eyeMode', 'lensTint', 'eyeDurationMin', 'posture', 'surfaceAlbedo', 'locationRecorded', 'calculationStatus', 'previousEditCount', 'previousCalculationCount', 'active', 'paused'];
  for (const key of fields) if (key in row) {
    const value = row[key];
    if (key === 'regions') { if (!Array.isArray(value) || value.length > 32 || value.some(key => typeof key !== 'string' || !BODY_REGIONS.some(region => region.key === key))) throw new Error('Invalid session region review.'); }
    else if (['active', 'paused', 'locationRecorded', 'glassBetween', 'rotatedSides'].includes(key)) { if (value !== null && typeof value !== 'boolean') throw new Error('Invalid session fact review.'); }
    else if (['durationMin', 'skinFraction', 'sunscreenSPF', 'eyeDurationMin', 'previousEditCount', 'previousCalculationCount'].includes(key)) { if (value !== null && (typeof value !== 'number' || !Number.isFinite(value))) throw new Error('Invalid session numeric review.'); }
    else if (value !== null && (typeof value !== 'string' || value.length > 4000)) throw new Error('Invalid session text review.');
  }
  return Object.fromEntries(fields.filter(key => Object.hasOwn(row, key)).map(key => [key, row[key]]));
}
export function projectSunSessionRecord(proposal: AgentDataProposal) {
  const snapshot = parseSunSessionSnapshot(proposal); validateSunSessionPatch(proposal.operation, parseAgentDataPatch(proposal.patch));
  if (!snapshot.plan) throw new Error('This Sun session review is incomplete. Read it again.');
  const effects = agentDataObject(snapshot.plan.effects); validateFieldNames(effects, ['recalculates', 'estimateState', 'retainedHistory', 'removedHistoryCount', 'removedSession', 'locationChange', 'liveAction']);
  if (isSunLiveAction(proposal.operation) || proposal.operation === 'start' ? effects.liveAction !== proposal.operation : 'liveAction' in effects) throw new Error('Invalid live Sun action review.');
  if (['recalculates', 'retainedHistory', 'removedSession'].some(key => typeof effects[key] !== 'boolean') || !Number.isSafeInteger(effects.removedHistoryCount) || Number(effects.removedHistoryCount) < 0
    || !['removed', 'unavailable', 'pending', 'needs-inputs', 'needs-location', 'computed', 'atmosphere-unavailable', 'calculation-error'].includes(String(effects.estimateState))
    || !['unchanged', 'saved', 'clear', 'reported'].includes(String(effects.locationChange))) throw new Error('Invalid Sun session effect review.');
  return { before: displaySunSessionRecord(snapshot), after: snapshot.plan.after === null ? null : displaySunSessionRecord(snapshot.plan.after), effects: snapshot.plan.effects };
}
export function describeSunSessionRecord(value: unknown): string {
  if (value === null) return 'Not recorded / removed'; const row = displaySunSessionRecord(value)!;
  const label = (options: readonly { key: string; label: string }[], value: unknown) => options.find(option => option.key === value)?.label || 'Not recorded';
  const regions = Array.isArray(row.regions) ? row.regions.map(key => BODY_REGIONS.find(region => region.key === key)?.label).filter(Boolean).join(', ') : '';
  const preset = row.exposurePreset === 'covered' ? 'No skin exposed' : EXPOSURE_PRESETS.find(option => option.key === row.exposurePreset)?.label;
  const skin = regions || preset || (typeof row.skinFraction === 'number' ? `${Math.round(row.skinFraction * 100)}% recorded area` : 'Not recorded');
  const area = (regions || preset) && typeof row.skinFraction === 'number' ? ` · ${Math.round(row.skinFraction * 100)}% model area` : '';
  const yesNo = (value: unknown) => value === true ? 'Yes' : value === false ? 'No' : 'Not recorded';
  return [`Timer: ${row.active ? row.paused ? 'Paused' : 'Running' : 'Completed'}`, `Start: ${row.startedAt || 'Unknown'}`, `End: ${row.endedAt || 'Active'}`, `Duration: ${row.durationMin ?? 'Not yet measured'} min`,
    `Exposed skin: ${skin}${area}`, `Eyes: ${label(EYE_MODES, row.eyeMode)} · ${row.eyeDurationMin ?? 'Unknown'} min`, `Lens tint: ${label(LENS_TINTS, row.lensTint)}`,
    `Sunscreen: ${row.sunscreenSPF == null ? 'Not recorded' : row.sunscreenSPF === 0 ? 'None reported' : `SPF ${row.sunscreenSPF}`}`,
    `Glass between body and sunlight: ${yesNo(row.glassBetween)}`, `Side change recorded: ${yesNo(row.rotatedSides)}`,
    `Posture: ${label(POSTURE_OPTIONS, row.posture)}`, `Ground: ${label(SURFACE_OPTIONS, row.surfaceAlbedo)}`, `Location: ${row.locationRecorded ? 'Recorded; exact coordinates remain local' : 'Not recorded'}`, `Estimates: ${row.calculationStatus || 'Unavailable'}`,
    ...(row.notes ? [`Notes: ${row.notes}`] : [])].join('\n');
}
