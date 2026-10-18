// compare-correlations.js - Compare Dates and Correlations views

import {renderCompareDatesPage,renderCompareDatesTable,projectCompareDateRow,projectCompareRangeLine,
 renderCompareHead,renderCompareRow,renderCompareCategory,renderCompareRangeLine,renderCompareRangeSame,renderCompareRangeDated} from './compare-dates-presentation.js';
import type {CompareRangeStackView,CompareDateCategoryView,CompareDateRowView} from './compare-dates-presentation.js';
import {categoryLiteral} from './category-presentation.js';
import {getCategoryGlyphCode} from './category-glyphs.js';
import {renderCorrelationsPage,renderCorrelationsOptions,renderCorrelationsChips,projectCorrelationsPreset,
 projectCorrelationMarkerOption,projectCorrelationTherapyOption,projectCorrelationMarkerChip,projectCorrelationTherapyChip,
 renderCorrelationNoResults,renderCorrelationsStatus} from './correlations-selection-presentation.js';
import type {CorrelationPresetView,CorrelationOptionView,CorrelationChipView} from './correlations-selection-presentation.js';
import { state } from './state.js';
import { saveCorrelationWorkspace } from './correlation-workspace-store.js';
import { getSupplementRecordId } from './supplement-medication-domain.js';
import { CORRELATION_PRESETS, CHIP_COLORS, MARKER_SCHEMA } from './schema.js';
import { escapeHTML, escapeAttr, getStatus } from './utils.js';
import { getActiveData } from './data.js';
import { getEffectiveRangeForDate, resolveMarkerRangeContext } from './marker-analysis.js';
import { ensureChartJs } from './health-data-loader.js';
import { hasChartRuntime } from './charts-runtime.js';
import { prepareCorrelationSelection } from './therapy-correlations.js';
import { destroyTherapyCorrelationCharts, renderCorrelationWorkspace } from './therapy-correlation-view.js';

import type {CompareData, CompareMarker, CompareNumericMarker, CompareRange, CompareEvent, CompareDelegateRoot, CompareDependencies, CompareHTMLWriter, CompareDateState} from '../types/compare-correlations.js';
const compareCorrelationDeps: CompareDependencies = {
  askAIAboutCorrelations: () => {},
  renderTableColgroup:null,renderScrollableTableShell:null,renderCategoryGlyph:null,
};

export function configureCompareCorrelationViews(deps: unknown = {}) {
  const previous = { ...compareCorrelationDeps };
  Object.assign(compareCorrelationDeps, deps);
  return previous;
}

function dataAttrName(name: unknown) {
  return String(name).replace(/[A-Z]/g, c => `-${c.toLowerCase()}`);
}

function compareAttrs(actionAttr: string, action: unknown, attrs: unknown = {}) {
  return [
    `${actionAttr}="${escapeAttr(action)}"`,
    ...Object.entries(attrs as Record<string, unknown>)
      .filter(([, value]) => value !== null && value !== undefined)
      .map(([name, value]) => `data-compare-${escapeAttr(dataAttrName(name))}="${escapeAttr(String(value))}"`),
  ].join(' ');
}

export function compareActionAttrs(action: unknown, attrs: unknown = {}) {
  return compareAttrs('data-compare-action', action, attrs);
}

function closestCompareTarget(event: CompareEvent, selector: string) {
  const target = event.target as {closest?: unknown} | null;
  if (!target || typeof target.closest !== 'function') return null;
  return (target.closest as (selector: string) => HTMLElement | null)(selector);
}

function handleCompareClick(event: CompareEvent) {
  const actionEl = closestCompareTarget(event, '[data-compare-action]');
  if (!actionEl) { if (!closestCompareTarget(event, '.corr-dropdown')) closeCorrelationDropdown(); return; }
  const action = actionEl.dataset.compareAction || '';
  if (action === 'swap-dates') {
    event.preventDefault();
    swapCompareDates();
  } else if (action === 'apply-preset') {
    event.preventDefault();
    const index = Number.parseInt(actionEl.dataset.compareIndex || '', 10);
    if (Number.isInteger(index)) applyCorrelationPreset(index);
  } else if (action === 'toggle-marker' || action === 'toggle-therapy') {
    event.preventDefault();
    const key = actionEl.dataset.compareKey;
    if (key) {
      const marker = action === 'toggle-marker';
      const selected = marker ? state.selectedCorrelationMarkers : state.selectedCorrelationSupplements;
      const added = !selected.includes(key);
      (marker ? toggleCorrelationMarker : toggleCorrelationTherapy)(key);
      if (added && selected.includes(key)) finishCorrelationSearch(actionEl);
      else if (added) correlationNotice('Up to 8 items can be selected. Remove one to add another.');
      else if (actionEl.classList.contains('chip-remove')) document.getElementById('corr-search')?.focus();
    }
  } else if (action === 'review-therapy') {
    event.preventDefault();
    if (actionEl.dataset.compareKey) void reviewCorrelationTherapy(actionEl.dataset.compareKey);
  } else if (action === 'ask-ai-correlations') {
    event.preventDefault();
    (compareCorrelationDeps.askAIAboutCorrelations as () => unknown)();
  }
}

function finishCorrelationSearch(option: HTMLElement) {
  if (!option.classList.contains('corr-option')) return;
  const search = document.getElementById('corr-search');
  if (!(search instanceof HTMLInputElement)) return;
  search.value = '';
  search.focus();
  closeCorrelationDropdown();
  correlationNotice('Added. Search for another item.', true);
}

function correlationNotice(text: string, announceOnly = false) { const el = document.getElementById('corr-selection-status'); if (el) { el.textContent = text; el.classList.toggle('sr-only', announceOnly); } }
function closeCorrelationDropdown() {
  document.getElementById('corr-options')?.classList.remove('show');
  const search = document.getElementById('corr-search');
  search?.setAttribute('aria-expanded', 'false');
  search?.removeAttribute('aria-activedescendant');
}

async function reviewCorrelationTherapy(id: unknown) {
  const profile = state.currentProfile;
  const results = document.getElementById('corr-therapy-results');
  const { openSupplementsEditor } = await import('./supplements.js');
  if (state.currentProfile !== profile || document.getElementById('corr-therapy-results') !== results) return;
  const records = state.importedData.supplements || [];
  if (records.filter(record => getSupplementRecordId(record) === id).length !== 1) return;
  openSupplementsEditor(records.findIndex(record => getSupplementRecordId(record) === id));
  const overlay = document.getElementById('modal-overlay');
  if (!overlay) return;
  const observer = new MutationObserver(() => {
    if (overlay.classList.contains('show')) return;
    observer.disconnect();
    if (state.currentProfile === profile && document.getElementById('corr-therapy-results') === results) renderCorrelationChart();
  });
  observer.observe(overlay, { attributes: true, attributeFilter: ['class'] });
}

function handleCompareKeydown(event: CompareEvent) {
  if ((event.target as HTMLElement).id === 'corr-search') {
    const search = event.target as HTMLElement;
    if (event.key === 'Escape' || event.key === 'Tab') { closeCorrelationDropdown(); return; }
    const options = [...document.querySelectorAll('.corr-option')].filter(el => (el as HTMLElement).style.display !== 'none');
    const index = options.findIndex(el => el.id === search.getAttribute('aria-activedescendant'));
    if (['ArrowDown', 'ArrowUp'].includes(event.key as string)) {
      event.preventDefault(); showCorrelationDropdown();
      const next = options[index < 0 ? (event.key === 'ArrowDown' ? 0 : options.length - 1) : (index + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length];
      if (next) { search.setAttribute('aria-activedescendant', next.id); next.scrollIntoView({ block: 'nearest' }); }
      options.forEach(el => el.classList.toggle('corr-option-active', el === next));
      return;
    }
    if (event.key === 'Enter' && index >= 0 && search.getAttribute('aria-expanded') === 'true') { event.preventDefault(); (options[index] as HTMLElement).click(); return; }
  }
  if (event.key !== 'Enter' && event.key !== ' ') return;
  const actionEl = closestCompareTarget(event, '[data-compare-action]');
  if (!actionEl) return;
  if (['BUTTON', 'A', 'INPUT', 'SELECT', 'TEXTAREA'].includes(actionEl.tagName)) return;
  event.preventDefault();
  actionEl.click();
}

function handleCompareChange(event: CompareEvent) {
  const actionEl = closestCompareTarget(event, '[data-compare-change-action]');
  if (!actionEl) return;
  if (actionEl.dataset.compareChangeAction !== 'set-date') return;
  const value = 'value' in actionEl ? String(actionEl.value) : '';
  if (actionEl.dataset.compareIndex === '1') setCompareDate1(value);
  else if (actionEl.dataset.compareIndex === '2') setCompareDate2(value);
}

function handleCompareInput(event: CompareEvent) {
  const actionEl = closestCompareTarget(event, '[data-compare-input-action]');
  if (!actionEl || actionEl.dataset.compareInputAction !== 'filter-options') return;
  filterCorrelationOptions();
}

function handleCompareFocus(event: CompareEvent) {
  const actionEl = closestCompareTarget(event, '[data-compare-focus-action]');
  if (!actionEl || actionEl.dataset.compareFocusAction !== 'show-dropdown') return;
  showCorrelationDropdown();
}

const compareDelegateRoots = new WeakSet<object>();

export function installCompareCorrelationDelegates(root: CompareDelegateRoot | null = (typeof document !== 'undefined' ? document : null)) {
  if (!root || typeof root.addEventListener !== 'function' || compareDelegateRoots.has(root)) return;
  compareDelegateRoots.add(root);
  root.addEventListener('click', handleCompareClick);
  root.addEventListener('keydown', handleCompareKeydown);
  root.addEventListener('change', handleCompareChange);
  root.addEventListener('input', handleCompareInput);
  root.addEventListener('focusin', handleCompareFocus);
}

// Compare Dates

export function showCompare(data?: CompareData | null) {
  const main = document.getElementById("main-content");
  if (!main) return;
  if (!data) data = getActiveData();
  if (data.dates.length < 2) {
    main.innerHTML = renderCompareDatesPage({kind:'empty'});
    return;
  }
  if (!state.compareDate1 || !data.dates.includes(state.compareDate1)) (state as CompareDateState).compareDate1 = data.dates[0];
  if (!state.compareDate2 || !data.dates.includes(state.compareDate2)) (state as CompareDateState).compareDate2 = data.dates[data.dates.length - 1];
  const fmtOpt = (d: unknown) => {
    const label = new Date((d as string) + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    return {value:`${d}`,label};
  };
  // Keep both independent date maps in their native order.
  const first=data.dates.map(d=>fmtOpt(d));
  const second=data.dates.map(d=>fmtOpt(d));
  main.innerHTML=renderCompareDatesPage({kind:'dates',first,second});
  const select1 = (document.getElementById('compare-select-1') as HTMLSelectElement | null);
  const select2 = (document.getElementById('compare-select-2') as HTMLSelectElement | null);
  if (select1) select1.value = state.compareDate1 || '';
  if (select2) select2.value = state.compareDate2 || '';
  updateCompare();
}

export function setCompareDate1(value: unknown) { (state as CompareDateState).compareDate1 = value; updateCompare(); }
export function setCompareDate2(value: unknown) { (state as CompareDateState).compareDate2 = value; updateCompare(); }

export function updateCompare() {
  const data = getActiveData();
  const container = document.getElementById('compare-results') as CompareHTMLWriter | null;
  if (!container) return;
  const idx1 = data.dates.indexOf((state.compareDate1 as string));
  const idx2 = data.dates.indexOf((state.compareDate2 as string));
  if (idx1 === -1 || idx2 === -1) { container.innerHTML = ''; return; }
  container.innerHTML = renderCompareTable(data, idx1, idx2);
}

export function swapCompareDates() {
  const tmp = state.compareDate1;
  state.compareDate1 = state.compareDate2;
  state.compareDate2 = tmp;
  const s1 = (document.getElementById('compare-select-1') as HTMLSelectElement | null);
  const s2 = (document.getElementById('compare-select-2') as HTMLSelectElement | null);
  if (s1) s1.value = state.compareDate1 || '';
  if (s2) s2.value = state.compareDate2 || '';
  updateCompare();
}

function compareRangeContextSignature(context: ReturnType<typeof resolveMarkerRangeContext>) {
  return JSON.stringify(context.displayedRanges.map(range => [
    range.label,
    range.min,
    range.max,
    range.kind,
    range.source,
    range.usedForStatus,
  ]));
}

function projectCompareRangeLines(context: ReturnType<typeof resolveMarkerRangeContext>) {
  const showUsedBadge = context.displayedRanges.length > 1;
  return context.displayedRanges.map(range => projectCompareRangeLine(range, showUsedBadge));
}

function projectCompareRangeCell(context1: ReturnType<typeof resolveMarkerRangeContext>, context2: ReturnType<typeof resolveMarkerRangeContext>, date1Label: unknown, date2Label: unknown) {
  if (compareRangeContextSignature(context1) === compareRangeContextSignature(context2)) {
    return {kind:'same',lines:projectCompareRangeLines(context1)} satisfies CompareRangeStackView;
  }
  const firstLabel=categoryLiteral(date1Label),first=projectCompareRangeLines(context1);
  const secondLabel=categoryLiteral(date2Label),second=projectCompareRangeLines(context2);
  return {kind:'dated',firstLabel,first,secondLabel,second} satisfies CompareRangeStackView;
}

function normalizedDistanceOutsideRange(value: number | null | undefined, range: CompareRange | null | undefined) {
  if (value == null || !Number.isFinite(value)) return null;
  const min = range?.min;
  const max = range?.max;
  if (min == null && max == null) return null;
  if (min != null && max != null) {
    const span = Math.max(Math.abs(max - min), Math.abs(min) * 0.01, Math.abs(max) * 0.01, 1e-9);
    if (value < min) return (min - value) / span;
    if (value > max) return (value - max) / span;
    return 0;
  }
  if (min != null) return value < min ? (min - value) / Math.max(Math.abs(min), 1) : 0;
  return value > max! ? (value - max!) / Math.max(Math.abs(max!), 1) : 0;
}

function compareDirectionClass(v1: number | null | undefined, range1: CompareRange, v2: number | null | undefined, range2: CompareRange) {
  const distance1 = normalizedDistanceOutsideRange(v1, range1);
  const distance2 = normalizedDistanceOutsideRange(v2, range2);
  if (distance1 == null || distance2 == null) return 'compare-neutral';
  if (distance2 < distance1 - 0.000001) return 'compare-improved';
  if (distance2 > distance1 + 0.000001) return 'compare-worsened';
  return 'compare-neutral';
}

export function renderCompareTable(data: CompareData, idx1: number, idx2: number): unknown {
  if (typeof compareCorrelationDeps.renderTableColgroup==='function'
    || typeof compareCorrelationDeps.renderScrollableTableShell==='function'
    || typeof compareCorrelationDeps.renderCategoryGlyph==='function') {
    return renderLegacyCompareTable(data,idx1,idx2);
  }
  const d1Label = data.dateLabels[idx1];
  const d2Label = data.dateLabels[idx2];
  const firstLabel=categoryLiteral(d1Label),secondLabel=categoryLiteral(d2Label);
  const categories:CompareDateCategoryView[]=[];
  for (const [catKey, cat] of Object.entries(data.categories)) {
    if (cat.singlePoint) continue;
    const rows: CompareDateRowView[] = [];
    for (const marker of Object.values(cat.markers) as CompareNumericMarker[]) {
      const v1 = marker.values[idx1] as number | null;
      const v2 = marker.values[idx2] as number | null;
      if (v1 === null && v2 === null) continue;
      const mr1 = (getEffectiveRangeForDate as (marker: CompareMarker, dateIndex: number) => ReturnType<typeof getEffectiveRangeForDate>)(marker, idx1);
      const mr2 = (getEffectiveRangeForDate as (marker: CompareMarker, dateIndex: number) => ReturnType<typeof getEffectiveRangeForDate>)(marker, idx2);
      const rangeContext1 = (resolveMarkerRangeContext as (marker: CompareMarker, dateIndex: number) => ReturnType<typeof resolveMarkerRangeContext>)(marker, idx1);
      const rangeContext2 = (resolveMarkerRangeContext as (marker: CompareMarker, dateIndex: number) => ReturnType<typeof resolveMarkerRangeContext>)(marker, idx2);
      const s1 = v1 !== null ? getStatus(v1, mr1.min, mr1.max) : 'missing';
      const s2 = v2 !== null ? getStatus(v2, mr2.min, mr2.max) : 'missing';
      let delta: number | null = null, pctChange: number | null = null, directionClass = 'compare-neutral';
      if (v1 !== null && v2 !== null) {
        delta = v2 - v1;
        pctChange = v1 !== 0 ? (delta / v1) * 100 : null;
        directionClass = compareDirectionClass(v1, mr1, v2, mr2);
      }
      const rangeCell = projectCompareRangeCell(rangeContext1, rangeContext2, d1Label, d2Label);
      rows.push(projectCompareDateRow(marker, rangeCell, v1, v2, s1, s2, directionClass, delta, pctChange));
    }
    if (rows.length > 0) {
      const glyph={code:getCategoryGlyphCode(catKey,cat.label),large:false},label=categoryLiteral(cat.label);
      categories.push({glyph,label,rows});
    }
  }
  return renderCompareDatesTable({firstLabel,secondLabel,categories});
}

/** Explicit legacy configuration boundary. The default first-party page and
 * table use readonly views; only callers installing raw public HTML callbacks
 * enter this compatibility serializer. Domain math is unchanged in this path. */
function renderLegacyCompareColumns(columns:readonly string[]):unknown {
 return typeof compareCorrelationDeps.renderTableColgroup==='function'?compareCorrelationDeps.renderTableColgroup(columns):'';
}
function renderLegacyCompareShell(kind:unknown,wrapper:unknown,table:unknown,columns:unknown,head:unknown,body:unknown,width:number):unknown {
 return typeof compareCorrelationDeps.renderScrollableTableShell==='function'?compareCorrelationDeps.renderScrollableTableShell(kind,wrapper,table,columns,head,body,width):'<table>'+head+body+'</table>';
}
function renderLegacyCompareGlyph(key:string,label:unknown):unknown {
 return typeof compareCorrelationDeps.renderCategoryGlyph==='function'?compareCorrelationDeps.renderCategoryGlyph(key,label):escapeHTML(label||'');
}
function renderLegacyCompareRangeLines(context: ReturnType<typeof resolveMarkerRangeContext>) {
  const showUsedBadge = context.displayedRanges.length > 1;
  return context.displayedRanges.map(range => renderCompareRangeLine(range, showUsedBadge)).join('');
}

function renderLegacyCompareRangeCell(context1: ReturnType<typeof resolveMarkerRangeContext>, context2: ReturnType<typeof resolveMarkerRangeContext>, date1Label: unknown, date2Label: unknown) {
  if (compareRangeContextSignature(context1) === compareRangeContextSignature(context2)) {
    return renderCompareRangeSame(renderLegacyCompareRangeLines(context1));
  }
  return renderCompareRangeDated(date1Label, () => renderLegacyCompareRangeLines(context1), date2Label, () => renderLegacyCompareRangeLines(context2));
}

function renderLegacyCompareTable(data: CompareData, idx1: number, idx2: number): unknown {
  const d1Label = data.dateLabels[idx1];
  const d2Label = data.dateLabels[idx2];
  const colgroup = renderLegacyCompareColumns([
    'gb-col-marker',
    'gb-col-unit',
    'gb-col-ranges',
    'gb-col-compare-date',
    'gb-col-compare-date',
    'gb-col-delta',
    'gb-col-delta',
  ]);
  const headHtml = renderCompareHead(d1Label, d2Label);
  let bodyHtml = '';
  for (const [catKey, cat] of Object.entries(data.categories)) {
    if (cat.singlePoint) continue;
    const rows: string[] = [];
    for (const marker of Object.values(cat.markers) as CompareNumericMarker[]) {
      const v1 = marker.values[idx1] as number | null;
      const v2 = marker.values[idx2] as number | null;
      if (v1 === null && v2 === null) continue;
      const mr1 = (getEffectiveRangeForDate as (marker: CompareMarker, dateIndex: number) => ReturnType<typeof getEffectiveRangeForDate>)(marker, idx1);
      const mr2 = (getEffectiveRangeForDate as (marker: CompareMarker, dateIndex: number) => ReturnType<typeof getEffectiveRangeForDate>)(marker, idx2);
      const rangeContext1 = (resolveMarkerRangeContext as (marker: CompareMarker, dateIndex: number) => ReturnType<typeof resolveMarkerRangeContext>)(marker, idx1);
      const rangeContext2 = (resolveMarkerRangeContext as (marker: CompareMarker, dateIndex: number) => ReturnType<typeof resolveMarkerRangeContext>)(marker, idx2);
      const s1 = v1 !== null ? getStatus(v1, mr1.min, mr1.max) : 'missing';
      const s2 = v2 !== null ? getStatus(v2, mr2.min, mr2.max) : 'missing';
      let delta: number | null = null, pctChange: number | null = null, directionClass = 'compare-neutral';
      if (v1 !== null && v2 !== null) {
        delta = v2 - v1;
        pctChange = v1 !== 0 ? (delta / v1) * 100 : null;
        directionClass = compareDirectionClass(v1, mr1, v2, mr2);
      }
      const rangeCell = renderLegacyCompareRangeCell(rangeContext1, rangeContext2, d1Label, d2Label);
      rows.push(renderCompareRow(marker, rangeCell, v1, v2, s1, s2, directionClass, delta, pctChange));
    }
    if (rows.length > 0) {
      bodyHtml += renderCompareCategory(catKey, cat, renderLegacyCompareGlyph);
      bodyHtml += rows.join('');
    }
  }
  return renderLegacyCompareShell('compare', 'compare-table-wrapper', 'compare-table', colgroup, headHtml, bodyHtml, 908);
}

// Correlations

export function showCorrelations(data?: CompareData | null) {
  const main = document.getElementById("main-content");
  if (!main) return;
  if (!data) data = getActiveData();
  const before = JSON.stringify([state.selectedCorrelationMarkers, state.selectedCorrelationSupplements]);
  state.selectedCorrelationMarkers = state.selectedCorrelationMarkers.filter(key => { const [category, marker] = key.split('.') as [string, string]; return !!data.categories[category]?.markers[marker]; });
  state.selectedCorrelationSupplements = state.selectedCorrelationSupplements.filter(id => (state.importedData.supplements || []).some(record => getSupplementRecordId(record) === id));
  if (JSON.stringify([state.selectedCorrelationMarkers, state.selectedCorrelationSupplements]) !== before) void saveCorrelationWorkspace();
  const presets:CorrelationPresetView[]=[];
  for (let i = 0; i < CORRELATION_PRESETS.length; i++) {
    const preset = CORRELATION_PRESETS[i]!;
    const available = availablePresetMarkers(preset, data).length;
    const names = preset.markers.map(key => { const [cat, name] = key.split('.') as [string, string]; return MARKER_SCHEMA[cat]?.markers[name]?.name || name; }).join(', ');
    presets.push(projectCorrelationsPreset(preset,names,available,i));
  }
  const html=renderCorrelationsPage({kind:'page',presets});
  main.innerHTML = html;
  populateCorrelationOptions(data);
  renderCorrelationChips();
  if (canRenderCorrelation()) renderCorrelationChart();
}

export function populateCorrelationOptions(data?: CompareData | null) {
  if (!data) data = getActiveData();
  const container = document.getElementById("corr-options");
  if (!container) return;
  const options:CorrelationOptionView[]=[];
  for (const [catKey, cat] of Object.entries(data.categories)) {
    for (const [markerKey, marker] of Object.entries(cat.markers)) {
      if (marker.singlePoint) continue;
      const count = marker.values.filter(v => typeof v === 'number' && Number.isFinite(v)).length;
      if (!count) continue;
      const fullKey = `${catKey}.${markerKey}`;
      const selected = state.selectedCorrelationMarkers.includes(fullKey);
      options.push(projectCorrelationMarkerOption(selected,fullKey,marker,cat,count));
    }
  }
  for (const therapy of state.importedData.supplements || []) {
    const id = getSupplementRecordId(therapy);
    if (!id) continue;
    const category = therapy.type === 'medication' ? 'Medication' : 'Supplement';
    const selected = state.selectedCorrelationSupplements.includes(id);
    options.push(projectCorrelationTherapyOption(selected,id,therapy,category));
  }
  container.innerHTML=renderCorrelationsOptions(options);
  container.querySelectorAll('.corr-option').forEach((el, i) => {
    el.id = `corr-option-${i}`;
    el.setAttribute('role', 'option');
    el.setAttribute('aria-selected', String(el.classList.contains('selected')));
    el.setAttribute('tabindex', '-1');
  });
  container.insertAdjacentHTML('beforeend', renderCorrelationNoResults());
}

export function showCorrelationDropdown() {
  filterCorrelationOptions();
}

export function filterCorrelationOptions() {
  const searchInput = (document.getElementById("corr-search") as HTMLInputElement | null);
  const search = (searchInput?.value || '').toLowerCase();
  document.querySelectorAll(".corr-option").forEach(opt => {
    const option = (opt as HTMLElement);
    const name = (option.dataset.name || '').toLowerCase();
    const cat = (option.dataset.cat || '').toLowerCase();
    option.style.display = (name.includes(search) || cat.includes(search)) ? '' : 'none';
  });
  document.getElementById("corr-options")?.classList.add("show");
  searchInput?.setAttribute('aria-expanded', 'true');
  searchInput?.removeAttribute('aria-activedescendant');
  document.querySelectorAll('.corr-option-active').forEach(el => el.classList.remove('corr-option-active'));
  const empty = document.getElementById('corr-no-results');
  if (empty) empty.hidden = [...document.querySelectorAll('.corr-option')].some(el => (el as HTMLElement).style.display !== 'none');
}

export function toggleCorrelationMarker(key: string) {
  const idx = state.selectedCorrelationMarkers.indexOf(key);
  if (idx !== -1) state.selectedCorrelationMarkers.splice(idx, 1);
  else if (state.selectedCorrelationMarkers.length + state.selectedCorrelationSupplements.length < 8) {
    state.selectedCorrelationMarkers.push(key);
    state.correlationView.hidden = (state.correlationView.hidden || []).filter(id => id !== key);
  }
  renderCorrelationChips();
  populateCorrelationOptions();
  closeCorrelationDropdown();
  renderCorrelationChart();
}

function availablePresetMarkers(preset: (typeof CORRELATION_PRESETS)[number], data: CompareData) {
  return preset.markers.filter(key => {
    const [cat, name] = key.split('.') as [string, string];
    const marker = data.categories[cat]?.markers[name];
    return !marker?.singlePoint && marker?.values.some(v => typeof v === 'number' && Number.isFinite(v));
  });
}

export function applyCorrelationPreset(idx: number) {
  if (!CORRELATION_PRESETS[idx]) return;
  const data = getActiveData();
  const available = availablePresetMarkers(CORRELATION_PRESETS[idx]!, data);
  if (!available.length) { correlationNotice('No markers from this preset are available in your data.'); return; }
  state.selectedCorrelationMarkers = available.slice(0, 8 - state.selectedCorrelationSupplements.length);
  state.correlationView.hidden = (state.correlationView.hidden || []).filter(id => !state.selectedCorrelationMarkers.includes(id));
  state.correlationView.pair = '0';
  delete state.correlationView.pairKey;
  correlationNotice(`Preset: ${state.selectedCorrelationMarkers.length}/${CORRELATION_PRESETS[idx]!.markers.length} markers selected. Treatments kept.${available.length > state.selectedCorrelationMarkers.length ? ' Selection limited to 8 items.' : ''}`);
  renderCorrelationChips();
  populateCorrelationOptions();
  closeCorrelationDropdown();
  renderCorrelationChart();
}

export function renderCorrelationChips() {
  const container = document.getElementById("corr-chips");
  if (!container) return;
  const data = getActiveData();
  const chips:CorrelationChipView[]=[];
  state.selectedCorrelationMarkers.forEach((key, i) => {
    const [catKey, markerKey] = key.split('.') as [string, string];
    const marker = data.categories[catKey]?.markers[markerKey];
    if (!marker) return;
    const color = CHIP_COLORS[i % CHIP_COLORS.length];
    chips.push(projectCorrelationMarkerChip(marker,color,key));
  });
  for (const id of state.selectedCorrelationSupplements) {
    const therapy = (state.importedData.supplements || []).find(s => getSupplementRecordId(s) === id);
    if (!therapy) continue;
    chips.push(projectCorrelationTherapyChip(therapy,id));
  }
  container.innerHTML=renderCorrelationsChips(chips);
}

function canRenderCorrelation() {
  return state.selectedCorrelationMarkers.length >= 2 || (state.selectedCorrelationMarkers.length >= 1 && state.selectedCorrelationSupplements.length >= 1);
}

export function toggleCorrelationTherapy(id: string) {
  const index = state.selectedCorrelationSupplements.indexOf(id);
  if (index >= 0) state.selectedCorrelationSupplements.splice(index, 1);
  else if (state.selectedCorrelationMarkers.length + state.selectedCorrelationSupplements.length < 8) {
    state.selectedCorrelationSupplements.push(id);
    state.correlationView.hidden = (state.correlationView.hidden || []).filter(hiddenId => hiddenId !== id);
  }
  renderCorrelationChips();
  populateCorrelationOptions();
  closeCorrelationDropdown();
  renderCorrelationChart();
}

export function renderCorrelationChart() {
  void saveCorrelationWorkspace();
  const focused = document.activeElement?.id;
  const data = getActiveData();
  const container = document.getElementById("corr-chart-container");
  if (!container) return;
  destroyTherapyCorrelationCharts();
  const selectionHelp = document.getElementById('corr-selection-help');
  if (selectionHelp) selectionHelp.hidden = canRenderCorrelation();
  if (!canRenderCorrelation()) {
    container.style.display = 'none';
    if (state.chartInstances.correlation) { state.chartInstances.correlation.destroy(); delete state.chartInstances.correlation; }
    return;
  }
  container.style.display = "block";
  const results = document.getElementById('corr-therapy-results');
  if (!hasChartRuntime()) {
    if (results) results.innerHTML = renderCorrelationsStatus('loading');
    const profile = state.currentProfile;
    ensureChartJs().then(() => {
      if (profile === state.currentProfile && document.getElementById('corr-therapy-results') === results) renderCorrelationChart();
    }).catch(() => {
      if (document.getElementById('corr-therapy-results') === results && results) results.innerHTML = renderCorrelationsStatus('failure');
    });
    return;
  }
  const selection = prepareCorrelationSelection(data, state.importedData, state.selectedCorrelationMarkers, state.selectedCorrelationSupplements, 0, state.correlationView);
  renderCorrelationWorkspace(selection, (results as HTMLElement), renderCorrelationChart);
  if (focused?.startsWith('corr-')) document.getElementById(focused)?.focus({ preventScroll: true });
}

installCompareCorrelationDelegates();
