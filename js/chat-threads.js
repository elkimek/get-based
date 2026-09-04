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
import { normalizeChatMessages, normalizeChatThreads } from './chat-storage-safety.js';
import { createUniqueId } from './unique-id.js';
import {
  clearChatDraft, restoreChatDraft, saveChatDraft,
} from './chat-composer.js';
import { syncChatLayout } from './chat-layout.js';

export { filterThreadList, invalidateThreadContentCache, jumpToSearchResult };

const THREAD_ICON_EDIT = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>';
const THREAD_ICON_DELETE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v5"/><path d="M14 11v5"/></svg>';
const THREAD_ICON_MORE = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></svg>';
const THREAD_ICON_FOLDER = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h6l2 2h10v11H3z"/></svg>';
const THREAD_ICON_PIN = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14 4 6 6-3 1-4 4-1 5-2-2-4 4-1-1 4-4-2-2 5-1 4-4z"/></svg>';
const MOBILE_THREAD_RAIL_QUERY = '(max-width: 768px)';
const CHAT_DELETED_PROTO_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
let chatThreadDelegatesInstalled = false;
let blockedThreadIndexKey = null;
let blockedThreadIndexNoticeShown = false;
const noop = (..._args) => {};
const asyncNoop = async () => {};
const defaultPersonality = () => ({ name: 'Default', icon: '' });

const chatThreadDeps = {
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

function applyThreadContext(thread) {
  if (!thread) return false;
  state.currentThreadId = thread.id;
  state.currentChatPersonality = thread.personality || 'default';
  localStorage.setItem(
    `labcharts-${state.currentProfile}-chatPersonality`,
    state.currentChatPersonality,
  );
  chatThreadDeps.updateChatHeaderTitle();
  chatThreadDeps.updatePersonalityBar();
  chatThreadDeps.refreshAttachmentDraft();
  if (typeof document !== 'undefined'
    && typeof document.dispatchEvent === 'function'
    && typeof CustomEvent === 'function') {
    document.dispatchEvent(new CustomEvent('chat-thread-changed', { detail: { threadId: thread.id } }));
  }
  return true;
}

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
  return createUniqueId('t_');
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

export function createNewThread({ sync = true, projectName = '' } = {}) {
  if (isThreadIndexWriteBlocked()) {
    notifyThreadIndexBlocked();
    return null;
  }
  saveChatDraft();
  chatThreadDeps.stopChatGeneration();
  chatThreadDeps.stopVoiceActivity();
  chatThreadDeps.cleanupDiscussionState();
  // A new conversation intentionally starts with the neutral personality.
  state.currentChatPersonality = 'default';
  localStorage.setItem(`labcharts-${state.currentProfile}-chatPersonality`, 'default');
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
    personalityIcon: p.icon,
    ...(projectName.trim() ? { projectName: projectName.trim().slice(0, 60) } : {}),
  };
  state.chatThreads.unshift(thread);
  saveChatThreadIndex({ sync });
  applyThreadContext(thread);
  state.chatHistory = [];
  chatThreadDeps.renderChatMessages();
  chatThreadDeps.updateChatHeaderTitle();
  chatThreadDeps.updatePersonalityBar();
  renderThreadList();
  closeThreadRailAfterMobileSelection();
  restoreChatDraft(id, { focus: true });
  return thread;
}

/**
 * Creates a non-destructive fork with the supplied conversation context.
 * @param {string} sourceThreadId
 * @param {number} sourceMessageIndex
 * @param {any[]} messages
 */
export async function createForkedThread(sourceThreadId, sourceMessageIndex, messages) {
  if (isThreadIndexWriteBlocked()) {
    notifyThreadIndexBlocked();
    return null;
  }
  const source = state.chatThreads.find(thread => thread.id === sourceThreadId);
  if (!source) return null;
  chatThreadDeps.stopChatGeneration();
  chatThreadDeps.stopVoiceActivity();
  chatThreadDeps.cleanupDiscussionState();
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
  state.chatThreads.unshift(thread);
  if (!await saveChatThreadIndex()) {
    state.chatThreads = state.chatThreads.filter(item => item.id !== id);
    return null;
  }
  applyThreadContext(thread);
  state.chatHistory = history;
  await chatThreadDeps.saveChatHistory();
  chatThreadDeps.renderChatMessages();
  chatThreadDeps.updateChatHeaderTitle();
  chatThreadDeps.updatePersonalityBar();
  renderThreadList();
  closeThreadRailAfterMobileSelection();
  return thread;
}

export async function switchToThread(threadId) {
  closeThreadRailAfterMobileSelection();
  if (threadId === state.currentThreadId) return;
  chatThreadDeps.stopVoiceActivity();
  chatThreadDeps.stopChatGeneration();
  saveChatDraft();
  // Save current thread messages
  await chatThreadDeps.saveChatHistory();
  chatThreadDeps.cleanupDiscussionState();
  // Switch
  const thread = state.chatThreads.find(t => t.id === threadId);
  if (!applyThreadContext(thread)) return;
  await chatThreadDeps.loadChatHistory();
  chatThreadDeps.restoreDiscussionContinuePrompt();
  renderThreadList();
  await restoreChatDraft(threadId);
}

export async function deleteThread(threadId) {
  if (await showConfirmDialog('Delete this conversation? This cannot be undone.')) {
    if (threadId === state.currentThreadId) chatThreadDeps.stopChatGeneration();
    invalidateThreadContentCache();
    recordDeletedChatThread(threadId);
    await clearChatDraft(threadId);
    chatThreadDeps.deleteAttachmentDraft(threadId);
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
      chatThreadDeps.cleanupDiscussionState();
      if (state.chatThreads.length > 0) {
        const nextThread = state.chatThreads.slice().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
        applyThreadContext(nextThread);
        await chatThreadDeps.loadChatHistory();
        chatThreadDeps.restoreDiscussionContinuePrompt();
        await restoreChatDraft(state.currentThreadId);
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

function projectNames() {
  return [...new Set(state.chatThreads.map(thread => String(thread.projectName || '').trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b));
}

export async function createThreadProject() {
  const name = await chatThreadDeps.showPromptDialog('Create a project:', {
    defaultValue: '',
    okLabel: 'Create',
  });
  const projectName = String(name || '').trim().slice(0, 60);
  if (!projectName) return null;
  return createNewThread({ projectName });
}

export function toggleThreadPinned(threadId) {
  const thread = state.chatThreads.find(item => item.id === threadId);
  if (!thread) return false;
  thread.pinned = thread.pinned !== true;
  saveChatThreadIndex();
  renderThreadList();
  return thread.pinned;
}

export async function moveThreadToProjectPrompt(threadId) {
  const thread = state.chatThreads.find(item => item.id === threadId);
  if (!thread) return false;
  const names = projectNames();
  const prompt = names.length
    ? `Move to project (leave blank for no project). Existing projects: ${names.join(', ')}`
    : 'Move to project (leave blank for no project):';
  const name = await chatThreadDeps.showPromptDialog(prompt, {
    defaultValue: thread.projectName || '',
    okLabel: 'Move',
  });
  if (name === null || name === undefined) return false;
  const projectName = String(name).trim().slice(0, 60);
  if (projectName) thread.projectName = projectName;
  else delete thread.projectName;
  await saveChatThreadIndex();
  renderThreadList();
  return true;
}

export function getChatThreadSort() {
  const value = localStorage.getItem('labcharts-chat-thread-sort');
  return ['recent', 'oldest', 'name'].includes(value || '') ? value : 'recent';
}

export function setChatThreadSort(value) {
  const sort = ['recent', 'oldest', 'name'].includes(value) ? value : 'recent';
  localStorage.setItem('labcharts-chat-thread-sort', sort);
  renderThreadList();
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
  // Retained as a compatibility no-op. Conversation retention is a user
  // decision; creating a new chat must never delete an older one.
  return 0;
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
  document.querySelector('.chat-rail-toggle')?.setAttribute('aria-expanded', 'false');
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
  const target = event.target;
  document.querySelectorAll('.chat-thread-item-menu[open]').forEach(menu => {
    if (!(target instanceof Node) || !menu.contains(target)) menu.removeAttribute('open');
  });
  if (!actionEl) return;
  const list = document.getElementById('chat-thread-list');
  if (!list || !list.contains(actionEl)) return;

  const action = actionEl.dataset.chatThreadAction;
  const threadId = getThreadActionId(actionEl);
  if (!action || !threadId) return;
  actionEl.closest('details')?.removeAttribute('open');

  if (action === 'switch') {
    event.preventDefault();
    switchToThread(threadId);
  } else if (action === 'rename') {
    event.preventDefault();
    renameThreadPrompt(threadId);
  } else if (action === 'delete') {
    event.preventDefault();
    deleteThread(threadId);
  } else if (action === 'pin') {
    event.preventDefault();
    toggleThreadPinned(threadId);
  } else if (action === 'move') {
    event.preventDefault();
    moveThreadToProjectPrompt(threadId);
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
  const sort = getChatThreadSort();
  const sortSelect = /** @type {HTMLSelectElement | null} */ (document.getElementById('chat-thread-sort'));
  if (sortSelect) sortSelect.value = sort;
  const compareThreads = (a, b) => sort === 'name'
    ? a.name.localeCompare(b.name)
    : sort === 'oldest'
      ? a.updatedAt.localeCompare(b.updatedAt)
      : b.updatedAt.localeCompare(a.updatedAt);
  let threads = state.chatThreads.slice().sort(compareThreads);
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

  const renderThread = t => {
    const isActive = t.id === state.currentThreadId;
    const date = new Date(t.updatedAt);
    const dateStr = formatThreadDate(date);
    const icon = t.personalityIcon || personalityMap[t.personality] || personalityMap.default || '';
    const iconTitle = t.personalityName ? ` title="${escapeHTML(t.personalityName)}"` : '';
    const messageCount = Number.isFinite(Number(t.messageCount))
      ? Math.max(0, Math.trunc(Number(t.messageCount)))
      : 0;
    return `<div class="chat-thread-item${isActive ? ' active' : ''}${t.pinned ? ' pinned' : ''}" data-thread-id="${escapeHTML(t.id)}">
      <button type="button" class="chat-thread-item-main" data-chat-thread-action="switch" aria-current="${isActive ? 'true' : 'false'}">
        <span class="chat-thread-item-name">${escapeHTML(t.name)}</span>
        <span class="chat-thread-item-meta">
          <span${iconTitle}>${escapeHTML(icon)}</span>
          <span>${dateStr}</span>
          <span>${messageCount} msg${messageCount !== 1 ? 's' : ''}</span>
        </span>
      </button>
      <details class="chat-thread-item-menu">
        <summary class="chat-thread-item-action" title="Conversation actions" aria-label="Actions for ${escapeHTML(t.name)}">${THREAD_ICON_MORE}</summary>
        <div class="chat-thread-item-menu-popover">
          <button type="button" data-chat-thread-action="pin" data-thread-id="${escapeHTML(t.id)}">${THREAD_ICON_PIN}<span>${t.pinned ? 'Unpin' : 'Pin'}</span></button>
          <button type="button" data-chat-thread-action="move" data-thread-id="${escapeHTML(t.id)}">${THREAD_ICON_FOLDER}<span>Move to project</span></button>
          <button type="button" data-chat-thread-action="rename" data-thread-id="${escapeHTML(t.id)}">${THREAD_ICON_EDIT}<span>Rename</span></button>
          <button type="button" class="delete" data-chat-thread-action="delete" data-thread-id="${escapeHTML(t.id)}">${THREAD_ICON_DELETE}<span>Delete</span></button>
        </div>
      </details>
    </div>`;
  };
  const renderGroup = (title, items, icon = '') => items.length
    ? `<section class="chat-thread-group"><div class="chat-thread-group-title">${icon}${escapeHTML(title)}</div>${items.map(renderThread).join('')}</section>`
    : '';
  if (filter?.trim()) {
    list.innerHTML = threads.map(renderThread).join('');
    return;
  }
  const pinned = threads.filter(thread => thread.pinned === true);
  const remaining = threads.filter(thread => thread.pinned !== true);
  const groups = [];
  groups.push(renderGroup('Pinned', pinned, THREAD_ICON_PIN));
  for (const name of projectNames()) {
    groups.push(renderGroup(name, remaining.filter(thread => thread.projectName === name), THREAD_ICON_FOLDER));
  }
  const ungrouped = remaining.filter(thread => !thread.projectName);
  if (sort !== 'recent') {
    groups.push(renderGroup('Conversations', ungrouped));
  } else {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const updatedTime = thread => {
      const time = new Date(thread.updatedAt).getTime();
      return Number.isFinite(time) ? time : 0;
    };
    groups.push(renderGroup('Today', ungrouped.filter(thread => updatedTime(thread) >= today.getTime())));
    groups.push(renderGroup('Yesterday', ungrouped.filter(thread => {
      const updated = updatedTime(thread);
      return updated >= yesterday.getTime() && updated < today.getTime();
    })));
    groups.push(renderGroup('Earlier', ungrouped.filter(thread => updatedTime(thread) < yesterday.getTime())));
  }
  list.innerHTML = groups.join('');
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
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function toggleThreadRail() {
  const rail = document.getElementById('chat-thread-rail');
  if (!rail) return;
  const isOpen = rail.classList.toggle('open');
  if (isOpen) {
    document.querySelector('.chat-personality-bar')?.classList.remove('open');
    document.querySelector('.chat-personality-current')?.setAttribute('aria-expanded', 'false');
    document.querySelector('.discuss-persona-picker')?.remove();
  }
  document.querySelector('.chat-rail-toggle')?.setAttribute('aria-expanded', String(isOpen));
  localStorage.setItem(`labcharts-${state.currentProfile}-chatRailOpen`, isOpen ? 'true' : 'false');
  syncChatLayout();
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
  document.querySelector('.chat-rail-toggle')?.setAttribute(
    'aria-expanded',
    String(rail.classList.contains('open')),
  );
  syncChatLayout();
}

configureChatThreadSearch({
  getChatThreadKey,
  renderThreadList,
  switchToThread,
});
installChatThreadDelegates();
