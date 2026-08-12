// @ts-check
// category-page-view.js — category route orchestration and view-mode switching

import { state } from './state.js';
import { escapeAttr, escapeHTML, getStatus, safeMarkerId } from './utils.js';
import {
  getActiveData,
  filterDatesByRange,
  destroyAllCharts,
  dataActionAttrs,
  renderDateRangeFilter,
  renderChartLayersDropdown,
} from './data.js';
import { getEffectiveRangeForDate, getLatestValueIndex } from './marker-analysis.js';
import { createLineChart } from './health-data-loader.js';
import { loadChartCardRecs } from './chart-card-recs.js';
import { renderCategoryGlyph } from './category-glyphs.js';
import { getCategoryPageCatalogSlots, primeCategoryPageCatalogCache } from './category-page-runtime.js';
import {
  renderChartCard,
  renderTableView,
  renderHeatmapView,
  renderFattyAcidsView,
  renderFattyAcidsCharts,
} from './category-view-renderers.js';
import { markerDetailActionAttrs } from './marker-detail-actions.js';

const categoryPageActionDelegateRoots = new WeakSet();

/** @type {{ renameCategory: null | ((categoryKey: string) => void) }} */
const categoryPageViewDeps = {
  renameCategory: null,
};

/** @param {Partial<typeof categoryPageViewDeps>} [deps] */
export function configureCategoryPageViewDeps(deps = {}) {
  const previous = { ...categoryPageViewDeps };
  if (Object.hasOwn(deps, 'renameCategory')
      && (deps.renameCategory === null || typeof deps.renameCategory === 'function')) {
    categoryPageViewDeps.renameCategory = deps.renameCategory;
  }
  return previous;
}

const CATEGORY_PAGE_ACTION_ATTR = 'data-category-page-action';
const CATEGORY_PAGE_ACTION_SELECTOR = `[${CATEGORY_PAGE_ACTION_ATTR}]`;

function categoryPageActionAttrs(action, attrs = {}) {
  let html = `${CATEGORY_PAGE_ACTION_ATTR}="${escapeAttr(action)}"`;
  for (const [key, value] of Object.entries(attrs)) {
    if (value == null) continue;
    const attr = key.replace(/[A-Z]/g, c => '-' + c.toLowerCase());
    html += ` data-category-page-${attr}="${escapeAttr(String(value))}"`;
  }
  return html;
}

function closestCategoryPageAction(target) {
  return /** @type {HTMLElement | null} */ (
    target && typeof target.closest === 'function'
      ? target.closest(CATEGORY_PAGE_ACTION_SELECTOR)
      : null
  );
}

function handleCategoryPageActionClick(event) {
  const actionEl = closestCategoryPageAction(event.target);
  if (!actionEl) return;
  const action = actionEl.getAttribute(CATEGORY_PAGE_ACTION_ATTR);
  const categoryKey = actionEl.dataset.categoryPageCategory || '';
  if (!safeMarkerId(categoryKey)) return;
  if (action === 'rename-category') {
    categoryPageViewDeps.renameCategory?.(categoryKey);
  } else if (action === 'switch-view') {
    const view = actionEl.dataset.categoryPageView || '';
    if (view !== 'charts' && view !== 'table' && view !== 'heatmap') return;
    switchView(view, categoryKey, actionEl);
  } else {
    return;
  }
  event.preventDefault();
  event.stopPropagation();
}

function handleCategoryPageActionKeydown(event) {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  const actionEl = closestCategoryPageAction(event.target);
  if (!actionEl || actionEl.getAttribute('role') !== 'button') return;
  if (event.target?.closest?.('button, a, input, textarea, select')) return;
  handleCategoryPageActionClick(event);
}

export function installCategoryPageActionDelegates(root = typeof document !== 'undefined' ? document : null) {
  if (!root || categoryPageActionDelegateRoots.has(root)) return;
  categoryPageActionDelegateRoots.add(root);
  root.addEventListener('click', handleCategoryPageActionClick);
  root.addEventListener('keydown', handleCategoryPageActionKeydown);
}

if (typeof document !== 'undefined') installCategoryPageActionDelegates();

function markerHasData(m) { return m.values?.some(v => v !== null && v !== undefined) ?? false; }

function selectedRangeLabel() {
  return state.dateRangeFilter === '3m' ? 'the last 3 months'
    : state.dateRangeFilter === '6m' ? 'the last 6 months'
    : state.dateRangeFilter === '1y' ? 'the last year'
    : 'all time';
}

function renderNoResultsInRange(cat, categoryKey) {
  return `<div class="empty-state"><div class="empty-state-icon empty-state-icon-category">${renderCategoryGlyph(categoryKey, cat.label, { large: true })}</div>
    <h3>No results in ${escapeHTML(selectedRangeLabel())}</h3>
    <p>This category has older results. Choose a longer range or show the complete history.</p>
    <button type="button" class="range-btn" ${dataActionAttrs('set-date-range', { range: 'all' })}>Show all results</button></div>`;
}

function renderMarkerDataGapSections(allEntries, rawCat, categoryKey) {
  const withoutVisibleData = allEntries.filter(([, marker]) => !markerHasData(marker));
  if (!withoutVisibleData.length) return '';
  const outsideRange = [];
  const neverRecorded = [];
  for (const entry of withoutVisibleData) {
    const [key] = entry;
    if (state.dateRangeFilter !== 'all' && markerHasData(rawCat?.markers?.[key])) outsideRange.push(entry);
    else neverRecorded.push(entry);
  }
  const renderSection = (entries, heading, suffix) => {
    if (!entries.length) return '';
    let html = `<div class="chart-card-gap-section"><p>${escapeHTML(heading)}</p><div class="chart-card-gap-list">`;
    for (const [key, marker] of entries) {
      if (!safeMarkerId(key)) continue;
      const id = categoryKey + '_' + key;
      html += `<button type="button" class="chart-card chart-card-add" aria-label="Open ${escapeAttr(marker.name)} details" ${markerDetailActionAttrs('show-detail-modal', { id })}>
        <span>${escapeHTML(marker.name)}</span><span>${escapeHTML(suffix)}</span></button>`;
    }
    return html + `</div></div>`;
  };
  return renderSection(outsideRange, `Results outside ${selectedRangeLabel()}`, 'view history')
    + renderSection(neverRecorded, 'No data yet', '+ add value');
}

function sortCategoryChartEntries(entries, categoryKey) {
  const preserved = state._preserveCategoryCardOrder;
  if (preserved?.categoryKey === categoryKey && Array.isArray(preserved.markerKeys)) {
    const order = new Map(preserved.markerKeys.map((key, index) => [key, index]));
    entries.sort(([ka], [kb]) => (order.get(ka) ?? Number.MAX_SAFE_INTEGER) - (order.get(kb) ?? Number.MAX_SAFE_INTEGER));
    delete state._preserveCategoryCardOrder;
    return;
  }
  delete state._preserveCategoryCardOrder;

  // Default category landing sort: markers with catalog slots first, then
  // by status (out-of-range before normal).
  const catalogSlots = getCategoryPageCatalogSlots();
  const hasSlot = (k) => catalogSlots?.[categoryKey + '.' + k] ? 0 : 1;
  const statusOrder = { high: 0, low: 0, normal: 1, unrated: 2, missing: 3 };
  entries.sort(([ka, a], [kb, b]) => {
    const slotDiff = hasSlot(ka) - hasSlot(kb);
    if (slotDiff !== 0) return slotDiff;
    const ai = getLatestValueIndex(a.values), bi = getLatestValueIndex(b.values);
    const ar = ai !== -1 ? getEffectiveRangeForDate(a, ai) : { min: null, max: null };
    const br = bi !== -1 ? getEffectiveRangeForDate(b, bi) : { min: null, max: null };
    const as = ai === -1 ? 'missing' : (ar.min == null && ar.max == null) ? 'unrated' : getStatus(a.values[ai], ar.min, ar.max);
    const bs = bi === -1 ? 'missing' : (br.min == null && br.max == null) ? 'unrated' : getStatus(b.values[bi], br.min, br.max);
    return (statusOrder[as] ?? 3) - (statusOrder[bs] ?? 3);
  });
}

export function showCategory(categoryKey, preData) {
  // categoryKey is interpolated into delegated data attributes below. Reject
  // anything that doesn't match the strict allowlist so a poisoned
  // customMarker key can't break out of the HTML attribute context.
  if (!safeMarkerId(categoryKey)) return;
  const main = document.getElementById("main-content");
  if (!main) return;
  // Ensure catalog is preloaded for sorting and rec links
  primeCategoryPageCatalogCache();
  const rawData = preData || getActiveData();
  const data = filterDatesByRange(rawData, { fallbackToAll: false });
  const cat = data.categories[categoryKey];
  const rawCat = rawData.categories[categoryKey];
  const allEntries = Object.entries(cat.markers).filter(([, m]) => !m.hidden);
  const withData = allEntries.filter(([, m]) => markerHasData(m));
  const rawWithData = Object.values(rawCat?.markers || {}).filter(markerHasData).length;
  const countLabel = state.dateRangeFilter !== 'all'
    ? `${withData.length} of ${allEntries.length} biomarkers with results in ${selectedRangeLabel()}`
    : withData.length < allEntries.length ? `${withData.length} of ${allEntries.length} biomarkers with data` : `${allEntries.length} biomarkers tracked`;
  const renameBtn = ` <span class="ref-edited-badge" role="button" tabindex="0" aria-label="Rename category" title="Rename category" ${categoryPageActionAttrs('rename-category', { category: categoryKey })} style="cursor:pointer;font-size:12px">rename</span>`;
  let html = `<div class="category-header"><h2>${renderCategoryGlyph(categoryKey, cat.label)}<span class="category-title-text">${escapeHTML(cat.label)}</span>${renameBtn}</h2>
    <p>${countLabel}</p></div>`;

  html += `<div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-bottom:20px">`;
  html += `<div class="view-toggle" role="tablist" aria-label="View mode" style="margin-bottom:0">
    <button class="view-btn active" role="tab" aria-selected="true" tabindex="0" ${categoryPageActionAttrs('switch-view', { category: categoryKey, view: 'charts' })}>Charts</button>
    <button class="view-btn" role="tab" aria-selected="false" tabindex="-1" ${categoryPageActionAttrs('switch-view', { category: categoryKey, view: 'table' })}>Table</button>
    <button class="view-btn" role="tab" aria-selected="false" tabindex="-1" ${categoryPageActionAttrs('switch-view', { category: categoryKey, view: 'heatmap' })}>Heatmap</button></div>`;
  html += renderDateRangeFilter();
  html += renderChartLayersDropdown();
  html += `</div>`;

  html += `<div id="view-content">`;
  if (withData.length === 0) {
    html += state.dateRangeFilter !== 'all' && rawWithData > 0
      ? renderNoResultsInRange(cat, categoryKey)
      : `<div class="empty-state"><div class="empty-state-icon empty-state-icon-category">${renderCategoryGlyph(categoryKey, cat.label, { large: true })}</div>
        <h3>No Data Available</h3><p>Import lab results containing ${escapeHTML(cat.label.toLowerCase())} markers to see data here.</p></div>`;
  } else if (cat.singleDate) {
    html += renderFattyAcidsView(cat, categoryKey);
  } else {
    sortCategoryChartEntries(withData, categoryKey);
    html += `<div class="charts-grid">`;
    for (const [key, marker] of withData) {
      // Skip legacy customMarkers with unsafe keys — they can't be safely
      // embedded in inline-onclick handlers.
      if (!safeMarkerId(key)) continue;
      html += renderChartCard(categoryKey + "_" + key, marker, data.dateLabels, data.dates);
    }
    html += `</div>`;
    html += renderMarkerDataGapSections(allEntries, rawCat, categoryKey);
  }
  html += `</div>`;
  main.innerHTML = html;

  const savedView = state.categoryView;
  if (savedView === 'table' || savedView === 'heatmap') {
    const buttons = main.querySelectorAll('.view-toggle .view-btn');
    const idx = savedView === 'table' ? 1 : 2;
    if (buttons[idx]) { switchView(savedView, categoryKey, buttons[idx]); return; }
  }

  if (withData.length === 0) { /* no charts to render */ }
  else if (cat.singleDate) { renderFattyAcidsCharts(cat); }
  else {
    for (const [key, marker] of withData) {
      createLineChart(categoryKey + "_" + key, marker, data.dateLabels, data.dates, data.phaseLabels, {
        displayLabels: data.phaseDisplayLabels,
        cycleDays: data.phaseCycleDays,
        sources: data.phaseSources,
      });
    }
  }
  void loadChartCardRecs();
}

export function switchView(view, categoryKey, btn) {
  // categoryKey reaches delegated data attributes via renderChartCard /
  // renderFattyAcidsView / renderTableView / renderHeatmapView. Same
  // allowlist guard as showCategory.
  if (!safeMarkerId(categoryKey)) return;
  const container = document.getElementById("view-content");
  if (!container) return;
  state.categoryView = view;
  document.querySelectorAll(".view-btn").forEach(b => {
    b.classList.remove("active");
    b.setAttribute('aria-selected', 'false');
    b.setAttribute('tabindex', '-1');
  });
  btn.classList.add("active");
  btn.setAttribute('aria-selected', 'true');
  btn.setAttribute('tabindex', '0');
  destroyAllCharts();
  const rawData = getActiveData();
  const data = filterDatesByRange(rawData, { fallbackToAll: false });
  const cat = data.categories[categoryKey];
  const rawCat = rawData.categories[categoryKey];
  // Pre-sanitize date labels at the call boundary — CodeQL's taint analysis
  // (js/xss-through-dom) doesn't trace sanitizers across function calls, so
  // even though renderTableView/renderHeatmapView re-escape internally,
  // escaping here closes the call-site taint flow. Date arrays stay raw
  // because renderers treat them as values and escape at the attribute/text
  // boundary where needed.
  const safeLabels = Array.isArray(data.dateLabels) ? data.dateLabels.map(escapeHTML) : data.dateLabels;
  const categoryHasVisibleData = Object.values(cat.markers || {}).some(markerHasData);
  const categoryHasHistoricalData = Object.values(rawCat?.markers || {}).some(markerHasData);
  if (state.dateRangeFilter !== 'all' && !categoryHasVisibleData && categoryHasHistoricalData) {
    container.innerHTML = renderNoResultsInRange(cat, categoryKey);
    return;
  }
  if (view === "table") {
    container.innerHTML = renderTableView(cat, safeLabels, categoryKey, data.dates);
  } else if (view === "heatmap") {
    container.innerHTML = renderHeatmapView(cat, safeLabels, categoryKey);
  } else {
    if (cat.singleDate) {
      container.innerHTML = renderFattyAcidsView(cat, categoryKey);
      renderFattyAcidsCharts(cat);
    } else {
      // Per-key safety check skips legacy customMarkers with unsafe keys so
      // they never reach inline-onclick handlers in renderChartCard.
      const withData = Object.entries(cat.markers).filter(([key, m]) => markerHasData(m) && safeMarkerId(key));
      if (withData.length === 0) {
        container.innerHTML = state.dateRangeFilter !== 'all' && categoryHasHistoricalData
          ? renderNoResultsInRange(cat, categoryKey)
          : `<div class="empty-state"><h3>No Data Available</h3><p>Import lab results to see marker charts here.</p></div>`;
        return;
      }
      sortCategoryChartEntries(withData, categoryKey);
      let html = `<div class="charts-grid">`;
      for (const [key, marker] of withData) {
        html += renderChartCard(categoryKey + "_" + key, marker, data.dateLabels, data.dates);
      }
      html += `</div>`;
      const allEntries = Object.entries(cat.markers).filter(([, marker]) => !marker.hidden);
      html += renderMarkerDataGapSections(allEntries, rawCat, categoryKey);
      container.innerHTML = html;
      for (const [key, marker] of withData) {
        createLineChart(categoryKey + "_" + key, marker, data.dateLabels, data.dates, data.phaseLabels, {
          displayLabels: data.phaseDisplayLabels,
          cycleDays: data.phaseCycleDays,
          sources: data.phaseSources,
        });
      }
      void loadChartCardRecs();
    }
  }
}
