// sync-init.js - Evolu initialization and startup reconciliation.

import { isDebugMode } from './utils.js';
import { createSyncQueries, createSyncSchema } from './sync-schema.js';
import { getSyncBlocker, getSyncRelay } from './sync-environment.js';
import { primeSyncState, setSyncEnabled } from './sync-settings-state.js';
import { bindSyncRecoveryEvents } from './sync-recovery.js';
import { reconcileLocalStorageWithEvolu } from './sync-reconcile.js';
import { bindSyncSubscriptions, startRelayProbe } from './sync-subscriptions.js';
import {
  getSyncAppOwner, getSyncEvolu, setSyncAppOwner, setSyncAppOwnerError,
  setSyncEvolu, setSyncQueries, setSyncQueryLoadedPromise,
  setSyncReadyPromise,
} from './sync-runtime.js';

function dbg(...args) { if (isDebugMode()) console.log('[sync]', ...args); }

export async function initSync() {
  if (!primeSyncState()) return;

  // Fail fast if the webview doesn't have what Evolu needs. Otherwise the
  // worker hangs forever on appOwner and the toggle/restore flow looks
  // mysteriously broken - exactly the rabbit hole we just spent an hour in.
  const blocker = getSyncBlocker();
  if (blocker) {
    setSyncAppOwnerError(blocker);
    console.warn('[sync] Cannot init:', blocker);
    return;
  }

  // Re-entrancy guard - don't create duplicate Evolu instances.
  if (getSyncEvolu()) return;

  // Defer to next microtask - Worker + navigator.locks can race during DOMContentLoaded.
  await new Promise(r => setTimeout(r, 0));

  try {
    const { createEvolu, id, nullOr, SimpleName, NonEmptyString, evoluWebDeps } =
      await import('../vendor/evolu/evolu-bundle.js');

    const Schema = createSyncSchema({ id, nullOr, NonEmptyString });

    const relay = getSyncRelay();
    const evolu = createEvolu(evoluWebDeps)(Schema, {
      name: SimpleName.orThrow("getbased4"),
      reloadUrl: window.location.pathname,
      enableLogging: isDebugMode(),
      transports: [{ type: "WebSocket", url: relay }],
    });
    setSyncEvolu(evolu);

    const { profileQuery, tombstoneQuery, itemRowQuery } = createSyncQueries(evolu);
    setSyncQueries({ profileQuery, tombstoneQuery, itemRowQuery });

    bindSyncSubscriptions({ evolu, profileQuery, tombstoneQuery, itemRowQuery });

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

    // Wait for owner (mnemonic) - signals DB is ready.
    const readyPromise = evolu.appOwner.then(owner => {
      setSyncAppOwner(owner);
      setSyncAppOwnerError(null);
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
      window._syncDebug = {
        getRows: () => evolu.getQueryRows(profileQuery),
        getOwner: () => getSyncAppOwner(),
        evolu,
      };
    }

    // Initial relay probe + periodic 60s health check.
    startRelayProbe();

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
    Promise.all([readyPromise, queryLoaded]).then(() => {
      reconcileLocalStorageWithEvolu().catch(e => {
        console.warn('[sync] Startup reconciliation failed:', e);
      });
    });
  } catch (e) {
    console.error('[sync] Failed to initialize Evolu:', e);
    setSyncEnabled(false, { persist: false });
  }
}
