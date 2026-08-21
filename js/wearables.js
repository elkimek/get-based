// @ts-check
// wearables.js — Dashboard wearable strip
// Source-agnostic: reads `wearableSummary` (the L2 shape that ships to Evolu)
// and walks CANONICAL_METRICS via the registry in wearable-adapters.js.
// Adding a new vendor means registering an adapter — this file doesn't change.
//
// L2 `wearableSummary` shape (consumed here, produced by the future sync pipeline):
//   sources:  { [adapterId]: { connectedSince, lastSyncAt, coverageDays } }
//   metrics:  { [canonicalId]: {
//                  primarySource,           // which adapter id this metric was read from
//                  latest, latestDate,      // most recent daily value (for the big number)
//                  baseline,                // 90d median
//                  baselineP25, baselineP75,
//                  rolling: { d7, d30, d90 },
//                  trend30d,                // 'declining' | 'rising' | 'improving' | 'flat'
//                  weekly: number[]         // up to 12 weekly means (oldest → newest)
//                } }

import { escapeHTML, escapeAttr } from './utils.js';
import { state } from './state.js';
import { ADAPTERS, adapterById, canonicalMetric, metricsForSources } from './wearable-adapters.js';
import { isWearableStripHidden } from './wearables-settings-panel.js';
import {
  formatWearableMetricValue,
  shortDate,
  wearableDisplayUnit,
} from './wearables-formatters.js';
import { toggleManualLogChip } from './wearables-manual-form-ui.js';
import {
  _uninstallWearableModalFocusTrap,
  closeManualAddFromDetail,
  deleteManualEntryFromDetail,
  openManualAddFromDetail,
  openWearableDetail as openWearableDetailModal,
  saveManualEntryFromDetail,
  setWearableDetailRange,
  wearableActionAttrs,
} from './wearables-detail-modal.js';
import {
  closeWearablesModal,
  configureWearablesModuleBridge,
  navigateWearables,
  openEMFAssessmentAfterWearablesModalClose,
  openWearablesSettings,
} from './wearables-runtime.js';
import {
  cancelManualLog,
  chooseWearableSource,
  moveWearableCard,
  openManualLogForm,
  resetOpenManualLogForms,
  saveManualLog,
  syncWearableNow,
  toggleWearableReorder,
  toggleWearableStrip,
} from './wearables-strip-actions.js';

export { isWearableStripHidden, setWearableStripHidden, renderWearablesSettingsSection } from './wearables-settings-panel.js';
export {
  _uninstallWearableModalFocusTrap,
  closeManualAddFromDetail,
  deleteManualEntryFromDetail,
  openManualAddFromDetail,
  saveManualEntryFromDetail,
  setWearableDetailRange,
  toggleManualLogChip,
  cancelManualLog,
  chooseWearableSource,
  moveWearableCard,
  openManualLogForm,
  saveManualLog,
  syncWearableNow,
  toggleWearableReorder,
  toggleWearableStrip,
};

let wearableDelegatesInstalled = false;

function isWearableActionScope(actionEl) {
  return !!actionEl.closest('.wearable-strip, #detail-modal, .db-biometric-overview-grid');
}

function handleWearableActionClick(event) {
  const target = event.target;
  if (!target || typeof target.closest !== 'function') return;
  const actionEl = target.closest('[data-wearable-action]');
  if (!actionEl || !isWearableActionScope(actionEl)) return;

  const action = actionEl.dataset.wearableAction || '';
  const metricId = actionEl.dataset.wearableMetric || '';
  let handled = true;

  if (action === 'open-manual-log') {
    if (actionEl.closest('.wearable-card-reorder-wrap')) return;
    openManualLogForm(metricId, event, { delegated: true });
  } else if (action === 'open-detail') {
    if (actionEl.closest('.wearable-card-reorder-wrap')) return;
    openWearableDetail(metricId);
  } else if (action === 'choose-source') {
    chooseWearableSource(metricId, event);
  } else if (action === 'open-settings-wearables') {
    openWearablesSettings();
  } else if (action === 'dismiss-stub') {
    dismissWearableStub();
  } else if (action === 'toggle-strip') {
    toggleWearableStrip();
  } else if (action === 'sync-now') {
    syncWearableNow(actionEl);
  } else if (action === 'toggle-reorder') {
    toggleWearableReorder();
  } else if (action === 'move-card') {
    moveWearableCard(metricId, Number(actionEl.dataset.wearableDelta || 0));
  } else if (action === 'manual-log-save') {
    saveManualLog(actionEl.dataset.wearableKind || '', event);
  } else if (action === 'manual-log-cancel') {
    cancelManualLog(event);
  } else if (action === 'modal-close') {
    closeWearablesModal();
  } else if (action === 'set-detail-range') {
    setWearableDetailRange(metricId, actionEl.dataset.wearableRange || '');
  } else if (action === 'open-detail-manual-add') {
    openManualAddFromDetail(metricId, event);
  } else if (action === 'delete-detail-manual-entry') {
    deleteManualEntryFromDetail(metricId, actionEl.dataset.wearableDate || '');
  } else if (action === 'close-detail-manual-add') {
    closeManualAddFromDetail();
  } else if (action === 'open-emf-assessment') {
    openEMFAssessmentAfterWearablesModalClose();
  } else {
    handled = false;
  }

  if (handled) event.preventDefault();
}

function handleWearableActionKeydown(event) {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  const target = event.target;
  if (!target || typeof target.closest !== 'function') return;
  if (target.closest('input, textarea, select, button, a')) return;
  const actionEl = target.closest('[data-wearable-action]');
  if (!actionEl || !isWearableActionScope(actionEl)) return;
  const action = actionEl.dataset.wearableAction || '';
  if (action !== 'open-manual-log' && action !== 'open-detail') return;
  event.preventDefault();
  actionEl.click();
}

function handleWearableFormSubmit(event) {
  const target = event.target;
  if (!target || typeof target.closest !== 'function') return;
  const form = target.closest('[data-wearable-form]');
  if (!form || !form.closest('#detail-modal')) return;
  if (form.dataset.wearableForm !== 'detail-manual-add') return;
  event.preventDefault();
  saveManualEntryFromDetail(form.dataset.wearableMetric || '', form.dataset.wearableKind || '');
}

function installWearableDelegates() {
  if (wearableDelegatesInstalled || typeof document === 'undefined') return;
  wearableDelegatesInstalled = true;
  document.addEventListener('click', handleWearableActionClick);
  document.addEventListener('keydown', handleWearableActionKeydown);
  document.addEventListener('submit', handleWearableFormSubmit);
}

export function openWearableDetail(metricId, opts = {}) {
  resetOpenManualLogForms();
  return openWearableDetailModal(metricId, opts);
}

// ─────────────────────────────────────────────────────────
// MOCK SUMMARY — remove once the real L2 pipeline ships
// ─────────────────────────────────────────────────────────
// Stays in CANONICAL shape so the renderer exercises the real code paths.
// Numbers tell a mild-overtraining / early-infection story so the UI reads
// as visibly non-trivial.
const MOCK_SUMMARY = {
  sources: {
    oura: {
      connectedSince: '2026-01-22',
      lastSyncAt: Date.now() - 2 * 60 * 60 * 1000,
      coverageDays: 90,
    },
  },
  metrics: {
    hrv_rmssd: {
      primarySource: 'oura',
      latest: 38, latestDate: '2026-04-22',
      baseline: 52, baselineP25: 41, baselineP75: 63,
      rolling: { d7: 38, d30: 46, d90: 52 },
      trend30d: 'declining',
      weekly: [50, 52, 51, 53, 52, 54, 51, 49, 47, 45, 42, 38],
    },
    rhr: {
      primarySource: 'oura',
      latest: 61, latestDate: '2026-04-22',
      baseline: 58, baselineP25: 55, baselineP75: 61,
      rolling: { d7: 61, d30: 59, d90: 58 },
      trend30d: 'rising',
      weekly: [58, 58, 57, 58, 59, 58, 59, 60, 60, 60, 61, 61],
    },
    sleep_score: {
      primarySource: 'oura',
      latest: 79, latestDate: '2026-04-22',
      baseline: 82, baselineP25: 76, baselineP75: 87,
      rolling: { d7: 79, d30: 81, d90: 82 },
      trend30d: 'flat',
      weekly: [85, 84, 83, 86, 85, 84, 82, 80, 79, 78, 79, 78],
    },
    readiness_score: {
      primarySource: 'oura',
      latest: 78, latestDate: '2026-04-22',
      baseline: 82, baselineP25: 77, baselineP75: 88,
      rolling: { d7: 78, d30: 81, d90: 82 },
      trend30d: 'declining',
      weekly: [82, 83, 82, 84, 83, 82, 81, 79, 78, 77, 78, 78],
    },
  },
};

// ─────────────────────────────────────────────────────────
// L2 ACCESS — single source of truth for summary lookup
// ─────────────────────────────────────────────────────────
// Priority: real L2 in importedData → mock (if demo profile + mock not disabled).
// Real data takes over as soon as the user connects any adapter.

function isMockAllowed() {
  if (localStorage.getItem('wearables-mock-off') === '1') return false;
  // Show mock only when no real connection exists — keeps the dashboard lively
  // during onboarding / demo flows without shadowing real data.
  const real = state.importedData?.wearableSummary;
  if (real && real.sources && Object.keys(real.sources).length > 0) return false;
  return true;
}

function getWearableSummary() {
  const real = state.importedData?.wearableSummary;
  if (real && real.sources && Object.keys(real.sources).length > 0) return real;
  if (isMockAllowed()) return MOCK_SUMMARY;
  return null;
}

// ─────────────────────────────────────────────────────────
// FORMATTERS
// ─────────────────────────────────────────────────────────

function formatAgo(ts) {
  if (!ts) return 'never';
  const mins = Math.max(0, Math.round((Date.now() - ts) / 60000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return `${days}d ago`;
}

// Semantic delta colour: worse-direction → red, better-direction → green, ~flat → neutral.
// Returns 'delta-flat' for zero/missing baseline so we don't paint NaN% red/green.
function deltaClassFor(latest, baseline, worseWhen) {
  if (!baseline || !isFinite(baseline)) return 'delta-flat';
  const pct = ((latest - baseline) / baseline) * 100;
  if (Math.abs(pct) < 3) return 'delta-flat';
  const isDown = pct < 0;
  const worse = (isDown && worseWhen === 'down') || (!isDown && worseWhen === 'up');
  if (worseWhen === 'either') return 'delta-flat';
  return worse ? 'delta-bad' : 'delta-good';
}

// Delta-style metrics (e.g. body_temp_delta — Oura/Whoop temperature deviation
// from the user's nightly norm) already encode a Δ; their baseline naturally
// hovers near zero, so percentages blow up (baseline=-0.05, latest=0.5 →
// "↓ 1100%"). For these we render the absolute change in unit instead.
function isDeltaStyleMetric(canon) {
  return canon?.sub === 'Δ';
}

function formatDelta(latest, baseline, metricId, canon) {
  // Zero baseline happens when the metric is 0 across the period (e.g. activity
  // score on a ring that wasn't worn) — suppress the delta entirely rather than
  // rendering "→ —" which reads as "we measured something."
  if (!baseline || !isFinite(baseline)) return '';
  // Steps fluctuates wildly intraday (132 at 9 AM vs 8000 at 9 PM); a baseline
  // delta against an in-progress count is dishonest. Hide the arrow on steps.
  if (metricId === 'steps') return '';
  // For "lower is better" metrics, a current value of 0 against a non-zero
  // baseline produces a noisy "↓ 100%" that grabs attention without insight
  // (e.g. zero stress minutes today reads alarming when it's actually good).
  // Suppress when current is 0 and baseline is non-trivial.
  if (latest === 0 && Math.abs(baseline) > 0.5) return '';
  if (latest == null || !isFinite(latest)) return '';
  if (isDeltaStyleMetric(canon)) {
    const diff = latest - baseline;
    const arrow = diff > 0.005 ? '↑' : diff < -0.005 ? '↓' : '→';
    const unit = canon?.unit ? canon.unit : '';
    return `${arrow} ${Math.abs(diff).toFixed(2)}${unit}`;
  }
  const pct = ((latest - baseline) / baseline) * 100;
  const arrow = pct > 0.5 ? '↑' : pct < -0.5 ? '↓' : '→';
  return `${arrow} ${Math.abs(pct).toFixed(0)}%`;
}

function trendLabel(t) {
  if (t === 'declining') return 'declining 30d';
  if (t === 'rising')    return 'rising 30d';
  if (t === 'improving') return 'improving 30d';
  return 'flat 30d';
}

function trendClassFor(trend, worseWhen) {
  // 'declining' and 'rising' are directional — paint them the semantic colour
  // based on which direction is worse for THIS metric.
  if (trend === 'improving') return 'wearable-trend-improving';
  if (trend === 'flat')      return 'wearable-trend-flat';
  const isBad = (trend === 'declining' && worseWhen === 'down') || (trend === 'rising' && worseWhen === 'up');
  return isBad ? 'wearable-trend-bad' : 'wearable-trend-good';
}

// ─────────────────────────────────────────────────────────
// SPARKLINE
// ─────────────────────────────────────────────────────────

function sparklineSVG(series, baseline, worseWhen) {
  if (!series || series.length === 0) return '';
  const VW = 100, VH = 30, pad = 2;
  const all = series.concat([baseline]);
  const min = Math.min(...all), max = Math.max(...all);
  const range = Math.max(max - min, 1e-6);
  const xStep = (VW - pad * 2) / Math.max(series.length - 1, 1);
  const yFor = v => VH - pad - ((v - min) / range) * (VH - pad * 2);
  const pts = series.map((v, i) => `${(pad + i * xStep).toFixed(1)},${yFor(v).toFixed(1)}`).join(' ');
  const lastX = (pad + (series.length - 1) * xStep).toFixed(1);
  const lastY = yFor(series[series.length - 1]).toFixed(1);
  const baselineY = yFor(baseline).toFixed(1);
  const last = series[series.length - 1];
  const deltaPct = (baseline && isFinite(baseline)) ? Math.abs((last - baseline) / baseline) : 0;
  let toneClass = 'spark-neutral';
  if (deltaPct >= 0.03 && worseWhen !== 'either') {
    const endsBelow = last < baseline;
    const bad = (endsBelow && worseWhen === 'down') || (!endsBelow && worseWhen === 'up');
    toneClass = bad ? 'spark-bad' : 'spark-good';
  }
  return `<svg class="wearable-sparkline ${toneClass}" viewBox="0 0 ${VW} ${VH}" preserveAspectRatio="none" aria-hidden="true">
    <line x1="0" y1="${baselineY}" x2="${VW}" y2="${baselineY}" class="spark-baseline"/>
    <polyline points="${pts}" class="spark-line"/>
    <circle cx="${lastX}" cy="${lastY}" r="2" class="spark-last"/>
  </svg>`;
}

// ─────────────────────────────────────────────────────────
// RENDER
// ─────────────────────────────────────────────────────────

// Empty-state card for manual-capable metrics that have no data yet.
// Tap / click → opens an inline entry form in-place (see _openManualLogForm).
// For bp_systolic the form prompts for both systolic + diastolic (and
// optional pulse) on one card; bp_diastolic and rhr are folded into that
// same card when BP is empty, so the user sees ONE "BP" affordance rather
// than three.
function renderEmptyManualCard(metricId, canon, opts = {}) {
  const subLabel = canon.sub ? ` <span class="wearable-metric-sub">${escapeHTML(canon.sub)}</span>` : '';
  const label = metricId === 'bp_systolic' ? 'Blood pressure' : canon.label;
  const actionAttrs = opts.interactive === false
    ? 'aria-disabled="true"'
    : `${wearableActionAttrs('open-manual-log', { metric: metricId })} role="button" tabindex="0"`;
  return `<div class="wearable-card wearable-card-empty" data-empty-metric="${escapeAttr(metricId)}" ${actionAttrs} aria-label="Log ${escapeHTML(label.toLowerCase())} manually">
    <div class="wearable-card-top">
      <span class="wearable-metric-name">${escapeHTML(label)}${metricId === 'bp_systolic' ? '' : subLabel}</span>
    </div>
    <div class="wearable-value-row wearable-value-row-empty">
      <span class="wearable-value wearable-value-dash">–</span>
    </div>
    <div class="wearable-card-bottom">
      <div class="wearable-empty-cta">+ Log</div>
    </div>
  </div>`;
}

function formatStalenessDate(date) {
  if (!date) return '';
  const d = new Date(`${date}T00:00:00`);
  if (Number.isNaN(d.getTime())) return shortDate(date);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function renderCard(metricId, canon, metric, showSourceBadge, sourceMaxDate, opts = {}) {
  const pairedMetric = opts.pairedMetric || null;
  const interactive = opts.interactive !== false;
  // Paired BP card: relabel "BP sys" → "Blood pressure", swap latest/baseline
  // for the "sys/dia" pair string. Trend/sparkline/delta stay sys-based —
  // sys is the more clinically actionable of the two and adding a dual-line
  // sparkline would crowd the card.
  const isBPCard = metricId === 'bp_systolic' && pairedMetric;
  const cardLabel = isBPCard ? 'Blood pressure' : canon.label;
  const cardSub = isBPCard ? null : canon.sub;
  const deltaCls = deltaClassFor(metric.latest, metric.baseline, canon.worseWhen);
  const deltaText = formatDelta(metric.latest, metric.baseline, metricId, canon);
  // Space-prefix the sub so screen readers hear "HRV RMSSD" not "HRVRMSSD".
  // Visual spacing is still margin-left via .wearable-metric-sub CSS.
  const subLabel = cardSub ? ` <span class="wearable-metric-sub">${escapeHTML(cardSub)}</span>` : '';
  // Units starting with "/" (e.g. "/5" for resilience level) read tighter
  // without a separator between value and unit — render "1/5", not "1 /5".
  const displayUnit = wearableDisplayUnit(metricId, canon.unit || '', state.unitSystem);
  const formatDisplayValue = value => formatWearableMetricValue(
    metricId,
    value,
    canon.unit || '',
    state.unitSystem,
  );
  const unitTight = displayUnit.startsWith('/');
  const unitLabel = displayUnit ? `<span class="wearable-unit${unitTight ? ' wearable-unit-tight' : ''}">${escapeHTML(displayUnit)}</span>` : '';
  const baselineUnit = displayUnit
    ? (unitTight ? escapeHTML(displayUnit) : ' ' + escapeHTML(displayUnit))
    : '';
  const trendCls = trendClassFor(metric.trend30d, canon.worseWhen);
  // Per-metric staleness: when this metric's latest sample is older than
  // the freshest sample on its source (typically because the underlying
  // endpoint has a processing delay — e.g. Oura's /usercollection/sleep
  // populates HRV/RHR hours after /daily_sleep is up), surface an "as of
  // {date}" hint so the value reads honestly rather than "fresh."
  const isStale = metric.latestDate && sourceMaxDate && metric.latestDate < sourceMaxDate;
  const stalenessHint = isStale
    ? `<span class="wearable-staleness" title="Latest sample for this metric is from ${escapeHTML(metric.latestDate)} — your wearable hasn't published a more recent reading yet (some metrics process slower than others).">as of ${escapeHTML(formatStalenessDate(metric.latestDate))}</span>`
    : '';
  const adapter = adapterById(metric.primarySource);
  // Source badge is interactive when >1 wearable is connected — click it to
  // open a small picker that overrides the primary source for this metric.
  // Without the override, the summary picker auto-picks by most-recent
  // non-null value, which can feel arbitrary when two sources report similar
  // freshness. The override is per-metric, persisted in importedData.
  const sourceBadge = (interactive && showSourceBadge && adapter)
    ? `<button type="button" class="wearable-source-badge wearable-source-badge-btn" ${wearableActionAttrs('choose-source', { metric: metricId })} title="Click to switch source for this metric">via ${escapeHTML(adapter.displayName)}</button>` : '';
  // Build a meaningful aria-label: value + unit + trend direction + metric
  // name so screen readers can read the card at a glance without entering it.
  const sysRead = formatDisplayValue(metric.latest);
  const diaRead = isBPCard ? formatDisplayValue(pairedMetric.latest) : null;
  const valueRead = isBPCard ? `${sysRead}/${diaRead || '—'}` : sysRead;
  const formatBaselineValue = value => metricId === 'weight'
    ? formatDisplayValue(value)
    : String(value ?? '—');
  const baselineRead = isBPCard
    ? `${formatBaselineValue(metric.baseline)}/${formatBaselineValue(pairedMetric.baseline)}`
    : formatBaselineValue(metric.baseline);
  const trendRead = trendLabel(metric.trend30d);
  // Glyph subs (🌙/☀️) don't speak well; map to words for screen readers.
  // English word subs (e.g. "SDNN") read fine as-is. Some metrics override
  // the entire spoken label via canon.ariaLabel ("BP" → "Blood pressure …").
  const subRead = canon.sub === '🌙' ? 'overnight'
               : canon.sub === '☀️' ? 'daytime'
               : canon.sub;
  const canonRead = isBPCard
    ? 'Blood pressure'
    : (canon.ariaLabel
        ? canon.ariaLabel
        : (subRead ? `${canon.label} ${subRead}` : canon.label));
  const deltaRead = deltaText
    ? `${deltaText.replace('↑', 'up').replace('↓', 'down').replace('→', 'flat at')} vs baseline, `
    : '';
  const ariaLabel = `${canonRead} ${valueRead}${displayUnit ? ' ' + displayUnit : ''}, ${deltaRead}${trendRead} — open detail`;
  const actionAttrs = interactive
    ? ` ${wearableActionAttrs('open-detail', { metric: metricId })} role="button" tabindex="0"`
    : '';
  return `<div class="wearable-card"${actionAttrs} aria-label="${escapeAttr(ariaLabel)}">
    <div class="wearable-card-top">
      <span class="wearable-metric-name">${escapeHTML(cardLabel)}${subLabel}</span>
      ${deltaText ? `<span class="wearable-delta ${deltaCls}">${deltaText}</span>` : ''}
    </div>
    <div class="wearable-value-row">
      <span class="wearable-value">${valueRead}</span>${unitLabel}
      <span class="wearable-baseline">baseline ${escapeHTML(baselineRead)}${baselineUnit}</span>
      ${stalenessHint}
    </div>
    ${sparklineSVG(metric.weekly, metric.baseline, canon.worseWhen)}
    <div class="wearable-card-bottom">
      <div class="wearable-trend-pill ${trendCls}">${trendLabel(metric.trend30d)}</div>
      ${sourceBadge}
    </div>
  </div>`;
}

// Compact "connect a wearable" stub for users who have lab data but no
// connected source. Without this the wearables feature has no persistent
// dashboard surface — users who skipped the welcome hero, never opened
// chat onboarding, and dismissed the demo cards have no way of
// discovering it post-import. Dismissible (per-profile) so it doesn't
// nag users who genuinely don't want a wearable.
function renderWearableStripStub() {
  const dismissed = localStorage.getItem(`labcharts-wearable-stub-dismissed-${state.currentProfile}`) === '1';
  if (dismissed) return '';
  return `<section class="wearable-strip wearable-strip-stub">
    <div class="wearable-strip-stub-body">
      <span class="wearable-strip-icon" aria-hidden="true">⌬</span>
      <div class="wearable-strip-stub-text">
        <strong>Connect a wearable</strong> to see HRV, sleep, recovery and body composition trends alongside your blood work.
        <span class="wearable-strip-stub-brands">Oura · Withings · Fitbit · Polar · Apple Health</span>
      </div>
      <div class="wearable-strip-stub-actions">
        <button class="wearable-strip-stub-cta" ${wearableActionAttrs('open-settings-wearables')}>Connect</button>
        <button class="wearable-strip-stub-dismiss" title="Hide this hint" aria-label="Dismiss wearable hint" ${wearableActionAttrs('dismiss-stub')}>×</button>
      </div>
    </div>
  </section>`;
}

export function dismissWearableStub() {
  localStorage.setItem(`labcharts-wearable-stub-dismissed-${state.currentProfile}`, '1');
  navigateWearables('dashboard');
}

export function renderWearableStrip() {
  installWearableDelegates();
  const wearablesHidden = isWearableStripHidden();
  let summary = getWearableSummary();
  // Wearables-off mode: drop the demo summary (no mock vendor cards) so
  // we only render real data the user actually logged.
  if (wearablesHidden && summary === MOCK_SUMMARY) summary = null;
  if (!summary) {
    // No real summary AND mock is suppressed (or off). Surface the stub
    // so users who skipped the welcome flow still discover the feature —
    // unless wearables are explicitly off, in which case the user has
    // opted out of vendor integrations entirely.
    if (wearablesHidden) return '';
    return renderWearableStripStub();
  }
  // Sort by ADAPTERS registry order (Oura first, Apple Health last) instead
  // of summary.sources insertion order — that way the strip header reads
  // "Oura + Fitbit + Apple Health" regardless of which one the user
  // connected first.
  const adapterOrderIndex = (sid) => {
    const idx = ADAPTERS.findIndex(a => a.id === sid);
    return idx === -1 ? 999 : idx;
  };
  let sourceIds = Object.keys(summary.sources || {})
    .sort((a, b) => adapterOrderIndex(a) - adapterOrderIndex(b));
  // Wearables-off mode: keep only the manual pseudo-source. Manual weight,
  // BP, and pulse cards still render — wearable vendor cards (Oura, etc.)
  // drop out.
  if (wearablesHidden) sourceIds = sourceIds.filter(s => s === 'manual');
  // In wearables-off mode, fall through to the render path even if the user
  // has no 'manual' source yet — the MANUAL_EMPTY_METRICS placeholders below
  // give them a way to discover hand-logging weight / BP / RHR. Synthesize
  // a virtual 'manual' source id; the chrome that uses summary.sources[s]
  // (last-synced label, sync button, demo pill) is hidden in manualOnly mode
  // anyway, and null-safe access protects what's left.
  if (wearablesHidden && sourceIds.length === 0) sourceIds = ['manual'];
  if (sourceIds.length === 0) return renderWearableStripStub();
  if (!summary.metrics || Object.keys(summary.metrics).length === 0) {
    if (!wearablesHidden) return renderWearableStripStub();
    // else: wearables-off + no metrics — keep going so MANUAL_EMPTY_METRICS render.
  }

  const collapsed = localStorage.getItem('wearables-strip-collapsed') === '1';
  // Connected vendors that haven't returned any rows yet (e.g. Polar account
  // with no recent device sync) shouldn't headline the strip — they make
  // "Wearables: Oura + Polar · 15d" read like Polar contributed half the data.
  // Surface them in the footer instead.
  const sourcesWithData = sourceIds.filter(s => (summary.sources?.[s]?.coverageDays || 0) > 0);
  // 'manual' is user-authored data — it's not a device that can be "waiting
  // on a device sync", so exclude it from the waiting footer note even when
  // coverageDays is zero (e.g. user touched the manual adapter without
  // saving anything yet).
  const sourcesWaiting  = sourceIds.filter(s => s !== 'manual' && (summary.sources?.[s]?.coverageDays || 0) === 0);
  const headerSourceIds = sourcesWithData.length ? sourcesWithData : sourceIds;
  const baseMetricOrder = metricsForSources(headerSourceIds);
  const showSourceBadges = headerSourceIds.length > 1;

  // Merge populated + empty manual cards into one ordered list so the user
  // can reorder across all of them, not just per-category. Empty cards for
  // weight/bp_systolic/rhr fill in wherever they're not already present.
  const MANUAL_EMPTY_METRICS = ['weight', 'bp_systolic', 'rhr'];
  // Daytime companions live in the detail modal as sub-stats, not as their
  // own cards — keeps the strip calm at 6-8 cards instead of 10.
  const STRIP_HIDDEN_METRICS = new Set(['hrv_day', 'hr_day']);
  // BP renders as one paired card (sys/dia). When systolic is present we
  // suppress diastolic's standalone card and fold it into sys's render. If
  // somehow only dia exists (no sys), let dia surface on its own so the data
  // isn't invisible.
  const hasSys = !!summary.metrics?.bp_systolic;
  const displayOrder = [];
  const seenDisplay = new Set();
  for (const id of baseMetricOrder) {
    if (STRIP_HIDDEN_METRICS.has(id)) continue;
    if (id === 'bp_diastolic' && hasSys) continue;
    const m = summary.metrics?.[id];
    if (!m) continue;
    // Wearables-off mode: only manual-sourced cards survive. Vendor metrics
    // (HRV, sleep score, etc.) hide; the stored data stays untouched so
    // flipping the toggle back on restores them instantly.
    if (wearablesHidden && m.primarySource !== 'manual') continue;
    displayOrder.push({ id, empty: false });
    seenDisplay.add(id);
  }
  for (const id of MANUAL_EMPTY_METRICS) {
    if (!seenDisplay.has(id) && canonicalMetric(id)) {
      displayOrder.push({ id, empty: true }); seenDisplay.add(id);
    }
  }
  // Apply the user's saved card order: items present in the saved order
  // render first (in that order), anything new appends at the end. New
  // metrics added in a future version auto-surface without a migration.
  const savedOrder = Array.isArray(state.importedData?.wearableCardOrder)
    ? state.importedData.wearableCardOrder : null;
  const finalOrder = savedOrder && savedOrder.length
    ? (() => {
        const byId = new Map(displayOrder.map(d => [d.id, d]));
        const out = [];
        for (const id of savedOrder) {
          const item = byId.get(id);
          if (item) { out.push(item); byId.delete(id); }
        }
        for (const d of displayOrder) if (byId.has(d.id)) out.push(d);
        return out;
      })()
    : displayOrder;

  const reorderMode = !!state._wearableReorderMode;

  // Per-source freshest latestDate across all metrics — lets the per-card
  // renderer flag metrics whose latest sample is older than the source's
  // own freshest reading (e.g. HRV from Oura's /sleep lags daily_sleep by
  // hours-to-days while the night's session finishes processing).
  const sourceMaxDate = {};
  for (const m of Object.values(summary.metrics || {})) {
    const src = m?.primarySource;
    const d = m?.latestDate;
    if (!src || !d) continue;
    if (!sourceMaxDate[src] || d > sourceMaxDate[src]) sourceMaxDate[src] = d;
  }

  // Header meta: most recent sync across connected sources + a short coverage label.
  const lastSyncAt = Math.max(0, ...sourceIds.map(s => summary.sources?.[s]?.lastSyncAt || 0));
  const coverageDays = Math.max(0, ...headerSourceIds.map(s => summary.sources?.[s]?.coverageDays || 0));
  const sourceLabel = headerSourceIds.map(id => adapterById(id)?.displayName || id).join(' + ');
  const coverageLabel = coverageDays > 0 ? ` · ${coverageDays}d` : '';
  const waitingLabel = sourcesWaiting
    .map(id => adapterById(id)?.displayName || id)
    .join(', ');

  const isMock = localStorage.getItem('wearables-mock-off') !== '1' &&
    /* mock flag: summary === MOCK_SUMMARY — avoid import cycle by comparing a sentinel */
    summary === MOCK_SUMMARY;
  // Demo profiles loaded via loadDemoData (Demo Alex / Demo Sarah) carry
  // a `demo` tag. Sarah's data lands in real summary slots because it
  // loads from data/demo-female.json — without this branch she'd render
  // identical to a real wearables strip, hiding the "this is a sample"
  // signal that Alex (whose summary === MOCK_SUMMARY) gets for free.
  const isDemoProfile = (() => {
    try {
      const profilesRaw = localStorage.getItem('labcharts-profiles');
      if (!profilesRaw) return false;
      const profiles = JSON.parse(profilesRaw);
      const active = profiles.find(p => p.id === state.currentProfile);
      return Array.isArray(active?.tags) && active.tags.includes('demo');
    } catch (_) { return false; }
  })();
  const showDemoPill = isMock || isDemoProfile;

  // Originally a footer caveat listed SDNN / pNN50 / HF/LF as "deep HRV"
  // metrics that need a chest strap. Real users found that confusing —
  // they don't know what those acronyms mean and the note made the strip
  // feel like it was apologising for itself. Removed in v1.28.2; the
  // detail-modal HRV stats and AI context label HRV as "overnight" /
  // "daytime" without jargon, which is clearer.
  const hrvNote = '';
  const waitingNote = waitingLabel
    ? `${waitingLabel} connected — waiting on first device sync.`
    : '';

  // When wearables are off the strip is purely manual entries — drop the
  // "Wearables: Oura · 15d" header, the sync button (nothing remote to
  // sync), and the demo pill / waiting note.
  const manualOnly = wearablesHidden;
  const titleHTML = manualOnly
    ? '<span>Biometrics</span>'
    : `<span>Wearables: <span class="wearable-source-label">${escapeHTML(sourceLabel)}${coverageLabel}</span></span>`;
  const hasStaleSource = !manualOnly && sourceIds.some(s => s !== 'manual' && Date.now() - (summary.sources?.[s]?.lastSyncAt || 0) >= 12 * 60 * 60 * 1000);
  const lastSyncHTML = manualOnly ? '' : `<span class="wearable-strip-lastsync">last synced ${formatAgo(lastSyncAt)}</span>`;
  const syncBtnHTML = manualOnly || !hasStaleSource ? '' : `<button type="button" class="wearable-strip-sync" aria-label="Sync stale wearables now" ${wearableActionAttrs('sync-now')}>
    <svg class="wearable-strip-sync-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 1 1-3-6.7"/><polyline points="21 4 21 12 13 12"/></svg>
    <span>Sync stale data</span>
  </button>`;
  const ariaLabel = manualOnly
    ? (collapsed ? 'Expand biometrics strip' : 'Collapse biometrics strip')
    : (collapsed ? 'Expand wearables strip' : 'Collapse wearables strip');

  // axe nested-interactive: parent is mouse-clickable but keyboard toggle
  // lives on the chevron button below. Nested buttons carry their own
  // delegated actions, so the document handler only runs the closest action.
  let html = `<section class="wearable-strip" id="wearable-strip">
    <div class="wearable-strip-header" ${wearableActionAttrs('toggle-strip')} style="cursor:pointer">
      <div class="wearable-strip-title">
        <span class="wearable-strip-icon" aria-hidden="true">⌬</span>
        ${titleHTML}
        ${!manualOnly && showDemoPill ? `<button type="button" class="wearable-strip-demo-pill" ${wearableActionAttrs('open-settings-wearables')} title="This is a sample. Connect your own wearable to see real data here.">demo data — connect yours</button>` : ''}
        ${reorderMode ? '<span class="wearable-strip-reorder-pill">⇄ Reorder mode — use ◀ ▶ on each card</span>' : ''}
      </div>
      <div class="wearable-strip-meta">
        ${lastSyncHTML}
        ${syncBtnHTML}
        <button type="button" class="wearable-strip-reorder${reorderMode ? ' active' : ''}" aria-label="${reorderMode ? 'Done reordering' : 'Reorder cards'}" title="${reorderMode ? 'Done reordering' : 'Reorder cards'}" ${wearableActionAttrs('toggle-reorder')}>
          ${reorderMode ? 'Done' : '⇄ Reorder'}
        </button>
        <button type="button" class="wearable-collapse-arrow${collapsed ? ' collapsed' : ''}" aria-expanded="${!collapsed}" aria-label="${ariaLabel}" ${wearableActionAttrs('toggle-strip')}>▾</button>
      </div>
    </div>
    <div class="wearable-card-grid${collapsed ? ' hidden' : ''}${reorderMode ? ' wearable-card-grid-reorder' : ''}">`;

  // Unified render loop — both populated and empty cards flow in the
  // user-defined order (finalOrder). In reorder mode each card gains ◀ ▶
  // arrow handles and detail-modal clicks are suppressed.

  for (let i = 0; i < finalOrder.length; i++) {
    const { id: metricId, empty } = finalOrder[i];
    const canon = canonicalMetric(metricId);
    if (!canon) continue;
    let cardHtml;
    if (empty) {
      cardHtml = renderEmptyManualCard(metricId, canon, { interactive: !reorderMode });
    } else {
      const metric = summary.metrics[metricId];
      if (!metric) continue;
      // Source badge appears on every populated card whenever ≥2 wearables
      // are connected — users need to see at-a-glance which source backs each
      // metric, not just the strip header. The badge stays clickable so they
      // can swap source per metric (auto-picker fallback when only one source
      // declares it). Single-source connections still hide the badge to avoid
      // redundancy with the header.
      // BP card: pull the dia partner so renderCard can format "120/80".
      const pairedMetric = (metricId === 'bp_systolic') ? summary.metrics?.bp_diastolic : null;
      cardHtml = renderCard(metricId, canon, metric, showSourceBadges, sourceMaxDate[metric.primarySource], { pairedMetric, interactive: !reorderMode });
    }
    if (reorderMode) {
      const canLeft = i > 0;
      const canRight = i < finalOrder.length - 1;
      cardHtml = `<div class="wearable-card-reorder-wrap" data-reorder-metric="${escapeHTML(metricId)}">
        ${cardHtml}
        <div class="wearable-reorder-arrows">
          <button type="button" class="wearable-reorder-arrow" aria-label="Move ${escapeHTML(canon.label)} left" ${canLeft ? '' : 'disabled'} ${wearableActionAttrs('move-card', { metric: metricId, delta: -1 })}>◀</button>
          <button type="button" class="wearable-reorder-arrow" aria-label="Move ${escapeHTML(canon.label)} right" ${canRight ? '' : 'disabled'} ${wearableActionAttrs('move-card', { metric: metricId, delta: 1 })}>▶</button>
        </div>
      </div>`;
    }
    html += cardHtml;
  }

  html += `</div>`;
  if (waitingNote || hrvNote) {
    html += `<div class="wearable-strip-footer${collapsed ? ' hidden' : ''}">`;
    if (waitingNote) html += `<span class="wearable-strip-footer-note">${escapeHTML(waitingNote)}</span>`;
    if (hrvNote)     html += `<span class="wearable-strip-footer-note">${escapeHTML(hrvNote)}</span>`;
    html += `</div>`;
  }
  html += `</section>`;
  return html;
}
installWearableDelegates();

configureWearablesModuleBridge({
  openWearableDetail,
  syncWearableNow,
  openManualLogForm,
  _uninstallWearableModalFocusTrap,
});
