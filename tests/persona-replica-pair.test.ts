import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { state } from '../js/state.js';
import * as protection from '../js/crypto.js';
import * as collectors from '../js/sync-payload-collectors.js';
import { applyChatData } from '../js/sync-chat-apply.js';
import { deleteBlob, getBlob } from '../js/blob-storage.js';
import { personaJournalKey, personaJournalFence } from '../js/persona-storage-transaction.js';
import { customPersonalityStorageKey, customPersonalityTombstoneStorageKey, mergeCustomPersonalitiesFromReplica, captureCustomPersonalityEdit, commitCustomPersonalityEdit } from '../js/chat-personality-storage.js';
import { installPersonaCommandTestLocks } from './helpers/persona-command-locks.js';

let profile: string, catalog: string, deleted: string, sequence = 0;
const target = { id: 'custom_target', name: 'Saved', icon: 'S', promptText: 'Private saved instructions', updatedAt: '2090-01-01', createdAt: null, opaque: { nested: ['keep', null] } };
const incoming = { id: 'custom_remote', name: 'Remote', icon: 'R', promptText: 'Private incoming instructions', updatedAt: '2090-01-02', future: { retained: true } };
const pair = () => ({ catalog: localStorage.getItem(catalog), deleted: localStorage.getItem(deleted) });
const records = async () => JSON.parse((await protection.encryptedGetItem(catalog, { throwOnDecryptError: true }))!) as Array<Record<string, unknown>>;
const tombstones = async () => JSON.parse((await protection.encryptedGetItem(deleted, { throwOnDecryptError: true })) || '{}') as Record<string, number>;
const merge = (input: Parameters<typeof mergeCustomPersonalitiesFromReplica>[0], mode: 'sync' | 'import' = 'sync') => mergeCustomPersonalitiesFromReplica(input, profile, mode);
function gate() { let release!: () => void; const promise = new Promise<void>(resolve => { release = resolve; }); return { promise, release }; }
async function clean() { expect(await getBlob(personaJournalKey(profile))).toBeNull(); expect(localStorage.getItem(personaJournalFence(profile))).toBeNull(); }
beforeEach(async () => {
  installPersonaCommandTestLocks(); localStorage.clear(); profile = `persona-replica-${++sequence}`; state.currentProfile = profile; state.currentThreadId = 'origin'; state.chatHistory = [];
  (window as unknown as { __WEARABLES_TEST: boolean }).__WEARABLES_TEST = true;
  localStorage.setItem('labcharts-encryption-enabled', 'true'); await protection._setTestSessionKey('synthetic replica key');
  catalog = customPersonalityStorageKey(profile); deleted = customPersonalityTombstoneStorageKey(profile);
  await protection.encryptedSetItem(catalog, JSON.stringify([target])); await protection.encryptedSetItem(deleted, '{"custom_old":100}');
});
afterEach(async () => { vi.restoreAllMocks(); vi.unstubAllGlobals(); await deleteBlob(personaJournalKey(profile)); });

it('publishes and verifies encrypted definitions and deletion markers as one pair without losing opaque data', async () => {
  const result = await merge({ customPersonalities: [incoming], customPersonalityDeleted: { custom_remote_old: 200 } });
  expect(result).toEqual({ changed: true, recoveryPending: false }); expect(await records()).toEqual([target, incoming]);
  expect(await tombstones()).toEqual({ custom_old: 100, custom_remote_old: 200 });
  expect(pair().catalog).toMatch(/^v1:/); expect(pair().deleted).toMatch(/^v1:/); expect(JSON.stringify(pair())).not.toContain('Private'); await clean();
});
it('merges against a native edit completed after sync collection', async () => {
  const collect = collectors.collectChatData; let edited = false;
  vi.spyOn(collectors, 'collectChatData').mockImplementation(async id => {
    const stale = await collect(id);
    if (!edited) { edited = true; const lease = await captureCustomPersonalityEdit(target.id); await commitCustomPersonalityEdit(lease.leaseId, { name: 'New native edit', promptText: 'Private newer native instructions' }, { canCommit: () => true }); }
    return stale;
  });
  expect(await applyChatData(profile, { threads: [], messages: {}, customPersonalities: [incoming] })).toBe(true);
  expect(await records()).toEqual([expect.objectContaining({ ...target, name: 'New native edit', promptText: 'Private newer native instructions', updatedAt: expect.any(String) }), incoming]); await clean();
});
it('retains opaque native fields when a newer replica edits the same definition', async () => {
  const remote = { id: target.id, name: 'Remote revision', promptText: 'Private remote revision', updatedAt: '2091-01-01' };
  await merge({ customPersonalities: [remote] }); expect(await records()).toEqual([{ ...remote, opaque: target.opaque }]); await clean();
});
it('never resurrects a persona deleted after a stale collection was assembled', async () => {
  await protection.encryptedSetItem(catalog, '[]'); await protection.encryptedSetItem(deleted, JSON.stringify({ [target.id]: Date.parse('2091-01-01') }));
  const before = pair(); expect(await merge({ customPersonalities: [target] })).toMatchObject({ changed: false }); expect(pair()).toEqual(before); await clean();
});
it('applies an incoming deletion without discarding unrelated definitions or prior deletion history', async () => {
  await protection.encryptedSetItem(catalog, JSON.stringify([target, incoming]));
  await merge({ customPersonalityDeleted: { [target.id]: Date.parse('2091-01-01') } });
  expect(await records()).toEqual([incoming]); expect(await tombstones()).toEqual({ custom_old: 100, [target.id]: Date.parse('2091-01-01') }); await clean();
});
it('imports opaque metadata and normalizes known portable fields into an empty pair', async () => {
  localStorage.removeItem(catalog); localStorage.removeItem(deleted);
  await merge({ customPersonalities: [{ ...incoming, name: 'Portable', icon: '<img>' }], customPersonalityDeleted: { custom_prior: 50 } }, 'import');
  expect(await records()).toEqual([expect.objectContaining({ ...incoming, name: 'Portable', icon: 'img', evidenceBased: false, updatedAt: '2090-01-02T00:00:00.000Z' })]); expect(await tombstones()).toEqual({ custom_prior: 50 }); await clean();
});
it('checks portable only-if-unset eligibility after obtaining the native lock', async () => {
  localStorage.removeItem(catalog); const entered = gate(), release = gate();
  const held = navigator.locks.request(`getbased-personas-${profile}`, { mode: 'exclusive' }, async () => { entered.release(); await release.promise; }); await entered.promise;
  const pending = merge({ customPersonalities: [incoming] }, 'import');
  await protection.encryptedSetItem(catalog, JSON.stringify([target])); const before = pair(); release.release(); await held;
  expect(await pending).toMatchObject({ changed: false }); expect(pair()).toEqual(before); await clean();
});
it('keeps current deletion history when importing an older catalog into an absent collection', async () => {
  localStorage.removeItem(catalog); await protection.encryptedSetItem(deleted, JSON.stringify({ [target.id]: Date.parse('2091-01-01') }));
  const before = pair(); await merge({ customPersonalities: [target], customPersonalityDeleted: {} }, 'import'); expect(pair()).toEqual(before); await clean();
});
it('rechecks import eligibility once after a proved no-own-write conflict with late peer storage delivery', async () => {
  localStorage.removeItem(catalog); const prepare = protection.prepareEncryptedLocalStorageValue; let foreign: string | null = null, deliveries = 0;
  vi.spyOn(protection, 'prepareEncryptedLocalStorageValue').mockImplementation(async (key, text) => {
    const result = await prepare(key, text);
    if (key === catalog && text.includes(incoming.id)) { deliveries++; await protection.encryptedSetItem(catalog, JSON.stringify([target])); foreign = localStorage.getItem(catalog); }
    return result;
  });
  const beforeDeleted = pair().deleted; expect(await merge({ customPersonalities: [incoming] }, 'import')).toEqual({ changed: false, recoveryPending: false });
  expect(deliveries).toBe(1); expect(pair()).toEqual({ catalog: foreign, deleted: beforeDeleted }); expect(await records()).toEqual([target]); await clean();
});
it('never retries a portable import after a quota failure whose previous pair was restored', async () => {
  localStorage.removeItem(catalog); localStorage.removeItem(deleted); const before = pair(), set = localStorage.setItem.bind(localStorage); let attempts = 0;
  vi.spyOn(localStorage, 'setItem').mockImplementation((key, text) => { if (key === deleted) { attempts++; throw new Error('Synthetic persistent quota'); } return set(key, text); });
  await expect(merge({ customPersonalities: [incoming], customPersonalityDeleted: { custom_previous: 100 } }, 'import')).rejects.toMatchObject({ persistenceUncertain: false });
  expect(attempts).toBe(1); expect(pair()).toEqual(before); await clean();
});
it('bounds import re-evaluation when newer deletion state keeps arriving', async () => {
  localStorage.removeItem(catalog); const prepare = protection.prepareEncryptedLocalStorageValue; let deliveries = 0, foreign: string | null = null;
  vi.spyOn(protection, 'prepareEncryptedLocalStorageValue').mockImplementation(async (key, text) => {
    const result = await prepare(key, text);
    if (key === catalog && text.includes(incoming.id)) { deliveries++; await protection.encryptedSetItem(deleted, JSON.stringify({ custom_peer: deliveries })); foreign = localStorage.getItem(deleted); }
    return result;
  });
  await expect(merge({ customPersonalities: [incoming] }, 'import')).rejects.toMatchObject({ persistenceUncertain: false });
  expect(deliveries).toBe(2); expect(pair()).toEqual({ catalog: null, deleted: foreign }); await clean();
});
it.each(['mode', 'key'] as const)('cannot re-evaluate a conflicted import after a protection %s change', async which => {
  localStorage.removeItem(catalog); const prepare = protection.prepareEncryptedLocalStorageValue; let preparations = 0, foreign: string | null = null;
  vi.spyOn(protection, 'prepareEncryptedLocalStorageValue').mockImplementation(async (key, text) => {
    const result = await prepare(key, text);
    if (key === catalog && text.includes(incoming.id)) {
      preparations++; await protection.encryptedSetItem(catalog, JSON.stringify([target])); foreign = localStorage.getItem(catalog);
      if (which === 'mode') localStorage.removeItem('labcharts-encryption-enabled'); else await protection._setTestSessionKey('new import key');
    }
    return result;
  });
  const beforeDeleted = pair().deleted;
  await expect(merge({ customPersonalities: [incoming] }, 'import')).rejects.toMatchObject({ persistenceUncertain: false });
  expect(preparations).toBe(1); expect(pair()).toEqual({ catalog: foreign, deleted: beforeDeleted }); await clean();
});
it('does not retry an unconfirmed import or overwrite its newer foreign replacement', async () => {
  localStorage.removeItem(catalog); const read = protection.encryptedGetItem; let replacements = 0, foreign: string | null = null;
  vi.spyOn(protection, 'encryptedGetItem').mockImplementation(async (key, options) => {
    if (key === catalog && localStorage.getItem(personaJournalFence(profile)) !== null) { replacements++; await protection.encryptedSetItem(catalog, JSON.stringify([target])); foreign = localStorage.getItem(catalog); }
    return read(key, options);
  });
  const beforeDeleted = pair().deleted;
  await expect(merge({ customPersonalities: [incoming] }, 'import')).rejects.toMatchObject({ persistenceUncertain: true });
  expect(replacements).toBe(1); expect(pair()).toEqual({ catalog: foreign, deleted: beforeDeleted }); expect(await getBlob(personaJournalKey(profile))).not.toBeNull();
});
it('keeps unchanged raw ciphertext byte for byte and writes no journal for a no-op', async () => {
  const before = pair(), set = vi.spyOn(localStorage, 'setItem');
  expect(await merge({ customPersonalities: [target], customPersonalityDeleted: { custom_old: 100 } })).toEqual({ changed: false, recoveryPending: false });
  expect(pair()).toEqual(before); expect(set).not.toHaveBeenCalled(); await clean();
});
it('snapshots caller-owned input before asynchronous storage preparation', async () => {
  const prepare = protection.prepareEncryptedLocalStorageValue, entered = gate(), release = gate(); let held = false;
  vi.spyOn(protection, 'prepareEncryptedLocalStorageValue').mockImplementation(async (key, text) => { const result = await prepare(key, text); if (!held) { held = true; entered.release(); await release.promise; } return result; });
  const input = { customPersonalities: [structuredClone(incoming)] }, pending = merge(input); await entered.promise; input.customPersonalities[0]!.promptText = 'Unaccepted later mutation'; release.release(); await pending;
  expect(await records()).toEqual([target, incoming]); await clean();
});
it.each(['catalog', 'deleted'] as const)('rolls back the exact encrypted pair when the %s write fails', async which => {
  const before = pair(), set = localStorage.setItem.bind(localStorage); let fail = true;
  vi.spyOn(localStorage, 'setItem').mockImplementation((key, text) => { if (key === (which === 'catalog' ? catalog : deleted) && fail) { fail = false; throw new DOMException('Synthetic quota', 'QuotaExceededError'); } return set(key, text); });
  await expect(merge({ customPersonalities: [incoming], customPersonalityDeleted: { custom_new: 900 } })).rejects.toMatchObject({ persistenceUncertain: false });
  expect(pair()).toEqual(before); await clean();
});
it('rolls back a catalog edit when clearing obsolete deletion history fails', async () => {
  await protection.encryptedSetItem(deleted, JSON.stringify({ [incoming.id]: 100 })); const before = pair(), remove = localStorage.removeItem.bind(localStorage); let fail = true;
  vi.spyOn(localStorage, 'removeItem').mockImplementation((key) => { if (key === deleted && fail) { fail = false; throw new Error('Synthetic removal failure'); } return remove(key); });
  await expect(merge({ customPersonalities: [incoming] })).rejects.toMatchObject({ persistenceUncertain: false }); expect(pair()).toEqual(before); await clean();
});
it('rolls back the pair when decrypted verification does not confirm publication', async () => {
  const before = pair(), read = protection.encryptedGetItem;
  vi.spyOn(protection, 'encryptedGetItem').mockImplementation(async (key, options) => key === catalog && localStorage.getItem(personaJournalFence(profile)) !== null ? '[]' : read(key, options));
  await expect(merge({ customPersonalities: [incoming] })).rejects.toMatchObject({ persistenceUncertain: false }); expect(pair()).toEqual(before); await clean();
});
it('preserves a foreign replacement discovered before the first data write', async () => {
  const prepare = protection.prepareEncryptedLocalStorageValue; let foreign: string | null = null;
  vi.spyOn(protection, 'prepareEncryptedLocalStorageValue').mockImplementation(async (key, text) => {
    const result = await prepare(key, text);
    if (key === catalog && text.includes(incoming.id)) { await protection.encryptedSetItem(catalog, JSON.stringify([{ ...target, name: 'Foreign retained' }])); foreign = localStorage.getItem(catalog); }
    return result;
  });
  const beforeDeleted = pair().deleted;
  await expect(merge({ customPersonalities: [incoming] })).rejects.toMatchObject({ persistenceUncertain: false });
  expect(pair()).toEqual({ catalog: foreign, deleted: beforeDeleted }); await clean();
});
it.each(['mode', 'key'] as const)('rejects a protection %s change during preparation before data writes', async which => {
  const before = pair(), prepare = protection.prepareEncryptedLocalStorageValue; let changed = false;
  vi.spyOn(protection, 'prepareEncryptedLocalStorageValue').mockImplementation(async (key, text) => {
    const result = await prepare(key, text);
    if (text.includes(incoming.id) && !changed) { changed = true; if (which === 'mode') localStorage.removeItem('labcharts-encryption-enabled'); else await protection._setTestSessionKey('different synthetic key'); }
    return result;
  });
  await expect(merge({ customPersonalities: [incoming] })).rejects.toMatchObject({ persistenceUncertain: false }); expect(pair()).toEqual(before); await clean();
});
it('requires real lock capability rather than performing an uncoordinated pair write', async () => {
  const before = pair(); vi.stubGlobal('navigator', {}); await expect(merge({ customPersonalities: [incoming] })).rejects.toThrow('Web Locks'); expect(pair()).toEqual(before); await clean();
});
it('cannot replace encrypted data after the session key has changed', async () => {
  const before = pair(); await protection._setTestSessionKey('unrelated key'); await expect(merge({ customPersonalities: [incoming] })).rejects.toThrow(); expect(pair()).toEqual(before); await clean();
});
it.each(['bad-local-catalog', 'bad-local-deletions', 'bad-remote-catalog', 'duplicate-remote', 'bad-remote-deletions', 'catalog-capacity', 'deletion-capacity'] as const)('fails closed without truncating or resetting state: %s', async which => {
  let input: Parameters<typeof merge>[0] = { customPersonalities: [incoming] };
  if (which === 'bad-local-catalog') await protection.encryptedSetItem(catalog, '[broken');
  if (which === 'bad-local-deletions') await protection.encryptedSetItem(deleted, '{"custom_lost":"100"}');
  if (which === 'bad-remote-catalog') input = { customPersonalities: { malformed: true } };
  if (which === 'duplicate-remote') input = { customPersonalities: [incoming, incoming] };
  if (which === 'bad-remote-deletions') input = { customPersonalityDeleted: { custom_lost: '100' } };
  if (which === 'catalog-capacity') await protection.encryptedSetItem(catalog, JSON.stringify(Array.from({ length: 50 }, (_, i) => ({ id: `custom_${i}`, retained: i }))));
  if (which === 'deletion-capacity') { await protection.encryptedSetItem(deleted, JSON.stringify(Object.fromEntries(Array.from({ length: 200 }, (_, i) => [`custom_${i}`, i + 1])))); input = { customPersonalityDeleted: { custom_extra: 500 } }; }
  const before = pair(); await expect(merge(input)).rejects.toThrow(); expect(pair()).toEqual(before); await clean();
});
