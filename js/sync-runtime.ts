import type { SyncProfileRow } from './sync-payload.js';
import type { DeltaItemRow } from './sync-delta-row-codec.js';

interface SyncAppOwner extends Record<string, unknown> { id?: string; mnemonic?: string }
/** Common runtime operations exposed by both supported Evolu adapters. */
interface SyncRuntimeClient {
  // Each registered query selects its own row projection; profile rows are the default.
  getQueryRows<Row extends SyncProfileRow | DeltaItemRow = SyncProfileRow>(query: unknown): readonly Row[] | null | undefined;
  insert(table: 'profileData' | 'itemRow', args: unknown): unknown;
  update(table: 'profileData' | 'itemRow', args: unknown): unknown;
  loadQuery(query: unknown): Promise<unknown>;
  resetAppOwner(options: { reload: boolean }): unknown;
  restoreAppOwner(mnemonic: string, options?: { reload?: boolean }): unknown;
  subscribeQuery(query: unknown): (callback: () => void) => () => void;
  subscribeError(callback: (error: { type?: string } | null | undefined) => void): () => void;
  prepareHistoryReset?(): unknown;
  prepareHistoryResetForDisable?(): unknown;
}

// sync-runtime.ts - Mutable Evolu runtime handles shared by sync modules.

import {
  refreshChatWebSearchToggleRuntime,
  updateChatHeaderModelRuntime,
} from './chat-runtime.js';

let _evolu: SyncRuntimeClient | null = null;
let _profileQuery: unknown = null;
let _tombstoneQuery: unknown = null;
let _itemRowQuery: unknown = null;
let _appOwner: SyncAppOwner | null = null;
let _appOwnerError: unknown = null;
let _readyPromise: Promise<unknown> | null = null;
let _queryLoadedPromise: Promise<unknown> | null = null;

const syncRuntimeCallbacks: { refreshRoutstrBalance: () => unknown } = {
  refreshRoutstrBalance: () => {
    if (typeof document === 'undefined') return false;
    (import('./provider-wallet-panels.js' as string) as Promise<{ refreshRoutstrBalance(): unknown }>)
      .then(providerPanels => providerPanels.refreshRoutstrBalance())
      .catch(() => {});
    return true;
  },
};

export function configureSyncRuntimeCallbacks(callbacks: { refreshRoutstrBalance?: (() => unknown) | null } = {}) {
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
    ? (window as Window & typeof globalThis)
    : null;
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

export function setSyncEvolu(evolu: unknown) {
  _evolu = evolu as SyncRuntimeClient | null;
}

export function setSyncQueries({ profileQuery, tombstoneQuery, itemRowQuery }: { profileQuery?: unknown; tombstoneQuery?: unknown; itemRowQuery?: unknown } = {}) {
  _profileQuery = profileQuery ?? null;
  _tombstoneQuery = tombstoneQuery ?? null;
  _itemRowQuery = itemRowQuery ?? null;
}

export function setSyncAppOwner(owner: unknown) {
  const prevId = _appOwner?.id || null;
  const next = (owner ?? null) as SyncAppOwner | null;
  _appOwner = next;
  const nextId = next?.id || null;
  if (prevId !== nextId) dispatchSyncOwnerChangedRuntime(nextId);
}

export function setSyncAppOwnerError(error: unknown) {
  _appOwnerError = error ?? null;
}

export function refreshSyncedAIProviderUiRuntime() {
  const headerRefreshed = updateChatHeaderModelRuntime();
  return refreshChatWebSearchToggleRuntime() || headerRefreshed;
}

export function refreshSyncedRoutstrBalanceRuntime() {
  try {
    return syncRuntimeCallbacks.refreshRoutstrBalance() !== false;
  } catch {
    return false;
  }
}

export function dispatchSyncOwnerChangedRuntime(ownerId: string | null) {
  const runtime = getSyncRuntimeWindow();
  if (!runtime || typeof runtime.dispatchEvent !== 'function' || typeof runtime.CustomEvent !== 'function') return false;
  try {
    runtime.dispatchEvent(new runtime.CustomEvent('labcharts-sync-owner-changed', { detail: { ownerId, ready: !!ownerId } }));
    return true;
  } catch {
    return false;
  }
}

export function getSyncReloadUrlRuntime(fallback = '/') {
  const runtime = getSyncRuntimeWindow();
  const pathname = runtime?.location?.pathname;
  if (typeof pathname !== 'string' || !pathname) return fallback;
  // Evolu 7 uses this URL for its own identity-change reload. Preserve the
  // explicit rollback selector (and any other active app query state), or a
  // v7 identity rotation would silently restart under the default v8 client.
  const search = runtime?.location?.search;
  return `${pathname}${typeof search === 'string' ? search : ''}`;
}

export function scheduleSyncRuntimeReload(delayMs = 0) {
  const runtime = getSyncRuntimeWindow();
  const reload = runtime?.location?.reload;
  if (!runtime?.location || typeof reload !== 'function') return false;
  setTimeout(() => {
    reload.call(runtime.location);
  }, delayMs);
  return true;
}

export function setSyncReadyPromise(promise: Promise<unknown> | null | undefined) {
  _readyPromise = promise ?? null;
}

export function setSyncQueryLoadedPromise(promise: Promise<unknown> | null | undefined) {
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
