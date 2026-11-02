import type { SyncChatData, SyncChatThread } from './sync-chat-merge.js';

// sync-chat-apply.ts - inbound chat sync apply helpers and freshness locks.

import {
  getEncryptionEnabled, isUnlocked, encryptedSetItem, encryptedRemoveItem,
} from './crypto.js';
import { chatDeletedThreadsKey, collectChatData } from './sync-payload-collectors.js';
import { logSyncEvent } from './sync-state.js';
import {
  loadCustomPersonalitiesFromStorage,
  mergeCustomPersonalitiesFromReplica,
} from './chat-personality-storage.js';

import { getChatDataLocalLockRemainingMs } from './sync-chat-local-state.js';
import { withChatThreadIndexLock, readChatThreadIndexForCommand, writeLockedChatThreadIndex } from './chat-thread-index-storage.js';
export { markChatDataLocal, markCustomPersonalityDataLocal, getChatDataLocalLockRemainingMs } from './sync-chat-local-state.js';

function writeLocalDeletedThreads(profileId: string, deletedThreads: Record<string, number>) {
  // Deletion markers cannot expire until all replicas have acknowledged them.
  // Persist before removing bodies so a failed write never reports a deletion
  // as safely applied without retaining the evidence needed by stale peers.
  const key = chatDeletedThreadsKey(profileId);
  if (Object.keys(deletedThreads).length === 0) localStorage.removeItem(key);
  else localStorage.setItem(key, JSON.stringify(deletedThreads));
}

async function applyChatThreadTombstones(profileId: string, existingThreads: readonly SyncChatThread[], deletedThreads: Record<string, number>) {
  const { chatThreadUpdatedAtMs } = await import('./sync-chat-merge.js');
  const keptThreads: SyncChatThread[] = [];
  let changed = false;
  for (const thread of existingThreads) {
    if (!thread || typeof thread.id !== 'string') continue;
    if ((Number(deletedThreads[thread.id]) || 0) > 0
      && deletedThreads[thread.id]! >= chatThreadUpdatedAtMs(thread)) {
      await encryptedRemoveItem(`labcharts-${profileId}-chat-t_${thread.id}`);
      changed = true;
      continue;
    }
    keptThreads.push(thread);
  }
  if (changed) {
    await writeLockedChatThreadIndex(profileId, keptThreads);
  }
  return changed;
}

export async function applyChatData(profileId: string, chatData: unknown) {
  return withChatThreadIndexLock(profileId, () => applyChatDataLocked(profileId, chatData));
}
async function applyChatDataLocked(profileId: string, chatData: unknown) {
  if (!chatData || !Array.isArray((chatData as SyncChatData).threads)) return false;
  if (getEncryptionEnabled() && !isUnlocked()) {
    logSyncEvent('skip', `Chat encryption locked ${profileId.slice(0, 8)}`);
    return false;
  }
  const { mergeChatData } = await import('./sync-chat-merge.js');
  // The thread index is a sensitive key, so writes must use the same encrypted
  // wrapper as normal chat saves.
  let index: Awaited<ReturnType<typeof readChatThreadIndexForCommand>>;
  try { index = await readChatThreadIndexForCommand(profileId); }
  catch { logSyncEvent('skip', `Chat index needs review ${profileId.slice(0, 8)}`); return false; }
  const local = await collectChatData(profileId);
  if (!index.isCurrent()) throw new Error('The conversation index changed during sync collection.');
  const existingThreads = (local?.threads || []) as SyncChatThread[];
  const merged = mergeChatData(local, chatData as SyncChatData);
  const deletedThreads = merged.deletedThreads || {};
  writeLocalDeletedThreads(profileId, deletedThreads);
  const tombstonesChanged = await applyChatThreadTombstones(profileId, existingThreads, deletedThreads);
  const personalitiesChanged = (await mergeCustomPersonalitiesFromReplica(chatData as SyncChatData, profileId)).changed;

  // Reuse the decrypted snapshot. A second read could observe a different
  // generation, and all locally deleted threads must be excluded from the lock.
  const liveIds = new Set(merged.threads.map(thread => thread.id));
  if (getChatDataLocalLockRemainingMs(profileId) > 0
      && existingThreads.some(thread => (Number(thread?.messageCount) || 0) > 0 && liveIds.has(thread.id))) {
    logSyncEvent('skip', `Chat pending ${profileId.slice(0, 8)}`);
    return tombstonesChanged || personalitiesChanged;
  }

  // Store bodies before advancing metadata; an interrupted body write must
  // leave the old metadata available for a subsequent recovery pull.
  for (const [threadId, msgs] of Object.entries(merged.messages)) {
    if (JSON.stringify((local?.messages as Record<string, unknown> | undefined)?.[threadId]) === JSON.stringify(msgs)) continue;
    const msgKey = `labcharts-${profileId}-chat-t_${threadId}`;
    await encryptedSetItem(msgKey, JSON.stringify(msgs));
  }
  await writeLockedChatThreadIndex(profileId, merged.threads);
  if ((chatData as SyncChatData).activePersonality) {
    const customIds = new Set((await loadCustomPersonalitiesFromStorage(profileId)).map(item => item.id));
    const requested = String((chatData as SyncChatData).activePersonality);
    localStorage.setItem(
      `labcharts-${profileId}-chatPersonality`,
      requested.startsWith('custom_') && !customIds.has(requested) ? 'default' : requested,
    );
  }
  return true;
}

export async function chatDataNeedsRebroadcast(profileId: string, remoteChatData: unknown) {
  if (getEncryptionEnabled() && !isUnlocked()) return false;
  const { chatHasLocalChanges } = await import('./sync-chat-merge.js');
  return chatHasLocalChanges(await collectChatData(profileId), remoteChatData as SyncChatData | null | undefined);
}
