// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { state } from '../js/state.js';
import { createDefaultProfileData, profileStorageKey } from '../js/profile.js';
import { saveImportedData } from '../js/data.js';
import * as storage from '../js/crypto.js';
import * as rows from '../js/wearables-store.js';
import { applyPulledManualBodyReadings } from '../js/wearables-manual-sync.js';
import { logManualMetric } from '../js/wearables-manual.js';
import { readCurrentManualRecords } from '../js/manual-record-store.js';
import { createBrowserAgentToolDependencies } from '../js/agent-tool-bindings.js';
import { createAgentToolRuntime } from '../js/agent-tool-runtime.js';
import { applyAgentDraft } from '../js/agent-drafts.js';
import { projectAgentDraftCards } from '../js/agent-draft-presentation.js';
import { normalizeChatMessages } from '../js/chat-storage-safety.js';
import { setContextSourceEnabled, CONTEXT_SOURCE_IDS } from '../js/context-source-registry.js';
import { clearSyncSaveTimers } from '../js/sync-save-hooks.js';
import type { ProfileData } from '../types/app-state.js';

const day = '2026-10-20', other = '2026-10-19', evidence = 'Correct the manual measurements I reported.';
const originalState = { profile: state.currentProfile, data: state.importedData };
let profile: string, key: string;
const cell = (value: number | string | string[], metadata?: object) => ({ value, updatedAt: 500, ...metadata });
async function stored() { return JSON.parse((await storage.encryptedGetItem(key))!) as ProfileData; }
function runtime() { return createAgentToolRuntime({ readContext: () => '', userMessage: evidence, ...createBrowserAgentToolDependencies(profile) }); }
async function propose(patch: object, operation: 'add' | 'update' | 'remove' = 'update', recordId = `weight.${day}`) {
  const tools = runtime(), read = await tools.execute({ tool: 'getbased_read_data', arguments: { resource: 'manualReadings', ...(operation === 'add' ? { create: true } : { recordId }) } });
  if (!read.success) return { tools, result: read, draft: undefined, snapshot: undefined };
  const snapshot = JSON.parse(read.contentItems[0].text) as { snapshotId: string; current: Record<string, unknown>; recordId: string };
  const result = await tools.execute({ tool: 'getbased_draft_data', arguments: { resource: 'manualReadings', operation, snapshotId: snapshot.snapshotId, patch: JSON.stringify(patch), evidence, reason: 'An explicit user correction.' } });
  return { tools, snapshot, result, draft: tools.getDrafts()[0] ? { ...tools.getDrafts()[0]!, profileId: profile } : undefined };
}
beforeEach(async () => {
  profile = `manual-proposal-${globalThis.crypto.randomUUID()}`; key = profileStorageKey(profile, 'imported');
  state.currentProfile = profile; state.importedData = createDefaultProfileData(); localStorage.setItem('labcharts-active-profile', profile);
  setContextSourceEnabled(CONTEXT_SOURCE_IDS.WEARABLES, true);
  state.importedData.manualBodyReadings = {
    [`weight.${day}`]: cell(80, { privateOrigin: 'retain this origin', extension: { retained: true } }),
    [`bp_systolic.${day}`]: cell(120), [`bp_diastolic.${day}`]: cell(80), [`rhr.${day}`]: cell(60),
    [`waist_standing_midpoint.${day}`]: cell(90, { originalDevice: 'tape' }), [`hip_standing_midpoint.${day}`]: cell(100, { originalDevice: 'paired tape' }),
    [`note.${day}`]: cell('Morning measurements'), [`tags.${day}`]: cell(['morning-fasted']),
  };
  expect(await saveImportedData()).toBe(true);
  await applyPulledManualBodyReadings(profile, state.importedData);
});
afterEach(async () => {
  vi.restoreAllMocks(); clearSyncSaveTimers(); await rows.deleteWearablesDB(profile); await storage.encryptedRemoveItem(key);
  state.currentProfile = originalState.profile; state.importedData = originalState.data;
  localStorage.removeItem('labcharts-ai-context-wearables');
});
it('lists exact manual identities and gives small snapshots without opaque provenance', async () => {
  const tools = runtime(), list = await tools.execute({ tool: 'getbased_read_data', arguments: { resource: 'manualReadings', query: 'waist', limit: 1 } });
  expect(list.success).toBe(true); expect(JSON.parse(list.contentItems[0].text)).toMatchObject({ total: 1, records: [{ recordId: `waist_standing_midpoint.${day}` }] });
  expect(JSON.parse(list.contentItems[0].text).fields).not.toHaveProperty('method'); expect(JSON.parse(list.contentItems[0].text).rules.method).toContain('never guess');
  const proposal = await propose({ value: 81, unit: 'kg' });
  expect(proposal.result.success).toBe(true); expect(JSON.stringify(proposal.snapshot)).not.toContain('privateOrigin');
  expect(JSON.stringify(proposal.snapshot)).not.toContain('retain this origin'); expect(String(proposal.draft!.payload.baseline).length).toBeLessThan(4000);
  expect((await stored()).manualBodyReadings![`weight.${day}`]!.value).toBe(80);
});
it('corrects weight with explicit conversion, retaining peers, metadata, cache and derived summary', async () => {
  const { result, draft } = await propose({ value: 200, unit: 'lb' }); expect(result.success).toBe(true);
  expect(JSON.stringify(projectAgentDraftCards({ agentDrafts: [draft!] }))).toContain('Manual Body Readings');
  await applyAgentDraft(draft!);
  const saved = await stored(), expected = 200 / 2.2046226218;
  expect(saved.manualBodyReadings![`weight.${day}`]).toMatchObject({ value: expected, privateOrigin: 'retain this origin', extension: { retained: true }, lastChatEdit: { evidence, operation: 'update' } });
  expect(saved.manualBodyReadings![`bp_systolic.${day}`]).toMatchObject({ value: 120, updatedAt: 500 });
  expect(saved.manualBodyReadings![`rhr.${day}`]!.value).toBe(60);
  expect(await rows.getDaily(profile, 'manual', day)).toMatchObject({ weight: expected, bp_systolic: 120, bp_diastolic: 80, rhr: 60, note: 'Morning measurements' });
  expect(saved.wearableSummary?.metrics).toHaveProperty('weight');
});
it('corrects a BP component and clears another without changing the separate pulse', async () => {
  const { result, draft } = await propose({ systolic: 122, diastolic: null }, 'update', `bp.${day}`); expect(result.success).toBe(true);
  expect(JSON.stringify(projectAgentDraftCards({ agentDrafts: [draft!] }))).toContain('122/Unknown mmHg');
  await applyAgentDraft(draft!);
  expect(await rows.getDaily(profile, 'manual', day)).toMatchObject({ bp_systolic: 122, rhr: 60, weight: 80 });
  expect(await rows.getDaily(profile, 'manual', day)).not.toHaveProperty('bp_diastolic');
  expect((await stored()).manualMetricTombstones![`bp_diastolic.${day}`]).toBeGreaterThan(0);
  expect((await stored()).manualBodyReadings![`rhr.${day}`]!.updatedAt).toBe(500);
});
it('adds a BP reading while explicitly correcting an existing separately addressed pulse', async () => {
  await logManualMetric(profile, 'rhr', { date: other, value: 60 });
  const { result, draft } = await propose({ kind: 'bloodPressure', date: other, systolic: 120, diastolic: 80, pulse: 62, note: 'Seated' }, 'add'); expect(result.success, result.contentItems[0].text).toBe(true);
  expect(JSON.stringify(projectAgentDraftCards({ agentDrafts: [draft!] }))).toContain('60 bpm'); await applyAgentDraft(draft!);
  expect(await rows.getDaily(profile, 'manual', other)).toMatchObject({ bp_systolic: 120, bp_diastolic: 80, rhr: 62, note: 'Seated' });
});
it('can explicitly clear the related pulse while preserving the BP components', async () => {
  const { result, draft } = await propose({ pulse: null }, 'update', `bp.${day}`); expect(result.success).toBe(true); await applyAgentDraft(draft!);
  expect(await rows.getDaily(profile, 'manual', day)).toMatchObject({ bp_systolic: 120, bp_diastolic: 80 }); expect(await rows.getDaily(profile, 'manual', day)).not.toHaveProperty('rhr');
});
it('requires an independent pulse date correction when moving a BP record', async () => {
  expect((await propose({ date: other, pulse: 62 }, 'update', `bp.${day}`)).result.success).toBe(false);
});
it('moves only a paired waist/hip method and preserves original provenance and same-day readings', async () => {
  const { result, draft } = await propose({ position: 'supine', site: 'iliac', value: 36, unit: 'in' }, 'update', `waist_standing_midpoint.${day}`);
  expect(result.success).toBe(true); await applyAgentDraft(draft!);
  const saved = await stored(), row = await rows.getDaily(profile, 'manual', day);
  expect(row).toMatchObject({ waist_supine_iliac: 91.44, hip_supine_iliac: 100, bp_systolic: 120, weight: 80 });
  expect(row).not.toHaveProperty('waist_standing_midpoint'); expect(row).not.toHaveProperty('hip_standing_midpoint');
  expect(saved.manualBodyReadings![`waist_supine_iliac.${day}`]).toMatchObject({ originalDevice: 'tape' });
  expect(saved.manualBodyReadings![`hip_supine_iliac.${day}`]).toMatchObject({ originalDevice: 'paired tape' });
  expect(saved.manualMetricTombstones![`waist_standing_midpoint.${day}`]).toBeGreaterThan(0);
});
it('removes a paired hip without removing its waist or inventing a ratio', async () => {
  const { result, draft } = await propose({ hip: null }, 'update', `waist_standing_midpoint.${day}`); expect(result.success).toBe(true); await applyAgentDraft(draft!);
  expect(await rows.getDaily(profile, 'manual', day)).toMatchObject({ waist_standing_midpoint: 90 });
  expect(await rows.getDaily(profile, 'manual', day)).not.toHaveProperty('hip_standing_midpoint');
  expect((await readCurrentManualRecords(profile)).find(row => row.id === `waist_standing_midpoint.${day}`)).not.toHaveProperty('hip');
});
it('keeps separately timed hips separate when the waist is corrected', async () => {
  state.importedData.manualBodyReadings![`hip_standing_midpoint.${day}`]!.updatedAt = 600; expect(await saveImportedData()).toBe(true);
  await applyPulledManualBodyReadings(profile, state.importedData);
  const { result, draft } = await propose({ value: 92, unit: 'cm' }, 'update', `waist_standing_midpoint.${day}`); expect(result.success).toBe(true); await applyAgentDraft(draft!);
  const records = await readCurrentManualRecords(profile);
  expect(records.find(row => row.id === `waist_standing_midpoint.${day}`)).not.toHaveProperty('hip');
  expect(records.find(row => row.id === `hip_standing_midpoint.${day}`)).toMatchObject({ value: 100 });
  expect((await stored()).manualBodyReadings![`hip_standing_midpoint.${day}`]!.updatedAt).toBe(600);
});
it('moves one dated reading while retaining source peers and destination shared context', async () => {
  await logManualMetric(profile, 'rhr', { date: other, value: 58, note: 'Evening note' });
  const { result, draft } = await propose({ date: other }); expect(result.success).toBe(true);
  const review = JSON.stringify(projectAgentDraftCards({ agentDrafts: [draft!] })); expect(review).toContain('Evening note'); expect(review).toContain('Date correction');
  await applyAgentDraft(draft!);
  expect(await rows.getDaily(profile, 'manual', day)).not.toHaveProperty('weight');
  expect(await rows.getDaily(profile, 'manual', day)).toMatchObject({ bp_systolic: 120, note: 'Morning measurements' });
  expect(await rows.getDaily(profile, 'manual', other)).toMatchObject({ weight: 80, rhr: 58, note: 'Evening note' });
});
it('clears shared context after deleting the final reading and preserves opaque future cache fields', async () => {
  state.importedData.manualBodyReadings = { [`weight.${other}`]: cell(70), [`note.${other}`]: cell('Only reading'), [`tags.${other}`]: cell(['resting']) };
  expect(await saveImportedData()).toBe(true); await applyPulledManualBodyReadings(profile, state.importedData);
  await rows.upsertDaily(profile, { ...(await rows.getDaily(profile, 'manual', other))!, futureField: 'preserve' });
  const { result, draft } = await propose({}, 'remove', `weight.${other}`); expect(result.success).toBe(true);
  expect(JSON.stringify(projectAgentDraftCards({ agentDrafts: [draft!] }))).toContain('shared notes and tags will be cleared');
  await applyAgentDraft(draft!);
  expect(await rows.getDaily(profile, 'manual', other)).toMatchObject({ futureField: 'preserve' });
  expect(await rows.getDaily(profile, 'manual', other)).not.toHaveProperty('note');
  expect((await stored()).manualBodyReadings![`note.${other}`]!.value).toBeNull();
});
it('adds an explicitly measured abdominal depth and reviews shared date context edits', async () => {
  const { result, draft } = await propose({ kind: 'abdominalDepth', date: day, value: 20, unit: 'cm', note: 'Retaken with calipers', tags: [] }, 'add');
  expect(result.success).toBe(true); expect(JSON.stringify(projectAgentDraftCards({ agentDrafts: [draft!] }))).toContain('all manual readings');
  await applyAgentDraft(draft!);
  expect(await rows.getDaily(profile, 'manual', day)).toMatchObject({ sad_supine_iliac: 20, note: 'Retaken with calipers', weight: 80 });
  expect(await rows.getDaily(profile, 'manual', day)).not.toHaveProperty('tags');
});
it.each([
  { kind: 'weight', date: day, value: 81, unit: 'kg' },
  { kind: 'waist', date: other, value: 90, unit: 'cm' }, { kind: 'hip', date: other, value: 100, unit: 'cm' },
  { kind: 'weight', date: other, value: 81 }, { kind: 'weight', date: other, value: 501, unit: 'kg' },
  { kind: 'pulse', date: other, value: 251, unit: 'bpm' }, { kind: 'pulse', date: other, value: 60.5, unit: 'bpm' },
  { kind: 'bloodPressure', date: other, systolic: 120, diastolic: 125 }, { kind: 'bloodPressure', date: other, systolic: 301 },
  { kind: 'abdominalDepth', date: other, value: 401, unit: 'cm' }, { kind: 'abdominalDepth', date: other, value: 20, unit: 'cm', position: 'standing' },
  { kind: 'weight', date: '2026-02-30', value: 80, unit: 'kg' }, { kind: 'weight', date: '2999-01-01', value: 80, unit: 'kg' },
  { kind: 'weight', date: other, value: 80, unit: 'stone' }, { kind: 'weight', date: other, value: 80, unit: 'kg', source: 'invented' },
])('rejects occupied, ambiguous or invalid new readings %j', async patch => {
  const { result, draft } = await propose(patch, 'add'); expect(result.success).toBe(false); expect(draft).toBeUndefined();
  expect((await stored()).manualBodyReadings![`weight.${day}`]!.value).toBe(80);
});
it.each([false, true])('checks only reviewed map entries inside the locked commit (changed target %s)', async changedTarget => {
  const { draft } = await propose({ value: 81, unit: 'kg' });
  const peer = await stored(); peer.contextNotes = 'Concurrent peer note'; peer.manualBodyReadings![changedTarget ? `weight.${day}` : `bp_systolic.${day}`]!.value = changedTarget ? 82 : 121;
  const read = storage.encryptedGetItem, write = storage.encryptedSetItem; let reads = 0;
  vi.spyOn(storage, 'encryptedGetItem').mockImplementation(async (...args) => { if (args[0] === key && ++reads === 2) await write(key, JSON.stringify(peer)); return read(...args); });
  if (changedTarget) await expect(applyAgentDraft(draft!)).rejects.toMatchObject({ noChangeApplied: true }); else await applyAgentDraft(draft!);
  const saved = await stored(); expect(saved.contextNotes).toBe('Concurrent peer note');
  expect(saved.manualBodyReadings![`weight.${day}`]!.value).toBe(changedTarget ? 82 : 81);
  expect(saved.manualBodyReadings![`bp_systolic.${day}`]!.value).toBe(changedTarget ? 120 : 121);
});
it('guards an absent add destination inside the locked commit', async () => {
  const { draft, result } = await propose({ kind: 'weight', date: other, value: 70, unit: 'kg' }, 'add'); expect(result.success).toBe(true);
  const peer = await stored(); peer.manualBodyReadings![`weight.${other}`] = cell(71);
  const read = storage.encryptedGetItem, write = storage.encryptedSetItem; let reads = 0;
  vi.spyOn(storage, 'encryptedGetItem').mockImplementation(async (...args) => { if (args[0] === key && ++reads === 2) await write(key, JSON.stringify(peer)); return read(...args); });
  await expect(applyAgentDraft(draft!)).rejects.toMatchObject({ noChangeApplied: true }); expect((await stored()).manualBodyReadings![`weight.${other}`]!.value).toBe(71);
});
it('rejects disclosure revocation during the locked read before any write', async () => {
  const { draft } = await propose({ value: 81, unit: 'kg' }), read = storage.encryptedGetItem; let reads = 0;
  vi.spyOn(storage, 'encryptedGetItem').mockImplementation(async (...args) => { const value = await read(...args); if (args[0] === key && ++reads === 2) setContextSourceEnabled(CONTEXT_SOURCE_IDS.WEARABLES, false); return value; });
  await expect(applyAgentDraft(draft!)).rejects.toMatchObject({ noChangeApplied: true });
  expect((await stored()).manualBodyReadings![`weight.${day}`]!.value).toBe(80); expect(await rows.getDaily(profile, 'manual', day)).toMatchObject({ weight: 80 });
});
it('adopts legacy local readings only after approval and beats their newer per-field clock', async () => {
  const clock = Date.now() + 60000;
  await rows.upsertDaily(profile, { source: 'manual', date: other, weight: 70, futureField: 'retain', _manualSyncAt: { weight: clock } });
  const before = await storage.encryptedGetItem(key), { draft, result } = await propose({ value: 71, unit: 'kg' }, 'update', `weight.${other}`);
  expect(result.success).toBe(true); expect(await storage.encryptedGetItem(key)).toBe(before); await applyAgentDraft(draft!);
  expect((await stored()).manualBodyReadings![`weight.${other}`]!.updatedAt).toBeGreaterThan(clock);
  expect(await rows.getDaily(profile, 'manual', other)).toMatchObject({ weight: 71, futureField: 'retain' });
});
it('corrects old biometric records with provenance and opaque metadata preserved', async () => {
  state.importedData.biometrics = { weight: [{ date: other, value: 150, unit: 'lbs', note: 'Original weighing', origin: 'old entry' }], pulse: [{ date: other, value: 55 }] };
  expect(await saveImportedData()).toBe(true);
  const before = await storage.encryptedGetItem(key), { draft, result } = await propose({ value: 151, unit: 'lb' }, 'update', `weight.${other}`);
  expect(result.success).toBe(true); expect(await storage.encryptedGetItem(key)).toBe(before); await applyAgentDraft(draft!);
  const saved = await stored(); expect(saved.biometrics!.weight![0]).toMatchObject({ value: 151 / 2.2046226218, unit: 'kg', note: 'Original weighing', origin: 'old entry' });
  expect(saved.manualBodyReadings![`weight.${other}`]).toMatchObject({ originalManualRecord: { value: 150, unit: 'lbs', origin: 'old entry' } });
  expect(saved.biometrics!.pulse![0]!.value).toBe(55);
});
it('keeps an approved write successful when cache refresh fails and retains portable correction', async () => {
  const { draft } = await propose({ value: 81, unit: 'kg' }); vi.spyOn(rows, 'upsertDaily').mockRejectedValue(new Error('Cache unavailable'));
  expect(await applyAgentDraft(draft!)).toContain('Saved; reload'); expect((await stored()).manualBodyReadings![`weight.${day}`]!.value).toBe(81);
});
it('preserves manual proposals through normal chat persistence and rejects changed target caches', async () => {
  const { draft } = await propose({ value: 81, unit: 'kg' });
  expect(normalizeChatMessages([{ role: 'assistant', content: 'Review.', agentDrafts: [draft!] }])[0]!.agentDrafts![0]!.payload).toEqual(draft!.payload);
  await rows.upsertDaily(profile, { ...(await rows.getDaily(profile, 'manual', day))!, weight: 82 });
  await expect(applyAgentDraft(draft!)).rejects.toMatchObject({ noChangeApplied: true }); expect((await stored()).manualBodyReadings![`weight.${day}`]!.value).toBe(80);
});
it('respects a metric-wide deletion when explicitly re-adding one reviewed date', async () => {
  state.importedData.manualMetricTombstones = { 'weight.all': 1000 }; expect(await saveImportedData()).toBe(true);
  const { result, draft } = await propose({ kind: 'weight', date: day, value: 81, unit: 'kg' }, 'add'); expect(result.success).toBe(true); await applyAgentDraft(draft!);
  const saved = await stored(); expect(saved.manualMetricTombstones).toMatchObject({ 'weight.all': 1000, [`weight.${day}`]: 0 });
  expect(await rows.getDaily(profile, 'manual', day)).toMatchObject({ weight: 81 });
});
it.each(['mirror', 'deletion', 'cache', 'clock', 'legacyUnit'] as const)('fails closed on malformed %s data without changing a reading', async kind => {
  const data = await stored();
  if (kind === 'mirror') (data.manualBodyReadings as Record<string, unknown>)[`weight.${day}`] = null;
  if (kind === 'deletion') data.manualMetricTombstones = { 'weight.all': null } as unknown as Record<string, number>;
  if (kind === 'legacyUnit') data.biometrics = { weight: [{ date: day, value: 80, unit: 'stone' }] };
  if (kind === 'cache' || kind === 'clock') await rows.upsertDaily(profile, { ...(await rows.getDaily(profile, 'manual', day))!, ...(kind === 'cache' ? { weight: 'eighty' } : { _manualSyncAt: { weight: 'tomorrow' } }) });
  await storage.encryptedSetItem(key, JSON.stringify(data)); const before = await storage.encryptedGetItem(key);
  const { result, draft } = await propose({ value: 81, unit: 'kg' }); expect(result.success).toBe(false); expect(draft).toBeUndefined();
  expect(await storage.encryptedGetItem(key)).toBe(before);
});
it('fingerprints large opaque provenance without exporting it into a proposal', async () => {
  state.importedData.manualBodyReadings![`weight.${day}`]!.privateOrigin = 'retained-large-source'.repeat(5000); expect(await saveImportedData()).toBe(true);
  const { result, snapshot, draft } = await propose({ value: 81, unit: 'kg' }); expect(result.success).toBe(true);
  expect(String(draft!.payload.baseline).length).toBeLessThan(4000); expect(JSON.stringify(snapshot)).not.toContain('retained-large-source'); await applyAgentDraft(draft!);
  expect((await stored()).manualBodyReadings![`weight.${day}`]!.privateOrigin).toBe('retained-large-source'.repeat(5000));
});
it('preserves destination notes changed during a locked date-move commit', async () => {
  const { result, draft } = await propose({ date: other }); expect(result.success).toBe(true);
  const peer = await stored(); peer.manualBodyReadings![`note.${other}`] = cell('Peer destination note');
  const read = storage.encryptedGetItem, write = storage.encryptedSetItem; let reads = 0;
  vi.spyOn(storage, 'encryptedGetItem').mockImplementation(async (...args) => { if (args[0] === key && ++reads === 2) await write(key, JSON.stringify(peer)); return read(...args); });
  await expect(applyAgentDraft(draft!)).rejects.toMatchObject({ noChangeApplied: true });
  expect((await stored()).manualBodyReadings![`note.${other}`]!.value).toBe('Peer destination note'); expect((await stored()).manualBodyReadings![`weight.${day}`]!.value).toBe(80);
});
it('rejects a profile switch during the locked read before touching either profile', async () => {
  const { draft } = await propose({ value: 81, unit: 'kg' }), read = storage.encryptedGetItem; let reads = 0;
  vi.spyOn(storage, 'encryptedGetItem').mockImplementation(async (...args) => { const value = await read(...args); if (args[0] === key && ++reads === 2) state.currentProfile = 'other-profile'; return value; });
  await expect(applyAgentDraft(draft!)).rejects.toMatchObject({ noChangeApplied: true }); expect((await stored()).manualBodyReadings![`weight.${day}`]!.value).toBe(80);
  expect(await storage.encryptedGetItem(profileStorageKey('other-profile', 'imported'))).toBeNull();
});
it('does not clear shared context if a peer adds a reading before the final-reading deletion commits', async () => {
  state.importedData.manualBodyReadings = { [`weight.${other}`]: cell(70), [`note.${other}`]: cell('Keep this date note') };
  expect(await saveImportedData()).toBe(true); await applyPulledManualBodyReadings(profile, state.importedData);
  const { draft } = await propose({}, 'remove', `weight.${other}`), peer = await stored(); peer.manualBodyReadings![`rhr.${other}`] = cell(58);
  const read = storage.encryptedGetItem, write = storage.encryptedSetItem; let reads = 0;
  vi.spyOn(storage, 'encryptedGetItem').mockImplementation(async (...args) => { if (args[0] === key && ++reads === 2) await write(key, JSON.stringify(peer)); return read(...args); });
  await expect(applyAgentDraft(draft!)).rejects.toMatchObject({ noChangeApplied: true });
  const saved = await stored(); expect(saved.manualBodyReadings![`note.${other}`]!.value).toBe('Keep this date note'); expect(saved.manualBodyReadings![`rhr.${other}`]!.value).toBe(58); expect(saved.manualBodyReadings![`weight.${other}`]!.value).toBe(70);
});
it('leaves vendor wearable records untouched by manual corrections', async () => {
  const vendor = { source: 'oura', date: day, weight: 79, rhr: 55, privateVendorEvidence: 'keep vendor record' }; await rows.upsertDaily(profile, vendor);
  const original = await rows.getDaily(profile, 'oura', day);
  const { draft } = await propose({ value: 81, unit: 'kg' }); await applyAgentDraft(draft!);
  expect(await rows.getDaily(profile, 'oura', day)).toEqual(original);
});
it('retains both origins when moving into a previously deleted body-method slot', async () => {
  state.importedData.manualBodyReadings![`waist_supine_iliac.${day}`] = { value: null, updatedAt: 200, originalDevice: 'old target tape' };
  state.importedData.manualMetricTombstones = { [`waist_supine_iliac.${day}`]: 200 }; expect(await saveImportedData()).toBe(true);
  const { result, draft } = await propose({ position: 'supine', site: 'iliac' }, 'update', `waist_standing_midpoint.${day}`); expect(result.success).toBe(true); await applyAgentDraft(draft!);
  expect((await stored()).manualBodyReadings![`waist_supine_iliac.${day}`]).toMatchObject({ value: 90, originalDevice: 'tape', previousDestination: { value: null, originalDevice: 'old target tape' } });
});
it('rejects moving a paired waist/hip onto an independent hip measurement', async () => {
  state.importedData.manualBodyReadings![`hip_supine_iliac.${day}`] = cell(101); expect(await saveImportedData()).toBe(true); await applyPulledManualBodyReadings(profile, state.importedData);
  expect((await propose({ position: 'supine', site: 'iliac' }, 'update', `waist_standing_midpoint.${day}`)).result.success).toBe(false);
  expect((await stored()).manualBodyReadings![`hip_supine_iliac.${day}`]!.value).toBe(101);
});
it('keeps a standalone hip correction separate even when the waist has a future sync clock', async () => {
  const clock = Date.now() + 60000; state.importedData.manualBodyReadings![`waist_standing_midpoint.${day}`]!.updatedAt = clock; expect(await saveImportedData()).toBe(true); await applyPulledManualBodyReadings(profile, state.importedData);
  const { result, draft } = await propose({ value: 102, unit: 'cm' }, 'update', `hip_standing_midpoint.${day}`); expect(result.success).toBe(true); await applyAgentDraft(draft!);
  const saved = await stored(); expect(saved.manualBodyReadings![`waist_standing_midpoint.${day}`]!.updatedAt).toBe(clock); expect(saved.manualBodyReadings![`hip_standing_midpoint.${day}`]!.updatedAt).toBeGreaterThan(clock);
  expect((await readCurrentManualRecords(profile)).find(row => row.id === `waist_standing_midpoint.${day}`)).not.toHaveProperty('hip');
});
