// chat-thread-search.js — chat thread rail message search and highlighting

import { state } from './state.js';
import { encryptedGetItem, getEncryptionEnabled } from './crypto.js';
import { showConfirmDialog, showNotification } from './utils.js';
import { getChatThreadNavigationView } from './chat-thread-navigation-component.js';
import { threadProjectNames } from './chat-thread-navigation-presentation.js';
import type { ChatThreadNavigationView, ChatThreadSearchResult } from './chat-thread-navigation-contract.js';
import { preferredChatScrollBehavior } from './chat-scroll.js';
import type { ChatThread } from '../types/chat-data.js';
import type { PromptDialogOptions } from './utils.js';

interface ThreadSearchCallbacks {
  getChatThreadKey: (threadId: string) => string; renderThreadList: (filter?: string) => void;
  revealMessage: (index: number) => boolean; switchToThread: (threadId: string) => Promise<void>;
}
interface ThreadProjectCallbacks {
  createNewThread: (options: { projectName: string }) => ChatThread | null;
  renderThreadList: () => void; saveChatThreadIndex: () => boolean | Promise<boolean>;
  showPromptDialog: (message: string, options: PromptDialogOptions) => Promise<unknown>;
}
interface SearchMessage { content: string; role?: unknown; [key: string]: unknown }
type ProjectSnapshot = Pick<ChatThread, 'id' | 'updatedAt'> & { projectName: ChatThread['projectName'] };
export interface ThreadMetadataReader { updatedAt?: unknown; createdAt?: unknown; messagesUpdatedAt?: unknown }

const threadSearchCallbacks: ThreadSearchCallbacks = {
  getChatThreadKey: () => '',
  renderThreadList: () => {},
  revealMessage: () => false,
  switchToThread: async () => {},
};

let _threadSearchTimer: ReturnType<typeof setTimeout> | null = null;
let _threadContentCache: { profileId: string | null; threads: Map<string, SearchMessage[]> } | null = null; // { profileId, threads: Map<threadId, messages[]> }
let searchRevision = 0;
// Saving the departing thread invalidates reads, but must not cancel its jump.
let jumpRevision = 0;

const SEARCH_RESULT_LIMIT = 30;

export function configureChatThreadSearch(callbacks: Partial<ThreadSearchCallbacks> = {}) {
  Object.assign(threadSearchCallbacks, callbacks);
}

const threadProjectCallbacks: ThreadProjectCallbacks = {
  createNewThread: _options => null,
  renderThreadList: () => {},
  saveChatThreadIndex: async () => false,
  showPromptDialog: async (_message, _options) => null,
};

export function configureChatThreadProjects(callbacks: Partial<ThreadProjectCallbacks> = {}) {
  Object.assign(threadProjectCallbacks, callbacks);
}

export function getThreadProjectNames() {
  return threadProjectNames(state.chatThreads);
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

function restoreProjectMutation(snapshots: ProjectSnapshot[]) {
  for (const snapshot of snapshots) {
    const thread = state.chatThreads.find(item => item.id === snapshot.id);
    if (!thread) continue;
    if (snapshot.projectName) thread.projectName = snapshot.projectName;
    else delete thread.projectName;
    thread.updatedAt = snapshot.updatedAt;
  }
}

function projectSnapshots(threads: ChatThread[]) {
  return threads.map(thread => ({
    id: thread.id, projectName: thread.projectName, updatedAt: thread.updatedAt,
  }));
}

export async function renameThreadProject(currentName: unknown, nextName: unknown) {
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
    markThreadMetadataChanged(thread, changedAt);
  }
  const saved = await threadProjectCallbacks.saveChatThreadIndex();
  if (profile !== state.currentProfile) return false;
  if (!saved) restoreProjectMutation(snapshots);
  threadProjectCallbacks.renderThreadList();
  if (saved) showNotification(`Project renamed to ${next}`, 'info');
  return saved;
}

export async function renameThreadProjectPrompt(projectName: unknown) {
  const profile = state.currentProfile;
  const current = String(projectName || '').trim();
  if (!current) return false;
  const name = await threadProjectCallbacks.showPromptDialog('Rename project:', {
    defaultValue: current,
    okLabel: 'Rename',
  });
  return name && profile === state.currentProfile ? renameThreadProject(current, name) : false;
}

export async function deleteThreadProject(projectName: unknown) {
  const profile = state.currentProfile;
  const current = String(projectName || '').trim();
  const affected = state.chatThreads.filter(thread => thread.projectName === current);
  if (!current || !affected.length) return false;
  const snapshots = projectSnapshots(affected);
  const changedAt = new Date().toISOString();
  for (const thread of affected) {
    delete thread.projectName;
    markThreadMetadataChanged(thread, changedAt);
  }
  const saved = await threadProjectCallbacks.saveChatThreadIndex();
  if (profile !== state.currentProfile) return false;
  if (!saved) restoreProjectMutation(snapshots);
  threadProjectCallbacks.renderThreadList();
  if (saved) showNotification('Project deleted; its conversations were kept', 'info', 5000);
  return saved;
}

export async function deleteThreadProjectPrompt(projectName: unknown) {
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

// Freeze the legacy body's clock before any metadata-only edit advances it.
export function markThreadMetadataChanged(thread: ThreadMetadataReader, updatedAt = new Date().toISOString()) {
  thread.messagesUpdatedAt ||= thread.updatedAt || thread.createdAt || updatedAt;
  thread.updatedAt = updatedAt;
}

export function toggleThreadPinned(threadId: unknown) {
  const thread = state.chatThreads.find(item => item.id === threadId);
  if (!thread) return false;
  thread.pinned = thread.pinned !== true;
  markThreadMetadataChanged(thread);
  void threadProjectCallbacks.saveChatThreadIndex();
  threadProjectCallbacks.renderThreadList();
  return thread.pinned;
}

export async function moveThreadToProject(threadId: unknown, nextProjectName: unknown) {
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
  markThreadMetadataChanged(thread);
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

async function getThreadMessages(threadId: string) {
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
    const messages: unknown = raw ? JSON.parse(raw) : [];
    const valid = Array.isArray(messages) ? messages.filter((message: unknown) => message && typeof (message as { content?: unknown }).content === 'string') as SearchMessage[] : [];
    cache.threads.set(threadId, valid);
    return valid;
  } catch { return []; }
}

// Invalidate cache when messages change
export function invalidateThreadContentCache() {
  _threadContentCache = null;
  searchRevision += 1;
  // An invalidated read cannot finish its progress or keep obsolete snippets.
  getChatThreadNavigationView()?.setSearch({ phase: 'idle', progress: '', results: [], truncated: false });
}

export function filterThreadList(value: string | null | undefined) {
  const revision = ++searchRevision;
  jumpRevision += 1;
  const input = document.getElementById('chat-thread-search') as HTMLInputElement | null;
  if (input && input.value !== (value ?? '')) input.value = value ?? '';
  if (_threadSearchTimer !== null) clearTimeout(_threadSearchTimer);
  _threadSearchTimer = null;
  if (!value || !value.trim()) {
    // Clear highlights when search is cleared
    document.querySelectorAll('.chat-search-mark').forEach(m => m.replaceWith(m.textContent!));
    document.querySelectorAll('.chat-msg-highlight').forEach(m => m.classList.remove('chat-msg-highlight'));
    threadSearchCallbacks.renderThreadList();
    return;
  }
  // Instant: filter thread names
  threadSearchCallbacks.renderThreadList(value);
  const view = getChatThreadNavigationView();
  view?.setSearch({ phase: 'pending', progress: 'Searching messages…', results: [], truncated: false });
  // Debounced: search message content
  _threadSearchTimer = setTimeout(() => { _threadSearchTimer = null; void searchThreadContent(value.trim(), revision, view); }, 250);
}

async function searchThreadContent(query: string, revision = ++searchRevision, view: ChatThreadNavigationView | null = getChatThreadNavigationView()) {
  const profile = state.currentProfile;
  const input = document.getElementById('chat-thread-search') as HTMLInputElement | null;
  const threads = state.chatThreads.slice();
  const isCurrent = () => profile === state.currentProfile && revision === searchRevision && !!view?.isCurrent()
    && document.getElementById('chat-thread-search') === input && input?.value.trim().toLowerCase() === query.toLowerCase()
    && threads.every(thread => state.chatThreads.includes(thread));
  if (!isCurrent()) return;
  const q = query.toLowerCase();
  const results: ChatThreadSearchResult[] = [];
  let scannedThreads = 0;
  for (const t of threads) {
    const input = (document.getElementById('chat-thread-search') as HTMLInputElement | null);
    if (!input || input.value.trim().toLowerCase() !== q) return;
    const messages = await getThreadMessages(t.id);
    if (!isCurrent()) return;
    scannedThreads += 1;
    for (let i = 0; i < messages.length; i++) {
      const m = messages[i]!;
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
    view?.setSearch({ phase: 'pending', progress: `Searching messages… ${scannedThreads}/${threads.length}`, results: [], truncated: false });
  }
  if (!isCurrent()) return;
  view?.setSearch({ phase: 'done', progress: '', results: results.slice(0, SEARCH_RESULT_LIMIT), truncated: results.length > SEARCH_RESULT_LIMIT });
}

export async function jumpToSearchResult(threadId: string, msgIndex: number, contentPrefix: unknown) {
  const input = (document.getElementById('chat-thread-search') as HTMLInputElement | null);
  const query = input?.value?.trim() || '';
  const profile = state.currentProfile, revision = ++jumpRevision, view = getChatThreadNavigationView();
  const contextIsCurrent = () => profile === state.currentProfile && revision === jumpRevision
    && (!view || view.isCurrent()) && document.getElementById('chat-thread-search') === input && (input?.value?.trim() || '') === query;
  if (state.currentThreadId !== threadId) await threadSearchCallbacks.switchToThread(threadId);
  if (!contextIsCurrent()) return;
  // The switch may save messages and invalidate cached reads. Refresh with the
  // current read revision while retaining this jump's independent ownership.
  if (query) void searchThreadContent(query, searchRevision, view);
  // Capture the destination accepted by the switch callback, including a no-op
  // callback. Later navigation must not highlight another conversation.
  const destination = state.currentThreadId;
  const isCurrent = () => contextIsCurrent() && state.currentThreadId === destination;
  if (!isCurrent()) return;
  threadSearchCallbacks.revealMessage(msgIndex);
  // Wait for DOM to settle after potential re-render
  requestAnimationFrame(() => {
    if (!isCurrent()) return;
    let msgEl = document.getElementById('chat-msg-' + msgIndex);
    // Verify we're highlighting the right message (index may have shifted)
    if (msgEl && contentPrefix && state.chatHistory[msgIndex]) {
      const actual = (state.chatHistory[msgIndex]!.content || '').slice(0, 50);
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
    document.querySelectorAll('.chat-search-mark').forEach(m => m.replaceWith(m.textContent!));
    document.querySelectorAll('.chat-msg-highlight').forEach(m => m.classList.remove('chat-msg-highlight'));
    if (query) highlightInMessage(msgEl, query);
    const mark = msgEl.querySelector('.chat-search-mark');
    (mark || msgEl).scrollIntoView({ behavior: preferredChatScrollBehavior(), block: 'center' });
    msgEl.classList.add('chat-msg-highlight');
  });
}

function highlightInMessage(el: Element, query: string) {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const q = query.toLowerCase();
  const qLen = query.length;
  const nodes: Node[] = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  for (let i = nodes.length - 1; i >= 0; i--) {
    const node = nodes[i]!;
    const text = node.textContent;
    if (!text) continue;
    const lower = text.toLowerCase();
    // Find all match positions in this node (reverse order)
    const positions: number[] = [];
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
      const idx = positions[j]!;
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
