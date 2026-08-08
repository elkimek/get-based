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

  it('reveals an older search result with context without changing visible results', () => {
    expect(revealChatRenderIndex('thread-a', 25, 300)).toBe(true);
    expect(getChatRenderStart('thread-a', 300)).toBe(13);
    expect(revealChatRenderIndex('thread-a', 100, 300)).toBe(false);
  });
});
