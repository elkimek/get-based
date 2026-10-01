export interface SyncChatThread extends Record<string, unknown> {
  id: string;
  updatedAt?: unknown;
  createdAt?: unknown;
  messagesUpdatedAt?: unknown;
  messageCount?: unknown;
}
export interface SyncChatData {
  threads?: unknown;
  messages?: unknown;
  deletedThreads?: unknown;
  customPersonalities?: unknown;
  customPersonalityDeleted?: unknown;
  activePersonality?: unknown;
}

// Shared chat conflict rules for inbound pulls, outbound snapshots and repair.
import { mergeCustomPersonalityState } from './chat-personality-merge.js';

const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function safeId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && !UNSAFE_KEYS.has(value);
}

export function chatThreadUpdatedAtMs(thread: SyncChatThread | null | undefined) {
  const ts = Date.parse((thread?.updatedAt || thread?.createdAt || '') as string);
  return Number.isFinite(ts) ? ts : 0;
}

export function normalizeChatDeletedThreads(value: unknown): Record<string, number> {
  const out: Record<string, number> = Object.create(null);
  const entries = Array.isArray(value)
    ? value.map(item => typeof item === 'string' ? [item, Date.now()] : [(item as { id?: unknown } | null | undefined)?.id, (item as { deletedAt?: unknown } | null | undefined)?.deletedAt])
    : Object.entries(value && typeof value === 'object' ? value : {});
  for (const [id, timestamp] of entries) {
    const ts = Number(timestamp);
    if (safeId(id) && Number.isFinite(ts) && ts > 0) out[id] = Math.max(out[id] || 0, ts);
  }
  return out;
}

function stableJson(value: unknown) {
  return JSON.stringify(value, (_key: string, item: unknown) => item && typeof item === 'object' && !Array.isArray(item)
    ? Object.fromEntries(Object.keys(item).sort().map(key => [key, (item as Record<string, unknown>)[key]])) : item);
}

function compareStable(a: unknown, b: unknown) {
  const left = stableJson(a), right = stableJson(b);
  return left! > right! ? 1 : left! < right! ? -1 : 0;
}

function messagesUpdatedAtMs(thread: SyncChatThread | null | undefined) {
  const ts = Date.parse((thread?.messagesUpdatedAt || '') as string);
  return Number.isFinite(ts) ? ts : chatThreadUpdatedAtMs(thread);
}

function compareThreads(a: SyncChatThread | null | undefined, b: SyncChatThread | null | undefined) {
  return chatThreadUpdatedAtMs(a) - chatThreadUpdatedAtMs(b)
    || (Number(a?.messageCount) || 0) - (Number(b?.messageCount) || 0)
    || compareStable(a, b);
}

export function mergeChatData(local: SyncChatData | null | undefined, incoming: SyncChatData | null | undefined) {
  const deletedThreads = normalizeChatDeletedThreads(local?.deletedThreads);
  for (const [id, ts] of Object.entries(normalizeChatDeletedThreads(incoming?.deletedThreads))) {
    deletedThreads[id] = Math.max(deletedThreads[id] || 0, ts);
  }
  const candidates = new Map<string, Array<{ thread: SyncChatThread; messages: unknown }>>();
  for (const data of [local, incoming]) {
    for (const thread of Array.isArray(data?.threads) ? data.threads as SyncChatThread[] : []) {
      if (!safeId(thread?.id)) continue;
      const deletedAt = deletedThreads[thread.id] || 0;
      if (deletedAt > 0 && deletedAt >= chatThreadUpdatedAtMs(thread)) continue;
      const items = candidates.get(thread.id) || [];
      items.push({ thread, messages: (Number(thread.messageCount) || 0) === 0 && thread.messagesUpdatedAt ? [] : (data?.messages as Record<string, unknown> | null | undefined)?.[thread.id] });
      candidates.set(thread.id, items);
    }
  }
  const threads: SyncChatThread[] = [];
  const messages: Record<string, unknown[]> = Object.create(null);
  for (const [id, items] of candidates) {
    items.sort((a, b) => compareThreads(b.thread, a.thread));
    const winner = items[0]!;
    let mergedThread = winner.thread;
    // Message clocks are independent of metadata: renaming an old copy must
    // not undo a later clear or hide a later message edit on another device.
    const complete = items.filter((item): item is typeof item & { messages: unknown[] } => Array.isArray(item.messages)).sort((a, b) =>
      messagesUpdatedAtMs(b.thread) - messagesUpdatedAtMs(a.thread)
      || compareThreads(b.thread, a.thread)
      || compareStable(b.messages, a.messages))[0];
    if (complete) {
      messages[id] = complete.messages;
      // A recovered older body must retain its original clock so an actual
      // complete newer copy can replace it on a subsequent pull.
      if (messagesUpdatedAtMs(complete.thread) !== messagesUpdatedAtMs(winner.thread)) {
        mergedThread = { ...winner.thread,
          messagesUpdatedAt: new Date(messagesUpdatedAtMs(complete.thread)).toISOString(),
          messageCount: complete.messages.length };
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

export function chatHasLocalChanges(local: SyncChatData | null | undefined, remote: SyncChatData | null | undefined) {
  // Selection is not versioned and can legitimately differ per device. It
  // must not generate a perpetual rebroadcast between otherwise equal chats.
  const snapshot = (data: ReturnType<typeof mergeChatData>) => {
    const { activePersonality: _active, ...rest } = data;
    return stableJson(rest);
  };
  return snapshot(mergeChatData(remote, local)) !== snapshot(mergeChatData(remote, null));
}
