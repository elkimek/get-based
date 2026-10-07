import ProfileSetup, { mount, unmount, flushSync } from './components/ChatProfileSetup.svelte.native.js';
import { state } from './state.js';
import type { ChatProfileFormPort, ChatProfileSetupView } from './chat-profile-onboarding-contract.js';

interface ProfileSetupOwner {
  container: HTMLElement;
  root: HTMLElement;
  component: ReturnType<typeof mount>;
  view: ChatProfileFormPort;
  current(): boolean;
  retire(): void;
}
let active: ProfileSetupOwner | null = null;
let observer: MutationObserver | null = null;
const roots = new WeakMap<Element, ProfileSetupOwner>();
const controls = new WeakMap<Element, ProfileSetupOwner>();

/** Keep retired controls identifiable even if an external caller reattaches them. */
export function getChatProfileSetupOwner(source?: Element): ProfileSetupOwner | null | undefined {
  if (!source) return active;
  const root = source.closest('[data-chat-profile-setup-view]');
  const owner = controls.get(source) || (root ? roots.get(root) : undefined);
  return owner && source.isConnected && owner.root.contains(source) && owner.current() ? owner : root || owner ? undefined : null;
}
function removedRoot(records: MutationRecord[], root: HTMLElement): boolean {
  return records.some(record => Array.from(record.removedNodes).some(node =>
    node === root || (node instanceof Element && node.contains(root))));
}
export function disposeChatProfileSetup(): void {
  if (!active) return;
  const previous = active;
  active = null;
  previous.retire();
  observer?.disconnect(); observer = null;
  globalThis.removeEventListener('labcharts-profile-switched', disposeChatProfileSetup);
  void unmount(previous.component);
  flushSync();
}
export function renderChatProfileSetup(container: HTMLElement, initial: ChatProfileSetupView): void {
  if (active && (active.container !== container || !active.current())) disposeChatProfileSetup();
  if (active) {
    flushSync(() => active!.component.setPresentation(initial));
    return;
  }
  const profile = state.currentProfile, thread = state.currentThreadId;
  const history = state.chatHistory, data = state.importedData;
  let retired = false;
  container.replaceChildren();
  const component = mount(ProfileSetup, { target: container, props: { initial } });
  flushSync();
  const root = container.querySelector<HTMLElement>('[data-chat-profile-setup-view]')!;
  const view: ChatProfileFormPort = {
    readDraft: () => component.readDraft(),
    setPending: value => flushSync(() => component.setPending(value)),
    setError: value => flushSync(() => component.setError(value)),
    setSex: value => flushSync(() => component.setSex(value)),
    setLatitude: value => flushSync(() => component.setLatitude(value)),
    setContinueEnabled: value => flushSync(() => component.setContinueEnabled(value)),
    setHeight: (value, placeholder) => flushSync(() => component.setHeight(value, placeholder)),
  };
  active = {
    container, root, component, view,
    retire() { retired = true; },
    current() {
      if (retired) return false;
      // A removed/reinserted root is retired even before the observer's microtask runs.
      if (removedRoot(observer?.takeRecords() || [], root)) retired = true;
      if (profile !== state.currentProfile || thread !== state.currentThreadId || history !== state.chatHistory
        || data !== state.importedData || !root.isConnected || !container.contains(root)) retired = true;
      return !retired;
    },
  };
  roots.set(root, active);
  for (const control of root.querySelectorAll('input, select, button')) controls.set(control, active);
  observer = new MutationObserver(records => {
    if (!active) return;
    const removed = removedRoot(records, root);
    if (removed || !active.current()) disposeChatProfileSetup();
  });
  observer.observe(container.ownerDocument.documentElement, { childList: true, subtree: true });
  globalThis.addEventListener('labcharts-profile-switched', disposeChatProfileSetup);
}
