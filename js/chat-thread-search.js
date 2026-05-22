// chat-thread-search.js — chat thread rail message search and highlighting

import { state } from './state.js';
import { encryptedGetItem, getEncryptionEnabled } from './crypto.js';
import { escapeHTML } from './utils.js';

const threadSearchCallbacks = {
  getChatThreadKey: () => '',
  renderThreadList: () => {},
  switchToThread: async () => {},
};

const SEARCH_RESULT_LIMIT = 30;

let _threadSearchTimer = null;
let _threadContentCache = null; // { profileId, threads: Map<threadId, messages[]> }

export function configureChatThreadSearch(callbacks = {}) {
  Object.assign(threadSearchCallbacks, callbacks);
}

async function getThreadMessages(threadId) {
  // Invalidate cache on profile switch
  if (!_threadContentCache || _threadContentCache.profileId !== state.currentProfile) {
    _threadContentCache = { profileId: state.currentProfile, threads: new Map() };
  }
  if (_threadContentCache.threads.has(threadId)) return _threadContentCache.threads.get(threadId);
  try {
    const key = threadSearchCallbacks.getChatThreadKey(threadId);
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
    threadSearchCallbacks.renderThreadList();
    return;
  }
  // Instant: filter thread names
  threadSearchCallbacks.renderThreadList(value);
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
      if (results.length > SEARCH_RESULT_LIMIT) break;
    }
    if (results.length > SEARCH_RESULT_LIMIT) break;
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
  const visibleResults = results.slice(0, SEARCH_RESULT_LIMIT);
  const truncated = results.length > SEARCH_RESULT_LIMIT ? `<div style="padding:6px 10px;font-size:10px;color:var(--text-muted);text-align:center">Showing first ${SEARCH_RESULT_LIMIT} matches</div>` : '';
  list.innerHTML = `<div class="chat-search-results-label">Messages</div>` +
    visibleResults.map(r => {
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
    await threadSearchCallbacks.switchToThread(threadId);
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
