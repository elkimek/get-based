// @ts-check
// chat-thread-search.js — chat thread rail message search and highlighting

import { state } from './state.js';
import { encryptedGetItem, getEncryptionEnabled } from './crypto.js';
import { escapeHTML, showConfirmDialog, showNotification } from './utils.js';
import { chatMessageActionAttrs } from './chat-message-action-attrs.js';
import { preferredChatScrollBehavior } from './chat-scroll.js';

/** @type {{
 *   getChatThreadKey: (threadId: string) => string,
 *   renderThreadList: (filter?: string) => void,
 *   revealMessage: (index: number) => boolean,
 *   switchToThread: (threadId: string) => Promise<void>,
 * }} */
const threadSearchCallbacks = {
  getChatThreadKey: () => '',
  renderThreadList: () => {},
  revealMessage: () => false,
  switchToThread: async () => {},
};

/** @type {ReturnType<typeof setTimeout> | null} */
let _threadSearchTimer = null;
/** @type {{ profileId: string | null, threads: Map<string, any[]> } | null} */
let _threadContentCache = null; // { profileId, threads: Map<threadId, messages[]> }
let searchRevision = 0;

const SEARCH_RESULT_LIMIT = 30;

/** @param {Partial<typeof threadSearchCallbacks>} [callbacks] */
export function configureChatThreadSearch(callbacks = {}) {
  Object.assign(threadSearchCallbacks, callbacks);
}

const threadProjectCallbacks = {
  createNewThread: _options => null,
  renderThreadList: () => {},
  saveChatThreadIndex: async () => false,
  showPromptDialog: async (_message, _options) => null,
};

export function configureChatThreadProjects(callbacks = {}) {
  Object.assign(threadProjectCallbacks, callbacks);
}

export function getThreadProjectNames() {
  return [...new Set(state.chatThreads.map(thread => String(thread.projectName || '').trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b));
}

export async function createThreadProject() {
  const profile = state.currentProfile;
  const name = await threadProjectCallbacks.showPromptDialog('Create a project:', {
    defaultValue: '',
    okLabel: 'Create',
  });
  if (profile !== state.currentProfile) return null;
  const projectName = String(name || '').trim().slice(0, 60);
  return projectName ? threadProjectCallbacks.createNewThread({ projectName }) : null;
}

function restoreProjectMutation(snapshots) {
  for (const snapshot of snapshots) {
    const thread = state.chatThreads.find(item => item.id === snapshot.id);
    if (!thread) continue;
    if (snapshot.projectName) thread.projectName = snapshot.projectName;
    else delete thread.projectName;
    thread.updatedAt = snapshot.updatedAt;
  }
}

function projectSnapshots(threads) {
  return threads.map(thread => ({
    id: thread.id, projectName: thread.projectName, updatedAt: thread.updatedAt,
  }));
}

export async function renameThreadProject(currentName, nextName) {
  const profile = state.currentProfile;
  const current = String(currentName || '').trim();
  const next = String(nextName || '').trim().slice(0, 60);
  if (!current || !next) return false;
  if (current === next) return true;
  if (getThreadProjectNames().some(name => name !== current && name.toLocaleLowerCase() === next.toLocaleLowerCase())) {
    showNotification('A project with that name already exists', 'error');
    return false;
  }
  const affected = state.chatThreads.filter(thread => thread.projectName === current);
  if (!affected.length) return false;
  const snapshots = projectSnapshots(affected);
  const changedAt = new Date().toISOString();
  for (const thread of affected) {
    thread.projectName = next;
    thread.updatedAt = changedAt;
  }
  const saved = await threadProjectCallbacks.saveChatThreadIndex();
  if (profile !== state.currentProfile) return false;
  if (!saved) restoreProjectMutation(snapshots);
  threadProjectCallbacks.renderThreadList();
  if (saved) showNotification(`Project renamed to ${next}`, 'info');
  return saved;
}

export async function renameThreadProjectPrompt(projectName) {
  const profile = state.currentProfile;
  const current = String(projectName || '').trim();
  if (!current) return false;
  const name = await threadProjectCallbacks.showPromptDialog('Rename project:', {
    defaultValue: current,
    okLabel: 'Rename',
  });
  return name && profile === state.currentProfile ? renameThreadProject(current, name) : false;
}

export async function deleteThreadProject(projectName) {
  const profile = state.currentProfile;
  const current = String(projectName || '').trim();
  const affected = state.chatThreads.filter(thread => thread.projectName === current);
  if (!current || !affected.length) return false;
  const snapshots = projectSnapshots(affected);
  const changedAt = new Date().toISOString();
  for (const thread of affected) {
    delete thread.projectName;
    thread.updatedAt = changedAt;
  }
  const saved = await threadProjectCallbacks.saveChatThreadIndex();
  if (profile !== state.currentProfile) return false;
  if (!saved) restoreProjectMutation(snapshots);
  threadProjectCallbacks.renderThreadList();
  if (saved) showNotification('Project deleted; its conversations were kept', 'info', 5000);
  return saved;
}

export async function deleteThreadProjectPrompt(projectName) {
  const profile = state.currentProfile;
  const current = String(projectName || '').trim();
  const count = state.chatThreads.filter(thread => thread.projectName === current).length;
  if (!current || !count) return false;
  const confirmed = await showConfirmDialog(
    `Delete “${current}”? ${count === 1 ? 'Its conversation' : `Its ${count} conversations`} will be kept outside the project.`,
    { confirmLabel: 'Delete project', ariaLabel: 'Delete project' },
  );
  return confirmed && profile === state.currentProfile ? deleteThreadProject(current) : false;
}

export function toggleThreadPinned(threadId) {
  const thread = state.chatThreads.find(item => item.id === threadId);
  if (!thread) return false;
  thread.pinned = thread.pinned !== true;
  thread.updatedAt = new Date().toISOString();
  void threadProjectCallbacks.saveChatThreadIndex();
  threadProjectCallbacks.renderThreadList();
  return thread.pinned;
}

export async function moveThreadToProject(threadId, nextProjectName) {
  const profile = state.currentProfile;
  const thread = state.chatThreads.find(item => item.id === threadId);
  if (!thread) return false;
  const previous = {
    projectName: thread.projectName, pinned: thread.pinned, updatedAt: thread.updatedAt,
  };
  const projectName = String(nextProjectName || '').trim().slice(0, 60);
  if (projectName) thread.projectName = projectName;
  else delete thread.projectName;
  if (projectName) delete thread.pinned;
  thread.updatedAt = new Date().toISOString();
  const saved = await threadProjectCallbacks.saveChatThreadIndex();
  if (profile !== state.currentProfile) return false;
  if (!saved) {
    if (previous.projectName) thread.projectName = previous.projectName;
    else delete thread.projectName;
    if (previous.pinned) thread.pinned = true;
    else delete thread.pinned;
    thread.updatedAt = previous.updatedAt;
  }
  threadProjectCallbacks.renderThreadList();
  if (saved) showNotification(projectName ? `Moved to ${projectName}` : 'Removed from project', 'info');
  return saved;
}

async function getThreadMessages(threadId) {
  // Invalidate cache on profile switch
  if (!_threadContentCache || _threadContentCache.profileId !== state.currentProfile) {
    _threadContentCache = { profileId: state.currentProfile, threads: new Map() };
  }
  if (_threadContentCache.threads.has(threadId)) return _threadContentCache.threads.get(threadId) || [];
  const cache = _threadContentCache;
  try {
    const key = threadSearchCallbacks.getChatThreadKey(threadId);
    const raw = getEncryptionEnabled() ? await encryptedGetItem(key) : localStorage.getItem(key);
    if (cache !== _threadContentCache || cache.profileId !== state.currentProfile) return [];
    const messages = raw ? JSON.parse(raw) : [];
    const valid = Array.isArray(messages) ? messages.filter(message => message && typeof message.content === 'string') : [];
    cache.threads.set(threadId, valid);
    return valid;
  } catch { return []; }
}

// Invalidate cache when messages change
export function invalidateThreadContentCache() { _threadContentCache = null; searchRevision += 1; }

export function filterThreadList(value) {
  const revision = ++searchRevision;
  if (_threadSearchTimer !== null) clearTimeout(_threadSearchTimer);
  _threadSearchTimer = null;
  if (!value || !value.trim()) {
    // Clear highlights when search is cleared
    document.querySelectorAll('.chat-search-mark').forEach(m => m.replaceWith(m.textContent));
    document.querySelectorAll('.chat-msg-highlight').forEach(m => m.classList.remove('chat-msg-highlight'));
    threadSearchCallbacks.renderThreadList();
    return;
  }
  // Instant: filter thread names
  threadSearchCallbacks.renderThreadList(value);
  const list = document.getElementById('chat-thread-list');
  if (list) list.insertAdjacentHTML('beforeend', '<div class="chat-search-progress" role="status">Searching messages…</div>');
  // Debounced: search message content
  _threadSearchTimer = setTimeout(() => searchThreadContent(value.trim(), revision), 250);
}

async function searchThreadContent(query, revision) {
  const profile = state.currentProfile;
  const isCurrent = () => profile === state.currentProfile && revision === searchRevision;
  const q = query.toLowerCase();
  const results = [];
  let scannedThreads = 0;
  for (const t of state.chatThreads) {
    const input = /** @type {HTMLInputElement | null} */ (document.getElementById('chat-thread-search'));
    if (!input || input.value.trim().toLowerCase() !== q) return;
    const messages = await getThreadMessages(t.id);
    if (!isCurrent()) return;
    scannedThreads += 1;
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
    const progress = document.querySelector('.chat-search-progress');
    if (progress) progress.textContent = `Searching messages… ${scannedThreads}/${state.chatThreads.length}`;
  }
  // Re-check input hasn't changed
  const input = /** @type {HTMLInputElement | null} */ (document.getElementById('chat-thread-search'));
  if (!isCurrent() || !input || input.value.trim().toLowerCase() !== q) return;
  showSearchResults(results);
}

function showSearchResults(results) {
  const list = document.getElementById('chat-thread-list');
  if (!list) return;
  const input = /** @type {HTMLInputElement | null} */ (document.getElementById('chat-thread-search'));
  const query = input?.value?.trim() || '';
  threadSearchCallbacks.renderThreadList(query);
  const hasNameMatches = !list.textContent.includes('No matching');
  const nameResults = hasNameMatches
    ? `<div class="chat-search-results-label">Conversations</div>${list.innerHTML}`
    : '';
  if (results.length === 0 && !hasNameMatches) {
    list.innerHTML = '<div class="chat-search-empty">No matches in conversations or messages</div>';
    return;
  }
  if (results.length === 0) {
    list.innerHTML = nameResults;
    return;
  }
  const visibleResults = results.slice(0, SEARCH_RESULT_LIMIT);
  const truncated = results.length > SEARCH_RESULT_LIMIT ? `<div style="padding:6px 10px;font-size:10px;color:var(--text-muted);text-align:center">Showing first ${SEARCH_RESULT_LIMIT} matches</div>` : '';
  list.innerHTML = nameResults + `<div class="chat-search-results-label">Messages</div>` +
    visibleResults.map(r => {
      const icon = r.role === 'user' ? '\uD83D\uDCDD' : '\uD83E\uDD16';
      return `<button type="button" class="chat-search-result" ${chatMessageActionAttrs('jump-search-result', { threadId: r.threadId, index: r.msgIndex, prefix: r.contentPrefix })}>
        <span class="chat-search-result-thread">${escapeHTML(r.threadName)}</span>
        <span class="chat-search-result-snippet">${icon} ${escapeHTML(r.pre)}<mark>${escapeHTML(r.match)}</mark>${escapeHTML(r.post)}</span>
      </button>`;
    }).join('') + truncated;
}

export async function jumpToSearchResult(threadId, msgIndex, contentPrefix) {
  const input = /** @type {HTMLInputElement | null} */ (document.getElementById('chat-thread-search'));
  const query = input?.value?.trim() || '';
  // Switch to thread (re-renders messages if different thread)
  if (state.currentThreadId !== threadId) {
    await threadSearchCallbacks.switchToThread(threadId);
    // Restore search results after thread switch re-rendered the list
    if (query) searchThreadContent(query);
  }
  threadSearchCallbacks.revealMessage(msgIndex);
  // Wait for DOM to settle after potential re-render
  requestAnimationFrame(() => {
    let msgEl = document.getElementById('chat-msg-' + msgIndex);
    // Verify we're highlighting the right message (index may have shifted)
    if (msgEl && contentPrefix && state.chatHistory[msgIndex]) {
      const actual = (state.chatHistory[msgIndex].content || '').slice(0, 50);
      if (actual !== contentPrefix) {
        // Index shifted — find the right message
        const correctIdx = state.chatHistory.findIndex(m => m.content && m.content.slice(0, 50) === contentPrefix);
        if (correctIdx !== -1) {
          threadSearchCallbacks.revealMessage(correctIdx);
          msgEl = document.getElementById('chat-msg-' + correctIdx);
        }
        else msgEl = null;
      }
    }
    if (!msgEl) return;
    // Remove stale marks from previous search
    document.querySelectorAll('.chat-search-mark').forEach(m => m.replaceWith(m.textContent));
    document.querySelectorAll('.chat-msg-highlight').forEach(m => m.classList.remove('chat-msg-highlight'));
    if (query) highlightInMessage(msgEl, query);
    const mark = msgEl.querySelector('.chat-search-mark');
    (mark || msgEl).scrollIntoView({ behavior: preferredChatScrollBehavior(), block: 'center' });
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
    if (!text) continue;
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
    if (!parent) continue;
    let remainder = node;
    for (let j = positions.length - 1; j >= 0; j--) {
      const idx = positions[j];
      const current = remainder.textContent || '';
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
