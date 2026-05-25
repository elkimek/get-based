// sync-apply.js - apply inbound synced settings, chat data, and display prefs

import { state } from './state.js';
import { isDebugMode } from './utils.js';
import { getEncryptionEnabled, encryptedSetItem, encryptedGetItem, encryptedRemoveItem } from './crypto.js';
import { AI_SETTINGS_KEYS, DISPLAY_PREF_SUFFIXES, chatDeletedThreadsKey } from './sync-payload-collectors.js';
import { logSyncEvent } from './sync-state.js';

function dbg(...args) { if (isDebugMode()) console.log('[sync]', ...args); }

const OPENROUTER_OAUTH_LOCAL_SETTINGS_LOCK_UNTIL_KEY = 'or_oauth_local_settings_lock_until';
const OPENROUTER_OAUTH_LOCAL_SETTING_KEYS = new Set(['labcharts-ai-provider', 'labcharts-openrouter-key']);
const AI_SETTINGS_LOCAL_LOCK_UNTIL_KEY = 'labcharts-ai-settings-local-lock-until';
const CHAT_LOCAL_LOCK_UNTIL_KEY = 'labcharts-chat-local-lock-until';
const CHAT_LOCAL_LOCK_MS = 90 * 1000;
const CHAT_DELETED_THREADS_MAX = 200;
const CHAT_DELETED_PROTO_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

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

function hasMeaningfulLocalChatData(profileId) {
  try {
    const raw = localStorage.getItem(`labcharts-${profileId}-chat-threads`);
    const threads = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(threads)) return false;
    return threads.some(thread => (Number(thread?.messageCount) || 0) > 0);
  } catch {
    return false;
  }
}

function shouldKeepLocalChatData(profileId) {
  return getChatDataLocalLockRemainingMs(profileId) > 0
    && hasMeaningfulLocalChatData(profileId);
}

function threadUpdatedAtMs(thread) {
  if (!thread || typeof thread !== 'object') return 0;
  const value = thread.updatedAt || thread.createdAt || '';
  const ts = Date.parse(value);
  return Number.isFinite(ts) ? ts : 0;
}

function normalizeDeletedThreads(value) {
  const out = Object.create(null);
  if (!value) return out;
  if (Array.isArray(value)) {
    for (const item of value) {
      const id = typeof item === 'string' ? item : item?.id;
      const deletedAt = typeof item === 'string' ? Date.now() : item?.deletedAt;
      const ts = Number(deletedAt);
      if (CHAT_DELETED_PROTO_KEYS.has(id)) continue;
      if (typeof id === 'string' && id && Number.isFinite(ts) && ts > 0) out[id] = ts;
    }
    return out;
  }
  if (typeof value !== 'object') return out;
  for (const [id, deletedAt] of Object.entries(value)) {
    const ts = Number(deletedAt);
    if (CHAT_DELETED_PROTO_KEYS.has(id)) continue;
    if (typeof id === 'string' && id && Number.isFinite(ts) && ts > 0) out[id] = ts;
  }
  return out;
}

function readLocalDeletedThreads(profileId) {
  try {
    const raw = localStorage.getItem(chatDeletedThreadsKey(profileId));
    return normalizeDeletedThreads(raw ? JSON.parse(raw) : null);
  } catch {
    return {};
  }
}

function writeLocalDeletedThreads(profileId, deletedThreads) {
  try {
    const entries = Object.entries(normalizeDeletedThreads(deletedThreads))
      .sort((a, b) => b[1] - a[1])
      .slice(0, CHAT_DELETED_THREADS_MAX);
    const key = chatDeletedThreadsKey(profileId);
    if (entries.length === 0) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(Object.fromEntries(entries)));
  } catch {}
}

async function applyChatThreadTombstones(profileId, existingThreads, deletedThreads) {
  const keptThreads = [];
  let changed = false;
  for (const thread of existingThreads) {
    if (!thread || typeof thread.id !== 'string') continue;
    if ((Number(deletedThreads[thread.id]) || 0) >= threadUpdatedAtMs(thread)) {
      await encryptedRemoveItem(`labcharts-${profileId}-chat-t_${thread.id}`);
      changed = true;
      continue;
    }
    keptThreads.push(thread);
  }
  if (changed) {
    localStorage.setItem(`labcharts-${profileId}-chat-threads`, JSON.stringify(keptThreads));
  }
  return changed;
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
  // Thread index: always plain localStorage (matches saveChatThreadIndex in chat.js).
  // encryptAllSensitiveKeys handles at-rest encryption when session ends.
  const threadsKey = `labcharts-${profileId}-chat-threads`;
  const existingRaw = await encryptedGetItem(threadsKey) || localStorage.getItem(threadsKey);
  let existingThreads = [];
  if (existingRaw) {
    try { existingThreads = JSON.parse(existingRaw); }
    catch { existingThreads = []; }
  }
  if (!Array.isArray(existingThreads)) existingThreads = [];

  const deletedThreads = readLocalDeletedThreads(profileId);
  for (const [id, deletedAt] of Object.entries(normalizeDeletedThreads(chatData.deletedThreads))) {
    deletedThreads[id] = Math.max(Number(deletedThreads[id]) || 0, deletedAt);
  }
  const tombstonesChanged = await applyChatThreadTombstones(profileId, existingThreads, deletedThreads);

  if (shouldKeepLocalChatData(profileId)) {
    writeLocalDeletedThreads(profileId, deletedThreads);
    dbg(`Skipped chatData for ${profileId.slice(0, 8)} - local chat has newer unsynced changes`);
    logSyncEvent('skip', `Chat pull skipped ${profileId.slice(0, 8)} - local changes pending`);
    return tombstonesChanged;
  }

  const mergedById = new Map();
  const existingById = new Map();
  for (const thread of existingThreads) {
    if (!thread || typeof thread.id !== 'string') continue;
    existingById.set(thread.id, thread);
    if ((Number(deletedThreads[thread.id]) || 0) >= threadUpdatedAtMs(thread)) continue;
    mergedById.set(thread.id, thread);
  }
  for (const thread of chatData.threads) {
    if (!thread || typeof thread.id !== 'string') continue;
    if ((Number(deletedThreads[thread.id]) || 0) >= threadUpdatedAtMs(thread)) continue;
    const prev = mergedById.get(thread.id);
    const incomingTs = threadUpdatedAtMs(thread);
    const prevTs = threadUpdatedAtMs(prev);
    if (!prev || incomingTs > prevTs || (incomingTs === prevTs && (Number(thread.messageCount) || 0) > (Number(prev.messageCount) || 0))) {
      mergedById.set(thread.id, thread);
    }
  }

  const mergedThreads = Array.from(mergedById.values())
    .sort((a, b) => (threadUpdatedAtMs(b) - threadUpdatedAtMs(a)) || String(a.id).localeCompare(String(b.id)));
  localStorage.setItem(threadsKey, JSON.stringify(mergedThreads));

  for (const thread of existingThreads) {
    if (!thread || typeof thread.id !== 'string') continue;
    if ((Number(deletedThreads[thread.id]) || 0) >= threadUpdatedAtMs(thread)) {
      await encryptedRemoveItem(`labcharts-${profileId}-chat-t_${thread.id}`);
    }
  }
  if (chatData.messages) {
    for (const [threadId, msgs] of Object.entries(chatData.messages)) {
      const incomingThread = chatData.threads.find(t => t?.id === threadId);
      if (!incomingThread || !mergedById.has(threadId)) continue;
      const existingThread = existingById.get(threadId);
      const incomingTs = threadUpdatedAtMs(incomingThread);
      const existingTs = threadUpdatedAtMs(existingThread);
      const incomingCount = Number(incomingThread.messageCount) || 0;
      const existingCount = Number(existingThread?.messageCount) || 0;
      if (existingThread && incomingTs < existingTs) continue;
      if (existingThread && incomingTs === existingTs && incomingCount < existingCount) continue;
      const msgKey = `labcharts-${profileId}-chat-t_${threadId}`;
      const msgJson = JSON.stringify(msgs);
      if (getEncryptionEnabled()) {
        await encryptedSetItem(msgKey, msgJson);
      } else {
        localStorage.setItem(msgKey, msgJson);
      }
    }
  }
  writeLocalDeletedThreads(profileId, deletedThreads);
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
