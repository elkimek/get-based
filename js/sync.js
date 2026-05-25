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
  getRecentSyncEvents, logSyncEvent, subscribeSyncStatus, updateSyncStatus,
} from './sync-state.js';
import {
  isSyncEnabled, primeSyncState,
} from './sync-settings-state.js';
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
  configureSyncActions,
  forceResendCurrentProfile, pushCurrentProfile, syncNow,
} from './sync-actions.js';
import {
  bindSyncSaveHookEvents, configureSyncSaveHooks, onChatSaved,
  onDataSaved, onProfileSaved,
} from './sync-save-hooks.js';
import { cleanStorage } from './sync-storage-cleanup.js';
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
  configureSyncPull, forcePull as _forcePull, isSyncPulling, onSyncReceived,
} from './sync-pull.js';
import {
  configureSyncSubscriptions, getSyncSubscriptionFireCount,
} from './sync-subscriptions.js';
import {
  bindSyncWindowActions,
} from './sync-window-bindings.js';
import { initSync } from './sync-init.js';
import { disableSync, enableSync } from './sync-lifecycle.js';
import {
  getSyncAppOwner, getSyncAppOwnerError, getSyncEvolu, getSyncItemRowQuery,
  getSyncProfileQuery, getSyncTombstoneQuery, isSyncEvoluReady,
} from './sync-runtime.js';

export {
  compactOwnerSelfServe, fetchOwnerStorageFromRelay, getRelayHealthVerdict,
  getRelayQuotaEstimate, resetRelayQuotaEstimate, verifyPushLanded,
  getRecentSyncEvents, subscribeSyncStatus,
  isSyncEnabled, initSync, primeSyncState, enableSync, disableSync,
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

configureSyncSaveHooks({
  pushProfile,
  isSyncEnabled,
  isEvoluReady: isSyncEvoluReady,
  isSyncing: isSyncPushInFlight,
});
bindSyncSaveHookEvents();

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

bindSyncWindowActions({ enableSync, disableSync });
