// @ts-check
// sync-chat-apply.js - inbound chat sync apply helpers and freshness locks.

import { state } from './state.js';
import { isDebugMode } from './utils.js';
import {
  getEncryptionEnabled, isUnlocked, encryptedSetItem, encryptedGetItem, encryptedRemoveItem,
} from './crypto.js';
import { chatDeletedThreadsKey } from './sync-payload-collectors.js';
import { logSyncEvent } from './sync-state.js';
import {
  loadCustomPersonalitiesFromStorage,
  loadCustomPersonalityTombstones,
  saveCustomPersonalitiesToStorage,
  saveCustomPersonalityTombstones,
} from './chat-personality-storage.js';
import { mergeCustomPersonalityState } from './chat-personality-merge.js';

function dbg(...args) { if (isDebugMode()) console.log('[sync]', ...args); }

const CHAT_LOCAL_LOCK_UNTIL_KEY = 'labcharts-chat-local-lock-until';
const CHAT_PERSONA_LOCAL_LOCK_UNTIL_KEY = 'labcharts-chat-persona-local-lock-until';
const CHAT_LOCAL_LOCK_MS = 90 * 1000;
const CHAT_DELETED_THREADS_MAX = 200;
const CHAT_DELETED_PROTO_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

export function markChatDataLocal() {
  try {
    sessionStorage.setItem(CHAT_LOCAL_LOCK_UNTIL_KEY, String(Date.now() + CHAT_LOCAL_LOCK_MS));
  } catch {}
}

export function markCustomPersonalityDataLocal() {
  // Item timestamps and tombstones protect local persona edits during pulls.
  try { sessionStorage.removeItem(CHAT_PERSONA_LOCAL_LOCK_UNTIL_KEY); } catch {}
}

/** @param {string | null | undefined} profileId */
function getLocalChatLockUntil(profileId) {
  if (profileId !== state.currentProfile) return 0;
  try {
    const until = Number(sessionStorage.getItem(CHAT_LOCAL_LOCK_UNTIL_KEY) || '0');
    return Number.isFinite(until) ? until : 0;
  } catch {
    return 0;
  }
}

/** @param {string | null | undefined} profileId */
export function getChatDataLocalLockRemainingMs(profileId) {
  if (profileId !== state.currentProfile) return 0;
  return Math.max(
    0,
    getLocalChatLockUntil(profileId) - Date.now(),
  );
}

/** @param {string} profileId */
async function hasMeaningfulLocalChatData(profileId) {
  try {
    const key = `labcharts-${profileId}-chat-threads`;
    const raw = await encryptedGetItem(key) || localStorage.getItem(key);
    const threads = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(threads)) return false;
    return threads.some(thread => (Number(thread?.messageCount) || 0) > 0);
  } catch {
    return false;
  }
}

/** @param {string} profileId */
async function shouldKeepLocalChatData(profileId) {
  if (profileId !== state.currentProfile) return false;
  return (
    getLocalChatLockUntil(profileId) > Date.now()
    && await hasMeaningfulLocalChatData(profileId)
  );
}

/** @param {string} profileId @param {any} chatData */
async function applyCustomPersonalityState(profileId, chatData) {
  const hasPersonalities = Object.prototype.hasOwnProperty.call(chatData, 'customPersonalities');
  const hasTombstones = Object.prototype.hasOwnProperty.call(chatData, 'customPersonalityDeleted');
  if (!hasPersonalities && !hasTombstones) return false;
  const localPersonalities = await loadCustomPersonalitiesFromStorage(profileId);
  const localTombstones = await loadCustomPersonalityTombstones(profileId);
  const merged = mergeCustomPersonalityState(
    localPersonalities,
    Array.isArray(chatData.customPersonalities) ? chatData.customPersonalities : [],
    localTombstones,
    chatData.customPersonalityDeleted,
  );
  const changed = JSON.stringify(localPersonalities) !== JSON.stringify(merged.personalities)
    || JSON.stringify(localTombstones) !== JSON.stringify(merged.tombstones);
  if (!changed) return false;
  await saveCustomPersonalitiesToStorage(merged.personalities, profileId);
  await saveCustomPersonalityTombstones(merged.tombstones, profileId);
  return true;
}

/** @param {any} thread */
function threadUpdatedAtMs(thread) {
  if (!thread || typeof thread !== 'object') return 0;
  const value = thread.updatedAt || thread.createdAt || '';
  const ts = Date.parse(value);
  return Number.isFinite(ts) ? ts : 0;
}

/** @param {any} value */
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

/** @param {string} profileId */
function readLocalDeletedThreads(profileId) {
  try {
    const raw = localStorage.getItem(chatDeletedThreadsKey(profileId));
    return normalizeDeletedThreads(raw ? JSON.parse(raw) : null);
  } catch {
    return {};
  }
}

/** @param {string} profileId
 * @param {any} deletedThreads
 */
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

/** @param {string} profileId
 * @param {any[]} existingThreads
 * @param {Record<string, number>} deletedThreads
 */
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
    await encryptedSetItem(`labcharts-${profileId}-chat-threads`, JSON.stringify(keptThreads));
  }
  return changed;
}

/** @param {string} profileId
 * @param {any} chatData
 */
export async function applyChatData(profileId, chatData) {
  if (!chatData || !Array.isArray(chatData.threads)) return false;
  if (getEncryptionEnabled() && !isUnlocked()) {
    dbg(`Skipped chatData for ${profileId.slice(0, 8)} - encryption is locked`);
    logSyncEvent('skip', `Chat pull skipped ${profileId.slice(0, 8)} - encryption locked`);
    return false;
  }
  // The thread index is a sensitive key, so writes must use the same encrypted
  // wrapper as normal chat saves.
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
  const personalitiesChanged = await applyCustomPersonalityState(profileId, chatData);

  if (await shouldKeepLocalChatData(profileId)) {
    writeLocalDeletedThreads(profileId, deletedThreads);
    dbg(`Skipped chatData for ${profileId.slice(0, 8)} - local chat has newer unsynced changes`);
    logSyncEvent('skip', `Chat pull skipped ${profileId.slice(0, 8)} - local changes pending`);
    return tombstonesChanged || personalitiesChanged;
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
  await encryptedSetItem(threadsKey, JSON.stringify(mergedThreads));

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
  if (chatData.activePersonality) {
    const customIds = new Set((await loadCustomPersonalitiesFromStorage(profileId)).map(item => item.id));
    const requested = String(chatData.activePersonality);
    localStorage.setItem(
      `labcharts-${profileId}-chatPersonality`,
      requested.startsWith('custom_') && !customIds.has(requested) ? 'default' : requested,
    );
  }
  return true;
}
