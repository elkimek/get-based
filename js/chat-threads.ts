import { requestChatLayoutSync } from './chat-layout-view.js';
import { closePersonalityPickerView } from './chat-personality-picker-view.js';
// chat-threads.js — Conversation-thread management for the chat panel
import { state } from './state.js';
import type { ChatThread } from '../types/chat-data.js';
import type { ChatThreadDependencyMethods, ChatThreadDependencyRegistry } from '../types/chat-threads.js';
import { showNotification, showConfirmDialog, showPromptDialog } from './utils.js';
import { saveImportedData } from './data.js';
import { deleteImportedArrayItems } from './data-merge.js';
import { onChatSaved } from './sync.js';
import { chatDeletedThreadsKey } from './sync-payload-collectors.js';
import { renderChatThreadList, configureThreadNavigationActions } from './chat-thread-list-view.js';
import { encryptedGetItem, encryptedSetItem } from './crypto.js';
import {
  configureChatThreadProjects, configureChatThreadSearch, createThreadProject,
  deleteThreadProject, deleteThreadProjectPrompt, filterThreadList,
  invalidateThreadContentCache, jumpToSearchResult, moveThreadToProject,
  renameThreadProject, renameThreadProjectPrompt, toggleThreadPinned, markThreadMetadataChanged,
} from './chat-thread-search.js';
import { normalizeChatMessages, normalizeChatThreads } from './chat-storage-safety.js';
import { createUniqueId } from './unique-id.js';
import {
  clearChatDraft, restoreChatDraft, saveChatDraft,
} from './chat-composer.js';
import { syncChatLayout } from './chat-layout.js';
export { filterThreadList, invalidateThreadContentCache, jumpToSearchResult };
export {
  createThreadProject, deleteThreadProject, deleteThreadProjectPrompt, moveThreadToProject,
  renameThreadProject, renameThreadProjectPrompt, toggleThreadPinned,
};

const MOBILE_THREAD_RAIL_QUERY = '(max-width: 768px)';
const CHAT_DELETED_PROTO_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
let blockedThreadIndexKey: string | null = null;
let blockedThreadIndexNoticeShown = false;
let threadLoadRevision = 0;
let threadSwitchRevision = 0;
const noop = (..._args: unknown[]) => {};
const asyncNoop = async () => {};
const defaultPersonality = () => ({ name: 'Default', icon: '' });

const chatThreadDeps: ChatThreadDependencyRegistry = {
  cleanupDiscussionState: noop,
  deleteAttachmentDraft: noop,
  getActivePersonality: defaultPersonality,
  loadChatHistory: asyncNoop,
  renderChatMessages: noop,
  renderSavedSummaries: noop,
  refreshAttachmentDraft: noop,
  restoreDiscussionContinuePrompt: noop,
  saveChatHistory: asyncNoop,
  stopChatGeneration: noop,
  showPromptDialog,
  stopVoiceActivity: noop,
  updateChatHeaderTitle: noop,
  updatePersonalityBar: noop,
};

function applyThreadContext(thread: ChatThread | null | undefined) {
  if (!thread) return false;
  state.currentThreadId = thread.id;
  state.currentChatPersonality = thread.personality || 'default';
  localStorage.setItem(
    `labcharts-${state.currentProfile}-chatPersonality`,
    state.currentChatPersonality,
  );
  (chatThreadDeps.updateChatHeaderTitle as ChatThreadDependencyMethods['updateChatHeaderTitle'])();
  (chatThreadDeps.updatePersonalityBar as ChatThreadDependencyMethods['updatePersonalityBar'])();
  (chatThreadDeps.refreshAttachmentDraft as ChatThreadDependencyMethods['refreshAttachmentDraft'])();
  if (typeof document !== 'undefined'
    && typeof document.dispatchEvent === 'function'
    && typeof CustomEvent === 'function') {
    document.dispatchEvent(new CustomEvent('chat-thread-changed', { detail: { threadId: thread.id } }));
  }
  return true;
}

export function configureChatThreadDeps(deps: Record<string, unknown> = {}) {
  const previous = { ...chatThreadDeps };
  Object.assign(chatThreadDeps, deps);
  return previous;
}

export function getChatThreadsKey() {
  return `labcharts-${state.currentProfile}-chat-threads`;
}

export function getChatThreadKey(threadId: unknown) {
  return `labcharts-${state.currentProfile}-chat-t_${threadId}`;
}

function recordDeletedChatThread(threadId: string, deletedAt = Date.now()) {
  if (!state.currentProfile || !threadId) return;
  if (CHAT_DELETED_PROTO_KEYS.has(threadId)) return;
  try {
    const key = chatDeletedThreadsKey(state.currentProfile);
    const raw = localStorage.getItem(key);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return;
    const deleted: Record<string, number> = Object.create(null);
    for (const [id, ts] of Object.entries(parsed)) {
      if (CHAT_DELETED_PROTO_KEYS.has(id)) continue;
      const n = Number(ts);
      if (typeof id === 'string' && id && Number.isFinite(n) && n > 0) deleted[id] = n;
    }
    deleted[threadId] = Math.max(Number(deleted[threadId]) || 0, deletedAt);
    localStorage.setItem(key, JSON.stringify(deleted));
  } catch {}
}

function generateThreadId() {
  return createUniqueId('t_');
}

function clearThreadIndexWriteBlock(key: string) {
  if (blockedThreadIndexKey !== key) return;
  blockedThreadIndexKey = null;
  blockedThreadIndexNoticeShown = false;
}

function blockThreadIndexWrites(key: string) {
  if (blockedThreadIndexKey !== key) blockedThreadIndexNoticeShown = false;
  blockedThreadIndexKey = key;
}

function isThreadIndexWriteBlocked(key = getChatThreadsKey()) {
  return blockedThreadIndexKey === key;
}

function notifyThreadIndexBlocked() {
  if (blockedThreadIndexNoticeShown) return;
  blockedThreadIndexNoticeShown = true;
  showNotification('Conversations could not be read, so new chat creation is paused to protect saved chats.', 'error', 6000);
}

function parseThreadIndex(raw: string) {
  const parsed: unknown = JSON.parse(raw);
  return Array.isArray(parsed) ? normalizeChatThreads(parsed) : null;
}

// THREAD INDEX CRUD
export async function loadChatThreads() {
  const key = getChatThreadsKey();
  const revision = ++threadLoadRevision;
  const isCurrent = () => revision === threadLoadRevision && key === getChatThreadsKey();
  const storedRaw = localStorage.getItem(key);
  if (storedRaw !== null) {
    let raw: string | null = null;
    try { raw = await encryptedGetItem(key); } catch { raw = null; }
    if (!isCurrent()) return false;
    if (raw === null) {
      blockThreadIndexWrites(key);
      notifyThreadIndexBlocked();
      return false;
    }
    try {
      const threads = parseThreadIndex(raw);
      if (!threads) throw new Error('Invalid chat thread index');
      state.chatThreads = threads;
      clearThreadIndexWriteBlock(key);
      return true;
    } catch {
      blockThreadIndexWrites(key);
      notifyThreadIndexBlocked();
      return false;
    }
  }

  // Migration: convert legacy flat chat array to a thread.
  clearThreadIndexWriteBlock(key);
  state.chatThreads = [];
  const legacyKey = `labcharts-${state.currentProfile}-chat`;
  const legacyStoredRaw = localStorage.getItem(legacyKey);
  if (legacyStoredRaw === null) return true;

  let legacyRaw: string | null = null;
  try { legacyRaw = await encryptedGetItem(legacyKey); } catch { legacyRaw = null; }
  if (!isCurrent()) return false;
  if (legacyRaw === null) {
    blockThreadIndexWrites(key);
    notifyThreadIndexBlocked();
    return false;
  }
  try {
    const messages: unknown = JSON.parse(legacyRaw);
    if (Array.isArray(messages) && messages.length > 0) {
      const threadId = 't_migrated';
      const now = new Date().toISOString();
      state.chatThreads = [{
        id: threadId,
        name: 'Previous Chat',
        createdAt: now,
        updatedAt: now,
        messageCount: messages.length,
        personality: state.currentChatPersonality || 'default'
      }];
      await encryptedSetItem(getChatThreadKey(threadId), legacyRaw);
      if (!isCurrent()) return false;
      await saveChatThreadIndex();
      // Leave legacy key in place for rollback safety
    }
    return true;
  } catch {
    if (!isCurrent()) return false;
    blockThreadIndexWrites(key);
    notifyThreadIndexBlocked();
    return false;
  }
}

export function saveChatThreadIndex({ sync = true }: { sync?: boolean } = {}) {
  if (isThreadIndexWriteBlocked()) {
    notifyThreadIndexBlocked();
    return false;
  }
  const key = getChatThreadsKey();
  const value = JSON.stringify(state.chatThreads);
  return encryptedSetItem(key, value)
    .then(() => {
      if (sync && key === getChatThreadsKey()) onChatSaved();
      return true;
    })
    .catch((err: unknown) => {
      if (key !== getChatThreadsKey()) return false;
      console.warn('[chat-threads] failed to save thread index', (err as { message?: unknown } | null | undefined)?.message || err);
      showNotification('Could not save conversation list', 'error');
      return false;
    });
}

export function ensureActiveThread() {
  if (isThreadIndexWriteBlocked()) {
    notifyThreadIndexBlocked();
    return false;
  }
  if (state.currentThreadId) {
    const exists = state.chatThreads.find(t => t.id === state.currentThreadId);
    if (exists) return applyThreadContext(exists);
  }
  // Pick most recent thread or create new
  if (state.chatThreads.length > 0) {
    const sorted = state.chatThreads.slice().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    applyThreadContext(sorted[0]);
  } else {
    createNewThread({ sync: false });
  }
  return true;
}

export function createNewThread({ sync = true, projectName = '' }: { sync?: boolean; projectName?: string } = {}) {
  if (isThreadIndexWriteBlocked()) {
    notifyThreadIndexBlocked();
    return null;
  }
  saveChatDraft();
  (chatThreadDeps.stopChatGeneration as ChatThreadDependencyMethods['stopChatGeneration'])();
  (chatThreadDeps.stopVoiceActivity as ChatThreadDependencyMethods['stopVoiceActivity'])();
  (chatThreadDeps.cleanupDiscussionState as ChatThreadDependencyMethods['cleanupDiscussionState'])();
  // A new conversation intentionally starts with the neutral personality.
  state.currentChatPersonality = 'default';
  localStorage.setItem(`labcharts-${state.currentProfile}-chatPersonality`, 'default');
  const id = generateThreadId();
  const now = new Date().toISOString();
  const p = (chatThreadDeps.getActivePersonality as ChatThreadDependencyMethods['getActivePersonality'])() || defaultPersonality();
  const thread = {
    id,
    name: 'New Conversation',
    createdAt: now,
    updatedAt: now,
    messageCount: 0,
    personality: state.currentChatPersonality || 'default',
    personalityName: p.name,
    personalityIcon: p.icon,
    ...(projectName.trim() ? { projectName: projectName.trim().slice(0, 60) } : {}),
  };
  state.chatThreads.unshift(thread);
  saveChatThreadIndex({ sync });
  applyThreadContext(thread);
  state.chatHistory = [];
  (chatThreadDeps.renderChatMessages as ChatThreadDependencyMethods['renderChatMessages'])();
  (chatThreadDeps.updateChatHeaderTitle as ChatThreadDependencyMethods['updateChatHeaderTitle'])();
  (chatThreadDeps.updatePersonalityBar as ChatThreadDependencyMethods['updatePersonalityBar'])();
  renderThreadList();
  closeThreadRailAfterMobileSelection();
  restoreChatDraft(id, { focus: true });
  return thread;
}

/**
 * Creates a non-destructive fork with the supplied conversation context.
 */
export async function createForkedThread(sourceThreadId: string, sourceMessageIndex: number, messages: unknown) {
  const profile = state.currentProfile;
  if (isThreadIndexWriteBlocked()) {
    notifyThreadIndexBlocked();
    return null;
  }
  const source = state.chatThreads.find(thread => thread.id === sourceThreadId);
  if (!source) return null;
  (chatThreadDeps.stopChatGeneration as ChatThreadDependencyMethods['stopChatGeneration'])();
  (chatThreadDeps.stopVoiceActivity as ChatThreadDependencyMethods['stopVoiceActivity'])();
  (chatThreadDeps.cleanupDiscussionState as ChatThreadDependencyMethods['cleanupDiscussionState'])();
  const id = generateThreadId();
  const now = new Date().toISOString();
  const history = normalizeChatMessages(messages);
  const forkSuffix = ' · fork';
  const sourceName = String(source.name || 'Conversation');
  const thread = {
    id,
    name: `${sourceName.slice(0, 60 - forkSuffix.length)}${forkSuffix}`,
    createdAt: now,
    updatedAt: now,
    messageCount: history.length,
    personality: source.personality || 'default',
    personalityName: source.personalityName || '',
    personalityIcon: source.personalityIcon || '',
    forkedFromThreadId: sourceThreadId,
    forkedFromMessageIndex: sourceMessageIndex,
    ...(source.projectName ? { projectName: source.projectName } : {}),
  };
  const originThreadId = state.currentThreadId;
  const key = getChatThreadKey(id);
  // Publish the index only after the complete fork body is durable. No active
  // conversation/composer state changes until both writes have succeeded.
  try { await encryptedSetItem(key, JSON.stringify(history)); }
  catch {
    if (profile === state.currentProfile) showNotification('Could not save the forked conversation.', 'error');
    return null;
  }
  if (profile !== state.currentProfile || originThreadId !== state.currentThreadId) {
    localStorage.removeItem(key);
    return null;
  }
  state.chatThreads.unshift(thread);
  const saved = await saveChatThreadIndex();
  if (!saved) {
    if (profile === state.currentProfile) state.chatThreads = state.chatThreads.filter(item => item.id !== id);
    localStorage.removeItem(key);
    return null;
  }
  if (profile !== state.currentProfile || originThreadId !== state.currentThreadId) return null;
  applyThreadContext(thread);
  state.chatHistory = history;
  (chatThreadDeps.renderChatMessages as ChatThreadDependencyMethods['renderChatMessages'])();
  (chatThreadDeps.updateChatHeaderTitle as ChatThreadDependencyMethods['updateChatHeaderTitle'])();
  (chatThreadDeps.updatePersonalityBar as ChatThreadDependencyMethods['updatePersonalityBar'])();
  renderThreadList();
  closeThreadRailAfterMobileSelection();
  return thread;
}

export async function switchToThread(threadId: string) {
  const profile = state.currentProfile;
  const revision = ++threadSwitchRevision;
  const isCurrent = () => profile === state.currentProfile && revision === threadSwitchRevision;
  closeThreadRailAfterMobileSelection();
  if (threadId === state.currentThreadId) return;
  (chatThreadDeps.stopVoiceActivity as ChatThreadDependencyMethods['stopVoiceActivity'])();
  (chatThreadDeps.stopChatGeneration as ChatThreadDependencyMethods['stopChatGeneration'])();
  saveChatDraft();
  // Save current thread messages
  await (chatThreadDeps.saveChatHistory as ChatThreadDependencyMethods['saveChatHistory'])();
  if (!isCurrent()) return;
  (chatThreadDeps.cleanupDiscussionState as ChatThreadDependencyMethods['cleanupDiscussionState'])();
  // Switch
  const thread = state.chatThreads.find(t => t.id === threadId);
  if (!applyThreadContext(thread)) return;
  await (chatThreadDeps.loadChatHistory as ChatThreadDependencyMethods['loadChatHistory'])();
  if (!isCurrent() || state.currentThreadId !== threadId) return;
  (chatThreadDeps.restoreDiscussionContinuePrompt as ChatThreadDependencyMethods['restoreDiscussionContinuePrompt'])();
  renderThreadList();
  await restoreChatDraft(threadId);
}

export async function deleteThread(threadId: string) {
  const profile = state.currentProfile;
  if (await showConfirmDialog('Delete this conversation? This cannot be undone.')) {
    if (profile !== state.currentProfile) return false;
    const previousThreads = state.chatThreads;
    if (threadId === state.currentThreadId) (chatThreadDeps.stopChatGeneration as ChatThreadDependencyMethods['stopChatGeneration'])();
    invalidateThreadContentCache();
    // Remove from index
    state.chatThreads = state.chatThreads.filter(t => t.id !== threadId);
    const saved = await saveChatThreadIndex({ sync: false });
    if (profile !== state.currentProfile) return false;
    if (!saved) {
      state.chatThreads = previousThreads;
      renderThreadList();
      return false;
    }
    recordDeletedChatThread(threadId);
    onChatSaved();
    await clearChatDraft(threadId);
    if (profile !== state.currentProfile) return false;
    (chatThreadDeps.deleteAttachmentDraft as ChatThreadDependencyMethods['deleteAttachmentDraft'])(threadId);
    // Remove per-thread messages
    localStorage.removeItem(getChatThreadKey(threadId));
    // Remove saved summary
    if (state.importedData.chatSummaries) {
      deleteImportedArrayItems(state.importedData, 'chatSummaries', s => s.threadId === threadId);
      saveImportedData();
    }
    (chatThreadDeps.renderSavedSummaries as ChatThreadDependencyMethods['renderSavedSummaries'])();
    // If we deleted the active thread, switch
    if (state.currentThreadId === threadId) {
      (chatThreadDeps.cleanupDiscussionState as ChatThreadDependencyMethods['cleanupDiscussionState'])();
      if (state.chatThreads.length > 0) {
        const nextThread = state.chatThreads.slice().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]!;
        applyThreadContext(nextThread);
        await (chatThreadDeps.loadChatHistory as ChatThreadDependencyMethods['loadChatHistory'])();
        if (profile !== state.currentProfile || state.currentThreadId !== nextThread.id) return false;
        (chatThreadDeps.restoreDiscussionContinuePrompt as ChatThreadDependencyMethods['restoreDiscussionContinuePrompt'])();
        await restoreChatDraft(state.currentThreadId);
        if (profile !== state.currentProfile) return false;
      } else {
        createNewThread();
      }
    }
    renderThreadList();
    showNotification('Conversation deleted', 'info');
    return true;
  }
  return false;
}

export function renameThread(threadId: unknown, newName: string) {
  const thread = state.chatThreads.find(t => t.id === threadId);
  if (thread && newName && newName.trim()) {
    thread.name = newName.trim().slice(0, 60);
    markThreadMetadataChanged(thread);
    saveChatThreadIndex();
    renderThreadList();
  }
}

export async function renameThreadPrompt(threadId: string) {
  const profile = state.currentProfile;
  const thread = state.chatThreads.find(t => t.id === threadId);
  if (!thread) return;
  const name = await (chatThreadDeps.showPromptDialog as ChatThreadDependencyMethods['showPromptDialog'])('Rename conversation:', {
    defaultValue: thread.name,
    okLabel: 'Rename',
  });
  if (name && profile === state.currentProfile) renameThread(threadId, name);
}

export function getChatThreadSort() {
  const value = localStorage.getItem('labcharts-chat-thread-sort') || 'recent';
  return ['recent', 'oldest', 'name'].includes(value || '') ? value : 'recent';
}

export function setChatThreadSort(value: string) {
  const sort = ['recent', 'oldest', 'name'].includes(value) ? value : 'recent';
  localStorage.setItem('labcharts-chat-thread-sort', sort);
  renderThreadList();
}

export function autoNameThread(threadId: string, firstMessage: string) {
  const thread = state.chatThreads.find(t => t.id === threadId);
  if (!thread || thread.name !== 'New Conversation') return;
  // Extract first 40 chars from the message, trimmed at word boundary
  let excerpt = firstMessage.replace(/\s+/g, ' ').trim();
  if (excerpt.length > 40) {
    excerpt = excerpt.slice(0, 40);
    const lastSpace = excerpt.lastIndexOf(' ');
    if (lastSpace > 20) excerpt = excerpt.slice(0, lastSpace);
    excerpt += '\u2026';
  }
  thread.name = excerpt;
  saveChatThreadIndex();
  renderThreadList();
}

export function pruneOldThreads() {
  // Retained as a compatibility no-op. Conversation retention is a user
  // decision; creating a new chat must never delete an older one.
  return 0;
}

// THREAD RAIL UI
function closeThreadRailAfterMobileSelection() {
  const isMobile = typeof matchMedia === 'function'
    ? matchMedia(MOBILE_THREAD_RAIL_QUERY).matches
    : typeof innerWidth === 'number' && innerWidth <= 768;
  if (!isMobile) return false;

  const rail = document.getElementById('chat-thread-rail');
  if (!rail?.classList.contains('open')) return false;
  rail.classList.remove('open');
  requestChatLayoutSync();
  localStorage.setItem(`labcharts-${state.currentProfile}-chatRailOpen`, 'false');
  return true;
}

export function installChatThreadDelegates(): void {
  configureThreadNavigationActions({
    switch: switchToThread, pin: toggleThreadPinned, rename: renameThreadPrompt, delete: deleteThread,
    move: moveThreadToProject, renameProject: renameThreadProjectPrompt, deleteProject: deleteThreadProjectPrompt,
    jump: result => {
      closeThreadRailAfterMobileSelection();
      return jumpToSearchResult(result.threadId, result.msgIndex, result.contentPrefix);
    },
  });
}

export function renderThreadList(filter?: string) {
  renderChatThreadList(getChatThreadSort(), filter);
}

export function toggleThreadRail() {
  const rail = document.getElementById('chat-thread-rail');
  if (!rail) return;
  const isOpen = rail.classList.toggle('open');
  if (isOpen) {
    closePersonalityPickerView();
    document.querySelector('.discuss-persona-picker')?.remove();
  }
  localStorage.setItem(`labcharts-${state.currentProfile}-chatRailOpen`, isOpen ? 'true' : 'false');
  syncChatLayout();
  // Explicit mobile opening covers the conversation header; focus its visible
  // rail control. Restored rail preferences deliberately keep their focus owner.
  if (isOpen && rail.isConnected && document.getElementById('chat-thread-rail') === rail) {
    const mobile = typeof matchMedia === 'function'
      ? matchMedia(MOBILE_THREAD_RAIL_QUERY).matches
      : typeof innerWidth === 'number' && innerWidth <= 768;
    if (mobile) rail.querySelector<HTMLButtonElement>('.chat-rail-back')?.focus();
  }
}

export function restoreRailState() {
  const rail = document.getElementById('chat-thread-rail');
  if (!rail) return;
  const saved = localStorage.getItem(`labcharts-${state.currentProfile}-chatRailOpen`);
  if (saved === 'true') {
    rail.classList.add('open');
  } else {
    rail.classList.remove('open');
  }

  syncChatLayout();
}

configureChatThreadSearch({
  getChatThreadKey,
  renderThreadList,
  switchToThread,
});
configureChatThreadProjects({
  createNewThread,
  renderThreadList,
  saveChatThreadIndex,
  showPromptDialog: (...args: Parameters<typeof showPromptDialog>) => (chatThreadDeps.showPromptDialog as ChatThreadDependencyMethods['showPromptDialog'])(...args),
});
installChatThreadDelegates();
