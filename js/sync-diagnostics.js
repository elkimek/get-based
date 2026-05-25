// sync-diagnostics.js - Evolu diagnostics public facade.

import { configureSyncDiagnosticsContext } from './sync-diagnostics-context.js';

export { _syncDiag, getEvoluDiagnostics } from './sync-diagnostics-snapshot.js';
export { _evoluDiagnosticsText } from './sync-diagnostics-text.js';

export function configureSyncDiagnostics(options = {}) {
  configureSyncDiagnosticsContext(options);
}
