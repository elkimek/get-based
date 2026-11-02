// Safe exact reads, reviewed replacement/snapshot effects and canonical Apply.
import type { ProfileData } from '../types/app-state.js';
import type { AgentDataProposal } from '../shared/agent-data-contract.js';
import { parseAgentDataPatch } from '../shared/agent-data-contract.js';
import { state } from './state.js';
import { readAgentProfileRecords } from './agent-profile-record-store.js';
import { profileDataValuesEqual } from './profile-data-writes.js';
import { LIGHT_MEASUREMENT_FIELDS, isLightMeasurementResource } from './light-measurement-fields.js';
import type { LightMeasurementResource, LightMeasurementRecord, LightAuditRecord } from './light-measurement-fields.js';
import { measurementUnit, parseLightMeasurementSnapshot, validateLightMeasurementPatch } from './light-measurement-proposals.js';
import type { LightMeasurementSnapshot, LightMeasurementPlan } from './light-measurement-proposals.js';
import * as mutations from './light-measurement-mutations.js';
import { displayLightEnvironmentRecord } from './light-env-mutations.js';
import { queueLightEnvironmentWrite, commitLightEnvironmentWrite } from './light-env-record-store.js';
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const conflict = (): never => { throw Object.assign(new Error('This reading, room or saved checkpoint changed since review. Read it again. No change was applied.'), { noChangeApplied: true }); };
function rows(data: ProfileData, resource: LightMeasurementResource): Array<LightMeasurementRecord | LightAuditRecord> {
  const result = resource === 'lightMeasurements' ? mutations.measurementRecords(data) : mutations.auditRecords(data);
  if (result.some(row => !object(row) || typeof row.id !== 'string' || !row.id) || new Set(result.map(row => row.id)).size !== result.length) throw new Error('Review older or duplicate reading/checkpoint identities in the ordinary editor.');
  return result;
}
function historyCount(row: Record<string, unknown>, field: string) {
  if (row[field] != null && !Array.isArray(row[field])) throw new Error('Review this older source history in its editor.');
  return Array.isArray(row[field]) ? row[field].length : 0;
}
function readingPublic(row: LightMeasurementRecord): Record<string, unknown> {
  if (typeof row.tool !== 'string' || !Number.isFinite(row.capturedAt) || !['number', 'string'].includes(typeof row.value) || typeof row.value === 'number' && !Number.isFinite(row.value)) throw new Error('Review this older reading in its ordinary editor.');
  for (const field of ['roomId', 'label', 'notes']) if (row[field] != null && typeof row[field] !== 'string') throw new Error('Review this older reading field in its editor.');
  const extra = object(row.extra) ? row.extra : {}, known = ['AmbientLightSensor', 'manual-entry', 'meter-entry', 'camera-estimate'];
  const details = Object.fromEntries(Object.entries(extra).filter(([key, value]) => ['cameraLevel', 'cameraBlueRatioProxy', 'inside', 'outside', 'peakBanding', 'stripes', 'frameRatio', 'calibrationFactor'].includes(key) && typeof value === 'number' && Number.isFinite(value)));
  return { id: row.id, tool: ['lux', 'darkness', 'cct', 'flicker', 'spectrum', 'brightness-proxy', 'glass-transmission', 'audit'].includes(row.tool) ? row.tool : 'unknown', value: row.value, unit: measurementUnit(row), capturedAt: new Date(row.capturedAt).toISOString(), roomId: row.roomId ?? null,
    label: row.label ?? '', notes: row.notes ?? '', source: known.includes(String(extra.source)) ? extra.source : 'reported/unknown',
    context: ['daytime', 'evening', 'sleep'].includes(String(extra.context)) ? extra.context : null, confidence: typeof row.confidence === 'number' && Number.isFinite(row.confidence) ? row.confidence : null,
    details, previousReadingCount: historyCount(row, 'readingHistory') };
}
function auditPublic(row: LightAuditRecord): Record<string, unknown> {
  if (typeof row.date !== 'string' || typeof row.label !== 'string' || typeof row.notes !== 'string' || ![row.rooms, row.screens, row.measurements].every(Array.isArray)) throw new Error('Review this older checkpoint in its ordinary editor.');
  return { id: row.id, date: row.date, label: row.label, notes: row.notes,
    rooms: row.rooms.map(room => displayLightEnvironmentRecord('lightRooms', room)), screens: row.screens.map(screen => displayLightEnvironmentRecord('lightScreens', screen)),
    measurements: row.measurements.map(readingPublic), previousMetadataCount: historyCount(row, 'metadataHistory') };
}
function publicRecord(data: ProfileData, resource: LightMeasurementResource, id: string) {
  const row = rows(data, resource).find(row => row.id === id); return !row ? null : resource === 'lightMeasurements' ? readingPublic(row as LightMeasurementRecord) : auditPublic(row as LightAuditRecord);
}
const canonical = (value: unknown): unknown => Array.isArray(value) ? value.map(canonical) : object(value) ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
async function snapshot(data: ProfileData, resource: LightMeasurementResource, id: string): Promise<LightMeasurementSnapshot> {
  const bytes = new TextEncoder().encode(JSON.stringify(canonical(Object.fromEntries(LIGHT_MEASUREMENT_FIELDS.map(key => [key, data[key] ?? null]))))), hash = await crypto.subtle.digest('SHA-256', bytes);
  return { version: 1, resource, id, record: publicRecord(data, resource, id), revision: [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2, '0')).join('') };
}
function normalizeReading(patch: Record<string, unknown>, existing?: LightMeasurementRecord): Record<string, unknown> {
  const tool = String(existing?.tool || patch.tool), extra = { ...(existing?.extra || {}) }, method = patch.method || 'reported';
  if (patch.value !== undefined) {
    const unit = existing ? measurementUnit(existing) : tool === 'darkness' ? method === 'meter-entry' ? 'lux' : 'camera-percent' : measurementUnit({ tool, extra: null });
    if (patch.unit !== unit) throw new Error(`This reading uses ${unit}; changing an acquisition method requires a new reading.`);
    if (tool === 'spectrum') { if (typeof patch.value !== 'string') throw new Error('Report a light classification as text.'); }
    else {
      const range: [number, number] = tool === 'cct' ? [1000, 40000] : tool === 'flicker' ? [0, 3] : unit === 'camera-percent' ? [0, 100] : tool === 'glass-transmission' ? [0, 1] : tool === 'darkness' ? [0, 10000] : [0, 1000000];
      if (typeof patch.value !== 'number' || patch.value < range[0] || patch.value > range[1] || tool === 'flicker' && !Number.isInteger(patch.value)) throw new Error(`Report ${tool} within its supported ${unit} range.`);
    }
    if (existing?.tool === 'audit') throw new Error('A captured camera walkthrough keeps its original samples. Its label, notes, time and room assignment can be corrected.');
    if (existing) {
      for (const field of ['cameraLevel', 'cameraBlueRatioProxy', 'melanopic', 'inside', 'outside', 'peakBanding', 'stripes', 'frameRatio', 'calibrationFactor', 'calibrationConfirmed', 'levelLabel', 'reason', 'label', 'r', 'g', 'b', 'circadian', 'temperatureTone', 'bandingDetected', 'pwmActive']) delete extra[field];
      extra.userCorrected = true;
      if (tool === 'darkness' && unit === 'camera-percent') extra.cameraLevel = patch.value;
      if (tool === 'glass-transmission') { extra.method = 'reported-relative-ratio'; delete extra.lockMode; }
    }
  }
  if (!existing) {
    if (tool === 'darkness' && method !== 'meter-entry' && method !== 'camera-report') throw new Error('Report whether this darkness reading is a lux-meter entry or a qualitative camera percentage.');
    if (method === 'meter-entry' && !['lux', 'darkness'].includes(tool)) throw new Error('Meter-entry applies to explicitly reported photopic lux only.');
    Object.assign(extra, { source: method === 'meter-entry' ? 'meter-entry' : method === 'camera-report' && tool === 'lux' ? 'camera-estimate' : 'reported', method: method === 'meter-entry' ? 'meter-entry' : tool === 'glass-transmission' ? 'reported-relative-ratio' : method === 'camera-report' ? 'camera-relative' : 'user-reported', unit: patch.unit });
    if (tool === 'darkness' && method === 'camera-report') extra.cameraLevel = patch.value;
  }
  if ('context' in patch) extra.context = patch.context;
  return { ...Object.fromEntries(Object.entries(patch).filter(([field]) => ['value', 'roomId', 'label', 'notes'].includes(field))),
    ...('capturedAt' in patch ? { capturedAt: Date.parse(patch.capturedAt as string) } : {}), extra };
}
function compute(data: ProfileData, proposal: AgentDataProposal): { next: ProfileData; plan: LightMeasurementPlan } {
  if (!isLightMeasurementResource(proposal.resource)) throw new Error('Invalid reading/checkpoint resource.');
  const resource = proposal.resource, patch = parseAgentDataPatch(proposal.patch), operation = proposal.operation;
  validateLightMeasurementPatch(resource, operation, patch);
  const before = publicRecord(data, resource, proposal.recordId), raw = rows(data, resource).find(row => row.id === proposal.recordId), next = structuredClone(data);
  if (operation === 'add' ? before !== null : before === null) conflict();
  if (operation !== 'remove' && data._deleted?.[resource]?.includes(proposal.recordId)) throw new Error('That identity was removed. Create a new record rather than reviving it.');
  let result: unknown;
  if (resource === 'lightMeasurements') {
    if (operation === 'remove') result = mutations.deleteMeasurementRecord(next, proposal.recordId);
    else {
      const normalized = normalizeReading(patch, raw as LightMeasurementRecord | undefined), roomId = normalized.roomId ?? ('roomId' in normalized ? null : raw?.roomId);
      if (roomId != null && !data.lightEnvironment?.rooms?.some((room: { id?: unknown }) => room?.id === roomId)) throw new Error('Select a current room ID, or explicitly unassign this historical reading.');
      const at = normalized.capturedAt ?? raw?.capturedAt;
      if (typeof at !== 'number' || at < 0 || at > proposal.recordedAt) throw new Error('A recorded measurement needs an actual time that is not in the future.');
      const tool = raw?.tool || patch.tool;
      if (tool !== 'audit' && mutations.measurementRecords(data).some(peer => peer.id !== proposal.recordId && (peer.roomId || null) === (roomId || null) && peer.tool === tool && peer.capturedAt > at)) throw new Error('A newer reading already occupies this room/tool. A historical reading cannot silently replace it.');
      result = operation === 'add' ? mutations.addMeasurementRecord(next, { id: proposal.recordId, tool: String(patch.tool), value: patch.value, capturedAt: at, roomId: null, label: '', notes: '', confidence: null, ...normalized }, proposal.recordedAt) : mutations.updateMeasurementRecord(next, proposal.recordId, normalized, proposal.recordedAt);
    }
  } else {
    if (operation === 'remove') result = mutations.deleteAuditRecord(next, proposal.recordId);
    else if (operation === 'add') result = mutations.captureAuditRecord(next, proposal.recordId, String(patch.label ?? ''), String(patch.notes ?? ''), proposal.recordedAt, proposal.effectiveDate);
    else { if (typeof patch.date === 'string' && patch.date > proposal.effectiveDate) throw new Error('A saved checkpoint cannot have a future observation date.'); result = mutations.updateAuditRecord(next, proposal.recordId, patch, proposal.recordedAt); }
  }
  if (!result) throw new Error('This reading/checkpoint could not be changed. Review its source first.');
  const replaced = resource === 'lightMeasurements' ? mutations.measurementRecords(data).filter(row => row.id !== proposal.recordId && !mutations.measurementRecords(next).some(after => after.id === row.id)) : [];
  const after = publicRecord(next, resource, proposal.recordId), currentAudit = resource === 'lightAudits' ? mutations.auditRecords(next).find(row => row.id === proposal.recordId) : null;
  return { next, plan: { after, effects: { replacedMeasurements: replaced.map(readingPublic), preservedAuditCount: resource === 'lightMeasurements' ? mutations.auditRecords(data).length : 0,
    capturedCounts: operation === 'add' && currentAudit ? { rooms: currentAudit.rooms.length, screens: currentAudit.screens.length, measurements: currentAudit.measurements.length } : null,
    retainedHistory: operation === 'update' || replaced.length > 0, removedHistoryCount: operation === 'remove' && raw ? historyCount(raw, resource === 'lightMeasurements' ? 'readingHistory' : 'metadataHistory') : 0,
    removedSnapshot: resource === 'lightAudits' && operation === 'remove', analysisCleared: !!raw?.aiAnalysis && !rows(next, resource).find(row => row.id === proposal.recordId)?.aiAnalysis } } };
}
export async function readCurrentLightMeasurementRecord(profile: string, resource: LightMeasurementResource, id: string, create = false) {
  const result = await snapshot(await readAgentProfileRecords(profile), resource, id); return result.record || create ? result : null;
}
export async function listCurrentLightMeasurementRecords(profile: string, resource: LightMeasurementResource) {
  const data = await readAgentProfileRecords(profile); return rows(data, resource).map(row => publicRecord(data, resource, row.id)!);
}
export async function prepareReviewedLightMeasurementRecord(profile: string, proposal: AgentDataProposal) {
  const expected = parseLightMeasurementSnapshot(proposal), data = await readAgentProfileRecords(profile);
  if (!profileDataValuesEqual(expected, await snapshot(data, expected.resource, expected.id))) conflict();
  proposal.baseline = JSON.stringify({ ...expected, plan: compute(data, proposal).plan });
}
export function commitReviewedLightMeasurementRecord(profile: string, proposal: AgentDataProposal, authorized: () => boolean) {
  return queueLightEnvironmentWrite(profile, async () => {
    const denied = (): never => { throw Object.assign(new Error('Light disclosure or profile authorization changed. No change was applied.'), { noChangeApplied: true }); };
    if (!authorized()) denied();
    const expected = parseLightMeasurementSnapshot(proposal), data = await readAgentProfileRecords(profile), { plan: _plan, ...read } = expected;
    if (!profileDataValuesEqual(read, await snapshot(data, expected.resource, expected.id))) conflict();
    const { next, plan } = compute(data, proposal); if (!profileDataValuesEqual(plan, expected.plan)) conflict();
    const observed = state.importedData; if (!authorized()) denied();
    if (!LIGHT_MEASUREMENT_FIELDS.every(key => profileDataValuesEqual(observed[key] ?? null, data[key] ?? null))) conflict();
    const result = await commitLightEnvironmentWrite(profile, observed, data, structuredClone(observed), next, authorized, LIGHT_MEASUREMENT_FIELDS, [expected.resource]);
    if (!result.saved) { if (!authorized()) denied(); if (result.conflict) conflict(); throw new Error('Could not save this reading/checkpoint. Try Apply again.'); }
    if (proposal.operation === 'add') {
      // Match the native explicit-save hook, only after the accepted durable write.
      if (expected.resource === 'lightAudits') void import('./light-audit-ai-analysis.js').then(module => {
        const row = mutations.auditRecords(observed).find(row => row.id === expected.id);
        if (authorized() && state.importedData === observed && row) module.requestSavedAuditAnalysis(row.id);
      }).catch(() => {});
      else void import('./light-tools-ai-analysis.js').then(module => {
        const row = mutations.measurementRecords(observed).find(row => row.id === expected.id);
        if (authorized() && state.importedData === observed && row) module.maybeAnalyzeMeasurementAfterSave(row);
      }).catch(() => {});
    }
    return `${expected.resource === 'lightMeasurements' ? 'Light measurement' : 'Light checkpoint'} updated (${proposal.operation}).`;
  });
}
