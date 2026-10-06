import type { SettingsBenchmarkReader, BenchmarkMetric, DifferenceValue, DiscrepancyOperations, NumericFields, ProviderLabelReader } from '../types/settings-data.js';
import { getImportBenchmarkProviderLabel } from './import-benchmarks.js';
import { IMPORT_REFERENCE_FIXTURE } from './import-reference-benchmark.js';
import { formatSettingsTokens as formatTokens } from './settings-records-view.js';

// Identity, numeric normalization and comparison math retain their saved-data contract.
export function importBenchmarkStorageId(snap: SettingsBenchmarkReader | null | undefined) {
  return String(snap?.id || snap?.benchmarkId || `legacy_${snap?.benchmarkAt || snap?.importedAt || 0}_${snap?.fileName || 'unknown'}`);
}

export function isImportBenchmarkComparable(snap: SettingsBenchmarkReader | null | undefined) {
  if (!snap?.status) return true;
  return ['confirmed', 'reference-scored', 'reference-passed'].includes(snap.status as string);
}

function isReferenceBenchmark(snap: SettingsBenchmarkReader | null | undefined) {
  return snap?.benchmarkKind === 'reference' || snap?.benchmarkKind === 'reference-gold';
}

function importBenchmarkInputIdentity(snap: SettingsBenchmarkReader | null | undefined) {
  if (isReferenceBenchmark(snap) && snap?.referenceFixtureId) {
    const version = snap.referenceFixtureVersion
      || (snap.referenceFixtureId === IMPORT_REFERENCE_FIXTURE.id ? IMPORT_REFERENCE_FIXTURE.version : 1);
    return `reference:${snap.referenceFixtureId}@${version}#protocol-${Number(snap.referenceProtocolVersion) || 1}`;
  }
  const hash = String(snap?.inputHash || snap?.importHash || '');
  return hash ? `report:${hash}` : '';
}

export function importBenchmarksUseSameInput(first:SettingsBenchmarkReader|null|undefined, second:SettingsBenchmarkReader|null|undefined) {
  const firstIdentity = importBenchmarkInputIdentity(first);
  return !!firstIdentity && firstIdentity === importBenchmarkInputIdentity(second);
}
export function latestCompatibleModelTests<Snapshot extends SettingsBenchmarkReader>(snapshots:readonly Snapshot[]):Snapshot[] {
  const modelRuns = snapshots.filter(snap => isImportBenchmarkComparable(snap) && !snap.benchmarkLocked);
  for (let index = 0; index < modelRuns.length; index++) {
    const match = modelRuns.slice(index + 1).find(candidate => importBenchmarksUseSameInput(modelRuns[index], candidate));
    if (match) return [modelRuns[index]!, match];
  }
  return [];
}


export function formatBenchmarkDuration(ms: unknown) {
  const value = Math.max(0, Number(ms) || 0);
  if (value < 1000) return `${Math.round(value)} ms`;
  if (value < 60_000) return `${(value / 1000).toFixed(value < 10_000 ? 1 : 0)} s`;
  const minutes = Math.floor(value / 60_000);
  const seconds = Math.round((value % 60_000) / 1000);
  return `${minutes}m ${seconds}s`;
}

export function formatOptionalBenchmarkDuration(ms: unknown) {
  return Number(ms) > 0 ? formatBenchmarkDuration(ms) : '\u2014';
}

export function formatBenchmarkPercent(value: unknown) {
  return `${Number(value).toFixed(1)}%`;
}
export function benchmarkFallbackLabel(diagnostics: NumericFields|null|undefined) {
  const fallbacks: string[] = [];
  if (diagnostics?.structuredOutputFallback) fallbacks.push('schema retry');
  if (diagnostics?.streamFallback) fallbacks.push('stream retry');
  if (diagnostics?.reasoningControlFallback) fallbacks.push('reasoning retry');
  return fallbacks.length ? fallbacks.join(' + ') : 'direct';
}

export function referenceDiscrepancyState(snap: SettingsBenchmarkReader | null | undefined) {
  const captured = Number(snap?.referenceDiscrepanciesVersion) > 0
    && Array.isArray(snap?.referenceDiscrepancies);
  const groups = captured
    ? (snap!.referenceDiscrepancies as DiscrepancyOperations[])
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

export function referenceDifferenceLabel(count: unknown) {
  return `${count} difference${count === 1 ? '' : 's'}`;
}


export function importBenchmarkView(snap:SettingsBenchmarkReader) {
  const isGoldStandard = !!snap.benchmarkLocked;
  const measuredAnalysisMs = Number.isFinite(Number(snap.timings?.analysisMs))
    ? Number(snap.timings!.analysisMs)
    : (Number(snap.timings?.analysis) || 0) * 1000;
  const piiMs = Number.isFinite(Number(snap.timings?.piiMs))
    ? Number(snap.timings!.piiMs)
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

export const IMPORT_BENCHMARK_COMPARISON_METRICS: BenchmarkMetric[] = [
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
  { group: 'Speed', key: 'throughput', label: 'Generation speed', hint: 'Tokens generated each second', direction: 'higher', optional: true, zeroIsMissing: true, format: value => `${(value as number).toFixed(1)} tok/s` },
  { group: 'Speed', key: 'inputTokens', label: 'Input size', hint: 'Tokens sent to the model', direction: 'neutral', optional: true, zeroIsMissing: true, format: formatTokens },
  { group: 'Speed', key: 'outputTokens', label: 'Output size', hint: 'Tokens returned by the model', direction: 'neutral', optional: true, zeroIsMissing: true, format: formatTokens },
  { group: 'Technical details', key: 'piiMs', label: 'Privacy preparation', hint: 'Time spent preparing private data before the model call', direction: 'lower', optional: true, zeroIsMissing: true, format: formatBenchmarkDuration },
  { group: 'Technical details', key: 'pdfExtractionMs', label: 'Reading the PDF', hint: 'Time spent extracting text before the model call', direction: 'lower', optional: true, zeroIsMissing: true, format: formatBenchmarkDuration },
  { group: 'Technical details', key: 'modelLoadMs', label: 'Loading the model', hint: 'Reported by the local model server when available', direction: 'lower', optional: true, zeroIsMissing: true, format: formatBenchmarkDuration },
  { group: 'Technical details', key: 'timeToFirstTokenMs', label: 'First response', hint: 'Time until the model began answering', direction: 'lower', optional: true, zeroIsMissing: true, format: formatBenchmarkDuration },
];

export function benchmarkPercentDiff(value:number|null, baseline:number|null, mode = 'percent') {
  if (!Number.isFinite(value) || !Number.isFinite(baseline)) return null;
  if (mode === 'points') {
    const rawPoints = (value as number) - (baseline as number);
    const normalizedPoints = Math.abs(rawPoints) < 0.05 ? 0 : rawPoints;
    return {
      raw: normalizedPoints,
      label: `${normalizedPoints > 0 ? '+' : ''}${normalizedPoints.toFixed(1)} pp`,
    };
  }
  if (baseline === 0) return null;
  const raw = (((value as number) - (baseline as number)) / Math.abs(baseline as number)) * 100;
  const normalized = Math.abs(raw) < 0.05 ? 0 : raw;
  const decimals = Math.abs(normalized) >= 100 ? 0 : 1;
  return {
    raw: normalized,
    label: `${normalized > 0 ? '+' : ''}${normalized.toFixed(decimals)}%`,
  };
}

export function benchmarkDiffClass(diff:DifferenceValue|null, direction:string) {
  if (!diff || diff.raw === 0 || direction === 'neutral') return ' neutral';
  const better = direction === 'lower' ? diff.raw < 0 : diff.raw > 0;
  return better ? ' better' : ' worse';
}

export function importBenchmarkModelIdentity(snap:SettingsBenchmarkReader|null|undefined) {
  const modelId = snap?.modelId || snap?.costInfo?.modelId;
  if (!modelId) return '';
  return `${(getImportBenchmarkProviderLabel as ProviderLabelReader)(snap)}\n${modelId}`;
}
