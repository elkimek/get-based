// sync-delta.js — Evolu per-row delta planning, application, and snapshot gates.

import { _base64ToBytes, _bytesToBase64, _gzipString, _gunzipToStringCapped } from './sync-payload.js';
import { configureSyncDeltaObservability } from './sync-delta-observability.js';
import { configureSyncDeltaMerge } from './sync-delta-merge.js';
import {
  DELTA_ARRAY_CONFIG, DELTA_MAP_CONFIG,
  _djb2, _isAllowlistSafeId, _isProtoPollutionKey,
} from './sync-delta-registry.js';

export { DELTA_ARRAYS, DELTA_MAPS, DELTA_SCALARS } from './sync-delta-registry.js';
export {
  _recordPushTelemetry, getDeltaCutoverReadiness, getDeltaTelemetry,
  resetDeltaTelemetry,
} from './sync-delta-observability.js';
export { _mergeItemRowsIntoImported } from './sync-delta-merge.js';

let _getEvolu = () => null;
let _getItemRowQuery = () => null;

export function configureSyncDelta({ getEvolu, getItemRowQuery } = {}) {
  if (typeof getEvolu === 'function') _getEvolu = getEvolu;
  if (typeof getItemRowQuery === 'function') _getItemRowQuery = getItemRowQuery;
  configureSyncDeltaObservability({
    getEvolu: _getEvolu,
    getItemRowQuery: _getItemRowQuery,
  });
  configureSyncDeltaMerge({
    getEvolu: _getEvolu,
    getItemRowQuery: _getItemRowQuery,
  });
}

function _currentEvolu() {
  try { return _getEvolu?.() || null; } catch { return null; }
}

function _currentItemRowQuery() {
  try { return _getItemRowQuery?.() || null; } catch { return null; }
}

// ═══════════════════════════════════════════════
// PER-ARRAY DELTA SYNC — Phase 1 of CRDT-delta refactor
// ═══════════════════════════════════════════════
// Surface registry/config lives in sync-delta-registry.js. Telemetry and
// readiness checks live in sync-delta-observability.js; pull-side merge
// overlay lives in sync-delta-merge.js. This module owns planning,
// applying, and snapshot advancement.

// Returns the localStorage key holding the last-pushed snapshot
// (`{itemId: contentHash}`) for one (profileId, arrayName). Snapshot is
// updated only after a successful onComplete so a wedged push doesn't
// strand future deltas behind a never-cleared diff.
function _deltaSnapshotKey(profileId, arrayName) {
  return `labcharts-${profileId}-delta-${arrayName}`;
}

function _readDeltaSnapshot(profileId, arrayName) {
  try {
    const raw = localStorage.getItem(_deltaSnapshotKey(profileId, arrayName));
    return raw ? (JSON.parse(raw) || {}) : {};
  } catch { return {}; }
}

// v1.7.16 audit fix: snapshot write is now plannedAt-gated. The
// _syncing 60s in-flight guard plus delayed onComplete writing meant
// push A planned at T=0 could have its onComplete fire at T=70s
// AFTER push B started at T=65s and already wrote its snapshot —
// A's late onComplete would clobber B's fresher view, and the next
// push would diff against A's stale state, silently skipping items
// B had already added. Stamping each plan with its planning time
// and refusing to overwrite a snapshot whose plannedAt is newer
// than this plan's closes that race.
export function _writeDeltaSnapshot(profileId, arrayName, snap, plannedAt) {
  try {
    const metaKey = `${_deltaSnapshotKey(profileId, arrayName)}-meta`;
    if (Number.isFinite(plannedAt)) {
      const prevMetaRaw = localStorage.getItem(metaKey);
      if (prevMetaRaw) {
        try {
          const m = JSON.parse(prevMetaRaw);
          if (Number.isFinite(m?.plannedAt) && m.plannedAt >= plannedAt) {
            // `>=` (not `>`) so same-millisecond plannedAt collisions don't
            // let a slow-to-onComplete A clobber a faster-to-finish B that
            // already shipped fresher items. Date.now() granularity is 1ms.
            return false;
          }
        } catch {}
      }
      localStorage.setItem(metaKey, JSON.stringify({ plannedAt }));
    }
    localStorage.setItem(_deltaSnapshotKey(profileId, arrayName), JSON.stringify(snap));
    return true;
  } catch { return false; }
}

export function clearDeltaSnapshot(profileId, arrayName) {
  try {
    localStorage.removeItem(_deltaSnapshotKey(profileId, arrayName));
    localStorage.removeItem(`${_deltaSnapshotKey(profileId, arrayName)}-meta`);
    return true;
  } catch { return false; }
}

// Push the diff between the current array state and the last-pushed
// snapshot. Returns the candidate-new snapshot (caller commits it from
// onComplete after the blob push lands successfully).
export async function _planArrayDelta(profileId, arrayName, items) {
  const plannedAt = Date.now();
  const cfg = DELTA_ARRAY_CONFIG[arrayName] || {};
  const itemIdFn = typeof cfg.itemIdFn === 'function' ? cfg.itemIdFn : (it => (it && typeof it.id === 'string' ? it.id : null));
  const prev = _readDeltaSnapshot(profileId, arrayName);
  const next = {};
  const ops = []; // collected pending evolu mutations

  // Index existing itemRow rows for this (profile, array) so we can
  // reuse their `id` on update instead of creating phantom duplicates.
  const evolu = _currentEvolu();
  const itemRowQuery = _currentItemRowQuery();
  const allItemRows = (evolu && itemRowQuery) ? (evolu.getQueryRows(itemRowQuery) || []) : [];
  const matching = allItemRows.filter(r => r.profileId === profileId && r.arrayName === arrayName);
  const rowByItemId = new Map(matching.map(r => [r.itemId, r]));

  // Build [item, itemId] tuples, dropping anything whose derived itemId
  // fails _isAllowlistSafeId (covers regex + proto-pollution rejection).
  const tuples = Array.isArray(items)
    ? items.map(it => [it, itemIdFn(it)]).filter(([, id]) => _isAllowlistSafeId(id))
    : [];
  for (const [item, itemId] of tuples) {
    const json = JSON.stringify(item);
    const hash = _djb2(json);
    next[itemId] = hash;
    if (prev[itemId] === hash) continue; // unchanged — skip push

    // Compress payload the same way buildSyncPayload does — itemRow.payload
    // is a NonEmptyString, gzip+base64 envelope keeps small items tiny.
    let payload = json;
    if (typeof CompressionStream !== 'undefined' && json.length > 256) {
      try { payload = `GZ|v1|${_bytesToBase64(await _gzipString(json))}`; } catch {}
    }
    const existing = rowByItemId.get(itemId);
    const syncedAt = new Date().toISOString();
    // v1.7.11 audit fix: when the existing row is tombstoned (user deleted
    // the item, then re-added it), evolu.update without isDeleted leaves
    // the LWW register stuck at 1 — peers keep seeing it as a delete.
    // Explicitly set isDeleted to null so the resurrect wins LWW.
    const resurrect = existing?.isDeleted ? { isDeleted: null } : {};
    if (existing) {
      ops.push({ kind: 'update', args: { id: existing.id, profileId, arrayName, itemId, payload, syncedAt, ...resurrect } });
    } else {
      ops.push({ kind: 'insert', args: { profileId, arrayName, itemId, payload, syncedAt } });
    }
  }

  // Tombstones: items that were in the prev snapshot but no longer in
  // the array. Skip if the row is already tombstoned, or if no row
  // exists yet (could just be a snapshot/local-storage drift on a
  // fresh device; safer to no-op than to push a phantom delete).
  // Skipped entirely for arrays flagged noTombstones — capped lists where
  // local eviction is expected and a tombstone would destroy data on a
  // peer whose window happens to still include the item.
  //
  // Tombstone-storm guard (mirrors _planKeyedMapDelta): if the array went
  // from N>=20 items to <50% of that in a single push, refuse to emit
  // tombstones. A drop that large is almost always a transient state
  // issue (mid-import, mid-pull-merge, in-progress reset) rather than
  // the user genuinely deleting half their data. Letting it through
  // would propagate a wipe to peers via the relay. Concrete cases this
  // protects: sunSessions / deviceSessions / lightAudits / lightMeasurements
  // / entries — all user-owned, append-mostly, and rarely halve in normal
  // use. Logged at warn so debug mode surfaces when it fires; the user
  // can still genuinely empty an array (do it in two steps or via
  // explicit clear-data flows that bypass the planner).
  if (!cfg.noTombstones) {
    const prevCount = Object.keys(prev).length;
    const nextCount = Object.keys(next).length;
    const wouldEmitMassiveTombstone = prevCount >= 20 && nextCount < prevCount * 0.5;
    if (wouldEmitMassiveTombstone) {
      try {
        if (typeof console !== 'undefined' && console.warn) {
          console.warn(`[sync] _planArrayDelta refused tombstone storm for ${arrayName}: prev=${prevCount} next=${nextCount}. Likely transient state during pull-merge — push deferred.`);
        }
      } catch {}
    } else {
      for (const prevId of Object.keys(prev)) {
        if (Object.prototype.hasOwnProperty.call(next, prevId)) continue;
        const row = rowByItemId.get(prevId);
        if (!row || row.isDeleted) continue;
        ops.push({ kind: 'tombstone', args: { id: row.id, isDeleted: 1, syncedAt: new Date().toISOString() } });
      }
    }
  }

  return { ops, next, plannedAt };
}

// Keyed-map planner. Same shape as _planArrayDelta but iterates
// Object.entries() and uses the map key (sanitized) as itemId. Payload
// is `{k, v}` so the pull side can verify the key column matches the
// payload's claimed key — same defence-in-depth as itemIdFn(item) ===
// row.itemId on the array path. Tombstones DO emit (unlike changeHistory):
// markerNote keys are user-owned, `delete state.importedData.markerNotes[k]`
// is real intent that must propagate.
export async function _planKeyedMapDelta(profileId, mapName, mapObj) {
  const plannedAt = Date.now();
  const cfg = DELTA_MAP_CONFIG[mapName] || {};
  // keyIdFn: derive itemId from raw key. Default = identity-with-allowlist
  // (rejects unsafe keys including __proto__); custom fns may sanitize
  // colons etc but every result still goes through _isAllowlistSafeId
  // below for proto-pollution defence regardless of what the cfg returns.
  const keyIdFn = typeof cfg.keyIdFn === 'function'
    ? cfg.keyIdFn
    : (k => (_isAllowlistSafeId(k) ? k : null));
  const prev = _readDeltaSnapshot(profileId, mapName);
  const next = {};
  const ops = [];

  const evolu = _currentEvolu();
  const itemRowQuery = _currentItemRowQuery();
  const allItemRows = (evolu && itemRowQuery) ? (evolu.getQueryRows(itemRowQuery) || []) : [];
  const matching = allItemRows.filter(r => r.profileId === profileId && r.arrayName === mapName);
  const rowByItemId = new Map(matching.map(r => [r.itemId, r]));

  let obj = (mapObj && typeof mapObj === 'object' && !Array.isArray(mapObj)) ? mapObj : {};
  if (mapName === 'genetics.snps' && Object.keys(obj).length === 0) {
    // The blob/scalar paths intentionally strip genetics.snps; per-row
    // itemRows are the source of truth. If local importedData was hydrated
    // from a metadata-only genetics blob, or from an empty placeholder
    // object, before the per-row overlay ran, don't interpret that as
    // "delete every SNP" on the next unrelated save. Rebuild the
    // planning input from live rows instead.
    const fromRows = Object.create(null);
    for (const row of matching) {
      if (!row || row.isDeleted) continue;
      try {
        let json = row.payload;
        if (typeof json === 'string' && json.startsWith('GZ|v1|')) {
          if (typeof DecompressionStream === 'undefined') continue;
          json = await _gunzipToStringCapped(_base64ToBytes(json.slice(6)));
        }
        const parsed = JSON.parse(json);
        if (!parsed || typeof parsed !== 'object' || typeof parsed.k !== 'string') continue;
        if (keyIdFn(parsed.k) !== row.itemId) continue;
        if (_isProtoPollutionKey(parsed.k)) continue;
        fromRows[parsed.k] = parsed.v;
      } catch {}
    }
    if (Object.keys(fromRows).length > 0) obj = fromRows;
    else if (Object.keys(prev).length > 0) {
      return { ops, next: prev, plannedAt };
    }
  }
  for (const [rawKey, value] of Object.entries(obj)) {
    const itemId = keyIdFn(rawKey);
    // Defence-in-depth: even if cfg.keyIdFn returns a string that passes
    // its own check, re-validate via _isAllowlistSafeId so a buggy custom
    // fn can't smuggle __proto__/constructor through.
    if (!_isAllowlistSafeId(itemId)) continue;
    if (value === null || value === undefined) continue;
    // payload.k carries the ORIGINAL key — pull side rebuilds the map
    // under that key, not the synth itemId, so consumers reading the
    // raw `category.markerKey:date` form keep working.
    const payloadObj = { k: rawKey, v: value };
    const json = JSON.stringify(payloadObj);
    const hash = _djb2(json);
    next[itemId] = hash;
    if (prev[itemId] === hash) continue;

    let payload = json;
    if (typeof CompressionStream !== 'undefined' && json.length > 256) {
      try { payload = `GZ|v1|${_bytesToBase64(await _gzipString(json))}`; } catch {}
    }
    const existing = rowByItemId.get(itemId);
    const syncedAt = new Date().toISOString();
    // v1.7.11 audit fix: resurrect a tombstoned row by explicitly clearing
    // isDeleted (otherwise the LWW register stays 1 and peers keep seeing
    // a delete). Same fix as the array planner.
    const resurrect = existing?.isDeleted ? { isDeleted: null } : {};
    if (existing) {
      ops.push({ kind: 'update', args: { id: existing.id, profileId, arrayName: mapName, itemId, payload, syncedAt, ...resurrect } });
    } else {
      ops.push({ kind: 'insert', args: { profileId, arrayName: mapName, itemId, payload, syncedAt } });
    }
  }

  // Tombstones: keys present in prev snapshot but not in current map.
  // Same conservative guard as the array path — only emit if a row
  // actually exists for that itemId, and isn't already tombstoned.
  //
  // Tombstone-storm guard: if the map went from N>=20 keys to <50% of
  // that, refuse to emit tombstones for this push. A drop that large
  // is almost always a transient state issue (mid-import, mid-pull-
  // merge, in-progress reset) rather than the user genuinely deleting
  // half their map. Letting it through would propagate a wipe to
  // peers via the relay. Concrete instance this guards against:
  // genetics.snps had 43 keys, a pull-merge race momentarily set it
  // to 0, the next save's planner emitted 43 tombstones, every other
  // device pulled the wipe and lost their genetics.snps.
  // The user can still genuinely empty a map — they just have to do
  // it in two steps (or via explicit clear-data flows that bypass the
  // planner). Logged at info so debug mode shows when it fires.
  const prevCount = Object.keys(prev).length;
  const nextCount = Object.keys(next).length;
  const wouldEmitMassiveTombstone = prevCount >= 20 && nextCount < prevCount * 0.5;
  if (wouldEmitMassiveTombstone) {
    try {
      if (typeof console !== 'undefined' && console.warn) {
        console.warn(`[sync] _planKeyedMapDelta refused tombstone storm for ${mapName}: prev=${prevCount} next=${nextCount}. Likely transient state during pull-merge — push deferred.`);
      }
    } catch {}
  } else {
    for (const prevId of Object.keys(prev)) {
      if (Object.prototype.hasOwnProperty.call(next, prevId)) continue;
      const row = rowByItemId.get(prevId);
      if (!row || row.isDeleted) continue;
      ops.push({ kind: 'tombstone', args: { id: row.id, isDeleted: 1, syncedAt: new Date().toISOString() } });
    }
  }

  return { ops, next, plannedAt };
}

// Scalar planner. Singleton-shape fields (menstrualCycle, context cards,
// DNA, etc) — one itemRow per scalar, itemId = the scalar's field name.
// Payload is `{v: value}` for symmetry with the map shape (and so the
// pull side can defensively check `parsed` is an object before reading).
// Tombstones emit when the scalar transitions from non-null → null/undefined
// (real user intent: "I cleared this card"); they DON'T emit on initial
// load when the scalar has always been null (no prev snapshot row exists).
export async function _planScalarDelta(profileId, scalarName, scalarValue) {
  const plannedAt = Date.now();
  const prev = _readDeltaSnapshot(profileId, scalarName);
  const next = {};
  const ops = [];

  const evolu = _currentEvolu();
  const itemRowQuery = _currentItemRowQuery();
  const allItemRows = (evolu && itemRowQuery) ? (evolu.getQueryRows(itemRowQuery) || []) : [];
  const matching = allItemRows.filter(r => r.profileId === profileId && r.arrayName === scalarName);
  // Only one row per scalar; if multiples slipped in (e.g. a v1.7.5-era
  // race), use the most-recently-synced as canonical so the next update
  // overwrites that one and the others naturally fade.
  const canonical = matching.length === 0
    ? null
    : matching.slice().sort((a, b) => String(b.syncedAt || '').localeCompare(String(a.syncedAt || '')))[0];
  // Empty / null / undefined treated as absence — same posture as the
  // existing blob path, where buildSyncPayload sends null and the merger
  // treats it as "no opinion this push".
  const hasValue = scalarValue !== null && scalarValue !== undefined
    && !(typeof scalarValue === 'string' && scalarValue.length === 0);

  if (hasValue) {
    const payloadObj = { v: scalarValue };
    const json = JSON.stringify(payloadObj);
    const hash = _djb2(json);
    next[scalarName] = hash;
    if (prev[scalarName] !== hash) {
      let payload = json;
      if (typeof CompressionStream !== 'undefined' && json.length > 256) {
        try { payload = `GZ|v1|${_bytesToBase64(await _gzipString(json))}`; } catch {}
      }
      const syncedAt = new Date().toISOString();
      // v1.7.11 audit fix: resurrect after delete (object→null→object).
      // canonical may be tombstoned if the user previously cleared the
      // scalar; reusing its id without isDeleted: null leaves the LWW
      // register stuck at 1 and peers keep treating the scalar as null.
      const resurrect = canonical?.isDeleted ? { isDeleted: null } : {};
      if (canonical) {
        ops.push({ kind: 'update', args: { id: canonical.id, profileId, arrayName: scalarName, itemId: scalarName, payload, syncedAt, ...resurrect } });
      } else {
        ops.push({ kind: 'insert', args: { profileId, arrayName: scalarName, itemId: scalarName, payload, syncedAt } });
      }
    }
  } else if (prev[scalarName] && canonical && !canonical.isDeleted) {
    // non-null → null transition. Conservative tombstone — only emit if
    // we previously pushed a value (prev hash exists) AND a row actually
    // exists for it. Skips the boot-with-default-null case.
    ops.push({ kind: 'tombstone', args: { id: canonical.id, isDeleted: 1, syncedAt: new Date().toISOString() } });
  }
  return { ops, next, plannedAt };
}

// Apply the planned ops via Evolu. Called from pushProfile's onComplete
// after the fat-blob push lands.
//
// v1.7.12 audit fix: returns true only when every op succeeded. The
// caller (`onComplete`) skips the snapshot advance when this returns
// false — a partial failure used to silently advance the snapshot,
// poisoning future pushes (next push thought the failed items were
// already shipped to the relay and skipped them).
export function _applyArrayDelta(arrayName, plan) {
  const evolu = _currentEvolu();
  if (!evolu) return false;
  let allOk = true;
  for (const op of plan.ops) {
    try {
      if (op.kind === 'insert') evolu.insert("itemRow", op.args);
      else if (op.kind === 'update') evolu.update("itemRow", op.args);
      else if (op.kind === 'tombstone') evolu.update("itemRow", op.args);
    } catch (e) {
      allOk = false;
      console.warn(`[sync] delta op ${op.kind} ${arrayName} failed:`, e?.message || e);
    }
  }
  return allOk;
}
