// import-file-input.js - file picker import binding and routing

import { state } from './state.js';
import { importDispatch } from './pdf-import-progress.js';
import {
  detectDropZoneDNAFile as detectImportDNAFileRuntime,
  handleDropZoneDNAFile as handleImportDNAFileRuntime,
  handleDropZoneMtDNAFile as handleImportMtDNAFileRuntime,
  hasDropZoneMtDNAHandler as hasImportMtDNAHandlerRuntime,
  importDropZoneJSONFile as importJSONFileRuntime,
  isDropZoneImportRunning as isImportRunningRuntime,
  showDropZoneImportNotification as showImportNotificationRuntime,
} from './import-drop-zone-runtime.js';

type ImportModule = Pick<typeof import('./pdf-import.js'), 'classifyImportFiles' | 'confirmImportSelection' | 'handleCycleImportFile' | 'handleTextFile' | 'handleImageFile' | 'handlePDFFile' | 'handleBatchPDFs'>;

export async function dispatchImportFiles(files: File[], loadImportUI: () => Promise<ImportModule>, source: 'picker' | 'drop-zone' | 'page' = 'picker', importJSON: (file: File) => unknown = importJSONFileRuntime) {
  if (isImportRunningRuntime()) {
    return;
  }
  if (files.length === 0) return;

  importDispatch.busy = true;
  try {
    const profileId = state.currentProfile, importedData = state.importedData;
    const ownsSelection = () => state.currentProfile === profileId;
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
    const buckets = await importMod.classifyImportFiles(files);
    const { jsonFiles, pdfFiles, imageFiles, dnaFiles, textFiles, cycleFiles = [], unsupportedCount } = buckets;
    if (!isCurrent()) return;
    if (unsupportedCount > 0 && [jsonFiles, pdfFiles, imageFiles, dnaFiles, textFiles, cycleFiles].every(files => !files.length)) {
      showImportNotificationRuntime("Unsupported file type. Use PDF, Excel, text, image, JSON, DNA raw data, or an Apple Health, Drip, Natural Cycles, or Clue export.", "error");
      return;
    }

    if (!await importMod.confirmImportSelection(buckets, source === 'page') || !isCurrent()) return;

    for (const f of jsonFiles) {
      if (!ownsSelection()) return;
      // A full restore owns the whole selection, including cancellation or
      // failure. Never merge later files into the old profile before reload.
      if (await importJSON(f) === 'full-backup') return;
    }
    for (const f of cycleFiles) { if (!ownsSelection()) return; await importMod.handleCycleImportFile(f); }
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
    for (const f of textFiles) { if (!ownsSelection()) return; await importMod.handleTextFile(f); }
    for (const f of imageFiles) { if (!ownsSelection()) return; await importMod.handleImageFile(f); }
    if (!ownsSelection()) return;
    if (pdfFiles.length === 1) await importMod.handlePDFFile(pdfFiles[0]!);
    else if (pdfFiles.length > 1) await importMod.handleBatchPDFs(pdfFiles);
  } finally { importDispatch.busy = false; }
}
