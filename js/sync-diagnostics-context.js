// sync-diagnostics-context.js - dependency access for sync diagnostics.

let _getEvolu = () => null;
let _getProfileQuery = () => null;
let _getTombstoneQuery = () => null;
let _getAppOwner = () => null;
let _isSyncEnabled = () => false;
let _getSubscriptionFireCount = () => 0;
let _isSyncing = () => false;
let _isPulling = () => false;

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
