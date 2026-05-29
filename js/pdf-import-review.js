// pdf-import-review.js - Import review modal rendering and interaction state

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
import { buildMarkerReference, normalizeToSI } from './pdf-import-marker-mapping.js';

function clearPendingImport() {
  window._pendingImport = null;
  window._pendingImportRefLookup = null;
}

function restoreDropZoneVisibility() {
  const dropZone = document.getElementById('drop-zone');
  if (dropZone) dropZone.style.display = '';
}

function hideImportOverlay() {
  document.getElementById('import-modal-overlay')?.classList.remove('show');
}

export function getPendingImport() {
  return window._pendingImport || null;
}

export function resolveImportPreviewBatch(action) {
  if (!window._batchImportResolve) return false;
  const resolve = window._batchImportResolve;
  window._batchImportResolve = null;
  window._batchImportContext = null;
  hideImportOverlay();
  clearPendingImport();
  restoreDropZoneVisibility();
  resolve(action);
  return true;
}

export function showImportPreview(parseResult) {
  const { date, markers, fileName } = parseResult;
  const modal = document.getElementById('import-modal');
  const overlay = document.getElementById('import-modal-overlay');
  const matched = markers.filter(m => m.matched);
  const newMarkers = markers.filter(m => !m.matched && m.suggestedKey);
  const unmatched = markers.filter(m => !m.matched && !m.suggestedKey);
  const importCount = matched.length + newMarkers.length;
  const batchCtx = window._batchImportContext;
  const batchLabel = batchCtx ? `File ${batchCtx.current} of ${batchCtx.total}` : 'Lab import';
  modal.className = 'modal import-preview-modal';
  let html = `<div class="gb-modal-head import-preview-head">
    <div>
      <div class="gb-modal-kicker">${escapeHTML(batchLabel)}</div>
      <div class="gb-modal-title">Review &amp; Edit Import</div>
    </div>
    <button type="button" class="modal-close" onclick="closeImportModal()" aria-label="Close import review">&times;</button>
  </div>
  <div class="gb-form-body import-review-body">
    <div class="import-review-summary">
      <div class="import-review-file">
        <span class="import-review-label">File</span>
        <strong>${escapeHTML(fileName)}</strong>
      </div>
      <div class="import-review-file">
        <span class="import-review-label">Collection date</span>
        <input type="date" id="import-manual-date" value="${escapeHTML(date || '')}" onchange="applyManualImportDate(this.value)" aria-label="Collection date">
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
  const allKeys = Object.entries(refLookup).map(([key, def]) => ({ key, name: def.name }));
  allKeys.sort((a, b) => a.name.localeCompare(b.name));
  const optionsHtml = allKeys.map(k => {
    const label = `${k.name} (${k.key})`;
    return `<option value="${escapeHTML(k.key)}" label="${escapeHTML(label)}"></option>`;
  }).join('');

  html += `<div class="import-review-controls">
    <div class="import-filter-group" role="group" aria-label="Filter import rows">
      <button type="button" class="import-filter-btn active" data-filter="all" onclick="setImportReviewFilter(this)">All</button>
      <button type="button" class="import-filter-btn" data-filter="matched" onclick="setImportReviewFilter(this)">Matched</button>
      <button type="button" class="import-filter-btn" data-filter="new" onclick="setImportReviewFilter(this)">New</button>
      <button type="button" class="import-filter-btn" data-filter="unmatched" onclick="setImportReviewFilter(this)">Unmatched</button>
      <button type="button" class="import-filter-btn" data-filter="excluded" onclick="setImportReviewFilter(this)">Excluded</button>
    </div>
    <label class="import-review-search-wrap">
      <span class="sr-only">Search import rows</span>
      <input type="search" id="import-review-search" class="import-review-search" placeholder="Search markers" oninput="applyImportReviewFilters()" autocomplete="off">
    </label>
    <span class="import-visible-count" id="import-visible-count" aria-live="polite"></span>
  </div>`;

  html += '<div class="import-table-wrap"><table class="import-table"><thead><tr><th>Status</th><th>Test Name</th><th>Value</th><th>Lab Range</th><th>Maps To</th><th>Action</th></tr></thead><tbody>';
  for (const m of matched) {
    const origIdx = markers.indexOf(m);
    const labRange = (m.refMin != null || m.refMax != null) ? `${m.refMin ?? '?'}\u2013${m.refMax ?? '?'}` : '';
    html += `<tr data-import-idx="${origIdx}" data-import-status="matched">
      <td class="import-status-cell matched" data-label="Status"><span class="import-status-pill">Matched</span></td>
      <td class="import-name-cell" data-label="Test name">${escapeHTML(m.rawName)}</td>
      <td data-label="Value">${escapeHTML(String(m.value))}</td>
      <td class="import-range-cell" data-label="Lab range">${escapeHTML(labRange || '—')}</td>
      <td class="import-map-cell" data-label="Maps to">${escapeHTML(m.mappedKey)}</td>
      <td class="import-row-action" data-label="Action"><button type="button" class="import-exclude-btn" onclick="toggleImportRow(this)" title="Exclude from import" aria-label="Exclude ${escapeHTML(m.rawName)} from import">Exclude</button></td>
    </tr>`;
  }
  for (const m of newMarkers) {
    const origIdx = markers.indexOf(m);
    const labRange = (m.refMin != null || m.refMax != null) ? `${m.refMin ?? '?'}\u2013${m.refMax ?? '?'}` : '';
    html += `<tr data-import-idx="${origIdx}" data-import-status="new">
      <td class="import-status-cell new-marker" data-label="Status"><span class="import-status-pill">New</span></td>
      <td class="import-name-cell" data-label="Test name">${escapeHTML(m.rawName)}</td>
      <td data-label="Value">${escapeHTML(String(m.value))}</td>
      <td class="import-range-cell" data-label="Lab range">${escapeHTML(labRange || '—')}</td>
      <td class="import-map-cell" data-label="Maps to">${escapeHTML(m.suggestedKey)}</td>
      <td class="import-row-action" data-label="Action"><button type="button" class="import-exclude-btn" onclick="toggleImportRow(this)" title="Exclude from import" aria-label="Exclude ${escapeHTML(m.rawName)} from import">Exclude</button></td>
    </tr>`;
  }
  if (unmatched.length > 0) {
    for (const m of unmatched) {
      const origIdx = markers.indexOf(m);
      const labRange = (m.refMin != null || m.refMax != null) ? `${m.refMin ?? '?'}\u2013${m.refMax ?? '?'}` : '';
      html += `<tr data-import-idx="${origIdx}" data-import-status="unmatched">
        <td class="import-status-cell unmatched" data-label="Status"><span class="import-status-pill">Unmatched</span></td>
        <td class="import-name-cell" data-label="Test name">${escapeHTML(m.rawName)}</td>
        <td data-label="Value">${escapeHTML(String(m.value))}</td>
        <td class="import-range-cell" data-label="Lab range">${escapeHTML(labRange || '—')}</td>
        <td class="import-map-cell" data-label="Maps to">
          <input type="text" class="import-map-input" list="import-marker-options" data-marker-idx="${origIdx}" onchange="mapUnmatchedMarkerInput(this)" placeholder="Search marker" autocomplete="off" aria-label="Map ${escapeHTML(m.rawName)} to an existing marker">
        </td>
        <td class="import-row-action" data-label="Action"><span class="import-skip-note">Skipped unless mapped</span></td>
      </tr>`;
    }
  }
  html += '</tbody></table></div>';
  if (unmatched.length > 0) {
    html += `<datalist id="import-marker-options">${optionsHtml}</datalist>`;
  }

  let rangesDiffCount = 0;
  for (const m of matched) {
    if (m.refMin == null && m.refMax == null) continue;
    const schemaRef = refLookup[m.mappedKey];
    if (!schemaRef) continue;
    const siMin = m.refMin != null ? normalizeToSI(m.mappedKey, m.refMin, m.unit) : null;
    const siMax = m.refMax != null ? normalizeToSI(m.mappedKey, m.refMax, m.unit) : null;
    if ((siMin !== schemaRef.refMin && !(siMin != null && schemaRef.refMin != null && Math.abs(siMin - schemaRef.refMin) < 0.001)) ||
        (siMax !== schemaRef.refMax && !(siMax != null && schemaRef.refMax != null && Math.abs(siMax - schemaRef.refMax) < 0.001))) {
      rangesDiffCount++;
    }
  }
  if (rangesDiffCount > 0) {
    html += `<label class="import-range-option">
      <input type="checkbox" id="import-adopt-ranges">
      <span><strong>Update reference ranges from this report</strong><small>${rangesDiffCount} marker${rangesDiffCount !== 1 ? 's' : ''} differ from the current ranges. Leave off unless you want this lab's ranges to become the active reference.</small></span></label>`;
  }

  if (parseResult.privacyMethod?.startsWith('ollama')) {
    html += `<div class="privacy-notice privacy-notice-success">&#128274; Personal information scrubbed by local AI${parseResult.privacyMethod === 'ollama+review' ? ' (reviewed)' : ''}</div>`;
  } else if (parseResult.privacyMethod === 'regex') {
    html += `<div class="privacy-notice privacy-notice-warning">&#128274; ${parseResult.privacyReplacements} personal detail${parseResult.privacyReplacements !== 1 ? 's' : ''} replaced with fake data`;
    html += '<span class="privacy-notice-detail">Set up Local AI in Settings for comprehensive language-aware protection</span></div>';
  }
  if (parseResult.costInfo) {
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
      html += `<div class="import-debug-note">&#9202; ${piiLabel} &nbsp;|&nbsp; Analysis: ${t.analysis}s (${modelLabel})</div>`;
    }
    if (parseResult.privacyOriginal && parseResult.privacyObfuscated) {
      html += '<button type="button" class="import-btn import-btn-secondary import-privacy-details-btn" onclick="showPIIDiffViewer(window._pendingImport.privacyOriginal, window._pendingImport.privacyObfuscated)">&#128269; View privacy details</button>';
    }
  }

  const cancelLabel = batchCtx ? 'Skip' : 'Cancel';
  const importDisabled = !date ? ' disabled' : '';
  html += `</div>
    <div class="import-review-actions">
      <button type="button" class="import-btn import-btn-secondary" onclick="closeImportModal()">${cancelLabel}</button>
      <button type="button" class="import-btn import-btn-primary" id="import-confirm-btn" onclick="confirmImport()"${importDisabled}>Import ${importCount} Marker${importCount !== 1 ? 's' : ''}</button>
    </div>`;
  if (!parseResult._importProfileId) parseResult._importProfileId = state.currentProfile;
  window._pendingImport = parseResult;
  window._pendingImportRefLookup = refLookup;
  modal.innerHTML = html;
  overlay.classList.add('show');
  applyImportReviewFilters();
}

export function mapUnmatchedMarker(selectEl) {
  applyImportMarkerMapping(selectEl, selectEl.value || '');
}

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
  const refLookup = window._pendingImportRefLookup || buildMarkerReference();
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

function applyImportMarkerMapping(controlEl, key) {
  const result = getPendingImport();
  if (!result) return;
  const idx = parseInt(controlEl.dataset.markerIdx, 10);
  const marker = result.markers[idx];
  if (!marker) return;
  marker.mappedKey = key || null;
  marker.matched = !!key;
  const row = controlEl.closest('tr');
  if (row) {
    const statusCell = row.querySelector('td:first-child');
    const actionCell = row.querySelector('.import-row-action');
    if (key) {
      row.dataset.importStatus = 'matched';
      if (statusCell) {
        statusCell.className = 'import-status-cell matched';
        statusCell.innerHTML = '<span class="import-status-pill">Matched</span>';
      }
      if (actionCell && !actionCell.querySelector('.import-exclude-btn')) {
        actionCell.innerHTML = '<button type="button" class="import-exclude-btn" onclick="toggleImportRow(this)" title="Exclude from import" aria-label="Exclude from import">Exclude</button>';
      }
    } else {
      row.dataset.importStatus = 'unmatched';
      row.classList.remove('import-excluded');
      if (statusCell) {
        statusCell.className = 'import-status-cell unmatched';
        statusCell.innerHTML = '<span class="import-status-pill">Unmatched</span>';
      }
      if (actionCell) actionCell.innerHTML = '<span class="import-skip-note">Skipped unless mapped</span>';
    }
  }
  updateImportConfirmCount();
  applyImportReviewFilters();
}

function updateImportConfirmCount() {
  const result = getPendingImport();
  if (!result) return;
  const excludedIdxs = getExcludedImportIndices();
  const importCount = result.markers.filter((m, i) => (m.matched || (!m.matched && m.suggestedKey)) && !excludedIdxs.has(i)).length;
  const btn = document.getElementById('import-confirm-btn');
  if (btn) btn.textContent = `Import ${importCount} Marker${importCount !== 1 ? 's' : ''}`;
}

export function setImportReviewFilter(btn) {
  const group = btn.closest('.import-filter-group');
  if (group) {
    for (const item of group.querySelectorAll('.import-filter-btn')) item.classList.toggle('active', item === btn);
  }
  applyImportReviewFilters();
}

export function applyImportReviewFilters() {
  const rows = Array.from(document.querySelectorAll('.import-table tbody tr[data-import-idx]'));
  if (rows.length === 0) return;
  const activeFilter = document.querySelector('.import-filter-btn.active')?.dataset.filter || 'all';
  const query = (document.getElementById('import-review-search')?.value || '').trim().toLowerCase();
  let visible = 0;
  for (const row of rows) {
    const status = row.classList.contains('import-excluded') ? 'excluded' : (row.dataset.importStatus || '');
    const filterMatch = activeFilter === 'all' || activeFilter === status;
    const controlText = Array.from(row.querySelectorAll('input, select')).map(el => el.value).join(' ');
    const searchMatch = !query || `${row.textContent} ${controlText}`.toLowerCase().includes(query);
    const shouldShow = filterMatch && searchMatch;
    row.hidden = !shouldShow;
    if (shouldShow) visible++;
  }
  const count = document.getElementById('import-visible-count');
  if (count) count.textContent = `${visible}/${rows.length} shown`;
}

export function applyManualImportDate(dateStr) {
  const btn = document.getElementById('import-confirm-btn');
  const pendingImport = getPendingImport();
  if (!pendingImport) return;
  const nextDate = (dateStr || '').trim();
  pendingImport.date = nextDate;
  if (btn) {
    btn.disabled = !nextDate;
    btn.style.opacity = '';
    btn.style.cursor = '';
  }
}

export function toggleImportRow(btn) {
  const row = btn.closest('tr');
  if (!row) return;
  const excluded = row.classList.toggle('import-excluded');
  btn.textContent = excluded ? 'Include' : 'Exclude';
  btn.title = excluded ? 'Include in import' : 'Exclude from import';
  btn.setAttribute('aria-label', btn.title);
  updateImportConfirmCount();
  applyImportReviewFilters();
}

export function getExcludedImportIndices() {
  const excluded = new Set();
  for (const row of document.querySelectorAll('.import-table tr.import-excluded[data-import-idx]')) {
    excluded.add(parseInt(row.dataset.importIdx, 10));
  }
  return excluded;
}

export function closeImportModal() {
  if (resolveImportPreviewBatch('skip')) return;
  hideImportOverlay();
  clearPendingImport();
  restoreDropZoneVisibility();
}

export function showImportPreviewAsync(result, current, total) {
  const dropZone = document.getElementById('drop-zone');
  if (dropZone) dropZone.style.display = 'none';
  return new Promise(resolve => {
    window._batchImportResolve = resolve;
    window._batchImportContext = { current, total };
    showImportPreview(result);
  });
}
