import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { state } from '../js/state.js';
import * as protection from '../js/crypto.js';
import { deleteBlob, getBlob } from '../js/blob-storage.js';
import { personaJournalKey, personaJournalFence } from '../js/persona-storage-transaction.js';
import { captureCustomPersonalityEdit, commitCustomPersonalityEdit, releaseCustomPersonalityEdit, saveCustomPersonalitiesToStorage, customPersonalityStorageKey, customPersonalityTombstoneStorageKey, getCachedCustomPersonalities } from '../js/chat-personality-storage.js';
import { installPersonaCommandTestLocks } from './helpers/persona-command-locks.js';

let profile: string, catalog: string, deleted: string, sequence = 0;
const target = { id: 'custom_target', name: 'Reviewer', icon: '🌿', promptText: 'Private original instructions', evidenceBased: true, createdAt: '2020-01-01T00:00:00.000Z', updatedAt: '2090-01-01T00:00:00.000Z', futureField: { retained: true } };
const survivor = { id: 'custom_keep', name: 'Retained', icon: 'K', promptText: 'Private retained instructions', futureField: ['keep'] };
const fields = { name: 'Reviewer', promptText: 'Private revised instructions' };
const raw = () => ({ catalog: localStorage.getItem(catalog), deleted: localStorage.getItem(deleted) });
const records = async () => JSON.parse((await protection.encryptedGetItem(catalog, { throwOnDecryptError: true }))!) as Array<Record<string, unknown>>;
const save = (leaseId: string, canCommit = () => true) => commitCustomPersonalityEdit(leaseId, fields, { canCommit });
beforeEach(async () => {
  installPersonaCommandTestLocks(); localStorage.clear(); profile = `persona-edit-${++sequence}`; state.currentProfile = profile; state.currentThreadId = 'origin-thread'; state.chatHistory = [];
  (window as unknown as { __WEARABLES_TEST: boolean }).__WEARABLES_TEST = true;
  localStorage.setItem('labcharts-encryption-enabled', 'true'); await protection._setTestSessionKey('synthetic persona edit');
  catalog = customPersonalityStorageKey(profile); deleted = customPersonalityTombstoneStorageKey(profile); await protection.encryptedSetItem(catalog, JSON.stringify([target, survivor]));
});
afterEach(async () => { vi.restoreAllMocks(); await deleteBlob(personaJournalKey(profile)); vi.unstubAllGlobals(); await protection._setTestSessionKey(null); localStorage.clear(); });

it('edits the exact persona while preserving its icon, unknown fields, other records and absence', async () => {
  const health = JSON.stringify(state.importedData), lease = await captureCustomPersonalityEdit(target.id), result = await save(lease.leaseId), after = await records();
  expect(result).toMatchObject({ id: target.id, profileId: profile, saved: true, icon: target.icon }); expect(JSON.stringify(result)).not.toContain('Private');
  expect(after[0]).toEqual({ ...target, promptText: fields.promptText, updatedAt: after[0]!.updatedAt }); expect(Date.parse(String(after[0]!.updatedAt))).toBeGreaterThan(Date.parse(target.updatedAt)); expect(after[1]).toEqual(survivor);
  expect(localStorage.getItem(catalog)).toMatch(/^v1:/); expect(localStorage.getItem(catalog)).not.toContain('Private'); expect(localStorage.getItem(deleted)).toBeNull(); expect(await getBlob(personaJournalKey(profile))).toBeNull(); expect(localStorage.getItem(personaJournalFence(profile))).toBeNull(); expect(JSON.stringify(state.importedData)).toBe(health);
  await expect(save(lease.leaseId)).rejects.toThrow('expired'); expect(result.leaseId).toBeTypeOf('string'); await save(result.leaseId!);
});
it('creates a new persona without replacing the existing collection', async () => {
  const lease = await captureCustomPersonalityEdit(null), result = await commitCustomPersonalityEdit(lease.leaseId, { ...fields, icon: '✏️' }, { canCommit: () => true }), after = await records();
  expect(after.slice(0, 2)).toEqual([target, survivor]); expect(after[2]).toMatchObject({ id: result.id, name: fields.name, promptText: fields.promptText, evidenceBased: false, icon: '✏️' }); expect(localStorage.getItem(deleted)).toBeNull(); expect(result.id).not.toBe(target.id);
});
it.each(['absent', 'empty', 'null'] as const)('preserves an existing persona’s %s creation metadata instead of inventing a creation date', async format => {
  const { createdAt: _createdAt, ...original } = target;
  const existing = { ...original, ...(format === 'empty' ? { createdAt: '' } : format === 'null' ? { createdAt: null } : {}) };
  await protection.encryptedSetItem(catalog, JSON.stringify([existing, survivor]));
  const lease = await captureCustomPersonalityEdit(target.id); await save(lease.leaseId);
  const after = await records(); expect(after[0]).toEqual({ ...existing, name: fields.name, promptText: fields.promptText, updatedAt: after[0]!.updatedAt }); expect(after[1]).toEqual(survivor);
});
it('merges an unrelated change made after the editor opened instead of restoring its stale collection', async () => {
  const lease = await captureCustomPersonalityEdit(target.id), newer = { ...survivor, promptText: 'Newer unrelated instructions', anotherUnknown: 7 };
  await protection.encryptedSetItem(catalog, JSON.stringify([target, newer])); await save(lease.leaseId); expect((await records())[1]).toEqual(newer);
});
it('refuses an unseen target change and preserves its new ciphertext', async () => {
  const lease = await captureCustomPersonalityEdit(target.id); await protection.encryptedSetItem(catalog, JSON.stringify([{ ...target, promptText: 'Unseen newer target' }, survivor])); const before = raw();
  await expect(save(lease.leaseId)).rejects.toThrow('changed after'); expect(raw()).toEqual(before);
  await expect(captureCustomPersonalityEdit(target.id, profile, target)).rejects.toThrow('changed before'); expect(raw()).toEqual(before);
});
it('does not revive a tombstoned target from an open editor', async () => {
  const lease = await captureCustomPersonalityEdit(target.id); await protection.encryptedSetItem(deleted, JSON.stringify({ [target.id]: Date.parse('2091-01-01') })); const before = raw();
  await expect(save(lease.leaseId)).rejects.toThrow('deleted'); await expect(captureCustomPersonalityEdit(target.id)).rejects.toThrow('deleted'); expect(raw()).toEqual(before);
});
it.each(['profile', 'thread', 'history', 'root', 'permission'] as const)('rejects retired %s ownership before any record write', async field => {
  const lease = await captureCustomPersonalityEdit(target.id), before = raw();
  if (field === 'profile') state.currentProfile = 'different'; if (field === 'thread') state.currentThreadId = 'different'; if (field === 'history') state.chatHistory = []; if (field === 'root') state.importedData = { ...state.importedData };
  await expect(save(lease.leaseId, () => field !== 'permission')).rejects.toThrow('changed'); expect(raw()).toEqual(before);
});
it('rechecks ownership after encryption before starting the durable write', async () => {
  const lease = await captureCustomPersonalityEdit(target.id), before = raw(), prepare = protection.prepareEncryptedLocalStorageValue;
  vi.spyOn(protection, 'prepareEncryptedLocalStorageValue').mockImplementation(async (key, value) => { const result = await prepare(key, value); state.currentProfile = 'different'; return result; });
  await expect(save(lease.leaseId)).rejects.toMatchObject({ persistenceUncertain: false }); expect(raw()).toEqual(before);
});
it('does not overwrite another record replacement during encryption and accurately reports no own write', async () => {
  const lease = await captureCustomPersonalityEdit(target.id), prepare = protection.prepareEncryptedLocalStorageValue;
  vi.spyOn(protection, 'prepareEncryptedLocalStorageValue').mockImplementation(async (key, value) => { const result = await prepare(key, value); await protection.encryptedSetItem(catalog, JSON.stringify([{ ...target, name: 'Foreign replacement' }, survivor])); return result; });
  await expect(save(lease.leaseId)).rejects.toMatchObject({ persistenceUncertain: false }); expect((await records())[0]?.name).toBe('Foreign replacement');
});
it('restores the exact stored state and usable cache after a failed write, permitting a fresh reviewed retry', async () => {
  const lease = await captureCustomPersonalityEdit(target.id), before = raw(), set = localStorage.setItem.bind(localStorage); let fail = true;
  vi.spyOn(localStorage, 'setItem').mockImplementation((key, value) => { if (key === catalog && fail) { fail = false; throw new Error('Synthetic quota'); } set(key, value); });
  await expect(save(lease.leaseId)).rejects.toMatchObject({ persistenceUncertain: false }); expect(raw()).toEqual(before); expect(getCachedCustomPersonalities().map(item => item.id)).toEqual([target.id, survivor.id]);
  const fresh = await captureCustomPersonalityEdit(target.id); expect(await save(fresh.leaseId)).toMatchObject({ saved: true });
});
it('acknowledges a completed write for its origin after ownership retires during read-back', async () => {
  const lease = await captureCustomPersonalityEdit(target.id), read = protection.encryptedGetItem;
  vi.spyOn(protection, 'encryptedGetItem').mockImplementation(async (key, options) => { const value = await read(key, options); if (key === catalog && localStorage.getItem(personaJournalFence(profile))) state.currentProfile = 'different'; return value; });
  expect(await save(lease.leaseId)).toMatchObject({ saved: true, profileId: profile, leaseId: null }); expect((await records())[0]?.promptText).toBe(fields.promptText); expect(localStorage.getItem('labcharts-different-chatPersonalityCustom')).toBeNull();
});
it.each(['locked', 'broken-catalog', 'broken-deletions', 'duplicate-target', 'unknown-format'] as const)('refuses %s instead of treating it as an empty write baseline', async failure => {
  if (failure === 'locked') await protection._setTestSessionKey(null); if (failure === 'broken-catalog') localStorage.setItem(catalog, '{broken'); if (failure === 'broken-deletions') await protection.encryptedSetItem(deleted, '{broken'); if (failure === 'duplicate-target') await protection.encryptedSetItem(catalog, JSON.stringify([target, target])); if (failure === 'unknown-format') await protection.encryptedSetItem(catalog, '{"futureVersion":{}}');
  const before = raw(); await expect(captureCustomPersonalityEdit(null)).rejects.toThrow(); expect(raw()).toEqual(before);
});
it.each(['Legacy persona instructions', '123', 'true', 'null', '"Quoted legacy instructions"'])('migrates a legacy plaintext persona %j through an explicit native edit', async legacy => {
  localStorage.setItem(catalog, legacy); const lease = await captureCustomPersonalityEdit('custom_migrated'); await save(lease.leaseId); expect((await records())[0]).toMatchObject({ id: 'custom_migrated', promptText: fields.promptText }); expect(localStorage.getItem(catalog)).toMatch(/^v1:/);
});
it('does not invent a legacy persona when creating over an explicitly empty catalog', async () => {
  localStorage.setItem(catalog, ''); const lease = await captureCustomPersonalityEdit(null); await save(lease.leaseId); const after = await records(); expect(after).toHaveLength(1); expect(after[0]?.id).toBe(lease.id); expect(lease.id).not.toBe('custom_migrated');
});
it('retains existing agreement metadata when the native edit supplies no new agreement', async () => {
  const agreement = { accepted: true, version: 1, acceptedAt: '2026-01-01T00:00:00.000Z', host: 'getbased.health', statement: 'Existing native acceptance', futureAgreementField: true };
  await protection.encryptedSetItem(catalog, JSON.stringify([{ ...target, personaAgreement: agreement }, survivor])); const lease = await captureCustomPersonalityEdit(target.id); await save(lease.leaseId); expect((await records())[0]?.personaAgreement).toEqual(agreement);
});
it('retains its saved receipt when an optional continuation lease cannot be created', async () => {
  const lease = await captureCustomPersonalityEdit(target.id), before = raw(), uuid = crypto.randomUUID.bind(crypto);
  vi.spyOn(crypto, 'randomUUID').mockImplementation(() => { if (localStorage.getItem(catalog) !== before.catalog && !localStorage.getItem(personaJournalFence(profile))) throw new Error('Synthetic continuation failure'); return uuid(); });
  expect(await save(lease.leaseId)).toMatchObject({ saved: true, id: target.id, leaseId: null }); expect((await records())[0]?.promptText).toBe(fields.promptText);
});
it('revokes a retired editor lease without changing its records', async () => {
  const lease = await captureCustomPersonalityEdit(target.id), before = raw(); releaseCustomPersonalityEdit(lease.leaseId);
  await expect(save(lease.leaseId)).rejects.toThrow('expired'); expect(raw()).toEqual(before);
});
it('rejects before data writes when another accepted collection writer is queued during preparation', async () => {
  const lease = await captureCustomPersonalityEdit(target.id), prepare = protection.prepareEncryptedLocalStorageValue; let release!: () => void, reached!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; }), entered = new Promise<void>(resolve => { reached = resolve; });
  vi.spyOn(protection, 'prepareEncryptedLocalStorageValue').mockImplementation(async (key, text) => { const value = await prepare(key, text); reached(); await gate; return value; });
  const operation = save(lease.leaseId), rejected = expect(operation).rejects.toMatchObject({ persistenceUncertain: false }); await entered;
  const writer = saveCustomPersonalitiesToStorage([target, { ...survivor, promptText: 'Queued collection instructions' }], profile); release(); await rejected; await writer;
  const after = await records(); expect(after[0]?.promptText).toBe(target.promptText); expect(after[1]?.promptText).toBe('Queued collection instructions');
});

it.each(['mode', 'key', 'key-roundtrip'] as const)('retires a edit lease after a protection %s change without writing either stored key', async field => {
  const lease = await captureCustomPersonalityEdit(target.id), before = raw();
  if (field === 'mode') localStorage.setItem('labcharts-encryption-enabled', 'false');
  else { if (field === 'key-roundtrip') await protection._setTestSessionKey(null); await protection._setTestSessionKey('synthetic replacement protection key'); }
  await expect(save(lease.leaseId)).rejects.toThrow('changed'); expect(raw()).toEqual(before);
});
