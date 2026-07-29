// @ts-check
// import-benchmarks.js - Durable, privacy-conscious diagnostics for AI import attempts.

import { getAIProvider, getActiveModelId, getOllamaConfig } from './api.js';
import { saveImportedData } from './data.js';
import { getCachedLocalAiModelDetail } from './local-ai-discovery.js';
import { state } from './state.js';
import { createUniqueId } from './unique-id.js';

const MAX_BENCHMARKS = 50;
const MAX_DELETED_BENCHMARK_IDS = 100;
export const IMPORT_REFERENCE_DISCREPANCIES_VERSION = 2;

function normalizedReferenceIssueText(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(/[\u200b-\u200d\u2060\ufeff]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function equivalentReferenceIssue(issue) {
  if (issue?.field !== 'value' && issue?.field !== 'reference-range') return false;
  const expected = normalizedReferenceIssueText(issue?.expected);
  const actual = normalizedReferenceIssueText(issue?.actual);
  return expected !== '' && expected === actual;
}

function roundedReferencePercent(count, total) {
  return total > 0 ? Math.round((count / total) * 1000) / 10 : 0;
}

function increaseReferencePercent(record, key, correctedCount, totalChecks) {
  const current = Number(record?.[key]);
  if (!Number.isFinite(current) || correctedCount <= 0 || totalChecks <= 0) return;
  record[key] = Math.min(100, Math.round((current + (correctedCount / totalChecks) * 100) * 10) / 10);
}

// v1 compared eGFR values asymmetrically when one equivalent area unit used
// the superscript form (m²) and the other used ASCII (m2). Repair already
// saved diagnostics whose rendered expected/actual values are identical.
function repairEquivalentReferenceIssues(record) {
  const version = Number(record?.referenceDiscrepanciesVersion) || 0;
  if (version <= 0 || version >= IMPORT_REFERENCE_DISCREPANCIES_VERSION || !Array.isArray(record?.referenceDiscrepancies)) {
    return false;
  }
  let correctedValues = 0;
  let correctedRanges = 0;
  let correctedExactMarkers = 0;
  const groups = [];
  for (const group of record.referenceDiscrepancies) {
    if (!group || !Array.isArray(group.issues)) continue;
    const issues = group.issues.filter(issue => {
      if (!equivalentReferenceIssue(issue)) return true;
      if (issue.field === 'value') correctedValues++;
      if (issue.field === 'reference-range') correctedRanges++;
      return false;
    });
    if (issues.length > 0) groups.push({ ...group, issues });
    else if (group.scope === 'lab-data' && group.kind === 'mismatch' && group.issues.length > 0) correctedExactMarkers++;
  }

  record.referenceDiscrepancies = groups;
  record.referenceDiscrepanciesVersion = IMPORT_REFERENCE_DISCREPANCIES_VERSION;
  const dataGroups = groups.filter(group => group.scope === 'lab-data');
  const reportGroups = groups.filter(group => group.scope === 'report-details');
  record.referenceDataDiscrepancyCount = dataGroups.reduce((count, group) => count + group.issues.length, 0);
  record.referenceReportDiscrepancyCount = reportGroups.reduce((count, group) => count + group.issues.length, 0);
  record.referenceDiscrepancyCount = record.referenceDataDiscrepancyCount + record.referenceReportDiscrepancyCount;
  record.referenceAffectedMarkerCount = dataGroups.length;

  const expectedCount = Math.max(0, Number(record.referenceExpectedMarkerCount) || 0);
  const correctedFields = correctedValues + correctedRanges;
  increaseReferencePercent(record, 'referenceValueAccuracyPercent', correctedValues, expectedCount);
  increaseReferencePercent(record, 'referenceRangeAccuracyPercent', correctedRanges, expectedCount);
  increaseReferencePercent(record, 'referenceFieldAccuracyPercent', correctedFields, expectedCount * 4);
  increaseReferencePercent(record, 'referencePipelineFieldAccuracyPercent', correctedFields, expectedCount * 4);
  if (correctedExactMarkers > 0 && expectedCount > 0) {
    const exactCount = Math.min(expectedCount, Math.max(0, Number(record.referenceExactMarkerCount) || 0) + correctedExactMarkers);
    record.referenceExactMarkerCount = exactCount;
    record.referenceExactMarkerPercent = roundedReferencePercent(exactCount, expectedCount);
    if (record.referencePipelineExactMarkerCount != null) {
      const pipelineExactCount = Math.min(expectedCount, Math.max(0, Number(record.referencePipelineExactMarkerCount) || 0) + correctedExactMarkers);
      record.referencePipelineExactMarkerCount = pipelineExactCount;
      record.referencePipelineExactMarkerPercent = roundedReferencePercent(pipelineExactCount, expectedCount);
      if (pipelineExactCount === expectedCount && record.referenceDateCorrect === true && record.referenceTestTypeCorrect === true) {
        record.referencePipelineExactMatch = true;
      }
    }
    if (exactCount === expectedCount
      && Number(record.referenceReturnedMarkerCount) === expectedCount
      && record.referenceDateCorrect === true
      && record.referenceTestTypeCorrect === true
      && record.referenceDiscrepancyCount === 0) {
      record.referenceExactMatch = true;
    }
  }
  return true;
}

function ensureBenchmarks() {
  const importedData = /** @type {any} */ (state.importedData);
  if (!Array.isArray(importedData.importBenchmarks)) importedData.importBenchmarks = [];
  return importedData.importBenchmarks;
}

function scrubError(value) {
  return String(value || '')
    .replace(/\bBearer\s+\S+/gi, 'Bearer [redacted]')
    .replace(/\bsk-[A-Za-z0-9._~+/=-]+/g, '[redacted]')
    .slice(0, 500);
}

function runtimeSnapshot(provider, modelId, { includeLoadedState = true } = {}) {
  if (provider !== 'ollama') return null;
  const config = getOllamaConfig();
  const detail = getCachedLocalAiModelDetail(config.url, modelId, config.apiKey);
  if (!detail) return null;
  return {
    provider: detail.source || 'local-ai',
    executionLocation: detail.executionLocation || 'unknown',
    quantLevel: detail.quantLevel || '',
    parameterSize: detail.paramSize || '',
    modelSize: Number(detail.size) || 0,
    contextLength: Number(detail.contextLength) || 0,
    maxContextLength: Number(detail.maxContextLength) || 0,
    vramAllocated: Number(detail.vramAllocated) || 0,
    loadedAtStart: includeLoadedState ? detail.loaded : null,
  };
}

export function startImportBenchmark(meta = {}) {
  const provider = meta.provider || getAIProvider();
  const modelId = meta.modelId || getActiveModelId(provider);
  const now = Date.now();
  const record = {
    id: createUniqueId('bench_'),
    benchmarkAt: now,
    updatedAt: now,
    status: 'started',
    stage: 'start',
    fileName: String(meta.fileName || ''),
    fileSize: Math.max(0, Number(meta.fileSize) || 0),
    inputHash: String(meta.inputHash || ''),
    importMode: meta.importMode || 'text',
    inputChars: Math.max(0, Number(meta.inputChars) || 0),
    pageCount: Math.max(0, Number(meta.pageCount) || 0),
    provider,
    modelId,
    runtime: runtimeSnapshot(provider, modelId),
    timings: {},
    usage: {},
    diagnostics: {},
  };
  const benchmarks = ensureBenchmarks();
  benchmarks.push(record);
  if (benchmarks.length > MAX_BENCHMARKS) benchmarks.splice(0, benchmarks.length - MAX_BENCHMARKS);
  return record.id;
}

/** @param {string} id @param {any} patch @param {{persist?: boolean}} options */
export function updateImportBenchmark(id, patch = {}, options = {}) {
  const record = ensureBenchmarks().find(item => item.id === id);
  if (!record) return null;
  const next = { ...patch };
  if (next.error) next.error = scrubError(next.error);
  if (next.timings) next.timings = { ...record.timings, ...next.timings };
  if (next.usage) next.usage = { ...record.usage, ...next.usage };
  if (next.diagnostics) next.diagnostics = { ...record.diagnostics, ...next.diagnostics };
  if (next.runtime) {
    const loadedAtStart = record.runtime?.loadedAtStart;
    next.runtime = {
      ...(record.runtime || {}),
      ...next.runtime,
      loadedAtStart: typeof loadedAtStart === 'boolean' ? loadedAtStart : null,
    };
  }
  Object.assign(record, next, { updatedAt: Date.now() });
  if (options.persist !== false) persistImportBenchmarks().catch(() => {});
  return record;
}

/** @param {string} id @param {string} status @param {any} patch @param {{persist?: boolean}} options */
export function finishImportBenchmark(id, status, patch = {}, options = {}) {
  return updateImportBenchmark(id, { ...patch, status, finishedAt: Date.now() }, options);
}

export function persistImportBenchmarks() {
  // Benchmark history describes this browser's hardware/runtime and is
  // intentionally device-local. Do not wake cross-device sync for it.
  return saveImportedData({ immediate: true, skipSync: true });
}

/** @param {string | null | undefined} provider */
function providerDisplayName(provider) {
  const names = {
    custom: 'Custom API',
    getbased: 'getbased',
    lmstudio: 'LM Studio',
    ollama: 'Ollama',
    openrouter: 'OpenRouter',
    ppq: 'PPQ',
    routstr: 'Routstr',
    venice: 'Venice',
  };
  return names[provider] || String(provider || 'Unknown');
}

/** @param {any} [snapshot] */
export function getImportBenchmarkProviderLabel(snapshot = null) {
  const provider = snapshot?.provider || snapshot?.costInfo?.provider || getAIProvider();
  if (provider !== 'ollama') return providerDisplayName(provider);
  const modelId = snapshot?.modelId || snapshot?.costInfo?.modelId || getActiveModelId(provider);
  const runtimeSource = snapshot?.runtime?.provider;
  const detail = runtimeSource
    ? null
    : getCachedLocalAiModelDetail(getOllamaConfig().url, modelId, getOllamaConfig().apiKey);
  const backend = runtimeSource || detail?.source || '';
  if (backend === 'lmstudio') return 'LM Studio';
  if (backend === 'ollama') return 'Ollama';
  if (backend && backend !== 'local-ai') return providerDisplayName(backend);
  return 'Local AI';
}

export function benchmarkResultPatch(result, totalMs) {
  const performance = result?.diagnostics?.performance || {};
  const localPlan = result?.diagnostics?.localPlan || {};
  const provider = result?.costInfo?.provider || result?.provider || getAIProvider();
  const modelId = result?.costInfo?.modelId || getActiveModelId(provider);
  return {
    inputHash: String(result?.importHash || result?.inputHash || ''),
    markerCount: Array.isArray(result?.markers) ? result.markers.length : 0,
    testType: result?.testType || null,
    privacyMethod: result?.privacyMethod || null,
    totalMs: Math.max(0, Math.round(Number(totalMs) || 0)),
    timings: {
      pdfExtractionMs: Math.max(0, Number(result?.timings?.pdfExtractionMs) || 0),
      piiMs: Math.max(0, Number(result?.timings?.piiMs) || 0),
      analysisMs: Math.max(0, Number(result?.timings?.analysisMs) || 0),
      modelLoadMs: Math.max(0, Number(performance.modelLoadMs) || 0),
      timeToFirstTokenMs: Math.max(0, Number(performance.timeToFirstTokenMs) || 0),
    },
    usage: {
      inputTokens: Math.max(0, Number(result?.costInfo?.inputTokens || result?.usage?.inputTokens) || 0),
      outputTokens: Math.max(0, Number(result?.costInfo?.outputTokens || result?.usage?.outputTokens) || 0),
      reasoningTokens: Math.max(0, Number(performance.reasoningTokens) || 0),
    },
    generationTokensPerSecond: Math.max(0, Number(performance.tokensPerSecond) || 0),
    diagnostics: {
      streamFallback: !!result?.diagnostics?.streamFallback,
      structuredOutputFallback: !!result?.diagnostics?.structuredOutputFallback,
      reasoningControlFallback: !!result?.diagnostics?.reasoningControlFallback,
      nativeContextOverride: !!result?.diagnostics?.nativeContextOverride,
      providerApi: String(result?.diagnostics?.providerApi || ''),
      estimatedPromptTokens: Math.max(0, Number(localPlan.estimatedPromptTokens) || 0),
      plannedMaxTokens: Math.max(0, Number(localPlan.plannedMaxTokens) || 0),
      contextLength: Math.max(0, Number(localPlan.contextLength) || 0),
      maxContextLength: Math.max(0, Number(localPlan.maxContextLength) || 0),
    },
    runtime: runtimeSnapshot(provider, modelId, { includeLoadedState: false }),
  };
}

export function captureImportBenchmarkReviewBaseline(result) {
  if (!result || !Array.isArray(result.markers)) return result;
  result._benchmarkInitialMappings = result.markers.map(marker => marker?.mappedKey || marker?.suggestedKey || null);
  result._benchmarkInitialDate = result.date || null;
  return result;
}

export function importBenchmarkReviewPatch(result, excludedIndices) {
  const initial = Array.isArray(result?._benchmarkInitialMappings) ? result._benchmarkInitialMappings : [];
  const markers = Array.isArray(result?.markers) ? result.markers : [];
  const excluded = excludedIndices instanceof Set ? excludedIndices : new Set(excludedIndices || []);
  const importedIndices = [];
  const unmappedIndices = [];
  const correctedMappingIndices = new Set();
  const valueCorrectionIndices = new Set();
  const unitCorrectionIndices = new Set();

  markers.forEach((marker, index) => {
    if (excluded.has(index)) return;
    const current = marker?.mappedKey || marker?.suggestedKey || null;
    if (!current) {
      unmappedIndices.push(index);
      return;
    }
    importedIndices.push(index);
    if (initial[index] !== undefined && initial[index] !== current) correctedMappingIndices.add(index);
    if (marker?._benchmarkValueEdited) valueCorrectionIndices.add(index);
    if (marker?._benchmarkUnitEdited) unitCorrectionIndices.add(index);
  });

  const correctedMarkerIndices = new Set([
    ...correctedMappingIndices,
    ...valueCorrectionIndices,
    ...unitCorrectionIndices,
  ]);
  const importedMarkerCount = importedIndices.length;
  const correctedMarkerCount = correctedMarkerIndices.size;
  return {
    importedMarkerCount,
    cleanImportedMarkerCount: Math.max(0, importedMarkerCount - correctedMarkerCount),
    unmappedMarkerCount: unmappedIndices.length,
    excludedMarkerCount: excluded.size,
    correctedMarkerCount,
    correctedMappingCount: correctedMappingIndices.size,
    correctedValueCount: valueCorrectionIndices.size,
    correctedUnitCount: unitCorrectionIndices.size,
    dateCorrectionCount: result?._benchmarkDateEdited ? 1 : 0,
  };
}

/** @param {string} id @param {any} result @param {Set<number>|number[]} excludedIndices @param {{persist?: boolean}} options */
export function markImportBenchmarkConfirmed(id, result, excludedIndices, options = {}) {
  return finishImportBenchmark(id, 'confirmed', importBenchmarkReviewPatch(result, excludedIndices), options);
}

export function getImportBenchmarks() {
  const benchmarks = ensureBenchmarks();
  let repaired = false;
  for (const record of benchmarks) repaired = repairEquivalentReferenceIssues(record) || repaired;
  if (repaired) persistImportBenchmarks().catch(() => {});
  return benchmarks.slice().sort((a, b) => (b.benchmarkAt || 0) - (a.benchmarkAt || 0));
}

// v1.10.302 saved the successful import snapshot before its benchmark was
// marked confirmed. If that second save was interrupted, the durable snapshot
// still proves the model run completed and lets us safely restore comparison.
export function recoverConfirmedImportBenchmarks(importSnapshots = []) {
  if (!Array.isArray(importSnapshots) || importSnapshots.length === 0) return 0;
  const records = new Map(ensureBenchmarks().map(record => [String(record?.id || ''), record]));
  let recovered = 0;
  for (const snapshot of importSnapshots) {
    const benchmarkId = String(snapshot?.benchmarkId || '');
    const record = records.get(benchmarkId);
    if (!record || record.status !== 'preview') continue;
    const detectedCount = Math.max(0, Number(record.markerCount) || 0);
    const importedCount = Math.max(0, Number(snapshot.markerCount) || 0);
    const excludedCount = Array.isArray(snapshot.excludedIndices) ? snapshot.excludedIndices.length : 0;
    Object.assign(record, {
      status: 'confirmed',
      stage: 'review',
      importedMarkerCount: importedCount,
      excludedMarkerCount: excludedCount,
      unmappedMarkerCount: Math.max(0, detectedCount - importedCount - excludedCount),
      inputHash: String(record.inputHash || snapshot.importHash || ''),
      finishedAt: Number(snapshot.importedAt) || record.finishedAt || Date.now(),
      updatedAt: Date.now(),
      recoveredFromImportSnapshot: true,
    });
    recovered++;
  }
  if (recovered > 0) persistImportBenchmarks().catch(() => {});
  return recovered;
}

export function getDeletedImportBenchmarkIds() {
  const importedData = /** @type {any} */ (state.importedData);
  return Array.isArray(importedData.deletedImportBenchmarkIds)
    ? importedData.deletedImportBenchmarkIds.map(String)
    : [];
}

export async function deleteImportBenchmarks(ids) {
  const requestedIds = [...new Set((Array.isArray(ids) ? ids : [ids]).map(String).filter(Boolean))];
  if (requestedIds.length === 0) return 0;

  const importedData = /** @type {any} */ (state.importedData);
  const previousBenchmarks = ensureBenchmarks();
  const hadDeletedIds = Object.prototype.hasOwnProperty.call(importedData, 'deletedImportBenchmarkIds');
  const previousDeletedIds = importedData.deletedImportBenchmarkIds;
  const requested = new Set(requestedIds);
  importedData.importBenchmarks = previousBenchmarks.filter(item => !requested.has(String(item?.id || '')));
  importedData.deletedImportBenchmarkIds = [...new Set([
    ...getDeletedImportBenchmarkIds(),
    ...requestedIds,
  ])].slice(-MAX_DELETED_BENCHMARK_IDS);

  const saved = await persistImportBenchmarks();
  if (!saved) {
    importedData.importBenchmarks = previousBenchmarks;
    if (hadDeletedIds) importedData.deletedImportBenchmarkIds = previousDeletedIds;
    else delete importedData.deletedImportBenchmarkIds;
    return 0;
  }
  return requestedIds.length;
}
