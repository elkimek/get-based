// sync-actions.js - user-triggered sync actions.

import { state } from './state.js';
import { showNotification } from './utils.js';
import { getProfiles, createDefaultProfileData } from './profile.js';
import { pushContextToGateway } from './sync-messenger.js';
import { logSyncEvent } from './sync-state.js';
import {
  bindSyncSaveHookEvents, clearSyncSaveTimers, configureSyncSaveHooks,
  readProfileImportedData,
} from './sync-save-hooks.js';

export { cleanStorage } from './sync-storage-cleanup.js';
export { onChatSaved, onDataSaved, onProfileSaved } from './sync-save-hooks.js';

let _pushProfile = async () => {};
let _forcePull = () => {};
let _isSyncEnabled = () => false;
let _isEvoluReady = () => false;

export function configureSyncActions({
  pushProfile,
  forcePull,
  isSyncEnabled,
  isEvoluReady,
  isSyncing,
} = {}) {
  if (typeof pushProfile === 'function') _pushProfile = pushProfile;
  if (typeof forcePull === 'function') _forcePull = forcePull;
  if (typeof isSyncEnabled === 'function') _isSyncEnabled = isSyncEnabled;
  if (typeof isEvoluReady === 'function') _isEvoluReady = isEvoluReady;
  configureSyncSaveHooks({ pushProfile, isSyncEnabled, isEvoluReady, isSyncing });
}

export function bindSyncActionEvents() {
  bindSyncSaveHookEvents();
}

export function clearSyncActionTimers() {
  clearSyncSaveTimers();
}

export async function pushCurrentProfile() {
  await _pushProfile(state.currentProfile, state.importedData);
  pushContextToGateway();
}

// "Force resend" - bypasses the _syncing guard so a wedged in-flight flag
// doesn't silently no-op the push.
export async function forceResendCurrentProfile() {
  if (!_isEvoluReady() || !_isSyncEnabled()) {
    showNotification('Sync is not enabled — nothing to push.', 'warning');
    return;
  }
  logSyncEvent('forced', `Force resend ${state.currentProfile?.slice(0,8) || '?'}`);
  await _pushProfile(state.currentProfile, state.importedData, { force: true });
  pushContextToGateway();
}

export async function syncNow() {
  await pushCurrentProfile();
  _forcePull();
}

// Push all profiles on first enable.
export async function pushAllProfiles() {
  const profiles = getProfiles();
  for (const p of profiles) {
    try {
      let dataJson;
      if (p.id === state.currentProfile) {
        dataJson = state.importedData || createDefaultProfileData();
      } else {
        dataJson = await readProfileImportedData(p.id);
      }
      if (dataJson) await _pushProfile(p.id, dataJson);
    } catch (e) {
      console.error('[sync] Push failed for profile:', p.id, e);
    }
  }
}
