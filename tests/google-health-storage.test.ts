import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearLocalWearableCredential,
  deleteWearableCredentials,
  hasLocalWearableCredential,
  loadWearableCredentials,
  markLocalWearableCredential,
  saveWearableCredentials,
  wearableCredentialGenerationKey,
} from '../js/wearables-credential-vault.js';
import {
  clearSource,
  getDailyRange,
  getDailyRangeRaw,
  getMeta,
  setMeta,
  upsertDailyBatch,
} from '../js/wearables-store.js';
import { computeWearableSummary } from '../js/wearables-summary-model.js';
import type { DeviceLocalEnvelope } from '../js/wearable-storage-types.js';

const realFetch = globalThis.fetch;

beforeEach(() => {
  sessionStorage.clear();
});

afterEach(() => {
  globalThis.fetch = realFetch;
  vi.restoreAllMocks();
});

describe('Google Health privacy and source precedence', () => {
  it('encrypts credentials in a device-local vault and deletes them on request', async () => {
    const profileId = `google-vault-${crypto.randomUUID()}`;
    const initialGeneration = await saveWearableCredentials(profileId, 'google_health', {
      accessToken: 'access-plaintext-must-not-leak',
      refreshToken: 'refresh-plaintext-must-not-leak',
    });
    expect(initialGeneration).toBe(0);

    const stored = await getMeta<DeviceLocalEnvelope>(profileId, 'credential-vault-record:v1:google_health');
    expect(stored).toMatchObject({ version: 1 });
    expect(stored!.iv).toBeInstanceOf(Uint8Array);
    expect(stored!.ciphertext).toBeInstanceOf(ArrayBuffer);
    expect(JSON.stringify(stored)).not.toContain('plaintext-must-not-leak');
    await expect(loadWearableCredentials(profileId, 'google_health')).resolves.toEqual({
      accessToken: 'access-plaintext-must-not-leak',
      refreshToken: 'refresh-plaintext-must-not-leak',
      credentialGeneration: 0,
    });

    await upsertDailyBatch(profileId, [{
      source: 'google_health',
      date: '2026-07-31',
      steps: 1234,
    }]);
    await setMeta(profileId, 'last-sync:google_health', { endDate: '2026-07-31' });
    const pendingDisconnect = {
      adapterId: 'google_health',
      deleteData: true,
      createdAt: Date.now(),
    };
    const disconnectedGeneration = await deleteWearableCredentials(profileId, 'google_health', {
      source: 'google_health',
      metaKeys: ['last-sync:google_health'],
      metaWrites: {
        'pending-profile-disconnect:v1:google_health': pendingDisconnect,
      },
    });
    expect(disconnectedGeneration).toBe(1);
    await expect(loadWearableCredentials(profileId, 'google_health')).resolves.toBeNull();
    await expect(getDailyRangeRaw(profileId, 'google_health', '2026-07-31', '2026-07-31'))
      .resolves.toEqual([]);
    await expect(getMeta(profileId, 'last-sync:google_health')).resolves.toBeNull();
    await expect(getMeta(profileId, 'pending-profile-disconnect:v1:google_health'))
      .resolves.toEqual(pendingDisconnect);

    await expect(saveWearableCredentials(profileId, 'google_health', {
      accessToken: 'stale-access',
      refreshToken: 'stale-refresh',
      credentialGeneration: 0,
    })).rejects.toMatchObject({ code: 'disconnected' });
    await expect(loadWearableCredentials(profileId, 'google_health')).resolves.toBeNull();

    const staleRowsWritten = await upsertDailyBatch(profileId, [{
      source: 'google_health',
      date: '2026-08-01',
      steps: 4567,
    }], {
      versionKey: wearableCredentialGenerationKey('google_health'),
      expectedVersion: 0,
    });
    expect(staleRowsWritten).toBe(false);
    await expect(getDailyRangeRaw(profileId, 'google_health', '2026-08-01', '2026-08-01'))
      .resolves.toEqual([]);

    expect(markLocalWearableCredential(profileId, 'google_health', 0)).toBe(true);
    clearLocalWearableCredential(profileId, 'google_health', disconnectedGeneration);
    expect(markLocalWearableCredential(profileId, 'google_health', 0)).toBe(false);
    expect(hasLocalWearableCredential(profileId, 'google_health', 0)).toBe(false);
  });

  it('always encrypts Google Health daily rows even when app passphrase encryption is off', async () => {
    const profileId = `google-rows-${crypto.randomUUID()}`;
    localStorage.removeItem('labcharts-encryption-enabled');
    await upsertDailyBatch(profileId, [{
      source: 'google_health',
      date: '2026-07-31',
      hrv_rmssd: 47,
      steps: 8765,
    }]);

    const raw = await getDailyRangeRaw(profileId, 'google_health', '2026-07-31', '2026-07-31');
    expect(raw).toHaveLength(1);
    expect(raw[0]).toMatchObject({
      source: 'google_health',
      date: '2026-07-31',
      _devicePayload: { version: 1 },
    });
    expect(raw[0]).not.toHaveProperty('hrv_rmssd');
    expect(JSON.stringify(raw[0])).not.toContain('8765');

    await expect(getDailyRange(profileId, 'google_health', '2026-07-31', '2026-07-31'))
      .resolves.toEqual([expect.objectContaining({ hrv_rmssd: 47, steps: 8765 })]);
    await clearSource(profileId, 'google_health');
  });

  it('prefers independent direct sources but migrates tied legacy Fitbit data to Google Health', () => {
    const rows = {
      google_health: [{ source: 'google_health', date: '2026-07-31', hrv_rmssd: 40 }],
      oura: [{ source: 'oura', date: '2026-07-31', hrv_rmssd: 42 }],
    };
    const connections = {
      google_health: { connectedSince: '2026-07-01', lastSyncAt: 1 },
      oura: { connectedSince: '2026-07-01', lastSyncAt: 1 },
    };

    expect(computeWearableSummary(rows, connections).metrics.hrv_rmssd!.primarySource).toBe('oura');
    expect(computeWearableSummary(rows, connections, { hrv_rmssd: 'google_health' })
      .metrics.hrv_rmssd!.primarySource).toBe('google_health');

    const migrationRows = {
      google_health: rows.google_health,
      fitbit: [{ source: 'fitbit', date: '2026-07-31', hrv_rmssd: 41 }],
    };
    const migrationConnections = {
      google_health: connections.google_health,
      fitbit: { connectedSince: '2026-07-01', lastSyncAt: 1 },
    };
    expect(computeWearableSummary(migrationRows, migrationConnections).metrics.hrv_rmssd!.primarySource)
      .toBe('google_health');
    expect(computeWearableSummary(migrationRows, migrationConnections, { hrv_rmssd: 'fitbit' })
      .metrics.hrv_rmssd!.primarySource).toBe('fitbit');
  });
});
