// Ordering rows merge by semantic generation/operation identity, never transport LWW.
import { labOrderingMap, mergeLabOrdering, validLabOrderId } from './lab-ordering-core.js';
import { compareSyncRows, nextSyncRowTime } from './sync-conflict-order.js';
import { createDeltaWrite, decodeRowPayload } from './sync-delta-row-codec.js';
import type { DeltaItemRow, DeltaImportedData, DeltaPlan } from './sync-delta-row-codec.js';
import { getPlannerItemRows } from './sync-delta-planner-context.js';
import { _readDeltaSnapshot } from './sync-delta-snapshot.js';
import { _djb2, _isAllowlistSafeId } from './sync-delta-id.js';
import { _bytesToBase64, _gzipString, _PER_ROW_DECOMPRESSED_CAP_BYTES } from './sync-payload-codec.js';
import { recordPullDeltaSurface } from './sync-delta-pull-snapshot.js';
async function mergedRows(raw: unknown, rows: readonly DeltaItemRow[]) {
  let result = structuredClone(labOrderingMap(raw));
  for (const row of rows) {
    if (!row.payload) continue;
    const parsed: unknown = await decodeRowPayload(row);
    if (parsed === null && typeof row.payload === 'string' && row.payload.startsWith('GZ|v1|')) throw new Error('Ordering rows require decompression support before sync.');
    if (!parsed || typeof parsed !== 'object' || !('k' in parsed) || !('v' in parsed) || !validLabOrderId(parsed.k) || parsed.k !== row.itemId || !_isAllowlistSafeId(parsed.k)) continue;
    if (new TextEncoder().encode(canonicalJSON(parsed)).byteLength > _PER_ROW_DECOMPRESSED_CAP_BYTES) throw new Error('The ordering sync row exceeds the native transport limit.');
    // Transport deletion cannot infer an explicit reset. Even tombstoned rows
    // retain their semantic generation until a user creates a newer one.
    result = mergeLabOrdering(result, { [parsed.k]: parsed.v });
  }
  return result;
}
export async function mergeLabOrderingRows(imported: DeltaImportedData, rows: readonly DeltaItemRow[]) {
  const result = await mergedRows(imported.labOrdering, rows);
  imported.labOrdering = result;
  recordPullDeltaSurface('labOrdering', { live: rows.filter(row => !row.isDeleted).length, tombstones: rows.filter(row => row.isDeleted).length });
}
function canonicalJSON(value: unknown) {
  return JSON.stringify(value, (_key, entry: unknown) => entry && typeof entry === 'object' && !Array.isArray(entry)
    ? Object.fromEntries(Object.entries(entry).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) : entry);
}
export async function planLabOrderingDelta(profileId: string, raw: unknown): Promise<DeltaPlan> {
  const plannedAt = Date.now(), rows = getPlannerItemRows(profileId, 'labOrdering'), merged = await mergedRows(raw, rows);
  const mutationTime = nextSyncRowTime(rows);
  const prev = _readDeltaSnapshot(profileId, 'labOrdering'), next = { ...prev }, ops: DeltaPlan['ops'] = [];
  for (const [key, value] of Object.entries(merged)) {
    if (!validLabOrderId(key) || !_isAllowlistSafeId(key)) throw new Error('Review the saved ordering scope before syncing it.');
    const json = canonicalJSON({ k: key, v: value }), hash = _djb2(json); next[key] = hash;
    if (new TextEncoder().encode(json).byteLength > _PER_ROW_DECOMPRESSED_CAP_BYTES) throw new Error('The ordering sync row exceeds the native transport limit.');
    const existing = rows.filter(row => row.itemId === key).sort((a, b) => compareSyncRows(b, a))[0];
    const carrier = existing ? await decodeRowPayload(existing) as { k?: unknown; v?: unknown } | null : null;
    if (prev[key] === hash && !existing?.isDeleted && (!existing || carrier && canonicalJSON({ k: carrier.k, v: carrier.v }) === json)) continue;
    let payload = json;
    if (typeof CompressionStream !== 'undefined' && json.length > 256) payload = `GZ|v1|${_bytesToBase64(await _gzipString(json))}`;
    ops.push(createDeltaWrite(existing, { profileId, arrayName: 'labOrdering', itemId: key, payload, syncedAt: mutationTime }, existing?.isDeleted ? { isDeleted: 0 as const } : {}));
  }
  // Missing scopes are partial state, never transport deletion authority.
  return { ops, next, plannedAt };
}
