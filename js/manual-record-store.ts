// Portable profile data is authoritative; the manual cache/summary follows a
// committed command. Reads merge old local/biometric records without migration.
import type { ProfileData, ManualBodyReading } from '../types/app-state.js';
import type { StoredWearableRow } from './wearable-storage-types.js';
import type { AgentDataProposal } from '../shared/agent-data-contract.js';
import type { ProfileSaveOptions } from './data-core-types.js';
import { parseAgentDataPatch, validAgentDate } from '../shared/agent-data-contract.js';
import { encryptedGetItem } from './crypto.js';
import { profileStorageKey } from './profile-storage-key.js';
import { isProfileReadBlocked } from './profile-load-safety.js';
import { profileDataBaseline, profileDataValuesEqual } from './profile-data-writes.js';
import { saveImportedDataForProfile, notifyProfileDataContextChanged } from './data.js';
import { getDaily, getDailyRange } from './wearables-store.js';
import { queueManualOperation } from './manual-operation-lock.js';
import { MANUAL_METRICS, MANUAL_MIRROR_FIELDS, MANUAL_HISTORY_START, MANUAL_HISTORY_END, manualReadingDeletionClock } from './manual-reading-fields.js';
import { parseManualMirrorEntry, updateManualConnection } from './wearables-manual.js';
import { applyPulledManualBodyReadings, refreshRestoredManualSummary } from './wearables-manual-sync.js';
import { weightToKilograms } from './wearables-formatters.js';
import { parseManualRecordId, parseManualRecordSnapshot, projectManualRecord, manualRecordFields } from './manual-record-commands.js';
import type { ManualRecord, ManualRecordSnapshot } from './manual-record-commands.js';

type Cell = { value: ManualBodyReading['value']; updatedAt: number };
interface ManualView { base: ProfileData; cache: Map<string, StoredWearableRow>; cells: Map<string, Cell>; legacy: Map<string, object>; records: ManualRecord[]; }
const conflict = (): never => { throw Object.assign(new Error('This manual reading or its destination changed since review. Read it again. No change was applied.'), { noChangeApplied: true }); };
const dictionary = (value: unknown) => value != null && typeof value === 'object' && !Array.isArray(value);
function cacheClock(row: StoredWearableRow | undefined, field: string) {
  const clocks = row?._manualSyncAt, value = dictionary(clocks) ? (clocks as Record<string, unknown>)[field] : null;
  if (clocks != null && !dictionary(clocks) || value != null && (typeof value !== 'number' || !Number.isFinite(value) || value < 0)) throw new Error('Review the local manual reading timestamps before editing.');
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;
}
const stableJSON = (value: unknown) => JSON.stringify(value, (_key, item: unknown) => dictionary(item)
  ? Object.fromEntries(Object.entries(item as object).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) : item);
async function digest(value: unknown) {
  const hash = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(stableJSON(value)));
  return [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}
function legacyCells(base: ProfileData, selectedDates?: readonly string[]) {
  const values = new Map<string, number>(), originals = new Map<string, object>();
  for (const [kind, fields] of Object.entries({ weight: ['weight'], pulse: ['rhr'], bp: ['bp_systolic', 'bp_diastolic'] })) {
    const rows: unknown = base.biometrics?.[kind];
    if (rows == null) continue;
    if (!Array.isArray(rows)) throw new Error('Review these older manual readings in the profile editor.');
    for (const row of rows as Record<string, unknown>[]) {
      if (!dictionary(row) || typeof row.date !== 'string') continue;
      if (selectedDates && !selectedDates.includes(row.date)) continue;
      for (const field of fields) {
        const value = row[kind === 'bp' ? field === 'bp_systolic' ? 'systolic' : 'diastolic' : 'value'];
        if (kind === 'bp' && value == null) continue;
        if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error('Review the value of this older manual reading before editing.');
        if (field === 'weight' && row.unit != null && !['kg', 'lb', 'lbs'].includes(String(row.unit))) throw new Error('Review the unit of this older weight reading before editing.');
        const key = `${field}.${row.date}`;
        if (values.has(key)) throw new Error('Older manual readings contain duplicate dates. Review them in the profile editor.');
        values.set(key, field === 'weight' ? weightToKilograms(value, typeof row.unit === 'string' ? row.unit : 'kg') : value);
        originals.set(key, row);
      }
    }
  }
  return { values, originals };
}
async function readManualView(profileId: string, selectedDates?: readonly string[]): Promise<ManualView> {
  if (isProfileReadBlocked(profileId)) throw new Error('Reload this profile before editing manual readings.');
  const raw = await encryptedGetItem(profileStorageKey(profileId, 'imported'), { throwOnDecryptError: true });
  const value: unknown = raw === null ? {} : JSON.parse(raw);
  if (!dictionary(value)) throw new Error('Saved manual readings could not be read safely.');
  const base = value as ProfileData;
  for (const key of ['manualBodyReadings', 'manualMetricTombstones'] as const) if (base[key] != null && !dictionary(base[key])) throw new Error('Review the manual reading history before editing.');
  for (const [key, value] of Object.entries(base.manualMetricTombstones || {})) {
    const dot = key.indexOf('.'), field = key.slice(0, dot), date = key.slice(dot + 1);
    if (!MANUAL_METRICS.includes(field) || selectedDates && date !== 'all' && !selectedDates.includes(date)) continue;
    if (date !== 'all' && !validAgentDate(date) || typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw new Error('Review the manual reading deletion history before editing.');
  }
  const localRows = selectedDates ? (await Promise.all([...new Set(selectedDates)].map(date => getDaily(profileId, 'manual', date)))).filter((row): row is StoredWearableRow => row !== null)
    : await getDailyRange(profileId, 'manual', MANUAL_HISTORY_START, MANUAL_HISTORY_END);
  const cache = new Map(localRows.map(row => [row.date, row]));
  const { values, originals: legacy } = legacyCells(base, selectedDates), cells = new Map<string, Cell>();
  const keys = new Set([...Object.keys(base.manualBodyReadings || {}), ...values.keys(), ...[...cache.values()].flatMap(row => MANUAL_MIRROR_FIELDS.filter(field => Object.hasOwn(row, field)).map(field => `${field}.${row.date}`))]);
  for (const key of keys) {
    const dot = key.indexOf('.'), field = key.slice(0, dot), date = key.slice(dot + 1);
    if (selectedDates && !selectedDates.includes(date)) continue;
    if (!MANUAL_MIRROR_FIELDS.includes(field)) continue;
    const rawCell = base.manualBodyReadings?.[key], saved = parseManualMirrorEntry(key, rawCell);
    if (Object.hasOwn(base.manualBodyReadings || {}, key) && !saved) throw new Error('A manual reading has invalid saved data. Review it in its normal editor.');
    const row = cache.get(date), clock = cacheClock(row, field);
    const local = row && Object.hasOwn(row, field) ? parseManualMirrorEntry(key, { value: row[field], updatedAt: clock }) : null;
    if (row && Object.hasOwn(row, field) && !local) throw new Error('A local manual reading has invalid data. Review it in its normal editor.');
    let cell = saved && (!local || saved.updatedAt >= local.updatedAt) ? saved : local;
    if (!cell && values.has(key)) cell = { field, date, value: values.get(key)!, updatedAt: 0 };
    const deletion = manualReadingDeletionClock(field, date, base.manualMetricTombstones);
    if (deletion > 0 && MANUAL_METRICS.includes(field)) cells.set(key, { value: null, updatedAt: Math.max(deletion, cell?.updatedAt || 0) });
    else if (cell) cells.set(key, { value: cell.value, updatedAt: cell.updatedAt });
  }
  const records: ManualRecord[] = [], dates = [...new Set([...cells.keys()].map(key => key.slice(key.indexOf('.') + 1)))];
  const number = (field: string, date: string) => { const value = cells.get(`${field}.${date}`)?.value; return typeof value === 'number' ? value : undefined; };
  for (const date of dates) for (const field of MANUAL_METRICS) {
    const value = number(field, date);
    if (value === undefined || field === 'bp_diastolic' && number('bp_systolic', date) !== undefined) continue;
    if (field.startsWith('hip_') && number(field.replace(/^hip_/, 'waist_'), date) !== undefined && cells.get(`${field}.${date}`)?.updatedAt === cells.get(`${field.replace(/^hip_/, 'waist_')}.${date}`)?.updatedAt) continue;
    const id = `${field === 'bp_systolic' || field === 'bp_diastolic' ? 'bp' : field}.${date}`, parsed = parseManualRecordId(id);
    const record: ManualRecord = { id, kind: parsed.kind, date, unit: parsed.kind === 'weight' ? 'kg' : parsed.kind === 'bloodPressure' ? 'mmHg' : parsed.kind === 'pulse' ? 'bpm' : 'cm',
      ...(parsed.position ? { position: parsed.position, site: parsed.site } : {}) };
    if (parsed.kind === 'bloodPressure') {
      const systolic = number('bp_systolic', date), diastolic = number('bp_diastolic', date);
      if (systolic !== undefined) record.systolic = systolic;
      if (diastolic !== undefined) record.diastolic = diastolic;
    } else record.value = value;
    if (parsed.kind === 'waist' && number(parsed.fields[1]!, date) !== undefined && cells.get(`${parsed.fields[1]}.${date}`)?.updatedAt === cells.get(`${field}.${date}`)?.updatedAt) record.hip = number(parsed.fields[1]!, date)!;
    const tags = cells.get(`tags.${date}`)?.value, note = cells.get(`note.${date}`)?.value;
    if (Array.isArray(tags) && tags.length) record.tags = [...tags];
    if (typeof note === 'string' && note) record.note = note;
    const legacyNotes = [...new Set(parsed.fields.flatMap(name => { const note = (legacy.get(`${name}.${date}`) as { note?: unknown } | undefined)?.note; return typeof note === 'string' && note ? [note] : []; }))];
    if (legacyNotes.length) record.legacyNotes = legacyNotes;
    records.push(record);
  }
  records.sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
  return { base, cache, cells, legacy, records };
}
async function snapshotFor(view: ManualView, id: string): Promise<ManualRecordSnapshot> {
  const { fields, date, kind } = parseManualRecordId(id), record = view.records.find(row => row.id === id) || null;
  const represented = record ? Object.keys(manualRecordFields(record)) : fields;
  const soleReading = !MANUAL_METRICS.some(field => !represented.includes(field) && typeof view.cells.get(`${field}.${date}`)?.value === 'number');
  const context: ManualRecordSnapshot['context'] = {};
  const note = view.cells.get(`note.${date}`)?.value, tags = view.cells.get(`tags.${date}`)?.value;
  if (typeof note === 'string' && note) context.note = note;
  if (Array.isArray(tags) && tags.length) context.tags = [...tags];
  const selected = [...fields, 'tags', 'note'], row = view.cache.get(date);
  const revision = await digest({ selected: selected.map(field => ({ field, canonical: view.base.manualBodyReadings?.[`${field}.${date}`] ?? null,
    cache: row && Object.hasOwn(row, field) ? { value: row[field], clock: cacheClock(row, field) } : null,
    legacy: view.legacy.get(`${field}.${date}`) ?? null, marker: view.base.manualMetricTombstones?.[`${field}.${date}`] ?? null, all: view.base.manualMetricTombstones?.[`${field}.all`] ?? null })), soleReading });
  return { version: 1, recordId: id, record, revision, context, occupiedFields: fields.filter(field => typeof view.cells.get(`${field}.${date}`)?.value === 'number'), soleReading,
    ...(kind === 'bloodPressure' ? { relatedPulse: typeof view.cells.get(`rhr.${date}`)?.value === 'number' ? view.cells.get(`rhr.${date}`)!.value as number : null } : {}) };
}
export function readCurrentManualRecords(profileId: string) {
  return queueManualOperation(profileId, async () => (await readManualView(profileId)).records);
}
export function readCurrentManualRecord(profileId: string, recordId: string) {
  return queueManualOperation(profileId, async () => {
    const view = await readManualView(profileId, [parseManualRecordId(recordId).date]);
    return view.records.some(row => row.id === recordId) ? snapshotFor(view, recordId) : null;
  });
}
export function prepareReviewedManualRecord(profileId: string, proposal: AgentDataProposal) {
  return queueManualOperation(profileId, async () => {
    const snapshot = parseManualRecordSnapshot(JSON.parse(proposal.baseline));
    const patch = parseAgentDataPatch(proposal.patch), { after } = projectManualRecord(proposal, patch);
    const view = await readManualView(profileId, [snapshot.record?.date, after?.date].filter((date): date is string => !!date));
    if (snapshot.recordId && !profileDataValuesEqual(snapshot, await snapshotFor(view, snapshot.recordId))) conflict();
    if (after && after.id !== snapshot.recordId) {
      snapshot.destination = await snapshotFor(view, after.id);
      if (snapshot.destination.record !== null) throw new Error('A reading already exists at that destination. Read it before proposing a correction.');
      for (const field of Object.keys(manualRecordFields(after))) if (snapshot.destination.occupiedFields.includes(field) && !(field === 'rhr' && after.kind === 'bloodPressure' && Object.hasOwn(patch, 'pulse'))) throw new Error('A measurement already exists at that destination and method. Read it before proposing a correction.');
    }
    proposal.baseline = JSON.stringify(snapshot);
    if (proposal.operation === 'add' && after) proposal.recordId = after.id;
    return proposal;
  });
}
function adjustLegacy(data: ProfileData, before: ManualRecord | null, after: ManualRecord | null) {
  if (!before || !['weight', 'pulse', 'bloodPressure'].includes(before.kind)) return false;
  const kind = before.kind === 'bloodPressure' ? 'bp' : before.kind;
  const rows = data.biometrics?.[kind];
  if (!Array.isArray(rows) || !rows.some(row => row.date === before.date)) return false;
  const next: object[] = [];
  for (const row of rows) {
    if (row.date !== before.date) { next.push(row); continue; }
    if (!after) continue;
    const patched = { ...row, date: after.date } as Record<string, unknown>;
    if (before.kind === 'bloodPressure') {
      delete patched.systolic; delete patched.diastolic;
      if (after.systolic !== undefined) patched.systolic = after.systolic;
      if (after.diastolic !== undefined) patched.diastolic = after.diastolic;
      if (after.pulse === null) delete patched.pulse;
      else if (after.pulse !== undefined) patched.pulse = after.pulse;
    } else { patched.value = after.value; if (before.kind === 'weight') patched.unit = 'kg'; }
    next.push(patched);
  }
  Object.assign(data.biometrics!, { [kind]: next }); return true;
}
export function commitReviewedManualRecord(profileId: string, proposal: AgentDataProposal, authorized: () => boolean) {
  if (proposal.resource !== 'manualReadings') throw new Error('Invalid reviewed manual reading command.');
  return queueManualOperation(profileId, async () => {
    const denied = (): never => { throw Object.assign(new Error('Manual reading authorization changed. No change was applied.'), { noChangeApplied: true }); };
    if (!authorized()) denied();
    const snapshot = parseManualRecordSnapshot(JSON.parse(proposal.baseline));
    const patch = parseAgentDataPatch(proposal.patch), { before, after } = projectManualRecord(proposal, patch);
    const view = await readManualView(profileId, [before?.date, after?.date].filter((date): date is string => !!date));
    if (snapshot.recordId && !profileDataValuesEqual({ ...snapshot, destination: undefined }, await snapshotFor(view, snapshot.recordId))) conflict();
    if (snapshot.destination && !profileDataValuesEqual(snapshot.destination, await snapshotFor(view, snapshot.destination.recordId))) conflict();
    if (after && after.id !== snapshot.recordId && (!snapshot.destination || snapshot.destination.recordId !== after.id || snapshot.destination.record !== null)) conflict();
    const next = structuredClone(view.base), expected = new Map<string, { key: 'manualBodyReadings' | 'manualMetricTombstones'; id: string; value: unknown }>();
    const expect = (key: 'manualBodyReadings' | 'manualMetricTombstones', id: string) => expected.set(`${key}/${id}`, { key, id, value: view.base[key]?.[id] ?? null });
    const scope = (id: string, all = false) => {
      const { fields, date } = parseManualRecordId(id);
      for (const field of [...(all ? MANUAL_METRICS : fields), 'tags', 'note']) {
        expect('manualBodyReadings', `${field}.${date}`);
        if (MANUAL_METRICS.includes(field)) { expect('manualMetricTombstones', `${field}.${date}`); expect('manualMetricTombstones', `${field}.all`); }
      }
    };
    if (before) scope(before.id, snapshot.soleReading && after?.date !== before.date);
    if (after) scope(after.id);
    next.manualBodyReadings ||= {}; next.manualMetricTombstones ||= {};
    const sourceFields = before ? manualRecordFields(before) : {}, targetFields = after ? manualRecordFields(after) : {};
    const maxClock = Math.max(proposal.recordedAt, Date.now(), ...[...expected.values()].map(row => {
      const value = row.value, local = view.cells.get(row.id)?.updatedAt || 0;
      return Math.max(local, typeof value === 'number' ? value : typeof (value as { updatedAt?: unknown })?.updatedAt === 'number' ? (value as { updatedAt: number }).updatedAt : 0);
    }));
    const stamp = maxClock + 1;
    if (!Number.isSafeInteger(stamp)) throw new Error('Review the manual reading timestamps before editing.');
    const write = (field: string, date: string, value: ManualBodyReading['value']) => {
      const key = `${field}.${date}`;
      next.manualBodyReadings![key] = { ...next.manualBodyReadings![key], value, updatedAt: stamp,
        lastChatEdit: { recordedAt: proposal.recordedAt, approvedAt: Date.now(), operation: proposal.operation, evidence: proposal.evidence, reason: proposal.reason } };
      if (MANUAL_METRICS.includes(field)) next.manualMetricTombstones![key] = value === null ? stamp : 0;
    };
    for (const field of Object.keys(sourceFields)) if (!after || after.date !== before!.date || !Object.hasOwn(targetFields, field)) write(field, before!.date, null);
    if (before && snapshot.soleReading && after?.date !== before.date) { write('note', before.date, null); write('tags', before.date, null); }
    if (after) {
      for (const [field, value] of Object.entries(targetFields)) {
        const oldField = before ? parseManualRecordId(before.id).fields[parseManualRecordId(after.id).fields.indexOf(field)] : undefined;
        const oldKey = before && oldField && Object.hasOwn(sourceFields, oldField) ? `${oldField}.${before.date}` : null, key = `${field}.${after.date}`;
        if (oldKey && oldKey !== key) {
          const previousDestination = next.manualBodyReadings[key];
          next.manualBodyReadings[key] = { ...view.base.manualBodyReadings?.[oldKey], ...(previousDestination ? { previousDestination } : {}), value, updatedAt: stamp };
        }
        const legacy = view.legacy.get(oldKey || key);
        if (legacy && !next.manualBodyReadings[key]?.originalManualRecord) next.manualBodyReadings[key] = { ...next.manualBodyReadings[key], value, updatedAt: stamp, originalManualRecord: legacy };
        write(field, after.date, value);
      }
      for (const field of ['tags', 'note'] as const) if (Object.hasOwn(patch, field)) write(field, after.date, after[field] ?? null);
      if (after.kind === 'bloodPressure' && patch.pulse === null) write('rhr', after.date, null);
    }
    let legacyChanged = adjustLegacy(next, before, after);
    if (after?.kind === 'bloodPressure' && Object.hasOwn(patch, 'pulse')) {
      const oldValue = snapshot.relatedPulse ?? snapshot.destination?.relatedPulse;
      if (typeof oldValue === 'number') {
        const oldPulse: ManualRecord = { id: `rhr.${after.date}`, kind: 'pulse', date: after.date, unit: 'bpm', value: oldValue };
        legacyChanged = adjustLegacy(next, oldPulse, after.pulse == null ? null : { ...oldPulse, value: after.pulse }) || legacyChanged;
      }
    }
    updateManualConnection(next);
    let changed = false, revoked = false;
    const options: ProfileSaveOptions = { baseData: view.base, forceProfileScope: true,
      expectedProfileMapEntries: [...expected.values()],
      ...(legacyChanged ? { expectedContextField: { key: 'biometrics', value: view.base.biometrics ?? null } } : {}),
      onContextFieldConflict: () => { changed = true; }, canCommit: () => { if (!authorized()) revoked = true; return !revoked; } };
    if (!await saveImportedDataForProfile(profileId, next, options)) { if (revoked) denied(); if (changed) conflict(); throw new Error('The manual reading could not be saved.'); }
    let refreshPending = false;
    try {
      const committed = structuredClone(profileDataBaseline(next) || next);
      await applyPulledManualBodyReadings(profileId, committed, authorized);
      if (!await refreshRestoredManualSummary(profileId)) refreshPending = true;
    } catch { refreshPending = true; }
    try { notifyProfileDataContextChanged(profileId); } catch { /* Already committed. */ }
    return `Manual reading ${proposal.operation === 'add' ? 'added' : proposal.operation === 'remove' ? 'removed' : 'updated'}.${refreshPending ? ' Saved; reload Body to finish refreshing its local view.' : ''}`;
  });
}
