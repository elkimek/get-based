// chat-discussion-round-state.js - thread-bound discussion round persistence

import { state } from './state.js';
import {
  getChatThreadKey, invalidateThreadContentCache, renderThreadList,
  saveChatThreadIndex,
} from './chat-threads.js';
import { encryptedGetItem, encryptedSetItem } from './crypto.js';
import { saveChatHistory } from './chat-history.js';

export function isRoundThreadActive(threadId?: unknown) {
  return !threadId || state.currentThreadId === threadId;
}

function getThreadById(threadId: unknown) {
  return state.chatThreads.find(t => t.id === threadId) || null;
}

export function persistDiscussionThreadState(threadId: unknown, personas: unknown, originalPersonality: unknown) {
  const thread = getThreadById(threadId);
  if (!thread) return;
  (thread as { discussionPersonas: unknown }).discussionPersonas = personas;
  (thread as { discussionOriginalPersonality: unknown }).discussionOriginalPersonality = originalPersonality;
  delete thread.discussionEnded;
  saveChatThreadIndex();
}

export function persistDiscussionPendingPersonas(threadId: unknown, personas: unknown) {
  const thread = getThreadById(threadId);
  if (!thread) return;
  if (Array.isArray(personas) && personas.length) (thread as { discussionPendingPersonas: unknown[] }).discussionPendingPersonas = personas;
  else delete thread.discussionPendingPersonas;
  saveChatThreadIndex();
}

export function renderRoundMessages(threadId: unknown, messages: unknown[], renderMessages: (options?: { preserveScroll?: boolean }) => unknown = () => {}) {
  if (!isRoundThreadActive(threadId)) return;
  (state as { chatHistory: unknown[] }).chatHistory = messages;
  renderMessages({ preserveScroll: true });
}

export async function saveRoundChatHistory(threadId: unknown, messages: unknown[]) {
  if (!threadId) return;
  if (isRoundThreadActive(threadId)) {
    (state as { chatHistory: unknown[] }).chatHistory = messages;
    await saveChatHistory();
    return;
  }

  invalidateThreadContentCache();
  const value = JSON.stringify(messages);
  const key = getChatThreadKey(threadId);
  const previousValue = await encryptedGetItem(key);
  await encryptedSetItem(key, value);
  if (key !== getChatThreadKey(threadId)) return;

  const thread = getThreadById(threadId);
  if (thread) {
    if (previousValue !== value || thread.messageCount !== messages.length) {
      thread.updatedAt = new Date().toISOString();
      thread.messagesUpdatedAt = thread.updatedAt;
    }
    thread.messageCount = messages.length;
    await saveChatThreadIndex();
    renderThreadList();
  }
}
