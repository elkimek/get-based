import { createDeltaWrite } from './sync-delta-row-codec.js';
import type { DeltaPlan, DeltaPlannedOperation } from './sync-delta-row-codec.js';
// sync-delta-scalar-planner.js - Push-side singleton scalar delta planner.

import { _bytesToBase64, _gzipString } from './sync-payload-codec.js';
import { _djb2 } from './sync-delta-id.js';
import { _readDeltaSnapshot } from './sync-delta-snapshot.js';
import { getPlannerItemRows } from './sync-delta-planner-context.js';
import {readScalarVersion} from './sync-scalar-snapshot.js';

// Singleton fields use their field name as itemId and `{v: value}` on the wire.
// A clear emits a tombstone only after a previously pushed value.
export async function _planScalarDelta(profileId: string, scalarName: string, scalarValue: unknown, options: {force?: boolean} = {}): Promise<DeltaPlan> {
  const plannedAt = Date.now();
  const committed = readScalarVersion(profileId, scalarName);
  const prev = committed ? (committed.hash ? {[scalarName]: committed.hash} : {}) : _readDeltaSnapshot(profileId, scalarName);
  const next: DeltaPlan['next'] = {};
  const ops: DeltaPlannedOperation[] = [];

  const matching = getPlannerItemRows(profileId, scalarName);
  // Repair old duplicate rows by updating the most recently synced row.
  const canonical = matching.length === 0
    ? null
    : matching.slice().sort((a, b) => String(b.syncedAt || '').localeCompare(String(a.syncedAt || '')))[0];
  const editTimestamp = () => new Date(Math.max(Date.now(), (committed?.clock || 0) + 1,
    (Date.parse(String(canonical?.syncedAt || '')) || 0) + 1)).toISOString();
  // Empty / null / undefined are absence. Clearing a confirmed value is
  // an edit even when its item-row query has not arrived yet.
  const hasValue = scalarValue !== null && scalarValue !== undefined
    && !(typeof scalarValue === 'string' && scalarValue.length === 0);

  if (hasValue) {
    const payloadObj = { v: scalarValue };
    const json = JSON.stringify(payloadObj);
    const hash = _djb2(json);
    next[scalarName] = hash;
    if (options.force || prev[scalarName] !== hash) {
      let payload = json;
      if (typeof CompressionStream !== 'undefined' && json.length > 256) {
        try { payload = `GZ|v1|${_bytesToBase64(await _gzipString(json))}`; } catch {}
      }
      const syncedAt = editTimestamp();
      // Clear the LWW deletion register when reusing a tombstoned row.
      const resurrect = canonical?.isDeleted ? { isDeleted: null } : {};
      ops.push(createDeltaWrite(canonical, { profileId, arrayName: scalarName, itemId: scalarName, payload, syncedAt }, resurrect));
    }
  } else if (prev[scalarName] || (options.force && canonical)) {
    const syncedAt = editTimestamp();
    if (canonical) ops.push({ kind: 'tombstone', args: { id: canonical.id, isDeleted: 1, syncedAt } });
    // v7 only accepts isDeleted on updates. A normal clocked null-value row
    // carries the same clear when the prior row is not yet visible.
    else ops.push({kind: 'insert', args: {profileId, arrayName: scalarName, itemId: scalarName,
      payload: JSON.stringify({v: null}), syncedAt}});
  }
  return { ops, next, plannedAt };
}
