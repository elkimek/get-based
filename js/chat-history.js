// @ts-check
// chat-history.js - thread-aware chat history persistence and clearing

import { state } from './state.js';
import { encryptedSetItem, encryptedGetItem } from './crypto.js';
import { saveImportedData } from './data.js';
import { deleteImportedArrayItems } from './data-merge.js';
import { showConfirmDialog, showNotification } from './utils.js';
import {
  getChatThreadKey, invalidateThreadContentCache,
  renderThreadList, saveChatThreadIndex,
} from './chat-threads.js';
import { renderSavedSummaries } from './chat-summaries.js';
import { getActivePersonality, updateChatHeaderTitle } from './chat-personalities.js';
import { renderChatMessagesRuntime, updateDiscussButtonRuntime } from './chat-runtime.js';
import { normalizeChatMessages } from './chat-storage-safety.js';

const blockedChatHistoryKeys = new Set();
const notifiedChatHistoryKeys = new Set();
let historyLoadRevision = 0;
/** @type {Map<string, Promise<boolean>>} */
const pendingHistoryWrites = new Map();
const clearingHistoryKeys = new Set();

function clearChatHistoryWriteBlock(key) {
  blockedChatHistoryKeys.delete(key);
  notifiedChatHistoryKeys.delete(key);
}

function blockChatHistoryWrites(key) {
  blockedChatHistoryKeys.add(key);
}

function notifyChatHistoryBlocked(key) {
  if (notifiedChatHistoryKeys.has(key)) return;
  notifiedChatHistoryKeys.add(key);
  showNotification("Can't read this conversation. Saving is paused to protect its messages.", 'error', 7000);
}

export function canSaveChatHistory() {
  if (!state.currentThreadId) return false;
  const key = getChatThreadKey(state.currentThreadId);
  if (clearingHistoryKeys.has(key)) return false;
  if (!blockedChatHistoryKeys.has(key)) return true;
  notifyChatHistoryBlocked(key);
  return false;
}

export function getChatStorageKey() {
  return `labcharts-${state.currentProfile}-chat`;
}

export async function loadChatHistory() {
  const revision = ++historyLoadRevision;
  const profile = state.currentProfile;
  const threadId = state.currentThreadId;
  const isCurrent = () => revision === historyLoadRevision && profile === state.currentProfile && threadId === state.currentThreadId;
  if (!state.currentThreadId) {
    state.chatHistory = [];
    renderChatMessagesRuntime();
    return true;
  }
  const key = getChatThreadKey(state.currentThreadId);
  try {
    const storedRaw = localStorage.getItem(key);
    if (storedRaw === null) {
      const thread = state.chatThreads.find(item => item.id === threadId);
      if ((Number(thread?.messageCount) || 0) > 0) {
        blockChatHistoryWrites(key);
        notifyChatHistoryBlocked(key);
        state.chatHistory = [];
        renderChatMessagesRuntime();
        return false;
      }
      clearChatHistoryWriteBlock(key);
      state.chatHistory = [];
      renderChatMessagesRuntime();
      return true;
    }
    const stored = await encryptedGetItem(key);
    if (!isCurrent()) return false;
    if (stored === null) throw new Error();
    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed)) throw new Error();
    state.chatHistory = normalizeChatMessages(parsed);
    clearChatHistoryWriteBlock(key);
  } catch {
    if (!isCurrent()) return false;
    blockChatHistoryWrites(key);
    notifyChatHistoryBlocked(key);
    state.chatHistory = [];
    renderChatMessagesRuntime();
    return false;
  }
  renderChatMessagesRuntime();
  return true;
}

export async function saveChatHistory() {
  if (!state.currentThreadId) return false;
  if (!canSaveChatHistory()) return false;
  invalidateThreadContentCache();
  const key = getChatThreadKey(state.currentThreadId);
  const history = state.chatHistory;
  const value = JSON.stringify(history);
  const messageCount = history.length;
  const personality = state.currentChatPersonality;
  const p = getActivePersonality();
  const isCurrent = () => key === getChatThreadKey(state.currentThreadId) && history === state.chatHistory;
  const previous = pendingHistoryWrites.get(key);
  const saving = (async () => {
    try {
      if (previous) await previous;
      if (!isCurrent()) return false;
      const previousValue = await encryptedGetItem(key);
      if (!isCurrent()) return false;
      await encryptedSetItem(key, value);
      if (!isCurrent()) return false;
      const thread = state.chatThreads.find(t => t.id === state.currentThreadId);
      if (thread) {
        if (previousValue !== value || thread.messageCount !== messageCount) {
          thread.updatedAt = new Date().toISOString();
          thread.messagesUpdatedAt = thread.updatedAt;
        }
        thread.messageCount = messageCount;
        thread.personality = personality;
        thread.personalityName = p.name;
        thread.personalityIcon = p.icon;
        const saved = await saveChatThreadIndex();
        if (!saved || !isCurrent()) return false;
        renderThreadList();
      }
      return true;
    } catch {
      if (isCurrent()) showNotification('Could not save this conversation. Your messages are still available here; try again.', 'error', 6000);
      return false;
    }
  })();
  pendingHistoryWrites.set(key, saving);
  try { return await saving; }
  finally { if (pendingHistoryWrites.get(key) === saving) pendingHistoryWrites.delete(key); }
}

export async function clearChatHistory() {
  const profile = state.currentProfile;
  const threadId = state.currentThreadId;
  const isCurrent = () => profile === state.currentProfile && threadId === state.currentThreadId;
  if (await showConfirmDialog("Clear all messages in this conversation? This can't be undone.")) {
    if (!isCurrent()) return false;
    const clearKey = getChatThreadKey(threadId);
    if (clearingHistoryKeys.has(clearKey)) return false;
    clearingHistoryKeys.add(clearKey);
    try {
      const pending = pendingHistoryWrites.get(clearKey);
      if (pending) await pending;
      if (!isCurrent()) return false;
      const previousHistory = state.chatHistory;
      if (state.currentThreadId) {
        const key = getChatThreadKey(state.currentThreadId);
        const thread = state.chatThreads.find(t => t.id === state.currentThreadId);
        if (thread) {
          const previousThread = { ...thread };
          state.chatHistory = [];
          thread.messageCount = 0;
          thread.updatedAt = new Date().toISOString();
          thread.messagesUpdatedAt = thread.updatedAt;
          delete thread.summary;
          delete thread.summaryDate;
          delete thread.summaryModel;
          delete thread.summaryCost;
          delete thread.summaryAttribution;
          let saved = false;
          try { saved = Boolean(await saveChatThreadIndex()); } catch {}
          if (!isCurrent()) return false;
          if (!saved) {
            Object.keys(thread).forEach(field => delete thread[field]);
            Object.assign(thread, previousThread);
            state.chatHistory = previousHistory;
            renderChatMessagesRuntime();
            renderThreadList();
            return false;
          }
          localStorage.removeItem(key);
          clearChatHistoryWriteBlock(key);
          renderThreadList();
          if (state.importedData.chatSummaries) {
            deleteImportedArrayItems(state.importedData, 'chatSummaries', s => s.threadId === state.currentThreadId);
            saveImportedData();
          }
          renderSavedSummaries();
        } else {
          state.chatHistory = [];
          localStorage.removeItem(key);
          clearChatHistoryWriteBlock(key);
        }
      } else {
        state.chatHistory = [];
      }
      renderChatMessagesRuntime();
      updateChatHeaderTitle();
      updateDiscussButtonRuntime();
      showNotification('Chat history cleared', 'info');
      document.querySelector('.chat-more-menu')?.removeAttribute('open');
      return true;
    } finally { clearingHistoryKeys.delete(clearKey); }
  }
  return false;
}
