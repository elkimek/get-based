// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { state } from '../js/state.js';
import {
  applyChatMessageAvatar, applyRenderedChatMessageAvatars, shouldShowChatPersonaLabel,
} from '../js/chat-message-avatars.js';
import {
  CHAT_THINKING_DURATIONS_MS, CHAT_THINKING_PHRASES,
  createChatThinkingIndicator, stopChatThinkingStatus,
} from '../js/chat-thinking-status.js';

describe('chat thinking status and sender avatars', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    state.currentProfile = 'profile-one';
    state.profiles = [{
      id: 'profile-one',
      name: 'Ada',
      avatar: 'data:image/png;base64,iVBORw0KGgo=',
    }];
  });

  afterEach(() => {
    document.body.innerHTML = '';
    state.profiles = null;
    vi.useRealTimers();
  });

  it('rotates friendly phrases for more than 30 seconds and repeats', () => {
    const indicator = createChatThinkingIndicator();
    document.body.appendChild(indicator);

    expect(indicator.getAttribute('aria-hidden')).toBe('true');
    expect(indicator.querySelector('.chat-thinking-text')?.textContent).toBe(CHAT_THINKING_PHRASES[0]);
    expect(indicator.querySelectorAll('.chat-thinking-dots i')).toHaveLength(3);

    vi.advanceTimersByTime(CHAT_THINKING_DURATIONS_MS[0]);
    expect(indicator.querySelector('.chat-thinking-text')?.textContent).toBe(CHAT_THINKING_PHRASES[1]);

    const fullCycle = CHAT_THINKING_DURATIONS_MS.reduce((sum, duration) => sum + duration, 0);
    expect(fullCycle).toBeGreaterThan(30_000);
    vi.advanceTimersByTime(fullCycle - CHAT_THINKING_DURATIONS_MS[0]);
    expect(indicator.querySelector('.chat-thinking-text')?.textContent).toBe(CHAT_THINKING_PHRASES[0]);

    stopChatThinkingStatus(indicator);
    vi.advanceTimersByTime(CHAT_THINKING_DURATIONS_MS[0]);
    expect(indicator.querySelector('.chat-thinking-text')?.textContent).toBe(CHAT_THINKING_PHRASES[0]);
  });

  it('uses the active profile photo for user messages and CLI branding for the default assistant', () => {
    const user = document.createElement('div');
    applyChatMessageAvatar(user, { role: 'user' });
    expect(user.dataset.chatAvatarText).toBe('');
    expect(user.style.getPropertyValue('--chat-avatar-image')).toContain('data:image/png');
    expect(user.style.getPropertyValue('--chat-avatar-image-size')).toBe('cover');

    const assistant = document.createElement('div');
    applyChatMessageAvatar(assistant, {
      role: 'assistant',
      personalityName: 'AI Lab Analyst',
      personalityIcon: '🔬',
      agentId: 'hermes',
    });
    expect(assistant.style.getPropertyValue('--chat-avatar-image')).toContain('/brands/cli-agent-hermes.svg');
    expect(assistant.dataset.chatAvatarText).toBe('');
    expect(assistant.classList.contains('chat-avatar-branded')).toBe(true);
  });

  it('keeps a named persona emoji and decorates a rendered transcript', () => {
    state.profiles = [{ id: 'profile-one', name: 'Ada', avatar: null }];
    const container = document.createElement('div');
    container.innerHTML = '<div id="chat-msg-0"></div><div id="chat-msg-1"></div>';
    document.body.appendChild(container);
    const messages = [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi', personalityName: 'Dr. Gregory House', personalityIcon: '🦯', agentId: 'codex' },
    ];

    applyRenderedChatMessageAvatars(container, messages);

    expect(document.getElementById('chat-msg-0')?.dataset.chatAvatarText).toBe('A');
    const assistant = document.getElementById('chat-msg-1');
    expect(assistant?.dataset.chatAvatarText).toBe('🦯');
    expect(assistant?.style.getPropertyValue('--chat-avatar-image')).toBe('');
    expect(shouldShowChatPersonaLabel({ personalityName: 'AI Lab Analyst' })).toBe(false);
    expect(shouldShowChatPersonaLabel({ personalityName: 'Dr. Gregory House' })).toBe(true);
    expect(shouldShowChatPersonaLabel({ personalityName: 'AI Lab Analyst', discussion: true })).toBe(true);
  });
});
