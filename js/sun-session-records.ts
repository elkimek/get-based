// Exact bounded reads and reviewed session commits. Weather hydration follows durable acceptance.
import type { ProfileData } from '../types/app-state.js';
import type { AgentDataProposal } from '../shared/agent-data-contract.js';
import { parseAgentDataPatch } from '../shared/agent-data-contract.js';
import type { SunSessionRecord } from './sun-sessions-store.js';
import { state } from './state.js';
import { readAgentProfileRecords } from './agent-profile-record-store.js';
import { profileDataValuesEqual } from './profile-data-writes.js';
import { appendImportedArrayItem, deleteImportedArrayItem } from './data-merge.js';
import { getSunCoords } from './sun-location.js';
import { queueSunSessionWrite, sameSunSessionSource, SUN_SESSION_FIELDS, SUN_SESSION_PAYLOAD_FIELDS } from './sun-session-record-store.js';
import { commitSunDataWrite } from './sun-setup-store.js';
import { editSunSessionInputs, sunSessionMissingInputs, resetSunSessionCalculation, retainSunSessionEvidence } from './sun-session-mutations.js';
import { normalizeSunSessionPatch } from './sun-session-commands.js';
import { parseSunSessionSnapshot, validateSunSessionPatch, SUN_EYE_MODES, SUN_LENS_TINTS } from './sun-session-proposals.js';
import type { SunSessionSnapshot, SunSessionPlan } from './sun-session-proposals.js';
import { EXPOSURE_PRESETS, POSTURE_OPTIONS, SURFACE_OPTIONS } from './sun-session-model.js';
import { BODY_REGIONS } from './sun-body-regions.js';
import { canApplySunLiveAction, isSunLiveAction, transitionSunLiveSession, sunLiveStartChecks, assertReportedSunStart, createSunLiveSession } from './sun-session-lifecycle.js';
import type { SunLiveAction, SunLivePatch } from './sun-session-lifecycle.js';
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const conflict = (): never => { throw Object.assign(new Error('The Sun session, location or source changed since review. Read it again. No change was applied.'), { noChangeApplied: true }); };
function rows(data: ProfileData): SunSessionRecord[] {
  const result: unknown = data.sunSessions ?? [];
  if (!Array.isArray(result) || result.some(row => !object(row) || typeof row.id !== 'string' || !row.id) || new Set(result.map(row => row.id)).size !== result.length) throw new Error('Review older Sun session identities in the ordinary editor.'); return result;
}
function count(row: SunSessionRecord, key: string) { if (row[key] != null && !Array.isArray(row[key])) throw new Error('Review older Sun source history in its editor.'); return Array.isArray(row[key]) ? row[key].length : 0; }
function publicRecord(row: SunSessionRecord | undefined): Record<string, unknown> | null {
  if (!row) return null;
  if (!Number.isFinite(row.startedAt) || row.endedAt != null && !Number.isFinite(row.endedAt) || row.durationMin != null && (!Number.isFinite(row.durationMin) || row.durationMin < 0) || row.notes != null && (typeof row.notes !== 'string' || row.notes.length > 4000)) throw new Error('Review older Sun times/notes in the ordinary editor.');
  const body = row.bodyExposure, eye = row.eyeExposure;
  return { id: row.id, startedAt: new Date(row.startedAt).toISOString(), endedAt: row.endedAt == null ? null : new Date(row.endedAt).toISOString(), durationMin: row.durationMin ?? null, active: !row.endedAt, paused: !!row.paused, notes: row.notes || '',
    exposurePreset: [...EXPOSURE_PRESETS.map(option => option.key), 'covered', 'detailed'].includes(body?.preset || '') ? body!.preset : null,
    skinFraction: typeof body?.fraction === 'number' && Number.isFinite(body.fraction) ? body.fraction : null,
    regions: Array.isArray(body?.regions) ? body.regions.filter(key => BODY_REGIONS.some(region => region.key === key)) : [],
    sunscreenSPF: typeof body?.sunscreenSPF === 'number' && Number.isFinite(body.sunscreenSPF) ? body.sunscreenSPF : null,
    glassBetween: typeof body?.glassBetween === 'boolean' ? body.glassBetween : null, rotatedSides: typeof body?.rotatedSides === 'boolean' ? body.rotatedSides : null,
    eyeMode: SUN_EYE_MODES.includes(eye?.mode as typeof SUN_EYE_MODES[number]) ? eye!.mode : null,
    lensTint: SUN_LENS_TINTS.includes(eye?.lensTint as typeof SUN_LENS_TINTS[number]) ? eye!.lensTint : null,
    eyeDurationMin: typeof eye?.durationSec === 'number' && Number.isFinite(eye.durationSec) ? eye.durationSec / 60 : null,
    posture: POSTURE_OPTIONS.some(option => option.key === row.posture) ? row.posture : null, surfaceAlbedo: SURFACE_OPTIONS.some(option => option.key === row.surfaceAlbedo) ? row.surfaceAlbedo : null,
    locationRecorded: !!row.location, calculationStatus: ['computed', 'pending', 'needs-inputs', 'needs-location', 'atmosphere-unavailable', 'calculation-error'].includes(row.calculationStatus || '') ? row.calculationStatus : null,
    previousEditCount: count(row, 'editHistory'), previousCalculationCount: count(row, 'calculationHistory') };
}
function savedLocation(): SunSessionRecord['location'] {
  const coords = getSunCoords(); if (!coords || !Number.isFinite(coords.lat) || !Number.isFinite(coords.lon)) return null;
  return { lat: coords.lat, lon: coords.lon, ...('altitudeM' in coords && typeof coords.altitudeM === 'number' && Number.isFinite(coords.altitudeM) ? { altitudeM: coords.altitudeM } : {}) };
}
const canonical = (value: unknown): unknown => Array.isArray(value) ? value.map(canonical) : object(value) ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
async function snapshot(data: ProfileData, id: string): Promise<SunSessionSnapshot> {
  const location = savedLocation(), start = sunLiveStartChecks(data, !!location && getSunCoords()?.source !== 'country-band');
  const bytes = new TextEncoder().encode(JSON.stringify(canonical([SUN_SESSION_FIELDS.map(key => data[key] ?? null), location, start]))), hash = await crypto.subtle.digest('SHA-256', bytes);
  return { version: 2, id, record: publicRecord(rows(data).find(row => row.id === id)), savedLocationAvailable: !!location, start, revision: [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2, '0')).join('') };
}
function compute(data: ProfileData, proposal: AgentDataProposal): { next: ProfileData; plan: SunSessionPlan } {
  const patch = parseAgentDataPatch(proposal.patch); validateSunSessionPatch(proposal.operation, patch);
  const source = rows(data).find(row => row.id === proposal.recordId), next = structuredClone(data), operation = proposal.operation;
  if (operation === 'start') {
    if (source || data._deleted?.sunSessions?.includes(proposal.recordId)) conflict();
    const input = normalizeSunSessionPatch(patch, null, savedLocation());
    assertReportedSunStart(data, input, 'latitude' in patch || getSunCoords()?.source !== 'country-band');
    const row = createSunLiveSession(proposal.recordId, proposal.recordedAt, input, true), after = publicRecord(row)!; after.startedAt = 'When Apply is processed';
    appendImportedArrayItem(next, 'sunSessions', row);
    return { next, plan: { after, effects: { recalculates: false, estimateState: row.calculationStatus!, retainedHistory: false, removedHistoryCount: 0, removedSession: false,
      locationChange: 'latitude' in patch ? 'reported' : 'saved', liveAction: 'start' } } };
  }
  if (isSunLiveAction(operation)) {
    if (!source || !canApplySunLiveAction(source, operation)) throw new Error('This live action is unavailable. Read the active Sun timer again.');
    const row = rows(next).find(row => row.id === proposal.recordId)!;
    retainSunSessionEvidence(row, proposal.recordedAt, data); transitionSunLiveSession(row, operation, patch, proposal.recordedAt);
    const after = publicRecord(row)!; after.durationMin = null;
    if (operation === 'stop') { after.endedAt = 'When Apply is processed'; after.eyeDurationMin = source.eyeExposure?.durationSec == null ? null : after.eyeDurationMin; }
    return { next, plan: { after, effects: { recalculates: operation === 'stop', estimateState: row.calculationStatus || 'unavailable', retainedHistory: true, removedHistoryCount: 0, removedSession: false, locationChange: 'unchanged', liveAction: operation } } };
  }
  if (operation === 'add' ? !!source : !source) conflict();
  let recalculate = false;
  if (operation === 'remove') deleteImportedArrayItem(next, 'sunSessions', rows(next).findIndex(row => row.id === proposal.recordId));
  else {
    const normalized = normalizeSunSessionPatch(patch, source || null, savedLocation());
    if (operation === 'add') {
      if (data._deleted?.sunSessions?.includes(proposal.recordId)) conflict();
      const startedAt = normalized.startedAt!, endedAt = normalized.endedAt ?? startedAt + Number(normalized.durationMin) * 60000, durationMin = normalized.durationMin ?? (endedAt - startedAt) / 60000;
      if (durationMin <= 0 || durationMin > 1440 || Math.abs(endedAt - startedAt - durationMin * 60000) > 0.01) throw new Error('The reported session times disagree.');
      const row: SunSessionRecord = { ...normalized, id: proposal.recordId, startedAt, endedAt, durationMin, reportedInputsVersion: 1, notes: normalized.notes || '', atmosphere: null, doses: null, safety: null, exposureSegments: [], accumulatedPausedMs: 0, updatedAt: proposal.recordedAt };
      if (row.eyeExposure?.durationSec != null && row.eyeExposure.durationSec > durationMin * 60) throw new Error('Eye exposure exceeds the reported duration.');
      row.calculationStatus = sunSessionMissingInputs(row).length ? 'needs-inputs' : row.location ? 'pending' : 'needs-location';
      appendImportedArrayItem(next, 'sunSessions', row); recalculate = row.calculationStatus === 'pending';
    } else {
      const row = rows(next).find(row => row.id === proposal.recordId)!;
      const result = editSunSessionInputs(row, normalized, proposal.recordedAt, data); if (!result.changed) throw new Error('These session values are already recorded.');
      recalculate = result.recalculate;
      if (sunSessionMissingInputs(row).length) { resetSunSessionCalculation(row); row.calculationStatus = 'needs-inputs'; recalculate = false; }
      if (recalculate && !row.location) recalculate = false;
    }
    const row = rows(next).find(row => row.id === proposal.recordId)!;
    if (row.startedAt > proposal.recordedAt || row.endedAt != null && row.endedAt > proposal.recordedAt) throw new Error('A recorded Sun session cannot be in the future.');
  }
  const row = rows(next).find(row => row.id === proposal.recordId);
  return { next, plan: { after: publicRecord(row), effects: { recalculates: recalculate, estimateState: row ? row.calculationStatus || 'unavailable' : 'removed', retainedHistory: operation === 'update', removedHistoryCount: operation === 'remove' && source ? count(source, 'editHistory') + count(source, 'calculationHistory') : 0,
    removedSession: operation === 'remove', locationChange: 'latitude' in patch ? 'reported' : 'useSavedLocation' in patch ? patch.useSavedLocation ? 'saved' : 'clear' : 'unchanged' } } };
}
export async function listCurrentSunSessions(profile: string) { return rows(await readAgentProfileRecords(profile)).map(publicRecord); }
export async function readCurrentSunSession(profile: string, id: string, create = false) { const result = await snapshot(await readAgentProfileRecords(profile), id); return result.record || create ? result : null; }
export async function prepareReviewedSunSession(profile: string, proposal: AgentDataProposal) {
  const expected = parseSunSessionSnapshot(proposal), data = await readAgentProfileRecords(profile); if (!profileDataValuesEqual(expected, await snapshot(data, expected.id))) conflict();
  proposal.baseline = JSON.stringify({ ...expected, plan: compute(data, proposal).plan });
}
export async function commitReviewedSunSession(profile: string, proposal: AgentDataProposal, authorized: () => boolean) {
  if (proposal.operation === 'start') return commitReviewedSunStart(profile, proposal, authorized);
  if (isSunLiveAction(proposal.operation)) return commitReviewedSunLiveAction(profile, proposal, proposal.operation, authorized);
  const applied = await queueSunSessionWrite(profile, async () => {
    if (!authorized()) conflict(); const expected = parseSunSessionSnapshot(proposal), { plan: _plan, ...read } = expected, data = await readAgentProfileRecords(profile);
    if (!profileDataValuesEqual(read, await snapshot(data, expected.id))) conflict(); const { next, plan } = compute(data, proposal); if (!profileDataValuesEqual(plan, expected.plan)) conflict();
    const origin = state.importedData, current = () => authorized() && state.importedData === origin;
    if (!current() || !sameSunSessionSource(origin, data)) conflict();
    const saved = await commitSunDataWrite(profile, origin, data, structuredClone(origin), next, SUN_SESSION_FIELDS, SUN_SESSION_PAYLOAD_FIELDS, current);
    if (!saved.saved) { if (!current() || saved.conflict) conflict(); throw new Error('Sun session could not be saved. Try Apply again.'); }
    return { origin, plan };
  });
  // The canonical write already succeeded; weather or optional interpretation cannot undo it.
  if (authorized() && state.importedData === applied.origin) try {
    const store = await import('./sun-sessions-store.js');
    if (proposal.operation === 'remove') store.clearSunSessionRuntime(proposal.recordId);
    else if (applied.plan.effects.recalculates) await store.hydrateSession(proposal.recordId, {}, { canAnalyze: authorized });
  } catch { /* Retained inputs remain saved; ordinary retry uses the native calculation owner. */ }
  return proposal.operation === 'remove' ? 'Sun session removed.' : 'Sun session saved.';
}
async function commitReviewedSunStart(profile: string, proposal: AgentDataProposal, authorized: () => boolean) {
  const expected = parseSunSessionSnapshot(proposal), { plan: _plan, ...read } = expected, data = await readAgentProfileRecords(profile);
  if (!authorized() || !profileDataValuesEqual(read, await snapshot(data, expected.id)) || !profileDataValuesEqual(compute(data, proposal).plan, expected.plan)) conflict();
  const origin = state.importedData, location = savedLocation(), savedSpecific = !!location && getSunCoords()?.source !== 'country-band';
  const current = () => authorized() && state.importedData === origin && profileDataValuesEqual(location, savedLocation()) && savedSpecific === (!!savedLocation() && getSunCoords()?.source !== 'country-band');
  const store = await import('./sun-sessions-store.js'); if (!store.hasSunLiveSliceProducer()) (await import('./sun-live-runtime-setup.js')).initializeSunLiveRuntime();
  const patch = parseAgentDataPatch(proposal.patch), input = normalizeSunSessionPatch(patch, null, location);
  await store.startReportedSunSession(proposal.recordId, input, 'latitude' in patch || savedSpecific, { expected: data, authorized: current });
  if (current()) (await import('./sun-active-session.js')).ensureActiveTicker();
  return 'Sun timer started and saved.';
}
async function commitReviewedSunLiveAction(profile: string, proposal: AgentDataProposal, action: SunLiveAction, authorized: () => boolean) {
  const expected = parseSunSessionSnapshot(proposal), { plan: _plan, ...read } = expected, data = await readAgentProfileRecords(profile);
  if (!authorized() || !profileDataValuesEqual(read, await snapshot(data, expected.id)) || !profileDataValuesEqual(compute(data, proposal).plan, expected.plan)) conflict();
  const origin = state.importedData, location = savedLocation();
  const current = () => authorized() && state.importedData === origin && profileDataValuesEqual(location, savedLocation());
  const store = await import('./sun-sessions-store.js');
  if (!store.hasSunLiveSliceProducer()) (await import('./sun-live-runtime-setup.js')).initializeSunLiveRuntime();
  const active = await import('./sun-active-session.js');
  await active.prepareSunLiveAction(proposal.recordId);
  if (!current()) conflict();
  let accepted = false;
  const guard = { expected: data, authorized: current, onSaved: () => { accepted = true; } }, patch = parseAgentDataPatch(proposal.patch) as SunLivePatch;
  const result = action === 'pause' ? await store.pauseSession(proposal.recordId, guard) : action === 'resume' ? await store.resumeSession(proposal.recordId, guard)
    : action === 'stop' ? await store.stopSession(proposal.recordId, guard) : action === 'setCoverage' ? await store.setSessionCoverage(proposal.recordId, patch.regions, guard)
    : action === 'setSunscreen' ? await store.setSessionSunscreen(proposal.recordId, patch.sunscreenSPF, guard) : await store.markSessionRotated(proposal.recordId, guard);
  if (!result && !accepted) conflict();
  if (current()) {
    active.ensureActiveTicker();
    if (action === 'stop') try { await store.hydrateSession(proposal.recordId, {}, { canAnalyze: current }); } catch { /* The timer action is already durable. */ }
  }
  return action === 'stop' ? 'Sun timer stopped and saved.' : action === 'pause' ? 'Sun timer paused.' : action === 'resume' ? 'Sun timer resumed.' : 'Live Sun exposure change saved.';
}
