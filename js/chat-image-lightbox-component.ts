import ChatImageLightbox, { mount, unmount, flushSync } from './components/ChatImageLightbox.svelte.native.js';
import { openModalOverlay, closeModalOverlay, trapModalFocus } from './modal-lifecycle.js';
import { chatAttachmentImageURL } from './chat-attachment-view.js';
let current: { close(restoreFocus?: boolean): void; } | null = null;
export function openChatImageLightbox(value: unknown): void {
  const src = chatAttachmentImageURL(value); if (!src) return;
  current?.close(false);
  const host = document.createElement('div'); host.dataset.chatImageLightboxHost = '';
  let disposed = false, releaseFocus: ((restoreFocus?: boolean) => void) | undefined;
  const close = (restoreFocus = true) => {
    if (disposed) return;
    disposed = true; observer.disconnect(); releaseFocus?.(restoreFocus);
    closeModalOverlay(overlay, { restoreFocus }); host.remove();
    void unmount(component); flushSync(); if (current === owner) current = null;
  };
  const component = mount(ChatImageLightbox, { target: host, props: { src, close: () => close() } });
  flushSync();
  const overlay = host.querySelector<HTMLElement>('.chat-lightbox')!;
  overlay.setAttribute('data-modal-lifecycle-managed', '');
  const owner = { close }; current = owner;
  const observer = new MutationObserver(() => { if (!host.isConnected || !overlay.isConnected) close(false); });
  document.body.appendChild(host);
  openModalOverlay(overlay, { autoFocus: false, scrollLock: true });
  releaseFocus = trapModalFocus(overlay, { autoFocus: false, closeOnEscape: false });
  overlay.querySelector<HTMLButtonElement>('button')!.focus();
  observer.observe(document.body, { childList: true, subtree: true });
}
