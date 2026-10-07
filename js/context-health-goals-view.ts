// Live goals dialog: presentation updates retain the input; accepted writes own their origin.
import Goals, { mount, unmount, flushSync } from './components/ContextHealthGoals.svelte.native.js';
import { state } from './state.js';
import { runWithContextEditorStylesheet } from './context-card-editor-ui.js';
import { prepareContextFormDialog, releaseContextFormDialog } from './context-form-dialog.js';
import { closeModalOverlay, openModalOverlay } from './modal-lifecycle.js';
import { closeLifestyleContextModalAndNavigateRuntime } from './context-card-lifestyle-runtime.js';
import { showConfirmDialog, showNotification } from './utils.js';
import { createHealthGoalsSession } from './context-health-goals-session.js';
import type { HealthGoalMutation } from './context-health-goals-session.js';
interface View {
  modal: HTMLElement; overlay: HTMLElement; root: HTMLElement; component: ReturnType<typeof Goals>;
  session: ReturnType<typeof createHealthGoalsSession>; observer: MutationObserver;
  observed: unknown; busy: boolean; confirming: boolean;
}
const TITLE = 'Health Goals', TITLE_ID = 'context-health-goals-title';
const activeCategory = () => document.querySelector<HTMLElement>('.nav-item.active')?.dataset.category || 'dashboard';
let view: View | null = null, request = 0;
function current(owned: View): boolean { return view === owned && owned.root.isConnected && owned.overlay.classList.contains('show') && owned.session.current(); }
function dispose(owned: View): void {
  owned.session.retire(); owned.observer.disconnect();
  releaseContextFormDialog(owned.modal, owned.root, TITLE, TITLE_ID);
  const replacement = owned.modal.querySelector('[data-context-goals-view]');
  if (owned.modal.dataset.syncRefreshKind === 'healthGoals' && (!replacement || replacement === owned.root)) delete owned.modal.dataset.syncRefreshKind;
  if (view === owned) view = null;
  void unmount(owned.component); flushSync();
}
function close(owned: View): void { if (current(owned)) { closeModalOverlay(owned.overlay); dispose(owned); } }
function refresh(owned: View): void {
  if (!current(owned)) return;
  owned.observed = structuredClone(state.importedData.healthGoals);
  owned.component.refresh(owned.observed); flushSync();
}
function finish(owned: View, message: string): void {
  if (!current(owned) || owned.busy) return;
  close(owned);
  closeLifestyleContextModalAndNavigateRuntime(activeCategory());
  if (message) showNotification(message, message.endsWith('cleared') ? 'info' : 'success');
}
async function mutate(owned: View, intent: HealthGoalMutation, observed = owned.observed): Promise<void> {
  if (!current(owned) || owned.busy) return;
  owned.busy = true; owned.component.report('Saving…', true); flushSync();
  const result = await owned.session.mutate(intent, observed);
  owned.busy = false;
  if (!current(owned)) return;
  if (result === 'saved') {
    refresh(owned); owned.component.report('Saved', false, intent.kind === 'add'); flushSync();
    if (intent.kind === 'add') owned.component.focusInput();
    if (intent.kind === 'clear') finish(owned, 'Health goals cleared');
    return;
  }
  const message = result === 'conflict' ? 'Not saved — goals changed elsewhere. Reload the profile to review them. Your input is kept here.'
    : result === 'blocked' ? 'Not saved — reload profile. Your input is kept here.'
    : result === 'empty' ? 'Enter a goal to add.' : 'Not saved — try again. Your input is kept here.';
  owned.component.report(message, false); flushSync();
}
export function addHealthGoal(): Promise<void> | undefined {
  if (!view || !current(view)) return;
  const draft = view.component.readDraft(); return mutate(view, { kind: 'add', ...draft });
}
export function deleteHealthGoal(index: number): Promise<void> | undefined { if (view && current(view)) return mutate(view, { kind: 'remove', index }); return undefined; }
export function clearHealthGoals(): Promise<void> | undefined { if (view && current(view)) return mutate(view, { kind: 'clear' }); return undefined; }
export function closeHealthGoals(): void { if (view) finish(view, state.importedData.healthGoals?.length ? 'Health goals saved' : ''); }
async function confirmClear(owned: View): Promise<void> {
  if (!current(owned) || owned.busy || owned.confirming) return;
  owned.confirming = true;
  const observed = structuredClone(owned.observed);
  const confirmed = await showConfirmDialog('Clear all saved health goals information? This cannot be undone.', { confirmLabel: 'Clear', ariaLabel: 'Clear Health Goals' });
  owned.confirming = false;
  if (confirmed && current(owned)) await mutate(owned, { kind: 'clear' }, observed);
}
export function renderHealthGoalsModal(modal: HTMLElement | null): void | Promise<unknown> {
  if (!modal) return;
  if (view?.modal === modal && current(view)) { refresh(view); return; }
  if (document.getElementById('detail-modal') === modal) return openHealthGoalsEditor();
}
export function openHealthGoalsEditor(): void | Promise<unknown> {
  const profile = state.currentProfile, origin = state.importedData, ticket = ++request;
  const content = document.getElementById('detail-modal')?.firstElementChild;
  const surface = document.getElementById('main-content')?.firstElementChild;
  return runWithContextEditorStylesheet(() => {
    if (ticket !== request || state.currentProfile !== profile || state.importedData !== origin
      || document.getElementById('detail-modal')?.firstElementChild !== content
      || document.getElementById('main-content')?.firstElementChild !== surface) return;
    const modal = document.getElementById('detail-modal'), overlay = document.getElementById('modal-overlay');
    if (!modal || !overlay) return;
    if (view) dispose(view);
    prepareContextFormDialog(modal, TITLE, TITLE_ID); modal.dataset.syncRefreshKind = 'healthGoals';
    let owned: View;
    const component = mount(Goals, { target: modal, props: {
      initial: structuredClone(origin.healthGoals), current: () => !!owned && current(owned),
      add: () => { void addHealthGoal(); }, remove: (index: number) => { if (current(owned)) void mutate(owned, { kind: 'remove', index }); },
      clear: () => { void confirmClear(owned); }, done: () => { if (current(owned)) closeHealthGoals(); }, close: () => close(owned)
    } }); flushSync();
    const root = modal.querySelector<HTMLElement>('[data-context-goals-view]')!;
    const observer = new MutationObserver(() => {
      if (current(owned)) return;
      if (modal.contains(root)) closeModalOverlay(overlay);
      dispose(owned);
    });
    owned = { modal, overlay, root, component, observer, session: createHealthGoalsSession(), observed: structuredClone(origin.healthGoals), busy: false, confirming: false };
    view = owned; openModalOverlay(overlay);
    observer.observe(document.documentElement, { childList: true, subtree: true });
    observer.observe(overlay, { attributes: true, attributeFilter: ['class'] });
    component.focusInput();
  });
}
if (typeof globalThis.addEventListener === 'function') {
  globalThis.addEventListener('labcharts-sync-applied', () => { if (view) refresh(view); });
  globalThis.addEventListener('labcharts-profile-switched', () => { ++request; if (view) { closeModalOverlay(view.overlay); dispose(view); } });
}
