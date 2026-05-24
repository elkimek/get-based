// sync-apply.js - apply inbound synced settings, chat data, and display prefs

import { state } from './state.js';
import { isDebugMode } from './utils.js';
import { getEncryptionEnabled, encryptedSetItem, encryptedGetItem, encryptedRemoveItem } from './crypto.js';
import { AI_SETTINGS_KEYS, DISPLAY_PREF_SUFFIXES } from './sync-payload.js';
import { logSyncEvent } from './sync-state.js';

function dbg(...args) { if (isDebugMode()) console.log('[sync]', ...args); }

const OPENROUTER_OAUTH_LOCAL_SETTINGS_LOCK_UNTIL_KEY = 'or_oauth_local_settings_lock_until';
const OPENROUTER_OAUTH_LOCAL_SETTING_KEYS = new Set(['labcharts-ai-provider', 'labcharts-openrouter-key']);
const AI_SETTINGS_LOCAL_LOCK_UNTIL_KEY = 'labcharts-ai-settings-local-lock-until';
const CHAT_LOCAL_LOCK_UNTIL_KEY = 'labcharts-chat-local-lock-until';
const CHAT_LOCAL_LOCK_MS = 90 * 1000;

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

export function markChatDataLocal() {
  try {
    sessionStorage.setItem(CHAT_LOCAL_LOCK_UNTIL_KEY, String(Date.now() + CHAT_LOCAL_LOCK_MS));
  } catch {}
}

function getLocalChatLockUntil(profileId) {
  if (profileId !== state.currentProfile) return 0;
  try {
    const until = Number(sessionStorage.getItem(CHAT_LOCAL_LOCK_UNTIL_KEY) || '0');
    return Number.isFinite(until) ? until : 0;
  } catch {
    return 0;
  }
}

export function getChatDataLocalLockRemainingMs(profileId) {
  return Math.max(0, getLocalChatLockUntil(profileId) - Date.now());
}

function shouldKeepLocalChatData(profileId) {
  return getChatDataLocalLockRemainingMs(profileId) > 0;
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

export async function applyChatData(profileId, chatData) {
  if (!chatData || !Array.isArray(chatData.threads)) return false;
  if (shouldKeepLocalChatData(profileId)) {
    dbg(`Skipped chatData for ${profileId.slice(0, 8)} - local chat has newer unsynced changes`);
    logSyncEvent('skip', `Chat pull skipped ${profileId.slice(0, 8)} - local changes pending`);
    return false;
  }
  // Thread index: always plain localStorage (matches saveChatThreadIndex in chat.js).
  // encryptAllSensitiveKeys handles at-rest encryption when session ends.
  const threadsKey = `labcharts-${profileId}-chat-threads`;
  const existingRaw = await encryptedGetItem(threadsKey) || localStorage.getItem(threadsKey);
  const incomingThreadIds = new Set(chatData.threads.map(t => t?.id).filter(id => typeof id === 'string'));
  if (existingRaw) {
    try {
      const existingThreads = JSON.parse(existingRaw);
      if (Array.isArray(existingThreads)) {
        for (const t of existingThreads) {
          if (typeof t?.id === 'string' && !incomingThreadIds.has(t.id)) {
            await encryptedRemoveItem(`labcharts-${profileId}-chat-t_${t.id}`);
          }
        }
      }
    } catch {}
  }
  localStorage.setItem(threadsKey, JSON.stringify(chatData.threads));
  if (chatData.messages) {
    for (const [threadId, msgs] of Object.entries(chatData.messages)) {
      const msgKey = `labcharts-${profileId}-chat-t_${threadId}`;
      const msgJson = JSON.stringify(msgs);
      if (getEncryptionEnabled()) {
        await encryptedSetItem(msgKey, msgJson);
      } else {
        localStorage.setItem(msgKey, msgJson);
      }
    }
  }
  if (chatData.customPersonalities) {
    localStorage.setItem(`labcharts-${profileId}-chatPersonalityCustom`, JSON.stringify(chatData.customPersonalities));
  }
  if (chatData.activePersonality) {
    localStorage.setItem(`labcharts-${profileId}-chatPersonality`, chatData.activePersonality);
  }
  return true;
}

export function applyDisplayPrefs(profileId, prefs) {
  if (!prefs) return;
  for (const suffix of DISPLAY_PREF_SUFFIXES) {
    if (suffix in prefs) {
      localStorage.setItem(`labcharts-${profileId}-${suffix}`, prefs[suffix]);
    }
  }
}
