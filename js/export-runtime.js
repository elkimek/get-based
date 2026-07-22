// @ts-check
// export-runtime.js - Browser runtime adapters for export/import flows.

import { encryptedGetItem } from './crypto.js';
import { state } from './state.js';
import { destroyWalletDB } from './cashu-wallet.js';

/** @typedef {{
 * buildSidebar: null | (() => void),
 * ensureActiveThread: null | (() => void),
 * loadChatThreads: null | (() => any),
 * navigate: null | ((route?: string) => void),
 * renderProfileButton: null | (() => void),
 * renderThreadList: null | (() => void),
 * updateHeaderDates: null | (() => void),
 * }} ExportImportRuntimeDeps */

/** @type {ExportImportRuntimeDeps} */
const exportImportRuntimeDeps = {
  buildSidebar: null,
  ensureActiveThread: null,
  loadChatThreads: null,
  navigate: null,
  renderProfileButton: null,
  renderThreadList: null,
  updateHeaderDates: null,
};

/** @param {Partial<ExportImportRuntimeDeps>} [deps] */
export function configureExportImportRuntimeDeps(deps = {}) {
  const previous = { ...exportImportRuntimeDeps };
  if ('buildSidebar' in deps) {
    exportImportRuntimeDeps.buildSidebar = typeof deps.buildSidebar === 'function' ? deps.buildSidebar : null;
  }
  if ('ensureActiveThread' in deps) {
    exportImportRuntimeDeps.ensureActiveThread = typeof deps.ensureActiveThread === 'function'
      ? deps.ensureActiveThread
      : null;
  }
  if ('loadChatThreads' in deps) {
    exportImportRuntimeDeps.loadChatThreads = typeof deps.loadChatThreads === 'function'
      ? deps.loadChatThreads
      : null;
  }
  if ('navigate' in deps) {
    exportImportRuntimeDeps.navigate = typeof deps.navigate === 'function' ? deps.navigate : null;
  }
  if ('renderProfileButton' in deps) {
    exportImportRuntimeDeps.renderProfileButton = typeof deps.renderProfileButton === 'function'
      ? deps.renderProfileButton
      : null;
  }
  if ('renderThreadList' in deps) {
    exportImportRuntimeDeps.renderThreadList = typeof deps.renderThreadList === 'function'
      ? deps.renderThreadList
      : null;
  }
  if ('updateHeaderDates' in deps) {
    exportImportRuntimeDeps.updateHeaderDates = typeof deps.updateHeaderDates === 'function'
      ? deps.updateHeaderDates
      : null;
  }
  return previous;
}

function getRuntimeWindow() {
  return typeof window !== 'undefined'
    ? /** @type {any} */ (window)
    : /** @type {any} */ (globalThis);
}

function getRuntimeFunction(name) {
  const runtime = getRuntimeWindow();
  if (typeof runtime[name] === 'function') return runtime[name];
  return null;
}

function escapeRuntimeHTML(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  })[ch]);
}

function formatThreadDateFallback(value) {
  const date = new Date(value || Date.now());
  if (Number.isNaN(date.getTime())) return '';
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

function sortedChatThreads() {
  return (Array.isArray(state.chatThreads) ? state.chatThreads : [])
    .slice()
    .sort((a, b) => String(b?.updatedAt || '').localeCompare(String(a?.updatedAt || '')));
}

async function loadChatThreadsFromStorageFallback() {
  const raw = await encryptedGetItem(`labcharts-${state.currentProfile}-chat-threads`);
  if (!raw) {
    state.chatThreads = [];
    return true;
  }
  try {
    const parsed = JSON.parse(raw);
    state.chatThreads = Array.isArray(parsed) ? parsed : [];
    return true;
  } catch {
    return false;
  }
}

function ensureActiveThreadFallback() {
  const threads = sortedChatThreads();
  if (!threads.length) {
    state.currentThreadId = null;
    return;
  }
  const currentExists = threads.some(thread => thread?.id === state.currentThreadId);
  if (!currentExists) state.currentThreadId = threads[0]?.id || null;
}

function renderThreadListFallback() {
  if (typeof document === 'undefined') return;
  const list = document.getElementById('chat-thread-list');
  if (!list) return;
  const threads = sortedChatThreads();
  if (!threads.length) {
    list.innerHTML = '<div style="padding:12px 10px;font-size:11px;color:var(--text-muted);text-align:center">No conversations yet</div>';
    return;
  }
  list.innerHTML = threads.map(thread => {
    const threadId = escapeRuntimeHTML(thread?.id || '');
    const name = escapeRuntimeHTML(thread?.name || 'Conversation');
    const isActive = thread?.id === state.currentThreadId;
    const icon = escapeRuntimeHTML(thread?.personalityIcon || '');
    const iconTitle = thread?.personalityName
      ? ` title="${escapeRuntimeHTML(thread.personalityName)}"`
      : '';
    const updatedAt = formatThreadDateFallback(thread?.updatedAt);
    const messageCount = Math.max(0, Number(thread?.messageCount) || 0);
    return `<div class="chat-thread-item${isActive ? ' active' : ''}" data-chat-thread-action="switch" data-thread-id="${threadId}">
      <div class="chat-thread-item-name">${name}</div>
      <div class="chat-thread-item-meta">
        <span${iconTitle}>${icon}</span>
        <span>${escapeRuntimeHTML(updatedAt)}</span>
        <span>${messageCount} msg${messageCount !== 1 ? 's' : ''}</span>
      </div>
    </div>`;
  }).join('');
}

async function refreshChatThreadsRuntime() {
  const loadChatThreads = exportImportRuntimeDeps.loadChatThreads || getRuntimeFunction('loadChatThreads');
  const ensureActiveThread = exportImportRuntimeDeps.ensureActiveThread || getRuntimeFunction('ensureActiveThread');
  const renderThreadList = exportImportRuntimeDeps.renderThreadList || getRuntimeFunction('renderThreadList');
  let threadsLoaded = true;

  if (loadChatThreads) threadsLoaded = await loadChatThreads() !== false;
  else threadsLoaded = await loadChatThreadsFromStorageFallback();
  if (!threadsLoaded) return;

  if (ensureActiveThread) ensureActiveThread();
  else ensureActiveThreadFallback();

  if (renderThreadList) renderThreadList();
  else renderThreadListFallback();
}

export async function destroyWalletRuntimeDB() {
  await destroyWalletDB();
}

export function markDemoLoadingProfile(profileId) {
  getRuntimeWindow()._demoLoadingProfileId = profileId;
}

export function isDemoLoadingProfile(profileId) {
  return getRuntimeWindow()._demoLoadingProfileId === profileId;
}

export function clearDemoLoadingProfile(profileId) {
  const runtime = getRuntimeWindow();
  if (profileId && runtime._demoLoadingProfileId !== profileId) return;
  delete runtime._demoLoadingProfileId;
}

export async function refreshImportRuntimeShell(options = {}) {
  const { chat = false, profileButton = false, route = 'dashboard' } = options;
  const buildSidebar = exportImportRuntimeDeps.buildSidebar || getRuntimeFunction('buildSidebar');
  const updateHeaderDates = exportImportRuntimeDeps.updateHeaderDates || getRuntimeFunction('updateHeaderDates');
  const renderProfileButton = exportImportRuntimeDeps.renderProfileButton || getRuntimeFunction('renderProfileButton');
  const navigate = exportImportRuntimeDeps.navigate || getRuntimeFunction('navigate');

  if (chat) await refreshChatThreadsRuntime();
  buildSidebar?.();
  updateHeaderDates?.();
  if (profileButton) renderProfileButton?.();
  navigate?.(route);
}
