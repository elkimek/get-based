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
import { prepareProfileForRelayRebuild } from './sync-cutover.js';
import { getSyncDirtyToken } from './sync-dirty-state.js';

export { cleanStorage } from './sync-storage-cleanup.js';
export { onChatSaved, onDataSaved, onProfileSaved } from './sync-save-hooks.js';

/** @type {(...args: any[]) => Promise<any>} */
let _pushProfile = async () => {};
/** @type {(...args: any[]) => any} */
let _forcePull = () => {};
let _isSyncEnabled = () => false;
let _isEvoluReady = () => false;
let _isSyncing = () => false;
let _resetLocalSyncHistoryForRelayRebuild = async () => {};
/** @type {() => any[]} */
let _getProfiles = () => [];
let _createDefaultProfileData = () => ({ entries: [] });

/** @param {{
 *   pushProfile?: (...args: any[]) => Promise<any>,
 *   forcePull?: (...args: any[]) => any,
 *   isSyncEnabled?: () => boolean,
 *   isEvoluReady?: () => boolean,
 *   isSyncing?: () => boolean,
 *   resetLocalSyncHistoryForRelayRebuild?: () => Promise<any>,
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
  resetLocalSyncHistoryForRelayRebuild,
  getProfiles,
  createDefaultProfileData,
} = {}) {
  if (typeof pushProfile === 'function') _pushProfile = pushProfile;
  if (typeof forcePull === 'function') _forcePull = forcePull;
  if (typeof isSyncEnabled === 'function') _isSyncEnabled = isSyncEnabled;
  if (typeof isEvoluReady === 'function') _isEvoluReady = isEvoluReady;
  if (typeof isSyncing === 'function') _isSyncing = isSyncing;
  if (typeof resetLocalSyncHistoryForRelayRebuild === 'function') {
    _resetLocalSyncHistoryForRelayRebuild = resetLocalSyncHistoryForRelayRebuild;
  }
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
  const result = await _pushProfile(state.currentProfile, state.importedData);
  pushContextToGateway();
  return result;
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
  // A local save can be waiting in the normal 10-second debounce period.
  // Pulling first in that state lets an older remote scalar overwrite the
  // durable local edit before it ever reaches Evolu. Flush dirty local state
  // first; clean devices still pull first so they cannot publish stale data.
  if (getSyncDirtyToken(state.currentProfile)) {
    const deadline = Date.now() + 30_000;
    while (_isSyncing() && Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    const localResult = await pushCurrentProfile();
    if (!localResult?.ok) return localResult;
    try {
      await _forcePull();
    } catch (error) {
      console.warn('[sync] Manual pull failed after flushing local changes:', error);
      logSyncEvent('skip', 'Manual pull failed — local changes were still committed');
      return localResult;
    }
    return pushCurrentProfile();
  }
  // Apply any already-received remote state before publishing the local
  // snapshot. Pull-then-push matches first-enable behavior and avoids sending
  // a stale local row only to replace it milliseconds later.
  try {
    await _forcePull();
  } catch (error) {
    console.warn('[sync] Manual pull failed; continuing with local push:', error);
    logSyncEvent('skip', 'Manual pull failed — local push still attempted');
  }
  return pushCurrentProfile();
}

// Push all profiles on first enable.
/** @param {any} [options] */
export async function pushAllProfiles(options = {}) {
  const profiles = _getProfiles();
  const summary = { total: profiles.length, succeeded: 0, failed: 0, skipped: 0 };
  for (const p of profiles) {
    try {
      let dataJson;
      if (p.id === state.currentProfile) {
        dataJson = state.importedData || _createDefaultProfileData();
      } else {
        dataJson = await readProfileImportedData(p.id);
      }
      if (!dataJson) {
        summary.skipped++;
        continue;
      }
      const result = await _pushProfile(p.id, dataJson, options);
      if (result?.ok === true) summary.succeeded++;
      else summary.failed++;
    } catch (e) {
      summary.failed++;
      console.error('[sync] Push failed for profile:', p.id, e);
    }
  }
  return summary;
}

/** @param {any[]} profiles */
async function flushDirtyProfilesForRelayCompaction(profiles) {
  for (const profile of profiles) {
    const profileId = profile?.id;
    if (!profileId) continue;
    // Token-safe clearing in pushProfile leaves a newer generation dirty if
    // another tab saves while this push commits. Retry a bounded number of
    // generations and fail closed rather than compacting over live edits.
    for (let attempt = 0; attempt < 5 && getSyncDirtyToken(profileId); attempt++) {
      const deadline = Date.now() + 30_000;
      while (_isSyncing() && Date.now() < deadline) {
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      if (_isSyncing()) throw new Error('Sync is still busy; wait for it to finish and retry compaction');

      const importedData = await readProfileImportedData(profileId);
      const result = await _pushProfile(profileId, importedData);
      if (!result?.ok) {
        throw new Error(`Could not commit pending changes for profile ${profileId.slice(0, 8)}`);
      }
    }
    if (getSyncDirtyToken(profileId)) {
      throw new Error(`New changes kept arriving for profile ${profileId.slice(0, 8)}; pause editing and retry compaction`);
    }
  }
}

export async function prepareRelayCompaction() {
  if (!_isEvoluReady() || !_isSyncEnabled()) {
    throw new Error('Sync is not ready on this device');
  }
  const profiles = _getProfiles();
  if (profiles.length === 0) throw new Error('No local profiles are available to rebuild the relay');
  // forcePull merges every profile returned by the relay. Commit all durable
  // local edits first, including inactive profiles whose debounce survived a
  // profile switch, so stale relay scalars cannot overwrite the rebuild source.
  await flushDirtyProfilesForRelayCompaction(profiles);
  await _forcePull();
}

export async function rebuildOwnerRelayState() {
  await _resetLocalSyncHistoryForRelayRebuild();
  const profiles = _getProfiles();
  for (const profile of profiles) prepareProfileForRelayRebuild(profile?.id);
  const summary = await pushAllProfiles({ force: true });
  if (summary.failed > 0 || summary.succeeded === 0) {
    throw new Error(`Relay rebuild incomplete (${summary.succeeded}/${summary.total} profiles sent)`);
  }
  return summary;
}
