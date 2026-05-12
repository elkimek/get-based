// wearables-manual.js — Manual entry as a first-class wearable source.
//
// Treats user-entered weight / BP / pulse as rows in the wearables IndexedDB
// store with `source: 'manual'`. Unifies the old `importedData.biometrics`
// time-series with the wearables architecture so they render, sync, and chart
// through the same pipeline as Oura/Withings/Fitbit data.
//
// This module is intentionally small — it exposes a log helper + a one-time
// migration. The dashboard strip, per-metric source picker, and AI context
// layer all pick up 'manual' rows via the existing generic summary logic.

import { upsertDaily, upsertDailyBatch, countSource, getDaily, deleteDaily, getMeta, setMeta } from './wearables-store.js';
import { state } from './state.js';
import { saveImportedData } from './data.js';
import { isoDay } from './wearables-oura.js';

// Merge helper — read the existing manual row for `date` (if any), shallow-merge
// the new patch on top, write back. Needed because IDB `put` replaces the whole
// row; a user who logs BP in the morning and weight in the evening otherwise
// loses the morning's BP when the weight upsert overwrites the row.
async function _mergeManualRow(profileId, date, patch) {
  const existing = await getDaily(profileId, 'manual', date);
  const merged = { ...(existing || {}), source: 'manual', date, ...patch };
  await upsertDaily(profileId, merged);
}

// Canonical metrics manual entry covers. All four already exist in
// CANONICAL_METRICS (wearable-adapters.js) — this list just scopes what the
// manual UI exposes for entry.
export const MANUAL_METRICS = ['weight', 'bp_systolic', 'bp_diastolic', 'rhr'];

// Optional context tags a user can attach to a reading. Sensors can't infer
// these — a BP of 140/90 means wildly different things "resting first thing
// in the morning" vs "immediately post-workout" vs "in a stressful meeting."
// The tag is the information manual entry BEATS wearables-only tracking on.
// Tags are strictly informational for display + AI context; they don't gate
// any storage or summary logic. Persisted per-row as an array so multiple
// tags on one reading are supported (e.g. post-workout + stress).
export const MANUAL_TAGS = ['resting', 'morning-fasted', 'post-workout', 'stress'];

// One-time migration flag key in the wearables meta store.
const MIGRATION_FLAG = 'biometrics-migrated-v1';

/**
 * Ensure `wearableConnections.manual` exists so listConnectedSources() and
 * the dashboard strip surface 'manual' as a source. Mirrors the pattern
 * wearables-apple-health uses — no OAuth token, just a connectedAt stamp.
 * Refreshes lastSyncAt + coverageDays on every call.
 */
export function ensureManualConnection({ coverageDays = 0 } = {}) {
  if (!state.importedData) return;
  if (!state.importedData.wearableConnections) state.importedData.wearableConnections = {};
  const prev = state.importedData.wearableConnections.manual;
  const nowISO = new Date().toISOString();
  state.importedData.wearableConnections.manual = {
    source: 'manual',
    connectedAt: prev?.connectedAt || nowISO,
    lastSyncAt: Date.now(),
    coverageDays: Math.max(coverageDays, prev?.coverageDays || 0),
    needsReauth: false,
  };
  saveImportedData();
}

/**
 * Log a single manual measurement.
 *   metric: one of MANUAL_METRICS
 *   date:   'YYYY-MM-DD' — defaults to today
 *   value:  number (unit is always SI — kg, mmHg, bpm)
 *
 * Rows are upserted on the [source, date] compound key. Logging weight
 * twice on the same day overwrites — same behaviour as a wearable sync.
 */
export async function logManualMetric(profileId, metric, { date, value, tags, note }) {
  if (!MANUAL_METRICS.includes(metric)) {
    throw new Error(`logManualMetric: unknown metric "${metric}"`);
  }
  if (value == null || !isFinite(value)) {
    throw new Error('logManualMetric: value must be a finite number');
  }
  const d = date || isoDay();
  const patch = { [metric]: value };
  if (Array.isArray(tags) && tags.length) patch.tags = _sanitizeTags(tags);
  const noteClean = _sanitizeNote(note);
  if (noteClean) patch.note = noteClean;
  await _mergeManualRow(profileId, d, patch);
  ensureManualConnection();
}

/**
 * Log BP as a pair — matches how home cuffs report systolic + diastolic
 * (+ optional pulse) in a single reading. One row per date.
 */
export async function logManualBP(profileId, { date, systolic, diastolic, pulse, tags, note }) {
  const d = date || isoDay();
  const row = { source: 'manual', date: d };
  if (systolic != null && isFinite(systolic)) row.bp_systolic = systolic;
  if (diastolic != null && isFinite(diastolic)) row.bp_diastolic = diastolic;
  if (pulse != null && isFinite(pulse)) row.rhr = pulse;
  if (!row.bp_systolic && !row.bp_diastolic && !row.rhr) return;
  if (Array.isArray(tags) && tags.length) row.tags = _sanitizeTags(tags);
  const noteClean = _sanitizeNote(note);
  if (noteClean) row.note = noteClean;
  // Merge rather than replace — preserves same-day weight from a prior entry.
  const { source: _s, date: _d, ...patch } = row;
  await _mergeManualRow(profileId, d, patch);
  ensureManualConnection();
}

// Trim + cap so a runaway paste doesn't bloat the row. 500 chars covers
// "fasted 14h, just after wake, post-bath, third reading" type context.
function _sanitizeNote(note) {
  if (typeof note !== 'string') return '';
  const trimmed = note.trim();
  return trimmed.length > 500 ? trimmed.slice(0, 500) : trimmed;
}

// Keep only recognized tags so a typo'd or stale chip can't poison the row.
// Dedup-preserves order. Intentionally silent — tags are cosmetic, don't
// throw just because the user clicked something odd.
function _sanitizeTags(tags) {
  const seen = new Set();
  const out = [];
  for (const t of tags) {
    if (typeof t === 'string' && MANUAL_TAGS.includes(t) && !seen.has(t)) {
      seen.add(t);
      out.push(t);
    }
  }
  return out;
}

/**
 * One-time migration — walks `importedData.biometrics.{weight,bp,pulse}` and
 * writes each entry into the wearables IndexedDB with source: 'manual'.
 *
 * Idempotent: tags the wearables meta store with a flag after a successful
 * run so re-opening the app doesn't re-insert. Returns a small summary for
 * telemetry / debug output.
 *
 * Does NOT delete the original biometrics data — the Edit Client modal keeps
 * writing there until Commit 4 of the Health Metrics unification.
 */
export async function migrateBiometricsToManual(profileId, biometrics) {
  if (!profileId) return { skipped: 'no-profile' };
  const alreadyRan = await getMeta(profileId, MIGRATION_FLAG);
  if (alreadyRan) return { skipped: 'already-migrated' };
  if (!biometrics) {
    await setMeta(profileId, MIGRATION_FLAG, { at: Date.now(), counts: {} });
    return { skipped: 'no-biometrics' };
  }

  // Group existing time-series entries by date so we write ONE row per
  // date rather than three (matches how wearable adapters emit).
  const byDate = new Map();
  const pushInto = (date, patch) => {
    if (!date) return;
    const existing = byDate.get(date) || { source: 'manual', date };
    byDate.set(date, { ...existing, ...patch });
  };

  const weight = Array.isArray(biometrics.weight) ? biometrics.weight : [];
  const bp     = Array.isArray(biometrics.bp)     ? biometrics.bp     : [];
  const pulse  = Array.isArray(biometrics.pulse)  ? biometrics.pulse  : [];

  for (const e of weight) {
    if (e?.date && typeof e.value === 'number' && isFinite(e.value)) {
      // Units in the old store can be 'kg' or 'lb'; canonicalize to kg.
      const v = e.unit === 'lb' ? e.value / 2.20462 : e.value;
      pushInto(e.date, { weight: v });
    }
  }
  for (const e of bp) {
    if (!e?.date) continue;
    const patch = {};
    if (typeof e.systolic  === 'number' && isFinite(e.systolic))  patch.bp_systolic  = e.systolic;
    if (typeof e.diastolic === 'number' && isFinite(e.diastolic)) patch.bp_diastolic = e.diastolic;
    if (Object.keys(patch).length) pushInto(e.date, patch);
  }
  for (const e of pulse) {
    if (e?.date && typeof e.value === 'number' && isFinite(e.value)) {
      pushInto(e.date, { rhr: e.value });
    }
  }

  const rows = [...byDate.values()];
  if (rows.length) {
    await upsertDailyBatch(profileId, rows);
    // Surface 'manual' as a connected source so the dashboard strip and
    // Settings → Integrations see it. Coverage = distinct dates migrated.
    ensureManualConnection({ coverageDays: rows.length });
  }

  const counts = { weight: weight.length, bp: bp.length, pulse: pulse.length, rows: rows.length };
  await setMeta(profileId, MIGRATION_FLAG, { at: Date.now(), counts });
  return { migrated: true, counts };
}

/**
 * Remove a single metric field from the manual row for `date`. If the row
 * has no remaining metric fields afterward, the row itself is deleted so
 * the summary doesn't count it as coverage. Used by the Edit Client modal
 * when a user deletes a biometric entry so the wearable strip stays in sync.
 */
export async function deleteManualMetric(profileId, metric, date) {
  if (!MANUAL_METRICS.includes(metric)) {
    throw new Error(`deleteManualMetric: unknown metric "${metric}"`);
  }
  const existing = await getDaily(profileId, 'manual', date);
  if (!existing) return;
  const { source, date: _d, importedAt, ...rest } = existing;
  delete rest[metric];
  // Any metric field left? If so, write updated row. If nothing measurable
  // remains, delete the row outright (not a stub) so IDB quota + summary
  // coverageDays stay accurate. Tags are also stripped — they annotated a
  // reading that no longer exists, so keeping them would be phantom context.
  const hasOtherMetrics = MANUAL_METRICS.some((m) => rest[m] != null);
  if (hasOtherMetrics) {
    await upsertDaily(profileId, { source: 'manual', date, ...rest });
  } else {
    await deleteDaily(profileId, 'manual', date);
  }
}

/**
 * Trigger an L2 summary rebuild so the dashboard strip reflects a write or
 * delete that just happened in the Edit Client modal (or elsewhere). The
 * L2 change-gate prevents redundant writes; call it eagerly after any manual
 * entry write.
 */
export async function refreshManualSummary(profileId) {
  try {
    const { syncWearableSummary } = await import('./wearables-summary.js');
    const { listConnectedSources } = await import('./wearables-connect.js');
    await syncWearableSummary(profileId, listConnectedSources());
  } catch { /* non-fatal */ }
}

/**
 * Is `manual` a "connected" source for this profile? True when any manual
 * row exists in the wearables IDB. Used by the wearables-connect façade so
 * the dashboard strip and Settings → Integrations panel list Manual
 * alongside Oura/Withings without needing an OAuth flow.
 */
export async function hasManualData(profileId) {
  try {
    const n = await countSource(profileId, 'manual');
    return n > 0;
  } catch {
    return false;
  }
}
