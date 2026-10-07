import ProviderSetup, { mount, unmount, flushSync } from './components/ChatProviderSetup.svelte.native.js';
import { state } from './state.js';
import type { ChatProviderSetupView } from './chat-onboarding-presentation.js';

interface SetupOwner {
  container: HTMLElement;
  root: HTMLElement;
  component: ReturnType<typeof mount>;
  branch: string;
  viewKey: string;
  revision: number;
  current(): boolean;
  retire(): void;
}
let active: SetupOwner | null = null;
let observer: MutationObserver | null = null;
const roots = new WeakMap<Element, SetupOwner>();
const actions = new WeakMap<Element, { owner: SetupOwner; revision: number }>();

/** Existing document delegates also serve extension HTML and synchronous public helpers. */
export function isChatProviderSetupActionCurrent(element: Element): boolean {
  const root = element.closest('[data-chat-provider-setup-view]');
  const action = actions.get(element);
  const owner = action?.owner || (root ? roots.get(root) : undefined);
  return owner ? element.isConnected && owner.root.contains(element) && owner.current()
    && (!action || action.revision === owner.revision) : !root;
}
export function disposeChatProviderSetup(): void {
  if (!active) return;
  const previous = active;
  active = null;
  previous.retire();
  roots.delete(previous.root);
  observer?.disconnect(); observer = null;
  globalThis.removeEventListener('labcharts-profile-switched', disposeChatProviderSetup);
  void unmount(previous.component);
  flushSync();
}
export function renderChatProviderSetup(container: HTMLElement, view: ChatProviderSetupView): void {
  if (active && (active.container !== container || !active.current())) disposeChatProviderSetup();
  const viewKey = `${view.branch}\0${view.connected}\0${view.extensionHTML}`;
  const focusInside = !!active?.root.contains(document.activeElement);
  const branchChanged = active?.branch !== view.branch;
  if (!active) {
    const profile = state.currentProfile;
    const thread = state.currentThreadId;
    const history = state.chatHistory;
    let retired = false;
    container.replaceChildren();
    const component = mount(ProviderSetup, { target: container, props: { initial: view } });
    flushSync();
    const root = container.querySelector<HTMLElement>('[data-chat-provider-setup-view]')!;
    active = {
      container, root, component, branch: view.branch, viewKey, revision: 0,
      retire() { retired = true; },
      current() {
        if (profile !== state.currentProfile || thread !== state.currentThreadId || history !== state.chatHistory
          || !root.isConnected || !container.contains(root)) retired = true;
        return !retired;
      },
    };
    roots.set(root, active);
    observer = new MutationObserver(records => {
      if (!active) return;
      const removed = records.some(record => Array.from(record.removedNodes).some(node =>
        node === active!.root || (node instanceof Element && node.contains(active!.root))));
      if (removed || !active.current()) disposeChatProviderSetup();
    });
    observer.observe(container.ownerDocument.documentElement, { childList: true, subtree: true });
    globalThis.addEventListener('labcharts-profile-switched', disposeChatProviderSetup);
  } else flushSync(() => active!.component.setView(view));
  if (active.viewKey !== viewKey) active.revision += 1;
  active.viewKey = viewKey;
  active.branch = view.branch;
  for (const element of active.root.querySelectorAll('[data-chat-onboarding-action]')) {
    const previous = actions.get(element);
    if (!previous || previous.owner === active) actions.set(element, { owner: active, revision: active.revision });
  }
  if (branchChanged && focusInside) (active.root.querySelector<HTMLElement>('.chat-quiz-back')
    || active.root.querySelector<HTMLElement>('.chat-provider-quiz [data-chat-onboarding-action]')
    || active.root.querySelector<HTMLElement>('[data-chat-onboarding-action]'))?.focus();
}
