// Synchronous HTML compatibility facade over one shared cold runtime.
import {cycleImportSourceLabel, renderCycleImportPicker, renderCycleImportSummary} from './cycle-import-rendering.js';
export {getCycleImportSummarySectionView, isCycleImportModuleLoaded, loadCycleImportModule, parseAppleHealthCycleBlob, showCycleImportPreview, clearCycleProfileData, installCycleImportLoaderDelegates} from './cycle-import-runtime.js';

export function renderCycleImportPickerControls() {
  return renderCycleImportPicker();
}

export function renderCycleImportSummarySection(mc: unknown) {
  return renderCycleImportSummary(mc, source => {
    const label = cycleImportSourceLabel(source);
    return () => label;
  });
}
