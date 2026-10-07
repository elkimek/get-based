// Live Svelte form ownership; public legacy URLs delegate here without DOM reads.
import Form, { mount, unmount, flushSync } from './components/LifestyleContextForm.svelte.native.js';
import { state } from './state.js';
import { runWithContextEditorStylesheet } from './context-card-editor-ui.js';
import { closeModalOverlay, openModalOverlay } from './modal-lifecycle.js';
import { showConfirmDialog, showNotification } from './utils.js';
import { createLifestyleFormSession } from './context-lifestyle-form-session.js';
import { lifestyleDraft, lifestyleFormModel } from './context-lifestyle-form-model.js';
import type { LifestyleFormKey } from './context-lifestyle-form-model.js';
let afterCommit: (message: string) => void = message => { showNotification(message, 'success'); };
export function configureLifestyleFormView(callback?: (message: string) => void): void {
  if (callback) afterCommit = callback;
}
interface View {
  key: LifestyleFormKey;
  root: HTMLElement;
  overlay: HTMLElement;
  session: ReturnType<typeof createLifestyleFormSession>;
  component: ReturnType<typeof Form>;
  observer: MutationObserver;
  saving: boolean;
  confirming: boolean;
  message: string;
  afterCommit: (message: string) => void;
}
let view: View | null = null, request = 0;
function dispose(owned: View): void {
  owned.session.retire();
  owned.observer.disconnect();
  const modal = owned.root.parentElement;
  if (modal) {
    delete modal.dataset.contextFormModal;
    modal.removeAttribute('aria-labelledby');
  }
  if (view === owned)
    view = null;
  void unmount(owned.component);
  flushSync();
}
function current(owned: View): boolean { return view === owned && owned.root.isConnected && owned.overlay.classList.contains('show') && owned.session.current(); }
function close(owned: View): void {
  if (!current(owned)) return;
  closeModalOverlay(owned.overlay);
  dispose(owned);
}
export function saveLifestyleForm(key: LifestyleFormKey, clear = false): Promise<unknown> | undefined {
  const owned = view;
  if (!owned || owned.key !== key || !current(owned))
    return;
  return save(owned, clear);
}
async function save(owned: View, clear: boolean): Promise<void> {
  if (!current(owned) || owned.saving)
    return;
  owned.saving = true;
  flushSync();
  const draft = clear ? null : owned.component.readDraft();
  owned.component.report('Saving…', true);
  flushSync();
  const result = await owned.session.save(draft);
  owned.saving = false;
  if (!current(owned))
    return;
  if (result === 'saved') {
    const message = `${owned.message} ${clear ? 'cleared' : 'saved'}`;
    close(owned);
    try { owned.afterCommit(message); } catch { showNotification(message, 'success'); }
    return;
  }
  const status = result === 'conflict' ? 'Not saved — this context changed elsewhere. Your draft is kept; reopen to review the saved information.'
    : result === 'blocked' ? 'Not saved — reload profile. Your draft is kept here.' : 'Not saved — try again. Your draft is kept here.';
  owned.component.report(status, false);
  flushSync();
}
export function openLifestyleForm(key: LifestyleFormKey): void | Promise<unknown> {
  const profile = state.currentProfile, origin = state.importedData, ticket = ++request;
  const surface = document.getElementById('main-content')?.firstElementChild;
  const previousContent = document.getElementById('detail-modal')?.firstElementChild;
  return runWithContextEditorStylesheet(() => {
    if (ticket !== request || state.currentProfile !== profile || state.importedData !== origin
      || document.getElementById('main-content')?.firstElementChild !== surface
      || document.getElementById('detail-modal')?.firstElementChild !== previousContent)
      return;
    const modal = document.getElementById('detail-modal'), overlay = document.getElementById('modal-overlay');
    if (!modal || !overlay)
      return;
    if (view)
      dispose(view);
    const session = createLifestyleFormSession(key), model = lifestyleFormModel(key, origin, state.profileSex);
    modal.replaceChildren();
    modal.className = 'modal gb:context-form:w-[min(94vw,760px)] gb:context-form:max-w-[760px] gb:context-form:max-h-[min(90vh,860px)] gb:context-form:p-0 gb:context-form:overflow-y-auto gb:context-form:overflow-x-hidden gb:context-form:bg-secondary-surface gb:context-form:shadow-dialog gb:context-form:max-[720px]:w-[calc(100vw-24px)] gb:context-form:max-[720px]:max-h-[calc(100dvh-24px)]';
    modal.dataset.contextFormModal = '';
    modal.setAttribute('aria-labelledby', 'lifestyle-form-title');
    modal.setAttribute('aria-label', model.title);
    modal.scrollTop = 0;
    let owned: View;
    const component = mount(Form, {
      target: modal, props: {
        model, initial: lifestyleDraft(model, origin), hasCurrent: origin[key] != null,
        current: () => !!owned && current(owned), save: () => { void save(owned, false); },
        clear: () => {
          void (async () => {
            if (!current(owned) || owned.confirming || owned.saving)
              return;
            owned.confirming = true;
            const confirmed = await showConfirmDialog(`Clear all saved ${model.title.toLowerCase()} information? This cannot be undone.`, {
              confirmLabel: 'Clear', ariaLabel: `Clear ${model.title}`
            });
            owned.confirming = false;
            if (confirmed && current(owned))
              await save(owned, true);
          })();
        }, close: () => close(owned),
      }
    });
    flushSync();
    const root = modal.querySelector<HTMLElement>('[data-context-form-view]')!;
    const observer = new MutationObserver(() => {
      if (current(owned)) return;
      if (modal.contains(root)) {
        closeModalOverlay(overlay);
        delete modal.dataset.contextFormModal;
      }
      dispose(owned);
    });
    owned = {
      key, root, overlay, session, component, observer, saving: false, confirming: false, message: model.message, afterCommit
    };
    view = owned;
    openModalOverlay(overlay);
    observer.observe(document.documentElement, {
      childList: true, subtree: true
    });
    observer.observe(overlay, {
      attributes: true, attributeFilter: ['class']
    });
  });
}
if (typeof globalThis.addEventListener === 'function')
  globalThis.addEventListener('labcharts-profile-switched', () => {
    ++request;
    if (view) {
      closeModalOverlay(view.overlay);
      dispose(view);
    }
  });
