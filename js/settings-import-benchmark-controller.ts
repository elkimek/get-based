// Public Settings entry points; domain runs outlive their owned Svelte dialog.
import type { SettingsBenchmarkReader } from '../types/settings-data.js';
import type { BenchmarkView } from './import-benchmark-contract.js';
import { getErrorMessage } from './caught-error.js';
import { deleteImportBenchmarks } from './import-benchmarks.js';
import { IMPORT_REFERENCE_FIXTURE, runBundledImportReferenceBenchmark } from './import-reference-benchmark.js';
import { openAppendedModalOverlay, removeModalOverlay } from './modal-lifecycle.js';
import { getImportBenchmarkSnapshots } from './settings-data.js';
import { importBenchmarkModelIdentity } from './import-benchmark-data.js';
import { getImportBenchmarkContext } from './import-benchmark-facade.js';
import { mountImportBenchmarks, prepareImportBenchmarkEntryHost } from './import-benchmark-component.js';
import { buildBenchmarkSnapshot } from './import-benchmark-presentation.js';
import { createImportBenchmarksController } from './import-benchmark-controller.js';
import { createBenchmarkRun } from './import-benchmark-run.js';
import { loadSettingsStylesheet } from './settings-styles.js';
import { showConfirmDialog, showNotification } from './utils.js';
export { disposeImportBenchmarksEntry, isImportBenchmarksEntryCurrent } from './import-benchmark-component.js';

const read = () => getImportBenchmarkSnapshots() as SettingsBenchmarkReader[];
const run = createBenchmarkRun({
  run: runBundledImportReferenceBenchmark, notify: showNotification,
  errorMessage: error => getErrorMessage(error, 'Model test failed. Check the provider and try again.'),
  now: () => performance.now(),
});
type Controller = ReturnType<typeof createImportBenchmarksController>;
let current: { overlay: HTMLElement; view: BenchmarkView; controller: Controller } | null = null;

export function closeImportBenchmarksModal(): boolean {
  const owned = current;
  current = null;
  owned?.controller.dispose();
  owned?.view.dispose();
  const overlay = owned?.overlay || document.getElementById('import-benchmarks-overlay');
  if (overlay) removeModalOverlay(overlay);
  return true;
}

export function openImportBenchmarksModal(returnFocus?: HTMLElement): boolean {
  closeImportBenchmarksModal();
  const overlay = document.createElement('div');
  overlay.id = 'import-benchmarks-overlay';
  overlay.className = 'modal-overlay';
  let controller: Controller | null = null;
  const view = mountImportBenchmarks(overlay, buildBenchmarkSnapshot(read(), getImportBenchmarkContext(), { selected: new Set() }), {
    close: closeImportBenchmarksModal,
    run: () => controller?.run(), select: (id, checked) => controller?.select(id, checked),
    latest: () => controller?.latest(), clear: () => controller?.clear(),
    remove: id => controller?.remove(id), review: id => controller?.review(id), closeReview: () => controller?.closeReview(),
  });
  openAppendedModalOverlay(overlay, closeImportBenchmarksModal, { initialFocus: '.modal-close', focusDelay: 30, returnFocus });
  controller = createImportBenchmarksController(view, {
    read, context: getImportBenchmarkContext, fixtureId: IMPORT_REFERENCE_FIXTURE.id,
    run, confirm: showConfirmDialog, remove: deleteImportBenchmarks,
    notify: showNotification, now: () => performance.now(), close: closeImportBenchmarksModal,
  });
  current = { overlay, view, controller };
  overlay.addEventListener('import-benchmarks-refresh', () => controller?.refresh());
  void loadSettingsStylesheet().catch(() => {
    if (current?.overlay === overlay && view.isCurrent()) showNotification('Model-test styles could not load. Reopen the dialog to retry.', 'error');
  });
  return true;
}

export function prepareImportBenchmarksEntrySection(onOpen: (button: HTMLButtonElement) => unknown = openImportBenchmarksModal): number {
  const stored = read().filter(snap => !snap.benchmarkLocked);
  const modelCount = new Set(stored.map(importBenchmarkModelIdentity).filter(Boolean)).size;
  const label = `Built-in 100% answer key · ${stored.length} saved test${stored.length === 1 ? '' : 's'}${stored.length ? ` across ${modelCount} model setup${modelCount === 1 ? '' : 's'}` : ''} · compare accuracy and speed on this device`;
  return prepareImportBenchmarkEntryHost(label, onOpen);
}

export function renderImportBenchmarksEntrySection(onOpen: (button: HTMLButtonElement) => unknown = openImportBenchmarksModal): string {
  return `<div data-import-benchmark-entry-host="${prepareImportBenchmarksEntrySection(onOpen)}"></div>`;
}
