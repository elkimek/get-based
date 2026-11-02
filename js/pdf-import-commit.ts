import { applyLabReportRemoval, bindKnownReportSamples, labReportMutationTime, recomputeActiveLabRanges, restoreCollectionContextAfterSnapshotRemoval, restoreLatestSnapshotMarkerForKey, snapshotOwnsCollectionContextField } from './lab-report-mutations.js';
import type { CommitSnapshot, CollectionContextField } from './lab-report-mutations.js';
import type { ImportReviewMarker } from './pdf-import-review-runtime.js';
import type { LabEntry } from '../types/lab-data.js';
import type { AdapterMarkerDefinition } from './adapters.js';
import { configureRuntimeFunctions } from './runtime-callbacks.js';
// pdf-import-commit.js - Import commit, snapshot deletion, and re-review actions.

import { prepareImportCommit } from './import-commit-validation.js';
import { state } from './state.js';
import { ensureCustomMarkerIdentity } from './custom-marker-identity.js';
import { maybeShowEncryptionNudge } from './crypto.js';
import { MARKER_SCHEMA } from './schema.js';
import { SPECIALTY_MARKER_DEFS } from './adapters.js';
import { MOSAIC_MOAT_MARKERS, MOSAIC_OAT_MARKERS } from './mosaic-oat-catalog.js';
import { showNotification } from './utils.js';
import { prepareLabReportWrite, commitLabReportWrite } from './lab-report-store.js';
import { applyLabSampleCommand } from './lab-sample-mutations.js';
import { bindImportReportReview, importReviewSourceId, resolveImportSample, selectLabReportSample } from './lab-report-samples.js';
import {
  deleteLabEntryMarker,
  setLabEntryCollectionContext,
  setLabEntryMarker,
  syncLabEntryInsulinMirror,
} from './lab-entry.js';
import { clearTombstone } from './data-merge.js';
import {
  _cleanImportedMarkerDisplayName,
  normalizeToSI,
} from './pdf-import-marker-mapping.js';
import {
  refreshImportedDataViews,
} from './pdf-import-persistence.js';
import {
  closeImportModal,
  getExcludedImportIndices,
  revealImportReviewErrors,
  getPendingImport,
  resolveImportPreviewBatch,
  showImportPreview,
} from './pdf-import-review.js';
import { markImportBenchmarkConfirmedInData } from './import-benchmarks.js';
import { createUniqueId } from './unique-id.js';
import { annotateImportedRatioUnitConventions } from './pdf-import-ratio-units.js';

const pdfImportCommitDeps = { maybeShowEncryptionNudge };

export function configurePdfImportCommitDeps(deps: Partial<typeof pdfImportCommitDeps> = {}) {
  return configureRuntimeFunctions(pdfImportCommitDeps, deps, ["maybeShowEncryptionNudge"]);
}

let _batchMode = false;

export function setPdfImportBatchMode(enabled: unknown) {
  _batchMode = !!enabled;
}

function deriveImportType(fileName: string | null | undefined) {
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
  const confirmBtn = (document.getElementById('import-confirm-btn')) as HTMLButtonElement | null;
  if (confirmBtn) confirmBtn.disabled = true;
  // Guard: if profile changed during async import, abort to prevent saving to wrong profile
  if (result._importProfileId && result._importProfileId !== state.currentProfile) {
    showNotification('Profile changed during import — import cancelled for safety.', 'error');
    closeImportModal();
    return;
  }
  annotateImportedRatioUnitConventions(result.markers);
  const excludedIdxs = getExcludedImportIndices();
  const prepared = prepareImportCommit(result, excludedIdxs, state.importedData.customMarkers);
  if (prepared.error) {
    revealImportReviewErrors();
    showNotification(prepared.error, 'error', 12000);
    if (confirmBtn) confirmBtn.disabled = false;
    return;
  }
  const observed = state.importedData, profileId = state.currentProfile, profileSex = state.profileSex;
  const { base, next: data } = prepareLabReportWrite(observed);
  const matched = prepared.markers.filter(m => m.matched);
  const newMarkers = prepared.markers.filter(m => !m.matched && m.suggestedKey);
  const importCount = matched.length + newMarkers.length;
  if (importCount === 0) {
    showNotification("No markers to import", "error");
    if (confirmBtn) confirmBtn.disabled = false;
    closeImportModal();
    return;
  }
  let importTs = Date.now();
  const sourceId = importReviewSourceId(result), isReReview = !!sourceId;
  const snapshotId = sourceId || createUniqueId('snap_');
  const rangeAffectedKeys = new Set<string>();
  const benchmarkId = result.benchmarkId || null;
  let entry: LabEntry;
  try {
    const report = data.importSnapshots?.find(snapshot => snapshot.id === sourceId) as CommitSnapshot | undefined;
    entry = resolveImportSample(result, data, state.currentProfile, report, importTs);
    importTs = labReportMutationTime(entry, importTs);
    bindKnownReportSamples(data, entry);
    if (entry.date !== result.date) entry = applyLabSampleCommand(data, { kind: 'update', panelId: entry.panelId!, date: result.date, now: importTs });
  } catch (error) {
    showNotification(error instanceof Error ? error.message : 'Could not verify the sample destination.', 'error');
    if (confirmBtn) confirmBtn.disabled = false;
    return;
  }

  try {
    // Re-review: remove old snapshot markers before re-applying
    if (isReReview) {
      const oldSnapshot: CommitSnapshot | undefined = data.importSnapshots?.find(s => s.id === snapshotId);
      if (oldSnapshot) {
        for (const marker of oldSnapshot.markers || []) {
          const dotKey = marker?.mappedKey;
          if (dotKey) rangeAffectedKeys.add(dotKey);
        }
        const oldEntry = entry;
        if (oldEntry?.markers) {
          const removedKeys: string[] = [];
          for (const key of Object.keys(oldEntry.markers)) {
            const src = oldEntry.markerSources?.[key];
            if (src?.snapshotId === snapshotId) {
              deleteLabEntryMarker(oldEntry, key, { now: importTs });
              removedKeys.push(key);
            }
          }
          const manualValues = data.manualValues || {};
          for (const k of Object.keys(manualValues)) {
            if (k.endsWith(':' + oldEntry.date) && removedKeys.includes(k.split(':')[0]!)
              && !data.entries.some(row => row !== oldEntry && row.date === oldEntry.date && Object.hasOwn(row.markers || {}, k.split(':')[0]!))) {
              manualValues[k] = null;
            }
          }
          for (const key of removedKeys) restoreLatestSnapshotMarkerForKey(data, oldEntry, oldSnapshot, key, importTs);
          restoreCollectionContextAfterSnapshotRemoval(data, oldEntry, oldSnapshot, importTs);
        }
      }
    }

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
    const collectionContext = ({}) as { sampleTime?: unknown, fasting?: unknown };
    const collectionContextApplied: CollectionContextField[] = [];
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
      setLabEntryMarker(entry, m.mappedKey!, normalizeToSI(m.mappedKey!, m.value as number, m.unit, m), {
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
    if (!data.customMarkers) data.customMarkers = {};
    for (const m of matched) {
      const [catKey, markerKey] = m.mappedKey!.split('.') as [string, string];
      const schemaMarker = MARKER_SCHEMA[catKey]?.markers?.[markerKey];
      const exactSpecialtyDef = SPECIALTY_MARKER_DEFS[m.mappedKey!]
        || MOSAIC_OAT_MARKERS[m.mappedKey!]
        || MOSAIC_MOAT_MARKERS[m.mappedKey!];
      const productBaseDef = catKey === 'spadiaFA'
        ? SPECIALTY_MARKER_DEFS[`fattyAcids.${markerKey}`]
        : null;
      const def: Partial<AdapterMarkerDefinition> = exactSpecialtyDef || productBaseDef || {};
      if (schemaMarker && !exactSpecialtyDef) continue;
      const existing = data.customMarkers[m.mappedKey!];
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
      ensureCustomMarkerIdentity(cmDef, data.customMarkers);
      data.customMarkers[m.mappedKey!] = cmDef;
    }
    // Save new (custom) marker values and definitions
    for (const m of newMarkers) {
      setLabEntryMarker(entry, m.suggestedKey!, normalizeToSI(m.suggestedKey!, m.value as number, m.unit, m), {
        now: importTs,
        source: { file: result.fileName || null, at: importTs, snapshotId },
      });
      const [catKey] = m.suggestedKey!.split('.') as [string];
      const schemaCategory = MARKER_SCHEMA[catKey];
      const categoryLabel = schemaCategory ? schemaCategory.label : m.suggestedCategoryLabel || catKey.charAt(0).toUpperCase() + catKey.slice(1);
      const existing = data.customMarkers[m.suggestedKey!];
      const cmDef = existing || {};
      cmDef.name = cmDef.name || _cleanImportedMarkerDisplayName(m.suggestedName || m.rawName);
      cmDef.unit = m.unit || cmDef.unit || '';
      cmDef.refMin = m.refMin != null ? m.refMin : cmDef.refMin;
      cmDef.refMax = m.refMax != null ? m.refMax : cmDef.refMax;
      // Always update organizational fields from latest import
      cmDef.categoryLabel = categoryLabel;
      // FA-normalized markers carry their own group — don't override with testType-based importGroup
      cmDef.group = m.suggestedGroup || importGroup || m.group || cmDef.group || null;
      ensureCustomMarkerIdentity(cmDef, data.customMarkers);
      data.customMarkers[m.suggestedKey!] = cmDef;
    }
    // Mirror insulin between hormones and diabetes categories (AI may map to either)
    syncLabEntryInsulinMirror(entry, { now: importTs });
    // The report-level choice is persisted with the snapshot. Active lab ranges
    // are recomputed after the snapshot is stored so collection date, rather
    // than upload order, determines which eligible interval wins.
    const adoptRanges = (document.getElementById('import-adopt-ranges')) as HTMLInputElement | null;
    const adoptReferenceRanges = adoptRanges ? adoptRanges.checked : result._adoptReferenceRanges !== false;
    for (const marker of matched) rangeAffectedKeys.add(marker.mappedKey!);
    // Persist import snapshot for later re-review without AI
    const snapshotPayload = (m: ImportReviewMarker) => ({
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
      panelId: entry.panelId,
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
      if (!data.importSnapshots) data.importSnapshots = [];
      clearTombstone(data, 'importSnapshots', snapshotId);
      const snapIdx = data.importSnapshots?.findIndex(s => s.id === snapshotId);
      if (snapIdx >= 0) {
        data.importSnapshots[snapIdx] = {
          ...data.importSnapshots[snapIdx],
          ...snapBase,
          markers: result.markers.map(m => snapshotPayload(m)),
          benchmarkAt: importTs,
          importedAt: importTs,
        };
      } else {
        data.importSnapshots.push({
          id: snapshotId,
          ...snapBase,
          markers: result.markers.map(m => snapshotPayload(m)),
          benchmarkAt: importTs,
          importedAt: importTs,
        });
      }
    } else {
      if (!data.importSnapshots) data.importSnapshots = [];
      data.importSnapshots.push({
        id: snapshotId,
        ...snapBase,
        markers: result.markers.map(m => snapshotPayload(m)),
        benchmarkAt: importTs,
        importedAt: importTs,
      });
    }
    recomputeActiveLabRanges(data, rangeAffectedKeys, profileSex);

    // Finalize the benchmark before the canonical import save so the health-data
    // snapshot and its comparable model run are committed atomically. Previously
    // the benchmark used a second fire-and-forget save and could remain "preview"
    // after a successful import.
    if (benchmarkId) markImportBenchmarkConfirmedInData(data, benchmarkId, result, excludedIdxs, importTs);
  } catch (error) {
    showNotification(error instanceof Error ? error.message : 'Could not prepare the import. No change was saved.', 'error');
    if (confirmBtn) confirmBtn.disabled = false;
    return;
  }
  const saved = await commitLabReportWrite(profileId, observed, base, data, () => state.currentProfile === profileId && state.importedData === observed && state.profileSex === profileSex && getPendingImport() === result);
  if (!saved) {
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

export async function deleteImportSnapshot(snapId: string) {
  const observed = state.importedData, profileId = state.currentProfile, profileSex = state.profileSex;
  const { base, next: data } = prepareLabReportWrite(observed);
  let snapshot: CommitSnapshot;
  if (!data.importSnapshots?.some(report => report.id === snapId)) { showNotification('Import snapshot not found', 'error'); return false; }
  try { snapshot = applyLabReportRemoval(data, snapId, profileSex).snapshot; }
  catch (error) { showNotification(error instanceof Error ? error.message : 'Could not prepare source removal. No change was saved.', 'error'); return false; }
  const saved = await commitLabReportWrite(profileId, observed, base, data, () => state.currentProfile === profileId && state.importedData === observed && state.profileSex === profileSex);
  if (!saved) {
    return false;
  }
  refreshImportedDataViews();
  showNotification(`Deleted import from ${snapshot.fileName || 'unknown'}`, 'info');
  return true;
}

export function openImportReviewFromSnapshot(snapId: string) {
  const data = state.importedData;
  const snapshot: CommitSnapshot | undefined = data?.importSnapshots?.find(s => s.id === snapId);
  if (!snapshot) {
    showNotification('Import snapshot not found', 'error');
    return;
  }
  if (!Array.isArray(snapshot.markers) || snapshot.markers.length === 0) {
    showNotification('This import has no saved marker review data', 'error');
    return;
  }
  let entry: LabEntry | null;
  try { entry = selectLabReportSample(data, snapshot); }
  catch (error) { showNotification(error instanceof Error ? error.message : 'Could not verify the report sample.', 'error'); return; }
  const entryContext = entry?.context || {};
  const snapshotOwnsSampleTime = snapshotOwnsCollectionContextField(snapshot, 'sampleTime');
  const snapshotOwnsFasting = snapshotOwnsCollectionContextField(snapshot, 'fasting');
  const result = {
    date: entry?.date || snapshot.date,
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
  try { bindImportReportReview(result, data, state.currentProfile, snapshot); }
  catch (error) { showNotification(error instanceof Error ? error.message : 'Could not verify the report sample.', 'error'); return; }
  showImportPreview(result);
}
