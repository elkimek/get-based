// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ send: vi.fn(), render: vi.fn(), update: vi.fn(), notify: vi.fn(), streaming: vi.fn(), fork: vi.fn(), saveDraft: vi.fn(), clearDraft: vi.fn(), reset: vi.fn() }));
vi.mock('../js/chat-composer.js', () => ({ clearChatDraft: m.clearDraft, resetChatComposer: m.reset, saveChatDraft: m.saveDraft }));
vi.mock('../js/chat-runtime.js', () => ({ isChatRuntimeStreaming: m.streaming }));
vi.mock('../js/chat-threads.js', () => ({ createForkedThread: m.fork }));
vi.mock('../js/utils.js', () => ({ showNotification: m.notify, escapeAttr: value => String(value) }));
import { state } from '../js/state.js';
import * as edit from '../js/chat-message-edit.js';
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
beforeEach(() => {
  edit.cancelChatMessageEdit(); vi.resetAllMocks(); m.streaming.mockReturnValue(false); m.clearDraft.mockResolvedValue();
  state.currentProfile = 'profile'; state.currentThreadId = 'thread';
  state.chatHistory = [{ role: 'user', content: 'First' }, { role: 'assistant', content: 'Reply' }, { role: 'user', content: 'Latest' }, { role: 'assistant', content: 'Last reply' }];
  document.body.innerHTML = '<div class="chat-input-area"><div class="chat-input-row"></div></div><div id="chat-msg-0"></div><div id="chat-msg-2"></div>';
  edit.configureChatMessageEditDeps({ renderChatMessages: m.render, sendChatMessage: m.send, updateChatInputState: m.update });
});
function begin(value = 'Revised') { expect(edit.beginChatMessageEdit(2)).toBe(true); document.getElementById('chat-message-edit-input').value = value; }
it.each(['assistant', 'earlier', 'image', 'streaming', 'missing', 'threadless', 'hidden', 'joined'])('refuses an ineligible %s edit without entering edit mode', mode => {
  let index = 2;
  if (mode === 'assistant') index = 3;
  if (mode === 'earlier') index = 0;
  if (mode === 'missing') index = 99;
  if (mode === 'image') state.chatHistory[2].hasImages = true;
  if (mode === 'streaming') m.streaming.mockReturnValue(true);
  if (mode === 'threadless') state.currentThreadId = null;
  if (mode === 'hidden') state.chatHistory[2].hidden = true;
  if (mode === 'joined') state.chatHistory[2].joined = true;
  expect(edit.beginChatMessageEdit(index)).toBe(false); expect(edit.hasPendingChatMessageEdit()).toBe(false);
});
it('does not leave a phantom session when the message bubble is absent', () => {
  document.getElementById('chat-msg-2').remove(); expect(edit.beginChatMessageEdit(2)).toBe(false); expect(edit.hasPendingChatMessageEdit()).toBe(false);
});
it('cancels without changing messages and releases the composer', () => {
  const original = [...state.chatHistory]; begin(); expect(document.querySelector('.chat-input-row').hasAttribute('inert')).toBe(true);
  expect(edit.cancelChatMessageEdit()).toBe(true); expect(edit.cancelChatMessageEdit()).toBe(false);
  expect(state.chatHistory).toEqual(original); expect(document.querySelector('.chat-input-row').hasAttribute('inert')).toBe(false);
});
it('does not submit whitespace-only edits', async () => {
  begin('  '); expect(await edit.submitChatMessageEdit()).toBe(false); expect(m.send).not.toHaveBeenCalled(); expect(edit.hasPendingChatMessageEdit()).toBe(true);
});
it('submits trimmed text and replaces only the latest turn when accepted', async () => {
  begin('  Revised  '); let text;
  m.send.mockImplementation(() => { text = edit.getPendingChatMessageEditText(); expect(edit.prepareChatMessageEditSend()).toEqual({ edited: true }); });
  expect(await edit.submitChatMessageEdit()).toBe(true); expect(text).toBe('Revised'); expect(state.chatHistory.map(m => m.content)).toEqual(['First', 'Reply']);
});
it.each(['refused', 'rejected'])('keeps the edited text available after Send is %s', async mode => {
  begin(); if (mode === 'rejected') m.send.mockRejectedValue(new Error('failed'));
  expect(await edit.submitChatMessageEdit()).toBe(false); expect(state.chatHistory).toHaveLength(4);
  expect(document.getElementById('chat-message-edit-input').value).toBe('Revised'); expect(edit.getPendingChatMessageEditText()).toBeNull();
});
it('ignores duplicate submit calls while awaiting Send', async () => {
  begin(); const gate = deferred(); m.send.mockReturnValue(gate.promise);
  const first = edit.submitChatMessageEdit(); const second = edit.submitChatMessageEdit(); expect(m.send).toHaveBeenCalledOnce();
  gate.resolve(); await Promise.all([first, second]);
});
it.each(['profile', 'thread', 'new-message', 'replacement'])('does not prepare an old edit after a %s change', async mode => {
  begin(); let prepared;
  m.send.mockImplementation(() => {
    if (mode === 'profile') state.currentProfile = 'other';
    if (mode === 'thread') state.currentThreadId = 'other';
    if (mode === 'new-message') state.chatHistory.push({ role: 'user', content: 'New' });
    if (mode === 'replacement') state.chatHistory[2] = { role: 'user', content: 'Synced replacement' };
    const expected = [...state.chatHistory]; prepared = edit.prepareChatMessageEditSend(); expect(state.chatHistory).toEqual(expected);
  });
  await edit.submitChatMessageEdit(); expect(prepared).toBe(false);
});
it('clears editing when a thread change event arrives', () => {
  begin(); state.currentThreadId = 'other'; document.dispatchEvent(new CustomEvent('chat-thread-changed'));
  expect(edit.hasPendingChatMessageEdit()).toBe(false); expect(document.querySelector('.chat-input-row').hasAttribute('inert')).toBe(false);
});
it('does not prepare until submitted', () => { begin(); expect(edit.prepareChatMessageEditSend()).toBeNull(); expect(state.chatHistory).toHaveLength(4); });
it.each(['hidden', 'joined', 'missing', 'streaming', 'threadless'])('does not fork an ineligible %s message', async mode => {
  let index = 2;
  if (mode === 'hidden') state.chatHistory[2].hidden = true;
  if (mode === 'joined') state.chatHistory[2].joined = true;
  if (mode === 'missing') index = 99;
  if (mode === 'streaming') m.streaming.mockReturnValue(true);
  if (mode === 'threadless') state.currentThreadId = null;
  expect(await edit.forkChatFromMessage(index)).toBe(false); expect(m.fork).not.toHaveBeenCalled();
});
it('retains the composer when a fork cannot be saved', async () => {
  m.fork.mockResolvedValue(null); expect(await edit.forkChatFromMessage(2)).toBe(false); expect(m.reset).not.toHaveBeenCalled(); expect(m.clearDraft).not.toHaveBeenCalled();
});
it('forks only the selected prefix and clears the destination draft', async () => {
  m.fork.mockImplementation(async () => { state.currentThreadId = 'fork'; return { id: 'fork' }; });
  expect(await edit.forkChatFromMessage(2)).toBe(true); expect(m.fork.mock.calls[0][2].map(m => m.content)).toEqual(['First', 'Reply', 'Latest']);
  expect(m.clearDraft).toHaveBeenCalledWith('fork'); expect(m.reset).toHaveBeenCalledOnce();
});
it.each(['profile', 'thread'])('does not reset the destination composer after a %s switch while clearing a fork draft', async scope => {
  m.fork.mockImplementation(async () => { state.currentThreadId = 'fork'; return { id: 'fork' }; });
  const gate = deferred(); m.clearDraft.mockReturnValueOnce(gate.promise); const forking = edit.forkChatFromMessage(2);
  await vi.waitFor(() => expect(m.clearDraft).toHaveBeenCalled());
  if (scope === 'profile') state.currentProfile = 'other'; else state.currentThreadId = 'other';
  gate.resolve(); expect(await forking).toBe(false); expect(m.reset).not.toHaveBeenCalled();
});
it('Escape cancels the inline editor without sending', () => {
  begin(); const event = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true });
  document.getElementById('chat-message-edit-input').dispatchEvent(event);
  expect(event.defaultPrevented).toBe(true); expect(edit.hasPendingChatMessageEdit()).toBe(false); expect(m.send).not.toHaveBeenCalled();
});
it.each(['ctrlKey', 'metaKey'])('%s Enter submits exactly once', async modifier => {
  begin(); const textarea = document.getElementById('chat-message-edit-input');
  textarea.dispatchEvent(new Event('input')); textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', [modifier]: true }));
  await vi.waitFor(() => expect(m.send).toHaveBeenCalledOnce());
});
it('ordinary Enter does not submit the editor', () => {
  begin(); document.getElementById('chat-message-edit-input').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' })); expect(m.send).not.toHaveBeenCalled();
});
it('does not replace an edit session while its send is pending', async () => {
  begin(); const gate = deferred(); m.send.mockReturnValueOnce(gate.promise); const sending = edit.submitChatMessageEdit();
  expect(edit.beginChatMessageEdit(2)).toBe(false); gate.resolve(); await sending; expect(document.getElementById('chat-message-edit-input').value).toBe('Revised');
});
