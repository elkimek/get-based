// chat-draft-storage.js — encrypted, device-local composer draft persistence.

import { encryptedGetItem, encryptedRemoveItem, encryptedSetItem } from './crypto.js';

const WRITE_DELAY_MS = 300;
const draftCache = new Map<string, string>();
const knownDrafts = new Set<string>();
const writeTimers = new Map<string, ReturnType<typeof globalThis.setTimeout>>();
const writeChains = new Map<string, Promise<void>>();

export function chatDraftStorageKey(profileId: string, threadId: string) {
  return `labcharts-${profileId}-chatDraft_${threadId}`;
}

function enqueueWrite(key: string, operation: () => Promise<void>) {
  const previous = writeChains.get(key) || Promise.resolve();
  const next = previous.catch(() => {}).then(operation).catch((error) => {
    console.warn('[chat-draft] Could not persist draft:', error);
  });
  writeChains.set(key, next);
  void next.finally(() => {
    if (writeChains.get(key) === next) writeChains.delete(key);
  });
  return next;
}

function queueCachedValue(key: string) {
  const value = draftCache.get(key) || '';
  return enqueueWrite(key, () => value
    ? encryptedSetItem(key, value)
    : encryptedRemoveItem(key));
}

function cancelScheduledWrite(key: string) {
  const timer = writeTimers.get(key);
  if (timer !== undefined) globalThis.clearTimeout(timer);
  writeTimers.delete(key);
}

export function getCachedChatDraft(profileId: string, threadId: string) {
  const key = chatDraftStorageKey(profileId, threadId);
  return knownDrafts.has(key) ? draftCache.get(key) || '' : undefined;
}

export async function loadChatDraft(profileId: string, threadId: string) {
  const key = chatDraftStorageKey(profileId, threadId);
  const cached = getCachedChatDraft(profileId, threadId);
  if (cached !== undefined) return cached;
  const stored = await encryptedGetItem(key);
  // An edit made while decryption was in flight always wins.
  if (knownDrafts.has(key)) return draftCache.get(key) || '';
  const value = stored || '';
  knownDrafts.add(key);
  if (value) draftCache.set(key, value);
  return value;
}

export function rememberChatDraft(profileId: string, threadId: string, value: string) {
  const key = chatDraftStorageKey(profileId, threadId);
  knownDrafts.add(key);
  if (value) draftCache.set(key, value);
  else draftCache.delete(key);
  cancelScheduledWrite(key);
  writeTimers.set(key, globalThis.setTimeout(() => {
    writeTimers.delete(key);
    void queueCachedValue(key);
  }, WRITE_DELAY_MS));
  return value;
}

export function clearStoredChatDraft(profileId: string, threadId: string) {
  const key = chatDraftStorageKey(profileId, threadId);
  knownDrafts.add(key);
  draftCache.delete(key);
  cancelScheduledWrite(key);
  // The ordered chain prevents an already-running save from resurrecting it.
  return enqueueWrite(key, () => encryptedRemoveItem(key));
}

/** Flush a debounced write. Primarily useful before lifecycle boundaries and in tests. */
export function flushStoredChatDraft(profileId: string, threadId: string) {
  const key = chatDraftStorageKey(profileId, threadId);
  cancelScheduledWrite(key);
  return queueCachedValue(key);
}
