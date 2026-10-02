// Cached dynamic loader for pdf.js (ESM-only since v4.x). Loads on first
// PDF interaction rather than on every page load, and pins
// `isEvalSupported: false` defense-in-depth at the entry point so call
// sites can't forget it.

export interface PdfTextContent { items: Array<{ str?: string; transform?: number[] }> }
export interface PdfPageProxy {
  getTextContent(): Promise<PdfTextContent>;
  getViewport(options: { scale: number }): { width: number; height: number };
  render(options: { canvasContext: CanvasRenderingContext2D | null; viewport: unknown }): { promise: Promise<void> };
}
export interface PdfDocumentProxy { numPages: number; getPage(pageNumber: number): Promise<PdfPageProxy> }
interface PdfLoadingTask { promise: Promise<PdfDocumentProxy> }
export interface PdfJsModule { GlobalWorkerOptions: { workerSrc?: string }; getDocument(options: Record<string, unknown>): PdfLoadingTask }
type PdfDocumentInput = ArrayBuffer | ArrayBufferView | string | Record<string, unknown>;

const PDFJS_MODULE_URL = '/vendor/pdf.min.mjs';

let _pdfjsPromise: Promise<PdfJsModule> | null = null;

export function loadPdfJs(): Promise<PdfJsModule> {
  if (_pdfjsPromise) return _pdfjsPromise;
  _pdfjsPromise = import(PDFJS_MODULE_URL).then(mod => {
    const pdfjs = (mod.default || mod) as PdfJsModule;
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
export async function getPdfDocument(input: PdfDocumentInput, extraOpts: Record<string, unknown> = {}): Promise<PdfDocumentProxy> {
  const pdfjs = await loadPdfJs();
  const opts = typeof input === 'object' && !ArrayBuffer.isView(input) && !(input instanceof ArrayBuffer)
    ? { ...input, ...extraOpts, isEvalSupported: false }
    : { data: input, ...extraOpts, isEvalSupported: false };
  return pdfjs.getDocument(opts).promise;
}
