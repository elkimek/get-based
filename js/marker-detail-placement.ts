import {renderHTML as renderPlacementSummaryHTML} from './components/MarkerPlacementSummary.svelte.html.js';
import { configureRuntimeFunctions } from './runtime-callbacks.js';
import type { ActiveCategory } from './data-view-types.js';
import type { PlacementViewMarker } from './marker-placement.js';
// marker-detail-placement.js — Marker category placement form and persistence.

import { getActiveData } from './data.js';
import { readNativeLabDisplay, commitNativeLabDisplay } from './lab-display-store.js';
import type { LabDisplaySnapshot } from './lab-display-core.js';
import { getLabCategoryEntriesInSidebarOrder } from './category-order.js';
import {projectPlacementSummary,renderPlacementForm} from './marker-placement-presentation.js';
import {
  getMarkerStorageDotKey,
  setMarkerPlacement,
} from './marker-placement.js';
import {
  buildMarkerDetailSidebarRuntime,
  navigateMarkerDetailRuntime,
  openWithMarkerDetailStylesheet,
  setDetailModalShell,
} from './marker-detail-runtime.js';
import { openModalOverlay } from './modal-lifecycle.js';
import { state } from './state.js';
import { safeMarkerId, showNotification } from './utils.js';

interface PlacementCalls { showDetailModal(id: string): unknown }
export type MarkerPlacementRuntimeSnapshot = { [Key in keyof PlacementCalls]: unknown };
export interface MarkerPlacementChoice { categoryKey: string; label: string; inProfile: boolean; selected: boolean }
export interface PlacementSummaryMarker extends PlacementViewMarker { name?: unknown }
export interface PlacementSummaryCategory { label?: unknown }
const placementRuntime: PlacementCalls = {
  showDetailModal: () => false,
};

const placementMutationProfiles = new Map<string, Promise<boolean>>();
const placementEditors = new WeakMap<HTMLElement, { profileId: string; root: typeof state.importedData; viewId: string; content: Element | null; expected: LabDisplaySnapshot }>();

export function configureMarkerDetailPlacement(runtime: unknown = {}): MarkerPlacementRuntimeSnapshot {
  return configureRuntimeFunctions(placementRuntime, runtime as Partial<PlacementCalls>, ["showDetailModal"]);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function clonePlacements(placements: unknown) {
  if (!isRecord(placements)) return undefined;
  return Object.fromEntries(Object.entries(placements).map(([key, value]) => [
    key,
    isRecord(value) ? { ...value } : value,
  ]));
}

function getMarkerPlacementContext(id: string) {
  if (!safeMarkerId(id)) return null;
  const separator = id.indexOf('_');
  if (separator < 1 || separator === id.length - 1) return null;
  const data = getActiveData();
  const displayCategoryKey = id.slice(0, separator);
  const markerKey = id.slice(separator + 1);
  const marker = data.categories?.[displayCategoryKey]?.markers?.[markerKey];
  if (!marker) return null;
  const storageDotKey = getMarkerStorageDotKey(marker, id);
  if (!storageDotKey) return null;
  const nativeCategoryKey = marker.nativeCategoryKey || storageDotKey.slice(0, storageDotKey.indexOf('.'));
  const markerReference = marker.markerId || storageDotKey;
  return {
    data,
    marker,
    markerKey,
    markerReference,
    storageDotKey,
    displayCategoryKey: marker.displayCategoryKey || displayCategoryKey,
    nativeCategoryKey,
  };
}

function categoryHasData(category: ActiveCategory) {
  return Object.values(category?.markers || {}).some(marker =>
    Array.isArray(marker?.values) && marker.values.some(value => value != null));
}

/**
 * Return only destinations accepted by the placement engine. Categories that
 * cannot preserve marker semantics (calculated destinations, mode-mismatched,
 * or colliding) stay out of the control instead of failing after selection.
 *

 */
export function getMarkerPlacementChoices(id: string) {
  const context = getMarkerPlacementContext(id);
  if (!context) return null;
  const choices: MarkerPlacementChoice[] = [];
  let unavailableCount = 0;
  for (const [categoryKey, category] of getLabCategoryEntriesInSidebarOrder(context.data.categories || {})) {
    const candidatePlacements = clonePlacements(state.importedData?.markerPlacements) || {};
    const candidateProfile = { ...state.importedData, markerPlacements: candidatePlacements };
    const result = setMarkerPlacement(candidateProfile, context.markerReference, categoryKey);
    if (!result.ok) {
      unavailableCount++;
      continue;
    }
    choices.push({
      categoryKey,
      label: category.label || categoryKey,
      inProfile: categoryHasData(category)
        || categoryKey === context.displayCategoryKey
        || categoryKey === context.nativeCategoryKey,
      selected: categoryKey === context.displayCategoryKey,
    });
  }
  return { ...context, choices, unavailableCount };
}

export function renderMarkerPlacementSummary(id: string, marker: PlacementSummaryMarker, categories: Record<string, PlacementSummaryCategory> | null | undefined) {
  return renderPlacementSummaryHTML({view:projectMarkerPlacementSummary(id,marker,categories)});
}

export function projectMarkerPlacementSummary(id: string, marker: PlacementSummaryMarker, categories: Record<string, PlacementSummaryCategory> | null | undefined) {
  const storageDotKey = getMarkerStorageDotKey(marker, id);
  const nativeCategoryKey = marker.nativeCategoryKey
    || (storageDotKey ? storageDotKey.slice(0, storageDotKey.indexOf('.')) : '');
  const displayCategoryKey = marker.displayCategoryKey || id.slice(0, id.indexOf('_'));
  const currentCategory = categories?.[displayCategoryKey];
  const nativeCategory = categories?.[nativeCategoryKey];
  const currentLabel = currentCategory?.label || displayCategoryKey;
  const nativeLabel = nativeCategory?.label || nativeCategoryKey;
  const moved = !!nativeCategoryKey && nativeCategoryKey !== displayCategoryKey;
  return projectPlacementSummary(id,currentLabel,nativeLabel,moved,()=>marker.name);
}


export function openMarkerPlacementModal(id: string) {
  if (!safeMarkerId(id)) return false;
  const profileId = state.currentProfile, root = state.importedData;
  return openWithMarkerDetailStylesheet(() => state.currentProfile === profileId && state.importedData === root ? renderMarkerPlacementModal(id) : false);
}

async function renderMarkerPlacementModal(id: string) {
  const context = getMarkerPlacementChoices(id);
  if (!context) return false;
  const profileId = state.currentProfile, root = state.importedData, view = state.currentView;
  const current = () => state.currentProfile === profileId && state.importedData === root && state.currentView === view;
  let expected: LabDisplaySnapshot;
  try { expected = await readNativeLabDisplay(profileId, 'markerDisplay', context.storageDotKey, current); }
  catch (error) { if (current()) showNotification(error instanceof Error ? error.message : 'The placement could not be read.', 'error'); return false; }
  if (!current()) return false;
  const modal = setDetailModalShell('gb-form-modal', 'marker-placement-form');
  const overlay = document.getElementById('modal-overlay');
  if (!modal || !overlay) return false;
  const currentLabel = context.data.categories[context.displayCategoryKey]?.label || context.displayCategoryKey;
  const nativeLabel = context.data.categories[context.nativeCategoryKey]?.label || context.nativeCategoryKey;
  const moved = context.displayCategoryKey !== context.nativeCategoryKey;
  modal.innerHTML = renderPlacementForm(id,context,currentLabel,nativeLabel,moved);
  placementEditors.set(modal, { profileId, root, viewId: id, content: modal.firstElementChild, expected });
  openModalOverlay(overlay, { initialFocus: '#marker-placement-category', focusDelay: 20 });
  return true;
}

function setPlacementControlsBusy(busy: boolean) {
  const select = (document.getElementById('marker-placement-category') as HTMLSelectElement | null);
  const button = (document.querySelector('.marker-placement-save') as HTMLButtonElement | null);
  if (select) select.disabled = busy;
  if (button) {
    button.disabled = busy;
    button.textContent = busy ? 'Moving…' : 'Move marker';
  }
  document.querySelectorAll('[data-marker-detail-action="restore-marker-placement"]').forEach(control => {
    if (control instanceof HTMLButtonElement) control.disabled = busy;
  });
}

async function runPlacementMutation(profileId: string, mutation: () => Promise<boolean>) {
  const previous = placementMutationProfiles.get(profileId) || Promise.resolve(true);
  const pending = previous.catch(() => false).then(() => {
    if (state.currentProfile === profileId) setPlacementControlsBusy(true);
    return mutation();
  });
  placementMutationProfiles.set(profileId, pending);
  setPlacementControlsBusy(true);
  try {
    return await pending;
  } finally {
    if (placementMutationProfiles.get(profileId) === pending) {
      placementMutationProfiles.delete(profileId);
      if (state.currentProfile === profileId) setPlacementControlsBusy(false);
    }
  }
}

async function persistMarkerPlacement(id: string, categoryKey: string | null) {
  const modal = document.getElementById('detail-modal'), overlay = document.getElementById('modal-overlay'), editor = modal ? placementEditors.get(modal) : null;
  const context = getMarkerPlacementContext(id); if (!context) return false;
  const profileId = state.currentProfile, root = state.importedData, view = state.currentView, content = modal?.firstElementChild;
  const validEditor = editor && editor.viewId === id && editor.content === content && editor.profileId === profileId && editor.root === root ? editor : null;
  if (categoryKey !== null && !validEditor) return false;
  const current = () => state.currentProfile === profileId && state.importedData === root && state.currentView === view
    && !!modal?.isConnected && modal.firstElementChild === content && !!overlay?.classList.contains('show')
    && (categoryKey === null || (document.getElementById('marker-placement-category') as HTMLSelectElement | null)?.value === categoryKey);
  if (!current()) return false;
  try {
    const expected = validEditor?.expected || await readNativeLabDisplay(profileId, 'markerDisplay', context.storageDotKey, current);
    const result = await commitNativeLabDisplay(profileId, expected, categoryKey === null ? { restore: ['category'] } : { category: categoryKey }, current);
    if (current() && 'name' in result.after) {
      const destination = result.after.category, nextId = `${destination.key}_${context.markerKey}`;
      try { buildMarkerDetailSidebarRuntime(); navigateMarkerDetailRuntime(destination.key, getActiveData()); await placementRuntime.showDetailModal(nextId); } catch { /* Placement is already durable. */ }
      if (state.currentProfile === profileId && state.importedData === root) showNotification(categoryKey === null ? `Restored “${result.after.name}” to ${destination.label}` : `Moved “${result.after.name}” to ${destination.label}. Values and history stayed linked.`, 'success');
    }
    return true;
  } catch (error) {
    if (current()) showNotification(error instanceof Error ? error.message : 'The placement could not be saved. Your input is kept.', 'error');
    return false;
  }
}
export async function saveMarkerPlacement(id: string) {
  if (!safeMarkerId(id)) return false;
  const select = document.getElementById('marker-placement-category') as HTMLSelectElement | null;
  if (!select?.value) return false;
  const profileId = state.currentProfile, categoryKey = select.value, root = state.importedData;
  return runPlacementMutation(profileId, () => state.currentProfile === profileId && state.importedData === root ? persistMarkerPlacement(id, categoryKey) : Promise.resolve(false));
}
export async function restoreMarkerPlacement(id: string) {
  if (!safeMarkerId(id)) return false;
  const profileId = state.currentProfile, root = state.importedData;
  return runPlacementMutation(profileId, () => state.currentProfile === profileId && state.importedData === root ? persistMarkerPlacement(id, null) : Promise.resolve(false));
}
