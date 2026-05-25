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
  isSyncEnabled, primeSyncState,
} from './sync-settings-state.js';
import {
  applyPendingTombstone, deleteProfileFromRelay, listPendingTombstones,
  rejectPendingTombstone,
} from './sync-tombstones.js';
import {
  generateMessengerToken, getMessengerToken, isMessengerEnabled,
  pushContextToGateway, revokeMessengerToken,
} from './sync-messenger.js';
import {
  checkRelayConnection, getSyncBlocker, getSyncRelay, setSyncRelay,
} from './sync-environment.js';
import {
  getMnemonic, getMnemonicResolutionError, restoreFromMnemonic,
} from './sync-identity.js';
import {
  getEvoluDiagnostics,
} from './sync-diagnostics.js';
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
import { disableSync, enableSync } from './sync-lifecycle.js';
import { configureSyncModules } from './sync-configure.js';

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

configureSyncModules({ enableSync, disableSync });
