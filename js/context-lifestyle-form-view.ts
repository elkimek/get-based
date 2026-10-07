import { prepareContextFormDialog, releaseContextFormDialog } from './context-form-dialog.js';
// Live Svelte form ownership; public legacy URLs delegate here without DOM reads.
import Form, { mount, unmount, flushSync } from './components/LifestyleContextForm.svelte.native.js';
import { doesNutritionContextOverrideTypicalMeals } from './context-card-summaries.js';
import { openEMFAssessmentEditor } from './emf-runtime.js';
import { getLatitudeFromLocation } from './profile.js';
import { reopenSunSetup } from './sun-defaults.js';
import { closeLifestyleContextModalAndNavigateRuntime, updateLifestyleChatHeaderModelRuntime, openLightSetupFromLifestyleRuntime } from './context-card-lifestyle-runtime.js';
import { state } from './state.js';
import { openContextModalRuntime } from './context-cards-runtime.js';
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
  modal: HTMLElement;
  title: string;
  overlay: HTMLElement;
  session: ReturnType<typeof createLifestyleFormSession>;
  component: ReturnType<typeof Form>;
  observer: MutationObserver;
  saving: boolean;
  confirming: boolean;
  launching: boolean;
  message: string;
  afterCommit: (message: string) => void;
}
let view: View | null = null, request = 0;
function dispose(owned: View): void {
  owned.session.retire();
  owned.observer.disconnect();
  releaseContextFormDialog(owned.modal, owned.root, owned.title, 'lifestyle-form-title');
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
  if (!current(owned) || owned.saving || owned.launching)
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
    const cleared = clear || (owned.key === 'interpretiveLens' && typeof draft?.text === 'string' && !draft.text.trim());
    const message = `${owned.message} ${cleared ? 'cleared' : 'saved'}`;
    close(owned);
    try { owned.afterCommit(message); } catch { showNotification(message, 'success'); }
    return;
  }
  const status = result === 'conflict' ? 'Not saved — this context changed elsewhere. Your draft is kept; reopen to review the saved information.'
    : result === 'blocked' ? 'Not saved — reload profile. Your draft is kept here.' : 'Not saved — try again. Your draft is kept here.';
  owned.component.report(status, false);
  flushSync();
}
async function launchEMF(owned: View): Promise<void> {
  if (owned.key !== 'environment' || !current(owned) || owned.saving || owned.confirming || owned.launching) return;
  const profile = state.currentProfile, origin = state.importedData, ticket = request;
  owned.launching = true;
  owned.component.report('Opening EMF assessment…', true, 'Opening…');
  flushSync();
  await openEMFAssessmentEditor({
    isCurrent: () => current(owned) && request === ticket,
    returnLabel: 'Back to Environment & Exposures',
    onReturn: () => {
      if (request === ticket && state.currentProfile === profile && state.importedData === origin) void openLifestyleForm('environment');
    },
  });
  owned.launching = false;
  if (current(owned)) {
    owned.component.report('Could not open EMF assessment. Try again. Your draft is kept here.', false);
    flushSync();
  }
}
function launchLightSetup(owned: View): void {
  if (owned.key !== 'lightCircadian' || !current(owned) || owned.saving || owned.confirming) return;
  const profile = state.currentProfile, origin = state.importedData, ticket = request;
  close(owned);
  const content = owned.modal.firstElementChild;
  openLightSetupFromLifestyleRuntime(() => {
    if (owned.modal.isConnected && document.getElementById('detail-modal') === owned.modal
      && owned.modal.firstElementChild === content && !owned.overlay.classList.contains('show')
      && request === ticket && state.currentProfile === profile && state.importedData === origin
      && document.querySelector<HTMLElement>('.nav-item.active')?.dataset.category === 'light') reopenSunSetup();
  });
}
function backToContext(owned: View): void {
  if (!current(owned)) return;
  const profile = state.currentProfile, origin = state.importedData, ticket = request;
  close(owned);
  const content = owned.modal.firstElementChild;
  setTimeout(() => {
    if (ticket === request && state.currentProfile === profile && state.importedData === origin
      && document.getElementById('detail-modal') === owned.modal && owned.modal.firstElementChild === content
      && !owned.overlay.classList.contains('show')) openContextModalRuntime();
  }, 0);
}
function finishInterpretiveLens(message: string): void {
  updateLifestyleChatHeaderModelRuntime();
  const category = document.querySelector<HTMLElement>('.nav-item.active')?.dataset.category || 'dashboard';
  closeLifestyleContextModalAndNavigateRuntime(category);
  showNotification(message, message.endsWith('cleared') ? 'info' : 'success');
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
    const session = createLifestyleFormSession(key), model = lifestyleFormModel(key, origin, state.profileSex, { latitude: key === 'lightCircadian' ? getLatitudeFromLocation() : null, unitSystem: state.unitSystem, mealsPaused: key === 'diet' && doesNutritionContextOverrideTypicalMeals(state.nutritionSummary, origin) });
    prepareContextFormDialog(modal, model.title, 'lifestyle-form-title');
    let owned: View;
    const component = mount(Form, {
      target: modal, props: {
        model, initial: lifestyleDraft(model, origin), hasCurrent: key === 'interpretiveLens' ? !!origin.interpretiveLens : origin[key] != null,
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
        }, close: () => close(owned), back: () => backToContext(owned), openEMF: () => { void launchEMF(owned); }, openLightSetup: () => launchLightSetup(owned),
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
      key, root, modal, title: model.title, overlay, session, component, observer, saving: false, confirming: false, launching: false, message: model.message, afterCommit: key === 'interpretiveLens' ? finishInterpretiveLens : afterCommit
    };
    view = owned;
    openModalOverlay(overlay);
    if (model.textField) modal.querySelector<HTMLTextAreaElement>(`#${model.textField.id}`)?.focus({ preventScroll: true });
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
