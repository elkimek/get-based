import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const realFetch = globalThis.fetch;

const MOCKED_MODULES = [
  '../js/data.js',
  '../js/profile.js',
  '../js/state.js',
  '../js/utils.js',
  '../js/wearables-connect.js',
  '../js/wearables-credential-vault.js',
  '../js/wearables-disconnect-recovery.js',
  '../js/wearables-google-health-auth.js',
  '../js/wearables-google-health.js',
  '../js/wearables-store.js',
];

function credentialVaultModule(overrides = {}) {
  return {
    clearLocalWearableCredential: vi.fn((profileId, adapterId, generation = 0) => {
      localStorage.setItem(`labcharts-wearable-credential-generation:${profileId}:${adapterId}`, String(generation || 0));
      localStorage.removeItem(`labcharts-wearable-credential-local:${profileId}:${adapterId}`);
    }),
    deleteWearableCredentials: vi.fn(),
    hasLocalWearableCredential: vi.fn((profileId, adapterId, generation = 0) => {
      const marker = localStorage.getItem(`labcharts-wearable-credential-local:${profileId}:${adapterId}`);
      return marker === String(generation) || (generation === 0 && marker === '1');
    }),
    loadWearableCredentials: vi.fn(),
    markLocalWearableCredential: vi.fn(() => true),
    saveWearableCredentials: vi.fn(),
    ...overrides,
  };
}

async function enableGoogleHealthForTest() {
  const adapters = await import('../js/wearable-adapters.js');
  adapters.applyOAuthOverrides({ google_health: 'google-health-test-client' });
  adapters.applyOAuthConfigured({ google_health: true });
}

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
    vi.doMock('../js/data.js', () => ({
      saveImportedData: vi.fn(),
      saveImportedDataForProfile: vi.fn(async () => true),
    }));
    vi.doMock('../js/wearables-store.js', () => ({
      clearSource: vi.fn(),
      countSource: vi.fn(),
      deleteMeta: vi.fn(),
      getDailyRange: vi.fn(),
      getMeta: vi.fn(),
      setMeta: vi.fn(),
      upsertDailyBatch: vi.fn(),
    }));
    vi.doMock('../js/wearables-credential-vault.js', () => credentialVaultModule({
      deleteWearableCredentials,
      loadWearableCredentials,
      saveWearableCredentials,
    }));

    localStorage.setItem(`labcharts-wearable-credential-local:${profileId}:google_health`, '1');
    globalThis.fetch = vi.fn();
    await enableGoogleHealthForTest();
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
    expect(deleteWearableCredentials).toHaveBeenCalledWith(profileId, 'google_health', {
      metaWrites: {
        'pending-profile-disconnect:v1:google_health': {
          adapterId: 'google_health',
          deleteData: false,
          createdAt: expect.any(Number),
        },
      },
    });
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
    vi.doMock('../js/data.js', () => ({
      saveImportedData: vi.fn(),
      saveImportedDataForProfile: vi.fn(async () => true),
    }));
    vi.doMock('../js/wearables-store.js', () => ({
      clearSource: vi.fn(),
      countSource: vi.fn(),
      deleteMeta: vi.fn(),
      getDailyRange: vi.fn(),
      getMeta: vi.fn(),
      setMeta,
      upsertDailyBatch,
    }));
    vi.doMock('../js/wearables-credential-vault.js', () => credentialVaultModule({
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
    await enableGoogleHealthForTest();
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

  it('finishes a Google Health purge against the initiating profile after a profile switch', async () => {
    const profileA = 'google-health-profile-a';
    const profileB = 'google-health-profile-b';
    let activeProfileId = profileA;
    let releaseDelete = () => {};
    const deleteGate = new Promise(resolve => { releaseDelete = resolve; });
    const deleteWearableCredentials = vi.fn(async () => {
      await deleteGate;
      return 1;
    });
    const saveImportedDataForProfile = vi.fn(async () => true);
    const importedA = {
      wearableConnections: {
        google_health: {
          connectedAt: '2026-08-01T00:00:00.000Z',
          hasStoredCredentials: true,
        },
      },
      wearableSummary: {
        sources: { google_health: { coverageDays: 1 } },
        metrics: { hrv_rmssd: { primarySource: 'google_health', latest: 44 } },
      },
      changeHistory: [{
        ts: Date.parse('2026-08-01T00:00:00.000Z'),
        type: 'wearable',
        kind: 'trend-flip',
        source: 'google_health',
        metricId: 'hrv_rmssd',
      }],
    };
    const importedB = {
      wearableConnections: {
        oura: { connectedAt: '2026-08-01T00:00:00.000Z', accessToken: 'profile-b-token' },
      },
      wearableSummary: { sources: { oura: { coverageDays: 1 } }, metrics: {} },
      changeHistory: [{ field: 'exercise', date: '2026-08-01' }],
    };
    const state = { currentProfile: profileA, importedData: importedA };

    vi.doMock('../js/state.js', () => ({ state }));
    vi.doMock('../js/profile.js', () => ({ getActiveProfileId: () => activeProfileId }));
    vi.doMock('../js/data.js', () => ({
      saveImportedData: vi.fn(),
      saveImportedDataForProfile,
    }));
    vi.doMock('../js/wearables-store.js', () => ({
      clearSource: vi.fn(),
      countSource: vi.fn(),
      deleteMeta: vi.fn(),
      getDailyRange: vi.fn(),
      getMeta: vi.fn(),
      setMeta: vi.fn(),
      upsertDailyBatch: vi.fn(),
    }));
    vi.doMock('../js/wearables-credential-vault.js', () => credentialVaultModule({
      deleteWearableCredentials,
    }));

    localStorage.setItem(`labcharts-wearable-credential-local:${profileA}:google_health`, '1');
    const { disconnectWearable } = await import('../js/wearables-connect.js');
    const disconnect = disconnectWearable('google_health', { deleteData: true });
    await vi.waitFor(() => expect(deleteWearableCredentials).toHaveBeenCalledOnce());

    activeProfileId = profileB;
    state.currentProfile = profileB;
    state.importedData = importedB;
    releaseDelete();
    await disconnect;

    expect(importedA.wearableConnections.google_health).toBeUndefined();
    expect(importedA.changeHistory).toEqual([]);
    expect(importedA._deleted.changeHistory).toHaveLength(1);
    expect(importedA.wearableSummary).toBeUndefined();
    expect(importedB).toEqual({
      wearableConnections: {
        oura: { connectedAt: '2026-08-01T00:00:00.000Z', accessToken: 'profile-b-token' },
      },
      wearableSummary: { sources: { oura: { coverageDays: 1 } }, metrics: {} },
      changeHistory: [{ field: 'exercise', date: '2026-08-01' }],
    });
    expect(saveImportedDataForProfile).toHaveBeenCalledWith(profileA, importedA);
  });

  it('recovers Google Health profile cleanup after the first profile save fails', async () => {
    const profileId = 'google-health-disconnect-recovery';
    const pendingKey = 'pending-profile-disconnect:v1:google_health';
    const persistedBeforeDisconnect = {
      wearableConnections: {
        google_health: {
          connectedAt: '2026-08-01T00:00:00.000Z',
          hasStoredCredentials: true,
        },
      },
      wearableSummary: {
        sources: { google_health: { coverageDays: 1 } },
        metrics: { hrv_rmssd: { primarySource: 'google_health', latest: 44 } },
      },
      changeHistory: [{
        ts: Date.parse('2026-08-01T00:00:00.000Z'),
        type: 'wearable',
        kind: 'trend-flip',
        source: 'google_health',
        metricId: 'hrv_rmssd',
      }],
    };
    const state = {
      currentProfile: profileId,
      importedData: structuredClone(persistedBeforeDisconnect),
    };
    let saveSucceeds = false;
    const saveImportedDataForProfile = vi.fn(async () => saveSucceeds);
    const deleteWearableCredentials = vi.fn(async () => 1);
    const deleteMeta = vi.fn(async () => undefined);
    const getMeta = vi.fn(async (_profileId, key) => key === pendingKey ? {
      adapterId: 'google_health',
      deleteData: true,
      createdAt: Date.now(),
    } : null);

    vi.doMock('../js/state.js', () => ({ state }));
    vi.doMock('../js/profile.js', () => ({ getActiveProfileId: () => profileId }));
    vi.doMock('../js/data.js', () => ({
      saveImportedData: vi.fn(),
      saveImportedDataForProfile,
    }));
    vi.doMock('../js/wearables-store.js', () => ({
      clearSource: vi.fn(),
      countSource: vi.fn(),
      deleteMeta,
      getDailyRange: vi.fn(),
      getMeta,
      setMeta: vi.fn(),
      upsertDailyBatch: vi.fn(),
    }));
    vi.doMock('../js/wearables-credential-vault.js', () => credentialVaultModule({
      deleteWearableCredentials,
    }));

    localStorage.setItem(`labcharts-wearable-credential-local:${profileId}:google_health`, '1');
    const { disconnectWearable, recoverPendingWearableDisconnect } = await import('../js/wearables-connect.js');

    await expect(disconnectWearable('google_health', { deleteData: true }))
      .rejects.toThrow('could not be persisted');
    expect(deleteWearableCredentials).toHaveBeenCalledWith(profileId, 'google_health', {
      source: 'google_health',
      metaKeys: ['last-sync:google_health'],
      metaWrites: {
        [pendingKey]: {
          adapterId: 'google_health',
          deleteData: true,
          createdAt: expect.any(Number),
        },
      },
    });
    expect(deleteMeta).not.toHaveBeenCalled();

    // A reload restores the old profile snapshot, while the transactionally
    // written IndexedDB journal survives to finish the profile-side purge.
    state.importedData = structuredClone(persistedBeforeDisconnect);
    saveSucceeds = true;
    await expect(recoverPendingWearableDisconnect(profileId, state.importedData))
      .resolves.toBe(true);

    expect(state.importedData.wearableConnections.google_health).toBeUndefined();
    expect(state.importedData.changeHistory).toEqual([]);
    expect(state.importedData._deleted.changeHistory).toHaveLength(1);
    expect(state.importedData.wearableSummary).toBeUndefined();
    expect(saveImportedDataForProfile).toHaveBeenLastCalledWith(profileId, state.importedData);
    expect(deleteMeta).toHaveBeenCalledWith(profileId, pendingKey);
  });

  it('keeps Google Health credentials and connection metadata available when row deletion fails', async () => {
    const profileId = 'google-health-disconnect-failure';
    const deletionError = new Error('IndexedDB deletion failed');
    const clearSource = vi.fn();
    const deleteWearableCredentials = vi.fn().mockRejectedValue(deletionError);
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
    const saveImportedDataForProfile = vi.fn();
    vi.doMock('../js/data.js', () => ({ saveImportedData, saveImportedDataForProfile }));
    vi.doMock('../js/wearables-store.js', () => ({
      clearSource,
      countSource: vi.fn(),
      deleteMeta: vi.fn(),
      getDailyRange: vi.fn(),
      getMeta: vi.fn(),
      setMeta: vi.fn(),
      upsertDailyBatch: vi.fn(),
    }));
    vi.doMock('../js/wearables-credential-vault.js', () => credentialVaultModule({
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

    expect(clearSource).not.toHaveBeenCalled();
    expect(withGoogleHealthRefreshLock).toHaveBeenCalledOnce();
    expect(deleteWearableCredentials).toHaveBeenCalledWith(profileId, 'google_health', {
      source: 'google_health',
      metaKeys: ['last-sync:google_health'],
      metaWrites: {
        'pending-profile-disconnect:v1:google_health': {
          adapterId: 'google_health',
          deleteData: true,
          createdAt: expect.any(Number),
        },
      },
    });
    expect(getConnection('google_health')).toEqual(importedData.wearableConnections.google_health);
    expect(localStorage.getItem(`labcharts-wearable-credential-local:${profileId}:google_health`)).toBe('1');
    expect(saveImportedData).not.toHaveBeenCalled();
    expect(saveImportedDataForProfile).not.toHaveBeenCalled();
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
