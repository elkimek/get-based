// sync-delta-observability.js - Delta telemetry and Phase 2 readiness checks.

import { state } from './state.js';
import { getAt } from './data-merge.js';
import { DELTA_ARRAYS, DELTA_MAPS, DELTA_SCALARS } from './sync-delta-registry.js';

let _getEvolu = () => null;
let _getItemRowQuery = () => null;

export function configureSyncDeltaObservability({ getEvolu, getItemRowQuery } = {}) {
  if (typeof getEvolu === 'function') _getEvolu = getEvolu;
  if (typeof getItemRowQuery === 'function') _getItemRowQuery = getItemRowQuery;
}

function _currentEvolu() {
  try { return _getEvolu?.() || null; } catch { return null; }
}

function _currentItemRowQuery() {
  try { return _getItemRowQuery?.() || null; } catch { return null; }
}

// Pull-side row-count snapshot, refreshed on every _mergeItemRowsIntoImported
// run. Used by getDeltaTelemetry / Sync diagnose so a user comparing two
// devices can see whether the relay actually replicated per-row state evenly
// (e.g. desktop sees 14 sunSession rows, phone sees 12 -> relay replication
// lag, not a local merge bug). In-memory only - re-derives on every merge,
// no localStorage churn.
const _pullDeltaSnapshot = { profileId: null, perArray: {}, mergedAt: 0 };

export function resetPullDeltaSnapshot(profileId) {
  _pullDeltaSnapshot.profileId = profileId;
  _pullDeltaSnapshot.perArray = {};
  _pullDeltaSnapshot.mergedAt = Date.now();
}

export function recordPullDeltaSurface(arrayName, counts) {
  if (!arrayName || !counts) return;
  _pullDeltaSnapshot.perArray[arrayName] = {
    live: counts.live || 0,
    tombstones: counts.tombstones || 0,
  };
}

// ═══════════════════════════════════════════════
// PHASE 1 DELTA TELEMETRY (observability for cutover decision)
// ═══════════════════════════════════════════════
//
// Phase 2 of the CRDT-delta refactor (drop blob writes entirely) is gated
// on >=2 weeks of cross-device bake under real traffic with the per-row
// datapath proven healthy. "Healthy" = (a) per-push delta payload is a
// small fraction of the blob (proves we're not double-shipping the same
// content), and (b) every device's local Evolu DB shows the same per-array
// row counts (proves relay replication is propagating per-row state, not
// just blob updates). This module records both signals to localStorage
// and surfaces them in the Sync diagnose modal - no telemetry leaves the
// device, no extra network I/O. When the ratio sits at <0.05 across N
// devices and per-array counts converge, Phase 2 is safe to ship.

const _DELTA_TELEMETRY_CAP = 50; // last-N pushes; ~6 KB at p99 entry size
function _deltaTelemetryKey(profileId) {
  return `labcharts-${profileId}-delta-telemetry`;
}
function _readDeltaTelemetry(profileId) {
  try {
    const raw = localStorage.getItem(_deltaTelemetryKey(profileId));
    return raw ? (JSON.parse(raw) || { pushes: [] }) : { pushes: [] };
  } catch { return { pushes: []  }; }
}
export function _recordPushTelemetry(profileId, blobBytes, deltaPlans) {
  if (!profileId) return;
  const perArray = {};
  let totalDeltaBytes = 0;
  let totalOps = 0;
  for (const { arrayName, plan } of deltaPlans) {
    let ins = 0, upd = 0, tom = 0, bytes = 0;
    for (const op of plan.ops) {
      if (op.kind === 'insert') ins++;
      else if (op.kind === 'update') upd++;
      else if (op.kind === 'tombstone') tom++;
      bytes += (op.args?.payload || '').length;
    }
    perArray[arrayName] = { ins, upd, tom, bytes };
    totalDeltaBytes += bytes;
    totalOps += plan.ops.length;
  }
  const entry = { at: Date.now(), blobBytes: blobBytes | 0, totalDeltaBytes, totalOps, perArray };
  try {
    const cur = _readDeltaTelemetry(profileId);
    cur.pushes.push(entry);
    if (cur.pushes.length > _DELTA_TELEMETRY_CAP) cur.pushes.splice(0, cur.pushes.length - _DELTA_TELEMETRY_CAP);
    localStorage.setItem(_deltaTelemetryKey(profileId), JSON.stringify(cur));
  } catch {}
}

// Public read accessor - returns recent pushes + latest pull-side row
// counts for the active profile. Pull snapshot is in-memory (re-derived
// every merge), pushes persist across reloads.
export function getDeltaTelemetry(profileId) {
  if (!profileId) return null;
  const t = _readDeltaTelemetry(profileId);
  const pushes = Array.isArray(t.pushes) ? t.pushes : [];
  // Aggregate over the last N pushes for the diagnose summary row.
  let aggBlob = 0, aggDelta = 0, aggOps = 0;
  for (const p of pushes) {
    aggBlob += p.blobBytes || 0;
    aggDelta += p.totalDeltaBytes || 0;
    aggOps += p.totalOps || 0;
  }
  const ratio = aggBlob > 0 ? aggDelta / aggBlob : 0;
  return {
    pushes,
    pull: _pullDeltaSnapshot.profileId === profileId
      ? { perArray: { ..._pullDeltaSnapshot.perArray }, mergedAt: _pullDeltaSnapshot.mergedAt }
      : { perArray: {}, mergedAt: 0 },
    summary: { count: pushes.length, totalBlobBytes: aggBlob, totalDeltaBytes: aggDelta, totalOps: aggOps, ratio },
  };
}

export function resetDeltaTelemetry(profileId) {
  if (!profileId) return false;
  try { localStorage.removeItem(_deltaTelemetryKey(profileId)); return true; } catch { return false; }
}

// ═══════════════════════════════════════════════
// PHASE 2 CUTOVER READINESS (v1.7.9)
// ═══════════════════════════════════════════════
//
// Once cross-device bake completes (>=2 weeks of real traffic on v1.7.0+),
// dropping the fat-blob writes is a one-line change in buildSyncPayload.
// This check is the hard gate before that flip - it surveys every
// DELTA_ARRAYS / DELTA_MAPS / DELTA_SCALARS field for the active profile
// and reports whether each surface that has LOCAL data also has at least
// one corresponding itemRow in this device's Evolu DB. If any surface
// has data locally but no per-row row, the per-row datapath isn't
// carrying that surface yet - flipping Phase 2 would silently lose it.
//
// Returns a structured `{ ready: bool, surfaces: { [name]: { localCount,
// rowCount, status } } }` so the caller can render a per-surface table.
// status values: 'ok' (data on both sides), 'no-data' (nothing locally,
// nothing to verify), 'missing-rows' (local data exists but no rows
// shipped - BLOCKER), 'rows-only' (rows exist but no local data -
// fine: another device pushed, this one hasn't synced or had it).
export function getDeltaCutoverReadiness(profileId, importedData) {
  if (!profileId) return { ready: false, error: 'no-profile', surfaces: {} };
  if (!importedData) importedData = state.importedData || {};
  const surfaces = {};
  let blockers = 0;

  // Index existing itemRow rows for this profile so each surface check
  // is a Map lookup, not an O(n) scan.
  const evolu = _currentEvolu();
  const itemRowQuery = _currentItemRowQuery();
  const allItemRows = (evolu && itemRowQuery) ? (evolu.getQueryRows(itemRowQuery) || []) : [];
  const rowsByName = new Map();
  for (const r of allItemRows) {
    if (!r || r.profileId !== profileId) continue;
    if (!rowsByName.has(r.arrayName)) rowsByName.set(r.arrayName, []);
    rowsByName.get(r.arrayName).push(r);
  }

  function classify(name, localCount, rowCount) {
    let status;
    if (localCount === 0 && rowCount === 0) status = 'no-data';
    else if (localCount > 0 && rowCount === 0) { status = 'missing-rows'; blockers++; }
    else if (localCount === 0 && rowCount > 0) status = 'rows-only';
    else status = 'ok';
    surfaces[name] = { shape: undefined, localCount, rowCount, status };
  }

  for (const arrayName of DELTA_ARRAYS) {
    // Honor nested paths the same way the planner + merger do.
    const raw = arrayName.includes('.')
      ? getAt(importedData, arrayName)
      : importedData[arrayName];
    const items = Array.isArray(raw) ? raw : [];
    const rows = (rowsByName.get(arrayName) || []).filter(r => !r.isDeleted);
    classify(arrayName, items.length, rows.length);
    surfaces[arrayName].shape = 'array';
  }
  for (const mapName of DELTA_MAPS) {
    // Dotted-path entries (e.g. `genetics.snps`) walk via getAt so the
    // readiness check counts the nested map, not a flat top-level
    // sibling that doesn't exist. Without this, the gate would always
    // report `localCount=0` for nested maps and silently pass even
    // when the cutover would drop genuine data.
    const obj = mapName.includes('.') ? getAt(importedData, mapName) : importedData[mapName];
    const localCount = (obj && typeof obj === 'object' && !Array.isArray(obj)) ? Object.keys(obj).length : 0;
    const rows = (rowsByName.get(mapName) || []).filter(r => !r.isDeleted);
    classify(mapName, localCount, rows.length);
    surfaces[mapName].shape = 'map';
  }
  for (const scalarName of DELTA_SCALARS) {
    // Dotted-path scalars walk via getAt so nested entries
    // (e.g. `lightEnvironment.burdenAI`) report local-presence accurately.
    const v = scalarName.includes('.')
      ? getAt(importedData, scalarName)
      : importedData[scalarName];
    const hasValue = v !== null && v !== undefined && !(typeof v === 'string' && v.length === 0);
    const rows = (rowsByName.get(scalarName) || []).filter(r => !r.isDeleted);
    classify(scalarName, hasValue ? 1 : 0, rows.length);
    surfaces[scalarName].shape = 'scalar';
  }

  return {
    ready: blockers === 0,
    blockerCount: blockers,
    surfaceCount: Object.keys(surfaces).length,
    surfaces,
  };
}
