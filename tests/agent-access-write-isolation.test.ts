// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { state } from '../js/state.js';
import { saveImportedData } from '../js/data.js';
import * as crypto from '../js/crypto.js';
import * as sync from '../js/sync.js';
import { profileStorageKey } from '../js/profile-storage-key.js';
import { configureSyncMessenger, _resetAgentAccessMigrationStateForTesting } from '../js/sync-messenger.js';
import { regenerateMessengerToken } from '../js/settings-agent-access-panel.js';
const original = state.importedData; const originalProfile = state.currentProfile; const originalProfiles = state.profiles;
const profileId = 'agent-intent-storage'; const key = profileStorageKey(profileId, 'imported');
const token = 'a'.repeat(64); const contextKey = 'b'.repeat(48);
beforeEach(async () => {
  await crypto.encryptedRemoveItem(key); _resetAgentAccessMigrationStateForTesting();
  state.currentProfile = profileId;
  state.importedData = { ...original, entries: [], notes: [], agentAccess: { version: 1, enabled: true, token, contextKey } };
  configureSyncMessenger({ getAppOwner: () => ({ id: 'intent-owner', writeKey: new Uint8Array(32).fill(7) }) });
  vi.spyOn(sync, 'pushContextToGateway').mockImplementation(() => {});
  vi.spyOn(sync, 'revokeMessengerTokenRemote').mockImplementation(() => {});
  expect(await saveImportedData({ skipSync: true })).toBe(true);
});
afterEach(async () => {
  vi.restoreAllMocks(); await crypto.encryptedRemoveItem(key);
  state.importedData = original; state.currentProfile = originalProfile; state.profiles = originalProfiles;
  configureSyncMessenger({ getAppOwner: () => null }); _resetAgentAccessMigrationStateForTesting();
});
function pauseCredentialWrite() {
  let finish!: (success: boolean) => void; let started!: () => void;
  const reached = new Promise<void>(resolve => { started = resolve; });
  const originalWrite = crypto.encryptedSetItem; let first = true;
  vi.spyOn(crypto, 'encryptedSetItem').mockImplementation(async (...args) => {
    if (args[0] === key && first) {
      first = false; started();
      await new Promise<void>((resolve, reject) => { finish = success => success ? resolve() : reject(new Error('Synthetic storage failure')); });
    }
    return originalWrite(...args);
  });
  return { reached, finish: (success: boolean) => finish(success) };
}
async function stored() {
  return JSON.parse((await crypto.encryptedGetItem(key))!) as { notes: { date: string; text: string }[]; agentAccess: { token: string; contextKey: string } };
}
describe('credential intent and real profile persistence', () => {
  it.each([false, true])('keeps a concurrent notes save independent when the credential write succeeds=%s', async success => {
    const write = pauseCredentialWrite(); const credential = regenerateMessengerToken(); await write.reached;
    // Other services must see the last committed credential while the new one is pending.
    expect((state.importedData.agentAccess as Record<string, unknown>).token).toBe(token);
    state.importedData.notes!.push({ date: '2026-01-01', text: 'Concurrent note' });
    const notes = saveImportedData({ skipSync: true });
    write.finish(success); await credential; expect(await notes).toBe(true);
    const disk = await stored();
    expect(disk.notes).toEqual([{ date: '2026-01-01', text: 'Concurrent note' }]);
    expect(disk.agentAccess.contextKey).toBe(contextKey);
    if (success) expect(disk.agentAccess.token).not.toBe(token); else expect(disk.agentAccess.token).toBe(token);
    expect((state.importedData.agentAccess as Record<string, unknown>).token).toBe(disk.agentAccess.token);
  });

  it('commits only the originating profile when the active profile is replaced during the write', async () => {
    const origin = state.importedData; const write = pauseCredentialWrite();
    const credential = regenerateMessengerToken(); await write.reached;
    const other = { ...original, entries: [], notes: [{ date: '2026-02-01', text: 'Other profile note' }], agentAccess: { version: 1, enabled: true, token: 'c'.repeat(64), contextKey: 'd'.repeat(48) } };
    state.currentProfile = 'other-intent-profile'; state.importedData = other;
    write.finish(true); await credential;
    expect(state.importedData).toBe(other); expect(other.agentAccess.token).toBe('c'.repeat(64));
    expect(other.notes).toEqual([{ date: '2026-02-01', text: 'Other profile note' }]);
    const disk = await stored(); expect(disk.agentAccess.token).not.toBe(token);
    expect((origin.agentAccess as Record<string, unknown>).token).toBe(disk.agentAccess.token);
    expect(sync.pushContextToGateway).not.toHaveBeenCalled();
  });
});
