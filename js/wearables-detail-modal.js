// @ts-check

import { getErrorMessage } from './caught-error.js';
import { escapeHTML, escapeAttr, showNotification } from './utils.js';
import { state } from './state.js';
import {
  adapterById,
  canonicalMetric,
  CUMULATIVE_METRICS,
  isMetricValueMeaningful,
  isoDay,
} from './wearable-adapters.js';
import { getActiveProfileId } from './profile.js';
import { getDailyRange } from './wearables-store.js';
import { MANUAL_METRICS } from './wearables-manual.js';
import { getChartColors } from './theme.js';
import { ensureChartJs, formatChartTickValue, isChartDateAdapterReady } from './charts.js';
import {
  formatWearableMetricValue,
  shortDate,
  wearableDisplayUnit,
} from './wearables-formatters.js';
import { renderBloodPressureChart } from './wearables-bp-detail-chart.js';
import { openModalOverlay } from './modal-lifecycle.js';
import {
  closeWearableDetailModalRuntime,
  createWearableDetailChartRuntime,
  hasWearableDetailChartRuntime,
  rememberWearableDetailModalTriggerRuntime,
} from './wearables-detail-runtime.js';
import {
  closeManualAddFromDetail,
  configureWearableManualDetailDeps,
  deleteManualEntryFromDetail,
  openManualAddFromDetail,
  saveManualEntryFromDetail,
} from './wearables-manual-detail.js';

export {
  closeManualAddFromDetail,
  deleteManualEntryFromDetail,
  openManualAddFromDetail,
  saveManualEntryFromDetail,
};
const WEARABLE_DETAIL_RANGES = [
  { key: '90d', days: 90, label: '90d', coverageSuffix: 'of last 90 days', emptyWindow: 'the last 90 days' },
  { key: '6m', days: 180, label: '6m', coverageSuffix: 'of last 6 months', emptyWindow: 'the last 6 months' },
  { key: '1y', days: 365, label: '1y', coverageSuffix: 'of last 12 months', emptyWindow: 'the last 12 months' },
  { key: 'all', days: null, label: 'All', coverageSuffix: 'all-time', emptyWindow: 'all recorded data' },
];
const WEARABLE_ALL_HISTORY_START_DATE = '1970-01-01';
const WEARABLE_DETAIL_RANGE_KEY = 'wearable-detail-range';

export function wearableActionAttrs(action, attrs = {}) {
  return [
    `data-wearable-action="${escapeAttr(action)}"`,
    ...Object.entries(attrs)
      .filter(([, value]) => value !== undefined && value !== null && value !== '')
      .map(([name, value]) => `data-wearable-${escapeAttr(name)}="${escapeAttr(String(value))}"`),
  ].join(' ');
}

function getWearableDetailRange() {
  const stored = localStorage.getItem(WEARABLE_DETAIL_RANGE_KEY);
  if (stored && WEARABLE_DETAIL_RANGES.some(r => r.key === stored)) return stored;
  return '90d';
}

export function setWearableDetailRange(metricId, rangeKey) {
  if (!WEARABLE_DETAIL_RANGES.some(r => r.key === rangeKey)) return;
  localStorage.setItem(WEARABLE_DETAIL_RANGE_KEY, rangeKey);
  openWearableDetail(metricId, { fromRangeToggle: true });
}

// Monotonic op token: fast successive clicks on different cards should not
// land mismatched data in the shared detail modal.
let _detailOp = 0;

export async function openWearableDetail(metricId, opts = {}) {
  const op = ++_detailOp;
  const summary = state.importedData?.wearableSummary;
  const normalizedMetricId = metricId === 'bp_diastolic' && summary?.metrics?.bp_systolic
    ? 'bp_systolic'
    : metricId;
  const canon = canonicalMetric(normalizedMetricId);
  const m = summary?.metrics?.[normalizedMetricId];
  if (!canon || !m) {
    showNotification?.('No data for this metric yet — run a sync first', 'info');
    return;
  }

  if (!opts.fromRangeToggle) rememberWearableDetailModalTriggerRuntime();

  const rangeKey = getWearableDetailRange();
  const rangeDef = WEARABLE_DETAIL_RANGES.find(r => r.key === rangeKey) || WEARABLE_DETAIL_RANGES[0];
  const profileId = getActiveProfileId();
  const endDate = isoDay();
  let startDate;
  if (rangeDef.days == null) {
    startDate = WEARABLE_ALL_HISTORY_START_DATE;
  } else {
    const start = new Date();
    start.setDate(start.getDate() - rangeDef.days);
    startDate = isoDay(start);
  }

  let rows = [];
  let pairedRows = [];
  const isBloodPressureDetail = normalizedMetricId === 'bp_systolic';
  const pairedMetricId = isBloodPressureDetail ? 'bp_diastolic' : null;
  const pairedMetric = pairedMetricId ? summary?.metrics?.[pairedMetricId] : null;
  try {
    rows = await getDailyRange(profileId, m.primarySource, startDate, endDate);
    if (pairedMetricId && pairedMetric?.primarySource && pairedMetric.primarySource !== m.primarySource) {
      pairedRows = await getDailyRange(profileId, pairedMetric.primarySource, startDate, endDate);
    } else {
      pairedRows = rows;
    }
  } catch (e) {
    showNotification?.(`Couldn't read local history: ${getErrorMessage(e)}`, 'error', 4000);
    return;
  }
  if (op !== _detailOp) return;

  const series = rows
    .map(r => ({ date: r.date, v: r[normalizedMetricId] }))
    .filter(p => isMetricValueMeaningful(normalizedMetricId, p.v))
    .sort((a, b) => a.date.localeCompare(b.date));
  const pairedSeries = pairedMetricId ? pairedRows
    .map(r => ({ date: r.date, v: r[pairedMetricId] }))
    .filter(p => isMetricValueMeaningful(pairedMetricId, p.v))
    .sort((a, b) => a.date.localeCompare(b.date)) : [];

  const allZeroActivity = normalizedMetricId === 'activity_score'
    && series.length > 0
    && series.every(p => p.v === 0);

  let manualRows = [];
  if (MANUAL_METRICS.includes(normalizedMetricId)) {
    try {
      manualRows = await getDailyRange(profileId, 'manual', WEARABLE_ALL_HISTORY_START_DATE, endDate);
    } catch {
      manualRows = [];
    }
    if (op !== _detailOp) return;
  }

  const manualEntries = manualRows
    .map(r => ({
      date: r.date,
      v: r[normalizedMetricId],
      pairedV: pairedMetricId ? r[pairedMetricId] : undefined,
      tags: r.tags,
      note: r.note,
    }))
    .filter(p => isMetricValueMeaningful(normalizedMetricId, p.v) || (pairedMetricId && isMetricValueMeaningful(pairedMetricId, p.pairedV)))
    .sort((a, b) => b.date.localeCompare(a.date));
  const manualChartEntries = manualEntries
    .map(p => ({
      ...p,
      v: m.primarySource === 'manual' ? undefined : p.v,
      pairedV: pairedMetric?.primarySource === 'manual' ? undefined : p.pairedV,
    }))
    .filter(p => isMetricValueMeaningful(normalizedMetricId, p.v) || (pairedMetricId && isMetricValueMeaningful(pairedMetricId, p.pairedV)))
    .filter(p => rangeDef.days == null || p.date >= startDate)
    .sort((a, b) => a.date.localeCompare(b.date));
  const chartSampleCount = new Set([
    ...series.map(p => p.date),
    ...pairedSeries.map(p => p.date),
    ...manualChartEntries.map(p => p.date),
  ].filter(Boolean)).size;

  const modal = document.getElementById('detail-modal');
  const overlay = document.getElementById('modal-overlay');
  if (!modal || !overlay) return;

  if (state.chartInstances['modal']) {
    state.chartInstances['modal'].destroy();
    delete state.chartInstances['modal'];
  }

  modal.innerHTML = buildWearableDetailHtml(canon, m, series, normalizedMetricId, manualEntries, {
    allZeroActivity,
    rangeKey,
    rangeStartDate: startDate,
    pairedMetric,
    pairedSeries,
    pairedMetricId,
    chartSampleCount,
    manualChartSampleCount: manualChartEntries.length,
  });
  openModalOverlay(overlay);

  const focusTarget = opts.fromRangeToggle
    ? modal.querySelector('.wearable-detail-range .ctx-btn-option.active')
    : modal.querySelector('.modal-close');
  if (focusTarget instanceof HTMLElement) focusTarget.focus();
  _installWearableModalFocusTrap(modal);

  const canvas = document.getElementById('chart-modal');
  if (canvas && (series.length > 0 || pairedSeries.length > 0 || manualChartEntries.length > 0)) {
    if (canvas instanceof HTMLCanvasElement) {
      if (isBloodPressureDetail) renderBloodPressureChart(canvas, canon, m, series, pairedSeries, manualChartEntries, pairedMetric);
      else renderWearableChart(canvas, canon, m, series, manualChartEntries);
    }
  }
}

let _modalTrapHandler = null;

export function _uninstallWearableModalFocusTrap() {
  if (_modalTrapHandler) {
    document.removeEventListener('keydown', _modalTrapHandler, true);
    _modalTrapHandler = null;
  }
}

function _installWearableModalFocusTrap(modal) {
  _uninstallWearableModalFocusTrap();
  _modalTrapHandler = (e) => {
    if (e.key !== 'Tab') return;
    const overlay = document.getElementById('modal-overlay');
    if (!overlay?.classList?.contains('show')) {
      document.removeEventListener('keydown', _modalTrapHandler, true);
      _modalTrapHandler = null;
      return;
    }
    const focusable = modal.querySelectorAll(
      'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && active === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  };
  document.addEventListener('keydown', _modalTrapHandler, true);
}

function buildManualEntriesSection(metricId, manualEntries, primarySource) {
  if (!MANUAL_METRICS.includes(metricId)) return '';
  if (manualEntries.length === 0) {
    if (primarySource && primarySource !== 'manual') {
      return `<section class="wearable-manual-entries wearable-manual-entries-compact">
        <button type="button" class="wearable-manual-add-btn" ${wearableActionAttrs('open-detail-manual-add', { metric: metricId })}>+ Add a manual reading</button>
        <div id="wearable-manual-add-slot"></div>
      </section>`;
    }
    return `<section class="wearable-manual-entries">
      <div class="wearable-manual-entries-head">
        <span class="wearable-manual-entries-title">Manual entries</span>
        <button type="button" class="wearable-manual-add-btn" ${wearableActionAttrs('open-detail-manual-add', { metric: metricId })}>+ Add reading</button>
      </div>
      <div class="wearable-manual-entries-empty">No manual entries for this metric yet.</div>
      <div id="wearable-manual-add-slot"></div>
    </section>`;
  }

  const canon = canonicalMetric(metricId);
  const canonicalUnit = canon?.unit || '';
  const unit = wearableDisplayUnit(metricId, canonicalUnit, state.unitSystem);
  const metricLabel = canon?.label || metricId;
  const isBloodPressure = metricId === 'bp_systolic';
  const formatEntryValue = (e) => {
    if (isBloodPressure) {
      const sys = isMetricValueMeaningful('bp_systolic', e.v)
        ? formatWearableMetricValue(metricId, e.v, canonicalUnit, state.unitSystem)
        : '—';
      const dia = isMetricValueMeaningful('bp_diastolic', e.pairedV)
        ? formatWearableMetricValue(metricId, e.pairedV, canonicalUnit, state.unitSystem)
        : '—';
      return `${sys}/${dia}`;
    }
    return formatWearableMetricValue(metricId, e.v, canonicalUnit, state.unitSystem);
  };
  const formatSpokenDate = (iso) => {
    try {
      const d = new Date(iso + 'T00:00:00');
      return d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
    } catch {
      return iso;
    }
  };
  const rows = manualEntries.map(e => {
    const tagChips = Array.isArray(e.tags) && e.tags.length
      ? `<span class="wearable-manual-entry-tags">${e.tags.map(t => `<span class="wearable-manual-entry-tag">${escapeHTML(t)}</span>`).join('')}</span>`
      : '';
    const noteRow = (typeof e.note === 'string' && e.note.trim())
      ? `<div class="wearable-manual-entry-note">${escapeHTML(e.note)}</div>`
      : '';
    const valueRead = formatEntryValue(e);
    const ariaText = `Delete ${isBloodPressure ? 'blood pressure' : metricLabel.toLowerCase()} reading from ${formatSpokenDate(e.date)}, ${valueRead}${unit ? ' ' + unit : ''}`;
    return `<li class="wearable-manual-entry${noteRow ? ' has-note' : ''}" data-entry-date="${escapeHTML(e.date)}">
      <span class="wearable-manual-entry-date">${escapeHTML(shortDate(e.date))}</span>
      <span class="wearable-manual-entry-val">${valueRead}${unit ? ` <span class="wearable-manual-entry-unit">${escapeHTML(unit)}</span>` : ''}</span>
      ${tagChips}
      <button type="button" class="wearable-manual-entry-del" title="Delete this reading" aria-label="${escapeHTML(ariaText)}" ${wearableActionAttrs('delete-detail-manual-entry', { metric: metricId, date: e.date })}>×</button>
      ${noteRow}
    </li>`;
  }).join('');
  return `<section class="wearable-manual-entries">
    <div class="wearable-manual-entries-head">
      <span class="wearable-manual-entries-title">Manual entries <span class="wearable-manual-entries-count">${manualEntries.length}</span></span>
      <button type="button" class="wearable-manual-add-btn" ${wearableActionAttrs('open-detail-manual-add', { metric: metricId })}>+ Add reading</button>
    </div>
    <div id="wearable-manual-add-slot"></div>
    <ul class="wearable-manual-entries-list">${rows}</ul>
  </section>`;
}

function buildWearableDetailHtml(canon, m, series, metricId, manualEntries = [], opts = {}) {
  const adapter = adapterById(m.primarySource);
  const sourceName = adapter?.displayName || m.primarySource;
  const canonicalUnit = canon.unit || '';
  const unit = wearableDisplayUnit(metricId, canonicalUnit, state.unitSystem);
  const unitSpaced = unit ? ' ' + escapeHTML(unit) : '';
  const subLabel = canon.sub ? ` <span style="opacity:0.6;font-size:0.7em;margin-left:6px;font-weight:normal">${escapeHTML(canon.sub)}</span>` : '';
  const formatV = v => formatWearableMetricValue(metricId, v, canonicalUnit, state.unitSystem);

  const trendWord = m.trend30d === 'declining' ? 'declining'
                   : m.trend30d === 'rising' ? 'rising'
                   : m.trend30d === 'improving' ? 'improving'
                   : 'flat';

  const suppressDelta = !m.baseline || !isFinite(m.baseline)
                     || metricId === 'steps'
                     || (m.latest === 0 && Math.abs(m.baseline) > 0.5);
  let deltaStr = null;
  if (!suppressDelta && m.latest != null && isFinite(m.latest)) {
    if (canon?.sub === 'Δ') {
      const diff = m.latest - m.baseline;
      const arrow = diff > 0.005 ? '↑' : diff < -0.005 ? '↓' : '→';
      deltaStr = `${arrow} ${Math.abs(diff).toFixed(2)}${unit}`;
    } else {
      const deltaPct = (m.latest - m.baseline) / m.baseline * 100;
      const arrow = deltaPct > 0.5 ? '↑' : deltaPct < -0.5 ? '↓' : '→';
      deltaStr = `${arrow} ${Math.abs(deltaPct).toFixed(0)}%`;
    }
  }

  const DAY_COMPANION = { hrv_rmssd: 'hrv_day', rhr: 'hr_day' };
  const companionId = DAY_COMPANION[metricId];
  const companion = companionId ? state.importedData?.wearableSummary?.metrics?.[companionId] : null;
  const companionLabel = metricId === 'hrv_rmssd' ? 'Daytime HRV'
                       : metricId === 'rhr'       ? 'Daytime HR'
                       : null;
  const companionUnitSpaced = companion ? unitSpaced : '';

  const rangeKey = opts.rangeKey || '90d';
  const rangeDef = WEARABLE_DETAIL_RANGES.find(r => r.key === rangeKey) || WEARABLE_DETAIL_RANGES[0];
  const rangeStartDate = typeof opts.rangeStartDate === 'string' ? opts.rangeStartDate : WEARABLE_ALL_HISTORY_START_DATE;
  const pairedMetric = metricId === 'bp_systolic' ? opts.pairedMetric : null;
  const pairedSeries = Array.isArray(opts.pairedSeries) ? opts.pairedSeries : [];
  const chartSampleCount = Number.isFinite(opts.chartSampleCount)
    ? opts.chartSampleCount
    : Math.max(series.length, pairedSeries.length);
  const pairedUnitSpaced = unitSpaced;
  const formatPaired = (sys, dia, includeUnit = true) => {
    const sysText = isMetricValueMeaningful('bp_systolic', sys) ? formatV(sys) : '—';
    const diaText = isMetricValueMeaningful('bp_diastolic', dia) ? formatV(dia) : '—';
    return `${sysText}/${diaText}${includeUnit ? pairedUnitSpaced : ''}`;
  };
  const latestPairedReading = (() => {
    if (!pairedMetric) return null;
    const diastolicByDate = new Map(pairedSeries.map(p => [p.date, p.v]));
    const candidates = [];
    for (const point of series) {
      const dia = diastolicByDate.get(point.date);
      if (isMetricValueMeaningful('bp_systolic', point.v) && isMetricValueMeaningful('bp_diastolic', dia)) {
        candidates.push({ date: point.date, sys: point.v, dia });
      }
    }
    const manualPairedEntries = manualEntries
      .filter(point => rangeDef.days == null || point.date >= rangeStartDate);
    for (const point of manualPairedEntries) {
      if (isMetricValueMeaningful('bp_systolic', point.v) && isMetricValueMeaningful('bp_diastolic', point.pairedV)) {
        candidates.push({ date: point.date, sys: point.v, dia: point.pairedV });
      }
    }
    return candidates.sort((a, b) => b.date.localeCompare(a.date))[0] || null;
  })();
  const latestSummaryDatesMatch = !!(m.latestDate && pairedMetric?.latestDate && m.latestDate === pairedMetric.latestDate);
  const latestSummaryDatesIncomplete = !m.latestDate || !pairedMetric?.latestDate;
  const latestSummaryDatesSplit = !!(m.latestDate && pairedMetric?.latestDate && m.latestDate !== pairedMetric.latestDate);
  const latestBpValue = latestPairedReading
    ? formatPaired(latestPairedReading.sys, latestPairedReading.dia)
    : (latestSummaryDatesMatch ? formatPaired(m.latest, pairedMetric?.latest) : '—');
  const latestBpDate = latestPairedReading
    ? shortDate(latestPairedReading.date)
    : (latestSummaryDatesSplit
        ? `No same-date pair · sys ${shortDate(m.latestDate)} · dia ${shortDate(pairedMetric.latestDate)}`
        : (latestSummaryDatesIncomplete
            ? `No same-date pair${m.latestDate ? ` · sys ${shortDate(m.latestDate)}` : ''}${pairedMetric?.latestDate ? ` · dia ${shortDate(pairedMetric.latestDate)}` : ''}`
            : shortDate(m.latestDate)));
  const baseStats = pairedMetric ? [
    ['Latest',   latestBpValue, latestBpDate],
    ['Baseline (90d)', formatPaired(m.baseline, pairedMetric.baseline), 'median'],
    ['7-day avg', formatPaired(m.rolling?.d7, pairedMetric.rolling?.d7), ''],
    ['30-day avg', formatPaired(m.rolling?.d30, pairedMetric.rolling?.d30), ''],
    ['Typical range', `${formatPaired(m.baselineP25, pairedMetric.baselineP25, false)} – ${formatPaired(m.baselineP75, pairedMetric.baselineP75, false)}${pairedUnitSpaced}`, '25th–75th percentile'],
    ['Chart samples', `${chartSampleCount}d`, rangeDef.coverageSuffix],
  ] : [
    ['Latest',   `${formatV(m.latest)}${unitSpaced}`, m.latestDate ? shortDate(m.latestDate) : ''],
    ['Baseline (90d)', `${formatV(m.baseline)}${unitSpaced}`, 'median'],
    ['7-day avg', `${formatV(m.rolling?.d7)}${unitSpaced}`, ''],
    ['30-day avg', `${formatV(m.rolling?.d30)}${unitSpaced}`, ''],
    ['Typical range', `${formatV(m.baselineP25)} – ${formatV(m.baselineP75)}${unitSpaced}`, '25th–75th percentile'],
    ['Chart samples', `${series.length}d`, rangeDef.coverageSuffix],
  ];

  if (companion && companionLabel && typeof companion.latest === 'number') {
    baseStats.push([
      `${companionLabel} (latest)`,
      `${formatV(companion.latest)}${companionUnitSpaced}`,
      companion.latestDate ? `daytime · ${shortDate(companion.latestDate)}` : 'daytime',
    ]);
    if (typeof companion.rolling?.d7 === 'number') {
      baseStats.push([
        `${companionLabel} (7d)`,
        `${formatV(companion.rolling.d7)}${companionUnitSpaced}`,
        'daytime · 7-day avg',
      ]);
    }
    if (typeof companion.rolling?.d30 === 'number' && companion.weekly && companion.weekly.length >= 2) {
      baseStats.push([
        `${companionLabel} (30d)`,
        `${formatV(companion.rolling.d30)}${companionUnitSpaced}`,
        'daytime · 30-day avg',
      ]);
    }
  } else if (companionLabel) {
    const primary = m.primarySource;
    const adapter2 = adapterById(primary);
    const sourceDisplay = adapter2?.displayName || primary || 'this source';
    const tooltip = (() => {
      if (metricId === 'hrv_rmssd') {
        if (primary === 'oura' || primary === 'whoop') {
          return `${sourceDisplay} v2 API exposes overnight HRV only. To see daytime HRV, connect Apple Health, Fitbit, or Polar (workout-tracked HRV).`;
        }
        if (primary === 'polar') return 'Polar surfaces daytime HRV from recorded workouts only — no exercise transactions in the last 90 days.';
        return 'No daytime HRV samples in the last 90 days. Apple Health and Fitbit (dailyRmssd) typically populate this.';
      }
      return 'No daytime heart-rate samples in the last 90 days. Re-sync the connected wearable.';
    })();
    baseStats.push([
      companionLabel,
      '—',
      `Not from ${sourceDisplay} · why?`,
      tooltip,
    ]);
  }

  const statsCells = baseStats.map(([label, val, sub, tooltip]) => `
    <div class="wearable-detail-stat"${tooltip ? ` title="${escapeHTML(tooltip)}"` : ''}>
      <div class="wearable-detail-stat-label">${escapeHTML(label)}</div>
      <div class="wearable-detail-stat-val">${val}</div>
      ${sub ? `<div class="wearable-detail-stat-sub">${escapeHTML(sub)}</div>` : ''}
    </div>`).join('');

  const hasManualChartSamples = Number(opts.manualChartSampleCount || 0) > 0;
  const emptyHint = opts.allZeroActivity
    ? `<div class="wearable-detail-empty">Every day shows 0 — Oura suppresses the Activity composite score while Rest Mode is on. Check the <b>Steps</b> card for raw movement data, or disable Rest Mode in the Oura app.</div>`
    : series.length === 0 && pairedSeries.length === 0 && !hasManualChartSamples
      ? manualEntries.length > 0
        ? `<div class="wearable-detail-empty">No chart samples for this metric in ${escapeHTML(rangeDef.emptyWindow)}. Manual readings are listed below${m.primarySource === 'manual' && rangeDef.days != null ? '; switch to All to chart older manual readings' : ''}.</div>`
        : `<div class="wearable-detail-empty">No daily samples for this metric in ${escapeHTML(rangeDef.emptyWindow)}. Either your wearable doesn't share this metric, the feature is off on your device, or you didn't wear it. Try Sync now, or reconnect to refresh permissions.</div>`
      : '';

  const connectedSources = state.importedData?.wearableSummary?.sources || {};
  const showSwapButton = Object.keys(connectedSources).length > 1 && !!adapter;
  const swapButton = showSwapButton
    ? pairedMetric
      ? (() => {
          const pairedAdapter = adapterById(pairedMetric.primarySource);
          const pairedSourceName = pairedAdapter?.displayName || pairedMetric.primarySource || 'Diastolic source';
          return `<button type="button" class="wearable-source-badge wearable-source-badge-btn wearable-modal-source-swap" ${wearableActionAttrs('choose-source', { metric: 'bp_systolic' })} title="Switch systolic source">sys via ${escapeHTML(sourceName)} · swap</button>
            <button type="button" class="wearable-source-badge wearable-source-badge-btn wearable-modal-source-swap" ${wearableActionAttrs('choose-source', { metric: 'bp_diastolic' })} title="Switch diastolic source">dia via ${escapeHTML(pairedSourceName)} · swap</button>`;
        })()
      : `<button type="button" class="wearable-source-badge wearable-source-badge-btn wearable-modal-source-swap" ${wearableActionAttrs('choose-source', { metric: metricId })} title="Switch source for this metric">via ${escapeHTML(adapter.displayName)} · swap</button>`
    : '';

  const emfSleepHint = _buildEMFSleepHint(metricId, m);
  const rangePills = WEARABLE_DETAIL_RANGES.map(r =>
    `<button type="button" class="ctx-btn-option${r.key === rangeKey ? ' active' : ''}" aria-pressed="${r.key === rangeKey}" ${wearableActionAttrs('set-detail-range', { metric: metricId, range: r.key })}>${escapeHTML(r.label)}</button>`
  ).join('');

  return `<button class="modal-close" ${wearableActionAttrs('modal-close')}>&times;</button>
    <h3>${escapeHTML(canon.label)}${subLabel}</h3>
    <div class="modal-unit">
      ${escapeHTML(sourceName)}${deltaStr ? ` · ${deltaStr} vs baseline` : ''} · ${escapeHTML(trendWord)} 30d
      ${swapButton}
    </div>
    <div class="ctx-btn-group wearable-detail-range" role="group" aria-label="Chart range">${rangePills}</div>
    <div class="modal-chart" style="height:260px"><canvas id="chart-modal"></canvas></div>
    ${emptyHint}
    <div class="wearable-detail-stats">${statsCells}</div>
    ${buildManualEntriesSection(metricId, manualEntries, m.primarySource)}
    ${emfSleepHint}`;
}

function _buildEMFSleepHint(metricId, m) {
  const SLEEP_METRICS = new Set(['sleep_score', 'sleep_efficiency', 'hrv_rmssd']);
  if (!SLEEP_METRICS.has(metricId)) return '';
  const sources = state.importedData?.wearableSummary?.sources;
  if (!sources || Object.keys(sources).length === 0) return '';
  const d7 = m?.rolling?.d7;
  const baseline = m?.baseline;
  const p25 = m?.baselineP25;
  if (typeof d7 !== 'number' || typeof baseline !== 'number') return '';
  const regressing = d7 < baseline && (typeof p25 !== 'number' || d7 < p25);
  if (!regressing) return '';
  const assessments = state.importedData?.emfAssessment?.assessments || [];
  if (assessments.length) {
    const latest = assessments.reduce((a, b) => (a.date > b.date ? a : b));
    const ageDays = (Date.now() - new Date(latest.date + 'T00:00:00').getTime()) / 86400000;
    if (ageDays < 120) return '';
  }
  return `<div class="wearable-detail-emf-hint"><span aria-hidden="true">💡</span> Sleep regressing? Sometimes it's the room. <a href="#" ${wearableActionAttrs('open-emf-assessment')} data-umami-event="emf-nudge-wearable-sleep">Check your EMF environment →</a></div>`;
}

function renderWearableChart(canvas, canon, m, series, manualSeries = []) {
  if (!hasWearableDetailChartRuntime() || !isChartDateAdapterReady()) {
    ensureChartJs().then(() => {
      const currentCanvas = document.getElementById(canvas.id);
      if (currentCanvas) renderWearableChart(currentCanvas, canon, m, series, manualSeries);
    }).catch(() => {});
    return;
  }
  const tc = getChartColors();
  const primaryData = series.map(p => ({ x: p.date, y: p.v }));
  const manualData = manualSeries.map(p => ({ x: p.date, y: p.v }));
  const xDates = [...series.map(p => p.date), ...manualSeries.map(p => p.date)].sort();
  const values = [...series.map(p => p.v), ...manualSeries.map(p => p.v)];
  if (values.length === 0) return;
  const hasManualOverlay = primaryData.length > 0 && manualData.length > 0;
  const baselineIsFinite = typeof m.baseline === 'number' && isFinite(m.baseline);
  const baselineValues = baselineIsFinite && xDates.length
    ? [{ x: xDates[0], y: m.baseline }, { x: xDates[xDates.length - 1], y: m.baseline }]
    : [];
  const isCumulative = CUMULATIVE_METRICS.has(canon.id);
  const todayISO = isoDay();
  const isPartialIdx = (idx) => isCumulative && series[idx]?.date === todayISO;
  const partialColor = '#f59e0b';
  const primaryAdapter = adapterById(m.primarySource);
  const primaryLabel = primaryAdapter?.displayName || canon.label;

  const yValues = baselineIsFinite ? [...values, m.baseline] : values;
  const ymin = Math.min(...yValues);
  const ymax = Math.max(...yValues);
  const pad = Math.max((ymax - ymin) * 0.08, 0.5);

  const canonicalUnit = canon.unit || '';
  const unit = wearableDisplayUnit(canon.id, canonicalUnit, state.unitSystem);
  const formatV = v => formatWearableMetricValue(canon.id, v, canonicalUnit, state.unitSystem);
  const titleForPoint = (items) => {
    const rawX = items?.[0]?.raw?.x;
    if (typeof rawX === 'string') return shortDate(rawX);
    return items?.[0]?.label || '';
  };
  const datasets = [];
  if (primaryData.length > 0) {
    datasets.push({
      label: primaryLabel,
      data: primaryData,
      _kind: 'primary',
      borderColor: tc.lineColor || '#60a5fa',
      backgroundColor: 'transparent',
      borderWidth: 2,
      pointRadius: primaryData.map((_, i) => isPartialIdx(i) ? 5 : 0),
      pointBackgroundColor: primaryData.map((_, i) => isPartialIdx(i) ? partialColor : 'transparent'),
      pointBorderColor: primaryData.map((_, i) => isPartialIdx(i) ? partialColor : 'transparent'),
      pointHoverRadius: primaryData.map((_, i) => isPartialIdx(i) ? 7 : 4),
      tension: 0.3,
      spanGaps: true,
      segment: {
        borderDash: (ctx) => isPartialIdx(ctx.p1DataIndex) ? [5, 4] : undefined,
        borderColor: (ctx) => isPartialIdx(ctx.p1DataIndex) ? partialColor : undefined,
      },
    });
  }
  if (baselineValues.length > 0) {
    datasets.push({
      label: 'Baseline',
      data: baselineValues,
      _kind: 'baseline',
      borderColor: tc.gridColor || '#9ca3af',
      backgroundColor: 'transparent',
      borderWidth: 1,
      borderDash: [4, 4],
      pointRadius: 0,
      pointHoverRadius: 0,
      tension: 0,
    });
  }
  if (manualData.length > 0) {
    datasets.push({
      type: 'scatter',
      label: 'Manual',
      data: manualData,
      _kind: 'manual',
      borderColor: partialColor,
      backgroundColor: partialColor,
      pointRadius: 5,
      pointHoverRadius: 7,
      showLine: false,
    });
  }

  const chart = createWearableDetailChartRuntime(canvas, {
    type: 'line',
    data: { datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: hasManualOverlay ? 'nearest' : 'index', intersect: false, axis: 'x' },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: tc.tooltipBg, titleColor: tc.tooltipTitle,
          bodyColor: tc.tooltipBody, borderColor: tc.tooltipBorder, borderWidth: 1,
          callbacks: {
            title: titleForPoint,
            label: (c) => {
              const base = `${c.dataset.label}: ${formatV(c.parsed.y)}${unit ? ' ' + unit : ''}`;
              if (c.dataset._kind === 'manual') return `${base}  (manual entry)`;
              return (c.dataset._kind === 'primary' && isPartialIdx(c.dataIndex))
                ? `${base}  (partial day · in progress)`
                : base;
            },
          },
        },
      },
      scales: {
        x: {
          type: 'time',
          time: { tooltipFormat: 'MMM d, yyyy', displayFormats: { day: 'MMM d', month: 'MMM yyyy' } },
          ticks: { source: 'auto', color: tc.tickColor, font: { size: 10 }, maxTicksLimit: 8 },
          grid: { display: false },
        },
        y: {
          min: ymin - pad, max: ymax + pad,
          ticks: {
            color: tc.tickColor,
            font: { size: 10 },
            callback: canon.id === 'weight'
              ? value => formatV(Number(value))
              : formatChartTickValue,
          },
          grid: { color: tc.gridColor },
        },
      },
    },
  });
  if (chart) state.chartInstances['modal'] = chart;
}

configureWearableManualDetailDeps({
  closeDetail: closeWearableDetailModalRuntime,
  openDetail: openWearableDetail,
});
