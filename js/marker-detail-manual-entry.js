// @ts-check
// marker-detail-manual-entry.js — Manual marker-value entry form owner

import { state } from './state.js';
import { getAlternateUnit, SECONDARY_UNIT_CONVERSIONS, UNIT_CONVERSIONS } from './schema.js';
import { escapeHTML, formatValue } from './utils.js';
import { getActiveData } from './data.js';
import { markerDetailActionAttrs } from './marker-detail-actions.js';
import { saveManualEntry } from './marker-detail-editing.js';
import { openModalOverlay } from './modal-lifecycle.js';
import { openWithMarkerDetailStylesheet, setDetailModalShell } from './marker-detail-runtime.js';
import { getMarkerStorageDotKey } from './marker-placement.js';

/**
 * @typedef {{
 *   showDetailModal: (id: string) => any,
 * }} MarkerDetailManualEntryRuntime
 */

/** @type {MarkerDetailManualEntryRuntime} */
const manualEntryRuntime = {
  showDetailModal: () => {},
};

/** @param {Partial<MarkerDetailManualEntryRuntime>} [runtime] */
export function configureMarkerDetailManualEntry(runtime = {}) {
  const previous = { ...manualEntryRuntime };
  Object.assign(manualEntryRuntime, runtime);
  return previous;
}

/**
 * @param {string} id
 * @param {string} [prefillDate]
 */
export function openManualEntryForm(id, prefillDate) {
  return openWithMarkerDetailStylesheet(() => renderManualEntryForm(id, prefillDate));
}

/**
 * @param {string} id
 * @param {string} [prefillDate]
 */
function renderManualEntryForm(id, prefillDate) {
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
  const today = new Date().toISOString().slice(0, 10);
  // Explicit prefill → last-used date in this tab → today.
  let sessionLast = null;
  try {
    const raw = sessionStorage.getItem('labcharts-last-manual-date');
    if (raw && /^\d{4}-\d{2}-\d{2}$/.test(raw)) sessionLast = raw;
  } catch {
    // sessionStorage may be unavailable in private mode.
  }
  const dateValue = typeof prefillDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(prefillDate)
    ? prefillDate
    : (sessionLast || today);
  const existingContext = state.importedData?.entries?.find(entry => entry?.date === dateValue)?.context || {};
  const sampleTimeValue = typeof existingContext.sampleTime === 'string' ? existingContext.sampleTime : '';
  const fastingValue = existingContext.fasting === true ? 'fasting'
    : existingContext.fasting === false ? 'not-fasting'
      : 'unknown';
  const refText = marker.refMin != null || marker.refMax != null
    ? `Reference: ${marker.refMin != null ? marker.refMin : '–'} \u2013 ${marker.refMax != null ? marker.refMax : '–'} ${escapeHTML(marker.unit)}`
    : '';
  let placeholderHint = 'e.g. 5.4';
  if (marker.refMin != null && marker.refMax != null) {
    placeholderHint = `e.g. ${formatValue((marker.refMin + marker.refMax) / 2)}`;
  }

  // Offer the current display unit, alternate US/EU unit, and secondary
  // clinical units so a lab result can be entered without mental conversion.
  const dotKey = getMarkerStorageDotKey(marker, id);
  if (!dotKey) return;
  const isUS = state.unitSystem === 'US';
  const conversion = UNIT_CONVERSIONS[dotKey];
  const units = [marker.unit];
  if (conversion) {
    const probe = marker.refMax ?? marker.refMin ?? 1;
    const alternate = getAlternateUnit(dotKey, probe, isUS);
    if (alternate?.unit) units.push(alternate.unit);
  }
  for (const secondary of SECONDARY_UNIT_CONVERSIONS[dotKey] || []) {
    if (secondary.unit) units.push(secondary.unit);
  }
  const seenUnits = new Set();
  const options = units.filter(unit => {
    const key = String(unit).toLowerCase();
    if (!unit || seenUnits.has(key)) return false;
    seenUnits.add(key);
    return true;
  });
  const unitPickerHtml = options.length > 1
    ? `<select id="me-unit" class="me-unit-select" aria-label="Input unit">
         ${options.map((unit, index) => `<option value="${escapeHTML(unit)}"${index === 0 ? ' selected' : ''}>${escapeHTML(unit)}</option>`).join('')}
       </select>`
    : `<span style="color:var(--text-muted);font-weight:400">(${escapeHTML(marker.unit)})</span>`;

  modal.innerHTML = `<div class="gb-modal-head">
      <div>
        <div class="gb-modal-kicker">${escapeHTML(data.categories[categoryKey]?.label || categoryKey)}</div>
        <div class="gb-modal-title">Add Value Manually</div>
      </div>
      <button class="modal-close" aria-label="Close" ${markerDetailActionAttrs('close-modal')}>&times;</button>
    </div>
    <div class="gb-form-body">
    <div class="modal-unit"><strong>${escapeHTML(marker.name)}</strong> \u00b7 ${escapeHTML(marker.unit)}${refText ? ' \u00b7 ' + refText : ''}</div>
    <div class="manual-entry-form">
      <div class="me-field">
        <label for="me-date">Date</label>
        <input type="date" id="me-date" value="${dateValue}" max="${today}">
      </div>
      <div class="me-field">
        <label for="me-value">Value ${unitPickerHtml}</label>
        <input type="number" id="me-value" step="any" placeholder="${escapeHTML(placeholderHint)}" autofocus>
      </div>
      <div class="me-context-grid">
        <div class="me-field">
          <label for="me-sample-time">Collection time <span class="me-optional">(optional)</span></label>
          <input type="time" id="me-sample-time" value="${escapeHTML(sampleTimeValue)}">
          <small>Use the blood draw/collection time, not the lab processing or report time.</small>
        </div>
        <div class="me-field">
          <label for="me-fasting">Fasting status</label>
          <select id="me-fasting">
            <option value="unknown"${fastingValue === 'unknown' ? ' selected' : ''}>Unknown</option>
            <option value="fasting"${fastingValue === 'fasting' ? ' selected' : ''}>Fasting</option>
            <option value="not-fasting"${fastingValue === 'not-fasting' ? ' selected' : ''}>Not fasting</option>
          </select>
        </div>
      </div>
      <div class="me-field">
        <label for="me-note">Note <span style="color:var(--text-muted);font-weight:400">(optional)</span></label>
        <textarea id="me-note" rows="2" placeholder="Context for this value — e.g. fasted 14h, post-workout, different lab, retake of low value..."></textarea>
      </div>
      <div class="gb-form-actions">
        <button class="import-btn import-btn-primary" ${markerDetailActionAttrs('save-manual-entry', { id })}>Save</button>
        <button class="import-btn import-btn-secondary" ${markerDetailActionAttrs('save-and-add-manual-entry', { id })} title="Save this value, then enter another marker for the same date">Save &amp; Add Another</button>
        <button class="import-btn import-btn-secondary" ${markerDetailActionAttrs('show-detail-modal', { id })}>Cancel</button>
      </div>
    </div>
    </div>`;
  openModalOverlay(overlay, { initialFocus: '#me-value', focusDelay: 50 });
  setTimeout(() => {
    const valueInput = document.getElementById('me-value');
    if (!valueInput) return;
    // Enter-to-save / Esc-to-cancel for keyboard users.
    const onKey = (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        saveManualEntry(id);
      } else if (event.key === 'Escape') {
        event.preventDefault();
        manualEntryRuntime.showDetailModal(id);
      }
    };
    valueInput.addEventListener('keydown', onKey);
    const dateInput = /** @type {HTMLInputElement | null} */ (document.getElementById('me-date'));
    dateInput?.addEventListener('keydown', onKey);
    dateInput?.addEventListener('change', () => {
      const context = state.importedData?.entries?.find(entry => entry?.date === dateInput.value)?.context || {};
      const sampleTime = /** @type {HTMLInputElement | null} */ (document.getElementById('me-sample-time'));
      const fasting = /** @type {HTMLSelectElement | null} */ (document.getElementById('me-fasting'));
      if (sampleTime) sampleTime.value = typeof context.sampleTime === 'string' ? context.sampleTime : '';
      if (fasting) fasting.value = context.fasting === true ? 'fasting' : context.fasting === false ? 'not-fasting' : 'unknown';
    });
  }, 50);
}
