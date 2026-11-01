import {compareSyncRows,syncValueKey} from './sync-conflict-order.js';
import type { LabEntryDraft } from './lab-entry.js';
import type { ArrayIdentityConfig, SyncIdentityRecord } from './sync-delta-surface-config.js';
import type { DeltaItemRow, DeltaImportedData } from './sync-delta-row-codec.js';
// sync-delta-array-merge.js - Pull-side array row overlay helper.

import {
  COMPOSITE_KEYED_ARRAYS,
  compareRecordFreshness,
  pickTimestamp,
  getAt,
  setAt,
  mergeLabEntry,
} from './data-merge.js';
import { recordPullDeltaSurface } from './sync-delta-pull-snapshot.js';
import { DELTA_ARRAY_CONFIG } from './sync-delta-surface-config.js';
import { _djb2, _isAllowlistSafeId } from './sync-delta-id.js';
import { readArrayVersions, readLegacyArrayVersions } from './sync-delta-snapshot.js';
import type { ArrayItemVersion } from './sync-delta-snapshot.js';
import { decodeRowPayload } from './sync-delta-row-codec.js';

function parseRowSyncedAt(row: DeltaItemRow | null | undefined) {
  const ts = Date.parse((row?.syncedAt || '') as string);
  return Number.isFinite(ts) ? ts : 0;
}

export async function mergeArrayRowsIntoImported(
  imported: DeltaImportedData, arrayName: string, arrRows: readonly DeltaItemRow[],
  options: { baselineItems?: readonly unknown[] | undefined; baselineSyncedAt?: number | undefined;
    profileId?: string | undefined; localItems?: readonly unknown[] | undefined;
    onVersion?: (itemId: string, version: ArrayItemVersion) => void } = {},
) {
  const committedVersions = readArrayVersions(options.profileId, arrayName);
  const legacyVersions = readLegacyArrayVersions(options.profileId, arrayName);
  // Read/write the target array: flat top-level for most surfaces, dotted-path
  // walk via getAt/setAt for nested ones (e.g. `lightEnvironment.rooms`).
  const isNested = arrayName.includes('.');
  const readArr = () => (isNested ? getAt(imported, arrayName) : imported[arrayName]) as Record<string, unknown>[];
  const writeArr = (v: unknown) => isNested ? setAt(imported, arrayName, v) : (imported[arrayName] = v);
  let curArr = readArr();
  if (!Array.isArray(curArr)) { curArr = []; writeArr(curArr); }
  // Same itemId derivation push side used. For arrays without `.id`
  // (composite-keyed like changeHistory) this matches the synth-id path.
  const cfg: Partial<ArrayIdentityConfig> = DELTA_ARRAY_CONFIG[arrayName] || {};
  const rawItemIdFn: (it: SyncIdentityRecord) => string | null = typeof cfg.itemIdFn === 'function' ? cfg.itemIdFn : (it => (it && typeof it.id === 'string' ? it.id : null));
  const itemIdFn = (it: unknown) => { const id = rawItemIdFn(it as SyncIdentityRecord); return _isAllowlistSafeId(id) ? id : null; };
  const baselineSyncedAt = Number.isFinite(options.baselineSyncedAt)
    ? Number(options.baselineSyncedAt)
    : 0;
  const baselineItemIds = new Set(
    (Array.isArray(options.baselineItems) ? options.baselineItems : [])
      .map(itemIdFn)
      .filter(Boolean),
  );
  // Seed the tombstone set with the local blob's `_deleted[path]` list before
  // walking relay rows. Trust local user intent while Phase 1 dual-write can
  // still race peer pushes.
  const localTombs = new Set<string>();
  const remoteTombs = new Map<string, number>();
  try {
    const localDel = imported && imported._deleted;
    const localList = localDel && Array.isArray(localDel[arrayName]) ? localDel[arrayName] : null;
    if (localList) for (const id of localList) if (typeof id === 'string') localTombs.add(id);
  } catch {}
  const locallyRestored = new Set((options.localItems || []).map(itemIdFn).filter(id => id && committedVersions[id]?.hash === null));
  const liveById = new Map<string, { item: Record<string, unknown>; ts: number; syncedAt: string; row: DeltaItemRow }>(); // itemId -> { item, ts, syncedAt }
  const represented=new Map<string,Set<string>>();
  for (const row of arrRows) {
    if (row.isDeleted) {
      const prev = remoteTombs.get(row.itemId) || 0;
      remoteTombs.set(row.itemId, Math.max(prev, parseRowSyncedAt(row)));
      continue;
    }
    try {
      const item = await decodeRowPayload(row) as Record<string, unknown> | null;
      // Verify the payload's derived itemId matches the row column.
      if (item && typeof item === 'object' && itemIdFn(item) === row.itemId) {
        // Cross-device races can produce multiple itemRow rows for the same
        // itemId. Pick the higher embedded timestamp first, syncedAt as the
        // secondary tiebreak.
        const ts = pickTimestamp(item);
        const sa = String(row.syncedAt || '');
        const values=represented.get(row.itemId)??new Set<string>();values.add(syncValueKey(item));represented.set(row.itemId,values);
        const cur = liveById.get(row.itemId);
        if (!cur || ts > cur.ts || (ts === cur.ts && compareSyncRows(row,cur.row)>0)) {
          liveById.set(row.itemId, { item, ts, syncedAt: sa, row });
        }
      }
    } catch {}
  }
  const tombstoneWinsOverItem = (itemId: string | null, item: unknown) => {
    if (!itemId) return false;
    if (localTombs.has(itemId)) return true;
    const tombAt = remoteTombs.get(itemId);
    // A later profile timestamp can come from an unrelated save. It cannot
    // undo this item's acknowledged deletion before a live row restores it.
    const committed = committedVersions[itemId];
    if (locallyRestored.has(itemId) && (tombAt == null || tombAt <= committed!.clock)) return false;
    if (committed?.hash === null && committed.clock >= pickTimestamp(item)) return true;
    if (tombAt == null) return false;
    const canonicalBlobAt = baselineItemIds.has(itemId) ? baselineSyncedAt : 0;
    return tombAt >= Math.max(pickTimestamp(item), canonicalBlobAt);
  };
  const tombstoneWinsOverLiveRow = (itemId: string | null, entry: { ts: number; syncedAt: string; row: DeltaItemRow } | null | undefined) => {
    if (!itemId) return false;
    if (localTombs.has(itemId)) return true;
    const committed = committedVersions[itemId];
    if (committed?.hash === null && committed.clock >= parseRowSyncedAt(entry?.row)) return true;
    const tombAt = remoteTombs.get(itemId);
    if (tombAt == null) return false;
    const liveAt = Math.max(entry?.ts || 0, Date.parse(entry?.syncedAt || '') || 0);
    return tombAt >= liveAt;
  };
  // Apply tombstones (drop) + live (replace or insert). Both sides key on
  // itemIdFn so changeHistory finds existing entries by synthesized id.
  let nextArr = curArr.filter(it => !tombstoneWinsOverItem(itemIdFn(it), it));
  // Dedup `nextArr` by itemIdFn before the liveById overlay. Keep the first
  // occurrence; the live overlay below will replace it with relay-authority.
  const seen = new Map<string, number>();
  nextArr = nextArr.filter((it, i) => {
    const k = itemIdFn(it);
    if (k == null) return true; // unkeyed items kept (legacy/no-id case)
    if (seen.has(k)) return false; // drop duplicate
    seen.set(k, i);
    return true;
  });
  // Re-index after the dedup filter so seen.get(itemId) maps to the correct
  // position in the trimmed nextArr.
  seen.clear();
  for (let i = 0; i < nextArr.length; i++) {
    const k = itemIdFn(nextArr[i]);
    if (k != null) seen.set(k, i);
  }
  for (const [itemId, entry] of liveById) {
    // Honour blob tombstones seeded above.
    if (tombstoneWinsOverLiveRow(itemId, entry)) continue;
    const item = entry.item;
    const idx = seen.get(itemId);
    if (idx !== undefined) {
      if (arrayName === 'entries') {
        nextArr[idx] = mergeLabEntry(nextArr[idx] as LabEntryDraft, item as LabEntryDraft);
        continue;
      }
      // The blob merge may already contain a fresh local edit that has not
      // reached the per-row relay yet. Keep current on ties too; this must
      // match unionById/localHasRowsRemoteLacks in data-merge.js.
      if (compareRecordFreshness(item, nextArr[idx]) <= 0) {
        // Preserve an unrepresented local edit while its query catches up.
        // When both conflicting committed values are present, use the same
        // canonical row on every device instead of preserving each local tie.
        const receipt = committedVersions[itemId] ?? legacyVersions[itemId];
        const newerCommitted = receipt?.hash === _djb2(JSON.stringify(nextArr[idx]))
          && parseRowSyncedAt(entry.row) > receipt.clock;
        if (compareRecordFreshness(item, nextArr[idx]) < 0
            || (!represented.get(itemId)?.has(syncValueKey(nextArr[idx])) && !newerCommitted)) continue;
      }
      nextArr[idx] = item;
    }
    else nextArr.push(item);
  }
  writeArr(nextArr);
  // Re-apply COMPOSITE_KEYED_ARRAYS cap after the per-row overlay. v4 cutover
  // skips the blob merge entirely, so changeHistory needs this cap here.
  const cap = COMPOSITE_KEYED_ARRAYS.find(c => c.path === arrayName)?.cap;
  const cappedArr = readArr();
  if (cap && cappedArr.length > cap) {
    const trimmed = cappedArr.slice().sort((a, b) => pickTimestamp(b) - pickTimestamp(a));
    writeArr(trimmed.slice(0, cap));
  }
  const presentIds = new Set<string>();
  for (const item of readArr()) {
    const id = itemIdFn(item), entry = id ? liveById.get(id) : null;
    if (id) presentIds.add(id);
    if (!id || !entry || parseRowSyncedAt(entry.row) <= 0 || tombstoneWinsOverLiveRow(id, entry)) continue;
    const hash = _djb2(JSON.stringify(item));
    if (hash === _djb2(JSON.stringify(entry.item))) options.onVersion?.(id, {hash, clock: parseRowSyncedAt(entry.row)});
  }
  for (const [id, clock] of remoteTombs) {
    if (!presentIds.has(id) && clock > 0) options.onVersion?.(id, {hash: null, clock});
  }
  recordPullDeltaSurface(arrayName, { live: liveById.size, tombstones: localTombs.size + remoteTombs.size });
}
