import { afterEach, beforeEach, expect, it } from 'vitest';
import { expandLabPanelRows, identifyLabPanels, migrateLabPanelIdentities, packLabPanelRows } from '../js/lab-panel-identity.js';
import { mergeImportedData, localHasRowsRemoteLacks, preserveFreshLocalLabEntries } from '../js/data-merge.js';
import { pickTimestamp } from '../js/data-merge-lab-entries.js';
import { mergeProfileMutation, ProfileWriteConflict } from '../js/profile-data-writes.js';
import { mergeArrayRowsIntoImported } from '../js/sync-delta-array-merge.js';
import { decodeRowPayload } from '../js/sync-delta-row-codec.js';
import { _planArrayDelta, configureSyncDelta } from '../js/sync-delta.js';
import { ITEM_ROW_QUERY, makeEvolu, PROFILE_ID } from './helpers/sync-runtime-fixture.js';
import type { LabEntryDraft } from '../js/lab-entry.js';
import type { DeltaItemRow } from '../js/sync-delta-row-codec.js';
import { createHash } from 'node:crypto';
import { sha256 } from '../vendor/sha256.js';

const day = '2026-10-20', marker = 'hormones.cortisol';
const serum: LabEntryDraft = { date: day, markers: { [marker]: 350 }, specimen: 'serum', context: { sampleTime: '08:00', fasting: true }, updatedAt: 100, sourceFile: 'serum.pdf', markerSources: { [marker]: { file: 'serum.pdf', at: 100, snapshotId: 'report-serum' } } };
const saliva: LabEntryDraft = { date: day, markers: { [marker]: 3 }, specimen: 'saliva', context: { sampleTime: '23:00', fasting: false }, updatedAt: 200, sourceFile: 'saliva.pdf', markerSources: { [marker]: { file: 'saliva.pdf', at: 200, snapshotId: 'report-saliva' } } };
const panels = () => structuredClone([serum, saliva]);
const canonical = (rows: LabEntryDraft[]) => [...rows].sort((a, b) => String(a.specimen).localeCompare(String(b.specimen)));
const wire = (payload: LabEntryDraft, syncedAt = '2026-10-20T12:00:00Z'): DeltaItemRow => ({ itemId: day, payload: JSON.stringify(payload), syncedAt });
beforeEach(() => { localStorage.clear(); const fake = makeEvolu(); configureSyncDelta({ getEvolu: () => fake.evolu, getItemRowQuery: () => ITEM_ROW_QUERY }); });
afterEach(() => configureSyncDelta({ getEvolu: () => null, getItemRowQuery: () => null }));
it.each([0, 1, 55, 56, 64, 65, 10000])('the standalone browser hash matches Node SHA-256 at %i input bytes', length => {
  const bytes = Uint8Array.from({ length }, (_, index) => index % 256);
  expect(Buffer.from(sha256(bytes)).toString('hex')).toBe(createHash('sha256').update(bytes).digest('hex'));
});
it('migrates split legacy panels deterministically without changing values, source evidence or input objects', () => {
  const old = panels(), a = identifyLabPanels(old), b = identifyLabPanels([...old].reverse());
  expect(old).toEqual([serum, saliva]); expect(a.every(row => typeof row.panelId === 'string')).toBe(true);
  expect(new Set(a.map(row => row.panelId)).size).toBe(2); expect(canonical(a)).toEqual(canonical(b));
  for (const row of a) { const { panelId: _id, ...rest } = row; expect(rest).toEqual(old.find(item => item.specimen === row.specimen)); }
  const originalId = a[0]!.panelId; a[0]!.markers![marker] = 351; a[0]!.context!.sampleTime = '09:00';
  expect(identifyLabPanels(a)[0]!.panelId).toBe(originalId);
});
it('keeps duplicate-looking observations separate and preserves normal migration object references', () => {
  const first = structuredClone(serum), second = structuredClone(serum), data = { entries: [first, second] };
  migrateLabPanelIdentities(data); expect(data.entries[0]).toBe(first); expect(data.entries[1]).toBe(second);
  expect(new Set(data.entries.map(row => row.panelId)).size).toBe(2);
  expect(identifyLabPanels(data.entries)).toEqual(data.entries);
  expect(identifyLabPanels([serum])).toEqual([serum]);
});
it('preserves unchanged same-day specimens through the actual blob merge', () => {
  const original = panels(), local = { entries: original }, remote = structuredClone(local);
  const merged = mergeImportedData(local, remote);
  expect(merged.entries).toHaveLength(2); expect(merged.entries.map(row => row.markers)).toEqual(original.map(row => row.markers));
  expect(merged.entries.map(row => row.context)).toEqual(original.map(row => row.context));
  expect(merged.entries.map(row => row.markerSources)).toEqual(original.map(row => row.markerSources));
  expect(local.entries).toEqual(original); expect(remote).toEqual(local);
});
it.each(['specimen', 'sampleTime'] as const)('does not infer one collection across distinct %s', kind => {
  const a = { date: day, markers: { [marker]: 1 }, ...(kind === 'specimen' ? { specimen: 'serum' } : { context: { sampleTime: '08:00' } }) };
  const b = { date: day, markers: { [marker]: 2 }, ...(kind === 'specimen' ? { specimen: 'saliva' } : { context: { sampleTime: '23:00' } }) };
  expect(mergeImportedData({ entries: [a] }, { entries: [b] }).entries).toHaveLength(2);
});
it('retains additive date-unique legacy markers and their original edit/revert clocks', () => {
  const merged = mergeImportedData({ entries: [{ date: day, markers: { a: 2 }, updatedAt: 200, markerSources: { a: { file: null, at: 200 } } }] },
    { entries: [{ date: day, markers: { a: 1, b: 3 }, updatedAt: 100, markerSources: { a: { file: 'original.pdf', at: 100 } } }] });
  expect(merged.entries).toHaveLength(1); expect(merged.entries[0]!.markers).toEqual({ a: 2, b: 3 }); expect(merged.entries[0]!.markerSources!.a!.file).toBeNull();
});
it('keeps each named panel independent when both devices edit different specimens', () => {
  const base = identifyLabPanels(panels()), local = structuredClone(base), remote = structuredClone(base);
  local[0]!.markers![marker] = 355; local[0]!.markerSources![marker]!.at = 300; local[0]!.updatedAt = 300;
  remote[1]!.markers![marker] = 4; remote[1]!.markerSources![marker]!.at = 400; remote[1]!.updatedAt = 400;
  const merged = mergeImportedData({ entries: local }, { entries: remote });
  expect(merged.entries.map(row => row.markers![marker])).toEqual([355, 4]);
  expect(new Set(merged.entries.map(row => row.panelId))).toEqual(new Set(base.map(row => row.panelId)));
});
it('matches a unique legacy source to a migrated peer without creating another copy', () => {
  const local = identifyLabPanels(panels()), remote = structuredClone(serum); remote.markers![marker] = 360; remote.updatedAt = 400; remote.markerSources![marker]!.at = 400;
  const merged = mergeImportedData({ entries: local }, { entries: [remote] });
  expect(merged.entries).toHaveLength(2); expect(merged.entries.find(row => row.specimen === 'serum')!.markers![marker]).toBe(360);
  expect(merged.entries.find(row => row.specimen === 'serum')!.panelId).toBe(local[0]!.panelId);
});
it('finds missing panels for rebroadcast rather than matching only the last date row', () => {
  const full = { entries: identifyLabPanels(panels()) };
  expect(localHasRowsRemoteLacks(full, { entries: [full.entries[1]!] })).toBe(true);
  expect(localHasRowsRemoteLacks(full, structuredClone(full))).toBe(false);
  expect(localHasRowsRemoteLacks({ entries: [full.entries[1]!] }, full)).toBe(false);
});
it('packs one date row, preserving the top panel and an independently readable second panel', async () => {
  const old = panels(), plan = await _planArrayDelta(PROFILE_ID, 'entries', old);
  expect(plan.ops).toHaveLength(1); expect(Object.keys(plan.next)).toEqual([day]);
  const payload = await decodeRowPayload({ payload: plan.ops[0]!.args.payload });
  expect(payload).toMatchObject({ date: day, specimen: 'serum', markers: serum.markers, labPanelBundle: { version: 1, additional: [expect.objectContaining({ specimen: 'saliva', markers: saliva.markers })] } });
  expect(expandLabPanelRows([payload as LabEntryDraft])).toEqual(identifyLabPanels(old)); expect(old).toEqual([serum, saliva]);
});
it('cold-loads all panels through the real compressed row codec and remains stable on the next round trip', async () => {
  const plan = await _planArrayDelta(PROFILE_ID, 'entries', panels()), replica: { entries: LabEntryDraft[] } = { entries: [] };
  const row = { ...plan.ops[0]!.args, itemId: day } as DeltaItemRow;
  await mergeArrayRowsIntoImported(replica, 'entries', [row]);
  expect(replica.entries).toEqual(identifyLabPanels(panels())); expect(replica.entries.every(entry => !Object.hasOwn(entry, 'labPanelBundle'))).toBe(true);
  const second = await _planArrayDelta(PROFILE_ID, 'entries', replica.entries), third: { entries: LabEntryDraft[] } = { entries: [] };
  await mergeArrayRowsIntoImported(third, 'entries', [{ ...second.ops[0]!.args, itemId: day } as DeltaItemRow]); expect(third).toEqual(replica);
});
it('preserves all local panels when overlaying an older single-panel row', async () => {
  const replica = { entries: identifyLabPanels(panels()) };
  await mergeArrayRowsIntoImported(replica, 'entries', [wire(serum)]);
  expect(replica.entries).toHaveLength(2); expect(canonical(replica.entries)).toEqual(canonical(identifyLabPanels(panels())));
});
it('merges duplicate live relay carriers panel-by-panel instead of choosing one whole day', async () => {
  const a = identifyLabPanels(panels()), b = structuredClone(a);
  a[0]!.markers![marker] = 355; a[0]!.markerSources![marker]!.at = 300; a[0]!.updatedAt = 300;
  b[1]!.markers![marker] = 4; b[1]!.markerSources![marker]!.at = 400; b[1]!.updatedAt = 400;
  const replica: { entries: LabEntryDraft[] } = { entries: [] };
  await mergeArrayRowsIntoImported(replica, 'entries', [wire(packLabPanelRows(a)[0]!), wire(packLabPanelRows(b)[0]!)]);
  expect(replica.entries.map(row => row.markers![marker])).toEqual([355, 4]);
});
it('uses the freshest panel clock when a date carrier competes with a relay tombstone', async () => {
  const rows = identifyLabPanels(panels()), packed = packLabPanelRows(rows)[0]!;
  expect(pickTimestamp(packed)).toBe(200);
  const replica = { entries: rows };
  await mergeArrayRowsIntoImported(replica, 'entries', [{ itemId: day, payload: '', isDeleted: 1, syncedAt: new Date(150).toISOString() }]);
  expect(replica.entries).toEqual([rows[1]]);
  await mergeArrayRowsIntoImported(replica, 'entries', [{ itemId: day, payload: '', isDeleted: 1, syncedAt: new Date(250).toISOString() }]);
  expect(replica.entries).toEqual([]);
});
it('honors an explicit whole-date deletion and keeps other dates', async () => {
  const replica = { entries: [...identifyLabPanels(panels()), { date: '2026-10-19', markers: { a: 1 } }], _deleted: { entries: [day] } };
  await mergeArrayRowsIntoImported(replica, 'entries', [wire(packLabPanelRows(panels())[0]!)]);
  expect(replica.entries.map(row => row.date)).toEqual(['2026-10-19']);
  expect(mergeImportedData<{ entries: LabEntryDraft[]; _deleted?: { entries: string[] } }>(replica, { entries: panels() }).entries.map(row => row.date)).toEqual(['2026-10-19']);
});
it('preserves fresh local panels during a stale pull without collapsing their sources', () => {
  const now = Date.now(), local = identifyLabPanels(panels()); local.forEach(row => { row.updatedAt = now; });
  const pulled: { entries: LabEntryDraft[] } = { entries: [structuredClone(local[1]!)] };
  expect(preserveFreshLocalLabEntries(pulled, { entries: local }, now)).toBe(true); expect(pulled.entries).toHaveLength(2);
  expect(canonical(pulled.entries)).toEqual(canonical(local));
});
it('rebases concurrent independent edits by stable panel ID while retaining the legacy ambiguity guard', () => {
  const base = { entries: identifyLabPanels(panels()) }, a = structuredClone(base), b = structuredClone(base);
  a.entries[0]!.markers![marker] = 355; b.entries[1]!.markers![marker] = 4;
  expect(mergeProfileMutation(base, b, a).entries.map(row => row.markers![marker])).toEqual([355, 4]);
  const legacy = { entries: panels() }, left = structuredClone(legacy), right = structuredClone(legacy);
  left.entries[0]!.markers![marker] = 355; right.entries[1]!.markers![marker] = 4;
  expect(() => mergeProfileMutation(legacy, right, left)).toThrow(ProfileWriteConflict);
});
it.each([{ version: 2, additional: [] }, { version: 1, additional: [{ date: '2026-10-19', markers: {} }] }, { version: 1, additional: [{ date: day, labPanelBundle: { version: 1, additional: [] } }] }])('rejects unsupported or cross-date bundles without changing the source: %j', labPanelBundle => {
  const input = { ...serum, labPanelBundle }, before = structuredClone(input);
  expect(() => expandLabPanelRows([input])).toThrow('Unsupported lab panel bundle'); expect(input).toEqual(before);
});
