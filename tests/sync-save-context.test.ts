import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createSyncSaveHooks } from '../js/sync-save-hooks-core.js';
import type { SyncSaveHooksDeps } from '../js/sync-save-hooks-core.js';
import type { RuntimeDependencyUpdates } from '../js/runtime-callbacks.js';
import { getSyncDirtyToken } from '../js/sync-dirty-state.js';

const services = {
  encryptedGetItem: async () => '{"entries":[]}',
  markChatDataLocal: () => {}, markCustomPersonalityDataLocal: () => {}, pushContextToGateway: () => {},
};
beforeEach(() => { localStorage.clear(); vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

it('reads inherited configuration once, retains invalid overrides and calls providers without a receiver', () => {
  const hooks = createSyncSaveHooks(services);
  let reads = 0;
  const receivers: unknown[] = [];
  const options = Object.create({ get isSyncEnabled() {
    reads++;
    return function (this: unknown) { receivers.push(this); return true; };
  } }) as RuntimeDependencyUpdates<SyncSaveHooksDeps>;
  try {
    const previous = hooks.configureSyncSaveHooks(options);
    expect(Object.keys(previous)).toEqual([
      'pushProfile', 'isSyncEnabled', 'isSyncConfigured', 'isEvoluReady', 'isSyncing',
      'createDefaultProfileData', 'migrateProfileData', 'getProfiles',
    ]);
    hooks.configureSyncSaveHooks({ isSyncEnabled: null } as unknown as RuntimeDependencyUpdates<SyncSaveHooksDeps>);
    hooks.onProfileSaved('profile');
    expect(getSyncDirtyToken('profile')).toMatch(/^\d+:\d+$/);
    expect(reads).toBe(1);
    expect(receivers).toEqual([undefined, undefined]);
  } finally { hooks.clearSyncSaveTimers(); }
});

it('finishes destructuring before changing callbacks and returns the original fallback reference', async () => {
  const hooks = createSyncSaveHooks(services);
  const fallback = { entries: [] };
  const enabled = () => true;
  hooks.configureSyncSaveHooks({ isSyncEnabled: enabled, createDefaultProfileData: () => fallback });
  const failure = new Error('profile getter');
  expect(() => hooks.configureSyncSaveHooks({
    isSyncEnabled: () => false,
    get getProfiles(): () => readonly unknown[] { throw failure; },
  })).toThrow(failure);
  expect(hooks.configureSyncSaveHooks({}).isSyncEnabled).toBe(enabled);
  await expect(hooks.readProfileImportedData(null)).resolves.toBe(fallback);
});

it('keeps timer cancellation scoped to its scheduling instance', async () => {
  const first = createSyncSaveHooks(services);
  const second = createSyncSaveHooks(services);
  const push = vi.fn(async () => undefined);
  first.configureSyncSaveHooks({ pushProfile: push, isSyncEnabled: () => true, isEvoluReady: () => true });
  try {
    first.onProfileSaved('first-profile', { entries: [] });
    second.clearSyncSaveTimers();
    await vi.advanceTimersByTimeAsync(250);
    expect(push).toHaveBeenCalledExactlyOnceWith('first-profile', { entries: [] });
  } finally { first.clearSyncSaveTimers(); second.clearSyncSaveTimers(); }
});
