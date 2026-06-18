// @ts-check
// import-review-row-actions.js - compact action controls for import review rows.

import { escapeHTML } from './utils.js';

function importReviewActionAttrs(action) {
  return `data-import-review-action="${action}"`;
}

export function renderImportMapInput(marker, idx) {
  const value = marker.mappedKey || '';
  const summary = value
    ? `<div class="import-mapped-key">Mapped to <code>${escapeHTML(value)}</code></div>`
    : marker.suggestedKey
    ? `<div class="import-suggested-key">New marker: <code>${escapeHTML(marker.suggestedKey)}</code></div>`
    : '';
  const label = value ? 'Change mapping' : 'Map marker';
  return `<div class="import-map-control">
    <div class="import-map-summary">${summary}</div>
    <button type="button" class="import-map-picker-btn" data-marker-idx="${idx}" ${importReviewActionAttrs('open-map-modal')} title="${escapeHTML(label)}" aria-label="Open marker picker for ${escapeHTML(marker.rawName)}">
      <span class="import-map-picker-icon" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false"><path d="M10 13a5 5 0 0 0 7.1 0l2.1-2.1a5 5 0 0 0-7.1-7.1l-1.2 1.2"/><path d="M14 11a5 5 0 0 0-7.1 0l-2.1 2.1a5 5 0 0 0 7.1 7.1l1.2-1.2"/></svg></span>
      <span class="sr-only">${label}</span>
    </button>
  </div>`;
}

export function renderImportExcludeButton(markerName = '') {
  const label = markerName ? `Exclude ${markerName} from import` : 'Exclude from import';
  return `<button type="button" class="import-exclude-btn" ${importReviewActionAttrs('toggle-row')} title="${escapeHTML(label)}" aria-label="${escapeHTML(label)}">
    <span class="import-exclude-icon" aria-hidden="true">&times;</span>
    <span class="sr-only">${escapeHTML(label)}</span>
  </button>`;
}

export function setImportExcludeButtonState(btn, excluded) {
  const label = excluded ? 'Include in import' : 'Exclude from import';
  btn.classList.toggle('is-restore', excluded);
  btn.title = label;
  btn.setAttribute('aria-label', label);
  btn.innerHTML = `<span class="import-exclude-icon" aria-hidden="true">${excluded ? '+' : '&times;'}</span><span class="sr-only">${label}</span>`;
}
