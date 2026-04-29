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

const SUPPORTED_TEXT_EXTS = new Set(['txt', 'md', 'markdown', 'rst', 'json', 'csv', 'log']);

/// Turn a File (or File-like) into one or more { name, text } entries.
/// Returns [] for unsupported types so callers can filter. ZIPs recurse:
/// an entry's name is prefixed with the zip's name so the source filename
/// the user sees in the doc list reflects the archive they dropped.
export async function extractFromFile(file) {
  const name = String(file.name || '');
  const ext = extOf(name);
  if (SUPPORTED_TEXT_EXTS.has(ext)) {
    return [{ name, text: await file.text() }];
  }
  if (ext === 'pdf')  return [{ name, text: await extractPdf(file) }];
  if (ext === 'docx') return [{ name, text: await extractDocx(file) }];
  if (ext === 'zip')  return extractZip(file);
  const type = file.type || '(no MIME type)';
  console.warn(`[lens-local] skipping: name="${name}" ext="${ext}" type="${type}" size=${file.size}`);
  return [];
}

function extOf(name) {
  const i = name.lastIndexOf('.');
  return i === -1 ? '' : name.slice(i + 1).toLowerCase();
}

// ── PDF ──────────────────────────────────────────────────────────

async function extractPdf(file) {
  const buffer = await file.arrayBuffer();
  const pdf = await getPdfDocument({ data: buffer });
  const pages = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    // items[] has { str, dir, transform, ... }. Joining by space is lossy
    // — we lose line breaks and column structure — but it's good enough
    // for chunk-level retrieval and avoids false paragraph breaks that
    // a more literal reconstruction would introduce.
    pages.push(content.items.map((i) => i.str).join(' '));
  }
  return pages.join('\n\n');
}

// ── DOCX ─────────────────────────────────────────────────────────

async function extractDocx(file) {
  await loadScript('/vendor/mammoth.browser.min.js');
  const mammoth = window.mammoth;
  if (!mammoth) throw new Error('mammoth failed to load');
  const buffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer: buffer });
  // mammoth surfaces warnings (unhandled styles, missing images) but we
  // don't render them — ingest is a text-only pipeline. Keep raw text.
  return result.value || '';
}

// ── ZIP ──────────────────────────────────────────────────────────

async function extractZip(file) {
  await loadScript('/vendor/jszip.min.js');
  const JSZip = window.JSZip;
  if (!JSZip) throw new Error('JSZip failed to load');
  const buffer = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(buffer);
  const out = [];
  // JSZip.files is a flat map of "path/inside/archive.ext" → entry. We
  // expand each supported-type entry into its own {name, text} using
  // recursion through extractFromFile; the name is prefixed with the
  // archive name so the doc list shows which .zip each chunk came from.
  const archiveName = String(file.name || 'archive.zip');
  for (const entry of Object.values(zip.files)) {
    if (entry.dir) continue;
    const innerExt = extOf(entry.name);
    if (!SUPPORTED_TEXT_EXTS.has(innerExt) && !['pdf', 'docx'].includes(innerExt)) continue;
    const blob = await entry.async('blob');
    const subFile = new File([blob], entry.name, { type: blob.type || '' });
    try {
      const extracted = await extractFromFile(subFile);
      for (const e of extracted) {
        out.push({ name: `${archiveName}::${e.name}`, text: e.text });
      }
    } catch (err) {
      console.warn(`[lens-local] zip entry failed: ${entry.name}`, err);
    }
  }
  return out;
}

// ── Script loader ────────────────────────────────────────────────

const _scriptLoads = new Map(); // src → Promise

/// Lazy-load a vendor script via <script src> and cache the Promise so
/// concurrent callers share one fetch. No-ops if the script is already
/// present on the page (e.g., pdf.js pre-loaded by the main app).
function loadScript(src) {
  if (_scriptLoads.has(src)) return _scriptLoads.get(src);
  // Already on the page? (Main app preloads pdf.js for the PDF-import
  // pipeline, so the <script> tag is there before we need it.)
  if ([...document.scripts].some((s) => s.src.endsWith(src))) {
    _scriptLoads.set(src, Promise.resolve());
    return Promise.resolve();
  }
  const p = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(s);
  });
  _scriptLoads.set(src, p);
  return p;
}
