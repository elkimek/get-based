// @ts-check
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

import {
  upsertDaily,
  upsertDailyBatch,
  countSource,
  getDaily,
  getDailyRange,
  deleteDaily,
  clearSource,
  getMeta,
  setMeta,
} from './wearables-store.js';
import { state } from './state.js';
import { saveImportedData } from './data.js';
import { isoDay } from './wearable-adapters.js';
import { syncWearableSummary } from './wearables-summary.js';

// Merge helper — read the existing manual row for `date` (if any), shallow-merge
// the new patch on top, write back. Needed because IDB `put` replaces the whole
// row; a user who logs BP in the morning and weight in the evening otherwise
// loses the morning's BP when the weight upsert overwrites the row.
async function _mergeManualRow(profileId, date, patch) {
  const existing = await getDaily(profileId, 'manual', date);
  const base = { ...(existing || {}) };
  // A synced deletion can land while this tab is still open. Do not let a
  // later same-day weight/BP write preserve an already-deleted pulse from the
  // device-local row. Explicitly re-added fields have their marker cleared
  // before this helper runs and therefore survive.
  for (const metric of MANUAL_METRICS) {
    if (isManualMetricTombstoned(metric, date)) delete base[metric];
  }
  const merged = { ...base, source: 'manual', date, ...patch };
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
const MANUAL_TOMBSTONE_FIELD = 'manualMetricTombstones';
const MANUAL_HISTORY_START = '1970-01-01';
const MANUAL_HISTORY_END = '9999-12-31';
const ISO_DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function manualMetricTombstoneKey(metric, date) {
  if (!MANUAL_METRICS.includes(metric) || typeof date !== 'string'
      || (date !== 'all' && !ISO_DAY_RE.test(date))) return null;
  return `${metric}.${date}`;
}

function _manualMetricTombstones() {
  const imported = state.importedData;
  if (!imported || typeof imported !== 'object') return null;
  const current = imported[MANUAL_TOMBSTONE_FIELD];
  if (current && typeof current === 'object' && !Array.isArray(current)) return current;
  imported[MANUAL_TOMBSTONE_FIELD] = {};
  return imported[MANUAL_TOMBSTONE_FIELD];
}

export function isManualMetricTombstoned(metric, date) {
  const key = manualMetricTombstoneKey(metric, date);
  if (!key) return false;
  const tombstones = state.importedData?.[MANUAL_TOMBSTONE_FIELD];
  if (!tombstones || typeof tombstones !== 'object') return false;
  // An exact zero is an intentional re-add and wins over an earlier
  // delete-all marker. Otherwise the metric-wide marker protects dates this
  // device never had locally and therefore could not enumerate at deletion.
  if (Object.prototype.hasOwnProperty.call(tombstones, key)) {
    return Number.isFinite(Number(tombstones[key])) && Number(tombstones[key]) > 0;
  }
  const allKey = manualMetricTombstoneKey(metric, 'all');
  const allValue = allKey ? tombstones[allKey] : 0;
  return Number.isFinite(Number(allValue)) && Number(allValue) > 0;
}

function _recordManualMetricTombstone(metric, date, deletedAt = Date.now()) {
  const key = manualMetricTombstoneKey(metric, date);
  const tombstones = _manualMetricTombstones();
  if (!key || !tombstones) return false;
  const timestamp = Number(deletedAt);
  if (!Number.isFinite(timestamp) || timestamp <= 0) return false;
  tombstones[key] = Math.max(Number(tombstones[key]) || 0, timestamp);
  return true;
}

function _clearManualMetricTombstone(metric, date) {
  const key = manualMetricTombstoneKey(metric, date);
  const tombstones = state.importedData?.[MANUAL_TOMBSTONE_FIELD];
  if (!key || !tombstones || typeof tombstones !== 'object') return false;
  const allKey = manualMetricTombstoneKey(metric, 'all');
  const hasMetricWideDelete = !!allKey && Number(tombstones[allKey]) > 0;
  if (!Object.prototype.hasOwnProperty.call(tombstones, key) && !hasMetricWideDelete) return false;
  // Keep an explicit zero rather than deleting the map key. A device that
  // first learned about the deletion from pull may not have the key in its
  // push-side delta snapshot; zero produces an unambiguous row update that
  // wins over the older positive deletion clock everywhere.
  tombstones[key] = 0;
  return true;
}

function _legacyBiometricField(metric) {
  if (metric === 'weight') return 'weight';
  if (metric === 'rhr') return 'pulse';
  if (metric === 'bp_systolic' || metric === 'bp_diastolic') return 'bp';
  return null;
}

function _removeLegacyBiometric(metric, date) {
  const field = _legacyBiometricField(metric);
  const biometrics = state.importedData?.biometrics;
  if (!field || !biometrics || !Array.isArray(biometrics[field])) return false;
  if (field === 'bp') {
    const component = metric === 'bp_systolic' ? 'systolic' : 'diastolic';
    let changed = false;
    const remaining = [];
    for (const entry of biometrics.bp) {
      if (!entry || typeof entry !== 'object' || entry.date !== date
          || !Object.prototype.hasOwnProperty.call(entry, component)) {
        remaining.push(entry);
        continue;
      }
      const next = { ...entry };
      delete next[component];
      changed = true;
      if (next.systolic != null || next.diastolic != null) remaining.push(next);
    }
    biometrics.bp = remaining;
    return changed;
  }
  const before = biometrics[field].length;
  biometrics[field] = biometrics[field].filter(entry => entry?.date !== date);
  return biometrics[field].length !== before;
}

/**
 * Apply synced deletion markers to both device-local manual rows and the
 * legacy synced biometrics arrays. This runs before the one-time migration
 * check: every device must honor a deletion received after it had already
 * migrated the old pulse locally.
 */
export async function reconcileManualMetricTombstones(profileId) {
  if (!profileId || state.currentProfile !== profileId) return { skipped: 'inactive-profile' };
  const tombstones = state.importedData?.[MANUAL_TOMBSTONE_FIELD];
  if (!tombstones || typeof tombstones !== 'object' || Array.isArray(tombstones)
      || Object.keys(tombstones).length === 0) {
    return { prunedRows: 0, prunedLegacy: 0 };
  }

  let prunedRows = 0;
  const rows = await getDailyRange(profileId, 'manual', MANUAL_HISTORY_START, MANUAL_HISTORY_END);
  for (const row of rows) {
    const next = { ...row };
    let changed = false;
    for (const metric of MANUAL_METRICS) {
      if (isManualMetricTombstoned(metric, row.date) && next[metric] != null) {
        delete next[metric];
        changed = true;
      }
    }
    if (!changed) continue;
    prunedRows++;
    if (MANUAL_METRICS.some(metric => next[metric] != null)) await upsertDaily(profileId, next);
    else await deleteDaily(profileId, 'manual', row.date);
  }

  let prunedLegacy = 0;
  const biometrics = state.importedData?.biometrics;
  if (biometrics && typeof biometrics === 'object') {
    const legacyPairs = [
      ['weight', 'weight'],
      ['pulse', 'rhr'],
    ];
    for (const [field, metric] of legacyPairs) {
      if (!Array.isArray(biometrics[field])) continue;
      const before = biometrics[field].length;
      biometrics[field] = biometrics[field].filter(entry => !isManualMetricTombstoned(metric, entry?.date));
      prunedLegacy += before - biometrics[field].length;
    }
    if (Array.isArray(biometrics.bp)) {
      const remaining = [];
      for (const entry of biometrics.bp) {
        if (!entry || typeof entry !== 'object') {
          remaining.push(entry);
          continue;
        }
        const next = { ...entry };
        let changed = false;
        if (isManualMetricTombstoned('bp_systolic', entry.date)
            && Object.prototype.hasOwnProperty.call(next, 'systolic')) {
          delete next.systolic;
          changed = true;
          prunedLegacy++;
        }
        if (isManualMetricTombstoned('bp_diastolic', entry.date)
            && Object.prototype.hasOwnProperty.call(next, 'diastolic')) {
          delete next.diastolic;
          changed = true;
          prunedLegacy++;
        }
        if (!changed || next.systolic != null || next.diastolic != null) {
          remaining.push(changed ? next : entry);
        }
      }
      biometrics.bp = remaining;
    }
  }
  if (prunedLegacy > 0) await saveImportedData();
  return { prunedRows, prunedLegacy };
}

/**
 * Ensure `wearableConnections.manual` exists so listConnectedSources() and
 * the dashboard strip surface 'manual' as a source. Mirrors the pattern
 * wearables-apple-health uses — no OAuth token, just a connectedAt stamp.
 * Refreshes lastSyncAt + coverageDays on every call.
 */
export async function ensureManualConnection({ coverageDays = 0 } = {}) {
  if (!state.importedData) return false;
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
  return saveImportedData();
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
  _clearManualMetricTombstone(metric, d);
  const patch = { [metric]: value };
  if (Array.isArray(tags) && tags.length) patch.tags = _sanitizeTags(tags);
  const noteClean = _sanitizeNote(note);
  if (noteClean) patch.note = noteClean;
  await _mergeManualRow(profileId, d, patch);
  await ensureManualConnection();
}

/**
 * Log BP as a pair — matches how home cuffs report systolic + diastolic
 * (+ optional pulse) in a single reading. One row per date.
 */
export async function logManualBP(profileId, { date, systolic, diastolic, pulse, tags, note }) {
  const d = date || isoDay();
  const row = { source: 'manual', date: d };
  if (systolic != null && isFinite(systolic)) {
    _clearManualMetricTombstone('bp_systolic', d);
    row.bp_systolic = systolic;
  }
  if (diastolic != null && isFinite(diastolic)) {
    _clearManualMetricTombstone('bp_diastolic', d);
    row.bp_diastolic = diastolic;
  }
  if (pulse != null && isFinite(pulse)) {
    _clearManualMetricTombstone('rhr', d);
    row.rhr = pulse;
  }
  if (!row.bp_systolic && !row.bp_diastolic && !row.rhr) return;
  if (Array.isArray(tags) && tags.length) row.tags = _sanitizeTags(tags);
  const noteClean = _sanitizeNote(note);
  if (noteClean) row.note = noteClean;
  // Merge rather than replace — preserves same-day weight from a prior entry.
  const { source: _s, date: _d, ...patch } = row;
  await _mergeManualRow(profileId, d, patch);
  await ensureManualConnection();
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
 * Legacy biometrics are retained for old backup compatibility, except rows
 * covered by a durable manualMetricTombstones deletion marker.
 */
export async function migrateBiometricsToManual(profileId, biometrics) {
  if (!profileId) return { skipped: 'no-profile' };
  await reconcileManualMetricTombstones(profileId);
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
    await ensureManualConnection({ coverageDays: rows.length });
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
  _recordManualMetricTombstone(metric, date);
  _removeLegacyBiometric(metric, date);
  const existing = await getDaily(profileId, 'manual', date);
  if (!existing) {
    await saveImportedData();
    return;
  }
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
  // Persist the durable delete marker and the legacy biometrics cleanup in
  // the same profile save that schedules cross-device sync.
  await saveImportedData();
}

/**
 * Remove every device-local manual reading and record per-field tombstones,
 * including legacy biometrics dates that may not exist in this device's IDB.
 */
export async function deleteAllManualMetrics(profileId) {
  if (!profileId || state.currentProfile !== profileId) return { skipped: 'inactive-profile' };
  const deletedAt = Date.now();
  const rows = await getDailyRange(profileId, 'manual', MANUAL_HISTORY_START, MANUAL_HISTORY_END);
  let tombstonesRecorded = 0;
  // Metric-wide markers cover readings that exist only on another device.
  // Exact per-date markers below remain useful diagnostics and allow older
  // clients that do not understand the `all` key to honor known deletions.
  for (const metric of MANUAL_METRICS) {
    if (_recordManualMetricTombstone(metric, 'all', deletedAt)) tombstonesRecorded++;
  }
  for (const row of rows) {
    for (const metric of MANUAL_METRICS) {
      if (row[metric] != null && _recordManualMetricTombstone(metric, row.date, deletedAt)) tombstonesRecorded++;
    }
  }
  const biometrics = state.importedData?.biometrics;
  for (const entry of (Array.isArray(biometrics?.weight) ? biometrics.weight : [])) {
    if (_recordManualMetricTombstone('weight', entry?.date, deletedAt)) tombstonesRecorded++;
  }
  for (const entry of (Array.isArray(biometrics?.pulse) ? biometrics.pulse : [])) {
    if (_recordManualMetricTombstone('rhr', entry?.date, deletedAt)) tombstonesRecorded++;
  }
  for (const entry of (Array.isArray(biometrics?.bp) ? biometrics.bp : [])) {
    if (_recordManualMetricTombstone('bp_systolic', entry?.date, deletedAt)) tombstonesRecorded++;
    if (_recordManualMetricTombstone('bp_diastolic', entry?.date, deletedAt)) tombstonesRecorded++;
  }
  if (biometrics && typeof biometrics === 'object') {
    if (Array.isArray(biometrics.weight)) biometrics.weight = [];
    if (Array.isArray(biometrics.pulse)) biometrics.pulse = [];
    if (Array.isArray(biometrics.bp)) biometrics.bp = [];
  }
  await clearSource(profileId, 'manual');
  if (state.importedData?.wearableConnections) delete state.importedData.wearableConnections.manual;
  await saveImportedData();
  return { deletedRows: rows.length, tombstonesRecorded };
}

/**
 * Trigger an L2 summary rebuild so the dashboard strip reflects a write or
 * delete that just happened in the Edit Client modal (or elsewhere). The
 * L2 change-gate prevents redundant writes; call it eagerly after any manual
 * entry write.
 */
export async function refreshManualSummary(profileId) {
  try {
    const { listConnectedSources } = await import('./wearables-connect.js');
    await syncWearableSummary(profileId, listConnectedSources(), { force: true });
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
