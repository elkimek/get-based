// One mounted owner; responses cannot close or update a newer dialog.
import PassphraseDialog, { mount, unmount, flushSync } from './components/PassphraseDialog.svelte.native.js';
import { openModalOverlay, closeModalOverlay } from './modal-lifecycle.js';
import { initialPassphraseState } from './passphrase-presentation.js';
import type { PassphraseKind, PassphraseActions, PassphraseOwner, PassphraseView } from './passphrase-contract.js';
let current: PassphraseOwner | null = null;
let view: PassphraseView | null = null;
let host: HTMLElement | null = null;
function disposeView(): void {
    if (view) {
        flushSync(() => view?.clearSecrets());
        void unmount(view);
        flushSync();
    }
    view = null;
}
export function disposePassphraseDialog(restoreFocus = true): void {
    current = null;
    disposeView();
    if (host) {
        host.style.display = 'none';
        host.removeAttribute('data-modal-focus-trap');
        host.removeAttribute('data-modal-lifecycle-managed');
        closeModalOverlay(host, { restoreFocus });
        host = null;
    }
}
export function isPassphraseDialogVisible(): boolean { return !!current?.isCurrent(); }
export function openPassphraseDialog(kind: PassphraseKind, actions: PassphraseActions): PassphraseOwner {
    disposeView();
    let overlay = document.getElementById('passphrase-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'passphrase-overlay';
        overlay.className = 'passphrase-overlay';
        document.body.appendChild(overlay);
    }
    if (host && host !== overlay)
        closeModalOverlay(host, { restoreFocus: false });
    host = overlay;
    overlay.style.display = 'flex';
    overlay.setAttribute('data-modal-lifecycle-managed', '');
    overlay.setAttribute('data-modal-focus-trap', '');
    openModalOverlay(overlay, { scrollLock: true, autoFocus: false });
    let state = initialPassphraseState(kind);
    const owner: PassphraseOwner = {
        isCurrent: () => current === owner && overlay.isConnected,
        update: patch => {
            if (!owner.isCurrent())
                return;
            state = { ...state, ...patch };
            flushSync(() => view?.update(state));
        },
        clearUnlock: () => { if (owner.isCurrent())
            flushSync(() => view?.clearUnlock()); },
        focusFirst: () => { if (owner.isCurrent())
            view?.focusFirst(); },
        close: () => {
            if (!owner.isCurrent())
                return;
            disposePassphraseDialog();
        },
    };
    current = owner;
    view = mount(PassphraseDialog, { target: overlay, props: { initial: state, actions } });
    flushSync();
    return owner;
}
