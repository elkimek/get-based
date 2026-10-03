import { createDeltaQueryAccess } from './sync-delta-observability-context.js';
import type { DeltaMutationClient, DeltaQueryOptions } from './sync-delta-observability-context.js';
import type { DeltaOperation } from './sync-delta-telemetry.js';
// sync-delta.js — Evolu per-row delta facade, apply wiring, and compatibility re-exports.

import { getErrorMessage } from './caught-error.js';
import { configureSyncDeltaObservability } from './sync-delta-observability-context.js';
import { configureSyncDeltaMerge } from './sync-delta-merge.js';
import { configureSyncDeltaPlanners } from './sync-delta-planner-context.js';

export { DELTA_ARRAYS, DELTA_MAPS, DELTA_SCALARS } from './sync-delta-surfaces.js';
export { _planArrayDelta } from './sync-delta-array-planner.js';
export { _planKeyedMapDelta } from './sync-delta-map-planner.js';
export { _planScalarDelta } from './sync-delta-scalar-planner.js';
export { _writeDeltaSnapshot, clearDeltaSnapshot } from './sync-delta-snapshot.js';
export { _recordPushTelemetry, getDeltaTelemetry, resetDeltaTelemetry } from './sync-delta-telemetry.js';
export { getDeltaCutoverReadiness } from './sync-delta-readiness.js';
export { _mergeItemRowsIntoImported } from './sync-delta-merge.js';

const deltaQueryAccess = createDeltaQueryAccess<DeltaMutationClient>();

export function configureSyncDelta({ getEvolu, getItemRowQuery }: DeltaQueryOptions<DeltaMutationClient> = {}) {
  deltaQueryAccess.configure({ getEvolu, getItemRowQuery });
  const deps = deltaQueryAccess.providers();
  configureSyncDeltaPlanners(deps);
  configureSyncDeltaObservability(deps);
  configureSyncDeltaMerge(deps);
}

function _currentEvolu() {
  return deltaQueryAccess.currentEvolu();
}

// Apply after the blob commits. A partial failure keeps the snapshot unchanged
// so failed rows are retried on the next push. Continue queuing remaining ops.
export function _applyArrayDelta(arrayName: string, plan: { ops: readonly DeltaOperation[] }) {
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
      console.warn(`[sync] delta op ${op.kind} ${arrayName} failed:`, getErrorMessage(e, e));
    }
  }
  return allOk;
}
