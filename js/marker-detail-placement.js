// @ts-check
// marker-detail-placement.js — Marker category placement form and persistence.

import { getActiveData, invalidateActiveDataCache, saveImportedDataForProfile } from './data.js';
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

/** @type {{ showDetailModal: (id: string) => any }} */
const placementRuntime = {
  showDetailModal: () => false,
};
let placementMutationInFlight = false;

/** @param {{ showDetailModal?: (id: string) => any }} [runtime] */
export function configureMarkerDetailPlacement(runtime = {}) {
  const previous = { ...placementRuntime };
  if (typeof runtime.showDetailModal === 'function') placementRuntime.showDetailModal = runtime.showDetailModal;
  return previous;
}

/** @param {unknown} value @returns {value is Record<string, any>} */
function isRecord(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/** @param {Record<string, any> | undefined} placements */
function clonePlacements(placements) {
  if (!isRecord(placements)) return undefined;
  return Object.fromEntries(Object.entries(placements).map(([key, value]) => [
    key,
    isRecord(value) ? { ...value } : value,
  ]));
}

/** @param {string} id */
function getMarkerPlacementContext(id) {
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

/** @param {Record<string, any>} category */
function categoryHasData(category) {
  return Object.values(category?.markers || {}).some(marker =>
    Array.isArray(marker?.values) && marker.values.some(value => value != null));
}

/**
 * Return only destinations accepted by the placement engine. Categories that
 * cannot preserve marker semantics (calculated, mode-mismatched, or colliding)
 * stay out of the control instead of failing after the user chooses them.
 *
 * @param {string} id
 */
export function getMarkerPlacementChoices(id) {
  const context = getMarkerPlacementContext(id);
  if (!context) return null;
  const choices = [];
  let unavailableCount = 0;
  for (const [categoryKey, category] of Object.entries(context.data.categories || {})) {
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
      icon: category.icon || '',
      inProfile: categoryHasData(category)
        || categoryKey === context.displayCategoryKey
        || categoryKey === context.nativeCategoryKey,
      selected: categoryKey === context.displayCategoryKey,
    });
  }
  choices.sort((left, right) => {
    if (left.inProfile !== right.inProfile) return left.inProfile ? -1 : 1;
    return String(left.label).localeCompare(String(right.label));
  });
  return { ...context, choices, unavailableCount };
}

/**
 * @param {string} id
 * @param {Record<string, any>} marker
 * @param {Record<string, any>} categories
 */
export function renderMarkerPlacementSummary(id, marker, categories) {
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

/** @param {Array<Record<string, any>>} choices */
function renderPlacementOptions(choices) {
  const groups = [
    { label: 'In this profile', options: choices.filter(choice => choice.inProfile) },
    { label: 'Other compatible categories', options: choices.filter(choice => !choice.inProfile) },
  ];
  return groups
    .filter(group => group.options.length > 0)
    .map(({ label, options }) => `<optgroup label="${escapeAttr(label)}">
      ${options.map(choice => {
        const visibleLabel = `${choice.icon ? `${choice.icon} ` : ''}${choice.label}`;
        return `<option value="${escapeAttr(choice.categoryKey)}"${choice.selected ? ' selected' : ''}>${escapeHTML(visibleLabel)}</option>`;
      }).join('')}
    </optgroup>`)
    .join('');
}

/** @param {string} id */
export function openMarkerPlacementModal(id) {
  if (!safeMarkerId(id)) return false;
  return openWithMarkerDetailStylesheet(() => renderMarkerPlacementModal(id));
}

/** @param {string} id */
function renderMarkerPlacementModal(id) {
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

function setPlacementControlsBusy(busy) {
  const select = /** @type {HTMLSelectElement | null} */ (document.getElementById('marker-placement-category'));
  const button = /** @type {HTMLButtonElement | null} */ (document.querySelector('.marker-placement-save'));
  if (select) select.disabled = busy;
  if (button) {
    button.disabled = busy;
    button.textContent = busy ? 'Moving…' : 'Move marker';
  }
  document.querySelectorAll('[data-marker-detail-action="restore-marker-placement"]').forEach(control => {
    if (control instanceof HTMLButtonElement) control.disabled = busy;
  });
}

/** @param {() => Promise<boolean>} mutation */
async function runPlacementMutation(mutation) {
  if (placementMutationInFlight) return false;
  placementMutationInFlight = true;
  setPlacementControlsBusy(true);
  try {
    return await mutation();
  } finally {
    placementMutationInFlight = false;
    setPlacementControlsBusy(false);
  }
}

/**
 * @param {string} id
 * @param {string} categoryKey
 * @param {'move' | 'restore'} action
 */
async function persistMarkerPlacement(id, categoryKey, action) {
  const context = getMarkerPlacementContext(id);
  if (!context) return false;
  const profileId = state.currentProfile;
  const profileData = state.importedData;
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
  if (!result.changed) {
    placementRuntime.showDetailModal(id);
    return true;
  }
  invalidateActiveDataCache();
  const saved = await saveImportedDataForProfile(profileId, profileData, {
    forceProfileScope: true,
    reason: 'marker-placement',
  });
  if (!saved) {
    if (hadPlacements) profileData.markerPlacements = previousPlacements || {};
    else Reflect.deleteProperty(profileData, 'markerPlacements');
    invalidateActiveDataCache();
    return false;
  }
  const stillOwnsView = state.currentProfile === profileId
    && state.importedData === profileData
    && modal?.firstElementChild === modalContent
    && overlay?.classList.contains('show');
  if (!stillOwnsView) return true;
  const destinationCategoryKey = result.categoryKey;
  const destinationLabel = getActiveData().categories?.[destinationCategoryKey]?.label || destinationCategoryKey;
  const nextId = `${destinationCategoryKey}_${context.markerKey}`;
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

/** @param {string} id */
export async function saveMarkerPlacement(id) {
  if (!safeMarkerId(id)) return false;
  const select = /** @type {HTMLSelectElement | null} */ (document.getElementById('marker-placement-category'));
  if (!select?.value) return false;
  const categoryKey = select.value;
  return runPlacementMutation(() => persistMarkerPlacement(id, categoryKey, 'move'));
}

/** @param {string} id */
export async function restoreMarkerPlacement(id) {
  if (!safeMarkerId(id)) return false;
  const context = getMarkerPlacementContext(id);
  if (!context) return false;
  return runPlacementMutation(() => persistMarkerPlacement(id, context.nativeCategoryKey, 'restore'));
}
