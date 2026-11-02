// Native index writes share one cross-tab boundary, including persona metadata.
import { encryptedGetItem, prepareEncryptedLocalStorageValue } from './crypto.js';
import { runNativeCommandWithLocks } from './native-command-locks.js';
export const chatThreadIndexStorageKey = (profile: string) => `labcharts-${profile}-chat-threads`;
export class ChatThreadIndexConflict extends Error { readonly noChangeApplied = true; }
export function nextPersonaMetadataStamp(...records: Record<string, unknown>[]) {
  const time = Math.max(Date.now(), ...records.flatMap(record => [record.updatedAt, record.personalityUpdatedAt].map(value => (Date.parse(String(value || '')) || 0) + 1)));
  if (!Number.isFinite(time) || time > 8.64e15) throw new ChatThreadIndexConflict('The saved conversation timestamp needs native review. Nothing was changed.');
  return new Date(time).toISOString();
}
const queues = new Map<string, Promise<unknown>>();
const publications = new Map<string, { raw: string | null; version: number }>();
const nativeOwners = new Map<string, { threads: readonly unknown[]; raw: string | null }>();
export function markNativeChatThreadIndexLoaded(profile: string, threads: readonly unknown[], raw = localStorage.getItem(chatThreadIndexStorageKey(profile))) {
  if (nativeOwners.size >= 100 && !nativeOwners.has(profile)) nativeOwners.delete(nativeOwners.keys().next().value!);
  nativeOwners.set(profile, { threads, raw });
}
export function ownsNativeChatThreadIndex(profile: string, threads: readonly unknown[]) {
  const owner = nativeOwners.get(profile);
  return !!owner && owner.threads === threads && owner.raw === localStorage.getItem(chatThreadIndexStorageKey(profile));
}
export function noteChatThreadIndexPublication(profile: string, raw: string | null, threads?: readonly unknown[]) {
  const version = (publications.get(profile)?.version || 0) + 1;
  if (publications.size >= 100 && !publications.has(profile)) publications.delete(publications.keys().next().value!);
  publications.set(profile, { raw, version });
  if (threads) markNativeChatThreadIndexLoaded(profile, threads, raw);
}
export async function withChatThreadIndexLock<T>(profile: string, run: () => T | Promise<T>, requireLocks = false): Promise<T> {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(profile)) throw new ChatThreadIndexConflict('Choose a valid conversation profile.');
  const manager = typeof navigator === 'undefined' ? undefined : navigator.locks;
  if (manager?.request) return runNativeCommandWithLocks(manager, [`getbased-chat-index-${profile}`], run);
  if (requireLocks) throw new ChatThreadIndexConflict('Safe persona switching requires Web Locks in this browser.');
  const pending = (queues.get(profile) || Promise.resolve()).catch(() => {}).then(run);
  queues.set(profile, pending);
  try { return await pending; } finally { if (queues.get(profile) === pending) queues.delete(profile); }
}
/** Caller holds the index lock. Never normalize away unknown conversation data. */
export async function readChatThreadIndexForCommand(profile: string) {
  const key = chatThreadIndexStorageKey(profile), protection = await prepareEncryptedLocalStorageValue(key, '');
  const raw = localStorage.getItem(key), text = await encryptedGetItem(key, { throwOnDecryptError: true });
  if (!protection.isCurrent() || localStorage.getItem(key) !== raw) throw new ChatThreadIndexConflict('Conversation storage changed while reading it.');
  const records: unknown = text === null ? [] : JSON.parse(text);
  const ids = new Set<string>();
  if (!Array.isArray(records) || records.some(record => {
    if (!record || typeof record !== 'object' || Array.isArray(record) || typeof record.id !== 'string' || !record.id || ids.has(record.id)) return true;
    ids.add(record.id); return false;
  })) throw new ChatThreadIndexConflict('The conversation index needs native review. Nothing was replaced.');
  return { key, raw, records: records as Array<Record<string, unknown>>, isCurrent: () => protection.isCurrent() && localStorage.getItem(key) === raw };
}
/** Sync/import hold the same lock but cannot grant a stale native view ownership. */
export async function writeLockedChatThreadIndex(profile: string, records: readonly unknown[]) {
  const key = chatThreadIndexStorageKey(profile), before = localStorage.getItem(key);
  const prepared = await prepareEncryptedLocalStorageValue(key, JSON.stringify(records));
  if (!prepared.isCurrent() || localStorage.getItem(key) !== before) throw new ChatThreadIndexConflict('Conversation storage changed before publication.');
  try {
    localStorage.setItem(key, prepared.value);
    if (localStorage.getItem(key) !== prepared.value) throw new Error('Conversation publication was not confirmed.');
  } catch (cause) {
    try {
      const raw = localStorage.getItem(key);
      if (raw !== before && raw !== prepared.value) throw new Error('Newer conversation index');
      if (raw !== before) { if (before === null) localStorage.removeItem(key); else localStorage.setItem(key, before); }
      if (localStorage.getItem(key) !== before) throw new Error('Unconfirmed compensation');
    } catch { throw new Error('The conversation index outcome needs native review.', { cause }); }
    throw new ChatThreadIndexConflict('The conversation index was not changed by this failed publication.');
  }
}
/** Preserve current native edits queued behind another write from this owner. */
export async function saveNativeChatThreadIndex(profile: string, threads: readonly unknown[], current: () => boolean) {
  const key = chatThreadIndexStorageKey(profile), observed = localStorage.getItem(key), version = publications.get(profile)?.version;
  return withChatThreadIndexLock(profile, async () => {
    const before = localStorage.getItem(key), publication = publications.get(profile);
    const owner = nativeOwners.get(profile);
    if (!current()) throw new ChatThreadIndexConflict('The originating conversation view changed before saving. Nothing was written.');
    if (owner && owner.raw !== before) throw new ChatThreadIndexConflict('Conversation storage changed outside this view. Reload it before saving.');
    if (before !== observed && !(publication && publication.version !== version && publication.raw === before)) throw new ChatThreadIndexConflict('Another conversation writer replaced this save baseline. Reload before saving.');
    for (let attempt = 0; attempt < 3; attempt++) {
      const text = JSON.stringify(threads), prepared = await prepareEncryptedLocalStorageValue(key, text);
      if (!current() || !prepared.isCurrent() || localStorage.getItem(key) !== before) throw new ChatThreadIndexConflict('The conversation save expired. Nothing was changed.');
      if (JSON.stringify(threads) !== text) continue;
      try {
        localStorage.setItem(key, prepared.value);
        if (localStorage.getItem(key) !== prepared.value) throw new Error('The conversation index save was not confirmed.');
      } catch (cause) {
        try {
          const raw = localStorage.getItem(key);
          if (raw !== before && raw !== prepared.value) throw new Error('A newer conversation index owns the key.');
          if (raw !== before) { if (before === null) localStorage.removeItem(key); else localStorage.setItem(key, before); }
          if (localStorage.getItem(key) !== before) throw new Error('Conversation rollback was not confirmed.');
        } catch { throw new Error('The conversation index outcome is unconfirmed. Reopen the native chat before trying again.', { cause }); }
        throw new ChatThreadIndexConflict('The conversation index could not be saved. Its original stored bytes were retained.');
      }
      noteChatThreadIndexPublication(profile, prepared.value, threads); return true;
    }
    throw new ChatThreadIndexConflict('Conversations kept changing during this save. Try again after the current action finishes.');
  });
}
