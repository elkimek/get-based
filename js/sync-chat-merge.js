// @ts-check
// Shared chat conflict rules for inbound pulls, outbound snapshots and repair.
import { mergeCustomPersonalityState } from './chat-personality-merge.js';

const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/** @param {any} value */
function safeId(value) {
  return typeof value === 'string' && value.length > 0 && !UNSAFE_KEYS.has(value);
}

/** @param {any} thread */
export function chatThreadUpdatedAtMs(thread) {
  const ts = Date.parse(thread?.updatedAt || thread?.createdAt || '');
  return Number.isFinite(ts) ? ts : 0;
}

/** @param {any} value @returns {Record<string, number>} */
export function normalizeChatDeletedThreads(value) {
  const out = Object.create(null);
  const entries = Array.isArray(value)
    ? value.map(item => typeof item === 'string' ? [item, Date.now()] : [item?.id, item?.deletedAt])
    : Object.entries(value && typeof value === 'object' ? value : {});
  for (const [id, timestamp] of entries) {
    const ts = Number(timestamp);
    if (safeId(id) && Number.isFinite(ts) && ts > 0) out[id] = Math.max(out[id] || 0, ts);
  }
  return out;
}

/** @param {any} value @returns {any} */
function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, stableValue(value[key])]));
}

/** @param {any} value */
function stableJson(value) { return JSON.stringify(stableValue(value)); }

/** @param {any} a @param {any} b */
function compareStable(a, b) {
  const left = stableJson(a), right = stableJson(b);
  return left > right ? 1 : left < right ? -1 : 0;
}

/** @param {any} thread */
function messagesUpdatedAtMs(thread) {
  const ts = Date.parse(thread?.messagesUpdatedAt || '');
  return Number.isFinite(ts) ? ts : chatThreadUpdatedAtMs(thread);
}

/** @param {any} a @param {any} b */
function compareThreads(a, b) {
  return chatThreadUpdatedAtMs(a) - chatThreadUpdatedAtMs(b)
    || (Number(a?.messageCount) || 0) - (Number(b?.messageCount) || 0)
    || compareStable(a, b);
}

/** @param {any} local @param {any} incoming */
export function mergeChatData(local, incoming) {
  const deletedThreads = normalizeChatDeletedThreads(local?.deletedThreads);
  for (const [id, ts] of Object.entries(normalizeChatDeletedThreads(incoming?.deletedThreads))) {
    deletedThreads[id] = Math.max(deletedThreads[id] || 0, ts);
  }
  /** @type {Map<string, { thread: any, messages: any }[]>} */
  const candidates = new Map();
  for (const data of [local, incoming]) {
    for (const thread of Array.isArray(data?.threads) ? data.threads : []) {
      if (!safeId(thread?.id)) continue;
      const deletedAt = deletedThreads[thread.id] || 0;
      if (deletedAt > 0 && deletedAt >= chatThreadUpdatedAtMs(thread)) continue;
      const items = candidates.get(thread.id) || [];
      items.push({ thread, messages: data?.messages?.[thread.id] });
      candidates.set(thread.id, items);
    }
  }
  const threads = [];
  const messages = Object.create(null);
  for (const [id, items] of candidates) {
    items.sort((a, b) => compareThreads(b.thread, a.thread)
      || compareStable(b.messages, a.messages));
    const winner = items[0];
    let mergedThread = winner.thread;
    // An explicit empty body is authoritative (clear history). Only absent or
    // malformed bodies on nonempty threads can be repaired from an older copy.
    if ((Number(winner.thread.messageCount) || 0) === 0) messages[id] = [];
    else {
      const complete = items.filter(item => Array.isArray(item.messages)).sort((a, b) =>
        messagesUpdatedAtMs(b.thread) - messagesUpdatedAtMs(a.thread)
        || compareThreads(b.thread, a.thread)
        || compareStable(b.messages, a.messages))[0];
      if (complete) {
        messages[id] = complete.messages;
        // A recovered older body must not acquire the newer index's clock;
        // otherwise it could defeat the actual complete copy on a later pull.
        if (messagesUpdatedAtMs(complete.thread) !== messagesUpdatedAtMs(winner.thread)) {
          mergedThread = { ...winner.thread, messagesUpdatedAt: new Date(messagesUpdatedAtMs(complete.thread)).toISOString() };
        }
      }
    }
    threads.push(mergedThread);
  }
  threads.sort((a, b) => chatThreadUpdatedAtMs(b) - chatThreadUpdatedAtMs(a) || String(a.id).localeCompare(String(b.id)));
  const personas = mergeCustomPersonalityState(
    local?.customPersonalities || [], incoming?.customPersonalities || [],
    local?.customPersonalityDeleted, incoming?.customPersonalityDeleted,
  );
  return {
    threads, messages,
    deletedThreads: Object.keys(deletedThreads).length ? deletedThreads : undefined,
    customPersonalities: local?.customPersonalities !== undefined || incoming?.customPersonalities !== undefined ? personas.personalities : undefined,
    customPersonalityDeleted: local?.customPersonalityDeleted !== undefined || incoming?.customPersonalityDeleted !== undefined ? personas.tombstones : undefined,
    activePersonality: incoming?.activePersonality || local?.activePersonality || undefined,
  };
}

/** @param {any} local @param {any} remote */
export function chatHasLocalChanges(local, remote) {
  // Selection is not versioned and can legitimately differ per device. It
  // must not generate a perpetual rebroadcast between otherwise equal chats.
  const snapshot = data => {
    const { activePersonality: _active, ...rest } = data;
    return stableJson(rest);
  };
  return snapshot(mergeChatData(remote, local)) !== snapshot(mergeChatData(remote, null));
}
