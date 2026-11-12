import { IDBFactory, IDBObjectStore } from 'fake-indexeddb';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { bytesToBase64 } from '../js/base64.js';
import { encodeMigrationValue, decodeMigrationValue } from '../js/migration-codec.js';
import { sealMigration, openMigration, deriveMigrationKey, encryptMigrationDeviceValue, decryptMigrationDeviceValue } from '../js/migration-crypto.js';
import { buildMigrationArchive, inspectMigrationArchive, validateMigrationArchive } from '../js/migration-archive.js';
import { restoreMigrationArchive, getPendingMigration } from '../js/migration-restore.js';
import { readMigrationDatabase, writeMigrationDatabase, MIGRATION_PENDING_KEY } from '../js/migration-database.js';
import type { MigrationDatabase } from '../js/migration-database.js';
import { MigrationMemoryDirectory, memoryStorage } from './helpers/migration-memory.js';

const faults = vi.hoisted(() => ({clients: vi.fn(async () => {}), writes: 0, failAt: 0, hostedRecovery: false}));
vi.mock('../shared/hosted-transition.js', () => ({getHostedTransition: () => faults.hostedRecovery ? {phase: 'recovery'} : null}));
vi.mock('../js/migration-clients.js', async load => ({...await load<typeof import('../js/migration-clients.js')>(), requireSingleMigrationClient: faults.clients}));
vi.mock('../js/migration-database.js', async load => {
  const actual = await load<typeof import('../js/migration-database.js')>();
  return {...actual, writeMigrationDatabase: async (database: MigrationDatabase) => {
    faults.writes++;
    if (faults.failAt && faults.writes === faults.failAt) throw new Error('Synthetic storage failure');
    return actual.writeMigrationDatabase(database);
  }};
});
const originalPassphrase = 'SyntheticOriginal1!', password = 'SyntheticMigration2!';
let root: MigrationMemoryDirectory;
function origin() {
  vi.resetModules(); // A different browser origin has fresh module instances.
  vi.stubGlobal('indexedDB', new IDBFactory());
  vi.stubGlobal('localStorage', memoryStorage());
  root = new MigrationMemoryDirectory();
  vi.stubGlobal('location', {origin: 'https://synthetic.example'});
  vi.stubGlobal('navigator', {storage: {getDirectory: async () => root},
    locks: {request: async (_name: string, _options: unknown, callback: () => Promise<unknown>) => callback()}});
}
beforeEach(() => { faults.clients.mockReset().mockResolvedValue(); faults.writes = 0; faults.failAt = 0; faults.hostedRecovery = false; origin(); });
afterEach(() => {vi.restoreAllMocks(); vi.unstubAllGlobals();});

async function wrapString(key: CryptoKey, value: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({name: 'AES-GCM', iv}, key, new TextEncoder().encode(value));
  return 'v1:' + bytesToBase64(iv) + ':' + bytesToBase64(new Uint8Array(ciphertext));
}
async function source(encrypted = false) {
  const device = await crypto.subtle.generateKey({name: 'AES-GCM', length: 256}, false, ['encrypt', 'decrypt']);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await deriveMigrationKey(originalPassphrase, salt);
  const write = async (name: string, value: string) => localStorage.setItem(name, encrypted ? await wrapString(key, value) : value);
  localStorage.setItem('labcharts-encryption-enabled', String(encrypted));
  if (encrypted) localStorage.setItem('labcharts-encryption-salt', bytesToBase64(salt));
  await write('labcharts-profiles', '[{"id":"synthetic","name":"Synthetic profile"}]');
  await write('labcharts-synthetic-chatDraft_main', 'Unsent synthetic draft');
  await write('labcharts-cashu-wallet-mnemonic', 'synthetic recovery words only');
  localStorage.setItem('labcharts-sync-enabled', 'true');
  localStorage.setItem('labcharts-sync-evolu8-identity-token', 'synthetic-identity-token');
  localStorage.setItem('labcharts-sync-relay', 'wss://relay.synthetic.invalid');
  const api = await encryptMigrationDeviceValue(device, {storageKey: 'labcharts-openrouter-key', plaintext: 'synthetic-api-value'});
  localStorage.setItem('labcharts-openrouter-key', 'd1:' + bytesToBase64(api.iv) + ':' + bytesToBase64(new Uint8Array(api.ciphertext)));
  const emptyStore = (name: string, keyPath: string | string[] | null) => ({name, keyPath, autoIncrement: false, indexes: [], records: []});
  const imported = JSON.stringify({entries: [], contextNotes: 'Synthetic private history', unknownFutureField: {preserved: true}});
  await writeMigrationDatabase({name: 'labcharts-blobs', version: 1, stores: [{...emptyStore('kv', null), records: [{key: 'labcharts-synthetic-imported', value: encrypted ? await wrapString(key, imported) : imported}]}]});
  await writeMigrationDatabase({name: 'getbased-evolu8-identity', version: 1, stores: [{...emptyStore('identity', null), records: [{key: 'app-owner', value: {version: 1, token: 'synthetic-identity-token', ownerId: 'synthetic-owner', mnemonic: 'synthetic sync recovery words'}}]}]});
  const row = {source: 'whoop', date: '1995-01-01', _devicePayload: await encryptMigrationDeviceValue(device, {hrv_rmssd: 71, _raw: {retained: true}})};
  await writeMigrationDatabase({name: 'labcharts-wearables-synthetic', version: 1, stores: [
    {...emptyStore('daily-metrics', ['source', 'date']), records: [{key: ['whoop', '1995-01-01'], value: row}]},
    {...emptyStore('meta', 'k'), records: [
      {key: 'credential-vault-key:v1', value: {k: 'credential-vault-key:v1', v: device}},
      {key: 'whoop-profile-data:v1', value: {k: 'whoop-profile-data:v1', v: await encryptMigrationDeviceValue(device, {version: 1, connection: {synthetic: true}})}},
      {key: 'credential-vault-record:v1:whoop', value: {k: 'credential-vault-record:v1:whoop', v: await encryptMigrationDeviceValue(device, {accessToken: 'synthetic-oauth-token'})}},
    ]},
  ]});
  await writeMigrationDatabase({name: 'labcharts-wearables-credential-vault', version: 1, stores: [emptyStore('daily-metrics', ['source', 'date']),
    {...emptyStore('meta', 'k'), records: [{key: 'credential-vault-key:v1', value: {k: 'credential-vault-key:v1', v: device}}]}]});
  const meal = await encryptMigrationDeviceValue(device, {name: 'Synthetic meal', thumbnail: 'synthetic thumbnail'});
  await writeMigrationDatabase({name: 'getbased-nutrition-synthetic', version: 3, stores: [
    {...emptyStore('meals', 'id'), records: [{key: 'meal1', value: {id: 'meal1', eatenAt: '2026-01-01', _devicePayload: meal}}]},
    {...emptyStore('meta', 'k'), records: [
      {key: 'meal-device-key:v1', value: {k: 'meal-device-key:v1', value: device}},
      {key: 'nutrition-summary:v1', value: {k: 'nutrition-summary:v1', value: await encryptMigrationDeviceValue(device, {totalMeals: 1, synthetic: 'Retain nutrition summary'})}},
      {key: 'nutrition-comparison:v1', value: {k: 'nutrition-comparison:v1', value: await encryptMigrationDeviceValue(device, {synthetic: 'Retain nutrition comparison'})}},
    ]},
  ]});
  await writeMigrationDatabase({name: 'getbased-cashu', version: 2, stores: [
    {...emptyStore('proofs', 'secret'), records: [{key: 'synthetic-proof', value: {secret: 'synthetic-proof', amount: 2}}]},
    {...emptyStore('fee-proofs', 'secret'), records: [{key: 'synthetic-fee', value: {secret: 'synthetic-fee', amount: 1}}]},
    {...emptyStore('meta', 'key'), records: [{key: 'pendingSwap', value: {key: 'pendingSwap', value: {synthetic: true}}}, {key: 'counter:test', value: {key: 'counter:test', value: 42}}]},
  ]});
  const library = await root.getDirectoryHandle('lens-local', {create: true});
  const file = await library.getFileHandle('_libraries.json', {create: true});
  file.bytes = new TextEncoder().encode('{"synthetic":"Knowledge Base registry"}');
  return {key, device};
}

it('round-trips structured values without confusing user objects for encoding tags', () => {
  const value = {bytes: new Uint8Array([0, 1, 255]), buffer: new Uint8Array([4, 9]).buffer,
    date: new Date('2026-01-01'), absent: undefined, nested: {__getbasedMigrationValue: ['bytes', 'actual user text']}};
  expect(decodeMigrationValue(encodeMigrationValue(value))).toEqual(value);
  expect(() => encodeMigrationValue({nan: NaN})).toThrow('non-finite');
});
it('authenticates the format, version, ciphertext and password without exposing content', async () => {
  const sealed = await sealMigration({private: 'synthetic health content'}, password);
  expect(JSON.stringify(sealed)).not.toContain('synthetic health');
  expect(await openMigration(sealed, password)).toEqual({private: 'synthetic health content'});
  await expect(openMigration(sealed, 'wrong password')).rejects.toThrow('password');
  await expect(openMigration({...sealed, iterations: 1}, password)).rejects.toThrow('Unsupported');
  const bytes = sealed.ciphertext; await expect(openMigration({...sealed, ciphertext: (bytes[0] === 'A' ? 'B' : 'A') + bytes.slice(1)}, password)).rejects.toThrow('damaged');
});

for (const encrypted of [false, true]) it('recovers ' + (encrypted ? 'passphrase-protected' : 'device-protected') + ' records into a fresh origin with new browser keys', async () => {
  const {device} = await source(encrypted);
  const sourceStorage = localStorage, sourceFactory = indexedDB;
  const before = await readMigrationDatabase('getbased-cashu');
  const blob = await buildMigrationArchive(password, encrypted ? originalPassphrase : '');
  expect(await blob.text()).not.toContain('synthetic-api-value');
  const inspected = await inspectMigrationArchive(blob, password);
  expect(inspected.syncRecovery?.mnemonic).toBe('synthetic sync recovery words');
  expect(encodeMigrationValue(inspected)).not.toContain('synthetic-oauth-token');
  expect(inspected.local['labcharts-sync-enabled']).toBeUndefined();
  origin();
  const restored = await restoreMigrationArchive(blob, password, encrypted ? originalPassphrase : '');
  expect(restored.databases).toHaveLength(inspected.databases.length);
  expect(localStorage.getItem(MIGRATION_PENDING_KEY)).toBeNull();
  expect(await getPendingMigration()).toBeNull();
  expect(localStorage.getItem('labcharts-sync-enabled')).toBe('false');
  expect(localStorage.getItem('labcharts-synthetic-chatDraft_main')).toBe(inspected.local['labcharts-synthetic-chatDraft_main']);
  const wearable = await readMigrationDatabase('labcharts-wearables-synthetic');
  const savedKey = (wearable.stores.find(store => store.name === 'meta')!.records.find(row => row.key === 'credential-vault-key:v1')!.value as {v: CryptoKey}).v;
  expect(savedKey).not.toBe(device); expect(savedKey.extractable).toBe(false);
  if (!encrypted) {
    const row = wearable.stores.find(store => store.name === 'daily-metrics')!.records[0]!.value as {_devicePayload: unknown};
    expect(await decryptMigrationDeviceValue(savedKey, row._devicePayload)).toEqual({hrv_rmssd: 71, _raw: {retained: true}});
  }
  const nutrition = await readMigrationDatabase('getbased-nutrition-synthetic');
  const nutritionMeta = nutrition.stores.find(store => store.name === 'meta')!;
  const nutritionKey = (nutritionMeta.records.find(row => row.key === 'meal-device-key:v1')!.value as {value: CryptoKey}).value;
  const comparison = (nutritionMeta.records.find(row => row.key === 'nutrition-comparison:v1')!.value as {value: unknown}).value;
  expect(await decryptMigrationDeviceValue(nutritionKey, comparison)).toEqual({synthetic: 'Retain nutrition comparison'});
  expect(await readMigrationDatabase('getbased-cashu')).toEqual(before);
  expect(new TextDecoder().decode((await (await root.getDirectoryHandle('lens-local')).getFileHandle('_libraries.json')).bytes)).toContain('Knowledge Base registry');
  vi.stubGlobal('localStorage', sourceStorage); vi.stubGlobal('indexedDB', sourceFactory);
  expect(await readMigrationDatabase('getbased-cashu')).toEqual(before);
  expect(localStorage.getItem('labcharts-sync-enabled')).toBe('true');
});

it('retains an encrypted recovery file and fence after a partial write, then retries without duplicate records', async () => {
  await source(); const blob = await buildMigrationArchive(password, ''); origin();
  faults.writes = 0; faults.failAt = 2;
  await expect(restoreMigrationArchive(blob, password, '')).rejects.toThrow('Synthetic storage failure');
  expect(localStorage.getItem(MIGRATION_PENDING_KEY)).toMatch(/^[a-f0-9]{64}$/);
  const pending = (await getPendingMigration())!;
  expect(pending.phase).toBe('restoring'); expect(await pending.blob.text()).toBe(await blob.text());
  expect(await pending.blob.text()).not.toContain('Synthetic private history');
  faults.failAt = 0;
  await restoreMigrationArchive(pending.blob, password, '');
  expect(await getPendingMigration()).toBeNull();
  expect((await readMigrationDatabase('getbased-cashu')).stores.find(store => store.name === 'proofs')!.records).toHaveLength(1);
});

it('does not overwrite a destination with existing records or write on inspection and wrong passwords', async () => {
  await source(true); const blob = await buildMigrationArchive(password, originalPassphrase); origin();
  await inspectMigrationArchive(blob, password);
  expect(await indexedDB.databases()).toEqual([]);
  await expect(restoreMigrationArchive(blob, 'wrong password', originalPassphrase)).rejects.toThrow('password');
  await expect(restoreMigrationArchive(blob, password, 'wrong original')).rejects.toThrow('original application passphrase');
  expect(await indexedDB.databases()).toEqual([]);
  localStorage.setItem('labcharts-profiles', '[{"id":"existing","name":"Existing records"}]');
  await expect(restoreMigrationArchive(blob, password, originalPassphrase)).rejects.toThrow('already contains records');
  expect(localStorage.getItem('labcharts-profiles')).toContain('Existing records');
  expect(localStorage.getItem(MIGRATION_PENDING_KEY)).toBeNull();
});

it('refuses a second application window and an aborted source transaction instead of producing a partial archive', async () => {
  await source(); faults.clients.mockRejectedValueOnce(new Error('Close other windows'));
  await expect(buildMigrationArchive(password, '')).rejects.toThrow('Close other');
  const actual = IDBObjectStore.prototype.getAll;
  vi.spyOn(IDBObjectStore.prototype, 'getAll').mockImplementation(function (this: IDBObjectStore, ...args) {
    const request = actual.apply(this, args); request.addEventListener('success', () => this.transaction.abort(), {once: true}); return request;
  });
  await expect(buildMigrationArchive(password, '')).rejects.toThrow('interrupted');
  expect(localStorage.getItem(MIGRATION_PENDING_KEY)).toBeNull();
});

it('rejects duplicate records and unsafe file paths before a restore can start', async () => {
  await source(); const archive = await inspectMigrationArchive(await buildMigrationArchive(password, ''), password);
  const invalid = structuredClone(archive); invalid.files[0]!.path = 'lens-local/../../private';
  expect(() => validateMigrationArchive(invalid)).toThrow('Invalid migration file');
  const store = archive.databases[0]!.stores[0]!; store.records.push(store.records[0]!);
  expect(() => validateMigrationArchive(archive)).toThrow('Duplicate migration record');
});

it('recovers a crash after the receipt commits but before the startup fence is removed', async () => {
  await source(); const blob = await buildMigrationArchive(password, ''); origin();
  const remove = localStorage.removeItem.bind(localStorage);
  const spy = vi.spyOn(localStorage, 'removeItem').mockImplementation(key => {
    if (key === MIGRATION_PENDING_KEY) throw new Error('Synthetic shutdown at fence cleanup');
    remove(key);
  });
  await expect(restoreMigrationArchive(blob, password, '')).rejects.toThrow('Synthetic shutdown');
  expect(localStorage.getItem(MIGRATION_PENDING_KEY)).not.toBeNull();
  spy.mockRestore();
  expect(await getPendingMigration()).toBeNull();
  expect(localStorage.getItem(MIGRATION_PENDING_KEY)).toBeNull();
  expect((await readMigrationDatabase('getbased-cashu')).stores.find(store => store.name === 'proofs')!.records).toHaveLength(1);
});

it('keeps startup fenced if the encrypted recovery file cannot be retained, and accepts the same file on retry', async () => {
  await source(); const blob = await buildMigrationArchive(password, ''); origin();
  const put = IDBObjectStore.prototype.put;
  const spy = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (this: IDBObjectStore, ...args) {
    if (this.transaction.db.name === 'getbased-migration' && args[1] === 'pending') throw new Error('Synthetic recovery-file quota failure');
    return put.apply(this, args);
  });
  await expect(restoreMigrationArchive(blob, password, '')).rejects.toThrow('recovery-file quota failure');
  expect(localStorage.getItem(MIGRATION_PENDING_KEY)).not.toBeNull();
  expect((await indexedDB.databases()).map(db => db.name)).toEqual(['getbased-migration']);
  spy.mockRestore();
  await restoreMigrationArchive(blob, password, '');
  expect(localStorage.getItem(MIGRATION_PENDING_KEY)).toBeNull();
});

it('includes every saved meal beyond the ordinary archive limit', async () => {
  await source();
  const db = await readMigrationDatabase('getbased-nutrition-synthetic');
  const meals = db.stores.find(store => store.name === 'meals')!;
  const value = meals.records[0]!.value as Record<string, unknown>;
  meals.records = Array.from({length: 10001}, (_, index) => ({key: 'meal-' + index, value: {...value, id: 'meal-' + index}}));
  await writeMigrationDatabase(db);
  const blob = await buildMigrationArchive(password, '');
  const archive = await inspectMigrationArchive(blob, password);
  expect(archive.databases.find(db => db.name === 'getbased-nutrition-synthetic')!.stores.find(store => store.name === 'meals')!.records).toHaveLength(10001);
  expect(archive.inventory.meals).toBe(10001);
});

it('finishes native pending persona recovery before collecting without copying its private journal', async () => {
  await source();
  const profile = 'synthetic', id = crypto.randomUUID();
  const catalog = 'labcharts-synthetic-chatPersonalityCustom', deleted = 'labcharts-synthetic-chatPersonalityDeleted';
  const record = {version: 1, profile, id, phase: 'prepared', changes: [
    {key: catalog, before: '[]', after: '[{"id":"synthetic-persona"}]'}, {key: deleted, before: null, after: '{"synthetic-persona":1}'},
  ]};
  const database = await readMigrationDatabase('labcharts-blobs');
  database.stores[0]!.records.push({key: 'labcharts-synthetic-persona-transaction', value: {sealed: false, payload: record}});
  await writeMigrationDatabase(database);
  localStorage.setItem('labcharts-synthetic-persona-transaction-pending', id);
  localStorage.setItem(catalog, record.changes[0]!.after);
  const archive = await inspectMigrationArchive(await buildMigrationArchive(password, ''), password);
  expect(localStorage.getItem(catalog)).toBe('[]'); expect(localStorage.getItem(deleted)).toBeNull();
  expect(localStorage.getItem('labcharts-synthetic-persona-transaction-pending')).toBeNull();
  expect(archive.databases.find(db => db.name === 'labcharts-blobs')!.stores[0]!.records.some(row => String(row.key).includes('persona-transaction'))).toBe(false);
});

it('rejects hosted recovery imports before reading or changing destination data', async () => {
  await source(); const blob = await buildMigrationArchive(password, ''); origin(); faults.hostedRecovery = true;
  await expect(restoreMigrationArchive(blob, password, '')).rejects.toThrow('recovery only');
  expect(localStorage.length).toBe(0); expect(await indexedDB.databases()).toEqual([]);
});

it('refuses to silently omit a configured legacy Sync identity before its vault handoff', async () => {
  await source();
  await writeMigrationDatabase({name: 'getbased-evolu8-identity', version: 1, stores: [{name: 'identity', keyPath: null, autoIncrement: false, indexes: [], records: []}]});
  localStorage.removeItem('labcharts-sync-evolu8-identity-token'); localStorage.setItem('labcharts-sync-paused', 'true');
  await expect(buildMigrationArchive(password, '')).rejects.toThrow('finish Sync identity recovery');
  expect(localStorage.getItem('labcharts-sync-enabled')).toBe('true');
});
