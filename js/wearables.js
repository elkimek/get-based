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

import { escapeHTML, showNotification } from './utils.js';
import { state } from './state.js';
import { ADAPTERS, adapterById, canonicalMetric, metricsForSources, isMetricValueMeaningful, isoDay } from './wearable-adapters.js';
import { syncNow, listConnectedSources } from './wearables-connect.js';
import { syncWearableSummary } from './wearables-summary.js';
import { isWearableStripHidden, setWearableStripHidden } from './wearables-settings-panel.js';
import { getActiveProfileId } from './profile.js';
import { formatValue, shortDate } from './wearables-formatters.js';
import {
  _collectActiveChips,
  _renderNoteField,
  _renderTagChips,
  toggleManualLogChip,
} from './wearables-manual-form-ui.js';
import {
  _uninstallWearableModalFocusTrap,
  closeManualAddFromDetail,
  deleteManualEntryFromDetail,
  openManualAddFromDetail,
  openWearableDetail,
  saveManualEntryFromDetail,
  setWearableDetailRange,
} from './wearables-detail-modal.js';

export { isWearableStripHidden, setWearableStripHidden, renderWearablesSettingsSection } from './wearables-settings-panel.js';

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
  // Zero baseline happens when the metric is 0 across the window (e.g. activity
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
function renderEmptyManualCard(metricId, canon) {
  const subLabel = canon.sub ? ` <span class="wearable-metric-sub">${escapeHTML(canon.sub)}</span>` : '';
  const label = metricId === 'bp_systolic' ? 'Blood pressure' : canon.label;
  return `<div class="wearable-card wearable-card-empty" data-empty-metric="${escapeHTML(metricId)}" onclick="openManualLogForm('${escapeHTML(metricId)}',event)" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();openManualLogForm('${escapeHTML(metricId)}',event)}" role="button" tabindex="0" aria-label="Log ${escapeHTML(label.toLowerCase())} manually">
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

function renderCard(metricId, canon, metric, showSourceBadge, sourceMaxDate, opts = {}) {
  const pairedMetric = opts.pairedMetric || null;
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
  const unitTight = canon.unit?.startsWith('/');
  const unitLabel = canon.unit ? `<span class="wearable-unit${unitTight ? ' wearable-unit-tight' : ''}">${escapeHTML(canon.unit)}</span>` : '';
  const baselineUnit = canon.unit
    ? (unitTight ? escapeHTML(canon.unit) : ' ' + escapeHTML(canon.unit))
    : '';
  const trendCls = trendClassFor(metric.trend30d, canon.worseWhen);
  // Per-metric staleness: when this metric's latest sample is older than
  // the freshest sample on its source (typically because the underlying
  // endpoint has a processing delay — e.g. Oura's /usercollection/sleep
  // populates HRV/RHR hours after /daily_sleep is up), surface an "as of
  // {date}" hint so the value reads honestly rather than "fresh."
  const isStale = metric.latestDate && sourceMaxDate && metric.latestDate < sourceMaxDate;
  const stalenessHint = isStale
    ? `<span class="wearable-staleness" title="Latest sample for this metric is from ${escapeHTML(metric.latestDate)} — your wearable hasn't published a more recent reading yet (some metrics process slower than others).">as of ${escapeHTML(shortDate(metric.latestDate))}</span>`
    : '';
  const adapter = adapterById(metric.primarySource);
  // Source badge is interactive when >1 wearable is connected — click it to
  // open a small picker that overrides the primary source for this metric.
  // Without the override, the summary picker auto-picks by most-recent
  // non-null value, which can feel arbitrary when two sources report similar
  // freshness. The override is per-metric, persisted in importedData.
  const sourceBadge = (showSourceBadge && adapter)
    ? `<button type="button" class="wearable-source-badge wearable-source-badge-btn" onclick="event.stopPropagation();chooseWearableSource('${escapeHTML(metricId)}',event)" title="Click to switch source for this metric">via ${escapeHTML(adapter.displayName)}</button>` : '';
  // Build a meaningful aria-label: value + unit + trend direction + metric
  // name so screen readers can read the card at a glance without entering it.
  const sysRead = formatValue(metric.latest, canon.unit);
  const diaRead = isBPCard ? formatValue(pairedMetric.latest, canon.unit) : null;
  const valueRead = isBPCard ? `${sysRead}/${diaRead || '—'}` : sysRead;
  const baselineRead = isBPCard
    ? `${metric.baseline ?? '—'}/${pairedMetric.baseline ?? '—'}`
    : String(metric.baseline);
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
  const ariaLabel = `${canonRead} ${valueRead}${canon.unit ? ' ' + canon.unit : ''}, ${deltaRead}${trendRead} — open detail`;
  return `<div class="wearable-card" onclick="openWearableDetail('${escapeHTML(metricId)}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();openWearableDetail('${escapeHTML(metricId)}')}" role="button" tabindex="0" aria-label="${escapeHTML(ariaLabel)}">
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
        <button class="wearable-strip-stub-cta" onclick="window.openSettingsModal('wearables')">Connect</button>
        <button class="wearable-strip-stub-dismiss" title="Hide this hint" aria-label="Dismiss wearable hint" onclick="dismissWearableStub()">×</button>
      </div>
    </div>
  </section>`;
}

function dismissWearableStub() {
  localStorage.setItem(`labcharts-wearable-stub-dismissed-${state.currentProfile}`, '1');
  if (window.navigate) window.navigate('dashboard');
}

export function renderWearableStrip() {
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
        for (const id of savedOrder) { if (byId.has(id)) { out.push(byId.get(id)); byId.delete(id); } }
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
  const syncBtnHTML = manualOnly || !hasStaleSource ? '' : `<button type="button" class="wearable-strip-sync" aria-label="Sync stale wearables now" onclick="event.stopPropagation();syncWearableNow(this);return false">
    <svg class="wearable-strip-sync-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 1 1-3-6.7"/><polyline points="21 4 21 12 13 12"/></svg>
    <span>Sync stale data</span>
  </button>`;
  const ariaLabel = manualOnly
    ? (collapsed ? 'Expand biometrics strip' : 'Collapse biometrics strip')
    : (collapsed ? 'Expand wearables strip' : 'Collapse wearables strip');

  // axe nested-interactive: parent is mouse-clickable but keyboard
  // toggle lives on the chevron button below. The other action buttons
  // (sync, reorder, demo-pill) keep stopPropagation so they don't trip
  // the row-click collapse handler.
  let html = `<section class="wearable-strip" id="wearable-strip">
    <div class="wearable-strip-header" onclick="toggleWearableStrip()" style="cursor:pointer">
      <div class="wearable-strip-title">
        <span class="wearable-strip-icon" aria-hidden="true">⌬</span>
        ${titleHTML}
        ${!manualOnly && showDemoPill ? '<button type="button" class="wearable-strip-demo-pill" onclick="event.stopPropagation();window.openSettingsModal(\'wearables\')" title="This is a sample. Connect your own wearable to see real data here.">demo data — connect yours</button>' : ''}
        ${reorderMode ? '<span class="wearable-strip-reorder-pill">⇄ Reorder mode — use ◀ ▶ on each card</span>' : ''}
      </div>
      <div class="wearable-strip-meta">
        ${lastSyncHTML}
        ${syncBtnHTML}
        <button type="button" class="wearable-strip-reorder${reorderMode ? ' active' : ''}" aria-label="${reorderMode ? 'Done reordering' : 'Reorder cards'}" title="${reorderMode ? 'Done reordering' : 'Reorder cards'}" onclick="event.stopPropagation();toggleWearableReorder()">
          ${reorderMode ? 'Done' : '⇄ Reorder'}
        </button>
        <button type="button" class="wearable-collapse-arrow${collapsed ? ' collapsed' : ''}" aria-expanded="${!collapsed}" aria-label="${ariaLabel}" onclick="event.stopPropagation();toggleWearableStrip()">▾</button>
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
      cardHtml = renderEmptyManualCard(metricId, canon);
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
      cardHtml = renderCard(metricId, canon, metric, showSourceBadges, sourceMaxDate[metric.primarySource], { pairedMetric });
    }
    if (reorderMode) {
      const canLeft = i > 0;
      const canRight = i < finalOrder.length - 1;
      cardHtml = `<div class="wearable-card-reorder-wrap" data-reorder-metric="${escapeHTML(metricId)}">
        ${cardHtml.replace(/ onclick="[^"]*"/, '').replace(/ onkeydown="[^"]*"/, '').replace(/ tabindex="0"/, '')}
        <div class="wearable-reorder-arrows">
          <button type="button" class="wearable-reorder-arrow" aria-label="Move ${escapeHTML(canon.label)} left" ${canLeft ? '' : 'disabled'} onclick="event.stopPropagation();moveWearableCard('${escapeHTML(metricId)}',-1)">◀</button>
          <button type="button" class="wearable-reorder-arrow" aria-label="Move ${escapeHTML(canon.label)} right" ${canRight ? '' : 'disabled'} onclick="event.stopPropagation();moveWearableCard('${escapeHTML(metricId)}',1)">▶</button>
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

// ─────────────────────────────────────────────────────────
// INTERACTIONS
// ─────────────────────────────────────────────────────────

function toggleWearableStrip() {
  const grid = document.querySelector('.wearable-card-grid');
  const footer = document.querySelector('.wearable-strip-footer');
  const arrow = document.querySelector('.wearable-collapse-arrow');
  if (!grid) return;
  const hidden = grid.classList.toggle('hidden');
  footer?.classList.toggle('hidden', hidden);
  arrow?.classList.toggle('collapsed', hidden);
  // Keep aria-expanded + aria-label on the chevron button in sync with the
  // visual collapse state. Captured-at-render-time attributes go stale on
  // every toggle without this — silent screen-reader regression.
  if (arrow) {
    arrow.setAttribute('aria-expanded', String(!hidden));
    const expanded = !hidden;
    const labelBase = arrow.getAttribute('aria-label') || '';
    // Toggle "Expand"/"Collapse" prefix in-place; preserves the rest of the
    // label that the renderer composed (e.g. "wearables strip").
    if (expanded && /^Expand /i.test(labelBase)) {
      arrow.setAttribute('aria-label', labelBase.replace(/^Expand /i, 'Collapse '));
    } else if (!expanded && /^Collapse /i.test(labelBase)) {
      arrow.setAttribute('aria-label', labelBase.replace(/^Collapse /i, 'Expand '));
    }
  }
  localStorage.setItem('wearables-strip-collapsed', hidden ? '1' : '0');
}

// Per-metric primary-source override picker. Reads connected sources that
// actually have data for this metric and lets the user pick one. The summary
// pipeline respects `state.importedData.wearablePrimaryOverride[metricId]`.
async function chooseWearableSource(metricId, event) {
  const canon = canonicalMetric(metricId);
  if (!canon) return;
  const connected = listConnectedSources();
  // Sort connected vendors by ADAPTERS registry order so the picker presents
  // them in the same order users see in Settings → Integrations.
  const connectedIds = Object.keys(connected)
    .sort((a, b) => {
      const ai = ADAPTERS.findIndex(x => x.id === a);
      const bi = ADAPTERS.findIndex(x => x.id === b);
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    });
  if (connectedIds.length < 2) return;

  // Find sources that map this canonical metric in their adapter registry —
  // no point offering WHOOP as a source for `weight` (it doesn't do scales).
  const eligible = connectedIds.filter(sid => {
    const a = adapterById(sid);
    return !!a?.metrics?.[metricId];
  });
  if (eligible.length < 2) {
    showNotification?.(`Only one connected wearable provides ${canon.label}`, 'info', 2500);
    return;
  }

  // Close any existing picker, then build + position a new one near the click.
  document.querySelectorAll('.wearable-source-picker').forEach(el => el.remove());
  // Pick the EFFECTIVE primary first — `wearableSummary.metrics[mid].primarySource`
  // is what the L2 picker actually used, which falls through to auto-pick when
  // an override points at a source with no data. Reading the override directly
  // would mark a stale checkmark and lie to the user about what's active.
  const effectivePrimary = state.importedData?.wearableSummary?.metrics?.[metricId]?.primarySource;
  const overrideSource = state.importedData?.wearablePrimaryOverride?.[metricId];
  const current = effectivePrimary || overrideSource || eligible[0];
  const picker = document.createElement('div');
  picker.className = 'wearable-source-picker';
  picker.innerHTML = `
    <div class="wearable-source-picker-head">${escapeHTML(canon.label)} source</div>
    ${eligible.map(sid => {
      const a = adapterById(sid);
      const selected = sid === current;
      return `<button type="button" class="wearable-source-picker-item${selected ? ' selected' : ''}" data-source="${escapeHTML(sid)}">
        <span>${escapeHTML(a?.displayName || sid)}</span>
        ${selected ? '<span class="wearable-source-picker-check">✓</span>' : ''}
      </button>`;
    }).join('')}
    <button type="button" class="wearable-source-picker-item wearable-source-picker-auto" data-source="">
      <span>Auto (most recent)</span>
      ${!state.importedData?.wearablePrimaryOverride?.[metricId] ? '<span class="wearable-source-picker-check">✓</span>' : ''}
    </button>
  `;
  const rect = event.target.getBoundingClientRect();
  picker.style.position = 'fixed';
  picker.style.visibility = 'hidden';
  picker.style.top = '0px';
  picker.style.left = '0px';
  picker.style.zIndex = '10000';
  document.body.appendChild(picker);
  // Clamp to viewport and flip above if opening below would collide with the
  // chat FAB hotspot (bottom-right ~72px square) or overflow the viewport. On
  // mobile the card is full-width, so a naive rect.left-60 can underflow and
  // the dropdown can disappear under the FAB — measure after insert and nudge.
  const pw = picker.offsetWidth || 200;
  const ph = picker.offsetHeight || 180;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const fabHotspot = { left: vw - 88, top: vh - 88 }; // chat-fab 56px + 24px margin + buffer
  let top = rect.bottom + 4;
  let left = Math.max(8, rect.left - 60);
  // Flip above if bottom would overflow viewport OR intrude on FAB hotspot
  if (top + ph > vh - 8 || (top + ph > fabHotspot.top && left + pw > fabHotspot.left)) {
    top = Math.max(8, rect.top - ph - 4);
  }
  // Clamp right
  if (left + pw > vw - 8) left = Math.max(8, vw - pw - 8);
  picker.style.top = `${top}px`;
  picker.style.left = `${left}px`;
  picker.style.visibility = '';

  // Wire clicks — pick a source, persist override, re-render strip.
  picker.querySelectorAll('[data-source]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const sid = btn.dataset.source;
      if (!state.importedData.wearablePrimaryOverride) state.importedData.wearablePrimaryOverride = {};
      if (!sid) delete state.importedData.wearablePrimaryOverride[metricId];
      else state.importedData.wearablePrimaryOverride[metricId] = sid;
      const { saveImportedData } = await import('./data.js');
      await saveImportedData();
      await syncWearableSummary(getActiveProfileId(), listConnectedSources());
      picker.remove();
      if (window.navigate) window.navigate('dashboard');
    });
  });

  // Dismiss on outside click / Escape.
  setTimeout(() => {
    const dismiss = (e) => {
      if (picker.contains(e.target)) return;
      picker.remove();
      document.removeEventListener('click', dismiss);
      document.removeEventListener('keydown', onKey);
    };
    const onKey = (e) => { if (e.key === 'Escape') { picker.remove(); document.removeEventListener('keydown', onKey); document.removeEventListener('click', dismiss); } };
    document.addEventListener('click', dismiss);
    document.addEventListener('keydown', onKey);
  }, 0);
}

async function syncWearableNow(triggerEl) {
  const sources = Object.keys(listConnectedSources());
  if (sources.length === 0) {
    showNotification?.('Connect a wearable in Settings → Wearables first', 'info');
    return;
  }
  // Spin the inline button icon for the duration of the sync. The button
  // disables itself so a double-click can't kick off concurrent syncs.
  const btn = triggerEl || document.querySelector('.wearable-strip-sync');
  btn?.classList.add('is-syncing');
  if (btn) btn.disabled = true;
  try {
    showNotification?.('Syncing wearables…', 'info', 1500);
    // force:true → bypass L2 gate so the strip never appears stuck on a
    // stale snapshot when a user explicitly clicks "sync now."
    let totalRows = 0;
    for (const sid of sources) {
      const res = await syncNow(sid, { force: true });
      totalRows += res?.rows ?? 0;
    }
    if (window.navigate) window.navigate('dashboard');
    showNotification?.(
      totalRows > 0 ? `Wearables synced — ${totalRows} new row${totalRows === 1 ? '' : 's'}` : 'Wearables synced — already up to date',
      'success', 2000
    );
  } catch { /* per-source error already surfaced */ }
  finally {
    btn?.classList.remove('is-syncing');
    if (btn) btn.disabled = false;
  }
}

// Reorder mode — toggle + per-card move handlers. Keeps the reorder flag
// ephemeral (state._wearableReorderMode) so it auto-resets on reload; the
// card ORDER itself is persisted per-profile in importedData.wearableCardOrder.
function toggleWearableReorder() {
  state._wearableReorderMode = !state._wearableReorderMode;
  if (window.navigate) window.navigate('dashboard');
}

async function moveWearableCard(metricId, delta) {
  const summary = state.importedData?.wearableSummary;
  if (!summary) return;
  // Rebuild the CURRENT display order the same way renderWearableStrip does,
  // so a move reflects exactly what the user sees (populated + empty cards
  // combined, then the saved order applied).
  const sourceIds = Object.keys(summary.sources || {})
    .sort((a, b) => {
      const ai = ADAPTERS.findIndex(x => x.id === a);
      const bi = ADAPTERS.findIndex(x => x.id === b);
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    });
  const headerSourceIds = sourceIds.filter(s => (summary.sources[s].coverageDays || 0) > 0);
  const baseOrder = metricsForSources(headerSourceIds.length ? headerSourceIds : sourceIds);
  const MANUAL_EMPTY_METRICS_LOCAL = ['weight', 'bp_systolic', 'rhr'];
  // Mirror the strip-render BP merge: dia folds into the sys card and never
  // gets its own reorder slot when both are present.
  const hasSysLocal = !!summary.metrics?.bp_systolic;
  const display = [];
  const seen = new Set();
  for (const id of baseOrder) {
    if (id === 'bp_diastolic' && hasSysLocal) continue;
    if (summary.metrics?.[id]) { display.push(id); seen.add(id); }
  }
  for (const id of MANUAL_EMPTY_METRICS_LOCAL) {
    if (!seen.has(id)) { display.push(id); seen.add(id); }
  }
  const savedOrder = Array.isArray(state.importedData?.wearableCardOrder)
    ? state.importedData.wearableCardOrder : [];
  const ordered = [];
  for (const id of savedOrder) if (display.includes(id)) ordered.push(id);
  for (const id of display) if (!ordered.includes(id)) ordered.push(id);
  const idx = ordered.indexOf(metricId);
  if (idx === -1) return;
  const target = idx + delta;
  if (target < 0 || target >= ordered.length) return;
  const tmp = ordered[idx];
  ordered[idx] = ordered[target];
  ordered[target] = tmp;
  state.importedData.wearableCardOrder = ordered;
  const { saveImportedData } = await import('./data.js');
  await saveImportedData();
  if (window.navigate) window.navigate('dashboard');
}

// ─────────────────────────────────────────────────────────
// Inline manual-log form (Phase 3) — opens from the empty strip cards.
// ─────────────────────────────────────────────────────────


function openManualLogForm(metricId, event) {
  if (event) event.stopPropagation();
  const card = document.querySelector(`.wearable-card-empty[data-empty-metric="${metricId}"]`);
  if (!card) return;
  // Idempotent: clicks inside the form (e.g. tapping the dia field on the
  // BP card) bubble to the card's onclick. Without this guard we'd rebuild
  // innerHTML and refocus the first input — yanking the cursor off whatever
  // the user actually clicked.
  if (card.querySelector('.wearable-log-form')) return;
  const today = isoDay();
  if (metricId === 'weight') {
    card.innerHTML = `
      <div class="wearable-card-top"><span class="wearable-metric-name">Weight</span></div>
      <div class="wearable-log-form">
        <input type="number" step="0.1" inputmode="decimal" class="wearable-log-input" id="wl-weight-val" placeholder="${state.unitSystem === 'US' ? 'lb' : 'kg'}" aria-label="${state.unitSystem === 'US' ? 'Weight in pounds' : 'Weight in kilograms'}" autofocus>
        ${_renderNoteField('wl-weight-note')}
        <div class="wearable-log-row">
          <input type="date" class="wearable-log-date" id="wl-weight-date" value="${today}" max="${today}" aria-label="Date">
          <button type="button" class="wearable-log-save" onclick="saveManualLog('weight',event)">Save</button>
          <button type="button" class="wearable-log-cancel" onclick="cancelManualLog(event)" aria-label="Cancel">✕</button>
        </div>
      </div>`;
  } else if (metricId === 'bp_systolic') {
    card.innerHTML = `
      <div class="wearable-card-top"><span class="wearable-metric-name">Blood pressure</span></div>
      <div class="wearable-log-form">
        <div class="wearable-log-bp-row">
          <input type="number" inputmode="numeric" class="wearable-log-input wearable-log-bp" id="wl-bp-sys" placeholder="sys" aria-label="Systolic" autofocus>
          <span class="wearable-log-sep">/</span>
          <input type="number" inputmode="numeric" class="wearable-log-input wearable-log-bp" id="wl-bp-dia" placeholder="dia" aria-label="Diastolic">
        </div>
        <input type="number" inputmode="numeric" class="wearable-log-input wearable-log-pulse-optional" id="wl-bp-pulse" placeholder="pulse (optional)" aria-label="Pulse (optional)">
        ${_renderTagChips('bp_systolic')}
        ${_renderNoteField('wl-bp-note')}
        <div class="wearable-log-row">
          <input type="date" class="wearable-log-date" id="wl-bp-date" value="${today}" max="${today}" aria-label="Date">
          <button type="button" class="wearable-log-save" onclick="saveManualLog('bp',event)">Save</button>
          <button type="button" class="wearable-log-cancel" onclick="cancelManualLog(event)" aria-label="Cancel">✕</button>
        </div>
      </div>`;
  } else if (metricId === 'rhr') {
    card.innerHTML = `
      <div class="wearable-card-top"><span class="wearable-metric-name">Resting HR</span></div>
      <div class="wearable-log-form">
        <input type="number" inputmode="numeric" class="wearable-log-input" id="wl-rhr-val" placeholder="bpm" aria-label="Resting heart rate in bpm" autofocus>
        ${_renderTagChips('rhr')}
        ${_renderNoteField('wl-rhr-note')}
        <div class="wearable-log-row">
          <input type="date" class="wearable-log-date" id="wl-rhr-date" value="${today}" max="${today}" aria-label="Date">
          <button type="button" class="wearable-log-save" onclick="saveManualLog('rhr',event)">Save</button>
          <button type="button" class="wearable-log-cancel" onclick="cancelManualLog(event)" aria-label="Cancel">✕</button>
        </div>
      </div>`;
  }
  // Focus the first input.
  setTimeout(() => card.querySelector('input[type="number"]')?.focus(), 0);
  // Enter-to-save on the number inputs.
  card.querySelectorAll('input[type="number"]').forEach((el) => {
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); saveManualLog(metricId === 'bp_systolic' ? 'bp' : metricId, e); }
      if (e.key === 'Escape') { e.preventDefault(); cancelManualLog(e); }
    });
  });
}

async function saveManualLog(kind, event) {
  if (event) event.stopPropagation();
  const { logManualMetric, logManualBP, refreshManualSummary } = await import('./wearables-manual.js');
  const profileId = state.currentProfile;
  // Pull any active context chips before the DOM is swapped out by re-render.
  const cardForTags =
    kind === 'weight' ? document.querySelector('.wearable-card-empty[data-empty-metric="weight"]') :
    kind === 'rhr'    ? document.querySelector('.wearable-card-empty[data-empty-metric="rhr"]') :
    kind === 'bp'     ? document.querySelector('.wearable-card-empty[data-empty-metric="bp_systolic"]') : null;
  const tags = cardForTags ? _collectActiveChips(cardForTags) : [];
  // Note field — id varies by kind ('wl-weight-note' / 'wl-bp-note' / 'wl-rhr-note').
  const noteEl = document.getElementById(`wl-${kind === 'bp' ? 'bp' : kind}-note`);
  const note = noteEl ? noteEl.value : '';
  try {
    if (kind === 'weight') {
      const val = parseFloat(document.getElementById('wl-weight-val')?.value);
      const date = document.getElementById('wl-weight-date')?.value;
      if (!val || val <= 0 || !date) { showNotification?.('Enter a weight and date', 'error'); return; }
      if (val > 500) { showNotification?.('Weight over 500 kg seems unlikely', 'error'); return; }
      await logManualMetric(profileId, 'weight', { date, value: val, tags, note });
    } else if (kind === 'rhr') {
      const val = parseInt(document.getElementById('wl-rhr-val')?.value, 10);
      const date = document.getElementById('wl-rhr-date')?.value;
      if (!val || val <= 0 || !date) { showNotification?.('Enter a pulse and date', 'error'); return; }
      if (val > 250) { showNotification?.('Pulse over 250 bpm seems unlikely', 'error'); return; }
      await logManualMetric(profileId, 'rhr', { date, value: val, tags, note });
    } else if (kind === 'bp') {
      const sys = parseInt(document.getElementById('wl-bp-sys')?.value, 10);
      const dia = parseInt(document.getElementById('wl-bp-dia')?.value, 10);
      const pulse = parseInt(document.getElementById('wl-bp-pulse')?.value, 10);
      const date = document.getElementById('wl-bp-date')?.value;
      if (!sys || !dia || sys <= 0 || dia <= 0 || !date) { showNotification?.('Enter systolic, diastolic, and date', 'error'); return; }
      if (sys > 300 || dia > 200) { showNotification?.('BP values seem too high', 'error'); return; }
      if (dia >= sys) { showNotification?.('Diastolic should be lower than systolic', 'error'); return; }
      await logManualBP(profileId, { date, systolic: sys, diastolic: dia, pulse: isFinite(pulse) && pulse > 0 ? pulse : undefined, tags, note });
    }
    await refreshManualSummary(profileId);
    if (window.navigate) window.navigate('dashboard');
    showNotification?.('Saved', 'success');
  } catch (e) {
    showNotification?.('Could not save: ' + e.message, 'error');
  }
}

function cancelManualLog(event) {
  if (event) event.stopPropagation();
  // Re-render strip to restore the empty card.
  if (window.navigate) window.navigate('dashboard');
}

Object.assign(window, {
  renderWearableStrip,
  setWearableStripHidden,
  isWearableStripHidden,
  dismissWearableStub,
  toggleWearableStrip,
  openWearableDetail,
  setWearableDetailRange,
  _uninstallWearableModalFocusTrap,
  syncWearableNow,
  chooseWearableSource,
  openManualLogForm,
  saveManualLog,
  cancelManualLog,
  toggleManualLogChip,
  openManualAddFromDetail,
  closeManualAddFromDetail,
  saveManualEntryFromDetail,
  deleteManualEntryFromDetail,
  toggleWearableReorder,
  moveWearableCard,
});
