// chat-history.js - thread-aware chat history persistence and clearing

import { state } from './state.js';
import { encryptedSetItem, encryptedGetItem, getEncryptionEnabled } from './crypto.js';
import { saveImportedData } from './data.js';
import { showConfirmDialog, showNotification } from './utils.js';
import {
  getChatThreadKey, invalidateThreadContentCache,
  renderThreadList, saveChatThreadIndex,
} from './chat-threads.js';
import { renderSavedSummaries } from './chat-summaries.js';
import { getActivePersonality, updateChatHeaderTitle } from './chat-personalities.js';

export function getChatStorageKey() {
  return `labcharts-${state.currentProfile}-chat`;
}

export async function loadChatHistory() {
  if (!state.currentThreadId) {
    state.chatHistory = [];
    window.renderChatMessages?.();
    return;
  }
  try {
    const key = getChatThreadKey(state.currentThreadId);
    const stored = await encryptedGetItem(key);
    state.chatHistory = stored ? JSON.parse(stored) : [];
  } catch { state.chatHistory = []; }
  window.renderChatMessages?.();
}

export async function saveChatHistory() {
  if (!state.currentThreadId) return;
  invalidateThreadContentCache();
  const key = getChatThreadKey(state.currentThreadId);
  const value = JSON.stringify(state.chatHistory);
  if (getEncryptionEnabled()) {
    await encryptedSetItem(key, value);
  } else {
    localStorage.setItem(key, value);
  }
  const thread = state.chatThreads.find(t => t.id === state.currentThreadId);
  if (thread) {
    if (thread.messageCount !== state.chatHistory.length) thread.updatedAt = new Date().toISOString();
    thread.messageCount = state.chatHistory.length;
    thread.personality = state.currentChatPersonality;
    const p = getActivePersonality();
    thread.personalityName = p.name;
    thread.personalityIcon = p.icon;
    saveChatThreadIndex();
    renderThreadList();
  }
}

export async function clearChatHistory() {
  if (await showConfirmDialog("Clear all messages in this conversation? This can't be undone.")) {
    state.chatHistory = [];
    if (state.currentThreadId) {
      localStorage.removeItem(getChatThreadKey(state.currentThreadId));
      const thread = state.chatThreads.find(t => t.id === state.currentThreadId);
      if (thread) {
        thread.messageCount = 0;
        thread.updatedAt = new Date().toISOString();
        delete thread.summary;
        delete thread.summaryDate;
        delete thread.summaryModel;
        delete thread.summaryCost;
        saveChatThreadIndex();
        renderThreadList();
        if (state.importedData.chatSummaries) {
          state.importedData.chatSummaries = state.importedData.chatSummaries.filter(s => s.threadId !== state.currentThreadId);
          saveImportedData();
        }
        renderSavedSummaries();
      }
    }
    window.renderChatMessages?.();
    updateChatHeaderTitle();
    window.updateDiscussButton?.();
    showNotification('Chat history cleared', 'info');
  }
}
