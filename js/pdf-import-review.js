// @ts-check — Import review modal rendering and interaction state
import { state } from './state.js';
import { formatCost } from './schema.js';
import { escapeHTML, showNotification, isDebugMode } from './utils.js';
import {
  getAIProvider,
  getOllamaMainModel,
  getVeniceModelDisplay,
  getOpenRouterModelDisplay,
  getActiveModelDisplay,
  getOllamaPIIModel,
} from './api.js';
import { closeModalOverlay, openModalOverlay } from './modal-lifecycle.js';
import {
  buildMarkerReference,
  normalizeToSI,
  convertImportValueUnit,
  convertGenericImportValueUnit,
} from './pdf-import-marker-mapping.js';
import {
  formatImportLabRange,
  formatImportNumber,
  getImportUnitOptions,
  positionImportUnitMenu,
  renderUnitSelect,
} from './pdf-import-review-formatting.js';
import { openImportMarkerMapModal } from './import-marker-map-modal.js';
import {
  clearImportReviewDraft, persistImportReviewDraft as saveImportReviewDraft, readImportReviewDraft,
} from './import-review-draft.js';
import {
  renderImportExcludeButton,
  renderImportMapInput,
  setImportExcludeButtonState,
} from './import-review-row-actions.js';
import {
  clearPendingImportRuntime,
  confirmImportFromRuntime,
  getBatchImportContext,
  getPendingImportFromRuntime,
  getPendingImportRefLookup,
  hasBatchImportContext,
  markImportReviewDelegatesBound, parseImportDatasetIndex,
  setPendingImportRuntime,
  showPIIDiffViewerFromRuntime,
  startBatchImport,
  takeBatchImportResolve,
} from './pdf-import-review-runtime.js';
import { finishImportBenchmark } from './import-benchmarks.js';
import { normalizeLabFastingStatus, normalizeLabSampleTime } from './lab-entry.js';
function clearPendingImport() {
  clearPendingImportRuntime();
  clearImportReviewDraft();
}

function restoreDropZoneVisibility() {
  const dropZone = document.getElementById('drop-zone');
  if (dropZone) dropZone.style.display = '';
}

function hideImportOverlay() {
  closeModalOverlay('import-modal-overlay');
}

function importReviewActionAttrs(action, extra = '') {
  return `data-import-review-action="${action}"${extra ? ` ${extra}` : ''}`;
}

function closestImportReviewElement(target, selector) {
  const el = target instanceof Element ? target.closest(selector) : null;
  return el instanceof HTMLElement && el.closest('#import-modal') ? el : null;
}

function persistImportReviewDraftForState(parseResult = getPendingImport()) {
  if (!parseResult) return;
  if (!parseResult._importProfileId) parseResult._importProfileId = state.currentProfile;
  saveImportReviewDraft(parseResult, {
    profileId: state.currentProfile || 'default',
    excludedIndices: Array.from(getExcludedImportIndices()),
    isBatch: hasBatchImportContext(),
    debug: isDebugMode(),
  });
}

function persistCurrentImportReviewDraft() {
  persistImportReviewDraftForState();
}

function getStoredExcludedImportIndices(parseResult) {
  const raw = Array.isArray(parseResult?._excludedImportIndices) ? parseResult._excludedImportIndices : [];
  return new Set(raw.map(value => Number(value)).filter(value => Number.isInteger(value) && value >= 0));
}

function restoreExcludedImportRows(parseResult) {
  const excluded = getStoredExcludedImportIndices(parseResult);
  if (excluded.size === 0) return;
  for (const idx of excluded) {
    const row = getImportReviewRow(idx);
    const btn = /** @type {HTMLElement | null} */ (row?.querySelector('.import-exclude-btn'));
    if (!row || !btn) continue;
    row.classList.add('import-excluded');
    setImportExcludeButtonState(btn, true);
  }
}

export function restoreImportReviewDraft() {
  const parseResult = readImportReviewDraft(state.currentProfile || 'default');
  if (!parseResult) return false;
  showImportPreview({ ...parseResult, _restoredFromDraft: true });
  return true;
}

/** @param {MouseEvent} event */
function handleImportReviewClick(event) {
  const unitOption = event.target instanceof Element ? event.target.closest('[data-import-unit-option]') : null;
  if (unitOption instanceof HTMLElement && unitOption.closest('.import-unit-menu')) {
    selectImportUnitOption(unitOption);
    return;
  }
  const unitMenuClick = event.target instanceof Element && event.target.closest('.import-unit-menu');
  const unitButtonClick = event.target instanceof Element && event.target.closest('[data-import-review-action="unit-picker"]');
  if (!unitMenuClick && !unitButtonClick) closeImportUnitPicker();

  const actionEl = closestImportReviewElement(event.target, '[data-import-review-action]');
  if (!actionEl) return;
  switch (actionEl.dataset.importReviewAction || '') {
    case 'close':
      closeImportModal();
      break;
    case 'filter':
      setImportReviewFilter(actionEl);
      break;
    case 'toggle-row':
      toggleImportRow(actionEl);
      break;
    case 'unit-picker':
      toggleImportUnitPicker(actionEl);
      break;
    case 'open-map-modal':
      openImportMarkerMapPicker(actionEl);
      break;
    case 'privacy-details': {
      const pending = getPendingImport();
      if (pending?.privacyOriginal && pending?.privacyObfuscated) {
        showPIIDiffViewerFromRuntime(pending.privacyOriginal, pending.privacyObfuscated);
      }
      break;
    }
    case 'confirm': {
      confirmImportFromRuntime();
      break;
    }
    default:
      break;
  }
}

/** @param {Event} event */
function handleImportReviewInput(event) {
  if (closestImportReviewElement(event.target, '[data-import-review-action="search"]')) {
    applyImportReviewFilters();
  }
}

/** @param {Event} event */
function handleImportReviewChange(event) {
  const dateInput = closestImportReviewElement(event.target, '[data-import-review-action="manual-date"]');
  if (dateInput instanceof HTMLInputElement) {
    applyManualImportDate(dateInput.value);
    return;
  }
  const sampleTimeInput = closestImportReviewElement(event.target, '[data-import-review-action="manual-sample-time"]');
  if (sampleTimeInput instanceof HTMLInputElement) {
    applyManualImportCollectionContext({ sampleTime: sampleTimeInput.value || null });
    return;
  }
  const fastingInput = closestImportReviewElement(event.target, '[data-import-review-action="manual-fasting"]');
  if (fastingInput instanceof HTMLSelectElement) {
    applyManualImportCollectionContext({
      fasting: fastingInput.value === 'fasting' ? true : fastingInput.value === 'not-fasting' ? false : null,
    });
    return;
  }
  const mapInput = closestImportReviewElement(event.target, '[data-import-review-action="map-marker"]');
  if (mapInput instanceof HTMLInputElement) mapUnmatchedMarkerInput(mapInput);
  const valueInput = closestImportReviewElement(event.target, '[data-import-review-action="edit-value"]');
  if (valueInput instanceof HTMLInputElement) updateImportMarkerValue(valueInput);

  const unitInput = closestImportReviewElement(event.target, '[data-import-review-action="edit-unit"]');
  if (unitInput instanceof HTMLInputElement) {
    updateImportMarkerUnit(unitInput);
  }
}

function updateImportMarkerValue(inputEl) {
  const result = getPendingImport();
  if (!result) return;
  const idx = parseInt(inputEl.dataset.markerIdx, 10);
  const marker = result.markers[idx];
  if (!marker) return;
  const val = parseFloat(inputEl.value.replace(',', '.'));
  const nextValue = isNaN(val) ? null : val;
  if (!Object.is(marker.value, nextValue)) marker._benchmarkValueEdited = true;
  marker.value = nextValue;
  persistCurrentImportReviewDraft();
}

function updateImportMarkerUnit(inputEl) {
  updateImportMarkerUnitValue(inputEl, inputEl.value.trim() || null);
}

function convertImportReviewUnitValue(marker, value, previousUnit, nextUnit) {
  if (value == null || isNaN(value)) return null;
  const key = marker.mappedKey || marker.suggestedKey;
  const schemaValue = key ? convertImportValueUnit(key, value, previousUnit, nextUnit) : null;
  return schemaValue != null ? schemaValue : convertGenericImportValueUnit(value, previousUnit, nextUnit);
}

function updateImportMarkerUnitValue(controlEl, nextUnit) {
  const result = getPendingImport();
  if (!result) return;
  const idx = parseInt(controlEl.dataset.markerIdx, 10);
  const marker = result.markers[idx];
  if (!marker) return;
  const previousUnit = marker.unit || null;
  if (previousUnit !== nextUnit) {
    marker._benchmarkUnitEdited = true;
    const row = getImportReviewRow(idx, controlEl);
    const nextValue = convertImportReviewUnitValue(marker, marker.value, previousUnit, nextUnit);
    if (nextValue != null) {
      marker.value = nextValue;
      const valueInput = /** @type {HTMLInputElement | null} */ (row?.querySelector('.import-value-input'));
      if (valueInput) valueInput.value = formatImportNumber(nextValue);
    }
    const nextRefMin = convertImportReviewUnitValue(marker, marker.refMin, previousUnit, nextUnit);
    const nextRefMax = convertImportReviewUnitValue(marker, marker.refMax, previousUnit, nextUnit);
    if (nextRefMin != null || nextRefMax != null) {
      if (nextRefMin != null) marker.refMin = nextRefMin;
      if (nextRefMax != null) marker.refMax = nextRefMax;
      const rangeCell = row?.querySelector('.import-range-cell');
      if (rangeCell) rangeCell.textContent = formatImportLabRange(marker) || '\u2014';
    }
  }
  marker.unit = nextUnit;
  updateImportUnitControl(idx, nextUnit);
  persistCurrentImportReviewDraft();
}

function initImportReviewDelegates() {
  if (typeof document === 'undefined' || !markImportReviewDelegatesBound()) return;
  document.addEventListener('click', handleImportReviewClick);
  document.addEventListener('input', handleImportReviewInput);
  document.addEventListener('change', handleImportReviewChange);
  document.addEventListener('keydown', handleImportReviewKeydown);
}

initImportReviewDelegates();

export function getPendingImport() {
  return getPendingImportFromRuntime();
}

export function resolveImportPreviewBatch(action) {
  const resolve = takeBatchImportResolve();
  if (!resolve) return false;
  hideImportOverlay();
  clearPendingImport();
  restoreDropZoneVisibility();
  resolve(action);
  return true;
}

/** @param {KeyboardEvent} event */
function handleImportReviewKeydown(event) {
  if (event.key !== 'Escape') return;
  if (document.querySelector('.import-unit-menu')) {
    event.preventDefault();
    closeImportUnitPicker();
  }
}

function closeImportUnitPicker() {
  document.querySelector('.import-unit-menu')?.remove();
  for (const button of document.querySelectorAll('[data-import-review-action="unit-picker"][aria-expanded="true"]')) {
    button.setAttribute('aria-expanded', 'false');
  }
}
/** @param {HTMLElement} button */
function toggleImportUnitPicker(button) {
  const existing = document.querySelector('.import-unit-menu');
  const idx = parseImportDatasetIndex(button.dataset.markerIdx); if (idx == null) return;
  if (existing && existing.getAttribute('data-marker-idx') === String(idx)) {
    closeImportUnitPicker();
    return;
  }
  openImportUnitPicker(button);
}

/** @param {HTMLElement} button */
function openImportUnitPicker(button) {
  const result = getPendingImport();
  if (!result) return;
  const idx = parseImportDatasetIndex(button.dataset.markerIdx); if (idx == null) return;
  const marker = result.markers[idx];
  if (!marker) return;
  const unitOptions = getImportUnitOptions(marker);
  if (unitOptions.units.length === 0) return;
  const currentUnit = marker.unit || '';
  const units = currentUnit && !unitOptions.units.includes(currentUnit)
    ? [currentUnit, ...unitOptions.units]
    : unitOptions.units;

  closeImportUnitPicker();
  const menu = document.createElement('div');
  menu.className = 'import-unit-menu';
  menu.setAttribute('role', 'listbox');
  menu.setAttribute('aria-label', `Unit for ${marker.rawName || 'marker'}`);
  menu.setAttribute('data-marker-idx', String(idx));
  menu.innerHTML = units.map((unit, optionIdx) => {
    const selected = unit === currentUnit || (!currentUnit && optionIdx === 0);
    const disabled = unitOptions.schemaBacked && optionIdx === 0 && currentUnit && !unitOptions.units.includes(currentUnit);
    const label = unit || 'No unit';
    return `<button type="button" class="import-unit-option" data-import-unit-option="${escapeHTML(unit)}" data-marker-idx="${idx}" role="option" aria-selected="${selected ? 'true' : 'false'}"${disabled ? ' disabled' : ''}>${escapeHTML(label)}</button>`;
  }).join('');
  document.body.append(menu);
  positionImportUnitMenu(button, menu);
  button.setAttribute('aria-expanded', 'true');
}

/**
 * @param {HTMLElement} button
 * @param {HTMLElement} menu
 */
/** @param {HTMLElement} optionEl */
function selectImportUnitOption(optionEl) {
  if (optionEl.hasAttribute('disabled')) return;
  const idx = parseImportDatasetIndex(optionEl.dataset.markerIdx); if (idx == null) return;
  const nextUnit = optionEl.dataset.importUnitOption || null;
  const row = getImportReviewRow(idx);
  const control = /** @type {HTMLElement | null} */ (row?.querySelector('.import-unit-text, .import-unit-button, .import-unit-picker-btn'));
  if (!control) return;
  updateImportMarkerUnitValue(control, nextUnit);
  closeImportUnitPicker();
}

function getImportReviewRow(idx, controlEl = /** @type {HTMLElement | null} */ (null)) {
  return /** @type {HTMLElement | null} */ (controlEl?.closest('tr') || document.querySelector(`.import-table tr[data-import-idx="${idx}"]`));
}

function updateImportUnitControl(idx, unit) {
  const row = getImportReviewRow(idx);
  const displayUnit = unit || '';
  const input = /** @type {HTMLInputElement | null} */ (row?.querySelector('.import-unit-text'));
  if (input) input.value = displayUnit;
  const pickerButton = /** @type {HTMLElement | null} */ (row?.querySelector('.import-unit-picker-btn'));
  if (pickerButton) pickerButton.title = displayUnit ? `Choose common unit (${displayUnit})` : 'Choose common unit';
  const button = /** @type {HTMLElement | null} */ (row?.querySelector('.import-unit-button'));
  if (!button) return;
  button.title = displayUnit;
  const text = button.querySelector('.import-unit-button-text');
  if (text) text.textContent = displayUnit;
}


function openImportMarkerMapPicker(controlEl) {
  const result = getPendingImport();
  if (!result) return;
  const idx = parseInt(controlEl.dataset.markerIdx, 10);
  const marker = result.markers[idx];
  if (!marker) return;
  const refLookup = getPendingImportRefLookup() || buildMarkerReference();
  openImportMarkerMapModal({
    marker,
    currentKey: marker.mappedKey || '',
    refLookup,
    onSelect: key => applyImportMarkerMapping(controlEl, key || ''),
  });
}

export function showImportPreview(parseResult) {
  const { date, markers, fileName } = parseResult;
  const modal = document.getElementById('import-modal');
  const overlay = document.getElementById('import-modal-overlay');
  if (!modal || !overlay) return;
  const matched = markers.filter(m => m.matched);
  const newMarkers = markers.filter(m => !m.matched && m.suggestedKey);
  const unmatched = markers.filter(m => !m.matched && !m.suggestedKey);
  const importCount = matched.length + newMarkers.length;
  const batchCtx = getBatchImportContext();
  const batchLabel = batchCtx ? `File ${batchCtx.current} of ${batchCtx.total}` : 'Lab import';
  const sampleTime = normalizeLabSampleTime(parseResult.sampleTime) || '';
  const fasting = normalizeLabFastingStatus(parseResult.fasting);
  parseResult.sampleTime = sampleTime || null;
  parseResult.fasting = fasting;
  modal.className = 'modal import-preview-modal';
  let html = `<div class="gb-modal-head import-preview-head">
    <div>
      <div class="gb-modal-kicker">${escapeHTML(batchLabel)}</div>
      <div class="gb-modal-title">Review &amp; Edit Import</div>
    </div>
    <button type="button" class="modal-close" ${importReviewActionAttrs('close')} aria-label="Close import review">&times;</button>
  </div>
  <div class="gb-form-body import-review-body">
    <div class="import-review-summary">
      <div class="import-review-file">
        <span class="import-review-label">File</span>
        <strong>${escapeHTML(fileName)}</strong>
      </div>
      <div class="import-review-file">
        <span class="import-review-label">Collection date</span>
        <input type="date" id="import-manual-date" value="${escapeHTML(date || '')}" ${importReviewActionAttrs('manual-date')} aria-label="Collection date">
      </div>
      <div class="import-review-file">
        <span class="import-review-label">Collection time</span>
        <input type="time" id="import-sample-time" value="${escapeHTML(sampleTime)}" ${importReviewActionAttrs('manual-sample-time')} aria-label="Blood collection time">
        <small>Draw time only — not received, processed, or report time.</small>
      </div>
      <div class="import-review-file">
        <span class="import-review-label">Fasting status</span>
        <select id="import-fasting" ${importReviewActionAttrs('manual-fasting')} aria-label="Fasting status">
          <option value="unknown"${fasting === null ? ' selected' : ''}>Unknown</option>
          <option value="fasting"${fasting === true ? ' selected' : ''}>Fasting</option>
          <option value="not-fasting"${fasting === false ? ' selected' : ''}>Not fasting</option>
        </select>
      </div>
      <div class="import-review-stats" aria-label="Import mapping summary">
        <span class="import-review-stat import-review-stat-matched"><strong>${matched.length}</strong> matched</span>
        <span class="import-review-stat import-review-stat-new"><strong>${newMarkers.length}</strong> new</span>
        <span class="import-review-stat import-review-stat-unmatched"><strong>${unmatched.length}</strong> unmatched</span>
      </div>
    </div>`;
  const unmatchedRatio = markers.length > 0 ? unmatched.length / markers.length : 0;
  if (unmatchedRatio > 0.4 && unmatched.length > 10) {
    html += `<div class="import-review-warning">
      A large portion of markers couldn't be mapped. This lab report may not be well supported yet — review the results below carefully before importing.
      You can <a href="https://github.com/elkimek/get-based/issues" target="_blank" rel="noopener">request support</a> for this lab on GitHub.</div>`;
  }
  if (!date) {
    html += `<div class="import-review-warning import-review-date-warning">
      Could not extract collection date from PDF. Please set it above before importing.</div>`;
  }

  const refLookup = buildMarkerReference();

  html += `<div class="import-review-controls">
    <div class="import-filter-group" role="group" aria-label="Filter import rows">
      <button type="button" class="import-filter-btn active" data-filter="all" ${importReviewActionAttrs('filter')}>All</button>
      <button type="button" class="import-filter-btn" data-filter="matched" ${importReviewActionAttrs('filter')}>Matched</button>
      <button type="button" class="import-filter-btn" data-filter="new" ${importReviewActionAttrs('filter')}>New</button>
      <button type="button" class="import-filter-btn" data-filter="unmatched" ${importReviewActionAttrs('filter')}>Unmatched</button>
      <button type="button" class="import-filter-btn" data-filter="excluded" ${importReviewActionAttrs('filter')}>Excluded</button>
    </div>
    <label class="import-review-search-wrap">
      <span class="sr-only">Search import rows</span>
      <input type="search" id="import-review-search" class="import-review-search" placeholder="Search markers" ${importReviewActionAttrs('search')} autocomplete="off">
    </label>
    <span class="import-visible-count" id="import-visible-count" aria-live="polite"></span>
  </div>`;

  html += '<div class="import-table-wrap"><table class="import-table"><thead><tr><th class="import-state-heading" aria-label="Status"></th><th>Test Name</th><th>Value</th><th>Unit</th><th>Lab Range</th><th>Maps To</th><th>Action</th></tr></thead><tbody>';
  for (const m of matched) {
    const origIdx = markers.indexOf(m);
    const labRange = formatImportLabRange(m);
    html += `<tr data-import-idx="${origIdx}" data-import-status="matched">
      <td class="import-status-cell matched" data-label="Status"><span class="import-status-dot" title="Matched" role="img" aria-label="Matched"></span></td>
      <td class="import-name-cell" data-label="Test name">${escapeHTML(m.rawName)}</td>
      <td data-label="Value">
        <input type="number" step="any" class="import-value-input" data-marker-idx="${origIdx}" value="${escapeHTML(String(m.value))}" ${importReviewActionAttrs('edit-value')} aria-label="Value for ${escapeHTML(m.rawName)}">
      </td>
      <td data-label="Unit">${renderUnitSelect(m, origIdx)}</td>
      <td class="import-range-cell" data-label="Lab range">${escapeHTML(labRange || '—')}</td>
      <td class="import-map-cell" data-label="Maps to">${escapeHTML(m.mappedKey)}</td>
      <td class="import-row-action import-row-action-btn" data-label="Action">${renderImportExcludeButton(m.rawName)}</td>
    </tr>`;
  }
  for (const m of newMarkers) {
    const origIdx = markers.indexOf(m);
    const labRange = formatImportLabRange(m);
    html += `<tr data-import-idx="${origIdx}" data-import-status="new">
      <td class="import-status-cell new-marker" data-label="Status"><span class="import-status-dot" title="New" role="img" aria-label="New"></span></td>
      <td class="import-name-cell" data-label="Test name">${escapeHTML(m.rawName)}</td>
      <td data-label="Value">
        <input type="number" step="any" class="import-value-input" data-marker-idx="${origIdx}" value="${escapeHTML(String(m.value))}" ${importReviewActionAttrs('edit-value')} aria-label="Value for ${escapeHTML(m.rawName)}">
      </td>
      <td data-label="Unit">${renderUnitSelect(m, origIdx)}</td>
      <td class="import-range-cell" data-label="Lab range">${escapeHTML(labRange || '—')}</td>
      <td class="import-map-cell" data-label="Maps to">${renderImportMapInput(m, origIdx)}</td>
      <td class="import-row-action import-row-action-btn" data-label="Action">${renderImportExcludeButton(m.rawName)}</td>
    </tr>`;
  }
  if (unmatched.length > 0) {
    for (const m of unmatched) {
      const origIdx = markers.indexOf(m);
      const labRange = formatImportLabRange(m);
      html += `<tr data-import-idx="${origIdx}" data-import-status="unmatched">
        <td class="import-status-cell unmatched" data-label="Status"><span class="import-status-dot" title="Unmatched" role="img" aria-label="Unmatched"></span></td>
        <td class="import-name-cell" data-label="Test name">${escapeHTML(m.rawName)}</td>
        <td data-label="Value">
          <input type="number" step="any" class="import-value-input" data-marker-idx="${origIdx}" value="${escapeHTML(String(m.value))}" ${importReviewActionAttrs('edit-value')} aria-label="Value for ${escapeHTML(m.rawName)}">
        </td>
        <td data-label="Unit">${renderUnitSelect(m, origIdx)}</td>
        <td class="import-range-cell" data-label="Lab range">${escapeHTML(labRange || '—')}</td>
        <td class="import-map-cell" data-label="Maps to">${renderImportMapInput(m, origIdx)}</td>
        <td class="import-row-action" data-label="Action"><span class="import-skip-note">Skipped unless mapped</span></td>
      </tr>`;
    }
  }
  html += '</tbody></table></div>';

  let rangesDiffCount = 0;
  for (const m of matched) {
    if (m.refMin == null && m.refMax == null) continue;
    const schemaRef = refLookup[m.mappedKey];
    if (!schemaRef) continue;
    const siMin = m.refMin != null ? normalizeToSI(m.mappedKey, m.refMin, m.unit, m) : null;
    const siMax = m.refMax != null ? normalizeToSI(m.mappedKey, m.refMax, m.unit, m) : null;
    if ((siMin !== schemaRef.refMin && !(siMin != null && schemaRef.refMin != null && Math.abs(siMin - schemaRef.refMin) < 0.001)) ||
        (siMax !== schemaRef.refMax && !(siMax != null && schemaRef.refMax != null && Math.abs(siMax - schemaRef.refMax) < 0.001))) {
      rangesDiffCount++;
    }
  }
  if (rangesDiffCount > 0) {
    const rangeChoiceChecked = parseResult._adoptReferenceRanges !== false ? ' checked' : '';
    html += `<label class="import-range-option">
      <input type="checkbox" id="import-adopt-ranges"${rangeChoiceChecked}>
      <span><strong>Use reference ranges from this report</strong><small>${rangesDiffCount} marker${rangesDiffCount !== 1 ? 's' : ''} differ from the current ranges. Lab-specific intervals are preferred; uncheck to keep the current ranges.</small></span></label>`;
  }

  if (parseResult.privacyMethod?.startsWith('ollama')) {
    html += `<div class="privacy-notice privacy-notice-success">&#128274; Personal information scrubbed by local AI${parseResult.privacyMethod === 'ollama+review' ? ' (reviewed)' : ''}</div>`;
  } else if (parseResult.privacyMethod === 'regex') {
    html += `<div class="privacy-notice privacy-notice-warning">&#128274; ${parseResult.privacyReplacements} personal detail${parseResult.privacyReplacements !== 1 ? 's' : ''} replaced with fake data`;
    html += '<span class="privacy-notice-detail">Set up Local AI in Settings for comprehensive language-aware protection</span></div>';
  }
  if (parseResult.costInfo && typeof parseResult.costInfo.cost === 'number') {
    const ci = parseResult.costInfo;
    const totalTokens = (ci.inputTokens || 0) + (ci.outputTokens || 0);
    const modelLabel = ci.provider === 'ollama' ? getOllamaMainModel() : ci.provider === 'venice' ? getVeniceModelDisplay() : ci.provider === 'openrouter' ? getOpenRouterModelDisplay() : getActiveModelDisplay();
    html += `<div class="import-cost-note">\ud83d\udcca ${escapeHTML(modelLabel)} \u00b7 ${totalTokens.toLocaleString()} tokens \u00b7 ${formatCost(ci.cost)}</div>`;
  }
  if (isDebugMode()) {
    const t = parseResult.timings;
    if (t) {
      const piiLabel = parseResult.privacyMethod?.startsWith('ollama') ? `PII: ${t.pii}s (${getOllamaPIIModel()})` : 'PII: regex';
      const provider = getAIProvider();
      const modelLabel = provider === 'ollama' ? getOllamaMainModel() : provider === 'venice' ? getVeniceModelDisplay() : provider === 'openrouter' ? getOpenRouterModelDisplay() : getActiveModelDisplay();
      html += `<div class="import-debug-note">&#9202; ${escapeHTML(piiLabel)} &nbsp;|&nbsp; Analysis: ${escapeHTML(t.analysis)}s (${escapeHTML(modelLabel)})</div>`;
    }
    if (parseResult.privacyOriginal && parseResult.privacyObfuscated) {
      html += `<button type="button" class="import-btn import-btn-secondary import-privacy-details-btn" ${importReviewActionAttrs('privacy-details')}>&#128269; View privacy details</button>`;
    }
  }

  const cancelLabel = batchCtx ? 'Skip' : 'Cancel';
  const importDisabled = !date ? ' disabled' : '';
  const confirmLabel = parseResult._reReviewSnapshotId
    ? `Update Import (${importCount} Marker${importCount !== 1 ? 's' : ''})`
    : `Import ${importCount} Marker${importCount !== 1 ? 's' : ''}`;
  html += `</div>
    <div class="import-review-actions">
      <button type="button" class="import-btn import-btn-secondary" ${importReviewActionAttrs('close')}>${cancelLabel}</button>
      <button type="button" class="import-btn import-btn-primary" id="import-confirm-btn" ${importReviewActionAttrs('confirm')}${importDisabled}>${confirmLabel}</button>
    </div>`;
  if (!parseResult._importProfileId) parseResult._importProfileId = state.currentProfile;
  setPendingImportRuntime(parseResult, refLookup);
  modal.innerHTML = html;
  openModalOverlay(overlay);
  restoreExcludedImportRows(parseResult);
  updateImportConfirmCount();
  applyImportReviewFilters();
  persistImportReviewDraftForState(parseResult);
}

/** @param {HTMLSelectElement} selectEl */
export function mapUnmatchedMarker(selectEl) {
  applyImportMarkerMapping(selectEl, selectEl.value || '');
}

/** @param {HTMLInputElement} inputEl */
export function mapUnmatchedMarkerInput(inputEl) {
  const raw = inputEl.value.trim();
  const key = resolveImportMarkerKey(raw);
  if (raw && !key) {
    inputEl.value = '';
    showNotification('Choose a marker from the list', 'error');
    applyImportMarkerMapping(inputEl, '');
    return;
  }
  inputEl.value = key || '';
  applyImportMarkerMapping(inputEl, key || '');
}

function resolveImportMarkerKey(raw) {
  if (!raw) return '';
  const refLookup = getPendingImportRefLookup() || buildMarkerReference();
  if (refLookup[raw]) return raw;
  const normalized = raw.toLowerCase();
  for (const [key, def] of Object.entries(refLookup)) {
    const name = String(def.name || '').toLowerCase();
    if (key.toLowerCase() === normalized || name === normalized || `${name} (${key.toLowerCase()})` === normalized) {
      return key;
    }
  }
  return '';
}

/**
 * @param {HTMLElement} controlEl
 * @param {string} key
 */
function applyImportMarkerMapping(controlEl, key) {
  const result = getPendingImport();
  if (!result) return;
  const idx = parseImportDatasetIndex(controlEl.dataset.markerIdx); if (idx == null) return;
  const marker = result.markers[idx];
  if (!marker) return;
  const previousKey = marker.mappedKey || marker.suggestedKey || null;
  if (previousKey !== (key || marker.suggestedKey || null)) marker._benchmarkMappingEdited = true;
  marker.mappedKey = key || null;
  marker.matched = !!key;
  const row = controlEl.closest('tr');
  if (row) {
    const statusCell = row.querySelector('td:first-child');
    const unitCell = row.querySelector('td[data-label="Unit"]');
    const mapCell = row.querySelector('.import-map-cell');
    const actionCell = row.querySelector('.import-row-action');
    if (key) {
      row.dataset.importStatus = 'matched';
      if (statusCell) {
        statusCell.className = 'import-status-cell matched';
        statusCell.innerHTML = '<span class="import-status-dot" title="Matched" role="img" aria-label="Matched"></span>';
      }
      if (unitCell) unitCell.innerHTML = renderUnitSelect(marker, idx);
      if (mapCell) mapCell.innerHTML = renderImportMapInput(marker, idx);
      if (actionCell && !actionCell.querySelector('.import-exclude-btn')) {
        actionCell.classList.add('import-row-action-btn');
        actionCell.innerHTML = renderImportExcludeButton(marker.rawName);
      }
    } else if (marker.suggestedKey) {
      row.dataset.importStatus = 'new';
      row.classList.remove('import-excluded');
      if (statusCell) {
        statusCell.className = 'import-status-cell new-marker';
        statusCell.innerHTML = '<span class="import-status-dot" title="New" role="img" aria-label="New"></span>';
      }
      if (unitCell) unitCell.innerHTML = renderUnitSelect(marker, idx);
      if (mapCell) mapCell.innerHTML = renderImportMapInput(marker, idx);
      if (actionCell && !actionCell.querySelector('.import-exclude-btn')) {
        actionCell.classList.add('import-row-action-btn');
        actionCell.innerHTML = renderImportExcludeButton(marker.rawName);
      }
    } else {
      row.dataset.importStatus = 'unmatched';
      row.classList.remove('import-excluded');
      if (statusCell) {
        statusCell.className = 'import-status-cell unmatched';
        statusCell.innerHTML = '<span class="import-status-dot" title="Unmatched" role="img" aria-label="Unmatched"></span>';
      }
      if (mapCell) mapCell.innerHTML = renderImportMapInput(marker, idx);
      if (actionCell) {
        actionCell.classList.remove('import-row-action-btn');
        actionCell.innerHTML = '<span class="import-skip-note">Skipped unless mapped</span>';
      }
    }
  }
  updateImportConfirmCount();
  applyImportReviewFilters();
  persistCurrentImportReviewDraft();
}

function updateImportConfirmCount() {
  const result = getPendingImport();
  if (!result) return;
  const excludedIdxs = getExcludedImportIndices();
  const importCount = result.markers.filter((m, i) => (m.matched || (!m.matched && m.suggestedKey)) && !excludedIdxs.has(i)).length;
  const btn = document.getElementById('import-confirm-btn');
  if (btn) btn.textContent = result._reReviewSnapshotId
    ? `Update Import (${importCount} Marker${importCount !== 1 ? 's' : ''})`
    : `Import ${importCount} Marker${importCount !== 1 ? 's' : ''}`;
}

/** @param {HTMLElement} btn */
export function setImportReviewFilter(btn) {
  const group = btn.closest('.import-filter-group');
  if (group) {
    for (const item of group.querySelectorAll('.import-filter-btn')) item.classList.toggle('active', item === btn);
  }
  applyImportReviewFilters();
}

export function applyImportReviewFilters() {
  const rows = /** @type {HTMLElement[]} */ (Array.from(document.querySelectorAll('.import-table tbody tr[data-import-idx]')));
  if (rows.length === 0) return;
  const activeFilterBtn = /** @type {HTMLElement | null} */ (document.querySelector('.import-filter-btn.active'));
  const activeFilter = activeFilterBtn?.dataset.filter || 'all';
  const searchInput = /** @type {HTMLInputElement | null} */ (document.getElementById('import-review-search'));
  const query = (searchInput?.value || '').trim().toLowerCase();
  let visible = 0;
  for (const row of rows) {
    const status = row.classList.contains('import-excluded') ? 'excluded' : (row.dataset.importStatus || '');
    const filterMatch = activeFilter === 'all' || activeFilter === status;
    const controlText = Array.from(row.querySelectorAll('input, select, button.import-unit-button')).map(el => {
      if (el instanceof HTMLInputElement || el instanceof HTMLSelectElement) return el.value;
      return el.textContent || '';
    }).join(' ');
    const searchMatch = !query || `${row.textContent} ${controlText}`.toLowerCase().includes(query);
    const shouldShow = filterMatch && searchMatch;
    row.hidden = !shouldShow;
    if (shouldShow) visible++;
  }
  const count = document.getElementById('import-visible-count');
  if (count) count.textContent = `${visible}/${rows.length} shown`;
}

export function applyManualImportDate(dateStr) {
  const btn = /** @type {HTMLButtonElement | null} */ (document.getElementById('import-confirm-btn'));
  const pendingImport = getPendingImport();
  if (!pendingImport) return;
  const nextDate = (dateStr || '').trim();
  if (pendingImport.date !== nextDate) pendingImport._benchmarkDateEdited = true;
  pendingImport.date = nextDate;
  if (btn) {
    btn.disabled = !nextDate;
    btn.style.opacity = '';
    btn.style.cursor = '';
  }
  persistCurrentImportReviewDraft();
}

/** @param {{ sampleTime?: unknown, fasting?: unknown }} patch */
export function applyManualImportCollectionContext(patch = {}) {
  const pendingImport = getPendingImport();
  if (!pendingImport) return;
  if (Object.prototype.hasOwnProperty.call(patch, 'sampleTime')) {
    const nextTime = normalizeLabSampleTime(patch.sampleTime);
    if (pendingImport.sampleTime !== nextTime) pendingImport._benchmarkContextEdited = true;
    pendingImport.sampleTime = nextTime;
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'fasting')) {
    const nextFasting = normalizeLabFastingStatus(patch.fasting);
    if (pendingImport.fasting !== nextFasting) pendingImport._benchmarkContextEdited = true;
    pendingImport.fasting = nextFasting;
  }
  persistCurrentImportReviewDraft();
}

/** @param {HTMLElement} btn */
export function toggleImportRow(btn) {
  const row = btn.closest('tr');
  if (!row) return;
  const excluded = row.classList.toggle('import-excluded');
  setImportExcludeButtonState(btn, excluded);
  updateImportConfirmCount();
  applyImportReviewFilters();
  persistCurrentImportReviewDraft();
}

export function getExcludedImportIndices() {
  const excluded = new Set();
  for (const row of /** @type {NodeListOf<HTMLElement>} */ (document.querySelectorAll('.import-table tr.import-excluded[data-import-idx]'))) {
    const idx = parseImportDatasetIndex(row.dataset.importIdx); if (idx != null) excluded.add(idx);
  }
  return excluded;
}

export function closeImportModal() {
  const pending = getPendingImport();
  if (pending?.benchmarkId) finishImportBenchmark(pending.benchmarkId, 'cancelled', { stage: 'review' });
  if (resolveImportPreviewBatch('skip')) return;
  hideImportOverlay();
  clearPendingImport();
  restoreDropZoneVisibility();
}

/**
 * @param {any} result
 * @param {number} current
 * @param {number} total
 * @returns {Promise<string>}
 */
export function showImportPreviewAsync(result, current, total) {
  const dropZone = document.getElementById('drop-zone');
  if (dropZone) dropZone.style.display = 'none';
  return new Promise(resolve => {
    startBatchImport(resolve, { current, total });
    showImportPreview(result);
  });
}
