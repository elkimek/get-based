// @ts-check
// pdf-import-commit.js - Import commit, snapshot deletion, and re-review actions.

import { state } from './state.js';
import { ensureCustomMarkerIdentity } from './custom-marker-identity.js';
import { maybeShowEncryptionNudge } from './crypto.js';
import { MARKER_SCHEMA } from './schema.js';
import { SPECIALTY_MARKER_DEFS } from './adapters.js';
import { showNotification } from './utils.js';
import { saveImportedData } from './data.js';
import { findOrCreateLabEntry } from './lab-entry-mutations.js';
import { deleteLabEntryMarker, setLabEntryMarker, syncLabEntryInsulinMirror } from './lab-entry.js';
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

  // Re-review: remove old snapshot markers before re-applying
  if (isReReview) {
    const oldSnapshot = state.importedData.importSnapshots?.find(s => s.id === snapshotId);
    if (oldSnapshot) {
      const oldEntry = state.importedData.entries?.find(e => e.date === oldSnapshot.date);
      if (oldEntry?.markers) {
        const removedKeys = [];
        for (const key of Object.keys(oldEntry.markers)) {
          const src = oldEntry.markerSources?.[key];
          if (src?.snapshotId === snapshotId) {
            deleteLabEntryMarker(oldEntry, key, { now: importTs, mirrorInsulin: true });
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
    const exactSpecialtyDef = SPECIALTY_MARKER_DEFS[m.mappedKey];
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
  // Adopt PDF reference ranges if user opted in (skip if range matches schema default)
  const adoptRanges = /** @type {HTMLInputElement | null} */ (document.getElementById('import-adopt-ranges'));
  if (adoptRanges && adoptRanges.checked) {
    if (!state.importedData.refOverrides) state.importedData.refOverrides = {};
    for (const m of matched) {
      if (m.refMin == null && m.refMax == null) continue;
      const ovr = state.importedData.refOverrides[m.mappedKey] || {};
      // Convert ranges from PDF units to SI (same as marker values)
      const siMin = m.refMin != null ? normalizeToSI(m.mappedKey, m.refMin, m.unit, m) : null;
      const siMax = m.refMax != null ? normalizeToSI(m.mappedKey, m.refMax, m.unit, m) : null;
      // Look up schema default to avoid storing redundant overrides
      const [ck, mk] = m.mappedKey.split('.');
      const schemaDef = MARKER_SCHEMA[ck]?.markers?.[mk];
      const sex = state.profileSex || 'male';
      const defMin = schemaDef && sex === 'female' && schemaDef.refMin_f != null ? schemaDef.refMin_f : schemaDef?.refMin;
      const defMax = schemaDef && sex === 'female' && schemaDef.refMax_f != null ? schemaDef.refMax_f : schemaDef?.refMax;
      const approxEq = (a, b) => a != null && b != null && Math.abs(a - b) < Math.max(Math.abs(b) * 0.001, 0.001);
      if (approxEq(siMin, defMin) && approxEq(siMax, defMax)) continue; // matches default — skip
      ovr.refMin = siMin;
      ovr.refMax = siMax;
      ovr.refSource = 'import';
      // Stash lab range so manual edits can revert to it (don't clobber existing stash)
      if (!('labRefMin' in ovr)) { ovr.labRefMin = siMin; ovr.labRefMax = siMax; }
      state.importedData.refOverrides[m.mappedKey] = ovr;
    }
  }
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
  // Remove markers tagged with this snapshotId from the entry
  const entry = state.importedData.entries?.find(e => e.date === snapshot.date);
  if (entry?.markers) {
    const removedKeys = [];
    for (const key of Object.keys(entry.markers)) {
      const src = entry.markerSources?.[key];
      if (src?.snapshotId === snapshot.id) {
        deleteLabEntryMarker(entry, key, { mirrorInsulin: true });
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
    if (!entry.markers || Object.keys(entry.markers).length === 0) {
      recordTombstone(state.importedData, 'entries', snapshot.date);
      deleteImportedArrayItems(state.importedData, 'entries', e => e === entry);
    }
  }
  recordTombstone(state.importedData, 'importSnapshots', snapId);
  deleteImportedArrayItems(state.importedData, 'importSnapshots', s => s.id === snapId);
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
  const result = {
    date: snapshot.date,
    fileName: snapshot.fileName,
    testType: snapshot.testType,
    markers: snapshot.markers.map(m => ({ ...m })),
    costInfo: snapshot.costInfo,
    timings: snapshot.timings,
    imageMode: snapshot.importMode === 'image',
    diagnostics: snapshot.diagnostics,
    importHash: snapshot.importHash,
    _reReviewSnapshotId: snapshot.id,
    _excludedImportIndices: snapshot.excludedIndices || [],
  };
  showImportPreview(result);
}
