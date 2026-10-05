// backup-chat-storage.js - collect raw chat envelopes for full backup snapshots.

export interface RawChatBackup {
  profileId: string;
  keys: Record<string, string>;
}
export interface RawChatBackupDependencies {
  encryptedGetItem(key: string): Promise<string | null>;
  readRawStoredItem(key: string): Promise<string | null>;
}

export async function collectRawChatBackup(profileBackup: RawChatBackup, deps: RawChatBackupDependencies): Promise<void> {
  const { profileId, keys } = profileBackup;
  const indexKey = `labcharts-${profileId}-chat-threads`;
  const messagePrefix = `labcharts-${profileId}-chat-t_`;
  const rawIndex = await deps.readRawStoredItem(indexKey);
  const readableIndex = await deps.encryptedGetItem(indexKey);
  if (rawIndex !== null) keys['chat-threads'] = rawIndex;

  // Message records currently live in localStorage. Enumerate by their
  // profile-scoped prefix as well as the index so an encrypted/locked or
  // partially recovered index cannot make a full backup omit ciphertext.
  for (let i = 0; i < localStorage.length; i++) {
    const storageKey = localStorage.key(i);
    if (!storageKey?.startsWith(messagePrefix)) continue;
    const rawMessages = localStorage.getItem(storageKey);
    if (rawMessages !== null) keys[storageKey.slice(`labcharts-${profileId}-`.length)] = rawMessages;
  }
  if (!readableIndex) return;

  let threads: unknown;
  try { threads = JSON.parse(readableIndex); } catch { return; }
  if (!Array.isArray(threads)) return;
  for (const thread of threads as Array<{ id?: unknown } | null>) {
    if (!thread || typeof thread.id !== 'string') continue;
    const messageKey = `labcharts-${profileId}-chat-t_${thread.id}`;
    const rawMessages = await deps.readRawStoredItem(messageKey);
    if (rawMessages !== null) keys[`chat-t_${thread.id}`] = rawMessages;
  }
}
