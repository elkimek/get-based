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

export async function readFileArrayBuffer(file: File): Promise<ArrayBuffer> {
  try {
    return await file.arrayBuffer();
  } catch (firstError) {
    if (typeof FileReader === 'undefined') throw firstError;
    return new Promise<ArrayBuffer>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (reader.result instanceof ArrayBuffer) resolve(reader.result);
        else reject(firstError);
      };
      reader.onerror = () => reject(reader.error || firstError);
      reader.onabort = () => reject(firstError);
      reader.readAsArrayBuffer(file);
    });
  }
}

// Shared async forwarding boundary: preserve the PDF facade's Promise adoption.
const extractPdfTextFromFile = extractPDFText;
export const extractPDFTextFacade = async function extractPDFText(file: File) {
  return extractPdfTextFromFile(file);
};

export async function extractPDFText(file: File) {
  const arrayBuffer = await readFileArrayBuffer(file);
  const pdf = await getPdfDocument({ data: arrayBuffer });
  let allItems: Array<{ text: string; x: number; y: number; page: number }> = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    for (const item of textContent.items) {
      const text = item.str?.trim();
      if (text) {
        const transform = item.transform || [];
        allItems.push({ text, x: Math.round(Number(transform[4]) || 0), y: Math.round(Number(transform[5]) || 0), page: i });
      }
    }
  }
  // Page-aware row grouping (same logic as old parser - robust geometric approach)
  const sorted = [...allItems].sort((a, b) => {
    if (a.page !== b.page) return a.page - b.page;
    const dy = b.y - a.y;
    return Math.abs(dy) > 3 ? dy : a.x - b.x;
  });
  if (sorted.length === 0) return '';
  let text = '';
  let currentPage = sorted[0]!.page;
  text += `=== Page ${currentPage} ===\n`;
  let currentRow = [sorted[0]!];
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i]!.page !== currentPage) {
      text += currentRow.sort((a, b) => a.x - b.x).map(r => r.text).join('  ') + '\n';
      currentPage = sorted[i]!.page;
      text += `\n=== Page ${currentPage} ===\n`;
      currentRow = [sorted[i]!];
    } else if (Math.abs(sorted[i]!.y - currentRow[0]!.y) < 3) {
      currentRow.push(sorted[i]!);
    } else {
      text += currentRow.sort((a, b) => a.x - b.x).map(r => r.text).join('  ') + '\n';
      currentRow = [sorted[i]!];
    }
  }
  if (currentRow.length > 0) {
    text += currentRow.sort((a, b) => a.x - b.x).map(r => r.text).join('  ') + '\n';
  }
  return text;
}
