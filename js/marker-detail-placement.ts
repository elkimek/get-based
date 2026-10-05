import { configureRuntimeFunctions } from './runtime-callbacks.js';
import type { ActiveCategory } from './data-view-types.js';
import type { PlacementViewMarker } from './marker-placement.js';
import type { NormalizedProfileData } from '../types/app-state.js';
// marker-detail-placement.js — Marker category placement form and persistence.

import { getActiveData, invalidateActiveDataCache, saveImportedDataForProfile } from './data.js';
import { getLabCategoryEntriesInSidebarOrder } from './category-order.js';
import { markerDetailActionAttrs } from './marker-detail-actions.js';
import {
  clearMarkerPlacement,
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
import { escapeAttr, escapeHTML, safeMarkerId, showNotification } from './utils.js';

interface PlacementCalls { showDetailModal(id: string): unknown }
export type MarkerPlacementRuntimeSnapshot = { [Key in keyof PlacementCalls]: unknown };
export interface MarkerPlacementChoice { categoryKey: string; label: string; inProfile: boolean; selected: boolean }
export interface PlacementSummaryMarker extends PlacementViewMarker { name?: unknown }
export interface PlacementSummaryCategory { label?: unknown }
const placementRuntime: PlacementCalls = {
  showDetailModal: () => false,
};

const placementMutationProfiles = new Map<string, Promise<boolean>>();

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
  const storageDotKey = getMarkerStorageDotKey(marker, id);
  const nativeCategoryKey = marker.nativeCategoryKey
    || (storageDotKey ? storageDotKey.slice(0, storageDotKey.indexOf('.')) : '');
  const displayCategoryKey = marker.displayCategoryKey || id.slice(0, id.indexOf('_'));
  const currentCategory = categories?.[displayCategoryKey];
  const nativeCategory = categories?.[nativeCategoryKey];
  const currentLabel = currentCategory?.label || displayCategoryKey;
  const nativeLabel = nativeCategory?.label || nativeCategoryKey;
  const moved = !!nativeCategoryKey && nativeCategoryKey !== displayCategoryKey;
  return `<div class="gb-detail-category-row">
    <span class="gb-detail-kicker">${escapeHTML(currentLabel)}</span>
    <button type="button" class="gb-detail-category-change" aria-label="Change category for ${escapeAttr(marker.name || 'marker')}" ${markerDetailActionAttrs('open-marker-placement', { id })}>Change category</button>
    ${moved ? `<span class="gb-detail-category-origin">Originally ${escapeHTML(nativeLabel)}</span>
      <button type="button" class="gb-detail-category-restore" ${markerDetailActionAttrs('restore-marker-placement', { id })}>Restore</button>` : ''}
  </div>`;
}

function renderPlacementOptions(choices: MarkerPlacementChoice[]) {
  const groups = [
    { label: 'In this profile', options: choices.filter(choice => choice.inProfile) },
    { label: 'Other compatible categories', options: choices.filter(choice => !choice.inProfile) },
  ];
  return groups
    .filter(group => group.options.length > 0)
    .map(({ label, options }) => `<optgroup label="${escapeAttr(label)}">
      ${options.map(choice => `<option value="${escapeAttr(choice.categoryKey)}"${choice.selected ? ' selected' : ''}>${escapeHTML(choice.label)}</option>`).join('')}
    </optgroup>`)
    .join('');
}

export function openMarkerPlacementModal(id: string) {
  if (!safeMarkerId(id)) return false;
  return openWithMarkerDetailStylesheet(() => renderMarkerPlacementModal(id));
}

function renderMarkerPlacementModal(id: string) {
  const context = getMarkerPlacementChoices(id);
  if (!context) return false;
  const modal = setDetailModalShell('gb-form-modal', 'marker-placement-form');
  const overlay = document.getElementById('modal-overlay');
  if (!modal || !overlay) return false;
  const currentLabel = context.data.categories[context.displayCategoryKey]?.label || context.displayCategoryKey;
  const nativeLabel = context.data.categories[context.nativeCategoryKey]?.label || context.nativeCategoryKey;
  const moved = context.displayCategoryKey !== context.nativeCategoryKey;
  modal.innerHTML = `<div class="gb-modal-head">
      <button type="button" class="context-back-btn" aria-label="Back to marker details" ${markerDetailActionAttrs('show-detail-modal', { id })}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6"></path></svg>
      </button>
      <div>
        <div class="gb-modal-kicker">Category placement</div>
        <div class="gb-modal-title">Move ${escapeHTML(context.marker.name)}</div>
      </div>
      <button type="button" class="modal-close" aria-label="Close" ${markerDetailActionAttrs('close-modal')}>&times;</button>
    </div>
    <div class="gb-form-body">
      <div class="marker-placement-safety" role="note">
        <strong>Only where this marker appears will change.</strong>
        <span>Values, history, units, notes, reference ranges, backups, shares, imports, and sync stay linked to the same marker.</span>
      </div>
      <div class="manual-entry-form">
        <div class="me-field">
          <label for="marker-placement-category">Category</label>
          <select id="marker-placement-category" aria-describedby="marker-placement-help">
            ${renderPlacementOptions(context.choices)}
          </select>
          <div class="marker-placement-current">Current: <strong>${escapeHTML(currentLabel)}</strong> &middot; Original: <strong>${escapeHTML(nativeLabel)}</strong></div>
          <div class="marker-placement-help" id="marker-placement-help">Choose an existing compatible category. ${context.unavailableCount ? `${context.unavailableCount} calculated, incompatible, or conflicting ${context.unavailableCount === 1 ? 'category is' : 'categories are'} hidden.` : ''}</div>
        </div>
        <div class="gb-form-actions">
          ${moved ? `<button type="button" class="import-btn import-btn-secondary marker-placement-restore" ${markerDetailActionAttrs('restore-marker-placement', { id })}>Restore original</button>` : ''}
          <button type="button" class="import-btn import-btn-secondary" ${markerDetailActionAttrs('show-detail-modal', { id })}>Cancel</button>
          <button type="button" class="import-btn import-btn-primary marker-placement-save" ${markerDetailActionAttrs('save-marker-placement', { id })}>Move marker</button>
        </div>
      </div>
    </div>`;
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

async function persistMarkerPlacement(context: NonNullable<ReturnType<typeof getMarkerPlacementContext>>, profileId: string, profileData: NormalizedProfileData, categoryKey: string, action: 'move' | 'restore') {
  const modal = document.getElementById('detail-modal');
  const modalContent = modal?.firstElementChild;
  const overlay = document.getElementById('modal-overlay');
  const hadPlacements = isRecord(profileData?.markerPlacements);
  const previousPlacements = clonePlacements(profileData?.markerPlacements);
  const result = action === 'restore'
    ? clearMarkerPlacement(profileData, context.markerReference)
    : setMarkerPlacement(profileData, context.markerReference, categoryKey);
  if (!result.ok) {
    showNotification('That marker cannot be placed in the selected category.', 'error');
    return false;
  }
  const destinationCategoryKey = result.categoryKey;
  const nextId = `${destinationCategoryKey}_${context.markerKey}`;
  if (!result.changed) {
    if (state.currentProfile === profileId && state.importedData === profileData) {
      placementRuntime.showDetailModal(nextId);
    }
    return true;
  }
  invalidateActiveDataCache();
  const saved = await saveImportedDataForProfile(profileId, profileData, {
    forceProfileScope: true,
    reason: 'marker-placement',
  });
  if (!saved) {
    if (hadPlacements) (profileData as {markerPlacements: Record<string, unknown>}).markerPlacements = previousPlacements || {};
    else Reflect.deleteProperty(profileData, 'markerPlacements');
    invalidateActiveDataCache();
    return false;
  }
  const stillOwnsView = state.currentProfile === profileId
    && state.importedData === profileData
    && modal?.firstElementChild === modalContent
    && overlay?.classList.contains('show');
  if (!stillOwnsView) return true;
  const destinationLabel = getActiveData().categories?.[destinationCategoryKey]?.label || destinationCategoryKey;
  buildMarkerDetailSidebarRuntime();
  navigateMarkerDetailRuntime(destinationCategoryKey, getActiveData());
  placementRuntime.showDetailModal(nextId);
  showNotification(
    action === 'restore'
      ? `Restored “${context.marker.name}” to ${destinationLabel}`
      : `Moved “${context.marker.name}” to ${destinationLabel}. Values and history stayed linked.`,
    'success',
  );
  return true;
}

export async function saveMarkerPlacement(id: string) {
  if (!safeMarkerId(id)) return false;
  const select = (document.getElementById('marker-placement-category') as HTMLSelectElement | null);
  if (!select?.value) return false;
  const context = getMarkerPlacementContext(id);
  if (!context) return false;
  const categoryKey = select.value;
  const profileId = state.currentProfile;
  const profileData = state.importedData;
  return runPlacementMutation(profileId, () => persistMarkerPlacement(context, profileId, profileData, categoryKey, 'move'));
}

export async function restoreMarkerPlacement(id: string) {
  if (!safeMarkerId(id)) return false;
  const context = getMarkerPlacementContext(id);
  if (!context) return false;
  const profileId = state.currentProfile;
  const profileData = state.importedData;
  return runPlacementMutation(profileId, () => persistMarkerPlacement(context, profileId, profileData, context.nativeCategoryKey, 'restore'));
}
