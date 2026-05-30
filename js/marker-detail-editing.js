// marker-detail-editing.js — Marker value, range, and note mutation workflows

import { state } from './state.js';
import { getAlternateUnit, convertUserInputToSI } from './schema.js';
import { escapeHTML, escapeAttr, formatValue, showNotification, showConfirmDialog, showPromptDialog } from './utils.js';
import { getActiveData, saveImportedData, recalculateHOMAIR, updateHeaderDates, convertDisplayToSI } from './data.js';
import { clearTombstone } from './data-merge.js';

const markerDetailDeps = {
  navigate: (category, data) => window.navigate?.(category, data),
  showDetailModal: () => {},
  openManualEntryForm: () => {},
  closeModal: () => {},
};

export function configureMarkerDetailEditing(deps = {}) {
  Object.assign(markerDetailDeps, deps);
}

function showDetailModal(id, opts) {
  return markerDetailDeps.showDetailModal(id, opts);
}

function openManualEntryForm(id, prefillDate) {
  return markerDetailDeps.openManualEntryForm(id, prefillDate);
}

function closeModal() {
  return markerDetailDeps.closeModal();
}

// Insulin is stored under hormones.insulin but also surfaced on the diabetes
// category as diabetes.insulin_d (so the marker shows up in both contexts).
// Per-value notes need to mirror across both keys regardless of which
// category the user is editing from. Returns the OTHER key (if any) so the
// caller can write the same note value to both sides.
function _insulinMirrorNoteKey(dotKey, date) {
  if (dotKey === 'hormones.insulin') return 'diabetes.insulin_d:' + date;
  if (dotKey === 'diabetes.insulin_d') return 'hormones.insulin:' + date;
  return null;
}

function _entryHasImportedSource(entry, dotKey) {
  if (!entry) return false;
  const markerSource = entry.markerSources?.[dotKey];
  return !!(markerSource?.file || entry.sourceFile);
}

function _rememberManualOriginal(dotKey, date, entry) {
  if (!entry || !dotKey || !date) return;
  if (!state.importedData.manualValues) state.importedData.manualValues = {};
  const mvKey = dotKey + ':' + date;
  const current = entry.markers?.[dotKey];
  const hasImportedOriginal = current != null && _entryHasImportedSource(entry, dotKey);
  if (!(mvKey in state.importedData.manualValues)) {
    state.importedData.manualValues[mvKey] = hasImportedOriginal ? current : true;
  } else if (state.importedData.manualValues[mvKey] === true && hasImportedOriginal) {
    state.importedData.manualValues[mvKey] = current;
  }
}

export async function saveManualEntry(id, opts = {}) {
  const { keepOpen = false } = opts;
  const dateInput = document.getElementById('me-date');
  const valueInput = document.getElementById('me-value');
  const noteInput = document.getElementById('me-note');
  const unitInput = document.getElementById('me-unit');
  if (!dateInput || !valueInput) return;
  const date = dateInput.value;
  const value = parseFloat(valueInput.value);
  // Cap notes at 500 chars to defend against runaway paste — matches the
  // wearable-manual.js `_sanitizeNote` ceiling. Notes flow into IDB +
  // sync payloads + AI context; a few-MB paste would bloat all three.
  const noteRaw = noteInput ? noteInput.value.trim() : '';
  const noteText = noteRaw.length > 500 ? noteRaw.slice(0, 500) : noteRaw;
  if (!date) { showNotification('Please enter a date', 'error'); return; }
  if (isNaN(value)) { showNotification('Please enter a valid number', 'error'); return; }
  const dotKey = id.replace('_', '.');
  // Always re-resolve marker from getActiveData (not state.markerRegistry):
  // the registry may hold a marker.unit captured under a different unit-system
  // mode, which would break the unit-picker comparison below.
  const _meIdx = id.indexOf('_');
  const marker = _meIdx > 0
    ? getActiveData().categories[id.slice(0, _meIdx)]?.markers[id.slice(_meIdx + 1)]
    : null;
  // Unit-picker integration: if the user selected the alternate unit, the
  // range sanity check needs alt-unit-space refs (otherwise typing "90 mg/dL"
  // against an SI ref range of 4–6 mmol/L would always trigger the warning).
  const inputUnit = unitInput?.value || marker?.unit || '';
  const usingAltUnit = !!(marker && inputUnit && inputUnit !== marker.unit);
  let checkRefMin = marker?.refMin, checkRefMax = marker?.refMax, checkUnit = marker?.unit;
  if (marker && usingAltUnit) {
    const isUSMode = state.unitSystem === 'US';
    const altMin = marker.refMin != null ? getAlternateUnit(dotKey, marker.refMin, isUSMode) : null;
    const altMax = marker.refMax != null ? getAlternateUnit(dotKey, marker.refMax, isUSMode) : null;
    checkRefMin = altMin?.value ?? null;
    checkRefMax = altMax?.value ?? null;
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
  if (!state.importedData.entries) state.importedData.entries = [];
  clearTombstone(state.importedData, 'entries', date);
  let entry = state.importedData.entries.find(e => e.date === date);
  if (!entry) {
    entry = { date: date, markers: {} };
    state.importedData.entries.push(entry);
  }
  // If the user picked the alternate unit, convert from there directly to SI
  // (convertUserInputToSI is a no-op when inputUnit is already the SI unit, so
  // the EU-mode default keeps working unchanged). Otherwise fall through to the
  // existing display→SI path which handles the US-mode case.
  const storedValue = usingAltUnit
    ? convertUserInputToSI(dotKey, value, inputUnit)
    : convertDisplayToSI(dotKey, value);
  _rememberManualOriginal(dotKey, date, entry);
  entry.markers[dotKey] = storedValue;
  if (!entry.markerSources) entry.markerSources = {};
  entry.markerSources[dotKey] = { file: null, at: Date.now() };
  // Per-value note: store on save when non-empty; clear when emptied.
  if (!state.importedData.markerValueNotes) state.importedData.markerValueNotes = {};
  const noteKey = dotKey + ':' + date;
  if (noteText) state.importedData.markerValueNotes[noteKey] = noteText;
  else delete state.importedData.markerValueNotes[noteKey];
  if (dotKey === 'hormones.insulin') {
    _rememberManualOriginal('diabetes.insulin_d', date, entry);
    entry.markers['diabetes.insulin_d'] = storedValue;
    entry.markerSources['diabetes.insulin_d'] = entry.markerSources[dotKey];
  }
  // Mirror the per-value note across the insulin dual-mapping — same reading,
  // two views. Bidirectional: user may save via either category page. Without
  // this, a note added on one side wouldn't show on the other, and orphans
  // would accumulate over delete cycles.
  const insulinNoteMirror = _insulinMirrorNoteKey(dotKey, date);
  if (insulinNoteMirror) {
    if (noteText) state.importedData.markerValueNotes[insulinNoteMirror] = noteText;
    else delete state.importedData.markerValueNotes[insulinNoteMirror];
  }
  recalculateHOMAIR(entry);
  await saveImportedData();
  // Remember the date session-wide so the next manual entry defaults to it.
  try { sessionStorage.setItem('labcharts-last-manual-date', date); } catch (_) {}
  window.buildSidebar();
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
  const dotKey = id.replace('_', '.');
  if (!state.importedData.entries) return;
  const entry = state.importedData.entries.find(e => e.date === date);
  if (!entry || entry.markers[dotKey] === undefined) return;
  if (await showConfirmDialog(`Delete this value (${date})? This can't be undone.`)) {
    delete entry.markers[dotKey];
    // Clean up provenance and manual tracking
    if (entry.markerSources) delete entry.markerSources[dotKey];
    if (state.importedData.manualValues) delete state.importedData.manualValues[dotKey + ':' + date];
    // Drop the per-value note (if any) — value is gone, note is orphaned.
    if (state.importedData.markerValueNotes) delete state.importedData.markerValueNotes[dotKey + ':' + date];
    // Clean up insulin dual-mapping (value, provenance, AND the per-value
    // note for the mirror key — same reading, both views must go together).
    if (dotKey === 'hormones.insulin') {
      delete entry.markers['diabetes.insulin_d'];
      if (entry.markerSources) delete entry.markerSources['diabetes.insulin_d'];
      if (state.importedData.manualValues) delete state.importedData.manualValues['diabetes.insulin_d:' + date];
      recalculateHOMAIR(entry);
    }
    // Mirror the note delete in both directions — user may delete via either
    // category. Forward-only would leave orphans on the other side.
    const mirrorKey = _insulinMirrorNoteKey(dotKey, date);
    if (mirrorKey && state.importedData.markerValueNotes) {
      delete state.importedData.markerValueNotes[mirrorKey];
    }
    // Remove entry entirely if no markers left
    if (Object.keys(entry.markers).length === 0) {
      state.importedData.entries = state.importedData.entries.filter(e => e.date !== date);
    }
    saveImportedData();
    window.buildSidebar();
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
    const dotKey = id.replace('_', '.');
    const entry = state.importedData.entries?.find(e => e.date === date);
    if (!entry) return;
    // Track as manually edited — store original value for revert (true = manual entry with no original)
    _rememberManualOriginal(dotKey, date, entry);
    const storedValue = convertDisplayToSI(dotKey, newValue);
    entry.markers[dotKey] = storedValue;
    // Update provenance to reflect manual edit
    if (!entry.markerSources) entry.markerSources = {};
    entry.markerSources[dotKey] = { file: null, at: Date.now() };
    if (dotKey === 'hormones.insulin') { entry.markers['diabetes.insulin_d'] = storedValue; if (entry.markerSources) entry.markerSources['diabetes.insulin_d'] = entry.markerSources[dotKey]; recalculateHOMAIR(entry); }
    await saveImportedData();
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
  const dotKey = id.replace('_', '.');
  const mvKey = dotKey + ':' + date;
  const original = state.importedData.manualValues?.[mvKey];
  if (original == null || original === true) return;
  const entry = state.importedData.entries?.find(e => e.date === date);
  if (!entry) return;
  entry.markers[dotKey] = original;
  if (entry.markerSources) delete entry.markerSources[dotKey];
  if (dotKey === 'hormones.insulin') {
    entry.markers['diabetes.insulin_d'] = original;
    if (entry.markerSources) delete entry.markerSources['diabetes.insulin_d'];
    delete state.importedData.manualValues['diabetes.insulin_d:' + date];
    recalculateHOMAIR(entry);
  }
  delete state.importedData.manualValues[mvKey];
  await saveImportedData();
  // Rebuild the underlying view so Table/Heatmap/Chart reflect the revert.
  markerDetailDeps.navigate(state.currentView || 'dashboard');
  showDetailModal(id);
}

export async function editValueNote(id, date) {
  if (!id || !date) return;
  const dotKey = id.replace('_', '.');
  const noteKey = dotKey + ':' + date;
  if (!state.importedData.markerValueNotes) state.importedData.markerValueNotes = {};
  const current = state.importedData.markerValueNotes[noteKey] || '';
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
  state.importedData.markerValueNotes[noteKey] = capped;
  // Mirror across the insulin dual-mapping in BOTH directions so a note
  // edited via diabetes.insulin_d also lands on hormones.insulin and vice
  // versa.
  const mirror = _insulinMirrorNoteKey(dotKey, date);
  if (mirror) state.importedData.markerValueNotes[mirror] = capped;
  saveImportedData();
  showDetailModal(id);
}

export async function deleteValueNote(id, date) {
  if (!id || !date) return;
  if (!await showConfirmDialog(`Remove the note for ${date}?`)) return;
  const dotKey = id.replace('_', '.');
  const noteKey = dotKey + ':' + date;
  if (state.importedData.markerValueNotes && state.importedData.markerValueNotes[noteKey]) {
    delete state.importedData.markerValueNotes[noteKey];
    // Mirror cleanup in BOTH directions across the insulin dual-mapping.
    const mirror = _insulinMirrorNoteKey(dotKey, date);
    if (mirror) delete state.importedData.markerValueNotes[mirror];
    saveImportedData();
    showDetailModal(id);
  }
}

export function editRefRange(id, type, evt) {
  const marker = state.markerRegistry[id];
  if (!marker) return;
  const isOptimal = type === 'optimal';
  const curMin = isOptimal ? marker.optimalMin : marker.refMin;
  const curMax = isOptimal ? marker.optimalMax : marker.refMax;
  const label = isOptimal ? 'Optimal' : 'Reference';

  const span = evt.target.closest('.ref-editable');
  if (!span) return;

  // Replace span with inline inputs
  const form = document.createElement('span');
  form.className = 'ref-edit-form';
  form.innerHTML = `${escapeHTML(label)}: <span class="ref-edit-field"><input type="text" inputmode="decimal" value="${escapeAttr(curMin ?? '')}" placeholder="none" class="ref-edit-input" id="ref-edit-min"><button type="button" class="ref-edit-clear" onclick="document.getElementById('ref-edit-min').value='';document.getElementById('ref-edit-min').focus()" title="Clear (open-ended)">\u00d7</button></span> \u2013 <span class="ref-edit-field"><input type="text" inputmode="decimal" value="${escapeAttr(curMax ?? '')}" placeholder="none" class="ref-edit-input" id="ref-edit-max"><button type="button" class="ref-edit-clear" onclick="document.getElementById('ref-edit-max').value='';document.getElementById('ref-edit-max').focus()" title="Clear (open-ended)">\u00d7</button></span> <button class="ref-edit-save" onclick="saveRefRange('${id}','${type}')">Save</button>`;
  span.replaceWith(form);
  form.querySelector('#ref-edit-min').focus();

  // Enter to save
  form.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); saveRefRange(id, type); } });
  // Escape to cancel
  form.addEventListener('keydown', e => { if (e.key === 'Escape') showDetailModal(id); });
}

export function saveRefRange(id, type) {
  const dotKey = id.replace('_', '.');
  const minEl = document.getElementById('ref-edit-min');
  const maxEl = document.getElementById('ref-edit-max');
  if (!minEl || !maxEl) return;
  let newMin = minEl.value.trim() !== '' ? parseFloat(minEl.value) : null;
  let newMax = maxEl.value.trim() !== '' ? parseFloat(maxEl.value) : null;
  // Treat NaN as null (open-ended)
  if (newMin != null && isNaN(newMin)) newMin = null;
  if (newMax != null && isNaN(newMax)) newMax = null;

  // If user is in US mode, convert back to SI for storage (overrides are applied before unit conversion)
  if (newMin != null) newMin = convertDisplayToSI(dotKey, newMin);
  if (newMax != null) newMax = convertDisplayToSI(dotKey, newMax);

  if (!state.importedData.refOverrides) state.importedData.refOverrides = {};
  if (!state.importedData.refOverrides[dotKey]) state.importedData.refOverrides[dotKey] = {};

  const ovr = state.importedData.refOverrides[dotKey];
  if (type === 'optimal') {
    // Stash lab values before first manual edit
    if (ovr.optimalSource !== 'manual' && ('optimalMin' in ovr) && !('labOptimalMin' in ovr)) {
      ovr.labOptimalMin = ovr.optimalMin;
      ovr.labOptimalMax = ovr.optimalMax;
    }
    ovr.optimalMin = newMin;
    ovr.optimalMax = newMax;
    ovr.optimalSource = 'manual';
  } else {
    if (ovr.refSource !== 'manual' && ('refMin' in ovr) && !('labRefMin' in ovr)) {
      ovr.labRefMin = ovr.refMin;
      ovr.labRefMax = ovr.refMax;
    }
    ovr.refMin = newMin;
    ovr.refMax = newMax;
    ovr.refSource = 'manual';
  }

  saveImportedData();
  // Refresh background view, then re-render modal with new ranges
  const activeNav = document.querySelector('.nav-item.active');
  markerDetailDeps.navigate(activeNav ? activeNav.dataset.category : 'dashboard');
  showDetailModal(id);
  showNotification('Range updated', 'info');
}

export function revertRefRange(id, type) {
  const dotKey = id.replace('_', '.');
  const ovr = state.importedData?.refOverrides?.[dotKey];
  if (!ovr) return;
  let msg = 'Range reverted to default';
  if (type === 'optimal') {
    if ('labOptimalMin' in ovr) {
      // Revert to imported lab range
      ovr.optimalMin = ovr.labOptimalMin;
      ovr.optimalMax = ovr.labOptimalMax;
      ovr.optimalSource = 'import';
      delete ovr.labOptimalMin; delete ovr.labOptimalMax;
      msg = 'Range reverted to lab range';
    } else {
      delete ovr.optimalMin; delete ovr.optimalMax; delete ovr.optimalSource;
    }
  } else {
    if ('labRefMin' in ovr) {
      ovr.refMin = ovr.labRefMin;
      ovr.refMax = ovr.labRefMax;
      ovr.refSource = 'import';
      delete ovr.labRefMin; delete ovr.labRefMax;
      msg = 'Range reverted to lab range';
    } else {
      delete ovr.refMin; delete ovr.refMax; delete ovr.refSource;
    }
  }
  // Clean up empty override objects
  if (Object.keys(ovr).length === 0) delete state.importedData.refOverrides[dotKey];
  saveImportedData();
  const activeNav = document.querySelector('.nav-item.active');
  markerDetailDeps.navigate(activeNav ? activeNav.dataset.category : 'dashboard');
  showDetailModal(id);
  showNotification(msg, 'info');
}

export function toggleMarkerNoteEditor(dotKey) {
  const editor = document.getElementById('marker-note-editor');
  if (!editor) return;
  const isHidden = editor.style.display === 'none';
  editor.style.display = isHidden ? 'block' : 'none';
  if (isHidden) {
    const input = document.getElementById('marker-note-input');
    if (input) input.focus();
  }
}

export function saveMarkerNote(dotKey, id) {
  const input = document.getElementById('marker-note-input');
  const text = input?.value?.trim();
  if (!text) {
    // Empty text = delete the note
    if (state.importedData.markerNotes?.[dotKey]) {
      delete state.importedData.markerNotes[dotKey];
      saveImportedData();
      showNotification('Note removed', 'info');
      showDetailModal(id);
    }
    return;
  }
  if (!state.importedData.markerNotes) state.importedData.markerNotes = {};
  state.importedData.markerNotes[dotKey] = text;
  saveImportedData();
  showNotification('Note saved', 'success');
  showDetailModal(id);
}

export function deleteMarkerNote(dotKey, id) {
  if (!state.importedData.markerNotes) return;
  delete state.importedData.markerNotes[dotKey];
  saveImportedData();
  showNotification('Note removed', 'info');
  showDetailModal(id);
}
