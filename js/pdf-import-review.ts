import type { ImportReviewMarker, PendingImport } from './pdf-import-review-runtime.js';

// Import review modal rendering and interaction state
import { state } from './state.js';
import { formatCost } from './schema.js';
import { escapeHTML, showNotification, isDebugMode } from './utils.js';
import { shouldHideAppExtensionAIUsage } from './app-extension-runtime.js';
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

function importReviewActionAttrs(action: string, extra = '') {
  return `data-import-review-action="${action}"${extra ? ` ${extra}` : ''}`;
}

function closestImportReviewElement(target: EventTarget | null, selector: string) {
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

function getStoredExcludedImportIndices(parseResult: PendingImport | null | undefined) {
  const raw = Array.isArray(parseResult?._excludedImportIndices) ? parseResult._excludedImportIndices : [];
  return new Set(raw.map(value => Number(value)).filter(value => Number.isInteger(value) && value >= 0));
}

function restoreExcludedImportRows(parseResult: PendingImport) {
  const excluded = getStoredExcludedImportIndices(parseResult);
  if (excluded.size === 0) return;
  for (const idx of excluded) {
    const row = getImportReviewRow(idx);
    const btn = (row?.querySelector('.import-exclude-btn')) as HTMLElement | null;
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

function handleImportReviewClick(event: MouseEvent) {
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

function handleImportReviewInput(event: Event) {
  if (closestImportReviewElement(event.target, '[data-import-review-action="search"]')) {
    applyImportReviewFilters();
  }
}

function handleImportReviewChange(event: Event) {
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

function updateImportMarkerValue(inputEl: HTMLInputElement) {
  const result = getPendingImport();
  if (!result) return;
  const idx = parseInt(inputEl.dataset.markerIdx as string, 10);
  const marker = result.markers[idx];
  if (!marker) return;
  const val = parseFloat(inputEl.value.replace(',', '.'));
  const nextValue = isNaN(val) ? null : val;
  if (!Object.is(marker.value, nextValue)) marker._benchmarkValueEdited = true;
  marker.value = nextValue;
  persistCurrentImportReviewDraft();
}

function updateImportMarkerUnit(inputEl: HTMLInputElement) {
  updateImportMarkerUnitValue(inputEl, inputEl.value.trim() || null);
}

function convertImportReviewUnitValue(marker: ImportReviewMarker, value: ImportReviewMarker['value'], previousUnit: string | null, nextUnit: string | null) {
  if (value == null || isNaN(value as number)) return null;
  const key = marker.mappedKey || marker.suggestedKey;
  const schemaValue = key ? convertImportValueUnit(key, value as number, previousUnit, nextUnit) : null;
  return schemaValue != null ? schemaValue : convertGenericImportValueUnit(value as number, previousUnit, nextUnit);
}

function updateImportMarkerUnitValue(controlEl: HTMLElement, nextUnit: string | null) {
  const result = getPendingImport();
  if (!result) return;
  const idx = parseInt(controlEl.dataset.markerIdx as string, 10);
  const marker = result.markers[idx];
  if (!marker) return;
  const previousUnit = marker.unit || null;
  if (previousUnit !== nextUnit) {
    marker._benchmarkUnitEdited = true;
    const row = getImportReviewRow(idx, controlEl);
    const nextValue = convertImportReviewUnitValue(marker, marker.value, previousUnit, nextUnit);
    if (nextValue != null) {
      marker.value = nextValue;
      const valueInput = (row?.querySelector('.import-value-input')) as HTMLInputElement | null;
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
  // The unit menu owns Escape before the shell can dismiss its parent review.
  document.addEventListener('keydown', handleImportReviewKeydown, true);
}
initImportReviewDelegates();

export function getPendingImport() {
  return getPendingImportFromRuntime();
}

export function resolveImportPreviewBatch(action: string) {
  const resolve = takeBatchImportResolve();
  if (!resolve) return false;
  hideImportOverlay();
  clearPendingImport();
  restoreDropZoneVisibility();
  resolve(action);
  return true;
}

function handleImportReviewKeydown(event: KeyboardEvent) {
  if (event.key !== 'Escape' || !document.querySelector('.import-unit-menu')) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  const trigger = (document.querySelector('[data-import-review-action="unit-picker"][aria-expanded="true"]')) as HTMLElement | null;
  closeImportUnitPicker();
  trigger?.focus();
}

function closeImportUnitPicker() {
  document.querySelector('.import-unit-menu')?.remove();
  for (const button of document.querySelectorAll('[data-import-review-action="unit-picker"][aria-expanded="true"]')) {
    button.setAttribute('aria-expanded', 'false');
  }
}
function toggleImportUnitPicker(button: HTMLElement) {
  const existing = document.querySelector('.import-unit-menu');
  const idx = parseImportDatasetIndex(button.dataset.markerIdx); if (idx == null) return;
  if (existing && existing.getAttribute('data-marker-idx') === String(idx)) {
    closeImportUnitPicker();
    return;
  }
  openImportUnitPicker(button);
}

function openImportUnitPicker(button: HTMLElement) {
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

function selectImportUnitOption(optionEl: HTMLElement) {
  if (optionEl.hasAttribute('disabled')) return;
  const idx = parseImportDatasetIndex(optionEl.dataset.markerIdx); if (idx == null) return;
  const nextUnit = optionEl.dataset.importUnitOption || null;
  const row = getImportReviewRow(idx);
  const control = (row?.querySelector('.import-unit-text, .import-unit-button, .import-unit-picker-btn')) as HTMLElement | null;
  if (!control) return;
  updateImportMarkerUnitValue(control, nextUnit);
  closeImportUnitPicker();
}

function getImportReviewRow(idx: number, controlEl: HTMLElement | null = null) {
  return (controlEl?.closest('tr') || document.querySelector(`.import-table tr[data-import-idx="${idx}"]`)) as HTMLElement | null;
}

function updateImportUnitControl(idx: number, unit: string | null) {
  const row = getImportReviewRow(idx);
  const displayUnit = unit || '';
  const input = (row?.querySelector('.import-unit-text')) as HTMLInputElement | null;
  if (input) input.value = displayUnit;
  const pickerButton = (row?.querySelector('.import-unit-picker-btn')) as HTMLElement | null;
  if (pickerButton) pickerButton.title = displayUnit ? `Choose common unit (${displayUnit})` : 'Choose common unit';
  const button = (row?.querySelector('.import-unit-button')) as HTMLElement | null;
  if (!button) return;
  button.title = displayUnit;
  const text = button.querySelector('.import-unit-button-text');
  if (text) text.textContent = displayUnit;
}


function openImportMarkerMapPicker(controlEl: HTMLElement) {
  const result = getPendingImport();
  if (!result) return;
  const idx = parseInt(controlEl.dataset.markerIdx as string, 10);
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

function renderImportReviewRow(m: ImportReviewMarker, origIdx: number, status: 'matched' | 'new' | 'unmatched') {
  const labRange = formatImportLabRange(m);
  const pad = status === 'unmatched' ? '  ' : '';
  const dotClass = status === 'new' ? 'new-marker' : status;
  const label = status === 'matched' ? 'Matched' : status === 'new' ? 'New' : 'Unmatched';
  return `<tr data-import-idx="${origIdx}" data-import-status="${status}">
      ${pad}<td class="import-status-cell ${dotClass}" data-label="Status"><span class="import-status-dot" title="${label}" role="img" aria-label="${label}"></span></td>
      ${pad}<td class="import-row-num" data-label="Row">${origIdx + 1}</td>
      ${pad}<td class="import-name-cell" data-label="Test name">${escapeHTML(m.rawName)}</td>
      ${pad}<td data-label="Value">
        ${pad}<input type="number" step="any" class="import-value-input" data-marker-idx="${origIdx}" value="${escapeHTML(String(m.value))}" ${importReviewActionAttrs('edit-value')} aria-label="Value for ${escapeHTML(m.rawName)}">
      ${pad}</td>
      ${pad}<td data-label="Unit">${renderUnitSelect(m, origIdx)}</td>
      ${pad}<td class="import-range-cell" data-label="Lab range">${escapeHTML(labRange || '—')}</td>
      ${pad}<td class="import-map-cell" data-label="Maps to">${status === 'matched' ? escapeHTML(m.mappedKey) : renderImportMapInput(m, origIdx)}</td>
      ${pad}<td class="import-row-action${status === 'unmatched' ? '' : ' import-row-action-btn'}" data-label="Action">${status === 'unmatched' ? '<span class="import-skip-note">Skipped unless mapped</span>' : renderImportExcludeButton(m.rawName)}</td>
    ${pad}</tr>`;
}

export function showImportPreview(parseResult: PendingImport) {
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

  html += '<div class="import-table-wrap"><table class="import-table"><thead><tr><th class="import-state-heading" aria-label="Status"></th><th class="import-row-num-heading" title="Row number used in import error messages">#</th><th>Test Name</th><th>Value</th><th>Unit</th><th>Lab Range</th><th>Maps To</th><th>Action</th></tr></thead><tbody>';
  for (const m of matched) {
    html += renderImportReviewRow(m, markers.indexOf(m), 'matched');
  }
  for (const m of newMarkers) {
    html += renderImportReviewRow(m, markers.indexOf(m), 'new');
  }
  if (unmatched.length > 0) {
    for (const m of unmatched) {
      html += renderImportReviewRow(m, markers.indexOf(m), 'unmatched');
    }
  }
  html += '</tbody></table></div>';

  let rangesDiffCount = 0;
  for (const m of matched) {
    if (m.refMin == null && m.refMax == null) continue;
    const schemaRef = refLookup[m.mappedKey!];
    if (!schemaRef) continue;
    const siMin = m.refMin != null ? normalizeToSI(m.mappedKey!, m.refMin, m.unit, m) : null;
    const siMax = m.refMax != null ? normalizeToSI(m.mappedKey!, m.refMax, m.unit, m) : null;
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
  if (parseResult.costInfo && typeof parseResult.costInfo.cost === 'number'
    && !shouldHideAppExtensionAIUsage(parseResult.costInfo.provider)) {
    const ci = parseResult.costInfo;
    const totalTokens = (ci.inputTokens || 0) + (ci.outputTokens || 0);
    const modelLabel = ci.provider === 'ollama' ? getOllamaMainModel() : ci.provider === 'venice' ? getVeniceModelDisplay() : ci.provider === 'openrouter' ? getOpenRouterModelDisplay() : getActiveModelDisplay();
    html += `<div class="import-cost-note">\ud83d\udcca ${escapeHTML(modelLabel)} \u00b7 ${totalTokens.toLocaleString()} tokens \u00b7 ${formatCost(ci.cost!)}</div>`;
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

export function mapUnmatchedMarker(selectEl: HTMLSelectElement) {
  applyImportMarkerMapping(selectEl, selectEl.value || '');
}

export function mapUnmatchedMarkerInput(inputEl: HTMLInputElement) {
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

function resolveImportMarkerKey(raw: string) {
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

function applyImportMarkerMapping(controlEl: HTMLElement, key: string) {
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

export function setImportReviewFilter(btn: HTMLElement) {
  const group = btn.closest('.import-filter-group');
  if (group) {
    for (const item of group.querySelectorAll('.import-filter-btn')) item.classList.toggle('active', item === btn);
  }
  applyImportReviewFilters();
}

export function applyImportReviewFilters() {
  const rows = (Array.from(document.querySelectorAll('.import-table tbody tr[data-import-idx]'))) as HTMLElement[];
  if (rows.length === 0) return;
  const activeFilterBtn = (document.querySelector('.import-filter-btn.active')) as HTMLElement | null;
  const activeFilter = activeFilterBtn?.dataset.filter || 'all';
  const searchInput = (document.getElementById('import-review-search')) as HTMLInputElement | null;
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

export function applyManualImportDate(dateStr: string | null | undefined) {
  const btn = (document.getElementById('import-confirm-btn')) as HTMLButtonElement | null;
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

export function applyManualImportCollectionContext(patch: { sampleTime?: unknown; fasting?: unknown } = {}) {
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

export function toggleImportRow(btn: HTMLElement) {
  const row = btn.closest('tr');
  if (!row) return;
  const excluded = row.classList.toggle('import-excluded');
  setImportExcludeButtonState(btn, excluded);
  updateImportConfirmCount();
  applyImportReviewFilters();
  persistCurrentImportReviewDraft();
}

/** Mark review rows that block the commit (by original marker index) and bring the first one into view. */
export function highlightImportErrorRows(indices: readonly number[] = []) {
  for (const row of (document.querySelectorAll('.import-table tr.import-row-error')) as NodeListOf<HTMLElement>) {
    row.classList.remove('import-row-error');
    row.removeAttribute('aria-invalid');
  }
  if (!indices.length) return;
  let first: HTMLElement | null = null;
  for (const idx of indices) {
    const row = document.querySelector(`.import-table tr[data-import-idx="${idx}"]`) as HTMLElement | null;
    if (!row) continue;
    row.classList.add('import-row-error');
    row.setAttribute('aria-invalid', 'true');
    first ??= row;
  }
  if (!first) return;
  if (first.hidden) {
    // Clear filters/search that hide the offending row, otherwise the highlight is invisible.
    const search = document.getElementById('import-review-search') as HTMLInputElement | null;
    if (search) search.value = '';
    for (const btn of (document.querySelectorAll('.import-filter-btn')) as NodeListOf<HTMLElement>) {
      btn.classList.toggle('active', btn.dataset.filter === 'all');
    }
    applyImportReviewFilters();
  }
  if (typeof first.scrollIntoView === 'function') first.scrollIntoView({ block: 'center', behavior: 'smooth' });
}

export function getExcludedImportIndices() {
  const excluded = new Set<number>();
  for (const row of (document.querySelectorAll('.import-table tr.import-excluded[data-import-idx]')) as NodeListOf<HTMLElement>) {
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

export function showImportPreviewAsync(result: PendingImport, current: number, total: number) {
  const dropZone = document.getElementById('drop-zone');
  if (dropZone) dropZone.style.display = 'none';
  return new Promise<string>(resolve => {
    startBatchImport(resolve, { current, total });
    showImportPreview(result);
  });
}
