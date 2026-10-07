import Editor, { mount, unmount, flushSync } from './components/ChatMessageEditor.svelte.native.js';
import { state } from './state.js';

export interface ChatMessageEditorView { draft: string; current(): boolean; cancel(): void; submit(): void; }
interface EditorOwner {
  component: { setBusy(value: boolean): void };
  dispose(): void;
  current(): boolean;
  retired(): void;
}
interface EditorActions {
  cancel(): void;
  submit(): void;
  retired(): void;
}
const hosts = new WeakMap<HTMLElement, { show(view: ChatMessageEditorView | null): void; busy(value: boolean): void }>();
export function ownChatMessageEditorHost(bubble: HTMLElement, show: (view: ChatMessageEditorView | null) => void, busy: (value: boolean) => void): { destroy(): void } {
  const host = { show, busy }; hosts.set(bubble, host);
  return { destroy() { hosts.delete(bubble); if (active && !active.current()) disposeChatMessageEditor(); } };
}
let active: EditorOwner | null = null;
let observer: MutationObserver | null = null;

export function disposeChatMessageEditor(): void {
  const previous = active;
  active = null;
  observer?.disconnect();
  observer = null;
  if (previous) {
    previous.dispose();
    flushSync();
    previous.retired();
  }
}

export function renderChatMessageEditor(bubble: HTMLElement, index: number, draft: string, actions: EditorActions): boolean {
  disposeChatMessageEditor();
  const profile = state.currentProfile;
  const thread = state.currentThreadId;
  const history = state.chatHistory;
  const message = history[index];
  if (!bubble.isConnected || !message) return false;
  let owner: EditorOwner;
  const current = () => active === owner && bubble.isConnected
    && !!bubble.querySelector('[data-chat-message-editor-view]')
    && profile === state.currentProfile && thread === state.currentThreadId
    && history === state.chatHistory && message === history[index];

  const host = hosts.get(bubble);
  if (host) {
    owner = { component: { setBusy: host.busy }, current, retired: actions.retired, dispose: () => host.show(null) };
    active = owner;
    flushSync(() => host.show({ draft, current, cancel: actions.cancel, submit: actions.submit }));
  } else {
    // Public compatibility callers may supply their own service-owned bubble.
    bubble.replaceChildren();
    const component = mount(Editor, { target: bubble, props: { draft, current, cancel: actions.cancel, submit: actions.submit } });
    owner = { component, current, retired: actions.retired, dispose: () => { void unmount(component); } };
  }
  active = owner;
  flushSync();
  observer = new MutationObserver(() => {
    if (active === owner && !owner.current()) disposeChatMessageEditor();
  });
  observer.observe(bubble.ownerDocument.documentElement, { childList: true, subtree: true });
  return true;
}

export function publishChatMessageEditorBusy(value: boolean): void {
  const owner = active;
  if (owner?.current()) flushSync(() => owner.component.setBusy(value));
}
