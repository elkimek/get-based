import AiActionDialog, { mount, unmount, flushSync } from './components/AiActionDialog.svelte.native.js';
import { AI_DIALOG_OVERLAY } from './ai-action-dialog-classes.js';
import type { AiDialogContent } from './ai-action-dialog-contract.js';
import { openModalOverlay, closeModalOverlay, trapModalFocus } from './modal-lifecycle.js';
import { loadSettingsStylesheet } from './settings-styles.js';

// Each named dialog owns its listeners, focus trap and style-load replies.
// Keep the overlay identity stable for the published synchronous entry points.
const current = new Map<string, { close(restoreFocus?: boolean): void }>();
export function showAiActionDialog(content: AiDialogContent, choose: (id: string) => unknown): void {
  current.get(content.overlayId)?.close();
  let overlay = document.getElementById(content.overlayId);
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = content.overlayId;
    document.body.appendChild(overlay);
  }
  overlay.className = AI_DIALOG_OVERLAY;
  overlay.setAttribute('data-ai-action-dialog-overlay', '');
  overlay.setAttribute('data-modal-lifecycle-managed', '');
  overlay.replaceChildren();
  const host = overlay;
  let disposed = false;
  let releaseFocus: ((restoreFocus?: boolean) => void) | undefined;
  let pressedInside = false;
  let focusTimer: ReturnType<typeof setTimeout> | undefined;
  let styleRequest = 0;
  const isCurrent = () => !disposed && current.get(content.overlayId) === owner && host.isConnected && host.contains(root) && host.classList.contains('show');
  const close = (restoreFocus = true) => {
    if (disposed) return;
    disposed = true;
    observer.disconnect();
    if (focusTimer !== undefined) clearTimeout(focusTimer);
    host.removeEventListener('mousedown', onMouseDown);
    host.removeEventListener('click', onBackdrop);
    releaseFocus?.(restoreFocus);
    closeModalOverlay(host, { restoreFocus });
    void unmount(component); flushSync();
    if (current.get(content.overlayId) === owner) current.delete(content.overlayId);
  };
  const styles = () => {
    const request = ++styleRequest;
    component.setStyleError(false); flushSync();
    void loadSettingsStylesheet().then(() => {
      if (isCurrent() && request === styleRequest) { component.setStyleError(false); flushSync(); }
    }, () => {
      if (isCurrent() && request === styleRequest) { component.setStyleError(true); flushSync(); }
    });
  };
  const component = mount(AiActionDialog, { target: host, props: { content, actions: {
    choose: id => { if (!isCurrent()) return; close(); return choose(id); },
    close: () => { if (isCurrent()) close(); },
    retryStyles: () => { if (isCurrent()) styles(); },
  } } });
  flushSync();
  const root = host.querySelector<HTMLElement>('[data-ai-action-dialog-view]')!;
  const owner = { close };
  const onMouseDown = (event: MouseEvent) => { pressedInside = event.target instanceof Node && root.contains(event.target); };
  const onBackdrop = (event: MouseEvent) => {
    const startedInside = pressedInside; pressedInside = false;
    if (!startedInside && event.target === host && isCurrent()) close();
  };
  const observer = new MutationObserver(() => { if (!isCurrent()) close(false); });
  current.set(content.overlayId, owner);
  host.addEventListener('mousedown', onMouseDown);
  host.addEventListener('click', onBackdrop);
  openModalOverlay(host, { autoFocus: false });
  releaseFocus = trapModalFocus(host, { autoFocus: false, onEscape: () => close() });
  focusTimer = setTimeout(() => { if (isCurrent() && !root.contains(document.activeElement)) root.querySelector<HTMLButtonElement>('button')?.focus(); }, 50);
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
  styles();
}
