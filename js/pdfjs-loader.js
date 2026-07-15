// @ts-check
// Cached dynamic loader for pdf.js (ESM-only since v4.x). Loads on first
// PDF interaction rather than on every page load, and pins
// `isEvalSupported: false` defense-in-depth at the entry point so call
// sites can't forget it.

/**
 * @typedef {{ items: Array<{ str?: string, transform?: number[] }> }} PdfTextContent
 * @typedef {{
 *   getTextContent(): Promise<PdfTextContent>,
 *   getViewport(options: { scale: number }): { width: number, height: number },
 *   render(options: { canvasContext: CanvasRenderingContext2D | null, viewport: unknown }): { promise: Promise<void> }
 * }} PdfPageProxy
 * @typedef {{ numPages: number, getPage(pageNumber: number): Promise<PdfPageProxy> }} PdfDocumentProxy
 * @typedef {{ promise: Promise<PdfDocumentProxy> }} PdfLoadingTask
 * @typedef {{
 *   GlobalWorkerOptions: { workerSrc?: string },
 *   getDocument(options: Record<string, unknown>): PdfLoadingTask
 * }} PdfJsModule
 * @typedef {ArrayBuffer | ArrayBufferView | string | Record<string, unknown>} PdfDocumentInput
 */

const PDFJS_MODULE_URL = '/vendor/pdf.min.mjs';

/** @type {Promise<PdfJsModule> | null} */
let _pdfjsPromise = null;

/**
 * @returns {Promise<PdfJsModule>}
 */
export function loadPdfJs() {
  if (_pdfjsPromise) return _pdfjsPromise;
  _pdfjsPromise = import(PDFJS_MODULE_URL).then(mod => {
    const pdfjs = /** @type {PdfJsModule} */ (mod.default || mod);
    if (!pdfjs.GlobalWorkerOptions.workerSrc) {
      pdfjs.GlobalWorkerOptions.workerSrc = '/vendor/pdf.worker.min.mjs';
    }
    return pdfjs;
  });
  return _pdfjsPromise;
}

// Wrapper around getDocument that pins safe defaults. Pass any pdf.js
// option overrides via `extraOpts`. CVE-2024-4367 (FontMatrix injection)
// motivates `isEvalSupported: false` even after the version bump — the
// guard is applied AFTER the spread so a caller can't accidentally
// re-enable eval through extraOpts.
/**
 * @param {PdfDocumentInput} input
 * @param {Record<string, unknown>} [extraOpts]
 * @returns {Promise<PdfDocumentProxy>}
 */
export async function getPdfDocument(input, extraOpts = {}) {
  const pdfjs = await loadPdfJs();
  const opts = typeof input === 'object' && !ArrayBuffer.isView(input) && !(input instanceof ArrayBuffer)
    ? { ...input, ...extraOpts, isEvalSupported: false }
    : { data: input, ...extraOpts, isEvalSupported: false };
  return pdfjs.getDocument(opts).promise;
}
