// sync-apply.js - apply inbound synced AI settings and display prefs.

import { encryptedSetItem, encryptedGetItem } from './crypto.js';
import { AI_SETTINGS_KEYS, DISPLAY_PREF_SUFFIXES } from './sync-payload-collectors.js';

export {
  applyChatData, getChatDataLocalLockRemainingMs, markChatDataLocal,
} from './sync-chat-apply.js';

const OPENROUTER_OAUTH_LOCAL_SETTINGS_LOCK_UNTIL_KEY = 'or_oauth_local_settings_lock_until';
const OPENROUTER_OAUTH_LOCAL_SETTING_KEYS = new Set(['labcharts-ai-provider', 'labcharts-openrouter-key']);
const AI_SETTINGS_LOCAL_LOCK_UNTIL_KEY = 'labcharts-ai-settings-local-lock-until';

function hasLocalAISettingsLock() {
  try {
    const until = Number(sessionStorage.getItem(AI_SETTINGS_LOCAL_LOCK_UNTIL_KEY) || '0');
    return Number.isFinite(until) && Date.now() < until;
  } catch {
    return false;
  }
}

function shouldKeepLocalOpenRouterOAuthSetting(key) {
  if (!OPENROUTER_OAUTH_LOCAL_SETTING_KEYS.has(key)) return false;
  try {
    const until = Number(sessionStorage.getItem(OPENROUTER_OAUTH_LOCAL_SETTINGS_LOCK_UNTIL_KEY) || '0');
    return Number.isFinite(until) && Date.now() < until;
  } catch {
    return false;
  }
}

function shouldKeepLocalAISetting(key) {
  return shouldKeepLocalOpenRouterOAuthSetting(key)
    || (AI_SETTINGS_KEYS.includes(key) && hasLocalAISettingsLock());
}

const ENCRYPTED_AI_KEYS = ['labcharts-openrouter-key', 'labcharts-venice-key', 'labcharts-routstr-key', 'labcharts-ppq-key', 'labcharts-ollama', 'labcharts-cashu-wallet-mnemonic', 'labcharts-lens-key', 'labcharts-custom-key'];

export async function applyAISettings(settings) {
  if (!settings) return;
  let changed = false;
  for (const [key, val] of Object.entries(settings)) {
    if (!AI_SETTINGS_KEYS.includes(key)) continue;
    if (typeof val !== 'string' || val.length > 10000) continue; // sanity check
    if (shouldKeepLocalAISetting(key)) continue;
    const before = await encryptedGetItem(key);
    if (before === val) continue;
    if (ENCRYPTED_AI_KEYS.includes(key)) {
      await encryptedSetItem(key, val);
    } else {
      localStorage.setItem(key, val);
    }
    changed = true;
  }
  if (changed) {
    window.updateChatHeaderModel?.();
    window.refreshWebSearchToggle?.();
  }
}

export function applyDisplayPrefs(profileId, prefs) {
  if (!prefs) return;
  for (const suffix of DISPLAY_PREF_SUFFIXES) {
    if (suffix in prefs) {
      localStorage.setItem(`labcharts-${profileId}-${suffix}`, prefs[suffix]);
    }
  }
}
