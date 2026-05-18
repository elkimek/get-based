// import-loader.js — shared lazy loaders for heavyweight import flows

let _pdfImportLoad = null;

export function loadPdfImport() {
  if (!_pdfImportLoad) {
    _pdfImportLoad = import('./pdf-import.js').catch(err => {
      _pdfImportLoad = null;
      throw err;
    });
  }
  return _pdfImportLoad;
}
