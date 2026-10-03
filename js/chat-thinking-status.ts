import type { ChatAvatarDetails } from './chat-message-avatars.js';

export interface ChatThinkingOptions { phrases?: readonly string[]; durations?: readonly number[] }

// Friendly pre-token status shown while an assistant prepares a response.

import { applyChatMessageAvatar } from './chat-message-avatars.js';

export const CHAT_THINKING_PHRASES = Object.freeze([
  'Putting on the white coat',
  'Getting my glasses',
  'Reading the fine print',
  'Looking for the pattern',
  'Checking the evidence',
  'Connecting the dots',
  'Giving that a second look',
  'Preparing a clear answer',
]);

// One full pass lasts 35.8 seconds before repeating.
export const CHAT_THINKING_DURATIONS_MS = Object.freeze([
  4200, 3600, 4600, 4000, 5200, 3800, 4400, 5000,
]);

const thinkingTimers = new WeakMap<HTMLElement, ReturnType<typeof setTimeout>>();

function renderPhrase(element: HTMLElement, phrase: string) {
  const text = element.querySelector('.chat-thinking-text');
  if (text) text.textContent = phrase;
}

export function startChatThinkingStatus(element: HTMLElement, options: ChatThinkingOptions = {}) {
  stopChatThinkingStatus(element);
  const phrases = options.phrases?.length ? options.phrases : CHAT_THINKING_PHRASES;
  const durations = options.durations?.length ? options.durations : CHAT_THINKING_DURATIONS_MS;
  let index = 0;
  renderPhrase(element, phrases[index]!);

  const scheduleNext = () => {
    const delay = Math.max(500, Number(durations[index % durations.length]) || 4000);
    const timer = setTimeout(() => {
      index = (index + 1) % phrases.length;
      renderPhrase(element, phrases[index]!);
      scheduleNext();
    }, delay);
    thinkingTimers.set(element, timer);
  };
  scheduleNext();
  return element;
}

export function stopChatThinkingStatus(element: HTMLElement) {
  const timer = thinkingTimers.get(element);
  if (timer !== undefined) clearTimeout(timer);
  thinkingTimers.delete(element);
}

export function createChatThinkingIndicator(identity: ChatAvatarDetails = {}) {
  const element = document.createElement('div');
  element.className = 'typing-indicator';
  // The shared chat stream status is the single screen-reader announcement.
  // Rapidly rotating visual copy would otherwise become noisy.
  element.setAttribute('aria-hidden', 'true');
  element.innerHTML = '<span class="chat-thinking-text"></span><span class="chat-thinking-dots" aria-hidden="true"><i></i><i></i><i></i></span>';
  applyChatMessageAvatar(element, { role: 'assistant', ...identity });
  return startChatThinkingStatus(element);
}
