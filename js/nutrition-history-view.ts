import { routeRevision } from './route-lifecycle.js';
// Own the live read-only History surface; delegated nutrition actions stay stable.
import History, { mount, unmount, flushSync } from './components/NutritionHistory.svelte.native.js';
import { state } from './state.js';
import { closeModalOverlay } from './modal-lifecycle.js';
import type { NutritionHistoryView } from './nutrition-presentation-model.js';
interface View {
  root: HTMLElement; modal: HTMLElement; overlay: HTMLElement; profile: string;
  data: typeof state.importedData; route: number; component: ReturnType<typeof History>; observer: MutationObserver;
  previousLabel: string | null; previousLabelledBy: string | null;
}
const geometry = 'gb:nutrition-modal:w-[min(960px,96vw)] gb:nutrition-modal:max-w-[960px]';
let view: View | null = null;
function current(owned: View): boolean {
  return view === owned && owned.root.isConnected && owned.overlay.classList.contains('show')
    && state.currentProfile === owned.profile && state.importedData === owned.data && routeRevision() === owned.route;
}
function dispose(owned: View): void {
  owned.observer.disconnect();
  if (view === owned) view = null;
  // Only release attributes still owned by this view. A replacement keeps its name.
  if (!owned.modal.querySelector('[data-nutrition-history-view]') || owned.modal.contains(owned.root)) {
    if (owned.modal.getAttribute('aria-labelledby') === 'nutrition-history-title') {
      if (owned.previousLabelledBy === null) owned.modal.removeAttribute('aria-labelledby');
      else owned.modal.setAttribute('aria-labelledby', owned.previousLabelledBy);
    }
    if (owned.modal.getAttribute('aria-label') === 'Meals & Nutrition history') {
      if (owned.previousLabel === null) owned.modal.removeAttribute('aria-label');
      else owned.modal.setAttribute('aria-label', owned.previousLabel);
    }
    delete owned.modal.dataset.nutritionHistoryModal;
    owned.modal.classList.remove('nutrition-history-modal', ...geometry.split(' '));
  }
  void unmount(owned.component); flushSync();
}
export function mountNutritionHistory(modal: HTMLElement, overlay: HTMLElement, model: NutritionHistoryView): () => boolean {
  if (view) dispose(view);
  modal.replaceChildren();
  const previousLabel = modal.getAttribute('aria-label'), previousLabelledBy = modal.getAttribute('aria-labelledby');
  modal.dataset.nutritionHistoryModal = '';
  modal.classList.add('nutrition-modal', 'nutrition-history-modal', ...geometry.split(' '));
  modal.setAttribute('aria-labelledby', 'nutrition-history-title'); modal.setAttribute('aria-label', 'Meals & Nutrition history');
  let owned: View;
  const component = mount(History, { target: modal, props: { view: model, current: () => !!owned && current(owned) } }); flushSync();
  const root = modal.querySelector<HTMLElement>('[data-nutrition-history-view]')!;
  const observer = new MutationObserver(() => {
    if (current(owned)) return;
    if (modal.contains(root) && overlay.classList.contains('show')) closeModalOverlay(overlay);
    dispose(owned);
  });
  owned = { root, modal, overlay, component, observer, profile: state.currentProfile, data: state.importedData, route: routeRevision(), previousLabel, previousLabelledBy };
  view = owned;
  observer.observe(document.documentElement, { childList: true, subtree: true });
  observer.observe(overlay, { attributes: true, attributeFilter: ['class'] });
  return () => current(owned);
}
function retireStale(): void {
  if (view && !current(view)) {
    const owned = view;
    if (owned.modal.contains(owned.root)) closeModalOverlay(owned.overlay);
    dispose(owned);
  }
}
if (typeof globalThis.addEventListener === 'function') {
  globalThis.addEventListener('labcharts-profile-switched', retireStale);
  globalThis.addEventListener('labcharts-sync-applied', retireStale);
}
