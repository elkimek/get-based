import {renderCorrelationWorkspaceChrome,renderCorrelationWorkspaceReadout,renderCorrelationWorkspaceUsageSegments,correlationText,presentCorrelationRows,type CorrelationWorkspaceView,type CorrelationCurrentDose,type CorrelationCurrentDoseList,type CorrelationCurrentDoseItem,type CorrelationNoCurrentDose,type CorrelationDoseNotice,type CorrelationConfirmDose,type CorrelationConfirmPeriod,type CorrelationTimelinePanel,type CorrelationPlot,type CorrelationUsageTrack,type CorrelationPairTabs,type CorrelationPairTab,type CorrelationScatterUnavailable,type CorrelationHistory,type CorrelationReadout,type CorrelationUsageSegment} from './correlation-workspace-chrome-presentation.js';
import type {CorrelationControlsView,CorrelationChoiceGroup,CorrelationChoice,CorrelationCustomDates,CorrelationTab,CorrelationIngredientPicker,CorrelationIngredientOption,CorrelationSeriesButton,CorrelationRangeError,CorrelationNoLabs} from './correlation-workspace-controls-presentation.js';
import {projectTherapyComparisonGroup,projectTherapyComparisonMeasurement,projectTherapyComparisonPeriod,
  projectTherapyComparisonView,renderTherapyComparisonView,projectMarkerPairComparison,renderMarkerPairComparisonView} from './therapy-comparison-presentation.js';
import { state } from './state.js';
import { saveCorrelationWorkspace } from './correlation-workspace-store.js';
import { formatValue } from './utils.js';
import { getChartColors } from './theme.js';
import { createChartRuntime } from './charts-runtime.js';
import { localDateKey, getSupplementPeriods } from './supplement-medication-domain.js';
import { correlationDay, correlationDate, therapyExposure, therapySegments } from './therapy-correlations.js';

import type { ChartInstance } from './charts-runtime.js';
import type { prepareCorrelationSelection, prepareTherapyHistory, prepareTherapyComparison } from './therapy-correlations.js';

type RuntimeViewOperations = { [Key in keyof typeof state.correlationView]: (typeof state.correlationView)[Key] | undefined };
type CorrelationSelection = ReturnType<typeof prepareCorrelationSelection>;
type TherapyHistory = ReturnType<typeof prepareTherapyHistory>;
type TherapyComparison = ReturnType<typeof prepareTherapyComparison>;
type CorrelationPair = CorrelationSelection['pairs'][number] & { therapyId?: string | null; xMarkerKey?: string; xUnit?: string | undefined };
type CorrelationViewSelection = Omit<CorrelationSelection, 'pairs'> & { pairs: CorrelationPair[] };
type MarkerSeries = { id: string; name: string | undefined; unit: string; kind: 'marker'; marker: CorrelationSelection['markers'][number]; history?: never; color: string | undefined; index: number };
type DoseSeries = { id: string | null; name: unknown; unit: string; kind: 'dose'; marker?: never; history: TherapyHistory; color: string | undefined; index: number };
type CorrelationSeries = MarkerSeries | DoseSeries;
interface CorrelationAxis { id: string; unit: string; kind: CorrelationSeries['kind']; position: string }
interface CorrelationPoint { x: number | null; y: number | null; rawValue?: number | null; label?: string }
interface CorrelationDataset { therapyId: string | null; label: string; borderColor: string | undefined; backgroundColor: string | undefined; borderDash: number[]; borderWidth: number; tension: number; spanGaps: boolean; yAxisID: string | undefined; pointRadius: number; pointStyle: string; data: CorrelationPoint[]; stepped?: string }
interface CorrelationScale { display: boolean; position: string; beginAtZero?: boolean; min?: number; max?: number; afterFit?: (axis: { width: number }) => void; title?: { display: boolean; text: string; color: string }; ticks?: { color: string }; grid?: { drawOnChartArea?: boolean; color: string } }
interface CorrelationChart extends ChartInstance { draw(): void; width: number; ctx: CanvasRenderingContext2D }
interface CorrelationPointer { x: number }
interface CorrelationTooltip { parsed: {x: number; y: number}; raw: { rawValue?: unknown; date?: unknown; exposureDate?: unknown }; dataset: {therapyId?: unknown; label?: unknown} }
interface CorrelationTickAxis { chart: {width: number}; ticks: Array<{value: number}> }

export function destroyTherapyCorrelationCharts() {
  for (const key of Object.keys(state.chartInstances)) {
    if (!key.startsWith('correlation-therapy-')) continue;
    state.chartInstances[key]!.destroy();
    delete state.chartInstances[key];
  }
}

const sourceLabel = (sources: TherapyComparison['rows'][number]['sources']) => [...new Set(sources.map(s => s.source || s.id || s.date))].join(', ');

function doseLabel(value: number | null, unit: string, basis: string) {
  return `${Number((value as number).toPrecision(8))} ${unit}${basis === 'day' ? '/day' : ' (recorded dose)'}`;
}

function renderTherapyCorrelationResults(comparison: TherapyComparison, history: TherapyHistory, container: Element | null) {
  if (!container) return;
      const needsDates = history.currentDoses.length && comparison.rows.some(r => r.exposure.value === null && r.date >= (history.periods[0]?.start as string));
      const status = comparison.r !== null ? `Exploratory Pearson r = ${comparison.r.toFixed(2)}`
        : !comparison.n && needsDates ? 'Confirm dose dates to match lab results.'
        : `Coefficient unavailable: ${comparison.unavailable}.`;
      const groups = presentCorrelationRows(comparison.groups.map(g => projectTherapyComparisonGroup(g, comparison, () => doseLabel(g.dose, g.unit, g.basis))));
      const rows = presentCorrelationRows(comparison.rows.map(row => projectTherapyComparisonMeasurement(row, comparison, sourceLabel)));
      const periods = presentCorrelationRows(history.periods.map(p => projectTherapyComparisonPeriod(p)));
      container.innerHTML = renderTherapyComparisonView(projectTherapyComparisonView(comparison, status, groups, rows, periods));
}


const darkStyles = ['#38bdf8', '#a78bfa', '#fbbf24', '#34d399', '#fb7185', '#22d3ee', '#e879f9', '#a3e635'];
const amountUnit = (q: { unit?: unknown; basis?: unknown } | null | undefined) => q ? `${q.unit}${q.basis === 'day' ? '/day' : q.basis === 'marker' ? '' : ' per dose'}` : '';
const textDose = (q: { value: number | null | undefined; unit?: unknown; basis?: unknown }) => `${formatValue(q.value)} ${amountUnit(q)}`;

const choices = (key: string, label: string, options: readonly (readonly [string, string])[], value: unknown, disabled = false) => (():CorrelationChoiceGroup=>{
const capturedHidden = (disabled ? ' hidden' : '') === " hidden";
const capturedLabel = `${label}`;
const capturedKey = `${key}`;
const capturedAccessibleLabel = `${label}`;
const capturedChoices = presentCorrelationRows(options.map(([v, t]) => (():CorrelationChoice=>{
const capturedClassSuffix = `${v === value ? ' active' : ''}`;
const capturedIdKey = `${key}`;
const capturedIdValue = `${v}`;
const capturedAction = `${key}`;
const capturedValue = `${v}`;
const capturedPressed = v === value;
const capturedDisabled = (disabled ? ' disabled' : '') === " disabled";
const capturedLabel = `${t}`;
return {kind:"choice-button",classSuffix:capturedClassSuffix,idKey:capturedIdKey,idValue:capturedIdValue,action:capturedAction,value:capturedValue,pressed:capturedPressed,disabled:capturedDisabled,label:capturedLabel};
})()));
return {kind:"choice-group",hidden:capturedHidden,label:capturedLabel,key:capturedKey,accessibleLabel:capturedAccessibleLabel,choices:capturedChoices};
})();

export function renderCorrelationWorkspace(selection: CorrelationViewSelection, container: HTMLElement, refresh: () => unknown) {
  destroyTherapyCorrelationCharts();
  const styles = document.documentElement.dataset.theme === 'light' ? ['#007da8', '#7651b9', '#a45300', '#007f5b', '#b52c4b', '#007786', '#963dad', '#567500'] : darkStyles;
  const view = state.correlationView;
  const grouping = view.grouping || 'combined', layout = view.layout || 'overlay', tab = view.tab || 'timeline';
  const rangePreset = view.rangePreset || (view.start || view.end ? 'custom' : 'all');
  const pairs = selection.pairs;
  const pairIndex = Math.max(0, pairs.findIndex(p => p.pairKey === selection.activePairKey));
  const pair = pairs[pairIndex];
  const scatterRows = pair?.rows.filter(r => !r.reason) || [];
  const scatterCompatible = new Set(scatterRows.map(r => (r.exposure as { key?: unknown }).key || 'marker')).size <= 1;
  const hidden = new Set<string | null>(view.hidden || []);
  const series: CorrelationSeries[] = [
    ...selection.markers.map((m, i): MarkerSeries => ({ id: m.key, name: m.name, unit: m.unit || 'Unit unavailable', kind: 'marker', marker: m, color: styles[i % styles.length], index: i })),
    ...selection.histories.map((h, i): DoseSeries => ({ id: h.id, name: h.name, unit: amountUnit(h.quantity), kind: 'dose', history: h, color: styles[(selection.markers.length + i) % styles.length], index: selection.markers.length + i })),
  ];
  const days = selection.markers.flatMap(m => m.rows.map(r => correlationDay(r.date)));
  for (const h of selection.histories) if (!h.invalid) for (const p of h.periods) {
    if ((p.start as string) <= h.today) days.push(correlationDay(p.start), correlationDay(p.end && (p.end as string) < h.today ? p.end : h.today));
  }
  const validDays = days.filter(day => day !== null);
  const fallback = (correlationDay(localDateKey()) as number);
  const requestedEnd = correlationDay(selection.range.end);
  const naturalStart = validDays.length ? Math.min(...validDays) : fallback;
  const start = correlationDay(selection.range.start) ?? Math.min(naturalStart, requestedEnd ?? naturalStart);
  const last = requestedEnd ?? Math.max(start, fallback, validDays.length ? Math.max(...validDays) : fallback);
  const end = Math.max(start + 1, last + 1);
  let cursor = Math.min(end - 1, Math.max(start, correlationDay(view.inspectDate) ?? (correlationDay(selection.markers[0]?.rows.at(-1)?.date) ?? last)));
  const segmentsById = new Map(selection.histories.map(h => [h.id, therapySegments(h, correlationDate(start), correlationDate(end - 1))]));
  const numeric = (s: CorrelationSeries) => s.kind === 'marker' || (s.history.quantity && segmentsById.get(s.id)!.some(seg => seg.value !== null));
  const scaleKey = (s: CorrelationSeries) => `${s.kind}:${s.unit === 'Unit unavailable' ? s.id : s.unit}`;
  const axesFor = (items: CorrelationSeries[]) => {
    const axes = new Map<string, CorrelationAxis>();
    for (const s of items.filter(numeric)) if (!axes.has(scaleKey(s))) {
      const base = s.kind === 'marker' ? 'y' : 'dose';
      axes.set(scaleKey(s), { id: [...axes.values()].some(a => a.id === base) ? `${base}2` : base, unit: s.unit, kind: s.kind, position: axes.size ? 'right' : 'left' });
    }
    return axes;
  };
  const visible = series.filter(s => !hidden.has(s.id));
  let groups = grouping === 'separate'
    ? pairs.map(p => visible.filter(s => s.id === p.markerKey || s.id === p.therapyId || s.id === p.xMarkerKey)) : [visible];
  const lanes = layout === 'lanes';
  if (lanes) groups = groups.flatMap(g => {
    const plots = g.filter(numeric).map(s => [s]);
    const tracks = g.filter(s => !numeric(s));
    if (!plots.length) return [tracks];
    plots[0]!.push(...tracks);
    return plots;
  });
  groups = groups.filter(g => g.length);
  const plotCount = groups.filter(g => g.some(numeric)).length;
  const missingDoses = visible.filter((s): s is DoseSeries => s.kind === 'dose' && (!numeric(s) || (selection.comparisons.some(p => p.therapyId === s.id && p.rows.length) && !selection.comparisons.some(p => p.therapyId === s.id && p.n))));
  const relative = (g: CorrelationSeries[]) => !lanes && axesFor(g).size > 2;
  const current = presentCorrelationRows(selection.histories.map(h => (():CorrelationCurrentDose=>{
const capturedName = `${correlationText(h.name)}`;
const capturedId = `${correlationText(h.id)}`;
const capturedDoses = h.currentDoses.length ? (():CorrelationCurrentDoseList=>{
const capturedItems = presentCorrelationRows(h.currentDoses.map(d => (():CorrelationCurrentDoseItem=>{
const capturedIngredient = `${correlationText(d.ingredient)}`;
const capturedAmount = `${correlationText(textDose(d))}`;
const capturedSince = `${d.confirmedSince ? `Recorded since ${correlationText(d.confirmedSince)}` : 'Dates not confirmed'}`;
return {kind:"current-dose-item",ingredient:capturedIngredient,amount:capturedAmount,since:capturedSince};
})()));
return {kind:"current-dose-list",items:capturedItems};
})() : (():CorrelationNoCurrentDose=>{

return {kind:"no-current-dose"};
})();
return {kind:"current-dose",name:capturedName,id:capturedId,doses:capturedDoses};
})()));
  container.innerHTML = renderCorrelationWorkspaceChrome((():CorrelationWorkspaceView=>{
const capturedControls = (():CorrelationControlsView=>{
const capturedDateChoices = choices('rangePreset', 'Date range', [['3m', '3M'], ['6m', '6M'], ['1y', '1Y'], ['all', 'All'], ['custom', 'Custom']], rangePreset);
const capturedDates = rangePreset === 'custom' ? (():CorrelationCustomDates=>{
const capturedStart = `${correlationText(selection.range.start)}`;
const capturedEnd = `${correlationText(selection.range.end)}`;
return {kind:"custom-dates",start:capturedStart,end:capturedEnd};
})() : null;
const capturedRangeHelp = `${rangePreset === 'all' ? 'All recorded history through today.' : rangePreset === 'custom' ? 'Custom date range.' : `${correlationText(selection.range.start)} → ${correlationText(selection.range.end)} · through today.`}`;
const capturedLayoutHidden = (tab !== 'timeline' ? ' hidden' : '') === " hidden";
const capturedGrouping = choices('grouping', 'Chart grouping', [['combined', 'Combined'], ['separate', 'Separate pairs']], grouping, pairs.length <= 1);
const capturedLayout = choices('layout', 'Display', [['overlay', 'Single chart'], ['lanes', 'Aligned lanes']], layout);
const capturedNoLabs = !selection.markers.some(m => m.rows.length) && !selection.rangeError ? (():CorrelationNoLabs=>{

return {kind:"no-lab-results"};
})() : null;
const capturedStatusHidden = (tab !== 'timeline' ? ' hidden' : '') === " hidden";
const capturedStatusGrouping = `${grouping === 'combined' ? 'Combined selection' : 'Separate pairs'}`;
const capturedStatusCount = `${plotCount}`;
const capturedStatusNoun = `${plotCount === 1 ? 'chart' : 'charts'}`;
const capturedStatusDetail = `${pairs.length === 1 ? 'Only one pair is selected.' : grouping === 'separate' ? 'Each pair has a panel below.' : 'All visible series share one view.'}`;
const capturedRangeError = selection.rangeError ? (():CorrelationRangeError=>{
const capturedMessage = `${correlationText(selection.rangeError)}`;
return {kind:"range-error",message:capturedMessage};
})() : null;
const capturedTabs = presentCorrelationRows(['timeline', 'scatter', 'data'].map(t => (():CorrelationTab=>{
const capturedId = `${t}`;
const capturedAction = `${t}`;
const capturedPressed = t === tab;
const capturedLabel = `${(t[0]!).toUpperCase() + t.slice(1)}`;
return {kind:"tab-button",id:capturedId,action:capturedAction,pressed:capturedPressed,label:capturedLabel};
})()));
const capturedIngredients = presentCorrelationRows(selection.histories.filter(h => h.ingredientOptions.length > 1).map(h => (():CorrelationIngredientPicker=>{
const capturedName = `${correlationText(h.name)}`;
const capturedId = `${correlationText(h.id)}`;
const capturedOptions = presentCorrelationRows(h.ingredientOptions.map(name => (():CorrelationIngredientOption=>{
const capturedValue = `${correlationText(name)}`;
const capturedSelected = (name === h.selectedIngredient ? ' selected' : '') === " selected";
const capturedLabel = `${correlationText(name)}`;
return {kind:"ingredient-option",value:capturedValue,selected:capturedSelected,label:capturedLabel};
})()));
return {kind:"ingredient-picker",name:capturedName,id:capturedId,options:capturedOptions};
})()));
const capturedSeriesHidden = (tab !== 'timeline' ? ' hidden' : '') === " hidden";
const capturedSeries = presentCorrelationRows(series.map(s => (():CorrelationSeriesButton=>{
const capturedId = `${correlationText(s.id)}`;
const capturedPressed = !hidden.has(s.id);
const capturedColor = `${s.color}`;
const capturedDash = `${s.index % 2 ? 'dashed' : 'solid'}`;
const capturedName = `${correlationText(s.name)}`;
const capturedIngredient = `${(s.history?.ingredientOptions.length as number) > 1 && s.history?.selectedIngredient ? ` · ${correlationText(s.history.selectedIngredient)}` : ''}`;
const capturedUnit = `${s.unit ? ` · ${correlationText(s.unit)}` : ' · usage only'}`;
return {kind:"series-button",id:capturedId,pressed:capturedPressed,color:capturedColor,dash:capturedDash,name:capturedName,ingredient:capturedIngredient,unit:capturedUnit};
})()));
return {kind:"surface",dateChoices:capturedDateChoices,dates:capturedDates,rangeHelp:capturedRangeHelp,layoutHidden:capturedLayoutHidden,grouping:capturedGrouping,layout:capturedLayout,noLabs:capturedNoLabs,statusHidden:capturedStatusHidden,statusGrouping:capturedStatusGrouping,statusCount:capturedStatusCount,statusNoun:capturedStatusNoun,statusDetail:capturedStatusDetail,rangeError:capturedRangeError,tabs:capturedTabs,ingredients:capturedIngredients,seriesHidden:capturedSeriesHidden,series:capturedSeries};
})();
const capturedNotices = tab === 'timeline' ? presentCorrelationRows(missingDoses.map(s => {
        const first = s.history.periods.find(p => p.quantity)?.start;
        const message = s.history.invalid ? 'Usage dates overlap or are invalid.' : s.history.mixedUnits ? 'Historical dose units or amount bases differ.' : first && !numeric(s) ? `Dose history begins ${first}; no matching dose in range.` : first && numeric(s) ? `Dose history starts ${first}; no matching lab dates.` : s.history.currentDoses.length ? `Current amount: ${s.history.currentDoses.map(d => textDose(d)).join(', ')}. Confirm its dates to plot past doses.` : 'No numeric dose recorded for this range.';
        const unconfirmed = !s.history.invalid && s.history.currentDoses.length ? getSupplementPeriods(s.history.record).flatMap((p, i) => !p.dose && !p.ingredientDoses?.length ? [{ ...p, index: i }] : []) : [];
        return (():CorrelationDoseNotice=>{
const capturedName = `${correlationText(s.name)}`;
const capturedMessage = `${correlationText(message)}`;
const capturedConfirmation = unconfirmed.length ? (():CorrelationConfirmDose=>{
const capturedDose = `${correlationText(s.history.currentDoses.map(d => `${d.ingredient}: ${textDose(d)}`).join('; '))}`;
const capturedPeriods = presentCorrelationRows(unconfirmed.map(p => (():CorrelationConfirmPeriod=>{
const capturedStart = `${correlationText(p.start)}`;
const capturedEnd = `${correlationText(p.end || 'ongoing')}`;
const capturedId = `${correlationText(s.id)}`;
const capturedIndex = `${p.index}`;
return {kind:"confirm-period",start:capturedStart,end:capturedEnd,id:capturedId,index:capturedIndex};
})()));
return {kind:"confirm-dose",dose:capturedDose,periods:capturedPeriods};
})() : null;
const capturedId = `${correlationText(s.id)}`;
const capturedReviewLabel = `${unconfirmed.length ? 'Edit supplement' : 'Review dose dates'}`;
return {kind:"dose-notice",name:capturedName,message:capturedMessage,confirmation:capturedConfirmation,id:capturedId,reviewLabel:capturedReviewLabel};
})();
    })) : [];
const capturedPlotsHidden = (tab !== 'timeline' || selection.rangeError ? ' hidden' : '') === " hidden";
const capturedPanels = presentCorrelationRows(groups.map((g, i) => (():CorrelationTimelinePanel=>{
const capturedClassSuffix = `${grouping === 'separate' ? ' corr-pair-panel' : ''}`;
const capturedHeadingHidden = (grouping === 'combined' && !lanes ? ' class="sr-only"' : '') === " class=\"sr-only\"";
const capturedHeading = `${g.map(s => correlationText(s.name)).join(' + ')}`;
const capturedPlot = g.some(numeric) ? (():CorrelationPlot=>{
const capturedScaleLabel = `${relative(g) ? 'Relative trends · each series scaled 0–100 · actual values below' : [...axesFor(g).values()].map(a => `${a.position === 'left' ? 'Left' : 'Right'}: ${correlationText(a.unit)}`).join(' · ')}`;
const capturedClassSuffix = `${lanes ? ' corr-lane-chart' : ''}`;
const capturedIndex = `${i}`;
const capturedName = `${correlationText(g.map(s => s.name).join(' and '))}`;
return {kind:"plot-chart",scaleLabel:capturedScaleLabel,classSuffix:capturedClassSuffix,index:capturedIndex,name:capturedName};
})() : null;
const capturedTracks = presentCorrelationRows(g.filter(s => s.kind === 'dose' && !numeric(s)).map(s => (():CorrelationUsageTrack=>{
const capturedId = `${correlationText(s.id)}`;
const capturedName = `${correlationText(s.name)}`;
return {kind:"usage-timeline",id:capturedId,name:capturedName};
})()));
return {kind:"timeline-panel",classSuffix:capturedClassSuffix,headingHidden:capturedHeadingHidden,heading:capturedHeading,plot:capturedPlot,tracks:capturedTracks};
})()));
const capturedInspectorHidden = (tab !== 'timeline' || selection.rangeError ? ' hidden' : '') === " hidden";
const capturedInspectLabel = `${correlationDate(cursor)}`;
const capturedUnpinHidden = (view.inspectDate ? '' : ' hidden') === " hidden";
const capturedInspectValue = `${correlationDate(cursor)}`;
const capturedInspectMin = `${correlationDate(start)}`;
const capturedInspectMax = `${correlationDate(end - 1)}`;
const capturedMethodHidden = (tab !== 'timeline' ? ' hidden' : '') === " hidden";
const capturedAnalysisTab = `${correlationText(tab)}`;
const capturedAnalysisOpen = (tab === 'timeline' && !view.analysisOpen ? '' : ' open') === " open";
const capturedPairTabs = pairs.length > 1 ? (():CorrelationPairTabs=>{
const capturedItems = presentCorrelationRows(pairs.map((p, i) => (():CorrelationPairTab=>{
const capturedIndex = `${i}`;
const capturedActionIndex = `${i}`;
const capturedSelected = i === pairIndex;
const capturedTabindex = i === pairIndex ? 0 : -1;
const capturedMarker = `${correlationText(p.markerName)}`;
const capturedTherapy = `${correlationText(p.therapyName)}`;
return {kind:"pair-tab",index:capturedIndex,actionIndex:capturedActionIndex,selected:capturedSelected,tabindex:capturedTabindex,marker:capturedMarker,therapy:capturedTherapy};
})()));
return {kind:"pair-tabs",items:capturedItems};
})() : null;
const capturedPanel = pairs.length > 1 ? {role:"tabpanel" as const,"aria-labelledby":`corr-pair-${pairIndex}`,tabindex:0 as const} : null;
const capturedPairSummary = `${pair ? `${pair.n} paired · ${pair.rows.length - pair.n} excluded` : 'No pairs available'}`;
const capturedScatterUnavailable = tab === 'scatter' && !scatterCompatible ? (():CorrelationScatterUnavailable=>{

return {kind:"scatter-unavailable"};
})() : null;
const capturedScatterHidden = (tab !== 'scatter' || selection.rangeError || !scatterCompatible ? ' hidden' : '') === " hidden";
const capturedHistory = current.length ? (():CorrelationHistory=>{
const capturedItems = current;
return {kind:"history",items:capturedItems};
})() : null;
return {kind:"workspace",controls:capturedControls,notices:capturedNotices,plotsHidden:capturedPlotsHidden,panels:capturedPanels,inspectorHidden:capturedInspectorHidden,inspectLabel:capturedInspectLabel,unpinHidden:capturedUnpinHidden,inspectValue:capturedInspectValue,inspectMin:capturedInspectMin,inspectMax:capturedInspectMax,methodHidden:capturedMethodHidden,analysisTab:capturedAnalysisTab,analysisOpen:capturedAnalysisOpen,pairTabs:capturedPairTabs,panel:capturedPanel,pairSummary:capturedPairSummary,scatterUnavailable:capturedScatterUnavailable,scatterHidden:capturedScatterHidden,history:capturedHistory};
})());

  container.querySelectorAll('[data-corr-confirm-dose]').forEach(el => {
    const button = (el as HTMLButtonElement);
    const history = selection.histories.find(h => h.id === button.dataset.corrConfirmDose)!;
    const expected = JSON.stringify(history.record);
    const profile = state.currentProfile;
    button.addEventListener('click', async () => {
      const status = button.closest('.corr-confirm-dose')?.querySelector('.corr-confirm-status');
      if (!status) return;
      button.disabled = true;
      status.textContent = 'Saving dose dates…';
      try {
        const { saveSupplementIngredientPeriod } = await import('./supplements.js');
        if (state.currentProfile !== profile || !container.contains(button)) return;
        const saved = await saveSupplementIngredientPeriod(history.id, Number(button.dataset.corrPeriod), expected);
        if (state.currentProfile !== profile || !container.contains(button)) return;
        if (saved) refresh();
        else status.textContent = 'Dose dates were not saved. Review the latest record and try again.';
      } catch { status.textContent = 'Could not save dose dates. Please try again.'; }
      finally { button.disabled = false; }
    });
  });

  const workspaceProfile = state.currentProfile;
  container.querySelector('.corr-analysis-disclosure')!.addEventListener('toggle', event => {
    if (tab !== 'timeline' || !container.isConnected || !container.contains((event.target as Node)) || state.currentProfile !== workspaceProfile) return;
    state.correlationView.analysisOpen = (event.target as HTMLDetailsElement).open;
    void saveCorrelationWorkspace();
  });
  const updateSetting = (key: string | null, value: unknown) => { if (tab === 'timeline') state.correlationView.analysisOpen = container.querySelector('.corr-analysis-disclosure')!.hasAttribute('open'); if (key === 'pair') (state as { correlationView: RuntimeViewOperations }).correlationView.pairKey = pairs[Number(value)]?.pairKey; state.correlationView = { ...state.correlationView, [key as string]: value }; refresh(); };
  container.querySelectorAll('[data-corr-setting]').forEach(el => el.addEventListener('change', () => updateSetting(el.getAttribute('data-corr-setting')!, (el as HTMLInputElement).value)));
  container.querySelectorAll('[data-corr-choice]').forEach(el => el.addEventListener('click', () => {
    const key = el.getAttribute('data-corr-choice'), value = el.getAttribute('data-corr-value');
    if (key === 'rangePreset') (state as { correlationView: RuntimeViewOperations }).correlationView = { ...view, start: value === 'custom' ? selection.range.start : '', end: value === 'custom' ? selection.range.end : '' };
    updateSetting(key, value);
  }));
  container.querySelectorAll('[data-corr-pair]').forEach(el => {
    el.addEventListener('click', () => updateSetting('pair', el.getAttribute('data-corr-pair')));
    el.addEventListener('keydown', event => {
      const e = event as KeyboardEvent;
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
      e.preventDefault();
      const next = e.key === 'Home' ? 0 : e.key === 'End' ? pairs.length - 1 : (pairIndex + (e.key === 'ArrowRight' ? 1 : -1) + pairs.length) % pairs.length;
      updateSetting('pair', String(next));
      container.querySelector<HTMLElement>(`#corr-pair-${next}`)?.focus();
    });
  });
  container.querySelectorAll('[data-corr-tab]').forEach(el => el.addEventListener('click', () => updateSetting('tab', el.getAttribute('data-corr-tab'))));
  container.querySelectorAll('[data-corr-series]').forEach(el => el.addEventListener('click', () => {
    const id = el.getAttribute('data-corr-series');
    if (hidden.has(id)) hidden.delete(id); else hidden.add(id);
    updateSetting('hidden', [...hidden]);
  }));
  container.querySelectorAll('[data-corr-ingredient]').forEach(el => el.addEventListener('change', () => updateSetting('ingredients', { ...view.ingredients, [el.getAttribute('data-corr-ingredient')!]: (el as HTMLSelectElement).value })));
  const detail = container.querySelector('#corr-pair-detail')!;
  if (pair?.therapyId) {
    renderTherapyCorrelationResults(pair as TherapyComparison, selection.histories.find(h => h.id === pair.therapyId)!, detail);
    if (tab === 'data') detail.querySelector('details')?.setAttribute('open', '');
  } else if (pair) {
    detail.innerHTML = renderMarkerPairComparisonView(projectMarkerPairComparison(pair, tab, sourceLabel));
  }
  if (selection.rangeError) return;
  const colors = getChartColors();
  const charts: CorrelationChart[] = [];
  function inspect(day: number, announce = true) {
    cursor = Math.min(end - 1, Math.max(start, day));
    const date = correlationDate(cursor);
    const input = (container.querySelector('#corr-inspect') as HTMLInputElement);
    input.value = date;
    container.querySelector('#corr-unpin')!.toggleAttribute('hidden', !state.correlationView.inspectDate);
    container.querySelector('#corr-inspect-label')!.textContent = date;
    const readout = container.querySelector('#corr-readout')!;
    readout.setAttribute('aria-live', announce ? 'polite' : 'off');
    readout.innerHTML = renderCorrelationWorkspaceReadout(presentCorrelationRows(visible.map(s => {
      const row = s.marker?.rows.find(r => r.date === date);
      const exposure = s.history ? therapyExposure(s.history, date) : null;
      const value = s.kind === 'marker' ? row ? row.reason || `${formatValue(row.value)} ${s.unit}` : 'No measurement on this date'
        : !exposure ? 'No recorded dose' : exposure.value === null ? exposure.label : exposure.status === 'recorded' ? `${s.history.ingredientOptions.length > 1 && 'ingredient' in exposure && exposure.ingredient ? `${exposure.ingredient}: ` : ''}${textDose(exposure)}` : `${textDose(exposure)} · ${exposure.label}`;
      return (():CorrelationReadout=>{
const capturedName = `${correlationText(s.name)}`;
const capturedValue = `${correlationText(value)}`;
return {kind:"readout",name:capturedName,value:capturedValue};
})();
    })));
    charts.forEach(c => c.draw());
  }
  container.querySelector('#corr-unpin')!.addEventListener('click', () => { delete state.correlationView.inspectDate; inspect(cursor); void saveCorrelationWorkspace(); });
  container.querySelector('#corr-inspect')!.addEventListener('change', e => {
    const day = correlationDay((e.target as HTMLInputElement).value);
    if (day !== null) { state.correlationView.inspectDate = correlationDate(day); inspect(day); void saveCorrelationWorkspace(); }
  });
  if (tab === 'timeline') groups.forEach((items, index) => {
    const tracks = [...container.querySelectorAll('.corr-timeline-panel')][index]!.querySelectorAll<HTMLElement>('[data-corr-track]');
    const axes = axesFor(items);
    let datasets: CorrelationDataset[] = items.flatMap(s => {
      const common = { therapyId: s.kind === 'dose' ? s.id : '', label: `${s.name}${s.kind === 'dose' ? s.history.quantity?.ingredient ? ` · ${s.history.quantity.ingredient}` : ' dose' : ''} (${s.unit})`, borderColor: s.color, backgroundColor: s.color, borderDash: s.index % 2 ? [7, 4] : [], borderWidth: 2, tension: 0, spanGaps: false, yAxisID: axes.get(scaleKey(s))?.id, pointRadius: s.kind === 'dose' ? 2 : 4, pointStyle: s.index % 2 ? 'rectRot' : 'circle' };
      if (s.marker) return [{ ...common, data: s.marker.rows.map(r => ({ x: correlationDay(r.date), y: r.reason ? null : r.value })) }];
      const segments = segmentsById.get(s.id)!;
      const track = [...tracks].find(t => t.getAttribute('data-corr-track') === s.id)?.querySelector('.corr-use-track');
      if (track) track.innerHTML = renderCorrelationWorkspaceUsageSegments(presentCorrelationRows(segments.map(seg => (():CorrelationUsageSegment=>{
const capturedUsage = `${seg.usage === 1 ? 'recorded' : seg.usage === 0 ? 'paused' : 'unknown'}`;
const capturedLeft = `${(seg.start - start) / (end - start) * 100}`;
const capturedWidth = `${(seg.end - seg.start) / (end - start) * 100}`;
const capturedLabel = `${correlationText(`${correlationDate(seg.start)} through ${correlationDate(seg.end - 1)}: ${seg.label}`)}`;
const capturedTitle = `${correlationText(seg.label)}`;
return {kind:"usage-segment",accessibility:{role:"img",tabindex:0},usage:capturedUsage,left:capturedLeft,width:capturedWidth,label:capturedLabel,title:capturedTitle};
})())));
      const points = segments.flatMap(seg => [{ x: seg.start, y: s.history.quantity ? seg.value : null, label: seg.label }, { x: seg.end, y: s.history.quantity ? seg.value : null, label: seg.label }]);
      return points.some(p => p.y !== null) ? [{ ...common, data: points, stepped: 'after' }] : [];
    });
    if (!datasets.length) return;
    const normalized = relative(items);
    if (normalized) datasets = datasets.map(d => {
      const values = d.data.map(p => p.y).filter((v): v is number => v !== null && Number.isFinite(v));
      const min = Math.min(...values), max = Math.max(...values);
      return { ...d, yAxisID: 'relative', data: d.data.map(p => ({ ...p, rawValue: p.y, y: p.y === null ? null : max === min ? 50 : (p.y - min) / (max - min) * 100 })) };
    });
    const numericScales: Record<string, CorrelationScale> = { y: { display: false, position: 'left' }, dose: { display: false, position: 'right' } };
    for (const axis of normalized ? [] : axes.values()) numericScales[axis.id] = {
      display: true, position: axis.position, beginAtZero: axis.kind === 'dose',
      afterFit: a => { a.width = 65; },
      title: { display: true, text: axis.unit, color: colors.tickColor },
      ticks: { color: colors.tickColor }, grid: { drawOnChartArea: axis.position === 'left', color: colors.gridColor },
    };
    if (normalized) numericScales.relative = { display: true, position: 'left', min: 0, max: 100, title: { display: true, text: 'Relative trend (0–100)', color: colors.tickColor }, ticks: { color: colors.tickColor }, grid: { color: colors.gridColor } };
    const pointerDay = (event: CorrelationPointer) => {
      const day = chart.scales.x.getValueForPixel(event.x);
      const nearby = items.flatMap(s => s.marker?.rows.map(r => correlationDay(r.date)) || []).sort((a, b) => Math.abs((a as number) - day) - Math.abs((b as number) - day))[0];
      return nearby != null && Math.abs(chart.scales.x.getPixelForValue(nearby) - event.x) <= 8 ? nearby : Math.round(day);
    };
    // These handlers run only on a successfully constructed chart.
    const chart = (createChartRuntime(container.querySelector<HTMLCanvasElement>(`#corr-workspace-chart-${index}`)!, {
      type: 'line', data: { datasets },
      plugins: [{ id: 'correlation-calendar-cursor', afterLayout: (c: CorrelationChart) => {
        tracks.forEach(t => { t.style.setProperty('--corr-plot-left', `${c.chartArea.left}px`); t.style.setProperty('--corr-plot-right', `${c.width - c.chartArea.right}px`); });
      }, afterDraw: (c: CorrelationChart) => {
        const x = c.scales.x.getPixelForValue(cursor), a = c.chartArea, ctx = c.ctx;
        ctx.save(); ctx.strokeStyle = colors.tickColor; ctx.setLineDash([3, 4]); ctx.beginPath(); ctx.moveTo(x, a.top); ctx.lineTo(x, a.bottom); ctx.stroke(); ctx.restore();
      } }],
      options: {
        responsive: true, maintainAspectRatio: false, animation: false,
        layout: { padding: { left: 0, right: normalized || axes.size > 1 ? 0 : 65 } },
        onHover: (event: CorrelationPointer) => { if (!state.correlationView.inspectDate && event.x >= chart.chartArea.left && event.x <= chart.chartArea.right) inspect(pointerDay(event), false); },
        onClick: (event: CorrelationPointer) => { const day = pointerDay(event); if (Number.isFinite(day)) { state.correlationView.inspectDate = correlationDate(day); inspect(day); void saveCorrelationWorkspace(); } },
        plugins: { legend: { display: false }, tooltip: { callbacks: { title: (points: CorrelationTooltip[]) => points.length ? correlationDate(Math.floor(points[0]!.parsed.x)) : '', label: (p: CorrelationTooltip) => { const history = selection.histories.find(h => h.id === p.dataset.therapyId); const value = history ? therapyExposure(history, correlationDate(Math.floor(p.parsed.x))).label : (formatValue as (value: unknown) => unknown)(p.raw.rawValue ?? p.parsed.y); return `${p.dataset.label}: ${value}`; } } } },
        scales: {
          x: { type: 'linear', min: start, max: end, afterBuildTicks: (axis: CorrelationTickAxis) => { const count = axis.chart.width < 480 ? 3 : 5; axis.ticks = Array.from({ length: count }, (_, i) => ({ value: Math.round(start + (end - 1 - start) * i / (count - 1)) })); }, title: { display: true, text: 'Calendar date', color: colors.tickColor }, ticks: { color: colors.tickColor, maxTicksLimit: 4, includeBounds: false, callback: (v: unknown) => correlationDate(Math.round(Number(v))) }, grid: { color: colors.gridColor } },
          ...numericScales,
        },
      },
    }) as CorrelationChart);
    if (chart) { state.chartInstances[`correlation-therapy-${index}`] = chart; charts.push(chart); }
  });
  if (tab === 'scatter' && pair && scatterCompatible) {
    const eligible = scatterRows;
    const unit = eligible.length ? amountUnit(eligible[0]!.exposure) : pair.xUnit || '';
    const chart = createChartRuntime(container.querySelector<HTMLCanvasElement>('#corr-scatter')!, {
      type: 'scatter', data: { datasets: [{ label: `${pair.markerName} × ${pair.therapyName}`, data: eligible.map(r => ({ x: r.exposure.value, y: r.value, date: r.date, exposureDate: r.exposureDate })), backgroundColor: styles[0], pointRadius: 5 }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { title: (p: CorrelationTooltip[]) => p.length ? `${p[0]!.raw.date} · paired date ${p[0]!.raw.exposureDate}` : '' } } }, scales: { x: { title: { display: true, text: `${pair.therapyName} (${unit})`, color: colors.tickColor }, ticks: { color: colors.tickColor }, grid: { color: colors.gridColor } }, y: { title: { display: true, text: `${pair.markerName} (${pair.unit})`, color: colors.tickColor }, ticks: { color: colors.tickColor }, grid: { color: colors.gridColor } } } },
    });
    if (chart) state.chartInstances['correlation-therapy-scatter'] = chart;
  }
  inspect(cursor);
}
