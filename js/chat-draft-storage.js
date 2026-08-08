// @ts-check
// chat-draft-storage.js — encrypted, device-local composer draft persistence.

import { encryptedGetItem, encryptedRemoveItem, encryptedSetItem } from './crypto.js';

const WRITE_DELAY_MS = 300;
/** @type {Map<string, string>} */
const draftCache = new Map();
/** @type {Set<string>} */
const knownDrafts = new Set();
/** @type {Map<string, number>} */
const writeTimers = new Map();
/** @type {Map<string, Promise<void>>} */
const writeChains = new Map();

/** @param {string} profileId @param {string} threadId */
export function chatDraftStorageKey(profileId, threadId) {
  return `labcharts-${profileId}-chatDraft_${threadId}`;
}

/** @param {string} key @param {() => Promise<void>} operation */
function enqueueWrite(key, operation) {
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

/** @param {string} key */
function queueCachedValue(key) {
  const value = draftCache.get(key) || '';
  return enqueueWrite(key, () => value
    ? encryptedSetItem(key, value)
    : encryptedRemoveItem(key));
}

/** @param {string} key */
function cancelScheduledWrite(key) {
  const timer = writeTimers.get(key);
  if (timer !== undefined) globalThis.clearTimeout(timer);
  writeTimers.delete(key);
}

/** @param {string} profileId @param {string} threadId */
export function getCachedChatDraft(profileId, threadId) {
  const key = chatDraftStorageKey(profileId, threadId);
  return knownDrafts.has(key) ? draftCache.get(key) || '' : undefined;
}

/** @param {string} profileId @param {string} threadId */
export async function loadChatDraft(profileId, threadId) {
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

/** @param {string} profileId @param {string} threadId @param {string} value */
export function rememberChatDraft(profileId, threadId, value) {
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

/** @param {string} profileId @param {string} threadId */
export function clearStoredChatDraft(profileId, threadId) {
  const key = chatDraftStorageKey(profileId, threadId);
  knownDrafts.add(key);
  draftCache.delete(key);
  cancelScheduledWrite(key);
  // The ordered chain prevents an already-running save from resurrecting it.
  return enqueueWrite(key, () => encryptedRemoveItem(key));
}

/** Flush a debounced write. Primarily useful before lifecycle boundaries and in tests. */
export function flushStoredChatDraft(profileId, threadId) {
  const key = chatDraftStorageKey(profileId, threadId);
  cancelScheduledWrite(key);
  return queueCachedValue(key);
}
