// sync-delta-observability.js - Delta observability facade.

import { configureSyncDeltaObservabilityContext } from './sync-delta-observability-context.js';

export function configureSyncDeltaObservability({ getEvolu, getItemRowQuery } = {}) {
  configureSyncDeltaObservabilityContext({ getEvolu, getItemRowQuery });
}

export { resetPullDeltaSnapshot, recordPullDeltaSurface } from './sync-delta-pull-snapshot.js';
export { _recordPushTelemetry, getDeltaTelemetry, resetDeltaTelemetry } from './sync-delta-telemetry.js';
export { getDeltaCutoverReadiness } from './sync-delta-readiness.js';
