// @ts-check
// pdf-import-progress.js — PDF import progress UI and header status state

import { IMPORT_STEPS } from './constants.js';
import { navigateImportReviewRuntime } from './pdf-import-review-runtime.js';
import { escapeHTML } from './utils.js';

const STEP_START_PCT = [5, 8, 12, 15, 95];
/** @type {{ running: boolean, pct: number, failed: boolean, done: boolean, fileName: string, batch: { current: number, total: number } | null }} */
const importStatus = { running: false, pct: 0, failed: false, done: false, fileName: '', batch: null };
let statusDismissTimer = null;
let progressBarVisible = false;
let progressObserver = null;

function setImportStatus(patch) {
  Object.assign(importStatus, patch);
  syncImportStatusFab();
}

export function isImportRunning() {
  return importStatus.running;
}

export function updateImportProgressPct(pct, stageLabel) {
  const bar = document.querySelector('.import-progress-bar');
  const fill = /** @type {HTMLElement | null} */ (document.querySelector('.import-progress-bar-fill'));
  const label = document.querySelector('.import-progress-pct');
  const stage = document.querySelector('.import-progress-stage');
  if (bar) bar.setAttribute('aria-valuenow', String(pct));
  if (fill) fill.style.width = pct + '%';
  if (label) label.textContent = pct + '%';
  if (stage && stageLabel !== undefined) stage.textContent = stageLabel || '';
  if (importStatus.running) setImportStatus({ pct });
}

function buildProgressHTML(step, fileName) {
  const pct = STEP_START_PCT[step] || 0;
  let html = `<div class="import-progress-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}" aria-label="Import progress"><div class="import-progress-bar-fill" style="width:${pct}%"></div></div>`;
  html += `<div class="import-progress-pct">${pct}%</div>`;
  html += '<div class="import-progress-stage"></div>';
  html += '<div class="import-progress">';
  for (let i = 0; i < IMPORT_STEPS.length; i++) {
    const isDone = i < step;
    const isActive = i === step;
    const cls = isDone ? "done" : isActive ? "active" : "";
    const icon = isDone
      ? '<span class="step-icon">\u2713</span>'
      : isActive
        ? '<span class="step-icon"><span class="progress-spinner"></span></span>'
        : '<span class="step-icon">\u25CB</span>';
    html += `<div class="progress-step ${cls}">${icon}<span>${IMPORT_STEPS[i]}${isActive ? "..." : ""}</span></div>`;
  }
  if (fileName) html += `<div class="import-progress-filename">${escapeHTML(fileName)}</div>`;
  html += '</div>';
  return html;
}

function ensureDropZone() {
  let dz = document.getElementById("drop-zone");
  if (dz) return dz;
  dz = document.createElement('div');
  dz.id = 'drop-zone';
  dz.className = 'drop-zone drop-zone-hidden';
  document.body.appendChild(dz);
  return dz;
}

export async function showImportProgress(step, fileName) {
  if (statusDismissTimer) { clearTimeout(statusDismissTimer); statusDismissTimer = null; }
  setImportStatus({ running: true, done: false, failed: false, fileName, pct: STEP_START_PCT[step] || 0, batch: null });
  const dropZone = ensureDropZone();
  dropZone.innerHTML = buildProgressHTML(step, fileName);
  observeProgressBar();
  await new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)));
}

function observeProgressBar() {
  if (progressObserver) progressObserver.disconnect();
  const bar = document.querySelector('.import-progress-bar');
  if (!bar) { progressBarVisible = false; syncImportStatusFab(); return; }
  if (bar.closest('.drop-zone-hidden')) { progressBarVisible = false; syncImportStatusFab(); return; }
  progressObserver = new IntersectionObserver(([entry]) => {
    progressBarVisible = entry.isIntersecting;
    syncImportStatusFab();
  }, { threshold: 0.1 });
  progressObserver.observe(bar);
}

export function hideImportProgress(reason = 'success') {
  if (progressObserver) { progressObserver.disconnect(); progressObserver = null; }
  progressBarVisible = false;

  if (reason === 'error') {
    setImportStatus({ running: false, done: false, failed: true });
    statusDismissTimer = setTimeout(() => { setImportStatus({ failed: false }); statusDismissTimer = null; }, 5000);
  } else if (reason === 'cancel') {
    setImportStatus({ running: false, done: false, failed: false });
  } else {
    setImportStatus({ running: false, done: true, failed: false });
    statusDismissTimer = setTimeout(() => { setImportStatus({ done: false }); statusDismissTimer = null; }, 5000);
  }

  const dropZone = document.getElementById("drop-zone");
  if (!dropZone) return;
  if (dropZone.parentElement === document.body) { dropZone.remove(); return; }
  if (dropZone.classList.contains('drop-zone-hidden')) {
    dropZone.innerHTML = '';
  } else {
    dropZone.innerHTML = `<div class="drop-zone-icon">\uD83D\uDCC4</div>
      <div class="drop-zone-text">Drop PDF, image, JSON, or DNA raw data file here, or click to browse</div>
      <div class="drop-zone-hint">AI-powered \u2014 works with any lab report (PDF, photo, screenshot) or getbased JSON export</div>`;
  }
}

export function handleImportStatusClick() {
  const overlay = document.getElementById('import-modal-overlay');
  if (overlay && overlay.classList.contains('show')) {
    overlay.scrollIntoView({ behavior: 'smooth' });
    return;
  }
  if (importStatus.running) {
    const progressBar = document.querySelector('.import-progress-bar');
    if (progressBar) {
      progressBar.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else {
      navigateImportReviewRuntime('dashboard');
    }
    return;
  }
  setImportStatus({ done: false, failed: false });
}

function getImportButton() {
  return /** @type {HTMLButtonElement | null} */ (document.querySelector('.header-import-btn'));
}

function ensureImportButtonDefaults(button) {
  if (!button.dataset.importDefaultTitle) button.dataset.importDefaultTitle = button.getAttribute('title') || 'Import';
  if (!button.dataset.importDefaultLabel) button.dataset.importDefaultLabel = button.getAttribute('aria-label') || 'Import lab results';
}

function ensureImportButtonLabel(button) {
  let label = button.querySelector('.import-button-status-label');
  if (!label) {
    label = document.createElement('span');
    label.className = 'import-button-status-label';
    label.setAttribute('aria-hidden', 'true');
    button.append(label);
  }
  return label;
}

function syncImportButtonStatus() {
  const button = getImportButton();
  if (!button) return;
  ensureImportButtonDefaults(button);

  const { running, done, failed, pct, batch } = importStatus;
  const labelEl = ensureImportButtonLabel(button);
  const active = running || done || failed;
  let visibleLabel = '';
  let ariaLabel = button.dataset.importDefaultLabel || 'Import lab results';
  let title = button.dataset.importDefaultTitle || 'Import';

  if (running) {
    visibleLabel = batch ? `${batch.current}/${batch.total} \u00b7 ${pct}%` : `${pct}%`;
    ariaLabel = batch
      ? `Import in progress: file ${batch.current} of ${batch.total}, ${pct}%`
      : `Import in progress: ${pct}%`;
    title = ariaLabel;
  } else if (done) {
    visibleLabel = '\u2713';
    ariaLabel = 'Import complete';
    title = ariaLabel;
  } else if (failed) {
    visibleLabel = '\u2717';
    ariaLabel = 'Import failed';
    title = ariaLabel;
  }

  labelEl.textContent = visibleLabel;
  button.classList.toggle('is-import-active', active);
  button.classList.toggle('is-import-running', running);
  button.classList.toggle('is-import-done', done);
  button.classList.toggle('is-import-failed', failed);
  button.setAttribute('aria-label', ariaLabel);
  button.setAttribute('title', title);
}

export function syncImportStatusFab() {
  syncImportButtonStatus();
  const { running, done, failed } = importStatus;
  const previewOpen = document.getElementById('import-modal-overlay')?.classList.contains('show');
  const statusActive = running || done || failed;

  const floatingDz = /** @type {HTMLElement | null} */ (document.querySelector('.drop-zone-hidden'));
  if (floatingDz && (statusActive || previewOpen)) floatingDz.style.display = 'none';
  else if (floatingDz && running && progressBarVisible) floatingDz.style.display = '';
}

export async function showBatchImportProgress(step, fileName, current, total) {
  if (statusDismissTimer) { clearTimeout(statusDismissTimer); statusDismissTimer = null; }
  setImportStatus({ running: true, done: false, failed: false, fileName, pct: STEP_START_PCT[step] || 0, batch: { current, total } });
  const dropZone = ensureDropZone();
  let html = `<div class="batch-progress-counter">Processing file ${current} of ${total}</div>`;
  html += buildProgressHTML(step, fileName);
  dropZone.innerHTML = html;
  observeProgressBar();
  await new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)));
}
