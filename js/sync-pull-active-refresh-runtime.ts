import { configureRuntimeDependencies } from './runtime-callbacks.js';
interface SyncPullActiveRefreshDeps {
  buildSidebar: (() => unknown) | null;
  ensureActiveThread: () => unknown;
  loadChatHistory: () => unknown;
  loadChatThreads: () => unknown;
  navigate: ((route: string, options?: Record<string, unknown>) => unknown) | null;
  refreshChatPersonalities: () => unknown;
  renderThreadList: () => unknown;
}
interface SyncRefreshRuntime { CustomEvent?: typeof CustomEvent; dispatchEvent?: (event: Event) => unknown }

// sync-pull-active-refresh-runtime.js - Browser runtime adapters for active sync pull refresh hooks.

const syncPullActiveRefreshDeps: SyncPullActiveRefreshDeps = {
  buildSidebar: null,
  ensureActiveThread: () => {},
  loadChatHistory: () => undefined,
  loadChatThreads: () => undefined,
  navigate: null,
  refreshChatPersonalities: () => undefined,
  renderThreadList: () => {},
};

export function configureSyncPullActiveRefreshDeps(deps: Partial<SyncPullActiveRefreshDeps> = {}) {
  return configureRuntimeDependencies(syncPullActiveRefreshDeps, deps, ['buildSidebar', 'navigate']);
}

function getRuntimeWindow() {
  return typeof window !== 'undefined'
    ? (window as unknown as SyncRefreshRuntime)
    : null;
}

function isThenableThreadLoad(value: unknown): value is PromiseLike<unknown> {
  if ((typeof value !== 'object' && typeof value !== 'function') || value === null) return false;
  return typeof (value as { then?: unknown }).then === 'function';
}

export function refreshPulledChatRuntime() {
  const finishRefresh = (threadsLoaded: unknown) => {
    if (threadsLoaded === false) {
      syncPullActiveRefreshDeps.renderThreadList();
      return false;
    }
    syncPullActiveRefreshDeps.ensureActiveThread();
    syncPullActiveRefreshDeps.renderThreadList();
    return syncPullActiveRefreshDeps.loadChatHistory();
  };

  const refreshThreads = () => {
    const loaded = syncPullActiveRefreshDeps.loadChatThreads();
    if (isThenableThreadLoad(loaded)) return loaded.then(finishRefresh);
    return finishRefresh(loaded);
  };
  const personalitiesRefreshed = syncPullActiveRefreshDeps.refreshChatPersonalities();
  if (isThenableThreadLoad(personalitiesRefreshed)) {
    return personalitiesRefreshed.then(refreshThreads);
  }
  return refreshThreads();
}

export function rebuildPulledSidebarRuntime() {
  try { syncPullActiveRefreshDeps.buildSidebar?.(); } catch {}
}

export function navigatePulledActiveViewRuntime(route: string, options?: Record<string, unknown>) {
  syncPullActiveRefreshDeps.navigate?.(route, options);
}

export function dispatchSyncAppliedRuntime() {
  const runtime = getRuntimeWindow();
  if (!runtime || typeof runtime.CustomEvent !== 'function' || typeof runtime.dispatchEvent !== 'function') return;
  try { runtime.dispatchEvent(new runtime.CustomEvent('labcharts-sync-applied')); } catch (_) {}
}
