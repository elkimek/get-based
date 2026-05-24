// sync.js — Evolu sync layer (opt-in, E2E encrypted)
// Stores importedData + profile metadata per profile as a JSON blob.
// Last-write-wins at the profile level — fine for single-user cross-device sync.

import { state } from './state.js';
import { showNotification, isDebugMode } from './utils.js';
import {
  compactOwnerSelfServe, configureRelayHealth, fetchOwnerStorageFromRelay,
  getRelayHealthVerdict, getRelayQuotaEstimate,
  resetRelayQuotaEstimate, verifyPushLanded,
} from './sync-relay-health.js';
import {
  getRecentSyncEvents, logSyncEvent, resetSyncStatus,
  subscribeSyncStatus, updateSyncStatus,
} from './sync-state.js';
import {
  configureSyncDelta, getDeltaCutoverReadiness, getDeltaTelemetry,
  resetDeltaTelemetry,
} from './sync-delta.js';
import {
  applyPendingTombstone, configureSyncTombstones,
  deleteProfileFromRelay, listPendingTombstones, rejectPendingTombstone,
} from './sync-tombstones.js';
import {
  configureSyncMessenger, generateMessengerToken, getMessengerToken,
  isMessengerEnabled, pushContextToGateway, revokeMessengerToken,
} from './sync-messenger.js';
import {
  checkRelayConnection, getSyncBlocker, getSyncRelay, setSyncRelay,
} from './sync-environment.js';
import {
  configureSyncIdentity, getMnemonic, getMnemonicResolutionError,
  restoreFromMnemonic,
} from './sync-identity.js';
import {
  configureSyncDiagnostics, getEvoluDiagnostics,
} from './sync-diagnostics.js';
import {
  bindSyncUIStatusUpdates, configureSyncUI, copySyncEvents,
  renderSyncIndicator, toggleSyncDetail, updateSyncIndicator,
} from './sync-ui.js';
import {
  configureSyncDiagnoseUI, confirmBackfillBlockers, confirmCompactRelay,
  confirmDisablePhase2, confirmEnablePhase2, confirmResetDeltaTelemetry,
  confirmRotateIdentity, copySyncDiagnose, refreshRelayStorage,
  showSyncDiagnose,
} from './sync-diagnose-ui.js';
import {
  bindSyncActionEvents, cleanStorage, clearSyncActionTimers,
  configureSyncActions, forceResendCurrentProfile, onChatSaved,
  onDataSaved, onProfileSaved, pushAllProfiles, pushCurrentProfile, syncNow,
} from './sync-actions.js';
import {
  configureSyncPush, isSyncPushInFlight, pushProfile,
} from './sync-push.js';
import {
  configureSyncReconcile, reconcileLocalStorageWithEvolu,
} from './sync-reconcile.js';
import {
  disablePhase2Cutover, enablePhase2Cutover, isPhase2CutoverEnabled,
} from './sync-cutover.js';
import {
  clearSyncPullTimers, configureSyncPull, forcePull as _forcePull,
  isSyncPulling, onSyncReceived,
} from './sync-pull.js';

export {
  compactOwnerSelfServe, fetchOwnerStorageFromRelay, getRelayHealthVerdict,
  getRelayQuotaEstimate, resetRelayQuotaEstimate, verifyPushLanded,
  getRecentSyncEvents, subscribeSyncStatus,
  applyPendingTombstone, deleteProfileFromRelay, listPendingTombstones,
  rejectPendingTombstone,
  generateMessengerToken, getMessengerToken, isMessengerEnabled,
  pushContextToGateway, revokeMessengerToken,
  checkRelayConnection, getSyncBlocker, getSyncRelay, setSyncRelay,
  getMnemonic, getMnemonicResolutionError, restoreFromMnemonic,
  getEvoluDiagnostics,
  renderSyncIndicator, updateSyncIndicator, toggleSyncDetail, copySyncEvents,
  showSyncDiagnose,
  cleanStorage, forceResendCurrentProfile, onChatSaved, onDataSaved,
  onProfileSaved,
  pushCurrentProfile, syncNow,
  disablePhase2Cutover, enablePhase2Cutover, isPhase2CutoverEnabled,
};

function dbg(...args) { if (isDebugMode()) console.log('[sync]', ...args); }

configureRelayHealth({
  getAppOwner: () => _appOwner,
  getSyncRelay,
  onQuotaThreshold(q) {
    if (q.level === 'red') {
      logSyncEvent('skip', `Relay storage ${q.pct}% — pushes will start failing soon, compact!`);
      try { showNotification(`Relay storage ${q.pct}% full — compact soon or pushes will start failing silently. See Settings → Sync → Diagnose.`, 'error'); } catch {}
    } else {
      try { showNotification(`Relay storage ${q.pct}% — plan a compaction in the next few days. See Sync diagnose.`, 'warning'); } catch {}
    }
  },
});

let evolu = null;
let profileQuery = null;
let tombstoneQuery = null;
let itemRowQuery = null;
let _syncEnabled = false;
let _syncStatePrimed = false;
let _appOwner = null;
let _appOwnerError = null;
let _readyPromise = null;
let _queryLoaded = null;
let _pollInterval = null;
let _lastPollRowCount = -1;
let _lastPollTombstoneCount = -1;
let _subscriptionFireCount = 0;
let _relayProbeInterval = null;

configureSyncDelta({
  getEvolu: () => evolu,
  getItemRowQuery: () => itemRowQuery,
});

configureSyncPush({
  getEvolu: () => evolu,
  getProfileQuery: () => profileQuery,
  isSyncEnabled: () => _syncEnabled,
  isPhase2CutoverEnabled,
  disablePhase2Cutover,
  debug: dbg,
});

configureSyncPull({
  getEvolu: () => evolu,
  getProfileQuery: () => profileQuery,
  isSyncPushInFlight,
  pushProfile,
  debug: dbg,
});

configureSyncTombstones({
  getEvolu: () => evolu,
  getProfileQuery: () => profileQuery,
  getTombstoneQuery: () => tombstoneQuery,
  isSyncEnabled: () => _syncEnabled,
  pushProfile,
  debug: dbg,
});

configureSyncMessenger({
  getSyncRelay,
  debug: dbg,
});

configureSyncIdentity({
  getAppOwner: () => _appOwner,
  getAppOwnerError: () => _appOwnerError,
  getEvolu: () => evolu,
});

configureSyncDiagnostics({
  getEvolu: () => evolu,
  getProfileQuery: () => profileQuery,
  getTombstoneQuery: () => tombstoneQuery,
  getAppOwner: () => _appOwner,
  isSyncEnabled: () => _syncEnabled,
});

configureSyncUI({
  isSyncEnabled: () => _syncEnabled,
});
bindSyncUIStatusUpdates();

configureSyncDiagnoseUI({
  enableSync,
  restoreFromMnemonic,
  isSyncEnabled,
  pushProfile,
  enablePhase2Cutover,
  disablePhase2Cutover,
  isPhase2CutoverEnabled,
});

configureSyncActions({
  pushProfile,
  forcePull: _forcePull,
  isSyncEnabled: () => _syncEnabled,
  isEvoluReady: () => !!evolu,
  isSyncing: isSyncPushInFlight,
});
bindSyncActionEvents();

configureSyncReconcile({
  getEvolu: () => evolu,
  getProfileQuery: () => profileQuery,
  isSyncEnabled: () => _syncEnabled,
  pushProfile,
  debug: dbg,
});

// ═══════════════════════════════════════════════
// SETTINGS
// ═══════════════════════════════════════════════

const SYNC_STORAGE_KEY = 'labcharts-sync-enabled';

export function primeSyncState() {
  if (!_syncStatePrimed) {
    _syncEnabled = localStorage.getItem(SYNC_STORAGE_KEY) === 'true';
    _syncStatePrimed = true;
  }
  return _syncEnabled;
}

export function isSyncEnabled() { return _syncStatePrimed ? _syncEnabled : primeSyncState(); }

// ═══════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════

export async function initSync() {
  primeSyncState();
  if (!_syncEnabled) return;

  // Fail fast if the webview doesn't have what Evolu needs. Otherwise the
  // worker hangs forever on appOwner and the toggle/restore flow looks
  // mysteriously broken — exactly the rabbit hole we just spent an hour in.
  const blocker = getSyncBlocker();
  if (blocker) {
    _appOwnerError = blocker;
    console.warn('[sync] Cannot init:', blocker);
    return;
  }

  // Re-entrancy guard — don't create duplicate Evolu instances
  if (evolu) return;

  // Defer to next microtask — Worker + navigator.locks can race during DOMContentLoaded
  await new Promise(r => setTimeout(r, 0));

  try {
    const { createEvolu, id, nullOr, SimpleName, NonEmptyString1000, NonEmptyString, evoluWebDeps } =
      await import('../vendor/evolu/evolu-bundle.js');

    const ProfileDataId = id("ProfileData");
    const ItemRowId = id("ItemRow");
    // Per-array delta table (Phase 1 of the CRDT-delta refactor — see
    // memory/project_evolu_delta_refactor_plan.md). Each row holds ONE
    // item from one of the importedData arrays (sunSessions, lightDevices,
    // entries, …). Push side dual-writes: every successful pushProfile()
    // also emits inserts/updates/tombstones for items that changed since
    // the last successful push (snapshot diff). Pull side merges itemRow
    // payloads into state.importedData BEFORE the fat-blob merge runs, so
    // per-row data is authoritative when present and the blob acts as
    // fallback for pre-Phase-1 device pushes.
    //
    // ONE table with arrayName discriminator instead of N tables: adding a
    // new array doesn't require schema migration, single subscribeQuery
    // covers everything, identical merge logic per array.
    const Schema = {
      profileData: {
        id: ProfileDataId,
        profileId: NonEmptyString,
        dataJson: NonEmptyString,
        syncedAt: nullOr(NonEmptyString),
      },
      itemRow: {
        id: ItemRowId,
        profileId: NonEmptyString,
        arrayName: NonEmptyString,  // 'sunSessions' | 'lightDevices' | …
        itemId: NonEmptyString,     // the item.id field, e.g. 'sun_1714780123456'
        payload: NonEmptyString,    // gzip-base64-encoded JSON of one item
        syncedAt: nullOr(NonEmptyString),
      },
    };

    const relay = getSyncRelay();
    evolu = createEvolu(evoluWebDeps)(Schema, {
      name: SimpleName.orThrow("getbased4"),
      reloadUrl: window.location.pathname,
      enableLogging: isDebugMode(),
      transports: [{ type: "WebSocket", url: relay }],
    });

    // Query all profile data rows
    profileQuery = evolu.createQuery((db) =>
      db.selectFrom("profileData")
        .selectAll()
        .where("isDeleted", "is not", 1)
    );

    // Companion query that returns ONLY tombstoned rows. Used during pull
    // to apply remote deletes locally — when device A tombstones profile X,
    // device B sees X here and wipes its local copy. Without this, B's
    // local profiles list keeps showing X even though A "deleted" it.
    tombstoneQuery = evolu.createQuery((db) =>
      db.selectFrom("profileData")
        .selectAll()
        .where("isDeleted", "=", 1)
    );

    // Per-array delta rows (live + tombstoned). The merge logic in
    // _mergeItemRowsIntoImported sorts on isDeleted, so a single query
    // returning every itemRow is sufficient. profileId filter applied
    // at merge time so subscribeQuery doesn't have to refire on each
    // currentProfile change.
    itemRowQuery = evolu.createQuery((db) =>
      db.selectFrom("itemRow").selectAll()
    );

    // Subscribe to sync updates
    evolu.subscribeQuery(profileQuery)(() => {
      _subscriptionFireCount++;
      const syncing = isSyncPushInFlight();
      const pulling = isSyncPulling();
      dbg(`subscription fired (#${_subscriptionFireCount}), syncing: ${syncing}, pulling: ${pulling}`);
      if (!syncing && !pulling) onSyncReceived();
    });
    // Tombstone rows live outside profileQuery's "isDeleted is not 1"
    // filter. Evolu refreshes subscribed queries after remote mutations,
    // so this subscription is required for device B to see device A's
    // profile-delete tombstone without waiting for a full reload.
    evolu.subscribeQuery(tombstoneQuery)(() => {
      if (!isSyncPushInFlight() && !isSyncPulling()) onSyncReceived();
    });
    // itemRow rows arriving asynchronously must also retrigger the merge
    // — without this, a per-row push from device A would only land on
    // device B after the next blob-driven pull tick (which v1.6.4's 10s
    // debounce stretches out). Subscribing here gives near-real-time
    // delta propagation, which is half the point of Phase 1.
    evolu.subscribeQuery(itemRowQuery)(() => {
      if (!isSyncPushInFlight() && !isSyncPulling()) onSyncReceived();
    });

    // Load initial data — store promise for enableSync to await
    _queryLoaded = Promise.all([
      evolu.loadQuery(profileQuery),
      evolu.loadQuery(tombstoneQuery),
      evolu.loadQuery(itemRowQuery),
    ]).then(() => {
      dbg('Initial queries loaded');
    }).catch(e => {
      console.warn('[sync] Query load failed:', e);
    });

    // Wait for owner (mnemonic) — signals DB is ready
    _readyPromise = evolu.appOwner.then(owner => {
      _appOwner = owner;
      _appOwnerError = null;
      dbg('Owner resolved');
    }).catch(e => {
      // Don't silently swallow — Settings → Data shows "Resolving…" while
      // _appOwner is null and there's no other signal the user gets. We
      // stash the message so the UI can surface it instead of timing out
      // after 30s with the unhelpful "Could not resolve mnemonic".
      _appOwnerError = e?.message || String(e);
      console.warn('[sync] Owner resolution failed:', e);
    });

    // Debug helper. Gated on isDebugMode() — earlier versions exposed this
    // unconditionally, which leaked the BIP-39 mnemonic to anyone with
    // console access (screen-share, malicious extension, MCP evaluate_script
    // capability). The mnemonic decrypts every Evolu blob ever pushed to
    // the relay, so this had to be opt-in. Toggle Settings → Privacy →
    // Debug mode to expose.
    if (isDebugMode?.()) {
      window._syncDebug = {
        getRows: () => evolu.getQueryRows(profileQuery),
        getOwner: () => _appOwner,
        evolu,
      };
    }

    // Poll every 30s as safety net — subscribeQuery may miss remote changes
    _pollInterval = setInterval(() => {
      if (!evolu || !profileQuery || !tombstoneQuery || isSyncPushInFlight() || isSyncPulling()) return;
      const rows = evolu.getQueryRows(profileQuery);
      const tombstones = evolu.getQueryRows(tombstoneQuery);
      const count = rows?.length ?? 0;
      const tombstoneCount = tombstones?.length ?? 0;
      if (count !== _lastPollRowCount || tombstoneCount !== _lastPollTombstoneCount) {
        dbg(`poll: row/tombstone count changed ${_lastPollRowCount}/${_lastPollTombstoneCount} -> ${count}/${tombstoneCount}, triggering onSyncReceived`);
        _lastPollRowCount = count;
        _lastPollTombstoneCount = tombstoneCount;
        onSyncReceived();
      }
    }, 30000);

    // Subscribe to Evolu errors — catches relay connection failures
    evolu.subscribeError((error) => {
      if (!error) return;
      const type = error?.type || 'unknown';
      dbg('Evolu error:', type);
      if (type.startsWith('WebSocket')) {
        updateSyncStatus({ relay: 'unreachable', lastError: { type, message: type, at: Date.now() } });
      }
    });

    // Initial relay probe + periodic 60s health check
    checkRelayConnection().then(ok => {
      updateSyncStatus({ relay: ok ? 'connected' : 'unreachable', relayCheckedAt: Date.now() });
    });
    _relayProbeInterval = setInterval(async () => {
      const ok = await checkRelayConnection();
      updateSyncStatus({ relay: ok ? 'connected' : 'unreachable', relayCheckedAt: Date.now() });
    }, 60000);

    // Resume-from-suspended-tab recovery — Android browsers (Brave/Chrome on
    // mobile) aggressively kill background tab processes to save battery.
    // The renderer + Evolu's WebSocket worker get evicted; on resume we
    // come back with a stale (or no) WS, and Evolu's reconnect loop doesn't
    // automatically drain the push queue or trigger a fresh pull. Without
    // this hook the user has to swipe-to-refresh after every screen-off
    // cycle to converge — observed in production on Brave Android where
    // the device shows up in chrome://inspect/#devices, sync indicator
    // stays yellow, then disappears entirely once the renderer is reaped.
    //
    // Throttled to once per 30s — multiple visibility flips in quick
    // succession (notifications, recents-pane peeks) shouldn't pile up
    // pushes, and the existing 30s poll covers the steady-state case.
    let _lastVisibleSyncAt = 0;
    const _kickSync = (reason) => {
      if (!_syncEnabled || !evolu) return;
      const now = Date.now();
      if (now - _lastVisibleSyncAt < 30_000) return;
      _lastVisibleSyncAt = now;
      dbg(`Tab resume (${reason}) — kicking syncNow`);
      // Schedule via setTimeout so the visibilitychange handler returns
      // before any heavy push/pull work starts (browsers occasionally
      // throttle long-running sync work in the visibility transition).
      setTimeout(() => {
        pushCurrentProfile().catch(() => {});
        _forcePull();
      }, 100);
    };
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') _kickSync('visibilitychange');
      });
    }
    if (typeof window !== 'undefined') {
      // pageshow fires when the tab is restored from the back/forward cache
      // or after the renderer was killed and the page is rehydrating.
      window.addEventListener('pageshow', (e) => {
        if (e.persisted) _kickSync('pageshow-persisted');
      });
      // Network came back — drain any pending pushes + toast the user.
      // Evolu queues writes locally while offline; the user has no other
      // signal that their edits are safely persisted (vs. lost). The
      // toasts are throttled — only one fires per offline → online
      // transition, not per visibilitychange.
      let _lastNetState = navigator.onLine ?? true;
      window.addEventListener('online', () => {
        _kickSync('online');
        if (!_lastNetState) {
          _lastNetState = true;
          if (window.showNotification) window.showNotification('Back online — syncing your changes.', 'success', 3000);
        }
      });
      window.addEventListener('offline', () => {
        _lastNetState = false;
        if (window.showNotification) window.showNotification('Offline — changes are saved locally and will sync when you reconnect.', 'info', 5000);
      });
    }

    dbg('Initialized, relay:', relay);

    // Startup reconciliation — handles the case where state.importedData
    // (loaded fresh from localStorage on this page-load) has rows that
    // the local Evolu DB row's dataJson doesn't have. This happens when
    // a previous session's pushProfile got wedged (Evolu's onComplete
    // never fired, _syncing stayed true until the watchdog), so saves
    // landed in localStorage but never reached Evolu's CRDT log. Fix:
    // detect the divergence after init + force-push so the row catches
    // up. Defer until after appOwner + initial query both load — those
    // are async and the CRDT row doesn't exist until then.
    Promise.all([_readyPromise, _queryLoaded]).then(() => {
      reconcileLocalStorageWithEvolu().catch(e => {
        console.warn('[sync] Startup reconciliation failed:', e);
      });
    });
  } catch (e) {
    console.error('[sync] Failed to initialize Evolu:', e);
    _syncEnabled = false;
  }
}

// ═══════════════════════════════════════════════
// ENABLE / DISABLE
// ═══════════════════════════════════════════════

export async function enableSync({ skipPush = false } = {}) {
  // Reject early if the webview can't actually run Evolu — no point flipping
  // the persisted flag and starting init only to time out at 30s.
  const blocker = getSyncBlocker();
  if (blocker) {
    showNotification(`Sync unavailable in this browser: ${blocker}`, 'error');
    return;
  }
  localStorage.setItem(SYNC_STORAGE_KEY, 'true');
  _syncEnabled = true;
  _appOwnerError = null;
  await initSync();
  if (!evolu || !_readyPromise) {
    // initSync bailed before evolu was created — likely an import / module
    // load failure. Already logged by initSync; surface a toast so the user
    // doesn't sit staring at a Resolving… spinner.
    showNotification(`Sync failed to initialize. ${_appOwnerError || 'Check console for [sync] errors.'}`, 'error');
    return;
  }
  // Race the owner-resolution promise against a 30s ceiling. A stuck
  // OPFS handle or a Web Lock that never resolves can leave Evolu's
  // appOwner promise pending forever — without this race the await
  // blocks toggleSync's finally, leaving the UI stuck.
  const timeout = new Promise(resolve => setTimeout(() => resolve('__timeout__'), 30000));
  const result = await Promise.race([_readyPromise.then(() => 'ok'), timeout]);
  if (result === '__timeout__' || !_appOwner) {
    const reason = _appOwnerError || 'Evolu owner did not resolve within 30s';
    showNotification(`Sync init failed: ${reason}`, 'error');
    return;
  }
  if (_queryLoaded) {
    // Cap query load too — same hang risk
    await Promise.race([_queryLoaded, new Promise(r => setTimeout(r, 30000))]);
  }
  if (!skipPush) {
    try { await pushAllProfiles(); } catch (e) { console.warn('[sync] initial push failed:', e); }
  }
  showNotification('Sync enabled', 'success');
  renderSyncIndicator();
}

export async function disableSync() {
  // Flip the persisted flag FIRST, before any awaits. If anything below
  // hangs (Evolu worker stuck on OPFS or a Web Lock), a manual page
  // reload will still see sync as off.
  localStorage.setItem(SYNC_STORAGE_KEY, 'false');
  _syncEnabled = false;
  _appOwnerError = null;

  // Stop background timers + reset status (UI feedback before the reload)
  if (_relayProbeInterval) { clearInterval(_relayProbeInterval); _relayProbeInterval = null; }
  clearSyncActionTimers();
  clearSyncPullTimers();
  if (_pollInterval) { clearInterval(_pollInterval); _pollInterval = null; }
  resetSyncStatus();
  renderSyncIndicator();

  // Clear sync timestamps so a fresh pull can happen after re-enable
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const key = localStorage.key(i);
    if (key && key.endsWith('-sync-ts')) localStorage.removeItem(key);
  }

  // v1.7.11 audit fix: clear per-array delta snapshots too. After a
  // re-enable (which may bring a different Evolu owner via mnemonic
  // change), the OLD snapshot would tell the planner "I already pushed
  // these items" → next push silently skips them, so the new owner's
  // relay never receives the user's existing data. Drop the snapshots
  // so the next push re-emits everything as inserts (relay starts
  // empty under the new owner anyway). Same for telemetry + cutover
  // flag (cutover was profile-scoped to the previous owner).
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const key = localStorage.key(i);
    if (!key) continue;
    if (key.includes('-delta-') || key.includes('-sync-cutover-v2') || key.includes('-relay-bytes-') || key === 'labcharts-relay-quota-warned') {
      localStorage.removeItem(key);
    }
  }

  // Fire-and-forget the Evolu reset. We can't trust this await: if the
  // worker is hung (OPFS / lock contention), `resetAppOwner` never
  // resolves and the user sees the toggle silently do nothing.
  // The page reload below kills the worker process anyway, so a
  // half-completed reset is harmless — the new tab boots clean.
  if (evolu) {
    try {
      Promise.resolve(evolu.resetAppOwner({ reload: false }))
        .catch(e => console.warn('[sync] Evolu reset failed (proceeding anyway):', e));
    } catch (e) {
      console.warn('[sync] Evolu reset threw synchronously:', e);
    }
  }

  // Drop in-memory references so any stray callers see fresh-state behavior
  evolu = null;
  profileQuery = null;
  _appOwner = null;
  _readyPromise = null;
  _queryLoaded = null;

  showNotification('Sync disabled — reloading…', 'success');
  // Reload regardless of whether Evolu cooperated. ~250ms gives the toast
  // time to render before the page swaps.
  setTimeout(() => window.location.reload(), 250);
}

// ═══════════════════════════════════════════════
// DIAGNOSTICS
// ═══════════════════════════════════════════════

function _syncDiag() {
  const info = {
    enabled: _syncEnabled,
    evoluReady: !!evolu,
    relay: getSyncRelay(),
    mnemonic: _appOwner?.mnemonic ? '<set>' : null,
    subscriptionFires: _subscriptionFireCount,
    syncing: isSyncPushInFlight(),
    pulling: isSyncPulling(),
  };
  if (evolu && profileQuery) {
    const rows = evolu.getQueryRows(profileQuery);
    info.evoluRows = (rows || []).map(r => ({
      profileId: r.profileId,
      syncedAt: r.syncedAt,
      dataSize: r.dataJson?.length ?? 0,
    }));
  }
  // Show local sync timestamps
  const tsList = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.endsWith('-sync-ts')) {
      tsList.push({ key, ts: parseInt(localStorage.getItem(key), 10), date: new Date(parseInt(localStorage.getItem(key), 10)).toISOString() });
    }
  }
  info.localTimestamps = tsList;
  if (isDebugMode()) {
    console.table?.(info.evoluRows);
    console.log('[sync] Diagnostics:', JSON.stringify(info, null, 2));
  }
  return info;
}

// ═══════════════════════════════════════════════
// EXPORTS for window binding
// ═══════════════════════════════════════════════

Object.assign(window, {
  enableSync,
  disableSync,
  getMnemonic,
  getMnemonicResolutionError,
  getSyncBlocker,
  restoreFromMnemonic,
  isSyncEnabled,
  pushCurrentProfile,
  forceResendCurrentProfile,
  cleanStorage,
  syncNow,
  showSyncDiagnose,
  deleteProfileFromRelay,
  listPendingTombstones,
  applyPendingTombstone,
  rejectPendingTombstone,
  checkRelayConnection,
  isMessengerEnabled,
  getMessengerToken,
  generateMessengerToken,
  revokeMessengerToken,
  pushContextToGateway,
  _syncDiag,
  _forcePull,
  renderSyncIndicator,
  updateSyncIndicator,
  toggleSyncDetail,
  copySyncEvents,
  copySyncDiagnose,
  confirmCompactRelay,
  confirmRotateIdentity,
  refreshRelayStorage,
  fetchOwnerStorageFromRelay,
  verifyPushLanded,
  getRelayHealthVerdict,
  compactOwnerSelfServe,
  getRelayQuotaEstimate,
  resetRelayQuotaEstimate,
  getDeltaTelemetry,
  resetDeltaTelemetry,
  confirmResetDeltaTelemetry,
  getDeltaCutoverReadiness,
  isPhase2CutoverEnabled,
  enablePhase2Cutover,
  disablePhase2Cutover,
  confirmEnablePhase2,
  confirmDisablePhase2,
  confirmBackfillBlockers,
});
