// sync-runtime.js - Mutable Evolu runtime handles shared by sync modules.

let _evolu = null;
let _profileQuery = null;
let _tombstoneQuery = null;
let _itemRowQuery = null;
let _appOwner = null;
let _appOwnerError = null;
let _readyPromise = null;
let _queryLoadedPromise = null;

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

export function setSyncQueries({ profileQuery, tombstoneQuery, itemRowQuery } = {}) {
  _profileQuery = profileQuery ?? null;
  _tombstoneQuery = tombstoneQuery ?? null;
  _itemRowQuery = itemRowQuery ?? null;
}

export function setSyncAppOwner(owner) {
  _appOwner = owner ?? null;
}

export function setSyncAppOwnerError(error) {
  _appOwnerError = error ?? null;
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
