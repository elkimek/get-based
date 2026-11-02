// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { state } from '../js/state.js';
import { createProfile, createDefaultProfileData, getProfiles, saveProfiles, profileStorageKey } from '../js/profile.js';
import { saveImportedData, invalidateActiveDataCache } from '../js/data.js';
import * as store from '../js/crypto.js';
import { clearSyncSaveTimers } from '../js/sync-save-hooks.js';
import { createAgentDataTools } from '../js/agent-data-bindings.js';
import { executeContextPreferenceControl } from '../js/context-preference-execution.js';
import { readContextPreferenceControl, previewContextPreferenceControl, bindContextPreferenceControl } from '../js/context-preference-controls.js';
import type { AppControlRecord } from '../shared/agent-control-contract.js';
import { normalizeAppControls } from '../shared/agent-control-contract.js';
import { parseContextPreferencePatch, CONTEXT_PREFERENCE_SOURCES } from '../shared/context-preference-contract.js';
import type { ContextPreferencePatch } from '../shared/context-preference-contract.js';
import { restoreContextPreferenceReceipts } from '../js/context-preference-receipts.js';
import { readContextPreferenceState } from '../js/context-preference-state.js';
import { isContextSourceEnabled } from '../js/context-source-registry.js';
import { isGroupInAIContext, getNutritionContextDays } from '../js/lab-context-settings.js';
import { readAgentWearableSeriesDays, getAgentWearableSeriesDays } from '../js/lab-context-wearables.js';
import { refreshAgentAccessFromSyncedProfile } from '../js/sync-messenger.js';
const message = 'Do not use my genetic data in future answers.';
const patch: ContextPreferencePatch = { sources: { 'genetics-summary': false, 'genetics-priority': false, 'genetics-inventory': false } };
const original = { profile: state.currentProfile, data: state.importedData, thread: state.currentThreadId, history: state.chatHistory }, active = localStorage.getItem('labcharts-active-profile');
let profile: string, key: string;
const originalLocks = Object.getOwnPropertyDescriptor(navigator, 'locks');
const stored = async () => JSON.parse((await store.encryptedGetItem(key))!);
beforeEach(async () => {
  const queues = new Map<string, Promise<unknown>>(); Object.defineProperty(navigator, 'locks', { configurable: true, value: { request: (name: string, options: unknown, callback?: () => unknown) => { const run = typeof options === 'function' ? options as () => unknown : callback!; const next = (queues.get(name) || Promise.resolve()).then(run); queues.set(name, next.catch(() => {})); return next; } } });
  profile = await createProfile('Synthetic context privacy', { skipInitialSync: true }); key = profileStorageKey(profile, 'imported');
  state.currentProfile = profile; state.importedData = createDefaultProfileData(); state.currentThreadId = 'privacy-thread'; state.chatHistory = []; localStorage.setItem('labcharts-active-profile', profile);
  Object.assign(state.importedData, { entries: [{ date: '2026-10-20', markers: { 'biochemistry.glucose': 5 }, sourceFile: 'PRIVATE_REPORT.pdf' }], contextNotes: 'PRIVATE_HEALTH', genetics: { secret: 'PRIVATE_GENOTYPE' }, nutritionContextDays: 90,
    agentAccessWearableSeriesDays: 7, agentAccess: { enabled: true, token: 'PRIVATE_TOKEN', contextKey: 'PRIVATE_CONTEXT_KEY' },
    contextSourceSettings: { 'genetics-inventory': true, 'lab-group-Biochemistry': false }, biologyScoreContextSettings: { futureScoreOption: 'preserve' } });
  expect(await saveImportedData()).toBe(true); document.body.innerHTML = '';
});
afterEach(async () => {
  vi.restoreAllMocks(); clearSyncSaveTimers(); document.body.innerHTML = '';
  if (originalLocks) Object.defineProperty(navigator, 'locks', originalLocks); else Reflect.deleteProperty(navigator, 'locks');
  for (const item of Object.keys(localStorage).filter(item => item.startsWith(`labcharts-${profile}-`))) await store.encryptedRemoveItem(item);
  await saveProfiles(getProfiles().filter(row => row.id !== profile)); state.currentProfile = original.profile; state.importedData = original.data; state.currentThreadId = original.thread; state.chatHistory = original.history; invalidateActiveDataCache();
  if (active === null) localStorage.removeItem('labcharts-active-profile'); else localStorage.setItem('labcharts-active-profile', active);
});
// Keep native disclosure transaction coverage independent of retired chat tools.
async function executeAppControl(record: AppControlRecord, undo: boolean, current: () => boolean) {
  if (undo) throw new Error('Disclosure changes require a fresh explicit review.');
  if (record.action !== 'context.preferences') throw new Error('Wrong native action');
  return executeContextPreferenceControl(record, current);
}
async function prepare(parameters: ContextPreferencePatch = patch) {
  const read = await readContextPreferenceControl(profile, { limit: 25 }), preview = previewContextPreferenceControl(read.leaseId, parameters);
  const record: Extract<AppControlRecord, { action: 'context.preferences' }> = { version: 1, id: crypto.randomUUID(), profileId: profile, threadId: state.currentThreadId!, action: 'context.preferences', ...preview, leaseId: read.leaseId, reason: 'Native owner test', evidence: message, status: 'pending' };
  bindContextPreferenceControl(record); return { record, snapshot: read.result };
}
it('reads only setting metadata and prepares a review without changing health data, preferences or claims', async () => {
  const before = await store.encryptedGetItem(key), { snapshot, record } = await prepare();
  expect(JSON.stringify({ snapshot, record })).not.toMatch(/PRIVATE_|sourceFile|entries|hasGen|token|contextKey/);
  expect(snapshot.sources['genetics-inventory']).toBe(true); expect(snapshot.nutritionDays).toBe(90); expect(snapshot.wearableSeriesDays).toBe(7);
  expect(snapshot).toMatchObject({ status: 'read_only', saved: false, reviewCreated: false }); expect(snapshot.nextStep).toContain('getbased_request_app');
  expect(record.status).toBe('pending'); expect(await store.encryptedGetItem(key)).toBe(before); expect(await store.encryptedGetItem(`labcharts-${profile}-agent-draft-claims`)).toBeNull();
});
it('projects settings without touching disabled health fields or availability', () => {
  const data = createDefaultProfileData(); for (const key of ['entries', 'genetics', 'nutritionMeals', 'wearableSummary', 'contextNotes']) Object.defineProperty(data, key, { get() { throw new Error('Disabled health content accessed'); } });
  const values = readContextPreferenceState(data, profile); expect(values.sources['genetics-inventory']).toBe(false); expect(Object.keys(values)).toEqual(['sources', 'groups', 'nutritionDays', 'wearableSeriesDays']);
});
it('atomically withdraws all genetic sources without deleting content or changing group restrictions, secrets or windows', async () => {
  const before = await stored(), { record } = await prepare(), receipt = await executeAppControl(record, false, () => true), after = await stored();
  expect(receipt).toMatchObject({ changed: ['context.preferences'], undoAvailable: false, receiptSaved: true });
  expect(after).toEqual({ ...before, contextSourceSettings: { ...before.contextSourceSettings, ...patch.sources } });
  for (const id of Object.keys(patch.sources!)) expect(isContextSourceEnabled(id)).toBe(false);
  const tools = createAgentDataTools(), reads = vi.spyOn(store, 'encryptedGetItem');
  for (const resource of ['geneticVariants', 'maternalHaplogroup', 'genome'] as const) {
    const result = await tools.readData({ resource, recordId: '', create: false, query: '', offset: 0, limit: 10 }); expect(result).toMatchObject({ available: false }); expect(JSON.stringify(result)).not.toContain('PRIVATE_');
  }
  expect(reads).not.toHaveBeenCalled(); reads.mockRestore();
  expect(isGroupInAIContext('Biochemistry')).toBe(false); expect(getNutritionContextDays()).toBe(90); expect(readAgentWearableSeriesDays(state.importedData, profile)).toBe(7);
  record.status = 'changed'; const raw = await store.encryptedGetItem(key); await expect(executeAppControl(record, true, () => true)).rejects.toThrow(/fresh explicit review/); expect(await store.encryptedGetItem(key)).toBe(raw);
});
it.each(Object.keys(CONTEXT_PREFERENCE_SOURCES))('commits source %s through the native context owner without changing other choices', async id => {
  const before = await stored(), { record } = await prepare({ sources: { [id]: false } }); await executeAppControl(record, false, () => true); const after = await stored();
  expect(after.contextSourceSettings).toEqual({ ...before.contextSourceSettings, [id]: false });
  expect(after.agentAccess).toEqual(before.agentAccess); expect(after.nutritionContextDays).toBe(90); expect(after.agentAccessWearableSeriesDays).toBe(7); expect(after.entries).toEqual(before.entries);
  expect(after.biologyScoreContextSettings).toEqual({ ...before.biologyScoreContextSettings, ...(id === 'light-sun' ? { includeLightContext: false } : id === 'wearables' ? { includeBodyContext: false } : {}) });
});
it('enables the parent lab source without re-enabling an excluded group', async () => {
  state.importedData.contextSourceSettings['lab-markers'] = false; expect(await saveImportedData()).toBe(true); const { record } = await prepare({ sources: { 'lab-markers': true } }); await executeAppControl(record, false, () => true);
  expect(isContextSourceEnabled('lab-markers')).toBe(true); expect(isGroupInAIContext('Biochemistry')).toBe(false);
});
it('updates exact group and both windows atomically while preserving Agent Access secrets and all saved observations', async () => {
  const before = await stored(), { record } = await prepare({ groups: { 'lab-group-Biochemistry': true }, nutritionDays: 7, wearableSeriesDays: 90 }); await executeAppControl(record, false, () => true); const after = await stored();
  expect(after).toEqual({ ...before, contextSourceSettings: { ...before.contextSourceSettings, 'lab-group-Biochemistry': true }, nutritionContextDays: 7, agentAccessWearableSeriesDays: 90 });
  expect(isGroupInAIContext('Biochemistry')).toBe(true); expect(readAgentWearableSeriesDays(state.importedData, profile)).toBe(90);
});
it('disabling the optional wearable series keeps its source and nutrition window unchanged', async () => {
  const { record } = await prepare({ wearableSeriesDays: 0 }); await executeAppControl(record, false, () => true); expect(readAgentWearableSeriesDays(state.importedData, profile)).toBe(0); expect(isContextSourceEnabled('wearables')).toBe(true); expect(getNutritionContextDays()).toBe(90);
});
it.each(['profile', 'thread', 'root', 'live-preference', 'peer-preference', 'group-definition', 'authorization'] as const)('refuses a stale %s review without applying it', async cause => {
  const { record } = await prepare();
  if (cause === 'profile') state.currentProfile = 'other'; if (cause === 'thread') state.currentThreadId = 'other'; if (cause === 'root') state.importedData = structuredClone(state.importedData);
  if (cause === 'live-preference') state.importedData.nutritionContextDays = 30;
  if (cause === 'peer-preference') { const peer = await stored(); peer.contextSourceSettings['wearables'] = false; await store.encryptedSetItem(key, JSON.stringify(peer)); }
  if (cause === 'group-definition') state.importedData.customMarkers = { 'special.fixture': { name: 'New group', unit: '', categoryLabel: 'New group' } };
  const before = await store.encryptedGetItem(key); await expect(executeAppControl(record, false, () => cause !== 'authorization')).rejects.toMatchObject({ noChangeApplied: true }); expect(await store.encryptedGetItem(key)).toBe(before);
});
it('preserves a peer clinical correction while changing only the reviewed preferences', async () => {
  const { record } = await prepare(), peer = await stored(); peer.contextNotes = 'Peer correction'; peer.entries[0].markers['biochemistry.glucose'] = 6; await store.encryptedSetItem(key, JSON.stringify(peer));
  await executeAppControl(record, false, () => true); expect(await stored()).toEqual({ ...peer, contextSourceSettings: { ...peer.contextSourceSettings, ...patch.sources } });
});
it('rechecks revoked human authority after the durable read and before the locked save', async () => {
  const { record } = await prepare(), before = await store.encryptedGetItem(key), reader = store.encryptedGetItem; let authorized = true;
  vi.spyOn(store, 'encryptedGetItem').mockImplementation(async (name, ...args) => { const raw = await reader(name, ...args); if (name === key) authorized = false; return raw; });
  await expect(executeAppControl(record, false, () => authorized)).rejects.toMatchObject({ noChangeApplied: true }); expect(await store.encryptedGetItem(key)).toBe(before); expect(isContextSourceEnabled('genetics-summary')).toBe(true);
});
it('keeps a peer change between the read and locked commit and reports the save as unconfirmed', async () => {
  const { record } = await prepare(), reader = store.encryptedGetItem; let injected = false, peerRaw = '';
  vi.spyOn(store, 'encryptedGetItem').mockImplementation(async (name, ...args) => { const raw = await reader(name, ...args); if (name === key && !injected) { injected = true; const peer = JSON.parse(raw!); peer.contextNotes = 'Peer value during commit'; peerRaw = JSON.stringify(peer); await store.encryptedSetItem(key, peerRaw); } return raw; });
  await expect(executeAppControl(record, false, () => true)).rejects.toThrow(/could not be confirmed/); expect(await store.encryptedGetItem(key)).toBe(peerRaw); expect(isContextSourceEnabled('genetics-summary')).toBe(true);
});
it('reads split, legacy and local wearable windows for the exact profile without touching its secrets', () => {
  expect(readAgentWearableSeriesDays({ agentAccessWearableSeriesDays: 0, agentAccess: { wearableSeriesDays: 90, token: 'secret' } }, profile)).toBe(0);
  expect(readAgentWearableSeriesDays({ agentAccess: { wearableSeriesDays: 7, token: 'secret' } }, profile)).toBe(7);
  localStorage.setItem(`labcharts-${profile}-agent-wearable-series`, 'on'); localStorage.setItem('labcharts-other-agent-wearable-series', '90'); localStorage.setItem('labcharts-active-profile', 'other');
  expect(readAgentWearableSeriesDays({}, profile)).toBe(30);
  delete state.importedData.agentAccessWearableSeriesDays; delete state.importedData.agentAccess; expect(getAgentWearableSeriesDays()).toBe(30);
});
it('does not replace a legacy local window with the read API default when Agent Access has no saved window', () => {
  delete state.importedData.agentAccessWearableSeriesDays; localStorage.setItem(`labcharts-${profile}-agent-wearable-series`, '7');
  const before = structuredClone(state.importedData.agentAccess); refreshAgentAccessFromSyncedProfile({ migrateLegacy: false });
  expect(localStorage.getItem(`labcharts-${profile}-agent-wearable-series`)).toBe('7'); expect(getAgentWearableSeriesDays()).toBe(7); expect(state.importedData.agentAccess).toEqual(before);
  state.importedData.agentAccessWearableSeriesDays = 30; refreshAgentAccessFromSyncedProfile({ migrateLegacy: false }); expect(localStorage.getItem(`labcharts-${profile}-agent-wearable-series`)).toBe('30');
  state.importedData.agentAccessWearableSeriesDays = 0; refreshAgentAccessFromSyncedProfile({ migrateLegacy: false }); expect(localStorage.getItem(`labcharts-${profile}-agent-wearable-series`)).toBe('off');
});
it('does not mirror failed storage writes or lose user data', async () => {
  const { record } = await prepare(), before = await store.encryptedGetItem(key), writer = store.encryptedSetItem;
  vi.spyOn(store, 'encryptedSetItem').mockImplementation((name, ...args) => name === key ? Promise.reject(new Error('Unavailable')) : writer(name, ...args));
  await expect(executeAppControl(record, false, () => true)).rejects.toThrow(/could not be confirmed/); expect(await store.encryptedGetItem(key)).toBe(before); expect(isContextSourceEnabled('genetics-summary')).toBe(true);
});
it('keeps a durable withdrawal saved if its optional historical proof fails', async () => {
  const { record } = await prepare(), writer = store.encryptedSetItem;
  vi.spyOn(store, 'encryptedSetItem').mockImplementation((name, ...args) => name.includes('-app-control-') ? Promise.reject(new Error('Proof unavailable')) : writer(name, ...args));
  expect(await executeAppControl(record, false, () => true)).toMatchObject({ receiptSaved: false, undoAvailable: false }); expect(isContextSourceEnabled('genetics-summary')).toBe(false);
});
it('expires restored pending reviews and requires matching native proof for historical completion', async () => {
  const { record } = await prepare(); expect(normalizeAppControls([record])[0]!.status).toBe('expired');
  const forged = normalizeAppControls([{ ...record, status: 'changed' }]); await restoreContextPreferenceReceipts([{ appControls: forged }], profile, record.threadId, () => true); expect(forged[0]!.status).toBe('failed');
  await executeAppControl(record, false, () => true); const restored = normalizeAppControls([{ ...record, status: 'changed' }]); await restoreContextPreferenceReceipts([{ appControls: restored }], profile, record.threadId, () => true); expect(restored[0]).toMatchObject({ status: 'changed', undoAvailable: false });
  const altered = normalizeAppControls([{ ...record, status: 'changed', evidence: 'Different consent' }]); await restoreContextPreferenceReceipts([{ appControls: altered }], profile, record.threadId, () => true); expect(altered[0]!.status).toBe('failed');
});
it('rejects tampering and replay of the same prepared authority', async () => {
  const { record } = await prepare(), raw = await store.encryptedGetItem(key);
  await expect(executeAppControl({ ...record, parameters: { sources: { ...record.parameters.sources, 'genetics-summary': true } } }, false, () => true)).rejects.toMatchObject({ noChangeApplied: true }); expect(await store.encryptedGetItem(key)).toBe(raw);
  await executeAppControl(record, false, () => true); const saved = await store.encryptedGetItem(key); await expect(executeAppControl(record, false, () => true)).rejects.toMatchObject({ noChangeApplied: true }); expect(await store.encryptedGetItem(key)).toBe(saved);
});
it('rejects unknown, off-page or invalid fields rather than accepting arbitrary settings paths', async () => {
  for (const input of [{ sources: { unknown: true } }, { groups: { __proto__: true } }, { nutritionDays: 365 }, { wearableSeriesDays: -1 }, { token: 'secret' }, { sources: { wearables: 'on' } }, { sources: {} }]) expect(parseContextPreferencePatch(input)).toBeNull();
  const read = await readContextPreferenceControl(profile, { query: 'Biochemistry', limit: 1 });
  const before = await store.encryptedGetItem(key);
  expect(() => previewContextPreferenceControl(read.leaseId, { groups: { 'lab-group-Lipids': false } })).toThrow(/exact registered lab group/);
  expect(await store.encryptedGetItem(key)).toBe(before);
});
it('refuses unsupported stored source metadata before a native migration could remove it', async () => {
  const data = await stored(); data.contextSourceSettings['future-private-source'] = false; const raw = JSON.stringify(data); await store.encryptedSetItem(key, raw);
  await expect(readContextPreferenceControl(profile, {})).rejects.toThrow(/unsupported context-source metadata/); expect(await store.encryptedGetItem(key)).toBe(raw);
});
