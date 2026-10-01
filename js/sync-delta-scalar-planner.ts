import { createDeltaWrite } from './sync-delta-row-codec.js';
import type { DeltaPlan, DeltaPlannedOperation } from './sync-delta-row-codec.js';
// sync-delta-scalar-planner.js - Push-side singleton scalar delta planner.

import { _bytesToBase64, _gzipString } from './sync-payload-codec.js';
import { _djb2 } from './sync-delta-registry.js';
import { _readDeltaSnapshot } from './sync-delta-snapshot.js';
import { getPlannerItemRows } from './sync-delta-planner-context.js';

// Singleton fields use their field name as itemId and `{v: value}` on the wire.
// A clear emits a tombstone only after a previously pushed value.
export async function _planScalarDelta(profileId: string, scalarName: string, scalarValue: unknown): Promise<DeltaPlan> {
  const plannedAt = Date.now();
  const prev = _readDeltaSnapshot(profileId, scalarName);
  const next: DeltaPlan['next'] = {};
  const ops: DeltaPlannedOperation[] = [];

  const matching = getPlannerItemRows(profileId, scalarName);
  // Repair old duplicate rows by updating the most recently synced row.
  const canonical = matching.length === 0
    ? null
    : matching.slice().sort((a, b) => String(b.syncedAt || '').localeCompare(String(a.syncedAt || '')))[0];
  // Empty / null / undefined treated as absence - same posture as the
  // existing blob path, where buildSyncPayload sends null and the merger
  // treats it as "no opinion this push".
  const hasValue = scalarValue !== null && scalarValue !== undefined
    && !(typeof scalarValue === 'string' && scalarValue.length === 0);

  if (hasValue) {
    const payloadObj = { v: scalarValue };
    const json = JSON.stringify(payloadObj);
    const hash = _djb2(json);
    next[scalarName] = hash;
    if (prev[scalarName] !== hash) {
      let payload = json;
      if (typeof CompressionStream !== 'undefined' && json.length > 256) {
        try { payload = `GZ|v1|${_bytesToBase64(await _gzipString(json))}`; } catch {}
      }
      const syncedAt = new Date().toISOString();
      // Clear the LWW deletion register when reusing a tombstoned row.
      const resurrect = canonical?.isDeleted ? { isDeleted: null } : {};
      ops.push(createDeltaWrite(canonical, { profileId, arrayName: scalarName, itemId: scalarName, payload, syncedAt }, resurrect));
    }
  } else if (prev[scalarName] && canonical && !canonical.isDeleted) {
    // non-null -> null transition. Conservative tombstone - only emit if
    // we previously pushed a value (prev hash exists) AND a row actually
    // exists for it. Skips the boot-with-default-null case.
    ops.push({ kind: 'tombstone', args: { id: canonical.id, isDeleted: 1, syncedAt: new Date().toISOString() } });
  }
  return { ops, next, plannedAt };
}
