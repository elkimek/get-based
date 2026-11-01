import {compareSyncRows} from './sync-conflict-order.js';
import type { MapIdentityConfig } from './sync-delta-surface-config.js';
import type { DeltaItemRow, DeltaImportedData } from './sync-delta-row-codec.js';
// sync-delta-map-merge.js - Pull-side keyed-map row overlay helper.

import { getAt, setAt, pickTimestamp } from './data-merge.js';
import { recordPullDeltaSurface } from './sync-delta-pull-snapshot.js';
import { DELTA_MAP_CONFIG } from './sync-delta-surface-config.js';
import { _isAllowlistSafeId, _isProtoPollutionKey } from './sync-delta-id.js';
import { decodeRowPayload } from './sync-delta-row-codec.js';

export async function mergeMapRowsIntoImported(
  imported: DeltaImportedData, arrayName: string, arrRows: readonly DeltaItemRow[],
) {
  // Dotted-path support: same getAt/setAt walk as the array path.
  // Required for entries like `genetics.snps` so per-key CRDT lands
  // in the nested object instead of clobbering it as a top-level
  // sibling. Defaults to flat for the common case.
  const isNestedMap = arrayName.includes('.');
  const readMap = () => (isNestedMap ? getAt(imported, arrayName) : imported[arrayName]) as Record<string, unknown> | null | undefined;
  const writeMap = (v: unknown) => isNestedMap ? setAt(imported, arrayName, v) : (imported[arrayName] = v);
  let curMap = readMap();
  if (!curMap || typeof curMap !== 'object' || Array.isArray(curMap)) {
    // Object.create(null) (no Object.prototype chain) so a relay-controlled
    // key like '__proto__' that somehow slipped past the checks below would
    // be a regular property write, not a prototype-pollution sink.
    curMap = Object.create(null);
    writeMap(curMap);
  }
  // Same keyIdFn as push so synth-id maps verify correctly.
  const mapCfg: Partial<MapIdentityConfig> = DELTA_MAP_CONFIG[arrayName] || {};
  const rawKeyIdFn: (k: unknown) => string | null = typeof mapCfg.keyIdFn === 'function'
    ? mapCfg.keyIdFn
    : (k => (_isAllowlistSafeId(k) ? k as string : null));
  const keyIdFn = (k: unknown) => { const id = rawKeyIdFn(k); return _isAllowlistSafeId(id) ? id : null; };
  // Build a tombstone-key set first so deletes can find the original raw
  // key in the current map even when the row only carries the synth itemId.
  const liveByRawKey = new Map<string, { v: unknown; row: DeltaItemRow }>(); // rawKey -> { v, syncedAt }
  const tombRows = new Map<string,DeltaItemRow>();
  for (const row of arrRows) {
    if (row.isDeleted) {const prior=tombRows.get(row.itemId);if(!prior||compareSyncRows(row,prior)>0)tombRows.set(row.itemId,row);continue;}
    try {
      const parsed = await decodeRowPayload(row) as Record<string, unknown> | null;
      if (!parsed || typeof parsed !== 'object' || typeof parsed.k !== 'string') continue;
      // Defence-in-depth: re-derive itemId from the payload's claimed k and
      // verify it matches the row column. Catches a relay swapping payloads
      // between rows even for synth-id maps.
      if (keyIdFn(parsed.k) !== row.itemId) continue;
      const cur = liveByRawKey.get(parsed.k);
      if (!cur || compareSyncRows(row,cur.row)>0) liveByRawKey.set(parsed.k,{v:parsed.v,row});
    } catch {}
  }
  // Apply tombstones: walk current map keys, drop any whose synth itemId is
  // in the tombstone set. Only a strictly newer live version can resurrect it.
  if (tombRows.size > 0) {
    for (const k of Object.keys(curMap!)) {
      const synth=keyIdFn(k),tomb=synth?tombRows.get(synth):null,live=liveByRawKey.get(k);
      if(tomb&&(!live||compareSyncRows(tomb,live.row)>=0))delete curMap![k];
    }
  }
  // Apply live entries under their original key (preserves `:` for
  // manualValues etc). Reject proto-pollution keys at assignment because the
  // raw `parsed.k` is what we write to curMap.
  const newerManualField = (key: string, incoming: unknown) => arrayName === 'manualBodyReadings'
    && pickTimestamp(curMap![key]) > pickTimestamp(incoming);
  for (const [rawKey, entry] of liveByRawKey) {
    if (_isProtoPollutionKey(rawKey)) continue;
    const itemId=keyIdFn(rawKey),tomb=itemId?tombRows.get(itemId):null;
    if(tomb&&compareSyncRows(tomb,entry.row)>=0)continue;
    if (newerManualField(rawKey, entry.v)) continue;
    curMap![rawKey] = entry.v;
  }
  recordPullDeltaSurface(arrayName, { live: liveByRawKey.size, tombstones: tombRows.size });
}
