// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { webcrypto } from 'node:crypto';
import { configureSyncIdentity, restoreFromMnemonic, RESTORE_NOTICE_KEY } from '../js/sync-identity.js';
import { isSyncEnabled, isSyncPaused, setSyncEnabled, setSyncPaused, setSyncPublishingSuspended, SYNC_STORAGE_KEY } from '../js/sync-settings-state.js';
import { fingerprintBackupRestoreOwner, getPendingBackupRestoreProfileIds, republishPendingBackupRestore, stageBackupRestorePending, SYNC_BACKUP_RESTORE_PENDING_KEY } from '../js/sync-backup-restore-state.js';
import {setSyncEvolu} from '../js/sync-runtime.js';
beforeEach(() => { vi.stubGlobal('crypto', webcrypto); localStorage.clear(); sessionStorage.clear(); setSyncPublishingSuspended(false); document.body.innerHTML = '<div id="notification-container"></div>'; });
afterEach(() => { configureSyncIdentity({ getAppOwner: () => null, getEvolu: () => null, seedLocalProfiles: async () => {} }); setSyncEvolu(null); setSyncPublishingSuspended(false); localStorage.clear(); sessionStorage.clear(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it('carries pending recovery to a deliberately joined identity before resetting the SDK', async () => {
  vi.useFakeTimers();
  try {
    setSyncEnabled(true);
    let owner = {id: 'prior-recovered-owner', mnemonic: 'synthetic prior recovery identity'};
    const next = {id: 'explicitly-joined-owner', mnemonic: 'synthetic next recovery identity'};
    stageBackupRestorePending(['retained'], {ownerFingerprint: await fingerprintBackupRestoreOwner(owner.mnemonic)});
    let atReset = ''; let suspended = false;
    const engine = {get appOwner() {return Promise.resolve(owner);}, restoreAppOwner: vi.fn(async () => {
      atReset = localStorage.getItem(SYNC_BACKUP_RESTORE_PENDING_KEY)!;
      suspended = !isSyncEnabled(); owner = next;
    })};
    const seed = vi.fn(); setSyncEvolu(engine);
    configureSyncIdentity({getEvolu: () => engine, getAppOwner: () => owner, seedLocalProfiles: seed});
    expect(await restoreFromMnemonic(next.mnemonic)).toBe(true);
    expect(JSON.parse(atReset).at(-1).ownerFingerprint).toBe(await fingerprintBackupRestoreOwner(next.mnemonic));
    expect(suspended).toBe(true); expect(seed).not.toHaveBeenCalled();
    const publish = vi.fn(async () => ({succeeded: 1, failed: 0, skipped: 0}));
    expect((await republishPendingBackupRestore({runtime: {}, ownerId: next.id, ownerMnemonic: next.mnemonic,
      isCurrent: () => true, getProfiles: () => [{id: 'retained'}], pushProfilesById: publish})).complete).toBe(true);
    expect(publish).toHaveBeenCalledOnce();
  } finally {vi.clearAllTimers(); vi.useRealTimers();}
});

it('restores the prior bound journal when a deliberate join rejects without changing its owner', async () => {
  setSyncEnabled(true);
  const owner = {id: 'retained-recovery-owner', mnemonic: 'synthetic prior recovery identity'};
  stageBackupRestorePending(['retained'], {ownerFingerprint: await fingerprintBackupRestoreOwner(owner.mnemonic)});
  const prior = localStorage.getItem(SYNC_BACKUP_RESTORE_PENDING_KEY);
  let suspended = false;
  const engine = {appOwner: Promise.resolve(owner), restoreAppOwner: vi.fn(async () => {suspended = !isSyncEnabled(); throw new Error('Synthetic join rejection');})};
  configureSyncIdentity({getEvolu: () => engine, getAppOwner: () => owner});
  expect(await restoreFromMnemonic('synthetic different identity')).toBe(false);
  expect(suspended).toBe(true); expect(localStorage.getItem(SYNC_BACKUP_RESTORE_PENDING_KEY)).toBe(prior);
  expect(isSyncEnabled()).toBe(true);
});
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

it('persists recovery for the new owner while preventing the retiring runtime from publishing it', async () => {
  vi.useFakeTimers();
  try {
    setSyncEnabled(true); setSyncPaused(true);
    const engine = {restoreAppOwner: vi.fn(async () => {
      expect(getPendingBackupRestoreProfileIds()).toEqual(['first', 'second']);
      expect(isSyncEnabled()).toBe(false);
    })};
    setSyncEvolu(engine);
    const seed = vi.fn(async (options: {ownerFingerprint: string}) => {
      expect(engine.restoreAppOwner).not.toHaveBeenCalled();
      expect(localStorage.getItem(SYNC_STORAGE_KEY)).toBe('true');
      expect(isSyncPaused()).toBe(true);
      expect(isSyncEnabled()).toBe(false);
      expect(options.ownerFingerprint).toBe(await fingerprintBackupRestoreOwner('new fixture identity'));
      return stageBackupRestorePending(['first', 'second'], options);
    });
    configureSyncIdentity({getEvolu: () => engine, getAppOwner: () => ({id: 'retiring-owner', mnemonic: 'old fixture identity'}), seedLocalProfiles: seed});
    expect(await restoreFromMnemonic('new fixture identity', {seedLocal: true})).toBe(true);
    expect(seed).toHaveBeenCalledOnce();
    expect(getPendingBackupRestoreProfileIds()).toEqual(['first', 'second']);
    expect(isSyncEnabled()).toBe(false);
    expect(localStorage.getItem(SYNC_STORAGE_KEY)).toBe('true');
    setSyncEvolu({});
    expect(isSyncEnabled()).toBe(true);
  } finally { vi.clearAllTimers(); vi.useRealTimers(); }
});

it('keeps the old owner and journal if its target identity cannot be fingerprinted', async () => {
  setSyncEnabled(true);
  localStorage.setItem(SYNC_BACKUP_RESTORE_PENDING_KEY, '["previous"]');
  const engine = {restoreAppOwner: vi.fn()};
  const seed = vi.fn(async () => stageBackupRestorePending(['candidate']));
  vi.spyOn(webcrypto.subtle, 'digest').mockRejectedValueOnce(new Error('Synthetic crypto failure'));
  configureSyncIdentity({getEvolu: () => engine, getAppOwner: () => ({id: 'retained-owner'}), seedLocalProfiles: seed});
  expect(await restoreFromMnemonic('synthetic replacement identity', {seedLocal: true})).toBe(false);
  expect(seed).not.toHaveBeenCalled(); expect(engine.restoreAppOwner).not.toHaveBeenCalled();
  expect(localStorage.getItem(SYNC_BACKUP_RESTORE_PENDING_KEY)).toBe('["previous"]');
  expect(isSyncEnabled()).toBe(true);
});

it.each(['write', 'readback'] as const)('keeps the old identity and paused state when recovery journal %s fails', async failure => {
  setSyncEnabled(true); setSyncPaused(true);
  const engine = {restoreAppOwner: vi.fn(async () => {})};
  localStorage.setItem('synthetic-local-data', 'retained');
  const key = 'labcharts-sync-backup-restore-pending';
  if (failure === 'write') {
    const write = localStorage.setItem.bind(localStorage);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation((name, value) => { if (name === key) throw new Error('Fixture storage full'); write(name, value); });
  } else {
    const read = localStorage.getItem.bind(localStorage);
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(name => name === key ? null : read(name));
  }
  configureSyncIdentity({getEvolu: () => engine, getAppOwner: () => ({id: 'old-fixture-owner', mnemonic: 'old fixture words'}),
    seedLocalProfiles: async () => stageBackupRestorePending(['first', 'second'])});
  expect(await restoreFromMnemonic('new fixture words', {seedLocal: true})).toBe(false);
  expect(engine.restoreAppOwner).not.toHaveBeenCalled();
  expect(isSyncPaused()).toBe(true);
  expect(localStorage.getItem(SYNC_STORAGE_KEY)).toBe('true');
  expect(localStorage.getItem('synthetic-local-data')).toBe('retained');
  expect(sessionStorage.getItem(RESTORE_NOTICE_KEY)).toBeNull();
  expect(document.body.textContent).toContain('Could not save sync recovery progress');
});

it.each([null, '["previous-recovery"]'])('restores the exact prior journal %s after an owner reset rejects without changing identity', async previous => {
  setSyncEnabled(true);
  if (previous !== null) localStorage.setItem(SYNC_BACKUP_RESTORE_PENDING_KEY, previous);
  const owner = {id: 'unchanged-owner', mnemonic: 'original fixture words'};
  const engine = {appOwner: Promise.resolve(owner), restoreAppOwner: vi.fn(async () => { throw new Error('Fixture owner rejection'); })};
  configureSyncIdentity({getEvolu: () => engine, getAppOwner: () => owner,
    seedLocalProfiles: async () => stageBackupRestorePending(['available', 'unavailable'])});
  expect(await restoreFromMnemonic('replacement fixture words', {seedLocal: true})).toBe(false);
  expect(engine.restoreAppOwner).toHaveBeenCalledOnce();
  expect(localStorage.getItem(SYNC_BACKUP_RESTORE_PENDING_KEY)).toBe(previous);
  expect(isSyncEnabled()).toBe(true);
});

it('keeps recovery when the SDK owner changed before a replacement startup failure', async () => {
  setSyncEnabled(true);
  const previous = {id: 'old-owner', mnemonic: 'old fixture words'};
  const next = {id: 'new-owner', mnemonic: 'new fixture words'};
  const engine = {appOwner: Promise.resolve(next), restoreAppOwner: async () => { throw new Error('Fixture replacement startup failure'); }};
  configureSyncIdentity({getEvolu: () => engine, getAppOwner: () => previous,
    seedLocalProfiles: async () => stageBackupRestorePending(['available', 'unavailable'])});
  expect(await restoreFromMnemonic(next.mnemonic, {seedLocal: true})).toBe(false);
  expect(getPendingBackupRestoreProfileIds()).toEqual(['available', 'unavailable']);
  expect(isSyncEnabled()).toBe(false);
  expect(document.body.textContent).toContain('Reload to finish recovery');
});

it('keeps publishing suspended when rollback storage fails and retries rollback before another owner operation', async () => {
  setSyncEnabled(true);
  const owner = {id: 'unchanged-owner', mnemonic: 'original fixture words'};
  const engine = {appOwner: Promise.resolve(owner), restoreAppOwner: vi.fn(async () => { throw new Error('Fixture owner rejection'); })};
  let failRollback = true;
  configureSyncIdentity({getEvolu: () => engine, getAppOwner: () => owner, seedLocalProfiles: async () => {
    const staged = stageBackupRestorePending(['available', 'unavailable']);
    return {rollback() { if (failRollback) { failRollback = false; return false; } return staged.rollback(); }};
  }});
  expect(await restoreFromMnemonic('replacement fixture words', {seedLocal: true})).toBe(false);
  expect(isSyncEnabled()).toBe(false);
  expect(getPendingBackupRestoreProfileIds()).toEqual(['available', 'unavailable']);
  expect(await restoreFromMnemonic('replacement fixture words', {seedLocal: true})).toBe(false);
  expect(engine.restoreAppOwner).toHaveBeenCalledTimes(2);
  expect(getPendingBackupRestoreProfileIds()).toEqual([]);
  expect(isSyncEnabled()).toBe(true);
});

it('rolls back its owned staged journal when the runtime changes before the SDK reset starts', async () => {
  const first = {restoreAppOwner: vi.fn(async () => {})}; let engine = first;
  let finish!: () => void;
  configureSyncIdentity({getEvolu: () => engine, seedLocalProfiles: async () => {
    const staged = stageBackupRestorePending(['unavailable']);
    await new Promise<void>(resolve => { finish = resolve; });
    return staged;
  }});
  const task = restoreFromMnemonic('replacement fixture words', {seedLocal: true});
  await vi.waitFor(() => expect(getPendingBackupRestoreProfileIds()).toEqual(['unavailable']));
  engine = {restoreAppOwner: vi.fn(async () => {})}; setSyncEvolu(engine);
  sessionStorage.setItem(RESTORE_NOTICE_KEY, 'new-runtime-notice');
  finish(); expect(await task).toBe(false);
  expect(first.restoreAppOwner).not.toHaveBeenCalled();
  expect(getPendingBackupRestoreProfileIds()).toEqual([]);
  expect(sessionStorage.getItem(RESTORE_NOTICE_KEY)).toBe('new-runtime-notice');
});

it('does not stage recovery after its runtime changes during identity fingerprinting', async () => {
  let finish!: (digest: ArrayBuffer) => void;
  vi.spyOn(webcrypto.subtle, 'digest').mockReturnValueOnce(new Promise<ArrayBuffer>(resolve => {finish = resolve;}));
  const first = {restoreAppOwner: vi.fn()}; let engine = first;
  const seed = vi.fn(async () => stageBackupRestorePending(['candidate']));
  configureSyncIdentity({getEvolu: () => engine, seedLocalProfiles: seed});
  const task = restoreFromMnemonic('synthetic target identity', {seedLocal: true});
  engine = {restoreAppOwner: vi.fn()}; setSyncEvolu(engine);
  sessionStorage.setItem(RESTORE_NOTICE_KEY, 'replacement-notice');
  finish(new ArrayBuffer(32)); expect(await task).toBe(false);
  expect(seed).not.toHaveBeenCalled(); expect(first.restoreAppOwner).not.toHaveBeenCalled();
  expect(getPendingBackupRestoreProfileIds()).toEqual([]);
  expect(sessionStorage.getItem(RESTORE_NOTICE_KEY)).toBe('replacement-notice');
});
