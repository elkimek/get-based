// sync-delta-array-merge.js - Pull-side array row overlay helper.

import { COMPOSITE_KEYED_ARRAYS, pickTimestamp, getAt, setAt } from './data-merge.js';
import { recordPullDeltaSurface } from './sync-delta-observability.js';
import {
  DELTA_ARRAY_CONFIG,
  _isAllowlistSafeId,
} from './sync-delta-registry.js';
import { decodeRowPayload } from './sync-delta-row-codec.js';

export async function mergeArrayRowsIntoImported(imported, arrayName, arrRows) {
  // Read/write the target array: flat top-level for most surfaces, dotted-path
  // walk via getAt/setAt for nested ones (e.g. `lightEnvironment.rooms`).
  const isNested = arrayName.includes('.');
  const readArr = () => isNested ? getAt(imported, arrayName) : imported[arrayName];
  const writeArr = (v) => isNested ? setAt(imported, arrayName, v) : (imported[arrayName] = v);
  let curArr = readArr();
  if (!Array.isArray(curArr)) { curArr = []; writeArr(curArr); }
  // Same itemId derivation push side used. For arrays without `.id`
  // (composite-keyed like changeHistory) this matches the synth-id path.
  const cfg = DELTA_ARRAY_CONFIG[arrayName] || {};
  const rawItemIdFn = typeof cfg.itemIdFn === 'function' ? cfg.itemIdFn : (it => (it && typeof it.id === 'string' ? it.id : null));
  const itemIdFn = (it) => { const id = rawItemIdFn(it); return _isAllowlistSafeId(id) ? id : null; };
  // Seed the tombstone set with the local blob's `_deleted[path]` list before
  // walking relay rows. Trust local user intent while Phase 1 dual-write can
  // still race peer pushes.
  const tombs = new Set();
  try {
    const localDel = imported && imported._deleted;
    const localList = localDel && Array.isArray(localDel[arrayName]) ? localDel[arrayName] : null;
    if (localList) for (const id of localList) if (typeof id === 'string') tombs.add(id);
  } catch {}
  const liveById = new Map(); // itemId -> { item, ts, syncedAt }
  for (const row of arrRows) {
    if (row.isDeleted) { tombs.add(row.itemId); continue; }
    try {
      const item = await decodeRowPayload(row);
      // Verify the payload's derived itemId matches the row column.
      if (item && typeof item === 'object' && itemIdFn(item) === row.itemId) {
        // Cross-device races can produce multiple itemRow rows for the same
        // itemId. Pick the higher embedded timestamp first, syncedAt as the
        // secondary tiebreak.
        const ts = pickTimestamp(item);
        const sa = String(row.syncedAt || '');
        const cur = liveById.get(row.itemId);
        if (!cur || ts > cur.ts || (ts === cur.ts && sa > cur.syncedAt)) {
          liveById.set(row.itemId, { item, ts, syncedAt: sa });
        }
      }
    } catch {}
  }
  // Apply tombstones (drop) + live (replace or insert). Both sides key on
  // itemIdFn so changeHistory finds existing entries by synthesized id.
  let nextArr = curArr.filter(it => !tombs.has(itemIdFn(it)));
  // Dedup `nextArr` by itemIdFn before the liveById overlay. Keep the first
  // occurrence; the live overlay below will replace it with relay-authority.
  const seen = new Map();
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
    if (tombs.has(itemId)) continue;
    const item = entry.item;
    const idx = seen.get(itemId);
    if (idx !== undefined) nextArr[idx] = item;
    else nextArr.push(item);
  }
  writeArr(nextArr);
  // Re-apply COMPOSITE_KEYED_ARRAYS cap after the per-row overlay. v4 cutover
  // skips the blob merge entirely, so changeHistory needs this cap here.
  const cap = COMPOSITE_KEYED_ARRAYS.find(c => c.path === arrayName)?.cap;
  const cappedArr = readArr();
  if (cap && cappedArr.length > cap) {
    const trimmed = cappedArr.slice().sort((a, b) => {
      const ta = a?.updatedAt ?? a?.createdAt ?? a?.at ?? (typeof a?.date === 'string' ? Date.parse(a.date) : 0) ?? 0;
      const tb = b?.updatedAt ?? b?.createdAt ?? b?.at ?? (typeof b?.date === 'string' ? Date.parse(b.date) : 0) ?? 0;
      return tb - ta;
    });
    writeArr(trimmed.slice(0, cap));
  }
  recordPullDeltaSurface(arrayName, { live: liveById.size, tombstones: tombs.size });
}
