// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { state } from '../js/state.js';
import { projectChatMessageActions } from '../js/chat-message-actions-contract.js';
import { renderChatMessageActions, ensureChatMessageActions } from '../js/chat-message-actions-component.js';
import { captureChatMessageCopyFeedback, toggleOwnedChatMessageContext, isChatMessageActionCurrent } from '../js/chat-message-actions-view.js';
import { configureChatSpeechAction, publishOwnedChatSpeech } from '../js/chat-speech-view.js';
function render(index = 1) {
  document.body.innerHTML = renderChatMessageActions(index, 'assistant'); ensureChatMessageActions();
  return document.querySelector<HTMLElement>('[data-chat-message-actions-view]')!;
}
beforeEach(() => {
  state.currentProfile = 'origin'; state.currentThreadId = 'thread';
  state.chatHistory = [{ role: 'user', content: 'Question' }, { role: 'assistant', content: 'Answer', context: [{ label: '<Labs>', detail: '<Private>' }] }];
});
afterEach(() => { document.body.replaceChildren(); ensureChatMessageActions(); vi.useRealTimers(); });
describe('owned message actions', () => {
  it('projects the latest eligible user edit and only the last assistant retry', () => {
    expect(projectChatMessageActions(state.chatHistory, 0)).toMatchObject({ kind: 'user' });
    expect(projectChatMessageActions(state.chatHistory, 1)).toMatchObject({ retry: { label: 'Regenerate' }, speech: true });
    state.chatHistory.push({ role: 'user', content: 'Next' }, { role: 'assistant', content: 'Stopped', stopped: true });
    expect(projectChatMessageActions(state.chatHistory, 0)).toBeNull(); expect(projectChatMessageActions(state.chatHistory, 1)?.retry).toBeNull();
    expect(projectChatMessageActions(state.chatHistory, 3)?.retry?.label).toBe('Retry');
  });
  it('keeps participant-only retry and remaining-round resume separate', () => {
    state.chatHistory[1] = { role: 'assistant', content: 'Failed', error: true, discussion: true, discussionError: true, discussionPersonaId: 'house', personalityName: 'Dr <House>' };
    expect(projectChatMessageActions(state.chatHistory, 1)).toMatchObject({ retry: { action: 'retry-discussion-participant', personaId: 'house', label: 'Retry Dr <House>' }, resume: true, speech: false });
  });
  it('renders literal context and updates its owned disclosure without replacing controls', () => {
    const root = render(); const button = root.querySelector<HTMLButtonElement>('.chat-context-toggle')!;
    expect(root.querySelector('.chat-context-item')?.textContent).toBe('✓ <Labs> (<Private>)'); expect(root.querySelector('labs,private')).toBeNull();
    expect(toggleOwnedChatMessageContext(1)).toBe(true); expect(button.getAttribute('aria-expanded')).toBe('true'); expect(root.querySelector<HTMLElement>('.chat-context-details')?.style.display).toBe('flex');
    expect(toggleOwnedChatMessageContext(1)).toBe(true); expect(button.getAttribute('aria-expanded')).toBe('false'); expect(root.querySelector('.chat-context-toggle')).toBe(button);
  });
  it('keeps copy focus and node identity through feedback and its reset', () => {
    vi.useFakeTimers(); const root = render(); const button = root.querySelector<HTMLButtonElement>('#chat-copy-btn-1')!; button.focus();
    const feedback = captureChatMessageCopyFeedback(1); expect(feedback('copied')).toBe(true); expect(button.textContent).toBe('Copied'); expect(document.activeElement).toBe(button);
    vi.advanceTimersByTime(1500); expect(button.textContent).toBe('Copy'); expect(root.querySelector('#chat-copy-btn-1')).toBe(button); expect(vi.getTimerCount()).toBe(0);
  });
  it.each(['profile', 'thread', 'history', 'message'])('rejects a retired %s action, disclosure and clipboard reply', boundary => {
    const root = render(); const feedback = captureChatMessageCopyFeedback(1); const button = root.querySelector<HTMLButtonElement>('#chat-copy-btn-1')!;
    if (boundary === 'profile') state.currentProfile = 'next';
    if (boundary === 'thread') state.currentThreadId = 'next';
    if (boundary === 'history') state.chatHistory = [...state.chatHistory];
    if (boundary === 'message') state.chatHistory[1] = { role: 'assistant', content: 'Different answer' };
    expect(isChatMessageActionCurrent(button)).toBe(false); expect(feedback('copied')).toBe(false); expect(toggleOwnedChatMessageContext(1)).toBe(false); expect(button.textContent).toBe('Copy');
  });
  it('does not adopt old HTML into a different message at the same index', () => {
    const html = renderChatMessageActions(1, 'assistant'); state.chatHistory = [{ role: 'user', content: 'Other' }, { role: 'assistant', content: 'Other answer' }];
    document.body.innerHTML = html; ensureChatMessageActions(); const button = document.getElementById('chat-copy-btn-1')!;
    expect(isChatMessageActionCurrent(button)).toBe(false); expect(captureChatMessageCopyFeedback(1)('copied')).toBe(false);
  });
  it('disposes a removed owner and cannot update the next render with its old timer or reply', () => {
    vi.useFakeTimers(); const oldRoot = render(); const oldFeedback = captureChatMessageCopyFeedback(1); oldFeedback('copied');
    const nextRoot = render(); expect(nextRoot).not.toBe(oldRoot); expect(vi.getTimerCount()).toBe(0); expect(oldFeedback('failed')).toBe(false);
    vi.advanceTimersByTime(2000); expect(nextRoot.querySelector('#chat-copy-btn-1')?.textContent).toBe('Copy');
  });
  it('shares nested speech state and dispatch with standalone speech controls', () => {
    const act = vi.fn(); configureChatSpeechAction(act); const root = render(); const button = root.querySelector<HTMLButtonElement>('[data-chat-speech-view]')!; button.focus(); button.click(); expect(act).toHaveBeenCalledExactlyOnceWith(1);
    expect(publishOwnedChatSpeech(1, 'speaking')).toBe(true); expect(button.getAttribute('aria-pressed')).toBe('true'); expect(button.textContent).toBe('Stop'); expect(document.activeElement).toBe(button);
    state.currentProfile = 'next'; button.click(); expect(act).toHaveBeenCalledTimes(1); expect(publishOwnedChatSpeech(1, 'idle')).toBe(false);
  });
});
