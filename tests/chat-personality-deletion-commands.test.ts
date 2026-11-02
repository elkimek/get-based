import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { state } from '../js/state.js';
import * as protection from '../js/crypto.js';
import { installPersonaCommandTestLocks } from './helpers/persona-command-locks.js';
import { deleteBlob } from '../js/blob-storage.js';
import { personaJournalKey } from '../js/persona-storage-transaction.js';
import { captureCustomPersonalityDeletion, commitCustomPersonalityDeletion, customPersonalityStorageKey, customPersonalityTombstoneStorageKey, getCachedCustomPersonalities, recordCustomPersonalityDeletion } from '../js/chat-personality-storage.js';

let profile: string, catalog: string, deleted: string, sequence = 0;
const target = { id: 'custom_target', name: 'Target', icon: 'T', promptText: 'Private target instructions', updatedAt: '2090-01-01T00:00:00.000Z' };
const survivor = { id: 'custom_keep', name: 'Keep', icon: 'K', promptText: 'Private retained instructions', futureField: { preserve: true } };
const baseline = () => ({ catalog: localStorage.getItem(catalog), deleted: localStorage.getItem(deleted) });
const remove = async (leaseId: string, canCommit = () => true) => commitCustomPersonalityDeletion(leaseId, { canCommit });
beforeEach(async () => {
  installPersonaCommandTestLocks();
  localStorage.clear(); profile = `persona-command-${++sequence}`; state.currentProfile = profile; state.currentThreadId = 'thread'; state.chatHistory = [];
  (window as unknown as { __WEARABLES_TEST: boolean }).__WEARABLES_TEST = true;
  localStorage.setItem('labcharts-encryption-enabled', 'true'); await protection._setTestSessionKey('synthetic persona command');
  catalog = customPersonalityStorageKey(profile); deleted = customPersonalityTombstoneStorageKey(profile);
  await protection.encryptedSetItem(catalog, JSON.stringify([target, survivor])); await protection.encryptedSetItem(deleted, JSON.stringify({ custom_old: 100 }));
});
afterEach(async () => { vi.restoreAllMocks(); await deleteBlob(personaJournalKey(profile)); vi.unstubAllGlobals(); await protection._setTestSessionKey(null); localStorage.clear(); });

it('deletes only the reviewed persona, preserving unknown survivor fields and encrypted deletion history', async () => {
  const health = JSON.stringify(state.importedData), review = await captureCustomPersonalityDeletion(target.id);
  expect(review).toMatchObject({ id: target.id, name: target.name }); expect(JSON.stringify(review)).not.toContain('instructions');
  expect(await remove(review.leaseId)).toMatchObject({ deleted: true, profileId: profile, id: target.id });
  expect(localStorage.getItem(catalog)).toMatch(/^v1:/); expect(localStorage.getItem(catalog)).not.toContain('Private');
  expect(JSON.parse((await protection.encryptedGetItem(catalog))!)).toEqual([survivor]);
  expect(JSON.parse((await protection.encryptedGetItem(deleted))!)).toEqual({ custom_old: 100, custom_target: Date.parse(target.updatedAt) });
  expect(getCachedCustomPersonalities().map(item => item.id)).toEqual([survivor.id]); expect(JSON.stringify(state.importedData)).toBe(health);
  await expect(remove(review.leaseId)).rejects.toThrow('expired');
});
it('rejects a stale reviewed collection instead of deleting a newly edited persona', async () => {
  const review = await captureCustomPersonalityDeletion(target.id);
  await protection.encryptedSetItem(catalog, JSON.stringify([{ ...target, promptText: 'Newer instructions' }, survivor])); const before = baseline();
  await expect(remove(review.leaseId)).rejects.toThrow('changed'); expect(baseline()).toEqual(before);
});
it.each(['profile', 'thread', 'history', 'root', 'permission'] as const)('rejects changed %s ownership before mutation', async field => {
  const review = await captureCustomPersonalityDeletion(target.id), before = baseline();
  if (field === 'profile') state.currentProfile = 'different';
  if (field === 'thread') state.currentThreadId = 'different';
  if (field === 'history') state.chatHistory = [];
  if (field === 'root') state.importedData = { ...state.importedData };
  await expect(remove(review.leaseId, () => field !== 'permission')).rejects.toThrow('changed'); expect(baseline()).toEqual(before);
});
it('rechecks ownership after asynchronous encryption and before either stored key changes', async () => {
  const review = await captureCustomPersonalityDeletion(target.id), before = baseline(), prepare = protection.prepareEncryptedLocalStorageValue;
  vi.spyOn(protection, 'prepareEncryptedLocalStorageValue').mockImplementation(async (key, text) => { const value = await prepare(key, text); state.currentProfile = 'new-profile'; return value; });
  await expect(remove(review.leaseId)).rejects.toMatchObject({ persistenceUncertain: false }); expect(baseline()).toEqual(before);
});
it.each(['throw', 'drop'] as const)('restores exact ciphertext and absence when the second write does %s', async failure => {
  localStorage.removeItem(deleted); const review = await captureCustomPersonalityDeletion(target.id), before = baseline(), set = localStorage.setItem.bind(localStorage);
  vi.spyOn(localStorage, 'setItem').mockImplementation((key, value) => { if (key === deleted) { if (failure === 'throw') throw new Error('quota'); return; } set(key, value); });
  await expect(remove(review.leaseId)).rejects.toMatchObject({ persistenceUncertain: false }); expect(baseline()).toEqual(before);
  expect(getCachedCustomPersonalities().map(item => item.id)).toEqual([target.id, survivor.id]);
});
it('keeps the outcome uncertain when compensation cannot restore the owned write', async () => {
  const review = await captureCustomPersonalityDeletion(target.id), before = baseline(), set = localStorage.setItem.bind(localStorage); let writes = 0;
  vi.spyOn(localStorage, 'setItem').mockImplementation((key, value) => { if ((key === catalog || key === deleted) && ++writes > 1) throw new Error('quota including rollback'); set(key, value); });
  await expect(remove(review.leaseId)).rejects.toMatchObject({ persistenceUncertain: true }); expect(localStorage.getItem(catalog)).not.toBe(before.catalog); expect(localStorage.getItem(deleted)).toBe(before.deleted);
});
it('never compensates over an unrelated replacement, even when it appears during a write', async () => {
  const replacement = (await protection.prepareEncryptedLocalStorageValue(catalog, JSON.stringify([{ ...survivor, name: 'External newer edit' }]))).value;
  const review = await captureCustomPersonalityDeletion(target.id), before = baseline(), set = localStorage.setItem.bind(localStorage); let once = true;
  vi.spyOn(localStorage, 'setItem').mockImplementation((key, value) => { set(key, value); if (key === catalog && once) { once = false; set(key, replacement); } });
  await expect(remove(review.leaseId)).rejects.toMatchObject({ persistenceUncertain: true }); expect(localStorage.getItem(catalog)).toBe(replacement); expect(localStorage.getItem(deleted)).toBe(before.deleted);
});
it('admits at most one of two concurrent deletion reviews', async () => {
  const first = await captureCustomPersonalityDeletion(target.id), second = await captureCustomPersonalityDeletion(target.id);
  const outcomes = await Promise.allSettled([remove(first.leaseId), remove(second.leaseId)]);
  expect(outcomes.map(item => item.status).sort()).toEqual(['fulfilled', 'rejected']); expect(JSON.parse((await protection.encryptedGetItem(catalog))!)).toEqual([survivor]);
});
it.each(['corrupt-catalog', 'corrupt-history', 'locked'] as const)('fails closed for %s without replacing it with an empty collection', async failure => {
  if (failure === 'corrupt-catalog') localStorage.setItem(catalog, '{broken');
  if (failure === 'corrupt-history') await protection.encryptedSetItem(deleted, '{broken');
  if (failure === 'locked') await protection._setTestSessionKey(null);
  const before = baseline(); await expect(captureCustomPersonalityDeletion(target.id)).rejects.toThrow(); expect(baseline()).toEqual(before);
});
it('does not lose another concurrent deletion-history update', async () => {
  await Promise.all([recordCustomPersonalityDeletion('custom_one', profile, 200), recordCustomPersonalityDeletion('custom_two', profile, 300)]);
  expect(JSON.parse((await protection.encryptedGetItem(deleted))!)).toEqual({ custom_old: 100, custom_one: 200, custom_two: 300 });
});
it('refuses to use the prepared-value API for credentials or IndexedDB-backed profile data', async () => {
  const before = baseline(); await expect(protection.prepareEncryptedLocalStorageValue('labcharts-api-key', 'secret')).rejects.toThrow('native storage writer');
  await expect(protection.prepareEncryptedLocalStorageValue(`labcharts-${profile}-imported`, '{}')).rejects.toThrow('native storage writer'); expect(baseline()).toEqual(before);
});
it('prepares protected bytes without persisting, and refuses preparation after the key is locked', async () => {
  const before = baseline(), prepared = await protection.prepareEncryptedLocalStorageValue(catalog, 'Private prepared persona');
  expect(prepared.value).toMatch(/^v1:/); expect(prepared.value).not.toContain('Private'); expect(prepared.isCurrent()).toBe(true); expect(baseline()).toEqual(before);
  await protection._setTestSessionKey(null); expect(prepared.isCurrent()).toBe(false); await expect(protection.prepareEncryptedLocalStorageValue(catalog, 'Private prepared persona')).rejects.toThrow('locked'); expect(baseline()).toEqual(before);
});
it.each(['mode', 'key'] as const)('rejects a changed encryption %s during preparation without writing', async change => {
  const review = await captureCustomPersonalityDeletion(target.id), before = baseline(), prepare = protection.prepareEncryptedLocalStorageValue; let changed = false;
  vi.spyOn(protection, 'prepareEncryptedLocalStorageValue').mockImplementation(async (key, text) => {
    const value = await prepare(key, text);
    if (!changed) { changed = true; if (change === 'mode') localStorage.setItem('labcharts-encryption-enabled', 'false'); else await protection._setTestSessionKey('different synthetic key'); }
    return value;
  });
  await expect(remove(review.leaseId)).rejects.toMatchObject({ persistenceUncertain: false }); expect(baseline()).toEqual(before);
});
it('refuses a command requiring Web Locks before storage changes when locks are unavailable', async () => {
  const review = await captureCustomPersonalityDeletion(target.id), before = baseline();
  vi.stubGlobal('navigator', { locks: undefined });
  await expect(commitCustomPersonalityDeletion(review.leaseId, { canCommit: () => true, requireLocks: true })).rejects.toThrow('Web Locks'); expect(baseline()).toEqual(before);
});
it('deletes a legacy literal persona through the same exact native confirmation lease', async () => {
  localStorage.setItem(catalog, '"Quoted legacy instructions"'); const review = await captureCustomPersonalityDeletion('custom_migrated');
  expect(await remove(review.leaseId)).toMatchObject({ deleted: true, id: 'custom_migrated' }); expect(JSON.parse((await protection.encryptedGetItem(catalog))!)).toEqual([]); expect(JSON.parse((await protection.encryptedGetItem(deleted))!).custom_migrated).toBeGreaterThan(0);
});

it.each(['mode', 'key', 'key-roundtrip'] as const)('retires a deletion lease after a protection %s change without writing either stored key', async field => {
  const lease = await captureCustomPersonalityDeletion(target.id), before = baseline();
  if (field === 'mode') localStorage.setItem('labcharts-encryption-enabled', 'false');
  else { if (field === 'key-roundtrip') await protection._setTestSessionKey(null); await protection._setTestSessionKey('synthetic replacement protection key'); }
  await expect(remove(lease.leaseId)).rejects.toThrow('changed'); expect(baseline()).toEqual(before);
});
