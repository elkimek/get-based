import type { ProfileData } from '../types/app-state.js';
import OptionalSetup, { mount, unmount, flushSync } from './components/ChatOptionalSetup.svelte.native.js';
import { state } from './state.js';
import { GENETICS_IMPORTED, type GeneticsImported } from './genetics-import-events.js';
import { projectChatOptionalSetup, projectGeneticsImportConfirmation } from './chat-optional-onboarding-presentation.js';
import type { ChatOptionalSetupView } from './chat-optional-onboarding-presentation.js';

interface OptionalSetupOwner {
  container: HTMLElement; root: HTMLElement; component: ReturnType<typeof mount>;
  current(data?: ProfileData): boolean;
  present(view: ChatOptionalSetupView): void;
  controls: Set<Element>;
  imported(detail: GeneticsImported): void;
  retire(): void;
}
let active: OptionalSetupOwner | null = null;
let observer: MutationObserver | null = null;
const controls = new WeakMap<Element, OptionalSetupOwner>();
const roots = new WeakMap<Element, OptionalSetupOwner>();
// Reopening Chat reloads history and retires its view. Keep the receipt with
// the same live data only, and discard it if the authoritative SNPs change.
const receipts = new WeakMap<ProfileData, { fingerprint: string; confirmation: ChatOptionalSetupView['confirmation'] }>();
const genomeFingerprint = (data: ProfileData) => JSON.stringify([data.genetics?.snps || {}, data.genetics?.apoe || '']);
function removedRoot(records: MutationRecord[], root: HTMLElement): boolean {
  return records.some(record => [...record.removedNodes].some(node => node === root || (node instanceof Element && node.contains(root))));
}
/** Public delegates must reject retired controls, including controls reattached outside their old root. */
export function isChatOptionalSetupActionCurrent(source: Element): boolean {
  const root = source.closest('[data-chat-optional-setup-view]');
  const owner = controls.get(source) || (root ? roots.get(root) : undefined);
  return owner ? source.isConnected && owner.root.contains(source) && owner.controls.has(source) && owner.current() : !root;
}
function onImported(event: Event): void {
  const detail = (event as CustomEvent<GeneticsImported>).detail;
  if (detail) active?.imported(detail);
}
export function disposeChatOptionalSetup(): void {
  if (!active) return;
  const previous = active; active = null; previous.retire();
  observer?.disconnect(); observer = null;
  globalThis.removeEventListener('labcharts-profile-switched', disposeChatOptionalSetup);
  globalThis.removeEventListener(GENETICS_IMPORTED, onImported);
  void unmount(previous.component); flushSync();
}
export function renderChatOptionalSetup(container: HTMLElement, initial: ChatOptionalSetupView): void {
  if (active && (active.container !== container || !active.current())) disposeChatOptionalSetup();
  if (active) { active.present(initial); return; }
  const profile = state.currentProfile, thread = state.currentThreadId, history = state.chatHistory;
  let data: ProfileData = state.importedData, retired = false;
  const receipt = receipts.get(data);
  let confirmation = initial.confirmation || (receipt?.fingerprint === genomeFingerprint(data) ? receipt.confirmation : null);
  let presentation = initial;
  container.replaceChildren();
  const component = mount(OptionalSetup, { target: container, props: { initial: { ...initial, confirmation } } }); flushSync();
  const root = container.querySelector<HTMLElement>('[data-chat-optional-setup-view]')!;
  const owner: OptionalSetupOwner = {
    container, root, component, controls: new Set(),
    present(view) {
      presentation = view;
      if (receipts.get(data)?.fingerprint !== genomeFingerprint(data)) { confirmation = null; receipts.delete(data); }
      flushSync(() => component.setPresentation({ ...view, confirmation })); registerControls(owner);
    },
    retire() { retired = true; },
    current(expectedData = data) {
      if (retired) return false;
      if (removedRoot(observer?.takeRecords() || [], root)) retired = true;
      if (profile !== state.currentProfile || thread !== state.currentThreadId || history !== state.chatHistory
        || expectedData !== state.importedData || !root.isConnected || !container.contains(root)) retired = true;
      return !retired;
    },
    imported(detail) {
      if (detail.profileId !== profile || detail.previousData !== data || !owner.current(detail.data)) return;
      data = detail.data;
      if (detail.kind === 'snps') {
        confirmation = projectGeneticsImportConfirmation(data.genetics, detail.source);
        receipts.set(data, { fingerprint: genomeFingerprint(data), confirmation });
      }
      flushSync(() => component.setPresentation(projectChatOptionalSetup(data, state.profileSex, presentation.connected, presentation.personalityLabel, confirmation)));
      registerControls(owner);
    },
  };
  active = owner; roots.set(root, owner); registerControls(owner);
  observer = new MutationObserver(records => { if (active === owner && (removedRoot(records, root) || !owner.current())) disposeChatOptionalSetup(); });
  observer.observe(container.ownerDocument.documentElement, { childList: true, subtree: true });
  globalThis.addEventListener('labcharts-profile-switched', disposeChatOptionalSetup);
  globalThis.addEventListener(GENETICS_IMPORTED, onImported);
}
function registerControls(owner: OptionalSetupOwner): void {
  owner.controls = new Set(owner.root.querySelectorAll('input, button, a'));
  for (const control of owner.controls) controls.set(control, owner);
}
