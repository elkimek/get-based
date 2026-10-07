import Editor, { mount, unmount, flushSync } from './components/ChatMessageEditor.svelte.native.js';
import { state } from './state.js';

interface EditorOwner {
  component: { setBusy(value: boolean): void };
  current(): boolean;
  retired(): void;
}
interface EditorActions {
  cancel(): void;
  submit(): void;
  retired(): void;
}
let active: EditorOwner | null = null;
let observer: MutationObserver | null = null;

export function disposeChatMessageEditor(): void {
  const previous = active;
  active = null;
  observer?.disconnect();
  observer = null;
  if (previous) {
    void unmount(previous.component);
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

  // The transcript service still owns this host; the editor owns its children.
  bubble.replaceChildren();
  const component = mount(Editor, {
    target: bubble,
    props: { draft, current, cancel: actions.cancel, submit: actions.submit },
  });
  owner = { component, current, retired: actions.retired };
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
