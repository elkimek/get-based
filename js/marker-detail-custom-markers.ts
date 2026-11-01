import { commitNativeCustomMarkerCreation, readNativeCustomMarker, commitNativeCustomMarkerRemoval } from './custom-marker-store.js';
import type { CustomMarkerInput } from './custom-marker-core.js';
// marker-detail-custom-markers.js — Custom biomarker create/delete flow owner

import { state } from './state.js';
import { showNotification } from './utils.js';
import { getActiveData, updateHeaderDates } from './data.js';
import { getMarkerStorageDotKey } from './marker-placement.js';
import { renderCustomMarkerForm } from './custom-marker-presentation.js';
import { openModalOverlay } from './modal-lifecycle.js';
import {
  buildMarkerDetailSidebarRuntime,
  openWithMarkerDetailStylesheet,
  setDetailModalShell,
} from './marker-detail-runtime.js';

interface CustomMarkerCalls {
  closeModal(): unknown;
  navigate(category?: string, data?: unknown): unknown;
  openManualEntryForm(id: string): unknown;
  showEmojiPicker(element: Element, callback: (emoji?: unknown) => void): unknown;
}
export type CustomMarkerRuntimeSnapshot = { [Key in keyof CustomMarkerCalls]: unknown };
const createOwners = new WeakMap<HTMLElement, { profileId: string; root: typeof state.importedData }>();
const customMarkerRuntime: CustomMarkerCalls = {
  closeModal: () => {},
  navigate: () => {},
  openManualEntryForm: () => {},
  showEmojiPicker: () => {},
};

export function configureMarkerDetailCustomMarkers(runtime: unknown = {}): CustomMarkerRuntimeSnapshot {
  const previous = { ...customMarkerRuntime };
  Object.assign(customMarkerRuntime, runtime);
  return previous;
}

export function openCreateMarkerModal() {
  return openWithMarkerDetailStylesheet(renderCreateMarkerModal);
}

function renderCreateMarkerModal() {
  const modal = setDetailModalShell('gb-form-modal', 'marker-form-modal');
  const overlay = document.getElementById('modal-overlay');
  if (!modal) return;
  const data = getActiveData();
  modal.innerHTML = renderCustomMarkerForm(data.categories);
  createOwners.set(modal, { profileId: state.currentProfile, root: state.importedData });
  openModalOverlay(overlay, { initialFocus: '#cm-name', focusDelay: 50 });
}

export function pickNewCatIcon(element: HTMLElement) {
  customMarkerRuntime.showEmojiPicker(element, emoji => {
    if (emoji) {
      element.textContent = emoji as string;
      element.dataset.custom = '1';
    }
  });
}

const formIds = ['cm-category', 'cm-new-cat', 'cm-name', 'cm-unit', 'cm-ref-min', 'cm-ref-max', 'cm-opt-min', 'cm-opt-max'];
function formSignature(modal: HTMLElement) {
  return JSON.stringify([...formIds.map(id => (modal.querySelector('#' + id) as HTMLInputElement | null)?.value ?? null), modal.querySelector('#cm-new-cat-icon')?.textContent, (modal.querySelector('#cm-new-cat-icon') as HTMLElement | null)?.dataset.custom]);
}
export async function saveCustomMarker() {
  const modal = document.getElementById('detail-modal'), owner = modal ? createOwners.get(modal) : null;
  if (!modal || !owner) return false;
  const current = () => state.currentProfile === owner.profileId && state.importedData === owner.root && modal.isConnected && document.getElementById('detail-modal') === modal;
  const value = (id: string) => (modal.querySelector('#' + id) as HTMLInputElement | null)?.value.trim() || '';
  if (!value('cm-name')) { showNotification('Please enter a marker name', 'error'); return false; }
  if (value('cm-category') === '__new__' && !value('cm-new-cat')) { showNotification('Please enter a category name', 'error'); return false; }
  const signature = formSignature(modal), sameInput = () => current() && formSignature(modal) === signature;
  try {
    const number = (id: string) => value(id) ? Number(value(id)) : null;
    const input: CustomMarkerInput = { name: value('cm-name'), unit: value('cm-unit'),
      ...(value('cm-category') === '__new__' ? { newCategory: value('cm-new-cat') } : { category: value('cm-category') }),
      refMin: number('cm-ref-min'), refMax: number('cm-ref-max'),
      ...(value('cm-opt-min') || value('cm-opt-max') ? { optimalMin: number('cm-opt-min'), optimalMax: number('cm-opt-max') } : {}) };
    const iconElement = modal.querySelector<HTMLElement>('#cm-new-cat-icon'), icon = iconElement?.dataset.custom === '1' ? iconElement.textContent?.trim() : undefined;
    const plan = await commitNativeCustomMarkerCreation(owner.profileId, input, { allowed: sameInput, ...(icon ? { icon } : {}) });
    if (!current()) return true;
    buildMarkerDetailSidebarRuntime();
    if (!sameInput()) { showNotification(`Created "${plan.name}". Your newer form input has been kept.`, 'success'); return true; }
    customMarkerRuntime.closeModal();
    showNotification(`Created "${plan.name}" in ${plan.category.label}`, 'success');
    const id = plan.markerKey.replace('.', '_');
    state.markerRegistry[id] = { name: plan.name, unit: plan.unit, refMin: input.refMin ?? null, refMax: input.refMax ?? null, custom: true, storageDotKey: plan.markerKey };
    setTimeout(() => {
      if (state.currentProfile === owner.profileId && state.importedData === owner.root && !document.querySelector('.modal-overlay.show,.confirm-overlay.show,[data-modal-focus-trap]')) customMarkerRuntime.openManualEntryForm(id);
    }, 100);
    return true;
  } catch (error) {
    if (current()) showNotification(error instanceof Error ? error.message : 'The custom marker could not be saved. Your input is kept.', 'error');
    return false;
  }
}

export async function deleteCustomMarker(id: string) {
  const root = state.importedData, profileId = state.currentProfile, modal = document.getElementById('detail-modal');
  const current = () => state.currentProfile === profileId && state.importedData === root && (!modal || modal.isConnected && document.getElementById('detail-modal') === modal);
  if (document.querySelector('.ref-edit-form')) { showNotification('Close the current range editor before removing a marker. Your input is kept.', 'error'); return false; }
  const separator = id.indexOf('_'), marker = separator > 0 ? getActiveData().categories[id.slice(0, separator)]?.markers[id.slice(separator + 1)] : null;
  const key = getMarkerStorageDotKey(marker || state.markerRegistry[id], id); if (!key) return false;
  try {
    const expected = await readNativeCustomMarker(profileId, key, current);
    await commitNativeCustomMarkerRemoval(profileId, expected, current);
    if (state.currentProfile === profileId && state.importedData === root && !state.importedData.customMarkers?.[key]) for (const [viewId, value] of Object.entries(state.markerRegistry)) if (getMarkerStorageDotKey(value, viewId) === key) delete state.markerRegistry[viewId];
    if (current()) {
      customMarkerRuntime.closeModal(); buildMarkerDetailSidebarRuntime(); updateHeaderDates(); customMarkerRuntime.navigate('dashboard');
      showNotification(`Deleted "${expected.name}" and its reviewed results`, 'info');
    }
    return true;
  } catch (error) {
    if (current() && !(error && typeof error === 'object' && 'cancelledBeforeSave' in error)) showNotification(error instanceof Error ? error.message : 'The custom marker removal could not be confirmed.', 'error');
    return false;
  }
}
