// sync-configure.js - Dependency wiring for the sync subsystem.

import { showNotification, isDebugMode } from './utils.js';
import { configureRelayHealth } from './sync-relay-health.js';
import { logSyncEvent, updateSyncStatus } from './sync-state.js';
import { isSyncEnabled } from './sync-settings-state.js';
import { configureSyncDelta } from './sync-delta.js';
import { configureSyncTombstones } from './sync-tombstones.js';
import { configureSyncMessenger } from './sync-messenger.js';
import { checkRelayConnection, getSyncRelay } from './sync-environment.js';
import { configureSyncIdentity, restoreFromMnemonic } from './sync-identity.js';
import { configureSyncDiagnostics } from './sync-diagnostics.js';
import { bindSyncUIStatusUpdates, configureSyncUI } from './sync-ui.js';
import { configureSyncDiagnoseUI } from './sync-diagnose-ui.js';
import { configureSyncActions, pushCurrentProfile } from './sync-actions.js';
import { bindSyncSaveHookEvents, configureSyncSaveHooks } from './sync-save-hooks.js';
import { configureSyncPush, isSyncPushInFlight, pushProfile } from './sync-push.js';
import { configureSyncRecovery } from './sync-recovery.js';
import { configureSyncReconcile } from './sync-reconcile.js';
import {
  disablePhase2Cutover, enablePhase2Cutover, isPhase2CutoverEnabled,
} from './sync-cutover.js';
import {
  configureSyncPull, forcePull as _forcePull, isSyncPulling, onSyncReceived,
} from './sync-pull.js';
import {
  configureSyncSubscriptions, getSyncSubscriptionFireCount,
} from './sync-subscriptions.js';
import { bindSyncWindowActions } from './sync-window-bindings.js';
import {
  getSyncAppOwner, getSyncAppOwnerError, getSyncEvolu, getSyncItemRowQuery,
  getSyncProfileQuery, getSyncTombstoneQuery, isSyncEvoluReady,
} from './sync-runtime.js';

function dbg(...args) { if (isDebugMode()) console.log('[sync]', ...args); }

export function configureSyncModules({ enableSync, disableSync } = {}) {
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
}
