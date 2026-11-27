// marker-detail-manual-entry.js — Manual marker-value entry form owner

import { state } from './state.js';
import { formatValue } from './utils.js';
import { projectManualEntryUnits, renderManualMarkerEntry } from './manual-marker-entry-presentation.js';
import { getActiveData } from './data.js';
import { identifyLabPanels, labPanelId } from './lab-panel-identity.js';
import { bindManualEntryOwner, saveManualEntry } from './marker-detail-editing.js';
import { openModalOverlay } from './modal-lifecycle.js';
import { openWithMarkerDetailStylesheet, setDetailModalShell } from './marker-detail-runtime.js';
import { getMarkerStorageDotKey } from './marker-placement.js';
import { getMarkerInputUnits } from './unit-profiles.js';

interface ManualEntryCalls { showDetailModal(id: string): unknown }
export type ManualEntryRuntimeSnapshot = { [Key in keyof ManualEntryCalls]: unknown };
const manualEntryRuntime: ManualEntryCalls = {
  showDetailModal: () => {},
};

export function configureMarkerDetailManualEntry(runtime: unknown = {}): ManualEntryRuntimeSnapshot {
  const previous = { ...manualEntryRuntime };
  Object.assign(manualEntryRuntime, runtime);
  return previous;
}

export function openManualEntryForm(id: string, prefillDate?: unknown) {
  return openWithMarkerDetailStylesheet(() => renderManualEntryForm(id, prefillDate));
}

function renderManualEntryForm(id: string, prefillDate?: unknown) {
  // Always re-resolve from getActiveData — state.markerRegistry carries the
  // unit-system mode in effect when it was rendered and can become stale.
  const idx = id.indexOf('_');
  if (idx < 0) return;
  const categoryKey = id.slice(0, idx);
  const markerKey = id.slice(idx + 1);
  const data = getActiveData();
  const marker = data.categories[categoryKey]?.markers[markerKey];
  if (marker) state.markerRegistry[id] = marker;
  if (!marker) return;
  const modal = setDetailModalShell('gb-form-modal', 'marker-form-modal');
  const overlay = document.getElementById('modal-overlay');
  if (!modal) return;
  const now = new Date();
  const today = [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0')].join('-');
  // Explicit prefill → last-used date in this tab → today.
  let sessionLast: string | null = null;
  try {
    const raw = sessionStorage.getItem('labcharts-last-manual-date');
    if (raw && /^\d{4}-\d{2}-\d{2}$/.test(raw)) sessionLast = raw;
  } catch {
    // sessionStorage may be unavailable in private mode.
  }
  const dateValue = typeof prefillDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(prefillDate)
    ? prefillDate
    : (sessionLast || today);
  const dateEntries = (state.importedData?.entries || []).filter(entry => entry.date === dateValue);
  const existingContext = (dateEntries.length === 1 ? dateEntries[0]?.context : null) || {};
  const sampleTimeValue = typeof existingContext.sampleTime === 'string' ? existingContext.sampleTime : '';
  const fastingValue = existingContext.fasting === true ? 'fasting'
    : existingContext.fasting === false ? 'not-fasting'
      : 'unknown';
  const refText = marker.refMin != null || marker.refMax != null
    ? `Reference: ${marker.refMin != null ? marker.refMin : '–'} \u2013 ${marker.refMax != null ? marker.refMax : '–'} ${String(marker.unit ?? '')}`
    : '';
  let placeholderHint = 'e.g. 5.4';
  if (marker.refMin != null && marker.refMax != null) {
    placeholderHint = `e.g. ${formatValue((marker.refMin + marker.refMax) / 2)}`;
  }

  // Offer the active profile unit plus compatible canonical, US, ANZ, and
  // secondary clinical units so a result can be entered as printed by the lab.
  const dotKey = getMarkerStorageDotKey(marker, id);
  if (!dotKey) return;
  const customCanonicalUnit = state.importedData?.customMarkers?.[dotKey]?.unit || null;
  const options = getMarkerInputUnits(dotKey, state.unitSystem, customCanonicalUnit);
  const unitPicker = projectManualEntryUnits(options, () => marker.unit);
  modal.innerHTML = renderManualMarkerEntry({
    category: () => data.categories[categoryKey]?.label || categoryKey,
    closeAction: () => ({action:'show-detail-modal',id}),
    name: () => marker.name,
    unit: () => marker.unit,
    reference: refText ? ' \u00b7 ' + refText : '',
    date: dateValue,
    today,
    unitPicker,
    placeholder: placeholderHint,
    sampleTime: sampleTimeValue,
    fasting: fastingValue,
    saveAction: () => ({action:'save-manual-entry',id}),
    addAction: () => ({action:'save-and-add-manual-entry',id}),
    cancelAction: () => ({action:'show-detail-modal',id}),
  });
  openModalOverlay(overlay, { initialFocus: '#me-value', focusDelay: 50 });
  const valueInput = modal.querySelector('#me-value') as HTMLInputElement | null;
  if (!valueInput) return;
  // Autofocus can receive Enter immediately; bind before returning the form.
  // Detached controls must not dispatch work into a replacement form.
  const isCurrent = () => !!overlay?.classList.contains('show')
    && modal.contains(valueInput) && document.getElementById('me-value') === valueInput;
  // Enter-to-save / Esc-to-cancel for keyboard users.
  const onKey = (event: KeyboardEvent) => {
    if (!isCurrent()) return;
    if (event.key === 'Enter') {
      event.preventDefault();
      saveManualEntry(id);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      manualEntryRuntime.showDetailModal(id);
    }
  };
  valueInput.addEventListener('keydown', onKey);
  const dateInput = (modal.querySelector('#me-date') as HTMLInputElement | null);
  dateInput?.addEventListener('keydown', onKey);
  const chooser = modal.querySelector<HTMLSelectElement>('#me-sample');
  if (!dateInput || !chooser) return;
  const owner = state.importedData, profile = state.currentProfile, units = state.unitSystem;
  let panels = identifyLabPanels([]);
  function applySampleContext() {
    if (!isCurrent()) return;
    const entry = panels.find(panel => labPanelId(panel) === chooser!.value);
    const context = entry?.context || {};
    const sampleTime = modal!.querySelector<HTMLInputElement>('#me-sample-time');
    const fasting = modal!.querySelector<HTMLSelectElement>('#me-fasting');
    if (sampleTime) sampleTime.value = typeof context.sampleTime === 'string' ? context.sampleTime : '';
    if (fasting) fasting.value = context.fasting === true ? 'fasting' : context.fasting === false ? 'not-fasting' : 'unknown';
  }
  const refreshChoices = () => {
    if (!isCurrent()) return;
    const day = dateInput.value;
    const reviewed = structuredClone((owner.entries || []).filter(entry => entry.date === day));
    panels = identifyLabPanels(reviewed);
    const note = owner.markerValueNotes?.[`${dotKey}:${day}`] || '';
    bindManualEntryOwner(valueInput, profile, owner, units, day, reviewed, dotKey!, note);
    const noteInput = modal.querySelector<HTMLTextAreaElement>('#me-note');
    if (noteInput) noteInput.value = note;
    const noteLabel = modal.querySelector('label[for="me-note"]');
    if (noteLabel?.firstChild) noteLabel.firstChild.textContent = panels.length ? 'Note for this marker and date ' : 'Note ';
    const options = panels.map((panel, i) => new Option([`Sample ${i + 1}`, panel.context?.sampleTime, panel.specimen, panel.sourceFile].filter(Boolean).join(' · '), labPanelId(panel)));
    if (panels.length > 1) options.unshift(new Option('Choose a collection', ''));
    options.push(new Option('Create a separate collection', '__new__'));
    chooser.replaceChildren(...options);
    modal.querySelector<HTMLElement>('#me-sample-field')!.hidden = !panels.length;
    applySampleContext();
  };
  refreshChoices();
  chooser.addEventListener('change', applySampleContext);
  dateInput.addEventListener('change', refreshChoices);
}
