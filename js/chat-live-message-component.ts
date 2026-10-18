import {tsStaticStyles} from './ts-static-ui-inline-style-map.generated.js';
import LiveMessage, { mount, unmount, flushSync } from './components/ChatLiveMessage.svelte.native.js';
import StreamingText, { mount as mountText, unmount as unmountText, flushSync as flushText } from './components/ChatStreamingText.svelte.native.js';
import { projectChatTranscriptMessage } from './chat-transcript-presentation.js';
import { state } from './state.js';
import type { ChatAvatarDetails } from './chat-message-avatars.js';
interface LiveOwner {
  setText(text: string): void;
  complete(message: (typeof state.chatHistory)[number]): void;
  dispose(): void;
}
const owners = new WeakMap<HTMLElement, LiveOwner>();
const liveOwners = new Map<HTMLElement, { current(): boolean; dispose(): void }>();
let observer: MutationObserver | null = null;
function releaseIdleObserver(): void {
  if (liveOwners.size || textOwners.size) return;
  observer?.disconnect();
  observer = null;
}
function observeOwners(): void {
  if (observer) return;
  observer = new MutationObserver(records => {
    for (const owner of liveOwners.values()) if (!owner.current()) owner.dispose();
    for (const [element, owner] of textOwners) {
      owner.connected ||= element.isConnected || records.some(record => Array.from(record.addedNodes).some(node => node === element || node.contains(element)));
      if (!owner.current() || (owner.connected && !element.isConnected)) disposeChatStreamingText(element);
    }
    releaseIdleObserver();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
}
export interface ChatLiveMessageHandle {
  element: HTMLElement;
  restore(container: HTMLElement): void;
  detach(): void;
  dispose(): void;
}
/** A service-owned host contains one authored message view, independent of history repainting. */
export function createChatLiveMessage(container: HTMLElement, identity: ChatAvatarDetails, current: () => boolean, label: string | null = null): ChatLiveMessageHandle {
  const host = document.createElement('div');
  host.style.display = tsStaticStyles.liveMessageHost;
  const initial = projectChatTranscriptMessage({
    role: 'assistant', content: '',
    personalityName: identity.personalityName || '',
    personalityIcon: identity.personalityIcon || '',
    agentId: identity.agentId || '',
  }, -1);
  const component = mount(LiveMessage, { target: host, props: { initial, label } });
  flushSync();
  const element = host.querySelector<HTMLElement>('[data-chat-transcript-message]')!;
  let disposed = false;
  const owner: LiveOwner = {
    setText(text) {
      if (!disposed && current()) flushSync(() => component.setText(text));
    },
    complete(message) {
      if (!disposed && current()) flushSync(() => component.complete(projectChatTranscriptMessage(message, -1)));
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      owners.delete(element);
      liveOwners.delete(element);
      retiredText.add(element);
      void unmount(component);
      flushSync();
      host.remove();
      element.remove();
      releaseIdleObserver();
    },
  };
  owners.set(element, owner);
  liveOwners.set(element, { current, dispose: owner.dispose });
  observeOwners();
  container.appendChild(host);
  return {
    element,
    restore(next) {
      if (!disposed && current() && !host.isConnected) next.appendChild(host);
    },
    detach() { host.remove(); },
    dispose: owner.dispose,
  };
}
export function completeChatLiveMessage(element: HTMLElement, message: (typeof state.chatHistory)[number]): boolean {
  const owner = owners.get(element);
  if (!owner) return false;
  owner.complete(message);
  return true;
}

interface TextOwner {
  component: { setText(text: string): void };
  connected: boolean;
  current(): boolean;
}
const textOwners = new Map<HTMLElement, TextOwner>();
const retiredText = new WeakSet<HTMLElement>();
/** Release a compatibility text host before its caller replaces the contents. */
export function disposeChatStreamingText(element: HTMLElement): void {
  retiredText.add(element);
  const owner = textOwners.get(element);
  if (!owner) return;
  textOwners.delete(element);
  void unmountText(owner.component);
  flushText();
  releaseIdleObserver();
}
/** Public typewriter callers can also supply an independent service-owned text host. */
export function publishChatLiveText(element: HTMLElement, value: unknown): void {
  const owner = owners.get(element);
  if (owner) {
    owner.setText(String(value || ''));
    return;
  }
  if (retiredText.has(element)) return;
  let text = textOwners.get(element);
  if (!text) {
    const profile = state.currentProfile;
    const thread = state.currentThreadId;
    const history = state.chatHistory;
    element.replaceChildren();
    const component = mountText(StreamingText, { target: element });
    text = {
      component, connected: element.isConnected,
      current: () => profile === state.currentProfile && thread === state.currentThreadId && history === state.chatHistory,
    };
    textOwners.set(element, text);
    observeOwners();
  }
  if (!text.current()) {
    disposeChatStreamingText(element);
    return;
  }
  const component = text.component;
  flushText(() => component.setText(String(value || '')));
}

/** Static compatibility callers have no indexed actions or component-owned controls. */
export function snapshotChatCompatibilityMessage(message: (typeof state.chatHistory)[number], label: string | null = null): { message: HTMLElement; label: HTMLElement | null } {
  const host = document.createElement('div');
  const view = projectChatTranscriptMessage(message, -1);
  const component = mount(LiveMessage, { target: host, props: { initial: view, label } });
  flushSync(() => component.complete(view));
  const result = {
    message: host.querySelector<HTMLElement>('[data-chat-transcript-message]')!.cloneNode(true) as HTMLElement,
    label: host.querySelector<HTMLElement>('[data-chat-persona-label]')?.cloneNode(true) as HTMLElement | undefined,
  };
  void unmount(component);
  flushSync();
  return { message: result.message, label: result.label || null };
}
