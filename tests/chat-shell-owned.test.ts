// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest';
import { renderHTML } from '../js/components/ChatShell.svelte.html.js';
import { ensureChatShell } from '../js/chat-shell-component.js';
import { notifyChatComposerInput, registerChatComposerInput } from '../js/chat-composer-input-port.js';
import { state } from '../js/state.js';
import { publishChatMessageEditing } from '../js/chat-message-editor-view.js';
import { configureChatComposer, initChatComposer, restoreChatDraft, setChatInputValue } from '../js/chat-composer.js';
import { loadChatDraft, rememberChatDraft } from '../js/chat-draft-storage.js';
import { withChatShellSnapshot } from '../scripts/chat-shell-snapshot.mjs';

vi.mock('../js/chat-draft-storage.js', () => ({
  clearStoredChatDraft: vi.fn().mockResolvedValue(undefined),
  getCachedChatDraft: vi.fn().mockReturnValue(undefined),
  loadChatDraft: vi.fn().mockResolvedValue(''),
  rememberChatDraft: vi.fn(),
}));
function host() {
  const element = document.createElement('div');
  element.id = 'chat-shell-host'; element.innerHTML = renderHTML();
  return element;
}
function input() { return document.getElementById('chat-input') as HTMLTextAreaElement; }
beforeEach(() => {
  vi.clearAllMocks(); vi.mocked(loadChatDraft).mockResolvedValue('');
  state.currentProfile = 'shell-profile'; state.currentThreadId = 'shell-thread';
  document.body.replaceChildren(host());
  publishChatMessageEditing(false);
});

it('hydrates the native snapshot once without replacing controls, focus or live feature hosts', () => {
  const original = input(); original.value = 'Restored by the browser'; original.focus();
  expect(ensureChatShell()).toBe(true);
  expect(input()).toBe(original); expect(input().value).toBe('Restored by the browser');
  expect(document.activeElement).toBe(original);
  const transcript = document.getElementById('chat-messages')!;
  const live = document.createElement('article'); live.textContent = 'Streaming response'; transcript.append(live);
  const navigation = document.getElementById('chat-thread-list')!;
  const row = document.createElement('button'); row.textContent = 'Saved conversation'; navigation.append(row);
  ensureChatShell(); initChatComposer(); initChatComposer();
  expect(document.getElementById('chat-messages')).toBe(transcript);
  expect(transcript.firstChild).toBe(live); expect(navigation.firstChild).toBe(row);
  expect(document.querySelectorAll('#chat-panel')).toHaveLength(1);
  expect(document.getElementById('chat-panel')!.hasAttribute('inert')).toBe(true);
});

it('dispatches input once and retires a replaced native owner', () => {
  const update = vi.fn(); configureChatComposer({ updateSendButtonState: update });
  initChatComposer(); initChatComposer(); update.mockClear();
  const retired = input(); retired.value = 'First draft'; retired.dispatchEvent(new Event('input', { bubbles: true }));
  expect(rememberChatDraft).toHaveBeenLastCalledWith('shell-profile', 'shell-thread', 'First draft');
  expect(update).toHaveBeenCalledOnce();
  document.body.replaceChildren(host()); initChatComposer();
  update.mockClear(); vi.mocked(rememberChatDraft).mockClear();
  retired.value = 'Late event'; notifyChatComposerInput(retired);
  expect(rememberChatDraft).not.toHaveBeenCalled(); expect(update).not.toHaveBeenCalled();
  input().value = 'New owner'; input().dispatchEvent(new Event('input', { bubbles: true }));
  expect(rememberChatDraft).toHaveBeenCalledExactlyOnceWith('shell-profile', 'shell-thread', 'New owner');
  expect(update).toHaveBeenCalledOnce();
});

it.each(['profile', 'thread', 'input', 'owner', 'lifetime', 'typing', 'set-value'] as const)(
  'rejects decrypted draft completion after the originating %s boundary changes', async boundary => {
    initChatComposer();
    let resolve!: (value: string) => void;
    vi.mocked(loadChatDraft).mockReturnValueOnce(new Promise<string>(done => { resolve = done; }));
    const pending = restoreChatDraft();
    if (boundary === 'profile') state.currentProfile = 'different-profile';
    if (boundary === 'thread') state.currentThreadId = 'different-thread';
    if (boundary === 'input') input().replaceWith(Object.assign(document.createElement('textarea'), { id: 'chat-input' }));
    if (boundary === 'owner') { document.body.replaceChildren(host()); initChatComposer(); }
    if (boundary === 'lifetime') registerChatComposerInput(input());
    input().value = 'Current text';
    if (boundary === 'typing') input().dispatchEvent(new Event('input', { bubbles: true }));
    if (boundary === 'set-value') setChatInputValue('Current text');
    resolve('Private old draft');
    expect(await pending).toBe(false); expect(input().value).toBe('Current text');
  },
);

it('restores the accepted draft and focus into its original input', async () => {
  initChatComposer(); vi.mocked(loadChatDraft).mockResolvedValueOnce('Accepted draft');
  expect(await restoreChatDraft(undefined, { focus: true })).toBe(true);
  expect(input().value).toBe('Accepted draft'); expect(document.activeElement).toBe(input());
});

it('generates only the bounded native shell section and rejects missing or duplicate markers', () => {
  const source = '<header>Keep</header><!-- CHAT_SVELTE_SHELL_START -->old<!-- CHAT_SVELTE_SHELL_END --><footer>Keep</footer>';
  const snapshot = withChatShellSnapshot(source, renderHTML());
  expect(snapshot).toMatch(/^<header>Keep<\/header>/); expect(snapshot).toMatch(/<footer>Keep<\/footer>$/);
  expect(snapshot.match(/id="chat-panel"/g)).toHaveLength(1);
  expect(withChatShellSnapshot(snapshot, renderHTML())).toBe(snapshot);
  expect(() => withChatShellSnapshot('', renderHTML())).toThrow('one generated Chat shell');
  expect(() => withChatShellSnapshot(source + source, renderHTML())).toThrow('one generated Chat shell');
});

it('owns composer edit mode without replacing its input or draft', () => {
  ensureChatShell();
  const original = input(); original.value = 'Unsent draft';
  publishChatMessageEditing(true);
  expect((document.querySelector('.chat-input-row') as HTMLElement & { inert: boolean }).inert).toBe(true);
  expect(document.querySelector('.chat-input-area')!.classList.contains('chat-message-edit-active')).toBe(true);
  expect(input()).toBe(original); expect(input().value).toBe('Unsent draft');
  publishChatMessageEditing(false);
  expect((document.querySelector('.chat-input-row') as HTMLElement & { inert: boolean }).inert).toBe(false);
  expect(document.querySelector('.chat-input-area')!.classList.contains('chat-message-edit-active')).toBe(false);
  expect(input()).toBe(original); expect(input().value).toBe('Unsent draft');
});
