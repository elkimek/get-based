// The shell owns geometry presentation; the layout service owns preferences.
export type ChatResizeKind = 'panel' | 'rail';
export interface ChatLayoutView {
  desktop: boolean;
  open: boolean;
  fullscreen: boolean;
  railOpen: boolean;
  panelWidth: number;
  railWidth: number;
  panelMin: number;
  panelMax: number;
  railMax: number;
}
export const INITIAL_CHAT_LAYOUT: ChatLayoutView = {
  desktop: false, open: false, fullscreen: false, railOpen: false, panelWidth: 600, railWidth: 220, panelMin: 420, panelMax: 1100, railMax: 360,
};
interface ChatLayoutActions { sync(): void; resize(kind: ChatResizeKind, value: number): void }
let actions: ChatLayoutActions | null = null;
let active: { root: HTMLElement; render(view: ChatLayoutView): void } | null = null;
let dragging: HTMLElement | null = null;

export function isChatLayoutCurrent(element: HTMLElement): boolean {
  return !!active && active.root.isConnected && active.root.ownerDocument.getElementById('chat-shell') === active.root && active.root.contains(element);
}
export function ownChatLayout(root: HTMLElement, render: (view: ChatLayoutView) => void): { destroy(): void } {
  const owner = { root, render };
  if (dragging) { dragging = null; document.body.classList.remove('chat-layout-resizing'); }
  active = owner;
  queueMicrotask(() => { if (active === owner && isChatLayoutCurrent(root)) actions?.sync(); });
  return { destroy() {
    if (active !== owner) return;
    active = null; dragging = null;
    document.body.classList.remove('chat-layout-resizing');
    document.body.style.removeProperty('--chat-panel-current-width');
  } };
}
export function configureChatLayoutView(next: ChatLayoutActions): void { actions = next; }
export function renderChatLayout(view: ChatLayoutView): void {
  if (active && isChatLayoutCurrent(active.root)) active.render(view);
}
export function requestChatLayoutSync(): void { if (active && isChatLayoutCurrent(active.root)) actions?.sync(); }
export function resizeChatLayout(element: HTMLElement, kind: ChatResizeKind, value: number): void {
  if (isChatLayoutCurrent(element)) actions?.resize(kind, value);
}
export function beginChatLayoutDrag(element: HTMLElement): boolean {
  if (!isChatLayoutCurrent(element) || dragging) return false;
  dragging = element; document.body.classList.add('chat-layout-resizing'); return true;
}
export function endChatLayoutDrag(element: HTMLElement): void {
  if (dragging !== element) return;
  dragging = null; document.body.classList.remove('chat-layout-resizing');
}
