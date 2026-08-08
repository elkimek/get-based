// @ts-check
// chat-discussion-round-state.js - thread-bound discussion round persistence

import { state } from './state.js';
import {
  getChatThreadKey, invalidateThreadContentCache, renderThreadList,
  saveChatThreadIndex,
} from './chat-threads.js';
import { encryptedSetItem } from './crypto.js';
import { saveChatHistory } from './chat-history.js';

export function isRoundThreadActive(threadId) {
  return !threadId || state.currentThreadId === threadId;
}

function getThreadById(threadId) {
  return state.chatThreads.find(t => t.id === threadId) || null;
}

export function persistDiscussionThreadState(threadId, personas, originalPersonality) {
  const thread = getThreadById(threadId);
  if (!thread) return;
  thread.discussionPersonas = personas;
  thread.discussionOriginalPersonality = originalPersonality;
  delete thread.discussionEnded;
  saveChatThreadIndex();
}

export function persistDiscussionPendingPersonas(threadId, personas) {
  const thread = getThreadById(threadId);
  if (!thread) return;
  if (Array.isArray(personas) && personas.length) thread.discussionPendingPersonas = personas;
  else delete thread.discussionPendingPersonas;
  saveChatThreadIndex();
}

/** @param {string | null | undefined} threadId @param {any[]} messages @param {(options?: { preserveScroll?: boolean }) => void} [renderMessages] */
export function renderRoundMessages(threadId, messages, renderMessages = () => {}) {
  if (!isRoundThreadActive(threadId)) return;
  state.chatHistory = messages;
  renderMessages({ preserveScroll: true });
}

export async function saveRoundChatHistory(threadId, messages) {
  if (!threadId) return;
  if (isRoundThreadActive(threadId)) {
    state.chatHistory = messages;
    await saveChatHistory();
    return;
  }

  invalidateThreadContentCache();
  const value = JSON.stringify(messages);
  const key = getChatThreadKey(threadId);
  await encryptedSetItem(key, value);

  const thread = getThreadById(threadId);
  if (thread) {
    if (thread.messageCount !== messages.length) thread.updatedAt = new Date().toISOString();
    thread.messageCount = messages.length;
    await saveChatThreadIndex();
    renderThreadList();
  }
}
