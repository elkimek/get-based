// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CHAT_REASONING_PREFERENCE_KEY_PREFIX,
  getDirectChatReasoningEffort,
  setDirectChatReasoningEffort,
} from '../js/chat-model-preferences.js';

describe('chat model preferences', () => {
  beforeEach(() => localStorage.clear());

  it('stores reasoning choices independently per provider and model', () => {
    setDirectChatReasoningEffort('openrouter', 'openai/gpt-5.6-sol', 'high');
    setDirectChatReasoningEffort('openrouter', 'openai/gpt-5.6-luna', 'low');
    setDirectChatReasoningEffort('venice', 'openai/gpt-5.6-sol', 'medium');

    expect(getDirectChatReasoningEffort('openrouter', 'openai/gpt-5.6-sol')).toBe('high');
    expect(getDirectChatReasoningEffort('openrouter', 'openai/gpt-5.6-luna')).toBe('low');
    expect(getDirectChatReasoningEffort('venice', 'openai/gpt-5.6-sol')).toBe('medium');
    expect([...Array(localStorage.length)].map((_, index) => localStorage.key(index)))
      .toEqual(expect.arrayContaining([expect.stringContaining(CHAT_REASONING_PREFERENCE_KEY_PREFIX)]));
  });

  it('removes a model override when Default is selected and announces changes', () => {
    const listener = vi.fn();
    globalThis.addEventListener('getbased:chat-model-selection-changed', listener);
    setDirectChatReasoningEffort('custom', 'reasoner', 'xhigh');
    expect(setDirectChatReasoningEffort('custom', 'reasoner', '')).toBe('');
    expect(getDirectChatReasoningEffort('custom', 'reasoner')).toBe('');
    expect(listener).toHaveBeenCalledTimes(2);
    globalThis.removeEventListener('getbased:chat-model-selection-changed', listener);
  });
});
