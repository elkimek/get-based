// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { state } from '../js/state.js';
import * as crypto from '../js/crypto.js';
import * as storage from '../js/chat-personality-storage.js';
import { openCustomPersonaDeletionReview } from '../js/chat-personality-editing.js';
import { markNativeChatThreadIndexLoaded } from '../js/chat-thread-index-storage.js';
import { configureChatRuntimeCallbacks } from '../js/chat-runtime.js';
import { listPersonaSelectionUndoChoices } from '../js/chat-personality-selection.js';
import * as selectionOwner from '../js/chat-personality-selection.js';
import { installPersonaCommandTestLocks } from './helpers/persona-command-locks.js';
const original = { profile: state.currentProfile, thread: state.currentThreadId, root: state.importedData, threads: state.chatThreads, history: state.chatHistory, persona: state.currentChatPersonality };
const target = { id: 'custom_remove', name: '<b>Private reviewer</b>', icon: 'R', promptText: 'PRIVATE_REMOVED_INSTRUCTIONS', opaque: { keep: true } };
const other = { id: 'custom_retained', name: 'Retained reviewer', icon: 'O', promptText: 'PRIVATE_RETAINED_INSTRUCTIONS', opaque: { retained: true } };
let sequence = 0, profile: string, catalog: string, deleted: string, index: string, preference: string, body: string, streaming = false;
const bytes = () => [...Array(localStorage.length)].map((_, i) => localStorage.key(i)!).sort().map(key => [key, localStorage.getItem(key)]);
const records = async () => JSON.parse((await crypto.encryptedGetItem(catalog, { throwOnDecryptError: true }))!) as unknown[];
const click = (id: string) => document.getElementById(id)!.click();
beforeEach(async () => {
  installPersonaCommandTestLocks(); localStorage.clear(); document.body.replaceChildren(); const notifications = document.createElement('div'); notifications.id = 'notification-container'; document.body.append(notifications); streaming = false; profile = `persona-review-${++sequence}`;
  state.currentProfile = profile; state.currentThreadId = 'origin'; state.currentChatPersonality = target.id; state.importedData = structuredClone(original.root); state.importedData.contextNotes = 'PRIVATE_RETAINED_HEALTH';
  state.chatHistory = [{ role: 'assistant', content: 'Retained answer', personalityName: 'Original attribution', provider: 'original-provider', modelId: 'original-model' }];
  state.chatThreads = [{ id: 'origin', name: 'Retained title', personality: target.id, personalityName: target.name, personalityIcon: target.icon, personalityUpdatedAt: '2020-01-01', createdAt: '2020-01-01', updatedAt: '2020-01-01', messagesUpdatedAt: '2020-01-01', messageCount: 1, opaque: { keep: true } }, { id: 'retained', name: 'Other conversation', createdAt: '2020-01-01', updatedAt: '2020-01-01', messageCount: 0, opaque: ['keep'] }];
  (window as unknown as { __WEARABLES_TEST: boolean }).__WEARABLES_TEST = true; localStorage.setItem('labcharts-encryption-enabled', 'true'); await crypto._setTestSessionKey('synthetic native deletion review');
  catalog = storage.customPersonalityStorageKey(profile); deleted = storage.customPersonalityTombstoneStorageKey(profile); index = `labcharts-${profile}-chat-threads`; preference = `labcharts-${profile}-chatPersonality`; body = `labcharts-${profile}-chat-t_origin`;
  await crypto.encryptedSetItem(catalog, JSON.stringify([target, other])); await crypto.encryptedSetItem(deleted, JSON.stringify({ custom_previous: 100 })); await crypto.encryptedSetItem(index, JSON.stringify(state.chatThreads)); await crypto.encryptedSetItem(body, JSON.stringify(state.chatHistory)); localStorage.setItem(preference, target.id); markNativeChatThreadIndexLoaded(profile, state.chatThreads);
  configureChatRuntimeCallbacks({ isChatStreaming: () => streaming, onChatSaved: null });
});
afterEach(async () => { vi.restoreAllMocks(); configureChatRuntimeCallbacks({ isChatStreaming: null, onChatSaved: null }); await crypto._setTestSessionKey(null); document.body.replaceChildren(); localStorage.clear(); Object.assign(state, { currentProfile: original.profile, currentThreadId: original.thread, importedData: original.root, chatThreads: original.threads, chatHistory: original.history, currentChatPersonality: original.persona }); });
it('opens an escaped native confirmation without saving, and cancellation releases deletion authority', async () => {
  const capture = vi.spyOn(storage, 'captureCustomPersonalityDeletion'), before = bytes(), review = await openCustomPersonaDeletionReview(target.id);
  expect(review.opened).toBe(true); expect(bytes()).toEqual(before); expect(document.querySelector('#confirm-dialog-overlay')!.textContent).toContain(target.name); expect(document.querySelector('#confirm-dialog-overlay b')).toBeNull();
  const lease = await capture.mock.results[0]!.value; click('confirm-cancel'); expect(await review.completion).toEqual({ status: 'cancelled', selection: 'unchanged' });
  await expect(storage.commitCustomPersonalityDeletion(lease.leaseId, { canCommit: () => true })).rejects.toThrow('expired'); expect(bytes()).toEqual(before);
});
it('deletes only the confirmed persona and saves the selected fallback through the native revision owner', async () => {
  const history = structuredClone(state.chatHistory), health = JSON.stringify(state.importedData), before = structuredClone(state.chatThreads), savedBody = localStorage.getItem(body);
  const review = await openCustomPersonaDeletionReview(target.id); click('confirm-ok'); expect(await review.completion).toEqual({ status: 'deleted', selection: 'default' });
  expect(await records()).toEqual([other]); const tombstones = JSON.parse((await crypto.encryptedGetItem(deleted))!); expect(tombstones.custom_previous).toBe(100); expect(tombstones[target.id]).toBeGreaterThan(0);
  const rows = JSON.parse((await crypto.encryptedGetItem(index))!); expect(rows[0]).toEqual({ ...before[0], personality: 'default', personalityName: rows[0].personalityName, personalityIcon: rows[0].personalityIcon, personalityUpdatedAt: rows[0].personalityUpdatedAt, updatedAt: rows[0].updatedAt }); expect(rows[1]).toEqual(before[1]); expect(Date.parse(rows[0].personalityUpdatedAt)).toBeGreaterThan(Date.parse('2020-01-01'));
  expect(state.currentChatPersonality).toBe('default'); expect(localStorage.getItem(preference)).toBe('default'); expect(localStorage.getItem(index)).toMatch(/^v1:/); expect(localStorage.getItem(body)).toBe(savedBody); expect(state.chatHistory).toEqual(history); expect(JSON.stringify(state.importedData)).toBe(health); expect(listPersonaSelectionUndoChoices()).toEqual([]);
});
it('preserves the saved selection and index when deleting a different persona', async () => {
  state.currentChatPersonality = 'default'; state.chatThreads[0]!.personality = 'default'; localStorage.setItem(preference, 'default'); await crypto.encryptedSetItem(index, JSON.stringify(state.chatThreads)); markNativeChatThreadIndexLoaded(profile, state.chatThreads); const before = [localStorage.getItem(index), localStorage.getItem(preference)];
  const review = await openCustomPersonaDeletionReview(target.id); click('confirm-ok'); expect(await review.completion).toEqual({ status: 'deleted', selection: 'unchanged' }); expect(await records()).toEqual([other]); expect([localStorage.getItem(index), localStorage.getItem(preference)]).toEqual(before);
});
it.each(['profile', 'thread', 'root', 'history', 'streaming', 'confirmation'] as const)('retires %s authority before any deletion', async field => {
  const review = await openCustomPersonaDeletionReview(target.id), before = bytes(), button = document.getElementById('confirm-ok')!;
  if (field === 'profile') state.currentProfile = 'other'; if (field === 'thread') state.currentThreadId = 'other'; if (field === 'root') state.importedData = structuredClone(state.importedData); if (field === 'history') state.chatHistory = [...state.chatHistory]; if (field === 'streaming') streaming = true;
  if (field === 'confirmation') document.getElementById('confirm-dialog-overlay')!.replaceChildren(document.createElement('button'));
  button.click(); expect(await review.completion).toEqual({ status: 'conflict', selection: 'unchanged' }); expect(bytes()).toEqual(before);
});
it('retains a newer saved persona instead of approving a stale native confirmation', async () => {
  const review = await openCustomPersonaDeletionReview(target.id); await crypto.encryptedSetItem(catalog, JSON.stringify([{ ...target, promptText: 'PRIVATE_NEWER_INSTRUCTIONS' }, other])); const before = bytes(); click('confirm-ok'); expect((await review.completion).status).toBe('failed'); expect(bytes()).toEqual(before);
});
it('leaves all original bytes intact when the protection key is retired before confirmation', async () => {
  const review = await openCustomPersonaDeletionReview(target.id), before = bytes(); await crypto._setTestSessionKey(null); click('confirm-ok'); expect((await review.completion).status).toBe('failed'); expect(bytes()).toEqual(before);
});
it.each(['preference', 'index', 'index-quota'] as const)('reports deletion separately and preserves a newer or unwritable %s', async field => {
  const review = await openCustomPersonaDeletionReview(target.id);
  if (field === 'preference') localStorage.setItem(preference, 'foreign-selection');
  if (field === 'index') await crypto.encryptedSetItem(index, JSON.stringify([{ ...state.chatThreads[0], name: 'Foreign newer title' }, state.chatThreads[1]]));
  const before = [localStorage.getItem(index), localStorage.getItem(preference)], savedBody = localStorage.getItem(body);
  if (field === 'index-quota') { const set = Storage.prototype.setItem; let fail = true; vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key, value) { if (key === index && fail) { fail = false; throw new DOMException('Synthetic quota', 'QuotaExceededError'); } return set.call(this, key, value); }); }
  click('confirm-ok'); expect(await review.completion).toEqual({ status: 'deleted', selection: 'unchanged' }); expect(await records()).toEqual([other]); expect([localStorage.getItem(index), localStorage.getItem(preference)]).toEqual(before); expect(localStorage.getItem(body)).toBe(savedBody); expect(document.getElementById('notification-container')!.textContent).toContain('Persona deleted. Choose a chat persona');
});
it('keeps a committed deletion truthful when the sync notification fails', async () => {
  configureChatRuntimeCallbacks({ onChatSaved: () => { throw new Error('Synthetic notification failure'); } });
  const review = await openCustomPersonaDeletionReview(target.id); click('confirm-ok'); expect(await review.completion).toEqual({ status: 'deleted', selection: 'default' }); expect(await records()).toEqual([other]); expect(localStorage.getItem(preference)).toBe('default');
});
it('reports an unknown fallback failure as unconfirmed instead of claiming no change', async () => {
  vi.spyOn(selectionOwner, 'commitPersonaSelection').mockRejectedValueOnce('Synthetic unknown outcome'); const before = [localStorage.getItem(index), localStorage.getItem(preference)];
  const review = await openCustomPersonaDeletionReview(target.id); click('confirm-ok'); expect(await review.completion).toEqual({ status: 'deleted', selection: 'unconfirmed' }); expect(await records()).toEqual([other]); expect([localStorage.getItem(index), localStorage.getItem(preference)]).toEqual(before);
});
