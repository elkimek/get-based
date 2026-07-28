// @ts-check
// sync-actions.js - user-triggered sync actions.

import { state } from './state.js';
import { showNotification } from './utils.js';
import { pushContextToGateway } from './sync-messenger.js';
import { logSyncEvent } from './sync-state.js';
import {
  bindSyncSaveHookEvents, clearSyncSaveTimers, configureSyncSaveHooks,
  readProfileImportedData,
} from './sync-save-hooks.js';

export { cleanStorage } from './sync-storage-cleanup.js';
export { onChatSaved, onDataSaved, onProfileSaved } from './sync-save-hooks.js';

/** @type {(...args: any[]) => Promise<any>} */
let _pushProfile = async () => {};
/** @type {(...args: any[]) => any} */
let _forcePull = () => {};
let _isSyncEnabled = () => false;
let _isEvoluReady = () => false;
/** @type {() => any[]} */
let _getProfiles = () => [];
let _createDefaultProfileData = () => ({ entries: [] });

/** @param {{
 *   pushProfile?: (...args: any[]) => Promise<any>,
 *   forcePull?: (...args: any[]) => any,
 *   isSyncEnabled?: () => boolean,
 *   isEvoluReady?: () => boolean,
 *   isSyncing?: () => boolean,
 *   getProfiles?: () => any[],
 *   createDefaultProfileData?: () => any,
 * }} [deps]
 */
export function configureSyncActions({
  pushProfile,
  forcePull,
  isSyncEnabled,
  isEvoluReady,
  isSyncing,
  getProfiles,
  createDefaultProfileData,
} = {}) {
  if (typeof pushProfile === 'function') _pushProfile = pushProfile;
  if (typeof forcePull === 'function') _forcePull = forcePull;
  if (typeof isSyncEnabled === 'function') _isSyncEnabled = isSyncEnabled;
  if (typeof isEvoluReady === 'function') _isEvoluReady = isEvoluReady;
  if (typeof getProfiles === 'function') _getProfiles = getProfiles;
  if (typeof createDefaultProfileData === 'function') _createDefaultProfileData = createDefaultProfileData;
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
/** @param {any} [options] */
export async function pushAllProfiles(options = {}) {
  const profiles = _getProfiles();
  for (const p of profiles) {
    try {
      let dataJson;
      if (p.id === state.currentProfile) {
        dataJson = state.importedData || _createDefaultProfileData();
      } else {
        dataJson = await readProfileImportedData(p.id);
      }
      if (dataJson) await _pushProfile(p.id, dataJson, options);
    } catch (e) {
      console.error('[sync] Push failed for profile:', p.id, e);
    }
  }
}
