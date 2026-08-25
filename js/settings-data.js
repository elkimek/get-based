// @ts-check
// settings-data.js - Settings data-entry management and AI usage helpers.

import { state } from './state.js';
import { escapeHTML, escapeAttr, showNotification, showConfirmDialog, isDebugMode, setPIIReviewEnabled } from './utils.js';
import { formatCost, getProfileUsage, getGlobalUsage, resetProfileUsage } from './schema.js';
import { getActiveModelId, getAIProvider } from './api.js';
import { loadPdfImport } from './import-loader.js';
import { isSnapshotDerivedHOMAIR } from './lab-entry.js';
import {
  getImportBenchmarkProviderLabel,
  getDeletedImportBenchmarkIds,
  getImportBenchmarks,
  recoverConfirmedImportBenchmarks,
} from './import-benchmarks.js';
import {
  getBundledImportReferenceGoldBenchmark,
  IMPORT_REFERENCE_FIXTURE,
  isBundledImportReferenceBenchmarkRunning,
} from './import-reference-benchmark.js';

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
    <button class="import-btn import-btn-secondary" data-settings-action="export-client" title="Portable JSON including locally stored meal records and resized meal photos">Export Client</button>
    <button class="import-btn import-btn-secondary" data-settings-action="export-all-clients" title="Full portable backup — all profiles, meal records and resized photos, data, and chat history">Export All Clients</button>
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

export function getImportBenchmarkSnapshots() {
  const deletedIds = new Set(getDeletedImportBenchmarkIds());
  const snapshots = state.importedData?.importSnapshots || [];
  recoverConfirmedImportBenchmarks(snapshots);
  const attempts = getImportBenchmarks();
  const legacy = snapshots.filter(snap => {
    if (!snap?.timings || !snap?.costInfo?.modelId) return false;
    if (attempts.some(item => item.id === snap.benchmarkId)) return false;
    return !deletedIds.has(importBenchmarkStorageId(snap))
      && !deletedIds.has(String(snap.benchmarkId || ''));
  });
  const stored = [...attempts, ...legacy]
    .filter(snap => !deletedIds.has(importBenchmarkStorageId(snap)))
    .sort((a, b) => (b.benchmarkAt || b.importedAt || 0) - (a.benchmarkAt || a.importedAt || 0));
  return [getBundledImportReferenceGoldBenchmark(), ...stored];
}
export function importBenchmarkStorageId(snap) {
  return String(snap?.id || snap?.benchmarkId || `legacy_${snap?.benchmarkAt || snap?.importedAt || 0}_${snap?.fileName || 'unknown'}`);
}

export function isImportBenchmarkComparable(snap) {
  if (!snap?.status) return true;
  return ['confirmed', 'reference-scored', 'reference-passed'].includes(snap.status);
}

function isReferenceBenchmark(snap) {
  return snap?.benchmarkKind === 'reference' || snap?.benchmarkKind === 'reference-gold';
}

function importBenchmarkInputIdentity(snap) {
  if (isReferenceBenchmark(snap) && snap?.referenceFixtureId) {
    const version = snap.referenceFixtureVersion
      || (snap.referenceFixtureId === IMPORT_REFERENCE_FIXTURE.id ? IMPORT_REFERENCE_FIXTURE.version : 1);
    return `reference:${snap.referenceFixtureId}@${version}#protocol-${Number(snap.referenceProtocolVersion) || 1}`;
  }
  const hash = String(snap?.inputHash || snap?.importHash || '');
  return hash ? `report:${hash}` : '';
}

export function importBenchmarksUseSameInput(first, second) {
  const firstIdentity = importBenchmarkInputIdentity(first);
  return !!firstIdentity && firstIdentity === importBenchmarkInputIdentity(second);
}
export function latestCompatibleModelTests(snapshots) {
  const modelRuns = snapshots.filter(snap => isImportBenchmarkComparable(snap) && !snap.benchmarkLocked);
  for (let index = 0; index < modelRuns.length; index++) {
    const match = modelRuns.slice(index + 1).find(candidate => importBenchmarksUseSameInput(modelRuns[index], candidate));
    if (match) return [modelRuns[index], match];
  }
  return [];
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

function formatBenchmarkPercent(value) {
  return `${Number(value).toFixed(1)}%`;
}
function benchmarkFallbackLabel(diagnostics) {
  const fallbacks = [];
  if (diagnostics?.structuredOutputFallback) fallbacks.push('schema retry');
  if (diagnostics?.streamFallback) fallbacks.push('stream retry');
  if (diagnostics?.reasoningControlFallback) fallbacks.push('reasoning retry');
  return fallbacks.length ? fallbacks.join(' + ') : 'direct';
}
function referenceDiscrepancyState(snap) {
  const captured = Number(snap?.referenceDiscrepanciesVersion) > 0
    && Array.isArray(snap?.referenceDiscrepancies);
  const groups = captured
    ? snap.referenceDiscrepancies
      .filter(item => item && Array.isArray(item.issues) && item.issues.length > 0)
      .slice(0, 100)
    : [];
  const dataGroups = groups.filter(item => item.scope === 'lab-data');
  const reportGroups = groups.filter(item => item.scope === 'report-details');
  const dataCount = dataGroups.reduce((count, item) => count + item.issues.length, 0);
  const reportCount = reportGroups.reduce((count, item) => count + item.issues.length, 0);
  return {
    captured,
    groups,
    issueCount: dataCount + reportCount,
    dataCount,
    reportCount,
    affectedMarkerCount: dataGroups.length,
    truncated: !!snap?.referenceDiscrepanciesTruncated,
    unavailable: isReferenceBenchmark(snap)
      && !snap?.benchmarkLocked
      && snap?.referenceExactMatch !== true
      && !captured,
  };
}

export function referenceDifferenceLabel(count) {
  return `${count} difference${count === 1 ? '' : 's'}`;
}

export function renderReferenceDiscrepancyDetails(snap, { showClose = false } = {}) {
  const state = referenceDiscrepancyState(snap);
  const modelId = snap?.modelId || snap?.costInfo?.modelId || 'this model';
  if (state.unavailable) {
    return `<div class="import-benchmark-difference-unavailable">
      <strong>Detailed differences were not saved for this older test.</strong>
      <span>Run ${escapeHTML(modelId)} again to capture the exact markers and fields that differ.</span>
    </div>`;
  }
  if (!state.captured || state.issueCount === 0) return '';
  const summaryParts = [];
  if (state.dataCount > 0) summaryParts.push(`${state.dataCount} lab-data difference${state.dataCount === 1 ? '' : 's'} across ${state.affectedMarkerCount} result${state.affectedMarkerCount === 1 ? '' : 's'}`);
  if (state.reportCount > 0) summaryParts.push(`${state.reportCount} report-detail difference${state.reportCount === 1 ? '' : 's'}`);
  const rows = state.groups.map(group => {
    const reportDetail = group.scope === 'report-details';
    const issues = group.issues.slice(0, 8).map(issue => `<div class="import-benchmark-difference-issue">
      <span>${escapeHTML(issue?.label || 'Difference')}</span>
      <div class="import-benchmark-difference-values">
        <div><small>Expected</small><strong>${escapeHTML(issue?.expected ?? '\u2014')}</strong></div>
        <div><small>Model returned</small><strong>${escapeHTML(issue?.actual ?? '\u2014')}</strong></div>
      </div>
      ${issue?.note ? `<p>${escapeHTML(issue.note)}</p>` : ''}
    </div>`).join('');
    return `<article class="import-benchmark-difference-item ${reportDetail ? 'report-detail' : 'lab-data'}">
      <div class="import-benchmark-difference-item-head">
        <div><strong>${escapeHTML(group.markerName || 'Lab result')}</strong><small>${escapeHTML(group.section || '')}</small></div>
        <span>${reportDetail ? 'Report detail' : 'Lab data'}</span>
      </div>
      ${issues}
    </article>`;
  }).join('');
  return `<div class="import-benchmark-difference-details">
    <div class="import-benchmark-difference-details-head">
      <div><strong>What ${escapeHTML(modelId)} got differently</strong><span>${escapeHTML(summaryParts.join(' \u00b7 '))}</span></div>
      ${showClose ? '<button type="button" data-import-benchmark-differences-close aria-label="Close difference review">Close</button>' : ''}
    </div>
    <p class="import-benchmark-difference-note">Expected values come from the verified sample-report answer key. “Model returned” shows the raw model answer before getbased applies automatic marker corrections. This benchmark is not a clinical safety certification.</p>
    <div class="import-benchmark-difference-list">${rows}</div>
    ${state.truncated ? '<p class="import-benchmark-difference-truncated">The model returned more differences than this view can safely display.</p>' : ''}
  </div>`;
}

function renderReferenceComparisonReviewControl(snap, id) {
  if (!isReferenceBenchmark(snap) || snap?.benchmarkLocked) return '';
  const state = referenceDiscrepancyState(snap);
  if (state.issueCount > 0) {
    return `<button type="button" class="import-benchmark-header-review" data-import-benchmark-review="${escapeAttr(id)}" aria-expanded="false">Review ${referenceDifferenceLabel(state.issueCount)}</button>`;
  }
  if (state.unavailable) return '<span class="import-benchmark-header-review-unavailable">Rerun to inspect differences</span>';
  return '';
}

function importBenchmarkView(snap) {
  const isGoldStandard = !!snap.benchmarkLocked;
  const measuredAnalysisMs = Number.isFinite(Number(snap.timings?.analysisMs))
    ? Number(snap.timings.analysisMs)
    : (Number(snap.timings?.analysis) || 0) * 1000;
  const piiMs = Number.isFinite(Number(snap.timings?.piiMs))
    ? Number(snap.timings.piiMs)
    : (Number(snap.timings?.pii) || 0) * 1000;
  const inputTokens = Number(snap.usage?.inputTokens ?? snap.costInfo?.inputTokens) || 0;
  const outputTokens = Number(snap.usage?.outputTokens ?? snap.costInfo?.outputTokens) || 0;
  const measuredThroughput = Number(snap.generationTokensPerSecond) || 0;
  const endToEndRate = measuredAnalysisMs > 0 && outputTokens > 0 ? outputTokens / (measuredAnalysisMs / 1000) : 0;
  const throughput = measuredThroughput || endToEndRate;
  const detectedMarkerCount = Number(snap.markerCount) || 0;
  const importedMarkerCount = snap.importedMarkerCount == null
    ? ((snap.status || 'confirmed') === 'confirmed' ? detectedMarkerCount : null)
    : Math.max(0, Number(snap.importedMarkerCount) || 0);
  const correctedMappingCount = snap.correctedMappingCount == null ? null : Math.max(0, Number(snap.correctedMappingCount) || 0);
  const correctedValueCount = snap.correctedValueCount == null ? null : Math.max(0, Number(snap.correctedValueCount) || 0);
  const correctedUnitCount = snap.correctedUnitCount == null ? null : Math.max(0, Number(snap.correctedUnitCount) || 0);
  const correctedMarkerCount = snap.correctedMarkerCount == null
    ? correctedMappingCount
    : Math.max(0, Number(snap.correctedMarkerCount) || 0);
  const excludedMarkerCount = snap.excludedMarkerCount == null
    ? (Array.isArray(snap.excludedIndices) ? snap.excludedIndices.length : null)
    : Math.max(0, Number(snap.excludedMarkerCount) || 0);
  const inferredUnmappedCount = importedMarkerCount != null && excludedMarkerCount != null
    ? Math.max(0, detectedMarkerCount - importedMarkerCount - excludedMarkerCount)
    : null;
  const unmappedMarkerCount = snap.unmappedMarkerCount == null
    ? inferredUnmappedCount
    : Math.max(0, Number(snap.unmappedMarkerCount) || 0);
  const cleanImportedMarkerCount = snap.cleanImportedMarkerCount == null
    ? (importedMarkerCount != null && correctedMarkerCount != null
      ? Math.max(0, importedMarkerCount - correctedMarkerCount)
      : null)
    : Math.max(0, Number(snap.cleanImportedMarkerCount) || 0);
  const acceptedRate = detectedMarkerCount > 0 && importedMarkerCount != null
    ? (importedMarkerCount / detectedMarkerCount) * 100
    : null;
  const cleanImportRate = detectedMarkerCount > 0 && cleanImportedMarkerCount != null
    ? (cleanImportedMarkerCount / detectedMarkerCount) * 100
    : null;
  const reviewIssueMarkerCount = correctedMarkerCount != null && excludedMarkerCount != null && unmappedMarkerCount != null
    ? correctedMarkerCount + excludedMarkerCount + unmappedMarkerCount
    : null;
  const reviewIssueRate = detectedMarkerCount > 0 && reviewIssueMarkerCount != null
    ? (reviewIssueMarkerCount / detectedMarkerCount) * 100
    : null;
  return {
    id: importBenchmarkStorageId(snap),
    snap,
    analysisMs: isGoldStandard ? null : measuredAnalysisMs,
    piiMs,
    totalMs: isGoldStandard ? null : Number(snap.totalMs) || measuredAnalysisMs + piiMs,
    pdfExtractionMs: isGoldStandard ? null : Number(snap.timings?.pdfExtractionMs) || 0,
    modelLoadMs: Number(snap.timings?.modelLoadMs) || 0,
    timeToFirstTokenMs: Number(snap.timings?.timeToFirstTokenMs) || 0,
    inputTokens,
    outputTokens,
    reasoningTokens: Number(snap.usage?.reasoningTokens) || 0,
    throughput,
    measuredThroughput,
    detectedMarkerCount,
    importedMarkerCount,
    cleanImportedMarkerCount,
    acceptedRate,
    cleanImportRate,
    reviewIssueRate,
    correctedMarkerCount,
    correctedMappingCount,
    correctedValueCount,
    correctedUnitCount,
    excludedMarkerCount,
    unmappedMarkerCount,
    dateCorrectionCount: snap.dateCorrectionCount == null ? null : Math.max(0, Number(snap.dateCorrectionCount) || 0),
    referenceExpectedMarkerCount: snap.referenceExpectedMarkerCount == null ? null : Math.max(0, Number(snap.referenceExpectedMarkerCount) || 0),
    referenceExactMarkerCount: snap.referenceExactMarkerCount == null ? null : Math.max(0, Number(snap.referenceExactMarkerCount) || 0),
    referenceExactMarkerPercent: snap.referenceExactMarkerPercent == null ? null : Math.max(0, Number(snap.referenceExactMarkerPercent) || 0),
    referenceFieldAccuracyPercent: snap.referenceFieldAccuracyPercent == null ? null : Math.max(0, Number(snap.referenceFieldAccuracyPercent) || 0),
    referencePipelineExactMarkerCount: snap.referencePipelineExactMarkerCount == null ? null : Math.max(0, Number(snap.referencePipelineExactMarkerCount) || 0),
    referencePipelineExactMarkerPercent: snap.referencePipelineExactMarkerPercent == null ? null : Math.max(0, Number(snap.referencePipelineExactMarkerPercent) || 0),
    referencePipelineFieldAccuracyPercent: snap.referencePipelineFieldAccuracyPercent == null ? null : Math.max(0, Number(snap.referencePipelineFieldAccuracyPercent) || 0),
    referencePrecisionPercent: snap.referencePrecisionPercent == null ? null : Math.max(0, Number(snap.referencePrecisionPercent) || 0),
    referenceRecallPercent: snap.referenceRecallPercent == null ? null : Math.max(0, Number(snap.referenceRecallPercent) || 0),
    referenceF1Percent: snap.referenceF1Percent == null ? null : Math.max(0, Number(snap.referenceF1Percent) || 0),
    referenceMappingAccuracyPercent: snap.referenceMappingAccuracyPercent == null ? null : Math.max(0, Number(snap.referenceMappingAccuracyPercent) || 0),
    referenceValueAccuracyPercent: snap.referenceValueAccuracyPercent == null ? null : Math.max(0, Number(snap.referenceValueAccuracyPercent) || 0),
    referenceUnitAccuracyPercent: snap.referenceUnitAccuracyPercent == null ? null : Math.max(0, Number(snap.referenceUnitAccuracyPercent) || 0),
    referenceRangeAccuracyPercent: snap.referenceRangeAccuracyPercent == null ? null : Math.max(0, Number(snap.referenceRangeAccuracyPercent) || 0),
    referenceDateAccuracyPercent: snap.referenceDateCorrect == null ? null : (snap.referenceDateCorrect ? 100 : 0),
    referenceTestTypeAccuracyPercent: snap.referenceTestTypeCorrect == null ? null : (snap.referenceTestTypeCorrect ? 100 : 0),
  };
}

const IMPORT_BENCHMARK_COMPARISON_METRICS = [
  { group: 'Raw model accuracy', key: 'referenceExactMarkerPercent', label: 'Fully correct results', hint: 'What the model got right before automatic marker corrections', direction: 'higher', optional: true, diffMode: 'points', format: formatBenchmarkPercent },
  { group: 'Raw model accuracy', key: 'referenceFieldAccuracyPercent', label: 'All fields correct', hint: 'Every raw model field checked against the answer key', direction: 'higher', optional: true, diffMode: 'points', format: formatBenchmarkPercent },
  { group: 'Raw model accuracy', key: 'referencePrecisionPercent', label: 'Precision (no extras)', hint: 'How many returned results belong in the answer key', direction: 'higher', optional: true, diffMode: 'points', format: formatBenchmarkPercent },
  { group: 'Raw model accuracy', key: 'referenceRecallPercent', label: 'Recall (nothing missed)', hint: 'How much of the answer key the model found', direction: 'higher', optional: true, diffMode: 'points', format: formatBenchmarkPercent },
  { group: 'Raw model accuracy', key: 'referenceF1Percent', label: 'Balanced accuracy (F1)', hint: 'One score balancing missed and extra results', direction: 'higher', optional: true, diffMode: 'points', format: formatBenchmarkPercent },
  { group: 'Raw model accuracy', key: 'referenceMappingAccuracyPercent', label: 'Marker matching', hint: 'Results the model assigned to the right getbased marker', direction: 'higher', optional: true, diffMode: 'points', format: formatBenchmarkPercent },
  { group: 'Raw model accuracy', key: 'referenceValueAccuracyPercent', label: 'Values', hint: 'Numeric results read correctly', direction: 'higher', optional: true, diffMode: 'points', format: formatBenchmarkPercent },
  { group: 'Raw model accuracy', key: 'referenceUnitAccuracyPercent', label: 'Units', hint: 'Units read exactly as shown', direction: 'higher', optional: true, diffMode: 'points', format: formatBenchmarkPercent },
  { group: 'Raw model accuracy', key: 'referenceRangeAccuracyPercent', label: 'Reference ranges', hint: 'Lower and upper limits read correctly', direction: 'higher', optional: true, diffMode: 'points', format: formatBenchmarkPercent },
  { group: 'Raw model accuracy', key: 'referenceDateAccuracyPercent', label: 'Collection date', hint: 'Sample date read correctly', direction: 'higher', optional: true, diffMode: 'points', format: formatBenchmarkPercent },
  { group: 'After getbased corrections', key: 'referencePipelineExactMarkerPercent', label: 'Fully correct results', hint: 'Final result after deterministic marker reconciliation', direction: 'higher', optional: true, diffMode: 'points', format: formatBenchmarkPercent },
  { group: 'After getbased corrections', key: 'referencePipelineFieldAccuracyPercent', label: 'All fields correct', hint: 'Final import fields after deterministic reconciliation', direction: 'higher', optional: true, diffMode: 'points', format: formatBenchmarkPercent },
  { group: 'Import review', key: 'detectedMarkerCount', label: 'Results found', hint: 'How many numeric lab results the model returned', direction: 'neutral', format: value => String(value) },
  { group: 'Import review', key: 'importedMarkerCount', label: 'Kept after review', hint: 'Results accepted after edits and exclusions', direction: 'neutral', optional: true, format: value => String(value) },
  { group: 'Import review', key: 'acceptedRate', label: 'Kept', hint: 'Share of found results accepted for import', direction: 'higher', optional: true, diffMode: 'points', format: formatBenchmarkPercent },
  { group: 'Import review', key: 'cleanImportRate', label: 'Needed no edits', hint: 'Share imported without changing marker, value, or unit', direction: 'higher', optional: true, diffMode: 'points', format: formatBenchmarkPercent },
  { group: 'Import review', key: 'reviewIssueRate', label: 'Needed attention', hint: 'Share corrected, excluded, or left unmatched', direction: 'lower', optional: true, diffMode: 'points', format: formatBenchmarkPercent },
  { group: 'Import review', key: 'correctedMappingCount', label: 'Marker fixes', hint: 'Results moved to a different marker', direction: 'lower', optional: true, format: value => String(value) },
  { group: 'Import review', key: 'correctedValueCount', label: 'Value fixes', hint: 'Numeric results corrected by the reviewer', direction: 'lower', optional: true, format: value => String(value) },
  { group: 'Import review', key: 'correctedUnitCount', label: 'Unit fixes', hint: 'Units corrected by the reviewer', direction: 'lower', optional: true, format: value => String(value) },
  { group: 'Import review', key: 'excludedMarkerCount', label: 'Excluded results', hint: 'Results rejected during review', direction: 'lower', optional: true, format: value => String(value) },
  { group: 'Import review', key: 'unmappedMarkerCount', label: 'Unmatched results', hint: 'Results that could not be assigned to a marker', direction: 'lower', optional: true, format: value => String(value) },
  { group: 'Speed', key: 'totalMs', label: 'Total time', hint: 'From opening the report to a finished result', direction: 'lower', optional: true, format: formatBenchmarkDuration },
  { group: 'Speed', key: 'analysisMs', label: 'Model time', hint: 'Time spent waiting for the model', direction: 'lower', optional: true, format: formatBenchmarkDuration },
  { group: 'Speed', key: 'throughput', label: 'Generation speed', hint: 'Tokens generated each second', direction: 'higher', optional: true, zeroIsMissing: true, format: value => `${value.toFixed(1)} tok/s` },
  { group: 'Speed', key: 'inputTokens', label: 'Input size', hint: 'Tokens sent to the model', direction: 'neutral', optional: true, zeroIsMissing: true, format: formatTokens },
  { group: 'Speed', key: 'outputTokens', label: 'Output size', hint: 'Tokens returned by the model', direction: 'neutral', optional: true, zeroIsMissing: true, format: formatTokens },
  { group: 'Technical details', key: 'piiMs', label: 'Privacy preparation', hint: 'Time spent preparing private data before the model call', direction: 'lower', optional: true, zeroIsMissing: true, format: formatBenchmarkDuration },
  { group: 'Technical details', key: 'pdfExtractionMs', label: 'Reading the PDF', hint: 'Time spent extracting text before the model call', direction: 'lower', optional: true, zeroIsMissing: true, format: formatBenchmarkDuration },
  { group: 'Technical details', key: 'modelLoadMs', label: 'Loading the model', hint: 'Reported by the local model server when available', direction: 'lower', optional: true, zeroIsMissing: true, format: formatBenchmarkDuration },
  { group: 'Technical details', key: 'timeToFirstTokenMs', label: 'First response', hint: 'Time until the model began answering', direction: 'lower', optional: true, zeroIsMissing: true, format: formatBenchmarkDuration },
];

function benchmarkPercentDiff(value, baseline, mode = 'percent') {
  if (!Number.isFinite(value) || !Number.isFinite(baseline)) return null;
  if (mode === 'points') {
    const rawPoints = value - baseline;
    const normalizedPoints = Math.abs(rawPoints) < 0.05 ? 0 : rawPoints;
    return {
      raw: normalizedPoints,
      label: `${normalizedPoints > 0 ? '+' : ''}${normalizedPoints.toFixed(1)} pp`,
    };
  }
  if (baseline === 0) return null;
  const raw = ((value - baseline) / Math.abs(baseline)) * 100;
  const normalized = Math.abs(raw) < 0.05 ? 0 : raw;
  const decimals = Math.abs(normalized) >= 100 ? 0 : 1;
  return {
    raw: normalized,
    label: `${normalized > 0 ? '+' : ''}${normalized.toFixed(decimals)}%`,
  };
}

function benchmarkDiffClass(diff, direction) {
  if (!diff || diff.raw === 0 || direction === 'neutral') return ' neutral';
  const better = direction === 'lower' ? diff.raw < 0 : diff.raw > 0;
  return better ? ' better' : ' worse';
}

export function importBenchmarkModelIdentity(snap) {
  const modelId = snap?.modelId || snap?.costInfo?.modelId;
  if (!modelId) return '';
  return `${getImportBenchmarkProviderLabel(snap)}\n${modelId}`;
}

function renderImportBenchmarkSummary(snapshots) {
  const modelRuns = snapshots.filter(snap => !snap.benchmarkLocked);
  const modelSetups = new Set(modelRuns.map(importBenchmarkModelIdentity).filter(Boolean));
  const comparable = modelRuns.filter(isImportBenchmarkComparable).length;
  const diagnostics = modelRuns.length - comparable;
  return `<div class="import-benchmarks-summary" aria-label="Saved model tests summary">
    <div><span>Tests saved</span><strong>${modelRuns.length}</strong></div>
    <div><span>Model setups</span><strong>${modelSetups.size}</strong></div>
    <div><span>Successful</span><strong>${comparable}</strong></div>
    <div><span>Didn’t finish</span><strong>${diagnostics}</strong></div>
  </div>`;
}

function renderImportBenchmarkComparison(selectedSnapshots) {
  const runs = selectedSnapshots.map(importBenchmarkView);
  const baseline = runs[0];
  const headerCells = runs.map((run, index) => {
    const modelId = run.snap.modelId || run.snap.costInfo?.modelId || 'unknown model';
    const provider = getImportBenchmarkProviderLabel(run.snap);
    const fileName = run.snap.fileName || 'Unknown file';
    return `<th scope="col" data-benchmark-run-header="${escapeAttr(run.id)}">
      <span class="import-benchmark-run-label">${index === 0 ? 'Baseline' : `Test ${index + 1}`}</span>
      <span class="import-benchmark-run-provider" data-benchmark-provider="${escapeAttr(run.id)}">${escapeHTML(provider)}</span>
      <strong data-benchmark-model="${escapeAttr(run.id)}" title="${escapeAttr(`${provider} · ${modelId}`)}">${escapeHTML(modelId)}</strong>
      <small title="${escapeAttr(fileName)}">${escapeHTML(fileName)}</small>
      ${renderReferenceComparisonReviewControl(run.snap, run.id)}
    </th>`;
  }).join('');
  const visibleMetrics = IMPORT_BENCHMARK_COMPARISON_METRICS.filter(metric => !metric.optional || runs.some(run => {
    const value = run[metric.key];
    return Number.isFinite(value) && !(metric.zeroIsMissing && value === 0);
  }));
  const rows = visibleMetrics.map((metric, metricIndex) => {
    const baselineValue = baseline[metric.key];
    const cells = runs.map((run, index) => {
      const value = run[metric.key];
      const missing = metric.optional && (value == null || (metric.zeroIsMissing && value === 0));
      const diff = index === 0 || missing ? null : benchmarkPercentDiff(value, baselineValue, metric.diffMode);
      const diffLabel = missing ? '\u2014' : (index === 0 ? 'Baseline' : (diff?.label || '\u2014'));
      return `<td data-benchmark-metric="${metric.key}" data-benchmark-run-id="${escapeAttr(run.id)}">
        <strong>${missing ? '\u2014' : metric.format(value)}</strong>
        <span class="import-benchmark-diff${index === 0 ? ' baseline' : benchmarkDiffClass(diff, metric.direction)}">${diffLabel}</span>
      </td>`;
    }).join('');
    const groupRow = metricIndex === 0 || visibleMetrics[metricIndex - 1].group !== metric.group
      ? `<tr class="import-benchmark-metric-group"><th colspan="${runs.length + 1}">${metric.group}</th></tr>`
      : '';
    return `${groupRow}<tr>
      <th scope="row"><strong>${metric.label}</strong><small>${metric.hint}</small></th>
      ${cells}
    </tr>`;
  }).join('');
  const goldBaseline = !!baseline.snap.benchmarkLocked;
  return `<div class="import-benchmark-comparison-head">
      <div><strong>${goldBaseline ? 'Accuracy against the answer key' : 'Compare model tests'}</strong><span>${goldBaseline ? 'The answer key is always 100%. Speed is shown only for models that actually ran.' : 'The first column is the baseline. Each column shows the provider, model, and difference.'}</span></div>
    </div>
    <section class="import-benchmark-difference-review" data-import-benchmark-difference-review hidden></section>
    <div class="import-benchmark-comparison-scroll">
      <table class="import-benchmark-comparison-table">
        <thead><tr><th scope="col">Metric</th>${headerCells}</tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

function renderImportBenchmarkCards(snapshots, { selectable = true, emptyCopy = '' } = {}) {
  if (snapshots.length === 0) {
    return `<div class="import-benchmarks-empty">
      ${emptyCopy || 'No model tests yet.'}
    </div>`;
  }

  return snapshots.map(snap => {
    const view = importBenchmarkView(snap);
    const pdfExtractionMs = Number(view.pdfExtractionMs) || 0;
    const isReference = isReferenceBenchmark(snap);
    const isGoldStandard = !!snap.benchmarkLocked;
    const recordedAt = Number(snap.benchmarkAt || snap.importedAt);
    const recordedLabel = isGoldStandard
      ? 'Built-in verified answer'
      : Number.isFinite(recordedAt)
      ? new Date(recordedAt).toLocaleString()
      : 'Unknown time';
    const mode = isGoldStandard ? 'answer key' : isReference ? 'sample report test' : (snap.importMode === 'image' ? 'image import' : 'text import');
    const fallbackLabel = benchmarkFallbackLabel(snap.diagnostics);
    const modelId = snap.modelId || snap.costInfo?.modelId || 'unknown';
    const provider = getImportBenchmarkProviderLabel(snap);
    const status = snap.status || 'confirmed';
    const statusLabel = isGoldStandard
      ? 'answer key \u00b7 100%'
      : isReference
      ? (snap.referenceExactMatch ? 'test complete \u00b7 100%' : (status === 'failed' ? 'test failed' : 'test complete'))
      : (status === 'confirmed'
        ? `import complete${fallbackLabel === 'direct' ? '' : ' \u00b7 retried'}`
        : (fallbackLabel === 'direct' ? status : `${status} \u00b7 retried`));
    const contextLength = Number(snap.runtime?.contextLength || snap.diagnostics?.contextLength) || 0;
    const quant = snap.runtime?.quantLevel || '';
    const executionLocation = snap.runtime?.executionLocation || '';
    const providerApi = snap.diagnostics?.providerApi === 'native'
      ? 'native API'
      : snap.diagnostics?.providerApi === 'openai-compatible' ? 'compatible API' : '';
    const loadedAtStart = snap.runtime?.loadedAtStart;
    const loadState = loadedAtStart === true ? 'warm start' : loadedAtStart === false ? 'cold start' : '';
    const reviewFindings = view.correctedMarkerCount == null
      ? 'Not available for this test'
      : [
        `${view.correctedMappingCount || 0} mapping`,
        `${view.correctedValueCount || 0} value`,
        `${view.correctedUnitCount || 0} unit`,
        `${view.excludedMarkerCount || 0} excluded`,
        `${view.unmappedMarkerCount || 0} unmapped`,
        ...(view.dateCorrectionCount ? ['date changed'] : []),
      ].join(' \u00b7 ');
    const qualityFields = isReference
      ? `<div><span>Raw model: fully correct</span><strong>${view.referenceExactMarkerCount == null ? '\u2014' : `${view.referenceExactMarkerCount} / ${view.referenceExpectedMarkerCount} \u00b7 ${formatBenchmarkPercent(view.referenceExactMarkerPercent)}`}</strong></div>
        <div><span>Raw model: all fields</span><strong>${view.referenceFieldAccuracyPercent == null ? '\u2014' : formatBenchmarkPercent(view.referenceFieldAccuracyPercent)}</strong></div>
        <div><span>After getbased corrections</span><strong>${view.referencePipelineExactMarkerCount == null ? '\u2014' : `${view.referencePipelineExactMarkerCount} / ${view.referenceExpectedMarkerCount} \u00b7 ${formatBenchmarkPercent(view.referencePipelineExactMarkerPercent)}`}</strong></div>
        <div><span>Precision / recall / F1</span><strong>${view.referencePrecisionPercent == null ? '\u2014' : `${formatBenchmarkPercent(view.referencePrecisionPercent)} / ${formatBenchmarkPercent(view.referenceRecallPercent)} / ${formatBenchmarkPercent(view.referenceF1Percent)}`}</strong></div>
        <div><span>Marker matching / values</span><strong>${view.referenceMappingAccuracyPercent == null ? '\u2014' : `${formatBenchmarkPercent(view.referenceMappingAccuracyPercent)} / ${formatBenchmarkPercent(view.referenceValueAccuracyPercent)}`}</strong></div>
        <div><span>Units / reference ranges</span><strong>${view.referenceUnitAccuracyPercent == null ? '\u2014' : `${formatBenchmarkPercent(view.referenceUnitAccuracyPercent)} / ${formatBenchmarkPercent(view.referenceRangeAccuracyPercent)}`}</strong></div>
        <div><span>Date / report type</span><strong>${view.referenceDateAccuracyPercent == null ? '\u2014' : `${view.referenceDateAccuracyPercent === 100 ? 'correct' : 'wrong'} / ${view.referenceTestTypeAccuracyPercent === 100 ? 'correct' : 'wrong'}`}</strong></div>`
      : `<div><span>Kept after review</span><strong>${view.importedMarkerCount == null ? '\u2014' : `${view.importedMarkerCount} / ${view.detectedMarkerCount}${view.acceptedRate == null ? '' : ` \u00b7 ${formatBenchmarkPercent(view.acceptedRate)}`}`}</strong></div>
        <div><span>Needed no edits</span><strong>${view.cleanImportedMarkerCount == null ? '\u2014' : `${view.cleanImportedMarkerCount} / ${view.detectedMarkerCount}${view.cleanImportRate == null ? '' : ` \u00b7 ${formatBenchmarkPercent(view.cleanImportRate)}`}`}</strong></div>
        <div class="import-benchmark-review-findings"><span>Changes during review</span><strong>${escapeHTML(reviewFindings)}</strong></div>`;
    const selector = selectable
      ? `<label class="import-benchmark-selector" title="Add this test to the comparison">
          <input type="checkbox" data-import-benchmark-select="${escapeAttr(view.id)}" aria-label="Compare ${escapeAttr(snap.fileName || 'model test')}">
          <span>Compare</span>
          <strong class="import-benchmark-selection-order" aria-hidden="true"></strong>
        </label>`
      : '';
    const performanceFields = isGoldStandard
      ? `<div><span>What this is</span><strong>Verified answer key</strong></div>
        <div><span>Speed</span><strong>Not applicable</strong></div>`
      : `<div><span>Total time</span><strong>${formatBenchmarkDuration(view.totalMs)}</strong></div>
        <div><span>Model time</span><strong>${formatBenchmarkDuration(view.analysisMs)}</strong></div>
        <div><span>Tokens</span><strong>${formatTokens(view.inputTokens)} in \u00b7 ${formatTokens(view.outputTokens)} out${view.reasoningTokens ? ` \u00b7 ${formatTokens(view.reasoningTokens)} reasoning` : ''}</strong></div>
        <div><span>${view.measuredThroughput > 0 ? 'Generation speed' : 'Output rate'}</span><strong>${view.throughput > 0 ? `${view.throughput.toFixed(1)} tok/s${view.measuredThroughput > 0 ? '' : ' e2e'}` : '\u2014'}</strong></div>`;
    const discrepancyState = referenceDiscrepancyState(snap);
    const discrepancyDisclosure = isReference && !isGoldStandard
      ? discrepancyState.issueCount > 0
        ? `<details class="import-benchmark-difference-disclosure">
            <summary>Review ${referenceDifferenceLabel(discrepancyState.issueCount)}</summary>
            ${renderReferenceDiscrepancyDetails(snap)}
          </details>`
        : discrepancyState.unavailable
          ? renderReferenceDiscrepancyDetails(snap)
          : ''
      : '';
    return `<article class="import-benchmark-card${isReference ? ' reference' : ''}${isGoldStandard ? ' gold-standard' : ''}${selectable ? '' : ' diagnostic'}" data-import-benchmark-card="${escapeAttr(view.id)}">
      <div class="import-benchmark-head">
        ${selector}
        <div class="import-benchmark-title">
          <div class="import-benchmark-file" title="${escapeAttr(snap.fileName || 'Unknown file')}">${escapeHTML(snap.fileName || 'Unknown file')}</div>
          <div class="import-benchmark-date">${escapeHTML(recordedLabel)}</div>
        </div>
        <div class="import-benchmark-head-actions">
          <span class="import-benchmark-status${isReference ? ' reference' : (status !== 'confirmed' || fallbackLabel !== 'direct' ? ' retried' : '')}">${escapeHTML(statusLabel)}</span>
          ${isGoldStandard ? '' : `<button type="button" class="import-benchmark-delete" data-import-benchmark-delete="${escapeAttr(view.id)}" aria-label="Delete model test for ${escapeAttr(snap.fileName || 'this report')}">Delete</button>`}
        </div>
      </div>
      <div class="import-benchmark-grid">
        <div><span>Model</span><strong title="${escapeAttr(modelId)}">${escapeHTML(modelId)}</strong></div>
        <div><span>Backend / test</span><strong>${escapeHTML(provider)} \u00b7 ${mode}</strong></div>
        ${performanceFields}
        <div><span>Results found</span><strong>${view.detectedMarkerCount}</strong></div>
        ${qualityFields}
        <div><span>Input</span><strong>${Number(snap.inputChars) ? `${formatTokens(Number(snap.inputChars))} chars` : '\u2014'}${Number(snap.pageCount) ? ` \u00b7 ${Number(snap.pageCount)} pages` : ''}</strong></div>
        <div><span>Model setup</span><strong>${contextLength ? `${formatTokens(contextLength)} context` : 'context unknown'}${quant ? ` \u00b7 ${escapeHTML(quant)}` : ''}${executionLocation ? ` \u00b7 ${escapeHTML(executionLocation)}` : ''}${providerApi ? ` \u00b7 ${escapeHTML(providerApi)}` : ''}${loadState ? ` \u00b7 ${escapeHTML(loadState)}` : ''}</strong></div>
        ${pdfExtractionMs > 0 ? `<div><span>Reading the PDF</span><strong>${formatBenchmarkDuration(pdfExtractionMs)}</strong></div>` : ''}
        ${view.piiMs > 0 ? `<div><span>Privacy preparation</span><strong>${formatBenchmarkDuration(view.piiMs)}</strong></div>` : ''}
        ${view.modelLoadMs > 0 || view.timeToFirstTokenMs > 0 ? `<div><span>Model load / first response</span><strong>${formatOptionalBenchmarkDuration(view.modelLoadMs)} / ${formatOptionalBenchmarkDuration(view.timeToFirstTokenMs)}</strong></div>` : ''}
        ${snap.error ? `<div style="grid-column:1/-1"><span>Error</span><strong>${escapeHTML(snap.error)}</strong></div>` : ''}
      </div>
      ${discrepancyDisclosure}
    </article>`;
  }).join('');
}

export function renderImportBenchmarksBody(snapshots) {
  const comparableRuns = snapshots.filter(isImportBenchmarkComparable);
  const goldBaselines = comparableRuns.filter(snap => snap.benchmarkLocked);
  const modelRuns = comparableRuns.filter(snap => !snap.benchmarkLocked);
  const diagnosticRuns = snapshots.filter(snap => !snap.benchmarkLocked && !isImportBenchmarkComparable(snap));
  const referenceRuns = modelRuns.filter(snap => (
    snap.benchmarkKind === 'reference' && snap.referenceFixtureId === IMPORT_REFERENCE_FIXTURE.id
  ));
  const provider = getAIProvider();
  const activeModelId = getActiveModelId(provider);
  const activeProvider = getImportBenchmarkProviderLabel({ provider, modelId: activeModelId });
  const running = isBundledImportReferenceBenchmarkRunning();
  const latestPair = latestCompatibleModelTests(snapshots);
  return `<p class="import-benchmarks-note">Test different models with the same report, then compare accuracy and speed side by side. Only tests using the same report and test protocol can be compared. Test history stays on this device and is never replaced by cross-device sync.</p>
    ${renderImportBenchmarkSummary(snapshots)}
    <section class="import-reference-benchmark" aria-label="Built-in benchmark answer key">
      <div>
        <span class="import-reference-benchmark-kicker">Built-in answer key</span>
        <strong>68-result sample lab report</strong>
        <p>We verified every result in this three-page PDF. Test a model with it to measure both accuracy and speed. The answer key is always 100% and has no runtime of its own.</p>
        <a href="${IMPORT_REFERENCE_FIXTURE.sourcePath}" target="_blank" rel="noopener">Preview sample PDF</a>
      </div>
      <div class="import-reference-benchmark-actions">
        <button type="button" class="import-btn import-btn-primary" data-import-benchmarks-action="run-reference" title="Test ${escapeAttr(activeModelId)} with the sample report"${running ? ' disabled' : ''}>${running ? 'Model test running…' : `Test current model${referenceRuns.length ? ` again (${referenceRuns.length} saved)` : ''}`}</button>
        <span class="import-reference-current-model" title="${escapeAttr(activeModelId)}">Using ${escapeHTML(activeProvider)} · ${escapeHTML(activeModelId)}</span>
        <div class="import-reference-progress" data-import-reference-progress hidden>
          <div class="import-reference-progress-track" role="progressbar" aria-label="Model test progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
            <span data-import-reference-progress-fill></span>
          </div>
          <span data-import-reference-progress-copy>Preparing model test…</span>
        </div>
      </div>
    </section>
    <div class="import-benchmarks-toolbar">
      <div><strong>Compare model tests</strong><span data-import-benchmark-selection-copy>Choose two or more tests of the same report. Your first choice is the baseline.</span></div>
      <div class="import-benchmarks-toolbar-actions">
        <button type="button" class="import-btn import-btn-secondary" data-import-benchmarks-action="select-latest"${latestPair.length < 2 ? ' disabled' : ''}>Latest matching pair</button>
        <button type="button" class="import-btn import-btn-secondary" data-import-benchmarks-action="clear-selection" disabled>Clear</button>
        <button type="button" class="import-btn import-benchmark-delete-selected" data-import-benchmarks-action="delete-selected" disabled>Delete selected</button>
      </div>
    </div>
    <section class="import-benchmark-comparison" data-import-benchmark-comparison aria-live="polite" hidden></section>
    <div class="import-benchmarks-section-label"><strong>Answer key</strong><span>Built in · always 100% · not a model test</span></div>
    <div class="import-benchmarks-list import-benchmarks-gold-list">${renderImportBenchmarkCards(goldBaselines)}</div>
    <div class="import-benchmarks-section-label import-benchmarks-model-runs-label"><strong>Successful model tests</strong><span>${modelRuns.length} ready to compare</span></div>
    <div class="import-benchmarks-list">${renderImportBenchmarkCards(modelRuns, { emptyCopy: 'No model tests yet. Choose a model above and run the sample report.' })}</div>
    ${diagnosticRuns.length ? `<details class="import-benchmark-diagnostics">
      <summary><span>Tests that didn’t finish</span><strong>${diagnosticRuns.length}</strong></summary>
      <p>These are kept for troubleshooting and are not included in comparisons.</p>
      <div class="import-benchmarks-list">${renderImportBenchmarkCards(diagnosticRuns, { selectable: false })}</div>
    </details>` : ''}`;
}

export function updateImportBenchmarkSelection(overlay, snapshots, selectedIds) {
  const snapshotsById = new Map(snapshots.map(snap => [importBenchmarkStorageId(snap), snap]));
  for (const id of selectedIds) {
    if (!snapshotsById.has(id) || !isImportBenchmarkComparable(snapshotsById.get(id))) selectedIds.delete(id);
  }
  const selectedList = [...selectedIds];
  const baselineSnapshot = snapshotsById.get(selectedList[0]);
  for (const id of selectedList.slice(1)) {
    if (!importBenchmarksUseSameInput(baselineSnapshot, snapshotsById.get(id))) selectedIds.delete(id);
  }
  const selectedSnapshots = [...selectedIds].map(id => snapshotsById.get(id)).filter(Boolean);
  overlay.querySelectorAll('[data-import-benchmark-select]').forEach(input => {
    if (!(input instanceof HTMLInputElement)) return;
    const id = input.dataset.importBenchmarkSelect || '';
    const order = [...selectedIds].indexOf(id);
    const candidate = snapshotsById.get(id);
    const incompatible = !!baselineSnapshot
      && order < 0
      && !importBenchmarksUseSameInput(baselineSnapshot, candidate);
    input.checked = order >= 0;
    input.disabled = incompatible;
    input.title = incompatible ? 'Only tests of the same report and test protocol can be compared.' : '';
    const card = input.closest('[data-import-benchmark-card]');
    card?.classList.toggle('selected', order >= 0);
    card?.classList.toggle('comparison-incompatible', incompatible);
    const orderLabel = card?.querySelector('.import-benchmark-selection-order');
    if (orderLabel) orderLabel.textContent = order === 0 ? 'Baseline' : (order > 0 ? String(order + 1) : '');
  });
  const selectionCopy = overlay.querySelector('[data-import-benchmark-selection-copy]');
  if (selectionCopy) {
    selectionCopy.textContent = selectedSnapshots.length === 0
      ? 'Choose two or more tests of the same report. Your first choice is the baseline.'
      : selectedSnapshots.length === 1
        ? 'Baseline chosen. Select another test of this report.'
        : `${selectedSnapshots.length} matching tests selected. Differences are measured from the baseline.`;
  }
  const clearButton = overlay.querySelector('[data-import-benchmarks-action="clear-selection"]');
  const deleteButton = overlay.querySelector('[data-import-benchmarks-action="delete-selected"]');
  if (clearButton instanceof HTMLButtonElement) clearButton.disabled = selectedSnapshots.length === 0;
  if (deleteButton instanceof HTMLButtonElement) deleteButton.disabled = !selectedSnapshots.some(snap => !snap.benchmarkLocked);
  const comparison = overlay.querySelector('[data-import-benchmark-comparison]');
  if (comparison instanceof HTMLElement) {
    comparison.hidden = selectedSnapshots.length < 2;
    comparison.innerHTML = selectedSnapshots.length >= 2 ? renderImportBenchmarkComparison(selectedSnapshots) : '';
  }
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
