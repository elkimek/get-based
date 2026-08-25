// @ts-check
// sync-configure.js - Dependency wiring for the sync subsystem.

import { showNotification, isDebugMode } from './utils.js';
import { saveImportedData } from './data.js';
import {
  createDefaultProfileData, getProfiles, loadProfile, migrateProfileData, saveProfiles,
} from './profile.js';
import { configureRelayHealth } from './sync-relay-health.js';
import { logSyncEvent, updateSyncStatus } from './sync-state.js';
import { isSyncConfigured, isSyncEnabled } from './sync-settings-state.js';
import { configureSyncDelta } from './sync-delta.js';
import { configureSyncTombstones, deleteProfileFromRelay } from './sync-tombstones.js';
import { configureSyncMessenger } from './sync-messenger.js';
import { buildLabContext, buildWearableSeriesSection, getAgentWearableSeriesDays } from './lab-context.js';
import { checkRelayConnection, getSyncRelay } from './sync-environment.js';
import {
  configureSyncIdentity, resetLocalSyncHistoryForRelayRebuild, restoreFromMnemonic,
} from './sync-identity.js';
import { configureSyncDiagnostics } from './sync-diagnostics.js';
import { bindSyncUIStatusUpdates, configureSyncUI, initSyncUIDelegates } from './sync-ui.js';
import { configureSyncDiagnoseUI, showSyncDiagnose } from './sync-diagnose-ui.js';
import {
  configureSyncActions, forceResendCurrentProfile, pushAllProfiles,
  pushCurrentProfile, pushDirtyProfiles, pushProfilesById, syncNow,
} from './sync-actions.js';
import { bindSyncSaveHookEvents, configureSyncSaveHooks } from './sync-save-hooks.js';
import { configureSyncPush, isSyncPushInFlight, pushProfile } from './sync-push.js';
import { configureSyncPayload } from './sync-payload.js';
import { configureSyncRecovery } from './sync-recovery.js';
import { configureSyncInit } from './sync-init.js';
import { configureSyncReconcile, reconcileLocalStorageWithEvolu } from './sync-reconcile.js';
import {
  disablePhase2Cutover, enablePhase2Cutover, isPhase2CutoverEnabled,
} from './sync-cutover.js';
import {
  configureSyncPull, forcePull as _forcePull, isSyncPulling, onSyncReceived,
} from './sync-pull.js';
import {
  configureSyncSubscriptions, getSyncSubscriptionFireCount,
} from './sync-subscriptions.js';
import { cleanStorage, configureSyncStorageCleanup } from './sync-storage-cleanup.js';
import {
  getSyncAppOwner, getSyncAppOwnerError, getSyncEvolu, getSyncItemRowQuery,
  getSyncProfileQuery, getSyncTombstoneQuery, isSyncEvoluReady,
} from './sync-runtime.js';

/** @param {...any} args */
function dbg(...args) { if (isDebugMode()) console.log('[sync]', ...args); }

/** @param {{ enableSync?: (...args: any[]) => any }} [deps] */
export function configureSyncModules({ enableSync } = {}) {
  configureSyncPayload({ getProfiles });
  configureSyncStorageCleanup({ saveImportedData });

  configureRelayHealth({
    getAppOwner: getSyncAppOwner,
    getSyncRelay,
    /** @param {{ level?: string, pct?: number }} q */
    onQuotaThreshold(q) {
      if (q.level === 'red') {
        logSyncEvent('skip', `Relay storage ${q.pct}% — pushes will start failing soon; reduce storage`);
        try { showNotification(`Relay storage is ${q.pct}% full. Open Sync status and choose Reduce storage so new updates are not rejected.`, 'error'); } catch {}
      } else {
        try { showNotification(`Relay storage is ${q.pct}% full. Open Sync status and choose Reduce storage when all devices are up to date.`, 'warning'); } catch {}
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
    getProfiles,
  });

  configureSyncPull({
    getEvolu: getSyncEvolu,
    getProfileQuery: getSyncProfileQuery,
    isSyncPushInFlight,
    isSyncEnabled,
    pushProfile,
    pushDirtyProfiles,
    pushProfilesById,
    getProfiles,
    deleteProfileFromRelay,
    debug: dbg,
  });

  configureSyncSubscriptions({
    isSyncing: isSyncPushInFlight,
    isPulling: isSyncPulling,
    isSyncEnabled,
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
    getProfiles,
    saveProfiles,
    loadProfile,
  });

  configureSyncMessenger({
    getSyncRelay,
    getAppOwner: getSyncAppOwner,
    debug: dbg,
    buildLabContext,
    buildWearableSeriesSection,
    getAgentWearableSeriesDays,
    getProfiles,
  });

  configureSyncIdentity({
    getAppOwner: getSyncAppOwner,
    getAppOwnerError: getSyncAppOwnerError,
    getEvolu: getSyncEvolu,
    seedLocalProfiles: () => pushAllProfiles({ force: true }),
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
    syncNow,
    forceResendCurrentProfile,
    cleanStorage,
    checkRelayConnection,
    showSyncDiagnose,
  });
  initSyncUIDelegates();
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
    resetLocalSyncHistoryForRelayRebuild,
    getProfiles,
    createDefaultProfileData,
  });

  configureSyncSaveHooks({
    pushProfile,
    isSyncEnabled,
    isSyncConfigured,
    isEvoluReady: isSyncEvoluReady,
    isSyncing: isSyncPushInFlight,
    createDefaultProfileData,
    migrateProfileData,
    getProfiles,
  });
  bindSyncSaveHookEvents();

  configureSyncRecovery({
    isSyncEnabled,
    isEvoluReady: isSyncEvoluReady,
    pushCurrentProfile,
    forcePull: _forcePull,
    debug: dbg,
    /** @param {...any} args */
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
    getProfiles,
  });

  configureSyncInit({ reconcileLocalStorageWithEvolu });
}
