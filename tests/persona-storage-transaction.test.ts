import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import * as protection from '../js/crypto.js';
import * as blobs from '../js/blob-storage.js';
import { personaJournalKey, personaJournalFence, recoverPersonaStorage, recoverAllPersonaStorage, commitPersonaStoragePair } from '../js/persona-storage-transaction.js';
import { loadCustomPersonalitiesFromStorage, saveCustomPersonalitiesToStorage, loadCustomPersonalityTombstones } from '../js/chat-personality-storage.js';
import { collectChatData } from '../js/sync-payload-collectors.js';
import { buildFullBackupSnapshot, buildBackupSnapshot } from '../js/backup.js';
import { installPersonaCommandTestLocks } from './helpers/persona-command-locks.js';

let profile: string, catalog: string, deleted: string, sequence = 0;
let changes: Array<{ key: string; before: string | null; after: string }>;
const target = { id: 'custom_target', name: 'Keep if interrupted', icon: 'K', promptText: 'Private synthetic instructions' };
beforeEach(async () => {
  installPersonaCommandTestLocks(); localStorage.clear(); profile = `persona-recovery-${++sequence}`;
  (window as unknown as { __WEARABLES_TEST: boolean }).__WEARABLES_TEST = true;
  localStorage.setItem('labcharts-encryption-enabled', 'true'); await protection._setTestSessionKey('synthetic persona recovery');
  catalog = `labcharts-${profile}-chatPersonalityCustom`; deleted = `labcharts-${profile}-chatPersonalityDeleted`;
  await protection.encryptedSetItem(catalog, JSON.stringify([target]));
  changes = [{ key: catalog, before: localStorage.getItem(catalog), after: (await protection.prepareEncryptedLocalStorageValue(catalog, '[]')).value }, { key: deleted, before: null, after: (await protection.prepareEncryptedLocalStorageValue(deleted, '{"custom_target":100}')).value }];
});
afterEach(async () => { vi.restoreAllMocks(); await blobs.deleteBlob(personaJournalKey(profile)); vi.unstubAllGlobals(); await protection._setTestSessionKey(null); localStorage.clear(); });
async function seed(phase: 'prepared' | 'committed' = 'prepared') {
  const record = { version: 1, profile, id: crypto.randomUUID(), phase, changes };
  await blobs.setBlob(personaJournalKey(profile), { sealed: true, payload: await protection.encryptObject(record) }); localStorage.setItem(personaJournalFence(profile), record.id); return record;
}
const current = () => changes.map(change => localStorage.getItem(change.key));
const before = () => changes.map(change => change.before);
const clean = async () => { expect(await blobs.getBlob(personaJournalKey(profile))).toBeNull(); expect(localStorage.getItem(personaJournalFence(profile))).toBeNull(); };

it.each([0, 1, 2])('recovers a prepared transaction interrupted after %i writes to exact original bytes and absence', async count => {
  await seed(); for (const change of changes.slice(0, count)) localStorage.setItem(change.key, change.after);
  expect(await recoverPersonaStorage(profile)).toEqual({ recovered: true, committed: false }); expect(current()).toEqual(before()); await clean();
});
it('recovers a single-record edit without materializing an unchanged absent deletion history', async () => {
  const record = await seed(); const edit = { ...record, changes: [changes[0], { ...changes[1]!, before: null, after: null }] };
  await blobs.setBlob(personaJournalKey(profile), { sealed: true, payload: await protection.encryptObject(edit) }); localStorage.setItem(catalog, changes[0]!.after);
  expect(await recoverPersonaStorage(profile)).toMatchObject({ recovered: true, committed: false }); expect(current()).toEqual(before()); await clean();
});
it('cleans an acknowledged commit without reverting later edits', async () => {
  await seed('committed'); for (const change of changes) localStorage.setItem(change.key, change.after);
  await protection.encryptedSetItem(catalog, JSON.stringify([{ ...target, name: 'Newer edit after commit' }])); const newer = localStorage.getItem(catalog);
  expect(await recoverPersonaStorage(profile)).toEqual({ recovered: true, committed: true }); expect(localStorage.getItem(catalog)).toBe(newer); expect(localStorage.getItem(deleted)).toBe(changes[1]!.after); await clean();
});
it('preserves a foreign replacement and leaves recovery unresolved without rolling back another key', async () => {
  await seed(); for (const change of changes) localStorage.setItem(change.key, change.after);
  await protection.encryptedSetItem(catalog, JSON.stringify([{ ...target, name: 'Unrelated replacement' }])); const newer = current();
  await expect(recoverPersonaStorage(profile)).rejects.toThrow('newer replacement'); expect(current()).toEqual(newer); expect(await blobs.getBlob(personaJournalKey(profile))).not.toBeNull();
});
it('keeps the recovery payload encrypted and refuses a locked key without changing records', async () => {
  await seed(); const raw = await blobs.getBlob<unknown>(personaJournalKey(profile)); expect(JSON.stringify(raw)).not.toContain(target.promptText);
  expect(raw).toMatchObject({ sealed: true, payload: { _enc: 'v1' } }); await protection._setTestSessionKey(null);
  await expect(recoverPersonaStorage(profile)).rejects.toThrow(); expect(current()).toEqual(before()); expect(await blobs.getBlob(personaJournalKey(profile))).toEqual(raw);
});
it('rejects unfamiliar journals without writing any of their requested keys', async () => {
  const record = await seed(); await blobs.setBlob(personaJournalKey(profile), { sealed: true, payload: await protection.encryptObject({ ...record, changes: [{ key: 'labcharts-api-key', before: null, after: 'wrong' }, changes[1]] }) });
  await expect(recoverPersonaStorage(profile)).rejects.toThrow('native review'); expect(localStorage.getItem('labcharts-api-key')).toBeNull(); expect(current()).toEqual(before());
});
it('recovers before native loading and sync collection can expose half a persona change', async () => {
  await seed(); localStorage.setItem(catalog, changes[0]!.after);
  const personas = await loadCustomPersonalitiesFromStorage(profile); expect(personas).toEqual([expect.objectContaining(target)]); expect(await loadCustomPersonalityTombstones(profile)).toEqual({});
  await seed(); localStorage.setItem(catalog, changes[0]!.after);
  const chat = await collectChatData(profile); expect(chat?.customPersonalities).toEqual([target]); expect(chat?.customPersonalityDeleted).toBeUndefined(); expect(current()).toEqual(before()); await clean();
});
it('recovers before another native writer and before a full backup', async () => {
  await seed(); localStorage.setItem(catalog, changes[0]!.after);
  await saveCustomPersonalitiesToStorage([{ ...target, name: 'Saved after recovery' }], profile); expect((await loadCustomPersonalitiesFromStorage(profile))[0]?.name).toBe('Saved after recovery'); await clean();
  localStorage.setItem(catalog, changes[0]!.before!); localStorage.setItem('labcharts-profiles', JSON.stringify([{ id: profile, name: 'Synthetic recovery profile' }]));
  await seed(); localStorage.setItem(catalog, changes[0]!.after); expect(() => buildBackupSnapshot()).toThrow('recovery');
  const backup = await buildFullBackupSnapshot(); expect(backup?.profiles[0]?.keys.chatPersonalityCustom).toBe(changes[0]!.before); expect(current()).toEqual(before()); await clean();
});
it('fails before data writes if the recovery journal cannot be persisted', async () => {
  vi.spyOn(blobs, 'compareAndSwapBlob').mockRejectedValue(new Error('Synthetic IDB quota'));
  await expect(commitPersonaStoragePair(profile, changes, { canCommit: () => true, protectionCurrent: () => true, verify: async () => {} })).rejects.toMatchObject({ persistenceUncertain: false }); expect(current()).toEqual(before());
});
it('restores the original pair if the commit marker fails before persistence', async () => {
  const swap = blobs.compareAndSwapBlob; let writes = 0;
  vi.spyOn(blobs, 'compareAndSwapBlob').mockImplementation(async (key, expected, next) => { if (next !== null && ++writes === 2) throw new Error('Synthetic commit marker failure'); return swap(key, expected, next); });
  await expect(commitPersonaStoragePair(profile, changes, { canCommit: () => true, protectionCurrent: () => true, verify: async () => {} })).rejects.toMatchObject({ persistenceUncertain: false }); expect(current()).toEqual(before()); await clean();
});
it('retains a provably committed pair when the marker writer reports an error after persistence', async () => {
  const swap = blobs.compareAndSwapBlob; let writes = 0;
  vi.spyOn(blobs, 'compareAndSwapBlob').mockImplementation(async (key, expected, next) => { const changed = await swap(key, expected, next); if (next !== null && ++writes === 2) throw new Error('Synthetic error after marker persistence'); return changed; });
  expect(await commitPersonaStoragePair(profile, changes, { canCommit: () => true, protectionCurrent: () => true, verify: async () => {} })).toMatchObject({ committed: true }); expect(current()).toEqual(changes.map(change => change.after)); await clean();
});
it('clears an orphaned fence without changing persona data', async () => {
  localStorage.setItem(personaJournalFence(profile), crypto.randomUUID()); await recoverAllPersonaStorage(); expect(current()).toEqual(before()); await clean();
});
it('routes native profile cleanup through the journal backend without erasing other profile records', async () => {
  await seed(); const other = personaJournalKey('another-synthetic-profile'), retained = { retained: 'encrypted synthetic recovery metadata' };
  await blobs.setBlob(other, retained); localStorage.setItem(personaJournalKey(profile), 'legacy synthetic mirror');
  try {
    await protection.encryptedRemoveItem(personaJournalKey(profile), { throwOnBlobError: true });
    expect(await blobs.getBlob(personaJournalKey(profile))).toBeNull(); expect(localStorage.getItem(personaJournalKey(profile))).toBeNull(); expect(await blobs.getBlob(other)).toEqual(retained); expect(current()).toEqual(before());
  } finally { await blobs.deleteBlob(other); }
});
it('atomically refuses to replace or delete a journal with a different stored value', async () => {
  await seed(); const stored = await blobs.getBlob(personaJournalKey(profile));
  expect(await blobs.compareAndSwapBlob(personaJournalKey(profile), null, { wrong: true })).toBe(false);
  expect(await blobs.compareAndSwapBlob(personaJournalKey(profile), { wrong: true }, null)).toBe(false); expect(await blobs.getBlob(personaJournalKey(profile))).toEqual(stored); expect(current()).toEqual(before());
});
it('keeps a newer recovery owner that arrives during committed cleanup', async () => {
  const swap = blobs.compareAndSwapBlob;
  const foreign = { sealed: true, payload: await protection.encryptObject({ version: 1, profile, id: crypto.randomUUID(), phase: 'prepared', changes }) };
  vi.spyOn(blobs, 'compareAndSwapBlob').mockImplementation(async (key, expected, next) => { if (next === null) await blobs.setBlob(key, foreign); return swap(key, expected, next); });
  expect(await commitPersonaStoragePair(profile, changes, { canCommit: () => true, protectionCurrent: () => true, verify: async () => {} })).toMatchObject({ committed: true, recoveryPending: true });
  expect(await blobs.getBlob(personaJournalKey(profile))).toEqual(foreign); expect(current()).toEqual(changes.map(change => change.after));
  await expect(recoverPersonaStorage(profile)).rejects.toThrow('fence differ'); expect(current()).toEqual(changes.map(change => change.after));
});
it.each(['encrypted', 'plain'] as const)('retains a foreign replacement before the first data write and clears only its unused %s journal', async format => {
  if (format === 'plain') {
    localStorage.setItem('labcharts-encryption-enabled', 'false'); localStorage.setItem(catalog, JSON.stringify([target]));
    changes = [{ key: catalog, before: localStorage.getItem(catalog), after: '[]' }, { key: deleted, before: null, after: '{"custom_target":100}' }];
  }
  const newer = (await protection.prepareEncryptedLocalStorageValue(catalog, JSON.stringify([{ ...target, name: 'Foreign newer reviewer', retained: true }]))).value;
  const swap = blobs.compareAndSwapBlob, verify = vi.fn(); let published = false;
  vi.spyOn(blobs, 'compareAndSwapBlob').mockImplementation(async (key, expected, next) => {
    const changed = await swap(key, expected, next);
    if (next !== null && !published) { published = true; localStorage.setItem(catalog, newer); }
    return changed;
  });
  await expect(commitPersonaStoragePair(profile, changes, { canCommit: () => true, protectionCurrent: () => true, verify })).rejects.toMatchObject({ persistenceUncertain: false });
  expect(localStorage.getItem(catalog)).toBe(newer); expect(localStorage.getItem(deleted)).toBeNull(); expect(verify).not.toHaveBeenCalled(); await clean();
});
it('keeps a foreign journal that replaces its unused prepared journal during cleanup', async () => {
  const swap = blobs.compareAndSwapBlob, newer = (await protection.prepareEncryptedLocalStorageValue(catalog, JSON.stringify([{ ...target, name: 'Foreign newer reviewer' }]))).value;
  const foreignId = crypto.randomUUID(), foreign = { sealed: true, payload: await protection.encryptObject({ version: 1, profile, id: foreignId, phase: 'prepared', changes }) }; let published = false;
  vi.spyOn(blobs, 'compareAndSwapBlob').mockImplementation(async (key, expected, next) => {
    if (next === null) { await blobs.setBlob(key, foreign); localStorage.setItem(personaJournalFence(profile), foreignId); }
    const changed = await swap(key, expected, next); if (next !== null && !published) { published = true; localStorage.setItem(catalog, newer); } return changed;
  });
  await expect(commitPersonaStoragePair(profile, changes, { canCommit: () => true, protectionCurrent: () => true, verify: async () => {} })).rejects.toMatchObject({ persistenceUncertain: true });
  expect(localStorage.getItem(catalog)).toBe(newer); expect(localStorage.getItem(deleted)).toBeNull(); expect(await blobs.getBlob(personaJournalKey(profile))).toEqual(foreign); expect(localStorage.getItem(personaJournalFence(profile))).toBe(foreignId);
});
