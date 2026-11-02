import { buildAgentApplicationContext } from '../js/agent-chat-context.js';
// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { state } from '../js/state.js';
import { createProfile, createDefaultProfileData, profileStorageKey, getProfiles, saveProfiles } from '../js/profile.js';
import { saveImportedData, invalidateActiveDataCache, configureDataContextDependencies } from '../js/data.js';
import * as storage from '../js/crypto.js';
import { clearSyncSaveTimers } from '../js/sync-save-hooks.js';
import { CONTEXT_SOURCE_IDS, setContextSourceEnabled } from '../js/context-source-registry.js';
import { setGroupInAIContext } from '../js/lab-context-settings.js';
import { executeLabOrderingControl } from '../js/lab-ordering-control-execution.js';
import { readLabOrderingControl, previewLabOrderingControl, bindLabOrderingControl } from '../js/lab-ordering-controls.js';
import type { AppControlRecord } from '../shared/agent-control-contract.js';
import { normalizeAppControls } from '../shared/agent-control-contract.js';
import { restoreLabOrderingReceipts } from '../js/lab-ordering-control-receipts.js';
import { projectChatMessageActions } from '../js/chat-message-actions-contract.js';
import { setMarkerPlacement } from '../js/marker-placement.js';
import { appendLabOrderMove, cancelLabOrderMove, mergeLabOrderRecords, projectLabOrder, parseLabOrderRecord } from '../js/lab-ordering-core.js';
import { parseLabOrderingPatch } from '../shared/lab-ordering-control-contract.js';
import type { ProfileData } from '../types/app-state.js';
import type { LabOrderingPatch } from '../shared/lab-ordering-control-contract.js';
const message = 'Put Urea before Glucose in Biochemistry and keep this order from now on.';
const patch: LabOrderingPatch = { scopeId: 'markers.biochemistry', move: { item: 'biochemistry.urea', before: 'biochemistry.glucose' } };
const original = { profile: state.currentProfile, data: state.importedData, thread: state.currentThreadId, history: state.chatHistory, view: state.currentView }, previousActive = localStorage.getItem('labcharts-active-profile');
const locks = Object.getOwnPropertyDescriptor(navigator, 'locks');
let profile: string, key: string;
const stored = async () => JSON.parse((await storage.encryptedGetItem(key))!) as ProfileData;
beforeEach(async () => {
  profile = await createProfile('Synthetic chat ordering', { skipInitialSync: true }); key = profileStorageKey(profile, 'imported');
  state.currentProfile = profile; state.importedData = createDefaultProfileData(); state.currentThreadId = 'ordering-thread'; state.chatHistory = []; state.currentView = 'dashboard'; localStorage.setItem('labcharts-active-profile', profile);
  state.importedData.entries = [{ date: '2026-10-20', markers: { 'biochemistry.glucose': 5, 'biochemistry.urea': 4 }, sourceFile: 'PRIVATE_REPORT.pdf' }]; state.importedData.contextNotes = 'PRIVATE_HEALTH';
  state.importedData.customMarkers = { 'privateTests.fixture': { markerId: 'custom:ordering-private', name: 'PRIVATE_MARKER', unit: '', categoryLabel: 'PRIVATE_GROUP' } };
  setContextSourceEnabled(CONTEXT_SOURCE_IDS.LAB_MARKERS, true); for (const group of ['Biochemistry', 'Lipids', 'PRIVATE_GROUP']) setGroupInAIContext(group, true);
  expect(await saveImportedData()).toBe(true); document.body.innerHTML = '';
  const queues = new Map<string, Promise<unknown>>(); Object.defineProperty(navigator, 'locks', { configurable: true, value: { request: (name: string, options: unknown, callback?: () => unknown) => { const run = typeof options === 'function' ? options as () => unknown : callback!; const next = (queues.get(name) || Promise.resolve()).then(run); queues.set(name, next.catch(() => {})); return next; } } });
});
afterEach(async () => {
  vi.restoreAllMocks(); clearSyncSaveTimers(); document.body.innerHTML = ''; if (locks) Object.defineProperty(navigator, 'locks', locks); else Reflect.deleteProperty(navigator, 'locks');
  for (const item of Object.keys(localStorage).filter(item => item.startsWith(`labcharts-${profile}-`))) await storage.encryptedRemoveItem(item);
  await saveProfiles(getProfiles().filter(row => row.id !== profile)); state.currentProfile = original.profile; state.importedData = original.data; state.currentThreadId = original.thread; state.chatHistory = original.history; state.currentView = original.view; invalidateActiveDataCache();
  if (previousActive === null) localStorage.removeItem('labcharts-active-profile'); else localStorage.setItem('labcharts-active-profile', previousActive);
});
// Exercise the retained native owner directly; chat no longer exposes this family.
async function readNativeOrdering(options: { scopeId?: string; limit?: number }) { return (await readLabOrderingControl(profile, options)).result; }
function executeAppControl(record: AppControlRecord, undo: boolean, current: () => boolean) {
  if (record.action !== 'labs.ordering') throw new Error('Wrong native action');
  return executeLabOrderingControl(record, undo, current);
}
async function prepare(parameters: LabOrderingPatch = patch) {
  const read = await readLabOrderingControl(profile, { scopeId: parameters.scopeId, limit: 25 });
  if (!read.leaseId) throw new Error('No native ordering lease');
  const preview = await previewLabOrderingControl(read.leaseId, parameters);
  const record: Extract<AppControlRecord, { action: 'labs.ordering' }> = { version: 1, id: crypto.randomUUID(), profileId: profile, threadId: state.currentThreadId!, action: 'labs.ordering', parameters: preview.patch, baseline: preview.review, leaseId: read.leaseId, reason: 'Native owner test', evidence: message, status: 'pending' };
  bindLabOrderingControl(record); return { record, snapshot: read.result };
}
it('discovers scopes and prepares a typed review without saving data, claims, or private source content', async () => {
  setGroupInAIContext('PRIVATE_GROUP', false); expect(await saveImportedData()).toBe(true);
  const raw = await storage.encryptedGetItem(key), directory = await readNativeOrdering({ limit: 25 });
  expect(JSON.stringify(directory)).not.toMatch(/PRIVATE_|sourceKeys|sourceFile|entries/);
  const { record, snapshot } = await prepare(); expect(record.status).toBe('pending');
  expect(JSON.stringify({ record, snapshot })).not.toMatch(/PRIVATE_|sourceKeys|sourceFile|commands|generation|entries/);
  expect(await storage.encryptedGetItem(key)).toBe(raw); expect(await storage.encryptedGetItem(`labcharts-${profile}-agent-draft-claims`)).toBeNull();
});
it('Apply changes only ordering, then selective Undo preserves an unseen peer move and cannot be replayed', async () => {
  const before = await stored(), { record } = await prepare(), receipt = await executeAppControl(record, false, () => true); expect(receipt.undoAvailable).toBe(true); record.status = 'changed'; record.undoAvailable = true;
  const applied = await stored(), afterRules = parseLabOrderRecord(applied.labOrdering![patch.scopeId]); expect({ ...applied, labOrdering: before.labOrdering }).toEqual(before);
  const peer = appendLabOrderMove(afterRules, { item: 'biochemistry.creatinine', before: 'biochemistry.urea' }, 'unseen-peer', Date.now() + 1);
  await executeAppControl(record, true, () => true); const undone = await stored(), rules = parseLabOrderRecord(undone.labOrdering![patch.scopeId]);
  expect(rules.generation).toEqual(afterRules.generation); expect(rules.cancelled).toEqual([afterRules.commands.at(-1)!.id]);
  const merged = mergeLabOrderRecords(rules, peer); expect(merged.commands.some(row => row.id === 'unseen-peer')).toBe(true);
  expect(projectLabOrder(['biochemistry.glucose', 'biochemistry.urea', 'biochemistry.creatinine'], row => row, merged)).toEqual(['biochemistry.glucose', 'biochemistry.creatinine', 'biochemistry.urea']);
  expect({ ...undone, labOrdering: before.labOrdering }).toEqual(before); const afterUndo = await storage.encryptedGetItem(key); await expect(executeAppControl(record, true, () => true)).rejects.toMatchObject({ noChangeApplied: true }); expect(await storage.encryptedGetItem(key)).toBe(afterUndo); expect(JSON.parse((await storage.encryptedGetItem(`labcharts-${profile}-agent-draft-claims`))!).claims[`${record.id}-undo`]).toBe(true);
});
it('reads the actual saved preferred ordering instead of returning the unchanged selection catalog', async () => {
  const { record, snapshot } = await prepare(); await executeAppControl(record, false, () => true); record.status = 'changed';
  const after = await readNativeOrdering({ scopeId: patch.scopeId, limit: 25 }) as { items: Array<{ id: string }>; hasCustomMoves: boolean; basis: string };
  expect(after.items.findIndex(row => row.id === 'biochemistry.urea')).toBeLessThan(after.items.findIndex(row => row.id === 'biochemistry.glucose')); expect(after.hasCustomMoves).toBe(true); expect(after.basis).toContain('saved moves');
  await executeAppControl(record, true, () => true); const undone = await readNativeOrdering({ scopeId: patch.scopeId, limit: 25 }) as { items: Array<{ id: string }>; hasCustomMoves: boolean };
  expect(undone.items).toEqual(snapshot.items); expect(undone.hasCustomMoves).toBe(false);
});
it('Apply and Undo do not invalidate clinical context for a presentation-only change', async () => {
  const invalidate = vi.fn(), previous = configureDataContextDependencies({ invalidateLabContextCache: invalidate });
  try { const { record } = await prepare(); await executeAppControl(record, false, () => true); record.status = 'changed'; await executeAppControl(record, true, () => true); expect(invalidate).not.toHaveBeenCalled(); }
  finally { configureDataContextDependencies(previous); }
});
it('restores genuine completion and guarded Undo after reload normalization, while pending reviews expire', async () => {
  const { record } = await prepare(); expect(normalizeAppControls([record])[0]!.status).toBe('expired');
  await executeAppControl(record, false, () => true); record.status = 'changed'; record.undoAvailable = true;
  const restored = normalizeAppControls([record]); expect(restored[0]!.status).toBe('failed');
  await restoreLabOrderingReceipts([{ appControls: restored }], profile, 'ordering-thread', () => true); expect(restored[0]).toMatchObject({ status: 'changed', undoAvailable: true });
  await executeAppControl(restored[0]!, true, () => true); const again = normalizeAppControls([{ ...record, status: 'undone' }]); await restoreLabOrderingReceipts([{ appControls: again }], profile, 'ordering-thread', () => true); expect(again[0]).toMatchObject({ status: 'undone', undoAvailable: false });
});
it('never trusts imported changed/Undo claims without a matching private proof', async () => {
  const { record } = await prepare(), raw = await storage.encryptedGetItem(key), forged = normalizeAppControls([{ ...record, status: 'changed', undoAvailable: true }]);
  await restoreLabOrderingReceipts([{ appControls: forged }], profile, 'ordering-thread', () => true); expect(forged[0]!.status).toBe('failed');
  await expect(executeAppControl({ ...record, status: 'changed' }, true, () => true)).rejects.toMatchObject({ noChangeApplied: true }); expect(await storage.encryptedGetItem(key)).toBe(raw);
});
it.each(['profile', 'thread', 'root', 'editor', 'source', 'group', 'labels', 'order', 'unsaved'] as const)('refuses Apply after a %s ownership/dependency change without writing clinical data', async cause => {
  const { record } = await prepare();
  if (cause === 'profile') state.currentProfile = 'synthetic-other'; if (cause === 'thread') state.currentThreadId = 'other-thread'; if (cause === 'root') state.importedData = structuredClone(state.importedData);
  if (cause === 'editor') document.body.innerHTML = '<div class="modal-overlay show"><input value="Keep input"></div>';
  if (cause === 'source') setContextSourceEnabled(CONTEXT_SOURCE_IDS.LAB_MARKERS, false); if (cause === 'group') setGroupInAIContext('Biochemistry', false);
  if (cause === 'labels') { state.importedData.markerLabels = { 'biochemistry.urea': 'Changed label' }; await saveImportedData(); }
  if (cause === 'order') { state.importedData.labOrdering = { [patch.scopeId]: appendLabOrderMove(null, { item: 'biochemistry.glucose', before: 'biochemistry.urea' }, 'peer', 1) }; await saveImportedData(); }
  if (cause === 'unsaved') state.importedData.labOrdering = { [patch.scopeId]: appendLabOrderMove(null, patch.move, 'unsaved', 1) };
  const raw = await storage.encryptedGetItem(key), live = structuredClone(state.importedData); await expect(executeAppControl(record, false, () => true)).rejects.toMatchObject({ noChangeApplied: true }); expect(await storage.encryptedGetItem(key)).toBe(raw); expect(state.importedData).toEqual(live);
});
it('hides disabled marker labels from reads and rendered controls, permits visible moves, and forbids a whole partially disclosed reset', async () => {
  expect(setMarkerPlacement(state.importedData, 'privateTests.fixture', 'biochemistry').ok).toBe(true); setGroupInAIContext('PRIVATE_GROUP', false); expect(await saveImportedData()).toBe(true);
  const { record, snapshot } = await prepare(); expect(JSON.stringify(snapshot)).not.toMatch(/PRIVATE_|privateTests/); expect(snapshot.resetAvailable).toBe(false);
  await executeAppControl(record, false, () => true);
  const read = await readLabOrderingControl(profile, { scopeId: patch.scopeId });
  await expect(previewLabOrderingControl(read.leaseId!, { scopeId: patch.scopeId, reset: true })).rejects.toThrow(/unavailable/);
  state.chatHistory = [{ role: 'assistant', content: '', appControls: [record] }]; expect(projectChatMessageActions(state.chatHistory, 0)!.reviews.filter(review => review.kind === 'app').map(review => review.control)).toHaveLength(1);
  setGroupInAIContext('Biochemistry', false); expect(projectChatMessageActions(state.chatHistory, 0)!.reviews.filter(review => review.kind === 'app').map(review => review.control)).toHaveLength(0); expect(buildAgentApplicationContext('', state.chatHistory)).not.toContain('labs.ordering');
});
it('resets a fully disclosed scope and Undo restores its prior custom order as a fresh generation', async () => {
  const first = await prepare(); await executeAppControl(first.record, false, () => true); const before = await stored(), reset = await prepare({ scopeId: patch.scopeId, reset: true });
  await executeAppControl(reset.record, false, () => true); reset.record.status = 'changed'; const defaults = parseLabOrderRecord((await stored()).labOrdering![patch.scopeId]); expect(defaults.commands).toHaveLength(0);
  await executeAppControl(reset.record, true, () => true); const restored = parseLabOrderRecord((await stored()).labOrdering![patch.scopeId]); expect(restored.generation.at).toBeGreaterThan(defaults.generation.at);
  expect(projectLabOrder(['biochemistry.glucose', 'biochemistry.urea'], row => row, restored)).toEqual(projectLabOrder(['biochemistry.glucose', 'biochemistry.urea'], row => row, before.labOrdering![patch.scopeId]));
});
it('keeps a failed profile write off the live root and never writes a false completion proof', async () => {
  const { record } = await prepare(), before = await stored(), live = structuredClone(state.importedData), write = storage.encryptedSetItem;
  vi.spyOn(storage, 'encryptedSetItem').mockImplementation(async (...args) => { if (args[0] === key) throw new Error('Synthetic profile write failure'); return write(...args); });
  await expect(executeAppControl(record, false, () => true)).rejects.toThrow(/could not be saved/); expect(await stored()).toEqual(before); expect(state.importedData).toEqual(live); expect(await storage.encryptedGetItem(`labcharts-${profile}-app-control-${record.id}`)).toBeNull();
});
it.each([false, true])('preserves a late clinical peer correction and refuses a selected-scope conflict at the final lock, scopeConflict=%s', async scopeConflict => {
  const { record } = await prepare(), peer = await stored(), read = storage.encryptedGetItem, write = storage.encryptedSetItem; let reads = 0;
  peer.entries[0]!.markers['biochemistry.glucose'] = 5.3;
  if (scopeConflict) peer.labOrdering = { [patch.scopeId]: appendLabOrderMove(null, { item: 'biochemistry.glucose', before: 'biochemistry.urea' }, 'late-peer', 1) };
  vi.spyOn(storage, 'encryptedGetItem').mockImplementation(async (...args) => { if (args[0] === key && ++reads === 4) await write(key, JSON.stringify(peer)); return read(...args); });
  if (scopeConflict) { await expect(executeAppControl(record, false, () => true)).rejects.toMatchObject({ noChangeApplied: true }); expect(await stored()).toEqual(peer); }
  else { await executeAppControl(record, false, () => true); expect((await stored()).entries).toEqual(peer.entries); expect((await stored()).labOrdering![patch.scopeId]).toBeTruthy(); }
});
it('can explicitly reset retained cancellation history after all moves have been undone', async () => {
  const { record } = await prepare(); await executeAppControl(record, false, () => true); record.status = 'changed'; await executeAppControl(record, true, () => true);
  const reset = await prepare({ scopeId: patch.scopeId, reset: true }); expect(reset.snapshot.resetAvailable).toBe(true); await executeAppControl(reset.record, false, () => true);
  const saved = parseLabOrderRecord((await stored()).labOrdering![patch.scopeId]); expect(saved.commands).toHaveLength(0); expect(saved.cancelled).toBeUndefined();
});
it('reports saved ordering with no Undo when the private completion proof cannot be persisted', async () => {
  const { record } = await prepare(), write = storage.encryptedSetItem;
  vi.spyOn(storage, 'encryptedSetItem').mockImplementation(async (...args) => { if (args[0] === `labcharts-${profile}-app-control-${record.id}`) throw new Error('Synthetic proof failure'); return write(...args); });
  expect(await executeAppControl(record, false, () => true)).toMatchObject({ undoAvailable: false, receiptSaved: false }); expect((await stored()).labOrdering![patch.scopeId]).toBeTruthy();
});
it('retains a retired Undo receipt as unconfirmed if the post-Undo proof fails', async () => {
  const { record } = await prepare(); await executeAppControl(record, false, () => true); record.status = 'changed'; let writes = 0; const write = storage.encryptedSetItem;
  vi.spyOn(storage, 'encryptedSetItem').mockImplementation(async (...args) => { if (args[0] === `labcharts-${profile}-app-control-${record.id}` && ++writes === 2) throw new Error('Synthetic post-Undo proof failure'); return write(...args); });
  expect(await executeAppControl(record, true, () => true)).toMatchObject({ receiptSaved: false });
  const restored = normalizeAppControls([{ ...record, status: 'undone' }]); await restoreLabOrderingReceipts([{ appControls: restored }], profile, 'ordering-thread', () => true); expect(restored[0]!.status).toBe('failed'); expect(restored[0]!.undoAvailable).not.toBe(true);
});
it('rejects tampered or forked portable controls even when they reuse a valid live lease', async () => {
  const { record } = await prepare(), raw = await storage.encryptedGetItem(key);
  await expect(executeAppControl({ ...record, id: 'forged-control' }, false, () => true)).rejects.toMatchObject({ noChangeApplied: true });
  await expect(executeAppControl({ ...record, reason: 'Changed review' }, false, () => true)).rejects.toMatchObject({ noChangeApplied: true }); expect(await storage.encryptedGetItem(key)).toBe(raw);
});
it.each([{ scopeId: 'sidebar', restore: {} }, { scopeId: 'sidebar', reset: false }, { scopeId: 'sidebar', move: { item: 'A', before: 'B', after: 'C' } }, { scopeId: 'sidebar', move: { item: 'A', before: 'A' } }, { scopeId: '__proto__', reset: true }, { scopeId: 'sidebar', cancelMove: 'native-only' }])('rejects unsupported portable ordering parameters %j', value => { expect(parseLabOrderingPatch(value)).toBeNull(); });
it('merges selective cancellation without losing concurrent intents or reviving the undone move', () => {
  const a = appendLabOrderMove(null, { item: 'A', after: 'C' }, 'a', 1), b = appendLabOrderMove(a, { item: 'D', before: 'B' }, 'b', 2), undone = cancelLabOrderMove(a, 'a');
  const merged = mergeLabOrderRecords(b, undone); expect(mergeLabOrderRecords(undone, b)).toEqual(merged); expect(projectLabOrder(['A', 'B', 'C', 'D'], row => row, merged)).toEqual(['A', 'D', 'B', 'C']);
  expect(mergeLabOrderRecords(merged, a).cancelled).toEqual(['a']); expect(() => appendLabOrderMove(undone, { item: 'A', before: 'B' }, 'a', 3)).toThrow(/fresh/);
});
