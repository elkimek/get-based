import ChatPersonalityEditor, { mount, unmount, flushSync } from './components/ChatPersonalityEditor.svelte.native.js';
import type { PersonaEditorActions, PersonaEditorContent } from './chat-persona-editor-contract.js';
import { openModalOverlay, closeModalOverlay, trapModalFocus, wireBackdropClose } from './modal-lifecycle.js';

const ID = 'chat-personality-editor-overlay';
let current: { overlay: HTMLElement; dispose(restoreFocus?: boolean): void; } | null = null;

/** Release the component even when an external modal closer removes its host. */
export function mountPersonaEditor(content: PersonaEditorContent, actions: PersonaEditorActions, host: string): HTMLElement {
  current?.dispose(false);
  const overlay = document.createElement('div');
  overlay.id = ID;
  overlay.className = 'modal-overlay chat-personality-editor-overlay gb:persona:z-[310] gb:persona:max-[600px]:p-0';
  overlay.setAttribute('data-chat-persona-editor-view', '');
  overlay.dataset.personaAgreementRequired = String(content.agreementRequired);
  if (content.agreementRequired) overlay.dataset.personaAgreementHost = host;

  let disposed = false;
  let releaseFocus: ((restoreFocus?: boolean) => void) | undefined;
  let focusTimer: ReturnType<typeof setTimeout> | undefined;
  const owns = () => !disposed && current === owner && overlay.isConnected && document.getElementById(ID) === overlay;
  const guarded = (action: () => unknown) => () => owns() ? action() : undefined;
  const component = mount(ChatPersonalityEditor, {
    target: overlay, props: {
      content, actions: {
        cancel: guarded(actions.cancel), generate: guarded(actions.generate),
        save: guarded(actions.save), changed: guarded(actions.changed),
      }
    }
  });
  flushSync();

  const dispose = (restoreFocus = true) => {
    if (disposed) return;
    disposed = true;
    observer.disconnect();
    overlay.removeEventListener('keydown', escape);
    if (focusTimer !== undefined) clearTimeout(focusTimer);
    releaseFocus?.(restoreFocus);
    closeModalOverlay(overlay, { restoreFocus });
    overlay.remove();
    void unmount(component);
    flushSync();
    if (current === owner) current = null;
  };
  const owner = { overlay, dispose };
  current = owner;
  const escape = (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || !owns()) return;
    event.preventDefault();
    event.stopPropagation();
    void actions.cancel();
  };
  const observer = new MutationObserver(() => { if (!owns()) dispose(false); });
  overlay.addEventListener('keydown', escape);
  overlay.setAttribute('data-modal-lifecycle-managed', '');
  wireBackdropClose(overlay, guarded(actions.cancel));
  document.body.appendChild(overlay);
  openModalOverlay(overlay, { autoFocus: false, scrollLock: true });
  releaseFocus = trapModalFocus(overlay, { autoFocus: false, closeOnEscape: false });
  focusTimer = setTimeout(() => {
    if (owns() && !overlay.contains(document.activeElement)) overlay.querySelector<HTMLInputElement>('#chat-personality-custom-name')?.focus();
  }, 50);
  observer.observe(document.body, { childList: true, subtree: true });
  return overlay;
}

export function closePersonaEditorOverlay(overlay: HTMLElement, restoreFocus = true): void {
  if (current?.overlay === overlay) current.dispose(restoreFocus);
}
