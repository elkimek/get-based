import { escapeHTML, showNotification } from './utils.js';
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
import { ensureChartJs, isChartDateAdapterReady } from './charts.js';
import { formatValue, shortDate } from './wearables-formatters.js';
import { _collectActiveChips, _renderNoteField, _renderTagChips } from './wearables-manual-form-ui.js';

const WEARABLE_DETAIL_RANGES = [
  { key: '90d', days: 90, label: '90d', coverageSuffix: 'of last 90 days', emptyWindow: 'the last 90 days' },
  { key: '6m', days: 180, label: '6m', coverageSuffix: 'of last 6 months', emptyWindow: 'the last 6 months' },
  { key: '1y', days: 365, label: '1y', coverageSuffix: 'of last 12 months', emptyWindow: 'the last 12 months' },
  { key: 'all', days: null, label: 'All', coverageSuffix: 'all-time', emptyWindow: 'all recorded data' },
];
const WEARABLE_ALL_HISTORY_START_DATE = '1970-01-01';
const WEARABLE_DETAIL_RANGE_KEY = 'wearable-detail-range';

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
  const canon = canonicalMetric(metricId);
  const summary = state.importedData?.wearableSummary;
  const m = summary?.metrics?.[metricId];
  if (!canon || !m) {
    showNotification?.('No data for this metric yet — run a sync first', 'info');
    return;
  }

  if (!opts.fromRangeToggle) window.rememberModalTrigger?.();

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
  try {
    rows = await getDailyRange(profileId, m.primarySource, startDate, endDate);
  } catch (e) {
    showNotification?.(`Couldn't read local history: ${e.message}`, 'error', 4000);
    return;
  }
  if (op !== _detailOp) return;

  const series = rows
    .map(r => ({ date: r.date, v: r[metricId] }))
    .filter(p => isMetricValueMeaningful(metricId, p.v))
    .sort((a, b) => a.date.localeCompare(b.date));

  const allZeroActivity = metricId === 'activity_score'
    && series.length > 0
    && series.every(p => p.v === 0);

  let manualRows = [];
  if (MANUAL_METRICS.includes(metricId)) {
    try {
      manualRows = await getDailyRange(profileId, 'manual', WEARABLE_ALL_HISTORY_START_DATE, endDate);
    } catch {
      manualRows = [];
    }
    if (op !== _detailOp) return;
  }

  const manualEntries = manualRows
    .map(r => ({ date: r.date, v: r[metricId], tags: r.tags, note: r.note }))
    .filter(p => isMetricValueMeaningful(metricId, p.v))
    .sort((a, b) => b.date.localeCompare(a.date));
  const manualChartEntries = m.primarySource === 'manual'
    ? []
    : manualEntries
        .filter(p => rangeDef.days == null || p.date >= startDate)
        .sort((a, b) => a.date.localeCompare(b.date));

  const modal = document.getElementById('detail-modal');
  const overlay = document.getElementById('modal-overlay');
  if (!modal || !overlay) return;

  if (state.chartInstances['modal']) {
    state.chartInstances['modal'].destroy();
    delete state.chartInstances['modal'];
  }

  modal.innerHTML = buildWearableDetailHtml(canon, m, series, metricId, manualEntries, { allZeroActivity, rangeKey });
  overlay.classList.add('show');

  const focusTarget = opts.fromRangeToggle
    ? modal.querySelector('.wearable-detail-range .ctx-btn-option.active')
    : modal.querySelector('.modal-close');
  focusTarget?.focus?.();
  _installWearableModalFocusTrap(modal);

  const canvas = document.getElementById('chart-modal');
  if (canvas && (series.length > 0 || manualChartEntries.length > 0)) {
    renderWearableChart(canvas, canon, m, series, manualChartEntries);
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
        <button type="button" class="wearable-manual-add-btn" onclick="openManualAddFromDetail('${escapeHTML(metricId)}')">+ Add a manual reading</button>
        <div id="wearable-manual-add-slot"></div>
      </section>`;
    }
    return `<section class="wearable-manual-entries">
      <div class="wearable-manual-entries-head">
        <span class="wearable-manual-entries-title">Manual entries</span>
        <button type="button" class="wearable-manual-add-btn" onclick="openManualAddFromDetail('${escapeHTML(metricId)}')">+ Add reading</button>
      </div>
      <div class="wearable-manual-entries-empty">No manual entries for this metric yet.</div>
      <div id="wearable-manual-add-slot"></div>
    </section>`;
  }

  const canon = canonicalMetric(metricId);
  const unit = canon?.unit || '';
  const metricLabel = canon?.label || metricId;
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
    const valueRead = formatValue(e.v, unit);
    const ariaText = `Delete ${metricLabel.toLowerCase()} reading from ${formatSpokenDate(e.date)}, ${valueRead}${unit ? ' ' + unit : ''}`;
    return `<li class="wearable-manual-entry${noteRow ? ' has-note' : ''}" data-entry-date="${escapeHTML(e.date)}">
      <span class="wearable-manual-entry-date">${escapeHTML(shortDate(e.date))}</span>
      <span class="wearable-manual-entry-val">${valueRead}${unit ? ` <span class="wearable-manual-entry-unit">${escapeHTML(unit)}</span>` : ''}</span>
      ${tagChips}
      <button type="button" class="wearable-manual-entry-del" title="Delete this reading" aria-label="${escapeHTML(ariaText)}" onclick="deleteManualEntryFromDetail('${escapeHTML(metricId)}','${escapeHTML(e.date)}')">×</button>
      ${noteRow}
    </li>`;
  }).join('');
  return `<section class="wearable-manual-entries">
    <div class="wearable-manual-entries-head">
      <span class="wearable-manual-entries-title">Manual entries <span class="wearable-manual-entries-count">${manualEntries.length}</span></span>
      <button type="button" class="wearable-manual-add-btn" onclick="openManualAddFromDetail('${escapeHTML(metricId)}')">+ Add reading</button>
    </div>
    <div id="wearable-manual-add-slot"></div>
    <ul class="wearable-manual-entries-list">${rows}</ul>
  </section>`;
}

function buildWearableDetailHtml(canon, m, series, metricId, manualEntries = [], opts = {}) {
  const adapter = adapterById(m.primarySource);
  const sourceName = adapter?.displayName || m.primarySource;
  const unit = canon.unit || '';
  const unitSpaced = unit ? ' ' + escapeHTML(unit) : '';
  const subLabel = canon.sub ? ` <span style="opacity:0.6;font-size:0.7em;margin-left:6px;font-weight:normal">${escapeHTML(canon.sub)}</span>` : '';
  const formatV = v => formatValue(v, unit);

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
  const baseStats = [
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

  const emptyHint = opts.allZeroActivity
    ? `<div class="wearable-detail-empty">Every day shows 0 — Oura suppresses the Activity composite score while Rest Mode is on. Check the <b>Steps</b> card for raw movement data, or disable Rest Mode in the Oura app.</div>`
    : series.length === 0
      ? manualEntries.length > 0
        ? `<div class="wearable-detail-empty">No chart samples for this metric in ${escapeHTML(rangeDef.emptyWindow)}. Manual readings are listed below${m.primarySource === 'manual' && rangeDef.days != null ? '; switch to All to chart older manual readings' : ''}.</div>`
        : `<div class="wearable-detail-empty">No daily samples for this metric in ${escapeHTML(rangeDef.emptyWindow)}. Either your wearable doesn't share this metric, the feature is off on your device, or you didn't wear it. Try Sync now, or reconnect to refresh permissions.</div>`
      : '';

  const connectedSources = state.importedData?.wearableSummary?.sources || {};
  const showSwapButton = Object.keys(connectedSources).length > 1 && !!adapter;
  const swapButton = showSwapButton
    ? `<button type="button" class="wearable-source-badge wearable-source-badge-btn wearable-modal-source-swap" onclick="chooseWearableSource('${escapeHTML(metricId)}',event)" title="Switch source for this metric">via ${escapeHTML(adapter.displayName)} · swap</button>`
    : '';

  const emfSleepHint = _buildEMFSleepHint(metricId, m);
  const rangePills = WEARABLE_DETAIL_RANGES.map(r =>
    `<button type="button" class="ctx-btn-option${r.key === rangeKey ? ' active' : ''}" aria-pressed="${r.key === rangeKey}" onclick="setWearableDetailRange('${escapeHTML(metricId)}','${r.key}')">${escapeHTML(r.label)}</button>`
  ).join('');

  return `<button class="modal-close" onclick="closeModal()">&times;</button>
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
  const openHandler = `event.preventDefault();window.closeModal&&window.closeModal();setTimeout(()=>window.openEMFAssessmentEditor(),100);`;
  return `<div class="wearable-detail-emf-hint"><span aria-hidden="true">💡</span> Sleep regressing? Sometimes it's the room. <a href="#" onclick="${openHandler}" data-umami-event="emf-nudge-wearable-sleep">Check your EMF environment →</a></div>`;
}

function renderWearableChart(canvas, canon, m, series, manualSeries = []) {
  if (!window.Chart || !isChartDateAdapterReady()) {
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

  const unit = canon.unit || '';
  const formatV = v => formatValue(v, unit);
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

  state.chartInstances['modal'] = new window.Chart(canvas, {
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
          ticks: { color: tc.tickColor, font: { size: 10 } },
          grid: { color: tc.gridColor },
        },
      },
    },
  });
}

export function openManualAddFromDetail(metricId, event) {
  if (event) event.stopPropagation();
  const slot = document.getElementById('wearable-manual-add-slot');
  if (!slot) return;
  const today = isoDay();
  const isBP = metricId === 'bp_systolic' || metricId === 'bp_diastolic';
  const isRhr = metricId === 'rhr';
  const kind = isBP ? 'bp' : metricId === 'weight' ? 'weight' : isRhr ? 'rhr' : null;
  if (!kind) return;
  if (kind === 'weight') {
    const weightUnit = state.unitSystem === 'US' ? 'lb' : 'kg';
    slot.innerHTML = `<form class="wearable-manual-add-form" onsubmit="event.preventDefault();saveManualEntryFromDetail('${escapeHTML(metricId)}','weight')">
      <input type="number" step="0.1" inputmode="decimal" class="wearable-log-input" id="wlad-val" placeholder="${weightUnit}" aria-label="Weight in ${weightUnit === 'lb' ? 'pounds' : 'kilograms'}" autofocus>
      ${_renderNoteField('wlad-note')}
      <input type="date" class="wearable-log-date" id="wlad-date" value="${today}">
      <button type="submit" class="wearable-log-save">Save</button>
      <button type="button" class="wearable-log-cancel" onclick="closeManualAddFromDetail()">✕</button>
    </form>`;
  } else if (kind === 'rhr') {
    slot.innerHTML = `<form class="wearable-manual-add-form" onsubmit="event.preventDefault();saveManualEntryFromDetail('${escapeHTML(metricId)}','rhr')">
      <input type="number" inputmode="numeric" class="wearable-log-input" id="wlad-val" placeholder="bpm" autofocus>
      ${_renderTagChips('rhr')}
      ${_renderNoteField('wlad-note')}
      <input type="date" class="wearable-log-date" id="wlad-date" value="${today}">
      <button type="submit" class="wearable-log-save">Save</button>
      <button type="button" class="wearable-log-cancel" onclick="closeManualAddFromDetail()">✕</button>
    </form>`;
  } else if (kind === 'bp') {
    slot.innerHTML = `<form class="wearable-manual-add-form wearable-manual-add-form-bp" onsubmit="event.preventDefault();saveManualEntryFromDetail('${escapeHTML(metricId)}','bp')">
      <span class="wearable-log-bp-row">
        <input type="number" inputmode="numeric" class="wearable-log-input wearable-log-bp" id="wlad-sys" placeholder="sys" autofocus>
        <span class="wearable-log-sep">/</span>
        <input type="number" inputmode="numeric" class="wearable-log-input wearable-log-bp" id="wlad-dia" placeholder="dia">
      </span>
      <input type="number" inputmode="numeric" class="wearable-log-input wearable-log-pulse-optional" id="wlad-pulse" placeholder="pulse (optional)">
      ${_renderTagChips('bp_systolic')}
      ${_renderNoteField('wlad-note')}
      <input type="date" class="wearable-log-date" id="wlad-date" value="${today}">
      <button type="submit" class="wearable-log-save">Save</button>
      <button type="button" class="wearable-log-cancel" onclick="closeManualAddFromDetail()">✕</button>
    </form>`;
  }
  slot.querySelector('input[type="number"]')?.focus?.();
}

export function closeManualAddFromDetail() {
  const slot = document.getElementById('wearable-manual-add-slot');
  if (slot) slot.innerHTML = '';
}

const _manualEntryOps = new Map();

function _bumpManualEntryOp(metricId) {
  const next = (_manualEntryOps.get(metricId) || 0) + 1;
  _manualEntryOps.set(metricId, next);
  return next;
}

function _currentManualEntryOp(metricId) {
  return _manualEntryOps.get(metricId) || 0;
}

export async function saveManualEntryFromDetail(metricId, kind) {
  const op = _bumpManualEntryOp(metricId);
  const { logManualMetric, logManualBP, refreshManualSummary } = await import('./wearables-manual.js');
  const profileId = getActiveProfileId();
  const date = document.getElementById('wlad-date')?.value;
  if (!date) {
    showNotification?.('Pick a date', 'error');
    return;
  }
  const formEl = document.querySelector('.wearable-manual-add-form');
  const tags = formEl ? _collectActiveChips(formEl) : [];
  const note = document.getElementById('wlad-note')?.value || '';
  try {
    if (kind === 'weight') {
      const val = parseFloat(document.getElementById('wlad-val')?.value);
      if (!val || val <= 0) {
        showNotification?.('Enter a weight', 'error');
        return;
      }
      if (val > 500) {
        showNotification?.('Weight over 500 kg seems unlikely', 'error');
        return;
      }
      await logManualMetric(profileId, 'weight', { date, value: val, tags, note });
    } else if (kind === 'rhr') {
      const val = parseInt(document.getElementById('wlad-val')?.value, 10);
      if (!val || val <= 0) {
        showNotification?.('Enter a pulse', 'error');
        return;
      }
      if (val > 250) {
        showNotification?.('Pulse over 250 bpm seems unlikely', 'error');
        return;
      }
      await logManualMetric(profileId, 'rhr', { date, value: val, tags, note });
    } else if (kind === 'bp') {
      const sys = parseInt(document.getElementById('wlad-sys')?.value, 10);
      const dia = parseInt(document.getElementById('wlad-dia')?.value, 10);
      const pulse = parseInt(document.getElementById('wlad-pulse')?.value, 10);
      if (!sys || !dia || sys <= 0 || dia <= 0) {
        showNotification?.('Enter systolic and diastolic', 'error');
        return;
      }
      if (sys > 300 || dia > 200) {
        showNotification?.('BP values seem too high', 'error');
        return;
      }
      if (dia >= sys) {
        showNotification?.('Diastolic should be lower than systolic', 'error');
        return;
      }
      await logManualBP(profileId, { date, systolic: sys, diastolic: dia, pulse: isFinite(pulse) && pulse > 0 ? pulse : undefined, tags, note });
    }
    await refreshManualSummary(profileId);
    if (op !== _currentManualEntryOp(metricId)) return;
    showNotification?.('Saved', 'success');
    if (window.navigate) window.navigate('dashboard');
    openWearableDetail(metricId);
  } catch (e) {
    showNotification?.(`Couldn't save: ${e.message}`, 'error', 4000);
  }
}

export async function deleteManualEntryFromDetail(metricId, date) {
  const op = _bumpManualEntryOp(metricId);
  if (typeof window.showConfirmDialog !== 'function') return;
  const canon = canonicalMetric(metricId);
  const label = canon?.label || metricId;
  if (await window.showConfirmDialog(`Delete this ${label.toLowerCase()} reading from ${date}?`)) {
    try {
      const { deleteManualMetric, refreshManualSummary } = await import('./wearables-manual.js');
      const profileId = getActiveProfileId();
      if (metricId === 'bp_systolic' || metricId === 'bp_diastolic') {
        await deleteManualMetric(profileId, 'bp_systolic', date);
        await deleteManualMetric(profileId, 'bp_diastolic', date);
      } else {
        await deleteManualMetric(profileId, metricId, date);
      }
      await refreshManualSummary(profileId);
      if (op !== _currentManualEntryOp(metricId)) return;
      showNotification?.('Deleted', 'success');
      if (window.navigate) window.navigate('dashboard');
      const stillHasMetric = !!state.importedData?.wearableSummary?.metrics?.[metricId];
      if (stillHasMetric) {
        openWearableDetail(metricId);
      } else if (window.closeModal) {
        window.closeModal();
      }
    } catch (e) {
      showNotification?.(`Couldn't delete: ${e.message}`, 'error', 4000);
    }
  }
}
