// @ts-check
// sync-runtime.js - Mutable Evolu runtime handles shared by sync modules.

let _evolu = null;
let _profileQuery = null;
let _tombstoneQuery = null;
let _itemRowQuery = null;
let _appOwner = null;
let _appOwnerError = null;
let _readyPromise = null;
let _queryLoadedPromise = null;

/** @type {{ refreshRoutstrBalance: Function }} */
const syncRuntimeCallbacks = {
  refreshRoutstrBalance: () => {
    if (typeof document === 'undefined') return false;
    import('./provider-wallet-panels.js')
      .then(providerPanels => providerPanels.refreshRoutstrBalance())
      .catch(() => {});
    return true;
  },
};

export function configureSyncRuntimeCallbacks(callbacks = {}) {
  const previous = { ...syncRuntimeCallbacks };
  if ('refreshRoutstrBalance' in callbacks) {
    syncRuntimeCallbacks.refreshRoutstrBalance = typeof callbacks.refreshRoutstrBalance === 'function'
      ? callbacks.refreshRoutstrBalance
      : () => false;
  }
  return previous;
}

function getSyncRuntimeWindow() {
  return typeof window !== 'undefined'
    ? /** @type {any} */ (window)
    : null;
}

/**
 * @param {string} name
 * @returns {Function | null}
 */
function getRuntimeFunction(name) {
  const runtime = getSyncRuntimeWindow();
  return runtime && typeof runtime[name] === 'function' ? runtime[name].bind(runtime) : null;
}

export function getSyncEvolu() { return _evolu; }
export function getSyncProfileQuery() { return _profileQuery; }
export function getSyncTombstoneQuery() { return _tombstoneQuery; }
export function getSyncItemRowQuery() { return _itemRowQuery; }
export function getSyncAppOwner() { return _appOwner; }
export function getSyncAppOwnerError() { return _appOwnerError; }
export function getSyncReadyPromise() { return _readyPromise; }
export function getSyncQueryLoadedPromise() { return _queryLoadedPromise; }
export function isSyncEvoluReady() { return !!_evolu; }

export function setSyncEvolu(evolu) {
  _evolu = evolu;
}

/** @param {{ profileQuery?: any, tombstoneQuery?: any, itemRowQuery?: any }} [queries] */
export function setSyncQueries({ profileQuery, tombstoneQuery, itemRowQuery } = {}) {
  _profileQuery = profileQuery ?? null;
  _tombstoneQuery = tombstoneQuery ?? null;
  _itemRowQuery = itemRowQuery ?? null;
}

export function setSyncAppOwner(owner) {
  const prevId = _appOwner?.id || null;
  const next = owner ?? null;
  _appOwner = next;
  const nextId = next?.id || null;
  if (prevId !== nextId) dispatchSyncOwnerChangedRuntime(nextId);
}

export function setSyncAppOwnerError(error) {
  _appOwnerError = error ?? null;
}

export function refreshSyncedAIProviderUiRuntime() {
  let refreshed = false;
  const updateHeader = getRuntimeFunction('updateChatHeaderModel');
  if (updateHeader) {
    updateHeader();
    refreshed = true;
  }
  const refreshWebSearch = getRuntimeFunction('refreshWebSearchToggle');
  if (refreshWebSearch) {
    refreshWebSearch();
    refreshed = true;
  }
  return refreshed;
}

export function refreshSyncedRoutstrBalanceRuntime() {
  try {
    return syncRuntimeCallbacks.refreshRoutstrBalance() !== false;
  } catch {
    return false;
  }
}

/** @param {string | null} ownerId */
export function dispatchSyncOwnerChangedRuntime(ownerId) {
  const runtime = getSyncRuntimeWindow();
  if (!runtime || typeof runtime.dispatchEvent !== 'function' || typeof runtime.CustomEvent !== 'function') return false;
  try {
    runtime.dispatchEvent(new runtime.CustomEvent('labcharts-sync-owner-changed', { detail: { ownerId, ready: !!ownerId } }));
    return true;
  } catch {
    return false;
  }
}

/** @param {string} [fallback] */
export function getSyncReloadUrlRuntime(fallback = '/') {
  const runtime = getSyncRuntimeWindow();
  const pathname = runtime?.location?.pathname;
  return typeof pathname === 'string' && pathname ? pathname : fallback;
}

/** @param {number} delayMs */
export function scheduleSyncRuntimeReload(delayMs = 0) {
  const runtime = getSyncRuntimeWindow();
  const reload = runtime?.location?.reload;
  if (!runtime?.location || typeof reload !== 'function') return false;
  setTimeout(() => {
    reload.call(runtime.location);
  }, delayMs);
  return true;
}

export function setSyncReadyPromise(promise) {
  _readyPromise = promise ?? null;
}

export function setSyncQueryLoadedPromise(promise) {
  _queryLoadedPromise = promise ?? null;
}

export function clearSyncRuntimeState() {
  _evolu = null;
  _profileQuery = null;
  _tombstoneQuery = null;
  _itemRowQuery = null;
  _appOwner = null;
  _appOwnerError = null;
  _readyPromise = null;
  _queryLoadedPromise = null;
}
