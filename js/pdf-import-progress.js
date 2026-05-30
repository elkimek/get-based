// pdf-import-progress.js — PDF import progress UI and floating status state

import { IMPORT_STEPS } from './constants.js';
import { escapeHTML } from './utils.js';

const STEP_START_PCT = [5, 8, 12, 15, 95];
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

export function updateImportProgressPct(pct) {
  const bar = document.querySelector('.import-progress-bar');
  const fill = document.querySelector('.import-progress-bar-fill');
  const label = document.querySelector('.import-progress-pct');
  if (bar) bar.setAttribute('aria-valuenow', String(pct));
  if (fill) fill.style.width = pct + '%';
  if (label) label.textContent = pct + '%';
  if (importStatus.running) setImportStatus({ pct });
}

function buildProgressHTML(step, fileName) {
  const pct = STEP_START_PCT[step] || 0;
  let html = `<div class="import-progress-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}" aria-label="Import progress"><div class="import-progress-bar-fill" style="width:${pct}%"></div></div>`;
  html += `<div class="import-progress-pct">${pct}%</div>`;
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
      window.navigate('dashboard');
    }
    return;
  }
  setImportStatus({ done: false, failed: false });
}

export function syncImportStatusFab() {
  const fab = document.getElementById('import-status-fab');
  if (!fab) return;
  const { running, done, failed, pct, batch } = importStatus;
  const previewOpen = document.getElementById('import-modal-overlay')?.classList.contains('show');
  const visible = (running || done || failed) && !previewOpen && !progressBarVisible;
  fab.classList.toggle('hidden', !visible);

  const floatingDz = document.querySelector('.drop-zone-hidden');
  if (floatingDz && (visible || previewOpen)) floatingDz.style.display = 'none';
  else if (floatingDz && importStatus.running && progressBarVisible) floatingDz.style.display = '';
  if (!visible) return;

  let label = '';
  if (running) {
    label = batch ? `${batch.current}/${batch.total} \u00b7 ${pct}%` : `${pct}%`;
  } else if (done) {
    label = '\u2713';
  } else if (failed) {
    label = '\u2717';
  }
  fab.querySelector('.import-status-label').textContent = label;
  fab.classList.toggle('is-running', running);
  fab.classList.toggle('is-done', done);
  fab.classList.toggle('is-failed', failed);
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
