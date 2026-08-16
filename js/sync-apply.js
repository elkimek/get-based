// @ts-check
// sync-apply.js - apply inbound synced AI settings and display prefs.

import { encryptedSetItem, encryptedGetItem, updateKeyCache } from './crypto.js';
import { AI_SETTINGS_KEYS, DISPLAY_PREF_SUFFIXES } from './sync-payload-collectors.js';
import {
  getAppExtensionSyncEncryptedStorageKeys,
  getAppExtensionSyncEncryptedStoragePrefixes,
  getAppExtensionSyncStorageKeys,
  getAppExtensionSyncStoragePrefixes,
} from './app-extension-runtime.js';
import { refreshSyncedAIProviderUiRuntime, refreshSyncedRoutstrBalanceRuntime } from './sync-runtime.js';
import { VOICE_ENCRYPTED_SYNC_KEYS } from './voice-settings-schema.js';

export {
  applyChatData, getChatDataLocalLockRemainingMs, markChatDataLocal,
} from './sync-chat-apply.js';

const OPENROUTER_OAUTH_LOCAL_SETTINGS_LOCK_UNTIL_KEY = 'or_oauth_local_settings_lock_until';
const OPENROUTER_OAUTH_LOCAL_SETTING_KEYS = new Set(['labcharts-ai-provider', 'labcharts-openrouter-key']);
const AI_SETTINGS_LOCAL_LOCK_UNTIL_KEY = 'labcharts-ai-settings-local-lock-until';
const ROUTSTR_SESSION_UPDATED_AT_KEY = 'labcharts-routstr-session-updated-at';
const ROUTSTR_SESSION_KEYS = new Set(['labcharts-routstr-key', 'labcharts-routstr-node']);

function hasLocalAISettingsLock() {
  try {
    const until = Number(sessionStorage.getItem(AI_SETTINGS_LOCAL_LOCK_UNTIL_KEY) || '0');
    return Number.isFinite(until) && Date.now() < until;
  } catch {
    return false;
  }
}

/** @param {string} key */
function shouldKeepLocalOpenRouterOAuthSetting(key) {
  if (!OPENROUTER_OAUTH_LOCAL_SETTING_KEYS.has(key)) return false;
  try {
    const until = Number(sessionStorage.getItem(OPENROUTER_OAUTH_LOCAL_SETTINGS_LOCK_UNTIL_KEY) || '0');
    return Number.isFinite(until) && Date.now() < until;
  } catch {
    return false;
  }
}

/** @param {string} key */
function shouldKeepLocalAISetting(key, preferRemote = false) {
  if (preferRemote) return false;
  return shouldKeepLocalOpenRouterOAuthSetting(key)
    || (AI_SETTINGS_KEYS.includes(key) && hasLocalAISettingsLock());
}

const ENCRYPTED_AI_KEYS = [
  'labcharts-openrouter-key',
  'labcharts-venice-key',
  'labcharts-routstr-key',
  'labcharts-ppq-key',
  'labcharts-ollama',
  'labcharts-ollama-pii-key',
  'labcharts-lens-key',
  'labcharts-custom-key',
  ...VOICE_ENCRYPTED_SYNC_KEYS,
];

/** @param {Record<string, any> | null | undefined} settings
 * @param {{ preferRemote?: boolean }} [options]
 */
export async function applyAISettings(settings, options = {}) {
  if (!settings) return;
  let changed = false;
  let routstrSessionChanged = false;
  const extensionKeys = new Set(getAppExtensionSyncStorageKeys());
  const extensionPrefixes = getAppExtensionSyncStoragePrefixes();
  const extensionEncryptedKeys = new Set(getAppExtensionSyncEncryptedStorageKeys());
  const extensionEncryptedPrefixes = getAppExtensionSyncEncryptedStoragePrefixes();
  const remoteRoutstrUpdatedAt = Number(settings[ROUTSTR_SESSION_UPDATED_AT_KEY] || 0);
  const localRoutstrUpdatedAt = Number(localStorage.getItem(ROUTSTR_SESSION_UPDATED_AT_KEY) || 0);
  const remoteRoutstrIsNewer = Number.isFinite(remoteRoutstrUpdatedAt)
    && remoteRoutstrUpdatedAt > localRoutstrUpdatedAt;
  const localRoutstrIsNewer = Number.isFinite(localRoutstrUpdatedAt)
    && localRoutstrUpdatedAt > remoteRoutstrUpdatedAt;
  for (const [key, val] of Object.entries(settings)) {
    const coreSetting = AI_SETTINGS_KEYS.includes(key);
    const extensionSetting = extensionKeys.has(key)
      || extensionPrefixes.some(prefix => key.startsWith(prefix));
    if (!coreSetting && !extensionSetting) continue;
    if (val !== null && (typeof val !== 'string' || val.length > 10000)) continue; // sanity check
    const encryptedSetting = ENCRYPTED_AI_KEYS.includes(key)
      || extensionEncryptedKeys.has(key)
      || extensionEncryptedPrefixes.some(prefix => key.startsWith(prefix));
    const routstrSessionKey = ROUTSTR_SESSION_KEYS.has(key) || key === ROUTSTR_SESSION_UPDATED_AT_KEY;
    // AI settings are global but are carried in every profile row. Once a
    // clocked Routstr session lands, an older profile row with no clock (0)
    // must not overwrite it with a legacy/stale key.
    if (routstrSessionKey && localRoutstrIsNewer && options.preferRemote !== true) continue;
    const preferRemoteSetting = options.preferRemote === true || (routstrSessionKey && remoteRoutstrIsNewer);
    if (shouldKeepLocalAISetting(key, preferRemoteSetting)) continue;
    const before = await encryptedGetItem(key);
    const hasStoredValue = localStorage.getItem(key) !== null;
    if (val === null ? before === '' && hasStoredValue : before === val) continue;
    if (val === null) {
      // Keep an empty stored value so subsequent pushes preserve the deletion
      // tombstone instead of allowing an older peer to resurrect the key.
      if (encryptedSetting) {
        await encryptedSetItem(key, '');
        updateKeyCache(key, '');
      } else {
        localStorage.setItem(key, '');
      }
    } else if (encryptedSetting) {
      await encryptedSetItem(key, val);
      // Provider accessors are synchronous and read the decrypted in-memory
      // cache. A key pulled after startup must update that cache immediately;
      // otherwise they receive the on-disk `v1:` ciphertext wrapper until the
      // next full reload and Routstr appears unsynced on the receiving device.
      updateKeyCache(key, val);
    } else {
      localStorage.setItem(key, val);
    }
    changed = true;
    if (routstrSessionKey) routstrSessionChanged = true;
  }
  if (changed) {
    refreshSyncedAIProviderUiRuntime();
  }
  if (routstrSessionChanged) refreshSyncedRoutstrBalanceRuntime();
}

/** @param {string} profileId
 * @param {Record<string, string> | null | undefined} prefs
 */
export function applyDisplayPrefs(profileId, prefs) {
  if (!prefs) return;
  for (const suffix of DISPLAY_PREF_SUFFIXES) {
    if (suffix in prefs) {
      localStorage.setItem(`labcharts-${profileId}-${suffix}`, prefs[suffix]);
    }
  }
}
