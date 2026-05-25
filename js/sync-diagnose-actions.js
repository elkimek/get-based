// sync-diagnose-actions.js - Public facade for Sync Diagnose action handlers.

import { configureSyncDiagnoseActionContext } from './sync-diagnose-actions-context.js';

export {
  confirmCompactRelay,
  refreshRelayStorage,
} from './sync-diagnose-relay-actions.js';
export {
  confirmRotateIdentity,
} from './sync-diagnose-identity-actions.js';
export {
  confirmBackfillBlockers,
  confirmDisablePhase2,
  confirmEnablePhase2,
  confirmResetDeltaTelemetry,
} from './sync-diagnose-cutover-actions.js';

export function configureSyncDiagnoseActions(deps = {}) {
  configureSyncDiagnoseActionContext(deps);
}
