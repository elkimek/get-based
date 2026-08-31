// @ts-check
// pdf-import-commit.js - Import commit, snapshot deletion, and re-review actions.

import { state } from './state.js';
import { ensureCustomMarkerIdentity } from './custom-marker-identity.js';
import { maybeShowEncryptionNudge } from './crypto.js';
import { MARKER_SCHEMA } from './schema.js';
import { SPECIALTY_MARKER_DEFS } from './adapters.js';
import { MOSAIC_MOAT_MARKERS, MOSAIC_OAT_MARKERS } from './mosaic-oat-catalog.js';
import { showNotification } from './utils.js';
import { saveImportedData } from './data.js';
import { findOrCreateLabEntry } from './lab-entry-mutations.js';
import {
  deleteLabEntryMarker,
  normalizeLabFastingStatus,
  normalizeLabSampleTime,
  setLabEntryCollectionContext,
  setLabEntryMarker,
  syncLabEntryInsulinMirror,
} from './lab-entry.js';
import { clearTombstone, deleteImportedArrayItems, recordTombstone } from './data-merge.js';
import {
  _cleanImportedMarkerDisplayName,
  normalizeToSI,
} from './pdf-import-marker-mapping.js';
import {
  refreshImportedDataViews,
  snapshotImportedData,
  restoreImportedDataSnapshot,
} from './pdf-import-persistence.js';
import {
  closeImportModal,
  getExcludedImportIndices,
  getPendingImport,
  resolveImportPreviewBatch,
  showImportPreview,
} from './pdf-import-review.js';
import { markImportBenchmarkConfirmed } from './import-benchmarks.js';
import { createUniqueId } from './unique-id.js';
import { annotateImportedRatioUnitConventions } from './pdf-import-ratio-units.js';

const pdfImportCommitDeps = { maybeShowEncryptionNudge };

export function configurePdfImportCommitDeps(deps = {}) {
  const previous = { ...pdfImportCommitDeps };
  if (typeof deps.maybeShowEncryptionNudge === 'function') pdfImportCommitDeps.maybeShowEncryptionNudge = deps.maybeShowEncryptionNudge;
  return previous;
}

let _batchMode = false;

export function setPdfImportBatchMode(enabled) {
  _batchMode = !!enabled;
}

function snapshotOwnsCollectionContextField(snapshot, field) {
  if (Array.isArray(snapshot?.collectionContextApplied)) {
    return snapshot.collectionContextApplied.includes(field);
  }
  if (!Object.prototype.hasOwnProperty.call(snapshot || {}, field)) return false;
  return field === 'sampleTime'
    ? normalizeLabSampleTime(snapshot[field]) != null
    : normalizeLabFastingStatus(snapshot[field]) != null;
}

function latestSnapshotForCollectionContext(date, excludedSnapshotId, field) {
  const snapshots = Array.isArray(state.importedData?.importSnapshots)
    ? state.importedData.importSnapshots
    : [];
  return snapshots
    .filter(snapshot => snapshot?.id !== excludedSnapshotId
      && snapshot?.date === date
      && snapshotOwnsCollectionContextField(snapshot, field))
    .sort((a, b) => (b.importedAt || 0) - (a.importedAt || 0))[0] || null;
}

function normalizedCollectionContextValue(field, value) {
  return field === 'sampleTime' ? normalizeLabSampleTime(value) : normalizeLabFastingStatus(value);
}

function restoreCollectionContextAfterSnapshotRemoval(entry, snapshot, now = Date.now()) {
  if (!entry || !snapshot) return;
  for (const field of ['sampleTime', 'fasting']) {
    const recordedSource = entry.collectionContextSources?.[field];
    let ownsCurrentField = recordedSource === snapshot.id;
    if (!recordedSource && snapshotOwnsCollectionContextField(snapshot, field)) {
      const latest = latestSnapshotForCollectionContext(snapshot.date, null, field);
      const currentValue = normalizedCollectionContextValue(field, entry.context?.[field]);
      const snapshotValue = normalizedCollectionContextValue(field, snapshot[field]);
      ownsCurrentField = latest?.id === snapshot.id && currentValue === snapshotValue;
    }
    if (!ownsCurrentField) continue;
    const replacement = latestSnapshotForCollectionContext(snapshot.date, snapshot.id, field);
    setLabEntryCollectionContext(entry, { [field]: replacement?.[field] ?? null }, {
      now,
      sourceSnapshotId: replacement?.id || null,
    });
  }
}

function rangeBoundEquals(a, b) {
  if (a == null || b == null) return a == null && b == null;
  return Math.abs(a - b) < Math.max(Math.abs(b) * 0.001, 0.001);
}

function schemaReferenceRange(dotKey) {
  const [categoryKey, markerKey] = dotKey.split('.');
  const marker = MARKER_SCHEMA[categoryKey]?.markers?.[markerKey];
  const female = state.profileSex === 'female';
  return {
    min: female && marker?.refMin_f != null ? marker.refMin_f : marker?.refMin,
    max: female && marker?.refMax_f != null ? marker.refMax_f : marker?.refMax,
  };
}

function snapshotRangeMatchesOverride(marker, dotKey, override) {
  if (!override || (marker?.refMin == null && marker?.refMax == null)) return false;
  const min = marker.refMin != null ? normalizeToSI(dotKey, marker.refMin, marker.unit, marker) : null;
  const max = marker.refMax != null ? normalizeToSI(dotKey, marker.refMax, marker.unit, marker) : null;
  const existingMin = override.refSource === 'manual' ? override.labRefMin : override.refMin;
  const existingMax = override.refSource === 'manual' ? override.labRefMax : override.refMax;
  return rangeBoundEquals(min, existingMin) && rangeBoundEquals(max, existingMax);
}

function findNewestAdoptedLabRange(dotKey) {
  const snapshots = Array.isArray(state.importedData?.importSnapshots)
    ? state.importedData.importSnapshots
    : [];
  const override = state.importedData?.refOverrides?.[dotKey];
  const candidates = [];

  for (const snapshot of snapshots) {
    if (!Array.isArray(snapshot?.markers)) continue;
    const excluded = new Set(Array.isArray(snapshot.excludedIndices) ? snapshot.excludedIndices : []);
    for (let i = 0; i < snapshot.markers.length; i++) {
      if (excluded.has(i)) continue;
      const marker = snapshot.markers[i];
      if (marker?.mappedKey !== dotKey) continue;
      if (marker.refMin == null && marker.refMax == null) continue;
      // Older snapshots predate the explicit adoption flag. Treat only the
      // legacy snapshot matching the currently retained lab interval as
      // adopted, rather than assuming every historical report opted in.
      const inferredLegacyAdoption = snapshot.adoptReferenceRanges == null
        && snapshotRangeMatchesOverride(marker, dotKey, override);
      if (inferredLegacyAdoption) snapshot.adoptReferenceRanges = true;
      const adopted = snapshot.adoptReferenceRanges === true;
      if (adopted) candidates.push({ snapshot, marker });
    }
  }

  candidates.sort((a, b) => {
    const byCollectionDate = String(b.snapshot.date || '').localeCompare(String(a.snapshot.date || ''));
    return byCollectionDate || ((b.snapshot.importedAt || 0) - (a.snapshot.importedAt || 0));
  });
  return candidates[0] || null;
}

function recomputeActiveLabRange(dotKey) {
  if (!dotKey) return;
  if (!state.importedData.refOverrides) state.importedData.refOverrides = {};
  const current = state.importedData.refOverrides[dotKey] || {};
  const hasManualOverride = current.refSource === 'manual';
  const candidate = findNewestAdoptedLabRange(dotKey);

  if (!candidate) {
    delete current.labRefMin;
    delete current.labRefMax;
    delete current.labRefDate;
    delete current.labRefSnapshotId;
    if (current.refSource === 'import') {
      delete current.refMin;
      delete current.refMax;
      delete current.refSource;
    }
  } else {
    const { snapshot, marker } = candidate;
    const min = marker.refMin != null ? normalizeToSI(dotKey, marker.refMin, marker.unit, marker) : null;
    const max = marker.refMax != null ? normalizeToSI(dotKey, marker.refMax, marker.unit, marker) : null;
    const defaultRange = schemaReferenceRange(dotKey);
    const matchesDefault = rangeBoundEquals(min, defaultRange.min) && rangeBoundEquals(max, defaultRange.max);

    if (hasManualOverride) {
      current.labRefMin = min;
      current.labRefMax = max;
      current.labRefDate = snapshot.date || null;
      current.labRefSnapshotId = snapshot.id || null;
    } else if (matchesDefault) {
      delete current.refMin;
      delete current.refMax;
      delete current.refSource;
      delete current.labRefMin;
      delete current.labRefMax;
      delete current.labRefDate;
      delete current.labRefSnapshotId;
    } else {
      current.refMin = min;
      current.refMax = max;
      current.refSource = 'import';
      delete current.labRefMin;
      delete current.labRefMax;
      current.labRefDate = snapshot.date || null;
      current.labRefSnapshotId = snapshot.id || null;
    }
  }

  if (Object.keys(current).length === 0) delete state.importedData.refOverrides[dotKey];
  else state.importedData.refOverrides[dotKey] = current;
}

function recomputeActiveLabRanges(dotKeys) {
  for (const dotKey of dotKeys) recomputeActiveLabRange(dotKey);
}

function deriveImportType(fileName) {
  if (!fileName) return 'import';
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  if (ext === 'pdf') return 'pdf';
  if (ext === 'csv') return 'csv';
  if (ext === 'xlsx' || ext === 'xls') return 'xlsx';
  if (ext === 'txt') return 'text';
  if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'].includes(ext)) return 'image';
  return 'import';
}

export async function confirmImport() {
  const result = getPendingImport();
  if (!result || !result.date) return;
  const confirmBtn = /** @type {HTMLButtonElement | null} */ (document.getElementById('import-confirm-btn'));
  if (confirmBtn) confirmBtn.disabled = true;
  // Guard: if profile changed during async import, abort to prevent saving to wrong profile
  if (result._importProfileId && result._importProfileId !== state.currentProfile) {
    showNotification('Profile changed during import — import cancelled for safety.', 'error');
    closeImportModal();
    return;
  }
  const rollback = snapshotImportedData();
  annotateImportedRatioUnitConventions(result.markers);
  const excludedIdxs = getExcludedImportIndices();
  const matched = result.markers.filter((m, i) => m.matched && !excludedIdxs.has(i));
  const newMarkers = result.markers.filter((m, i) => !m.matched && m.suggestedKey && !excludedIdxs.has(i));
  const importCount = matched.length + newMarkers.length;
  if (importCount === 0) {
    showNotification("No markers to import", "error");
    if (confirmBtn) confirmBtn.disabled = false;
    closeImportModal();
    return;
  }
  const importTs = Date.now();
  const isReReview = !!result._reReviewSnapshotId;
  const snapshotId = isReReview ? result._reReviewSnapshotId : createUniqueId('snap_');
  const rangeAffectedKeys = new Set();

  // Re-review: remove old snapshot markers before re-applying
  if (isReReview) {
    const oldSnapshot = state.importedData.importSnapshots?.find(s => s.id === snapshotId);
    if (oldSnapshot) {
      for (const marker of oldSnapshot.markers || []) {
        const dotKey = marker?.mappedKey;
        if (dotKey) rangeAffectedKeys.add(dotKey);
      }
      const oldEntry = state.importedData.entries?.find(e => e.date === oldSnapshot.date);
      if (oldEntry?.markers) {
        const removedKeys = [];
        for (const key of Object.keys(oldEntry.markers)) {
          const src = oldEntry.markerSources?.[key];
          if (src?.snapshotId === snapshotId) {
            deleteLabEntryMarker(oldEntry, key, { now: importTs });
            removedKeys.push(key);
          }
        }
        const manualValues = state.importedData.manualValues || {};
        for (const k of Object.keys(manualValues)) {
          if (k.endsWith(':' + oldSnapshot.date) && removedKeys.includes(k.split(':')[0])) {
            delete manualValues[k];
          }
        }
        for (const key of removedKeys) restoreLatestSnapshotMarkerForKey(oldEntry, oldSnapshot, key, importTs);
        restoreCollectionContextAfterSnapshotRemoval(oldEntry, oldSnapshot, importTs);
        if (!oldEntry.markers || Object.keys(oldEntry.markers).length === 0) {
          recordTombstone(state.importedData, 'entries', oldEntry.date);
          deleteImportedArrayItems(state.importedData, 'entries', e => e === oldEntry);
        }
      }
    }
  }

  const entry = findOrCreateLabEntry(state.importedData, result.date, { now: importTs });
  entry.importedWith = {
    provider: result.costInfo?.provider || null,
    modelId: result.costInfo?.modelId || null
  };
  if (result.importHash) entry.importHash = result.importHash;
  if (result.fileName) {
    if (!entry.sourceFiles) entry.sourceFiles = entry.sourceFile ? [entry.sourceFile] : [];
    if (!entry.sourceFiles.includes(result.fileName)) entry.sourceFiles.push(result.fileName);
    entry.sourceFile = result.fileName; // backwards compat
  }
  entry.updatedAt = importTs;
  const collectionContext = /** @type {{ sampleTime?: unknown, fasting?: unknown }} */ ({});
  const collectionContextApplied = [];
  if (isReReview || result.sampleTime != null) {
    collectionContext.sampleTime = result.sampleTime ?? null;
    collectionContextApplied.push('sampleTime');
  }
  if (isReReview || typeof result.fasting === 'boolean') {
    collectionContext.fasting = typeof result.fasting === 'boolean' ? result.fasting : null;
    collectionContextApplied.push('fasting');
  }
  if (Object.keys(collectionContext).length > 0) {
    setLabEntryCollectionContext(entry, collectionContext, { now: importTs, sourceSnapshotId: snapshotId });
  }
  for (const m of matched) {
    setLabEntryMarker(entry, m.mappedKey, normalizeToSI(m.mappedKey, m.value, m.unit, m), {
      now: importTs,
      source: { file: result.fileName || null, at: importTs, snapshotId },
    });
  }
  // For non-blood imports, testType is the authoritative sidebar group for all markers
  const importGroup = (result.testType && result.testType !== 'blood')
    ? (result.testType === 'fattyAcids' ? 'Fatty Acids' : result.testType)
    : null;
  // Auto-create custom markers for matched specialty and product-specific keys.
  // Snapshot re-review can contain an already-matched custom key (for example
  // spadiaFA.*) whose definition was lost, so matched does not imply schema-backed.
  if (!state.importedData.customMarkers) state.importedData.customMarkers = {};
  for (const m of matched) {
    const [catKey, markerKey] = m.mappedKey.split('.');
    const schemaMarker = MARKER_SCHEMA[catKey]?.markers?.[markerKey];
    const exactSpecialtyDef = SPECIALTY_MARKER_DEFS[m.mappedKey]
      || MOSAIC_OAT_MARKERS[m.mappedKey]
      || MOSAIC_MOAT_MARKERS[m.mappedKey];
    const productBaseDef = catKey === 'spadiaFA'
      ? SPECIALTY_MARKER_DEFS[`fattyAcids.${markerKey}`]
      : null;
    const def = exactSpecialtyDef || productBaseDef || {};
    if (schemaMarker && !exactSpecialtyDef) continue;
    const existing = state.importedData.customMarkers[m.mappedKey];
    const cmDef = existing || {};
    cmDef.name = cmDef.name || m.suggestedName || def.name || _cleanImportedMarkerDisplayName(m.rawName) || markerKey;
    cmDef.unit = m.unit || cmDef.unit || def.unit || '';
    cmDef.refMin = m.refMin != null ? m.refMin : (cmDef.refMin != null ? cmDef.refMin : def.refMin);
    cmDef.refMax = m.refMax != null ? m.refMax : (cmDef.refMax != null ? cmDef.refMax : def.refMax);
    cmDef.icon = cmDef.icon || def.icon;
    if (def.singlePoint) cmDef.singlePoint = true;
    // Always update organizational fields from latest import.
    cmDef.categoryLabel = exactSpecialtyDef?.categoryLabel
      || m.suggestedCategoryLabel
      || cmDef.categoryLabel
      || (catKey === 'spadiaFA' ? 'Spadia' : catKey.charAt(0).toUpperCase() + catKey.slice(1));
    cmDef.group = m.suggestedGroup || importGroup || def.group || cmDef.group || null;
    ensureCustomMarkerIdentity(cmDef, state.importedData.customMarkers);
    state.importedData.customMarkers[m.mappedKey] = cmDef;
  }
  // Save new (custom) marker values and definitions
  for (const m of newMarkers) {
    setLabEntryMarker(entry, m.suggestedKey, normalizeToSI(m.suggestedKey, m.value, m.unit, m), {
      now: importTs,
      source: { file: result.fileName || null, at: importTs, snapshotId },
    });
    const [catKey] = m.suggestedKey.split('.');
    const schemaCategory = MARKER_SCHEMA[catKey];
    const categoryLabel = schemaCategory ? schemaCategory.label : m.suggestedCategoryLabel || catKey.charAt(0).toUpperCase() + catKey.slice(1);
    const existing = state.importedData.customMarkers[m.suggestedKey];
    const cmDef = existing || {};
    cmDef.name = cmDef.name || _cleanImportedMarkerDisplayName(m.suggestedName || m.rawName);
    cmDef.unit = m.unit || cmDef.unit || '';
    cmDef.refMin = m.refMin != null ? m.refMin : cmDef.refMin;
    cmDef.refMax = m.refMax != null ? m.refMax : cmDef.refMax;
    // Always update organizational fields from latest import
    cmDef.categoryLabel = categoryLabel;
    // FA-normalized markers carry their own group — don't override with testType-based importGroup
    cmDef.group = m.suggestedGroup || importGroup || m.group || cmDef.group || null;
    ensureCustomMarkerIdentity(cmDef, state.importedData.customMarkers);
    state.importedData.customMarkers[m.suggestedKey] = cmDef;
  }
  // Mirror insulin between hormones and diabetes categories (AI may map to either)
  syncLabEntryInsulinMirror(entry, { now: importTs });
  // The report-level choice is persisted with the snapshot. Active lab ranges
  // are recomputed after the snapshot is stored so collection date, rather
  // than upload order, determines which eligible interval wins.
  const adoptRanges = /** @type {HTMLInputElement | null} */ (document.getElementById('import-adopt-ranges'));
  const adoptReferenceRanges = adoptRanges ? adoptRanges.checked : result._adoptReferenceRanges !== false;
  for (const marker of matched) rangeAffectedKeys.add(marker.mappedKey);
  // Persist import snapshot for later re-review without AI
  const snapshotPayload = (m) => ({
    rawName: m.rawName,
    value: m.value,
    unit: m.unit || null,
    refMin: m.refMin != null ? m.refMin : null,
    refMax: m.refMax != null ? m.refMax : null,
    mappedKey: m.mappedKey || null,
    suggestedKey: m.suggestedKey || null,
    suggestedName: m.suggestedName || null,
    suggestedCategoryLabel: m.suggestedCategoryLabel || null,
    suggestedGroup: m.suggestedGroup || null,
    ratioUnitConvention: m.ratioUnitConvention || null,
    matched: !!m.matched,
  });
  const snapshotCostInfo = result.costInfo ? {
    provider: result.costInfo.provider || null,
    modelId: result.costInfo.modelId || null,
    inputTokens: Number(result.costInfo.inputTokens) || 0,
    outputTokens: Number(result.costInfo.outputTokens) || 0,
    cost: Number(result.costInfo.cost) || 0,
  } : null;
  const snapshotTimings = result.timings ? {
    pii: Number(result.timings.pii) || 0,
    analysis: Number(result.timings.analysis) || 0,
    piiMs: Number.isFinite(Number(result.timings.piiMs))
      ? Math.max(0, Math.round(Number(result.timings.piiMs)))
      : Math.max(0, Math.round((Number(result.timings.pii) || 0) * 1000)),
    analysisMs: Number.isFinite(Number(result.timings.analysisMs))
      ? Math.max(0, Math.round(Number(result.timings.analysisMs)))
      : Math.max(0, Math.round((Number(result.timings.analysis) || 0) * 1000)),
  } : null;
  const snapshotDiagnostics = result.diagnostics?.streamFallback || result.diagnostics?.structuredOutputFallback
    ? {
      streamFallback: !!result.diagnostics.streamFallback,
      structuredOutputFallback: !!result.diagnostics.structuredOutputFallback,
    }
    : null;
  const snapBase = {
    fileName: result.fileName || '',
    date: result.date || '',
    sampleTime: result.sampleTime || null,
    fasting: typeof result.fasting === 'boolean' ? result.fasting : null,
    collectionContextApplied,
    testType: result.testType || null,
    type: deriveImportType(result.fileName),
    markerCount: importCount,
    excludedIndices: Array.from(excludedIdxs),
    costInfo: snapshotCostInfo,
    timings: snapshotTimings,
    importMode: result.imageMode ? 'image' : 'text',
    diagnostics: snapshotDiagnostics,
    importHash: result.importHash || '',
    benchmarkId: result.benchmarkId || null,
    adoptReferenceRanges,
  };
  if (isReReview) {
    if (!state.importedData.importSnapshots) state.importedData.importSnapshots = [];
    clearTombstone(state.importedData, 'importSnapshots', snapshotId);
    const snapIdx = state.importedData.importSnapshots?.findIndex(s => s.id === snapshotId);
    if (snapIdx >= 0) {
      state.importedData.importSnapshots[snapIdx] = {
        ...state.importedData.importSnapshots[snapIdx],
        ...snapBase,
        markers: result.markers.map(m => snapshotPayload(m)),
        benchmarkAt: importTs,
        importedAt: importTs,
      };
    } else {
      state.importedData.importSnapshots.push({
        id: snapshotId,
        ...snapBase,
        markers: result.markers.map(m => snapshotPayload(m)),
        benchmarkAt: importTs,
        importedAt: importTs,
      });
    }
  } else {
    if (!state.importedData.importSnapshots) state.importedData.importSnapshots = [];
    state.importedData.importSnapshots.push({
      id: snapshotId,
      ...snapBase,
      markers: result.markers.map(m => snapshotPayload(m)),
      benchmarkAt: importTs,
      importedAt: importTs,
    });
  }
  recomputeActiveLabRanges(rangeAffectedKeys);

  // Finalize the benchmark before the canonical import save so the health-data
  // snapshot and its comparable model run are committed atomically. Previously
  // the benchmark used a second fire-and-forget save and could remain "preview"
  // after a successful import.
  const benchmarkId = result.benchmarkId || null;
  if (benchmarkId) markImportBenchmarkConfirmed(benchmarkId, result, excludedIdxs, { persist: false });
  const saved = await saveImportedData({ immediate: true });
  if (!saved) {
    restoreImportedDataSnapshot(rollback);
    if (confirmBtn) confirmBtn.disabled = false;
    return;
  }
  if (benchmarkId) result.benchmarkId = null;
  // Resolve batch promise before closeImportModal (which would resolve with 'skip').
  if (!resolveImportPreviewBatch('import')) closeImportModal();
  // During batch mode, defer expensive UI refreshes until the batch completes
  if (!_batchMode) {
    refreshImportedDataViews();
  }
  showNotification(`Imported ${importCount} markers from ${result.date}`, "success");
  if (!_batchMode) pdfImportCommitDeps.maybeShowEncryptionNudge();
}

function snapshotMarkerDotKey(marker) {
  return marker?.mappedKey || marker?.suggestedKey || null;
}

function findLatestRestorableSnapshotMarker(date, excludedSnapshotId, dotKey) {
  const snaps = Array.isArray(state.importedData?.importSnapshots) ? state.importedData.importSnapshots : [];
  const candidates = snaps
    .filter(s => s?.id && s.id !== excludedSnapshotId && s.date === date && Array.isArray(s.markers))
    .sort((a, b) => (b.importedAt || 0) - (a.importedAt || 0));
  for (const snap of candidates) {
    const excluded = new Set(Array.isArray(snap.excludedIndices) ? snap.excludedIndices : []);
    for (let i = 0; i < snap.markers.length; i++) {
      if (excluded.has(i)) continue;
      const marker = snap.markers[i];
      if (snapshotMarkerDotKey(marker) !== dotKey) continue;
      return { snap, marker };
    }
  }
  return null;
}

function restoreLatestSnapshotMarkerForKey(entry, removedSnapshot, dotKey, now = Date.now()) {
  if (!entry || !removedSnapshot || !dotKey) return false;
  const replacement = findLatestRestorableSnapshotMarker(removedSnapshot.date, removedSnapshot.id, dotKey);
  if (!replacement) return false;
  const { snap, marker } = replacement;
  setLabEntryMarker(entry, dotKey, normalizeToSI(dotKey, marker.value, marker.unit, marker), {
    now,
    source: { file: snap.fileName || null, at: snap.importedAt || now, snapshotId: snap.id },
  });
  return true;
}

export async function deleteImportSnapshot(snapId) {
  const snaps = state.importedData?.importSnapshots;
  const idx = snaps ? snaps.findIndex(s => s.id === snapId) : -1;
  if (idx < 0) {
    showNotification('Import snapshot not found', 'error');
    return false;
  }
  const snapshot = snaps[idx];
  const rollback = snapshotImportedData();
  const rangeAffectedKeys = new Set();
  for (const marker of snapshot.markers || []) {
    const dotKey = marker?.mappedKey;
    if (dotKey) rangeAffectedKeys.add(dotKey);
  }
  // Remove markers tagged with this snapshotId from the entry
  const entry = state.importedData.entries?.find(e => e.date === snapshot.date);
  if (entry?.markers) {
    const removedKeys = [];
    for (const key of Object.keys(entry.markers)) {
      const src = entry.markerSources?.[key];
      if (src?.snapshotId === snapshot.id) {
        deleteLabEntryMarker(entry, key);
        removedKeys.push(key);
      }
    }
    const manualValues = state.importedData.manualValues || {};
    for (const k of Object.keys(manualValues)) {
      if (k.endsWith(':' + snapshot.date) && removedKeys.includes(k.split(':')[0])) {
        delete manualValues[k];
      }
    }
    for (const key of removedKeys) restoreLatestSnapshotMarkerForKey(entry, snapshot, key);
    restoreCollectionContextAfterSnapshotRemoval(entry, snapshot);
    if (!entry.markers || Object.keys(entry.markers).length === 0) {
      recordTombstone(state.importedData, 'entries', snapshot.date);
      deleteImportedArrayItems(state.importedData, 'entries', e => e === entry);
    }
  }
  recordTombstone(state.importedData, 'importSnapshots', snapId);
  deleteImportedArrayItems(state.importedData, 'importSnapshots', s => s.id === snapId);
  recomputeActiveLabRanges(rangeAffectedKeys);
  const saved = await saveImportedData({ immediate: true });
  if (!saved) {
    restoreImportedDataSnapshot(rollback);
    return false;
  }
  refreshImportedDataViews();
  showNotification(`Deleted import from ${snapshot.fileName || 'unknown'}`, 'info');
  return true;
}

export function openImportReviewFromSnapshot(snapId) {
  const snapshot = state.importedData?.importSnapshots?.find(s => s.id === snapId);
  if (!snapshot) {
    showNotification('Import snapshot not found', 'error');
    return;
  }
  if (!Array.isArray(snapshot.markers) || snapshot.markers.length === 0) {
    showNotification('This import has no saved marker review data', 'error');
    return;
  }
  const entryContext = state.importedData?.entries?.find(entry => entry?.date === snapshot.date)?.context || {};
  const snapshotOwnsSampleTime = snapshotOwnsCollectionContextField(snapshot, 'sampleTime');
  const snapshotOwnsFasting = snapshotOwnsCollectionContextField(snapshot, 'fasting');
  const result = {
    date: snapshot.date,
    sampleTime: snapshotOwnsSampleTime ? (snapshot.sampleTime || null) : (entryContext.sampleTime || null),
    fasting: snapshotOwnsFasting
      ? snapshot.fasting
      : typeof entryContext.fasting === 'boolean' ? entryContext.fasting : null,
    fileName: snapshot.fileName,
    testType: snapshot.testType,
    markers: snapshot.markers.map(m => ({ ...m })),
    costInfo: snapshot.costInfo,
    timings: snapshot.timings,
    imageMode: snapshot.importMode === 'image',
    diagnostics: snapshot.diagnostics,
    importHash: snapshot.importHash,
    _adoptReferenceRanges: snapshot.adoptReferenceRanges,
    _reReviewSnapshotId: snapshot.id,
    _excludedImportIndices: snapshot.excludedIndices || [],
  };
  showImportPreview(result);
}
