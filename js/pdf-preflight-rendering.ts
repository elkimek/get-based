import { renderHTML as renderPreflightHTML } from './components/PdfPreflightPresentation.svelte.html.js';
import { renderHTML as renderImageModeHTML } from './components/PdfImageModePresentation.svelte.html.js';
import type { PdfPreflightView } from './pdf-preflight-presentation.js';

/** Synchronous authored HTML; existing Promise, modal and native listeners retain ownership. */
export function renderPdfPreflight(view: PdfPreflightView): string {
  return renderPreflightHTML({ view });
}

/** Image-dialog children only; the controller owns the shared host and modal lifecycle. */
export function renderPdfImageMode(): string {
  return renderImageModeHTML({});
}
