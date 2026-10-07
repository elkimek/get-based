// One live authored Medical History draft, captured profile and modal owner.
import MedicalHistory, { mount, unmount, flushSync } from './components/ContextMedicalHistory.svelte.native.js';
import { state } from './state.js';
import { medicalHistoryDraft } from './context-medical-history-model.js';
import type { Diagnoses } from '../types/profile-context-data.js';
import { createMedicalHistorySession } from './context-medical-history-session.js';
import { prepareContextFormDialog, releaseContextFormDialog } from './context-form-dialog.js';
import { runWithContextEditorStylesheet } from './context-card-editor-ui.js';
import { closeModalOverlay, openModalOverlay } from './modal-lifecycle.js';
import { showConfirmDialog, showNotification } from './utils.js';
import type { LifestyleEditorDependencies } from './context-card-editor-ui.js';
export interface MedicalHistoryEditorDependencies extends LifestyleEditorDependencies { close?: (() => void) | undefined; }
interface View {
  root: HTMLElement; modal: HTMLElement; overlay: HTMLElement; observer: MutationObserver;
  component: ReturnType<typeof MedicalHistory>; session: ReturnType<typeof createMedicalHistorySession>;
  busy: boolean; confirming: boolean; afterCommit(message: string): void; afterClose(): void;
}
const TITLE = 'Medical History', TITLE_ID = 'context-medical-title';
let view: View | null = null, request = 0;
let afterCommit = (message: string) => { showNotification(message, 'success'); }, afterClose = () => {};
export function configureMedicalHistoryEditor(deps: MedicalHistoryEditorDependencies = {}): void {
  if (typeof deps.afterCommit === 'function') afterCommit = deps.afterCommit;
  else if (typeof deps.saveAndRefresh === 'function') { const callback = deps.saveAndRefresh; afterCommit = message => callback(message, 'diagnoses'); }
  if (typeof deps.close === 'function') afterClose = deps.close;
}
function current(owned: View): boolean { return view === owned && owned.root.isConnected && owned.overlay.classList.contains('show') && owned.session.current(); }
function dispose(owned: View): void {
  owned.observer.disconnect(); owned.session.retire();
  releaseContextFormDialog(owned.modal, owned.root, TITLE, TITLE_ID);
  if (view === owned) view = null;
  void unmount(owned.component); flushSync();
}
function close(owned: View, notify = true): void {
  if (!current(owned)) return;
  closeModalOverlay(owned.overlay); dispose(owned);
  if (notify) try { owned.afterClose(); } catch { /* Closing is already complete. */ }
}
export function closeDiagnoses(): void { ++request; if (view) close(view); }
export function medicalHistoryAction(name: string, argument?: number | string): void {
  if (!view || !current(view) || view.busy) return;
  view.component.action(name, argument); flushSync();
}
export function hideMedicalHistorySuggestions(event?: MouseEvent): void {
  if (view && current(view) && (!event || !(event.target instanceof Node) || !view.root.contains(event.target))) {
    view.component.hideSuggestions(); flushSync();
  }
}
export function saveDiagnoses(): Promise<void> | undefined { if (view) return save(view, false); return undefined; }
export function clearDiagnoses(): Promise<void> | undefined { if (view) return save(view, true); return undefined; }
async function save(owned: View, clear: boolean): Promise<void> {
  if (!current(owned) || owned.busy) return;
  // Compatibility callers can assign an owned control's value before invoking Save.
  owned.component.action('syncDiagnosesNote'); flushSync();
  const value = clear ? null : owned.component.readDraft();
  owned.busy = true; owned.component.report('Saving…', true); flushSync();
  const result = await owned.session.save(value); owned.busy = false;
  if (!current(owned)) return;
  if (result === 'saved') {
    const message = `Medical history ${clear ? 'cleared' : 'saved'}`;
    close(owned, false);
    try { owned.afterCommit(message); } catch { showNotification(message, 'success'); }
    return;
  }
  owned.component.report(result === 'conflict' ? 'Not saved — medical history changed elsewhere. Your draft is kept; reopen to review the saved information.'
    : result === 'blocked' ? 'Not saved — reload profile. Your draft is kept here.' : 'Not saved — try again. Your draft is kept here.', false);
  flushSync();
}
async function confirmClear(owned: View): Promise<void> {
  if (!current(owned) || owned.busy || owned.confirming) return;
  owned.confirming = true;
  const confirmed = await showConfirmDialog('Clear all saved medical history information? This cannot be undone.', { confirmLabel: 'Clear', ariaLabel: 'Clear Medical History' });
  owned.confirming = false;
  if (confirmed && current(owned)) await save(owned, true);
}
export function renderDiagnosesModal(modal: HTMLElement | null, initial?: Diagnoses | null): void | Promise<unknown> {
  if (!modal || document.getElementById('detail-modal') !== modal) return;
  // A sync refresh must never replace the live unsaved draft.
  if (view?.modal === modal && current(view)) return;
  return openDiagnosesEditor(initial);
}
export function openDiagnosesEditor(initial?: Diagnoses | null): void | Promise<unknown> {
  const profile = state.currentProfile, origin = state.importedData, ticket = ++request;
  const source = medicalHistoryDraft(initial === undefined ? origin.diagnoses : initial);
  const content = document.getElementById('detail-modal')?.firstElementChild, surface = document.getElementById('main-content')?.firstElementChild;
  return runWithContextEditorStylesheet(() => {
    if (ticket !== request || state.currentProfile !== profile || state.importedData !== origin
      || document.getElementById('detail-modal')?.firstElementChild !== content || document.getElementById('main-content')?.firstElementChild !== surface) return;
    const modal = document.getElementById('detail-modal'), overlay = document.getElementById('modal-overlay');
    if (!modal || !overlay) return;
    if (view) dispose(view);
    prepareContextFormDialog(modal, TITLE, TITLE_ID);
    let owned: View;
    const component = mount(MedicalHistory, { target: modal, props: {
      initial: source, sex: state.profileSex || '', current: () => !!owned && current(owned),
      save: () => { void save(owned, false); }, clear: () => { void confirmClear(owned); }, close: () => close(owned),
    } }); flushSync();
    const root = modal.querySelector<HTMLElement>('[data-context-medical-view]')!;
    const observer = new MutationObserver(() => {
      if (current(owned)) return;
      if (modal.contains(root)) closeModalOverlay(overlay);
      dispose(owned);
    });
    owned = { root, modal, overlay, observer, component, session: createMedicalHistorySession(), busy: false, confirming: false, afterCommit, afterClose };
    view = owned; openModalOverlay(overlay);
    observer.observe(document.documentElement, { childList: true, subtree: true });
    observer.observe(overlay, { attributes: true, attributeFilter: ['class'] });
  });
}
if (typeof globalThis.addEventListener === 'function') globalThis.addEventListener('labcharts-profile-switched', () => {
  ++request; if (view) { closeModalOverlay(view.overlay); dispose(view); }
});
