import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

function installLifecycleMocks(overrides = {}) {
  const deps = {
    showNotification: vi.fn(),
    getSyncBlocker: vi.fn(() => null),
    setSyncEnabled: vi.fn(),
    clearSyncDisableStorage: vi.fn(),
    resetSyncStatus: vi.fn(),
    pushAllProfiles: vi.fn(async () => {}),
    clearSyncSaveTimers: vi.fn(),
    clearSyncPullTimers: vi.fn(),
    forcePull: vi.fn(async () => {}),
    clearSyncSubscriptionTimers: vi.fn(),
    renderSyncIndicator: vi.fn(),
    initSync: vi.fn(async () => {}),
    clearSyncRuntimeState: vi.fn(),
    getSyncAppOwner: vi.fn(() => ({ id: 'owner-1' })),
    getSyncAppOwnerError: vi.fn(() => null),
    getSyncEvolu: vi.fn(() => ({ resetAppOwner: vi.fn(async () => {}) })),
    getSyncQueryLoadedPromise: vi.fn(() => Promise.resolve()),
    getSyncReadyPromise: vi.fn(() => Promise.resolve()),
    scheduleSyncRuntimeReload: vi.fn(),
    setSyncAppOwnerError: vi.fn(),
    ...overrides,
  };

  vi.doMock('../js/utils.js', () => ({
    showNotification: deps.showNotification,
  }));
  vi.doMock('../js/sync-environment.js', () => ({
    getSyncBlocker: deps.getSyncBlocker,
  }));
  vi.doMock('../js/sync-settings-state.js', () => ({
    setSyncEnabled: deps.setSyncEnabled,
  }));
  vi.doMock('../js/sync-disable-cleanup.js', () => ({
    clearSyncDisableStorage: deps.clearSyncDisableStorage,
  }));
  vi.doMock('../js/sync-state.js', () => ({
    resetSyncStatus: deps.resetSyncStatus,
  }));
  vi.doMock('../js/sync-actions.js', () => ({
    pushAllProfiles: deps.pushAllProfiles,
  }));
  vi.doMock('../js/sync-save-hooks.js', () => ({
    clearSyncSaveTimers: deps.clearSyncSaveTimers,
  }));
  vi.doMock('../js/sync-pull.js', () => ({
    clearSyncPullTimers: deps.clearSyncPullTimers,
    forcePull: deps.forcePull,
  }));
  vi.doMock('../js/sync-subscriptions.js', () => ({
    clearSyncSubscriptionTimers: deps.clearSyncSubscriptionTimers,
  }));
  vi.doMock('../js/sync-ui.js', () => ({
    renderSyncIndicator: deps.renderSyncIndicator,
  }));
  vi.doMock('../js/sync-init.js', () => ({
    initSync: deps.initSync,
  }));
  vi.doMock('../js/sync-runtime.js', () => ({
    clearSyncRuntimeState: deps.clearSyncRuntimeState,
    getSyncAppOwner: deps.getSyncAppOwner,
    getSyncAppOwnerError: deps.getSyncAppOwnerError,
    getSyncEvolu: deps.getSyncEvolu,
    getSyncQueryLoadedPromise: deps.getSyncQueryLoadedPromise,
    getSyncReadyPromise: deps.getSyncReadyPromise,
    scheduleSyncRuntimeReload: deps.scheduleSyncRuntimeReload,
    setSyncAppOwnerError: deps.setSyncAppOwnerError,
  }));

  return deps;
}

async function loadLifecycle() {
  return import('../js/sync-lifecycle.js');
}

beforeEach(async () => {
  await vi.resetModules();
  vi.clearAllMocks();
  localStorage.clear();
  sessionStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
  vi.doUnmock('../js/utils.js');
  vi.doUnmock('../js/sync-environment.js');
  vi.doUnmock('../js/sync-settings-state.js');
  vi.doUnmock('../js/sync-disable-cleanup.js');
  vi.doUnmock('../js/sync-state.js');
  vi.doUnmock('../js/sync-actions.js');
  vi.doUnmock('../js/sync-save-hooks.js');
  vi.doUnmock('../js/sync-pull.js');
  vi.doUnmock('../js/sync-subscriptions.js');
  vi.doUnmock('../js/sync-ui.js');
  vi.doUnmock('../js/sync-init.js');
  vi.doUnmock('../js/sync-runtime.js');
  vi.restoreAllMocks();
});

describe('sync lifecycle runtime behavior', () => {
  it('rejects enable when the browser cannot support sync primitives', async () => {
    const deps = installLifecycleMocks({
      getSyncBlocker: vi.fn(() => 'navigator.locks not available'),
    });
    const { enableSync } = await loadLifecycle();

    await enableSync();

    expect(deps.showNotification).toHaveBeenCalledWith(
      'Sync unavailable in this browser: navigator.locks not available',
      'error',
    );
    expect(deps.setSyncEnabled).not.toHaveBeenCalled();
    expect(deps.initSync).not.toHaveBeenCalled();
  });

  it('initializes sync, waits for owner and query readiness, then performs initial pull and push', async () => {
    const deps = installLifecycleMocks();
    const { enableSync } = await loadLifecycle();

    await enableSync();

    expect(deps.setSyncEnabled).toHaveBeenCalledWith(true);
    expect(deps.setSyncAppOwnerError).toHaveBeenCalledWith(null);
    expect(deps.initSync).toHaveBeenCalled();
    expect(deps.forcePull).toHaveBeenCalled();
    expect(deps.pushAllProfiles).toHaveBeenCalled();
    expect(deps.showNotification).toHaveBeenCalledWith('Sync enabled', 'success');
    expect(deps.renderSyncIndicator).toHaveBeenCalled();
  });

  it('initializes a provisional identity without persisting or announcing sync', async () => {
    const deps = installLifecycleMocks();
    const { enableSync } = await loadLifecycle();

    const result = await enableSync({ skipPush: true, persist: false });

    expect(result).toBe(true);
    expect(deps.setSyncEnabled).toHaveBeenCalledWith(true, { persist: false });
    expect(deps.forcePull).not.toHaveBeenCalled();
    expect(deps.pushAllProfiles).not.toHaveBeenCalled();
    expect(deps.showNotification).not.toHaveBeenCalledWith('Sync enabled', 'success');
    expect(deps.renderSyncIndicator).not.toHaveBeenCalled();
  });

  it('surfaces init failures without running initial data movement', async () => {
    const deps = installLifecycleMocks({
      getSyncEvolu: vi.fn(() => null),
      getSyncAppOwnerError: vi.fn(() => 'import failed'),
    });
    const { enableSync } = await loadLifecycle();

    await enableSync();

    expect(deps.showNotification).toHaveBeenCalledWith(
      'Sync failed to initialize. import failed',
      'error',
    );
    expect(deps.forcePull).not.toHaveBeenCalled();
    expect(deps.pushAllProfiles).not.toHaveBeenCalled();
  });

  it('disables sync, clears timers and snapshots, resets Evolu, and schedules reload', async () => {
    const resetAppOwner = vi.fn(async () => {});
    const deps = installLifecycleMocks({
      getSyncEvolu: vi.fn(() => ({ resetAppOwner })),
    });
    const { disableSync } = await loadLifecycle();

    await disableSync();

    expect(deps.setSyncEnabled).toHaveBeenCalledWith(false);
    expect(deps.setSyncAppOwnerError).toHaveBeenCalledWith(null);
    expect(deps.clearSyncSaveTimers).toHaveBeenCalled();
    expect(deps.clearSyncPullTimers).toHaveBeenCalled();
    expect(deps.clearSyncSubscriptionTimers).toHaveBeenCalled();
    expect(deps.resetSyncStatus).toHaveBeenCalled();
    expect(deps.renderSyncIndicator).toHaveBeenCalled();
    expect(deps.clearSyncDisableStorage).toHaveBeenCalled();
    expect(resetAppOwner).toHaveBeenCalledWith({ reload: false });
    expect(deps.clearSyncRuntimeState).toHaveBeenCalled();
    expect(deps.showNotification).toHaveBeenCalledWith('Sync disabled \u2014 reloading\u2026', 'success');
    expect(deps.scheduleSyncRuntimeReload).toHaveBeenCalledWith(250);
  });
});
