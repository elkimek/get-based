import { configureRuntimeFunctions } from './runtime-callbacks.js';
// sync.js — Evolu sync layer public entry point (opt-in, E2E encrypted)
// Stores importedData + profile metadata per profile as a JSON blob.
// Last-write-wins at the profile level — fine for single-user cross-device sync.

import {
  compactOwnerSelfServe, fetchOwnerStorageFromRelay,
  getRelayHealthVerdict, getRelayQuotaEstimate,
  resetRelayQuotaEstimate, verifyPushLanded,
} from './sync-relay-health.js';
import {
  getRecentSyncEvents, subscribeSyncStatus,
} from './sync-state.js';
import {
  isSyncConfigured, isSyncEnabled, isSyncPaused, primeSyncState,
} from './sync-settings-state.js';
import {
  applyPendingTombstone, deleteProfileFromRelay, listPendingTombstones,
  rejectPendingTombstone,
} from './sync-tombstones.js';
import {
  clearAgentAccessMigrationDirty, clearLegacyAgentAccessSecrets,
  disableMessengerTokenLocal, generateMessengerToken,
  generateMessengerContextKey, getAgentAccessState,
  getMessengerContextKey, getMessengerToken, hasMessengerSyncIdentity,
  isAgentAccessMigrationDirty, isMessengerEnabled,
  migrateLocalAgentAccessToProfile, refreshAgentAccessFromSyncedProfile,
  revokeMessengerTokenRemote, setAgentAccessWearableSeriesDays,
  pushContextToGateway, revokeMessengerToken,
} from './sync-messenger.js';
import {
  checkRelayConnection, getSyncBlocker, getSyncRelay, setSyncRelay,
} from './sync-environment.js';
import {
  getMnemonic, getMnemonicResolutionError, getSyncIdentityFingerprint,
  restoreFromMnemonic,
} from './sync-identity.js';
import { getEvoluDiagnostics } from './sync-diagnostics-snapshot.js';
import {
  copySyncEvents, renderSyncIndicator, toggleSyncDetail, updateSyncIndicator,
} from './sync-ui.js';
import {
  showSyncDiagnose,
} from './sync-diagnose-ui.js';
import {
  forceResendCurrentProfile, pushCurrentProfile, syncNow,
} from './sync-actions.js';
import {
  onChatSaved, onDataSaved, onProfileSaved,
} from './sync-save-hooks.js';
import { cleanStorage } from './sync-storage-cleanup.js';
import {
  disablePhase2Cutover, enablePhase2Cutover, isPhase2CutoverEnabled,
} from './sync-cutover.js';
import { initSync } from './sync-init.js';

interface SyncLifecycleDependencies {
  enableSync: (options?: { skipPush?: boolean; persist?: boolean }) => Promise<unknown>;
  disableSync: (...args: unknown[]) => Promise<unknown>;
  pauseSync: (...args: unknown[]) => Promise<unknown>;
}

const syncLifecycleDeps: SyncLifecycleDependencies = {
  enableSync: async () => { throw new Error('Sync lifecycle is not configured'); },
  disableSync: async () => { throw new Error('Sync lifecycle is not configured'); },
  pauseSync: async () => { throw new Error('Sync lifecycle is not configured'); },
};

export function configureSyncLifecycleDeps(deps: Partial<SyncLifecycleDependencies> = {}) {
  return configureRuntimeFunctions(syncLifecycleDeps, deps, ["enableSync","disableSync","pauseSync"]);
}

export function enableSync(...args: Parameters<SyncLifecycleDependencies['enableSync']>) {
  return syncLifecycleDeps.enableSync(...args);
}

export function disableSync(...args: Parameters<SyncLifecycleDependencies['disableSync']>) {
  return syncLifecycleDeps.disableSync(...args);
}

export function pauseSync(...args: Parameters<SyncLifecycleDependencies['pauseSync']>) {
  return syncLifecycleDeps.pauseSync(...args);
}

export {
  compactOwnerSelfServe, fetchOwnerStorageFromRelay, getRelayHealthVerdict,
  getRelayQuotaEstimate, resetRelayQuotaEstimate, verifyPushLanded,
  getRecentSyncEvents, subscribeSyncStatus,
  isSyncConfigured, isSyncEnabled, isSyncPaused, initSync, primeSyncState,
  applyPendingTombstone, deleteProfileFromRelay, listPendingTombstones,
  rejectPendingTombstone,
  clearAgentAccessMigrationDirty, clearLegacyAgentAccessSecrets,
  disableMessengerTokenLocal, generateMessengerToken,
  generateMessengerContextKey, getAgentAccessState,
  getMessengerContextKey, getMessengerToken, hasMessengerSyncIdentity,
  isAgentAccessMigrationDirty, isMessengerEnabled,
  migrateLocalAgentAccessToProfile, refreshAgentAccessFromSyncedProfile,
  revokeMessengerTokenRemote, setAgentAccessWearableSeriesDays,
  pushContextToGateway, revokeMessengerToken,
  checkRelayConnection, getSyncBlocker, getSyncRelay, setSyncRelay,
  getMnemonic, getMnemonicResolutionError, getSyncIdentityFingerprint,
  restoreFromMnemonic,
  getEvoluDiagnostics,
  renderSyncIndicator, updateSyncIndicator, toggleSyncDetail, copySyncEvents,
  showSyncDiagnose,
  cleanStorage, forceResendCurrentProfile, onChatSaved, onDataSaved,
  onProfileSaved,
  pushCurrentProfile, syncNow,
  disablePhase2Cutover, enablePhase2Cutover, isPhase2CutoverEnabled,
};
