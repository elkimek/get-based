// Mounted meal detail owns one profile, route and modal; delegated navigation remains stable.
import Detail, { mount, unmount, flushSync } from './components/NutritionMealDetail.svelte.native.js';
import { state } from './state.js';
import { routeRevision } from './route-lifecycle.js';
import { closeModalOverlay } from './modal-lifecycle.js';
import { createNutritionMealDetailSession } from './nutrition-meal-detail-session.js';
import { showNotification } from './utils.js';
import type { getActiveProfileMeal } from './nutrition-store.js';
import type { NutritionMealDetailView } from './nutrition-meal-detail-model.js';
interface View {
  modal: HTMLElement; overlay: HTMLElement; root: HTMLElement; component: ReturnType<typeof Detail>;
  model: NutritionMealDetailView; session: ReturnType<typeof createNutritionMealDetailSession>; observer: MutationObserver;
  route: number; previousLabel: string | null; previousLabelledBy: string | null;
}
let view: View | null = null, request = 0;
const geometry = 'gb:nutrition-detail-modal:w-[min(960px,96vw)] gb:nutrition-detail-modal:max-w-[960px] gb:nutrition-detail-modal:max-[720px]:w-full gb:nutrition-detail-modal:max-[720px]:max-w-full'.split(' ');
export function captureMealDetailOpen() {
  const modal = document.getElementById('detail-modal'), overlay = document.getElementById('modal-overlay');
  if (!modal || !overlay) return null;
  const ticket = ++request, profile = state.currentProfile, data = state.importedData;
  const content = modal.firstElementChild, shown = overlay.classList.contains('show'), route = routeRevision();
  return { modal, overlay, current: () => ticket === request && state.currentProfile === profile && state.importedData === data
    && routeRevision() === route && modal.firstElementChild === content && overlay.classList.contains('show') === shown
    && document.getElementById('detail-modal') === modal && document.getElementById('modal-overlay') === overlay };
}
function current(owned: View): boolean {
  return view === owned && owned.root.isConnected && owned.overlay.classList.contains('show') && owned.session.current()
    && routeRevision() === owned.route && document.getElementById('detail-modal') === owned.modal && document.getElementById('modal-overlay') === owned.overlay;
}
function dispose(owned: View): void {
  owned.session.retire(); owned.observer.disconnect();
  if (view === owned) view = null;
  if (owned.modal.getAttribute('aria-labelledby') === 'nutrition-meal-detail-title') {
    if (owned.previousLabelledBy === null) owned.modal.removeAttribute('aria-labelledby'); else owned.modal.setAttribute('aria-labelledby', owned.previousLabelledBy);
  }
  if (owned.modal.getAttribute('aria-label') === 'Meal details') {
    if (owned.previousLabel === null) owned.modal.removeAttribute('aria-label'); else owned.modal.setAttribute('aria-label', owned.previousLabel);
  }
  delete owned.modal.dataset.nutritionMealDetailModal; owned.modal.classList.remove(...geometry);
  void unmount(owned.component); flushSync();
}
export function mountNutritionMealDetail(modal: HTMLElement, overlay: HTMLElement, model: NutritionMealDetailView,
  meal: NonNullable<Awaited<ReturnType<typeof getActiveProfileMeal>>>, callbacks: { refreshWidget(): unknown; reopen(id: string): Promise<unknown> }): () => boolean {
  if (view) dispose(view);
  modal.replaceChildren();
  const previousLabel = modal.getAttribute('aria-label'), previousLabelledBy = modal.getAttribute('aria-labelledby');
  modal.dataset.nutritionMealDetailModal = ''; modal.classList.add(...geometry);
  modal.setAttribute('aria-labelledby', 'nutrition-meal-detail-title'); modal.setAttribute('aria-label', 'Meal details');
  let owned: View;
  const session = createNutritionMealDetailSession(meal, () => !!owned && current(owned));
  const component = mount(Detail, { target: modal, props: { view: model, actions: {
    current: () => !!owned && current(owned), failureMessage: session.failureMessage,
    notify: message => { if (current(owned)) showNotification(message, 'info'); },
    async save(response) {
      if (!current(owned)) return false;
      const saved = await session.save(response);
      if (!current(owned)) return false;
      if (!saved) { if (session.failureMessage()) showNotification(session.failureMessage(), 'error'); return false; }
      callbacks.refreshWidget();
      showNotification(response === null ? 'After-meal check-in cleared and queued for sync.' : 'After-meal check-in saved and queued for sync.', response === null ? 'info' : 'success');
      await callbacks.reopen(saved.id); return true;
    },
  } } }); flushSync();
  const root = modal.querySelector<HTMLElement>('[data-nutrition-meal-detail-view]')!;
  const observer = new MutationObserver(() => {
    if (current(owned)) return;
    if (modal.contains(root) && overlay.classList.contains('show')) closeModalOverlay(overlay);
    dispose(owned);
  });
  owned = { modal, overlay, model, root, component, session, observer, route: routeRevision(), previousLabel, previousLabelledBy }; view = owned;
  observer.observe(document.documentElement, { childList: true, subtree: true });
  observer.observe(overlay, { attributes: true, attributeFilter: ['class'] });
  return () => current(owned);
}
export async function saveMealResponse(id: unknown): Promise<void> {
  if (view && view.model.id === id && current(view)) await view.component.save();
}
export async function clearMealResponse(id: unknown): Promise<void> {
  if (view && view.model.id === id && current(view)) await view.component.save(true);
}
function retireStale(): void {
  if (view && !current(view)) { const owned = view; if (owned.modal.contains(owned.root)) closeModalOverlay(owned.overlay); dispose(owned); }
}
if (typeof globalThis.addEventListener === 'function') {
  globalThis.addEventListener('labcharts-profile-switched', retireStale);
  globalThis.addEventListener('labcharts-sync-applied', retireStale);
}
