// @ts-check
// import-loader.js — shared lazy loaders for heavyweight import flows

/** @type {Promise<typeof import('./pdf-import.js')> | null} */
let _pdfImportLoad = null;

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
