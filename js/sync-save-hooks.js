// @ts-check
// sync-save-hooks.js - Save/chat/profile sync debounce hooks.

import { getErrorMessage } from './caught-error.js';
import { state } from './state.js';
import { profileStorageKey } from './profile-storage-key.js';
import { getEncryptionEnabled, encryptedGetItem } from './crypto.js';
import { markChatDataLocal } from './sync-chat-apply.js';
import { pushContextToGateway } from './sync-messenger.js';
import { addUtilsRuntimeListener } from './utils-runtime.js';
import { markSyncProfileDirty } from './sync-dirty-state.js';

/** @type {(...args: any[]) => Promise<any>} */
let _pushProfile = async () => {};
let _isSyncEnabled = () => false;
let _isEvoluReady = () => false;
let _isSyncing = () => false;
let _createDefaultProfileData = () => ({ entries: [] });
/** @type {(data: any) => any} */
let _migrateProfileData = (data) => data;

// Per-profile debounce timers. Switching profiles mid-debounce previously
// dropped the pending push for the prior profile because the single shared
// timer was overwritten. Keyed by profileId so each profile's pending push
// survives until it fires.
const _debounceTimers = new Map();
const _chatSyncTimers = new Map();
const _profileSyncTimers = new Map();
let _aiSettingsPushTimer = null;
let _eventsBound = false;

/** @param {{
 *   pushProfile?: (...args: any[]) => Promise<any>,
 *   isSyncEnabled?: () => boolean,
 *   isEvoluReady?: () => boolean,
 *   isSyncing?: () => boolean,
 *   createDefaultProfileData?: () => any,
 *   migrateProfileData?: (data: any) => any,
 * }} [deps]
 */
export function configureSyncSaveHooks({
  pushProfile,
  isSyncEnabled,
  isEvoluReady,
  isSyncing,
  createDefaultProfileData,
  migrateProfileData,
} = {}) {
  const previous = {
    pushProfile: _pushProfile,
    isSyncEnabled: _isSyncEnabled,
    isEvoluReady: _isEvoluReady,
    isSyncing: _isSyncing,
    createDefaultProfileData: _createDefaultProfileData,
    migrateProfileData: _migrateProfileData,
  };
  if (typeof pushProfile === 'function') _pushProfile = pushProfile;
  if (typeof isSyncEnabled === 'function') _isSyncEnabled = isSyncEnabled;
  if (typeof isEvoluReady === 'function') _isEvoluReady = isEvoluReady;
  if (typeof isSyncing === 'function') _isSyncing = isSyncing;
  if (typeof createDefaultProfileData === 'function') _createDefaultProfileData = createDefaultProfileData;
  if (typeof migrateProfileData === 'function') _migrateProfileData = migrateProfileData;
  return previous;
}

export function bindSyncSaveHookEvents() {
  if (_eventsBound) return;
  const bound = addUtilsRuntimeListener('labcharts-ai-settings-local-changed', () => {
    if (!_isSyncEnabled() || !state.currentProfile || !state.importedData) return;
    markSyncProfileDirty(state.currentProfile);
    scheduleAISettingsPush(state.currentProfile, state.importedData);
  });
  if (bound) _eventsBound = true;
}

function scheduleAISettingsPush(profileId, importedData, attempt = 0) {
  if (_aiSettingsPushTimer) clearTimeout(_aiSettingsPushTimer);
  _aiSettingsPushTimer = setTimeout(async () => {
    _aiSettingsPushTimer = null;
    if (!_isSyncEnabled()) return;
    if (!_isEvoluReady() || _isSyncing()) {
      if (attempt < 60) scheduleAISettingsPush(profileId, importedData, attempt + 1);
      return;
    }
    try {
      const result = await _pushProfile(profileId, importedData);
      if (result?.skipped && attempt < 60) scheduleAISettingsPush(profileId, importedData, attempt + 1);
    } catch {}
  }, attempt === 0 ? 250 : 1000);
}

export function clearSyncSaveTimers() {
  for (const t of _debounceTimers.values()) clearTimeout(t);
  _debounceTimers.clear();
  for (const t of _chatSyncTimers.values()) clearTimeout(t);
  _chatSyncTimers.clear();
  for (const t of _profileSyncTimers.values()) clearTimeout(t);
  _profileSyncTimers.clear();
  if (_aiSettingsPushTimer) {
    clearTimeout(_aiSettingsPushTimer);
    _aiSettingsPushTimer = null;
  }
}

/** @param {string | null | undefined} profileId
 * @param {any} [fallback]
 */
export async function readProfileImportedData(profileId, fallback = null) {
  const normalize = (data) => {
    if (data && typeof data === 'object') _migrateProfileData(data);
    return data;
  };
  if (fallback && typeof fallback === 'object') return normalize(fallback);
  if (profileId === state.currentProfile && state.importedData) return normalize(state.importedData);
  if (!profileId) return _createDefaultProfileData();
  try {
    const storageKey = profileStorageKey(profileId, 'imported');
    const raw = getEncryptionEnabled()
      ? await encryptedGetItem(storageKey)
      : localStorage.getItem(storageKey);
    if (raw) return normalize(JSON.parse(raw));
  } catch (e) {
    console.warn('[sync] Could not read profile importedData for profile sync:', getErrorMessage(e, e));
  }
  return _createDefaultProfileData();
}

/** @param {string} profileId
 * @param {any} data
 * @param {number} [attempt]
 */
function scheduleProfilePush(profileId, data, attempt = 0) {
  if (!_isSyncEnabled()) {
    _profileSyncTimers.delete(profileId);
    return;
  }
  if (!_isEvoluReady() || _isSyncing()) {
    if (attempt < 60) {
      const retry = setTimeout(() => {
        if (_profileSyncTimers.get(profileId) === retry) _profileSyncTimers.delete(profileId);
        scheduleProfilePush(profileId, data, attempt + 1);
      }, 1000);
      _profileSyncTimers.set(profileId, retry);
      return;
    }
  }
  if (!_isEvoluReady()) {
    _profileSyncTimers.delete(profileId);
    return;
  }
  _profileSyncTimers.delete(profileId);
  _pushProfile(profileId, data).catch(() => {});
}

/** @param {string | null | undefined} profileId
 * @param {any} [importedData]
 */
export function onProfileSaved(profileId, importedData = null) {
  if (!profileId) return;
  if (!_isSyncEnabled()) return;
  markSyncProfileDirty(profileId);
  const prev = _profileSyncTimers.get(profileId);
  if (prev) clearTimeout(prev);
  const timer = setTimeout(async () => {
    if (_profileSyncTimers.get(profileId) === timer) _profileSyncTimers.delete(profileId);
    if (!_isSyncEnabled()) return;
    const data = await readProfileImportedData(profileId, importedData);
    scheduleProfilePush(profileId, data);
  }, 250);
  _profileSyncTimers.set(profileId, timer);
}

/** @param {{ immediate?: boolean, skipSync?: boolean }} [options] */
export function onDataSaved(options = {}) {
  if (!options?.skipSync && _isSyncEnabled()) {
    const profileId = state.currentProfile;
    const data = state.importedData;
    if (profileId) {
      markSyncProfileDirty(profileId);
      if (!_isEvoluReady()) {
        pushContextToGateway();
        return;
      }
      const prev = _debounceTimers.get(profileId);
      if (prev) clearTimeout(prev);
      if (options?.immediate) {
        _debounceTimers.delete(profileId);
        scheduleProfilePush(profileId, data);
      } else {
        const timer = setTimeout(() => {
          _debounceTimers.delete(profileId);
          scheduleProfilePush(profileId, data);
        }, 10_000);
        _debounceTimers.set(profileId, timer);
      }
    }
  }
  pushContextToGateway();
}

export function onChatSaved() {
  markChatDataLocal();
  if (!_isSyncEnabled()) return;
  const profileId = state.currentProfile;
  const data = state.importedData;
  if (!profileId) return;
  markSyncProfileDirty(profileId);
  if (!_isEvoluReady()) return;
  const prev = _chatSyncTimers.get(profileId);
  if (prev) clearTimeout(prev);
  const timer = setTimeout(() => {
    _chatSyncTimers.delete(profileId);
    scheduleProfilePush(profileId, data);
  }, 10000);
  _chatSyncTimers.set(profileId, timer);
}
