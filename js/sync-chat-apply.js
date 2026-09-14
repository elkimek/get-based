// @ts-check
// sync-chat-apply.js - inbound chat sync apply helpers and freshness locks.

import { state } from './state.js';
import {
  getEncryptionEnabled, isUnlocked, encryptedSetItem, encryptedRemoveItem,
} from './crypto.js';
import { chatDeletedThreadsKey, collectChatData } from './sync-payload-collectors.js';
import { chatHasLocalChanges, chatThreadUpdatedAtMs, mergeChatData, normalizeChatDeletedThreads } from './sync-chat-merge.js';
import { logSyncEvent } from './sync-state.js';
import {
  loadCustomPersonalitiesFromStorage,
  saveCustomPersonalitiesToStorage,
  saveCustomPersonalityTombstones,
} from './chat-personality-storage.js';

const CHAT_LOCAL_LOCK_UNTIL_KEY = 'labcharts-chat-local-lock-until';
const CHAT_PERSONA_LOCAL_LOCK_UNTIL_KEY = 'labcharts-chat-persona-local-lock-until';
const CHAT_LOCAL_LOCK_MS = 90 * 1000;

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

/** @param {string} profileId @param {any} chatData @param {any} local @param {any} merged */
async function applyCustomPersonalityState(profileId, chatData, local, merged) {
  if (!Object.hasOwn(chatData, 'customPersonalities') && !Object.hasOwn(chatData, 'customPersonalityDeleted')) return false;
  const personalities = merged.customPersonalities || [];
  const tombstones = merged.customPersonalityDeleted || {};
  const changed = JSON.stringify(local?.customPersonalities || []) !== JSON.stringify(personalities)
    || JSON.stringify(local?.customPersonalityDeleted || {}) !== JSON.stringify(tombstones);
  if (!changed) return false;
  await saveCustomPersonalitiesToStorage(personalities, profileId);
  await saveCustomPersonalityTombstones(tombstones, profileId);
  return true;
}

/** @param {string} profileId
 * @param {any} deletedThreads
 */
function writeLocalDeletedThreads(profileId, deletedThreads) {
  // Deletion markers cannot expire until all replicas have acknowledged them.
  // Persist before removing bodies so a failed write never reports a deletion
  // as safely applied without retaining the evidence needed by stale peers.
  const entries = Object.entries(normalizeChatDeletedThreads(deletedThreads))
    .sort((a, b) => b[1] - a[1]);
  const key = chatDeletedThreadsKey(profileId);
  if (entries.length === 0) localStorage.removeItem(key);
  else localStorage.setItem(key, JSON.stringify(Object.fromEntries(entries)));
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
    if ((Number(deletedThreads[thread.id]) || 0) > 0
      && deletedThreads[thread.id] >= chatThreadUpdatedAtMs(thread)) {
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
    logSyncEvent('skip', `Chat pull skipped ${profileId.slice(0, 8)} - encryption locked`);
    return false;
  }
  // The thread index is a sensitive key, so writes must use the same encrypted
  // wrapper as normal chat saves.
  const threadsKey = `labcharts-${profileId}-chat-threads`;
  const local = await collectChatData(profileId);
  const existingThreads = local?.threads || [];
  const merged = mergeChatData(local, chatData);
  const deletedThreads = merged.deletedThreads || {};
  writeLocalDeletedThreads(profileId, deletedThreads);
  const tombstonesChanged = await applyChatThreadTombstones(profileId, existingThreads, deletedThreads);
  const personalitiesChanged = await applyCustomPersonalityState(profileId, chatData, local, merged);

  // Reuse the decrypted snapshot. A second read could observe a different
  // generation, and all locally deleted threads must be excluded from the lock.
  const liveIds = new Set(merged.threads.map(thread => thread.id));
  if (getChatDataLocalLockRemainingMs(profileId) > 0
      && existingThreads.some(thread => (Number(thread?.messageCount) || 0) > 0 && liveIds.has(thread.id))) {
    logSyncEvent('skip', `Chat pull skipped ${profileId.slice(0, 8)} - local changes pending`);
    return tombstonesChanged || personalitiesChanged;
  }

  // Store bodies before advancing metadata; an interrupted body write must
  // leave the old metadata available for a subsequent recovery pull.
  for (const [threadId, msgs] of Object.entries(merged.messages)) {
    if (JSON.stringify(local?.messages?.[threadId]) === JSON.stringify(msgs)) continue;
    const msgKey = `labcharts-${profileId}-chat-t_${threadId}`;
    await encryptedSetItem(msgKey, JSON.stringify(msgs));
  }
  await encryptedSetItem(threadsKey, JSON.stringify(merged.threads));
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

/** @param {string} profileId @param {any} remoteChatData */
export async function chatDataNeedsRebroadcast(profileId, remoteChatData) {
  if (getEncryptionEnabled() && !isUnlocked()) return false;
  return chatHasLocalChanges(await collectChatData(profileId), remoteChatData);
}
