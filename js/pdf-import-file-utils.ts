// pdf-import-file-utils.js - PDF extraction, image rendering, and file classification helpers.

import { getPdfDocument, readFileArrayBuffer } from './pdfjs-loader.js';
export { extractPDFText, extractPDFTextFacade } from './pdfjs-loader.js';
import { isXlsxFile } from './pdf-import-spreadsheet.js';

export interface ImportedPDFImage { base64: string; mediaType: 'image/jpeg'; page: number }

export interface ImportFileClassifierDeps {
  isDNAFile?: (file: File) => boolean; isDNAFileByContent?: (file: File) => Promise<boolean>;
  isCycleImportFile?: (file: File) => Promise<boolean>;
}

// Some browsers / OS file managers (e.g. OCRFeeder on Linux) export PDFs
// with no extension and no MIME hint. Sniff the %PDF magic bytes so
// extension-less files don't fall through to the unsupported branch.
export async function isPdfByMagic(file: File) {
  try {
    const buf = await file.slice(0, 4).arrayBuffer();
    const b = new Uint8Array(buf);
    return b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46;
  } catch { return false; }
}

// Shared classifier for both drop-zone and file-input paths. Returns
// { jsonFiles, pdfFiles, imageFiles, dnaFiles, textFiles, cycleFiles, unsupportedCount }.
// The PDF bucket includes magic-byte hits, so extension-less PDFs are
// routed to the import pipeline instead of silently rejected.
export async function classifyImportFiles(files: File[] | FileList | null | undefined, deps: ImportFileClassifierDeps = {}) {
  const fileList = Array.from(files || []);
  const jsonCandidates = fileList.filter(f => f.name.endsWith('.json') || f.type === 'application/json');
  const jsonFiles: File[] = [];
  const cycleFiles: File[] = [];
  for (const file of jsonCandidates) {
    if (deps.isCycleImportFile && await deps.isCycleImportFile(file)) cycleFiles.push(file);
    else jsonFiles.push(file);
  }
  const pdfFiles = fileList.filter(f => f.name.endsWith('.pdf') || f.type === 'application/pdf');
  const imageFiles = fileList.filter(f => /\.(jpe?g|png|webp)$/i.test(f.name) || f.type?.startsWith('image/'));
  const dnaFiles = fileList.filter(f => deps.isDNAFile && deps.isDNAFile(f));
  const textFiles: File[] = [];
  const unmatched = fileList.filter(f => !jsonCandidates.includes(f) && !pdfFiles.includes(f) && !imageFiles.includes(f) && !dnaFiles.includes(f));
  for (const f of unmatched) {
    if (/\.(txt|csv)$/i.test(f.name)) {
      if (deps.isDNAFileByContent && await deps.isDNAFileByContent(f)) dnaFiles.push(f);
      else textFiles.push(f);
    } else if (isXlsxFile(f)) {
      textFiles.push(f);
    } else if (/\.(xml|zip)$/i.test(f.name) || ['application/xml', 'text/xml', 'application/zip', 'application/x-zip-compressed'].includes(f.type || '')) {
      cycleFiles.push(f);
    } else if (deps.isCycleImportFile && await deps.isCycleImportFile(f)) {
      cycleFiles.push(f);
    } else if (await isPdfByMagic(f)) {
      pdfFiles.push(f);
    }
  }
  const unsupportedCount = fileList.length - jsonFiles.length - pdfFiles.length - imageFiles.length - dnaFiles.length - textFiles.length - cycleFiles.length;
  return { jsonFiles, pdfFiles, imageFiles, dnaFiles, textFiles, cycleFiles, unsupportedCount };
}

export function assessTextQuality(text: string | null | undefined) {
  if (!text || !text.trim()) return 'empty';
  const words = text.trim().split(/\s+/);
  if (words.length < 30) return 'poor';
  // Check for high ratio of non-alpha characters (garbled OCR, encoding junk)
  const alphaChars = text.replace(/[^a-zA-Z\u00C0-\u024F\u0400-\u04FF]/g, '').length;
  const totalChars = text.replace(/\s/g, '').length;
  if (totalChars > 0 && alphaChars / totalChars < 0.15) return 'poor';
  return 'good';
}

export async function extractPDFImages(file: File, maxPages = 8) {
  const arrayBuffer = await readFileArrayBuffer(file);
  const pdf = await getPdfDocument({ data: arrayBuffer });
  const pages = Math.min(pdf.numPages, maxPages);
  const images: ImportedPDFImage[] = [];
  for (let i = 1; i <= pages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 2.0 }); // 2x for fine print
    const canvas = document.createElement('canvas');
    canvas.width = Math.min(viewport.width, 2048);
    canvas.height = Math.min(viewport.height, 2048 * (viewport.height / viewport.width));
    const ctx = canvas.getContext('2d');
    if (!ctx) continue;
    const scale = canvas.width / viewport.width;
    await page.render({ canvasContext: ctx, viewport: page.getViewport({ scale: 2.0 * scale }) }).promise;
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    const base64 = dataUrl.split(',')[1]!;
    images.push({ base64, mediaType: 'image/jpeg', page: i });
  }
  return images;
}
