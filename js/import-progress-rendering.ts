import { renderHTML as renderProgressHTML } from './components/ImportProgressPresentation.svelte.html.js';
import { renderHTML as renderDropZoneResetHTML } from './components/DropZoneResetPresentation.svelte.html.js';
import { projectImportProgress, projectImportBatchCounter } from './import-progress-presentation.js';

/** Synchronous sibling fragments; the existing controller owns every host and mutation. */
export function renderImportProgress(step: number, pct: number, fileName: string): string {
  return renderProgressHTML({ view: projectImportProgress(step, pct, fileName) });
}

/** Prefix only. The caller next renders its body in the original native evaluation order. */
export function renderImportBatchCounter(current: number, total: number): string {
  return renderProgressHTML({ view: projectImportBatchCounter(current, total) });
}

/** Exact original reset children; shared host/header/drop-zone CSS remains its native owner. */
export function renderDropZoneReset(): string {
  return renderDropZoneResetHTML({});
}
