// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

let chatScroll;
let container;
let button;

beforeEach(async () => {
  vi.resetModules();
  document.body.innerHTML = `
    <div id="chat-messages"></div>
    <button id="chat-jump-latest" hidden>
      <span class="chat-jump-latest-label">Jump to latest</span>
    </button>
  `;
  container = document.getElementById('chat-messages');
  button = document.getElementById('chat-jump-latest');
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

  it('continues following content while already near the latest message', () => {
    container.scrollTop = 760;
    chatScroll.initChatScrollControls();

    expect(chatScroll.notifyChatContentAdded(container)).toBe(true);
    expect(container.scrollTop).toBe(1000);
    expect(button.hidden).toBe(true);
  });
});
