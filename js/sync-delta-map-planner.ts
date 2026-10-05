import { createDeltaWrite } from './sync-delta-row-codec.js';
import type { MapIdentityConfig } from './sync-delta-surface-config.js';
import type { DeltaPlan, DeltaPlannedOperation } from './sync-delta-row-codec.js';
// sync-delta-map-planner.js - Push-side keyed-map delta planner.

import {
  _base64ToBytes, _bytesToBase64, _gzipString, _gunzipToStringCapped,
} from './sync-payload-codec.js';
import { DELTA_MAP_CONFIG } from './sync-delta-surface-config.js';
import { _djb2, _isAllowlistSafeId, _isProtoPollutionKey } from './sync-delta-id.js';
import { _readDeltaSnapshot } from './sync-delta-snapshot.js';
import { getPlannerItemRows } from './sync-delta-planner-context.js';

const CLEARED_VALUE_MAPS = new Set([
  'manualValues',
  'markerValueNotes',
  // Zero is an explicit resurrection marker: a user intentionally re-added
  // a manual metric/date that had previously been deleted on another device.
  'manualMetricTombstones',
]);

// The wire payload preserves the raw key; itemId is independently sanitized.
// Pull verifies that both identities agree before rebuilding the map.
export async function _planKeyedMapDelta(profileId: string, mapName: string, mapObj: unknown): Promise<DeltaPlan> {
  const plannedAt = Date.now();
  const cfg: Partial<MapIdentityConfig> = DELTA_MAP_CONFIG[mapName] || {};
  // Custom IDs still pass the allowlist and prototype-key checks below.
  const keyIdFn: (key: unknown) => string | null = typeof cfg.keyIdFn === 'function'
    ? cfg.keyIdFn
    : (k => (_isAllowlistSafeId(k) ? k as string : null));
  const prev = _readDeltaSnapshot(profileId, mapName);
  const next: DeltaPlan['next'] = {};
  const ops: DeltaPlannedOperation[] = [];

  const matching = getPlannerItemRows(profileId, mapName);
  const rowByItemId = new Map(matching.map(r => [r.itemId, r]));

  let obj = (mapObj && typeof mapObj === 'object' && !Array.isArray(mapObj)) ? mapObj as Record<string, unknown> : {};
  if (mapName === 'genetics.snps' && Object.keys(obj).length === 0) {
    // Metadata-only genetics blobs omit SNPs. Rehydrate live rows instead of
    // treating that omission as a request to delete every SNP.
    const fromRows: Record<string, unknown> = Object.create(null);
    for (const row of matching) {
      if (!row || row.isDeleted) continue;
      try {
        let json = row.payload;
        if (typeof json === 'string' && json.startsWith('GZ|v1|')) {
          if (typeof DecompressionStream === 'undefined') continue;
          json = await _gunzipToStringCapped(_base64ToBytes(json.slice(6)));
        }
        const parsed = JSON.parse(json as string) as Record<string, unknown> | null;
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
    // Validate custom IDs too; never trust a surface-specific sanitizer alone.
    if (!_isAllowlistSafeId(itemId)) continue;
    if (value === undefined || (value === null && !CLEARED_VALUE_MAPS.has(mapName))) continue;
    // Readers use the original key, including escaped separators.
    const payloadObj = { k: rawKey, v: value };
    const json = JSON.stringify(payloadObj);
    const hash = _djb2(json);
    next[itemId!] = hash;
    if (prev[itemId!] === hash) continue;

    let payload = json;
    if (typeof CompressionStream !== 'undefined' && json.length > 256) {
      try { payload = `GZ|v1|${_bytesToBase64(await _gzipString(json))}`; } catch {}
    }
    const existing = rowByItemId.get(itemId!);
    const syncedAt = new Date().toISOString();
    // Clear the LWW deletion register when reusing a tombstoned row.
    const resurrect = existing?.isDeleted ? { isDeleted: null } : {};
    ops.push(createDeltaWrite(existing, { profileId, arrayName: mapName, itemId: itemId!, payload, syncedAt }, resurrect));
  }

  // Only existing live rows can be deleted. Refuse inferred mass deletion when
  // a snapshot of at least 20 keys suddenly loses more than half its members.
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
