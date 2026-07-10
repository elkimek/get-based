// @ts-check
// pdf-import-file-utils.js - PDF extraction, image rendering, and file classification helpers.

import { getPdfDocument } from './pdfjs-loader.js';
import { isXlsxFile } from './pdf-import-spreadsheet.js';

/**
 * @typedef {{
 *   isDNAFile?: (file: File) => boolean,
 *   isDNAFileByContent?: (file: File) => Promise<boolean>,
 *   isCycleImportFile?: (file: File) => Promise<boolean>,
 * }} ImportFileClassifierDeps
 */

/**
 * @param {File} file
 * @returns {Promise<ArrayBuffer>}
 */
async function readFileArrayBuffer(file) {
  try {
    return await file.arrayBuffer();
  } catch (firstError) {
    if (typeof FileReader === 'undefined') throw firstError;
    return new Promise((resolve, reject) => {
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

/**
 * @param {File} file
 */
export async function extractPDFText(file) {
  const arrayBuffer = await readFileArrayBuffer(file);
  const pdf = await getPdfDocument({ data: arrayBuffer });
  let allItems = [];
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
  let currentPage = sorted[0].page;
  text += `=== Page ${currentPage} ===\n`;
  let currentRow = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].page !== currentPage) {
      text += currentRow.sort((a, b) => a.x - b.x).map(r => r.text).join('  ') + '\n';
      currentPage = sorted[i].page;
      text += `\n=== Page ${currentPage} ===\n`;
      currentRow = [sorted[i]];
    } else if (Math.abs(sorted[i].y - currentRow[0].y) < 3) {
      currentRow.push(sorted[i]);
    } else {
      text += currentRow.sort((a, b) => a.x - b.x).map(r => r.text).join('  ') + '\n';
      currentRow = [sorted[i]];
    }
  }
  if (currentRow.length > 0) {
    text += currentRow.sort((a, b) => a.x - b.x).map(r => r.text).join('  ') + '\n';
  }
  return text;
}

// Some browsers / OS file managers (e.g. OCRFeeder on Linux) export PDFs
// with no extension and no MIME hint. Sniff the %PDF magic bytes so
// extension-less files don't fall through to the unsupported branch.
/**
 * @param {File} file
 */
export async function isPdfByMagic(file) {
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
/**
 * @param {File[] | FileList} files
 * @param {ImportFileClassifierDeps} [deps]
 */
export async function classifyImportFiles(files, deps = {}) {
  const fileList = Array.from(files || []);
  const jsonCandidates = fileList.filter(f => f.name.endsWith('.json') || f.type === 'application/json');
  const jsonFiles = [];
  const cycleFiles = [];
  for (const file of jsonCandidates) {
    if (deps.isCycleImportFile && await deps.isCycleImportFile(file)) cycleFiles.push(file);
    else jsonFiles.push(file);
  }
  const pdfFiles = fileList.filter(f => f.name.endsWith('.pdf') || f.type === 'application/pdf');
  const imageFiles = fileList.filter(f => /\.(jpe?g|png|webp)$/i.test(f.name) || f.type?.startsWith('image/'));
  const dnaFiles = fileList.filter(f => deps.isDNAFile && deps.isDNAFile(f));
  const textFiles = [];
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

/**
 * @param {string} text
 */
export function assessTextQuality(text) {
  if (!text || !text.trim()) return 'empty';
  const words = text.trim().split(/\s+/);
  if (words.length < 30) return 'poor';
  // Check for high ratio of non-alpha characters (garbled OCR, encoding junk)
  const alphaChars = text.replace(/[^a-zA-Z\u00C0-\u024F\u0400-\u04FF]/g, '').length;
  const totalChars = text.replace(/\s/g, '').length;
  if (totalChars > 0 && alphaChars / totalChars < 0.15) return 'poor';
  return 'good';
}

/**
 * @param {File} file
 * @param {number} [maxPages]
 */
export async function extractPDFImages(file, maxPages = 8) {
  const arrayBuffer = await readFileArrayBuffer(file);
  const pdf = await getPdfDocument({ data: arrayBuffer });
  const pages = Math.min(pdf.numPages, maxPages);
  const images = [];
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
    const base64 = dataUrl.split(',')[1];
    images.push({ base64, mediaType: 'image/jpeg', page: i });
  }
  return images;
}
