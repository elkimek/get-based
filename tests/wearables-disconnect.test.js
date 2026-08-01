import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const MOCKED_MODULES = [
  '../js/data.js',
  '../js/profile.js',
  '../js/state.js',
  '../js/utils.js',
  '../js/wearables-connect.js',
  '../js/wearables-credential-vault.js',
  '../js/wearables-store.js',
];

beforeEach(async () => {
  await vi.resetModules();
  localStorage.clear();
});

afterEach(() => {
  for (const modulePath of MOCKED_MODULES) vi.doUnmock(modulePath);
  vi.restoreAllMocks();
});

describe('wearable disconnect deletion failures', () => {
  it('keeps Google Health credentials and connection metadata available when row deletion fails', async () => {
    const profileId = 'google-health-disconnect-failure';
    const deletionError = new Error('IndexedDB deletion failed');
    const clearSource = vi.fn().mockRejectedValue(deletionError);
    const deleteWearableCredentials = vi.fn();
    const saveImportedData = vi.fn();
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

    localStorage.setItem(`labcharts-wearable-credential-local:${profileId}:google_health`, '1');
    const { disconnectWearable, getConnection } = await import('../js/wearables-connect.js');

    await expect(disconnectWearable('google_health', { deleteData: true }))
      .rejects.toBe(deletionError);

    expect(clearSource).toHaveBeenCalledWith(profileId, 'google_health');
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
