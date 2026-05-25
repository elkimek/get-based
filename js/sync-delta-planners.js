// sync-delta-planners.js - Push-side per-row delta planner facade.

import { configureSyncDeltaPlannerContext } from './sync-delta-planner-context.js';

export { _planArrayDelta } from './sync-delta-array-planner.js';
export { _planKeyedMapDelta } from './sync-delta-map-planner.js';
export { _planScalarDelta } from './sync-delta-scalar-planner.js';

export function configureSyncDeltaPlanners({ getEvolu, getItemRowQuery } = {}) {
  configureSyncDeltaPlannerContext({ getEvolu, getItemRowQuery });
}
