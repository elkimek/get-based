import {tsStaticStyles} from './ts-static-ui-inline-style-map.generated.js';
import SpeechButton, { hydrate, unmount, flushSync } from './components/ChatSpeechButton.svelte.native.js';
import { renderHTML } from './components/ChatSpeechButton.svelte.html.js';
import type { ChatSpeechMode } from './chat-voice-contract.js';
import { state } from './state.js';
import { publishOwnedChatSpeech } from './chat-speech-view.js';
export { configureChatSpeechAction } from './chat-speech-view.js';

interface SpeechEntry {
  component: { setMode(mode: ChatSpeechMode): void; };
  current(): boolean;
}
const entries = new Map<HTMLElement, SpeechEntry>();
const retired = new WeakSet<HTMLElement>();
let observer: MutationObserver | null = null;
function sweep(): void {
  for (const [host, entry] of entries) {
    if (entry.current()) continue;
    entries.delete(host);
    retired.add(host);
    void unmount(entry.component);
    flushSync();
  }
  if (!entries.size) {
    observer?.disconnect();
    observer = null;
  }
}
function adopt(host: HTMLElement): SpeechEntry | null {
  if (!host.isConnected || retired.has(host)) return null;
  const previous = entries.get(host);
  if (previous?.current()) return previous;
  if (previous) {
    sweep();
    // Unmount removes its hydration markers. A retired host cannot be hydrated
    // again; rendering the transcript supplies a fresh host and message owner.
    return null;
  }
  const index = Number(host.dataset.chatSpeechIndex);
  const message = state.chatHistory[index];
  if (!Number.isInteger(index) || index < 0 || message?.role !== 'assistant' || message.error
    || !host.querySelector('[data-chat-speech-view]')) return null;
  const profile = state.currentProfile;
  const thread = state.currentThreadId;
  let entry: SpeechEntry;
  const component = hydrate(SpeechButton, {
    target: host,
    props: { index },
    recover: false,
  });
  entry = {
    component,
    current: () => entries.get(host) === entry && host.isConnected
      && !!host.querySelector('[data-chat-speech-view]')
      && state.currentProfile === profile && state.currentThreadId === thread
      && state.chatHistory[index] === message,
  };
  entries.set(host, entry);
  flushSync();
  if (!observer) {
    observer = new MutationObserver(sweep);
    observer.observe(host.ownerDocument.documentElement, { childList: true, subtree: true });
  }
  return entry;
}
/** Existing transcript callers receive one authored view; hydration preserves focus. */
export function renderChatSpeechButton(index: number): string {
  if (!Number.isInteger(index) || index < 0) return '';
  if (typeof document !== 'undefined' && typeof document.querySelectorAll === 'function') {
    queueMicrotask(() => {
      for (const host of document.querySelectorAll<HTMLElement>('[data-chat-speech-host]')) {
        if (!entries.has(host)) adopt(host);
      }
      sweep();
    });
  }
  return `<span data-chat-speech-host data-chat-speech-index="${index}" style="${tsStaticStyles.speechHost}">${renderHTML({ index })}</span>`;
}
export function publishChatSpeech(index: number, mode: ChatSpeechMode): boolean {
  if (publishOwnedChatSpeech(index, mode)) return true;
  const button = document.getElementById(`chat-listen-btn-${index}`);
  const host = button?.closest<HTMLElement>('[data-chat-speech-host]');
  const entry = host ? adopt(host) : null;
  if (!entry?.current()) return false;
  flushSync(() => entry.component.setMode(mode));
  return true;
}
