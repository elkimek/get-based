// wearables-summary.js — L2 summary derivation + change gate
//
// Pure functions where possible so the gate logic is testable without IDB or DOM.
// Orchestrator at the bottom (`syncWearableSummary`) reads L1 rows, computes the
// canonical L2 snapshot, compares against the current importedData.wearableSummary,
// and only persists when a significance threshold trips — this is how we keep
// Evolu sync writes to ~4–8/month instead of ~30/month.

import { state } from './state.js';
import { saveImportedData } from './data.js';
import {
  appendImportedArrayItem,
  ensureImportedArray,
  trimImportedArray,
} from './data-merge.js';
import { getDailyRange } from './wearables-store.js';
import {
  DEFAULT_METRIC_ORDER,
  isMetricValueMeaningful,
  CUMULATIVE_METRICS,
  WEAR_REQUIRED_MINIMUMS,
  isoDay,
} from './wearable-adapters.js';
import { isDebugMode } from './utils.js';

// ─────────────────────────────────────────────────────────
// Tunables — see dev-docs/module-reference.md (wearables-summary.js section)
// ─────────────────────────────────────────────────────────
const GATE_D7_DELTA_PCT     = 5;       // |d7 rolling mean shift| ≥ 5% triggers L2 write
const GATE_WEEKLY_DELTA_PCT = 5;       // any weekly-series metric delta ≥ 5% triggers L2 write
const MIN_L2_REFRESH_MS     = 14 * 24 * 60 * 60 * 1000; // force-write after 14d silence
const ANOMALY_STREAK_DAYS   = 3;       // sustained breach length to fire an anomaly event
const CHANGE_HISTORY_CAP    = 200;     // existing global cap; honour it when appending
const SUMMARY_WINDOW_DAYS   = 90;
const MANUAL_SUMMARY_START_DATE = '1970-01-01';

const METRICS_FOR_SUMMARY = DEFAULT_METRIC_ORDER;

// ─────────────────────────────────────────────────────────
// Stat helpers (pure)
// ─────────────────────────────────────────────────────────

function percentile(sortedAsc, p) {
  if (sortedAsc.length === 0) return null;
  const idx = (sortedAsc.length - 1) * p;
  const lo = Math.floor(idx), hi = Math.ceil(idx);
  if (lo === hi) return sortedAsc[lo];
  return sortedAsc[lo] + (sortedAsc[hi] - sortedAsc[lo]) * (idx - lo);
}

function mean(nums) {
  if (nums.length === 0) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function linearRegressionSlope(values) {
  if (values.length < 3) return 0;
  const n = values.length;
  let sx = 0, sy = 0, sxy = 0, sxx = 0;
  for (let i = 0; i < n; i++) {
    sx += i; sy += values[i]; sxy += i * values[i]; sxx += i * i;
  }
  const denom = (n * sxx) - (sx * sx);
  if (denom === 0) return 0;
  return ((n * sxy) - (sx * sy)) / denom;
}

// ─────────────────────────────────────────────────────────
// Per-metric derivation
// ─────────────────────────────────────────────────────────

function isSummaryEligibleRow(row, metricId, todayISO = isoDay()) {
  if (!row) return false;
  const v = row[metricId];
  if (CUMULATIVE_METRICS.has(metricId) && row.date === todayISO) return false;
  const wearMin = WEAR_REQUIRED_MINIMUMS[metricId];
  if (wearMin != null && typeof v === 'number' && isFinite(v) && v < wearMin) return false;
  return isMetricValueMeaningful(metricId, v);
}

function seriesFor(rowsByDate, metricId, todayISO = isoDay()) {
  const out = [];
  for (const row of rowsByDate) {
    if (isSummaryEligibleRow(row, metricId, todayISO)) out.push({ date: row.date, v: row[metricId] });
  }
  return out;
}

function isoWeekOf(dateStr) {
  // dateStr = YYYY-MM-DD. ISO week (Mon-Sun), format 'YYYY-Www'.
  const d = new Date(dateStr + 'T00:00:00Z');
  const day = d.getUTCDay() || 7; // Sun=0 → 7
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

function weeklyMeans(series, weeksBack = 12) {
  const byWeek = new Map();
  for (const p of series) {
    const w = isoWeekOf(p.date);
    if (!byWeek.has(w)) byWeek.set(w, []);
    byWeek.get(w).push(p.v);
  }
  const weeks = Array.from(byWeek.entries())
    .map(([w, vs]) => ({ w, mean: mean(vs) }))
    .sort((a, b) => a.w.localeCompare(b.w));
  return weeks.slice(-weeksBack);
}

function deriveMetric(rowsByDate, metricId, primarySource, todayISO = isoDay()) {
  const series = seriesFor(rowsByDate, metricId, todayISO);
  if (series.length === 0) return null;

  const latest = series[series.length - 1];
  const today = latest.v;
  const todayDate = latest.date;

  // Rolling windows read from the end — series is chronological.
  const sliceLastN = n => series.slice(Math.max(0, series.length - n)).map(p => p.v);
  const d7  = mean(sliceLastN(7));
  const d30 = mean(sliceLastN(30));
  const d90 = mean(sliceLastN(90));

  // Baseline: 90d distribution quartiles. Using the FULL history (up to 90d)
  // rather than excluding the latest window — baseline is "typical for this
  // person over recent history," not "prior to now."
  const all90 = sliceLastN(90).slice().sort((a, b) => a - b);
  const baseline    = percentile(all90, 0.5);
  const baselineP25 = percentile(all90, 0.25);
  const baselineP75 = percentile(all90, 0.75);

  // Trend direction from last 30 days via slope sign. Threshold normalized
  // to the metric's own baseline so "flat" is consistent across units.
  const last30 = sliceLastN(30);
  const slope = linearRegressionSlope(last30);
  const baselineAbs = Math.abs(baseline || 1);
  const slopeNorm = slope / (baselineAbs || 1);
  let trend30d = 'flat';
  if (slopeNorm > 0.002)       trend30d = 'rising';
  else if (slopeNorm < -0.002) trend30d = 'declining';

  const weekly = weeklyMeans(series, 12).map(w => Math.round(w.mean * 100) / 100);

  return {
    primarySource,
    latest: Math.round(today * 100) / 100,
    latestDate: todayDate,
    baseline: Math.round((baseline ?? 0) * 100) / 100,
    baselineP25: baselineP25 != null ? Math.round(baselineP25 * 100) / 100 : null,
    baselineP75: baselineP75 != null ? Math.round(baselineP75 * 100) / 100 : null,
    rolling: {
      d7:  d7  != null ? Math.round(d7  * 100) / 100 : null,
      d30: d30 != null ? Math.round(d30 * 100) / 100 : null,
      d90: d90 != null ? Math.round(d90 * 100) / 100 : null,
    },
    trend30d,
    weekly,
  };
}

// ─────────────────────────────────────────────────────────
// Compute full summary from L1 rows
// ─────────────────────────────────────────────────────────

// rowsBySource: { [sourceId]: rowsSortedAsc[] }  — each row has canonical metric fields
// connectedSources: { [sourceId]: { connectedSince, lastSyncAt } }
// primaryOverride:  { [metricId]: sourceId }  — user-set forced primary. Takes
//                   precedence over the auto-picker. Missing entries fall
//                   back to most-recent-non-null-date heuristic.
export function computeWearableSummary(rowsBySource, connectedSources, primaryOverride = {}) {
  const sources = {};
  const pickedPrimary = {}; // metricId → sourceId
  const todayISO = isoDay();

  for (const [sid, rows] of Object.entries(rowsBySource)) {
    // coverageDays counts rows that carry at least ONE non-null canonical
    // value — bare {source, date} stubs (which can survive Apple Health
    // imports of all-null fields, or stale empty rows) shouldn't inflate
    // the number the strip header advertises.
    let nonEmpty = 0;
    for (const row of rows) {
      const hasAnyValue = Object.entries(row).some(([k, v]) =>
        k !== 'source' && k !== 'date' && k !== 'importedAt' && k !== 'tags' &&
        typeof v === 'number' && isFinite(v)
      );
      if (hasAnyValue) nonEmpty++;
    }
    sources[sid] = {
      connectedSince: connectedSources?.[sid]?.connectedSince || null,
      lastSyncAt: connectedSources?.[sid]?.lastSyncAt || null,
      coverageDays: nonEmpty,
    };
  }

  // Primary-source selection:
  //   1. user override wins if present AND that source has ANY data for this
  //      metric (if override source has zero samples for the metric, fall
  //      through to the auto-picker so a broken override doesn't blank the
  //      card)
  //   2. otherwise pick source with the most recent non-null value; ties
  //      resolved deterministically by insertion order of rowsBySource
  const metrics = {};
  for (const metricId of METRICS_FOR_SUMMARY) {
    let bestSrc = null, bestDate = '';
    // Override check: does the override source have ANY non-null sample?
    const overrideSrc = primaryOverride[metricId];
    if (overrideSrc && rowsBySource[overrideSrc]) {
      const overRows = rowsBySource[overrideSrc];
      for (let i = overRows.length - 1; i >= 0; i--) {
        if (isSummaryEligibleRow(overRows[i], metricId, todayISO)) { bestSrc = overrideSrc; break; }
      }
    }
    if (!bestSrc) {
      for (const [sid, rows] of Object.entries(rowsBySource)) {
        for (let i = rows.length - 1; i >= 0; i--) {
          if (isSummaryEligibleRow(rows[i], metricId, todayISO)) {
            const rowDate = rows[i]?.date || '';
            if (rowDate > bestDate) { bestDate = rowDate; bestSrc = sid; }
            break;
          }
        }
      }
    }
    if (!bestSrc) continue;
    pickedPrimary[metricId] = bestSrc;
    const derived = deriveMetric(rowsBySource[bestSrc], metricId, bestSrc, todayISO);
    if (derived) metrics[metricId] = derived;
  }

  return {
    summaryUpdatedAt: new Date().toISOString(),
    sources,
    metrics,
  };
}

// ─────────────────────────────────────────────────────────
// Change gate — decides whether to persist the new summary
// ─────────────────────────────────────────────────────────

export function shouldWriteL2(newSummary, oldSummary) {
  const anomalyEvents = [];

  if (!oldSummary) {
    return { write: true, reason: 'initial', anomalyEvents };
  }

  // Min cadence: force-write after silence so cross-device snapshot can't fossilise.
  const prev = Date.parse(oldSummary.summaryUpdatedAt || '');
  const now = Date.parse(newSummary.summaryUpdatedAt || '');
  if (isFinite(prev) && isFinite(now) && (now - prev) >= MIN_L2_REFRESH_MS) {
    return { write: true, reason: 'min-cadence', anomalyEvents };
  }

  // Per-metric thresholds
  let trippedReason = null;

  // 0a. Metric removed entirely (was in old, gone in new) — fires when the
  // last value for a metric is deleted, so the card disappears from the
  // strip. Without this guard the gate ignores removals and the stale
  // summary persists forever.
  for (const metricId of Object.keys(oldSummary.metrics || {})) {
    if (!newSummary.metrics?.[metricId]) {
      trippedReason = trippedReason || `metric-removed:${metricId}`;
      break;
    }
  }

  for (const metricId of Object.keys(newSummary.metrics || {})) {
    const neu = newSummary.metrics[metricId];
    const old = oldSummary.metrics?.[metricId];
    if (!old) { trippedReason = trippedReason || `new-metric:${metricId}`; continue; }

    // 0b. Primary source flipped (e.g. deleted all manual rhr → Oura takes
    // over). The d7 number may not cross the shift threshold but the source
    // label on the card definitely changes, and the user expects their
    // deletion to show up immediately.
    if (old.primarySource !== neu.primarySource) {
      trippedReason = trippedReason || `source-flip:${metricId}`;
    }

    // 0c. Latest sample advanced. A user who synced 19 minutes ago expects
    // the strip card to show the freshest data point that's actually in
    // their L1 — not whatever snapshot survived the last d7-shift trip.
    // Without this trigger the strip "sticks" between threshold-tripping
    // events: HRV last wrote on Tuesday's d7 shift, today is Friday, and
    // the card still reads "Tuesday's value" even though L1 has Wed/Thu/Fri.
    // The cost is one extra L2 write per metric per day at most — still
    // well inside the few-writes-per-month Evolu sync budget.
    if (neu.latestDate && (!old.latestDate || neu.latestDate > old.latestDate)) {
      // Bootstrap path: legacy summaries written before v1.30.5 don't have
      // `latestDate`. Without the bootstrap branch a stuck card on a
      // pre-existing profile would never unstick — defeating the entire
      // purpose of this trigger for the users it most needs to help.
      trippedReason = trippedReason || `latest-advanced:${metricId}`;
    }

    // 1. d7 rolling-mean delta
    const oldD7 = old.rolling?.d7, newD7 = neu.rolling?.d7;
    if (typeof oldD7 === 'number' && typeof newD7 === 'number' && oldD7 !== 0) {
      const deltaPct = Math.abs((newD7 - oldD7) / oldD7) * 100;
      if (deltaPct >= GATE_D7_DELTA_PCT) {
        trippedReason = trippedReason || `d7-shift:${metricId}`;
      }
    }

    // 2. trend flip
    if (old.trend30d !== neu.trend30d) {
      trippedReason = trippedReason || `trend-flip:${metricId}`;
      anomalyEvents.push({
        ts: now,
        kind: 'trend-flip',
        metricId,
        from: old.trend30d,
        to: neu.trend30d,
        message: `${metricId} trend flipped from ${old.trend30d} to ${neu.trend30d}`,
      });
    }

    // 3. week rollover + weekly delta
    // Compare ISO-week keys derived from latestDate, not weekly.length.
    // weeklyMeans clips to 12 buckets, so once a profile has ≥12 weeks of
    // data the array length stays at 12 forever — the old `weekly.length`
    // diff was always false and the gate was effectively dead code.
    const oldLast = old.weekly?.[old.weekly.length - 1];
    const newLast = neu.weekly?.[neu.weekly.length - 1];
    const oldPrev = old.weekly?.[old.weekly.length - 2];
    if (typeof oldLast === 'number' && typeof newLast === 'number' && typeof oldPrev === 'number' && oldPrev !== 0) {
      const oldWk = old.latestDate ? isoWeekOf(old.latestDate) : null;
      const newWk = neu.latestDate ? isoWeekOf(neu.latestDate) : null;
      const weeksRolled = oldWk && newWk && newWk > oldWk;
      const deltaPct = Math.abs((newLast - oldPrev) / oldPrev) * 100;
      if (weeksRolled && deltaPct >= GATE_WEEKLY_DELTA_PCT) {
        trippedReason = trippedReason || `week-rollover:${metricId}`;
      }
    }
  }

  if (trippedReason) return { write: true, reason: trippedReason, anomalyEvents };
  return { write: false, reason: null, anomalyEvents };
}

// ─────────────────────────────────────────────────────────
// Persist
// ─────────────────────────────────────────────────────────

function appendAnomalyToChangeHistory(events) {
  if (!events || events.length === 0) return;
  const imp = state.importedData;
  if (!imp) return;
  ensureImportedArray(imp, 'changeHistory');
  for (const e of events) {
    appendImportedArrayItem(imp, 'changeHistory', {
      ts: e.ts || Date.now(),
      type: 'wearable',
      kind: e.kind,
      metricId: e.metricId,
      from: e.from, to: e.to,
      message: e.message,
    });
  }
  trimImportedArray(imp, 'changeHistory', CHANGE_HISTORY_CAP);
}

export function persistWearableSummary(newSummary, anomalyEvents) {
  if (!state.importedData) return false;
  state.importedData.wearableSummary = newSummary;
  appendAnomalyToChangeHistory(anomalyEvents);
  saveImportedData();
  return true;
}

// ─────────────────────────────────────────────────────────
// Orchestrator — reads L1, computes, persists if gate trips
// ─────────────────────────────────────────────────────────

export async function syncWearableSummary(profileId, connectedSources, { force = false } = {}) {
  if (!profileId || !connectedSources) return { wrote: false, reason: 'noop-inputs' };
  const sourceIds = Object.keys(connectedSources);
  if (sourceIds.length === 0) return { wrote: false, reason: 'no-sources' };

  // Pull last 90 days for vendor sources. Manual entries are sparse, user-
  // authored rows, so read all history; otherwise a single older pulse/BP
  // reading saves successfully but never creates a visible summary card.
  const endDate = isoDay();
  const start = new Date(); start.setDate(start.getDate() - SUMMARY_WINDOW_DAYS);
  const startDate = isoDay(start);

  const rowsBySource = {};
  for (const sid of sourceIds) {
    const readStartDate = sid === 'manual' ? MANUAL_SUMMARY_START_DATE : startDate;
    try { rowsBySource[sid] = await getDailyRange(profileId, sid, readStartDate, endDate); }
    catch (e) { if (isDebugMode?.()) console.warn(`[wearable-summary] L1 read failed for ${sid}:`, e.message); rowsBySource[sid] = []; }
  }

  // Profile-swap guard: cross-profile contamination guard. If the user
  // switched profiles during the IDB reads, the live `state.importedData`
  // now belongs to a DIFFERENT profile. Persisting the freshly-computed
  // summary into it would write A's metrics under B's localStorage key.
  if (state.currentProfile !== profileId) {
    if (isDebugMode?.()) console.log(`[wearable-summary] aborting — profile changed mid-read (${profileId} → ${state.currentProfile})`);
    return { wrote: false, reason: 'profile-changed' };
  }

  const primaryOverride = state.importedData?.wearablePrimaryOverride || {};
  const newSummary = computeWearableSummary(rowsBySource, connectedSources, primaryOverride);
  const old = state.importedData?.wearableSummary || null;
  // `force` bypasses the gate. Used by user-driven manual syncs so the
  // strip never appears stuck. The scheduled background path still goes
  // through `shouldWriteL2` so the Evolu write budget stays small.
  const gate = force
    ? { write: true, reason: 'force', anomalyEvents: [] }
    : shouldWriteL2(newSummary, old);

  if (!gate.write) return { wrote: false, reason: 'gate-not-tripped', summary: newSummary };

  persistWearableSummary(newSummary, gate.anomalyEvents);
  if (isDebugMode?.()) console.log(`[wearable-summary] L2 written: ${gate.reason}`);
  return { wrote: true, reason: gate.reason, summary: newSummary, anomalies: gate.anomalyEvents };
}
