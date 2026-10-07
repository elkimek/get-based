// One live, read-only dialog owns its profile, diet snapshot and delayed chat action.
import Signals, { mount, unmount, flushSync } from './components/ContextFoodContaminants.svelte.native.js';
import { state } from './state.js';
import { scanDietForContaminants } from './food-contaminants.js';
import { foodContaminantSections } from './context-food-contaminants-model.js';
import { runWithContextEditorStylesheet } from './context-card-editor-ui.js';
import { prepareContextFormDialog, releaseContextFormDialog } from './context-form-dialog.js';
import { openModalOverlay, closeModalOverlay } from './modal-lifecycle.js';
import { discussDietContaminantsRuntime } from './context-card-lifestyle-runtime.js';
import { profileDataValuesEqual } from './profile-data-writes.js';
interface View {
  root: HTMLElement; modal: HTMLElement; overlay: HTMLElement; observer: MutationObserver;
  component: ReturnType<typeof Signals>; profile: string; origin: typeof state.importedData; diet: unknown;
}
const TITLE = 'Food Contaminant Signals', TITLE_ID = 'context-food-contaminants-title';
let view: View | null = null, request = 0;
function current(owned: View): boolean {
  return view === owned && owned.root.isConnected && owned.overlay.classList.contains('show')
    && state.currentProfile === owned.profile && state.importedData === owned.origin
    && profileDataValuesEqual(state.importedData.diet, owned.diet);
}
function dispose(owned: View): void {
  owned.observer.disconnect(); releaseContextFormDialog(owned.modal, owned.root, TITLE, TITLE_ID);
  if (view === owned) view = null;
  void unmount(owned.component); flushSync();
}
function close(owned: View): void {
  if (view !== owned) return;
  if (owned.modal.contains(owned.root)) closeModalOverlay(owned.overlay);
  dispose(owned);
}
function discuss(owned: View): void {
  if (!current(owned)) return;
  const ticket = request, surface = document.getElementById('main-content')?.firstElementChild;
  close(owned); const content = owned.modal.firstElementChild;
  const isCurrent = () => request === ticket && state.currentProfile === owned.profile && state.importedData === owned.origin
    && profileDataValuesEqual(state.importedData.diet, owned.diet) && document.getElementById('detail-modal') === owned.modal
    && owned.modal.firstElementChild === content && !owned.overlay.classList.contains('show')
    && document.getElementById('main-content')?.firstElementChild === surface;
  void discussDietContaminantsRuntime(isCurrent);
}
export function showDietContaminantsModal(): void | Promise<unknown> {
  const profile = state.currentProfile, origin = state.importedData, diet = structuredClone(origin.diet);
  const sections = foodContaminantSections(scanDietForContaminants(diet)); if (!sections.length) return;
  const ticket = ++request, surface = document.getElementById('main-content')?.firstElementChild;
  const content = document.getElementById('detail-modal')?.firstElementChild;
  return runWithContextEditorStylesheet(() => {
    if (ticket !== request || state.currentProfile !== profile || state.importedData !== origin
      || !profileDataValuesEqual(origin.diet, diet) || document.getElementById('main-content')?.firstElementChild !== surface
      || document.getElementById('detail-modal')?.firstElementChild !== content) return;
    const modal = document.getElementById('detail-modal'), overlay = document.getElementById('modal-overlay'); if (!modal || !overlay) return;
    if (view) dispose(view);
    prepareContextFormDialog(modal, TITLE, TITLE_ID);
    let owned: View;
    const component = mount(Signals, { target: modal, props: { sections, current: () => !!owned && current(owned), close: () => close(owned), discuss: () => discuss(owned) } }); flushSync();
    const root = modal.querySelector<HTMLElement>('[data-food-contaminants-view]')!;
    const observer = new MutationObserver(() => { if (!current(owned)) close(owned); });
    owned = { modal, overlay, root, observer, component, profile, origin, diet }; view = owned;
    openModalOverlay(overlay); observer.observe(document.documentElement, { childList: true, subtree: true }); observer.observe(overlay, { attributes: true, attributeFilter: ['class'] });
  });
}
if (typeof globalThis.addEventListener === 'function') {
  globalThis.addEventListener('labcharts-profile-switched', () => { ++request; if (view) close(view); });
  globalThis.addEventListener('labcharts-sync-applied', () => { if (view && !current(view)) close(view); });
}
