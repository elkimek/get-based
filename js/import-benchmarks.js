// @ts-check
// import-benchmarks.js - Durable, privacy-conscious diagnostics for AI import attempts.

import { getAIProvider, getActiveModelId, getOllamaConfig } from './api.js';
import { saveImportedData } from './data.js';
import { getCachedLocalAiModelDetail } from './local-ai-discovery.js';
import { state } from './state.js';

const MAX_BENCHMARKS = 50;

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

function runtimeSnapshot(provider, modelId) {
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
    loadedAtStart: detail.loaded,
  };
}

export function startImportBenchmark(meta = {}) {
  const provider = getAIProvider();
  const modelId = getActiveModelId();
  const now = Date.now();
  const record = {
    id: `bench_${now}_${Math.random().toString(36).slice(2, 7)}`,
    benchmarkAt: now,
    updatedAt: now,
    status: 'started',
    stage: 'start',
    fileName: String(meta.fileName || ''),
    fileSize: Math.max(0, Number(meta.fileSize) || 0),
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
  Object.assign(record, next, { updatedAt: Date.now() });
  if (options.persist !== false) saveImportedData({ immediate: true }).catch(() => {});
  return record;
}

export function finishImportBenchmark(id, status, patch = {}) {
  return updateImportBenchmark(id, { ...patch, status, finishedAt: Date.now() });
}

export function benchmarkResultPatch(result, totalMs) {
  const performance = result?.diagnostics?.performance || {};
  const localPlan = result?.diagnostics?.localPlan || {};
  const provider = result?.costInfo?.provider || result?.provider || getAIProvider();
  const modelId = result?.costInfo?.modelId || getActiveModelId(provider);
  return {
    markerCount: Array.isArray(result?.markers) ? result.markers.length : 0,
    testType: result?.testType || null,
    privacyMethod: result?.privacyMethod || null,
    totalMs: Math.max(0, Math.round(Number(totalMs) || 0)),
    timings: {
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
      estimatedPromptTokens: Math.max(0, Number(localPlan.estimatedPromptTokens) || 0),
      plannedMaxTokens: Math.max(0, Number(localPlan.plannedMaxTokens) || 0),
      contextLength: Math.max(0, Number(localPlan.contextLength) || 0),
    },
    runtime: runtimeSnapshot(provider, modelId),
  };
}

export function markImportBenchmarkConfirmed(id, result, excludedIndices) {
  const initial = Array.isArray(result?._benchmarkInitialMappings) ? result._benchmarkInitialMappings : [];
  const markers = Array.isArray(result?.markers) ? result.markers : [];
  const correctedMappings = markers.reduce((count, marker, index) => {
    const current = marker?.mappedKey || marker?.suggestedKey || null;
    return count + (initial[index] !== undefined && initial[index] !== current ? 1 : 0);
  }, 0);
  finishImportBenchmark(id, 'confirmed', {
    importedMarkerCount: markers.filter((marker, index) => !excludedIndices.has(index) && (marker?.mappedKey || marker?.suggestedKey)).length,
    excludedMarkerCount: excludedIndices.size,
    correctedMappingCount: correctedMappings,
  });
}

export function getImportBenchmarks() {
  return ensureBenchmarks().slice().sort((a, b) => (b.benchmarkAt || 0) - (a.benchmarkAt || 0));
}
