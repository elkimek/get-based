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

import { escapeHTML, showNotification, showConfirmDialog } from './utils.js';
import { state } from './state.js';
import { ADAPTERS, adapterById, canonicalMetric, metricsForSources, visibleAdapters, getOAuthClientId } from './wearable-adapters.js';
import { brandMarkMono } from './brand-assets.js';

// Vendor logo / mark beside the adapter name. Backed by brands/<vendor>/
// and the registry in js/brand-assets.js. Phase 1 ships monochrome
// placeholder marks (form-factor only, no trademarks); Phase 2b drops
// official kits in per vendor and the render code picks them up
// automatically via brandHasSignIn / brandSignInUrl.
function vendorIcon(adapterId, opts = {}) {
  const mark = brandMarkMono(adapterId, opts);
  if (!mark) return '';
  return `<span class="wearable-vendor-icon" aria-hidden="true">${mark}</span>`;
}
import { beginConnectOAuth, backfillWearable, disconnectWearable, syncNow, listConnectedSources, getConnection } from './wearables-connect.js';
import { syncWearableSummary } from './wearables-summary.js';
import { getActiveProfileId } from './profile.js';
import { getDailyRange } from './wearables-store.js';
import { MANUAL_METRICS } from './wearables-manual.js';
import { getChartColors } from './theme.js';
import { isoDay } from './wearables-oura.js';

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

// Per-profile so a practitioner can disable wearables for a labs-only client
// without affecting their own profile. Mirrors the per-profile pattern used
// by `labcharts-wearable-stub-dismissed-${profile}` further down.
function _wearableStripHiddenKey() {
  return `wearables-strip-hidden-${state.currentProfile || 'default'}`;
}

export function isWearableStripHidden() {
  return localStorage.getItem(_wearableStripHiddenKey()) === '1';
}

export function setWearableStripHidden(hidden) {
  const key = _wearableStripHiddenKey();
  if (hidden) localStorage.setItem(key, '1');
  else localStorage.removeItem(key);
  if (window.navigate) window.navigate('dashboard');
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

// Single formatter used by both the strip card AND the detail modal so a
// number renders identically in both places. Rules:
//   null / non-finite  → "—"
//   integer unit       → Math.round (ms, bpm, %, min, '' score, steps count)
//   integer value      → Math.round (even for /5, yrs, °C, mg/dL — avoids "3.0")
//   else               → toFixed(1)
function formatValue(latest, unit) {
  if (latest == null || !isFinite(latest)) return '—';
  const intUnits = ['ms', 'bpm', '%', 'min', ''];
  if (intUnits.includes(unit) || Number.isInteger(latest)) return String(Math.round(latest));
  return latest.toFixed(1);
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

// Format an ISO date (YYYY-MM-DD) as "Apr 24" for compact display next to a
// metric value. Returns the raw input on parse failure.
function shortDate(iso) {
  if (!iso || typeof iso !== 'string') return iso || '';
  const d = new Date(iso + 'T00:00:00Z');
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });
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
  const lastSyncHTML = manualOnly ? '' : `<span class="wearable-strip-lastsync">last synced ${formatAgo(lastSyncAt)}</span>`;
  const syncBtnHTML = manualOnly ? '' : `<button type="button" class="wearable-strip-sync" aria-label="Sync wearables now" onclick="event.stopPropagation();syncWearableNow(this);return false">
    <svg class="wearable-strip-sync-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 1 1-3-6.7"/><polyline points="21 4 21 12 13 12"/></svg>
    <span>Sync</span>
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

// ─────────────────────────────────────────────────────────
// DETAIL MODAL — 90d daily chart + stats for a single metric
// ─────────────────────────────────────────────────────────

// Monotonic op token — fast successive clicks on different cards shouldn't
// land mismatched data in the modal. Each call grabs a new token; any work
// that resolves with a stale token aborts before touching the DOM.
let _detailOp = 0;

async function openWearableDetail(metricId) {
  const op = ++_detailOp;
  const canon = canonicalMetric(metricId);
  const summary = state.importedData?.wearableSummary;
  const m = summary?.metrics?.[metricId];
  if (!canon || !m) {
    showNotification?.('No data for this metric yet — run a sync first', 'info');
    return;
  }

  // Snapshot the focused element (clicked card) so closeModal can return
  // focus to it — keyboard users otherwise land on <body> after close.
  window.rememberModalTrigger?.();

  // Pull last 90 days from L1 for whichever source is primary for this metric.
  // Series may have gaps (ring not worn, feature off) — we plot what's there
  // and label missing days via Chart.js spanGaps rather than forward-filling.
  const profileId = getActiveProfileId();
  // Local-tz: vendor adapters tag rows with the user's local day, not UTC.
  const endDate = isoDay();
  const start = new Date(); start.setDate(start.getDate() - 90);
  const startDate = isoDay(start);
  let rows = [];
  try { rows = await getDailyRange(profileId, m.primarySource, startDate, endDate); }
  catch (e) { showNotification?.(`Couldn't read local history: ${e.message}`, 'error', 4000); return; }
  if (op !== _detailOp) return;  // superseded by a later click — bail

  const series = rows
    .map(r => ({ date: r.date, v: r[metricId] }))
    .filter(p => typeof p.v === 'number' && isFinite(p.v))
    .sort((a, b) => a.date.localeCompare(b.date));

  // Separately pull ALL manual rows (not just primary-source rows) so the
  // detail modal's "Manual entries" list shows manual readings even when
  // another source is currently primary for this metric. A user with both
  // Withings and manual weight entries wants to see + delete both.
  let manualRows = [];
  if (m.primarySource === 'manual') {
    manualRows = rows;
  } else {
    try { manualRows = await getDailyRange(profileId, 'manual', startDate, endDate); }
    catch { /* no manual data yet — empty list, that's fine */ }
    if (op !== _detailOp) return;
  }
  const manualEntries = manualRows
    .map(r => ({ date: r.date, v: r[metricId], tags: r.tags, note: r.note }))
    .filter(p => typeof p.v === 'number' && isFinite(p.v))
    .sort((a, b) => b.date.localeCompare(a.date)); // reverse-chron for display

  const modal = document.getElementById('detail-modal');
  const overlay = document.getElementById('modal-overlay');
  if (!modal || !overlay) return;

  // Destroy any previous chart on the shared modal canvas before swapping html.
  if (state.chartInstances['modal']) {
    state.chartInstances['modal'].destroy();
    delete state.chartInstances['modal'];
  }

  modal.innerHTML = buildWearableDetailHtml(canon, m, series, metricId, manualEntries);
  overlay.classList.add('show');
  // Move focus to the close button so keyboard users land inside the modal.
  modal.querySelector('.modal-close')?.focus?.();
  // Trap Tab / Shift-Tab inside the modal so keyboard navigation can't
  // accidentally land on background controls (the strip, supplements,
  // chat FAB, etc.). One listener per modal-open; cleared on close via
  // the overlay's existing close path.
  _installWearableModalFocusTrap(modal);

  const canvas = document.getElementById('chart-modal');
  if (canvas && typeof window.Chart !== 'undefined' && series.length > 0) {
    renderWearableChart(canvas, canon, m, series);
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
  // Remove any prior listener (e.g. previous modal open) so we don't stack.
  _uninstallWearableModalFocusTrap();
  _modalTrapHandler = (e) => {
    if (e.key !== 'Tab') return;
    // Modal is gone (closed) — uninstall.
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

// Render the Manual entries list + add-reading form inside the detail modal.
// Only renders when `manualEntries` is non-empty OR the metric is manual-
// capable (weight/BP/RHR). Returns a fully-formed <section>.
function buildManualEntriesSection(metricId, manualEntries, primarySource) {
  if (!MANUAL_METRICS.includes(metricId)) return '';
  if (manualEntries.length === 0) {
    // When a vendor source already provides this metric, the "No manual
    // entries yet" empty state reads as confusing noise — the user has
    // 90 days of data and is being told "no entries." Show a compact
    // add-only affordance instead. When the user has NO vendor source
    // for this metric, the explicit empty state is still useful.
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
  // Friendlier aria — screen-readers should hear a sentence, not an ISO
  // date + raw number. Localised long-date format for the spoken text;
  // the visible cell still shows the ISO YYYY-MM-DD.
  const formatSpokenDate = (iso) => {
    try {
      const d = new Date(iso + 'T00:00:00');
      return d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
    } catch { return iso; }
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

function buildWearableDetailHtml(canon, m, series, metricId, manualEntries = []) {
  const adapter = adapterById(m.primarySource);
  const sourceName = adapter?.displayName || m.primarySource;
  const unit = canon.unit || '';
  const unitSpaced = unit ? ' ' + escapeHTML(unit) : '';
  const subLabel = canon.sub ? ` <span style="opacity:0.6;font-size:0.7em;margin-left:6px;font-weight:normal">${escapeHTML(canon.sub)}</span>` : '';
  const formatV = v => formatValue(v, unit);

  // Trend copy mirrors the strip card so users get consistent language.
  const trendWord = m.trend30d === 'declining' ? 'declining'
                   : m.trend30d === 'rising' ? 'rising'
                   : m.trend30d === 'improving' ? 'improving'
                   : 'flat';

  // Same delta-suppression rules as the strip card so the modal header doesn't
  // flash "↓ 100%" on a stress-zero day or "↓ 87%" on an in-progress steps day.
  // Delta-style metrics (sub === 'Δ', e.g. body_temp_delta) render absolute
  // change in unit — percentages blow up against a near-zero baseline.
  const suppressDelta = !m.baseline || !isFinite(m.baseline)
                     || metricId === 'steps'
                     || (m.latest === 0 && Math.abs(m.baseline) > 0.5);
  let deltaStr = null;
  if (!suppressDelta && m.latest != null && isFinite(m.latest)) {
    if (isDeltaStyleMetric(canon)) {
      const diff = m.latest - m.baseline;
      const arrow = diff > 0.005 ? '↑' : diff < -0.005 ? '↓' : '→';
      deltaStr = `${arrow} ${Math.abs(diff).toFixed(2)}${unit}`;
    } else {
      const deltaPct = (m.latest - m.baseline) / m.baseline * 100;
      const arrow = deltaPct > 0.5 ? '↑' : deltaPct < -0.5 ? '↓' : '→';
      deltaStr = `${arrow} ${Math.abs(deltaPct).toFixed(0)}%`;
    }
  }

  // Daytime companion: when the user is looking at an overnight HRV or RHR
  // card, surface the matching daytime aggregate as an extra stat so they can
  // see stress reactivity vs recovery side-by-side. The strip stays calm —
  // hrv_day / hr_day are explicitly excluded from the strip's card list.
  const DAY_COMPANION = { hrv_rmssd: 'hrv_day', rhr: 'hr_day' };
  const companionId = DAY_COMPANION[metricId];
  const companion = companionId ? state.importedData?.wearableSummary?.metrics?.[companionId] : null;
  const companionLabel = metricId === 'hrv_rmssd' ? 'Daytime HRV'
                       : metricId === 'rhr'       ? 'Daytime HR'
                       : null;
  const companionUnitSpaced = companion ? unitSpaced : '';

  const baseStats = [
    ['Latest',   `${formatV(m.latest)}${unitSpaced}`, m.latestDate ? shortDate(m.latestDate) : ''],
    ['Baseline (90d)', `${formatV(m.baseline)}${unitSpaced}`, 'median'],
    ['7-day avg', `${formatV(m.rolling?.d7)}${unitSpaced}`, ''],
    ['30-day avg', `${formatV(m.rolling?.d30)}${unitSpaced}`, ''],
    ['Typical range', `${formatV(m.baselineP25)} – ${formatV(m.baselineP75)}${unitSpaced}`, '25th–75th percentile'],
    ['Coverage', `${series.length}d`, `of last 90 days`],
  ];
  // Daytime companion: emit up to three sub-stats — latest, 7-day average,
  // 30-day average — so the user gets the trend, not just today (a single
  // quiet/active day can swing the latest by 20+ bpm). The 30-day cell is
  // skipped when there's not enough history to make it meaningful.
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
    // No daytime data — explain why per primary source. Cell layout is sized
    // for a number + 1-line sub, so the explanation moves to a `title`
    // tooltip and the visible sub stays short ("Not from {Source} · why?").
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

  const emptyHint = series.length === 0
    ? `<div class="wearable-detail-empty">No daily samples for this metric in the last 90 days. Either your wearable doesn't share this metric, the feature is off on your device, or you didn't wear it. Try Sync now, or reconnect to refresh permissions.</div>`
    : (metricId === 'activity_score' && series.every(p => p.v === 0))
      ? `<div class="wearable-detail-empty">Every day shows 0 — Oura suppresses the Activity composite score while Rest Mode is on. Check the <b>Steps</b> card for raw movement data, or disable Rest Mode in the Oura app.</div>`
      : '';

  // Show the source-swap button whenever ≥2 wearables are connected — the
  // strip card's badge isn't always present, so the modal becomes the
  // canonical place to switch source for any metric. Single-source profiles
  // hide the button (nothing to swap to).
  const connectedSources = state.importedData?.wearableSummary?.sources || {};
  const showSwapButton = Object.keys(connectedSources).length > 1 && !!adapter;
  const swapButton = showSwapButton
    ? `<button type="button" class="wearable-source-badge wearable-source-badge-btn wearable-modal-source-swap" onclick="chooseWearableSource('${escapeHTML(metricId)}',event)" title="Switch source for this metric">via ${escapeHTML(adapter.displayName)} · swap</button>`
    : '';

  const emfSleepHint = _buildEMFSleepHint(metricId, m);

  return `<button class="modal-close" onclick="closeModal()">&times;</button>
    <h3>${escapeHTML(canon.label)}${subLabel}</h3>
    <div class="modal-unit">
      ${escapeHTML(sourceName)}${deltaStr ? ` · ${deltaStr} vs baseline` : ''} · ${escapeHTML(trendWord)} 30d
      ${swapButton}
    </div>
    <div class="modal-chart" style="height:260px"><canvas id="chart-modal"></canvas></div>
    ${emptyHint}
    <div class="wearable-detail-stats">${statsCells}</div>
    ${buildManualEntriesSection(metricId, manualEntries, m.primarySource)}
    ${emfSleepHint}`;
}

// Quiet, contextual EMF hint for sleep-related wearable metrics. Surfaces only
// when (a) the metric IS sleep-relevant AND (b) it's regressing AND (c) there's
// no fresh EMF assessment. Intent: prompt curiosity, not push products.
function _buildEMFSleepHint(metricId, m) {
  const SLEEP_METRICS = new Set(['sleep_score', 'sleep_efficiency', 'hrv_rmssd']);
  if (!SLEEP_METRICS.has(metricId)) return '';
  // Don't fire on mock/demo data — wearableSummary.sources is populated only
  // when a real wearable is connected. Mock data shows on the welcome screen
  // so a curious click would falsely surface "your sleep is regressing".
  const sources = state.importedData?.wearableSummary?.sources;
  if (!sources || Object.keys(sources).length === 0) return '';
  // Only fire when actually regressing — both 7d AND latest must look worse
  // than baseline. Don't nag people whose sleep is fine.
  const d7 = m?.rolling?.d7;
  const baseline = m?.baseline;
  const p25 = m?.baselineP25;
  if (typeof d7 !== 'number' || typeof baseline !== 'number') return '';
  // Higher = better for these three; "regressing" = below baseline AND below P25
  const regressing = d7 < baseline && (typeof p25 !== 'number' || d7 < p25);
  if (!regressing) return '';
  // Suppress for users with a recent assessment — they've already explored this
  const assessments = state.importedData?.emfAssessment?.assessments || [];
  if (assessments.length) {
    const latest = assessments.reduce((a, b) => (a.date > b.date ? a : b));
    const ageDays = (Date.now() - new Date(latest.date + 'T00:00:00').getTime()) / 86400000;
    if (ageDays < 120) return '';
  }
  const openHandler = `event.preventDefault();window.closeModal&&window.closeModal();setTimeout(()=>window.openEMFAssessmentEditor(),100);`;
  return `<div class="wearable-detail-emf-hint"><span aria-hidden="true">💡</span> Sleep regressing? Sometimes it's the room. <a href="#" onclick="${openHandler}" data-umami-event="emf-nudge-wearable-sleep">Check your EMF environment →</a></div>`;
}

function renderWearableChart(canvas, canon, m, series) {
  const tc = getChartColors();
  const labels = series.map(p => p.date);
  const values = series.map(p => p.v);
  const baselineValues = values.map(() => m.baseline);

  // Y-axis padding so baseline line and sparkline aren't clipped to the edge.
  const ymin = Math.min(...values, m.baseline);
  const ymax = Math.max(...values, m.baseline);
  const pad = Math.max((ymax - ymin) * 0.08, 0.5);

  const unit = canon.unit || '';
  const formatV = v => formatValue(v, unit);

  state.chartInstances['modal'] = new window.Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: canon.label,
          data: values,
          borderColor: tc.lineColor || '#60a5fa',
          backgroundColor: 'transparent',
          borderWidth: 2,
          pointRadius: 0,
          pointHoverRadius: 4,
          tension: 0.3,
          spanGaps: true,
        },
        {
          label: 'Baseline',
          data: baselineValues,
          borderColor: tc.gridColor || '#9ca3af',
          backgroundColor: 'transparent',
          borderWidth: 1,
          borderDash: [4, 4],
          pointRadius: 0,
          pointHoverRadius: 0,
          tension: 0,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: tc.tooltipBg, titleColor: tc.tooltipTitle,
          bodyColor: tc.tooltipBody, borderColor: tc.tooltipBorder, borderWidth: 1,
          callbacks: { label: (c) => `${c.dataset.label}: ${formatV(c.parsed.y)}${unit ? ' ' + unit : ''}` },
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

// ─────────────────────────────────────────────────────────
// SETTINGS PANEL  (rendered into the Data tab in settings.js)
// ─────────────────────────────────────────────────────────

export function renderWearablesSettingsSection() {
  const connected = listConnectedSources();
  const rows = visibleAdapters(Object.keys(connected))
    .map(a => renderAdapterRow(a, !!connected[a.id])).join('');
  const hidden = isWearableStripHidden();
  // BETA badge moves out of every row to a single section-level note. Every
  // wearable adapter is currently beta — the per-row chip was redundant.
  return `<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
    <div style="flex:1;min-width:0">
      <div style="font-size:13px;color:var(--text-secondary)">Wearable integrations</div>
      <div style="font-size:11px;color:var(--text-muted);margin-top:2px">Show data from connected wearables (Oura, Withings, Fitbit, etc.) on the dashboard. Off keeps the strip as a Biometrics strip — your manual weight, BP, and pulse entries still appear.</div>
    </div>
    <label class="toggle-switch">
      <input type="checkbox" id="wearables-strip-hidden-toggle" ${hidden ? '' : 'checked'} onchange="window.setWearableStripHidden(!this.checked)">
      <span class="toggle-slider"></span>
    </label>
  </div>
  <div class="settings-section-header" style="display:block">
    <div class="settings-section-title" style="display:block;margin-bottom:4px">Connected devices</div>
    <div class="settings-section-hint" style="display:block">Data stays on this device; a compact summary + anomaly events sync to your other devices. All integrations are <em>beta</em> — please report issues.</div>
  </div>
  <div class="wearables-adapter-list">${rows}</div>`;
}

// Each adapter renders as a single horizontal row:
//   [icon] [name] [status]                   [right-aligned action]
// Connected adapters expand a details drawer below the row (identity, last
// sync, manage actions). Apple Health expands its export instructions.
function renderAdapterRow(adapter, isConnected) {
  const conn = isConnected ? getConnection(adapter.id) : null;
  const isOAuth = adapter.authType === 'oauth2';
  const isPendingClient = isOAuth && (getOAuthClientId(adapter) || '').startsWith('REPLACE_WITH_');
  const isFileImport = adapter.authType === 'file-import' && adapter.id === 'apple_health';

  // Status text — only when there's something meaningful to say.
  let status = '';
  if (isConnected && conn?.needsReauth) {
    status = `<span class="wearable-row-status wearable-row-status-bad">needs reconnection</span>`;
  } else if (isConnected) {
    const ago = conn?.lastSyncAt ? formatAgo(conn.lastSyncAt) : 'never synced';
    status = `<span class="wearable-row-status wearable-row-status-ok">connected · ${escapeHTML(ago)}</span>`;
  } else if (isPendingClient) {
    status = `<span class="wearable-row-status wearable-row-status-pending">waiting on partner credentials</span>`;
  } else if (isFileImport && !conn) {
    status = `<span class="wearable-row-status wearable-row-status-muted">file import only</span>`;
  } else if (isFileImport && conn) {
    status = `<span class="wearable-row-status wearable-row-status-ok">imported · ${escapeHTML(conn.coverageDays ?? '?')} days</span>`;
  }

  // Right-aligned action — Connect button, expand chevron, or Import.
  const action = renderRowAction(adapter, conn, { isPendingClient, isFileImport });

  // Expandable body (only for connected adapters + Apple Health when wanting help).
  const detail = renderRowDetail(adapter, conn, { isPendingClient, isFileImport });

  // Use <details>/<summary> for free keyboard-accessible disclosure when
  // there's something to expand. Otherwise render a flat row.
  const hasDetail = !!detail;
  const expandable = hasDetail;

  // When the logo already contains the vendor wordmark (Oura, Ultrahuman,
  // Withings, Polar) we hide the duplicate text label — visually the logo
  // IS the name. Vendors with symbol-only marks (WHOOP circular, Fitbit
  // dot-grid, Apple Health file glyph) still get the text label.
  const isWordmark = brandIconIsWordmark(adapter.id);
  const nameSpan = isWordmark
    ? `<span class="wearable-row-name sr-only">${escapeHTML(adapter.displayName)}</span>`
    : `<span class="wearable-row-name">${escapeHTML(adapter.displayName)}</span>`;

  if (expandable) {
    // Apple Health disconnected starts open by default — the dropzone +
    // export instructions are the whole reason a user lands on that row.
    // Other rows start collapsed.
    const startOpen = isFileImport && !conn;
    return `<details class="wearable-row${isConnected ? ' is-connected' : ''}" data-adapter="${escapeHTML(adapter.id)}"${startOpen ? ' open' : ''}>
      <summary class="wearable-row-summary">
        ${vendorIcon(adapter.id, { size: 20 })}
        ${nameSpan}
        ${status}
        <span class="wearable-row-action">${action}</span>
      </summary>
      <div class="wearable-row-detail">${detail}</div>
    </details>`;
  }

  return `<div class="wearable-row" data-adapter="${escapeHTML(adapter.id)}">
    <div class="wearable-row-summary wearable-row-summary-flat">
      ${vendorIcon(adapter.id, { size: 20 })}
      ${nameSpan}
      ${status}
      <span class="wearable-row-action">${action}</span>
    </div>
  </div>`;
}

// Vendors whose icon asset already contains their name (wordmark-style logo).
// We keep the text in the DOM for screen readers but hide it visually so the
// row doesn't read "Oura Oura connected · 5h ago". Polar is excluded —
// currently using the monochrome fallback glyph, not the wordmark, until the
// AccessLink written-consent ticket lands. See brands/polar/LICENSE.md.
function brandIconIsWordmark(adapterId) {
  return new Set(['oura', 'ultrahuman', 'withings']).has(adapterId);
}

// Right-side action — plain accent buttons across all vendors. Vendor brand
// identity sits on the LEFT side of the row (via vendorIcon's monochrome
// mark using each vendor's actual logo silhouette). The right side is
// uniform action language: Connect / Reconnect / Import / docs link / chevron.
function renderRowAction(adapter, conn, { isPendingClient, isFileImport }) {
  if (conn && !conn.needsReauth) {
    return `<span class="wearable-row-chevron" aria-hidden="true">▾</span>`;
  }
  if (conn && conn.needsReauth) {
    return `<button type="button" class="wearable-action-row-btn" onclick="event.stopPropagation();handleWearableConnect('${escapeHTML(adapter.id)}')" aria-label="Reconnect ${escapeHTML(adapter.displayName)}">Reconnect</button>`;
  }
  if (isPendingClient) {
    const docs = adapter.authDocsUrl
      ? `<a class="wearable-row-link" href="${escapeHTML(adapter.authDocsUrl)}" target="_blank" rel="noopener" onclick="event.stopPropagation()">docs&nbsp;↗</a>`
      : '';
    return docs;
  }
  if (isFileImport) {
    return `<button type="button" class="wearable-action-row-btn" onclick="event.stopPropagation();document.getElementById('apple-health-file-input').click()">Import</button>`;
  }
  if (adapter.authType === 'oauth2') {
    return `<button type="button" class="wearable-action-row-btn" onclick="event.stopPropagation();handleWearableConnect('${escapeHTML(adapter.id)}')" aria-label="Connect ${escapeHTML(adapter.displayName)}">Connect</button>`;
  }
  return '';
}

function renderRowDetail(adapter, conn, { isPendingClient, isFileImport }) {
  // Connected OAuth — identity + manage actions
  if (conn && !conn.needsReauth && adapter.authType === 'oauth2') {
    const acct = conn.account || {};
    const when = conn.lastSyncAt ? formatAgo(conn.lastSyncAt) : 'never';
    // Vendor identity priority: vendor-supplied identity string → email →
    // full name → user-id → generic fallback. Withings supplies a
    // last-measure timestamp string; Polar exposes first/last name + userId;
    // Oura/Fitbit/WHOOP supply email.
    const fullName = [acct.firstName, acct.lastName].filter(Boolean).join(' ').trim();
    const identity = escapeHTML(
      acct.identity
      || acct.email
      || fullName
      || (acct.userId ? `User ${acct.userId}` : '')
      || (acct['polar-user-id'] ? `User ${acct['polar-user-id']}` : '')
      || '(account verified)'
    );
    return `<div class="wearable-adapter-identity">${identity}</div>
      <div class="wearable-adapter-meta">Last sync: ${escapeHTML(when)}</div>
      <div class="wearable-adapter-actions">
        <button class="wearable-action wearable-action-primary" title="Refetches the last 7 days — catches today's reading even if you synced earlier." onclick="handleWearableSyncNow('${escapeHTML(adapter.id)}', this)" aria-label="Sync ${escapeHTML(adapter.displayName)} now">
          <svg class="wearable-action-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 1 1-3-6.7"/><polyline points="21 4 21 12 13 12"/></svg>
          <span>Sync now <span class="wearable-action-hint">(catches today)</span></span>
        </button>
        <button class="wearable-action wearable-action-secondary" title="Refetches 90 days of history — useful after a long absence or to recover missing days. May take 30s+." onclick="handleWearableBackfill('${escapeHTML(adapter.id)}')">Backfill 90 days <span class="wearable-action-hint">(slower, fills gaps)</span></button>
        <button class="wearable-action wearable-action-danger" onclick="handleWearableDisconnect('${escapeHTML(adapter.id)}')">Disconnect</button>
      </div>`;
  }
  // Apple Health connected — different actions
  if (conn && isFileImport) {
    const when = formatAgo(conn.lastSyncAt);
    const fileName = conn.fileName ? escapeHTML(conn.fileName) : 'export';
    return `<div class="wearable-adapter-identity">Imported from ${fileName}</div>
      <div class="wearable-adapter-meta">Last import: ${escapeHTML(when)} · ${conn.coverageDays ?? '?'} days</div>
      <div class="wearable-adapter-actions">
        <button class="wearable-action wearable-action-primary" onclick="document.getElementById('apple-health-file-input').click()">Re-import new export</button>
        <button class="wearable-action wearable-action-danger" onclick="handleWearableDisconnect('${escapeHTML(adapter.id)}')">Remove data</button>
      </div>
      <div id="apple-health-progress" class="apple-health-progress" style="display:none">
        <div class="apple-health-progress-bar"><div class="apple-health-progress-fill"></div></div>
        <div class="apple-health-progress-text"></div>
      </div>
      <input type="file" id="apple-health-file-input" accept=".zip,.xml,application/zip,application/xml" style="display:none" onchange="handleAppleHealthFilePick(this)">`;
  }
  // Apple Health disconnected — full how-to-export + dropzone
  if (isFileImport) {
    return `<details class="wearable-adapter-hint apple-health-howto" style="font-size:12px">
        <summary>How to export from your iPhone</summary>
        <ol>
          <li>Open the <b>Health</b> app on your iPhone.</li>
          <li>Tap your profile photo (top-right corner).</li>
          <li>Scroll down → tap <b>Export All Health Data</b>.</li>
          <li>AirDrop or email the resulting <code>export.zip</code> to your computer.</li>
          <li>Drop it below (or unzip and drop the <code>export.xml</code> inside).</li>
        </ol>
        <p class="apple-health-privacy">Parsing runs entirely in your browser — the file never leaves this device.</p>
      </details>
      <div class="apple-health-dropzone"
           ondragover="event.preventDefault();this.classList.add('drag-over')"
           ondragleave="this.classList.remove('drag-over')"
           ondrop="event.preventDefault();this.classList.remove('drag-over');handleAppleHealthDrop(event)"
           onclick="document.getElementById('apple-health-file-input').click()">
        <div class="apple-health-dropzone-icon">📂</div>
        <div class="apple-health-dropzone-text">Drop <code>export.zip</code> or <code>export.xml</code> here — or click to pick a file</div>
      </div>
      <div id="apple-health-progress" class="apple-health-progress" style="display:none">
        <div class="apple-health-progress-bar"><div class="apple-health-progress-fill"></div></div>
        <div class="apple-health-progress-text"></div>
      </div>
      <input type="file" id="apple-health-file-input" accept=".zip,.xml,application/zip,application/xml" style="display:none" onchange="handleAppleHealthFilePick(this)">`;
  }
  // Pending OAuth client — explanation
  if (isPendingClient) {
    return `<p class="wearable-adapter-hint">${escapeHTML(adapter.displayName)} support is in progress — still waiting on partner credentials. Check back soon or watch the changelog.</p>`;
  }
  // Manual source — entry counts + entry points + disconnect. Unlike OAuth,
  // manual has no credential to reconnect; "disconnect" means wipe all rows.
  if (conn && adapter.authType === 'manual') {
    return `<div class="wearable-adapter-identity">Entered manually on this device</div>
      <div class="wearable-adapter-meta" id="wearable-manual-counts" data-role="manual-counts">
        <span class="muted">Counting readings…</span>
      </div>
      <p class="wearable-adapter-hint" style="margin-top:4px;font-size:12px">
        Log, edit, or delete individual entries from the dashboard — tap any
        weight / BP / resting HR card to open its detail view.
      </p>
      <div class="wearable-adapter-actions">
        <button class="wearable-action wearable-action-primary" onclick="handleManualOpenDashboard()">Open dashboard</button>
        <button class="wearable-action wearable-action-danger" onclick="handleManualDisconnect()">Delete all manual entries</button>
      </div>`;
  }
  // Disconnected OAuth (default) — no detail to expand. The Connect button
  // in the row action is enough; row stays flat.
  return null;
}

// renderConnectButton was removed in v1.22.0 along with the brand-coloured
// Connect pills — Settings now uses uniform ghost buttons via renderRowAction.
// Brand asset registry + render helpers stay intact in js/brand-assets.js for
// landing-site reuse.

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

// Detail-modal "+ Add reading" — opens an inline form inside the manual-add
// slot. Unlike the dashboard empty-card form, the date picker here isn't
// locked to today — users can backfill a past reading they forgot to log.
function openManualAddFromDetail(metricId, event) {
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

function closeManualAddFromDetail() {
  const slot = document.getElementById('wearable-manual-add-slot');
  if (slot) slot.innerHTML = '';
}

// Per-metric monotonic op token — rapid double-clicks on Save / × Delete
// fire duplicate writes and flashes of "Saved" / "Deleted" toasts before
// the re-render settles. IDB serializes so data is safe, but the paint is
// ugly. Per-metric (not module-wide) so a save on one metric doesn't
// silently bail out a save on another.
const _manualEntryOps = new Map(); // metricId → counter
function _bumpManualEntryOp(metricId) {
  const next = (_manualEntryOps.get(metricId) || 0) + 1;
  _manualEntryOps.set(metricId, next);
  return next;
}
function _currentManualEntryOp(metricId) {
  return _manualEntryOps.get(metricId) || 0;
}

async function saveManualEntryFromDetail(metricId, kind) {
  const op = _bumpManualEntryOp(metricId);
  const { logManualMetric, logManualBP, refreshManualSummary } = await import('./wearables-manual.js');
  const profileId = getActiveProfileId();
  const date = document.getElementById('wlad-date')?.value;
  if (!date) { showNotification?.('Pick a date', 'error'); return; }
  // Collect tags (rhr + bp forms only) + optional note from the detail-modal
  // form. Scoped to the form element so chips from elsewhere don't bleed in.
  const formEl = document.querySelector('.wearable-manual-add-form');
  const tags = formEl ? _collectActiveChips(formEl) : [];
  const note = document.getElementById('wlad-note')?.value || '';
  try {
    if (kind === 'weight') {
      const val = parseFloat(document.getElementById('wlad-val')?.value);
      if (!val || val <= 0) { showNotification?.('Enter a weight', 'error'); return; }
      if (val > 500) { showNotification?.('Weight over 500 kg seems unlikely', 'error'); return; }
      await logManualMetric(profileId, 'weight', { date, value: val, tags, note });
    } else if (kind === 'rhr') {
      const val = parseInt(document.getElementById('wlad-val')?.value, 10);
      if (!val || val <= 0) { showNotification?.('Enter a pulse', 'error'); return; }
      if (val > 250) { showNotification?.('Pulse over 250 bpm seems unlikely', 'error'); return; }
      await logManualMetric(profileId, 'rhr', { date, value: val, tags, note });
    } else if (kind === 'bp') {
      const sys = parseInt(document.getElementById('wlad-sys')?.value, 10);
      const dia = parseInt(document.getElementById('wlad-dia')?.value, 10);
      const pulse = parseInt(document.getElementById('wlad-pulse')?.value, 10);
      if (!sys || !dia || sys <= 0 || dia <= 0) { showNotification?.('Enter systolic and diastolic', 'error'); return; }
      if (sys > 300 || dia > 200) { showNotification?.('BP values seem too high', 'error'); return; }
      if (dia >= sys) { showNotification?.('Diastolic should be lower than systolic', 'error'); return; }
      await logManualBP(profileId, { date, systolic: sys, diastolic: dia, pulse: isFinite(pulse) && pulse > 0 ? pulse : undefined, tags, note });
    }
    await refreshManualSummary(profileId);
    if (op !== _currentManualEntryOp(metricId)) return; // superseded by a later click on the SAME metric — bail
    showNotification?.('Saved', 'success');
    // Re-render the dashboard strip so the populated card reflects the new
    // value, then re-open the detail modal on top with the refreshed list.
    if (window.navigate) window.navigate('dashboard');
    openWearableDetail(metricId);
  } catch (e) {
    showNotification?.(`Couldn't save: ${e.message}`, 'error', 4000);
  }
}

async function deleteManualEntryFromDetail(metricId, date) {
  const op = _bumpManualEntryOp(metricId);
  if (typeof window.showConfirmDialog !== 'function') return;
  const canon = canonicalMetric(metricId);
  const label = canon?.label || metricId;
  if (await window.showConfirmDialog(`Delete this ${label.toLowerCase()} reading from ${date}?`)) {
    try {
      const { deleteManualMetric, refreshManualSummary } = await import('./wearables-manual.js');
      const profileId = getActiveProfileId();
      // For BP cards we clear both systolic + diastolic for this date so the
      // reading disappears from the paired card too.
      if (metricId === 'bp_systolic' || metricId === 'bp_diastolic') {
        await deleteManualMetric(profileId, 'bp_systolic', date);
        await deleteManualMetric(profileId, 'bp_diastolic', date);
      } else {
        await deleteManualMetric(profileId, metricId, date);
      }
      await refreshManualSummary(profileId);
      if (op !== _currentManualEntryOp(metricId)) return; // superseded by a later click on the SAME metric — bail
      showNotification?.('Deleted', 'success');
      // Re-render the dashboard strip first so the card visibly updates (or
      // disappears if that was the last reading). If the metric still has
      // data, re-open the detail modal on top to refresh its entries list.
      // If not, close the modal — re-opening `openWearableDetail` on an
      // empty metric would flash an error toast instead.
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

// Manual source — UI handlers. Settings → Integrations → Manual exposes a
// single-click path to (a) go log/manage on the dashboard and (b) nuke all
// manual data. Per-reading delete lives on the dashboard detail modal.
function handleManualOpenDashboard() {
  // Settings modal is an overlay; let the caller close it by dispatching the
  // same Escape path the close button uses. We just navigate the underlying
  // dashboard — the user hits Escape / closes Settings manually.
  if (window.closeSettings) window.closeSettings();
  if (window.navigate) window.navigate('dashboard');
  requestAnimationFrame(() => {
    document.getElementById('wearable-strip')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

async function handleManualDisconnect() {
  if (typeof window.showConfirmDialog !== 'function') return;
  if (await window.showConfirmDialog(
    'Delete all manual entries? This removes every weight / BP / pulse entry you\'ve logged manually. Data from connected wearables (Oura, Withings, etc.) is untouched. Can\'t be undone.'
  )) {
    try {
      const { clearSource } = await import('./wearables-store.js');
      const { refreshManualSummary } = await import('./wearables-manual.js');
      const profileId = getActiveProfileId();
      await clearSource(profileId, 'manual');
      // Drop the connection record too — the row disappears from the strip
      // source header and the Settings integrations list.
      if (state.importedData.wearableConnections) {
        delete state.importedData.wearableConnections.manual;
        const { saveImportedData } = await import('./data.js');
        await saveImportedData();
      }
      await refreshManualSummary(profileId);
      showNotification?.('All manual entries deleted', 'success');
      // Re-render the Settings section + dashboard strip.
      const section = document.querySelector('[data-wearables-settings-host]') ||
                      document.querySelector('.wearables-adapter-list')?.parentElement;
      if (section) section.innerHTML = renderWearablesSettingsSection();
      if (window.navigate) window.navigate('dashboard');
    } catch (e) {
      showNotification?.(`Couldn't delete: ${e.message}`, 'error', 4000);
    }
  }
}

// Populate the "X weight, Y BP, Z pulse" counts line in the manual
// detail-drawer — async because it reads from IndexedDB. Called when the
// Settings section is rendered and whenever the drawer opens.
async function _updateManualCounts() {
  const el = document.querySelector('[data-role="manual-counts"]');
  if (!el) return;
  try {
    const { getDailyRange } = await import('./wearables-store.js');
    const profileId = getActiveProfileId();
    const rows = await getDailyRange(profileId, 'manual', '2000-01-01', '2099-12-31');
    let weightN = 0, bpN = 0, rhrN = 0;
    for (const r of rows) {
      if (typeof r.weight === 'number') weightN++;
      if (typeof r.bp_systolic === 'number' || typeof r.bp_diastolic === 'number') bpN++;
      if (typeof r.rhr === 'number') rhrN++;
    }
    const parts = [];
    if (weightN) parts.push(`${weightN} weight`);
    if (bpN) parts.push(`${bpN} blood pressure`);
    if (rhrN) parts.push(`${rhrN} pulse`);
    el.textContent = parts.length ? parts.join(' · ') + ' readings' : 'No manual entries yet';
  } catch { /* non-fatal */ }
}
// Fire when the details element opens (delegated — the Settings section is
// re-rendered on demand so we can't bind once at module load).
document.addEventListener('toggle', (e) => {
  if (e.target?.matches?.('details.wearable-row[data-adapter="manual"]') && e.target.open) {
    _updateManualCounts();
  }
}, true);
// Also fire on initial paint so the row populates whether or not the user
// toggles it. The Settings section re-renders on every open so a microtask
// kick is enough — no observer needed.
document.addEventListener('settings:wearables-rendered', () => {
  // Slightly defer so the [data-role="manual-counts"] element is in the DOM.
  queueMicrotask(_updateManualCounts);
});

function handleWearableConnect(adapterId) {
  try {
    beginConnectOAuth(adapterId);
    // beginOAuth navigates away — nothing else to do here.
  } catch (e) {
    showNotification?.(`Connect failed: ${e.message}`, 'error', 5000);
  }
}

function handleAppleHealthDrop(e) {
  const file = e.dataTransfer?.files?.[0];
  if (file) importAppleHealthFlow(file);
}

function handleAppleHealthFilePick(input) {
  const file = input.files?.[0];
  if (file) importAppleHealthFlow(file);
  input.value = ''; // so picking the same file twice re-triggers
}

async function importAppleHealthFlow(file) {
  const { importAppleHealthFile } = await import('./wearables-apple-health.js');
  const bar = document.querySelector('.apple-health-progress-fill');
  const wrap = document.getElementById('apple-health-progress');
  const text = document.querySelector('.apple-health-progress-text');
  if (wrap) wrap.style.display = 'block';
  try {
    const res = await importAppleHealthFile(file, ({ stage, pct, rows, startDate, endDate }) => {
      if (bar) bar.style.width = (pct ?? 0) + '%';
      if (text) text.textContent = stage === 'done'
        ? `${rows} days imported (${startDate} – ${endDate})`
        : `${stage}… ${pct ?? 0}%`;
    });
    showNotification?.(`Apple Health imported — ${res.rows} days`, 'success', 3000);
    refreshSettingsWearables();
    if (window.navigate) window.navigate('dashboard');
  } catch (e) {
    showNotification?.(`Apple Health import failed: ${e.message}`, 'error', 6000);
    if (text) text.textContent = `Failed: ${e.message}`;
  }
}

async function handleWearableSyncNow(adapterId, triggerEl) {
  const btn = triggerEl;
  btn?.classList.add('is-syncing');
  if (btn) btn.disabled = true;
  const name = adapterById(adapterId)?.displayName || adapterId;
  try {
    showNotification?.(`Syncing ${name}…`, 'info', 1500);
    const res = await syncNow(adapterId, { force: true });
    showNotification?.(`${name} synced (${res.rows ?? 0} new)`, 'success', 2500);
    refreshSettingsWearables();
    if (window.navigate) window.navigate('dashboard');
  } catch { /* syncNow already notified */ }
  finally {
    btn?.classList.remove('is-syncing');
    if (btn) btn.disabled = false;
  }
}

async function handleWearableBackfill(adapterId) {
  const name = adapterById(adapterId)?.displayName || adapterId;
  try {
    showNotification?.(`Backfilling ${name}…`, 'info', 2000);
    const bf = await backfillWearable(adapterId);
    await syncWearableSummary(getActiveProfileId(), listConnectedSources());
    showNotification?.(`${name} backfilled ${bf.rows} days`, 'success');
    refreshSettingsWearables();
    if (window.navigate) window.navigate('dashboard');
  } catch (e) {
    showNotification?.(`Backfill failed: ${e.message}`, 'error', 4000);
  }
}

async function handleWearableDisconnect(adapterId) {
  const name = adapterById(adapterId)?.displayName || adapterId;
  if (await showConfirmDialog(`Disconnect ${name} and delete its local data?`)) {
    await disconnectWearable(adapterId, { deleteData: true });
    showNotification?.(`${name} disconnected`, 'success');
    refreshSettingsWearables();
    if (window.navigate) window.navigate('dashboard');
  }
}

function refreshSettingsWearables() {
  const section = document.getElementById('wearables-section');
  if (section) section.innerHTML = renderWearablesSettingsSection();
}

// ─────────────────────────────────────────────────────────
// Inline manual-log form (Phase 3) — opens from the empty strip cards.
// ─────────────────────────────────────────────────────────

// Chip row for optional context tags. Tags are purely informational but
// sensors can't infer them — 140/90 resting is a very different story from
// 140/90 post-workout. Chips toggle a `.active` class; save reads them.
// Weight doesn't render the row (context rarely matters for weight — gets
// noisy without payoff); BP/RHR render the full set.
const TAG_CHIPS = {
  bp_systolic: ['resting', 'morning-fasted', 'post-workout', 'stress'],
  rhr: ['resting', 'morning-fasted', 'post-workout'],
};
function _renderTagChips(metricId) {
  const tags = TAG_CHIPS[metricId];
  if (!tags) return '';
  return `<div class="wearable-log-tags" role="group" aria-label="Optional context">
    ${tags.map(t => `<button type="button" class="wearable-log-chip" data-tag="${escapeHTML(t)}" onclick="toggleManualLogChip(this,event)">${escapeHTML(t)}</button>`).join('')}
  </div>`;
}
function toggleManualLogChip(btn, event) {
  if (event) event.stopPropagation();
  btn.classList.toggle('active');
}
function _collectActiveChips(card) {
  return Array.from(card.querySelectorAll('.wearable-log-chip.active')).map(b => b.dataset.tag);
}
// Shared note-textarea snippet for both manual-log forms. The `idSuffix`
// disambiguates dashboard-card (`wl-...-note`) vs detail-modal (`wlad-note`).
function _renderNoteField(idSuffix = 'wl-note') {
  return `<textarea class="wearable-log-note" id="${escapeHTML(idSuffix)}" rows="2" placeholder="Optional note — e.g. retook because cuff felt loose, different arm, different lab, just after coffee..." aria-label="Optional note"></textarea>`;
}

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
  _uninstallWearableModalFocusTrap,
  syncWearableNow,
  chooseWearableSource,
  openManualLogForm,
  saveManualLog,
  cancelManualLog,
  toggleManualLogChip,
  handleManualOpenDashboard,
  handleManualDisconnect,
  openManualAddFromDetail,
  closeManualAddFromDetail,
  saveManualEntryFromDetail,
  deleteManualEntryFromDetail,
  toggleWearableReorder,
  moveWearableCard,
  renderWearablesSettingsSection,
  handleWearableConnect,
  handleWearableSyncNow,
  handleWearableBackfill,
  handleWearableDisconnect,
  handleAppleHealthDrop,
  handleAppleHealthFilePick,
});
