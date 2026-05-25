// sync-delta-observability-context.js - Shared Evolu query access for delta observability.

let _getEvolu = () => null;
let _getItemRowQuery = () => null;

export function configureSyncDeltaObservabilityContext({ getEvolu, getItemRowQuery } = {}) {
  if (typeof getEvolu === 'function') _getEvolu = getEvolu;
  if (typeof getItemRowQuery === 'function') _getItemRowQuery = getItemRowQuery;
}

export function currentDeltaEvolu() {
  try { return _getEvolu?.() || null; } catch { return null; }
}

export function currentDeltaItemRowQuery() {
  try { return _getItemRowQuery?.() || null; } catch { return null; }
}
