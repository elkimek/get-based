import type { SettingsBenchmarkReader, ProviderLabelReader } from '../types/settings-data.js';
import type { BenchmarkCard, BenchmarkComparison, BenchmarkContext, BenchmarkDifference, BenchmarkField, BenchmarkSnapshot, BenchmarkTone, BenchmarkUiState } from './import-benchmark-contract.js';
import { getImportBenchmarkProviderLabel } from './import-benchmarks.js';
import {
  importBenchmarkView, importBenchmarkStorageId, importBenchmarkModelIdentity,
  isImportBenchmarkComparable, importBenchmarksUseSameInput, latestCompatibleModelTests,
  referenceDiscrepancyState, benchmarkFallbackLabel, benchmarkPercentDiff, benchmarkDiffClass,
  formatBenchmarkDuration, formatOptionalBenchmarkDuration, formatBenchmarkPercent,
  IMPORT_BENCHMARK_COMPARISON_METRICS,
} from './import-benchmark-data.js';
import { IMPORT_REFERENCE_FIXTURE } from './import-reference-benchmark.js';
import { formatSettingsTokens as formatTokens } from './settings-records-view.js';
const text = (value: unknown, fallback = '') => String(value ?? fallback);
const providerLabel = (snap: SettingsBenchmarkReader) => (getImportBenchmarkProviderLabel as ProviderLabelReader)(snap);
const modelLabel = (snap: SettingsBenchmarkReader) => text(snap.modelId || snap.costInfo?.modelId || 'unknown');

export function buildBenchmarkDifference(snap: SettingsBenchmarkReader | null | undefined): BenchmarkDifference {
  const state = referenceDiscrepancyState(snap);
  const summary: string[] = [];
  if (state.dataCount) summary.push(`${state.dataCount} lab-data difference${state.dataCount === 1 ? '' : 's'} across ${state.affectedMarkerCount} result${state.affectedMarkerCount === 1 ? '' : 's'}`);
  if (state.reportCount) summary.push(`${state.reportCount} report-detail difference${state.reportCount === 1 ? '' : 's'}`);
  return {
    model: text(snap?.modelId || snap?.costInfo?.modelId || 'this model'), summary: summary.join(' · '),
    count: state.issueCount, unavailable: state.unavailable, truncated: state.truncated,
    groups: state.groups.map(group => ({ marker: text(group.markerName || 'Lab result'), section: text(group.section), report: group.scope === 'report-details',
      issues: group.issues.slice(0,8).map(issue => ({ label: text(issue?.label || 'Difference'), expected: text(issue?.expected,'—'), actual: text(issue?.actual,'—'), note: text(issue?.note) })),
    })),
  };
}

export function normalizeBenchmarkSelection(snapshots: readonly SettingsBenchmarkReader[], selected: Set<string>): SettingsBenchmarkReader[] {
  const byId = new Map(snapshots.map(snap => [importBenchmarkStorageId(snap),snap]));
  for (const id of selected) if (!byId.has(id) || !isImportBenchmarkComparable(byId.get(id))) selected.delete(id);
  const baseline = byId.get([...selected][0]!);
  for (const id of [...selected].slice(1)) if (!importBenchmarksUseSameInput(baseline,byId.get(id))) selected.delete(id);
  return [...selected].map(id => byId.get(id)!);
}

export function buildBenchmarkCard(snap: SettingsBenchmarkReader, selectable = true): BenchmarkCard {
  const view = importBenchmarkView(snap), gold = !!snap.benchmarkLocked;
  const reference = snap.benchmarkKind === 'reference' || snap.benchmarkKind === 'reference-gold';
  const fallback = benchmarkFallbackLabel(snap.diagnostics), status = text(snap.status || 'confirmed');
  const at = Number(snap.benchmarkAt || snap.importedAt);
  const mode = gold ? 'answer key' : reference ? 'sample report test' : snap.importMode === 'image' ? 'image import' : 'text import';
  const fields: BenchmarkField[] = [];
  const field = (label: string, value: unknown, title?: string, wide?: boolean) => fields.push({ label,text:text(value),...(title ? { title } : {}),...(wide ? { wide } : {}) });
  field('Model',modelLabel(snap),modelLabel(snap)); field('Backend / test',`${providerLabel(snap)} · ${mode}`);
  if (gold) { field('What this is','Verified answer key'); field('Speed','Not applicable'); }
  else {
    field('Total time',formatBenchmarkDuration(view.totalMs)); field('Model time',formatBenchmarkDuration(view.analysisMs));
    field('Tokens',`${formatTokens(view.inputTokens)} in · ${formatTokens(view.outputTokens)} out${view.reasoningTokens ? ` · ${formatTokens(view.reasoningTokens)} reasoning` : ''}`);
    field(view.measuredThroughput > 0 ? 'Generation speed' : 'Output rate',view.throughput > 0 ? `${view.throughput.toFixed(1)} tok/s${view.measuredThroughput > 0 ? '' : ' e2e'}` : '—');
  }
  field('Results found',view.detectedMarkerCount);
  if (reference) {
    field('Raw model: fully correct',view.referenceExactMarkerCount == null ? '—' : `${view.referenceExactMarkerCount} / ${view.referenceExpectedMarkerCount} · ${formatBenchmarkPercent(view.referenceExactMarkerPercent)}`);
    field('Raw model: all fields',view.referenceFieldAccuracyPercent == null ? '—' : formatBenchmarkPercent(view.referenceFieldAccuracyPercent));
    field('After getbased corrections',view.referencePipelineExactMarkerCount == null ? '—' : `${view.referencePipelineExactMarkerCount} / ${view.referenceExpectedMarkerCount} · ${formatBenchmarkPercent(view.referencePipelineExactMarkerPercent)}`);
    field('Precision / recall / F1',view.referencePrecisionPercent == null ? '—' : `${formatBenchmarkPercent(view.referencePrecisionPercent)} / ${formatBenchmarkPercent(view.referenceRecallPercent)} / ${formatBenchmarkPercent(view.referenceF1Percent)}`);
    field('Marker matching / values',view.referenceMappingAccuracyPercent == null ? '—' : `${formatBenchmarkPercent(view.referenceMappingAccuracyPercent)} / ${formatBenchmarkPercent(view.referenceValueAccuracyPercent)}`);
    field('Units / reference ranges',view.referenceUnitAccuracyPercent == null ? '—' : `${formatBenchmarkPercent(view.referenceUnitAccuracyPercent)} / ${formatBenchmarkPercent(view.referenceRangeAccuracyPercent)}`);
    field('Date / report type',view.referenceDateAccuracyPercent == null ? '—' : `${view.referenceDateAccuracyPercent === 100 ? 'correct' : 'wrong'} / ${view.referenceTestTypeAccuracyPercent === 100 ? 'correct' : 'wrong'}`);
  } else {
    field('Kept after review',view.importedMarkerCount == null ? '—' : `${view.importedMarkerCount} / ${view.detectedMarkerCount}${view.acceptedRate == null ? '' : ` · ${formatBenchmarkPercent(view.acceptedRate)}`}`);
    field('Needed no edits',view.cleanImportedMarkerCount == null ? '—' : `${view.cleanImportedMarkerCount} / ${view.detectedMarkerCount}${view.cleanImportRate == null ? '' : ` · ${formatBenchmarkPercent(view.cleanImportRate)}`}`);
    field('Changes during review',view.correctedMarkerCount == null ? 'Not available for this test' : [`${view.correctedMappingCount || 0} mapping`,`${view.correctedValueCount || 0} value`,`${view.correctedUnitCount || 0} unit`,`${view.excludedMarkerCount || 0} excluded`,`${view.unmappedMarkerCount || 0} unmapped`,...(view.dateCorrectionCount ? ['date changed'] : [])].join(' · '));
  }
  field('Input',`${Number(snap.inputChars) ? `${formatTokens(Number(snap.inputChars))} chars` : '—'}${Number(snap.pageCount) ? ` · ${Number(snap.pageCount)} pages` : ''}`);
  const context = Number(snap.runtime?.contextLength || snap.diagnostics?.contextLength) || 0;
  const api = snap.diagnostics?.providerApi === 'native' ? 'native API' : snap.diagnostics?.providerApi === 'openai-compatible' ? 'compatible API' : '';
  const load = snap.runtime?.loadedAtStart === true ? 'warm start' : snap.runtime?.loadedAtStart === false ? 'cold start' : '';
  field('Model setup',[context ? `${formatTokens(context)} context` : 'context unknown',snap.runtime?.quantLevel,snap.runtime?.executionLocation,api,load].filter(Boolean).map(value => text(value)).join(' · '));
  if (Number(view.pdfExtractionMs) > 0) field('Reading the PDF',formatBenchmarkDuration(view.pdfExtractionMs));
  if (view.piiMs > 0) field('Privacy preparation',formatBenchmarkDuration(view.piiMs));
  if (view.modelLoadMs > 0 || view.timeToFirstTokenMs > 0) field('Model load / first response',`${formatOptionalBenchmarkDuration(view.modelLoadMs)} / ${formatOptionalBenchmarkDuration(view.timeToFirstTokenMs)}`);
  if (snap.error) field('Error',snap.error,undefined,true);
  return {
    id:view.id,fileName:text(snap.fileName || 'Unknown file'),recorded:gold ? 'Built-in verified answer' : Number.isFinite(at) ? new Date(at).toLocaleString() : 'Unknown time',
    reference,gold,diagnostic:!selectable,selected:false,incompatible:false,order:'',fields,differences:buildBenchmarkDifference(snap),
    retried:!reference && (status !== 'confirmed' || fallback !== 'direct'),
    status:gold ? 'answer key · 100%' : reference ? snap.referenceExactMatch ? 'test complete · 100%' : status === 'failed' ? 'test failed' : 'test complete' : status === 'confirmed' ? `import complete${fallback === 'direct' ? '' : ' · retried'}` : fallback === 'direct' ? status : `${status} · retried`,
  };
}

export function buildBenchmarkComparison(snapshots: readonly SettingsBenchmarkReader[]): BenchmarkComparison | null {
  if (snapshots.length < 2) return null;
  const runs = snapshots.map(importBenchmarkView), baseline = runs[0]!;
  const metrics = IMPORT_BENCHMARK_COMPARISON_METRICS.filter(metric => !metric.optional || runs.some(run => Number.isFinite(run[metric.key]) && !(metric.zeroIsMissing && run[metric.key] === 0)));
  return {
    gold:!!baseline.snap.benchmarkLocked,
    headers:runs.map((run,index) => { const differences = buildBenchmarkDifference(run.snap); return { id:run.id,label:index === 0 ? 'Baseline' : `Test ${index + 1}`,provider:providerLabel(run.snap),model:text(run.snap.modelId || run.snap.costInfo?.modelId || 'unknown model'),fileName:text(run.snap.fileName || 'Unknown file'),differenceCount:run.snap.benchmarkKind === 'reference' && !run.snap.benchmarkLocked ? differences.count : 0,unavailable:run.snap.benchmarkKind === 'reference' && !run.snap.benchmarkLocked && differences.unavailable }; }),
    rows:metrics.map((metric,index) => ({ key:metric.key,group:metric.group,groupStart:index === 0 || metrics[index - 1]!.group !== metric.group,label:metric.label,hint:metric.hint,
      cells:runs.map((run,column) => {
        const value = run[metric.key], missing = !!metric.optional && (value == null || !!(metric.zeroIsMissing && value === 0));
        const difference = column === 0 || missing ? null : benchmarkPercentDiff(value,baseline[metric.key],metric.diffMode);
        return { id:run.id,text:missing ? '—' : metric.format(value),difference:missing ? '—' : column === 0 ? 'Baseline' : difference?.label || '—',tone:column === 0 ? 'baseline' : benchmarkDiffClass(difference,metric.direction).trim() as BenchmarkTone };
      }),
    })),
  };
}

export function buildBenchmarkSnapshot(snapshots: readonly SettingsBenchmarkReader[], context: BenchmarkContext, ui: BenchmarkUiState): BenchmarkSnapshot {
  const selected = normalizeBenchmarkSelection(snapshots,ui.selected), ids = [...ui.selected], baseline = selected[0];
  const modelRuns = snapshots.filter(snap => !snap.benchmarkLocked), comparable = modelRuns.filter(isImportBenchmarkComparable);
  const cards = (runs: readonly SettingsBenchmarkReader[], selectable = true) => runs.map(snap => {
    const card = buildBenchmarkCard(snap,selectable), index = ids.indexOf(card.id);
    return { ...card,selected:index >= 0,order:index === 0 ? 'Baseline' : index > 0 ? String(index + 1) : '',incompatible:!!baseline && index < 0 && !importBenchmarksUseSameInput(baseline,snap) };
  });
  const reviewSnap = selected.find(snap => importBenchmarkStorageId(snap) === ui.reviewId);
  return {
    summary:[{ label:'Tests saved',value:modelRuns.length },{ label:'Model setups',value:new Set(modelRuns.map(importBenchmarkModelIdentity).filter(Boolean)).size },{ label:'Successful',value:comparable.length },{ label:'Didn’t finish',value:modelRuns.length - comparable.length }],
    gold:cards(snapshots.filter(snap => snap.benchmarkLocked && isImportBenchmarkComparable(snap))),successful:cards(comparable),diagnostics:cards(modelRuns.filter(snap => !isImportBenchmarkComparable(snap)),false),
    ...context,referenceRuns:comparable.filter(snap => snap.benchmarkKind === 'reference' && snap.referenceFixtureId === IMPORT_REFERENCE_FIXTURE.id).length,
    initiated:!!ui.initiated,deleting:!!ui.deleting,progress:ui.progress || null,
    canSelectLatest:latestCompatibleModelTests(snapshots).length >= 2,canClear:selected.length > 0,canDelete:selected.some(snap => !snap.benchmarkLocked),
    selectionCopy:selected.length === 0 ? 'Choose two or more tests of the same report. Your first choice is the baseline.' : selected.length === 1 ? 'Baseline chosen. Select another test of this report.' : `${selected.length} matching tests selected. Differences are measured from the baseline.`,
    comparison:buildBenchmarkComparison(selected),reviewId:reviewSnap ? ui.reviewId || '' : '',review:reviewSnap ? buildBenchmarkDifference(reviewSnap) : null,
  };
}
