// @ts-check
// sync-delta-observability-context.js - Shared Evolu query access for delta observability.

/** @type {() => any} */
let _getEvolu = () => null;
/** @type {() => any} */
let _getItemRowQuery = () => null;

/**
 * @typedef {object} SyncDeltaObservabilityContextOptions
 * @property {(() => any)=} getEvolu
 * @property {(() => any)=} getItemRowQuery
 */

/**
 * @param {SyncDeltaObservabilityContextOptions} [options]
 */
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
