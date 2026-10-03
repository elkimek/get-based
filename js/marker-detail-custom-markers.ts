// marker-detail-custom-markers.js — Custom biomarker create/delete flow owner

import { state } from './state.js';
import { createCustomMarkerId } from './custom-marker-identity.js';
import { escapeHTML, showConfirmDialog, showNotification } from './utils.js';
import { getActiveData, saveImportedData, updateHeaderDates } from './data.js';
import { deleteEmptyLabEntries, deleteLabEntryMarkerValues } from './lab-entry-mutations.js';
import { getMarkerStorageDotKey } from './marker-placement.js';
import { markerDetailActionAttrs } from './marker-detail-actions.js';
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
interface DeletedMarkerReader { markerId?: unknown; name?: unknown; categoryLabel?: unknown }
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
  const categoryOptions = Object.entries(data.categories)
    .map(([key, category]) => `<option value="${key}">${escapeHTML(category.label)}</option>`)
    .join('');
  modal.innerHTML = `<div class="gb-modal-head">
      <div>
        <div class="gb-modal-kicker">Custom marker</div>
        <div class="gb-modal-title">Create New Biomarker</div>
      </div>
      <button class="modal-close" aria-label="Close" ${markerDetailActionAttrs('close-modal')}>&times;</button>
    </div>
    <div class="gb-form-body">
    <div class="manual-entry-form">
      <div class="me-field">
        <label>Category</label>
        <div class="cm-cat-row">
          <select id="cm-category" ${markerDetailActionAttrs('toggle-custom-marker-category')}>
            ${categoryOptions}
            <option value="__new__">+ New category...</option>
          </select>
          <div id="cm-new-cat-row" style="display:none;margin-top:6px;gap:8px;align-items:center">
            <span id="cm-new-cat-icon" title="Pick icon" style="cursor:pointer;font-size:20px;min-width:28px;text-align:center" role="button" tabindex="0" data-custom="" ${markerDetailActionAttrs('pick-new-cat-icon')}>\uD83D\uDD16</span>
            <input type="text" id="cm-new-cat" placeholder="Category name" style="flex:1">
          </div>
        </div>
      </div>
      <div class="me-field">
        <label>Marker name</label>
        <input type="text" id="cm-name" placeholder="e.g. Lipoprotein(a)" autofocus>
      </div>
      <div class="me-field">
        <label>Unit</label>
        <input type="text" id="cm-unit" placeholder="e.g. mg/dL, nmol/L, %">
      </div>
      <div class="me-field">
        <label>Reference range (optional)</label>
        <div style="display:flex;gap:8px">
          <input type="number" id="cm-ref-min" step="any" placeholder="Min">
          <span style="line-height:36px">\u2013</span>
          <input type="number" id="cm-ref-max" step="any" placeholder="Max">
        </div>
      </div>
      <div class="me-field">
        <label>Optimal range (optional)</label>
        <div style="display:flex;gap:8px">
          <input type="number" id="cm-opt-min" step="any" placeholder="Min">
          <span style="line-height:36px">\u2013</span>
          <input type="number" id="cm-opt-max" step="any" placeholder="Max">
        </div>
      </div>
      <div class="gb-form-actions">
        <button type="button" class="import-btn import-btn-primary" ${markerDetailActionAttrs('save-custom-marker')}>Create</button>
        <button type="button" class="import-btn import-btn-secondary" ${markerDetailActionAttrs('close-modal')}>Cancel</button>
      </div>
    </div>
    </div>`;
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

export function saveCustomMarker() {
  const categorySelect = (document.getElementById('cm-category') as HTMLSelectElement | null);
  const newCategoryInput = (document.getElementById('cm-new-cat') as HTMLInputElement | null);
  const nameInput = (document.getElementById('cm-name') as HTMLInputElement | null);
  const unitInput = (document.getElementById('cm-unit') as HTMLInputElement | null);
  const refMinInput = (document.getElementById('cm-ref-min') as HTMLInputElement | null);
  const refMaxInput = (document.getElementById('cm-ref-max') as HTMLInputElement | null);
  if (!categorySelect) return;
  if (!nameInput?.value.trim()) {
    showNotification('Please enter a marker name', 'error');
    return;
  }
  const name = nameInput.value.trim();

  let categoryKey: string;
  let categoryLabel: string;
  let newCategoryIcon: string | null = null;
  if (categorySelect.value === '__new__') {
    categoryLabel = (newCategoryInput?.value || '').trim();
    if (!categoryLabel) {
      showNotification('Please enter a category name', 'error');
      return;
    }
    const iconElement = (document.getElementById('cm-new-cat-icon') as HTMLElement | null);
    newCategoryIcon = iconElement?.dataset.custom === '1' ? iconElement.textContent!.trim() : null;
    categoryKey = categoryLabel.replace(/[^a-zA-Z0-9\s]/g, '').split(/\s+/)
      .map((word, index) => index === 0 ? word.toLowerCase() : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join('');
    if (!categoryKey || /^\d/.test(categoryKey)) {
      categoryKey = 'custom' + categoryKey.charAt(0).toUpperCase() + categoryKey.slice(1);
    }
  } else {
    categoryKey = categorySelect.value;
    categoryLabel = categorySelect.options[categorySelect.selectedIndex]!.text;
  }

  const markerKey = name
    .replace(/[^a-zA-Z0-9\s]/g, '')
    .split(/\s+/)
    .map((word, index) => index === 0 ? word.toLowerCase() : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join('');
  if (!markerKey) {
    showNotification('Could not generate a valid key from marker name', 'error');
    return;
  }
  const fullKey = categoryKey + '.' + markerKey;
  const data = getActiveData();
  const existingCategory = data.categories[categoryKey];
  if (existingCategory?.markers[markerKey]) {
    showNotification('A marker with this name already exists in that category', 'error');
    return;
  }

  const refMin = refMinInput?.value ? parseFloat(refMinInput.value) : null;
  const refMax = refMaxInput?.value ? parseFloat(refMaxInput.value) : null;
  const validRefMin = refMin != null && !Number.isNaN(refMin) ? refMin : null;
  const validRefMax = refMax != null && !Number.isNaN(refMax) ? refMax : null;
  const optMinInput = (document.getElementById('cm-opt-min') as HTMLInputElement | null);
  const optMaxInput = (document.getElementById('cm-opt-max') as HTMLInputElement | null);
  const optMin = optMinInput?.value ? parseFloat(optMinInput.value) : null;
  const optMax = optMaxInput?.value ? parseFloat(optMaxInput.value) : null;

  if (!state.importedData.customMarkers) state.importedData.customMarkers = {};
  state.importedData.customMarkers[fullKey] = {
    markerId: createCustomMarkerId(state.importedData.customMarkers),
    name,
    unit: (unitInput?.value || '').trim(),
    refMin: validRefMin,
    refMax: validRefMax,
    categoryLabel,
    ...(newCategoryIcon ? { icon: newCategoryIcon } : {}),
  };
  if (optMin != null && !Number.isNaN(optMin) && optMax != null && !Number.isNaN(optMax)) {
    if (!state.importedData.refOverrides) state.importedData.refOverrides = {};
    state.importedData.refOverrides[fullKey] = {
      ...(state.importedData.refOverrides[fullKey] || {}),
      optimalMin: optMin,
      optimalMax: optMax,
    };
  }
  saveImportedData();
  buildMarkerDetailSidebarRuntime();
  customMarkerRuntime.closeModal();
  showNotification(`Created "${name}" in ${categoryLabel}`, 'success');

  const id = categoryKey + '_' + markerKey;
  state.markerRegistry[id] = {
    name,
    unit: (unitInput?.value || '').trim(),
    refMin: validRefMin,
    refMax: validRefMax,
    custom: true,
  };
  setTimeout(() => customMarkerRuntime.openManualEntryForm(id), 100);
}

export async function deleteCustomMarker(id: string) {
  const separator = id.indexOf('_');
  const activeMarker = separator > 0
    ? getActiveData().categories[id.slice(0, separator)]?.markers[id.slice(separator + 1)]
    : null;
  const dotKey = getMarkerStorageDotKey(activeMarker || state.markerRegistry[id], id);
  if (!dotKey) return;
  const categoryKey = dotKey.split('.')[0];
  const definition = state.importedData?.customMarkers?.[dotKey] as DeletedMarkerReader | null | undefined;
  if (!definition) return;
  const siblings = Object.keys(state.importedData.customMarkers).filter(key => key.startsWith(categoryKey + '.'));
  const isLastInCategory = siblings.length <= 1;
  const message = isLastInCategory
    ? `Delete "${definition.name}" and the entire "${definition.categoryLabel || categoryKey}" category? This cannot be undone.`
    : `Delete "${definition.name}" and all its values? This cannot be undone.`;
  if (!await showConfirmDialog(message)) return;

  const keysToDelete = isLastInCategory ? siblings : [dotKey];
  const now = Date.now();
  for (const key of keysToDelete) {
    const markerId = (state.importedData.customMarkers[key] as DeletedMarkerReader | null | undefined)?.markerId;
    deleteLabEntryMarkerValues(state.importedData, key, { now, deleteEmptyEntries: false });
    if (state.importedData.refOverrides) delete state.importedData.refOverrides[key];
    if (state.importedData.markerNotes) delete state.importedData.markerNotes[key];
    if (state.importedData.markerLabels) delete state.importedData.markerLabels[key];
    if (markerId && state.importedData.markerPlacements) {
      delete state.importedData.markerPlacements[markerId as string];
    }
    delete state.importedData.customMarkers[key];
  }
  deleteEmptyLabEntries(state.importedData);
  saveImportedData();
  customMarkerRuntime.closeModal();
  buildMarkerDetailSidebarRuntime();
  updateHeaderDates();
  customMarkerRuntime.navigate('dashboard');
  showNotification(
    `Deleted "${definition.name}"${isLastInCategory && siblings.length > 1 ? ` and ${siblings.length - 1} other marker(s)` : ''}`,
    'info',
  );
}
