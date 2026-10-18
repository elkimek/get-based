import {escapeHTML,formatValue} from './utils.js';
import type {prepareTherapyComparison,prepareTherapyHistory,prepareCorrelationSelection} from './therapy-correlations.js';
type Comparison=ReturnType<typeof prepareTherapyComparison>;
type History=ReturnType<typeof prepareTherapyHistory>;
type Pair=ReturnType<typeof prepareCorrelationSelection>['pairs'][number]&{xUnit?:string|undefined};
type Row=Comparison['rows'][number];
type Sources=(sources:Row['sources'])=>string;

/** Explicit public string serializers retain the former helper API for callers
 * supplying HTML. First-party feature composition uses the genuine readonly
 * view functions below and never passes ordinary children through these APIs. */
export function renderTherapyComparisonGroup(group: Comparison['groups'][number], comparison: Comparison, doseLabel: () => string): string {
    return `<tr><td>${(escapeHTML((group.ingredient ? `${group.ingredient}: ` : '') + doseLabel()))}</td><td>${(`${group.n}`)}</td><td>${(escapeHTML(formatValue(group.mean)))} ${(escapeHTML(comparison.unit))}</td><td>${(escapeHTML(group.dates[0]))} – ${(escapeHTML(group.dates.at(-1)))}</td></tr>`;
}
export function renderTherapyComparisonMeasurement(row: Row, comparison: Comparison, sourceLabel: Sources): string {
    return `<tr><td>${(escapeHTML(row.date))}</td><td>${(escapeHTML(formatValue(row.value)))} ${(escapeHTML(comparison.unit))}</td><td>${(escapeHTML(row.exposure.label))}</td><td>${(`${row.exposure.daysSinceChange ?? '—'}`)}</td><td>${(escapeHTML(row.reason || 'Included'))}</td><td>${(escapeHTML(sourceLabel(row.sources) || 'Calculated / derived marker'))}</td></tr>`;
}
export function renderTherapyComparisonPeriod(period: History['periods'][number]): string {
    return `<li>${(escapeHTML(period.start))} → ${(escapeHTML(period.end || 'ongoing'))}: ${(escapeHTML(typeof period.dose === 'string' ? period.dose : period.quantity?.text || 'Dose not recorded'))}</li>`;
}
function warnings(comparison: Comparison): string {
    return comparison.warnings.length ? `<ul class="corr-help">${(comparison.warnings.map(w => `<li>${(escapeHTML(w))}</li>`).join(''))}</ul>` : '';
}
function baseline(comparison: Comparison): string {
    return comparison.baseline ? `<p class="corr-help">Before first recorded use: ${(`${comparison.baseline.n}`)} measurements, mean ${(escapeHTML(formatValue(comparison.baseline.mean)))} ${(escapeHTML(comparison.unit))}. Prior intake is unknown, not zero.</p>` : '';
}
export function renderTherapyComparisonCard(comparison: Comparison, status: string, groups: string, rows: string, periods: string): string {
    return `<section class="corr-therapy-card" aria-label="${(escapeHTML(comparison.markerName))} × ${(escapeHTML(comparison.therapyName))}">
<p class="corr-stat">${(escapeHTML(status))}</p>
<details><summary>Data &amp; limitations · ${(`${comparison.rows.filter(r => r.reason).length}`)} excluded lab results</summary>
${(warnings(comparison))}
${(baseline(comparison))}
${(groups ? `<div class="corr-data-scroll" tabindex="0" role="region" aria-label="Marker averages by recorded dose"><table class="corr-data-table"><caption>Dose-group averages; lab dates may be months apart.</caption><thead><tr><th>Dose</th><th>Measurements</th><th>Mean marker value</th><th>Lab dates</th></tr></thead><tbody>${(groups)}</tbody></table></div>` : `<p class="corr-help">No lab measurements have usable numeric dose information.</p>`)}
<div class="corr-data-scroll" tabindex="0" role="region" aria-label="Measurements and exclusions"><table class="corr-data-table"><thead><tr><th>Lab date</th><th>Marker value</th><th>Recorded dose / status</th><th>Days since change</th><th>Analysis status</th><th>Source entry</th></tr></thead><tbody>${(rows || `<tr><td colspan="6">No measurements for this marker.</td></tr>`)}</tbody></table></div>
<p class="corr-help">Use is recorded, not verified. Days since change runs from period start to lab date. Conflicting same-date results are excluded; duplicates count once. Gaps mean unknown, not zero. End dates are inclusive; breaks do not imply washout.</p>
<ul class="corr-period-list">${(periods)}</ul>
</details>
</section>`;
}
export function renderMarkerPairComparison(pair: Pair, tab: string, sourceLabel: Sources): string {
    return `<p class="corr-stat">${(pair.r === null ? escapeHTML(pair.unavailable) : `Exploratory Pearson r = ${pair.r.toFixed(2)}`)}</p><details${(tab === 'data' ? ' open' : '')}><summary>Data &amp; limitations</summary><div class="corr-data-scroll" tabindex="0"><table class="corr-data-table"><thead><tr><th>Lab date</th><th>${(escapeHTML(pair.markerName))} (${(escapeHTML(pair.unit))})</th><th>${(escapeHTML(pair.therapyName))} (${(escapeHTML(pair.xUnit))})</th><th>Status</th><th>Source</th></tr></thead><tbody>${(pair.rows.map(row => `<tr><td>${(`${row.date}`)}</td><td>${(`${formatValue(row.value)}`)}</td><td>${(row.exposure.value === null ? '—' : `${formatValue(row.exposure.value)}`)}</td><td>${(escapeHTML(row.reason || 'Included'))}</td><td>${(escapeHTML(sourceLabel(row.sources)))}</td></tr>`)
            .join(''))}</tbody></table></div><p class="corr-help">Pairs require same-date results, without interpolation. Correlation is not causation.</p></details>`;
}

import {renderHTML as renderResults} from './components/TherapyComparisonResults.svelte.html.js';
import {renderHTML as renderMarker} from './components/MarkerPairComparison.svelte.html.js';
import {categoryLiteral} from './category-presentation.js';
export interface TherapyComparisonGroupView {readonly dose:string;readonly count:string;readonly mean:string;readonly unit:string;readonly start:string;readonly end:string}
export interface TherapyComparisonMeasurementView {readonly date:string;readonly value:string;readonly unit:string;readonly exposure:string;readonly days:string;readonly status:string;readonly source:string}
export interface TherapyComparisonPeriodView {readonly start:string;readonly end:string;readonly dose:string}
export interface TherapyComparisonView {
 readonly marker:string;readonly therapy:string;readonly status:string;readonly excluded:string;readonly scroll:{readonly tabindex:0};
 readonly warnings:readonly string[]|null;readonly baseline:{readonly count:string;readonly mean:string;readonly unit:string}|null;
 readonly groups:readonly TherapyComparisonGroupView[];readonly rows:readonly TherapyComparisonMeasurementView[];readonly periods:readonly TherapyComparisonPeriodView[];
}
export interface MarkerPairComparisonView {readonly scroll:{readonly tabindex:0};readonly status:string;readonly open:boolean;readonly marker:string;readonly unit:string;readonly therapy:string;readonly xUnit:string;
 readonly rows:readonly {readonly date:string;readonly value:string;readonly exposure:string;readonly status:string;readonly source:string}[]}
export function projectTherapyComparisonGroup(group:Comparison['groups'][number],comparison:Comparison,doseLabel:()=>string):TherapyComparisonGroupView {
 const dose=categoryLiteral((group.ingredient?`${group.ingredient}: `:'')+doseLabel()),count=`${group.n}`;
 const mean=categoryLiteral(formatValue(group.mean)),unit=categoryLiteral(comparison.unit),start=categoryLiteral(group.dates[0]),end=categoryLiteral(group.dates.at(-1));
 return {dose,count,mean,unit,start,end};
}
export function projectTherapyComparisonMeasurement(row:Row,comparison:Comparison,sourceLabel:Sources):TherapyComparisonMeasurementView {
 const date=categoryLiteral(row.date),value=categoryLiteral(formatValue(row.value)),unit=categoryLiteral(comparison.unit);
 const exposure=categoryLiteral(row.exposure.label),days=`${row.exposure.daysSinceChange??'—'}`,status=categoryLiteral(row.reason||'Included');
 const source=categoryLiteral(sourceLabel(row.sources)||'Calculated / derived marker');return {date,value,unit,exposure,days,status,source};
}
export function projectTherapyComparisonPeriod(period:History['periods'][number]):TherapyComparisonPeriodView {
 const start=categoryLiteral(period.start),end=categoryLiteral(period.end||'ongoing');
 const dose=categoryLiteral(typeof period.dose==='string'?period.dose:period.quantity?.text||'Dose not recorded');return {start,end,dose};
}
export function projectTherapyComparisonView(comparison:Comparison,status:string,groups:readonly TherapyComparisonGroupView[],rows:readonly TherapyComparisonMeasurementView[],periods:readonly TherapyComparisonPeriodView[]):TherapyComparisonView {
 const marker=categoryLiteral(comparison.markerName),therapy=categoryLiteral(comparison.therapyName),literalStatus=categoryLiteral(status),excluded=`${comparison.rows.filter(r=>r.reason).length}`;
 const warnings=comparison.warnings.length?comparison.warnings.map(categoryLiteral).filter(()=>true):null;
 const baseline=comparison.baseline?{count:`${comparison.baseline.n}`,mean:categoryLiteral(formatValue(comparison.baseline.mean)),unit:categoryLiteral(comparison.unit)}:null;
 return {marker,therapy,status:literalStatus,excluded,scroll:{tabindex:0},warnings,baseline,groups,rows,periods};
}
export function projectMarkerPairComparison(pair:Pair,tab:string,sourceLabel:Sources):MarkerPairComparisonView {
 const status=pair.r===null?categoryLiteral(pair.unavailable):`Exploratory Pearson r = ${pair.r.toFixed(2)}`;
 const open=tab==='data',marker=categoryLiteral(pair.markerName),unit=categoryLiteral(pair.unit),therapy=categoryLiteral(pair.therapyName),xUnit=categoryLiteral(pair.xUnit);
 const rows=pair.rows.map(row=>({date:`${row.date}`,value:`${formatValue(row.value)}`,exposure:row.exposure.value===null?'—':`${formatValue(row.exposure.value)}`,status:categoryLiteral(row.reason||'Included'),source:categoryLiteral(sourceLabel(row.sources))})).filter(()=>true);
 return {scroll:{tabindex:0},status,open,marker,unit,therapy,xUnit,rows};
}
export function renderTherapyComparisonView(view:TherapyComparisonView):string{return renderResults({view});}
export function renderMarkerPairComparisonView(view:MarkerPairComparisonView):string{return renderMarker({view});}
