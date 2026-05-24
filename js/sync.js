// sync.js — Evolu sync layer (opt-in, E2E encrypted)
// Stores importedData + profile metadata per profile as a JSON blob.
// Last-write-wins at the profile level — fine for single-user cross-device sync.

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
  isSyncEnabled, primeSyncState, setSyncEnabled,
} from './sync-settings-state.js';
import {
  clearSyncDisableStorage,
} from './sync-disable-cleanup.js';
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
import { configureSyncRecovery } from './sync-recovery.js';
import {
  configureSyncReconcile,
} from './sync-reconcile.js';
import {
  disablePhase2Cutover, enablePhase2Cutover, isPhase2CutoverEnabled,
} from './sync-cutover.js';
import {
  clearSyncPullTimers, configureSyncPull, forcePull as _forcePull,
  isSyncPulling, onSyncReceived,
} from './sync-pull.js';
import {
  clearSyncSubscriptionTimers, configureSyncSubscriptions,
  getSyncSubscriptionFireCount,
} from './sync-subscriptions.js';
import {
  bindSyncWindowActions,
} from './sync-window-bindings.js';
import { initSync } from './sync-init.js';
import {
  clearSyncRuntimeState, getSyncAppOwner, getSyncAppOwnerError, getSyncEvolu,
  getSyncItemRowQuery, getSyncProfileQuery, getSyncQueryLoadedPromise,
  getSyncReadyPromise, getSyncTombstoneQuery, isSyncEvoluReady,
  setSyncAppOwnerError,
} from './sync-runtime.js';

export {
  compactOwnerSelfServe, fetchOwnerStorageFromRelay, getRelayHealthVerdict,
  getRelayQuotaEstimate, resetRelayQuotaEstimate, verifyPushLanded,
  getRecentSyncEvents, subscribeSyncStatus,
  isSyncEnabled, initSync, primeSyncState,
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
  getAppOwner: getSyncAppOwner,
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

configureSyncDelta({
  getEvolu: getSyncEvolu,
  getItemRowQuery: getSyncItemRowQuery,
});

configureSyncPush({
  getEvolu: getSyncEvolu,
  getProfileQuery: getSyncProfileQuery,
  isSyncEnabled,
  isPhase2CutoverEnabled,
  disablePhase2Cutover,
  debug: dbg,
});

configureSyncPull({
  getEvolu: getSyncEvolu,
  getProfileQuery: getSyncProfileQuery,
  isSyncPushInFlight,
  pushProfile,
  debug: dbg,
});

configureSyncSubscriptions({
  isSyncing: isSyncPushInFlight,
  isPulling: isSyncPulling,
  onSyncReceived,
  checkRelayConnection,
  updateSyncStatus,
  debug: dbg,
});

configureSyncTombstones({
  getEvolu: getSyncEvolu,
  getProfileQuery: getSyncProfileQuery,
  getTombstoneQuery: getSyncTombstoneQuery,
  isSyncEnabled,
  pushProfile,
  debug: dbg,
});

configureSyncMessenger({
  getSyncRelay,
  debug: dbg,
});

configureSyncIdentity({
  getAppOwner: getSyncAppOwner,
  getAppOwnerError: getSyncAppOwnerError,
  getEvolu: getSyncEvolu,
});

configureSyncDiagnostics({
  getEvolu: getSyncEvolu,
  getProfileQuery: getSyncProfileQuery,
  getTombstoneQuery: getSyncTombstoneQuery,
  getAppOwner: getSyncAppOwner,
  isSyncEnabled,
  getSubscriptionFireCount: getSyncSubscriptionFireCount,
  isSyncing: isSyncPushInFlight,
  isPulling: isSyncPulling,
});

configureSyncUI({
  isSyncEnabled,
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
  isSyncEnabled,
  isEvoluReady: isSyncEvoluReady,
  isSyncing: isSyncPushInFlight,
});
bindSyncActionEvents();

configureSyncRecovery({
  isSyncEnabled,
  isEvoluReady: isSyncEvoluReady,
  pushCurrentProfile,
  forcePull: _forcePull,
  debug: dbg,
  notify: (...args) => {
    try { showNotification(...args); } catch {}
  },
});

configureSyncReconcile({
  getEvolu: getSyncEvolu,
  getProfileQuery: getSyncProfileQuery,
  isSyncEnabled,
  pushProfile,
  debug: dbg,
});

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
  setSyncEnabled(true);
  setSyncAppOwnerError(null);
  await initSync();
  const readyPromise = getSyncReadyPromise();
  if (!getSyncEvolu() || !readyPromise) {
    // initSync bailed before evolu was created — likely an import / module
    // load failure. Already logged by initSync; surface a toast so the user
    // doesn't sit staring at a Resolving… spinner.
    showNotification(`Sync failed to initialize. ${getSyncAppOwnerError() || 'Check console for [sync] errors.'}`, 'error');
    return;
  }
  // Race the owner-resolution promise against a 30s ceiling. A stuck
  // OPFS handle or a Web Lock that never resolves can leave Evolu's
  // appOwner promise pending forever — without this race the await
  // blocks toggleSync's finally, leaving the UI stuck.
  const timeout = new Promise(resolve => setTimeout(() => resolve('__timeout__'), 30000));
  const result = await Promise.race([readyPromise.then(() => 'ok'), timeout]);
  if (result === '__timeout__' || !getSyncAppOwner()) {
    const reason = getSyncAppOwnerError() || 'Evolu owner did not resolve within 30s';
    showNotification(`Sync init failed: ${reason}`, 'error');
    return;
  }
  const queryLoaded = getSyncQueryLoadedPromise();
  if (queryLoaded) {
    // Cap query load too — same hang risk
    await Promise.race([queryLoaded, new Promise(r => setTimeout(r, 30000))]);
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
  setSyncEnabled(false);
  setSyncAppOwnerError(null);

  // Stop background timers + reset status (UI feedback before the reload)
  clearSyncActionTimers();
  clearSyncPullTimers();
  clearSyncSubscriptionTimers();
  resetSyncStatus();
  renderSyncIndicator();

  // v1.7.11 audit fix: clear per-array delta snapshots too. After a
  // re-enable (which may bring a different Evolu owner via mnemonic
  // change), the OLD snapshot would tell the planner "I already pushed
  // these items" → next push silently skips them, so the new owner's
  // relay never receives the user's existing data. Drop the snapshots
  // so the next push re-emits everything as inserts (relay starts
  // empty under the new owner anyway). Same for telemetry + cutover
  // flag (cutover was profile-scoped to the previous owner).
  clearSyncDisableStorage();

  // Fire-and-forget the Evolu reset. We can't trust this await: if the
  // worker is hung (OPFS / lock contention), `resetAppOwner` never
  // resolves and the user sees the toggle silently do nothing.
  // The page reload below kills the worker process anyway, so a
  // half-completed reset is harmless — the new tab boots clean.
  const evolu = getSyncEvolu();
  if (evolu) {
    try {
      Promise.resolve(evolu.resetAppOwner({ reload: false }))
        .catch(e => console.warn('[sync] Evolu reset failed (proceeding anyway):', e));
    } catch (e) {
      console.warn('[sync] Evolu reset threw synchronously:', e);
    }
  }

  // Drop in-memory references so any stray callers see fresh-state behavior
  clearSyncRuntimeState();

  showNotification('Sync disabled — reloading…', 'success');
  // Reload regardless of whether Evolu cooperated. ~250ms gives the toast
  // time to render before the page swaps.
  setTimeout(() => window.location.reload(), 250);
}

bindSyncWindowActions({ enableSync, disableSync });
