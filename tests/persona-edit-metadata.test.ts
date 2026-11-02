// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { state } from '../js/state.js';
import * as crypto from '../js/crypto.js';
import { captureCustomPersonalityEdit, commitCustomPersonalityEdit, customPersonalityStorageKey, customPersonalityTombstoneStorageKey } from '../js/chat-personality-storage.js';
import { capturePersonaMetadataRefresh, commitPersonaMetadataRefresh, releasePersonaMetadataRefresh } from '../js/chat-personality-selection.js';
import { markNativeChatThreadIndexLoaded, ownsNativeChatThreadIndex, saveNativeChatThreadIndex } from '../js/chat-thread-index-storage.js';
import { configureChatRuntimeCallbacks } from '../js/chat-runtime.js';
import { installPersonaCommandTestLocks } from './helpers/persona-command-locks.js';
const original = { profile: state.currentProfile, thread: state.currentThreadId, root: state.importedData, threads: state.chatThreads, history: state.chatHistory, persona: state.currentChatPersonality };
const target = { id: 'custom_metadata', name: 'Original reviewer', icon: 'R', promptText: 'PRIVATE_ORIGINAL_PROMPT', opaque: { keep: true } }, other = { id: 'custom_other', name: 'Other reviewer', icon: 'O', promptText: 'PRIVATE_OTHER_PROMPT' };
let sequence = 0, profile: string, catalog: string, deleted: string, index: string, preference: string, body: string, streaming = false;
const bytes = () => [catalog, deleted, index, preference, body].map(key => localStorage.getItem(key));
const storedThreads = async () => JSON.parse((await crypto.encryptedGetItem(index, { throwOnDecryptError: true }))!) as Array<Record<string, unknown>>;
async function prepare(name = 'Reviewed name', icon = 'N') {
  const edit = await captureCustomPersonalityEdit(target.id), metadata = await capturePersonaMetadataRefresh(target.id);
  const saved = await commitCustomPersonalityEdit(edit.leaseId, { name, icon, promptText: 'PRIVATE_REVIEWED_PROMPT' }, { canCommit: () => true });
  return { metadata, saved };
}
beforeEach(async () => {
  installPersonaCommandTestLocks(); localStorage.clear(); streaming = false; profile = `persona-metadata-${++sequence}`;
  state.currentProfile = profile; state.currentThreadId = 'origin'; state.currentChatPersonality = target.id; state.importedData = structuredClone(original.root); state.importedData.contextNotes = 'PRIVATE_RETAINED_HEALTH';
  state.chatHistory = [{ role: 'assistant', content: 'Retained answer', personalityName: 'Original attribution', provider: 'original-provider', modelId: 'original-model' }];
  state.chatThreads = [{ id: 'origin', name: 'Retained title', personality: target.id, personalityName: target.name, personalityIcon: target.icon, personalityUpdatedAt: '2100-01-01', createdAt: '2020-01-01', updatedAt: '2090-01-01', messagesUpdatedAt: '2020-01-01', messageCount: 1, opaque: { keep: true } }, { id: 'unrelated', name: 'Other chat', createdAt: '2020-01-01', updatedAt: '2020-01-01', messageCount: 0, opaque: ['keep'] }];
  (window as unknown as { __WEARABLES_TEST: boolean }).__WEARABLES_TEST = true; localStorage.setItem('labcharts-encryption-enabled', 'true'); await crypto._setTestSessionKey('synthetic selected persona metadata');
  catalog = customPersonalityStorageKey(profile); deleted = customPersonalityTombstoneStorageKey(profile); index = `labcharts-${profile}-chat-threads`; preference = `labcharts-${profile}-chatPersonality`; body = `labcharts-${profile}-chat-t_origin`;
  await crypto.encryptedSetItem(catalog, JSON.stringify([target, other])); await crypto.encryptedSetItem(index, JSON.stringify(state.chatThreads)); await crypto.encryptedSetItem(body, JSON.stringify(state.chatHistory)); localStorage.setItem(preference, target.id); markNativeChatThreadIndexLoaded(profile, state.chatThreads);
  configureChatRuntimeCallbacks({ isChatStreaming: () => streaming, onChatSaved: null });
});
afterEach(async () => { vi.restoreAllMocks(); configureChatRuntimeCallbacks({ isChatStreaming: null, onChatSaved: null }); await crypto._setTestSessionKey(null); localStorage.clear(); Object.assign(state, { currentProfile: original.profile, currentThreadId: original.thread, importedData: original.root, chatThreads: original.threads, chatHistory: original.history, currentChatPersonality: original.persona }); });
it('publishes only the saved selected name/icon with newer persona clocks, preserving history, preferences and unknown fields', async () => {
  const before = structuredClone(state.chatThreads), history = structuredClone(state.chatHistory), health = JSON.stringify(state.importedData), savedBody = localStorage.getItem(body), pref = localStorage.getItem(preference);
  const { metadata, saved } = await prepare(); expect(saved.isCurrent()).toBe(true); expect(JSON.stringify(saved)).not.toMatch(/PRIVATE_|isCurrent/);
  expect(await commitPersonaMetadataRefresh(metadata.leaseId, saved, { canCommit: () => true })).toEqual({ metadataSaved: true, refreshed: true });
  const rows = await storedThreads(); expect(rows[0]).toEqual({ ...before[0], personalityName: saved.name, personalityIcon: saved.icon, personalityUpdatedAt: rows[0]!.personalityUpdatedAt, updatedAt: rows[0]!.updatedAt }); expect(rows[1]).toEqual(before[1]); expect(Date.parse(String(rows[0]!.personalityUpdatedAt))).toBeGreaterThan(Date.parse('2100-01-01'));
  expect(localStorage.getItem(index)).toMatch(/^v1:/); expect(localStorage.getItem(preference)).toBe(pref); expect(localStorage.getItem(body)).toBe(savedBody); expect(state.chatHistory).toEqual(history); expect(JSON.stringify(state.importedData)).toBe(health); expect(ownsNativeChatThreadIndex(profile, state.chatThreads)).toBe(true);
  await expect(commitPersonaMetadataRefresh(metadata.leaseId, saved, { canCommit: () => true })).rejects.toThrow('expired');
});
it('does not rewrite an already correct index when only the private instructions changed', async () => {
  const { metadata, saved } = await prepare(target.name, target.icon), before = bytes();
  expect(await commitPersonaMetadataRefresh(metadata.leaseId, saved, { canCommit: () => true })).toEqual({ metadataSaved: false, refreshed: true }); expect(bytes()).toEqual(before);
});
it('merges a newer owned title/message save without restoring its obsolete index', async () => {
  const { metadata, saved } = await prepare(); state.chatThreads[0]!.name = 'Newer title'; state.chatThreads[0]!.messageCount = 2; state.chatThreads[0]!.messagesUpdatedAt = '2095-01-01';
  await saveNativeChatThreadIndex(profile, state.chatThreads, () => true); const before = await storedThreads();
  await commitPersonaMetadataRefresh(metadata.leaseId, saved, { canCommit: () => true }); const rows = await storedThreads();
  expect(rows[0]).toEqual({ ...before[0], personalityName: saved.name, personalityIcon: saved.icon, personalityUpdatedAt: rows[0]!.personalityUpdatedAt, updatedAt: rows[0]!.updatedAt }); expect(rows[1]).toEqual(before[1]);
});
it.each(['profile', 'thread', 'root', 'history', 'threads', 'selection', 'revision', 'preference', 'streaming', 'mode', 'key', 'permission'] as const)('rejects retired %s authority without altering its saved definition or metadata', async field => {
  const { metadata, saved } = await prepare();
  if (field === 'profile') state.currentProfile = 'other'; if (field === 'thread') state.currentThreadId = 'other'; if (field === 'root') state.importedData = structuredClone(state.importedData); if (field === 'history') state.chatHistory = [...state.chatHistory]; if (field === 'threads') state.chatThreads = [...state.chatThreads]; if (field === 'selection') state.currentChatPersonality = 'default'; if (field === 'revision') state.chatThreads[0]!.personalityUpdatedAt = '2200-01-01'; if (field === 'preference') localStorage.setItem(preference, 'newer-choice'); if (field === 'streaming') streaming = true; if (field === 'mode') localStorage.setItem('labcharts-encryption-enabled', 'false'); if (field === 'key') await crypto._setTestSessionKey('synthetic replacement key');
  const before = bytes(); await expect(commitPersonaMetadataRefresh(metadata.leaseId, saved, { canCommit: () => field !== 'permission' })).rejects.toThrow(); expect(bytes()).toEqual(before);
});
it('does not reuse a saved definition receipt after a newer private instruction edit', async () => {
  const { metadata, saved } = await prepare(); await crypto.encryptedSetItem(catalog, JSON.stringify([{ ...target, name: saved.name, icon: saved.icon, promptText: 'PRIVATE_FOREIGN_NEWER_PROMPT' }, other])); expect(saved.isCurrent()).toBe(false); const before = bytes();
  await expect(commitPersonaMetadataRefresh(metadata.leaseId, saved, { canCommit: () => true })).rejects.toThrow(); expect(bytes()).toEqual(before);
});
it('refuses a serialized saved receipt without its private current-publication proof', async () => {
  const { metadata, saved } = await prepare(), copy = JSON.parse(JSON.stringify(saved)) as typeof saved, before = bytes();
  await expect(commitPersonaMetadataRefresh(metadata.leaseId, copy, { canCommit: () => true })).rejects.toThrow(); expect(bytes()).toEqual(before);
});
it('keeps a foreign index rather than refreshing metadata from its retired native view', async () => {
  const { metadata, saved } = await prepare(); await crypto.encryptedSetItem(index, JSON.stringify([{ ...state.chatThreads[0], name: 'Foreign newer title' }, state.chatThreads[1]])); const before = bytes();
  await expect(commitPersonaMetadataRefresh(metadata.leaseId, saved, { canCommit: () => true })).rejects.toThrow(); expect(bytes()).toEqual(before);
});
it('retains a successfully saved definition after an index quota failure with exact index compensation', async () => {
  const { metadata, saved } = await prepare(), before = bytes(), set = Storage.prototype.setItem; let fail = true;
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key, value) { if (key === index && fail) { fail = false; throw new DOMException('Synthetic index quota', 'QuotaExceededError'); } return set.call(this, key, value); });
  await expect(commitPersonaMetadataRefresh(metadata.leaseId, saved, { canCommit: () => true })).rejects.toMatchObject({ noChangeApplied: true }); expect(bytes()).toEqual(before); expect(saved.isCurrent()).toBe(true);
});
it('preserves a preference changed during publication and compensates only its own index bytes', async () => {
  const { metadata, saved } = await prepare(), before = localStorage.getItem(index), set = Storage.prototype.setItem; let replace = true;
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key, value) { set.call(this, key, value); if (key === index && replace) { replace = false; set.call(this, preference, 'foreign-preference'); } });
  await expect(commitPersonaMetadataRefresh(metadata.leaseId, saved, { canCommit: () => true })).rejects.toMatchObject({ noChangeApplied: true }); expect(localStorage.getItem(index)).toBe(before); expect(localStorage.getItem(preference)).toBe('foreign-preference'); expect(saved.isCurrent()).toBe(true);
});
it('never compensates over a foreign replacement written during its index publication', async () => {
  const { metadata, saved } = await prepare(), foreign = (await crypto.prepareEncryptedLocalStorageValue(index, JSON.stringify([{ ...state.chatThreads[0], name: 'Foreign publication' }, state.chatThreads[1]]))).value, set = Storage.prototype.setItem; let replace = true;
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key, value) { set.call(this, key, value); if (key === index && replace) { replace = false; set.call(this, key, foreign); } });
  await expect(commitPersonaMetadataRefresh(metadata.leaseId, saved, { canCommit: () => true })).rejects.toThrow('unconfirmed'); expect(localStorage.getItem(index)).toBe(foreign); expect(saved.isCurrent()).toBe(true);
});
it('reports verified stored metadata separately when a frozen view cannot refresh', async () => {
  const { metadata, saved } = await prepare(); Object.freeze(state.chatThreads[0]);
  expect(await commitPersonaMetadataRefresh(metadata.leaseId, saved, { canCommit: () => true })).toEqual({ metadataSaved: true, refreshed: false }); expect((await storedThreads())[0]!.personalityName).toBe(saved.name); expect(ownsNativeChatThreadIndex(profile, state.chatThreads)).toBe(false);
});
it('expires a released review without a storage write', async () => {
  const { metadata, saved } = await prepare(), before = bytes(); releasePersonaMetadataRefresh(metadata.leaseId);
  await expect(commitPersonaMetadataRefresh(metadata.leaseId, saved, { canCommit: () => true })).rejects.toThrow('expired'); expect(bytes()).toEqual(before);
});
