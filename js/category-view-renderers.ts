import {componentStaticStyles} from './component-inline-style-map.generated.js';
import {categoryLiteral,categorySafeLabel,renderCategoryChartCard,renderCategoryTable,renderCategoryHeatmap,renderCategoryFatty,renderCategoryColumns} from './category-presentation.js';
import type {CategoryChartCardView,CategoryRangeRailView,CategoryDataTableView,CategoryHeatmapView,CategoryFattyAcidsView,CategoryTableRowView,CategoryHeatmapRowView,CategoryRangeTextView,CategoryFattyCardView} from './category-presentation.js';
import type { CategoryMarkerReader, CategoryReader, CategoryNumericMarkerOperations, CategoryNumericRangeOperations, CategoryRangeReader, CategoryDelegateRoot, CategoryScrollTarget, CategoryEventRoot } from '../types/category-view-renderers.js';
// category-view-renderers.js — Category chart, table, heatmap, and fatty-acid render helpers

import { state } from './state.js';
import { getStatus, formatValue, getTrend, safeMarkerId } from './utils.js';
import { getChartColors } from './theme.js';
import { ensureChartJs, formatChartTickValue } from './health-data-loader.js';
import { createChartRuntime, hasChartRuntime } from './charts-runtime.js';
import { getEffectiveRange, getEffectiveRangeForDate, getEffectiveRangeLabelForDate, getLatestValueIndex, statusIcon } from './marker-analysis.js';

const categoryRendererDelegateRoots = new WeakSet<CategoryDelegateRoot>();
const STACKED_SNAPSHOT_UNIT_LENGTH = 12;

function handleTableScrollSync(event: Event) {
  const target = event.target as CategoryScrollTarget | null;
  if (!target || typeof target.closest !== 'function') return;
  const scrollEl = ((target.closest as (selector: string) => unknown)('[data-gb-table-scroll-sync]') as HTMLElement | null);
  if (!scrollEl || !(event.currentTarget as CategoryEventRoot | null)?.contains?.(scrollEl)) return;
  const shell = (scrollEl.closest('.gb-table-shell') as HTMLElement | null);
  shell?.style.setProperty('--gb-table-scroll-x', `${scrollEl.scrollLeft}px`);
}

export function installCategoryRendererDelegates(root: CategoryDelegateRoot | null = typeof document !== 'undefined' ? document : null) {
  if (!root || categoryRendererDelegateRoots.has(root)) return;
  categoryRendererDelegateRoots.add(root);
  root.addEventListener('scroll', handleTableScrollSync, { capture: true, passive: true });
}

if (typeof document !== 'undefined') installCategoryRendererDelegates();

function clampPct(value: number) {
  return Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
}

function projectSemanticRangeRail(value: unknown, minValue: unknown, maxValue: unknown, status: unknown, style: unknown = '') {
  const valueNum = Number(value);
  const minNum = Number(minValue);
  const maxNum = Number(maxValue);
  if (!Number.isFinite(valueNum) || !Number.isFinite(minNum) || !Number.isFinite(maxNum) || minNum === maxNum) return null;
  const goodMin = Math.min(minNum, maxNum);
  const goodMax = Math.max(minNum, maxNum);
  const goodSpan = goodMax - goodMin;
  let railMin = goodMin - goodSpan * 0.1;
  let railMax = goodMax + goodSpan * 0.1;
  railMin = Math.min(railMin, valueNum);
  railMax = Math.max(railMax, valueNum);
  let railSpan = railMax - railMin;
  if (railSpan <= 0) return null;
  if (valueNum <= railMin) railMin -= railSpan * 0.08;
  if (valueNum >= railMax) railMax += railSpan * 0.08;
  railSpan = railMax - railMin;
  if (railSpan <= 0) return null;
  const dot = clampPct(((valueNum - railMin) / railSpan) * 100);
  const goodLeft = clampPct(((goodMin - railMin) / railSpan) * 100);
  const goodRight = clampPct(((goodMax - railMin) / railSpan) * 100);
  const goodWidth = Math.max(0, goodRight - goodLeft);
  const lowWidth = goodLeft;
  const highWidth = Math.max(0, 100 - goodRight);
  return {status:`${status}`,style:style?`${style}`:null,dot,lowWidth,goodLeft,goodWidth,goodRight,highWidth} satisfies CategoryRangeRailView;
}

function hasRangeBounds(range: CategoryRangeReader | null | undefined) {
  return range?.min != null || range?.max != null;
}

function markerValueStatus(value: unknown, range: CategoryRangeReader) {
  if (value === null || value === undefined) return 'missing';
  return hasRangeBounds(range) ? (getStatus as (value: unknown, min: unknown, max: unknown) => ReturnType<typeof getStatus>)(value, range.min, range.max) : 'unrated';
}

function exactObservationLabel(isoDate: unknown, fallback: unknown, includeYear: unknown = true) {
  if (typeof isoDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return fallback;
  const date = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(date.getTime())) return fallback;
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    ...(includeYear ? { year: 'numeric' } : {}),
  });
}

export function projectCategoryChartCard(id: string, marker: CategoryMarkerReader, dateLabels: readonly unknown[], chartDates: readonly unknown[] = []) {
  // id is interpolated into delegated data attributes and DOM ids below.
  // Single chokepoint guard for every caller (dashboard, showCategory,
  // switchView).
  if (!safeMarkerId(id)) return null;
  state.markerRegistry[id] = marker;
  const latestIdx = (getLatestValueIndex as (values: unknown) => number)(marker.values);
  const latestVal = (latestIdx !== -1 ? marker.values[latestIdx] : null) as number | null | undefined;
  const lr = (getEffectiveRangeForDate as (marker: unknown, index: number) => CategoryNumericRangeOperations)(marker, latestIdx);
  const status = markerValueStatus(latestVal, lr);
  const effectiveRangeLabel = (getEffectiveRangeLabelForDate as (marker: unknown, index: number, mode?: string) => unknown)(marker, latestIdx);
  const statusLabel = status === "normal" ? "Normal"
    : status === "high" ? "High"
    : status === "low" ? "Low"
    : status === 'unrated' ? 'No range' : "N/A";
  const sIcon = statusIcon(status);

  const trend = (getTrend as (values: unknown, min: unknown, max: unknown) => ReturnType<typeof getTrend>)(marker.values, lr.min, lr.max);
  const trendBadge = trend.arrow !== '—'
    ? {className:`${trend.cls}`,label:categoryLiteral(trend.label),title:categoryLiteral(trend.label),arrow:categoryLiteral(trend.arrow)} : null;
  const markerName = marker.name || '';
  const labels = marker.singlePoint ? [marker.singleDateLabel || "N/A"] : dateLabels;
  const fmtRange = (min: unknown, max: unknown) => `${min != null ? (formatValue as (value: unknown) => unknown)(min) : '–'} – ${max != null ? (formatValue as (value: unknown) => unknown)(max) : '–'}`;
  const latestPhaseRange = (latestIdx !== -1 ? marker.phaseRefRanges?.[latestIdx] : null) as CategoryRangeReader | null | undefined;
  const latestContextRange = (latestIdx !== -1 ? marker.contextRefRanges?.[latestIdx] : null) as CategoryRangeReader | null | undefined;
  const latestContextOptimalRange = (latestIdx !== -1 ? marker.contextOptimalRanges?.[latestIdx] : null) as CategoryRangeReader | null | undefined;
  const referenceRange = latestContextRange || { min: marker.refMin, max: marker.refMax };
  const optimalRange = latestContextOptimalRange || { min: marker.optimalMin, max: marker.optimalMax };
  const referenceRangeLabel = (getEffectiveRangeLabelForDate as (marker: unknown, index: number, mode?: string) => unknown)(marker, latestIdx, 'reference');
  const rangeRows: { label: unknown; value: string }[] = [];
  if (hasRangeBounds(latestPhaseRange)) {
    rangeRows.push({
      label: (getEffectiveRangeLabelForDate as (marker: unknown, index: number, mode?: string) => unknown)(marker, latestIdx, 'reference'),
      value: fmtRange(lr.min, lr.max),
    });
  } else if (state.rangeMode === 'both') {
    if (hasRangeBounds(referenceRange)) {
      rangeRows.push({ label: referenceRangeLabel, value: fmtRange(referenceRange.min, referenceRange.max) });
    } else if (latestContextRange) {
      rangeRows.push({ label: referenceRangeLabel, value: 'Not set' });
    }
    if (hasRangeBounds(optimalRange)) {
      rangeRows.push({ label: latestContextOptimalRange ? effectiveRangeLabel : 'Optimal', value: fmtRange(optimalRange.min, optimalRange.max) });
    } else if (latestContextOptimalRange && !latestContextRange) {
      rangeRows.push({ label: effectiveRangeLabel, value: 'Not set' });
    }
  } else if (hasRangeBounds(lr)) {
    rangeRows.push({ label: effectiveRangeLabel, value: fmtRange(lr.min, lr.max) });
  } else if (latestContextRange || latestContextOptimalRange) {
    rangeRows.push({ label: effectiveRangeLabel, value: 'Not set' });
  }
  if (rangeRows.length === 0) rangeRows.push({ label: 'Range', value: 'Not set' });

  // Show only actual observations so missing dates do not consume summary slots.
  const visibleValueIndexes: number[] = [];
  for (let i = 0; i < marker.values.length; i++) {
    if (marker.values[i] !== null && marker.values[i] !== undefined) visibleValueIndexes.push(i);
  }
  const compactValueIndexes = visibleValueIndexes.length > 4 ? visibleValueIndexes.slice(-4) : visibleValueIndexes;
  const labelCounts = new Map<unknown, number>();
  for (const i of visibleValueIndexes) {
    const label = labels[i] || '';
    labelCounts.set(label, (labelCounts.get(label) || 0) + 1);
  }
  const displayDateLabel = (index: number, includeYear: boolean) => {
    const fallback = labels[index] || '';
    return (labelCounts.get(fallback) as number) > 1
      ? exactObservationLabel(chartDates[index], fallback, includeYear)
      : fallback;
  };

  const latestDateLabel = latestIdx !== -1 ? (displayDateLabel(latestIdx, true) || 'Latest') : 'No value';
  const latestDisplay = latestVal !== null ? (formatValue as (value: unknown) => unknown)(latestVal) : '—';
  const latestUnit = marker.unit || '';
  // Long ratio/sample qualifiers cannot share a narrow card row with the
  // reference range. Stack only those summaries; ordinary units retain the
  // compact two-column card.
  const stackedSnapshot = Array.from(String(latestUnit).trim()).length > STACKED_SNAPSHOT_UNIT_LENGTH;
  const latestMeta = latestVal !== null
    ? latestDateLabel
    : 'Add a value to start the trend';
  const rangeAria = rangeRows.map((row) => {
    const unit = row.value !== 'Not set' && latestUnit ? ` ${latestUnit}` : '';
    return `${row.label} ${row.value}${unit}`;
  }).join('; ');
  const cardLabel = latestVal !== null
    ? `${markerName}. ${statusLabel}. Latest ${latestDisplay}${latestUnit ? ` ${latestUnit}` : ''}, ${latestDateLabel}. ${rangeAria}.${trendBadge ? ` ${trend.label}.` : ''}`
    : `${markerName}. No values. ${rangeAria}.`;
  const nameTitle=categoryLiteral(markerName),name=categoryLiteral(markerName);
  const accessibleLabel=categoryLiteral(cardLabel),latestValue=categoryLiteral(latestDisplay);
  const unit=latestVal!==null&&latestUnit?categoryLiteral(latestUnit):null;
  const latestMetadata=categoryLiteral(latestMeta),rangeLabel=categoryLiteral(rangeAria);
  const ranges=rangeRows.map(row=>{
    const unit=row.value!=='Not set'&&latestUnit?categoryLiteral(latestUnit):null;
    return {label:categoryLiteral(row.label),value:categoryLiteral(row.value),unit};
  });
  const recent=[];
  for(const i of compactValueIndexes){
    const v=marker.values[i] as number|null|undefined;
    const ri=(getEffectiveRangeForDate as (marker:unknown,index:number)=>CategoryNumericRangeOperations)(marker,i);
    const status=markerValueStatus(v,ri);
    const itemDateLabel=displayDateLabel(i,false);
    const fullDateLabel=exactObservationLabel(chartDates[i],labels[i]||'',true);
    recent.push({title:categoryLiteral(fullDateLabel),date:categoryLiteral(itemDateLabel),status,value:`${v!==null?formatValue(v):'—'}`});
  }
  return {id,status,nameTitle,name,icon:sIcon?sIcon+' ':'',statusLabel,trend:trendBadge,accessibleLabel,stacked:stackedSnapshot,
    latestValue,latestUnit:unit,latestMetadata,rangeLabel,ranges,recentCount:Math.max(1,compactValueIndexes.length),recent} satisfies CategoryChartCardView;
}

export function renderChartCard(id:string,marker:CategoryMarkerReader,dateLabels:readonly unknown[],chartDates:readonly unknown[]=[]){
 return renderCategoryChartCard(projectCategoryChartCard(id,marker,dateLabels,chartDates));
}
export function renderTableColgroup(cols:readonly unknown[]){return renderCategoryColumns(cols.map(categoryLiteral));}

/** Public raw-HTML compatibility boundary. First-party Category tables use the
 * finite model and genuine CategoryScrollableTable children instead. */
export function renderScrollableTableShell(kind:unknown,wrapperClass:unknown,tableClass:unknown,colgroup:unknown,headHtml:unknown,bodyHtml:unknown,minWidth:number){
 const shellClass=`gb-table-shell gb-table-shell-${kind}`;
 return `<div class="${shellClass}" style="--gb-table-min-width:${Math.max(660,Math.round(minWidth))}px">
    <div class="gb-table-sticky-head" aria-hidden="true">
      <div class="gb-table-sticky-head-scroll">
        <table class="${tableClass}">${colgroup}<thead>${headHtml}</thead></table>
      </div>
    </div>
    <div class="${wrapperClass}" data-gb-table-scroll-sync>
      <table class="${tableClass}">${colgroup}<thead>${headHtml}</thead><tbody>${bodyHtml}</tbody></table>
    </div>
  </div>`;
}

function populatedDateColumnIndexes(markerEntries: [string, CategoryNumericMarkerOperations][], labels: readonly unknown[]) {
  return labels
    .map((_, index) => index)
    .filter(index => markerEntries.some(([, marker]) => {
      const value = marker.values?.[index];
      return value !== null && value !== undefined;
    }));
}

export function projectCategoryTable(cat:CategoryReader,dateLabels:readonly unknown[],categoryKey?:string|null,dates?:readonly unknown[]|null):CategoryDataTableView {
 const labels=cat.singleDate?[cat.singleDateLabel||'N/A']:dateLabels;
 const markerEntries=Object.entries(cat.markers as Record<string,CategoryNumericMarkerOperations>).filter(([,m])=>m.values&&m.values.some(v=>v!==null&&v!==undefined));
 if(!markerEntries.length)return {kind:'empty'};
 const indexes=populatedDateColumnIndexes(markerEntries,labels);
 const columns=['gb-col-marker','gb-col-unit','gb-col-reference',...indexes.map(()=>'gb-col-date'),'gb-col-trend','gb-col-range'];
 const datesView=indexes.map(i=>categorySafeLabel(labels[i]));
 const rows:CategoryTableRowView[]=[];
 for(const [key,marker]of markerEntries){
  const id=categoryKey?categoryKey+'_'+key:'';
  const r=(getEffectiveRange as (marker:unknown)=>CategoryNumericRangeOperations)(marker);
  let range:CategoryRangeTextView={kind:'single',text:r.min!=null&&r.max!=null?`${formatValue(r.min)} – ${formatValue(r.max)}`:'—'};
  if(state.rangeMode==='both'&&(marker.optimalMin!=null||marker.optimalMax!=null))range={kind:'both',referenceMinimum:`${formatValue(marker.refMin)}`,referenceMaximum:`${formatValue(marker.refMax)}`,optimalMinimum:`${formatValue(marker.optimalMin)}`,optimalMaximum:`${formatValue(marker.optimalMax)}`};
  const name=categoryLiteral(marker.name),unit=categoryLiteral(marker.unit),values=[];
  for(const i of indexes){
   const v=marker.values[i] as number|null|undefined;
   const ri=(getEffectiveRangeForDate as (marker:unknown,index:number)=>CategoryNumericRangeOperations)(marker,i);
   const hasValue=v!==null&&v!==undefined,status=hasValue?getStatus(v,ri.min,ri.max):'missing';
   const colDate=dates&&!cat.singleDate?dates[i]:null;
   const emptyAction=!hasValue&&id&&colDate?{id,date:String(colDate),title:'Add value for '+(dateLabels[i]?categorySafeLabel(dateLabels[i]):categoryLiteral(colDate))}:null;
   values.push({status,emptyAction,value:`${hasValue?formatValue(v):'—'}`});
  }
  const li=(getLatestValueIndex as (values:unknown)=>number)(marker.values);
  const trendRange=li!==-1?(getEffectiveRangeForDate as (marker:unknown,index:number)=>CategoryNumericRangeOperations)(marker,li):r;
  const trend=getTrend(marker.values,trendRange.min,trendRange.max);
  const trendView={className:`${trend.cls}`,arrow:`${trend.arrow}`};
  let rail=null;
  if(li!==-1&&r.min!=null&&r.max!=null){
   const lr=(getEffectiveRangeForDate as (marker:unknown,index:number)=>CategoryNumericRangeOperations)(marker,li);
   const status=getStatus(marker.values[li],lr.min,lr.max);
   rail=projectSemanticRangeRail(marker.values[li],lr.min,lr.max,status);
  }
  rows.push({id:id||null,name,unit,range,values,trend:trendView,rail});
 }
 return {kind:'data',columns,dates:datesView,minimumWidth:Math.max(660,180+86+128+indexes.length*104+78+112),rows};
}
export function renderTableView(cat:CategoryReader,dateLabels:readonly unknown[],categoryKey?:string|null,dates?:readonly unknown[]|null){return renderCategoryTable(projectCategoryTable(cat,dateLabels,categoryKey,dates));}

export function projectCategoryHeatmap(cat:CategoryReader,dateLabels:readonly unknown[],categoryKey:string):CategoryHeatmapView {
 const labels=cat.singleDate?[cat.singleDateLabel||'N/A']:dateLabels;
 const markerEntries=Object.entries(cat.markers as Record<string,CategoryNumericMarkerOperations>).filter(([,m])=>m.values&&m.values.some(v=>v!==null&&v!==undefined));
 if(!markerEntries.length)return {kind:'empty'};
 const indexes=populatedDateColumnIndexes(markerEntries,labels);
 const columns=['gb-col-marker',...indexes.map(()=>'gb-col-date')];
 const dates=indexes.map(i=>categorySafeLabel(labels[i]));
 const rows:CategoryHeatmapRowView[]=[];
 for(const [key,marker]of markerEntries){
  const id=categoryKey+'_'+key;state.markerRegistry[id]=marker;
  const accessibleName=categoryLiteral(marker.name),name=categoryLiteral(marker.name),values=[];
  for(const i of indexes){
   const v=marker.values[i] as number|null|undefined;
   const ri=(getEffectiveRangeForDate as (marker:unknown,index:number)=>CategoryNumericRangeOperations)(marker,i);
   const hasValue=v!==null&&v!==undefined,status=hasValue?getStatus(v,ri.min,ri.max):'missing';
   const label=`${categoryLiteral(marker.name)} ${categorySafeLabel(labels[i]||'')}: ${hasValue?formatValue(v):'no value'}`;
   values.push({status,label,value:`${hasValue?formatValue(v):'—'}`});
  }
  rows.push({id,accessibleName,name,values});
 }
 return {kind:'heatmap',columns,dates,minimumWidth:Math.max(660,180+indexes.length*104),rows};
}
export function renderHeatmapView(cat:CategoryReader,dateLabels:readonly unknown[],categoryKey:string){return renderCategoryHeatmap(projectCategoryHeatmap(cat,dateLabels,categoryKey));}

export function projectCategoryFattyAcids(cat:CategoryReader,categoryKey:string):CategoryFattyAcidsView|null {
 if(!safeMarkerId(categoryKey))return null;
 const date=cat.singleDate?' — '+new Date(cat.singleDate+'T00:00:00').toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'}):'';
 const cards:CategoryFattyCardView[]=[];
 for(const [key,marker]of Object.entries(cat.markers as Record<string,CategoryNumericMarkerOperations>)){
  if(!safeMarkerId(key))continue;
  const r=(getEffectiveRange as (marker:unknown)=>CategoryNumericRangeOperations)(marker);
  const v=marker.values[0],status=getStatus(v,r.min,r.max);
  let range:CategoryRangeTextView;
  if(state.rangeMode==='both'&&(marker.optimalMin!=null||marker.optimalMax!=null)&&(marker.refMin!=null||marker.refMax!=null))range={kind:'both',referenceMinimum:`${formatValue(marker.refMin)}`,referenceMaximum:`${formatValue(marker.refMax)}`,optimalMinimum:`${formatValue(marker.optimalMin)}`,optimalMaximum:`${formatValue(marker.optimalMax)}`};
  else {const rangeLabel=state.rangeMode==='optimal'&&(marker.optimalMin!=null||marker.optimalMax!=null)?'Optimal':'Ref';range={kind:'single',text:`${rangeLabel}: ${formatValue(r.min)} – ${formatValue(r.max)}`};}
  const label=categoryLiteral(marker.name)+' '+formatValue(v)+(marker.unit?' '+categoryLiteral(marker.unit):'');
  const name=categoryLiteral(marker.name),value=`${formatValue(v)}`,unit=marker.unit?' '+categoryLiteral(marker.unit):'';
  const rail=projectSemanticRangeRail(v,r.min,r.max,status,componentStaticStyles.categoryCardRail);
  cards.push({id:categoryKey+'_'+key,label,name,status,value,unit,range,rail});
 }
 return {date,cards};
}
export function renderFattyAcidsView(cat:CategoryReader,categoryKey:string){return renderCategoryFatty(projectCategoryFattyAcids(cat,categoryKey));}

export function renderFattyAcidsCharts(cat: CategoryReader) {
  if (!hasChartRuntime()) {
    ensureChartJs().then(() => {
      if (document.getElementById("chart-fa-bar")) renderFattyAcidsCharts(cat);
    }).catch(() => {});
    return;
  }
  const tc = getChartColors();
  const names: unknown[]=[], vals: unknown[]=[], mins: unknown[]=[], maxs: unknown[]=[], bgC: string[]=[], brC: string[]=[];
  for (const [key, m] of Object.entries(cat.markers as Record<string, CategoryNumericMarkerOperations>)) {
    if (!safeMarkerId(key)) continue;
    const r = (getEffectiveRange as (marker: unknown) => CategoryNumericRangeOperations)(m);
    names.push((m.name as { replace(pattern: RegExp, value: string): { trim(): unknown } }).replace(/\(.+\)/,"").trim());
    vals.push(m.values[0]); mins.push(r.min); maxs.push(r.max);
    const s = getStatus(m.values[0], r.min, r.max);
    bgC.push(s==="normal"?tc.green+"99":s==="high"?tc.red+"99":tc.yellow+"99");
    brC.push(s==="normal"?tc.green:s==="high"?tc.red:tc.yellow);
  }
  const ctx = (document.getElementById("chart-fa-bar") as HTMLCanvasElement | null);
  if (!ctx) return;
  const chart = createChartRuntime(ctx, {
    type: "bar",
    data: { labels: names, datasets: [
      { label:"Value", data:vals, backgroundColor:bgC, borderColor:brC, borderWidth:1, borderRadius:4 },
      { label:"Ref Min", data:mins, type:"line", borderColor:tc.lineColor+"80", borderDash:[4,4], pointRadius:0, fill:false, borderWidth:1.5 },
      { label:"Ref Max", data:maxs, type:"line", borderColor:tc.lineColor+"80", borderDash:[4,4], pointRadius:0, fill:false, borderWidth:1.5 }
    ]},
    options: { responsive:true, maintainAspectRatio:false,
      plugins: { legend:{display:false}, tooltip:{ backgroundColor:tc.tooltipBg, titleColor:tc.tooltipTitle, bodyColor:tc.tooltipBody, borderColor:tc.tooltipBorder, borderWidth:1 }},
      scales: { x:{ticks:{color:tc.tickColor,font:{size:10},maxRotation:45},grid:{display:false}}, y:{ticks:{color:tc.tickColor,callback:formatChartTickValue},grid:{color:tc.gridColor}} }
    }
  });
  if (chart) state.chartInstances["fa-bar"] = chart;
}
