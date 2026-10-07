import type { ChatAvatarDetails } from './chat-message-avatars.js';

export interface ChatThinkingOptions { phrases?: readonly string[]; durations?: readonly number[] }

// Friendly pre-token status shown while an assistant prepares a response.

import ChatThinkingStatus, { mount, unmount, flushSync } from './components/ChatThinkingStatus.svelte.native.js';
import { state } from './state.js';
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

interface ThinkingView {
  component: { setPhrase(phrase: string): void; };
  profile: string | null;
  thread: string | null;
  connected: boolean;
  timer?: ReturnType<typeof setTimeout>;
}
const views = new WeakMap<HTMLElement, ThinkingView>();
const owners = new Map<HTMLElement, ThinkingView>();
const active = new Map<HTMLElement, ThinkingView>();
const retired = new WeakSet<HTMLElement>();
let observer: MutationObserver | null = null;

function current(element: HTMLElement, view: ThinkingView): boolean {
  view.connected ||= element.isConnected;
  return !retired.has(element) && view.profile === state.currentProfile
    && view.thread === state.currentThreadId && (!view.connected || element.isConnected);
}

function stopClock(element: HTMLElement): void {
  const view = active.get(element);
  if (view?.timer !== undefined) {
    clearTimeout(view.timer);
    delete view.timer;
  }
  active.delete(element);
}

function retire(element: HTMLElement, view: ThinkingView): void {
  stopClock(element);
  retired.add(element);
  views.delete(element);
  owners.delete(element);
  void unmount(view.component);
  flushSync();
  if (!owners.size) {
    observer?.disconnect();
    observer = null;
  }
}

function observe(element: HTMLElement): void {
  if (observer) return;
  observer = new MutationObserver(records => {
    for (const [element, view] of owners) {
      view.connected ||= records.some(record => Array.from(record.addedNodes)
        .some(node => node === element || node.contains(element)));
      if (!current(element, view)) retire(element, view);
    }
  });
  observer.observe(element.ownerDocument.documentElement, { subtree: true, childList: true });
}

function mountThinking(target: HTMLElement): ThinkingView {
  const component = mount(ChatThinkingStatus, { target });
  flushSync();
  return { component, profile: state.currentProfile, thread: state.currentThreadId, connected: target.isConnected };
}

/** Start/restart the visual clock without making each rotating phrase a live announcement. */
export function startChatThinkingStatus(element: HTMLElement, options: ChatThinkingOptions = {}) {
  stopClock(element);
  if (retired.has(element)) return element;
  let view = views.get(element);
  if (!view) {
    element.replaceChildren();
    view = mountThinking(element);
    views.set(element, view);
  }
  if (!current(element, view)) { retire(element, view); return element; }
  const owned = view;
  const phrases = options.phrases?.length ? options.phrases : CHAT_THINKING_PHRASES;
  const durations = options.durations?.length ? options.durations : CHAT_THINKING_DURATIONS_MS;
  let index = 0;
  flushSync(() => owned.component.setPhrase(phrases[index]!));
  owners.set(element, owned);
  active.set(element, owned);
  observe(element);
  const scheduleNext = () => {
    const delay = Math.max(500, Number(durations[index % durations.length]) || 4000);
    owned.timer = setTimeout(() => {
      if (active.get(element) !== owned) return;
      if (!current(element, owned)) { retire(element, owned); return; }
      index = (index + 1) % phrases.length;
      flushSync(() => owned.component.setPhrase(phrases[index]!));
      scheduleNext();
    }, delay);
  };
  scheduleNext();
  return element;
}
export function stopChatThinkingStatus(element: HTMLElement): void {
  stopClock(element);
  const view = views.get(element);
  if (!view) return;
  view.connected ||= element.isConnected;
  // A connected stopped view keeps its last phrase. The shared observer still
  // disposes it on removal; stopping a clock must not leak Svelte's root owner.
  // Detached views may be placed or restarted synchronously by their caller.
  queueMicrotask(() => {
    if (owners.get(element) === view && !element.isConnected && !active.has(element)) retire(element, view);
  });
}

export function createChatThinkingIndicator(identity: ChatAvatarDetails = {}) {
  const host = document.createElement('div');
  const view = mountThinking(host);
  const element = host.querySelector<HTMLElement>('.typing-indicator')!;
  // Keep the existing element-return contract; Svelte retains references to its
  // view while the sender places the element in its current transcript.
  element.remove();
  views.set(element, view);
  applyChatMessageAvatar(element, { role: 'assistant', ...identity });
  return startChatThinkingStatus(element);
}
