// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { state } from '../js/state.js';
import { encryptedGetItem } from '../js/crypto.js';
import { configureThreadNavigationActions, renderChatThreadList } from '../js/chat-thread-list-view.js';
import { disposeChatThreadNavigation } from '../js/chat-thread-navigation-component.js';
import { configureChatThreadSearch, filterThreadList, invalidateThreadContentCache, jumpToSearchResult } from '../js/chat-thread-search.js';
import type { ChatThread } from '../types/chat-data.js';

vi.mock('../js/crypto.js', () => ({ encryptedGetItem: vi.fn(), getEncryptionEnabled: () => true }));
vi.mock('../js/utils.js', () => ({ showConfirmDialog: vi.fn(), showNotification: vi.fn() }));
const original = { currentProfile: state.currentProfile, currentThreadId: state.currentThreadId, chatThreads: state.chatThreads, chatHistory: state.chatHistory };
const makeThread = (id: string): ChatThread => ({ id, name: id, createdAt: '2026-10-07', updatedAt: '2026-10-07', messageCount: 1 });
let frames: FrameRequestCallback[];
let switchToThread: ReturnType<typeof vi.fn<(id: string) => Promise<void>>>;
beforeEach(() => {
  vi.useFakeTimers(); vi.clearAllMocks(); frames = [];
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frames.push(callback); return frames.length; });
  Element.prototype.scrollIntoView = vi.fn();
  document.body.innerHTML = '<input id="chat-thread-search"><div id="chat-thread-list"></div><div id="chat-messages"><div id="chat-msg-0">Needle message</div></div>';
  state.currentProfile = 'search-owned-a'; state.currentThreadId = 'a'; state.chatThreads = [makeThread('a')]; state.chatHistory = [{ role: 'user', content: 'Needle message' }];
  switchToThread = vi.fn(async () => {});
  configureChatThreadSearch({ getChatThreadKey: id => 'owned-' + id, renderThreadList: filter => renderChatThreadList('recent', filter), switchToThread });
  configureThreadNavigationActions({ switch: () => {}, pin: () => {}, rename: () => {}, delete: () => {}, move: () => {}, renameProject: () => {}, deleteProject: () => {}, jump: result => jumpToSearchResult(result.threadId, result.msgIndex, result.contentPrefix) });
  invalidateThreadContentCache(); renderChatThreadList('recent');
});
afterEach(() => {
  filterThreadList(''); invalidateThreadContentCache(); disposeChatThreadNavigation();
  Object.assign(state, original); document.body.replaceChildren(); vi.useRealTimers(); vi.unstubAllGlobals();
});
const input = () => document.getElementById('chat-thread-search') as HTMLInputElement;
it.each(['profile', 'host', 'input', 'query', 'deleted-thread'] as const)('rejects a decrypted search reply after its %s changes', async boundary => {
  let resolve!: (raw: string) => void;
  vi.mocked(encryptedGetItem).mockReturnValue(new Promise<string>(done => { resolve = done; }));
  filterThreadList('needle'); await vi.advanceTimersByTimeAsync(250);
  expect(encryptedGetItem).toHaveBeenCalledExactlyOnceWith('owned-a');
  if (boundary === 'profile') state.currentProfile = 'search-owned-b';
  if (boundary === 'host') document.getElementById('chat-thread-list')!.replaceChildren();
  if (boundary === 'input') input().replaceWith(input().cloneNode());
  if (boundary === 'query') input().value = 'other';
  if (boundary === 'deleted-thread') state.chatThreads = [];
  resolve(JSON.stringify([{ role: 'user', content: 'Needle late response' }]));
  await vi.advanceTimersByTimeAsync(0);
  expect(document.querySelector('.chat-search-result')).toBeNull();
});
it('limits results with a sentinel, reuses encrypted reads and dispatches the bound result once', async () => {
  vi.mocked(encryptedGetItem).mockResolvedValue(JSON.stringify(Array.from({ length: 31 }, (_, index) => ({ role: 'user', content: `Needle ${index}` }))));
  filterThreadList('needle'); await vi.advanceTimersByTimeAsync(250);
  expect(document.querySelectorAll('.chat-search-result')).toHaveLength(30);
  expect(document.getElementById('chat-thread-list')!.textContent).toContain('Showing first 30 matches');
  filterThreadList('needle'); await vi.advanceTimersByTimeAsync(250);
  expect(encryptedGetItem).toHaveBeenCalledTimes(1);
  (document.querySelector('.chat-search-result') as HTMLButtonElement).click();
  await Promise.resolve(); expect(frames).toHaveLength(1);
  filterThreadList(''); expect(input().value).toBe(''); expect(document.querySelector('.chat-search-result')).toBeNull();
  frames[0]!(0); expect(document.querySelector('.chat-msg-highlight')).toBeNull();
});
it('preserves a no-op switch callback while rejecting a later navigation before highlighting', async () => {
  filterThreadList('needle');
  await jumpToSearchResult('b', 0, 'Needle message');
  expect(switchToThread).toHaveBeenCalledExactlyOnceWith('b'); expect(state.currentThreadId).toBe('a');
  frames.shift()!(0); expect(document.getElementById('chat-msg-0')!.classList.contains('chat-msg-highlight')).toBe(true);
  filterThreadList(''); filterThreadList('needle');
  await jumpToSearchResult('b', 0, 'Needle message');
  state.currentThreadId = 'another'; frames.shift()!(0);
  expect(document.querySelector('.chat-msg-highlight')).toBeNull();
});

it('finishes a jump when saving the departing thread invalidates cached reads', async () => {
  vi.mocked(encryptedGetItem).mockResolvedValue('[]');
  state.chatThreads.push(makeThread('b'));
  configureChatThreadSearch({ switchToThread: async id => {
    invalidateThreadContentCache(); state.currentThreadId = id; renderChatThreadList('recent');
  } });
  filterThreadList('needle'); await jumpToSearchResult('b', 0, 'Needle message');
  expect(frames).toHaveLength(1); frames[0]!(0);
  expect(document.getElementById('chat-msg-0')!.classList.contains('chat-msg-highlight')).toBe(true);
});

it('does not revive an older jump after a newer jump accepted the same query', async () => {
  vi.mocked(encryptedGetItem).mockResolvedValue('[]');
  let finish!: () => void;
  const delayed = new Promise<void>(resolve => { finish = resolve; });
  configureChatThreadSearch({ switchToThread: async id => {
    if (id === 'old') await delayed;
    else state.currentThreadId = id;
  } });
  filterThreadList('needle'); const old = jumpToSearchResult('old', 0, 'Needle message');
  await jumpToSearchResult('new', 0, 'Needle message'); finish(); await old;
  expect(frames).toHaveLength(1); expect(state.currentThreadId).toBe('new');
});

it('retires invalidated search progress and permits a fresh query to complete', async () => {
  vi.mocked(encryptedGetItem).mockResolvedValue(JSON.stringify([{ role: 'user', content: 'Needle retained message' }]));
  filterThreadList('needle'); expect(document.querySelector('.chat-search-progress')).not.toBeNull();
  invalidateThreadContentCache(); expect(document.querySelector('.chat-search-progress')).toBeNull();
  await vi.advanceTimersByTimeAsync(250); expect(encryptedGetItem).not.toHaveBeenCalled();
  filterThreadList('needle'); await vi.advanceTimersByTimeAsync(250);
  expect(document.querySelectorAll('.chat-search-result')).toHaveLength(1);
});
