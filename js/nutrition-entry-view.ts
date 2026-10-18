// Mounted entry forms own one profile, modal, route and accepted-write session.
import Entry, { mount, unmount, flushSync } from './components/NutritionEntry.svelte.native.js';
import { state } from './state.js';
import { routeRevision } from './route-lifecycle.js';
import { closeModalOverlay } from './modal-lifecycle.js';
import { createNutritionEntrySession } from './nutrition-entry-session.js';
import { entryResultMessage } from './nutrition-entry-model.js';
import { showNotification } from './utils.js';
import { ensureNutritionStylesheet } from './nutrition-render.js';
import type { NutritionEntryView } from './nutrition-entry-model.js';
interface Dependencies { refreshWidget(): unknown; closeEditor(): unknown; }
interface View {
  modal: HTMLElement; overlay: HTMLElement; root: HTMLElement; component: ReturnType<typeof Entry>;
  session: ReturnType<typeof createNutritionEntrySession>; observer: MutationObserver;
  failure: string; model: NutritionEntryView; route: number; geometry: string[];
  previousLabel: string | null; previousLabelledBy: string | null;
}
let deps: Dependencies = { refreshWidget() {}, closeEditor() {} };
let view: View | null = null, request = 0;
export function configureNutritionEntryView(value: Partial<Dependencies>) { deps = { ...deps, ...value }; }
export function captureNutritionEntryOpen() {
  const modal = document.getElementById('detail-modal'), overlay = document.getElementById('modal-overlay');
  if (!modal || !overlay) return null;
  const ticket = ++request, profile = state.currentProfile, data = state.importedData;
  const content = modal.firstElementChild, shown = overlay.classList.contains('show'), route = routeRevision();
  return { modal, overlay, current: () => ticket === request && state.currentProfile === profile && state.importedData === data
    && routeRevision() === route && modal.firstElementChild === content && overlay.classList.contains('show') === shown
    && document.getElementById('detail-modal') === modal && document.getElementById('modal-overlay') === overlay };
}
/** Preserve capture-before-await and the shared first-use stylesheet failure. */
export async function prepareNutritionEntryOpen(isCurrent: () => boolean = () => true) {
  const pending = captureNutritionEntryOpen();
  if (!pending) return null;
  const stylesheet = await ensureNutritionStylesheet();
  if (!pending.current() || !isCurrent()) return null;
  if (stylesheet?.type === 'error') {
    showNotification('Nutrition styles could not be loaded. Try again.', 'error');
    return null;
  }
  return pending;
}
/** A mounted editor awaiting draft restoration must not focus a retired owner. */
export function captureNutritionEditorRestore(modal: HTMLElement, overlay: HTMLElement) {
  const ticket = request, profile = state.currentProfile, data = state.importedData, route = routeRevision();
  const main = document.getElementById('main-content'), content = modal.firstElementChild, shown = overlay.classList.contains('show');
  return () => ticket === request && !!content?.isConnected && modal.firstElementChild === content
    && state.currentProfile === profile && state.importedData === data && routeRevision() === route
    && document.getElementById('main-content') === main && document.getElementById('detail-modal') === modal
    && document.getElementById('modal-overlay') === overlay && overlay.classList.contains('show') === shown;
}
function current(owned: View): boolean {
  return view === owned && owned.root.isConnected && owned.overlay.classList.contains('show') && owned.session.current()
    && routeRevision() === owned.route && document.getElementById('detail-modal') === owned.modal && document.getElementById('modal-overlay') === owned.overlay;
}
function dispose(owned: View): void {
  owned.session.retire(); owned.observer.disconnect();
  if (view === owned) view = null;
  if (owned.modal.getAttribute('aria-labelledby') === 'nutrition-entry-title') {
    if (owned.previousLabelledBy === null) owned.modal.removeAttribute('aria-labelledby');
    else owned.modal.setAttribute('aria-labelledby', owned.previousLabelledBy);
  }
  const label = owned.model.kind === 'targets' ? 'Nutrition setup' : 'Log a drink';
  if (owned.modal.getAttribute('aria-label') === label) {
    if (owned.previousLabel === null) owned.modal.removeAttribute('aria-label');
    else owned.modal.setAttribute('aria-label', owned.previousLabel);
  }
  delete owned.modal.dataset.nutritionEntryModal;
  owned.modal.classList.remove(...owned.geometry);
  void unmount(owned.component); flushSync();
}
export function mountNutritionEntry(modal: HTMLElement, overlay: HTMLElement, model: NutritionEntryView, returnHistory: () => unknown): () => boolean {
  if (view) dispose(view);
  modal.replaceChildren();
  const previousLabel = modal.getAttribute('aria-label'), previousLabelledBy = modal.getAttribute('aria-labelledby');
  const geometry = (model.kind === 'targets'
    ? 'gb:nutrition-entry-modal:w-[min(860px,96vw)] gb:nutrition-entry-modal:max-w-[860px]'
    : 'gb:nutrition-entry-modal:w-[min(640px,96vw)] gb:nutrition-entry-modal:max-w-[640px]').split(' ');
  geometry.push('gb:nutrition-entry-modal:max-[720px]:w-full', 'gb:nutrition-entry-modal:max-[720px]:max-w-full');
  modal.dataset.nutritionEntryModal = model.kind; modal.classList.add(...geometry);
  modal.setAttribute('aria-labelledby', 'nutrition-entry-title');
  modal.setAttribute('aria-label', model.kind === 'targets' ? 'Nutrition setup' : 'Log a drink');
  const session = createNutritionEntrySession(); let owned: View;
  const component = mount(Entry, { target: modal, props: { view: model, actions: {
    current: () => !!owned && current(owned),
    failureMessage: () => owned?.failure || '',
    notify: message => { if (current(owned)) showNotification(message, 'error'); },
    async saveTargets(value, closeOnSave = true) {
      if (!current(owned)) return false;
      const result = await session.saveTargets(value);
      if (!current(owned)) return false;
      if (result !== 'saved') { owned.failure = entryResultMessage(result); showNotification(owned.failure, 'error'); return false; }
      deps.refreshWidget(); showNotification('Nutrition setup saved.', 'success');
      if (closeOnSave) {
        if (model.kind === 'targets' && model.returnTo === 'history') await returnHistory();
        else deps.closeEditor();
      }
      return true;
    },
    async saveFluid(value) {
      if (!current(owned)) return false;
      const result = await session.saveFluid(value);
      if (!current(owned)) return false;
      if (result !== 'saved') { owned.failure = session.failureMessage() || 'Drink could not be saved. Your entry is still here; try again.'; showNotification(owned.failure, 'error'); return false; }
      deps.refreshWidget(); deps.closeEditor();
      const names: Record<string, string> = { water: 'Water', 'tea-coffee': 'Tea or coffee', other: 'Beverage' };
      showNotification(`${value.label.trim() || names[value.kind] || 'Beverage'} logged.`, 'success');
      return true;
    },
  } } }); flushSync();
  const root = modal.querySelector<HTMLElement>('[data-nutrition-entry-view]')!;
  const observer = new MutationObserver(() => {
    if (current(owned)) return;
    if (modal.contains(root) && overlay.classList.contains('show')) closeModalOverlay(overlay);
    dispose(owned);
  });
  owned = { failure: '', modal, overlay, root, component, session, observer, model, route: routeRevision(), geometry, previousLabel, previousLabelledBy };
  view = owned;
  observer.observe(document.documentElement, { childList: true, subtree: true });
  observer.observe(overlay, { attributes: true, attributeFilter: ['class'] });
  return () => current(owned);
}
export function saveNutritionTargets({ closeOnSave = true } = {}): Promise<boolean> {
  return view?.model.kind === 'targets' && current(view) ? view.component.save(closeOnSave) : Promise.resolve(false);
}
export async function saveFluidLog(): Promise<void> {
  if (view?.model.kind === 'fluid' && current(view)) await view.component.save();
}
export function updateNutritionTargetControls() { if (view?.model.kind === 'targets' && current(view)) { view.component.update(); flushSync(); } }
export const updateNutritionWidgetMetricControls = updateNutritionTargetControls;
export function updateFluidLogControls() { if (view?.model.kind === 'fluid' && current(view)) { view.component.update(); flushSync(); } }
function retireStale(): void {
  if (view && !current(view)) { const owned = view; if (owned.modal.contains(owned.root)) closeModalOverlay(owned.overlay); dispose(owned); }
}
if (typeof globalThis.addEventListener === 'function') {
  globalThis.addEventListener('labcharts-profile-switched', retireStale);
  globalThis.addEventListener('labcharts-sync-applied', retireStale);
}
