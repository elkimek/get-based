// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { state } from '../js/state.js';
import { CHAT_PERSONALITIES } from '../js/constants.js';
import * as crypto from '../js/crypto.js';
import { configureChatRuntimeCallbacks } from '../js/chat-runtime.js';
import { capturePersonaSelection, commitPersonaSelection, capturePersonaRestoration, isPersonaSelectionEffectCurrent } from '../js/chat-personality-selection.js';
import { chatThreadIndexStorageKey, markNativeChatThreadIndexLoaded, ownsNativeChatThreadIndex, saveNativeChatThreadIndex, withChatThreadIndexLock } from '../js/chat-thread-index-storage.js';
import { installPersonaCommandTestLocks } from './helpers/persona-command-locks.js';
import { loadChatThreads } from '../js/chat-threads.js';
import { getCustomPersonalityText } from '../js/chat-personality-models.js';
const original = { profile: state.currentProfile, thread: state.currentThreadId, history: state.chatHistory, threads: state.chatThreads, root: state.importedData, persona: state.currentChatPersonality };
const first = CHAT_PERSONALITIES[0]!, second = CHAT_PERSONALITIES[1]!;
let profile: string, index: string, preference: string, sequence = 0, streaming = false;
const records = async () => JSON.parse((await crypto.encryptedGetItem(index, { throwOnDecryptError: true }))!) as Array<Record<string, unknown>>;
const bytes = () => [localStorage.getItem(index), localStorage.getItem(preference)];
const apply = (id: string, current: () => boolean = () => true) => commitPersonaSelection(id, { canCommit: current });
beforeEach(async () => {
  installPersonaCommandTestLocks(); localStorage.clear(); streaming = false; profile = `persona-select-${++sequence}`;
  state.currentProfile = profile; state.currentThreadId = 'current'; state.currentChatPersonality = first.id; state.importedData = structuredClone(original.root);
  state.chatHistory = [{ role: 'assistant', content: 'PRIVATE_OLD_ANSWER', personalityName: first.name, provider: 'fixture', modelId: 'original-model' }];
  state.chatThreads = [{ id: 'current', name: 'Private thread name', createdAt: '2020-01-01', updatedAt: '2090-01-01', messagesUpdatedAt: '2020-01-02', messageCount: 1, personality: first.id, personalityName: first.name, personalityIcon: first.icon, future: { keep: true } }, { id: 'unrelated', name: 'Other', createdAt: '2020-01-01', updatedAt: '2020-01-01', messageCount: 1, opaque: ['PRIVATE_OTHER_THREAD'] }];
  (window as unknown as { __WEARABLES_TEST: boolean }).__WEARABLES_TEST = true;
  localStorage.setItem('labcharts-encryption-enabled', 'true'); await crypto._setTestSessionKey('synthetic native persona selection');
  index = chatThreadIndexStorageKey(profile); preference = `labcharts-${profile}-chatPersonality`;
  await crypto.encryptedSetItem(index, JSON.stringify(state.chatThreads)); localStorage.setItem(preference, first.id); markNativeChatThreadIndexLoaded(profile, state.chatThreads);
  await crypto.encryptedSetItem(`labcharts-${profile}-chat-t_current`, JSON.stringify(state.chatHistory));
  await crypto.encryptedSetItem(`labcharts-${profile}-chatPersonalityCustom`, JSON.stringify([{ id: 'custom_exact', name: 'Custom reviewer', icon: 'C', promptText: 'PRIVATE_PERSONA_PROMPT', unknown: 'PRIVATE_OPAQUE' }]));
  configureChatRuntimeCallbacks({ isChatStreaming: () => streaming, onChatSaved: null });
});
afterEach(async () => { vi.restoreAllMocks(); vi.unstubAllGlobals(); configureChatRuntimeCallbacks({ isChatStreaming: null, onChatSaved: null }); await crypto._setTestSessionKey(null); localStorage.clear(); Object.assign(state, { currentProfile: original.profile, currentThreadId: original.thread, importedData: original.root, chatHistory: original.history, chatThreads: original.threads, currentChatPersonality: original.persona }); });
it('saves only native persona metadata and preference, retaining messages, timestamps and unrelated fields', async () => {
  const before = await records(), body = localStorage.getItem(`labcharts-${profile}-chat-t_current`), history = structuredClone(state.chatHistory), health = JSON.stringify(state.importedData);
  const command = await capturePersonaSelection(second.id); expect(JSON.stringify(command)).not.toMatch(/PRIVATE_|promptText|future|messageCount/); const receipt = await apply(command.leaseId);
  expect(receipt).toMatchObject({ settingsSaved: true, refreshed: true, after: { id: second.id } }); expect(receipt.undoId).toBe(command.leaseId);
  const after = await records(); expect(after[0]).toEqual({ ...before[0], personality: second.id, personalityName: second.name, personalityIcon: second.icon, updatedAt: after[0]!.updatedAt, personalityUpdatedAt: after[0]!.personalityUpdatedAt }); expect(Date.parse(String(after[0]!.updatedAt))).toBeGreaterThan(Date.parse('2090-01-01')); expect(after[1]).toEqual(before[1]);
  expect(localStorage.getItem(index)).toMatch(/^v1:/); expect(localStorage.getItem(preference)).toBe(second.id); expect(localStorage.getItem(`labcharts-${profile}-chat-t_current`)).toBe(body); expect(state.chatHistory).toEqual(history); expect(JSON.stringify(state.importedData)).toBe(health); expect(isPersonaSelectionEffectCurrent(command.leaseId)).toBe(true);
  await expect(apply(command.leaseId)).rejects.toThrow('expired');
});
it('restores exact previous field presence and preference through a fresh guarded Undo', async () => {
  delete state.chatThreads[0]!.personalityName; delete state.chatThreads[0]!.personalityIcon; localStorage.removeItem(preference);
  await crypto.encryptedSetItem(index, JSON.stringify(state.chatThreads)); markNativeChatThreadIndexLoaded(profile, state.chatThreads);
  const command = await capturePersonaSelection(second.id); await apply(command.leaseId); const stamp = state.chatThreads[0]!.personalityUpdatedAt;
  const restore = await capturePersonaRestoration(command.leaseId); expect(await apply(restore.leaseId)).toMatchObject({ settingsSaved: true, undoId: null });
  const current = (await records())[0]!; expect(current.personality).toBe(first.id); expect(current).not.toHaveProperty('personalityName'); expect(current).not.toHaveProperty('personalityIcon'); expect(current.personalityUpdatedAt).not.toBe(stamp); expect(localStorage.getItem(preference)).toBeNull(); expect(isPersonaSelectionEffectCurrent(command.leaseId)).toBe(false);
  await expect(capturePersonaRestoration(command.leaseId)).rejects.toThrow('expired');
});
it('treats an already current selection as a true no-op', async () => { const before = bytes(), command = await capturePersonaSelection(first.id); expect(await apply(command.leaseId)).toMatchObject({ settingsSaved: false, undoId: null }); expect(bytes()).toEqual(before); });
it('uses exact stored custom metadata and refuses an unaccepted hosted persona', async () => {
  await expect(capturePersonaSelection('custom_missing')).rejects.toThrow('exact available'); await expect(capturePersonaSelection('custom_exact', { locationLike: { hostname: 'getbased.health' } })).rejects.toThrow('agreement');
  const command = await capturePersonaSelection('custom_exact'); expect(command.proposed).toEqual({ id: 'custom_exact', name: 'Custom reviewer', icon: 'C' }); await apply(command.leaseId); expect(state.currentChatPersonality).toBe('custom_exact');
});
it.each(['custom_missing', 'custom_deleted', 'custom', 'default'] as const)('never substitutes another private persona prompt for %s', selection => {
  state.currentChatPersonality = selection; expect(getCustomPersonalityText()).toBe('');
});
it('uses only the explicitly selected usable custom persona prompt', async () => {
  const command = await capturePersonaSelection('custom_exact'); await apply(command.leaseId); expect(getCustomPersonalityText()).toBe('PRIVATE_PERSONA_PROMPT');
});
it.each(['profile', 'thread', 'root', 'history', 'threads', 'preference', 'permission', 'streaming', 'key', 'mode', 'definition'] as const)('rejects retired %s authority before writing', async field => {
  const command = await capturePersonaSelection(second.id);
  if (field === 'profile') state.currentProfile = 'other'; if (field === 'thread') state.currentThreadId = 'other'; if (field === 'root') state.importedData = structuredClone(state.importedData); if (field === 'history') state.chatHistory = [...state.chatHistory]; if (field === 'threads') state.chatThreads = [...state.chatThreads]; if (field === 'preference') localStorage.setItem(preference, 'other'); if (field === 'streaming') streaming = true; if (field === 'key') await crypto._setTestSessionKey(null); if (field === 'mode') localStorage.setItem('labcharts-encryption-enabled', 'false'); if (field === 'definition') await crypto.encryptedSetItem(`labcharts-${profile}-chatPersonalityCustom`, '[]');
  const before = bytes(); await expect(apply(command.leaseId, () => field !== 'permission')).rejects.toMatchObject({ noChangeApplied: true }); expect(bytes()).toEqual(before);
});
it.each(['index', 'preference'] as const)('compensates an injected %s quota failure with exact encrypted bytes and unchanged live selection', async key => {
  const command = await capturePersonaSelection(second.id), before = bytes(), memory = structuredClone(state.chatThreads); const set = Storage.prototype.setItem; let fail = true;
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, name, value) { if (name === (key === 'index' ? index : preference) && fail) { fail = false; throw new DOMException('Synthetic quota', 'QuotaExceededError'); } return set.call(this, name, value); });
  await expect(apply(command.leaseId)).rejects.toMatchObject({ noChangeApplied: true }); expect(bytes()).toEqual(before); expect(state.chatThreads).toEqual(memory); expect(state.currentChatPersonality).toBe(first.id);
});
it('leaves a newer foreign replacement intact and reports an unconfirmed outcome', async () => {
  const command = await capturePersonaSelection(second.id), set = Storage.prototype.setItem; const replacement = 'PRIVATE_FOREIGN_INDEX'; let fail = true;
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, name, value) { if (name === preference && fail) { fail = false; set.call(this, index, replacement); throw new DOMException('Synthetic replacement'); } return set.call(this, name, value); });
  await expect(apply(command.leaseId)).rejects.toThrow('unconfirmed'); expect(localStorage.getItem(index)).toBe(replacement); expect(state.currentChatPersonality).toBe(first.id);
});
it('retains unrelated native edits and serializes an index save queued behind the persona command', async () => {
  const command = await capturePersonaSelection(second.id), prepare = crypto.prepareEncryptedLocalStorageValue;
  let release!: () => void, entered!: () => void; const barrier = new Promise<void>(resolve => { release = resolve; }), started = new Promise<void>(resolve => { entered = resolve; }); let blocked = false;
  vi.spyOn(crypto, 'prepareEncryptedLocalStorageValue').mockImplementation(async (key, value) => { const prepared = await prepare(key, value); if (key === index && value !== '' && !blocked) { blocked = true; entered(); await barrier; } return prepared; });
  const saving = apply(command.leaseId); await started;
  state.chatThreads[1]!.name = 'Newer unrelated title'; const queued = saveNativeChatThreadIndex(profile, state.chatThreads, () => true); release(); await saving; await queued;
  const after = await records(); expect(after[0]!.personality).toBe(second.id); expect(after[1]!.name).toBe('Newer unrelated title'); expect(ownsNativeChatThreadIndex(profile, state.chatThreads)).toBe(true);
});
it('preserves a newer saved reply and unrelated metadata recorded after the selection was prepared', async () => {
  const command = await capturePersonaSelection(second.id); state.chatThreads[0]!.messageCount = 2; state.chatThreads[0]!.messagesUpdatedAt = '2091-01-01'; state.chatThreads[1]!.name = 'New title'; await saveNativeChatThreadIndex(profile, state.chatThreads, () => true);
  await apply(command.leaseId); const after = await records(); expect(after[0]).toMatchObject({ messageCount: 2, messagesUpdatedAt: '2091-01-01', personality: second.id }); expect(after[1]!.name).toBe('New title');
});
it('blocks stale native writes after a foreign publication until a native load establishes a new owner', async () => {
  const foreign = [...state.chatThreads, { ...state.chatThreads[1]!, id: 'foreign', name: 'Foreign retained thread' }]; await crypto.encryptedSetItem(index, JSON.stringify(foreign)); const before = bytes();
  await expect(saveNativeChatThreadIndex(profile, state.chatThreads, () => true)).rejects.toMatchObject({ noChangeApplied: true }); await expect(capturePersonaSelection(second.id)).rejects.toThrow('Reload'); expect(bytes()).toEqual(before);
});
it('keeps an unchanged native index read from retiring the current objects or their admitted selection lease', async () => {
  const threads = state.chatThreads, command = await capturePersonaSelection(second.id);
  state.chatThreads[1]!.name = 'Unsent native metadata edit';
  expect(await loadChatThreads()).toBe(true); expect(state.chatThreads).toBe(threads); expect(state.chatThreads[1]!.name).toBe('Unsent native metadata edit');
  await apply(command.leaseId); await saveNativeChatThreadIndex(profile, state.chatThreads, () => true); expect((await records())[1]!.name).toBe('Unsent native metadata edit');
});
it('preserves a newly created owned conversation when a repeated empty-store load arrives before its first save', async () => {
  localStorage.removeItem(index); state.chatThreads = []; markNativeChatThreadIndexLoaded(profile, state.chatThreads, null);
  state.chatThreads.push({ id: 'current', name: 'Unsaved new conversation', createdAt: '2020-01-01', updatedAt: '2020-01-01', messageCount: 0 }); const threads = state.chatThreads;
  expect(await loadChatThreads()).toBe(true); expect(state.chatThreads).toBe(threads); expect(state.chatThreads).toHaveLength(1);
  await saveNativeChatThreadIndex(profile, threads, () => true); expect((await records())[0]!.name).toBe('Unsaved new conversation');
});
it('still migrates a newly restored legacy conversation when the known empty index has no local drafts', async () => {
  localStorage.removeItem(index); state.chatThreads = []; markNativeChatThreadIndexLoaded(profile, state.chatThreads, null);
  const legacy = JSON.stringify([{ role: 'assistant', content: 'Retained legacy message' }]); localStorage.setItem(`labcharts-${profile}-chat`, legacy);
  expect(await loadChatThreads()).toBe(true); expect(state.chatThreads[0]?.id).toBe('t_migrated'); expect((await records())[0]?.id).toBe('t_migrated'); expect(localStorage.getItem(`labcharts-${profile}-chat`)).toBe(legacy);
});
it('does not re-enable an old lease after selecting away and back', async () => {
  const stale = await capturePersonaSelection(second.id), forward = await capturePersonaSelection(second.id); await apply(forward.leaseId); await apply((await capturePersonaRestoration(forward.leaseId)).leaseId);
  await expect(apply(stale.leaseId)).rejects.toMatchObject({ noChangeApplied: true });
});
it('preserves a verified save when optional sync notification fails', async () => {
  configureChatRuntimeCallbacks({ onChatSaved: () => { throw new Error('Synthetic notification failure'); } }); const command = await capturePersonaSelection(second.id); expect(await apply(command.leaseId)).toMatchObject({ settingsSaved: true }); expect((await records())[0]!.personality).toBe(second.id);
});
it('notifies the chat metadata owner without claiming that the saved custom-persona catalog changed', async () => {
  const saved = vi.fn(); configureChatRuntimeCallbacks({ onChatSaved: saved }); const command = await capturePersonaSelection(second.id); await apply(command.leaseId);
  expect(saved).toHaveBeenCalledExactlyOnceWith({ customPersonality: false, profileId: profile });
});
it('requires native Web Locks for command publication', async () => { vi.stubGlobal('navigator', {}); await expect(capturePersonaSelection(second.id)).rejects.toThrow('Web Locks'); });
it('runs a single admitted native write while another index owner holds its lock', async () => {
  let release!: () => void, entered!: () => void; const barrier = new Promise<void>(resolve => { release = resolve; }), started = new Promise<void>(resolve => { entered = resolve; });
  const holding = withChatThreadIndexLock(profile, async () => { entered(); await barrier; }); await started; let completed = false;
  const saving = saveNativeChatThreadIndex(profile, state.chatThreads, () => true).then(() => { completed = true; }); await Promise.resolve(); expect(completed).toBe(false); release(); await holding; await saving; expect(completed).toBe(true);
});
it('advances a selected persona revision beyond an independently newer persona clock', async () => {
  state.chatThreads[0]!.personalityUpdatedAt = '2200-01-01'; await crypto.encryptedSetItem(index, JSON.stringify(state.chatThreads)); markNativeChatThreadIndexLoaded(profile, state.chatThreads);
  const command = await capturePersonaSelection(second.id); await apply(command.leaseId);
  expect(Date.parse(String((await records())[0]!.personalityUpdatedAt))).toBeGreaterThan(Date.parse('2200-01-01'));
});

it('repairs stale labels when explicitly reselecting the current persona without an obsolete label Undo', async () => {
  state.chatThreads[0]!.personalityName = 'Old label'; state.chatThreads[0]!.personalityIcon = 'Old icon'; await crypto.encryptedSetItem(index, JSON.stringify(state.chatThreads)); markNativeChatThreadIndexLoaded(profile, state.chatThreads);
  const command = await capturePersonaSelection(first.id); expect(await apply(command.leaseId)).toMatchObject({ settingsSaved: true, refreshed: true, undoId: null });
  expect((await records())[0]).toMatchObject({ personality: first.id, personalityName: first.name, personalityIcon: first.icon });
});
it('repairs absent labels on an explicitly reselected persona while preserving old messages', async () => {
  delete state.chatThreads[0]!.personalityName; delete state.chatThreads[0]!.personalityIcon; await crypto.encryptedSetItem(index, JSON.stringify(state.chatThreads)); markNativeChatThreadIndexLoaded(profile, state.chatThreads); const body = localStorage.getItem(`labcharts-${profile}-chat-t_current`);
  const command = await capturePersonaSelection(first.id); await apply(command.leaseId); expect((await records())[0]).toMatchObject({ personalityName: first.name, personalityIcon: first.icon }); expect(localStorage.getItem(`labcharts-${profile}-chat-t_current`)).toBe(body);
});
