// @ts-check
// sync-diagnostics-context.js - dependency access for sync diagnostics.

/** @typedef {(...args: any[]) => any} SyncDiagnosticGetter */

/** @type {SyncDiagnosticGetter} */
let _getEvolu = () => null;
/** @type {SyncDiagnosticGetter} */
let _getProfileQuery = () => null;
/** @type {SyncDiagnosticGetter} */
let _getTombstoneQuery = () => null;
/** @type {SyncDiagnosticGetter} */
let _getAppOwner = () => null;
/** @type {SyncDiagnosticGetter} */
let _isSyncEnabled = () => false;
/** @type {SyncDiagnosticGetter} */
let _getSubscriptionFireCount = () => 0;
/** @type {SyncDiagnosticGetter} */
let _isSyncing = () => false;
/** @type {SyncDiagnosticGetter} */
let _isPulling = () => false;

/** @param {{
 *   getEvolu?: SyncDiagnosticGetter,
 *   getProfileQuery?: SyncDiagnosticGetter,
 *   getTombstoneQuery?: SyncDiagnosticGetter,
 *   getAppOwner?: SyncDiagnosticGetter,
 *   isSyncEnabled?: SyncDiagnosticGetter,
 *   getSubscriptionFireCount?: SyncDiagnosticGetter,
 *   isSyncing?: SyncDiagnosticGetter,
 *   isPulling?: SyncDiagnosticGetter,
 * }} [deps]
 */
export function configureSyncDiagnosticsContext({
  getEvolu,
  getProfileQuery,
  getTombstoneQuery,
  getAppOwner,
  isSyncEnabled,
  getSubscriptionFireCount,
  isSyncing,
  isPulling,
} = {}) {
  if (typeof getEvolu === 'function') _getEvolu = getEvolu;
  if (typeof getProfileQuery === 'function') _getProfileQuery = getProfileQuery;
  if (typeof getTombstoneQuery === 'function') _getTombstoneQuery = getTombstoneQuery;
  if (typeof getAppOwner === 'function') _getAppOwner = getAppOwner;
  if (typeof isSyncEnabled === 'function') _isSyncEnabled = isSyncEnabled;
  if (typeof getSubscriptionFireCount === 'function') _getSubscriptionFireCount = getSubscriptionFireCount;
  if (typeof isSyncing === 'function') _isSyncing = isSyncing;
  if (typeof isPulling === 'function') _isPulling = isPulling;
}

export function currentDiagnosticEvolu() {
  try { return _getEvolu?.() || null; } catch { return null; }
}

export function currentDiagnosticProfileQuery() {
  try { return _getProfileQuery?.() || null; } catch { return null; }
}

export function currentDiagnosticTombstoneQuery() {
  try { return _getTombstoneQuery?.() || null; } catch { return null; }
}

export function currentDiagnosticAppOwner() {
  try { return _getAppOwner?.() || null; } catch { return null; }
}

export function currentDiagnosticSyncEnabled() {
  try { return !!_isSyncEnabled?.(); } catch { return false; }
}

export function currentDiagnosticSubscriptionFireCount() {
  try { return Number(_getSubscriptionFireCount?.() || 0); } catch { return 0; }
}

export function currentDiagnosticSyncing() {
  try { return !!_isSyncing?.(); } catch { return false; }
}

export function currentDiagnosticPulling() {
  try { return !!_isPulling?.(); } catch { return false; }
}
