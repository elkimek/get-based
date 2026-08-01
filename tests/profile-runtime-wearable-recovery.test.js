// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(async () => {
  await vi.resetModules();
});

afterEach(() => {
  vi.doUnmock('../js/state.js');
  vi.doUnmock('../js/wearables-connect.js');
  vi.restoreAllMocks();
});

describe('profile runtime wearable recovery', () => {
  it('finishes a pending disconnect before rebuilding the loaded profile summary', async () => {
    const profileId = 'profile-with-pending-google-disconnect';
    const importedData = {
      wearableConnections: {
        google_health: { connectedAt: '2026-08-01T00:00:00.000Z' },
      },
    };
    const state = { currentProfile: profileId, importedData };
    const calls = [];
    const recoverPendingWearableDisconnect = vi.fn(async (loadedProfileId, loadedData) => {
      calls.push('recover');
      expect(loadedProfileId).toBe(profileId);
      expect(loadedData).toBe(importedData);
      delete loadedData.wearableConnections.google_health;
      return true;
    });
    const listConnectedSources = vi.fn(() => {
      calls.push('list');
      return {};
    });
    const syncWearableSummary = vi.fn(async () => {
      calls.push('summary');
    });

    vi.doMock('../js/state.js', () => ({ state }));
    vi.doMock('../js/wearables-connect.js', () => ({
      listConnectedSources,
      recoverPendingWearableDisconnect,
      syncStaleWearablesNow: vi.fn(async () => undefined),
    }));

    const { configureProfileRefreshDeps, refreshProfileWearables } = await import('../js/profile-runtime.js');
    configureProfileRefreshDeps({
      migrateBiometricsToManual: vi.fn(async () => undefined),
      syncWearableSummary,
    });

    await refreshProfileWearables(profileId, {});

    expect(recoverPendingWearableDisconnect).toHaveBeenCalledOnce();
    expect(syncWearableSummary).toHaveBeenCalledWith(profileId, {});
    expect(calls).toEqual(['recover', 'list', 'summary']);
  });
});
