// @ts-check
// chat-threads.js — Conversation-thread management for the chat panel
//
// Extracted from chat.js (v1.21.9) as the second Phase 2e refactor split.
// Owns: thread index CRUD (localStorage layout) and thread-rail UI.

import { state } from './state.js';
import { escapeHTML, showNotification, showConfirmDialog, showPromptDialog } from './utils.js';
import { saveImportedData } from './data.js';
import { deleteImportedArrayItems } from './data-merge.js';
import { onChatSaved } from './sync.js';
import { chatDeletedThreadsKey } from './sync-payload-collectors.js';
import { CHAT_PERSONALITIES } from './constants.js';
import { encryptedGetItem, encryptedSetItem } from './crypto.js';
import {
  configureChatThreadSearch, filterThreadList,
  invalidateThreadContentCache, jumpToSearchResult,
} from './chat-thread-search.js';
import { normalizeChatThreads } from './chat-storage-safety.js';

export { filterThreadList, invalidateThreadContentCache, jumpToSearchResult };

const MAX_THREADS = 50;
const THREAD_ICON_EDIT = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>';
const THREAD_ICON_DELETE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v5"/><path d="M14 11v5"/></svg>';
const MOBILE_THREAD_RAIL_QUERY = '(max-width: 768px)';
const CHAT_DELETED_PROTO_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
let chatThreadDelegatesInstalled = false;
let blockedThreadIndexKey = null;
let blockedThreadIndexNoticeShown = false;
const noop = () => {};
const asyncNoop = async () => {};
const defaultPersonality = () => ({ name: 'Default', icon: '' });

const chatThreadDeps = {
  cleanupDiscussionState: noop,
  getActivePersonality: defaultPersonality,
  loadChatHistory: asyncNoop,
  renderChatMessages: noop,
  renderSavedSummaries: noop,
  restoreDiscussionContinuePrompt: noop,
  saveChatHistory: asyncNoop,
  showPromptDialog,
  updateChatHeaderTitle: noop,
  updatePersonalityBar: noop,
};

export function configureChatThreadDeps(deps = {}) {
  const previous = { ...chatThreadDeps };
  Object.assign(chatThreadDeps, deps);
  return previous;
}

export function getChatThreadsKey() {
  return `labcharts-${state.currentProfile}-chat-threads`;
}

export function getChatThreadKey(threadId) {
  return `labcharts-${state.currentProfile}-chat-t_${threadId}`;
}

function recordDeletedChatThread(threadId, deletedAt = Date.now()) {
  if (!state.currentProfile || !threadId) return;
  if (CHAT_DELETED_PROTO_KEYS.has(threadId)) return;
  try {
    const key = chatDeletedThreadsKey(state.currentProfile);
    const raw = localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : {};
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return;
    const deleted = Object.create(null);
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
  return 't_' + Date.now().toString(36);
}

function clearThreadIndexWriteBlock(key) {
  if (blockedThreadIndexKey !== key) return;
  blockedThreadIndexKey = null;
  blockedThreadIndexNoticeShown = false;
}

function blockThreadIndexWrites(key) {
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

function parseThreadIndex(raw) {
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed) ? normalizeChatThreads(parsed) : null;
}

// ═══════════════════════════════════════════════
// THREAD INDEX CRUD
// ═══════════════════════════════════════════════
export async function loadChatThreads() {
  const key = getChatThreadsKey();
  const storedRaw = localStorage.getItem(key);
  if (storedRaw !== null) {
    let raw = null;
    try { raw = await encryptedGetItem(key); } catch { raw = null; }
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

  let legacyRaw = null;
  try { legacyRaw = await encryptedGetItem(legacyKey); } catch { legacyRaw = null; }
  if (legacyRaw === null) {
    blockThreadIndexWrites(key);
    notifyThreadIndexBlocked();
    return false;
  }
  try {
    const messages = JSON.parse(legacyRaw);
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
      await saveChatThreadIndex();
      // Leave legacy key in place for rollback safety
    }
    return true;
  } catch {
    blockThreadIndexWrites(key);
    notifyThreadIndexBlocked();
    return false;
  }
}

export function saveChatThreadIndex({ sync = true } = {}) {
  if (isThreadIndexWriteBlocked()) {
    notifyThreadIndexBlocked();
    return false;
  }
  const key = getChatThreadsKey();
  const value = JSON.stringify(state.chatThreads);
  return encryptedSetItem(key, value)
    .then(() => {
      if (sync) onChatSaved();
      return true;
    })
    .catch((err) => {
      console.warn('[chat-threads] failed to save thread index', err?.message || err);
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
    if (exists) return true;
  }
  // Pick most recent thread or create new
  if (state.chatThreads.length > 0) {
    const sorted = state.chatThreads.slice().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    state.currentThreadId = sorted[0].id;
  } else {
    createNewThread({ sync: false });
  }
  return true;
}

export function createNewThread({ sync = true } = {}) {
  if (isThreadIndexWriteBlocked()) {
    notifyThreadIndexBlocked();
    return null;
  }
  const id = generateThreadId();
  const now = new Date().toISOString();
  const p = chatThreadDeps.getActivePersonality() || defaultPersonality();
  const thread = {
    id,
    name: 'New Conversation',
    createdAt: now,
    updatedAt: now,
    messageCount: 0,
    personality: state.currentChatPersonality || 'default',
    personalityName: p.name,
    personalityIcon: p.icon
  };
  state.chatThreads.unshift(thread);
  pruneOldThreads();
  saveChatThreadIndex({ sync });
  chatThreadDeps.cleanupDiscussionState();
  // Reset to default personality for new thread
  state.currentChatPersonality = 'default';
  localStorage.setItem(`labcharts-${state.currentProfile}-chatPersonality`, 'default');
  state.currentThreadId = id;
  state.chatHistory = [];
  chatThreadDeps.renderChatMessages();
  chatThreadDeps.updateChatHeaderTitle();
  chatThreadDeps.updatePersonalityBar();
  renderThreadList();
  closeThreadRailAfterMobileSelection();
  // Focus input
  const input = /** @type {HTMLTextAreaElement | null} */ (document.getElementById('chat-input'));
  if (input) input.focus();
  return thread;
}

export async function switchToThread(threadId) {
  closeThreadRailAfterMobileSelection();
  if (threadId === state.currentThreadId) return;
  // Save current thread messages
  await chatThreadDeps.saveChatHistory();
  chatThreadDeps.cleanupDiscussionState();
  // Switch
  state.currentThreadId = threadId;
  await chatThreadDeps.loadChatHistory();
  // Update thread personality
  const thread = state.chatThreads.find(t => t.id === threadId);
  if (thread && thread.personality) {
    state.currentChatPersonality = thread.personality;
    localStorage.setItem(`labcharts-${state.currentProfile}-chatPersonality`, thread.personality);
    chatThreadDeps.updateChatHeaderTitle();
    chatThreadDeps.updatePersonalityBar();
  }
  chatThreadDeps.restoreDiscussionContinuePrompt();
  renderThreadList();
}

export async function deleteThread(threadId) {
  if (await showConfirmDialog('Delete this conversation? This cannot be undone.')) {
    invalidateThreadContentCache();
    recordDeletedChatThread(threadId);
    // Remove from index
    state.chatThreads = state.chatThreads.filter(t => t.id !== threadId);
    await saveChatThreadIndex();
    // Remove per-thread messages
    localStorage.removeItem(getChatThreadKey(threadId));
    // Remove saved summary
    if (state.importedData.chatSummaries) {
      deleteImportedArrayItems(state.importedData, 'chatSummaries', s => s.threadId === threadId);
      saveImportedData();
    }
    chatThreadDeps.renderSavedSummaries();
    // If we deleted the active thread, switch
    if (state.currentThreadId === threadId) {
      if (state.chatThreads.length > 0) {
        state.currentThreadId = state.chatThreads[0].id;
        chatThreadDeps.loadChatHistory();
      } else {
        createNewThread();
      }
    }
    renderThreadList();
    showNotification('Conversation deleted', 'info');
  }
}

export function renameThread(threadId, newName) {
  const thread = state.chatThreads.find(t => t.id === threadId);
  if (thread && newName && newName.trim()) {
    thread.name = newName.trim().slice(0, 60);
    saveChatThreadIndex();
    renderThreadList();
  }
}

export async function renameThreadPrompt(threadId) {
  const thread = state.chatThreads.find(t => t.id === threadId);
  if (!thread) return;
  const name = await chatThreadDeps.showPromptDialog('Rename conversation:', {
    defaultValue: thread.name,
    okLabel: 'Rename',
  });
  if (name) renameThread(threadId, name);
}

export function autoNameThread(threadId, firstMessage) {
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
  if (state.chatThreads.length <= MAX_THREADS) return;
  // Sort by updatedAt desc, remove oldest
  const sorted = state.chatThreads.slice().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const toRemove = sorted.slice(MAX_THREADS);
  for (const t of toRemove) {
    recordDeletedChatThread(t.id);
    localStorage.removeItem(getChatThreadKey(t.id));
  }
  state.chatThreads = sorted.slice(0, MAX_THREADS);
  saveChatThreadIndex();
  if (toRemove.length > 0) {
    showNotification(`Pruned ${toRemove.length} old conversation(s)`, 'info');
  }
}

// ═══════════════════════════════════════════════
// THREAD RAIL UI
// ═══════════════════════════════════════════════
function closeThreadRailAfterMobileSelection() {
  const isMobile = typeof matchMedia === 'function'
    ? matchMedia(MOBILE_THREAD_RAIL_QUERY).matches
    : typeof innerWidth === 'number' && innerWidth <= 768;
  if (!isMobile) return false;

  const rail = document.getElementById('chat-thread-rail');
  if (!rail?.classList.contains('open')) return false;
  rail.classList.remove('open');
  localStorage.setItem(`labcharts-${state.currentProfile}-chatRailOpen`, 'false');
  return true;
}

/** @param {Event} event */
function closestThreadAction(event) {
  const target = event.target;
  if (typeof Element === 'undefined' || !(target instanceof Element)) return null;
  return /** @type {HTMLElement | null} */ (target.closest('[data-chat-thread-action]'));
}

/** @param {HTMLElement} actionEl */
function getThreadActionId(actionEl) {
  const threadEl = /** @type {HTMLElement | null} */ (actionEl.closest('[data-thread-id]'));
  return actionEl.dataset.threadId || threadEl?.dataset.threadId || '';
}

/** @param {Event} event */
function handleThreadActionClick(event) {
  const actionEl = closestThreadAction(event);
  if (!actionEl) return;
  const list = document.getElementById('chat-thread-list');
  if (!list || !list.contains(actionEl)) return;

  const action = actionEl.dataset.chatThreadAction;
  const threadId = getThreadActionId(actionEl);
  if (!action || !threadId) return;

  if (action === 'switch') {
    event.preventDefault();
    switchToThread(threadId);
  } else if (action === 'rename') {
    event.preventDefault();
    renameThreadPrompt(threadId);
  } else if (action === 'delete') {
    event.preventDefault();
    deleteThread(threadId);
  }
}

export function installChatThreadDelegates() {
  if (chatThreadDelegatesInstalled || typeof document === 'undefined') return;
  chatThreadDelegatesInstalled = true;
  document.addEventListener('click', handleThreadActionClick);
}

/** @param {string} [filter] */
export function renderThreadList(filter) {
  const list = document.getElementById('chat-thread-list');
  if (!list) return;
  let threads = state.chatThreads.slice().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  if (filter && filter.trim()) {
    const q = filter.toLowerCase().trim();
    threads = threads.filter(t => t.name.toLowerCase().includes(q));
  }
  if (threads.length === 0) {
    list.innerHTML = '<div style="padding:12px 10px;font-size:11px;color:var(--text-muted);text-align:center">' +
      (filter ? 'No matching conversations' : 'No conversations yet') + '</div>';
    return;
  }
  const personalityMap = {};
  for (const p of CHAT_PERSONALITIES) personalityMap[p.id] = p.icon;

  list.innerHTML = threads.map(t => {
    const isActive = t.id === state.currentThreadId;
    const date = new Date(t.updatedAt);
    const dateStr = formatThreadDate(date);
    const icon = t.personalityIcon || personalityMap[t.personality] || personalityMap.default || '';
    const iconTitle = t.personalityName ? ` title="${escapeHTML(t.personalityName)}"` : '';
    const messageCount = Number.isFinite(Number(t.messageCount))
      ? Math.max(0, Math.trunc(Number(t.messageCount)))
      : 0;
    return `<div class="chat-thread-item${isActive ? ' active' : ''}" data-chat-thread-action="switch" data-thread-id="${escapeHTML(t.id)}">
      <div class="chat-thread-item-name">${escapeHTML(t.name)}</div>
      <div class="chat-thread-item-meta">
        <span${iconTitle}>${escapeHTML(icon)}</span>
        <span>${dateStr}</span>
        <span>${messageCount} msg${messageCount !== 1 ? 's' : ''}</span>
      </div>
      <div class="chat-thread-item-actions">
        <button class="chat-thread-item-action" data-chat-thread-action="rename" data-thread-id="${escapeHTML(t.id)}" title="Rename" aria-label="Rename thread">${THREAD_ICON_EDIT}</button>
        <button class="chat-thread-item-action delete" data-chat-thread-action="delete" data-thread-id="${escapeHTML(t.id)}" title="Delete" aria-label="Delete thread">${THREAD_ICON_DELETE}</button>
      </div>
    </div>`;
  }).join('');
}

function formatThreadDate(date) {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function toggleThreadRail() {
  const rail = document.getElementById('chat-thread-rail');
  if (!rail) return;
  const isOpen = rail.classList.toggle('open');
  localStorage.setItem(`labcharts-${state.currentProfile}-chatRailOpen`, isOpen ? 'true' : 'false');
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
}

configureChatThreadSearch({
  getChatThreadKey,
  renderThreadList,
  switchToThread,
});
installChatThreadDelegates();
