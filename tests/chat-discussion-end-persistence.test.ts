// @vitest-environment jsdom
import {beforeEach, expect, it, vi} from 'vitest';
const mocks = vi.hoisted(() => ({save: vi.fn(), removePrompt: vi.fn(), removePicker: vi.fn(), updateButton: vi.fn(), updateHeader: vi.fn()}));
vi.mock('../js/chat-threads.js', () => ({saveChatThreadIndex: mocks.save}));
vi.mock('../js/chat-personalities.js', () => ({getCustomPersonalities: () => [], getActivePersonality: () => ({name: 'Analyst', icon: 'A'}), updateChatHeaderTitle: mocks.updateHeader}));
vi.mock('../js/chat-discussion-ui.js', () => ({removeDiscussContinuePrompt: mocks.removePrompt, removeDiscussPersonaPicker: mocks.removePicker, updateDiscussButton: mocks.updateButton, showDiscussContinuePrompt: vi.fn()}));
vi.mock('../js/chat-discussion-callbacks.js', () => ({getChatAbortController: () => null}));
vi.mock('../js/chat-history.js', () => ({saveChatHistory: vi.fn()}));
import {state} from '../js/state.js';
import {endDiscussion} from '../js/chat-discussion-lifecycle.js';
import type {ChatThread} from '../types/chat-data.js';
let settle: (saved: boolean) => void;
let thread: ChatThread;
beforeEach(() => {
  vi.clearAllMocks(); localStorage.clear(); document.body.innerHTML = '<textarea id="chat-input"></textarea>';
  state.currentProfile = 'discussion-test'; state.currentThreadId = 'thread'; state.chatHistory = [];
  state.currentChatPersonality = 'house'; state.importedData = {...state.importedData};
  const personas = [{id: 'default', name: 'Analyst', icon: 'A'}, {id: 'house', name: 'House', icon: 'H'}];
  thread = {id: 'thread', name: 'Keep', createdAt: '', updatedAt: '', messageCount: 2, personality: 'house', discussionPersonas: personas,
    discussionOriginalPersonality: 'default', discussionPendingPersonas: [personas[1]!], extension: 'retain'} as ChatThread;
  state.chatThreads = [thread]; Object.assign(state, {_discussionPersonas: personas, _discussionOriginalPersonality: 'default'});
  localStorage.setItem('labcharts-discussion-test-chatPersonality', 'house');
  mocks.save.mockImplementation(() => new Promise<boolean>(resolve => {settle = resolve;}));
});
it('shows completion only after the exact index publication succeeds', async () => {
  const saved = endDiscussion(); expect(thread.discussionEnded).toBe(true); expect(mocks.save).toHaveBeenCalledOnce();
  expect(mocks.removePrompt).not.toHaveBeenCalled(); expect(mocks.removePicker).not.toHaveBeenCalled();
  settle(true); expect(await saved).toBe(true);
  expect(mocks.removePrompt).toHaveBeenCalledOnce(); expect(mocks.removePicker).toHaveBeenCalledOnce();
  expect(mocks.save).toHaveBeenCalledOnce(); expect(state.currentChatPersonality).toBe('default');
  expect(document.activeElement?.id).toBe('chat-input');
});
it('retains retry controls and restores only its own metadata after a failed save', async () => {
  const before = structuredClone(thread), saved = endDiscussion(); settle(false); expect(await saved).toBe(false);
  expect(thread).toEqual(before); expect(mocks.removePrompt).not.toHaveBeenCalled();
  expect(state.currentChatPersonality).toBe('house'); expect(localStorage.getItem('labcharts-discussion-test-chatPersonality')).toBe('house');
});
it('does not clean up or restore a replacement profile after the save resolves', async () => {
  const saved = endDiscussion(); state.currentProfile = 'other'; state.currentChatPersonality = 'new';
  settle(false); expect(await saved).toBe(false); expect(mocks.removePrompt).not.toHaveBeenCalled();
  expect(state.currentChatPersonality).toBe('new');
});
it('does not retire a newer discussion in the same thread', async () => {
  const saved = endDiscussion(); delete thread.discussionEnded; thread.discussionPersonas = [];
  settle(true); expect(await saved).toBe(false); expect(mocks.removePrompt).not.toHaveBeenCalled();
  expect(thread.discussionPersonas).toEqual([]);
});
