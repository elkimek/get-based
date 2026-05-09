// chat-threads.js — Conversation-thread management for the chat panel
//
// Extracted from chat.js (v1.21.9) as the second Phase 2e refactor split.
// Owns: thread index CRUD (localStorage layout), thread-rail UI,
// message-content search, navigate-to-match highlighting.
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
//   window.renderSavedSummaries     — summaries panel refresh
//   window.cleanupDiscussionState   — tear down discussion flag
//   window.getActivePersonality     — personality lookup (chat.js)
//   window.showPromptDialog         — shared dialog helper

import { state } from './state.js';
import { escapeHTML, showNotification, showConfirmDialog } from './utils.js';
import { encryptedGetItem, getEncryptionEnabled } from './crypto.js';
import { saveImportedData } from './data.js';
import { onChatSaved } from './sync.js';
import { CHAT_PERSONALITIES } from './constants.js';

const MAX_THREADS = 50;

export function getChatThreadsKey() {
  return `labcharts-${state.currentProfile}-chat-threads`;
}

export function getChatThreadKey(threadId) {
  return `labcharts-${state.currentProfile}-chat-t_${threadId}`;
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

export function saveChatThreadIndex() {
  localStorage.setItem(getChatThreadsKey(), JSON.stringify(state.chatThreads));
  onChatSaved();
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
    createNewThread();
  }
}

export function createNewThread() {
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
  saveChatThreadIndex();
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
  // Restore discussion state if this thread had an active discussion
  if (thread && thread.discussionPersonas) {
    window.showDiscussContinuePrompt?.(thread.discussionPersonas, thread.discussionOriginalPersonality);
  }
  renderThreadList();
}

export async function deleteThread(threadId) {
  if (await showConfirmDialog('Delete this conversation? This cannot be undone.')) {
    invalidateThreadContentCache();
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
        <button class="chat-thread-item-action" onclick="event.stopPropagation();renameThreadPrompt('${escapeHTML(t.id)}')" title="Rename" aria-label="Rename thread">&#9998;</button>
        <button class="chat-thread-item-action delete" onclick="event.stopPropagation();deleteThread('${escapeHTML(t.id)}')" title="Delete" aria-label="Delete thread">&#10005;</button>
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

let _threadSearchTimer = null;
let _threadContentCache = null; // { profileId, threads: Map<threadId, messages[]> }

async function getThreadMessages(threadId) {
  // Invalidate cache on profile switch
  if (!_threadContentCache || _threadContentCache.profileId !== state.currentProfile) {
    _threadContentCache = { profileId: state.currentProfile, threads: new Map() };
  }
  if (_threadContentCache.threads.has(threadId)) return _threadContentCache.threads.get(threadId);
  try {
    const key = getChatThreadKey(threadId);
    const raw = getEncryptionEnabled() ? await encryptedGetItem(key) : localStorage.getItem(key);
    const messages = raw ? JSON.parse(raw) : [];
    _threadContentCache.threads.set(threadId, messages);
    return messages;
  } catch { return []; }
}

// Invalidate cache when messages change
export function invalidateThreadContentCache() { _threadContentCache = null; }

export function filterThreadList(value) {
  if (!value || !value.trim()) {
    // Clear highlights when search is cleared
    document.querySelectorAll('.chat-search-mark').forEach(m => m.replaceWith(m.textContent));
    document.querySelectorAll('.chat-msg-highlight').forEach(m => m.classList.remove('chat-msg-highlight'));
    renderThreadList();
    return;
  }
  // Instant: filter thread names
  renderThreadList(value);
  // Debounced: search message content
  clearTimeout(_threadSearchTimer);
  _threadSearchTimer = setTimeout(() => searchThreadContent(value.trim()), 250);
}

async function searchThreadContent(query) {
  const q = query.toLowerCase();
  const results = [];
  for (const t of state.chatThreads) {
    const messages = await getThreadMessages(t.id);
    for (let i = 0; i < messages.length; i++) {
      const m = messages[i];
      if (!m.content) continue;
      const idx = m.content.toLowerCase().indexOf(q);
      if (idx === -1) continue;
      // Extract snippet around match
      const start = Math.max(0, idx - 40);
      const end = Math.min(m.content.length, idx + q.length + 40);
      const pre = (start > 0 ? '\u2026' : '') + m.content.slice(start, idx);
      const match = m.content.slice(idx, idx + q.length);
      const post = m.content.slice(idx + q.length, end) + (end < m.content.length ? '\u2026' : '');
      // Store content prefix for verification on jump
      results.push({ threadId: t.id, threadName: t.name, msgIndex: i, role: m.role, pre, match, post, contentPrefix: m.content.slice(0, 50) });
      if (results.length >= 30) break;
    }
    if (results.length >= 30) break;
  }
  // Re-check input hasn't changed
  const input = document.getElementById('chat-thread-search');
  if (!input || input.value.trim().toLowerCase() !== q) return;
  showSearchResults(q, results);
}

function showSearchResults(query, results) {
  const list = document.getElementById('chat-thread-list');
  if (!list) return;
  if (results.length === 0) {
    // Append "no message matches" if thread list already shows no results
    if (list.textContent.includes('No matching')) {
      list.innerHTML = '<div style="padding:12px 10px;font-size:11px;color:var(--text-muted);text-align:center">No matches in conversations or messages</div>';
    }
    return;
  }
  const cap = 30;
  const truncated = results.length >= cap ? `<div style="padding:6px 10px;font-size:10px;color:var(--text-muted);text-align:center">Showing first ${cap} matches</div>` : '';
  list.innerHTML = `<div class="chat-search-results-label">Messages</div>` +
    results.map(r => {
      const icon = r.role === 'user' ? '\uD83D\uDCDD' : '\uD83E\uDD16';
      return `<div class="chat-search-result" data-prefix="${escapeHTML(r.contentPrefix)}" onclick="jumpToSearchResult('${escapeHTML(r.threadId)}',${r.msgIndex},this.dataset.prefix)">
        <div class="chat-search-result-thread">${escapeHTML(r.threadName)}</div>
        <div class="chat-search-result-snippet">${icon} ${escapeHTML(r.pre)}<mark>${escapeHTML(r.match)}</mark>${escapeHTML(r.post)}</div>
      </div>`;
    }).join('') + truncated;
}

export async function jumpToSearchResult(threadId, msgIndex, contentPrefix) {
  const input = document.getElementById('chat-thread-search');
  const query = input?.value?.trim() || '';
  // Switch to thread (re-renders messages if different thread)
  if (state.currentThreadId !== threadId) {
    await switchToThread(threadId);
    // Restore search results after thread switch re-rendered the list
    if (query) searchThreadContent(query);
  }
  // Wait for DOM to settle after potential re-render
  requestAnimationFrame(() => {
    let msgEl = document.getElementById('chat-msg-' + msgIndex);
    // Verify we're highlighting the right message (index may have shifted)
    if (msgEl && contentPrefix && state.chatHistory[msgIndex]) {
      const actual = (state.chatHistory[msgIndex].content || '').slice(0, 50);
      if (actual !== contentPrefix) {
        // Index shifted — find the right message
        const correctIdx = state.chatHistory.findIndex(m => m.content && m.content.slice(0, 50) === contentPrefix);
        if (correctIdx !== -1) msgEl = document.getElementById('chat-msg-' + correctIdx);
        else msgEl = null;
      }
    }
    if (!msgEl) return;
    // Remove stale marks from previous search
    document.querySelectorAll('.chat-search-mark').forEach(m => m.replaceWith(m.textContent));
    document.querySelectorAll('.chat-msg-highlight').forEach(m => m.classList.remove('chat-msg-highlight'));
    if (query) highlightInMessage(msgEl, query);
    const mark = msgEl.querySelector('.chat-search-mark');
    (mark || msgEl).scrollIntoView({ behavior: 'smooth', block: 'center' });
    msgEl.classList.add('chat-msg-highlight');
  });
}

function highlightInMessage(el, query) {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const q = query.toLowerCase();
  const qLen = query.length;
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  for (let i = nodes.length - 1; i >= 0; i--) {
    const node = nodes[i];
    const text = node.textContent;
    const lower = text.toLowerCase();
    // Find all match positions in this node (reverse order)
    const positions = [];
    let pos = 0;
    while ((pos = lower.indexOf(q, pos)) !== -1) {
      positions.push(pos);
      pos += qLen;
    }
    if (!positions.length) continue;
    // Split node at each match, in reverse to keep offsets valid
    const parent = node.parentNode;
    let remainder = node;
    for (let j = positions.length - 1; j >= 0; j--) {
      const idx = positions[j];
      const current = remainder.textContent;
      const before = current.slice(0, idx);
      const match = current.slice(idx, idx + qLen);
      const after = current.slice(idx + qLen);
      const mark = document.createElement('mark');
      mark.className = 'chat-search-mark';
      mark.textContent = match;
      if (after) parent.insertBefore(document.createTextNode(after), remainder.nextSibling);
      parent.insertBefore(mark, remainder.nextSibling);
      remainder.textContent = before;
    }
  }
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
