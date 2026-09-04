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
  if (!blockedChatHistoryKeys.has(key)) return true;
  notifyChatHistoryBlocked(key);
  return false;
}

export function getChatStorageKey() {
  return `labcharts-${state.currentProfile}-chat`;
}

export async function loadChatHistory() {
  if (!state.currentThreadId) {
    state.chatHistory = [];
    renderChatMessagesRuntime();
    return true;
  }
  const key = getChatThreadKey(state.currentThreadId);
  const storedRaw = localStorage.getItem(key);
  if (storedRaw === null) {
    clearChatHistoryWriteBlock(key);
    state.chatHistory = [];
    renderChatMessagesRuntime();
    return true;
  }
  try {
    const stored = await encryptedGetItem(key);
    if (stored === null) throw new Error();
    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed)) throw new Error();
    state.chatHistory = normalizeChatMessages(parsed);
    clearChatHistoryWriteBlock(key);
  } catch {
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
  const value = JSON.stringify(state.chatHistory);
  await encryptedSetItem(key, value);
  const thread = state.chatThreads.find(t => t.id === state.currentThreadId);
  if (thread) {
    if (thread.messageCount !== state.chatHistory.length) thread.updatedAt = new Date().toISOString();
    thread.messageCount = state.chatHistory.length;
    thread.personality = state.currentChatPersonality;
    const p = getActivePersonality();
    thread.personalityName = p.name;
    thread.personalityIcon = p.icon;
    await saveChatThreadIndex();
    renderThreadList();
  }
  return true;
}

export async function clearChatHistory() {
  if (await showConfirmDialog("Clear all messages in this conversation? This can't be undone.")) {
    const previousHistory = state.chatHistory;
    if (state.currentThreadId) {
      const key = getChatThreadKey(state.currentThreadId);
      const thread = state.chatThreads.find(t => t.id === state.currentThreadId);
      if (thread) {
        const previousThread = { ...thread };
        state.chatHistory = [];
        thread.messageCount = 0;
        thread.updatedAt = new Date().toISOString();
        delete thread.summary;
        delete thread.summaryDate;
        delete thread.summaryModel;
        delete thread.summaryCost;
        delete thread.summaryAttribution;
        if (!await saveChatThreadIndex()) {
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
  }
  return false;
}
