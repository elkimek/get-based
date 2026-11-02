import { compareSyncRows, nextSyncRowTime } from './sync-conflict-order.js';
import { createDeltaWrite, decodeRowPayload } from './sync-delta-row-codec.js';
import { planLabOrderingDelta } from './lab-ordering-delta.js';
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
import { parseLabPanelTombstone } from './lab-panel-deletions.js';
import { mergeGeneticsSnpStates, mergeGeneticsSnpState, geneticsSnpAllowed, geneticsSnpRemoved, validGeneticsSnpId, parseGeneticsSnpState } from './genetics-snp-lifecycle.js';
import { mergeGeneticsLifecycle, mergeGeneticsScopeState, parseGeneticsScopeState, geneticsRecordAllowed, geneticsScopeRemoved } from './genetics-lifecycle.js';

const CLEARED_VALUE_MAPS = new Set([
  'manualValues',
  'markerValueNotes',
  // Zero is an explicit resurrection marker: a user intentionally re-added
  // a manual metric/date that had previously been deleted on another device.
  'manualMetricTombstones',
]);

// The wire payload preserves the raw key; itemId is independently sanitized.
// Pull verifies that both identities agree before rebuilding the map.
export async function _planKeyedMapDelta(profileId: string, mapName: string, mapObj: unknown, options: { geneticsSnpTombstones?: unknown; geneticsLifecycle?: unknown } = {}): Promise<DeltaPlan> {
  if (mapName === 'labOrdering') return planLabOrderingDelta(profileId, mapObj);
  const plannedAt = Date.now();
  const cfg: Partial<MapIdentityConfig> = DELTA_MAP_CONFIG[mapName] || {};
  // Custom IDs still pass the allowlist and prototype-key checks below.
  const keyIdFn: (key: unknown) => string | null = typeof cfg.keyIdFn === 'function'
    ? cfg.keyIdFn
    : (k => (_isAllowlistSafeId(k) ? k as string : null));
  const prev = _readDeltaSnapshot(profileId, mapName);
  if (mapObj === undefined && !['genetics.snps', 'geneticsSnpTombstones', 'geneticsLifecycle'].includes(mapName)) return {ops: [], next: prev, plannedAt};
  const next: DeltaPlan['next'] = {};
  const ops: DeltaPlannedOperation[] = [];

  const matching = getPlannerItemRows(profileId, mapName);
  const rowByItemId = new Map<string, typeof matching[number]>();
  for (const row of matching) {
    const prior = rowByItemId.get(row.itemId);
    if (!prior || compareSyncRows(row, prior) > 0) rowByItemId.set(row.itemId, row);
  }
  const mutationTime = nextSyncRowTime(matching);

  let obj = (mapObj && typeof mapObj === 'object' && !Array.isArray(mapObj)) ? mapObj as Record<string, unknown> : {};
  const snpStates = mergeGeneticsSnpStates(mapName === 'genetics.snps' || mapName === 'geneticsSnpTombstones' ? options.geneticsSnpTombstones : null, null);
  const lifecycle = mergeGeneticsLifecycle(mapName === 'genetics.snps' || mapName === 'geneticsLifecycle' ? options.geneticsLifecycle : null, null);
  if (mapName === 'genetics.snps' || mapName === 'geneticsLifecycle') for (const row of getPlannerItemRows(profileId, 'geneticsLifecycle')) {
    try {
      const parsed = await decodeRowPayload(row) as { k?: unknown; v?: unknown };
      if (typeof parsed?.k !== 'string' || !['genome', 'maternal'].includes(parsed.k) || parsed.k !== row.itemId) continue;
      const id = parsed.k as 'genome' | 'maternal'; lifecycle[id] = mergeGeneticsScopeState(id, lifecycle[id], parsed.v);
    } catch { /* Invalid transport state cannot erase a known removal generation. */ }
  }
  if (mapName === 'genetics.snps' || mapName === 'geneticsSnpTombstones') {
    for (const row of getPlannerItemRows(profileId, 'geneticsSnpTombstones')) {
      try {
        const parsed = await decodeRowPayload(row) as { k?: unknown; v?: unknown };
        if (!validGeneticsSnpId(parsed?.k) || parsed.k !== row.itemId) continue;
        snpStates[parsed.k] = mergeGeneticsSnpState(parsed.k, snpStates[parsed.k], parsed.v);
      } catch { /* Invalid row data cannot erase observed history. */ }
    }
  }
  if (mapName === 'geneticsSnpTombstones') obj = mergeGeneticsSnpStates(mapObj, snpStates);
  if (mapName === 'geneticsLifecycle') obj = mergeGeneticsLifecycle(mapObj, lifecycle);
  if (mapName === 'genetics.snps') obj = Object.fromEntries(Object.entries(obj).filter(([id, call]) => validGeneticsSnpId(id) && geneticsSnpAllowed(snpStates, id, call) && geneticsRecordAllowed(lifecycle, call)));
  if (mapName === 'genetics.snps' && Object.keys(obj).length === 0) {
    // Metadata-only genetics blobs omit SNPs. Rehydrate live rows instead of
    // treating that omission as a request to delete every SNP.
    const fromRows: Record<string, unknown> = Object.create(null);
    for (const row of rowByItemId.values()) {
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
        if (!geneticsSnpAllowed(snpStates, parsed.k, parsed.v)) continue;
        if (!geneticsRecordAllowed(lifecycle, parsed.v)) continue;
        fromRows[parsed.k] = parsed.v;
      } catch {}
    }
    if (Object.keys(fromRows).length > 0) obj = fromRows;
    else if (Object.keys(prev).length > 0 && !Object.keys(snpStates).length && !Object.keys(lifecycle).length) {
      return { ops, next: prev, plannedAt };
    }
  }
  for (const [rawKey, value] of Object.entries(obj)) {
    if (mapName === 'labPanelTombstones') parseLabPanelTombstone(rawKey, value);
    if (mapName === 'geneticsSnpTombstones') parseGeneticsSnpState(rawKey, value);
    if (mapName === 'geneticsLifecycle') parseGeneticsScopeState(rawKey, value);
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
    const syncedAt = mutationTime;
    // Clear the LWW deletion register when reusing a tombstoned row.
    const resurrect = existing?.isDeleted ? { isDeleted: 0 as const } : {};
    ops.push(createDeltaWrite(existing, { profileId, arrayName: mapName, itemId: itemId!, payload, syncedAt }, resurrect));
  }

  // Missing deletion history is not a restore request. Keep the carrier until
  // an explicit restore advances its monotonic restoredAt clock.
  if (mapName === 'labPanelTombstones' || mapName === 'geneticsSnpTombstones' || mapName === 'geneticsLifecycle') return { ops, next: { ...prev, ...next }, plannedAt };
  if (mapName === 'genetics.snps') {
    // An absent call can be a partial/metadata-only snapshot. Only a known
    // explicit semantic removal authorizes a transport tombstone.
    for (const id of new Set([...Object.keys(prev), ...rowByItemId.keys()])) {
      const genomeRemoved = geneticsScopeRemoved(lifecycle, 'genome');
      if (!(genomeRemoved ? _isAllowlistSafeId(id) : validGeneticsSnpId(id)) || Object.hasOwn(next, id)) continue;
      if (!genomeRemoved && !geneticsSnpRemoved(snpStates, id)) { if (prev[id]) next[id] = prev[id]!; continue; }
      const row = rowByItemId.get(id);
      if (row && !row.isDeleted) ops.push({ kind: 'tombstone', args: { id: row.id, isDeleted: 1, syncedAt: mutationTime } });
    }
    return { ops, next, plannedAt };
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
      ops.push({ kind: 'tombstone', args: { id: row.id, isDeleted: 1, syncedAt: mutationTime } });
    }
  }

  return { ops, next, plannedAt };
}
