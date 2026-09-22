// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ save: vi.fn(), render: vi.fn(), send: vi.fn(), notify: vi.fn(), streaming: vi.fn(), callbacks: vi.fn(), restore: vi.fn(), input: vi.fn() }));
vi.mock('../js/chat-history.js', () => ({ saveChatHistory: m.save }));
vi.mock('../js/utils.js', () => ({ escapeHTML: value => value, showNotification: m.notify }));
vi.mock('../js/chat-runtime.js', () => ({ isChatRuntimeStreaming: m.streaming, getChatRegenerateCallbacks: m.callbacks }));
vi.mock('../js/emf-runtime.js', () => ({ openEMFAssessmentEditor: vi.fn() }));
vi.mock('../js/chat-composer.js', () => ({ setChatInputValue: m.input }));
vi.mock('../js/chat-images.js', () => ({ getMessageAttachments: m.restore }));
vi.mock('../js/agent-drafts.js', () => ({ applyAgentDraft: vi.fn(), renderAgentDraftCards: () => '' }));
vi.mock('../js/agent-draft-claims.js', () => ({ claimAgentDraft: vi.fn() }));
import { state } from '../js/state.js';
import { regenerateLastMessage } from '../js/chat-actions.js';
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
beforeEach(() => {
  vi.resetAllMocks(); document.body.innerHTML = ''; m.send.mockImplementation(({ prepareRetry }) => { prepareRetry(); state.chatHistory.push({ role: 'user', content: 'Replacement' }); }); m.save.mockResolvedValue(true); m.restore.mockReturnValue([{ name: "original.png" }]); m.streaming.mockReturnValue(false);
  m.callbacks.mockReturnValue({ renderChatMessages: m.render, sendChatMessage: m.send });
  state.currentProfile = 'profile'; state.currentThreadId = 'thread';
  state.chatHistory = [{ role: 'user', content: 'Question' }, { role: 'assistant', content: 'Original response' }];
});
it.each([false, 'reject'])('preserves the original response when persistence fails: %s', async failure => {
  const before = [...state.chatHistory];
  if (failure === false) m.save.mockResolvedValue(false); else m.save.mockRejectedValue(new Error('Disk full'));
  await regenerateLastMessage(); expect(state.chatHistory).toEqual(before); expect(m.send).not.toHaveBeenCalled(); expect(m.notify).toHaveBeenCalled();
});
it('persists before removing messages or initiating a paid retry', async () => {
  const gate = deferred(); m.save.mockReturnValueOnce(gate.promise); const retry = regenerateLastMessage();
  expect(state.chatHistory).toHaveLength(2); expect(m.send).not.toHaveBeenCalled();
  gate.resolve(true); await retry; expect(state.chatHistory).toEqual([{ role: 'user', content: 'Replacement' }]); expect(m.send.mock.calls[0][0].retry.content).toBe('Question'); expect(m.input).not.toHaveBeenCalled(); expect(m.send).toHaveBeenCalledOnce();
});
it('ignores duplicate retry clicks while saving', async () => {
  const gate = deferred(); m.save.mockReturnValueOnce(gate.promise);
  const first = regenerateLastMessage(); const second = regenerateLastMessage(); gate.resolve(true);
  await Promise.all([first, second]); expect(m.save).toHaveBeenCalledOnce(); expect(m.send).toHaveBeenCalledOnce();
});
it.each(['profile', 'thread', 'history', 'tail', 'streaming'])('abandons retry when %s changes during persistence', async scope => {
  const gate = deferred(); m.save.mockReturnValueOnce(gate.promise); const retry = regenerateLastMessage();
  if (scope === 'profile') state.currentProfile = 'new';
  if (scope === 'thread') state.currentThreadId = 'new';
  if (scope === 'history') state.chatHistory = [{ role: 'user', content: 'Other chat' }];
  if (scope === 'tail') state.chatHistory.push({ role: 'user', content: 'New question' });
  if (scope === 'streaming') m.streaming.mockReturnValue(true);
  const expected = [...state.chatHistory]; gate.resolve(true); await retry;
  expect(state.chatHistory).toEqual(expected); expect(m.send).not.toHaveBeenCalled(); expect(m.input).not.toHaveBeenCalled();
});
it.each(['empty', 'streaming', 'callbacks', 'joined', 'wrong-role'])('does nothing for %s retry state', async mode => {
  if (mode === 'empty') state.chatHistory = [];
  if (mode === 'streaming') m.streaming.mockReturnValue(true);
  if (mode === 'callbacks') m.callbacks.mockReturnValue(null);
  if (mode === 'joined') state.chatHistory[0].joined = true;
  if (mode === 'wrong-role') state.chatHistory[0].role = 'assistant';
  await regenerateLastMessage(); expect(m.save).not.toHaveBeenCalled(); expect(m.send).not.toHaveBeenCalled();
});
it('preserves messages when original image attachments cannot be restored', async () => {
  state.chatHistory[0].hasImages = true; m.restore.mockReturnValue([]); const before = [...state.chatHistory];
  await regenerateLastMessage(); expect(state.chatHistory).toEqual(before); expect(m.send).not.toHaveBeenCalled(); expect(m.notify).toHaveBeenCalled();
});
it('restores image-only input without inserting its placeholder as text', async () => {
  state.chatHistory[0].hasImages = true; state.chatHistory[0].content = '(image)';
  await regenerateLastMessage(); expect(m.restore).toHaveBeenCalledOnce(); expect(m.send.mock.calls[0][0].retry.content).toBe(''); expect(m.input).not.toHaveBeenCalled(); expect(m.send).toHaveBeenCalledOnce();
});

it.each(['refused', 'throw', 'reject'])('restores the original turn when Send is %s before accepting a replacement', async mode => {
  const original = [...state.chatHistory];
  m.send.mockImplementation(() => {
    if (mode === 'throw') throw new Error('send failed');
    if (mode === 'reject') return Promise.reject(new Error('send failed'));
  });
  await regenerateLastMessage(); expect(state.chatHistory).toEqual(original);
  m.send.mockImplementation(({ prepareRetry }) => { prepareRetry(); state.chatHistory.push({ role: 'user', content: 'Accepted' }); });
  await regenerateLastMessage(); expect(state.chatHistory).toEqual([{ role: 'user', content: 'Accepted' }]);
});
it('does not overwrite a draft typed while saving', async () => {
  document.body.innerHTML = '<textarea id="chat-input">Old draft</textarea>';
  const gate = deferred(); m.save.mockReturnValueOnce(gate.promise); const retry = regenerateLastMessage();
  document.getElementById('chat-input').value = 'New draft'; gate.resolve(true); await retry;
  expect(m.input).not.toHaveBeenCalled(); expect(m.send).not.toHaveBeenCalled(); expect(state.chatHistory).toHaveLength(2);
});
it('rejects a trailing user message instead of deleting two user turns', async () => {
  state.chatHistory[1].role = 'user'; await regenerateLastMessage(); expect(m.save).not.toHaveBeenCalled();
});
it('does not restore the old pair over messages accepted by Send before it rejects', async () => {
  m.send.mockImplementation(({ prepareRetry }) => { prepareRetry(); state.chatHistory.push({ role: 'user', content: 'Accepted' }); throw new Error('later failure'); });
  await regenerateLastMessage(); expect(state.chatHistory).toEqual([{ role: 'user', content: 'Accepted' }]);
});
it('does not restore the old pair into another conversation after Send returns', async () => {
  m.send.mockImplementation(() => { state.currentThreadId = 'other'; state.chatHistory = []; });
  await regenerateLastMessage(); expect(state.chatHistory).toEqual([]);
});
