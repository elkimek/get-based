// Cached dynamic loader for pdf.js (ESM-only since v4.x). Loads on first
// PDF interaction rather than on every page load, and pins
// `isEvalSupported: false` defense-in-depth at the entry point so call
// sites can't forget it. Also exposes the module on `window.pdfjsLib`
// for any legacy reference that hasn't migrated to the loader yet.
let _pdfjsPromise = null;

export function loadPdfJs() {
  if (_pdfjsPromise) return _pdfjsPromise;
  _pdfjsPromise = import('/vendor/pdf.min.mjs').then(mod => {
    const pdfjs = mod.default || mod;
    if (!pdfjs.GlobalWorkerOptions.workerSrc) {
      pdfjs.GlobalWorkerOptions.workerSrc = '/vendor/pdf.worker.min.mjs';
    }
    window.pdfjsLib = pdfjs;
    return pdfjs;
  });
  return _pdfjsPromise;
}

// Wrapper around getDocument that pins safe defaults. Pass any pdf.js
// option overrides via `extraOpts`. CVE-2024-4367 (FontMatrix injection)
// motivates `isEvalSupported: false` even after the version bump — the
// guard is applied AFTER the spread so a caller can't accidentally
// re-enable eval through extraOpts.
export async function getPdfDocument(input, extraOpts = {}) {
  const pdfjs = await loadPdfJs();
  const opts = typeof input === 'object' && !ArrayBuffer.isView(input) && !(input instanceof ArrayBuffer)
    ? { ...input, ...extraOpts, isEvalSupported: false }
    : { data: input, ...extraOpts, isEvalSupported: false };
  return pdfjs.getDocument(opts).promise;
}
