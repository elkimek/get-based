import { afterEach, describe, expect, it, vi } from 'vitest';
import {resetSyncStatus, updateSyncStatus} from '../js/sync-state.js';

import {
  RELAY_OWNER_QUOTA_BYTES,
  configureRelayHealth,
  fetchOwnerStorageFromRelay,
  getRelayQuotaEstimate,
  resetRelayQuotaEstimate,
} from '../js/sync-relay-health.js';

describe('authoritative relay storage quota', () => {
  afterEach(() => {
    configureRelayHealth({ getAppOwner: () => null, getSyncRelay: () => null, isOwnerProvisional: () => false });
    vi.unstubAllGlobals();
    localStorage.clear();
    resetSyncStatus();
  });

  it('waits for the relay handshake before probing a new v8 owner', async () => {
    configureRelayHealth({getAppOwner: () => ({id: 'new-owner', writeKey: new Uint8Array([1, 2, 3, 4])}), getSyncRelay: () => 'wss://relay.example.test'});
    const fetcher = vi.fn().mockResolvedValue({ok: true, json: async () => ({storedBytes: 10})});
    vi.stubGlobal('fetch', fetcher);
    updateSyncStatus({replication: 'Syncing'});
    expect(await fetchOwnerStorageFromRelay()).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
    updateSyncStatus({replication: 'Synced'});
    expect(await fetchOwnerStorageFromRelay()).toMatchObject({storedBytes: 10});
    expect(fetcher).toHaveBeenCalledTimes(1);
    for (const replication of ['Syncing', 'Offline', 'Error'] as const) {
      updateSyncStatus({replication});
      expect(await fetchOwnerStorageFromRelay()).toMatchObject({storedBytes: 10});
    }
    expect(fetcher).toHaveBeenCalledTimes(4);
  });

  it('discards a quota reply if the owner changed while the request was pending', async () => {
    let owner = {id: 'old-owner', writeKey: new Uint8Array([1, 2, 3, 4])};
    configureRelayHealth({getAppOwner: () => owner, getSyncRelay: () => 'wss://relay.example.test'});
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => {
      owner = {...owner, id: 'new-owner'};
      return {ok: true, json: async () => ({storedBytes: 999})};
    }));
    expect(await fetchOwnerStorageFromRelay()).toBeNull();
    expect(getRelayQuotaEstimate()?.bytes).toBe(0);
  });

  it('never probes the throwaway identity used to join an existing device', async () => {
    let provisional = true;
    configureRelayHealth({getAppOwner: () => ({id: 'provisional-owner', writeKey: new Uint8Array([1, 2, 3, 4])}),
      getSyncRelay: () => 'wss://relay.example.test', isOwnerProvisional: () => provisional});
    updateSyncStatus({replication: 'Synced'});
    const fetcher = vi.fn().mockResolvedValue({ok: true, json: async () => ({storedBytes: 10})});
    vi.stubGlobal('fetch', fetcher);
    expect(await fetchOwnerStorageFromRelay()).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
    provisional = false;
    expect(await fetchOwnerStorageFromRelay()).toMatchObject({storedBytes: 10});
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
