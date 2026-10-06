// @vitest-environment jsdom
import { webcrypto } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { state } from '../js/state.js';
import { saveImportedData } from '../js/data.js';
import { pushContextToGateway, revokeMessengerTokenRemote, clearAgentAccessMigrationDirty as clearMigrationAfterSave } from '../js/sync.js';
import { configureSyncMessenger, _resetAgentAccessMigrationStateForTesting, captureAgentAccessOperationScope,
  clearAgentAccessMigrationDirty, isAgentAccessMigrationDirty, migrateLocalAgentAccessToProfile } from '../js/sync-messenger.js';
import { setSyncEnabled } from '../js/sync-settings-state.js';
import { disposeAgentAccessSection } from '../js/settings-agent-access-component.js';
import { hydrateMessengerSection, renderMessengerSection, regenerateMessengerToken, regenerateMessengerContextKey, toggleMessenger } from '../js/settings-agent-access-panel.js';
import { configureSettingsSyncPanelDeps } from '../js/settings-sync-panel-impl.js';
import { beginAgentAccessMutation } from '../js/settings-agent-access-mutation.js';

vi.mock('../js/data.js', () => {
  const save = vi.fn(async (_options?: { reason?: string }) => true);
  return { saveImportedData: save, saveImportedDataForProfile: vi.fn(async (_profile: string, _intent: unknown, options: { reason: string }) => save({ reason: options.reason })) };
});
vi.mock('../js/sync.js', async importOriginal => {
  const real = await importOriginal<typeof import('../js/sync.js')>();
  return { ...real, pushContextToGateway: vi.fn(), revokeMessengerTokenRemote: vi.fn(real.revokeMessengerTokenRemote), clearAgentAccessMigrationDirty: vi.fn(real.clearAgentAccessMigrationDirty) };
});
const original = state.importedData; const originalProfile = state.currentProfile;
const token = 'a'.repeat(64); const contextKey = 'b'.repeat(48);
let ownerId = 'origin-owner'; let ownerKey = new Uint8Array(32).fill(7); let relay = 'wss://origin.example.test';
const fetchSpy = vi.fn<typeof fetch>(async () => new Response(null, { status: 204 }));
function mountPanel() {
  document.body.innerHTML = `<section id="messenger-section">${renderMessengerSection()}</section>`;
  hydrateMessengerSection();
}
function deferSave() {
  let resolve!: (saved: boolean) => void;
  vi.mocked(saveImportedData).mockImplementationOnce(() => new Promise<boolean>(done => { resolve = done; }));
  return (saved: boolean) => resolve(saved);
}
beforeEach(() => {
  vi.clearAllMocks(); vi.mocked(saveImportedData).mockResolvedValue(true);
  vi.stubGlobal('crypto', webcrypto); vi.stubGlobal('fetch', fetchSpy);
  localStorage.clear(); _resetAgentAccessMigrationStateForTesting(); setSyncEnabled(true);
  ownerId = 'origin-owner'; ownerKey = new Uint8Array(32).fill(7); relay = 'wss://origin.example.test';
  state.currentProfile = 'origin-profile';
  state.importedData = { ...original, entries: [], agentAccess: { version: 1, enabled: true, token, contextKey, wearableSeriesDays: 0 } };
  configureSettingsSyncPanelDeps({ pushContextToGateway });
  configureSyncMessenger({ getAppOwner: () => ({ id: ownerId, writeKey: ownerKey }), getSyncRelay: () => relay });
});
afterEach(() => {
  disposeAgentAccessSection(); document.body.replaceChildren();
  state.importedData = original; state.currentProfile = originalProfile;
  configureSyncMessenger({ getAppOwner: () => null, getSyncRelay: () => 'wss://sync.getbased.health' });
  _resetAgentAccessMigrationStateForTesting(); setSyncEnabled(false); vi.unstubAllGlobals();
});

describe('origin ownership of Agent Access saves', () => {
  it.each([regenerateMessengerToken, regenerateMessengerContextKey, () => toggleMessenger(false)])('rolls a failed change back into its origin while preserving the new profile', async change => {
    mountPanel(); const origin = state.importedData; const finish = deferSave(); const pending = change();
    origin.entries.push({ date: '2026-01-01', markers: { 'biochemistry.glucose': 5 } });
    const other = { ...original, entries: [], contextNotes: 'Other profile draft', agentAccess: { version: 1, enabled: true, token: 'c'.repeat(64), contextKey: 'd'.repeat(48) } };
    state.currentProfile = 'other-profile'; state.importedData = other;
    window.dispatchEvent(new Event('labcharts-profile-switched'));
    finish(false); await pending;
    expect(state.importedData).toBe(other); expect(other.contextNotes).toBe('Other profile draft');
    expect(other.agentAccess.token).toBe('c'.repeat(64));
    expect(origin.agentAccess).toMatchObject({ enabled: true, token, contextKey });
    expect(origin.entries).toHaveLength(1);
    expect(pushContextToGateway).not.toHaveBeenCalled(); expect(revokeMessengerTokenRemote).not.toHaveBeenCalled();
  });

  it('retains concurrent unrelated edits and a newer synced credential after failed regeneration', async () => {
    mountPanel(); const finish = deferSave(); const pending = regenerateMessengerToken();
    state.importedData.contextNotes = 'Unsaved note';
    const live = state.importedData.agentAccess as Record<string, unknown>;
    live.token = 'c'.repeat(64); live.updatedAt = 999; live.remoteMetadata = 'Later sync';
    state.importedData.agentAccessWearableSeriesDays = 30;
    finish(false); await pending;
    expect(state.importedData.contextNotes).toBe('Unsaved note');
    expect(state.importedData.agentAccessWearableSeriesDays).toBe(30);
    expect(state.importedData.agentAccess).toMatchObject({ token: 'c'.repeat(64), contextKey, updatedAt: 999, remoteMetadata: 'Later sync' });
  });

  it('blocks overlapping changes and copying provisional credentials, then releases the UI for retry', async () => {
    mountPanel(); const finish = deferSave(); const pending = regenerateMessengerToken();
    for (const selector of ['[data-sync-action="toggle-messenger"]', '[data-sync-action="regenerate-messenger-context-key"]', '[data-sync-action="set-agent-wearable-series-days"]', '[data-sync-action="copy-messenger-token"]', '[data-sync-action="copy-agent-access-setup-command"]']) {
      expect(document.querySelector<HTMLInputElement>(selector)!.disabled).toBe(true);
    }
    const confirmed = (state.importedData.agentAccess as Record<string, unknown>).token;
    await regenerateMessengerContextKey(); await toggleMessenger(false);
    expect(saveImportedData).toHaveBeenCalledTimes(1);
    expect(state.importedData.agentAccess).toMatchObject({ token: confirmed, contextKey, enabled: true });
    finish(false); await pending;
    expect(document.querySelector<HTMLInputElement>('[data-sync-action="toggle-messenger"]')!.disabled).toBe(false);
    await regenerateMessengerContextKey(); expect(saveImportedData).toHaveBeenCalledTimes(2);
    expect((state.importedData.agentAccess as Record<string, unknown>).contextKey).not.toBe(contextKey);
  });

  it('allows another profile to save while an earlier profile mutation is pending', async () => {
    mountPanel(); const origin = state.importedData; const finish = deferSave(); const pending = regenerateMessengerContextKey();
    state.currentProfile = 'other-profile';
    state.importedData = { ...original, entries: [], agentAccess: { version: 1, enabled: true, token: 'c'.repeat(64), contextKey: 'd'.repeat(48) } };
    await regenerateMessengerContextKey();
    const otherKey = (state.importedData.agentAccess as Record<string, unknown>).contextKey;
    expect(otherKey).not.toBe('d'.repeat(48));
    finish(false); await pending;
    expect((state.importedData.agentAccess as Record<string, unknown>).contextKey).toBe(otherKey);
    expect(origin.agentAccess).toMatchObject({ token, contextKey });
  });

  it('revokes with the initiating profile, relay and copied signing key after identity/profile replacement', async () => {
    mountPanel(); const finish = deferSave(); const pending = regenerateMessengerToken();
    ownerId = 'new-owner'; ownerKey.fill(8); relay = 'wss://new.example.test';
    state.currentProfile = 'other-profile'; state.importedData = { ...original, entries: [], agentAccess: null };
    finish(true); await pending;
    await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalledOnce());
    expect(pushContextToGateway).not.toHaveBeenCalled();
    const [url, options] = fetchSpy.mock.calls[0]!;
    expect(url).toBe('https://origin.example.test/api/context'); expect(options!.method).toBe('DELETE');
    const body = JSON.parse(options!.body as string) as { ownerId: string; profileId: string; timestamp: number; signature: string };
    expect(body).toMatchObject({ ownerId: 'origin-owner', profileId: 'origin-profile' });
    const hex = (value: ArrayBuffer) => Array.from(new Uint8Array(value), byte => byte.toString(16).padStart(2, '0')).join('');
    const hash = async (text: string) => hex(await webcrypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
    const key = await webcrypto.subtle.importKey('raw', new Uint8Array(32).fill(7), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const message = `agent-context:origin-owner:${body.timestamp}:${await hash(token)}:origin-profile:${await hash('')}`;
    expect(body.signature).toBe(hex(await webcrypto.subtle.sign('HMAC', key, new TextEncoder().encode(message))));
  });

  it('guards a same-profile owner or relay change and keeps signing material out of the public scope', () => {
    const scope = captureAgentAccessOperationScope();
    expect(Object.keys(scope)).toEqual(['isCurrent']); expect(scope.isCurrent()).toBe(true);
    ownerKey.fill(8); expect(scope.isCurrent()).toBe(false);
    ownerKey.fill(7); relay = 'wss://new.example.test'; expect(scope.isCurrent()).toBe(false);
  });

  it('rolls back only the series preference, retaining concurrent profile and credential changes', () => {
    state.importedData.agentAccessWearableSeriesDays = 7;
    const mutation = beginAgentAccessMutation()!;
    state.importedData.agentAccessWearableSeriesDays = 30; mutation.captureApplied();
    state.importedData.contextNotes = 'Concurrent note';
    (state.importedData.agentAccess as Record<string, unknown>).token = 'c'.repeat(64);
    mutation.rollback(); mutation.release();
    expect(state.importedData.agentAccessWearableSeriesDays).toBe(7);
    expect(state.importedData.contextNotes).toBe('Concurrent note');
    expect((state.importedData.agentAccess as Record<string, unknown>).token).toBe('c'.repeat(64));
  });

  it('retains committed credentials when a post-save relay action throws', async () => {
    mountPanel();
    vi.mocked(pushContextToGateway).mockImplementationOnce(() => { throw new Error('Synthetic relay preparation failure'); });
    await regenerateMessengerToken();
    expect(saveImportedData).toHaveBeenCalledOnce();
    expect((state.importedData.agentAccess as Record<string, unknown>).token).not.toBe(token);
    expect(state.importedData.agentAccess).toMatchObject({ enabled: true, contextKey });
    expect(document.querySelector<HTMLInputElement>('[data-sync-action="regenerate-messenger-token"]')!.disabled).toBe(false);
    await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalledOnce());
  });

  it('keeps an awaited wearable-series failure with the initiating profile through the real change delegate', async () => {
    state.importedData.agentAccessWearableSeriesDays = 7; mountPanel();
    const origin = state.importedData; const finish = deferSave();
    const select = document.querySelector<HTMLSelectElement>('[data-sync-action="set-agent-wearable-series-days"]')!;
    select.value = '30'; select.dispatchEvent(new Event('change', { bubbles: true }));
    expect(saveImportedData).toHaveBeenCalledWith({ reason: 'agent-access-series' });
    expect(origin.agentAccessWearableSeriesDays).toBe(7);
    state.currentProfile = 'other-profile'; state.importedData = { ...original, entries: [], agentAccessWearableSeriesDays: 90, agentAccess: null };
    finish(false); await vi.waitFor(() => expect(origin.agentAccessWearableSeriesDays).toBe(7));
    expect(state.importedData.agentAccessWearableSeriesDays).toBe(90);
    expect(pushContextToGateway).not.toHaveBeenCalled();
  });

  it('does not clear a new profile migration when an earlier migration save completes', async () => {
    state.importedData.agentAccess = null;
    localStorage.setItem('labcharts-messenger-enabled', 'true'); localStorage.setItem('labcharts-messenger-token', token); localStorage.setItem('labcharts-agent-context-key', contextKey);
    const finish = deferSave(); mountPanel();
    expect(saveImportedData).toHaveBeenCalledWith({ reason: 'agent-access-migration' });
    const saved = vi.mocked(saveImportedData).mock.results[0]!.value as Promise<boolean>;
    state.currentProfile = 'other-profile'; state.importedData = { ...original, entries: [], agentAccess: null };
    localStorage.removeItem('labcharts-agent-access-migration-profile');
    localStorage.setItem('labcharts-messenger-token', 'c'.repeat(64)); localStorage.setItem('labcharts-agent-context-key', 'd'.repeat(48));
    migrateLocalAgentAccessToProfile(); expect(isAgentAccessMigrationDirty()).toBe(true);
    finish(true); await saved;
    expect(isAgentAccessMigrationDirty()).toBe(true);
    expect(clearMigrationAfterSave).not.toHaveBeenCalled();
  });

  it('tracks legacy migration persistence independently for each profile object', () => {
    const first = state.importedData; first.agentAccess = null;
    localStorage.setItem('labcharts-messenger-enabled', 'true'); localStorage.setItem('labcharts-messenger-token', token); localStorage.setItem('labcharts-agent-context-key', contextKey);
    migrateLocalAgentAccessToProfile(); expect(isAgentAccessMigrationDirty()).toBe(true);
    state.currentProfile = 'other-profile'; state.importedData = { ...original, entries: [], agentAccess: null };
    expect(isAgentAccessMigrationDirty()).toBe(false);
    // The first source belongs to its originating profile, not the new one.
    expect(migrateLocalAgentAccessToProfile()).toBeNull(); expect(isAgentAccessMigrationDirty()).toBe(false);
    localStorage.removeItem('labcharts-agent-access-migration-profile');
    localStorage.setItem('labcharts-messenger-token', 'c'.repeat(64));
    migrateLocalAgentAccessToProfile(); expect(isAgentAccessMigrationDirty()).toBe(true);
    clearAgentAccessMigrationDirty(); expect(isAgentAccessMigrationDirty()).toBe(false);
    state.currentProfile = 'origin-profile'; state.importedData = first; expect(isAgentAccessMigrationDirty()).toBe(true);
  });
});
