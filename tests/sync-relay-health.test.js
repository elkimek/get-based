import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  RELAY_OWNER_QUOTA_BYTES,
  configureRelayHealth,
  fetchOwnerStorageFromRelay,
  getRelayQuotaEstimate,
  resetRelayQuotaEstimate,
} from '../js/sync-relay-health.js';

describe('authoritative relay storage quota', () => {
  afterEach(() => {
    configureRelayHealth({ getAppOwner: () => null, getSyncRelay: () => null });
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('uses the relay-reported quota instead of the legacy 50 MB fallback', async () => {
    const ownerId = 'quota-owner';
    const quotaBytes = 200 * 1024 * 1024;
    configureRelayHealth({
      getAppOwner: () => ({ id: ownerId, writeKey: new Uint8Array([1, 2, 3, 4]) }),
      getSyncRelay: () => 'wss://relay.example.test',
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ storedBytes: 60 * 1024 * 1024, quotaBytes, messageCount: 12 }),
    }));

    const result = await fetchOwnerStorageFromRelay();
    expect(result?.quotaBytes).toBe(quotaBytes);
    expect(getRelayQuotaEstimate()).toMatchObject({
      bytes: 60 * 1024 * 1024,
      cap: quotaBytes,
      pct: 30,
      level: 'green',
    });

    expect(resetRelayQuotaEstimate()).toBe(true);
    expect(getRelayQuotaEstimate()?.cap).toBe(RELAY_OWNER_QUOTA_BYTES);
  });
});
