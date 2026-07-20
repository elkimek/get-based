// @ts-check
// category-view-renderers.js — Category chart, table, heatmap, and fatty-acid render helpers

import { state } from './state.js';
import { escapeHTML, escapeAttr, getStatus, formatValue, getTrend, safeMarkerId } from './utils.js';
import { getChartColors } from './theme.js';
import { ensureChartJs, formatChartTickValue } from './charts.js';
import { createChartRuntime, hasChartRuntime } from './charts-runtime.js';
import { getEffectiveRange, getEffectiveRangeForDate, getLatestValueIndex, statusIcon } from './marker-analysis.js';
import { markerDetailActionAttrs } from './marker-detail-actions.js';

const categoryRendererDelegateRoots = new WeakSet();

function handleTableScrollSync(event) {
  const target = event.target;
  if (!target || typeof target.closest !== 'function') return;
  const scrollEl = /** @type {HTMLElement | null} */ (target.closest('[data-gb-table-scroll-sync]'));
  if (!scrollEl || !event.currentTarget?.contains?.(scrollEl)) return;
  const shell = /** @type {HTMLElement | null} */ (scrollEl.closest('.gb-table-shell'));
  shell?.style.setProperty('--gb-table-scroll-x', `${scrollEl.scrollLeft}px`);
}

export function installCategoryRendererDelegates(root = typeof document !== 'undefined' ? document : null) {
  if (!root || categoryRendererDelegateRoots.has(root)) return;
  categoryRendererDelegateRoots.add(root);
  root.addEventListener('scroll', handleTableScrollSync, { capture: true, passive: true });
}

if (typeof document !== 'undefined') installCategoryRendererDelegates();

function clampPct(value) {
  return Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
}

function renderSemanticRangeRail(value, minValue, maxValue, status, style = '') {
  const valueNum = Number(value);
  const minNum = Number(minValue);
  const maxNum = Number(maxValue);
  if (!Number.isFinite(valueNum) || !Number.isFinite(minNum) || !Number.isFinite(maxNum) || minNum === maxNum) return '—';
  const goodMin = Math.min(minNum, maxNum);
  const goodMax = Math.max(minNum, maxNum);
  const goodSpan = goodMax - goodMin;
  let railMin = goodMin - goodSpan * 0.1;
  let railMax = goodMax + goodSpan * 0.1;
  railMin = Math.min(railMin, valueNum);
  railMax = Math.max(railMax, valueNum);
  let railSpan = railMax - railMin;
  if (railSpan <= 0) return '—';
  if (valueNum <= railMin) railMin -= railSpan * 0.08;
  if (valueNum >= railMax) railMax += railSpan * 0.08;
  railSpan = railMax - railMin;
  if (railSpan <= 0) return '—';
  const dot = clampPct(((valueNum - railMin) / railSpan) * 100);
  const goodLeft = clampPct(((goodMin - railMin) / railSpan) * 100);
  const goodRight = clampPct(((goodMax - railMin) / railSpan) * 100);
  const goodWidth = Math.max(0, goodRight - goodLeft);
  const lowWidth = goodLeft;
  const highWidth = Math.max(0, 100 - goodRight);
  const styleAttr = style ? ` style="${style}"` : '';
  return `<div class="range-bar"${styleAttr}>
    ${lowWidth ? `<div class="range-bar-zone range-bar-zone-low" style="left:0%;width:${lowWidth}%"></div>` : ''}
    ${goodWidth ? `<div class="range-bar-fill" style="left:${goodLeft}%;width:${goodWidth}%"></div>` : ''}
    ${highWidth ? `<div class="range-bar-zone range-bar-zone-high" style="left:${goodRight}%;width:${highWidth}%"></div>` : ''}
    <div class="range-bar-marker marker-${status}" style="left:${dot}%"></div>
  </div>`;
}

export function renderChartCard(id, marker, dateLabels) {
  // id is interpolated into delegated data attributes and DOM ids below.
  // Single chokepoint guard for every caller (dashboard, showCategory,
  // switchView).
  if (!safeMarkerId(id)) return '';
  state.markerRegistry[id] = marker;
  const latestIdx = getLatestValueIndex(marker.values);
  const latestVal = latestIdx !== -1 ? marker.values[latestIdx] : null;
  const lr = getEffectiveRangeForDate(marker, latestIdx);
  const status = latestVal !== null ? getStatus(latestVal, lr.min, lr.max) : "missing";
  const statusLabel = status === "normal" ? "Normal" : status === "high" ? "High" : status === "low" ? "Low" : "N/A";
  const sIcon = statusIcon(status);

  const trend = getTrend(marker.values, lr.min, lr.max);
  const trendBadge = trend.cls !== 'trend-stable' || trend.arrow !== '—' ? `<span class="chart-card-trend ${trend.cls}">${trend.arrow}</span>` : '';
  const markerName = marker.name || '';
  const labels = marker.singlePoint ? [marker.singleDateLabel || "N/A"] : dateLabels;
  const fmtRange = (min, max) => `${min != null ? formatValue(min) : '–'} – ${max != null ? formatValue(max) : '–'}`;
  const effectiveRange = getEffectiveRange(marker);
  const rangeLabel = state.rangeMode === 'optimal' && (marker.optimalMin != null || marker.optimalMax != null) ? 'Optimal' : 'Reference';
  const showBothRanges = state.rangeMode === 'both'
    && (marker.optimalMin != null || marker.optimalMax != null)
    && (marker.refMin != null || marker.refMax != null);
  const snapshotRangeLabel = showBothRanges ? 'Reference / Optimal' : rangeLabel;
  const snapshotRangeValue = showBothRanges
    ? `${escapeHTML(fmtRange(marker.refMin, marker.refMax))}<br>${escapeHTML(fmtRange(marker.optimalMin, marker.optimalMax))}`
    : escapeHTML(fmtRange(effectiveRange.min, effectiveRange.max));
  const latestDateLabel = latestIdx !== -1 ? (labels[latestIdx] || 'Latest') : 'No value';
  const latestDisplay = latestVal !== null ? formatValue(latestVal) : '—';
  const latestUnit = marker.unit || '';
  const latestMeta = latestVal !== null
    ? `${latestDateLabel}${latestUnit ? ' · ' + latestUnit : ''}`
    : 'Add a value to start the trend';

  let html = `<div class="chart-card chart-card-${status}" role="button" tabindex="0" aria-label="${escapeAttr(markerName + ' - ' + statusLabel)}" ${markerDetailActionAttrs('show-detail-modal', { id })}>
    <div class="chart-card-header">
      <div class="chart-card-title-block">
        <div class="chart-card-title" title="${escapeAttr(markerName)}">
          <span class="chart-card-title-text">${escapeHTML(markerName)}</span>
          <span class="chart-card-tips-host" id="chart-rec-${id}"></span>
        </div>
      </div>
      <div class="chart-card-state"><span class="chart-card-status status-${status}">${sIcon ? sIcon + ' ' : ''}${statusLabel}</span>${trendBadge}</div>
    </div>
    <div class="chart-card-snapshot">
      <div>
        <span class="chart-card-snapshot-label">Latest</span>
        <strong class="chart-card-latest-value val-${status}">${escapeHTML(latestDisplay)}</strong>
        <span class="chart-card-snapshot-meta">${escapeHTML(latestMeta)}</span>
      </div>
      <div class="chart-card-snapshot-side">
        <span>${snapshotRangeLabel}</span>
        <strong>${snapshotRangeValue}</strong>
      </div>
    </div>
    <div class="chart-container"><canvas id="chart-${id}"></canvas></div>
    <div class="chart-values">`;
  // Show only actual observations so missing dates do not consume summary slots.
  const visibleValueIndexes = [];
  for (let i = 0; i < marker.values.length; i++) {
    if (marker.values[i] !== null) visibleValueIndexes.push(i);
  }
  const compactValueIndexes = visibleValueIndexes.length > 4 ? visibleValueIndexes.slice(-4) : visibleValueIndexes;
  for (const i of compactValueIndexes) {
    const v = marker.values[i];
    const ri = getEffectiveRangeForDate(marker, i);
    const s = v !== null ? getStatus(v, ri.min, ri.max) : "missing";
    html += `<div class="chart-value-item"><div class="chart-value-date">${labels[i] || ''}</div>
      <div class="chart-value-num val-${s}">${v !== null ? formatValue(v) : "—"}</div></div>`;
  }
  html += `</div></div>`;
  return html;
}

export function renderTableColgroup(cols) {
  return `<colgroup>${cols.map(cls => `<col class="${escapeAttr(cls)}">`).join('')}</colgroup>`;
}

export function renderScrollableTableShell(kind, wrapperClass, tableClass, colgroup, headHtml, bodyHtml, minWidth) {
  const shellClass = `gb-table-shell gb-table-shell-${kind}`;
  return `<div class="${shellClass}" style="--gb-table-min-width:${Math.max(660, Math.round(minWidth))}px">
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

export function renderTableView(cat, dateLabels, categoryKey, dates) {
  const labels = cat.singleDate ? [cat.singleDateLabel || "N/A"] : dateLabels;
  // Hide markers with no values at all — sidebar still lists them with 0 count.
  const markerEntries = Object.entries(cat.markers).filter(([, m]) =>
    m.values && m.values.some(v => v !== null)
  );
  if (markerEntries.length === 0) {
    return `<div class="data-table-wrapper"><div style="padding:32px;text-align:center;color:var(--text-muted)">No data yet for this category. Use the sidebar to add a value or import a PDF.</div></div>`;
  }
  const colgroup = renderTableColgroup([
    'gb-col-marker',
    'gb-col-unit',
    'gb-col-reference',
    ...labels.map(() => 'gb-col-date'),
    'gb-col-trend',
    'gb-col-range',
  ]);
  let headHtml = `<tr><th>Biomarker</th><th>Unit</th><th>Reference</th>`;
  // Column headers — labels are already HTML-escaped by the showCategory
  // call site (renderTableView's contract: dateLabels passed in are safe).
  // Pre-escape lives at the boundary so CodeQL's taint analysis sees the
  // sanitizer at the call site (it doesn't trace across function calls).
  for (const d of labels) headHtml += `<th>${d}</th>`;
  headHtml += `<th>Trend</th><th>Range</th></tr>`;
  let bodyHtml = '';
  for (const [key, marker] of markerEntries) {
    const id = categoryKey ? categoryKey + '_' + key : '';
    const r = getEffectiveRange(marker);
    let refCell = r.min != null && r.max != null ? `${formatValue(r.min)} – ${formatValue(r.max)}` : '—';
    if (state.rangeMode === 'both') {
      if (marker.optimalMin != null || marker.optimalMax != null) refCell = `${formatValue(marker.refMin)} – ${formatValue(marker.refMax)}<br><span style="color:var(--green);font-size:11px">opt: ${formatValue(marker.optimalMin)} – ${formatValue(marker.optimalMax)}</span>`;
    }
    const rowClick = id ? ` ${markerDetailActionAttrs('show-detail-modal', { id })} style="cursor:pointer"` : '';
    bodyHtml += `<tr${rowClick}><td class="marker-name">${escapeHTML(marker.name)}</td>
      <td class="unit-col">${escapeHTML(marker.unit)}</td>
      <td class="ref-col">${refCell}</td>`;
    for (let i = 0; i < marker.values.length; i++) {
      const v = marker.values[i];
      const ri = getEffectiveRangeForDate(marker, i);
      const s = v !== null ? getStatus(v, ri.min, ri.max) : "missing";
      // Empty cells: click → add a value for THIS column's date (not today).
      // Skip for singleDate categories where the "date" is a synthetic label.
      const colDate = (dates && !cat.singleDate) ? dates[i] : null;
      const emptyClick = (v === null && id && colDate)
        ? ` ${markerDetailActionAttrs('open-manual-entry', { id, date: colDate })} style="cursor:cell" title="Add value for ${dateLabels[i] || escapeHTML(colDate)}"`
        : '';
      bodyHtml += `<td class="value-cell val-${s}"${emptyClick}>${v !== null ? formatValue(v) : "—"}</td>`;
    }
    const li = getLatestValueIndex(marker.values);
    const trendRange = li !== -1 ? getEffectiveRangeForDate(marker, li) : r;
    const trend = getTrend(marker.values, trendRange.min, trendRange.max);
    bodyHtml += `<td><span class="trend-arrow ${trend.cls}">${trend.arrow}</span></td>`;
    if (li !== -1 && r.min != null && r.max != null) {
      const lr = getEffectiveRangeForDate(marker, li);
      const s = getStatus(marker.values[li], lr.min, lr.max);
      bodyHtml += `<td>${renderSemanticRangeRail(marker.values[li], lr.min, lr.max, s)}</td>`;
    } else bodyHtml += `<td>—</td>`;
    bodyHtml += `</tr>`;
  }
  const minWidth = 180 + 86 + 128 + labels.length * 104 + 78 + 112;
  return renderScrollableTableShell('data', 'data-table-wrapper', 'data-table', colgroup, headHtml, bodyHtml, minWidth);
}

export function renderHeatmapView(cat, dateLabels, dates, categoryKey) {
  const labels = cat.singleDate ? [cat.singleDateLabel || "N/A"] : dateLabels;
  const markerEntries = Object.entries(cat.markers).filter(([, m]) =>
    m.values && m.values.some(v => v !== null)
  );
  if (markerEntries.length === 0) {
    return `<div class="heatmap-wrapper"><div style="padding:32px;text-align:center;color:var(--text-muted)">No data yet for this category. Use the sidebar to add a value or import a PDF.</div></div>`;
  }
  const colgroup = renderTableColgroup([
    'gb-col-marker',
    ...labels.map(() => 'gb-col-date'),
  ]);
  let headHtml = `<tr><th>Biomarker</th>`;
  // Labels pre-escaped at the showCategory call boundary — see renderTableView.
  for (const d of labels) headHtml += `<th>${d}</th>`;
  headHtml += `</tr>`;
  let bodyHtml = '';
  for (const [key, marker] of markerEntries) {
    const id = categoryKey + "_" + key;
    state.markerRegistry[id] = marker;
    bodyHtml += `<tr><td role="button" tabindex="0" aria-label="${escapeHTML(marker.name)}" style="cursor:pointer" ${markerDetailActionAttrs('show-detail-modal', { id })}>${escapeHTML(marker.name)}</td>`;
    for (let i = 0; i < marker.values.length; i++) {
      const v = marker.values[i];
      const ri = getEffectiveRangeForDate(marker, i);
      const s = v !== null ? getStatus(v, ri.min, ri.max) : "missing";
      const cellLabel = `${escapeHTML(marker.name)} ${labels[i] || ''}: ${v !== null ? formatValue(v) : 'no value'}`;
      bodyHtml += `<td class="heatmap-${s}" role="button" tabindex="0" aria-label="${cellLabel}" ${markerDetailActionAttrs('show-detail-modal', { id })}>${v !== null ? formatValue(v) : "—"}</td>`;
    }
    bodyHtml += `</tr>`;
  }
  const minWidth = 180 + labels.length * 104;
  return renderScrollableTableShell('heatmap', 'heatmap-wrapper', 'heatmap-table', colgroup, headHtml, bodyHtml, minWidth);
}

export function renderFattyAcidsView(cat, categoryKey) {
  // categoryKey + per-marker key flow into delegated data attributes below.
  if (!safeMarkerId(categoryKey)) return '';
  let html = `<div style="background:var(--bg-card);border-radius:var(--radius);padding:20px;margin-bottom:20px;border:1px solid var(--border)">
    <h3 style="margin-bottom:16px;font-size:16px">Fatty Acid Profile${cat.singleDate ? ' — ' + new Date(cat.singleDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : ''}</h3>
    <div class="fa-bar-chart-container"><canvas id="chart-fa-bar"></canvas></div></div>`;
  html += `<div class="fatty-acids-grid">`;
  for (const [key, marker] of Object.entries(cat.markers)) {
    if (!safeMarkerId(key)) continue;
    const r = getEffectiveRange(marker);
    const v = marker.values[0], s = getStatus(v, r.min, r.max);
    let faRangeText;
    if (state.rangeMode === 'both' && (marker.optimalMin != null || marker.optimalMax != null) && (marker.refMin != null || marker.refMax != null)) {
      faRangeText = `Ref: ${formatValue(marker.refMin)} – ${formatValue(marker.refMax)} · <span style="color:var(--green)">Opt: ${formatValue(marker.optimalMin)} – ${formatValue(marker.optimalMax)}</span>`;
    } else {
      const rangeLabel = state.rangeMode === 'optimal' && (marker.optimalMin != null || marker.optimalMax != null) ? 'Optimal' : 'Ref';
      faRangeText = `${rangeLabel}: ${formatValue(r.min)} – ${formatValue(r.max)}`;
    }
    html += `<div class="fa-card" role="button" tabindex="0" aria-label="${escapeHTML(marker.name)} ${formatValue(v)}${marker.unit ? ' ' + escapeHTML(marker.unit) : ''}" ${markerDetailActionAttrs('show-detail-modal', { id: categoryKey + '_' + key })} style="cursor:pointer"><div class="fa-card-name">${escapeHTML(marker.name)}</div>
      <div class="fa-card-value val-${s}">${formatValue(v)}${marker.unit ? " " + escapeHTML(marker.unit) : ""}</div>
      <div class="fa-card-ref">${faRangeText}</div>
      ${renderSemanticRangeRail(v, r.min, r.max, s, 'margin-top:8px;width:100%')}</div>`;
  }
  html += `</div>`;
  return html;
}

export function renderFattyAcidsCharts(cat) {
  if (!hasChartRuntime()) {
    ensureChartJs().then(() => {
      if (document.getElementById("chart-fa-bar")) renderFattyAcidsCharts(cat);
    }).catch(() => {});
    return;
  }
  const tc = getChartColors();
  const names=[], vals=[], mins=[], maxs=[], bgC=[], brC=[];
  for (const [key, m] of Object.entries(cat.markers)) {
    if (!safeMarkerId(key)) continue;
    const r = getEffectiveRange(m);
    names.push(m.name.replace(/\(.+\)/,"").trim());
    vals.push(m.values[0]); mins.push(r.min); maxs.push(r.max);
    const s = getStatus(m.values[0], r.min, r.max);
    bgC.push(s==="normal"?tc.green+"99":s==="high"?tc.red+"99":tc.yellow+"99");
    brC.push(s==="normal"?tc.green:s==="high"?tc.red:tc.yellow);
  }
  const ctx = /** @type {HTMLCanvasElement | null} */ (document.getElementById("chart-fa-bar"));
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
