// sync-delta-map-merge.js - Pull-side keyed-map row overlay helper.

import { getAt, setAt } from './data-merge.js';
import { recordPullDeltaSurface } from './sync-delta-observability.js';
import {
  DELTA_MAP_CONFIG,
  _isAllowlistSafeId, _isProtoPollutionKey,
} from './sync-delta-registry.js';
import { decodeRowPayload } from './sync-delta-row-codec.js';

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
