// @ts-check
// pdf-import-review-formatting.js — unit controls, ranges, and picker positioning

import { escapeHTML } from './utils.js';
import { GENERIC_IMPORT_UNITS, getValidUnitsForMarker } from './pdf-import-marker-mapping.js';

export function getImportUnitOptions(marker) {
  const key = marker.mappedKey || marker.suggestedKey;
  const validUnits = getValidUnitsForMarker(key);
  return validUnits.length > 0
    ? { units: validUnits, schemaBacked: true }
    : { units: GENERIC_IMPORT_UNITS, schemaBacked: false };
}

// Render responsive unit controls. Schema-backed markers get a constrained
// picker; custom markers keep text editing plus the same picker as an assist.
export function renderUnitSelect(marker, idx) {
  const unitOptions = getImportUnitOptions(marker);
  const currentUnit = marker.unit || '';

  if (!unitOptions.schemaBacked) {
    return `<div class="import-unit-combo">
      <input type="text" class="import-unit-input import-unit-text" data-marker-idx="${idx}" value="${escapeHTML(currentUnit)}" data-import-review-action="edit-unit" aria-label="Unit for ${escapeHTML(marker.rawName)}" autocomplete="off">
      <button type="button" class="import-unit-picker-btn" data-marker-idx="${idx}" data-import-review-action="unit-picker" aria-haspopup="listbox" aria-expanded="false" title="Choose common unit" aria-label="Choose common unit for ${escapeHTML(marker.rawName)}">
        <span class="import-unit-button-caret" aria-hidden="true">\u25be</span>
      </button>
    </div>`;
  }

  const displayUnit = currentUnit || unitOptions.units[0] || '';
  return `<button type="button" class="import-unit-input import-unit-button" data-marker-idx="${idx}" data-import-review-action="unit-picker" aria-haspopup="listbox" aria-expanded="false" title="${escapeHTML(displayUnit)}" aria-label="Unit for ${escapeHTML(marker.rawName)}">
    <span class="import-unit-button-text">${escapeHTML(displayUnit)}</span>
    <span class="import-unit-button-caret" aria-hidden="true">\u25be</span>
  </button>`;
}


export function positionImportUnitMenu(button, menu) {
  const isMobile = matchMedia('(max-width: 768px)').matches;
  if (isMobile) {
    menu.classList.add('is-mobile');
    return;
  }
  const rect = button.getBoundingClientRect();
  const gap = 6;
  const margin = 12;
  const viewportWidth = document.documentElement.clientWidth || innerWidth;
  const viewportHeight = innerHeight || document.documentElement.clientHeight;
  const width = Math.min(Math.max(rect.width, 220), viewportWidth - margin * 2);
  const left = Math.min(Math.max(margin, rect.left), viewportWidth - width - margin);
  let top = rect.bottom + gap;
  let maxHeight = viewportHeight - top - margin;
  if (maxHeight < 160 && rect.top > 180) {
    maxHeight = Math.min(280, rect.top - margin - gap);
    top = Math.max(margin, rect.top - maxHeight - gap);
  }
  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;
  menu.style.width = `${width}px`;
  menu.style.maxHeight = `${Math.max(140, Math.min(280, maxHeight))}px`;
}


export function formatImportNumber(value) {
  return value == null || isNaN(value) ? '' : String(value);
}

export function formatImportLabRange(marker) {
  if (marker.refMin == null && marker.refMax == null) return '';
  return `${formatImportNumber(marker.refMin) || '?'}\u2013${formatImportNumber(marker.refMax) || '?'}`;
}
