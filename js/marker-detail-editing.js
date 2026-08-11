// @ts-check
// marker-detail-editing.js — Marker value, range, and note mutation workflows

import { state } from './state.js';
import { convertUserInputToSI, convertSIToInputUnit } from './schema.js';
import { escapeHTML, escapeAttr, showNotification, showConfirmDialog, showPromptDialog } from './utils.js';
import { getActiveData, updateHeaderDates, convertDisplayToSI } from './data.js';
import { markerDetailActionAttrs } from './marker-detail-actions.js';
import {
  buildMarkerDetailSidebarRuntime,
  navigateMarkerDetailRuntime,
} from './marker-detail-runtime.js';
import {
  deleteManualMarkerValue,
  editManualMarkerValue,
  getMarkerValueNote,
  hasMarkerValueForDate,
  revertManualMarkerValue,
  revertRefRangeOverride,
  saveManualMarkerValue,
  saveMarkerNoteText,
  saveMarkerValueNote,
  saveRefRangeOverride,
  deleteMarkerNoteText,
  deleteMarkerValueNote,
} from './marker-detail-store.js';
import { getMarkerStorageDotKey } from './marker-placement.js';

const markerDetailDeps = /** @type {{
  navigate: (category?: string, data?: any) => any,
  buildSidebar: () => any,
  showDetailModal: (id?: string, opts?: any) => any,
  openManualEntryForm: (id?: string, prefillDate?: string) => any,
  closeModal: () => any,
}} */ ({
  navigate: navigateMarkerDetailRuntime,
  buildSidebar: buildMarkerDetailSidebarRuntime,
  showDetailModal: () => {},
  openManualEntryForm: () => {},
  closeModal: () => {},
});

/**
 * @param {Partial<typeof markerDetailDeps>} [deps]
 */
export function configureMarkerDetailEditing(deps = {}) {
  Object.assign(markerDetailDeps, deps);
}

function showDetailModal(id, opts) {
  return markerDetailDeps.showDetailModal(id, opts);
}

function openManualEntryForm(id, prefillDate) {
  return markerDetailDeps.openManualEntryForm(id, prefillDate);
}

function buildSidebar() {
  return markerDetailDeps.buildSidebar();
}

function closeModal() {
  return markerDetailDeps.closeModal();
}

/** @param {string} id @param {Record<string, any> | null | undefined} [marker] */
function storageDotKeyForId(id, marker = state.markerRegistry[id]) {
  return getMarkerStorageDotKey(marker, id);
}

export async function saveManualEntry(id, opts = {}) {
  const { keepOpen = false } = opts;
  const dateInput = /** @type {HTMLInputElement | null} */ (document.getElementById('me-date'));
  const valueInput = /** @type {HTMLInputElement | null} */ (document.getElementById('me-value'));
  const noteField = /** @type {HTMLTextAreaElement | HTMLInputElement | null} */ (document.getElementById('me-note'));
  const unitInput = /** @type {HTMLInputElement | null} */ (document.getElementById('me-unit'));
  if (!dateInput || !valueInput) return;
  const date = dateInput.value;
  const value = parseFloat(valueInput.value);
  // Cap notes at 500 chars to defend against runaway paste — matches the
  // wearable-manual.js `_sanitizeNote` ceiling. Notes flow into IDB +
  // sync payloads + AI context; a few-MB paste would bloat all three.
  const noteRaw = noteField ? noteField.value.trim() : '';
  const noteText = noteRaw.length > 500 ? noteRaw.slice(0, 500) : noteRaw;
  if (!date) { showNotification('Please enter a date', 'error'); return; }
  if (isNaN(value)) { showNotification('Please enter a valid number', 'error'); return; }
  // Always re-resolve marker from getActiveData (not state.markerRegistry):
  // the registry may hold a marker.unit captured under a different unit-system
  // mode, which would break the unit-picker comparison below.
  const _meIdx = id.indexOf('_');
  const marker = _meIdx > 0
    ? getActiveData().categories[id.slice(0, _meIdx)]?.markers[id.slice(_meIdx + 1)]
    : null;
  const dotKey = storageDotKeyForId(id, marker);
  if (!dotKey) return;
  // Unit-picker integration: if the user selected the alternate unit, the
  // range sanity check needs alt-unit-space refs (otherwise typing "90 mg/dL"
  // against an SI ref range of 4–6 mmol/L would always trigger the warning).
  const inputUnit = unitInput?.value || marker?.unit || '';
  const usingAltUnit = !!(marker && inputUnit && inputUnit !== marker.unit);
  let checkRefMin = marker?.refMin, checkRefMax = marker?.refMax, checkUnit = marker?.unit;
  if (marker && usingAltUnit) {
    // Express the marker's reference range in the user's chosen unit so the
    // sanity check compares like-with-like. Refs come from getActiveData in
    // *display* units (US-converted in US mode), so round-trip through SI:
    // display → SI (convertDisplayToSI) → inputUnit (convertSIToInputUnit).
    // This is secondary-unit aware (e.g. mg/L for Lp(a)), unlike the old
    // primary-only getAlternateUnit path.
    const refMinSI = marker.refMin != null ? convertDisplayToSI(dotKey, marker.refMin) : null;
    const refMaxSI = marker.refMax != null ? convertDisplayToSI(dotKey, marker.refMax) : null;
    checkRefMin = refMinSI != null ? convertSIToInputUnit(dotKey, refMinSI, inputUnit) : null;
    checkRefMax = refMaxSI != null ? convertSIToInputUnit(dotKey, refMaxSI, inputUnit) : null;
    checkUnit = inputUnit;
  }
  // Range sanity check: catches decimal/unit slips (e.g. typing 100 mg/dL when SI ref is 4–6 mmol/L).
  if (marker) {
    let warn = null;
    if (value < 0) warn = `${value} is negative — values are usually 0 or positive.`;
    else if (checkRefMax != null && checkRefMax > 0 && value > checkRefMax * 10) warn = `${value} is much higher than the reference range (${checkRefMin ?? '?'}–${checkRefMax} ${checkUnit}). Did you enter the right unit?`;
    else if (checkRefMin != null && checkRefMin > 0 && value < checkRefMin / 10) warn = `${value} is much lower than the reference range (${checkRefMin}–${checkRefMax ?? '?'} ${checkUnit}). Did you enter the right unit?`;
    if (warn && !await showConfirmDialog(`${warn}\n\nSave anyway?`)) return;
  }
  // Duplicate-date check: an existing value for this marker on the same date.
  const existingEntry = state.importedData.entries?.find(e => e.date === date);
  if (existingEntry && existingEntry.markers && existingEntry.markers[dotKey] != null) {
    // Show in display units — find the marker's display value at this date.
    const data = getActiveData();
    const dateIdx = data.dates.indexOf(date);
    const displayVal = (dateIdx >= 0 && marker) ? marker.values[dateIdx] : existingEntry.markers[dotKey];
    const unit = marker?.unit || '';
    if (!await showConfirmDialog(`A value of ${displayVal} ${unit} already exists for ${date}. Overwrite?`)) return;
  }
  // If the user picked the alternate unit, convert from there directly to SI
  // (convertUserInputToSI is a no-op when inputUnit is already the SI unit, so
  // the EU-mode default keeps working unchanged). Otherwise fall through to the
  // existing display→SI path which handles the US-mode case.
  const storedValue = usingAltUnit
    ? convertUserInputToSI(dotKey, value, inputUnit)
    : convertDisplayToSI(dotKey, value);
  await saveManualMarkerValue({ dotKey, date, storedValue, noteText });
  // Remember the date session-wide so the next manual entry defaults to it.
  try { sessionStorage.setItem('labcharts-last-manual-date', date); } catch (_) {}
  buildSidebar();
  updateHeaderDates();
  const targetCat = id.indexOf('_') !== -1 ? id.slice(0, id.indexOf('_')) : null;
  const data = getActiveData();
  const navCat = (targetCat && data.categories?.[targetCat]) ? targetCat : "dashboard";
  showNotification(`Added ${state.markerRegistry[id]?.name || id}: ${value} on ${date}`, 'success');
  if (keepOpen) {
    // Rebuild page underneath, re-open the manual-entry form with the same id + date.
    // Form re-render is in-place (modal.innerHTML), so no flicker.
    markerDetailDeps.navigate(navCat);
    openManualEntryForm(id, date);
  } else {
    closeModal();
    markerDetailDeps.navigate(navCat);
    // Re-open detail modal so user stays in context (#29)
    setTimeout(() => showDetailModal(id), 50);
  }
}

export function saveAndAddAnotherManualEntry(id) {
  return saveManualEntry(id, { keepOpen: true });
}

export async function deleteMarkerValue(id, date) {
  const dotKey = storageDotKeyForId(id);
  if (!dotKey) return;
  if (!state.importedData.entries) return;
  const entry = state.importedData.entries.find(e => e.date === date);
  if (!entry) return;
  if (!hasMarkerValueForDate(dotKey, date)) return;
  if (await showConfirmDialog(`Delete this value (${date})? This can't be undone.`)) {
    const deleted = await deleteManualMarkerValue(dotKey, date);
    if (!deleted) return;
    buildSidebar();
    updateHeaderDates();
    // Re-open the detail modal to show updated values. buildSidebar
    // resets .active to Dashboard, so use state.currentView (kept in
    // sync by navigate) instead of re-reading the DOM.
    markerDetailDeps.navigate(state.currentView || "dashboard");
    showDetailModal(id);
    showNotification(`Removed value from ${date}`, 'info');
  }
}

export function editMarkerValue(id, date, currentValue, event) {
  const el = event.target.closest('.mv-value');
  if (!el || el.querySelector('input')) return;
  const input = document.createElement('input');
  input.type = 'number';
  input.step = 'any';
  input.value = currentValue;
  input.className = 'ref-edit-input';
  input.style.cssText = 'width:100%;max-width:140px;text-align:center;font-size:inherit;box-sizing:border-box;padding:2px 4px';
  el.textContent = '';
  el.appendChild(input);
  input.focus();
  input.select();
  let cancelled = false;
  let saveStarted = false;
  const save = async () => {
    if (cancelled) return;
    if (saveStarted) return;
    saveStarted = true;
    const newValue = parseFloat(input.value);
    if (isNaN(newValue)) { showDetailModal(id); return; }
    // No-op if the value didn't change — don't flip provenance to manual.
    if (newValue === parseFloat(currentValue)) { showDetailModal(id); return; }
    const dotKey = storageDotKeyForId(id);
    if (!dotKey) return;
    const storedValue = convertDisplayToSI(dotKey, newValue);
    const updated = await editManualMarkerValue({ dotKey, date, storedValue });
    if (!updated) return;
    // Rebuild the underlying view so Table/Heatmap/Chart reflect the edit.
    markerDetailDeps.navigate(state.currentView || 'dashboard');
    showDetailModal(id);
  };
  input.addEventListener('blur', () => { void save(); });
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); void save(); }
    else if (e.key === 'Escape') { cancelled = true; showDetailModal(id); }
  });
}

export async function revertMarkerValue(id, date) {
  const dotKey = storageDotKeyForId(id);
  if (!dotKey) return;
  const updated = await revertManualMarkerValue(dotKey, date);
  if (!updated) return;
  // Rebuild the underlying view so Table/Heatmap/Chart reflect the revert.
  markerDetailDeps.navigate(state.currentView || 'dashboard');
  showDetailModal(id);
}

export async function editValueNote(id, date) {
  if (!id || !date) return;
  const dotKey = storageDotKeyForId(id);
  if (!dotKey) return;
  const current = getMarkerValueNote(dotKey, date);
  const result = await showPromptDialog(
    current ? `Edit note for ${date}` : `Add note for ${date}`,
    { defaultValue: current, placeholder: 'e.g. fasted 14h, post-workout, different lab', okLabel: 'Save' }
  );
  // showPromptDialog collapses cancel + empty-submit to null. Treat null as
  // "no change" — explicit deletion is via the dedicated × affordance.
  if (result === null) return;
  // Cap to match saveManualEntry — defends against runaway paste flowing
  // into IDB, sync payloads, and AI context.
  const capped = result.length > 500 ? result.slice(0, 500) : result;
  await saveMarkerValueNote(dotKey, date, capped);
  showDetailModal(id);
}

export async function deleteValueNote(id, date) {
  if (!id || !date) return;
  if (!await showConfirmDialog(`Remove the note for ${date}?`)) return;
  const dotKey = storageDotKeyForId(id);
  if (!dotKey) return;
  const changed = await deleteMarkerValueNote(dotKey, date);
  if (changed) showDetailModal(id);
}

/**
 * @param {string} id
 * @param {string} type
 * @param {MouseEvent} evt
 */
export function editRefRange(id, type, evt) {
  const marker = state.markerRegistry[id];
  if (!marker) return;
  const isOptimal = type === 'optimal';
  const curMin = isOptimal ? marker.optimalMin : marker.refMin;
  const curMax = isOptimal ? marker.optimalMax : marker.refMax;
  const label = isOptimal ? 'Optimal' : 'Reference';

  const span = evt.target instanceof Element ? evt.target.closest('.ref-editable') : null;
  if (!span) return;

  // Replace span with inline inputs
  const form = document.createElement('span');
  form.className = 'ref-edit-form';
  form.innerHTML = `${escapeHTML(label)}: <span class="ref-edit-field"><input type="text" inputmode="decimal" value="${escapeAttr(curMin ?? '')}" placeholder="none" class="ref-edit-input" id="ref-edit-min"><button type="button" class="ref-edit-clear" ${markerDetailActionAttrs('clear-ref-edit-field', { field: 'min' })} title="Clear (open-ended)">\u00d7</button></span> \u2013 <span class="ref-edit-field"><input type="text" inputmode="decimal" value="${escapeAttr(curMax ?? '')}" placeholder="none" class="ref-edit-input" id="ref-edit-max"><button type="button" class="ref-edit-clear" ${markerDetailActionAttrs('clear-ref-edit-field', { field: 'max' })} title="Clear (open-ended)">\u00d7</button></span> <button type="button" class="ref-edit-save" ${markerDetailActionAttrs('save-ref-range', { id, type })}>Save</button>`;
  span.replaceWith(form);
  /** @type {HTMLElement | null} */ (form.querySelector('#ref-edit-min'))?.focus();

  // Enter to save
  form.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); saveRefRange(id, type); } });
  // Escape to cancel
  form.addEventListener('keydown', e => { if (e.key === 'Escape') showDetailModal(id); });
}

export async function saveRefRange(id, type) {
  const dotKey = storageDotKeyForId(id);
  if (!dotKey) return;
  const minEl = /** @type {HTMLInputElement | null} */ (document.getElementById('ref-edit-min'));
  const maxEl = /** @type {HTMLInputElement | null} */ (document.getElementById('ref-edit-max'));
  if (!minEl || !maxEl) return;
  let newMin = minEl.value.trim() !== '' ? parseFloat(minEl.value) : null;
  let newMax = maxEl.value.trim() !== '' ? parseFloat(maxEl.value) : null;
  // Treat NaN as null (open-ended)
  if (newMin != null && isNaN(newMin)) newMin = null;
  if (newMax != null && isNaN(newMax)) newMax = null;

  // If user is in US mode, convert back to SI for storage (overrides are applied before unit conversion)
  if (newMin != null) newMin = convertDisplayToSI(dotKey, newMin);
  if (newMax != null) newMax = convertDisplayToSI(dotKey, newMax);

  const saved = await saveRefRangeOverride(dotKey, type, { min: newMin, max: newMax });
  if (!saved) return;
  // Refresh background view, then re-render modal with new ranges
  const activeNav = /** @type {HTMLElement | null} */ (document.querySelector('.nav-item.active'));
  markerDetailDeps.navigate(activeNav ? activeNav.dataset.category : 'dashboard');
  showDetailModal(id);
  showNotification('Range updated', 'info');
}

export async function revertRefRange(id, type) {
  const dotKey = storageDotKeyForId(id);
  if (!dotKey) return;
  const result = await revertRefRangeOverride(dotKey, type);
  if (!result) return;
  const activeNav = /** @type {HTMLElement | null} */ (document.querySelector('.nav-item.active'));
  markerDetailDeps.navigate(activeNav ? activeNav.dataset.category : 'dashboard');
  showDetailModal(id);
  showNotification(result.message, 'info');
}

export function toggleMarkerNoteEditor() {
  const editor = document.getElementById('marker-note-editor');
  if (!editor) return;
  const isHidden = editor.style.display === 'none';
  editor.style.display = isHidden ? 'block' : 'none';
  if (isHidden) {
    const input = /** @type {HTMLElement | null} */ (document.getElementById('marker-note-input'));
    if (input) input.focus();
  }
}

export async function saveMarkerNote(dotKey, id) {
  const input = /** @type {HTMLTextAreaElement | HTMLInputElement | null} */ (document.getElementById('marker-note-input'));
  const text = input?.value?.trim();
  const result = await saveMarkerNoteText(dotKey, text);
  if (result.action === 'noop') return;
  showNotification(result.action === 'deleted' ? 'Note removed' : 'Note saved', result.action === 'deleted' ? 'info' : 'success');
  showDetailModal(id);
}

export async function deleteMarkerNote(dotKey, id) {
  const changed = await deleteMarkerNoteText(dotKey);
  if (!changed) return;
  showNotification('Note removed', 'info');
  showDetailModal(id);
}
