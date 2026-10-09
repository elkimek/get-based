import type { ImportReviewMarker } from './pdf-import-review-runtime.js';
// pdf-import-review-formatting.js — unit controls, ranges, and picker positioning

import {renderHTML as renderImportUnitControl} from './components/ImportUnitControl.svelte.html.js';
import {projectImportUnitControl} from './import-review-presentation.js';
import { GENERIC_IMPORT_UNITS, getValidUnitsForMarker } from './pdf-import-unit-conversions.js';

export function getImportUnitOptions(marker: ImportReviewMarker) {
  const key = marker.mappedKey || marker.suggestedKey;
  const validUnits = getValidUnitsForMarker(key);
  return validUnits.length > 0
    ? { units: validUnits, schemaBacked: true }
    : { units: GENERIC_IMPORT_UNITS, schemaBacked: false };
}

// Render responsive unit controls. Schema-backed markers get a constrained
// picker; custom markers keep text editing plus the same picker as an assist.
export function renderUnitSelect(marker: ImportReviewMarker, idx: number) {
  const unitOptions = getImportUnitOptions(marker);
  return renderImportUnitControl({view: projectImportUnitControl(marker, idx, unitOptions)});
}


export function positionImportUnitMenu(button: HTMLElement, menu: HTMLElement) {
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


export function formatImportNumber(value: unknown) {
  return value == null || isNaN(value as number) ? '' : String(value);
}

export function formatImportLabRange(marker: ImportReviewMarker) {
  if (marker.refMin == null && marker.refMax == null) return '';
  return `${formatImportNumber(marker.refMin) || '?'}\u2013${formatImportNumber(marker.refMax) || '?'}`;
}
