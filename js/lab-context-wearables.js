// @ts-check
// lab-context-wearables.js — Wearable AI-context summary and agent-series helpers.

import { state } from './state.js';
import { CANONICAL_METRICS, DEFAULT_METRIC_ORDER } from './wearable-adapters.js';
import {
  CONTEXT_SOURCE_IDS,
  isContextSourceEnabled,
  setContextSourceEnabled,
} from './context-source-registry.js';
import { getDailyRange } from './wearables-store.js';
import { getActiveProfileId } from './profile.js';

const PROFILE_SLEEP_DURATION_RANGES = {
  '<5h': [null, 5],
  '5-6h': [5, 6],
  '6-7h': [6, 7],
  '7-8h': [7, 8],
  '8-9h': [8, 9],
  '9+h': [9, null],
};

function recentMetricValue(metric) {
  const value = metric?.rolling?.d7 ?? metric?.latest;
  if (value == null || value === '') return null;
  return Number.isFinite(Number(value)) ? Number(value) : null;
}

/**
 * Detect only strong disagreements between a user's usual sleep profile and
 * recent tracked data. Neither source wins: self-report describes the usual
 * experience while wearables describe a recent, device-dependent period.
 *
 * @param {any} sleepRest
 * @param {any} wearableSummary
 * @returns {null | { reasons: string[], summary: string, trackedDurationHours: number | null, trackedSleepScore: number | null }}
 */
export function getSleepContextMismatch(sleepRest, wearableSummary) {
  if (!sleepRest || !wearableSummary?.metrics) return null;
  const trackedMinutes = recentMetricValue(wearableSummary.metrics.sleep_total_min);
  const trackedDurationHours = trackedMinutes == null ? null : trackedMinutes / 60;
  const trackedSleepScore = recentMetricValue(wearableSummary.metrics.sleep_score);
  const reasons = [];
  const selectedRange = PROFILE_SLEEP_DURATION_RANGES[sleepRest.duration];
  if (selectedRange && trackedDurationHours != null) {
    const [low, high] = selectedRange;
    const outsideLow = low != null && trackedDurationHours < low - 0.75;
    const outsideHigh = high != null && trackedDurationHours > high + 0.75;
    if (outsideLow || outsideHigh) {
      reasons.push(`Profile says ${sleepRest.duration}, while recent tracked sleep averages ${trackedDurationHours.toFixed(1)}h`);
    }
  }
  if (trackedSleepScore != null) {
    const quality = String(sleepRest.quality || '').toLowerCase();
    if ((quality === 'excellent' && trackedSleepScore < 70)
      || (quality === 'good' && trackedSleepScore < 55)
      || (quality === 'poor' && trackedSleepScore >= 80)) {
      reasons.push(`Profile says ${quality} quality, while the recent tracked sleep score is ${Math.round(trackedSleepScore)}/100`);
    }
  }
  if (!reasons.length) return null;
  return {
    reasons,
    summary: `${reasons.join('. ')}. Treat this as a profile-versus-tracked-data mismatch; check timing and device coverage before interpreting.`,
    trackedDurationHours,
    trackedSleepScore,
  };
}

function _biologyScoreContextSettings() {
  const imported = /** @type {any} */ (state.importedData || {});
  if (!imported.biologyScoreContextSettings || typeof imported.biologyScoreContextSettings !== 'object') {
    imported.biologyScoreContextSettings = {};
  }
  return imported.biologyScoreContextSettings;
}

// Default ON when wearables are connected — opposite of the group-filter default
// (which is OFF). Users turn OFF via Context → Manage → Data sources.
// Per-profile so each profile keeps its own preference (e.g. "Test" profile
// excludes wearables from AI context, your "main" profile includes them).
export function isWearableContextEnabled() {
  return isContextSourceEnabled(CONTEXT_SOURCE_IDS.WEARABLES, {
    defaultValue: state.importedData?.biologyScoreContextSettings?.includeBodyContext !== false,
  });
}

export function setWearableContextEnabledState(on) {
  setContextSourceEnabled(CONTEXT_SOURCE_IDS.WEARABLES, on);
  _biologyScoreContextSettings().includeBodyContext = !!on;
}

// Metric labels + units are derived from the canonical registry (single source
// of truth in wearable-adapters.js). Adding a new canonical metric automatically
// flows into the AI context — no duplicated tables to drift out of sync.
function metricLabel(mid) {
  const c = CANONICAL_METRICS[mid];
  if (!c) return mid;
  return c.sub ? `${c.label} (${c.sub})` : c.label;
}

function metricUnit(mid) {
  return CANONICAL_METRICS[mid]?.unit || '';
}

// Builds ~200-token summary of wearable state. Shape is deliberately terse so
// it can be included in every prompt without blowing context budget.
export function buildWearableContext(importedData) {
  const summary = importedData?.wearableSummary;
  if (!summary || !summary.sources || Object.keys(summary.sources).length === 0) return '';
  if (!summary.metrics || Object.keys(summary.metrics).length === 0) return '';

  const sourceNames = Object.keys(summary.sources);
  const maxCov = Math.max(0, ...sourceNames.map(s => summary.sources[s].coverageDays || 0));
  const lines = [`## Wearables (${sourceNames.join(' + ')}, ${maxCov}d coverage)`];

  // Cluster roll-ups (#143 + Withings full-coverage). Body composition
  // and sleep architecture each collapse into a single line — eight
  // body-comp + nine sleep metrics × ~50 bytes per line would balloon the
  // wearable section by ~400 bytes / ~100 tokens. The detail modal still
  // drills each metric individually; rolling up just keeps the AI prompt
  // budget honest.
  const BODY_COMP_KEYS = ['body_fat_pct', 'fat_mass_kg', 'muscle_mass_kg', 'lean_mass_kg', 'bone_mass_kg', 'water_mass_kg', 'visceral_fat', 'nerve_health_score'];
  const SLEEP_ARCH_KEYS = ['sleep_total_min', 'sleep_deep_min', 'sleep_light_min', 'sleep_rem_min', 'sleep_awake_min', 'sleep_hr_avg', 'sleep_breathing_rate', 'sleep_snoring_min', 'sleep_breath_disturb'];
  const ROLLED_UP = new Set([...BODY_COMP_KEYS, ...SLEEP_ARCH_KEYS]);
  const bodyCompPresent = BODY_COMP_KEYS.filter(k => summary.metrics[k]);
  const sleepArchPresent = SLEEP_ARCH_KEYS.filter(k => summary.metrics[k]);

  for (const [mid, m] of Object.entries(summary.metrics)) {
    if (ROLLED_UP.has(mid)) continue; // rolled up below
    const label = metricLabel(mid);
    const unit = metricUnit(mid);
    const deltaPct = m.baseline ? ((m.latest - m.baseline) / m.baseline * 100) : 0;
    const arrow = deltaPct > 0.5 ? '↑' : deltaPct < -0.5 ? '↓' : '→';
    const deltaLabel = `${arrow}${Math.abs(deltaPct).toFixed(0)}%`;
    const unitStr = unit ? ' ' + unit : '';
    lines.push(`${label}: ${m.latest}${unitStr} latest · baseline ${m.baseline} · ${deltaLabel} · ${m.trend30d} 30d`);
  }

  // Body composition roll-up.
  if (bodyCompPresent.length) {
    const shortLabels = {
      body_fat_pct: 'fat', fat_mass_kg: 'fatkg', muscle_mass_kg: 'muscle', lean_mass_kg: 'lean',
      bone_mass_kg: 'bone', water_mass_kg: 'water', visceral_fat: 'visceral', nerve_health_score: 'nerve',
    };
    const parts = bodyCompPresent.map(k => {
      const m = summary.metrics[k];
      const unit = metricUnit(k);
      const v = unit === '%' ? `${m.latest}%`
              : unit === 'kg' ? `${m.latest}kg`
              : `${m.latest}`;
      return `${shortLabels[k] || k} ${v}`;
    });
    lines.push(`Body comp: ${parts.join(' / ')}`);
  }

  // Sleep architecture roll-up — Withings nightly stages + breathing.
  if (sleepArchPresent.length) {
    const shortLabels = {
      sleep_total_min: 'total', sleep_deep_min: 'deep', sleep_light_min: 'light',
      sleep_rem_min: 'REM', sleep_awake_min: 'awake', sleep_hr_avg: 'HR',
      sleep_breathing_rate: 'br', sleep_snoring_min: 'snore', sleep_breath_disturb: 'apnea',
    };
    const parts = sleepArchPresent.map(k => {
      const m = summary.metrics[k];
      const unit = metricUnit(k);
      const v = unit === 'min' ? `${m.latest}m`
              : unit === 'bpm' ? `${m.latest}bpm`
              : unit === 'rpm' ? `${m.latest}rpm`
              : `${m.latest}`;
      return `${shortLabels[k] || k} ${v}`;
    });
    lines.push(`Sleep arch: ${parts.join(' / ')}`);
  }

  // Compact weekly series for every default-order metric that has data — lets
  // the AI see shape without per-day noise. Walks the registry order so new
  // canonical metrics get included automatically.
  const weeklySeriesLines = [];
  for (const mid of DEFAULT_METRIC_ORDER) {
    const w = summary.metrics[mid]?.weekly;
    if (w && w.length >= 2) weeklySeriesLines.push(`  ${metricLabel(mid)}: ${w.slice(-6).join('→')}`);
  }
  if (weeklySeriesLines.length > 0) {
    lines.push('Weekly trend (last 6w):');
    lines.push(...weeklySeriesLines);
  }

  // Recent wearable anomalies from changeHistory (last 5, most recent first).
  const hist = importedData?.changeHistory || [];
  const wearableEvents = hist.filter(e => e?.type === 'wearable').slice(-5).reverse();
  if (wearableEvents.length > 0) {
    lines.push('Recent anomalies:');
    for (const e of wearableEvents) {
      const when = e.ts ? new Date(e.ts).toISOString().slice(0, 10) : '';
      lines.push(`  - ${when}: ${e.message || (e.kind + ' ' + (e.metricId || ''))}`);
    }
  }

  return lines.join('\n');
}

// ═════════════════════════════════════════════════════════════════════════
// AGENT-FACING WEARABLE DAILY-SERIES SECTION
// ═════════════════════════════════════════════════════════════════════════
// The L2 summary is great for the in-app chat (~200 tokens, every prompt) but
// agents doing time-series reasoning need the actual daily values. This async
// builder reads L1 IDB rows and emits a pivoted matrix:
//
//   [section:wearables-series-30d]
//   ## Wearables — 30-day series (newest last; — = no reading)
//   HRV ms (oura): 33→35→32→...→39  (30 values)
//   Resting HR bpm (manual): —→—→103→...→103
//   ...
//   [/section:wearables-series-30d]
//
// Lives in browser only — L1 IDB never syncs. The browser pushes the rendered
// section to the gateway via pushContextToGateway whenever the agent series
// preference is on.
//
// Per-profile preference; default off (it adds ~1500 tokens to every agent
// prompt vs the always-on ~200-token summary).

const AGENT_SERIES_DEFAULT_DAYS = 30;
const AGENT_SERIES_VALID = new Set(['off', '7', '30', '90']);

function _agentAccessState() {
  const imported = /** @type {any} */ (state.importedData || {});
  const aa = imported.agentAccess;
  return aa && typeof aa === 'object' ? aa : null;
}

// Valid positive synced windows. Keep this in sync with AGENT_SERIES_DAYS in
// sync-messenger.js (that canonical list also includes 0 for explicit off).
// Returning 0 here means "synced off"; returning null means "no synced pref,
// fall through to legacy localStorage".
const AGENT_SERIES_SYNC_POSITIVE_DAYS = [7, 30, 90];

function _syncedAgentSeriesDays() {
  const imported = /** @type {any} */ (state.importedData || {});
  const split = imported.agentAccessWearableSeriesDays;
  if (typeof split === 'number') return AGENT_SERIES_SYNC_POSITIVE_DAYS.includes(split) ? split : 0;
  const aa = _agentAccessState();
  if (typeof aa?.wearableSeriesDays === 'number') return AGENT_SERIES_SYNC_POSITIVE_DAYS.includes(aa.wearableSeriesDays) ? aa.wearableSeriesDays : 0;
  return null;
}

function _agentSeriesKey() {
  const pid = localStorage.getItem('labcharts-active-profile') || 'default';
  return `labcharts-${pid}-agent-wearable-series`;
}

// Tri-state preference: 'off' | '7' | '30' | '90'. Legacy 'on' migrates to
// '30' (the v1.27.0 default). The split synced preference
// agentAccessWearableSeriesDays wins when present; legacy
// agentAccess.wearableSeriesDays remains a read-only migration fallback.
export function getAgentWearableSeriesDays() {
  const synced = _syncedAgentSeriesDays();
  if (typeof synced === 'number') return synced;
  const v = localStorage.getItem(_agentSeriesKey());
  // Legacy pre-tristate value: migrate/read as the old 30-day default only
  // when no synced preference exists.
  if (v === 'on') return AGENT_SERIES_DEFAULT_DAYS;
  if (v === 'off' || v === null) return 0;
  if (AGENT_SERIES_VALID.has(v)) return v === 'off' ? 0 : Number(v);
  return 0;
}

export function setAgentWearableSeriesDays(days) {
  // Accept 0 / 7 / 30 / 90 numerically, plus 'off' string for clarity.
  const v = (days === 0 || days === 'off') ? 'off' : String(days);
  if (!AGENT_SERIES_VALID.has(v)) return;
  localStorage.setItem(_agentSeriesKey(), v);
}

// Back-compat shims — the boolean API is what Settings used in v1.27. The
// new tri-state replaces it; keep these around so a stale page.html with
// the old toggle markup doesn't crash.
export function isAgentWearableSeriesEnabled() { return getAgentWearableSeriesDays() > 0; }
export function setAgentWearableSeriesEnabled(on) { setAgentWearableSeriesDays(on ? AGENT_SERIES_DEFAULT_DAYS : 0); }

export async function buildWearableSeriesSection(days, options = {}) {
  if (!options.ignoreContextToggles && !isWearableContextEnabled()) return '';
  // If `days` not provided, read user preference. 0/off = no section.
  const N = (days != null) ? days : getAgentWearableSeriesDays();
  if (!N || N <= 0) return '';
  days = N;
  const summary = state.importedData?.wearableSummary;
  if (!summary?.metrics || Object.keys(summary.metrics).length === 0) return '';

  const profileId = getActiveProfileId();
  if (!profileId) return '';

  const today = new Date().toISOString().slice(0, 10);
  const startD = new Date();
  startD.setUTCDate(startD.getUTCDate() - (days - 1));
  const startStr = startD.toISOString().slice(0, 10);

  // Build the date axis once (chronological, oldest → newest).
  const dates = [];
  const cursor = new Date(startStr + 'T00:00:00Z');
  const endDate = new Date(today + 'T00:00:00Z');
  while (cursor <= endDate) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  // Each metric reads from its primary source (per the L2 picker / override).
  // Group sources so we don't pull the same IDB cursor twice.
  const sourcesNeeded = new Set();
  for (const m of Object.values(summary.metrics)) {
    if (m.primarySource) sourcesNeeded.add(m.primarySource);
  }
  const rowsBySource = {};
  for (const sid of sourcesNeeded) {
    try { rowsBySource[sid] = await getDailyRange(profileId, sid, startStr, today); }
    catch { rowsBySource[sid] = []; }
  }

  // Pivot: one line per metric, chronological values separated by → (no-data = —).
  // Values rounded to 1dp to keep tokens tight without losing meaningful precision
  // for HRV (often 30-50 ms range, ~30 % is noise) or RHR.
  const lines = [];
  for (const mid of DEFAULT_METRIC_ORDER) {
    const m = summary.metrics[mid];
    if (!m) continue;
    const rows = rowsBySource[m.primarySource] || [];
    if (rows.length === 0) continue;
    const byDate = new Map(rows.map(r => [r.date, r[mid]]));
    let nonNullCount = 0;
    const series = dates.map(d => {
      const v = byDate.get(d);
      if (typeof v !== 'number' || !isFinite(v)) return '—';
      nonNullCount++;
      const r = Math.round(v * 10) / 10;
      return Number.isInteger(r) ? String(r) : r.toFixed(1);
    });
    if (nonNullCount === 0) continue; // metric has no daily data in window
    const label = metricLabel(mid);
    const unit = metricUnit(mid);
    const labelStr = `${label}${unit ? ' ' + unit : ''} (${m.primarySource})`;
    lines.push(`${labelStr}: ${series.join('→')}`);
  }

  // Manual-entry context — when the user logs a reading by hand they can
  // attach tags (resting / morning-fasted / post-workout / stress) and a
  // free-text note ("retook because cuff felt loose", "different arm"). That
  // context is the thing manual entry beats wearables-only tracking on; the
  // AI sees the raw row values but not its qualitative framing unless we
  // surface it here. Only emit when at least one row in the window has a
  // tag or note — many users log values without context, no need to clutter.
  const manualRows = rowsBySource['manual'] || [];
  const contextRows = manualRows.filter(r => {
    if (r.date < startStr || r.date > today) return false;
    const hasTags = Array.isArray(r.tags) && r.tags.length > 0;
    const hasNote = typeof r.note === 'string' && r.note.trim().length > 0;
    return hasTags || hasNote;
  }).sort((a, b) => a.date.localeCompare(b.date));
  let contextBlock = '';
  if (contextRows.length > 0) {
    const contextLines = contextRows.map(r => {
      const parts = [];
      if (Array.isArray(r.tags) && r.tags.length) parts.push(`tags: ${r.tags.join(', ')}`);
      if (typeof r.note === 'string' && r.note.trim()) parts.push(`note: "${r.note.trim()}"`);
      return `${r.date} — ${parts.join('; ')}`;
    });
    contextBlock = `\n\n### Manual-entry context (qualifies same-day values above)\n${contextLines.join('\n')}`;
  }

  if (lines.length === 0 && !contextBlock) return '';
  if (lines.length === 0) {
    // Context exists but no numeric series fit the window — still worth
    // shipping the context (the AI can correlate it against L2 latest values).
    const tag = `wearables-series-${days}d`;
    return `[section:${tag}]\n## Wearables — manual-entry context (${days}d)${contextBlock}\n[/section:${tag}]`;
  }

  const tag = `wearables-series-${days}d`;
  return `[section:${tag}]\n## Wearables — ${days}-day daily series (oldest→newest, "—" = no reading)\n${lines.join('\n')}${contextBlock}\n[/section:${tag}]`;
}
