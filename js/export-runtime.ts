// export-runtime.js - Browser runtime adapters for export/import flows.

import { createRetryingModuleLoader } from './retrying-module-loader.js';
import { configureRuntimeCallbacks } from './runtime-callbacks.js';
import { encryptedGetItem } from './crypto.js';
import { state } from './state.js';

type CashuWalletModule = typeof import('./cashu-wallet.js');

const cashuWalletModuleLoader = createRetryingModuleLoader(
  retry => retry ? loadCashuWalletRetryModule() : import('./cashu-wallet.js'),
);

export function isCashuWalletModuleLoaded() {
  return cashuWalletModuleLoader.module !== null;
}

function loadCashuWalletRetryModule(): Promise<CashuWalletModule> {
  return import('./cashu-wallet.js?lazy-retry=1' as './cashu-wallet.js');
}

export function loadCashuWalletModule() {
  return cashuWalletModuleLoader.load();
}

export interface ExportImportRuntimeDeps {
  buildSidebar: unknown;
  ensureActiveThread: unknown;
  loadChatThreads: unknown;
  navigate: unknown;
  refreshChatPersonalities: unknown;
  renderProfileButton: unknown;
  renderThreadList: unknown;
  updateHeaderDates: unknown;
}
export type ExportImportRuntimeUpdates = { [Key in keyof ExportImportRuntimeDeps]?: unknown };
interface RestoredThreadReader {
  id?: unknown; name?: unknown; personalityIcon?: unknown; personalityName?: unknown;
  updatedAt?: unknown; messageCount?: unknown;
}
type RuntimeFunction = (...args: unknown[]) => unknown;

const exportImportRuntimeDeps: ExportImportRuntimeDeps = {
  buildSidebar: null,
  ensureActiveThread: null,
  loadChatThreads: null,
  navigate: null,
  refreshChatPersonalities: null,
  renderProfileButton: null,
  renderThreadList: null,
  updateHeaderDates: null,
};

export function configureExportImportRuntimeDeps(deps: ExportImportRuntimeUpdates = {}) {
  return (configureRuntimeCallbacks as (current: ExportImportRuntimeDeps, updates: ExportImportRuntimeUpdates, keyScope: 'inherited') => ExportImportRuntimeDeps)(exportImportRuntimeDeps, deps, 'inherited');
}

function getRuntimeWindow() {
  return typeof window !== 'undefined'
    ? (window as unknown as Record<string, unknown>)
    : (globalThis as unknown as Record<string, unknown>);
}

function getRuntimeFunction(name: string) {
  const runtime = getRuntimeWindow();
  if (typeof runtime[name] === 'function') return runtime[name] as RuntimeFunction;
  return null;
}

function escapeRuntimeHTML(value: unknown) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  })[ch]!);
}

function formatThreadDateFallback(value: unknown) {
  const date = new Date((value || Date.now()) as string | number);
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
  return ((Array.isArray(state.chatThreads) ? state.chatThreads : []) as Array<RestoredThreadReader | null | undefined>)
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
    const parsed: unknown = JSON.parse(raw);
    (state as { chatThreads: unknown[] }).chatThreads = Array.isArray(parsed) ? parsed : [];
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
  if (!currentExists) (state as { currentThreadId: unknown }).currentThreadId = threads[0]?.id || null;
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
    return `<div class="chat-thread-item${isActive ? ' active' : ''}" data-thread-id="${threadId}">
      <button type="button" class="chat-thread-item-main" data-chat-thread-action="switch" aria-current="${isActive ? 'true' : 'false'}">
        <span class="chat-thread-item-name">${name}</span>
        <span class="chat-thread-item-meta">
          <span${iconTitle}>${icon}</span>
          <span>${escapeRuntimeHTML(updatedAt)}</span>
          <span>${messageCount} msg${messageCount !== 1 ? 's' : ''}</span>
        </span>
      </button>
    </div>`;
  }).join('');
}

async function refreshChatThreadsRuntime() {
  const loadChatThreads = (exportImportRuntimeDeps.loadChatThreads || getRuntimeFunction('loadChatThreads')) as RuntimeFunction | null;
  const ensureActiveThread = (exportImportRuntimeDeps.ensureActiveThread || getRuntimeFunction('ensureActiveThread')) as RuntimeFunction | null;
  const renderThreadList = (exportImportRuntimeDeps.renderThreadList || getRuntimeFunction('renderThreadList')) as RuntimeFunction | null;
  let threadsLoaded = true;

  await (exportImportRuntimeDeps.refreshChatPersonalities as RuntimeFunction | null | undefined)?.();
  if (loadChatThreads) threadsLoaded = await loadChatThreads() !== false;
  else threadsLoaded = await loadChatThreadsFromStorageFallback();
  if (!threadsLoaded) return;

  if (ensureActiveThread) ensureActiveThread();
  else ensureActiveThreadFallback();

  if (renderThreadList) renderThreadList();
  else renderThreadListFallback();
}

export async function destroyWalletRuntimeDB() {
  const wallet = cashuWalletModuleLoader.module || await loadCashuWalletModule();
  await wallet.destroyWalletDB();
}

export function markDemoLoadingProfile(profileId: unknown) {
  getRuntimeWindow()._demoLoadingProfileId = profileId;
}

export function isDemoLoadingProfile(profileId: unknown) {
  return getRuntimeWindow()._demoLoadingProfileId === profileId;
}

export function clearDemoLoadingProfile(profileId?: unknown) {
  const runtime = getRuntimeWindow();
  if (profileId && runtime._demoLoadingProfileId !== profileId) return;
  delete runtime._demoLoadingProfileId;
}

export async function refreshImportRuntimeShell(options: { chat?: unknown; profileButton?: unknown; route?: unknown } = {}) {
  const { chat = false, profileButton = false, route = 'dashboard' } = options;
  const buildSidebar = (exportImportRuntimeDeps.buildSidebar || getRuntimeFunction('buildSidebar')) as RuntimeFunction | null;
  const updateHeaderDates = (exportImportRuntimeDeps.updateHeaderDates || getRuntimeFunction('updateHeaderDates')) as RuntimeFunction | null;
  const renderProfileButton = (exportImportRuntimeDeps.renderProfileButton || getRuntimeFunction('renderProfileButton')) as RuntimeFunction | null;
  const navigate = (exportImportRuntimeDeps.navigate || getRuntimeFunction('navigate')) as RuntimeFunction | null;

  if (chat) await refreshChatThreadsRuntime();
  buildSidebar?.();
  updateHeaderDates?.();
  if (profileButton) renderProfileButton?.();
  navigate?.(route);
}
