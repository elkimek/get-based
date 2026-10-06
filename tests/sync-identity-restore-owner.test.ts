// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { configureSyncIdentity, restoreFromMnemonic, RESTORE_NOTICE_KEY } from '../js/sync-identity.js';
import { SYNC_STORAGE_KEY } from '../js/sync-settings-state.js';
beforeEach(() => { localStorage.clear(); sessionStorage.clear(); });
afterEach(() => { configureSyncIdentity({ getAppOwner: () => null, getEvolu: () => null, seedLocalProfiles: async () => {} }); localStorage.clear(); sessionStorage.clear(); vi.restoreAllMocks(); });
for (const failed of [false, true]) {
  it(`does not mutate a replaced runtime after an old restore ${failed ? 'fails' : 'succeeds'}`, async () => {
    let finish!: () => void; let reject!: (error: Error) => void;
    const old = { restoreAppOwner: () => new Promise<void>((resolve, fail) => { finish = resolve; reject = fail; }) };
    let engine = old;
    configureSyncIdentity({ getEvolu: () => engine, getAppOwner: () => ({ id: 'original-owner', mnemonic: 'original-private-words' }) });
    localStorage.setItem(SYNC_STORAGE_KEY, 'false');
    const task = restoreFromMnemonic('synthetic replacement identity');
    engine = { restoreAppOwner: async () => {} };
    sessionStorage.setItem(RESTORE_NOTICE_KEY, 'new-runtime-notice');
    localStorage.setItem('synthetic-retained-data', 'keep');
    if (failed) reject(new Error('synthetic failure')); else finish();
    expect(await task).toBe(false);
    expect(localStorage.getItem(SYNC_STORAGE_KEY)).toBe('false');
    expect(localStorage.getItem('synthetic-retained-data')).toBe('keep');
    expect(sessionStorage.getItem(RESTORE_NOTICE_KEY)).toBe('new-runtime-notice');
  });
}

it('does not log exception text containing recovery words', async () => {
  const phrase = 'synthetic private recovery phrase';
  const engine = { restoreAppOwner: async () => { throw new Error(phrase); } };
  const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
  configureSyncIdentity({ getEvolu: () => engine });
  expect(await restoreFromMnemonic(phrase)).toBe(false);
  expect(logged).toHaveBeenCalledWith('[sync] Restore failed: invalid or unavailable identity');
  expect(JSON.stringify(logged.mock.calls)).not.toContain(phrase);
});
it('does not finalize an old seed operation after the runtime changes during persistence', async () => {
  let finish!: () => void;
  const first = { restoreAppOwner: async () => {} }; let engine = first;
  const seeded = vi.fn(() => new Promise<void>(resolve => { finish = resolve; }));
  configureSyncIdentity({ getEvolu: () => engine, getAppOwner: () => ({ id: 'same-owner', mnemonic: 'synthetic same phrase' }), seedLocalProfiles: seeded });
  const task = restoreFromMnemonic('synthetic same phrase', { seedLocal: true });
  await vi.waitFor(() => expect(seeded).toHaveBeenCalledOnce());
  engine = { restoreAppOwner: async () => {} }; localStorage.setItem(SYNC_STORAGE_KEY, 'false');
  sessionStorage.setItem(RESTORE_NOTICE_KEY, 'replacement-notice'); finish();
  expect(await task).toBe(false); expect(localStorage.getItem(SYNC_STORAGE_KEY)).toBe('false');
  expect(sessionStorage.getItem(RESTORE_NOTICE_KEY)).toBe('replacement-notice');
  expect(document.body.textContent).not.toContain('republished');
});
