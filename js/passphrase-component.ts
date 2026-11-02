// One mounted owner; responses cannot close or update a newer dialog.
import { createRetryingModuleLoader } from './retrying-module-loader.js';
import { state as appState } from './state.js';
import { PASSPHRASE_DIALOG, PASSPHRASE_OVERLAY, PASSPHRASE_PRIMARY } from './passphrase-classes.js';
import { openModalOverlay, closeModalOverlay } from './modal-lifecycle.js';
import { initialPassphraseState } from './passphrase-presentation.js';
import type { PassphraseKind, PassphraseActions, PassphraseOwner, PassphraseView } from './passphrase-contract.js';
let current: PassphraseOwner | null = null;
let view: PassphraseView | null = null;
let host: HTMLElement | null = null;
type Presentation = typeof import('./components/PassphraseDialog.svelte.native.js');
const presentation = createRetryingModuleLoader<Presentation>(retry => retry
    ? import('./components/PassphraseDialog.svelte.native.js?lazy-retry=1' as './components/PassphraseDialog.svelte.native.js')
    : import('./components/PassphraseDialog.svelte.native.js'));
export function preparePassphrasePresentation() { return presentation.load(); }
let loading: HTMLElement | null = null;
function disposeView(): void {
    if (view) {
        presentation.module!.flushSync(() => view?.clearSecrets());
        void presentation.module!.unmount(view);
        presentation.module!.flushSync();
    }
    loading?.remove(); loading = null;
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
    let focusRequested = false;
    const profile = appState.currentProfile;
    const owner: PassphraseOwner = {
        isCurrent: () => current === owner && overlay.isConnected,
        update: patch => {
            if (!owner.isCurrent())
                return;
            state = { ...state, ...patch };
            presentation.module?.flushSync(() => view?.update(state));
        },
        clearUnlock: () => { if (owner.isCurrent())
            presentation.module?.flushSync(() => view?.clearUnlock()); },
        focusFirst: () => { if (owner.isCurrent()) {
            focusRequested = true; view?.focusFirst(); } },
        close: () => {
            if (!owner.isCurrent())
                return;
            disposePassphraseDialog();
        },
    };
    current = owner;
    const mountView = (module: Presentation) => {
        if (!owner.isCurrent()) return;
        if (appState.currentProfile !== profile) { owner.close(); return; }
        loading?.remove(); loading = null;
        view = module.mount(module.default, { target: overlay, props: { initial: state, actions } });
        module.flushSync();
        if (focusRequested) view.focusFirst();
    };
    const load = () => {
        if (!owner.isCurrent()) return;
        const shell = document.createElement('div'); shell.className = PASSPHRASE_OVERLAY;
        const box = document.createElement('div'); box.className = PASSPHRASE_DIALOG; shell.append(box);
        box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-label', 'Passphrase controls');
        box.setAttribute('aria-busy', 'true');
        const status = document.createElement('p'); status.setAttribute('role', 'status'); status.textContent = 'Loading passphrase controls…'; box.append(status);
        loading?.remove(); loading = shell; overlay.append(shell);
        void preparePassphrasePresentation().then(mountView).catch(() => {
            if (!owner.isCurrent() || loading !== shell) return;
            if (appState.currentProfile !== profile) { owner.close(); return; }
            box.setAttribute('aria-busy', 'false');
            status.textContent = 'Passphrase controls could not be loaded. Try again.';
            const retry = document.createElement('button'); retry.type = 'button'; retry.className = PASSPHRASE_PRIMARY; retry.textContent = 'Retry'; retry.addEventListener('click', load); box.append(retry); retry.focus();
        });
    };
    if (presentation.module) mountView(presentation.module); else load();
    return owner;
}
