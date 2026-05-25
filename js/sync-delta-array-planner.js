// sync-delta-array-planner.js - Push-side array delta planner.

import { _bytesToBase64, _gzipString } from './sync-payload.js';
import {
  DELTA_ARRAY_CONFIG,
  _djb2, _isAllowlistSafeId,
} from './sync-delta-registry.js';
import { _readDeltaSnapshot } from './sync-delta-snapshot.js';
import { getPlannerItemRows } from './sync-delta-planner-context.js';

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
  const matching = getPlannerItemRows(profileId, arrayName);
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
    if (prev[itemId] === hash) continue; // unchanged - skip push

    // Compress payload the same way buildSyncPayload does - itemRow.payload
    // is a NonEmptyString, gzip+base64 envelope keeps small items tiny.
    let payload = json;
    if (typeof CompressionStream !== 'undefined' && json.length > 256) {
      try { payload = `GZ|v1|${_bytesToBase64(await _gzipString(json))}`; } catch {}
    }
    const existing = rowByItemId.get(itemId);
    const syncedAt = new Date().toISOString();
    // v1.7.11 audit fix: when the existing row is tombstoned (user deleted
    // the item, then re-added it), evolu.update without isDeleted leaves
    // the LWW register stuck at 1 - peers keep seeing it as a delete.
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
  // Skipped entirely for arrays flagged noTombstones - capped lists where
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
  // / entries - all user-owned, append-mostly, and rarely halve in normal
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
          console.warn(`[sync] _planArrayDelta refused tombstone storm for ${arrayName}: prev=${prevCount} next=${nextCount}. Likely transient state during pull-merge - push deferred.`);
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
