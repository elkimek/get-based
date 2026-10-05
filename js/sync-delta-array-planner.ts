import { createDeltaWrite } from './sync-delta-row-codec.js';
import type { ArrayIdentityConfig, SyncIdentityRecord } from './sync-delta-surface-config.js';
import type { DeltaPlan, DeltaPlannedOperation } from './sync-delta-row-codec.js';
// sync-delta-array-planner.js - Push-side array delta planner.

import { _bytesToBase64, _gzipString } from './sync-payload-codec.js';
import { DELTA_ARRAY_CONFIG } from './sync-delta-surface-config.js';
import { _djb2, _isAllowlistSafeId } from './sync-delta-id.js';
import { _readDeltaSnapshot } from './sync-delta-snapshot.js';
import { getPlannerItemRows } from './sync-delta-planner-context.js';

interface ArrayDeltaOptions { explicitTombstoneIds?: readonly unknown[] | undefined }

// Push the diff between the current array state and the last-pushed
// snapshot. Returns the candidate-new snapshot (caller commits it from
// onComplete after the blob push lands successfully).
export async function _planArrayDelta(
  profileId: string, arrayName: string, items: unknown,
  { explicitTombstoneIds = [] }: ArrayDeltaOptions = {},
): Promise<DeltaPlan> {
  const plannedAt = Date.now();
  const cfg: Partial<ArrayIdentityConfig> = DELTA_ARRAY_CONFIG[arrayName] || {};
  const itemIdFn: (it: SyncIdentityRecord) => string | null = typeof cfg.itemIdFn === 'function' ? cfg.itemIdFn : (it => (it && typeof it.id === 'string' ? it.id : null));
  const prev = _readDeltaSnapshot(profileId, arrayName);
  const next: DeltaPlan['next'] = {};
  const ops: DeltaPlannedOperation[] = []; // collected pending evolu mutations

  // Index existing itemRow rows for this (profile, array) so we can
  // reuse their `id` on update instead of creating phantom duplicates.
  const matching = getPlannerItemRows(profileId, arrayName);
  const rowByItemId = new Map(matching.map(r => [r.itemId, r]));
  // Some capped surfaces suppress snapshot-inferred tombstones because a
  // local window eviction is maintenance rather than user intent. Explicit
  // `_deleted[path]` ids are different: they represent a durable privacy
  // deletion and must reach per-row sync even after the v4 blob cutover.
  const explicitTombstones = new Set(
    (Array.isArray(explicitTombstoneIds) ? explicitTombstoneIds : [])
      .filter((id): id is string => _isAllowlistSafeId(id)),
  );

  // Build [item, itemId] tuples, dropping anything whose derived itemId
  // fails _isAllowlistSafeId (covers regex + proto-pollution rejection).
  const tuples = Array.isArray(items)
    ? items.map<[unknown, string | null]>(it => [it, itemIdFn(it as SyncIdentityRecord)])
      .filter(([, id]) => _isAllowlistSafeId(id) && !explicitTombstones.has(id!)) as [unknown, string][]
    : [];
  for (const [item, itemId] of tuples) {
    const json = JSON.stringify(item);
    const hash = _djb2(json);
    next[itemId] = hash;
    if (prev[itemId] === hash) continue; // unchanged - skip push

    // Match the blob wire codec; compression failure retains plain JSON.
    let payload = json;
    if (typeof CompressionStream !== 'undefined' && json.length > 256) {
      try { payload = `GZ|v1|${_bytesToBase64(await _gzipString(json))}`; } catch {}
    }
    const existing = rowByItemId.get(itemId);
    const syncedAt = new Date().toISOString();
    // Clear the LWW deletion register when reusing a tombstoned row.
    const resurrect = existing?.isDeleted ? { isDeleted: null } : {};
    ops.push(createDeltaWrite(existing, { profileId, arrayName, itemId: itemId, payload, syncedAt }, resurrect));
  }

  // Missing rows: safer to no-op than to push a phantom delete.
  // Infer deletions only for existing live rows. Capped surfaces suppress eviction
  // tombstones; a sudden loss of half a large snapshot is treated as transient.
  const queuedTombstones = new Set<string>();
  const queueTombstone = (itemId: string) => {
    if (queuedTombstones.has(itemId)) return;
    const row = rowByItemId.get(itemId);
    if (!row || row.isDeleted) return;
    ops.push({ kind: 'tombstone', args: { id: row.id, isDeleted: 1, syncedAt: new Date().toISOString() } });
    queuedTombstones.add(itemId);
  };

  // Explicit deletions bypass noTombstones and the storm guard. They were
  // recorded by an intentional delete path, not inferred from an array-size
  // change, and therefore remain authoritative under Phase 2 cutover.
  for (const itemId of explicitTombstones) queueTombstone(itemId);

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
        queueTombstone(prevId);
      }
    }
  }

  return { ops, next, plannedAt };
}
