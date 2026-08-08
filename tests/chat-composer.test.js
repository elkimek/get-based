// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

let composer;
let state;

beforeEach(async () => {
  vi.resetModules();
  document.body.innerHTML = `
    <textarea id="chat-input" style="--chat-input-max-height: 120px"></textarea>
    <button id="chat-send-btn"></button>
  `;
  ({ state } = await import('../js/state.js'));
  composer = await import('../js/chat-composer.js');
  state.currentProfile = 'composer-test';
  state.currentThreadId = 'thread-one';
});

describe('chat composer', () => {
  it('grows with input, caps long prompts, and refreshes send state', () => {
    const input = document.getElementById('chat-input');
    Object.defineProperty(input, 'scrollHeight', { configurable: true, value: 190 });
    const updateSendButtonState = vi.fn();
    composer.configureChatComposer({ updateSendButtonState });
    composer.initChatComposer();
    updateSendButtonState.mockClear();

    input.value = 'A long health question';
    input.dispatchEvent(new Event('input', { bubbles: true }));

    expect(input.style.height).toBe('120px');
    expect(input.classList.contains('is-scrollable')).toBe(true);
    expect(composer.getChatDraft()).toBe('A long health question');
    expect(updateSendButtonState).toHaveBeenCalledOnce();
  });

  it('keeps independent drafts while conversations switch', async () => {
    const input = document.getElementById('chat-input');
    Object.defineProperty(input, 'scrollHeight', {
      configurable: true,
      get: () => input.value ? 72 : 0,
    });

    composer.setChatInputValue('Draft for the first conversation');
    state.currentThreadId = 'thread-two';
    await composer.restoreChatDraft();
    expect(input.value).toBe('');

    composer.setChatInputValue('Draft for the second conversation');
    state.currentThreadId = 'thread-one';
    await composer.restoreChatDraft();
    expect(input.value).toBe('Draft for the first conversation');
    expect(input.style.height).toBe('72px');

    composer.resetChatComposer();
    expect(input.value).toBe('');
    expect(composer.getChatDraft('thread-one')).toBe('');
    expect(composer.getChatDraft('thread-two')).toBe('Draft for the second conversation');
  });

  it('restores an encrypted-storage draft after the composer module reloads', async () => {
    const crypto = await import('../js/crypto.js');
    const key = 'labcharts-composer-test-chatDraft_thread-one';
    await crypto.encryptedSetItem(key, 'Recovered after refresh');

    vi.resetModules();
    ({ state } = await import('../js/state.js'));
    composer = await import('../js/chat-composer.js');
    state.currentProfile = 'composer-test';
    state.currentThreadId = 'thread-one';

    await composer.restoreChatDraft();
    expect(document.getElementById('chat-input').value).toBe('Recovered after refresh');

    await composer.clearChatDraft();
    expect(await crypto.encryptedGetItem(key)).toBeNull();
  });
});
