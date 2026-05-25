// sync-delta-map-planner.js - Push-side keyed-map delta planner.

import {
  _base64ToBytes, _bytesToBase64, _gzipString, _gunzipToStringCapped,
} from './sync-payload.js';
import {
  DELTA_MAP_CONFIG,
  _djb2, _isAllowlistSafeId, _isProtoPollutionKey,
} from './sync-delta-registry.js';
import { _readDeltaSnapshot } from './sync-delta-snapshot.js';
import { getPlannerItemRows } from './sync-delta-planner-context.js';

// Keyed-map planner. Same shape as _planArrayDelta but iterates
// Object.entries() and uses the map key (sanitized) as itemId. Payload
// is `{k, v}` so the pull side can verify the key column matches the
// payload's claimed key - same defence-in-depth as itemIdFn(item) ===
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

  const matching = getPlannerItemRows(profileId, mapName);
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
    // payload.k carries the ORIGINAL key - pull side rebuilds the map
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
  // Same conservative guard as the array path - only emit if a row
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
  // The user can still genuinely empty a map - they just have to do
  // it in two steps (or via explicit clear-data flows that bypass the
  // planner). Logged at warn so debug mode shows when it fires.
  const prevCount = Object.keys(prev).length;
  const nextCount = Object.keys(next).length;
  const wouldEmitMassiveTombstone = prevCount >= 20 && nextCount < prevCount * 0.5;
  if (wouldEmitMassiveTombstone) {
    try {
      if (typeof console !== 'undefined' && console.warn) {
        console.warn(`[sync] _planKeyedMapDelta refused tombstone storm for ${mapName}: prev=${prevCount} next=${nextCount}. Likely transient state during pull-merge - push deferred.`);
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
