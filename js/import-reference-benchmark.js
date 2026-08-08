// @ts-check
// import-reference-benchmark.js - Bundled synthetic gold-reference scoring.

import { getErrorMessage } from './caught-error.js';
import { getAIProvider, getActiveModelId, hasAIProvider } from './api.js';
import { loadPdfImport } from './import-loader.js';
import {
  benchmarkResultPatch,
  finishImportBenchmark,
  IMPORT_REFERENCE_DISCREPANCIES_VERSION,
  persistImportBenchmarks,
  startImportBenchmark,
  updateImportBenchmark,
} from './import-benchmarks.js';
import { normalizeToSI } from './pdf-import-marker-mapping.js';
import { getUsageTokens } from './pdf-import-ai-utils.js';
import { calculateCost, trackUsage } from './schema.js';

export const IMPORT_REFERENCE_MANIFEST_PATH = '/data/import-benchmark-reference-us-v2.gold.json';
export const IMPORT_REFERENCE_FIXTURE = Object.freeze({
  id: 'getbased-reference-us-v2',
  version: 2,
  label: 'Synthetic US reference-lab comprehensive report',
  fileName: 'getbased-reference-us-v2.pdf',
  sourcePath: '/data/import-benchmark-reference-us-v2.pdf',
  expectedMarkerCount: 68,
});
export const IMPORT_REFERENCE_PROTOCOL_VERSION = 2;

const MAX_REFERENCE_DISCREPANCIES = 100;
const MAX_REFERENCE_DISCREPANCY_TEXT = 180;
const REFERENCE_INPUT_HASH = `reference:${IMPORT_REFERENCE_FIXTURE.id}@${IMPORT_REFERENCE_FIXTURE.version}`;
let referenceBenchmarkRunning = false;

export function isBundledImportReferenceBenchmarkRunning() {
  return referenceBenchmarkRunning;
}

export function getBundledImportReferenceGoldBenchmark() {
  const expected = IMPORT_REFERENCE_FIXTURE.expectedMarkerCount;
  return {
    id: `gold_${IMPORT_REFERENCE_FIXTURE.id}`,
    benchmarkAt: 0,
    updatedAt: 0,
    finishedAt: 0,
    status: 'reference-passed',
    stage: 'complete',
    benchmarkKind: 'reference-gold',
    benchmarkLocked: true,
    referenceFixtureId: IMPORT_REFERENCE_FIXTURE.id,
    referenceFixtureVersion: IMPORT_REFERENCE_FIXTURE.version,
    referenceProtocolVersion: IMPORT_REFERENCE_PROTOCOL_VERSION,
    referenceLabel: IMPORT_REFERENCE_FIXTURE.label,
    fileName: IMPORT_REFERENCE_FIXTURE.fileName,
    inputHash: REFERENCE_INPUT_HASH,
    importMode: 'reference',
    provider: 'getbased',
    modelId: 'Answer key',
    markerCount: expected,
    referenceExpectedMarkerCount: expected,
    referenceReturnedMarkerCount: expected,
    referenceDetectedMarkerCount: expected,
    referenceMissingMarkerCount: 0,
    referenceUnexpectedMarkerCount: 0,
    referenceExactMarkerCount: expected,
    referencePrecisionPercent: 100,
    referenceRecallPercent: 100,
    referenceF1Percent: 100,
    referenceMappingAccuracyPercent: 100,
    referenceValueAccuracyPercent: 100,
    referenceUnitAccuracyPercent: 100,
    referenceRangeAccuracyPercent: 100,
    referenceExactMarkerPercent: 100,
    referenceFieldAccuracyPercent: 100,
    referencePipelineReturnedMarkerCount: expected,
    referencePipelineDetectedMarkerCount: expected,
    referencePipelineExactMarkerCount: expected,
    referencePipelineExactMarkerPercent: 100,
    referencePipelineFieldAccuracyPercent: 100,
    referencePipelineMappingAccuracyPercent: 100,
    referencePipelineExactMatch: true,
    referenceDateCorrect: true,
    referenceTestTypeCorrect: true,
    referenceExactMatch: true,
    referenceDiscrepanciesVersion: IMPORT_REFERENCE_DISCREPANCIES_VERSION,
    referenceDiscrepancyCount: 0,
    referenceDataDiscrepancyCount: 0,
    referenceReportDiscrepancyCount: 0,
    referenceAffectedMarkerCount: 0,
    referenceDiscrepancies: [],
    timings: {},
    usage: {},
    diagnostics: {},
  };
}

function referencePipelineScorePatch(score) {
  return {
    referencePipelineReturnedMarkerCount: score.referenceReturnedMarkerCount,
    referencePipelineDetectedMarkerCount: score.referenceDetectedMarkerCount,
    referencePipelineExactMarkerCount: score.referenceExactMarkerCount,
    referencePipelineExactMarkerPercent: score.referenceExactMarkerPercent,
    referencePipelineFieldAccuracyPercent: score.referenceFieldAccuracyPercent,
    referencePipelineMappingAccuracyPercent: score.referenceMappingAccuracyPercent,
    referencePipelineExactMatch: score.referenceExactMatch,
  };
}

export function scoreReferenceModelAndPipeline(modelResult, pipelineResult, expected) {
  return {
    ...scoreReferenceImport(modelResult, expected),
    ...referencePipelineScorePatch(scoreReferenceImport(pipelineResult, expected)),
  };
}

function normalizedName(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function normalizedUnit(value) {
  return String(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\u00b5\u03bc]/g, 'u')
    .replace(/^mcg/, 'ug')
    .replace(/^iu\//, 'u/')
    .replace(/^ug\/l$/, 'ng/ml')
    .replace(/miu\/l/g, 'mu/l')
    .replace(/^[x\u00d7]10/, '10')
    .replace(/\*/g, '^')
    .replace(/\s+/g, '');
}

function nearlyEqual(actual, expected) {
  if (!Number.isFinite(actual) || !Number.isFinite(expected)) return false;
  return Math.abs(actual - expected) <= Math.max(1e-6, Math.abs(expected) * 1e-6);
}

function normalizedMarkerNumber(marker, key, field) {
  const raw = Number(marker?.[field]);
  if (!Number.isFinite(raw)) return null;
  const normalized = normalizeToSI(key, raw, marker?.unit || null, marker);
  return Number.isFinite(normalized) ? normalized : raw;
}

function markerNumberMatches(actual, expected, field) {
  const expectedValue = expected?.[field];
  const actualValue = actual?.[field];
  if (expectedValue == null || actualValue == null) return expectedValue == null && actualValue == null;
  const key = expected.mappedKey;
  return nearlyEqual(
    normalizedMarkerNumber(actual, key, field),
    normalizedMarkerNumber(expected, key, field),
  );
}

function roundedPercent(numerator, denominator) {
  if (!denominator) return 0;
  return Math.round((numerator / denominator) * 1000) / 10;
}

/** @param {any} value @param {string} [fallback] */
function discrepancyText(value, fallback = '\u2014') {
  const text = String(value ?? '').trim();
  return (text || fallback).slice(0, MAX_REFERENCE_DISCREPANCY_TEXT);
}

/** @param {any} marker */
function markerResultText(marker) {
  const value = discrepancyText(marker?.value, 'Missing');
  const unit = discrepancyText(marker?.unit, '');
  return unit ? `${value} ${unit}` : value;
}

/** @param {any} marker */
function markerRangeText(marker) {
  const min = marker?.refMin == null ? '\u2014' : discrepancyText(marker.refMin);
  const max = marker?.refMax == null ? '\u2014' : discrepancyText(marker.refMax);
  return `${min} to ${max}`;
}

/** @param {any} marker */
function markerMappingText(marker) {
  const name = discrepancyText(marker?.rawName, 'Unnamed result');
  const key = discrepancyText(marker?.mappedKey || marker?.suggestedKey, 'unmatched');
  return `${name} \u2192 ${key}`;
}

/** @param {any[]} discrepancies @param {any} discrepancy */
function appendReferenceDiscrepancy(discrepancies, discrepancy) {
  if (discrepancies.length >= MAX_REFERENCE_DISCREPANCIES) return false;
  discrepancies.push(discrepancy);
  return true;
}

export function scoreReferenceImport(result, expected) {
  const expectedMarkers = Array.isArray(expected?.markers) ? expected.markers : [];
  const returnedMarkers = Array.isArray(result?.markers) ? result.markers : [];
  const unusedReturned = new Set(returnedMarkers.map((_, index) => index));
  const referenceDiscrepancies = [];
  let referenceDiscrepanciesTruncated = false;
  let detectedCount = 0;
  let mappingCount = 0;
  let valueCount = 0;
  let unitCount = 0;
  let rangeCount = 0;
  let exactMarkerCount = 0;

  for (const expectedMarker of expectedMarkers) {
    const expectedName = normalizedName(expectedMarker.rawName);
    let matchIndex = returnedMarkers.findIndex((marker, index) => (
      unusedReturned.has(index) && normalizedName(marker?.rawName) === expectedName
    ));
    if (matchIndex < 0) {
      matchIndex = returnedMarkers.findIndex((marker, index) => (
        unusedReturned.has(index)
        && expectedMarker.mappedKey
        && (marker?.mappedKey || marker?.suggestedKey) === expectedMarker.mappedKey
      ));
    }
    if (matchIndex < 0) {
      referenceDiscrepanciesTruncated = !appendReferenceDiscrepancy(referenceDiscrepancies, {
        kind: 'missing',
        scope: 'lab-data',
        markerName: discrepancyText(expectedMarker.rawName, 'Expected result'),
        section: discrepancyText(expectedMarker.section, 'Lab results'),
        issues: [{
          field: 'result',
          label: 'Missing result',
          expected: markerResultText(expectedMarker),
          actual: 'Not returned',
        }],
      }) || referenceDiscrepanciesTruncated;
      continue;
    }

    unusedReturned.delete(matchIndex);
    detectedCount++;
    const actualMarker = returnedMarkers[matchIndex];
    const mappingCorrect = (actualMarker?.mappedKey || actualMarker?.suggestedKey || null) === expectedMarker.mappedKey;
    const valueCorrect = markerNumberMatches(actualMarker, expectedMarker, 'value');
    const unitCorrect = normalizedUnit(actualMarker?.unit) === normalizedUnit(expectedMarker.unit);
    const rangeCorrect = markerNumberMatches(actualMarker, expectedMarker, 'refMin')
      && markerNumberMatches(actualMarker, expectedMarker, 'refMax');
    const issues = [];
    if (!mappingCorrect) {
      issues.push({
        field: 'mapping',
        label: 'Marker assignment',
        expected: markerMappingText(expectedMarker),
        actual: markerMappingText(actualMarker),
      });
    }
    if (!valueCorrect) {
      issues.push({
        field: 'value',
        label: 'Result value',
        expected: discrepancyText(expectedMarker.value),
        actual: discrepancyText(actualMarker?.value, 'Missing'),
      });
    }
    if (!unitCorrect) {
      issues.push({
        field: 'unit',
        label: valueCorrect ? 'Unit format' : 'Result unit',
        expected: discrepancyText(expectedMarker.unit, 'No unit'),
        actual: discrepancyText(actualMarker?.unit, 'No unit'),
        note: valueCorrect ? 'The normalized value matches, but the returned unit differs from the report.' : '',
      });
    }
    if (!rangeCorrect) {
      issues.push({
        field: 'reference-range',
        label: 'Reference range',
        expected: markerRangeText(expectedMarker),
        actual: markerRangeText(actualMarker),
      });
    }
    if (issues.length > 0) {
      referenceDiscrepanciesTruncated = !appendReferenceDiscrepancy(referenceDiscrepancies, {
        kind: 'mismatch',
        scope: 'lab-data',
        markerName: discrepancyText(expectedMarker.rawName, 'Lab result'),
        actualName: discrepancyText(actualMarker?.rawName, 'Unnamed result'),
        section: discrepancyText(expectedMarker.section, 'Lab results'),
        issues,
      }) || referenceDiscrepanciesTruncated;
    }
    if (mappingCorrect) mappingCount++;
    if (valueCorrect) valueCount++;
    if (unitCorrect) unitCount++;
    if (rangeCorrect) rangeCount++;
    if (mappingCorrect && valueCorrect && unitCorrect && rangeCorrect) exactMarkerCount++;
  }

  const expectedCount = expectedMarkers.length;
  const returnedCount = returnedMarkers.length;
  const precision = roundedPercent(detectedCount, returnedCount);
  const recall = roundedPercent(detectedCount, expectedCount);
  const f1 = precision + recall > 0
    ? Math.round(((2 * precision * recall) / (precision + recall)) * 10) / 10
    : 0;
  const dateCorrect = String(result?.date || '') === String(expected?.date || '');
  const testTypeCorrect = String(result?.testType || '').toLowerCase() === String(expected?.testType || '').toLowerCase();
  for (const index of unusedReturned) {
    const marker = returnedMarkers[index];
    referenceDiscrepanciesTruncated = !appendReferenceDiscrepancy(referenceDiscrepancies, {
      kind: 'unexpected',
      scope: 'lab-data',
      markerName: discrepancyText(marker?.rawName || marker?.mappedKey, 'Unexpected result'),
      section: 'Unexpected result',
      issues: [{
        field: 'result',
        label: 'Unexpected result',
        expected: 'Not in the answer key',
        actual: markerResultText(marker),
      }],
    }) || referenceDiscrepanciesTruncated;
  }
  const reportIssues = [];
  if (!dateCorrect) {
    reportIssues.push({
      field: 'collection-date',
      label: 'Collection date',
      expected: discrepancyText(expected?.date, 'Missing'),
      actual: discrepancyText(result?.date, 'Missing'),
    });
  }
  if (!testTypeCorrect) {
    reportIssues.push({
      field: 'report-type',
      label: 'Report type',
      expected: discrepancyText(expected?.testType, 'Missing'),
      actual: discrepancyText(result?.testType, 'Missing'),
    });
  }
  if (reportIssues.length > 0) {
    referenceDiscrepanciesTruncated = !appendReferenceDiscrepancy(referenceDiscrepancies, {
      kind: 'report-details',
      scope: 'report-details',
      markerName: 'Report details',
      section: 'Report information',
      issues: reportIssues,
    }) || referenceDiscrepanciesTruncated;
  }
  const fieldChecks = expectedCount * 4;
  const correctFieldChecks = mappingCount + valueCount + unitCount + rangeCount;
  const exactMatch = expectedCount > 0
    && returnedCount === expectedCount
    && exactMarkerCount === expectedCount
    && dateCorrect
    && testTypeCorrect;
  const referenceDataDiscrepancyCount = referenceDiscrepancies
    .filter(item => item.scope === 'lab-data')
    .reduce((count, item) => count + item.issues.length, 0);
  const referenceReportDiscrepancyCount = referenceDiscrepancies
    .filter(item => item.scope === 'report-details')
    .reduce((count, item) => count + item.issues.length, 0);

  return {
    referenceExpectedMarkerCount: expectedCount,
    referenceReturnedMarkerCount: returnedCount,
    referenceDetectedMarkerCount: detectedCount,
    referenceMissingMarkerCount: Math.max(0, expectedCount - detectedCount),
    referenceUnexpectedMarkerCount: unusedReturned.size,
    referenceExactMarkerCount: exactMarkerCount,
    referencePrecisionPercent: precision,
    referenceRecallPercent: recall,
    referenceF1Percent: f1,
    referenceMappingAccuracyPercent: roundedPercent(mappingCount, expectedCount),
    referenceValueAccuracyPercent: roundedPercent(valueCount, expectedCount),
    referenceUnitAccuracyPercent: roundedPercent(unitCount, expectedCount),
    referenceRangeAccuracyPercent: roundedPercent(rangeCount, expectedCount),
    referenceExactMarkerPercent: roundedPercent(exactMarkerCount, expectedCount),
    referenceFieldAccuracyPercent: roundedPercent(correctFieldChecks, fieldChecks),
    referenceDateCorrect: dateCorrect,
    referenceTestTypeCorrect: testTypeCorrect,
    referenceExactMatch: exactMatch,
    referenceDiscrepanciesVersion: IMPORT_REFERENCE_DISCREPANCIES_VERSION,
    referenceDiscrepancyCount: referenceDataDiscrepancyCount + referenceReportDiscrepancyCount,
    referenceDataDiscrepancyCount,
    referenceReportDiscrepancyCount,
    referenceAffectedMarkerCount: referenceDiscrepancies.filter(item => item.scope === 'lab-data').length,
    referenceDiscrepanciesTruncated,
    referenceDiscrepancies,
  };
}

export async function loadImportReferenceManifest() {
  const response = await fetch(IMPORT_REFERENCE_MANIFEST_PATH, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Could not load bundled reference manifest (${response.status}).`);
  const manifest = await response.json();
  if (!manifest?.id || !manifest?.sourcePath || !Array.isArray(manifest?.expected?.markers)) {
    throw new Error('Bundled reference manifest is invalid.');
  }
  return manifest;
}

/** @param {{onProgress?: (pct: number, label?: string) => void}} [options] */
export async function runBundledImportReferenceBenchmark({ onProgress } = {}) {
  if (referenceBenchmarkRunning) throw new Error('A sample-report model test is already running.');
  referenceBenchmarkRunning = true;
  try {
    if (!hasAIProvider()) throw new Error('Choose an AI provider before testing a model.');
    const providerAtStart = getAIProvider();
    const modelIdAtStart = getActiveModelId(providerAtStart);
    onProgress?.(2, 'Opening sample report');
    const manifest = await loadImportReferenceManifest();
    const sourceResponse = await fetch(manifest.sourcePath, { cache: 'no-store' });
    if (!sourceResponse.ok) throw new Error(`Could not load bundled reference report (${sourceResponse.status}).`);
    const sourceBuffer = await sourceResponse.arrayBuffer();
    const sourceFile = new File([sourceBuffer], manifest.fileName, { type: 'application/pdf' });
    const benchmarkId = startImportBenchmark({
      fileName: manifest.fileName,
      fileSize: sourceFile.size,
      inputHash: REFERENCE_INPUT_HASH,
      provider: providerAtStart,
      modelId: modelIdAtStart,
      importMode: 'reference',
      pageCount: Number(manifest.pageCount) || 3,
    });
    updateImportBenchmark(benchmarkId, {
      benchmarkKind: 'reference',
      referenceFixtureId: manifest.id,
      referenceFixtureVersion: manifest.version,
      referenceProtocolVersion: IMPORT_REFERENCE_PROTOCOL_VERSION,
      referenceLabel: manifest.label,
      stage: 'extraction',
    }, { persist: false });

    const startedAt = performance.now();
    try {
      const { extractPDFText, parseLabPDFWithAI } = await loadPdfImport();
      onProgress?.(7, 'Reading 3 PDF pages');
      const extractionStartedAt = performance.now();
      const sourceText = await extractPDFText(sourceFile);
      const pdfExtractionMs = Math.max(0, Math.round(performance.now() - extractionStartedAt));
      if (!sourceText.trim()) throw new Error('Bundled reference PDF produced no extractable text.');
      updateImportBenchmark(benchmarkId, {
        stage: 'analysis',
        inputChars: sourceText.length,
        timings: { pdfExtractionMs },
      }, { persist: false });
      onProgress?.(15, 'Sending 68 results to the model');
      const analysisStartedAt = performance.now();
      const result = await parseLabPDFWithAI(sourceText, manifest.fileName, (pct, stageLabel) => {
        onProgress?.(Math.max(15, Math.min(90, Number(pct) || 15)), stageLabel || 'Model is reading the report');
      }, { captureRawModelOutput: true, deterministicBenchmark: true });
      const analysisMs = Math.max(0, Math.round(performance.now() - analysisStartedAt));
      const provider = result?.provider || providerAtStart;
      const modelId = modelIdAtStart;
      const tokens = getUsageTokens(result?.usage);
      result.privacyMethod = 'bundled-synthetic-reference';
      result.importHash = REFERENCE_INPUT_HASH;
      result.timings = { pdfExtractionMs, pii: 0, analysis: Math.round(analysisMs / 1000), piiMs: 0, analysisMs };
      result.costInfo = {
        provider,
        modelId,
        inputTokens: tokens.inputTokens,
        outputTokens: tokens.outputTokens,
        cost: calculateCost(provider, modelId, tokens.inputTokens, tokens.outputTokens),
      };
      trackUsage(provider, modelId, tokens.inputTokens, tokens.outputTokens);
      onProgress?.(94, 'Checking the model’s answers');
      const score = scoreReferenceModelAndPipeline(
        result?.benchmarkRawModelResult || result,
        result,
        manifest.expected,
      );
      finishImportBenchmark(benchmarkId, score.referenceExactMatch ? 'reference-passed' : 'reference-scored', {
        ...benchmarkResultPatch(result, performance.now() - startedAt),
        ...score,
        benchmarkKind: 'reference',
        referenceFixtureId: manifest.id,
        referenceFixtureVersion: manifest.version,
        referenceProtocolVersion: IMPORT_REFERENCE_PROTOCOL_VERSION,
        referenceLabel: manifest.label,
        stage: 'complete',
      }, { persist: false });
      if (!await persistImportBenchmarks()) throw new Error('The model test completed but could not be saved.');
      onProgress?.(100, 'Model test complete');
      return { benchmarkId, manifest, score };
    } catch (err) {
      finishImportBenchmark(benchmarkId, 'failed', {
        benchmarkKind: 'reference',
        referenceFixtureId: manifest.id,
        referenceFixtureVersion: manifest.version,
        referenceProtocolVersion: IMPORT_REFERENCE_PROTOCOL_VERSION,
        referenceLabel: manifest.label,
        stage: 'analysis',
        totalMs: Math.max(0, Math.round(performance.now() - startedAt)),
        error: getErrorMessage(err, String(err)),
      }, { persist: false });
      await persistImportBenchmarks();
      throw err;
    }
  } finally {
    referenceBenchmarkRunning = false;
  }
}
