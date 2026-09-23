// @ts-check
// import-file-input.js - file picker import binding and routing

import { state } from './state.js';
import { loadImportUI } from './import-loader.js';
import {
  detectDropZoneDNAFile as detectImportDNAFileRuntime,
  handleDropZoneDNAFile as handleImportDNAFileRuntime,
  handleDropZoneMtDNAFile as handleImportMtDNAFileRuntime,
  hasDropZoneMtDNAHandler as hasImportMtDNAHandlerRuntime,
  importDropZoneJSONFile as importJSONFileRuntime,
  isDropZoneImportRunning as isImportRunningRuntime,
  showDropZoneImportNotification as showImportNotificationRuntime,
} from './import-drop-zone-runtime.js';

let importInputBound = false;
let selectionGeneration = 0;

/** @param {{ target: { files: File[] | FileList | null, value: string } }} e */
export async function handleImportInputChange(e) {
  if (isImportRunningRuntime()) {
    e.target.value = '';
    return;
  }
  if (!e.target.files || e.target.files.length === 0) return;

  const generation = ++selectionGeneration;
  const files = Array.from(e.target.files);
  const profileId = state.currentProfile, importedData = state.importedData;
  e.target.value = '';
  const ownsSelection = () => generation === selectionGeneration && state.currentProfile === profileId;
  const isCurrent = () => ownsSelection() && state.importedData === importedData;
  let importMod;
  try {
    importMod = await loadImportUI();
  } catch (err) {
    console.error('[import-file-input] Could not load import UI:', err);
    showImportNotificationRuntime('Could not load import UI. Reload the app to finish updating, then try again.', 'error');
    return;
  }

  if (!isCurrent()) return;
  const { jsonFiles, pdfFiles, imageFiles, dnaFiles, textFiles, cycleFiles = [], unsupportedCount } = await importMod.classifyImportFiles(files);
  if (!isCurrent()) return;
  if (unsupportedCount > 0 && jsonFiles.length === 0 && pdfFiles.length === 0 && imageFiles.length === 0 && dnaFiles.length === 0 && textFiles.length === 0 && cycleFiles.length === 0) {
    showImportNotificationRuntime("Unsupported file type. Use PDF, Excel, text, image, JSON, DNA raw data, or an Apple Health, Drip, Natural Cycles, or Clue export.", "error");
    return;
  }

  for (const f of jsonFiles) { if (!ownsSelection()) return; await importJSONFileRuntime(f); }
  if (cycleFiles.length > 0) { for (const f of cycleFiles) { if (!ownsSelection()) return; await importMod.handleCycleImportFile(f); } }
  if (dnaFiles.length > 0) {
    for (const f of dnaFiles) {
      if (!ownsSelection()) return;
      const headerData = state.importedData, header = await f.slice(0, 1500).text();
      if (!ownsSelection() || state.importedData !== headerData) return;
      const fmt = detectImportDNAFileRuntime(header);
      if ((fmt === 'mtdna' || fmt === '23andme-mito') && hasImportMtDNAHandlerRuntime()) await handleImportMtDNAFileRuntime(f);
      else if (fmt === '23andme-y') { showImportNotificationRuntime('Y-chromosome DNA files are not supported', 'info'); }
      else await handleImportDNAFileRuntime(f);
    }
  }
  if (textFiles.length > 0) { for (const f of textFiles) { if (!ownsSelection()) return; await importMod.handleTextFile(f); } }
  if (imageFiles.length > 0) { for (const f of imageFiles) { if (!ownsSelection()) return; await importMod.handleImageFile(f); } }
  if (!ownsSelection()) return;
  if (pdfFiles.length === 1) await importMod.handlePDFFile(pdfFiles[0]);
  else if (pdfFiles.length > 1) await importMod.handleBatchPDFs(pdfFiles);
}

export function bindImportFileInput() {
  if (importInputBound) return;
  importInputBound = true;
  document.getElementById("pdf-input")?.addEventListener("change", e => {
    handleImportInputChange(/** @type {Event & { target: HTMLInputElement }} */ (e)).catch(err => {
      console.error('[import-file-input] import handler failed:', err);
      showImportNotificationRuntime('Import failed - check the file and try again.', 'error');
    });
  });
  // Prevent browser from opening dropped files outside drop zone.
  document.addEventListener('dragover', e => e.preventDefault());
  document.addEventListener('drop', e => e.preventDefault());
}
