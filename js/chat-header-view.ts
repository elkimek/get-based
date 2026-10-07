import type { ChatHeaderState } from './chat-header-contract.js';

export type ChatHeaderAction = 'rail' | 'summary' | 'clear' | 'fullscreen' | 'close' | 'context';
export interface ChatHeaderActions {
  act(action: ChatHeaderAction): unknown;
  webSearch(enabled: boolean): unknown;
}
interface HeaderOwner {
  root: HTMLElement;
  render(state: Partial<ChatHeaderState>): void;
  closeMenu(): void;
}
const PROVIDER_EVENTS = [
  'labcharts-ai-settings-local-changed',
  'getbased:agent-model-catalog-changed',
  'getbased:agent-host-settings-changed',
  'getbased:chat-backend-changed',
  'getbased:chat-model-selection-changed',
];
let actions: ChatHeaderActions | null = null;
let refresh: (() => void) | null = null;
let active: HeaderOwner | null = null;

function current(owner: HeaderOwner | null): owner is HeaderOwner {
  return !!owner && active === owner && owner.root.isConnected
    && owner.root.ownerDocument.querySelector('[data-chat-header-view]') === owner.root;
}
export function configureChatHeaderActions(next: ChatHeaderActions): void { actions = next; }
export function configureChatHeaderRefresh(next: () => void): void {
  refresh = next;
  if (current(active)) refresh();
}
export function renderChatHeader(state: Partial<ChatHeaderState>): void {
  if (current(active)) active.render(state);
}
export function closeChatHeaderMenu(): void { if (current(active)) active.closeMenu(); }
export function chatHeaderActions(root: HTMLElement): ChatHeaderActions | null {
  return active?.root === root && current(active) ? actions : null;
}
export function ownChatHeader(
  root: HTMLElement,
  render: HeaderOwner['render'],
  closeMenu: HeaderOwner['closeMenu'],
): { destroy(): void; } {
  const owner = { root, render, closeMenu };
  active = owner;
  const update = () => { if (current(owner)) refresh?.(); };
  const model = root.querySelector('.chat-header-model');
  const window = root.ownerDocument.defaultView;
  model?.addEventListener('e2ee-attestation', update);
  for (const event of PROVIDER_EVENTS) window?.addEventListener(event, update);
  queueMicrotask(update);
  return {
    destroy() {
      model?.removeEventListener('e2ee-attestation', update);
      for (const event of PROVIDER_EVENTS) window?.removeEventListener(event, update);
      if (active === owner) active = null;
    },
  };
}
