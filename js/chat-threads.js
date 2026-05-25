// chat-threads.js — Conversation-thread management for the chat panel
//
// Extracted from chat.js (v1.21.9) as the second Phase 2e refactor split.
// Owns: thread index CRUD (localStorage layout) and thread-rail UI.
//
// Back-references into chat.js use `window.fn()` to avoid circular
// deps — same pattern the rest of the codebase uses for cross-module
// calls from modules exposed on `window`. The functions we call on
// chat.js's window:
//
//   window.renderChatMessages       — redraw the message list
//   window.updateChatHeaderTitle    — header title + personality
//   window.updatePersonalityBar     — personality strip at top
//   window.loadChatHistory          — hydrate state.chatHistory
//   window.saveChatHistory          — persist state.chatHistory
//   window.showDiscussContinuePrompt — resume an in-flight discussion
//   window.restoreDiscussionContinuePrompt — rebuild discussion prompt from active thread/history
//   window.renderSavedSummaries     — summaries panel refresh
//   window.cleanupDiscussionState   — remove transient discussion UI state
//   window.getActivePersonality     — personality lookup (chat.js)
//   window.showPromptDialog         — shared dialog helper

import { state } from './state.js';
import { escapeHTML, showNotification, showConfirmDialog } from './utils.js';
import { saveImportedData } from './data.js';
import { onChatSaved } from './sync.js';
import { chatDeletedThreadsKey } from './sync-payload.js';
import { CHAT_PERSONALITIES } from './constants.js';
import {
  configureChatThreadSearch, filterThreadList,
  invalidateThreadContentCache, jumpToSearchResult,
} from './chat-thread-search.js';

export { filterThreadList, invalidateThreadContentCache, jumpToSearchResult };

const MAX_THREADS = 50;
const THREAD_ICON_EDIT = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>';
const THREAD_ICON_DELETE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v5"/><path d="M14 11v5"/></svg>';
const CHAT_DELETED_PROTO_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

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

// ═══════════════════════════════════════════════
// THREAD INDEX CRUD
// ═══════════════════════════════════════════════
export function loadChatThreads() {
  const raw = localStorage.getItem(getChatThreadsKey());
  if (raw) {
    try {
      state.chatThreads = JSON.parse(raw);
    } catch { state.chatThreads = []; }
  } else {
    // Migration: convert legacy flat chat array to a thread
    state.chatThreads = [];
    const legacyKey = `labcharts-${state.currentProfile}-chat`;
    const legacyRaw = localStorage.getItem(legacyKey);
    if (legacyRaw) {
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
          // Write per-thread messages (plaintext — encryption handled by save)
          localStorage.setItem(getChatThreadKey(threadId), legacyRaw);
          saveChatThreadIndex();
          // Leave legacy key in place for rollback safety
        }
      } catch {}
    }
  }
}

export function saveChatThreadIndex({ sync = true } = {}) {
  localStorage.setItem(getChatThreadsKey(), JSON.stringify(state.chatThreads));
  if (sync) onChatSaved();
}

export function ensureActiveThread() {
  if (state.currentThreadId) {
    const exists = state.chatThreads.find(t => t.id === state.currentThreadId);
    if (exists) return;
  }
  // Pick most recent thread or create new
  if (state.chatThreads.length > 0) {
    const sorted = state.chatThreads.slice().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    state.currentThreadId = sorted[0].id;
  } else {
    createNewThread({ sync: false });
  }
}

export function createNewThread({ sync = true } = {}) {
  const id = generateThreadId();
  const now = new Date().toISOString();
  const p = window.getActivePersonality?.() || { name: 'Default', icon: '' };
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
  window.cleanupDiscussionState?.();
  // Reset to default personality for new thread
  state.currentChatPersonality = 'default';
  localStorage.setItem(`labcharts-${state.currentProfile}-chatPersonality`, 'default');
  state.currentThreadId = id;
  state.chatHistory = [];
  window.renderChatMessages?.();
  window.updateChatHeaderTitle?.();
  window.updatePersonalityBar?.();
  renderThreadList();
  // Focus input
  const input = document.getElementById('chat-input');
  if (input) input.focus();
}

export async function switchToThread(threadId) {
  if (threadId === state.currentThreadId) return;
  // Save current thread messages
  await window.saveChatHistory?.();
  window.cleanupDiscussionState?.();
  // Switch
  state.currentThreadId = threadId;
  await window.loadChatHistory?.();
  // Update thread personality
  const thread = state.chatThreads.find(t => t.id === threadId);
  if (thread && thread.personality) {
    state.currentChatPersonality = thread.personality;
    localStorage.setItem(`labcharts-${state.currentProfile}-chatPersonality`, thread.personality);
    window.updateChatHeaderTitle?.();
    window.updatePersonalityBar?.();
  }
  window.restoreDiscussionContinuePrompt?.();
  renderThreadList();
}

export async function deleteThread(threadId) {
  if (await showConfirmDialog('Delete this conversation? This cannot be undone.')) {
    invalidateThreadContentCache();
    recordDeletedChatThread(threadId);
    // Remove from index
    state.chatThreads = state.chatThreads.filter(t => t.id !== threadId);
    saveChatThreadIndex();
    // Remove per-thread messages
    localStorage.removeItem(getChatThreadKey(threadId));
    // Remove saved summary
    if (state.importedData.chatSummaries) {
      state.importedData.chatSummaries = state.importedData.chatSummaries.filter(s => s.threadId !== threadId);
      saveImportedData();
    }
    window.renderSavedSummaries?.();
    // If we deleted the active thread, switch
    if (state.currentThreadId === threadId) {
      if (state.chatThreads.length > 0) {
        state.currentThreadId = state.chatThreads[0].id;
        window.loadChatHistory?.();
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
  const name = await window.showPromptDialog('Rename conversation:', {
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
    return `<div class="chat-thread-item${isActive ? ' active' : ''}" onclick="switchToThread('${escapeHTML(t.id)}')" data-thread-id="${escapeHTML(t.id)}">
      <div class="chat-thread-item-name">${escapeHTML(t.name)}</div>
      <div class="chat-thread-item-meta">
        <span${iconTitle}>${icon}</span>
        <span>${dateStr}</span>
        <span>${t.messageCount} msg${t.messageCount !== 1 ? 's' : ''}</span>
      </div>
      <div class="chat-thread-item-actions">
        <button class="chat-thread-item-action" onclick="event.stopPropagation();renameThreadPrompt('${escapeHTML(t.id)}')" title="Rename" aria-label="Rename thread">${THREAD_ICON_EDIT}</button>
        <button class="chat-thread-item-action delete" onclick="event.stopPropagation();deleteThread('${escapeHTML(t.id)}')" title="Delete" aria-label="Delete thread">${THREAD_ICON_DELETE}</button>
      </div>
    </div>`;
  }).join('');
}

function formatThreadDate(date) {
  const now = new Date();
  const diff = now - date;
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

// HTML onclick handlers + chat.js call sites hit these names.
Object.assign(window, {
  loadChatThreads,
  saveChatThreadIndex,
  ensureActiveThread,
  createNewThread,
  switchToThread,
  deleteThread,
  renameThread,
  renameThreadPrompt,
  autoNameThread,
  pruneOldThreads,
  renderThreadList,
  invalidateThreadContentCache,
  filterThreadList,
  jumpToSearchResult,
  toggleThreadRail,
});
