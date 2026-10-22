import BodyMeasurement, {mount, unmount, flushSync} from './components/BodyMeasurement.svelte.native.js';
import {state} from './state.js';
import {getProfileHeight} from './profile.js';
import {routeRevision} from './route-lifecycle.js';
import {runWithContextEditorStylesheet} from './context-card-editor-ui.js';
import {prepareContextFormDialog, releaseContextFormDialog} from './context-form-dialog.js';
import {openModalOverlay, closeModalOverlay, trapModalFocus} from './modal-lifecycle.js';
import {showNotification, showConfirmDialog} from './utils.js';
import {getErrorMessage} from './caught-error.js';
import {logBodyMeasurement, deleteBodyMeasurement} from './wearables-manual.js';
import {bodyMeasurementRecords, type BodyMeasurementKind, type BodyMeasurementDraft, type BodyMeasurement as Reading} from './body-measurement-model.js';
import {navigateWearables} from './wearables-runtime.js';

interface View {
  modal: HTMLElement; overlay: HTMLElement; root: HTMLElement; component: ReturnType<typeof BodyMeasurement>;
  data: typeof state.importedData;
  profile: string; revision: number; kind: BodyMeasurementKind; observer: MutationObserver;
  releaseFocus: (restore?: boolean) => void; busy: boolean;
}
let view: View | null = null, request = 0;
const titleId = 'body-measurement-title';
const title = (kind: BodyMeasurementKind) => kind === 'waist' ? 'Waist' : 'Abdominal depth';
function current(owned: View): boolean {
  return view === owned && owned.profile === state.currentProfile && owned.data === state.importedData && owned.revision === routeRevision()
    && owned.root.isConnected && owned.modal.contains(owned.root) && owned.overlay.classList.contains('show');
}
function dispose(owned: View): void {
  owned.observer.disconnect(); owned.releaseFocus(false);
  if (owned.modal.contains(owned.root)) releaseContextFormDialog(owned.modal, owned.root, title(owned.kind), titleId);
  if (view === owned) view = null;
  void unmount(owned.component); flushSync();
}
function close(owned: View): void {
  if (view === owned && owned.modal.contains(owned.root)) closeModalOverlay(owned.overlay);
  dispose(owned);
}
async function save(owned: View, draft: BodyMeasurementDraft): Promise<void> {
  if (!current(owned) || owned.busy) return;
  owned.busy = true; owned.component.report('', true); flushSync();
  try {
    await logBodyMeasurement(owned.profile, draft);
    if (!current(owned)) return;
    const route = state.currentView || 'dashboard';
    close(owned);
    navigateWearables(route);
    showNotification('Measurement saved', 'success');
  } catch (error) {
    if (current(owned)) {owned.component.report(getErrorMessage(error), false); flushSync();}
  } finally {owned.busy = false;}
}
async function remove(owned: View, row: Reading): Promise<void> {
  if (!current(owned) || owned.busy) return;
  owned.busy = true;
  try {
    const confirmed = await showConfirmDialog(`Delete this ${title(owned.kind).toLowerCase()} measurement from ${row.date}?`, {confirmLabel: 'Delete'});
    if (!confirmed || !current(owned)) return;
    owned.component.report('', true); flushSync();
    await deleteBodyMeasurement(owned.profile, row.field, row.date);
    if (!current(owned)) return;
    const route = state.currentView || 'dashboard';
    close(owned); navigateWearables(route);
    showNotification('Measurement deleted', 'success');
  } catch (error) {
    if (current(owned)) {owned.component.report(getErrorMessage(error), false); flushSync();}
  } finally {owned.busy = false;}
}
export async function openBodyMeasurementEditor(kind: BodyMeasurementKind): Promise<void> {
  const profile = state.currentProfile, data = state.importedData, revision = routeRevision(), ticket = ++request;
  const surface = document.getElementById('main-content')?.firstElementChild;
  const prior = document.getElementById('detail-modal')?.firstElementChild;
  await runWithContextEditorStylesheet(() => {
    if (ticket !== request || profile !== state.currentProfile || data !== state.importedData || revision !== routeRevision()
      || document.getElementById('main-content')?.firstElementChild !== surface || document.getElementById('detail-modal')?.firstElementChild !== prior) return;
    const modal = document.getElementById('detail-modal'), overlay = document.getElementById('modal-overlay');
    if (!modal || !overlay) return;
    if (view) close(view);
    state.chartInstances.modal?.destroy(); delete state.chartInstances.modal;
    prepareContextFormDialog(modal, title(kind), titleId);
    let owned: View;
    const component = mount(BodyMeasurement, {target: modal, props: {
      kind, initial: bodyMeasurementRecords(data, kind), initialUnit: state.unitSystem === 'US' ? 'in' : 'cm', initialCycle: data.menstrualCycle,
      initialHeightCm: getProfileHeight(profile).height,
      current: () => !!owned && current(owned), save: draft => {if (owned) void save(owned, draft);},
      remove: row => {if (owned) void remove(owned, row);}, close: () => {if (owned) close(owned);},
    }}); flushSync();
    const root = modal.querySelector<HTMLElement>('[data-body-measurement-view]')!;
    const observer = new MutationObserver(() => {if (view === owned && !current(owned)) close(owned);});
    owned = {modal, overlay, root, component, data, profile, revision, kind, observer, releaseFocus: () => {}, busy: false};
    view = owned;
    openModalOverlay(overlay, {autoFocus: false});
    owned.releaseFocus = trapModalFocus(overlay, {autoFocus: false, onEscape: () => close(owned)});
    observer.observe(document.documentElement, {childList: true, subtree: true});
    observer.observe(overlay, {attributes: true, attributeFilter: ['class']});
    component.focusInput();
  });
}
if (typeof globalThis.addEventListener === 'function') {
  globalThis.addEventListener('labcharts-profile-switched', () => {++request; if (view) close(view);});
  globalThis.addEventListener('labcharts-sync-applied', () => {
    if (view && current(view) && !view.busy) {view.component.refresh(bodyMeasurementRecords(state.importedData, view.kind), state.importedData.menstrualCycle, getProfileHeight(view.profile).height); flushSync();}
  });
}
