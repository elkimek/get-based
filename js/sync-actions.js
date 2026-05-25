// sync-actions.js - user-triggered sync actions and save/chat debounce hooks.

import { state } from './state.js';
import { showNotification } from './utils.js';
import { profileStorageKey, getProfiles, createDefaultProfileData } from './profile.js';
import { getEncryptionEnabled, encryptedGetItem } from './crypto.js';
import { markChatDataLocal } from './sync-chat-apply.js';
import { pushContextToGateway } from './sync-messenger.js';
import { logSyncEvent } from './sync-state.js';

let _pushProfile = async () => {};
let _forcePull = () => {};
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
  if (typeof isSyncing === 'function') _isSyncing = isSyncing;
}

export function bindSyncActionEvents() {
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

export function clearSyncActionTimers() {
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

async function readProfileImportedData(profileId, fallback = null) {
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

export async function pushCurrentProfile() {
  await _pushProfile(state.currentProfile, state.importedData);
  pushContextToGateway();
}

// "Clean storage" - emergency localStorage compaction. The 'imported'
// blob can grow past the browser's 5 MB localStorage cap (caps were
// bypassed by the cross-device merge before the data-merge.js fix).
// When that happens every saveImportedData() throws QuotaExceededError
// and pushes wedge silently. This trims changeHistory to its intended
// 200-cap, drops cached model lists (re-fetched on demand), and reports
// before/after sizes via showNotification. Reachable from the sync
// popover so a phone user can run it without dev-tools access.
export async function cleanStorage() {
  let beforeBytes = 0;
  for (const key of Object.keys(localStorage)) beforeBytes += new Blob([localStorage.getItem(key) || '']).size;

  // 1. Drop ephemeral model-list caches - safe, will re-fetch on next API use.
  const cacheKeys = [
    'labcharts-openrouter-models',
    'labcharts-venice-models',
    'labcharts-ppq-models',
    'labcharts-routstr-models',
    'labcharts-venice-e2ee-models',
  ];
  let cachesCleared = 0;
  for (const k of cacheKeys) {
    if (localStorage.getItem(k) != null) { localStorage.removeItem(k); cachesCleared++; }
  }

  // 2. Cap changeHistory in state.importedData if it's grown past 200.
  let historyTrimmed = 0;
  if (Array.isArray(state.importedData?.changeHistory) && state.importedData.changeHistory.length > 200) {
    historyTrimmed = state.importedData.changeHistory.length - 200;
    state.importedData.changeHistory = state.importedData.changeHistory.slice(-200);
    try {
      const { saveImportedData } = await import('./data.js');
      await saveImportedData();
    } catch (e) {
      console.warn('[sync] cleanStorage: saveImportedData failed:', e?.message || e);
    }
  }

  let afterBytes = 0;
  for (const key of Object.keys(localStorage)) afterBytes += new Blob([localStorage.getItem(key) || '']).size;
  const freedKB = ((beforeBytes - afterBytes) / 1024).toFixed(0);
  const beforeMB = (beforeBytes / 1024 / 1024).toFixed(2);
  const afterMB = (afterBytes / 1024 / 1024).toFixed(2);

  const msg = `Storage: ${beforeMB} MB → ${afterMB} MB (freed ${freedKB} KB). ` +
              `Caches cleared: ${cachesCleared}. ` +
              `History trimmed: ${historyTrimmed}.`;
  logSyncEvent('cleanup', msg);
  showNotification(msg, freedKB > 0 ? 'success' : 'info');
  return { beforeBytes, afterBytes, freedKB: +freedKB, cachesCleared, historyTrimmed };
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

export function onDataSaved() {
  if (_isSyncEnabled() && _isEvoluReady()) {
    const profileId = state.currentProfile;
    const data = state.importedData;
    if (profileId) {
      const prev = _debounceTimers.get(profileId);
      if (prev) clearTimeout(prev);
      const timer = setTimeout(() => {
        _debounceTimers.delete(profileId);
        scheduleProfilePush(profileId, data);
      }, 10_000);
      _debounceTimers.set(profileId, timer);
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
