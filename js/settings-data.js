// @ts-check
// settings-data.js - Settings data-entry management and AI usage helpers.

import { state } from './state.js';
import { escapeHTML, escapeAttr, showNotification, showConfirmDialog, isDebugMode, setPIIReviewEnabled } from './utils.js';
import { formatCost, getProfileUsage, getGlobalUsage, resetProfileUsage } from './schema.js';
import { loadPdfImport } from './import-loader.js';
import { isSnapshotDerivedHOMAIR } from './lab-entry.js';
import { openAppendedModalOverlay, removeModalOverlay } from './modal-lifecycle.js';
import { getImportBenchmarks } from './import-benchmarks.js';

export function renderDataEntriesSection() {
  const snapshots = state.importedData?.importSnapshots || [];
  const rawEntries = state.importedData?.entries || [];
  const entries = [];
  for (const entry of rawEntries) {
    if (Object.keys(entry?.markers || {}).length > 0) entries.push(entry);
  }
  const hasSnapshots = snapshots.length > 0;
  const hasEntries = entries.length > 0;
  if (!hasSnapshots && !hasEntries) {
    return '<div style="color:var(--text-muted);font-size:13px;padding:8px 0">No data yet. Drop a PDF or JSON file on the dashboard, or add values manually.</div>';
  }

  let html = '';

  if (hasSnapshots) {
    const sortedSnapshots = [...snapshots].sort((a, b) => (b.importedAt || 0) - (a.importedAt || 0));
    html += '<div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;margin:8px 0 4px">Imports</div>';
    for (const snap of sortedSnapshots) {
      const d = new Date((snap.date || '') + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      const cnt = snap.markerCount || (snap.markers || []).length;
      const fileName = snap.fileName || 'Unknown file';
      const typeLabel = snap.type || 'import';
      const modelLabel = snap.costInfo?.modelId ? `${snap.costInfo.modelId}` : '';
      const importedLabel = Number.isFinite(snap.importedAt)
        ? new Date(snap.importedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
        : '';
      const snapId = snap.id;
      html += `<div class="imported-entry imported-entry-snapshot">
        <div class="ie-info">
          <div class="ie-mainline">
            <span class="ie-date">${d}</span>
            <span class="ie-count">${cnt} marker${cnt === 1 ? '' : 's'}</span>
          </div>
          <div class="ie-meta">
            <span class="ie-file" title="${escapeAttr(fileName)}">${escapeHTML(fileName)}</span>
            ${modelLabel ? `<span class="ie-model" title="${escapeAttr(modelLabel)}">${escapeHTML(modelLabel)}</span>` : ''}
            <span class="ie-type">${escapeHTML(typeLabel)}</span>
            ${importedLabel ? `<span class="ie-type" title="Imported time">${escapeHTML(importedLabel)}</span>` : ''}
          </div>
        </div>
        <div class="ie-actions">
          <button class="ie-edit" data-settings-action="review-import" data-snap-id="${escapeAttr(snapId)}" title="Review, edit values/units, and re-import without AI cost">Review & Edit</button>
          <button class="ie-remove" data-settings-action="remove-import-snapshot" data-snap-id="${escapeAttr(snapId)}">Delete</button>
        </div>
      </div>`;
    }
  }

  const manualValues = state.importedData.manualValues || {};
  const legacyEntries = [];
  for (const entry of entries) {
    const entryMarkerKeys = Object.keys(entry.markers || {});
    const manualKeys = entryMarkerKeys.filter(k => manualValues[k + ':' + entry.date]);
    const manualNonSnapshotKeys = manualKeys.filter(k => {
      if (isSnapshotDerivedHOMAIR(entry, k)) return false;
      return !entry.markerSources?.[k]?.snapshotId;
    });
    const legacyKeys = entryMarkerKeys.filter(k => {
      if (isSnapshotDerivedHOMAIR(entry, k)) return false;
      const src = entry.markerSources?.[k];
      return !src || !src.snapshotId;
    });
    const otherKeys = legacyKeys.length ? legacyKeys : manualNonSnapshotKeys;
    const hasSnapshotMarkers = entryMarkerKeys.some(k => !!entry.markerSources?.[k]?.snapshotId);
    if (otherKeys.length > 0) legacyEntries.push({ entry, otherKeys, manualKeys, hasSnapshotMarkers });
  }

  if (legacyEntries.length > 0) {
    const sortedLegacy = [...legacyEntries].sort((a, b) => a.entry.date.localeCompare(b.entry.date));
    html += '<div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;margin:16px 0 4px">Manual / legacy markers</div>';
    for (const legacy of sortedLegacy) {
      const { entry, otherKeys, manualKeys, hasSnapshotMarkers } = legacy;
      const d = new Date(entry.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      const cnt = otherKeys.length;
      const isManual = cnt > 0 && cnt === manualKeys.length;
      const sourceLabel = isManual
        ? '<span style="color:var(--accent);margin-left:8px;font-size:11px">manual markers not tied to an import file</span>'
        : `<span style="color:var(--text-muted);margin-left:8px;font-size:11px">legacy markers not tied to an import file${entry.sourceFile ? ` · ${escapeHTML(entry.sourceFile)}` : ''}</span>`;
      const dateAttr = escapeAttr(entry.date);
      const editDateControl = hasSnapshotMarkers
        ? '<span class="ie-count" title="Date is locked because this date also has AI-imported snapshots">Date locked</span>'
        : `<button class="ie-edit" data-settings-action="rename-imported-entry" data-entry-date="${dateAttr}">Edit date</button>`;
      html += `<div class="imported-entry">
        <div class="ie-info"><div class="ie-mainline"><span class="ie-date">${d}</span><span class="ie-count">${cnt} marker${cnt === 1 ? '' : 's'}</span></div><div class="ie-meta">${sourceLabel}</div></div>
        <div class="ie-actions">
          ${editDateControl}
          <button class="ie-remove" data-settings-action="remove-imported-entry" data-entry-date="${dateAttr}">Remove</button>
        </div>
      </div>`;
    }
  }

  html += `<div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">
    <button class="import-btn import-btn-primary" data-settings-action="share-profile">Share Profile</button>
    <button class="import-btn import-btn-secondary" data-settings-action="export-client">Export Client</button>
    <button class="import-btn import-btn-secondary" data-settings-action="export-all-clients" title="Full backup \u2014 all profiles, data, and chat history">Export All Clients</button>
    <button class="import-btn import-btn-secondary" style="color:var(--red);border-color:var(--red)" data-settings-action="clear-all-data">Clear All Data</button></div>`;
  return html;
}

export function refreshDataEntriesSection() {
  const el = document.getElementById('data-entries-section');
  if (el) el.innerHTML = renderDataEntriesSection();
}

export async function removeImportedEntryFromSettings(date) {
  try {
    const { removeImportedEntry } = await loadPdfImport();
    const ok = await removeImportedEntry(date);
    if (ok) refreshDataEntriesSection();
  } catch (err) {
    if (isDebugMode()) console.error('Remove imported entry failed:', err);
    showNotification('Could not remove imported data. Reload and try again.', 'error');
  }
}

export async function renameImportedEntryDateFromSettings(date) {
  try {
    const { renameImportedEntryDate } = await loadPdfImport();
    const ok = await renameImportedEntryDate(date);
    if (ok) refreshDataEntriesSection();
  } catch (err) {
    if (isDebugMode()) console.error('Rename imported entry failed:', err);
    showNotification('Could not edit the import date. Reload and try again.', 'error');
  }
}

function formatTokens(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'k';
  return String(n);
}

function getImportBenchmarkSnapshots() {
  const attempts = getImportBenchmarks();
  const snapshots = state.importedData?.importSnapshots || [];
  const legacy = snapshots.filter(snap => snap?.timings && snap?.costInfo?.modelId && !attempts.some(item => item.id === snap.benchmarkId));
  return [...attempts, ...legacy].sort((a, b) => (b.benchmarkAt || b.importedAt || 0) - (a.benchmarkAt || a.importedAt || 0));
}

function formatBenchmarkDuration(ms) {
  const value = Math.max(0, Number(ms) || 0);
  if (value < 1000) return `${Math.round(value)} ms`;
  if (value < 60_000) return `${(value / 1000).toFixed(value < 10_000 ? 1 : 0)} s`;
  const minutes = Math.floor(value / 60_000);
  const seconds = Math.round((value % 60_000) / 1000);
  return `${minutes}m ${seconds}s`;
}

function formatOptionalBenchmarkDuration(ms) {
  return Number(ms) > 0 ? formatBenchmarkDuration(ms) : '\u2014';
}

function benchmarkFallbackLabel(diagnostics) {
  const fallbacks = [];
  if (diagnostics?.structuredOutputFallback) fallbacks.push('schema retry');
  if (diagnostics?.streamFallback) fallbacks.push('stream retry');
  if (diagnostics?.reasoningControlFallback) fallbacks.push('reasoning retry');
  if (diagnostics?.nativeContextOverride) fallbacks.push('context override');
  return fallbacks.length ? fallbacks.join(' + ') : 'direct';
}

function renderImportBenchmarkCards(snapshots) {
  if (snapshots.length === 0) {
    return `<div class="import-benchmarks-empty">
      No benchmark runs yet. Confirm a new AI import to record its model, timing, token, and result metrics here.
    </div>`;
  }

  return snapshots.map(snap => {
    const analysisMs = Number.isFinite(Number(snap.timings?.analysisMs))
      ? Number(snap.timings.analysisMs)
      : (Number(snap.timings?.analysis) || 0) * 1000;
    const piiMs = Number.isFinite(Number(snap.timings?.piiMs))
      ? Number(snap.timings.piiMs)
      : (Number(snap.timings?.pii) || 0) * 1000;
    const inputTokens = Number(snap.usage?.inputTokens ?? snap.costInfo?.inputTokens) || 0;
    const outputTokens = Number(snap.usage?.outputTokens ?? snap.costInfo?.outputTokens) || 0;
    const reasoningTokens = Number(snap.usage?.reasoningTokens) || 0;
    const measuredThroughput = Number(snap.generationTokensPerSecond) || 0;
    const endToEndRate = analysisMs > 0 && outputTokens > 0 ? outputTokens / (analysisMs / 1000) : 0;
    const throughput = measuredThroughput > 0 ? `${measuredThroughput.toFixed(1)} tok/s` : endToEndRate > 0 ? `${endToEndRate.toFixed(1)} tok/s e2e` : '\u2014';
    const recordedAt = Number(snap.benchmarkAt || snap.importedAt);
    const recordedLabel = Number.isFinite(recordedAt)
      ? new Date(recordedAt).toLocaleString()
      : 'Unknown time';
    const mode = snap.importMode === 'image' ? 'image' : 'text';
    const fallbackLabel = benchmarkFallbackLabel(snap.diagnostics);
    const modelId = snap.modelId || snap.costInfo?.modelId || 'unknown';
    const provider = snap.provider || snap.costInfo?.provider || 'unknown';
    const status = snap.status || 'confirmed';
    const statusLabel = fallbackLabel === 'direct' ? status : `${status} \u00b7 ${fallbackLabel}`;
    const contextLength = Number(snap.runtime?.contextLength || snap.diagnostics?.contextLength) || 0;
    const quant = snap.runtime?.quantLevel || '';
    const executionLocation = snap.runtime?.executionLocation || '';
    const totalMs = Number(snap.totalMs) || analysisMs + piiMs;
    const resultQuality = snap.correctedMappingCount != null
      ? `${Number(snap.correctedMappingCount)} corrected \u00b7 ${Number(snap.excludedMarkerCount) || 0} excluded`
      : '\u2014';
    return `<article class="import-benchmark-card">
      <div class="import-benchmark-head">
        <div>
          <div class="import-benchmark-file" title="${escapeAttr(snap.fileName || 'Unknown file')}">${escapeHTML(snap.fileName || 'Unknown file')}</div>
          <div class="import-benchmark-date">${escapeHTML(recordedLabel)}</div>
        </div>
        <span class="import-benchmark-status${status !== 'confirmed' || fallbackLabel !== 'direct' ? ' retried' : ''}">${escapeHTML(statusLabel)}</span>
      </div>
      <div class="import-benchmark-grid">
        <div><span>Model</span><strong title="${escapeAttr(modelId)}">${escapeHTML(modelId)}</strong></div>
        <div><span>Provider / mode</span><strong>${escapeHTML(provider)} \u00b7 ${mode}</strong></div>
        <div><span>Total attempt</span><strong>${formatBenchmarkDuration(totalMs)}</strong></div>
        <div><span>AI analysis</span><strong>${formatBenchmarkDuration(analysisMs)}</strong></div>
        <div><span>PII preparation</span><strong>${formatBenchmarkDuration(piiMs)}</strong></div>
        <div><span>Tokens</span><strong>${formatTokens(inputTokens)} in \u00b7 ${formatTokens(outputTokens)} out${reasoningTokens ? ` \u00b7 ${formatTokens(reasoningTokens)} reasoning` : ''}</strong></div>
        <div><span>${measuredThroughput > 0 ? 'Generation speed' : 'Output rate'}</span><strong>${throughput}</strong></div>
        <div><span>${status === 'confirmed' ? 'Imported markers' : 'Detected markers'}</span><strong>${Number(snap.importedMarkerCount ?? snap.markerCount) || 0}</strong></div>
        <div><span>Input</span><strong>${Number(snap.inputChars) ? `${formatTokens(Number(snap.inputChars))} chars` : '\u2014'}${Number(snap.pageCount) ? ` \u00b7 ${Number(snap.pageCount)} pages` : ''}</strong></div>
        <div><span>Runtime</span><strong>${contextLength ? `${formatTokens(contextLength)} ctx` : 'ctx unknown'}${quant ? ` \u00b7 ${escapeHTML(quant)}` : ''}${executionLocation ? ` \u00b7 ${escapeHTML(executionLocation)}` : ''}</strong></div>
        <div><span>Review changes</span><strong>${resultQuality}</strong></div>
        <div><span>Load / TTFT</span><strong>${formatOptionalBenchmarkDuration(snap.timings?.modelLoadMs)} / ${formatOptionalBenchmarkDuration(snap.timings?.timeToFirstTokenMs)}</strong></div>
        ${snap.error ? `<div style="grid-column:1/-1"><span>Error</span><strong>${escapeHTML(snap.error)}</strong></div>` : ''}
      </div>
    </article>`;
  }).join('');
}

export function closeImportBenchmarksModal() {
  const overlay = document.getElementById('import-benchmarks-overlay');
  if (overlay) removeModalOverlay(overlay);
}

export function openImportBenchmarksModal() {
  if (!isDebugMode()) return false;
  closeImportBenchmarksModal();
  const snapshots = getImportBenchmarkSnapshots();
  const overlay = document.createElement('div');
  overlay.id = 'import-benchmarks-overlay';
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `<div class="modal import-benchmarks-modal" role="dialog" aria-modal="true" aria-labelledby="import-benchmarks-title">
    <div class="gb-modal-head">
      <div>
        <div class="gb-modal-kicker">Local diagnostics</div>
        <div class="gb-modal-title" id="import-benchmarks-title">Import Benchmarks</div>
      </div>
      <button type="button" class="modal-close" data-import-benchmarks-action="close" aria-label="Close import benchmarks">&times;</button>
    </div>
    <div class="import-benchmarks-body">
      <p class="import-benchmarks-note">Recent attempts include failures and cancellations so model comparisons are not biased toward successes. AI analysis excludes file extraction and review time; PII preparation is measured separately. Diagnostics stay in this profile's local storage and are not sent to analytics.</p>
      <div class="import-benchmarks-list">${renderImportBenchmarkCards(snapshots)}</div>
    </div>
  </div>`;
  overlay.addEventListener('click', event => {
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest('[data-import-benchmarks-action="close"]')) closeImportBenchmarksModal();
  });
  openAppendedModalOverlay(overlay, closeImportBenchmarksModal, { initialFocus: '.modal-close', focusDelay: 30 });
  return true;
}

export function renderAIUsageSection() {
  const pu = getProfileUsage(state.currentProfile);
  const gu = getGlobalUsage();
  const profileName = state.profiles?.[state.currentProfile]?.name || 'Current profile';
  const separator = ' \u00b7 ';
  let html = '<div style="font-size:13px;color:var(--text-secondary);line-height:2">';
  html += `<div><strong>${escapeHTML(profileName)}</strong>: ${formatCost(pu.totalCost)}${separator}${pu.requestCount} request${pu.requestCount !== 1 ? 's' : ''}${separator}${formatTokens(pu.totalInputTokens + pu.totalOutputTokens)} tokens</div>`;
  html += `<div><strong>All profiles</strong>: ${formatCost(gu.totalCost)}${separator}${gu.requestCount} request${gu.requestCount !== 1 ? 's' : ''}${separator}${formatTokens(gu.totalInputTokens + gu.totalOutputTokens)} tokens</div>`;
  html += '</div>';
  if (pu.requestCount > 0) {
    html += `<button class="import-btn import-btn-secondary" style="margin-top:8px;font-size:11px" data-settings-action="reset-profile-usage">Reset profile usage</button>`;
  }
  if (isDebugMode()) {
    const benchmarkCount = getImportBenchmarkSnapshots().length;
    html += `<div class="import-benchmarks-entrypoint">
      <div><strong>Import diagnostics</strong><span>${benchmarkCount} recorded run${benchmarkCount === 1 ? '' : 's'}</span></div>
      <button type="button" class="import-btn import-btn-secondary" data-settings-action="open-import-benchmarks">View benchmarks</button>
    </div>`;
  }
  return html;
}

export function resetCurrentProfileUsage() {
  resetProfileUsage(state.currentProfile);
  const el = document.getElementById('ai-usage-section');
  if (el) el.innerHTML = renderAIUsageSection();
}

// Disable confirmation for the PII review toggle. On->off shows a one-time
// warning so users do not silently lose visibility into what is leaving their
// device. Re-enabling and the initial setup are silent.
export async function confirmDisablePIIReview(checkbox) {
  if (checkbox.checked) {
    setPIIReviewEnabled(true);
    return;
  }
  const acknowledged = localStorage.getItem('labcharts-pii-review-disable-ack') === '1';
  if (acknowledged) {
    setPIIReviewEnabled(false);
    return;
  }
  // Restore the toggle while the dialog is open; commit only on confirm.
  checkbox.checked = true;
  if (await showConfirmDialog(
    "Turn off the obfuscation review?\n\nWith this off, getbased's PII detector runs but you won't see the result before it's sent to the AI provider. Recommended only after you've verified the obfuscation works on your data."
  )) {
    localStorage.setItem('labcharts-pii-review-disable-ack', '1');
    setPIIReviewEnabled(false);
    checkbox.checked = false;
  }
}
