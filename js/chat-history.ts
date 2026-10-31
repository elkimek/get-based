import { supersedePendingDataProposals } from '../shared/agent-data-contract.js';
import { closeChatHeaderMenu } from './chat-header-view.js';
// chat-history.js - thread-aware chat history persistence and clearing

import { state } from './state.js';
import type { ChatThread } from '../types/chat-data.js';
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
import { nextPersonaMetadataStamp } from './chat-thread-index-storage.js';
import { supersedePendingContextProposals } from '../shared/agent-tool-contract.js';

const blockedChatHistoryKeys = new Set<string>();
const notifiedChatHistoryKeys = new Set<string>();
let historyLoadRevision = 0;
const pendingHistoryWrites = new Map<string, Promise<boolean>>();
const clearingHistoryKeys = new Set<string>();

function clearChatHistoryWriteBlock(key: string) {
  blockedChatHistoryKeys.delete(key);
  notifiedChatHistoryKeys.delete(key);
}

function blockChatHistoryWrites(key: string) {
  blockedChatHistoryKeys.add(key);
}

function notifyChatHistoryBlocked(key: string) {
  if (notifiedChatHistoryKeys.has(key)) return;
  notifiedChatHistoryKeys.add(key);
  showNotification("Can't read this conversation. Saving is paused to protect its messages.", 'error', 7000);
}

export function canSaveChatHistory(threadId = state.currentThreadId) {
  if (!threadId) return false;
  const key = getChatThreadKey(threadId);
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
    const parsed: unknown = JSON.parse(stored);
    if (!Array.isArray(parsed)) throw new Error();
    const history = normalizeChatMessages(parsed);
    if (!isCurrent()) return false;
    state.chatHistory = history;
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

export interface ChatHistorySaveOptions {
  threadId?: typeof state.currentThreadId;
  history?: typeof state.chatHistory;
  current?: () => boolean;
  preservePersonality?: boolean;
}

/** Normal sends and background discussion rounds share serialization and exact-byte rollback. */
export async function saveChatHistory(options: ChatHistorySaveOptions = {}) {
  const threadId = options.threadId === undefined ? state.currentThreadId : options.threadId;
  if (!threadId || !canSaveChatHistory(threadId)) return false;
  const profile = state.currentProfile;
  const history = options.history || state.chatHistory;
  const key = getChatThreadKey(threadId);
  const targetThread = state.chatThreads.find(thread => thread.id === threadId);
  const personaFields = ['personality', 'personalityName', 'personalityIcon', 'personalityUpdatedAt'] as const;
  const hasNoPersona = (thread: ChatThread) => personaFields.every(field => !Object.hasOwn(thread, field));
  const mayInitializePersona = threadId === state.currentThreadId && !!targetThread && hasNoPersona(targetThread);
  const ownsHistory = options.current || (() => threadId === state.currentThreadId && history === state.chatHistory);
  const isCurrent = () => profile === state.currentProfile && ownsHistory();
  if (!isCurrent()) return false;
  invalidateThreadContentCache();
  supersedePendingContextProposals(history);
  supersedePendingDataProposals(history);
  const value = JSON.stringify(history);
  const messageCount = history.length;
  const personality = state.currentChatPersonality;
  const p = options.preservePersonality ? null : getActivePersonality();
  const previous = pendingHistoryWrites.get(key);
  const saving = (async () => {
    let committed = false;
    let bodyWritten = false;
    let previousRaw: string | null = null;
    let writtenRaw: string | null = null;
    let thread: ChatThread | null | undefined = null;
    const previousMetadata: Record<string, unknown> = {};
    const writtenMetadata: Record<string, unknown> = {};
    try {
      if (previous) await previous;
      if (!isCurrent()) return false;
      const previousValue = await encryptedGetItem(key);
      if (!isCurrent()) return false;
      previousRaw = localStorage.getItem(key);
      await encryptedSetItem(key, value);
      bodyWritten = true;
      writtenRaw = localStorage.getItem(key);
      if (!isCurrent()) return false;
      thread = state.chatThreads.find(t => t.id === threadId);
      if (thread) {
        const initializePersona = !!p && mayInitializePersona && thread === targetThread && hasNoPersona(thread);
        const personaStamp = initializePersona ? nextPersonaMetadataStamp(thread) : null;
        const fields = ['updatedAt', 'messagesUpdatedAt', 'messageCount', ...(initializePersona ? personaFields : [])];
        for (const field of fields) previousMetadata[field] = thread[field];
        if (previousValue !== value || thread.messageCount !== messageCount) {
          const bodyTime = Math.max(Date.now(), (Date.parse(String(thread.messagesUpdatedAt || '')) || 0) + 1);
          const previousGeneralTime = Date.parse(String(thread.updatedAt || '')) || 0, personaTime = Date.parse(String(thread.personalityUpdatedAt || '')) || 0;
          const generalTime = Math.max(bodyTime, previousGeneralTime, personaTime);
          const bodyStamp = new Date(bodyTime).toISOString(), generalStamp = generalTime === previousGeneralTime ? thread.updatedAt : generalTime === personaTime ? String(thread.personalityUpdatedAt) : new Date(generalTime).toISOString();
          thread.updatedAt = generalStamp; thread.messagesUpdatedAt = bodyStamp;
        }
        thread.messageCount = messageCount;
        if (initializePersona && p && personaStamp) {
          thread.personality = personality;
          thread.personalityName = p.name;
          thread.personalityIcon = p.icon;
          thread.personalityUpdatedAt = personaStamp;
          if ((Date.parse(thread.updatedAt) || 0) < Date.parse(personaStamp)) thread.updatedAt = personaStamp;
        }
        for (const field of fields) writtenMetadata[field] = thread[field];
        const saved = await saveChatThreadIndex();
        if (!saved) return false;
        committed = true;
        if (!isCurrent()) return false;
        renderThreadList();
      }
      committed = true;
      return true;
    } catch {
      if (isCurrent()) showNotification('Could not save this conversation. Your messages are still available here; try again.', 'error', 6000);
      return false;
    } finally {
      if (!committed && bodyWritten) {
        // Restore exact stored bytes, including encryption, without depending on
        // the currently selected profile/key. The next queued write waits here.
        try {
          if (localStorage.getItem(key) === writtenRaw) {
            const deleted = profile === state.currentProfile && targetThread && !state.chatThreads.some(thread => thread.id === threadId);
            if (previousRaw === null || deleted) localStorage.removeItem(key);
            else localStorage.setItem(key, previousRaw);
          } else throw new Error('Conversation changed during rollback');
        } catch {
          blockChatHistoryWrites(key);
          if (isCurrent()) notifyChatHistoryBlocked(key);
        }
        if (thread) for (const field of Object.keys(writtenMetadata)) {
          if (thread[field] !== writtenMetadata[field]) continue;
          if (previousMetadata[field] === undefined) delete thread[field];
          else thread[field] = previousMetadata[field];
        }
      }
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
      closeChatHeaderMenu();
      return true;
    } finally { clearingHistoryKeys.delete(clearKey); }
  }
  return false;
}
