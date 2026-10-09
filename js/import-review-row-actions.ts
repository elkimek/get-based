import type { ImportReviewMarker } from './pdf-import-review-runtime.js';
// import-review-row-actions.js - compact action controls for import review rows.

import {renderHTML as renderImportMapControl} from './components/ImportMapControl.svelte.html.js';
import {renderHTML as renderImportReviewRowAction} from './components/ImportReviewRowAction.svelte.html.js';
import {renderHTML as renderImportExcludeContent} from './components/ImportExcludeContent.svelte.html.js';
import {projectImportMapControl, projectImportExcludeControl} from './import-review-presentation.js';

export function renderImportMapInput(marker: ImportReviewMarker, idx: number) {
  return renderImportMapControl({view: projectImportMapControl(marker, idx)});
}

export function renderImportExcludeButton(markerName = '') {
  return renderImportReviewRowAction({view: projectImportExcludeControl(markerName)});
}

export function setImportExcludeButtonState(btn: HTMLElement, excluded: boolean) {
  const label = excluded ? 'Include in import' : 'Exclude from import';
  btn.classList.toggle('is-restore', excluded);
  btn.title = label;
  btn.setAttribute('aria-label', label);
  btn.innerHTML = renderImportExcludeContent({view: {label, excluded}});
}
