// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn(), index: vi.fn(), render: vi.fn(), list: vi.fn(), notify: vi.fn(), confirm: vi.fn() }));
vi.mock('../js/crypto.js', () => ({ encryptedGetItem: m.get, encryptedSetItem: m.set }));
vi.mock('../js/data.js', () => ({ saveImportedData: vi.fn() }));
vi.mock('../js/data-merge.js', () => ({ deleteImportedArrayItems: vi.fn() }));
vi.mock('../js/utils.js', () => ({ showConfirmDialog: m.confirm, showNotification: m.notify }));
vi.mock('../js/chat-threads.js', async () => {
  const { state } = await import('../js/state.js');
  return { getChatThreadKey: id => `${state.currentProfile}:${id}`, invalidateThreadContentCache: vi.fn(), renderThreadList: m.list, saveChatThreadIndex: m.index };
});
vi.mock('../js/chat-summaries.js', () => ({ renderSavedSummaries: vi.fn() }));
vi.mock('../js/chat-personalities.js', () => ({ getActivePersonality: () => ({ name: 'Helper', icon: 'H' }), updateChatHeaderTitle: vi.fn() }));
vi.mock('../js/chat-runtime.js', () => ({ renderChatMessagesRuntime: m.render, updateDiscussButtonRuntime: vi.fn() }));
import { state } from '../js/state.js';
import { loadChatHistory, saveChatHistory, canSaveChatHistory, clearChatHistory } from '../js/chat-history.js';
function deferred() { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; }
let counter = 0;
beforeEach(() => {
  vi.clearAllMocks(); localStorage.clear();
  state.currentProfile = `profile-${++counter}`; state.currentThreadId = 'thread';
  state.chatHistory = [{ role: 'user', content: 'Hello' }];
  state.chatThreads = [{ id: 'thread', name: 'Chat', messageCount: 1, updatedAt: 'old', messagesUpdatedAt: 'old' }];
  state.importedData = {}; state.currentChatPersonality = 'default';
  m.get.mockResolvedValue('[]'); m.set.mockResolvedValue(undefined); m.index.mockResolvedValue(true); m.confirm.mockResolvedValue(true);
});
it('returns false without writing when no conversation is selected', async () => {
  state.currentThreadId = null; expect(await saveChatHistory()).toBe(false); expect(m.set).not.toHaveBeenCalled();
});
it('reports index write failure after persisting messages', async () => {
  m.index.mockResolvedValue(false); expect(await saveChatHistory()).toBe(false); expect(m.set).toHaveBeenCalledOnce();
});
it('indexes only the message snapshot actually persisted', async () => {
  const gate = deferred(); m.set.mockReturnValueOnce(gate.promise);
  const saving = saveChatHistory(); await vi.waitFor(() => expect(m.set).toHaveBeenCalled());
  state.chatHistory.push({ role: 'assistant', content: 'Later' }); gate.resolve(); await saving;
  expect(JSON.parse(m.set.mock.calls[0][1])).toHaveLength(1); expect(state.chatThreads[0].messageCount).toBe(1);
});
it.each(['profile', 'thread', 'history'])('does not update destination metadata after a %s change during writing', async scope => {
  const gate = deferred(); m.set.mockReturnValueOnce(gate.promise); const key = `${state.currentProfile}:thread`;
  const saving = saveChatHistory(); await vi.waitFor(() => expect(m.set).toHaveBeenCalled());
  if (scope === 'profile') state.currentProfile = 'destination';
  if (scope === 'thread') state.currentThreadId = 'destination';
  if (scope === 'history') state.chatHistory = [];
  gate.resolve(); expect(await saving).toBe(false); expect(m.set.mock.calls[0][0]).toBe(key); expect(m.index).not.toHaveBeenCalled();
});
it.each(['profile', 'thread'])('does not render a different %s after index persistence', async scope => {
  const gate = deferred(); m.index.mockReturnValueOnce(gate.promise);
  const saving = saveChatHistory(); await vi.waitFor(() => expect(m.index).toHaveBeenCalled());
  if (scope === 'profile') state.currentProfile = 'destination'; else state.currentThreadId = 'destination';
  gate.resolve(true); expect(await saving).toBe(false); expect(m.list).not.toHaveBeenCalled();
});
it.each(['bad JSON', '{}', 'null'])('blocks overwriting unreadable history: %s', async raw => {
  const key = `${state.currentProfile}:thread`; localStorage.setItem(key, 'stored'); m.get.mockResolvedValue(raw);
  expect(await loadChatHistory()).toBe(false); expect(canSaveChatHistory()).toBe(false); expect(await saveChatHistory()).toBe(false);
  expect(m.set).not.toHaveBeenCalled(); expect(m.notify).toHaveBeenCalledOnce();
});
it('blocks a missing history that still has indexed messages', async () => {
  expect(await loadChatHistory()).toBe(false); expect(await saveChatHistory()).toBe(false); expect(m.set).not.toHaveBeenCalled();
});
it('unblocks writes after a successful reload', async () => {
  const key = `${state.currentProfile}:thread`; localStorage.setItem(key, 'stored'); m.get.mockRejectedValueOnce(new Error('locked'));
  expect(await loadChatHistory()).toBe(false); m.get.mockResolvedValue('[{"role":"user","content":"Recovered"}]');
  expect(await loadChatHistory()).toBe(true); expect(canSaveChatHistory()).toBe(true); expect(state.chatHistory[0].content).toBe('Recovered');
});
it.each(['resolve', 'reject'])('ignores a stale history load that later %ss', async outcome => {
  const key = `${state.currentProfile}:thread`; localStorage.setItem(key, 'stored'); const gate = deferred(); m.get.mockReturnValueOnce(gate.promise);
  const loading = loadChatHistory(); state.currentThreadId = 'other'; const destination = [{ role: 'user', content: 'Destination' }]; state.chatHistory = destination;
  if (outcome === 'resolve') gate.resolve('[{"role":"user","content":"Old"}]'); else gate.reject(new Error('old failure'));
  expect(await loading).toBe(false); expect(state.chatHistory).toBe(destination); expect(m.render).not.toHaveBeenCalled(); expect(m.notify).not.toHaveBeenCalled();
});
it('does not clear a conversation after navigating during confirmation', async () => {
  const gate = deferred(); m.confirm.mockReturnValueOnce(gate.promise); const clearing = clearChatHistory();
  state.currentThreadId = 'other'; gate.resolve(true); expect(await clearing).toBe(false); expect(m.index).not.toHaveBeenCalled();
});
it('rolls back a clear when the index cannot be saved', async () => {
  const history = state.chatHistory; const thread = { ...state.chatThreads[0] }; m.index.mockResolvedValue(false);
  expect(await clearChatHistory()).toBe(false); expect(state.chatHistory).toBe(history); expect(state.chatThreads[0]).toEqual(thread);
});
it('serializes overlapping writes so an older encryption result cannot overwrite newer messages', async () => {
  const gate = deferred(); let durable = '';
  m.set.mockImplementationOnce(async (_key, value) => { await gate.promise; durable = value; })
    .mockImplementation(async (_key, value) => { durable = value; });
  const first = saveChatHistory(); await vi.waitFor(() => expect(m.set).toHaveBeenCalledOnce());
  state.chatHistory.push({ role: 'assistant', content: 'New reply' }); const second = saveChatHistory();
  await Promise.resolve(); await Promise.resolve();
  expect(m.set).toHaveBeenCalledOnce(); gate.resolve(); await Promise.all([first, second]);
  expect(JSON.parse(durable)).toHaveLength(2); expect(state.chatThreads[0].messageCount).toBe(2);
});
it.each(['read', 'write', 'index'])('reports a %s exception as a failed save and allows a later retry', async phase => {
  const dependency = phase === 'read' ? m.get : phase === 'write' ? m.set : m.index;
  dependency.mockRejectedValueOnce(new Error('storage unavailable'));
  expect(await saveChatHistory()).toBe(false); expect(await saveChatHistory()).toBe(true);
});
it('blocks saving when the raw storage read itself throws', async () => {
  const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementationOnce(() => { throw new Error('denied'); });
  try { expect(await loadChatHistory()).toBe(false); expect(canSaveChatHistory()).toBe(false); }
  finally { spy.mockRestore(); }
});
it('keeps the captured personality when it changes during encryption', async () => {
  const gate = deferred(); m.set.mockReturnValueOnce(gate.promise); const saving = saveChatHistory();
  await vi.waitFor(() => expect(m.set).toHaveBeenCalled()); state.currentChatPersonality = 'new'; gate.resolve(); await saving;
  expect(state.chatThreads[0].personality).toBe('default');
});
it('does not change message timestamps when saving an identical history', async () => {
  m.get.mockResolvedValue(JSON.stringify(state.chatHistory)); expect(await saveChatHistory()).toBe(true);
  expect(state.chatThreads[0].messagesUpdatedAt).toBe('old');
});
it('waits for a pending write before clearing so it cannot resurrect the cleared conversation', async () => {
  const key = `${state.currentProfile}:thread`; const gate = deferred();
  m.set.mockImplementationOnce(async (_key, value) => { await gate.promise; localStorage.setItem(key, value); });
  const saving = saveChatHistory(); await vi.waitFor(() => expect(m.set).toHaveBeenCalled());
  const clearing = clearChatHistory(); await Promise.resolve(); gate.resolve(); await Promise.all([saving, clearing]);
  expect(localStorage.getItem(key)).toBeNull(); expect(state.chatHistory).toEqual([]);
});
it('rolls back a clear when the index save throws', async () => {
  const original = state.chatHistory; m.index.mockRejectedValueOnce(new Error('index failure'));
  expect(await clearChatHistory()).toBe(false); expect(state.chatHistory).toBe(original); expect(state.chatThreads[0].messageCount).toBe(1);
});
it('loads an empty new conversation without blocking later saves', async () => {
  state.chatThreads[0].messageCount = 0; expect(await loadChatHistory()).toBe(true); expect(state.chatHistory).toEqual([]); expect(await saveChatHistory()).toBe(true);
});
it('loads the threadless state as an empty conversation', async () => {
  state.currentThreadId = null; expect(await loadChatHistory()).toBe(true); expect(state.chatHistory).toEqual([]); expect(m.get).not.toHaveBeenCalled();
});
it('leaves storage and metadata untouched when clearing is declined', async () => {
  m.confirm.mockResolvedValue(false); expect(await clearChatHistory()).toBe(false); expect(state.chatHistory).toHaveLength(1); expect(m.index).not.toHaveBeenCalled();
});
it('clears persisted history and summary metadata after index persistence', async () => {
  const key = `${state.currentProfile}:thread`; localStorage.setItem(key, 'messages'); state.chatThreads[0].summary = 'Summary';
  state.importedData.chatSummaries = [{ threadId: 'thread', text: 'Summary' }];
  expect(await clearChatHistory()).toBe(true); expect(localStorage.getItem(key)).toBeNull(); expect(state.chatThreads[0].summary).toBeUndefined(); expect(state.chatThreads[0].messageCount).toBe(0);
});
it.each(['missing-index', 'threadless'])('clears a %s in-memory conversation', async mode => {
  if (mode === 'missing-index') state.chatThreads = []; else state.currentThreadId = null;
  expect(await clearChatHistory()).toBe(true); expect(state.chatHistory).toEqual([]);
});
it('prevents duplicate clear and new saves while a clear is pending', async () => {
  const gate = deferred(); m.index.mockReturnValueOnce(gate.promise); const clearing = clearChatHistory();
  await vi.waitFor(() => expect(m.index).toHaveBeenCalled());
  expect(await clearChatHistory()).toBe(false); expect(await saveChatHistory()).toBe(false);
  gate.resolve(true); expect(await clearing).toBe(true); expect(m.index).toHaveBeenCalledOnce(); expect(canSaveChatHistory()).toBe(true);
});
it('abandons a queued clear when navigation occurs while waiting for a write', async () => {
  const gate = deferred(); m.set.mockReturnValueOnce(gate.promise); const saving = saveChatHistory();
  await vi.waitFor(() => expect(m.set).toHaveBeenCalled()); const clearing = clearChatHistory(); await Promise.resolve();
  state.currentThreadId = 'other'; const destination = [{ role: 'user', content: 'Other' }]; state.chatHistory = destination;
  gate.resolve(); expect(await clearing).toBe(false); await saving; expect(state.chatHistory).toBe(destination);
});
it('does not write a queued snapshot after its history has been replaced', async () => {
  const gate = deferred(); m.set.mockReturnValueOnce(gate.promise); const first = saveChatHistory(); await vi.waitFor(() => expect(m.set).toHaveBeenCalled());
  const second = saveChatHistory(); state.chatHistory = []; gate.resolve(); await first; expect(await second).toBe(false); expect(m.set).toHaveBeenCalledOnce();
});
