// sync-delta-scalar-planner.js - Push-side singleton scalar delta planner.

import { _bytesToBase64, _gzipString } from './sync-payload.js';
import { _djb2 } from './sync-delta-registry.js';
import { _readDeltaSnapshot } from './sync-delta-snapshot.js';
import { getPlannerItemRows } from './sync-delta-planner-context.js';

// Scalar planner. Singleton-shape fields (menstrualCycle, context cards,
// DNA, etc) - one itemRow per scalar, itemId = the scalar's field name.
// Payload is `{v: value}` for symmetry with the map shape (and so the
// pull side can defensively check `parsed` is an object before reading).
// Tombstones emit when the scalar transitions from non-null to null/undefined
// (real user intent: "I cleared this card"); they don't emit on initial
// load when the scalar has always been null (no prev snapshot row exists).
export async function _planScalarDelta(profileId, scalarName, scalarValue) {
  const plannedAt = Date.now();
  const prev = _readDeltaSnapshot(profileId, scalarName);
  const next = {};
  const ops = [];

  const matching = getPlannerItemRows(profileId, scalarName);
  // Only one row per scalar; if multiples slipped in (e.g. a v1.7.5-era
  // race), use the most-recently-synced as canonical so the next update
  // overwrites that one and the others naturally fade.
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
      // v1.7.11 audit fix: resurrect after delete (object->null->object).
      // canonical may be tombstoned if the user previously cleared the
      // scalar; reusing its id without isDeleted: null leaves the LWW
      // register stuck at 1 and peers keep treating the scalar as null.
      const resurrect = canonical?.isDeleted ? { isDeleted: null } : {};
      if (canonical) {
        ops.push({ kind: 'update', args: { id: canonical.id, profileId, arrayName: scalarName, itemId: scalarName, payload, syncedAt, ...resurrect } });
      } else {
        ops.push({ kind: 'insert', args: { profileId, arrayName: scalarName, itemId: scalarName, payload, syncedAt } });
      }
    }
  } else if (prev[scalarName] && canonical && !canonical.isDeleted) {
    // non-null -> null transition. Conservative tombstone - only emit if
    // we previously pushed a value (prev hash exists) AND a row actually
    // exists for it. Skips the boot-with-default-null case.
    ops.push({ kind: 'tombstone', args: { id: canonical.id, isDeleted: 1, syncedAt: new Date().toISOString() } });
  }
  return { ops, next, plannedAt };
}
