// @ts-check
// export-runtime.js - Browser runtime adapters for export/import flows.

import { encryptedGetItem } from './crypto.js';
import { state } from './state.js';

function getRuntimeWindow() {
  return typeof window !== 'undefined'
    ? /** @type {any} */ (window)
    : /** @type {any} */ (globalThis);
}

function getRuntimeFunction(module, name) {
  const runtime = getRuntimeWindow();
  if (typeof module?.[name] === 'function') return module[name];
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
    return;
  }
  try {
    const parsed = JSON.parse(raw);
    state.chatThreads = Array.isArray(parsed) ? parsed : [];
  } catch {
    state.chatThreads = [];
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

async function refreshChatThreadsRuntime(chatThreads) {
  const loadChatThreads = getRuntimeFunction(chatThreads, 'loadChatThreads');
  const ensureActiveThread = getRuntimeFunction(chatThreads, 'ensureActiveThread');
  const renderThreadList = getRuntimeFunction(chatThreads, 'renderThreadList');

  if (loadChatThreads) await loadChatThreads();
  else await loadChatThreadsFromStorageFallback();

  if (ensureActiveThread) ensureActiveThread();
  else ensureActiveThreadFallback();

  if (renderThreadList) renderThreadList();
  else renderThreadListFallback();
}

export async function getWalletBundleSettings() {
  const runtime = getRuntimeWindow();
  const mintUrl = typeof runtime.cashuGetMintUrl === 'function'
    ? await runtime.cashuGetMintUrl()
    : null;
  const nodeUrl = typeof runtime.nostrGetSelectedNode === 'function'
    ? runtime.nostrGetSelectedNode()
    : null;
  return { mintUrl, nodeUrl };
}

export async function restoreWalletBundleSettings(wallet) {
  if (!wallet) return;
  const runtime = getRuntimeWindow();
  if (wallet.mnemonic && typeof runtime.cashuRestoreWalletFromSeed === 'function') {
    await runtime.cashuRestoreWalletFromSeed(wallet.mnemonic);
  }
  if (wallet.mintUrl && typeof runtime.cashuSetMintUrl === 'function') {
    await runtime.cashuSetMintUrl(wallet.mintUrl);
  }
  if (wallet.nodeUrl && typeof runtime.nostrSetSelectedNode === 'function') {
    runtime.nostrSetSelectedNode(wallet.nodeUrl);
  }
}

export async function destroyWalletRuntimeDB() {
  const runtime = getRuntimeWindow();
  if (typeof runtime.cashuDestroyWalletDB !== 'function') return;
  await runtime.cashuDestroyWalletDB();
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
  const [
    chatThreads,
    nav,
    data,
    views,
  ] = await Promise.all([
    chat ? import('./chat-threads.js').catch(() => null) : Promise.resolve(null),
    import('./nav.js').catch(() => null),
    import('./data.js').catch(() => null),
    import('./views.js').catch(() => null),
  ]);

  const buildSidebar = getRuntimeFunction(nav, 'buildSidebar');
  const updateHeaderDates = getRuntimeFunction(data, 'updateHeaderDates');
  const renderProfileButton = getRuntimeFunction(nav, 'renderProfileButton');
  const navigate = getRuntimeFunction(views, 'navigate');

  if (chat) await refreshChatThreadsRuntime(chatThreads);
  buildSidebar?.();
  updateHeaderDates?.();
  if (profileButton) renderProfileButton?.();
  navigate?.(route);
}

export function publishExportGlobals(api) {
  Object.assign(getRuntimeWindow(), api);
}
