// @ts-check
// sync-init.js - Evolu initialization and startup reconciliation.

import { isDebugMode, showNotification } from './utils.js';
import { createSyncQueries, createSyncSchema } from './sync-schema.js';
import { getSyncBlocker, getSyncRelay } from './sync-environment.js';
import {
  isSyncConfigured, isSyncEnabled, primeSyncState, setSyncEnabled,
} from './sync-settings-state.js';
import { bindSyncRecoveryEvents } from './sync-recovery.js';
import {
  bindSyncSubscriptions, getSyncSubscriptionFireCount, startRelayProbe,
} from './sync-subscriptions.js';
import {
  beginSyncRebroadcastSettling, finishSyncRebroadcastSettling,
} from './sync-pull-rebroadcast.js';
import { scheduleOwnerStorageRefresh } from './sync-relay-health.js';
import { consumeSyncRestoreNotice } from './sync-identity.js';
import {
  getSyncAppOwner, getSyncEvolu, getSyncItemRowQuery, getSyncProfileQuery,
  getSyncReloadUrlRuntime, getSyncTombstoneQuery,
  setSyncAppOwner, setSyncAppOwnerError, setSyncEvolu,
  setSyncQueries, setSyncQueryLoadedPromise,
  setSyncReadyPromise,
} from './sync-runtime.js';

/** @type {() => Promise<any>} */
let _reconcileLocalStorageWithEvolu = async () => {};
/** @type {() => Promise<any>} */
let _forcePull = async () => {};
let _isSyncPulling = () => false;

/** @param {{
 *   reconcileLocalStorageWithEvolu?: () => Promise<any>,
 *   forcePull?: () => Promise<any>,
 *   isSyncPulling?: () => boolean,
 * }} [deps] */
export function configureSyncInit({
  reconcileLocalStorageWithEvolu,
  forcePull,
  isSyncPulling,
} = {}) {
  if (typeof reconcileLocalStorageWithEvolu === 'function') {
    _reconcileLocalStorageWithEvolu = reconcileLocalStorageWithEvolu;
  }
  if (typeof forcePull === 'function') _forcePull = forcePull;
  if (typeof isSyncPulling === 'function') _isSyncPulling = isSyncPulling;
}

function reconcileLocalStorageWithEvolu() {
  return _reconcileLocalStorageWithEvolu();
}

const INITIAL_REPLICA_MIN_SETTLE_MS = 1000;
const INITIAL_REPLICA_QUIET_MS = 750;
const INITIAL_REPLICA_MAX_SETTLE_MS = 10000;
const INITIAL_REPLICA_POLL_MS = 250;

export async function waitForInitialReplicaQuiet({
  getFireCount = getSyncSubscriptionFireCount,
  isPulling = _isSyncPulling,
  now = Date.now,
  wait = ms => new Promise(resolve => setTimeout(resolve, ms)),
} = {}) {
  const startedAt = now();
  let quietSince = startedAt;
  let lastFireCount = getFireCount();
  while (now() - startedAt < INITIAL_REPLICA_MAX_SETTLE_MS) {
    await wait(INITIAL_REPLICA_POLL_MS);
    const currentFireCount = getFireCount();
    if (currentFireCount !== lastFireCount || isPulling()) quietSince = now();
    lastFireCount = currentFireCount;
    if (now() - startedAt >= INITIAL_REPLICA_MIN_SETTLE_MS
        && now() - quietSince >= INITIAL_REPLICA_QUIET_MS
        && !isPulling()) return true;
  }
  return false;
}

/** @param {...any} args */
function dbg(...args) { if (isDebugMode()) console.log('[sync]', ...args); }

export async function initSync() {
  primeSyncState();
  if (!isSyncConfigured()) return;
  let needsInitialReplicaBarrier = false;

  // Fail fast if the webview doesn't have what Evolu needs. Otherwise the
  // worker hangs forever on appOwner and the toggle/restore flow looks
  // mysteriously broken - exactly the rabbit hole we just spent an hour in.
  const blocker = getSyncBlocker();
  if (blocker) {
    setSyncAppOwnerError(blocker);
    console.warn('[sync] Cannot init:', blocker);
    return;
  }

  // Reuse the retained runtime when resuming from Pause. Pause unsubscribes
  // application listeners without resetting the owner or Evolu database.
  const existingEvolu = getSyncEvolu();
  if (existingEvolu) {
    const profileQuery = getSyncProfileQuery();
    const tombstoneQuery = getSyncTombstoneQuery();
    const itemRowQuery = getSyncItemRowQuery();
    if (isSyncEnabled() && profileQuery && tombstoneQuery && itemRowQuery) {
      bindSyncSubscriptions({ evolu: existingEvolu, profileQuery, tombstoneQuery, itemRowQuery });
      startRelayProbe();
    }
    return;
  }

  // Defer to next microtask - Worker + navigator.locks can race during DOMContentLoaded.
  await new Promise(r => setTimeout(r, 0));

  try {
    const relay = getSyncRelay();
    const { createSyncEvoluClient } = await import('./sync-evolu8-candidate.js');
    const evolu = await createSyncEvoluClient({
      createSyncSchema,
      relay,
      reloadUrl: getSyncReloadUrlRuntime(),
      enableLogging: isDebugMode(),
    });
    setSyncEvolu(evolu);
    needsInitialReplicaBarrier = evolu.__evoluClientVersion === 8 && isSyncEnabled();
    if (needsInitialReplicaBarrier) beginSyncRebroadcastSettling();

    const { profileQuery, tombstoneQuery, itemRowQuery } = createSyncQueries(evolu);
    setSyncQueries({ profileQuery, tombstoneQuery, itemRowQuery });

    if (isSyncEnabled()) {
      bindSyncSubscriptions({ evolu, profileQuery, tombstoneQuery, itemRowQuery });
    }

    // Load initial data - store promise for enableSync to await.
    const queryLoaded = Promise.all([
      evolu.loadQuery(profileQuery),
      evolu.loadQuery(tombstoneQuery),
      evolu.loadQuery(itemRowQuery),
    ]).then(() => {
      dbg('Initial queries loaded');
    }).catch(e => {
      console.warn('[sync] Query load failed:', e);
    });
    setSyncQueryLoadedPromise(queryLoaded);

    // Wait for owner (mnemonic) - signals DB is ready. The v8 bridge receives
    // its owner before the new database has answered its first queries, while
    // v7 historically resolves those in the opposite order. Preserve the app
    // contract: once the owner is visible, syncNow must not mistake an
    // unloaded query cache for an empty database and insert duplicate rows.
    const ownerReady = evolu.__evoluClientVersion === 8
      ? queryLoaded.then(() => evolu.appOwner)
      : evolu.appOwner;
    const readyPromise = ownerReady.then(owner => {
      setSyncAppOwner(owner);
      setSyncAppOwnerError(null);
      const restoreNotice = consumeSyncRestoreNotice();
      if (restoreNotice) showNotification(restoreNotice, 'success', 6000);
      scheduleOwnerStorageRefresh(0);
      dbg('Owner resolved');
    }).catch(e => {
      // Don't silently swallow - Settings > Data shows "Resolving..." while
      // appOwner is null and there's no other signal the user gets. We
      // stash the message so the UI can surface it instead of timing out
      // after 30s with the unhelpful "Could not resolve mnemonic".
      setSyncAppOwnerError(e?.message || String(e));
      console.warn('[sync] Owner resolution failed:', e);
    });
    setSyncReadyPromise(readyPromise);

    // Debug helper. Gated on isDebugMode() - earlier versions exposed this
    // unconditionally, which leaked the BIP-39 mnemonic to anyone with
    // console access (screen-share, malicious extension, MCP evaluate_script
    // capability). The mnemonic decrypts every Evolu blob ever pushed to
    // the relay, so this had to be opt-in. Toggle Settings > Privacy >
    // Debug mode to expose.
    if (isDebugMode?.()) {
      (/** @type {any} */ (window))._syncDebug = {
        getRows: () => evolu.getQueryRows(profileQuery),
        getOwner: () => getSyncAppOwner(),
        evolu,
      };
    }

    // Initial relay probe + periodic 60s health check.
    if (isSyncEnabled()) startRelayProbe();

    bindSyncRecoveryEvents();

    dbg('Initialized, relay:', relay);

    // Startup reconciliation - handles the case where state.importedData
    // (loaded fresh from localStorage on this page-load) has rows that
    // the local Evolu DB row's dataJson doesn't have. This happens when
    // a previous session's pushProfile got wedged (Evolu's onComplete
    // never fired, _syncing stayed true until the watchdog), so saves
    // landed in localStorage but never reached Evolu's CRDT log. Fix:
    // detect the divergence after init + force-push so the row catches
    // up. Defer until after appOwner + initial query both load - those
    // are async and the CRDT row doesn't exist until then.
    Promise.all([readyPromise, queryLoaded]).then(async () => {
      if (needsInitialReplicaBarrier) {
        try {
          await waitForInitialReplicaQuiet();
          await _forcePull();
        } catch (e) {
          console.warn('[sync] Initial Evolu 8 replica settling failed:', e);
        } finally {
          finishSyncRebroadcastSettling();
        }
      }
      await reconcileLocalStorageWithEvolu();
    }).catch(e => {
      if (needsInitialReplicaBarrier) finishSyncRebroadcastSettling();
      console.warn('[sync] Startup reconciliation failed:', e);
    });
  } catch (e) {
    if (needsInitialReplicaBarrier) finishSyncRebroadcastSettling();
    console.error('[sync] Failed to initialize Evolu:', e);
    setSyncEnabled(false, { persist: false });
  }
}
