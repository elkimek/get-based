// @ts-check
// compare-correlations.js - Compare Dates and Correlations views

import { state } from './state.js';
import { CORRELATION_PRESETS, CHIP_COLORS } from './schema.js';
import { escapeHTML, escapeAttr, getStatus, formatValue } from './utils.js';
import { getChartColors } from './theme.js';
import { getActiveData } from './data.js';
import { formatRangeBounds, getEffectiveRangeForDate, resolveMarkerRangeContext } from './marker-analysis.js';
import { ensureChartJs, formatChartTickValue, getNotesForChart, getSupplementsForChart, refBandPlugin, noteAnnotationPlugin, supplementBarPlugin } from './health-data-loader.js';
import { createChartRuntime, hasChartRuntime } from './charts-runtime.js';

/** @type {{ askAIAboutCorrelations: () => void, renderTableColgroup: (cols: string[]) => string, renderScrollableTableShell: (...args: any[]) => string, renderCategoryGlyph: (...args: any[]) => string }} */
const compareCorrelationDeps = {
  askAIAboutCorrelations: () => {},
  renderTableColgroup: () => '',
  renderScrollableTableShell: (_kind, _wrapperClass, _tableClass, _colgroup, headHtml, bodyHtml) => '<table>' + headHtml + bodyHtml + '</table>',
  renderCategoryGlyph: (_categoryKey, label = '') => escapeHTML(label || ''),
};

/** @param {Partial<typeof compareCorrelationDeps>} deps */
export function configureCompareCorrelationViews(deps = {}) {
  const previous = { ...compareCorrelationDeps };
  Object.assign(compareCorrelationDeps, deps);
  return previous;
}

function renderTableColgroup(cols) {
  return compareCorrelationDeps.renderTableColgroup(cols);
}

function renderScrollableTableShell(...args) {
  return compareCorrelationDeps.renderScrollableTableShell(...args);
}

function renderCategoryGlyph(...args) {
  return compareCorrelationDeps.renderCategoryGlyph(...args);
}

function dataAttrName(name) {
  return String(name).replace(/[A-Z]/g, c => `-${c.toLowerCase()}`);
}

function compareAttrs(actionAttr, action, attrs = {}) {
  return [
    `${actionAttr}="${escapeAttr(action)}"`,
    ...Object.entries(attrs)
      .filter(([, value]) => value !== null && value !== undefined)
      .map(([name, value]) => `data-compare-${escapeAttr(dataAttrName(name))}="${escapeAttr(String(value))}"`),
  ].join(' ');
}

export function compareActionAttrs(action, attrs = {}) {
  return compareAttrs('data-compare-action', action, attrs);
}

function compareChangeAttrs(action, attrs = {}) {
  return compareAttrs('data-compare-change-action', action, attrs);
}

function compareInputAttrs(action, attrs = {}) {
  return compareAttrs('data-compare-input-action', action, attrs);
}

function compareFocusAttrs(action, attrs = {}) {
  return compareAttrs('data-compare-focus-action', action, attrs);
}

function closestCompareTarget(event, selector) {
  const target = event.target;
  if (!target || typeof target.closest !== 'function') return null;
  return /** @type {HTMLElement | null} */ (target.closest(selector));
}

function handleCompareClick(event) {
  const actionEl = closestCompareTarget(event, '[data-compare-action]');
  if (!actionEl) return;
  const action = actionEl.dataset.compareAction || '';
  if (action === 'swap-dates') {
    event.preventDefault();
    swapCompareDates();
  } else if (action === 'apply-preset') {
    event.preventDefault();
    const index = Number.parseInt(actionEl.dataset.compareIndex || '', 10);
    if (Number.isInteger(index)) applyCorrelationPreset(index);
  } else if (action === 'toggle-marker') {
    event.preventDefault();
    if (actionEl.dataset.compareKey) toggleCorrelationMarker(actionEl.dataset.compareKey);
  } else if (action === 'ask-ai-correlations') {
    event.preventDefault();
    compareCorrelationDeps.askAIAboutCorrelations();
  }
}

function handleCompareKeydown(event) {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  const actionEl = closestCompareTarget(event, '[data-compare-action]');
  if (!actionEl) return;
  if (['BUTTON', 'A', 'INPUT', 'SELECT', 'TEXTAREA'].includes(actionEl.tagName)) return;
  event.preventDefault();
  actionEl.click();
}

function handleCompareChange(event) {
  const actionEl = closestCompareTarget(event, '[data-compare-change-action]');
  if (!actionEl || actionEl.dataset.compareChangeAction !== 'set-date') return;
  const value = 'value' in actionEl ? String(actionEl.value) : '';
  if (actionEl.dataset.compareIndex === '1') setCompareDate1(value);
  else if (actionEl.dataset.compareIndex === '2') setCompareDate2(value);
}

function handleCompareInput(event) {
  const actionEl = closestCompareTarget(event, '[data-compare-input-action]');
  if (!actionEl || actionEl.dataset.compareInputAction !== 'filter-options') return;
  filterCorrelationOptions();
}

function handleCompareFocus(event) {
  const actionEl = closestCompareTarget(event, '[data-compare-focus-action]');
  if (!actionEl || actionEl.dataset.compareFocusAction !== 'show-dropdown') return;
  showCorrelationDropdown();
}

const compareDelegateRoots = new WeakSet();

export function installCompareCorrelationDelegates(root = (typeof document !== 'undefined' ? document : null)) {
  if (!root || typeof root.addEventListener !== 'function' || compareDelegateRoots.has(root)) return;
  compareDelegateRoots.add(root);
  root.addEventListener('click', handleCompareClick);
  root.addEventListener('keydown', handleCompareKeydown);
  root.addEventListener('change', handleCompareChange);
  root.addEventListener('input', handleCompareInput);
  root.addEventListener('focusin', handleCompareFocus);
}
// Compare Dates

export function showCompare(data) {
  const main = document.getElementById("main-content");
  if (!main) return;
  if (!data) data = getActiveData();
  let html = `<div class="category-header"><h2>Compare Dates</h2>
    <p>Side-by-side comparison of biomarker values between two collection dates</p></div>`;
  if (data.dates.length < 2) {
    html += `<div class="empty-state"><div class="empty-state-icon">\u2194</div>
      <h3>Not Enough Data</h3><p>Import at least 2 lab result dates to compare values side by side.</p></div>`;
    main.innerHTML = html;
    return;
  }
  if (!state.compareDate1 || !data.dates.includes(state.compareDate1)) state.compareDate1 = data.dates[0];
  if (!state.compareDate2 || !data.dates.includes(state.compareDate2)) state.compareDate2 = data.dates[data.dates.length - 1];
  const fmtOpt = d => {
    const label = new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    return `<option value="${d}">${label}</option>`;
  };
  html += `<div class="compare-controls">
    <label class="compare-date-field" for="compare-select-1"><span>Date 1:</span>
      <select id="compare-select-1" ${compareChangeAttrs('set-date', { index: '1' })}>${data.dates.map(d => fmtOpt(d)).join('')}</select>
    </label>
    <button class="compare-swap-btn" ${compareActionAttrs('swap-dates')} title="Swap dates" aria-label="Swap dates">\u21C4</button>
    <label class="compare-date-field" for="compare-select-2"><span>Date 2:</span>
      <select id="compare-select-2" ${compareChangeAttrs('set-date', { index: '2' })}>${data.dates.map(d => fmtOpt(d)).join('')}</select>
    </label>
  </div>`;
  html += `<div id="compare-results"></div>`;
  main.innerHTML = html;
  const select1 = /** @type {HTMLSelectElement | null} */ (document.getElementById('compare-select-1'));
  const select2 = /** @type {HTMLSelectElement | null} */ (document.getElementById('compare-select-2'));
  if (select1) select1.value = state.compareDate1 || '';
  if (select2) select2.value = state.compareDate2 || '';
  updateCompare();
}

export function setCompareDate1(value) { state.compareDate1 = value; updateCompare(); }
export function setCompareDate2(value) { state.compareDate2 = value; updateCompare(); }

export function updateCompare() {
  const data = getActiveData();
  const container = document.getElementById('compare-results');
  if (!container) return;
  const idx1 = data.dates.indexOf(state.compareDate1);
  const idx2 = data.dates.indexOf(state.compareDate2);
  if (idx1 === -1 || idx2 === -1) { container.innerHTML = ''; return; }
  container.innerHTML = renderCompareTable(data, idx1, idx2);
}

export function swapCompareDates() {
  const tmp = state.compareDate1;
  state.compareDate1 = state.compareDate2;
  state.compareDate2 = tmp;
  const s1 = /** @type {HTMLSelectElement | null} */ (document.getElementById('compare-select-1'));
  const s2 = /** @type {HTMLSelectElement | null} */ (document.getElementById('compare-select-2'));
  if (s1) s1.value = state.compareDate1 || '';
  if (s2) s2.value = state.compareDate2 || '';
  updateCompare();
}

function compareRangeContextSignature(context) {
  return JSON.stringify(context.displayedRanges.map(range => [
    range.label,
    range.min,
    range.max,
    range.kind,
    range.source,
    range.usedForStatus,
  ]));
}

function renderCompareRangeLines(context) {
  const showUsedBadge = context.displayedRanges.length > 1;
  return context.displayedRanges.map(range => `
    <span class="compare-range-line${range.usedForStatus ? ' compare-range-line-used' : ''}">
      <span class="compare-range-label">${escapeHTML(range.label)}</span>
      <span class="compare-range-bounds">${escapeHTML(formatRangeBounds(range))}</span>
      ${showUsedBadge && range.usedForStatus ? '<span class="compare-range-used">used</span>' : ''}
    </span>`).join('');
}

function renderCompareRangeCell(context1, context2, date1Label, date2Label) {
  if (compareRangeContextSignature(context1) === compareRangeContextSignature(context2)) {
    return `<div class="compare-range-stack">${renderCompareRangeLines(context1)}</div>`;
  }
  return `<div class="compare-range-stack compare-range-stack-dated">
    <div class="compare-range-date-group">
      <span class="compare-range-date">${escapeHTML(date1Label)}</span>
      ${renderCompareRangeLines(context1)}
    </div>
    <div class="compare-range-date-group">
      <span class="compare-range-date">${escapeHTML(date2Label)}</span>
      ${renderCompareRangeLines(context2)}
    </div>
  </div>`;
}

function normalizedDistanceOutsideRange(value, range) {
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
  return value > max ? (value - max) / Math.max(Math.abs(max), 1) : 0;
}

function compareDirectionClass(v1, range1, v2, range2) {
  const distance1 = normalizedDistanceOutsideRange(v1, range1);
  const distance2 = normalizedDistanceOutsideRange(v2, range2);
  if (distance1 == null || distance2 == null) return 'compare-neutral';
  if (distance2 < distance1 - 0.000001) return 'compare-improved';
  if (distance2 > distance1 + 0.000001) return 'compare-worsened';
  return 'compare-neutral';
}

export function renderCompareTable(data, idx1, idx2) {
  const d1Label = data.dateLabels[idx1];
  const d2Label = data.dateLabels[idx2];
  const colgroup = renderTableColgroup([
    'gb-col-marker',
    'gb-col-unit',
    'gb-col-ranges',
    'gb-col-compare-date',
    'gb-col-compare-date',
    'gb-col-delta',
    'gb-col-delta',
  ]);
  const headHtml = `<tr>
    <th>Biomarker</th><th>Unit</th><th>Ranges</th>
    <th>${escapeHTML(d1Label)}</th><th>${escapeHTML(d2Label)}</th><th>Delta</th><th>% Change</th></tr>`;
  let bodyHtml = '';
  for (const [catKey, cat] of Object.entries(data.categories)) {
    if (cat.singlePoint) continue;
    const rows = [];
    for (const marker of Object.values(cat.markers)) {
      const v1 = marker.values[idx1];
      const v2 = marker.values[idx2];
      if (v1 === null && v2 === null) continue;
      const mr1 = getEffectiveRangeForDate(marker, idx1);
      const mr2 = getEffectiveRangeForDate(marker, idx2);
      const rangeContext1 = resolveMarkerRangeContext(marker, idx1);
      const rangeContext2 = resolveMarkerRangeContext(marker, idx2);
      const s1 = v1 !== null ? getStatus(v1, mr1.min, mr1.max) : 'missing';
      const s2 = v2 !== null ? getStatus(v2, mr2.min, mr2.max) : 'missing';
      let delta = null, pctChange = null, directionClass = 'compare-neutral';
      if (v1 !== null && v2 !== null) {
        delta = v2 - v1;
        pctChange = v1 !== 0 ? (delta / v1) * 100 : null;
        directionClass = compareDirectionClass(v1, mr1, v2, mr2);
      }
      const rangeCell = renderCompareRangeCell(rangeContext1, rangeContext2, d1Label, d2Label);
      rows.push(`<tr>
        <td class="marker-name">${escapeHTML(marker.name)}</td>
        <td style="color:var(--text-muted);font-size:12px">${escapeHTML(marker.unit)}</td>
        <td class="compare-ranges-cell">${rangeCell}</td>
        <td class="value-cell val-${s1}" style="font-weight:600">${v1 !== null ? formatValue(v1) : '\u2014'}</td>
        <td class="value-cell val-${s2}" style="font-weight:600">${v2 !== null ? formatValue(v2) : '\u2014'}</td>
        <td class="${directionClass}" style="font-weight:600">${delta !== null ? (delta > 0 ? '+' : '') + formatValue(delta) : '\u2014'}</td>
        <td class="${directionClass}" style="font-weight:600">${pctChange !== null ? (pctChange > 0 ? '+' : '') + pctChange.toFixed(1) + '%' : '\u2014'}</td>
      </tr>`);
    }
    if (rows.length > 0) {
      bodyHtml += `<tr class="cat-row"><td colspan="7"><span class="compare-category-label">${renderCategoryGlyph(catKey, cat.label)}<span>${escapeHTML(cat.label)}</span></span></td></tr>`;
      bodyHtml += rows.join('');
    }
  }
  return renderScrollableTableShell('compare', 'compare-table-wrapper', 'compare-table', colgroup, headHtml, bodyHtml, 908);
}

// Correlations

export function showCorrelations(data) {
  const main = document.getElementById("main-content");
  if (!main) return;
  if (!data) data = getActiveData();
  let html = `<div class="category-header"><h2>Correlations</h2>
    <p>Compare biomarkers across categories on a normalized scale</p></div>`;
  html += `<div class="correlation-controls">
    <h3>Select Biomarkers (2\u20138)</h3>
    <div class="corr-select-row">
      <div class="corr-dropdown">
        <input type="text" class="corr-search" id="corr-search" placeholder="Search biomarkers..."
          ${compareInputAttrs('filter-options')} ${compareFocusAttrs('show-dropdown')}>
        <div class="corr-options" id="corr-options"></div>
      </div>
    </div>
    <div class="corr-chips" id="corr-chips"></div>
    <div class="corr-presets">
      <div class="corr-presets-label">Quick Presets:</div>`;
  for (let i = 0; i < CORRELATION_PRESETS.length; i++) {
    html += `<button class="corr-preset-btn" ${compareActionAttrs('apply-preset', { index: i })}>${CORRELATION_PRESETS[i].label}</button>`;
  }
  html += `</div></div>`;
  html += `<div class="corr-chart-container" id="corr-chart-container" style="display:none">
    <h3>Normalized Comparison (% of Reference Range)
      <button class="corr-ask-ai-btn" ${compareActionAttrs('ask-ai-correlations')} title="Ask AI about these correlations">Ask AI</button>
    </h3>
    <div class="corr-chart"><canvas id="chart-correlation"></canvas></div></div>`;
  main.innerHTML = html;
  populateCorrelationOptions(data);
  renderCorrelationChips();
  if (state.selectedCorrelationMarkers.length >= 2) renderCorrelationChart();
}

export function populateCorrelationOptions(data) {
  if (!data) data = getActiveData();
  const container = document.getElementById("corr-options");
  if (!container) return;
  let html = '';
  for (const [catKey, cat] of Object.entries(data.categories)) {
    for (const [markerKey, marker] of Object.entries(cat.markers)) {
      if (marker.singlePoint) continue;
      const fullKey = `${catKey}.${markerKey}`;
      const selected = state.selectedCorrelationMarkers.includes(fullKey);
      html += `<div class="corr-option ${selected ? 'selected' : ''}"
        data-key="${escapeAttr(fullKey)}" data-name="${escapeHTML(marker.name)}" data-cat="${escapeHTML(cat.label)}"
        role="button" tabindex="0" ${compareActionAttrs('toggle-marker', { key: fullKey })}>
        ${escapeHTML(marker.name)} <span class="opt-cat">${escapeHTML(cat.label)}</span></div>`;
    }
  }
  container.innerHTML = html;
}

export function showCorrelationDropdown() {
  document.getElementById("corr-options")?.classList.add("show");
}

export function filterCorrelationOptions() {
  const searchInput = /** @type {HTMLInputElement | null} */ (document.getElementById("corr-search"));
  const search = (searchInput?.value || '').toLowerCase();
  document.querySelectorAll(".corr-option").forEach(opt => {
    const option = /** @type {HTMLElement} */ (opt);
    const name = (option.dataset.name || '').toLowerCase();
    const cat = (option.dataset.cat || '').toLowerCase();
    option.style.display = (name.includes(search) || cat.includes(search)) ? '' : 'none';
  });
  document.getElementById("corr-options")?.classList.add("show");
}

export function toggleCorrelationMarker(key) {
  const idx = state.selectedCorrelationMarkers.indexOf(key);
  if (idx !== -1) state.selectedCorrelationMarkers.splice(idx, 1);
  else if (state.selectedCorrelationMarkers.length < 8) state.selectedCorrelationMarkers.push(key);
  renderCorrelationChips();
  populateCorrelationOptions();
  if (state.selectedCorrelationMarkers.length >= 2) renderCorrelationChart();
  else {
    const container = document.getElementById("corr-chart-container");
    if (container) container.style.display = "none";
    if (state.chartInstances["correlation"]) { state.chartInstances["correlation"].destroy(); delete state.chartInstances["correlation"]; }
  }
}

export function applyCorrelationPreset(idx) {
  state.selectedCorrelationMarkers = [...CORRELATION_PRESETS[idx].markers];
  renderCorrelationChips();
  populateCorrelationOptions();
  if (state.selectedCorrelationMarkers.length >= 2) renderCorrelationChart();
}

export function renderCorrelationChips() {
  const container = document.getElementById("corr-chips");
  if (!container) return;
  const data = getActiveData();
  let html = '';
  state.selectedCorrelationMarkers.forEach((key, i) => {
    const [catKey, markerKey] = key.split('.');
    const marker = data.categories[catKey]?.markers[markerKey];
    if (!marker) return;
    const color = CHIP_COLORS[i % CHIP_COLORS.length];
    html += `<span class="corr-chip" style="background:${color}20;border-color:${color};color:${color}">
      ${escapeHTML(marker.name)} <span class="chip-remove" ${compareActionAttrs('toggle-marker', { key })}>&times;</span></span>`;
  });
  container.innerHTML = html;
}

export function renderCorrelationChart() {
  const data = getActiveData();
  const container = document.getElementById("corr-chart-container");
  if (!container) return;
  container.style.display = "block";
  if (state.chartInstances["correlation"]) { state.chartInstances["correlation"].destroy(); delete state.chartInstances["correlation"]; }
  const canvas = /** @type {HTMLCanvasElement | null} */ (document.getElementById("chart-correlation"));
  if (!canvas) return;
  if (!hasChartRuntime()) {
    ensureChartJs().then(() => {
      if (document.getElementById("chart-correlation")) renderCorrelationChart();
    }).catch(() => {});
    return;
  }
  const datasets = [];
  state.selectedCorrelationMarkers.forEach((key, i) => {
    const [catKey, markerKey] = key.split('.');
    const marker = data.categories[catKey]?.markers[markerKey];
    if (!marker) return;
    const normalizedValues = marker.values.map(v => {
      if (v === null) return null;
      if (marker.refMin == null || marker.refMax == null) return 50;
      const range = marker.refMax - marker.refMin;
      return range !== 0 ? ((v - marker.refMin) / range) * 100 : 50;
    });
    const color = CHIP_COLORS[i % CHIP_COLORS.length];
    datasets.push({
      label: marker.name, data: normalizedValues,
      borderColor: color, backgroundColor: color + '20',
      borderWidth: 2.5, pointRadius: 5, pointHoverRadius: 7,
      pointBackgroundColor: color, tension: 0.3, fill: false, spanGaps: true,
      _realValues: marker.values, _unit: marker.unit, _refMin: marker.refMin, _refMax: marker.refMax
    });
  });
  const allVals = datasets.flatMap(ds => ds.data.filter(v => v !== null));
  const minY = Math.min(0, ...allVals) - 10;
  const maxY = Math.max(100, ...allVals) + 10;
  const tc = getChartColors();
  const chart = createChartRuntime(canvas, {
    type: "line",
    data: { labels: data.dateLabels, datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: true, labels: { color: tc.legendColor, font: { size: 12 }, usePointStyle: true, pointStyle: "circle" } },
        tooltip: {
          backgroundColor: tc.tooltipBg, titleColor: tc.tooltipTitle, bodyColor: tc.tooltipBody,
          borderColor: tc.tooltipBorder, borderWidth: 1,
          callbacks: {
            label: (ctx) => {
              const ds = ctx.dataset;
              const realVal = ds._realValues[ctx.dataIndex];
              const pct = ctx.parsed.y;
              return `${ds.label}: ${formatValue(realVal)} ${ds._unit} (${pct !== null ? pct.toFixed(0) + '%' : 'N/A'})`;
            }
          }
        },
        refBand: { refMin: 0, refMax: 100 },
        noteAnnotations: (function() { const n = getNotesForChart(data.dates); return n.length ? { notes: n, chartDates: data.dates } : false; })(),
        supplementBars: (function() { const s = getSupplementsForChart(data.dates); return s.length ? { supplements: s, chartDates: data.dates } : false; })()
      },
      layout: { padding: { top: (function() { const s = getSupplementsForChart(data.dates); return s.length ? s.length * 14 + 6 : 0; })() } },
      scales: {
        x: { ticks: { color: tc.tickColor, font: { size: 11 } }, grid: { display: false } },
        y: { min: minY, max: maxY, ticks: { color: tc.tickColor, font: { size: 10 }, callback: v => `${formatChartTickValue(v)}%` }, grid: { color: tc.gridColor } }
      }
    },
    plugins: [refBandPlugin, noteAnnotationPlugin, supplementBarPlugin]
  });
  if (chart) state.chartInstances["correlation"] = chart;
}

installCompareCorrelationDelegates();
