import SyncDialog, { mount, unmount, flushSync } from './components/SyncDialog.svelte.native.js';
import { openModalOverlay, closeModalOverlay } from './modal-lifecycle.js';
import type { SyncDialogKind, SyncDialogState, SyncDialogView, SyncDialogOwner } from './sync-dialog-contract.js';
let current: SyncDialogOwner | null = null;
let view: SyncDialogView | null = null;
let host: HTMLElement | null = null;
let trigger: HTMLElement | null = null;
export function getSyncDialogOwner(kind?: SyncDialogKind): SyncDialogOwner | null {
  return current?.isCurrent() && (!kind || current.state().kind === kind) ? current : null;
}
export function disposeSyncDialog(restoreFocus = true): void {
  current = null;
  if (view) { flushSync(() => view?.clearSecrets()); void unmount(view); flushSync(); }
  view = null;
  if (host) {
    closeModalOverlay(host, { restoreFocus: false });
    host.removeAttribute('data-modal-focus-trap'); host.removeAttribute('data-modal-lifecycle-managed');
    host = null;
  }
  if (restoreFocus && trigger?.isConnected) trigger.focus();
  if (restoreFocus) trigger = null;
}
export function openSyncDialog(kind: SyncDialogKind, dismiss: () => void): SyncDialogOwner {
  const active = document.activeElement;
  const nextTrigger = host?.contains(active) ? trigger : active instanceof HTMLElement ? active : null;
  disposeSyncDialog(false); trigger = nextTrigger;
  let overlay = document.getElementById(kind === 'setup' ? 'sync-setup-overlay' : 'sync-restore-overlay');
  if (!overlay) {
    overlay = document.createElement('div'); overlay.id = kind === 'setup' ? 'sync-setup-overlay' : 'sync-restore-overlay';
    overlay.className = 'confirm-overlay'; document.body.appendChild(overlay);
  }
  host = overlay;
  overlay.setAttribute('data-modal-lifecycle-managed', ''); overlay.setAttribute('data-modal-focus-trap', '');
  openModalOverlay(overlay, { autoFocus: false, scrollLock: true });
  let state: SyncDialogState = { kind, step: kind === 'setup' ? 'choices' : 'join', pending: false, reloading: false, message: '', tone: 'secondary' };
  const owner: SyncDialogOwner = {
    isCurrent: () => current === owner && overlay.isConnected,
    state: () => state,
    update: next => { if (owner.isCurrent()) { state = next; flushSync(() => view?.update(state)); } },
    patch: patch => owner.update({ ...state, ...patch }),
    showGeneratedPhrase: phrase => { if (owner.isCurrent()) flushSync(() => view?.showGeneratedPhrase(phrase)); },
    readPhrase: () => owner.isCurrent() ? view?.readPhrase() || '' : '',
    validate: () => { if (owner.isCurrent()) flushSync(() => view?.validate()); },
    acknowledged: () => owner.isCurrent() && !!view?.acknowledged(),
    focusFirst: () => { if (owner.isCurrent()) view?.focusFirst(); },
    clearSecrets: () => { if (owner.isCurrent()) flushSync(() => view?.clearSecrets()); },
    close: () => { if (owner.isCurrent()) disposeSyncDialog(); },
    nudge: () => {
      if (!owner.isCurrent()) return;
      const dialog = overlay.querySelector('.confirm-dialog'); dialog?.classList.add('modal-nudge');
      dialog?.addEventListener('animationend', () => dialog.classList.remove('modal-nudge'), { once: true });
    },
  };
  current = owner;
  view = mount(SyncDialog, { target: overlay, props: { initial: state, dismiss } }); flushSync();
  owner.focusFirst(); return owner;
}
