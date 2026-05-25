// sync-delta.js — Evolu per-row delta facade, apply wiring, and compatibility re-exports.

import { configureSyncDeltaObservability } from './sync-delta-observability.js';
import { configureSyncDeltaMerge } from './sync-delta-merge.js';
import { configureSyncDeltaPlanners } from './sync-delta-planners.js';

export { DELTA_ARRAYS, DELTA_MAPS, DELTA_SCALARS } from './sync-delta-registry.js';
export {
  _planArrayDelta, _planKeyedMapDelta, _planScalarDelta,
} from './sync-delta-planners.js';
export { _writeDeltaSnapshot, clearDeltaSnapshot } from './sync-delta-snapshot.js';
export {
  _recordPushTelemetry, getDeltaCutoverReadiness, getDeltaTelemetry,
  resetDeltaTelemetry,
} from './sync-delta-observability.js';
export { _mergeItemRowsIntoImported } from './sync-delta-merge.js';

let _getEvolu = () => null;
let _getItemRowQuery = () => null;

export function configureSyncDelta({ getEvolu, getItemRowQuery } = {}) {
  if (typeof getEvolu === 'function') _getEvolu = getEvolu;
  if (typeof getItemRowQuery === 'function') _getItemRowQuery = getItemRowQuery;
  const deps = {
    getEvolu: _getEvolu,
    getItemRowQuery: _getItemRowQuery,
  };
  configureSyncDeltaPlanners(deps);
  configureSyncDeltaObservability(deps);
  configureSyncDeltaMerge(deps);
}

function _currentEvolu() {
  try { return _getEvolu?.() || null; } catch { return null; }
}

// Apply the planned ops via Evolu. Called from pushProfile's onComplete
// after the fat-blob push lands.
//
// v1.7.12 audit fix: returns true only when every op succeeded. The
// caller (`onComplete`) skips the snapshot advance when this returns
// false — a partial failure used to silently advance the snapshot,
// poisoning future pushes (next push thought the failed items were
// already shipped to the relay and skipped them).
export function _applyArrayDelta(arrayName, plan) {
  const evolu = _currentEvolu();
  if (!evolu) return false;
  let allOk = true;
  for (const op of plan.ops) {
    try {
      if (op.kind === 'insert') evolu.insert("itemRow", op.args);
      else if (op.kind === 'update') evolu.update("itemRow", op.args);
      else if (op.kind === 'tombstone') evolu.update("itemRow", op.args);
    } catch (e) {
      allOk = false;
      console.warn(`[sync] delta op ${op.kind} ${arrayName} failed:`, e?.message || e);
    }
  }
  return allOk;
}
