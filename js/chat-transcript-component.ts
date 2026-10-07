import Transcript, { mount, unmount, flushSync } from './components/ChatTranscript.svelte.native.js';
import { state } from './state.js';
import type { ChatTranscriptView } from './chat-transcript-presentation.js';
let observer: MutationObserver | null = null;
let active: { container: HTMLElement; root: Element; owner: ReturnType<typeof mount>; profile: typeof state.currentProfile; thread: typeof state.currentThreadId; history: typeof state.chatHistory } | null = null;
export function disposeChatTranscript(): void {
  if (!active) return;
  const old = active; active = null;
  observer?.disconnect(); observer = null;
  void unmount(old.owner); flushSync();
}
export function renderChatTranscript(container: HTMLElement, view: ChatTranscriptView): void {
  if (active && (active.container !== container || !container.contains(active.root) || active.profile !== state.currentProfile || active.thread !== state.currentThreadId || active.history !== state.chatHistory)) disposeChatTranscript();
  if (!active) {
    container.replaceChildren();
    const owner = mount(Transcript, { target: container }); flushSync();
    active = { container, root: container.querySelector('[data-chat-transcript-view]')!, owner, profile: state.currentProfile, thread: state.currentThreadId, history: state.chatHistory };
    observer = new MutationObserver(() => {
      if (active && (!active.root.isConnected || !active.container.contains(active.root))) disposeChatTranscript();
    });
    observer.observe(container.ownerDocument.documentElement, { childList: true, subtree: true });
  }
  const owner = active.owner;
  flushSync(() => owner.setView(view));
}
