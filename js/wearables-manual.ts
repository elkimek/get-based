import type {ProfileSaveOptions} from './data-core-types.js';
import type { ProfileData, ManualBodyReading } from '../types/app-state.js';
import type { Biometrics, BloodPressureValue } from '../types/profile-context-data.js';
import type { StoredWearableRow } from './wearable-storage-types.js';
import type { WearableProfileMutation } from './wearable-persistence-types.js';

type ManualProfile = WearableProfileMutation & Partial<Pick<ProfileData, 'biometrics' | 'manualMetricTombstones' | 'manualBodyReadings'>>;
interface ManualReadingContext { date?: string; tags?: unknown; note?: unknown }
interface ManualMetricReading extends ManualReadingContext { value?: unknown; unit?: string }
interface ManualBloodPressure extends ManualReadingContext { systolic?: unknown; diastolic?: unknown; pulse?: unknown }

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
import { saveImportedData, saveImportedDataForProfile } from './data.js';
import { isoDay } from './wearable-adapters.js';
import { weightToKilograms } from './wearables-formatters.js';
import { syncWearableSummary } from './wearables-summary.js';
import { queueManualRowWrite } from './wearables-manual-lock.js';
import { BODY_MEASUREMENT_FIELDS, bodyMeasurementRecords, measurementPatch, validMeasurementDate, type BodyMeasurementDraft } from './body-measurement-model.js';

// Merge helper — read the existing manual row for `date` (if any), shallow-merge
// the new patch on top, write back. Needed because IDB `put` replaces the whole
// row; a user who logs BP in the morning and weight in the evening otherwise
// loses the morning's BP when the weight upsert overwrites the row.
async function _mergeManualRow(profileId: string, date: string, patch: Record<string, unknown>, imported: ManualProfile) {
  return queueManualRowWrite(profileId, async () => {
    const existing = await getDaily(profileId, 'manual', date);
    const base = { ...(existing || {}) };
    // A synced deletion can land while this tab is still open. Do not let a
    // later same-day weight/BP write preserve an already-deleted pulse from the
    // device-local row. Explicitly re-added fields have their marker cleared
    // before this helper runs and therefore survive.
    for (const metric of MANUAL_METRICS) {
      if (isManualMetricTombstoned(metric, date, imported)) delete base[metric];
    }
    const clocks = base._manualSyncAt && typeof base._manualSyncAt === 'object' ? {...base._manualSyncAt as Record<string, unknown>} : {};
    const updatedAt = Date.now();
    for (const field of MANUAL_MIRROR_FIELDS) if (Object.hasOwn(patch, field)) clocks[field] = updatedAt;
    mirrorManualPatch(imported, date, patch, updatedAt);
    const merged = { ...base, _manualSyncAt: clocks, source: 'manual', date, ...patch };
    await upsertDaily(profileId, merged);
  });
}

// Numeric manual fields. Waist/hip/SAD fields encode their measurement method;
// their overview cards project the explicit mirror without pooling methods.
export const MANUAL_METRICS = ['weight', 'bp_systolic', 'bp_diastolic', 'rhr', ...BODY_MEASUREMENT_FIELDS];

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
export const MANUAL_HISTORY_START = '1970-01-01';
export const MANUAL_HISTORY_END = '9999-12-31';
const ISO_DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
export const MANUAL_MIRROR_FIELD = 'manualBodyReadings';
export const MANUAL_MIRROR_FIELDS = [...MANUAL_METRICS, 'tags', 'note'];
export const manualMirrorKey = (field: string, date: string) => `${field}.${date}`;
export function manualMirror(imported: ManualProfile): Record<string, ManualBodyReading> {
  const mirror = imported.manualBodyReadings;
  return mirror && typeof mirror === 'object' && !Array.isArray(mirror) ? mirror : (imported.manualBodyReadings = {});
}
/** Accept only the explicit manual surface, never vendor/imported row fields. */
export function parseManualMirrorEntry(key: string, raw: unknown) {
  const dot = key.indexOf('.'), field = key.slice(0, dot), date = key.slice(dot + 1);
  if (dot < 1 || !MANUAL_MIRROR_FIELDS.includes(field) || !ISO_DAY_RE.test(date)
      || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date
      || !raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const entry = raw as ManualBodyReading;
  if (!Number.isFinite(entry.updatedAt) || entry.updatedAt < 0) return null;
  const value = entry.value;
  if (value !== null && (MANUAL_METRICS.includes(field) ? typeof value !== 'number' || !Number.isFinite(value)
    : field === 'note' ? typeof value !== 'string' || value.length > 500
    : !Array.isArray(value) || value.length > MANUAL_TAGS.length || value.some(tag => !MANUAL_TAGS.includes(tag)))) return null;
  return {field, date, value, updatedAt: entry.updatedAt};
}
/** A portable manual surface must contain a valid explicit measurement or deletion. */
export function hasManualBodyReadings(value: unknown): boolean {
  return !!value && typeof value === 'object' && !Array.isArray(value)
    && Object.entries(value).some(([key, raw]) => {
      const entry = parseManualMirrorEntry(key, raw);
      return !!entry && MANUAL_METRICS.includes(entry.field);
    });
}
export function mirrorManualPatch(imported: ManualProfile, date: string, patch: Record<string, unknown>, updatedAt: number) {
  const mirror = manualMirror(imported);
  for (const field of MANUAL_MIRROR_FIELDS) {
    if (!Object.hasOwn(patch, field)) continue;
    const key = manualMirrorKey(field, date);
    const entry = patch[field] === null ? {value: null, updatedAt} : {...mirror[key], value: patch[field], updatedAt};
    if (parseManualMirrorEntry(key, entry)) mirror[key] = entry as ManualBodyReading;
  }
}
function unmirrorManualMetric(imported: ManualProfile, metric: string, date: string, existing: StoredWearableRow | null) {
  // Explicit null entries retain a per-field edit clock; an empty local store never deletes anything.
  mirrorManualPatch(imported, date, {[metric]: null}, Date.now());
  const mirror = manualMirror(imported);
  if (!MANUAL_METRICS.some(field => field !== metric && (mirror[manualMirrorKey(field, date)]?.value != null || existing?.[field] != null))) {
    mirrorManualPatch(imported, date, {tags: null, note: null}, Date.now());
  }
}


export function manualMetricTombstoneKey(metric: unknown, date: unknown) {
  if (!MANUAL_METRICS.includes(metric as string) || typeof date !== 'string'
      || (date !== 'all' && !ISO_DAY_RE.test(date))) return null;
  return `${metric}.${date}`;
}

function _manualMetricTombstones(imported: ManualProfile | null | undefined) {
  if (!imported || typeof imported !== 'object') return null;
  const current = imported[MANUAL_TOMBSTONE_FIELD];
  if (current && typeof current === 'object' && !Array.isArray(current)) return current;
  imported[MANUAL_TOMBSTONE_FIELD] = {};
  return imported[MANUAL_TOMBSTONE_FIELD];
}

export function manualMetricDeletionClock(metric: unknown, date: unknown, imported: ManualProfile | null | undefined = state.importedData) {
  const key = manualMetricTombstoneKey(metric, date);
  if (!key) return 0;
  const tombstones = imported?.[MANUAL_TOMBSTONE_FIELD];
  if (!tombstones || typeof tombstones !== 'object') return 0;
  // An exact zero is an intentional re-add and wins over an earlier
  // delete-all marker. Otherwise the metric-wide marker protects dates this
  // device never had locally and therefore could not enumerate at deletion.
  const allKey = manualMetricTombstoneKey(metric, 'all');
  const value = Number(Object.hasOwn(tombstones, key) ? tombstones[key] : allKey ? tombstones[allKey] : 0);
  return Number.isFinite(value) && value > 0 ? value : 0;
}
export function isManualMetricTombstoned(metric: unknown, date: unknown, imported: ManualProfile | null | undefined = state.importedData) {
  return manualMetricDeletionClock(metric, date, imported) > 0;
}

function _recordManualMetricTombstone(metric: unknown, date: unknown, deletedAt: unknown, imported: ManualProfile) {
  const key = manualMetricTombstoneKey(metric, date);
  const tombstones = _manualMetricTombstones(imported);
  if (!key || !tombstones) return false;
  const timestamp = Number(deletedAt);
  if (!Number.isFinite(timestamp) || timestamp <= 0) return false;
  tombstones[key] = Math.max(Number(tombstones[key]) || 0, timestamp);
  return true;
}

function _clearManualMetricTombstone(metric: unknown, date: unknown, imported: ManualProfile) {
  const key = manualMetricTombstoneKey(metric, date);
  const tombstones = imported?.[MANUAL_TOMBSTONE_FIELD];
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

function _legacyBiometricField(metric: unknown) {
  if (metric === 'weight') return 'weight';
  if (metric === 'rhr') return 'pulse';
  if (metric === 'bp_systolic' || metric === 'bp_diastolic') return 'bp';
  return null;
}

function _removeLegacyBiometric(metric: unknown, date: unknown, imported: ManualProfile) {
  const field = _legacyBiometricField(metric);
  const biometrics = imported?.biometrics;
  if (!field || !biometrics || !Array.isArray(biometrics[field])) return false;
  if (field === 'bp') {
    if (!Array.isArray(biometrics.bp)) return false;
    const component = metric === 'bp_systolic' ? 'systolic' : 'diastolic';
    let changed = false;
    const remaining: BloodPressureValue[] = [];
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
export async function reconcileManualMetricTombstones(profileId: string, imported: ManualProfile | null | undefined = state.importedData) {
  if (!profileId || state.currentProfile !== profileId) return { skipped: 'inactive-profile' as const };
  const tombstones = imported?.[MANUAL_TOMBSTONE_FIELD];
  if (!tombstones || typeof tombstones !== 'object' || Array.isArray(tombstones)
      || Object.keys(tombstones).length === 0) {
    return { prunedRows: 0, prunedLegacy: 0 };
  }

  const prunedRows = await queueManualRowWrite(profileId, async () => {
    let prunedRows = 0;
    const rows = await getDailyRange(profileId, 'manual', MANUAL_HISTORY_START, MANUAL_HISTORY_END);
    for (const row of rows) {
      const next = { ...row };
      let changed = false;
      for (const metric of MANUAL_METRICS) {
        if (isManualMetricTombstoned(metric, row.date, imported) && next[metric] != null) {
          delete next[metric];
          changed = true;
        }
      }
      if (!changed) continue;
      prunedRows++;
      if (MANUAL_METRICS.some(metric => next[metric] != null)) await upsertDaily(profileId, next);
      else await deleteDaily(profileId, 'manual', row.date);
    }
    return prunedRows;
  });

  let prunedLegacy = 0;
  const biometrics = imported?.biometrics;
  if (biometrics && typeof biometrics === 'object') {
    const legacyPairs = ([
      ['weight', 'weight'],
      ['pulse', 'rhr'],
    ] as const);
    for (const [field, metric] of legacyPairs) {
      if (!Array.isArray(biometrics[field])) continue;
      const before = biometrics[field].length;
      biometrics[field] = biometrics[field].filter(entry => !isManualMetricTombstoned(metric, entry?.date, imported));
      prunedLegacy += before - biometrics[field].length;
    }
    if (Array.isArray(biometrics.bp)) {
      const remaining: BloodPressureValue[] = [];
      for (const entry of biometrics.bp) {
        if (!entry || typeof entry !== 'object') {
          remaining.push(entry);
          continue;
        }
        const next = { ...entry };
        let changed = false;
        if (isManualMetricTombstoned('bp_systolic', entry.date, imported)
            && Object.prototype.hasOwnProperty.call(next, 'systolic')) {
          delete next.systolic;
          changed = true;
          prunedLegacy++;
        }
        if (isManualMetricTombstoned('bp_diastolic', entry.date, imported)
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
  if (prunedLegacy > 0 && state.currentProfile === profileId && state.importedData === imported) await saveImportedData();
  return { prunedRows, prunedLegacy };
}

export function captureManualMutation(profileId: string) {
  if (!profileId || profileId !== state.currentProfile || !state.importedData) {
    throw new Error('Switch back to the originating profile before changing manual measurements.');
  }
  const baseData = structuredClone(state.importedData);
  return { baseData, imported: structuredClone(baseData) };
}

export async function persistManualMutation(profileId: string, imported: ManualProfile, baseData: ManualProfile, options: Pick<ProfileSaveOptions, 'expectedData' | 'notifyOnStaleSnapshot'> = {}) {
  if (!await saveImportedDataForProfile(profileId, imported, { baseData, ...options })) {
    throw new Error('Could not save manual measurement metadata. Check your data before retrying.');
  }
}

export function updateManualConnection(imported: ManualProfile, coverageDays = 0) {
  if (!imported.wearableConnections) imported.wearableConnections = {};
  const prev = imported.wearableConnections.manual;
  const nowISO = new Date().toISOString();
  imported.wearableConnections.manual = {
    source: 'manual',
    connectedAt: prev?.connectedAt || nowISO,
    lastSyncAt: Date.now(),
    coverageDays: Math.max(coverageDays, (prev?.coverageDays || 0) as number),
    needsReauth: false,
  };
}

/**
 * Ensure `wearableConnections.manual` exists so listConnectedSources() and
 * the dashboard strip surface 'manual' as a source. Mirrors the pattern
 * wearables-apple-health uses — no OAuth token, just a connectedAt stamp.
 * Refreshes lastSyncAt + coverageDays on every call.
 */
export async function ensureManualConnection({ coverageDays = 0 } = {}) {
  if (!state.currentProfile || !state.importedData) return false;
  const profileId = state.currentProfile;
  const { imported, baseData } = captureManualMutation(profileId);
  updateManualConnection(imported, coverageDays);
  return saveImportedDataForProfile(profileId, imported, { baseData });
}

/**
 * Log a single manual measurement.
 *   metric: one of MANUAL_METRICS
 *   date:   'YYYY-MM-DD' — defaults to today
 *   value:  number (kg by default; weight accepts an explicit input unit)
 *
 * Rows are upserted on the [source, date] compound key. Logging weight
 * twice on the same day overwrites — same behaviour as a wearable sync.
 */
export async function logManualMetric(profileId: string, metric: string, { date, value, unit = 'kg', tags, note }: ManualMetricReading) {
  if (!MANUAL_METRICS.includes(metric as string)) {
    throw new Error(`logManualMetric: unknown metric "${metric}"`);
  }
  if (value == null || !isFinite(value as number)) {
    throw new Error('logManualMetric: value must be a finite number');
  }
  const { imported, baseData } = captureManualMutation(profileId);
  const d = date || isoDay();
  _clearManualMetricTombstone(metric, d, imported);
  const canonicalValue = metric === 'weight' ? weightToKilograms(value as number, unit) : value;
  const patch: Record<string, unknown> = { [metric]: canonicalValue };
  if (Array.isArray(tags) && tags.length) patch.tags = _sanitizeTags(tags);
  const noteClean = _sanitizeNote(note);
  if (noteClean) patch.note = noteClean;
  await _mergeManualRow(profileId, d, patch, imported);
  updateManualConnection(imported);
  await persistManualMutation(profileId, imported, baseData);
}

/** Waist and optional hips commit together; each posture/site keeps its own clock. */
export async function logBodyMeasurement(profileId: string, draft: BodyMeasurementDraft) {
  const patch = measurementPatch(draft);
  if (draft.date > isoDay()) throw new Error('Choose today or an earlier date.');
  const original = draft.original;
  if (original && (!validMeasurementDate(original.date) || !BODY_MEASUREMENT_FIELDS.includes(original.field)
    || (draft.kind === 'waist' ? !original.field.startsWith('waist_') : original.field !== 'sad_supine_iliac'))) throw new Error('Unknown original body measurement.');
  const {imported, baseData} = captureManualMutation(profileId);
  const moved = original && (original.date !== draft.date || !Object.hasOwn(patch, original.field));
  if (moved) {
    if (bodyMeasurementRecords(imported, draft.kind).some(row => row.date === draft.date && Object.hasOwn(patch, row.field))) {
      throw new Error('A measurement already exists for that date and method. Edit it in History instead.');
    }
    await stageBodyMeasurementDeletion(imported, profileId, original.field, original.date, original.date === draft.date);
  }
  for (const field of Object.keys(patch)) _clearManualMetricTombstone(field, draft.date, imported);
  await _mergeManualRow(profileId, draft.date, patch, imported);
  updateManualConnection(imported);
  // A correction publishes the new pair and the old pair's deletion together.
  await persistManualMutation(profileId, imported, baseData);
  if (moved) await eraseBodyMeasurementRowFields(profileId, original.field, original.date);
}

/**
 * Log BP as a pair — matches how home cuffs report systolic + diastolic
 * (+ optional pulse) in a single reading. One row per date.
 */
export async function logManualBP(profileId: string, { date, systolic, diastolic, pulse, tags, note }: ManualBloodPressure) {
  const { imported, baseData } = captureManualMutation(profileId);
  const d = date || isoDay();
  const row: StoredWearableRow = { source: 'manual', date: d };
  if (systolic != null && isFinite(systolic as number)) {
    _clearManualMetricTombstone('bp_systolic', d, imported);
    row.bp_systolic = systolic;
  }
  if (diastolic != null && isFinite(diastolic as number)) {
    _clearManualMetricTombstone('bp_diastolic', d, imported);
    row.bp_diastolic = diastolic;
  }
  if (pulse != null && isFinite(pulse as number)) {
    _clearManualMetricTombstone('rhr', d, imported);
    row.rhr = pulse;
  }
  if (!row.bp_systolic && !row.bp_diastolic && !row.rhr) return;
  if (Array.isArray(tags) && tags.length) row.tags = _sanitizeTags(tags);
  const noteClean = _sanitizeNote(note);
  if (noteClean) row.note = noteClean;
  // Merge rather than replace — preserves same-day weight from a prior entry.
  const { source: _s, date: _d, ...patch } = row;
  await _mergeManualRow(profileId, d, patch, imported);
  updateManualConnection(imported);
  await persistManualMutation(profileId, imported, baseData);
}

// Trim + cap so a runaway paste doesn't bloat the row. 500 chars covers
// "fasted 14h, just after wake, post-bath, third reading" type context.
function _sanitizeNote(note: unknown) {
  if (typeof note !== 'string') return '';
  const trimmed = note.trim();
  return trimmed.length > 500 ? trimmed.slice(0, 500) : trimmed;
}

// Keep only recognized tags so a typo'd or stale chip can't poison the row.
// Dedup-preserves order. Intentionally silent — tags are cosmetic, don't
// throw just because the user clicked something odd.
function _sanitizeTags(tags: readonly unknown[]) {
  const seen = new Set();
  const out: string[] = [];
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
export async function migrateBiometricsToManual(profileId: string, biometrics: Biometrics | null | undefined) {
  if (!profileId) return { skipped: 'no-profile' as const };
  if (biometrics && profileId !== state.currentProfile) return { skipped: 'inactive-profile' as const };
  const live = state.importedData;
  await reconcileManualMetricTombstones(profileId);
  if (biometrics && (profileId !== state.currentProfile || live !== state.importedData)) return { skipped: 'inactive-profile' as const };
  const baseData = structuredClone(live);
  const imported = structuredClone(baseData);
  // Retain reconciliation's legacy cleanup, then detach from mutable UI data.
  biometrics = structuredClone(biometrics);
  const alreadyRan = await getMeta(profileId, MIGRATION_FLAG);
  if (alreadyRan) return { skipped: 'already-migrated' as const };
  if (!biometrics) {
    await setMeta(profileId, MIGRATION_FLAG, { at: Date.now(), counts: {} });
    return { skipped: 'no-biometrics' as const };
  }

  // Group existing time-series entries by date so we write ONE row per
  // date rather than three (matches how wearable adapters emit).
  const byDate = new Map<string, StoredWearableRow>();
  const pushInto = (date: string, patch: Record<string, unknown>) => {
    if (!date) return;
    const existing = byDate.get(date) || { source: 'manual', date };
    byDate.set(date, { ...existing, ...patch });
  };

  const weight = Array.isArray(biometrics.weight) ? biometrics.weight : [];
  const bp     = Array.isArray(biometrics.bp)     ? biometrics.bp     : [];
  const pulse  = Array.isArray(biometrics.pulse)  ? biometrics.pulse  : [];

  for (const e of weight) {
    if (e?.date && typeof e.value === 'number' && isFinite(e.value)) {
      // The onboarding form stores 'lbs'; older profile editors store 'lb'.
      const v = weightToKilograms(e.value, e.unit);
      pushInto(e.date, { weight: v });
    }
  }
  for (const e of bp) {
    if (!e?.date) continue;
    const patch: Record<string, unknown> = {};
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
    await queueManualRowWrite(profileId, async () => {
      const merged: StoredWearableRow[] = [];
      for (const row of rows) {
        // A previous attempt may have committed rows before metadata failed.
        // Migration fills missing fields; newer manual readings win on retry.
        const existing = await getDaily(profileId, 'manual', row.date);
        merged.push({ ...row, ...existing, source: 'manual', date: row.date });
      }
      await upsertDailyBatch(profileId, merged);
    });
    // Surface 'manual' as a connected source so the dashboard strip and
    // Settings → Integrations see it. Coverage = distinct dates migrated.
    updateManualConnection(imported, rows.length);
    await persistManualMutation(profileId, imported, baseData);
  }

  const counts = { weight: weight.length, bp: bp.length, pulse: pulse.length, rows: rows.length };
  await setMeta(profileId, MIGRATION_FLAG, { at: Date.now(), counts });
  return { migrated: true as const, counts };
}

/**
 * Remove a single metric field from the manual row for `date`. If the row
 * has no remaining metric fields afterward, the row itself is deleted so
 * the summary doesn't count it as coverage. Used by the Edit Client modal
 * when a user deletes a biometric entry so the wearable strip stays in sync.
 */
export async function deleteManualMetric(profileId: string, metric: string, date: string) {
  if (!MANUAL_METRICS.includes(metric as string)) {
    throw new Error(`deleteManualMetric: unknown metric "${metric}"`);
  }
  const { imported, baseData } = captureManualMutation(profileId);
  _recordManualMetricTombstone(metric, date, Date.now(), imported);
  _removeLegacyBiometric(metric, date, imported);
  const existingForContext = await getDaily(profileId, 'manual', date);
  unmirrorManualMetric(imported, metric, date, existingForContext);
  // Commit deletion intent before erasing local rows, so other devices and
  // recovery retain the deletion even if wearable storage fails afterwards.
  await persistManualMutation(profileId, imported, baseData);
  await queueManualRowWrite(profileId, async () => {
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
  });
}

function bodyMeasurementPair(field: string): string[] {
  if (!BODY_MEASUREMENT_FIELDS.includes(field) || field.startsWith('hip_')) throw new Error('Unknown body measurement.');
  return field.startsWith('waist_') ? [field, field.replace(/^waist_/, 'hip_')] : [field];
}
async function stageBodyMeasurementDeletion(imported: ManualProfile, profileId: string, field: string, date: string, preserveContext = false) {
  const fields = bodyMeasurementPair(field), existing = await getDaily(profileId, 'manual', date);
  const deletedAt = Date.now();
  for (const metric of fields) _recordManualMetricTombstone(metric, date, deletedAt, imported);
  mirrorManualPatch(imported, date, Object.fromEntries(fields.map(metric => [metric, null])), deletedAt);
  const mirror = manualMirror(imported);
  if (!preserveContext && !MANUAL_METRICS.some(metric => !fields.includes(metric) && !isManualMetricTombstoned(metric, date, imported)
    && (mirror[manualMirrorKey(metric, date)] ? mirror[manualMirrorKey(metric, date)]!.value != null : existing?.[metric] != null))) {
    mirrorManualPatch(imported, date, {note: null, tags: null}, deletedAt);
  }
}
async function eraseBodyMeasurementRowFields(profileId: string, field: string, date: string) {
  const fields = bodyMeasurementPair(field);
  return queueManualRowWrite(profileId, async () => {
    const existing = await getDaily(profileId, 'manual', date);
    if (!existing) return;
    const next = {...existing};
    for (const metric of fields) delete next[metric];
    if (MANUAL_METRICS.some(metric => next[metric] != null)) await upsertDaily(profileId, next);
    else await deleteDaily(profileId, 'manual', date);
  });
}
/** Delete a method-specific waist/hip pair with one portable deletion commit. */
export async function deleteBodyMeasurement(profileId: string, field: string, date: string) {
  if (!validMeasurementDate(date)) throw new Error('Choose a valid measurement date.');
  const {imported, baseData} = captureManualMutation(profileId);
  await stageBodyMeasurementDeletion(imported, profileId, field, date);
  await persistManualMutation(profileId, imported, baseData);
  await eraseBodyMeasurementRowFields(profileId, field, date);
}

/**
 * Remove every device-local manual reading and record per-field tombstones,
 * including legacy biometrics dates that may not exist in this device's IDB.
 */
export async function deleteAllManualMetrics(profileId: string) {
  if (!profileId || state.currentProfile !== profileId) return { skipped: 'inactive-profile' as const };
  const { imported, baseData } = captureManualMutation(profileId);
  const deletedAt = Date.now();
  const rows = await getDailyRange(profileId, 'manual', MANUAL_HISTORY_START, MANUAL_HISTORY_END);
  let tombstonesRecorded = 0;
  // Metric-wide markers cover readings that exist only on another device.
  // Exact per-date markers below remain useful diagnostics and allow older
  // clients that do not understand the `all` key to honor known deletions.
  for (const metric of MANUAL_METRICS) {
    if (_recordManualMetricTombstone(metric, 'all', deletedAt, imported)) tombstonesRecorded++;
  }
  for (const row of rows) {
    for (const metric of MANUAL_METRICS) {
      if (row[metric] != null && _recordManualMetricTombstone(metric, row.date, deletedAt, imported)) tombstonesRecorded++;
    }
  }
  const biometrics = imported?.biometrics;
  for (const entry of (Array.isArray(biometrics?.weight) ? biometrics.weight : [])) {
    if (_recordManualMetricTombstone('weight', entry?.date, deletedAt, imported)) tombstonesRecorded++;
  }
  for (const entry of (Array.isArray(biometrics?.pulse) ? biometrics.pulse : [])) {
    if (_recordManualMetricTombstone('rhr', entry?.date, deletedAt, imported)) tombstonesRecorded++;
  }
  for (const entry of (Array.isArray(biometrics?.bp) ? biometrics.bp : [])) {
    if (_recordManualMetricTombstone('bp_systolic', entry?.date, deletedAt, imported)) tombstonesRecorded++;
    if (_recordManualMetricTombstone('bp_diastolic', entry?.date, deletedAt, imported)) tombstonesRecorded++;
  }
  if (biometrics && typeof biometrics === 'object') {
    if (Array.isArray(biometrics.weight)) biometrics.weight = [];
    if (Array.isArray(biometrics.pulse)) biometrics.pulse = [];
    if (Array.isArray(biometrics.bp)) biometrics.bp = [];
  }
  for (const key of Object.keys(manualMirror(imported))) {
    imported.manualBodyReadings![key] = {value: null, updatedAt: deletedAt};
  }
  if (imported.wearableConnections) delete imported.wearableConnections.manual;
  await persistManualMutation(profileId, imported, baseData);
  await queueManualRowWrite(profileId, () => clearSource(profileId, 'manual'));
  return { deletedRows: rows.length, tombstonesRecorded };
}

/**
 * Trigger an L2 summary rebuild so the dashboard strip reflects a write or
 * delete that just happened in the Edit Client modal (or elsewhere). The
 * L2 change-gate prevents redundant writes; call it eagerly after any manual
 * entry write.
 */
export async function refreshManualSummary(profileId: string) {
  const imported = state.importedData;
  if (profileId !== state.currentProfile) return;
  try {
    const { listConnectedSources } = await import('./wearables-connect.js');
    if (profileId !== state.currentProfile || imported !== state.importedData) return;
    await syncWearableSummary(profileId, listConnectedSources(), { force: true });
  } catch { /* non-fatal */ }
}

/**
 * Is `manual` a "connected" source for this profile? True when any manual
 * row exists in the wearables IDB. Used by the wearables-connect façade so
 * the dashboard strip and Settings → Integrations panel list Manual
 * alongside Oura/Withings without needing an OAuth flow.
 */
export async function hasManualData(profileId: string) {
  try {
    const n = await countSource(profileId, 'manual');
    return n > 0;
  } catch {
    return false;
  }
}
