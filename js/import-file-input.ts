// Shared file-picker and page-wide import routing.
import { loadImportUI } from './import-loader.js';
import { dispatchImportFiles } from './import-dispatch.js';
import { bindPageFileDrop } from './import-page-drop.js';
import { showDropZoneImportNotification } from './import-drop-zone-runtime.js';
import { isPublicDemoMode, notifyPublicDemoBlocked } from './public-demo-mode.js';
let importInputBound = false;

export async function handleImportInputChange(e: {target: {files: File[] | FileList | null; value: string}}) {
  const files = Array.from(e.target.files || []);
  e.target.value = '';
  if (isPublicDemoMode()) {
    notifyPublicDemoBlocked('Importing files');
    return;
  }
  return dispatchImportFiles(files, loadImportUI);
}

export function bindImportFileInput() {
  if (importInputBound) return;
  importInputBound = true;
  const report = (error: unknown) => {
    console.error('[import-file-input] import handler failed:', error);
    showDropZoneImportNotification('Import failed - check the file and try again.', 'error');
  };
  document.getElementById('pdf-input')?.addEventListener('change', event => {
    void handleImportInputChange(event as Event & {target: HTMLInputElement}).catch(report);
  });
  bindPageFileDrop(files => {
    if (isPublicDemoMode()) {
      notifyPublicDemoBlocked('Importing files');
      return Promise.resolve();
    }
    return dispatchImportFiles(files, loadImportUI, 'page').catch(report);
  });
}
