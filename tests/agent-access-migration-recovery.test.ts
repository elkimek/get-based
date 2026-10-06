// @vitest-environment jsdom
import { webcrypto } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { state } from '../js/state.js';
import * as data from '../js/data.js';
import * as crypto from '../js/crypto.js';
import * as sync from '../js/sync.js';
import { getBlob } from '../js/blob-storage.js';
import { profileStorageKey } from '../js/profile-storage-key.js';
import { rememberProfileData } from '../js/profile-data-writes.js';
import { _resetAgentAccessMigrationStateForTesting, configureSyncMessenger,
  getAgentAccessState, isAgentAccessMigrationDirty, migrateLocalAgentAccessToProfile,
  refreshAgentAccessFromSyncedProfile, clearLegacyAgentAccessSecrets, generateMessengerToken } from '../js/sync-messenger.js';
import { refreshMessengerSectionForOwnerChange, regenerateMessengerToken } from '../js/settings-agent-access-panel.js';

const original = state.importedData; const originalProfile = state.currentProfile; const originalProfiles = state.profiles;
const originalStorage = Array.from({ length: localStorage.length }, (_, i) => [localStorage.key(i)!, localStorage.getItem(localStorage.key(i)!)!] as const);
const profileId = 'agent-migration-recovery'; const key = profileStorageKey(profileId, 'imported');
const token = 'a'.repeat(64); const contextKey = 'gbctx_v1_' + 'B'.repeat(43);
const bindingKey = 'labcharts-agent-access-migration-profile';
const testWindow = window as Window & { __WEARABLES_TEST?: boolean }; const originalFlag = testWindow.__WEARABLES_TEST;
beforeEach(async () => {
  vi.stubGlobal('crypto', webcrypto); localStorage.clear(); _resetAgentAccessMigrationStateForTesting();
  testWindow.__WEARABLES_TEST = true; await crypto._setTestSessionKey('synthetic recovery passphrase');
  localStorage.setItem('labcharts-encryption-enabled', 'true'); await crypto.encryptedRemoveItem(key);
  state.currentProfile = profileId;
  state.importedData = { ...original, entries: [], notes: [{ date: '2026-01-01', text: 'Existing note' }], agentAccess: null };
  delete state.importedData.agentAccessWearableSeriesDays;
  configureSyncMessenger({ getAppOwner: () => null });
  vi.spyOn(sync, 'pushContextToGateway').mockImplementation(() => {});
  vi.spyOn(sync, 'revokeMessengerTokenRemote').mockImplementation(() => {});
  expect(await data.saveImportedData({ skipSync: true })).toBe(true);
  expect(await getBlob(key)).toMatch(/^v1:/);
});
afterEach(async () => {
  vi.restoreAllMocks(); await crypto.encryptedRemoveItem(key); await crypto._setTestSessionKey(null);
  if (originalFlag === undefined) delete testWindow.__WEARABLES_TEST; else testWindow.__WEARABLES_TEST = originalFlag;
  localStorage.clear(); for (const [name, value] of originalStorage) localStorage.setItem(name, value);
  state.importedData = original; state.currentProfile = originalProfile; state.profiles = originalProfiles;
  _resetAgentAccessMigrationStateForTesting(); configureSyncMessenger({ getAppOwner: () => null }); vi.unstubAllGlobals();
});
function seed(enabled = true) {
  localStorage.setItem('labcharts-messenger-enabled', String(enabled));
  localStorage.setItem('labcharts-messenger-token', token); localStorage.setItem('labcharts-agent-context-key', contextKey);
  localStorage.setItem(`labcharts-${profileId}-agent-wearable-series`, '30');
}
function expectSource(enabled = true) {
  expect(localStorage.getItem('labcharts-messenger-enabled')).toBe(String(enabled));
  expect(localStorage.getItem('labcharts-messenger-token')).toBe(token);
  expect(localStorage.getItem('labcharts-agent-context-key')).toBe(contextKey);
  expect(localStorage.getItem(`labcharts-${profileId}-agent-wearable-series`)).toBe('30');
  expect(localStorage.getItem(bindingKey)).toBe(profileId);
}
async function reloadProfile() {
  // Reload discards all volatile migration state; only real persisted data and
  // the existing source/non-secret binding remain. Keep the unlocked test key.
  _resetAgentAccessMigrationStateForTesting();
  state.currentProfile = profileId;
  state.importedData = JSON.parse((await crypto.encryptedGetItem(key, { throwOnDecryptError: true }))!) as typeof state.importedData;
  rememberProfileData(state.importedData);
}
function failBlobWrites() {
  let fail = true; const attempts: string[] = []; const put = IDBObjectStore.prototype.put;
  vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (this: IDBObjectStore, value: unknown, storageKey?: IDBValidKey) {
    if (storageKey === key && fail) { attempts.push(String(value)); throw new DOMException('Synthetic quota failure', 'QuotaExceededError'); }
    return put.call(this, value, storageKey);
  });
  return { attempts, release() { fail = false; } };
}
async function refreshAndSave() {
  const save = vi.spyOn(data, 'saveImportedData');
  refreshMessengerSectionForOwnerChange();
  expect(save).toHaveBeenCalledWith({ reason: 'agent-access-migration' });
  const result = await save.mock.results[0]!.value as boolean;
  save.mockRestore(); return result;
}
describe('legacy Agent Access durable recovery', () => {
  it.each([true, false])('retains the original source after an encrypted IndexedDB failure/reload with enabled=%s', async enabled => {
    seed(enabled); const writes = failBlobWrites();
    expect(await refreshAndSave()).toBe(false); expect(isAgentAccessMigrationDirty()).toBe(true); expectSource(enabled);
    expect(writes.attempts).toHaveLength(1); expect(writes.attempts[0]).toMatch(/^v1:/);
    expect(writes.attempts[0]).not.toContain(token); expect(writes.attempts[0]).not.toContain(contextKey);
    refreshAgentAccessFromSyncedProfile(); expectSource(enabled);
    await reloadProfile(); expect(state.importedData.agentAccess).toBeNull();
    // Startup/profile-switch presentation must not delete a bound retry source.
    refreshAgentAccessFromSyncedProfile({ migrateLegacy: false, clearWhenMissing: true }); expectSource(enabled);
    writes.release(); expect(await refreshAndSave()).toBe(true);
    expect(isAgentAccessMigrationDirty()).toBe(false);
    expect(localStorage.getItem('labcharts-messenger-token')).toBeNull();
    expect(localStorage.getItem('labcharts-agent-context-key')).toBeNull(); expect(localStorage.getItem(bindingKey)).toBeNull();
    expect(await getBlob(key)).toMatch(/^v1:/);
    await reloadProfile(); expect(getAgentAccessState()).toMatchObject({ enabled, token, contextKey, wearableSeriesDays: 30 });
    expect(state.importedData.notes).toEqual([{ date: '2026-01-01', text: 'Existing note' }]);
  });

  it('keeps the failed origin source out of a new profile and recovers it on return/reload', async () => {
    seed(); const writes = failBlobWrites(); expect(await refreshAndSave()).toBe(false);
    state.currentProfile = 'other-recovery-profile'; state.importedData = { ...original, entries: [], agentAccess: null };
    refreshAgentAccessFromSyncedProfile({ migrateLegacy: false, clearWhenMissing: true });
    expect(migrateLocalAgentAccessToProfile()).toBeNull(); expect(state.importedData.agentAccess).toBeNull();
    clearLegacyAgentAccessSecrets(); generateMessengerToken();
    expect((state.importedData.agentAccess as Record<string, unknown>).token).not.toBe(token);
    expectSource();
    writes.release(); await reloadProfile(); expect(await refreshAndSave()).toBe(true);
    expect(getAgentAccessState()).toMatchObject({ enabled: true, token, contextKey, wearableSeriesDays: 30 });
    expect(localStorage.getItem(bindingKey)).toBeNull();
  });

  it('confirms persistence after a reload between the committed write and source cleanup', async () => {
    seed(); migrateLocalAgentAccessToProfile();
    expect(await data.saveImportedData({ skipSync: true })).toBe(true); expectSource();
    await reloadProfile(); expect(isAgentAccessMigrationDirty()).toBe(false);
    expect(await refreshAndSave()).toBe(true); expect(isAgentAccessMigrationDirty()).toBe(false);
    expect(localStorage.getItem('labcharts-messenger-token')).toBeNull(); expect(localStorage.getItem(bindingKey)).toBeNull();
    expect(getAgentAccessState()).toMatchObject({ enabled: true, token, contextKey });
  });

  it('persists a complete regenerated credential after the initial migration write fails', async () => {
    seed(); configureSyncMessenger({ getAppOwner: () => ({ id: 'recovery-owner', writeKey: new Uint8Array(32).fill(7) }) });
    const originalWrite = crypto.encryptedSetItem; let writes = 0;
    let entered!: () => void; const reached = new Promise<void>(resolve => { entered = resolve; });
    let rejectMigration!: () => void;
    vi.spyOn(crypto, 'encryptedSetItem').mockImplementation(async (...args) => {
      if (args[0] !== key) return originalWrite(...args);
      writes += 1;
      if (writes === 1) { entered(); await new Promise<void>((_resolve, reject) => { rejectMigration = () => reject(new Error('Synthetic initial migration failure')); }); }
      // The credential save must be complete on its own, even if a later
      // opportunistic migration save cannot repair omitted fields.
      if (writes >= 3) throw new Error('Synthetic subsequent migration failure');
      return originalWrite(...args);
    });
    const initial = refreshAndSave(); await reached;
    const regenerate = regenerateMessengerToken(); rejectMigration();
    expect(await initial).toBe(false); await regenerate;
    const persisted = JSON.parse((await crypto.encryptedGetItem(key))!) as typeof state.importedData;
    expect(persisted.agentAccess).toMatchObject({ enabled: true, contextKey });
    expect(persisted.agentAccessWearableSeriesDays).toBe(30);
    expect((persisted.agentAccess as Record<string, unknown>).token).not.toBe(token);
    expect(getAgentAccessState().token).toBe((persisted.agentAccess as Record<string, unknown>).token);
    expect(localStorage.getItem('labcharts-messenger-token')).toBeNull();
    expect(localStorage.getItem('labcharts-agent-context-key')).toBeNull();
  });

  it('keeps a source retryable when its non-secret profile binding cannot be written', () => {
    seed(); const set = Storage.prototype.setItem;
    const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, name: string, value: string) {
      if (name === bindingKey) throw new DOMException('Synthetic quota failure', 'QuotaExceededError');
      return set.call(this, name, value);
    });
    expect(migrateLocalAgentAccessToProfile()).toBeNull(); expect(state.importedData.agentAccess).toBeNull();
    expect(isAgentAccessMigrationDirty()).toBe(false); expect(localStorage.getItem('labcharts-messenger-token')).toBe(token);
    // A subsequently generated, uncommitted credential must not delete the old
    // source just because the non-secret claim itself could not be persisted.
    expect(generateMessengerToken().token).not.toBe(token);
    expect(localStorage.getItem('labcharts-messenger-token')).toBe(token);
    expect(localStorage.getItem('labcharts-agent-context-key')).toBe(contextKey);
    state.importedData.agentAccess = null;
    write.mockRestore(); expect(migrateLocalAgentAccessToProfile()).toMatchObject({ enabled: true, token, contextKey }); expectSource();
  });

  it('preserves a durable revoke tombstone over a bound retry source after reload', async () => {
    seed(); migrateLocalAgentAccessToProfile();
    state.importedData.agentAccess = { version: 1, enabled: false, token: null, contextKey: null, revokedAt: 123 };
    expect(await data.saveImportedData({ skipSync: true })).toBe(true); expectSource();
    await reloadProfile(); expect(await refreshAndSave()).toBe(true);
    expect(getAgentAccessState()).toMatchObject({ enabled: false, token: null, contextKey: null, revokedAt: 123 });
    expect(localStorage.getItem('labcharts-messenger-enabled')).toBe('false');
    expect(localStorage.getItem('labcharts-messenger-token')).toBeNull(); expect(localStorage.getItem(bindingKey)).toBeNull();
  });
});
