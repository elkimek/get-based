import { beforeEach, describe, expect, it } from 'vitest';

import {
  expandChatRenderWindow,
  getChatRenderStart,
  resetChatRenderWindow,
  revealChatRenderIndex,
} from '../js/chat-render-range.js';

describe('long chat render window', () => {
  beforeEach(() => resetChatRenderWindow());

  it('starts with the latest 120 messages and expands in bounded batches', () => {
    expect(getChatRenderStart('thread-a', 310)).toBe(190);
    expect(expandChatRenderWindow('thread-a', 310)).toBe(70);
    expect(expandChatRenderWindow('thread-a', 310)).toBe(0);
  });

  it('retains the visible window for a reader without disabling the normal latest window', () => {
    expect(getChatRenderStart('thread-a', 310)).toBe(190);
    expect(getChatRenderStart('thread-a', 313, 190)).toBe(190);
    expect(getChatRenderStart('thread-a', 313)).toBe(193);
  });

  it('expands from the actual visible window after new messages arrive', () => {
    expect(expandChatRenderWindow('thread-a', 313, 190)).toBe(70);
    expect(getChatRenderStart('thread-a', 314)).toBe(70);
    expect(getChatRenderStart('thread-a', 314, 190)).toBe(70);
  });

  it('reveals an older search result with context without changing visible results', () => {
    expect(revealChatRenderIndex('thread-a', 25, 300)).toBe(true);
    expect(getChatRenderStart('thread-a', 300)).toBe(13);
    expect(revealChatRenderIndex('thread-a', 100, 300)).toBe(false);
  });
});
