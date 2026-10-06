// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { state } from '../js/state.js';
import { configureSyncMessenger } from '../js/sync-messenger.js';
import { setSyncEnabled } from '../js/sync-settings-state.js';
import { disposeAgentAccessSection, getAgentAccessView } from '../js/settings-agent-access-component.js';
import {
  buildAgentAccessSetupCommand, hydrateMessengerSection, refreshMessengerSectionForOwnerChange,
  renderMessengerSection, toggleMessengerToken, toggleMessengerContextKey, toggleMessenger,
  regenerateMessengerToken, regenerateMessengerContextKey,
} from '../js/settings-agent-access-panel.js';
import { saveImportedData } from '../js/data.js';
import { pushContextToGateway, revokeMessengerTokenRemote } from '../js/sync.js';

vi.mock('../js/data.js', () => {
  const save = vi.fn(async (_options?: { reason?: string }) => true);
  return { saveImportedData: save, saveImportedDataForProfile: vi.fn(async (_profile: string, _intent: unknown, options: { reason: string }) => save({ reason: options.reason })) };
});
vi.mock('../js/sync.js', async importOriginal => ({
  ...await importOriginal<typeof import('../js/sync.js')>(),
  pushContextToGateway: vi.fn(), revokeMessengerTokenRemote: vi.fn(),
}));

const original = state.importedData;
const originalProfile = state.currentProfile;
const token = 'a'.repeat(64);
const contextKey = 'b'.repeat(48);
let ownerReady = true;
function mountPanel() {
  document.body.innerHTML = `<section id="messenger-section">${renderMessengerSection()}</section>`;
  hydrateMessengerSection();
}
function credential(kind: 'token' | 'context-key') {
  return document.getElementById(`messenger-${kind}`)!;
}

beforeEach(() => {
  vi.clearAllMocks(); vi.mocked(saveImportedData).mockResolvedValue(true);
  localStorage.clear(); ownerReady = true; setSyncEnabled(true);
  state.currentProfile = 'agent-component-test';
  state.importedData = { ...original, entries: [], agentAccess: { version: 1, enabled: true, token, contextKey, wearableSeriesDays: 0 } };
  configureSyncMessenger({ getAppOwner: () => ownerReady ? { id: 'abcdefghijklmnopqrstuv', writeKey: new Uint8Array(32).fill(7) } : null });
});
afterEach(() => {
  disposeAgentAccessSection(); document.body.replaceChildren();
  state.importedData = original; state.currentProfile = originalProfile;
  configureSyncMessenger({ getAppOwner: () => null }); setSyncEnabled(false);
});

describe('Agent Access component and controller boundary', () => {
  it('keeps credentials masked until explicitly revealed and updates accessible labels', () => {
    mountPanel();
    expect(credential('token').textContent).toBe('•'.repeat(64));
    expect(credential('context-key').textContent).toBe('•'.repeat(48));
    expect(document.body.innerHTML).not.toContain(token);
    expect(document.body.innerHTML).not.toContain(contextKey);
    toggleMessengerToken(); toggleMessengerContextKey();
    expect(credential('token').dataset.masked).toBe('false');
    expect(credential('token').textContent).toBe(token);
    expect(credential('context-key').textContent).toBe(contextKey);
    expect(document.getElementById('messenger-context-key-toggle')!.getAttribute('aria-label')).toBe('Hide context encryption key');
    toggleMessengerToken();
    expect(credential('token').textContent).toBe('•'.repeat(64));
  });

  it('remasks secrets on owner/profile refresh and never writes to a removed view', () => {
    mountPanel(); toggleMessengerToken(); toggleMessengerContextKey();
    ownerReady = false; refreshMessengerSectionForOwnerChange();
    expect(credential('token').dataset.masked).toBe('true');
    expect(credential('context-key').dataset.masked).toBe('true');
    expect(document.querySelector<HTMLButtonElement>('[data-sync-action="regenerate-messenger-token"]')!.disabled).toBe(true);
    state.importedData = { ...original, entries: [], agentAccess: { version: 1, enabled: true, token: 'c'.repeat(64), contextKey: 'd'.repeat(48) } };
    window.dispatchEvent(new Event('labcharts-profile-switched'));
    expect(document.body.innerHTML).not.toContain(token);
    toggleMessengerToken(); expect(credential('token').textContent).toBe('c'.repeat(64));
    document.body.replaceChildren(); expect(getAgentAccessView()).toBeNull();
    mountPanel(); expect(credential('token').dataset.masked).toBe('true');
  });

  it('preserves every setup target and builds its private command without embedding secrets in markup', () => {
    mountPanel();
    const choices = [...document.querySelectorAll<HTMLInputElement>('[name="agent-access-client"]')];
    expect(choices.map(input => input.value)).toEqual(['hermes', 'openclaw', 'claude-code', 'claude-desktop', 'cursor', 'cline', 'codex']);
    for (const input of choices) {
      input.click(); expect(input.checked).toBe(true);
      const command = buildAgentAccessSetupCommand(input.value)!;
      const encoded = command.match(/gbsetup_v1_([^']+)/)![1]!;
      const decoded = JSON.parse(atob(encoded.replace(/-/g, '+').replace(/_/g, '/'))) as { client: string; token: string; contextKey: string };
      expect(decoded).toMatchObject({ client: input.value, token, contextKey });
    }
    expect(document.body.innerHTML).not.toContain('gbsetup_v1_');
  });

  it('shows distinct disabled/sync-owner-ready states without preventing an enabled account from being disabled', () => {
    state.importedData.agentAccess = { version: 1, enabled: false };
    ownerReady = false; setSyncEnabled(false); mountPanel();
    const toggle = document.querySelector<HTMLInputElement>('[data-sync-action="toggle-messenger"]')!;
    expect(toggle.disabled).toBe(true); expect(document.body.textContent).toContain('Enable or restore Cross-device Sync first');
    setSyncEnabled(true); refreshMessengerSectionForOwnerChange();
    expect(document.body.textContent).toContain('still resolving its Sync owner');
    ownerReady = true; refreshMessengerSectionForOwnerChange(); expect(toggle.disabled).toBe(false);
    state.importedData.agentAccess = { version: 1, enabled: true, token, contextKey };
    ownerReady = false; refreshMessengerSectionForOwnerChange(); expect(toggle.disabled).toBe(false);
  });

  it.each([['token', regenerateMessengerToken], ['context-key', regenerateMessengerContextKey]] as const)('rolls back failed %s regeneration and remasks the unchanged credentials', async (kind, regenerate) => {
    mountPanel(); toggleMessengerToken(); toggleMessengerContextKey();
    vi.mocked(saveImportedData).mockResolvedValueOnce(false);
    await regenerate();
    expect(state.importedData.agentAccess).toMatchObject({ token, contextKey });
    expect(credential(kind).dataset.masked).toBe('true');
    expect(pushContextToGateway).not.toHaveBeenCalled(); expect(revokeMessengerTokenRemote).not.toHaveBeenCalled();
  });

  it('keeps persisted credentials when disabling fails and permits a subsequent retry', async () => {
    mountPanel(); vi.mocked(saveImportedData).mockResolvedValueOnce(false);
    await toggleMessenger(false);
    expect(state.importedData.agentAccess).toMatchObject({ enabled: true, token, contextKey });
    expect(document.querySelector<HTMLInputElement>('[data-sync-action="toggle-messenger"]')!.checked).toBe(true);
    expect(revokeMessengerTokenRemote).not.toHaveBeenCalled();
    await toggleMessenger(false); expect(state.importedData.agentAccess).toMatchObject({ enabled: false, token: null, contextKey: null });
    expect(revokeMessengerTokenRemote).toHaveBeenCalledWith(token, expect.objectContaining({ isCurrent: expect.any(Function) }));
  });
});
