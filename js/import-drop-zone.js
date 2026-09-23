// @ts-check
// import-drop-zone.js — shared import drop-zone event binding

import { state } from './state.js';
import { loadImportUI } from './import-loader.js';
import {
  detectDropZoneDNAFile,
  handleDropZoneDNAFile,
  handleDropZoneMtDNAFile,
  hasDropZoneMtDNAHandler,
  importDropZoneJSONFile,
  isDropZoneImportRunning,
  openDropZoneFilePicker,
  showDropZoneImportNotification,
} from './import-drop-zone-runtime.js';

export function setupDropZone() {
  const dropZone = document.getElementById("drop-zone");
  if (!dropZone || dropZone.dataset.lazyDropZoneBound === 'true') return;
  dropZone.dataset.lazyDropZoneBound = 'true';
  dropZone.addEventListener("click", () => {
    if (isDropZoneImportRunning()) return;
    openDropZoneFilePicker();
  });
  dropZone.addEventListener("dragover", e => {
    e.preventDefault();
    if (!isDropZoneImportRunning()) dropZone.classList.add("drag-over");
  });
  dropZone.addEventListener("dragleave", e => {
    e.preventDefault();
    dropZone.classList.remove("drag-over");
  });
  dropZone.addEventListener("drop", async e => {
    e.preventDefault();
    dropZone.classList.remove("drag-over");
    if (isDropZoneImportRunning()) {
      showDropZoneImportNotification("Import already in progress", "info");
      return;
    }
    const files = Array.from(e.dataTransfer?.files || []);
    if (files.length === 0) return;
    const profileId = state.currentProfile, importedData = state.importedData;
    const isCurrent = () => state.currentProfile === profileId && state.importedData === importedData;
    let importMod;
    try {
      importMod = await loadImportUI();
    } catch (err) {
      console.error('[import-drop-zone] Could not load import UI:', err);
      showDropZoneImportNotification('Could not load import UI. Reload the app to finish updating, then try again.', 'error');
      return;
    }
    if (!isCurrent()) return;
    const { jsonFiles, pdfFiles, imageFiles, dnaFiles, textFiles, cycleFiles = [], unsupportedCount } = await importMod.classifyImportFiles(files);
    if (!isCurrent()) return;
    if (unsupportedCount > 0 && jsonFiles.length === 0 && pdfFiles.length === 0 && imageFiles.length === 0 && dnaFiles.length === 0 && textFiles.length === 0 && cycleFiles.length === 0) {
      showDropZoneImportNotification("Unsupported file type. Use PDF, Excel, text, image, JSON, DNA raw data, or an Apple Health, Drip, Natural Cycles, or Clue export.", "error");
      return;
    }
    for (const f of jsonFiles) { if (state.currentProfile !== profileId) return; await importDropZoneJSONFile(f); }
    if (cycleFiles.length > 0) { for (const f of cycleFiles) { if (state.currentProfile !== profileId) return; await importMod.handleCycleImportFile(f); } }
    if (dnaFiles.length > 0) {
      for (const f of dnaFiles) {
        if (state.currentProfile !== profileId) return;
        const headerData = state.importedData, header = await f.slice(0, 1500).text();
        if (state.currentProfile !== profileId || state.importedData !== headerData) return;
        const fmt = detectDropZoneDNAFile(header);
        if ((fmt === 'mtdna' || fmt === '23andme-mito') && hasDropZoneMtDNAHandler()) await handleDropZoneMtDNAFile(f);
        else if (fmt === '23andme-y') { showDropZoneImportNotification('Y-chromosome DNA files are not supported', 'info'); }
        else await handleDropZoneDNAFile(f);
      }
    }
    if (textFiles.length > 0) { for (const f of textFiles) { if (state.currentProfile !== profileId) return; await importMod.handleTextFile(f); } }
    if (imageFiles.length > 0) { for (const f of imageFiles) { if (state.currentProfile !== profileId) return; await importMod.handleImageFile(f); } }
    if (state.currentProfile !== profileId) return;
    if (pdfFiles.length === 1) await importMod.handlePDFFile(pdfFiles[0]);
    else if (pdfFiles.length > 1) await importMod.handleBatchPDFs(pdfFiles);
  });
}
