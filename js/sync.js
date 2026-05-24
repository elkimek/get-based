// sync.js — Evolu sync layer (opt-in, E2E encrypted)
// Stores importedData + profile metadata per profile as a JSON blob.
// Last-write-wins at the profile level — fine for single-user cross-device sync.

import { state } from './state.js';
import { showNotification, isDebugMode } from './utils.js';
import { profileStorageKey, getProfiles, saveProfiles, migrateProfileData } from './profile.js';
import { getEncryptionEnabled, encryptedSetItem, encryptedGetItem } from './crypto.js';
import { mergeImportedData, localHasRowsRemoteLacks } from './data-merge.js';
import {
  collectAISettings,
  parseSyncPayload,
} from './sync-payload.js';
import {
  compactOwnerSelfServe, configureRelayHealth, fetchOwnerStorageFromRelay,
  getRelayHealthVerdict, getRelayQuotaEstimate,
  resetRelayQuotaEstimate, verifyPushLanded,
} from './sync-relay-health.js';
import {
  consumeRebroadcastBudget, getRecentSyncEvents,
  getSyncStatus, logSyncEvent, resetSyncStatus, subscribeSyncStatus,
  updateSyncStatus,
} from './sync-state.js';
import {
  applyAISettings, applyChatData, applyDisplayPrefs,
  getChatDataLocalLockRemainingMs,
} from './sync-apply.js';
import {
  _mergeItemRowsIntoImported, configureSyncDelta, getDeltaCutoverReadiness,
  getDeltaTelemetry, resetDeltaTelemetry,
} from './sync-delta.js';
import {
  applyPendingTombstone, applyRemoteTombstones, configureSyncTombstones,
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
  onDataSaved, pushAllProfiles, pushCurrentProfile, syncNow,
} from './sync-actions.js';
import {
  configureSyncPush, isSyncPushInFlight, pushProfile,
} from './sync-push.js';
import {
  disablePhase2Cutover, enablePhase2Cutover, isPhase2CutoverEnabled,
} from './sync-cutover.js';

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
let _pulling = false;
let _appOwner = null;
let _appOwnerError = null;
let _readyPromise = null;
let _queryLoaded = null;
const _chatPullRetryTimers = new Map();
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
      dbg(`subscription fired (#${_subscriptionFireCount}), syncing: ${syncing}, pulling: ${_pulling}`);
      if (!syncing && !_pulling) onSyncReceived();
    });
    // Tombstone rows live outside profileQuery's "isDeleted is not 1"
    // filter. Evolu refreshes subscribed queries after remote mutations,
    // so this subscription is required for device B to see device A's
    // profile-delete tombstone without waiting for a full reload.
    evolu.subscribeQuery(tombstoneQuery)(() => {
      if (!isSyncPushInFlight() && !_pulling) onSyncReceived();
    });
    // itemRow rows arriving asynchronously must also retrigger the merge
    // — without this, a per-row push from device A would only land on
    // device B after the next blob-driven pull tick (which v1.6.4's 10s
    // debounce stretches out). Subscribing here gives near-real-time
    // delta propagation, which is half the point of Phase 1.
    evolu.subscribeQuery(itemRowQuery)(() => {
      if (!isSyncPushInFlight() && !_pulling) onSyncReceived();
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
      if (!evolu || !profileQuery || !tombstoneQuery || isSyncPushInFlight() || _pulling) return;
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
      _reconcileLocalStorageWithEvolu().catch(e => {
        console.warn('[sync] Startup reconciliation failed:', e);
      });
    });
  } catch (e) {
    console.error('[sync] Failed to initialize Evolu:', e);
    _syncEnabled = false;
  }
}

// Compare state.importedData (loaded from localStorage on page-load) with
// the Evolu DB row's dataJson for the active profile. If local has unsynced
// changes — either new ids the remote lacks OR same-id rows where the local
// copy has a strictly higher pickTimestamp (the canonical signal data-merge.js
// uses to pick a winner) — trigger a forced push so the divergence catches up
// without the user needing to tap Force Resend.
//
// The within-id timestamp branch is what catches the "phone stopped a session
// then closed before the 10s debounce push fired" failure mode: ids match on
// both sides but local has the stopped session (endedAt set, ts=endedAt) while
// remote still has the active session (endedAt=null, ts=startedAt). Without it
// the stop sits in localStorage indefinitely until some other edit triggers
// onDataSaved.
async function _reconcileLocalStorageWithEvolu() {
  if (!evolu || !_syncEnabled || !state.currentProfile || !state.importedData) return;
  const rows = evolu.getQueryRows(profileQuery);
  const existing = rows?.find(r => r.profileId === state.currentProfile);
  // No existing row → first sync ever for this profile, normal push path
  // (onDataSaved or enableSync) will handle it. Skip.
  if (!existing) return;
  let remoteImported;
  let localAiSettingsDiffer = false;
  try {
    const parsed = await parseSyncPayload(existing.dataJson);
    remoteImported = parsed?.importedData || null;
    const remoteAiSettings = parsed?.aiSettings || {};
    const localAiSettings = await collectAISettings();
    localAiSettingsDiffer = Object.entries(localAiSettings)
      .some(([key, val]) => remoteAiSettings?.[key] !== val);
  } catch {
    // Malformed row → reconciliation can't reason about it. The user can
    // still recover via the Force Resend button.
    return;
  }
  if (!remoteImported && !localAiSettingsDiffer) return;

  // Reuse the rebroadcast helper — same semantic ("local has anything remote
  // doesn't reflect"), same id-keyed array list, same pickTimestamp tiebreak.
  // Returns true on (a) new local ids, (b) same-id with lTs>rTs, (c) tombstones
  // local has remote lacks. Without (b) the start-then-stop-then-close sequence
  // strands the stop on the phone forever — relay row keeps endedAt=null and
  // every other device shows the session as still running.
  const localHasUnsynced = remoteImported ? localHasRowsRemoteLacks(state.importedData, remoteImported) : false;
  if (!localHasUnsynced && !localAiSettingsDiffer) {
    dbg('Startup reconciliation: localStorage, AI settings, and Evolu row match — nothing to do');
    return;
  }
  const reason = localHasUnsynced ? 'unsynced rows' : 'newer local AI settings';
  dbg(`Startup reconciliation: localStorage has ${reason} vs Evolu row`);
  logSyncEvent('reconcile', `Reconcile ${state.currentProfile.slice(0, 8)} — local has ${reason}`);
  // Force-push so the next watchdog cycle can't lose us a clearly-needed
  // catch-up. Bypasses the _syncing guard if it was wedged from a prior
  // session — the same wedge that caused the divergence in the first place.
  await pushProfile(state.currentProfile, state.importedData, { force: true });
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
  for (const t of _chatPullRetryTimers.values()) clearTimeout(t);
  _chatPullRetryTimers.clear();
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
    pulling: _pulling,
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

function _forcePull() {
  if (!evolu || !profileQuery) {
    console.warn('[sync] Cannot force pull — Evolu not initialized');
    return;
  }
  _pulling = false;
  dbg('Force pull triggered');
  onSyncReceived();
  return 'triggered';
}

// Allowed fields when merging a synced profile into the local profiles list
const PROFILE_MERGE_FIELDS = ['name', 'sex', 'dob', 'location', 'tags', 'archived', 'pinned', 'flagged', 'avatar', 'color'];

// ═══════════════════════════════════════════════
// PULL — Evolu → localStorage
// ═══════════════════════════════════════════════

// One-time cleanup: the v1.6.0–v1.6.2 hash-skip mechanism wrote
// `labcharts-{profileId}-sync-hash` keys; v1.6.3 removed the skip
// path entirely (bytes were occasionally stranding rows when local
// state went out of sync with the stored hash). Sweep the now-orphan
// keys on first pull after upgrade. Linear in localStorage keys,
// idempotent via the migration flag.
function _onceClearStaleSyncHashes() {
  try {
    if (localStorage.getItem('labcharts-sync-hash-v2-migrated')) return;
    const toClear = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('labcharts-') && k.endsWith('-sync-hash')) toClear.push(k);
    }
    for (const k of toClear) localStorage.removeItem(k);
    localStorage.setItem('labcharts-sync-hash-v2-migrated', '1');
    if (toClear.length) dbg(`Cleared ${toClear.length} stale -sync-hash keys (one-time migration)`);
  } catch (e) {}
}

function scheduleChatPullRetry(profileId, delayMs) {
  if (!profileId || delayMs <= 0) return;
  const prev = _chatPullRetryTimers.get(profileId);
  if (prev) clearTimeout(prev);
  const waitMs = Math.min(Math.max(delayMs + 250, 1000), 120000);
  const timer = setTimeout(() => {
    _chatPullRetryTimers.delete(profileId);
    if (!evolu || !profileQuery) return;
    if (isSyncPushInFlight() || _pulling) {
      scheduleChatPullRetry(profileId, 1000);
      return;
    }
    dbg(`Retrying chat pull for ${profileId.slice(0, 8)} after local freshness lock`);
    onSyncReceived();
  }, waitMs);
  _chatPullRetryTimers.set(profileId, timer);
}

async function onSyncReceived() {
  if (!evolu || !profileQuery || _pulling) {
    dbg('onSyncReceived skipped:', !evolu ? 'no evolu' : !profileQuery ? 'no query' : 'already pulling');
    return;
  }
  _pulling = true;
  _onceClearStaleSyncHashes();
  updateSyncStatus({ pull: 'pulling' });
  try {
    // Apply remote tombstones FIRST — when another device deleted a profile,
    // wipe our local copy before processing live rows. Skipping this leaves
    // orphan profiles in the local list that the active query no longer
    // returns, and the user sees ghost entries that resync never explains.
    await applyRemoteTombstones();

    const rawRows = evolu.getQueryRows(profileQuery);
    dbg(`onSyncReceived: ${rawRows?.length ?? 0} rows`);
    if (!rawRows || rawRows.length === 0) return;

    // Pre-pass: recover profileId from the payload when the column is empty.
    // After a relay compaction, only the latest evolu.update messages survive
    // — those don't carry profileId — so a fresh device replicating a
    // post-compact log materializes the row with a blank profileId column.
    // The payload itself still contains profile.id, so we read that and use
    // it as the row's effective profileId for dedupe + merge.
    const enrichedRows = [];
    for (const row of rawRows) {
      if (!row) continue;
      let effectiveProfileId = row.profileId || null;
      if (!effectiveProfileId) {
        try {
          const parsed = await parseSyncPayload(row.dataJson || '{}');
          const candidate = parsed?.profile?.id;
          if (typeof candidate === 'string' && /^[a-zA-Z0-9_-]+$/.test(candidate)) {
            effectiveProfileId = candidate;
          }
        } catch {
          // Malformed payload + empty column → can't merge, drop the row.
        }
      }
      if (!effectiveProfileId) continue;
      enrichedRows.push({ ...row, profileId: effectiveProfileId });
    }

    // Dedupe by profileId, keeping the row with the highest syncedAt.
    // Evolu can return multiple rows per profileId after a tombstone +
    // recreate or a restore-from-mnemonic race; iterating in CRDT order
    // could let an older row land last and overwrite the newer pull
    // (because the per-profile localStorage timestamp is bumped only at
    // the bottom of the loop). Sort descending so the freshest row is
    // processed first, then the older row's `remoteUpdated <= localUpdated`
    // guard short-circuits as intended.
    const byProfile = new Map();
    for (const row of enrichedRows) {
      const ts = row.syncedAt ? new Date(row.syncedAt).getTime() : 0;
      const prev = byProfile.get(row.profileId);
      if (!prev || ts > (prev.syncedAt ? new Date(prev.syncedAt).getTime() : 0)) {
        byProfile.set(row.profileId, row);
      }
    }
    const rows = Array.from(byProfile.values()).sort((a, b) => {
      const ta = a.syncedAt ? new Date(a.syncedAt).getTime() : 0;
      const tb = b.syncedAt ? new Date(b.syncedAt).getTime() : 0;
      return tb - ta;
    });

    let profilesChanged = false;
    let latestAiSettings = null;
    let latestAiTs = 0;

    for (const row of rows) {
      try {
        const profileId = row.profileId;
        if (!profileId || typeof profileId !== 'string') continue;
        // Allowlist regex — defense-in-depth against a compromised relay
        // injecting a profileId that maps to a sensitive localStorage key
        // collision (e.g. "default-imported-chat-threads" → would land at
        // labcharts-default-imported-chat-threads-imported).
        if (!/^[a-zA-Z0-9_-]+$/.test(profileId)) continue;
        const remoteUpdated = row.syncedAt ? new Date(row.syncedAt).getTime() : 0;
        const localKey = profileStorageKey(profileId, 'imported');
        const localMeta = localStorage.getItem(`labcharts-${profileId}-sync-ts`);
        const localUpdated = localMeta ? parseInt(localMeta, 10) : 0;

        // No skip-decision before the merge runs. Both the timestamp-skip
        // and the hash-skip have caused users to miss cross-device data:
        // - Timestamp-skip: clock-skew across phone vs desktop made the
        //   strictly-older comparison silently drop newer pushes.
        // - Hash-skip: a stale -sync-hash from a previous code version
        //   matched the relay row's content but the local state didn't
        //   actually have the data, so the skip path stranded the row.
        // The merge itself (mergeImportedData) is structurally idempotent
        // and union-based, so re-applying the same bytes is a no-op when
        // local already equals remote. Cheap (one JSON parse + one
        // pass over id-keyed arrays per pull tick); cheaper than a sync
        // bug that leaves users insisting it's broken.
        dbg(`Row ${profileId.slice(0,8)}: PULLING (remote ${remoteUpdated}, local ${localUpdated})`);

        // Remote is newer — parse payload (async because the gzip envelope
        // routes through DecompressionStream)
        const { importedData, profile, aiSettings, chatData, displayPrefs } = await parseSyncPayload(row.dataJson);

        // Track latest AI settings (apply once, from most recent row)
        if (aiSettings && remoteUpdated > latestAiTs) {
          latestAiSettings = aiSettings;
          latestAiTs = remoteUpdated;
        }

        // Validate importedData shape. v4 (Phase 2 cutover) intentionally
        // omits importedData — it's null by design, not malformed. We
        // still want to run the per-row pull for that case, so detect v4
        // (importedData strictly === null after parseSyncPayload) and
        // continue with an empty-object placeholder; the per-row overlay
        // step downstream will fill in every field from itemRow data.
        // Anything else falsy/non-object is genuinely malformed → skip.
        const isV4Cutover = importedData === null;
        if (!isV4Cutover && (!importedData || typeof importedData !== 'object')) {
          // v1.7.15 audit fix: log so a chronically-corrupted row is
          // visible in the activity log instead of silently disappearing.
          logSyncEvent('skip', `Pull ${profileId.slice(0, 8)} — malformed importedData shape, skipping row`);
          continue;
        }

        // Preserve local wearableConnections — they're stripped from the push
        // payload (tokens stay per-device), so the remote blob never carries
        // them. Without this merge the pull would wipe this device's OAuth
        // tokens and silently disconnect every connected vendor.
        let localWearableConnections = null;
        if (profileId === state.currentProfile) {
          localWearableConnections = state.importedData?.wearableConnections || null;
        } else {
          try {
            const rawLocal = getEncryptionEnabled()
              ? await encryptedGetItem(localKey)
              : localStorage.getItem(localKey);
            if (rawLocal) {
              const parsed = JSON.parse(rawLocal);
              localWearableConnections = parsed?.wearableConnections || null;
            }
          } catch (e) {
            dbg('Could not read local wearableConnections for preserve:', e.message);
          }
        }
        if (localWearableConnections && importedData) {
          importedData.wearableConnections = localWearableConnections;
        }

        // Per-array union merge for id-keyed append-only arrays (sun feature
        // + a couple related). Without this, two devices each writing
        // independent rows clobber each other on whole-blob LWW. Single-
        // object subtrees and id-less arrays still LWW (handled inside
        // mergeImportedData).
        let localImportedForMerge = null;
        if (profileId === state.currentProfile) {
          localImportedForMerge = state.importedData || null;
        } else {
          try {
            const rawLocal = getEncryptionEnabled()
              ? await encryptedGetItem(localKey)
              : localStorage.getItem(localKey);
            if (rawLocal) localImportedForMerge = JSON.parse(rawLocal);
          } catch (e) {
            dbg('Could not read local importedData for merge:', e.message);
          }
        }
        // v4 cutover: importedData is null by design. Use local as the
        // baseline; per-row overlay below fills in every field. v3 and
        // older still merge blob-into-local as before.
        let merged = localImportedForMerge
          ? (importedData ? mergeImportedData(localImportedForMerge, importedData) : localImportedForMerge)
          : (importedData || {});
        // Phase 1 of CRDT-delta refactor: overlay per-row tables AFTER
        // the blob merge. Per-row state is authoritative — a tombstone
        // here drops the corresponding item even if the blob (which is
        // older or written by a pre-Phase-1 device) still carried it.
        // Order matters: blob first establishes baseline, then per-row
        // applies the up-to-date deltas on top. Idempotent: if the blob
        // and per-row tables agree, the overlay is a no-op.
        try {
          merged = await _mergeItemRowsIntoImported(profileId, merged) || merged;
        } catch (e) {
          console.warn('[sync] per-row overlay merge failed (blob still applied):', e?.message || e);
        }
        const _ct = (b, k) => Array.isArray(b?.[k]) ? b[k].length : 0;
        const mergeMsg = `Pull ${profileId.slice(0,8)} — local sun=${_ct(localImportedForMerge,'sunSessions')}/dev=${_ct(localImportedForMerge,'lightDevices')} · remote sun=${_ct(importedData,'sunSessions')}/dev=${_ct(importedData,'lightDevices')} · merged sun=${_ct(merged,'sunSessions')}/dev=${_ct(merged,'lightDevices')}`;
        dbg(mergeMsg);
        logSyncEvent('pull', mergeMsg);
        // wearableConnections preservation already happened on `importedData`;
        // mergeImportedData carries it through (since it's not in
        // ID_KEYED_ARRAYS, it falls into the LWW path which takes remote —
        // but `importedData` here was already patched with localWearableConnections).

        // If the merge added rows the remote didn't have (i.e. local had
        // unsynced state — the canonical case is "phone logged C, desktop
        // pushed Y first, neither sees the other"), the relay row still
        // reflects only the remote side. We need to rebroadcast the merged
        // result so the *other* device pulls our union next round. Without
        // this, convergence stalls at the first cross-device race because
        // pull-and-merge is local-only — nothing republishes the union.
        // Use a structural id-set diff (not JSON.stringify equality) — JSON
        // serialization order varies with merge-insertion order and would
        // cause an infinite ping-pong rebroadcast across devices.
        // v4 cutover: importedData is null, so the diff is meaningless
        // (per-row deltas already drove the merge). Skip the rebroadcast
        // gate — per-row pushes don't have the "local has rows remote
        // lacks" pathology since each row is its own CRDT message.
        const needsRebroadcast = !!localImportedForMerge && !!importedData
          && localHasRowsRemoteLacks(localImportedForMerge, importedData);
        // Same diff in the *other* direction: did REMOTE bring rows local
        // didn't have? Used to gate the active-view re-render so we don't
        // wipe an in-progress form input on every pull where the merge
        // produced no observable change.
        const remoteBroughtNewRows = !!localImportedForMerge && !!importedData
          && localHasRowsRemoteLacks(importedData, localImportedForMerge);

        // Persist the merged importedData. Always go through
        // encryptedSetItem — it routes big-blob `-imported` keys to
        // IndexedDB regardless of encryption state. Bypassing this
        // (the old non-encryption branch did `localStorage.setItem`
        // directly) re-introduces the 5 MB quota wall.
        const importedJson = JSON.stringify(merged);
        await encryptedSetItem(localKey, importedJson);
        localStorage.setItem(`labcharts-${profileId}-sync-ts`, String(remoteUpdated));

        // Merge profile into local profiles list (allowlisted fields only)
        if (profile && typeof profile === 'object') {
          const profiles = getProfiles();
          const idx = profiles.findIndex(p => p.id === profileId);
          if (idx >= 0) {
            const local = profiles[idx];
            for (const field of PROFILE_MERGE_FIELDS) {
              if (field in profile) local[field] = profile[field];
            }
            local.lastUpdated = Date.now();
          } else {
            // New profile — pick only allowed fields + id
            const newProfile = { id: profileId, lastUpdated: Date.now() };
            for (const field of PROFILE_MERGE_FIELDS) {
              if (field in profile) newProfile[field] = profile[field];
            }
            profiles.push(newProfile);
          }
          await saveProfiles(profiles);
          profilesChanged = true;
          dbg('Merged profile:', profileId, profile.name);
        }

        // Apply chat data and display preferences
        const chatApplied = chatData ? await applyChatData(profileId, chatData) : false;
        if (chatData && !chatApplied) {
          scheduleChatPullRetry(profileId, getChatDataLocalLockRemainingMs(profileId));
        }
        if (displayPrefs) applyDisplayPrefs(profileId, displayPrefs);

        // If this is the active profile, update in-memory state
        if (profileId === state.currentProfile) {
          state.importedData = merged;
          migrateProfileData(state.importedData);
          // Reload chat threads + active thread messages into memory and re-render
          if (chatApplied) {
            window.loadChatThreads?.();
            window.ensureActiveThread?.();
            window.renderThreadList?.();
            window.loadChatHistory?.(); // reloads state.chatHistory from localStorage + renders
          }
          // Re-render whatever view the user is on so the merged state
          // becomes visible — but ONLY when the merge actually produced
          // new content from the remote side. `localImportedForMerge`
          // already had everything ⇒ no observable change ⇒ skip the
          // re-render so an in-progress form doesn't get wiped on pull.
          // Source: state.currentView (canonical). DOM .nav-item.active
          // is briefly absent during buildSidebar→navigate cycles and
          // would yank the user to 'dashboard' on a pull landing in
          // that gap (user-reported flicker/sync race).
          const cat = state.currentView || document.querySelector('.nav-item.active')?.dataset?.category || 'dashboard';
          // Sidebar nav items are conditional on data presence (e.g. the
          // Genetics entry only renders when state.importedData.genetics
          // exists). Per-row CRDT deltas can populate scalars/maps that
          // localHasRowsRemoteLacks() doesn't see — it only diffs id-keyed
          // arrays in the blob. Always rebuild the sidebar after a pull so
          // those entries appear/disappear without waiting for the next
          // local action. Cheap (~1ms) and doesn't disturb in-progress
          // forms in the main pane.
          if (window.buildSidebar) try { window.buildSidebar(); } catch (e) {}
          if (!remoteBroughtNewRows) {
            // Remote brought nothing new (local was already a superset or
            // identical for every id-keyed array). Profile-field / chat /
            // displayPrefs handlers above already re-rendered their own
            // surfaces; skip the global navigate() so an in-progress form
            // (e.g. typing a duration into the session log dialog) survives.
            dbg(`Pulled active profile ${profileId.slice(0,8)} — no new rows from remote, skipping re-render of '${cat}'`);
          } else {
            window.navigate?.(cat);
            if (cat !== 'dashboard') {
              showNotification('Data updated from another device', 'success');
            }
            dbg(`Pulled active profile ${profileId.slice(0,8)} → re-rendered '${cat}'`);
          }
          // Broadcast for any detached UI listening for cross-device
          // updates (e.g., the All-Sessions modal in views.js). The
          // navigate() above already rebuilt the inline page; this
          // event covers floating modals that aren't part of the main
          // tree. Greptile PR #178 P2 comment.
          if (typeof window !== 'undefined' && typeof window.CustomEvent === 'function') {
            try { window.dispatchEvent(new CustomEvent('labcharts-sync-applied')); } catch (_) {}
          }
        } else {
          dbg('Pulled profile:', profileId);
        }

        // Rebroadcast the union if local had rows the remote lacked. Defer
        // with setTimeout to avoid recursing inside the pull tick + give
        // chat/profile/aiSettings appliers a chance to settle first. Skipped
        // for non-active profiles — pushProfile uses state.importedData,
        // which is only valid for the current profile.
        if (needsRebroadcast && profileId === state.currentProfile) {
          // Don't pile rebroadcast pushes on top of an in-flight push — Evolu
          // serializes them and the relay can lag, producing the
          // sun=0/sun=1/sun=1 push storm seen in v1.7.5 diagnostics. Skip the
          // rebroadcast if a push is already pending; the next pull cycle
          // (after that push lands) will redo this check correctly.
          if (getSyncStatus().push === 'pending') {
            dbg(`Row ${profileId.slice(0,8)}: rebroadcast deferred — push already pending`);
            logSyncEvent('skip', `Rebroadcast deferred — push pending`);
          } else if (!consumeRebroadcastBudget(profileId)) {
            dbg(`Row ${profileId.slice(0,8)}: rebroadcast suppressed — budget exhausted in last 5min (clock skew?)`);
            logSyncEvent('skip', `Rebroadcast budget exhausted — possible clock skew`);
          } else {
            dbg(`Row ${profileId.slice(0,8)}: rebroadcast — local had unsynced rows`);
            logSyncEvent('rebroadcast', `Rebroadcast ${profileId.slice(0,8)}`);
            // Snapshot importedData at SCHEDULE time and re-verify the
            // active profile when the timer fires. Without these, a profile
            // switch in the 100ms gap would push the new active profile's
            // state.importedData into the *original* profile's relay row.
            const snapshotImported = merged;
            setTimeout(() => {
              if (profileId !== state.currentProfile) {
                dbg(`Rebroadcast aborted — active profile switched`);
                return;
              }
              pushProfile(profileId, snapshotImported);
            }, 100);
          }
        }
      } catch (e) {
        console.error('[sync] Pull failed for row:', e);
      }
    }

    // Apply AI settings once from the most recent row
    if (latestAiSettings) await applyAISettings(latestAiSettings);

    // Rebuild profile dropdown if profiles changed
    if (profilesChanged) {
      window.renderProfileDropdown?.();
    }
  } finally {
    _pulling = false;
    updateSyncStatus({ pull: 'received', pullReceivedAt: Date.now() });
  }
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
