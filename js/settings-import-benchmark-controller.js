// @ts-check
// settings-import-benchmark-controller.js - Import benchmark modal lifecycle and actions.

import { getErrorMessage } from './caught-error.js';
import { deleteImportBenchmarks } from './import-benchmarks.js';
import {
  IMPORT_REFERENCE_FIXTURE,
  runBundledImportReferenceBenchmark,
} from './import-reference-benchmark.js';
import { openAppendedModalOverlay, removeModalOverlay } from './modal-lifecycle.js';
import {
  getImportBenchmarkSnapshots,
  importBenchmarkModelIdentity,
  importBenchmarkStorageId,
  importBenchmarksUseSameInput,
  isImportBenchmarkComparable,
  latestCompatibleModelTests,
  referenceDifferenceLabel,
  renderImportBenchmarksBody,
  renderReferenceDiscrepancyDetails,
  updateImportBenchmarkSelection,
} from './settings-data.js';
import { isDebugMode, showConfirmDialog, showNotification } from './utils.js';

const IMPORT_BENCHMARKS_REFRESH_EVENT = 'import-benchmarks-refresh';

/** @typedef {Awaited<ReturnType<typeof runBundledImportReferenceBenchmark>>} ImportReferenceBenchmarkCompletion */
/** @typedef {{ benchmarkId: string, manifestId: string }} ImportBenchmarksRefreshDetail */

/** @param {ImportReferenceBenchmarkCompletion | null} [completed] */
function refreshOpenImportBenchmarksModal(completed = null) {
  const activeOverlay = document.getElementById('import-benchmarks-overlay');
  if (!activeOverlay) return;
  activeOverlay.dispatchEvent(new CustomEvent(IMPORT_BENCHMARKS_REFRESH_EVENT, {
    detail: completed ? {
      benchmarkId: completed.benchmarkId,
      manifestId: completed.manifest.id,
    } : null,
  }));
}

export function closeImportBenchmarksModal() {
  const overlay = document.getElementById('import-benchmarks-overlay');
  if (overlay) removeModalOverlay(overlay);
  return true;
}
export function openImportBenchmarksModal() {
  const existingOverlay = document.getElementById('import-benchmarks-overlay');
  if (existingOverlay && !closeImportBenchmarksModal()) return false;
  let snapshots = getImportBenchmarkSnapshots();
  const selectedIds = new Set();
  const goldStandard = snapshots.find(snap => snap.benchmarkLocked && snap.referenceFixtureId === IMPORT_REFERENCE_FIXTURE.id);
  const latestReferenceRun = snapshots.find(snap => (
    snap.benchmarkKind === 'reference'
    && snap.referenceFixtureId === IMPORT_REFERENCE_FIXTURE.id
    && isImportBenchmarkComparable(snap)
  ));
  if (goldStandard && latestReferenceRun) {
    selectedIds.add(importBenchmarkStorageId(goldStandard));
    selectedIds.add(importBenchmarkStorageId(latestReferenceRun));
  }
  const overlay = document.createElement('div');
  overlay.id = 'import-benchmarks-overlay';
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `<div class="modal import-benchmarks-modal" role="dialog" aria-modal="true" aria-labelledby="import-benchmarks-title">
    <div class="gb-modal-head">
      <div>
        <div class="gb-modal-kicker">Import quality &amp; speed</div>
        <div class="gb-modal-title" id="import-benchmarks-title">Test AI Models</div>
      </div>
      <button type="button" class="modal-close" data-import-benchmarks-action="close" aria-label="Close model tests">&times;</button>
    </div>
    <div class="import-benchmarks-body">
      ${renderImportBenchmarksBody(snapshots)}
    </div>
  </div>`;
  /** @param {ImportBenchmarksRefreshDetail | null} [detail] */
  const refreshOverlay = (detail = null) => {
    snapshots = getImportBenchmarkSnapshots();
    selectedIds.clear();
    if (detail) {
      const gold = snapshots.find(snap => snap.benchmarkLocked && snap.referenceFixtureId === detail.manifestId);
      const completedRun = snapshots.find(snap => snap.id === detail.benchmarkId);
      if (gold) selectedIds.add(importBenchmarkStorageId(gold));
      if (completedRun) selectedIds.add(importBenchmarkStorageId(completedRun));
    }
    const body = overlay.querySelector('.import-benchmarks-body');
    if (body) body.innerHTML = renderImportBenchmarksBody(snapshots);
    updateImportBenchmarkSelection(overlay, snapshots, selectedIds);
  };
  overlay.addEventListener(IMPORT_BENCHMARKS_REFRESH_EVENT, event => {
    refreshOverlay(event instanceof CustomEvent ? event.detail : null);
  });
  updateImportBenchmarkSelection(overlay, snapshots, selectedIds);
  overlay.addEventListener('click', async event => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    if (target.closest('[data-import-benchmarks-action="close"]')) {
      closeImportBenchmarksModal();
      return;
    }
    const closeDifferenceReview = target.closest('[data-import-benchmark-differences-close]');
    if (closeDifferenceReview) {
      const panel = overlay.querySelector('[data-import-benchmark-difference-review]');
      if (panel instanceof HTMLElement) {
        panel.hidden = true;
        panel.innerHTML = '';
      }
      overlay.querySelectorAll('[data-import-benchmark-review]').forEach(button => button.setAttribute('aria-expanded', 'false'));
      return;
    }
    const reviewButton = target.closest('[data-import-benchmark-review]');
    if (reviewButton instanceof HTMLButtonElement) {
      const id = reviewButton.dataset.importBenchmarkReview || '';
      const snap = snapshots.find(item => importBenchmarkStorageId(item) === id);
      const panel = overlay.querySelector('[data-import-benchmark-difference-review]');
      if (snap && panel instanceof HTMLElement) {
        panel.innerHTML = renderReferenceDiscrepancyDetails(snap, { showClose: true });
        panel.hidden = false;
        overlay.querySelectorAll('[data-import-benchmark-review]').forEach(button => {
          button.setAttribute('aria-expanded', button === reviewButton ? 'true' : 'false');
        });
        requestAnimationFrame(() => panel.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
      }
      return;
    }
    const selectedInput = target.closest('[data-import-benchmark-select]');
    if (selectedInput instanceof HTMLInputElement) {
      const id = selectedInput.dataset.importBenchmarkSelect || '';
      if (selectedInput.checked) {
        const baseline = snapshots.find(item => importBenchmarkStorageId(item) === [...selectedIds][0]);
        const candidate = snapshots.find(item => importBenchmarkStorageId(item) === id);
        if (baseline && !importBenchmarksUseSameInput(baseline, candidate)) {
          selectedInput.checked = false;
          showNotification('Choose model tests that used the same report.', 'info');
          return;
        }
        selectedIds.add(id);
      }
      else selectedIds.delete(id);
      updateImportBenchmarkSelection(overlay, snapshots, selectedIds);
      return;
    }
    const actionButton = target.closest('[data-import-benchmarks-action]');
    const action = actionButton?.getAttribute('data-import-benchmarks-action');
    if (action === 'run-reference' && actionButton instanceof HTMLButtonElement) {
      actionButton.disabled = true;
      actionButton.textContent = 'Testing current model\u2026';
      const progress = overlay.querySelector('[data-import-reference-progress]');
      const progressTrack = overlay.querySelector('.import-reference-progress-track');
      const progressFill = overlay.querySelector('[data-import-reference-progress-fill]');
      const progressCopy = overlay.querySelector('[data-import-reference-progress-copy]');
      if (progress instanceof HTMLElement) progress.hidden = false;
      const progressStartedAt = performance.now();
      let progressValue = 1;
      let progressLabel = 'Preparing model test';
      let progressIndeterminate = false;
      const renderProgressCopy = () => {
        const elapsedSeconds = Math.max(0, Math.round((performance.now() - progressStartedAt) / 1000));
        if (progressCopy) {
          progressCopy.textContent = progressIndeterminate
            ? `${progressLabel} \u00b7 working \u00b7 ${elapsedSeconds}s`
            : `${progressLabel} \u00b7 ${progressValue}% \u00b7 ${elapsedSeconds}s`;
        }
      };
      const setProgress = (pct, label) => {
        const value = Math.max(0, Math.min(100, Math.round(Number(pct) || 0)));
        progressValue = value;
        progressLabel = label || 'Testing model';
        progressIndeterminate = /(?:analyzing|model is reading)/i.test(progressLabel) && value < 90;
        if (progressFill instanceof HTMLElement) progressFill.style.width = `${value}%`;
        if (progressTrack instanceof HTMLElement) {
          progressTrack.classList.toggle('indeterminate', progressIndeterminate);
          if (progressIndeterminate) progressTrack.removeAttribute('aria-valuenow');
          else progressTrack.setAttribute('aria-valuenow', String(value));
        }
        renderProgressCopy();
      };
      setProgress(1, 'Preparing model test');
      const progressTimer = setInterval(renderProgressCopy, 1000);
      let completed = null;
      let failure = null;
      try {
        completed = await runBundledImportReferenceBenchmark({
          onProgress: (pct, label) => {
            setProgress(pct, label);
            if (actionButton.isConnected) {
              actionButton.textContent = progressIndeterminate
                ? 'Testing current model\u2026'
                : `Testing current model\u2026 ${Math.round(Number(pct) || 0)}%`;
            }
          },
        });
      } catch (err) {
        failure = err;
        if (isDebugMode()) console.error('Reference import benchmark failed:', err);
      }
      clearInterval(progressTimer);
      refreshOpenImportBenchmarksModal(completed);
      if (completed) {
        const exact = completed.score.referenceExactMarkerCount;
        const expected = completed.score.referenceExpectedMarkerCount;
        showNotification(completed.score.referenceExactMatch
          ? `Model test passed: all ${expected} markers and report fields matched exactly.`
          : `Model test scored ${exact}/${expected} exact markers with ${completed.score.referenceF1Percent}% F1. ${completed.score.referenceDiscrepancyCount || 0} ${referenceDifferenceLabel(completed.score.referenceDiscrepancyCount || 0)} saved for review.`,
        completed.score.referenceExactMatch ? 'success' : 'info');
      } else {
        showNotification(getErrorMessage(failure, 'Model test failed. Check the provider and try again.'), 'error');
      }
      return;
    }
    if (action === 'select-latest') {
      selectedIds.clear();
      latestCompatibleModelTests(snapshots)
        .forEach(snap => selectedIds.add(importBenchmarkStorageId(snap)));
      updateImportBenchmarkSelection(overlay, snapshots, selectedIds);
      return;
    }
    if (action === 'clear-selection') {
      selectedIds.clear();
      updateImportBenchmarkSelection(overlay, snapshots, selectedIds);
      return;
    }
    const singleDeleteButton = target.closest('[data-import-benchmark-delete]');
    const idsToDelete = singleDeleteButton
      ? [singleDeleteButton.getAttribute('data-import-benchmark-delete') || '']
      : action === 'delete-selected'
        ? [...selectedIds].filter(id => !snapshots.find(snap => importBenchmarkStorageId(snap) === id)?.benchmarkLocked)
        : [];
    if (idsToDelete.length === 0) return;
    const run = snapshots.find(snap => importBenchmarkStorageId(snap) === idsToDelete[0]);
    const confirmed = await showConfirmDialog(idsToDelete.length === 1
      ? `Delete this model test for "${run?.fileName || 'Unknown file'}"? Your imported health data will not be changed.`
      : `Delete ${idsToDelete.length} selected model tests? Your imported health data will not be changed.`);
    if (!confirmed) return;
    const deletedCount = await deleteImportBenchmarks(idsToDelete);
    if (deletedCount === 0) return;
    idsToDelete.forEach(id => selectedIds.delete(id));
    snapshots = getImportBenchmarkSnapshots();
    const body = overlay.querySelector('.import-benchmarks-body');
    if (body) body.innerHTML = renderImportBenchmarksBody(snapshots);
    updateImportBenchmarkSelection(overlay, snapshots, selectedIds);
    showNotification(`${deletedCount} model test${deletedCount === 1 ? '' : 's'} deleted.`, 'success');
  });
  openAppendedModalOverlay(overlay, closeImportBenchmarksModal, { initialFocus: '.modal-close', focusDelay: 30 });
  return true;
}


export function renderImportBenchmarksEntrySection() {
  const snapshots = getImportBenchmarkSnapshots();
  const storedRuns = snapshots.filter(snap => !snap.benchmarkLocked);
  const modelCount = new Set(storedRuns.map(importBenchmarkModelIdentity).filter(Boolean)).size;
  return `<div class="import-benchmarks-entrypoint">
    <div>
      <strong>Test models on lab reports</strong>
      <span>Built-in 100% answer key \u00b7 ${storedRuns.length} saved test${storedRuns.length === 1 ? '' : 's'}${storedRuns.length ? ` across ${modelCount} model setup${modelCount === 1 ? '' : 's'}` : ''} \u00b7 compare accuracy and speed on this device</span>
    </div>
    <button type="button" class="import-btn import-btn-primary" data-settings-action="open-import-benchmarks">Open model tests</button>
  </div>`;
}
