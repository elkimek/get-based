// sync-save-hooks.js - Save/chat/profile sync debounce hooks.

import { state } from './state.js';
import { profileStorageKey, createDefaultProfileData } from './profile.js';
import { getEncryptionEnabled, encryptedGetItem } from './crypto.js';
import { markChatDataLocal } from './sync-chat-apply.js';
import { pushContextToGateway } from './sync-messenger.js';

let _pushProfile = async () => {};
let _isSyncEnabled = () => false;
let _isEvoluReady = () => false;
let _isSyncing = () => false;

// Per-profile debounce timers. Switching profiles mid-debounce previously
// dropped the pending push for the prior profile because the single shared
// timer was overwritten. Keyed by profileId so each profile's pending push
// survives until it fires.
const _debounceTimers = new Map();
const _chatSyncTimers = new Map();
const _profileSyncTimers = new Map();
let _aiSettingsPushTimer = null;
let _eventsBound = false;

export function configureSyncSaveHooks({
  pushProfile,
  isSyncEnabled,
  isEvoluReady,
  isSyncing,
} = {}) {
  if (typeof pushProfile === 'function') _pushProfile = pushProfile;
  if (typeof isSyncEnabled === 'function') _isSyncEnabled = isSyncEnabled;
  if (typeof isEvoluReady === 'function') _isEvoluReady = isEvoluReady;
  if (typeof isSyncing === 'function') _isSyncing = isSyncing;
}

export function bindSyncSaveHookEvents() {
  if (_eventsBound || typeof window === 'undefined' || typeof window.addEventListener !== 'function') return;
  _eventsBound = true;
  window.addEventListener('labcharts-ai-settings-local-changed', () => {
    if (!_isSyncEnabled() || !state.currentProfile || !state.importedData) return;
    if (_aiSettingsPushTimer) clearTimeout(_aiSettingsPushTimer);
    const profileId = state.currentProfile;
    const importedData = state.importedData;
    _aiSettingsPushTimer = setTimeout(() => {
      _aiSettingsPushTimer = null;
      _pushProfile(profileId, importedData).catch(() => {});
    }, 250);
  });
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

export async function readProfileImportedData(profileId, fallback = null) {
  if (fallback && typeof fallback === 'object') return fallback;
  if (profileId === state.currentProfile && state.importedData) return state.importedData;
  try {
    const storageKey = profileStorageKey(profileId, 'imported');
    const raw = getEncryptionEnabled()
      ? await encryptedGetItem(storageKey)
      : localStorage.getItem(storageKey);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.warn('[sync] Could not read profile importedData for profile sync:', e?.message || e);
  }
  return createDefaultProfileData();
}

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

export function onProfileSaved(profileId, importedData = null) {
  if (!profileId) return;
  if (!_isSyncEnabled()) return;
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

export function onDataSaved(options = {}) {
  if (_isSyncEnabled() && _isEvoluReady()) {
    const profileId = state.currentProfile;
    const data = state.importedData;
    if (profileId) {
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
  if (!_isSyncEnabled() || !_isEvoluReady()) return;
  const profileId = state.currentProfile;
  const data = state.importedData;
  if (!profileId) return;
  const prev = _chatSyncTimers.get(profileId);
  if (prev) clearTimeout(prev);
  const timer = setTimeout(() => {
    _chatSyncTimers.delete(profileId);
    scheduleProfilePush(profileId, data);
  }, 10000);
  _chatSyncTimers.set(profileId, timer);
}
