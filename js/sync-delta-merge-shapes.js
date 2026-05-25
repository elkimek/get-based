// sync-delta-merge-shapes.js - Pull-side per-row delta shape merge helpers.

import { COMPOSITE_KEYED_ARRAYS, pickTimestamp, getAt, setAt } from './data-merge.js';
import { _base64ToBytes, _gunzipToStringCapped } from './sync-payload.js';
import { recordPullDeltaSurface } from './sync-delta-observability.js';
import {
  DELTA_ARRAY_CONFIG, DELTA_MAP_CONFIG,
  _isAllowlistSafeId, _isProtoPollutionKey,
} from './sync-delta-registry.js';

async function decodeRowPayload(row) {
  let json = row.payload;
  if (typeof json === 'string' && json.startsWith('GZ|v1|')) {
    if (typeof DecompressionStream === 'undefined') return null;
    json = await _gunzipToStringCapped(_base64ToBytes(json.slice(6)));
  }
  return JSON.parse(json);
}

export async function mergeScalarRowsIntoImported(imported, arrayName, arrRows) {
  let live = 0, tombs = 0;
  let chosen = null;
  let chosenAt = '';
  let tombstoned = false;
  let tombstonedAt = '';
  for (const row of arrRows) {
    if (row.itemId !== arrayName) continue; // defence: ignore foreign rows in this slot
    if (row.isDeleted) {
      if (String(row.syncedAt || '') > tombstonedAt) {
        tombstoned = true;
        tombstonedAt = String(row.syncedAt || '');
      }
      tombs++;
      continue;
    }
    try {
      const parsed = await decodeRowPayload(row);
      if (!parsed || typeof parsed !== 'object') continue;
      // Prefer the most-recently-synced live row when multiples exist.
      const ts = String(row.syncedAt || '');
      if (ts > chosenAt) { chosen = parsed; chosenAt = ts; }
      live++;
    } catch {}
  }
  // Latest write wins between live + tombstone: tombstone only
  // overwrites when its syncedAt is at-or-newer than the chosen
  // live row (otherwise an old delete would obliterate a fresh edit).
  const isNestedScalar = arrayName.includes('.');
  if (tombstoned && tombstonedAt >= chosenAt) {
    // Symmetric snps preservation: the live branch below restores
    // imported.genetics.snps when the map merge ran first; the tombstone
    // branch needs the same guard or `genetics.snps` rows get silently
    // wiped whenever the per-row map merger happens to run before this
    // scalar branch (byArray iteration order is determined by relay row
    // ordering, so it's racy).
    if (arrayName === 'genetics'
        && imported.genetics && typeof imported.genetics === 'object'
        && imported.genetics.snps && typeof imported.genetics.snps === 'object'
        && Object.keys(imported.genetics.snps).length > 0) {
      imported.genetics = { snps: imported.genetics.snps };
    } else if (isNestedScalar) {
      // Dotted-path scalar tombstone clears just the leaf, not the parent.
      setAt(imported, arrayName, null);
    } else {
      imported[arrayName] = null;
    }
  } else if (chosen) {
    // Preserve nested fields owned by a DELTA_MAPS dotted path. The
    // scalar payload is metadata-only by contract, so a remote scalar
    // must not blow away the local map.
    if (arrayName === 'genetics'
        && imported.genetics && typeof imported.genetics === 'object'
        && imported.genetics.snps && typeof imported.genetics.snps === 'object') {
      const localSnps = imported.genetics.snps;
      imported.genetics = chosen.v;
      if (imported.genetics && typeof imported.genetics === 'object') {
        imported.genetics.snps = localSnps;
      }
    } else if (isNestedScalar) {
      // Dotted-path scalar write: only the leaf, not the parent.
      setAt(imported, arrayName, chosen.v);
    } else {
      imported[arrayName] = chosen.v;
    }
  }
  recordPullDeltaSurface(arrayName, { live, tombstones: tombs });
}

export async function mergeMapRowsIntoImported(imported, arrayName, arrRows) {
  // Dotted-path support: same getAt/setAt walk as the array path.
  // Required for entries like `genetics.snps` so per-key CRDT lands
  // in the nested object instead of clobbering it as a top-level
  // sibling. Defaults to flat for the common case.
  const isNestedMap = arrayName.includes('.');
  const readMap = () => isNestedMap ? getAt(imported, arrayName) : imported[arrayName];
  const writeMap = (v) => isNestedMap ? setAt(imported, arrayName, v) : (imported[arrayName] = v);
  let curMap = readMap();
  if (!curMap || typeof curMap !== 'object' || Array.isArray(curMap)) {
    // Object.create(null) (no Object.prototype chain) so a relay-controlled
    // key like '__proto__' that somehow slipped past the checks below would
    // be a regular property write, not a prototype-pollution sink.
    curMap = Object.create(null);
    writeMap(curMap);
  }
  // Same keyIdFn as push so synth-id maps verify correctly.
  const mapCfg = DELTA_MAP_CONFIG[arrayName] || {};
  const rawKeyIdFn = typeof mapCfg.keyIdFn === 'function'
    ? mapCfg.keyIdFn
    : (k => (_isAllowlistSafeId(k) ? k : null));
  const keyIdFn = (k) => { const id = rawKeyIdFn(k); return _isAllowlistSafeId(id) ? id : null; };
  // Build a tombstone-key set first so deletes can find the original raw
  // key in the current map even when the row only carries the synth itemId.
  const liveByRawKey = new Map(); // rawKey -> { v, syncedAt }
  const tombItemIds = new Set();
  for (const row of arrRows) {
    if (row.isDeleted) { tombItemIds.add(row.itemId); continue; }
    try {
      const parsed = await decodeRowPayload(row);
      if (!parsed || typeof parsed !== 'object' || typeof parsed.k !== 'string') continue;
      // Defence-in-depth: re-derive itemId from the payload's claimed k and
      // verify it matches the row column. Catches a relay swapping payloads
      // between rows even for synth-id maps.
      if (keyIdFn(parsed.k) !== row.itemId) continue;
      // Iteration-order tiebreak hardening: prefer the row with the newer
      // relay-stamped syncedAt over whichever happened to come last in the
      // unordered SQLite scan.
      const sa = String(row.syncedAt || '');
      const cur = liveByRawKey.get(parsed.k);
      if (!cur || sa >= cur.syncedAt) {
        liveByRawKey.set(parsed.k, { v: parsed.v, syncedAt: sa });
      }
    } catch {}
  }
  // Apply tombstones: walk current map keys, drop any whose synth itemId is
  // in the tombstone set. Skips entries that just happened to be re-inserted
  // in this batch (liveByRawKey wins via overwrite).
  if (tombItemIds.size > 0) {
    for (const k of Object.keys(curMap)) {
      if (liveByRawKey.has(k)) continue;
      const synth = keyIdFn(k);
      if (synth && tombItemIds.has(synth)) delete curMap[k];
    }
  }
  // Apply live entries under their original key (preserves `:` for
  // manualValues etc). Reject proto-pollution keys at assignment because the
  // raw `parsed.k` is what we write to curMap.
  for (const [rawKey, entry] of liveByRawKey) {
    if (_isProtoPollutionKey(rawKey)) continue;
    curMap[rawKey] = entry.v;
  }
  recordPullDeltaSurface(arrayName, { live: liveByRawKey.size, tombstones: tombItemIds.size });
}

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
