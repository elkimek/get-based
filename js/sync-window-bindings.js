// @ts-check
// sync-window-bindings.js - Browser global sync actions.

import {
  compactOwnerSelfServe, fetchOwnerStorageFromRelay, getRelayHealthVerdict,
  getRelayQuotaEstimate, resetRelayQuotaEstimate, verifyPushLanded,
} from './sync-relay-health.js';
import {
  getDeltaCutoverReadiness, getDeltaTelemetry, resetDeltaTelemetry,
} from './sync-delta.js';
import {
  applyPendingTombstone, deleteProfileFromRelay, listPendingTombstones,
  rejectPendingTombstone,
} from './sync-tombstones.js';
import {
  clearLegacyAgentAccessSecrets, disableMessengerTokenLocal,
  generateMessengerContextKey, generateMessengerToken, getMessengerContextKey,
  getMessengerToken, isMessengerEnabled,
  pushContextToGateway, revokeMessengerTokenRemote,
} from './sync-messenger.js';
import {
  checkRelayConnection, getSyncBlocker,
} from './sync-environment.js';
import {
  getMnemonic, getMnemonicResolutionError, restoreFromMnemonic,
} from './sync-identity.js';
import {
  isSyncEnabled,
} from './sync-settings-state.js';
import {
  _syncDiag,
} from './sync-diagnostics.js';
import {
  copySyncEvents, renderSyncIndicator, toggleSyncDetail, updateSyncIndicator,
} from './sync-ui.js';
import {
  confirmBackfillBlockers, confirmCompactRelay, confirmDisablePhase2,
  confirmEnablePhase2, confirmResetDeltaTelemetry, confirmRotateIdentity,
  copySyncDiagnose, refreshRelayStorage, showSyncDiagnose,
} from './sync-diagnose-ui.js';
import {
  forceResendCurrentProfile, pushCurrentProfile, syncNow,
} from './sync-actions.js';
import { cleanStorage } from './sync-storage-cleanup.js';
import {
  forcePull,
} from './sync-pull.js';
import {
  disablePhase2Cutover, enablePhase2Cutover, isPhase2CutoverEnabled,
} from './sync-cutover.js';

function generateMessengerTokenWindow() {
  const result = generateMessengerToken();
  return result?.token || '';
}

async function revokeMessengerTokenWindow() {
  const previousToken = disableMessengerTokenLocal();
  const { saveImportedData } = await import('./data.js');
  const saved = await saveImportedData({ reason: 'agent-access-window-disable' });
  if (saved === false) throw new Error('saveImportedData returned false while disabling Agent Access');
  clearLegacyAgentAccessSecrets();
  revokeMessengerTokenRemote(previousToken);
  return previousToken;
}

/** @param {{ enableSync?: (...args: any[]) => any, disableSync?: (...args: any[]) => any }} [actions] */
export function bindSyncWindowActions({ enableSync, disableSync } = {}) {
  if (typeof window === 'undefined') return;

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
    getMessengerContextKey,
    generateMessengerToken: generateMessengerTokenWindow,
    generateMessengerContextKey,
    revokeMessengerToken: revokeMessengerTokenWindow,
    pushContextToGateway,
    _syncDiag,
    _forcePull: forcePull,
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
}
