// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

let chatScroll: typeof import('../js/chat-scroll.js');
let container: HTMLElement;
let button: HTMLButtonElement;

beforeEach(async () => {
  vi.resetModules();
  document.body.innerHTML = `
    <div id="chat-messages"></div>
    <button id="chat-jump-latest" hidden>
      <span class="chat-jump-latest-label">Jump to latest</span>
    </button>
  `;
  container = document.getElementById('chat-messages')!;
  button = document.getElementById('chat-jump-latest') as HTMLButtonElement;
  Object.defineProperties(container, {
    scrollHeight: { configurable: true, value: 1000 },
    clientHeight: { configurable: true, value: 200 },
    scrollTop: { configurable: true, writable: true, value: 0 },
  });
  chatScroll = await import('../js/chat-scroll.js');
});
describe('chat latest control', () => {
  it('surfaces new content without moving a reader who scrolled up', () => {
    chatScroll.initChatScrollControls();
    expect(button.hidden).toBe(false);
    expect(button.textContent).toContain('Jump to latest');

    expect(chatScroll.notifyChatContentAdded(container)).toBe(false);
    expect(container.scrollTop).toBe(0);
    expect(button.textContent).toContain('New response');
    expect(button.classList.contains('has-new-content')).toBe(true);

    button.click();
    expect(container.scrollTop).toBe(1000);
    expect(button.hidden).toBe(true);
  });

  it('retains a paused reader across a temporary empty transcript without announcing a new reply', () => {
    container.scrollTop = 400;
    chatScroll.initChatScrollControls();
    const position = chatScroll.captureChatScrollPosition(container);
    Object.defineProperty(container, 'scrollHeight', { configurable: true, value: 200 });
    container.scrollTop = 0;
    container.dispatchEvent(new Event('scroll'));
    Object.defineProperty(container, 'scrollHeight', { configurable: true, value: 1000 });

    chatScroll.restoreChatScrollPosition(container, position);
    expect(container.scrollTop).toBe(400);
    expect(button.hidden).toBe(false);
    expect(button.textContent).toContain('Jump to latest');
    expect(button.classList.contains('has-new-content')).toBe(false);
    expect(chatScroll.notifyChatContentAdded(container)).toBe(false);
    expect(container.scrollTop).toBe(400);
    expect(button.textContent).toContain('New response');
  });

  it('follows genuinely new content only when the reader was at the latest message before rendering', () => {
    container.scrollTop = 800;
    chatScroll.initChatScrollControls();
    const position = chatScroll.captureChatScrollPosition(container);
    Object.defineProperty(container, 'scrollHeight', { configurable: true, value: 1400 });
    container.scrollTop = 0;

    chatScroll.restoreChatScrollPosition(container, position, true);
    expect(container.scrollTop).toBe(1400);
    expect(button.hidden).toBe(true);
  });

  it('continues following content while already near the latest message', () => {
    container.scrollTop = 760;
    chatScroll.initChatScrollControls();

    expect(chatScroll.notifyChatContentAdded(container)).toBe(true);
    expect(container.scrollTop).toBe(1000);
    expect(button.hidden).toBe(true);
  });
});
