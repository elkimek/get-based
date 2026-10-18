import {escapeHTML,formatValue} from './utils.js';
import {formatRangeBounds,type resolveMarkerRangeContext} from './marker-analysis.js';
import type {CompareCategory,CompareNumericMarker} from '../types/compare-correlations.js';

/** Explicit public string serializers retain the former helper API for callers
 * supplying HTML. First-party feature composition uses the genuine readonly
 * view functions below and never passes ordinary children through these APIs. */
export function renderCompareHeader(): string {return `<div class="category-header"><h2>Compare Dates</h2>
<p>Side-by-side comparison of biomarker values between two collection dates</p></div>`;}
export function renderCompareEmpty(): string {return `<div class="empty-state"><div class="empty-state-icon">↔</div>
<h3>Not Enough Data</h3><p>Import at least 2 lab result dates to compare values side by side.</p></div>`;}
export function renderCompareOption(value: unknown, label: string): string {
 // Original option values use raw template interpolation; retain that explicit compatibility contract.
 return `<option value="${(`${value}`)}">${(label)}</option>`;
}
export function renderCompareControls(firstAttrs: string, firstOptions: string, swapAttrs: string, secondAttrs: string, secondOptions: string): string {
 return `<div class="compare-controls">
<label class="compare-date-field" for="compare-select-1"><span>Date 1:</span>
${('<select id="compare-select-1" '+firstAttrs+'>')}${(firstOptions)}</select>
</label>
${('<button class="compare-swap-btn" '+swapAttrs+' title="Swap dates" aria-label="Swap dates">')}⇄</button>
<label class="compare-date-field" for="compare-select-2"><span>Date 2:</span>
${('<select id="compare-select-2" '+secondAttrs+'>')}${(secondOptions)}</select>
</label>
</div><div id="compare-results"></div>`;
}
export function renderCompareHead(first: unknown, second: unknown): string {
 return `<tr>
<th>Biomarker</th><th>Unit</th><th>Ranges</th>
<th>${(escapeHTML(first))}</th><th>${(escapeHTML(second))}</th><th>Delta</th><th>% Change</th></tr>`;
}
export function renderCompareRow(marker: CompareNumericMarker, ranges: string, v1: number|null, v2: number|null,
 s1: string, s2: string, direction: string, delta: number|null, percent: number|null): string {
 // Preserve each field escape and numeric formatter invocation in the original row-template order.
 return `<tr>
<td class="marker-name">${(escapeHTML(marker.name))}</td>
<td style="color:var(--text-muted);font-size:12px">${(escapeHTML(marker.unit))}</td>
<td class="compare-ranges-cell">${(ranges)}</td>
<td class="value-cell val-${(`${s1}`)}" style="font-weight:600">${(`${v1!==null?formatValue(v1):'—'}`)}</td>
<td class="value-cell val-${(`${s2}`)}" style="font-weight:600">${(`${v2!==null?formatValue(v2):'—'}`)}</td>
<td class="${(`${direction}`)}" style="font-weight:600">${(`${delta!==null?(delta>0?'+':'')+formatValue(delta):'—'}`)}</td>
<td class="${(`${direction}`)}" style="font-weight:600">${(`${percent!==null?(percent>0?'+':'')+percent.toFixed(1)+'%':'—'}`)}</td>
</tr>`;
}
export function renderCompareCategory(key: string, category: CompareCategory, glyph: (key: string,label: unknown)=>unknown): string {
 const glyphHTML=`${glyph(key,category.label)}`,label=escapeHTML(category.label);
 return `<tr class="cat-row"><td colspan="7"><span class="compare-category-label">${(glyphHTML)}<span>${(label)}</span></span></td></tr>`;
}
type Range = ReturnType<typeof resolveMarkerRangeContext>['displayedRanges'][number];
export function renderCompareRangeLine(range: Range, showUsed: boolean): string {
 const used=range.usedForStatus?' compare-range-line-used':'',label=escapeHTML(range.label),bounds=escapeHTML(formatRangeBounds(range)),
 badge=showUsed&&range.usedForStatus?`<span class="compare-range-used">used</span>`:'';
 return `
<span class="compare-range-line${(used)}">
<span class="compare-range-label">${(label)}</span>
<span class="compare-range-bounds">${(bounds)}</span>
${(badge)}
</span>`;
}
export function renderCompareRangeSame(lines: string): string {return `<div class="compare-range-stack">${(lines)}</div>`;}
export function renderCompareRangeDated(first: unknown, firstLines: ()=>string, second: unknown, secondLines: ()=>string): string {
 // Date escape precedes its range-leaf reads, separately for each group.
 const label1=escapeHTML(first),lines1=firstLines(),label2=escapeHTML(second),lines2=secondLines();
 return `<div class="compare-range-stack compare-range-stack-dated">
<div class="compare-range-date-group">
<span class="compare-range-date">${(label1)}</span>
${(lines1)}
</div>
<div class="compare-range-date-group">
<span class="compare-range-date">${(label2)}</span>
${(lines2)}
</div>
</div>`;
}

import {renderHTML as renderPage} from './components/CompareDatesPage.svelte.html.js';
import {renderHTML as renderTable} from './components/CompareDatesTable.svelte.html.js';
import {categoryLiteral} from './category-presentation.js';
import type {CategoryGlyphView} from './category-page-presentation.js';
export interface CompareDateOptionView {readonly value:string;readonly label:string}
export type CompareDatesPageView={readonly kind:'empty'}|{
 readonly kind:'dates';readonly first:readonly CompareDateOptionView[];readonly second:readonly CompareDateOptionView[]};
export interface CompareRangeLineView {readonly used:boolean;readonly label:string;readonly bounds:string;readonly badge:boolean}
export type CompareRangeStackView={readonly kind:'same';readonly lines:readonly CompareRangeLineView[]}|{
 readonly kind:'dated';readonly firstLabel:string;readonly first:readonly CompareRangeLineView[];
 readonly secondLabel:string;readonly second:readonly CompareRangeLineView[]};
export interface CompareDateRowView {
 readonly name:string;readonly unit:string;readonly range:CompareRangeStackView;
 readonly firstStatus:string;readonly firstValue:string;readonly secondStatus:string;readonly secondValue:string;
 readonly direction:string;readonly delta:string;readonly percent:string;
}
export interface CompareDateCategoryView {readonly glyph:CategoryGlyphView;readonly label:string;readonly rows:readonly CompareDateRowView[]}
export interface CompareDatesTableView {readonly firstLabel:string;readonly secondLabel:string;readonly categories:readonly CompareDateCategoryView[]}
export function projectCompareRangeLine(range:Range,showUsed:boolean):CompareRangeLineView {
 const used=range.usedForStatus,label=categoryLiteral(range.label),bounds=categoryLiteral(formatRangeBounds(range));
 return {used,label,bounds,badge:showUsed&&range.usedForStatus};
}
export function projectCompareDateRow(marker:CompareNumericMarker,range:CompareRangeStackView,v1:number|null,v2:number|null,
 firstStatus:string,secondStatus:string,direction:string,delta:number|null,percent:number|null):CompareDateRowView {
 const name=categoryLiteral(marker.name),unit=categoryLiteral(marker.unit);
 const firstValue=`${v1!==null?formatValue(v1):'—'}`,secondValue=`${v2!==null?formatValue(v2):'—'}`;
 const deltaValue=`${delta!==null?(delta>0?'+':'')+formatValue(delta):'—'}`;
 const percentValue=`${percent!==null?(percent>0?'+':'')+percent.toFixed(1)+'%':'—'}`;
 return {name,unit,range,firstStatus,firstValue,secondStatus,secondValue,direction,delta:deltaValue,percent:percentValue};
}
export function renderCompareDatesPage(view:CompareDatesPageView):string{return renderPage({view});}
export function renderCompareDatesTable(view:CompareDatesTableView):string{return renderTable({view});}
