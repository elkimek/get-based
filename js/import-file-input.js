// import-file-input.js - file picker import binding and routing

import { loadPdfImport } from './import-loader.js';

let importInputBound = false;

export async function handleImportInputChange(e) {
  if (window.isImportRunning && window.isImportRunning()) {
    e.target.value = '';
    return;
  }
  if (e.target.files.length === 0) return;

  let importMod;
  try {
    importMod = await loadPdfImport();
  } catch (err) {
    window.showNotification?.('Could not load import module - check your connection and try again.', 'error');
    e.target.value = '';
    return;
  }

  const files = Array.from(e.target.files);
  const { jsonFiles, pdfFiles, imageFiles, dnaFiles, textFiles, unsupportedCount } = await importMod.classifyImportFiles(files);
  if (unsupportedCount > 0 && jsonFiles.length === 0 && pdfFiles.length === 0 && imageFiles.length === 0 && dnaFiles.length === 0 && textFiles.length === 0) {
    window.showNotification?.("Unsupported file type. Use PDF, text, image, JSON, or DNA raw data (.txt/.csv).", "error");
    e.target.value = '';
    return;
  }

  for (const f of jsonFiles) window.importDataJSON(f);
  if (dnaFiles.length > 0) {
    for (const f of dnaFiles) {
      const header = await f.slice(0, 1500).text();
      const fmt = window.detectDNAFile ? window.detectDNAFile(header) : null;
      if ((fmt === 'mtdna' || fmt === '23andme-mito') && window.handleMtDNAFile) await window.handleMtDNAFile(f);
      else if (fmt === '23andme-y') { window.showNotification?.('Y-chromosome DNA files are not supported', 'info'); }
      else await window.handleDNAFile(f);
    }
  }
  else if (textFiles.length > 0) { for (const f of textFiles) await importMod.handleTextFile(f); }
  else if (imageFiles.length > 0) { for (const f of imageFiles) await importMod.handleImageFile(f); }
  else {
    if (pdfFiles.length === 1) await importMod.handlePDFFile(pdfFiles[0]);
    else if (pdfFiles.length > 1) await importMod.handleBatchPDFs(pdfFiles);
  }
  e.target.value = '';
}

export function bindImportFileInput() {
  if (importInputBound) return;
  importInputBound = true;
  document.getElementById("pdf-input")?.addEventListener("change", handleImportInputChange);
  // Prevent browser from opening dropped files outside drop zone.
  document.addEventListener('dragover', e => e.preventDefault());
  document.addEventListener('drop', e => e.preventDefault());
}
