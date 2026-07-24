// @ts-check
// import-loader.js — shared lazy loaders for heavyweight import flows

import { hasImportReviewDraft } from './import-review-draft.js';

const IMPORT_STYLESHEET_URL = new URL('../css/import.css', import.meta.url).href;

/** @type {Promise<typeof import('./pdf-import.js')> | null} */
let _pdfImportLoad = null;
/** @type {Promise<HTMLLinkElement> | null} */
let _importStylesheetLoad = null;
let _useImportStylesheetRetryUrl = false;

function importStylesheetUrl() {
  if (!_useImportStylesheetRetryUrl) return IMPORT_STYLESHEET_URL;
  const retryUrl = new URL(IMPORT_STYLESHEET_URL);
  retryUrl.searchParams.set('lazy-retry', '1');
  return retryUrl.href;
}

/** @returns {Promise<HTMLLinkElement>} */
export function loadImportStylesheet() {
  if (!_importStylesheetLoad) {
    if (typeof document === 'undefined') {
      return Promise.reject(new Error('Import stylesheet requires a document'));
    }
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = importStylesheetUrl();
    link.dataset.importStylesheet = '';
    _importStylesheetLoad = new Promise((resolve, reject) => {
      link.addEventListener('load', () => resolve(link), { once: true });
      link.addEventListener('error', () => {
        reject(new Error('Import stylesheet could not be loaded'));
      }, { once: true });
      const anchor = document.querySelector('[data-import-stylesheet-anchor]');
      const parent = anchor?.parentNode || document.head;
      parent.insertBefore(link, anchor || null);
    }).catch(err => {
      link.remove();
      _importStylesheetLoad = null;
      _useImportStylesheetRetryUrl = true;
      throw err;
    });
  }
  return _importStylesheetLoad;
}

/** @returns {Promise<typeof import('./pdf-import.js')>} */
export function loadPdfImport() {
  if (!_pdfImportLoad) {
    _pdfImportLoad = import('./pdf-import.js').catch(err => {
      _pdfImportLoad = null;
      throw err;
    });
  }
  return _pdfImportLoad;
}

/** @returns {Promise<typeof import('./pdf-import.js')>} */
export async function loadImportUI() {
  const [importModule] = await Promise.all([
    loadPdfImport(),
    loadImportStylesheet(),
  ]);
  return importModule;
}

export async function restorePendingImportReviewDraft() {
  if (!hasImportReviewDraft()) return false;
  await loadImportStylesheet();
  const review = await import('./pdf-import-review.js');
  return review.restoreImportReviewDraft();
}
