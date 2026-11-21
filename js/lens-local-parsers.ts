// js/lens-local-parsers.js — main-thread document parsers for lens-local.
//
// Why main-thread: the worker is a module worker (type: 'module'), and the
// UMD parser bundles (mammoth, JSZip) can't cleanly round-trip through a
// module worker's import() without window/global shims. Main-thread
// parsing lets pdf.js share the loader the rest of the app uses, and
// extraction stays cheap relative to embedding.
//
// Each vendored lib is loaded lazily on first use so users who never
// ingest a PDF or DOCX don't pay the parser cost.

import { getPdfDocument } from './pdfjs-loader.js';
import { getUtilsRuntimeValue } from './utils-runtime.js';
import type { ZipEntry } from './utils-runtime.js';
export interface ExtractedLensDocument { name: string; text: string }

const SUPPORTED_TEXT_EXTS = new Set(['txt', 'md', 'markdown', 'rst', 'json', 'csv', 'log']);
const LIMIT = {
  fileBytes: 20 * 1024 * 1024,
  expandedBytes: 40 * 1024 * 1024,
  textBytes: 16 * 1024 * 1024,
  documents: 100,
  entries: 1000,
  pdfPages: 500,
};

export class LensExtractionLimitError extends Error {}

export function createLensExtractionScope(stopRequested = () => false) {
  let expandedBytes = 0;
  let documents = 0;
  let textBytes = 0;
  const check = () => {
    if (stopRequested()) throw new DOMException('Document extraction stopped.', 'AbortError');
  };
  return {
    check,
    expanded(bytes: number) {
      check();
      expandedBytes += bytes;
      if (expandedBytes > LIMIT.expandedBytes) throw new LensExtractionLimitError('The expanded document data exceeds 40 MB.');
    },
    text(value: string) {
      check();
      textBytes += new TextEncoder().encode(value).length;
      if (textBytes > LIMIT.textBytes) throw new LensExtractionLimitError('The extracted document text exceeds 16 MB.');
    },
    document() {
      check();
      if (++documents > LIMIT.documents) throw new LensExtractionLimitError('Choose at most 100 documents per indexing job.');
    },
  };
}

type LensExtractionScope = ReturnType<typeof createLensExtractionScope>;

export async function extractFromFile(file: File, scope = createLensExtractionScope()): Promise<ExtractedLensDocument[]> {
  scope.check();
  if (file.size > LIMIT.fileBytes) throw new LensExtractionLimitError('Each input document must be at most 20 MB.');
  const name = String(file.name || '');
  const ext = extOf(name);
  if (SUPPORTED_TEXT_EXTS.has(ext)) {
    scope.document();
    const text = await file.text();
    scope.text(text);
    return [{ name, text }];
  }
  if (ext === 'pdf' || ext === 'docx') {
    scope.document();
    const text = ext === 'pdf' ? await extractPdf(file, scope) : await extractDocx(file, scope);
    return [{ name, text }];
  }
  return ext === 'zip' ? extractZip(file, scope) : [];
}

function extOf(name: string): string {
  const index = name.lastIndexOf('.');
  return index === -1 ? '' : name.slice(index + 1).toLowerCase();
}

async function extractPdf(file: File, scope: LensExtractionScope) {
  const pdf = await getPdfDocument({ data: await file.arrayBuffer() });
  try {
    if (pdf.numPages > LIMIT.pdfPages) throw new LensExtractionLimitError('Choose PDFs of at most 500 pages.');
    const pages: string[] = [];
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      scope.check();
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const text = content.items.map(item => (item as { str?: string }).str).join(' ');
      scope.text(text);
      pages.push(text);
    }
    return pages.join('\n\n');
  } finally {
    await pdf.destroy?.();
  }
}

async function extractDocx(file: File, scope: LensExtractionScope) {
  const buffer = await file.arrayBuffer();
  // Validate the inner Word archive before handing it to a parser that reads
  // complete parts into memory.
  for (const entry of await readZip(buffer)) await readZipEntry(entry, scope, false);
  await loadScript('/vendor/mammoth.browser.min.js');
  const mammoth = getUtilsRuntimeValue('mammoth');
  if (!mammoth) throw new Error('mammoth failed to load');
  const result = await mammoth.extractRawText({ arrayBuffer: buffer });
  const text = result.value || '';
  scope.text(text);
  return text;
}

async function readZip(buffer: ArrayBuffer) {
  await loadScript('/vendor/jszip.min.js');
  const JSZip = getUtilsRuntimeValue('JSZip');
  if (!JSZip) throw new Error('JSZip failed to load');
  const entries = Object.values((await JSZip.loadAsync(buffer)).files);
  if (entries.length > LIMIT.entries) throw new LensExtractionLimitError('The archive contains more than 1,000 entries.');
  return entries.filter(entry => !entry.dir);
}

async function readZipEntry(entry: ZipEntry, scope: LensExtractionScope, retain: boolean) {
  scope.check();
  const stream = entry.internalStream('uint8array');
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let entryBytes = 0;
  await new Promise<void>((resolve, reject) => {
    stream.on('data', chunk => {
      try {
        scope.expanded(chunk.byteLength);
        entryBytes += chunk.byteLength;
        if (entryBytes > LIMIT.fileBytes) throw new LensExtractionLimitError('An expanded archive entry exceeds 20 MB.');
        if (retain) chunks.push(chunk);
      } catch (error) {
        stream.pause();
        reject(error);
      }
    });
    stream.on('error', reject);
    stream.on('end', resolve);
    stream.resume();
  });
  scope.check();
  return chunks;
}

export function isLensExtractionStop(error: unknown) {
  return error instanceof LensExtractionLimitError || (error as { name?: string })?.name === 'AbortError';
}

async function extractZip(file: File, scope: LensExtractionScope) {
  const entries = await readZip(await file.arrayBuffer());
  const documents: ExtractedLensDocument[] = [];
  for (const entry of entries) {
    scope.check();
    const extension = extOf(entry.name);
    if (!SUPPORTED_TEXT_EXTS.has(extension) && extension !== 'pdf' && extension !== 'docx') continue;
    try {
      const subFile = new File(await readZipEntry(entry, scope, true), entry.name);
      for (const { name, text } of await extractFromFile(subFile, scope)) {
        documents.push({ name: (file.name || 'archive.zip') + '::' + name, text });
      }
    } catch (error) {
      if (isLensExtractionStop(error)) throw error;
      console.warn('[lens-local] Could not extract an archive entry.', error);
    }
  }
  return documents;
}

// ── Script loader ────────────────────────────────────────────────

const _scriptLoads = new Map<string, Promise<void>>(); // src → Promise

/**
 * Lazy-load a vendor script via <script src> and cache the Promise so
 * concurrent callers share one fetch. No-ops if the script is already
 * present on the page (e.g., pdf.js pre-loaded by the main app).
 */
function loadScript(src: string): Promise<void> {
  const cached = _scriptLoads.get(src);
  if (cached) return cached;
  // Already on the page? (Main app preloads pdf.js for the PDF-import
  // pipeline, so the <script> tag is there before we need it.)
  if ([...document.scripts].some((s) => s.src.endsWith(src))) {
    _scriptLoads.set(src, Promise.resolve());
    return Promise.resolve();
  }
  const p = new Promise<void>((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = () => resolve(undefined);
    s.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(s);
  });
  _scriptLoads.set(src, p);
  return p;
}
