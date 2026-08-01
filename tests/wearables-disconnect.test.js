import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const realFetch = globalThis.fetch;

const MOCKED_MODULES = [
  '../js/data.js',
  '../js/profile.js',
  '../js/state.js',
  '../js/utils.js',
  '../js/wearables-connect.js',
  '../js/wearables-credential-vault.js',
  '../js/wearables-google-health-auth.js',
  '../js/wearables-google-health.js',
  '../js/wearables-store.js',
];

beforeEach(async () => {
  await vi.resetModules();
  localStorage.clear();
});

afterEach(() => {
  for (const modulePath of MOCKED_MODULES) vi.doUnmock(modulePath);
  globalThis.fetch = realFetch;
  vi.restoreAllMocks();
});

describe('wearable disconnect deletion failures', () => {
  it('lets disconnect win over a refresh already queued for the same Google Health connection', async () => {
    const profileId = 'google-health-refresh-race';
    const deleteWearableCredentials = vi.fn();
    const loadWearableCredentials = vi.fn(async () => ({
      accessToken: 'expired-access',
      refreshToken: 'refresh-secret',
    }));
    const saveWearableCredentials = vi.fn();
    const importedData = {
      wearableConnections: {
        google_health: {
          connectedAt: '2026-08-01T00:00:00.000Z',
          expiresAt: Date.now() - 1,
          hasStoredCredentials: true,
        },
      },
      changeHistory: [],
    };

    vi.doMock('../js/state.js', () => ({ state: { importedData } }));
    vi.doMock('../js/profile.js', () => ({ getActiveProfileId: () => profileId }));
    vi.doMock('../js/data.js', () => ({ saveImportedData: vi.fn() }));
    vi.doMock('../js/wearables-store.js', () => ({
      clearSource: vi.fn(),
      countSource: vi.fn(),
      deleteMeta: vi.fn(),
      getDailyRange: vi.fn(),
      getMeta: vi.fn(),
      setMeta: vi.fn(),
      upsertDailyBatch: vi.fn(),
    }));
    vi.doMock('../js/wearables-credential-vault.js', () => ({
      deleteWearableCredentials,
      loadWearableCredentials,
      saveWearableCredentials,
    }));

    localStorage.setItem(`labcharts-wearable-credential-local:${profileId}:google_health`, '1');
    globalThis.fetch = vi.fn();
    const { withGoogleHealthRefreshLock } = await import('../js/wearables-google-health-auth.js');
    const { backfillWearable, disconnectWearable, getConnection } = await import('../js/wearables-connect.js');

    let releaseBlocker = () => {};
    const blockerGate = new Promise(resolve => { releaseBlocker = resolve; });
    let blockerStarted = false;
    const blocker = withGoogleHealthRefreshLock(async () => {
      blockerStarted = true;
      await blockerGate;
    });
    await vi.waitFor(() => expect(blockerStarted).toBe(true));

    const disconnect = disconnectWearable('google_health', { deleteData: false });
    const refreshResult = backfillWearable('google_health').catch(error => error);
    releaseBlocker();

    await blocker;
    await disconnect;
    const refreshError = await refreshResult;
    expect(refreshError).toMatchObject({ code: 'disconnected' });
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(saveWearableCredentials).not.toHaveBeenCalled();
    expect(deleteWearableCredentials).toHaveBeenCalledWith(profileId, 'google_health');
    expect(getConnection('google_health')).toBeNull();
    expect(localStorage.getItem(`labcharts-wearable-credential-local:${profileId}:google_health`)).toBeNull();
  });

  it('does not persist fetched Google Health rows or metadata after disconnect completes', async () => {
    const profileId = 'google-health-backfill-race';
    const deleteWearableCredentials = vi.fn();
    const upsertDailyBatch = vi.fn();
    const setMeta = vi.fn();
    const fetchGoogleHealthDailyRange = vi.fn(async () => [{
      source: 'google_health',
      date: '2026-08-01',
      steps: 1234,
    }]);
    const importedData = {
      wearableConnections: {
        google_health: {
          connectedAt: '2026-08-01T00:00:00.000Z',
          expiresAt: Date.now() + (60 * 60_000),
          hasStoredCredentials: true,
        },
      },
      changeHistory: [],
    };

    vi.doMock('../js/state.js', () => ({ state: { importedData } }));
    vi.doMock('../js/profile.js', () => ({ getActiveProfileId: () => profileId }));
    vi.doMock('../js/data.js', () => ({ saveImportedData: vi.fn() }));
    vi.doMock('../js/wearables-store.js', () => ({
      clearSource: vi.fn(),
      countSource: vi.fn(),
      deleteMeta: vi.fn(),
      getDailyRange: vi.fn(),
      getMeta: vi.fn(),
      setMeta,
      upsertDailyBatch,
    }));
    vi.doMock('../js/wearables-credential-vault.js', () => ({
      deleteWearableCredentials,
      loadWearableCredentials: vi.fn(async () => ({
        accessToken: 'valid-access',
        refreshToken: 'refresh-secret',
      })),
      saveWearableCredentials: vi.fn(),
    }));
    vi.doMock('../js/wearables-google-health.js', () => ({
      fetchGoogleHealthDailyRange,
      fetchGoogleHealthPersonalInfo: vi.fn(),
    }));

    localStorage.setItem(`labcharts-wearable-credential-local:${profileId}:google_health`, '1');
    const { withGoogleHealthLifecycleLock } = await import('../js/wearables-google-health-auth.js');
    const { backfillWearable, disconnectWearable, getConnection } = await import('../js/wearables-connect.js');

    let releaseBlocker = () => {};
    const blockerGate = new Promise(resolve => { releaseBlocker = resolve; });
    let blockerStarted = false;
    const blocker = withGoogleHealthLifecycleLock(async () => {
      blockerStarted = true;
      await blockerGate;
    });
    await vi.waitFor(() => expect(blockerStarted).toBe(true));

    const disconnect = disconnectWearable('google_health', { deleteData: true });
    const backfill = backfillWearable('google_health');
    releaseBlocker();

    await blocker;
    await disconnect;
    await expect(backfill).resolves.toMatchObject({ rows: 0 });
    expect(fetchGoogleHealthDailyRange).toHaveBeenCalledOnce();
    expect(upsertDailyBatch).not.toHaveBeenCalled();
    expect(setMeta).not.toHaveBeenCalled();
    expect(getConnection('google_health')).toBeNull();
    expect(localStorage.getItem(`labcharts-wearable-credential-local:${profileId}:google_health`)).toBeNull();
  });

  it('keeps Google Health credentials and connection metadata available when row deletion fails', async () => {
    const profileId = 'google-health-disconnect-failure';
    const deletionError = new Error('IndexedDB deletion failed');
    const clearSource = vi.fn().mockRejectedValue(deletionError);
    const deleteWearableCredentials = vi.fn();
    const saveImportedData = vi.fn();
    const withGoogleHealthRefreshLock = vi.fn(async callback => callback());
    const importedData = {
      wearableConnections: {
        google_health: {
          connectedAt: '2026-08-01T00:00:00.000Z',
          hasStoredCredentials: true,
        },
      },
      changeHistory: [],
    };

    vi.doMock('../js/state.js', () => ({ state: { importedData } }));
    vi.doMock('../js/profile.js', () => ({ getActiveProfileId: () => profileId }));
    vi.doMock('../js/data.js', () => ({ saveImportedData }));
    vi.doMock('../js/wearables-store.js', () => ({
      clearSource,
      countSource: vi.fn(),
      deleteMeta: vi.fn(),
      getDailyRange: vi.fn(),
      getMeta: vi.fn(),
      setMeta: vi.fn(),
      upsertDailyBatch: vi.fn(),
    }));
    vi.doMock('../js/wearables-credential-vault.js', () => ({
      deleteWearableCredentials,
      loadWearableCredentials: vi.fn(),
      saveWearableCredentials: vi.fn(),
    }));
    vi.doMock('../js/wearables-google-health-auth.js', async importOriginal => ({
      ...(await importOriginal()),
      withGoogleHealthRefreshLock,
    }));

    localStorage.setItem(`labcharts-wearable-credential-local:${profileId}:google_health`, '1');
    const { disconnectWearable, getConnection } = await import('../js/wearables-connect.js');

    await expect(disconnectWearable('google_health', { deleteData: true }))
      .rejects.toBe(deletionError);

    expect(clearSource).toHaveBeenCalledWith(profileId, 'google_health');
    expect(withGoogleHealthRefreshLock).toHaveBeenCalledOnce();
    expect(deleteWearableCredentials).not.toHaveBeenCalled();
    expect(getConnection('google_health')).toEqual(importedData.wearableConnections.google_health);
    expect(localStorage.getItem(`labcharts-wearable-credential-local:${profileId}:google_health`)).toBe('1');
    expect(saveImportedData).not.toHaveBeenCalled();
  });

  it('shows a deletion error instead of a false disconnect success', async () => {
    const disconnectError = new Error('IndexedDB deletion failed');
    const disconnectWearable = vi.fn().mockRejectedValue(disconnectError);
    const showNotification = vi.fn();

    vi.doMock('../js/wearables-connect.js', () => ({
      backfillWearable: vi.fn(),
      beginConnectOAuth: vi.fn(),
      disconnectWearable,
      getConnection: vi.fn(),
      listConnectedSources: vi.fn(() => ({})),
      loadWearableRuntimeConfig: vi.fn(),
      syncNow: vi.fn(),
    }));
    vi.doMock('../js/utils.js', async importOriginal => ({
      ...(await importOriginal()),
      showConfirmDialog: vi.fn(async () => true),
      showNotification,
    }));

    const { wearableSettingsActionHandlers } = await import('../js/wearables-settings-panel.js');
    await wearableSettingsActionHandlers.handleWearableDisconnect('google_health');

    expect(disconnectWearable).toHaveBeenCalledWith('google_health', { deleteData: true });
    expect(showNotification).toHaveBeenCalledOnce();
    expect(showNotification).toHaveBeenCalledWith(
      'Disconnect failed: IndexedDB deletion failed',
      'error',
      5000,
    );
    expect(showNotification).not.toHaveBeenCalledWith('Google Health disconnected', 'success');
  });
});
