import { IDBFactory, IDBObjectStore } from 'fake-indexeddb';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { _base64ToBytes, bytesToBase64 } from '../js/base64.js';
import { wrapDataKey } from '../js/crypto-passphrase-key.js';
import { encodeMigrationValue, decodeMigrationValue } from '../js/migration-codec.js';
import { sealMigration, openMigration, deriveMigrationKey, encryptMigrationDeviceValue, decryptMigrationDeviceValue } from '../js/migration-crypto.js';
import { sealMigrationPassphraseObject, openMigrationPassphraseObject } from '../js/migration-portable.js';
import { buildMigrationArchive, inspectMigrationArchive, validateMigrationArchive } from '../js/migration-archive.js';
import { restoreMigrationArchive, getPendingMigration, requireEmptyMigrationDestination } from '../js/migration-restore.js';
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
  const {device, key} = await source(encrypted);
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
  const comparisonRaw = (nutritionMeta.records.find(row => row.key === 'nutrition-comparison:v1')!.value as {value: unknown}).value;
  const comparisonEnv = encrypted
    ? await (async () => {
      const inner = await openMigrationPassphraseObject(key, comparisonRaw) as {version: number; iv: string; ciphertext: string};
      const {_base64ToBytes} = await import('../js/base64.js');
      return {version: inner.version, iv: _base64ToBytes(inner.iv), ciphertext: _base64ToBytes(inner.ciphertext).buffer};
    })()
    : comparisonRaw;
  expect(await decryptMigrationDeviceValue(nutritionKey, comparisonEnv)).toEqual({synthetic: 'Retain nutrition comparison'});
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

it('refuses legacy and corrupt local records before writing a profile index or recovery fence', async () => {
  await source(); const archive = await buildMigrationArchive(password, '');
  for (const key of ['labcharts-imported', 'labcharts-imported-corrupt', 'labcharts-default-imported-corrupt']) {
    origin(); const original = JSON.stringify({entries: [{date: '2020-01-01', markers: {'biochemistry.glucose': 5}}]});
    localStorage.setItem(key, original); faults.writes = 0;
    await expect(requireEmptyMigrationDestination()).rejects.toThrow('already contains records');
    await expect(restoreMigrationArchive(archive, password, '')).rejects.toThrow('already contains records');
    expect(localStorage.getItem(key)).toBe(original);
    expect(localStorage.getItem('labcharts-profiles')).toBeNull();
    expect(localStorage.getItem(MIGRATION_PENDING_KEY)).toBeNull();
    expect(faults.writes).toBe(0);
  }
});

it('recovers v2 wrapped passphrase keys, encrypted Evolu 8 identity vaults, and passphrase-wrapped nutrition stores', async () => {
  const device = await crypto.subtle.generateKey({name: 'AES-GCM', length: 256}, false, ['encrypt', 'decrypt']);
  const dataKey = await crypto.subtle.generateKey({name: 'AES-GCM', length: 256}, true, ['encrypt', 'decrypt']);
  const manifest = await wrapDataKey(originalPassphrase, dataKey);
  expect(manifest.startsWith('v2:')).toBe(true);
  localStorage.setItem('labcharts-encryption-enabled', 'true');
  localStorage.setItem('labcharts-encryption-salt', manifest);
  localStorage.setItem('labcharts-profiles', await wrapString(dataKey, '[{"id":"v2prof","name":"Wrapped profile"}]'));
  localStorage.setItem('labcharts-sync-enabled', 'true');
  localStorage.setItem('labcharts-sync-evolu8-identity-token', 'v2-identity-token');
  localStorage.setItem('labcharts-sync-relay', 'wss://relay.synthetic.invalid');
  localStorage.setItem('labcharts-companion-pairing', 'device-only-pairing-secret');
  const emptyStore = (name: string, keyPath: string | string[] | null) => ({name, keyPath, autoIncrement: false, indexes: [], records: []});
  const sealedIdentity = await sealMigrationPassphraseObject(dataKey, {token: 'v2-identity-token', mnemonic: 'v2 sync recovery phrase'});
  await writeMigrationDatabase({name: 'getbased-evolu8-identity', version: 1, stores: [
    {...emptyStore('identity', null), records: [{key: 'app-owner', value: {version: 1, token: 'v2-identity-token', ownerId: 'v2-owner', envelope: sealedIdentity}}]},
  ]});
  const mealDevice = await encryptMigrationDeviceValue(device, {name: 'Wrapped meal'});
  const mealOuter = await sealMigrationPassphraseObject(dataKey, {
    version: 1, iv: bytesToBase64(mealDevice.iv), ciphertext: bytesToBase64(new Uint8Array(mealDevice.ciphertext)),
  });
  const summaryDevice = await encryptMigrationDeviceValue(device, {totalMeals: 1});
  const summaryOuter = await sealMigrationPassphraseObject(dataKey, {
    version: 1, iv: bytesToBase64(summaryDevice.iv), ciphertext: bytesToBase64(new Uint8Array(summaryDevice.ciphertext)),
  });
  await writeMigrationDatabase({name: 'getbased-nutrition-v2prof', version: 3, stores: [
    {...emptyStore('meals', 'id'), records: [{key: 'meal-v2', value: {id: 'meal-v2', eatenAt: '2026-01-01', _devicePayload: mealOuter}}]},
    {...emptyStore('meta', 'k'), records: [
      {key: 'meal-device-key:v1', value: {k: 'meal-device-key:v1', value: device}},
      {key: 'nutrition-summary:v1', value: {k: 'nutrition-summary:v1', value: summaryOuter}},
    ]},
  ]});
  const blob = await buildMigrationArchive(password, originalPassphrase);
  const inspected = await inspectMigrationArchive(blob, password);
  expect(inspected.syncRecovery?.mnemonic).toBe('v2 sync recovery phrase');
  expect(inspected.local['labcharts-companion-pairing']).toBeUndefined();
  origin();
  await restoreMigrationArchive(blob, password, originalPassphrase);
  const restoredNutrition = await readMigrationDatabase('getbased-nutrition-v2prof');
  const meta = restoredNutrition.stores.find(store => store.name === 'meta')!;
  const newKey = (meta.records.find(row => row.key === 'meal-device-key:v1')!.value as {value: CryptoKey}).value;
  expect(newKey).not.toBe(device);
  const mealRow = restoredNutrition.stores.find(store => store.name === 'meals')!.records[0]!.value as {_devicePayload: unknown};
  const innerMeal = await openMigrationPassphraseObject(dataKey, mealRow._devicePayload);
  expect(innerMeal.version).toBe(1);
  const restoredIdentity = await readMigrationDatabase('getbased-evolu8-identity');
  const idRow = restoredIdentity.stores[0]!.records[0]!.value as {envelope: unknown};
  expect((await openMigrationPassphraseObject(dataKey, idRow.envelope)).mnemonic).toBe('v2 sync recovery phrase');
});

it('re-encrypts d1 device-protected Evolu 8 identity vaults for the destination browser key', async () => {
  const {device} = await source(false);
  const env = await encryptMigrationDeviceValue(device, {storageKey: 'evolu-identity:synthetic-identity-token', plaintext: 'device protected sync words'});
  const d1 = 'd1:' + bytesToBase64(env.iv) + ':' + bytesToBase64(new Uint8Array(env.ciphertext));
  await writeMigrationDatabase({name: 'getbased-evolu8-identity', version: 1, stores: [
    {name: 'identity', keyPath: null, autoIncrement: false, indexes: [], records: [
      {key: 'app-owner', value: {version: 1, token: 'synthetic-identity-token', ownerId: 'synthetic-owner', envelope: d1}},
    ]},
  ]});
  const blob = await buildMigrationArchive(password, '');
  const inspected = await inspectMigrationArchive(blob, password);
  expect(inspected.syncRecovery?.mnemonic).toBe('device protected sync words');
  origin();
  await restoreMigrationArchive(blob, password, '');
  const vault = await readMigrationDatabase('labcharts-wearables-credential-vault');
  const newKey = (vault.stores.find(store => store.name === 'meta')!.records.find(row => row.key === 'credential-vault-key:v1')!.value as {v: CryptoKey}).v;
  expect(newKey).not.toBe(device);
  const restoredIdentity = await readMigrationDatabase('getbased-evolu8-identity');
  const restoredRow = restoredIdentity.stores[0]!.records[0]!.value as {envelope: string};
  expect(restoredRow.envelope.startsWith('d1:')).toBe(true);
  expect(restoredRow.envelope).not.toBe(d1);
  const [, iv, ct] = restoredRow.envelope.split(':');
  const { _base64ToBytes } = await import('../js/base64.js');
  const plain = await decryptMigrationDeviceValue(newKey, {version: 1, iv: _base64ToBytes(iv!), ciphertext: _base64ToBytes(ct!)}) as {storageKey: string; plaintext: string};
  expect(plain).toEqual({storageKey: 'evolu-identity:synthetic-identity-token', plaintext: 'device protected sync words'});
});

it('upgrades older IndexedDB schemas read-only during export and restores them cleanly', async () => {
  const device = await crypto.subtle.generateKey({name: 'AES-GCM', length: 256}, false, ['encrypt', 'decrypt']);
  localStorage.setItem('labcharts-profiles', '[{"id":"legacy-db","name":"Legacy DB profile"}]');
  // Seed v1 cycle DB (without importId compound key, imports, or meta)
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.open('labcharts-cycle-legacy-db', 1);
    req.onupgradeneeded = () => { req.result.createObjectStore('daily-observations', {keyPath: ['source', 'date']}); };
    req.onsuccess = () => {
      const db = req.result; const tx = db.transaction('daily-observations', 'readwrite');
      tx.objectStore('daily-observations').put({source: 'manual', date: '2025-05-01', bleeding: 'light'});
      tx.oncomplete = () => { db.close(); resolve(); }; tx.onabort = () => reject(tx.error);
    };
    req.onerror = () => reject(req.error);
  });
  // Seed v2 nutrition DB with legacy food-cache store
  const meal = await encryptMigrationDeviceValue(device, {name: 'Legacy meal'});
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.open('getbased-nutrition-legacy-db', 2);
    req.onupgradeneeded = () => {
      req.result.createObjectStore('meals', {keyPath: 'id'}).createIndex('by_eaten_at', 'eatenAt', {unique: false});
      req.result.createObjectStore('meta', {keyPath: 'k'});
      req.result.createObjectStore('food-cache', {keyPath: 'k'});
    };
    req.onsuccess = () => {
      const db = req.result; const tx = db.transaction(['meals', 'meta', 'food-cache'], 'readwrite');
      tx.objectStore('meals').put({id: 'm1', eatenAt: '2025-05-01', _devicePayload: meal});
      tx.objectStore('meta').put({k: 'meal-device-key:v1', value: device});
      tx.objectStore('food-cache').put({k: 'stale', v: 1});
      tx.oncomplete = () => { db.close(); resolve(); }; tx.onabort = () => reject(tx.error);
    };
    req.onerror = () => reject(req.error);
  });
  // Seed v1 cashu DB (without fee-proofs) and v1 backups DB (without folder-handle)
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.open('getbased-cashu', 1);
    req.onupgradeneeded = () => { req.result.createObjectStore('proofs', {keyPath: 'secret'}); req.result.createObjectStore('meta', {keyPath: 'key'}); };
    req.onsuccess = () => {
      const db = req.result; const tx = db.transaction('proofs', 'readwrite');
      tx.objectStore('proofs').put({secret: 's1', amount: 1});
      tx.oncomplete = () => { db.close(); resolve(); }; tx.onabort = () => reject(tx.error);
    };
    req.onerror = () => reject(req.error);
  });
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.open('labcharts-backups', 1);
    req.onupgradeneeded = () => { req.result.createObjectStore('snapshots', {keyPath: 'id', autoIncrement: true}); };
    req.onsuccess = () => { req.result.close(); resolve(); };
    req.onerror = () => reject(req.error);
  });
  const blob = await buildMigrationArchive(password, '');
  // Verify source v1 cycle DB was NOT mutated
  const sourceVersion = await new Promise<number>((resolve, reject) => {
    const req = indexedDB.open('labcharts-cycle-legacy-db');
    req.onsuccess = () => { const v = req.result.version; req.result.close(); resolve(v); };
    req.onerror = () => reject(req.error);
  });
  expect(sourceVersion).toBe(1);
  origin();
  await restoreMigrationArchive(blob, password, '');
  const restoredCycle = await readMigrationDatabase('labcharts-cycle-legacy-db');
  expect(restoredCycle.version).toBe(2);
  expect(restoredCycle.stores.find(store => store.name === 'daily-observations')!.records).toEqual([
    {key: ['manual', '2025-05-01', 'legacy:2025-05-01'], value: {source: 'manual', date: '2025-05-01', bleeding: 'light', importId: 'legacy:2025-05-01'}},
  ]);
  const restoredNutrition = await readMigrationDatabase('getbased-nutrition-legacy-db');
  expect(restoredNutrition.version).toBe(3);
  expect(restoredNutrition.stores.map(store => store.name)).toEqual(['meals', 'meta']);
  expect((await readMigrationDatabase('getbased-cashu')).version).toBe(2);
  expect((await readMigrationDatabase('labcharts-backups')).version).toBe(2);
});

it('exports and restores a legacy single-profile labcharts-imported install over a fresh default destination', async () => {
  const legacyData = JSON.stringify({entries: [{date: '2020-01-01', markers: {'biochemistry.glucose': 5.1}}]});
  localStorage.setItem('labcharts-imported', legacyData);
  const blob = await buildMigrationArchive(password, '');
  const inspected = await inspectMigrationArchive(blob, password);
  expect(inspected.inventory.profiles).toBe(1);
  origin();
  // Simulate a destination that was opened once and created an empty default profile
  localStorage.setItem('labcharts-profiles', JSON.stringify([{
    id: 'default', name: 'Default', sex: null, dob: null, location: {country: '', zip: ''},
    tags: [], notes: '', status: 'active', avatar: null, height: null, heightUnit: 'cm', pinned: false, createdAt: 1, lastUpdated: 1,
  }]));
  await restoreMigrationArchive(blob, password, '');
  expect(localStorage.getItem('labcharts-imported')).toBe(legacyData);
  expect(localStorage.getItem('labcharts-profiles')).toBeNull();
});

it('allows opting out of missing legacy Sync identity only when explicitly requested', async () => {
  await source();
  await writeMigrationDatabase({name: 'getbased-evolu8-identity', version: 1, stores: [{name: 'identity', keyPath: null, autoIncrement: false, indexes: [], records: []}]});
  localStorage.removeItem('labcharts-sync-evolu8-identity-token');
  const blob = await buildMigrationArchive(password, '', () => {}, {allowMissingLegacySync: true});
  const inspected = await inspectMigrationArchive(blob, password);
  expect(inspected.syncRecovery).toBeNull();
  expect(inspected.inventory.profiles).toBe(1);
});

it('re-encrypts plain-mode device-protected Cashu wallet proofs, fee proofs, and metadata for the destination key', async () => {
  const device = await crypto.subtle.generateKey({name: 'AES-GCM', length: 256}, false, ['encrypt', 'decrypt']);
  const sealDevice = async (storageKey: string, plaintext: string) => {
    const env = await encryptMigrationDeviceValue(device, {storageKey, plaintext});
    return 'd1:' + bytesToBase64(env.iv) + ':' + bytesToBase64(new Uint8Array(env.ciphertext));
  };
  localStorage.setItem('labcharts-profiles', '[{"id":"wallet-plain","name":"Wallet plain"}]');
  const proofKey = 'enc:v1:proof-digest-1';
  const feeKey = 'enc:v1:fee-digest-1';
  const proofJson = JSON.stringify({secret: 'raw-proof-secret', amount: 128, C: '02abc', id: '009a1f', _mint: 'https://mint.example'});
  const feeJson = JSON.stringify({secret: 'raw-fee-secret', amount: 4, C: '02def', id: '009a1f', _mint: 'https://mint.example'});
  const pendingSwapJson = JSON.stringify({value: {version: 2, operation: 'send', mint: 'https://mint.example', outputs: ['out1']}});
  const sourceProofEnvelope = await sealDevice(`cashu-proof:${proofKey}`, proofJson);
  const sourceFeeEnvelope = await sealDevice(`cashu-proof:${feeKey}`, feeJson);
  const sourceMetaEnvelope = await sealDevice('cashu-meta:pendingSwap', pendingSwapJson);
  await writeMigrationDatabase({name: 'labcharts-wearables-credential-vault', version: 1, stores: [
    {name: 'daily-metrics', keyPath: ['source', 'date'], autoIncrement: false, indexes: [], records: []},
    {name: 'meta', keyPath: 'k', autoIncrement: false, indexes: [], records: [{key: 'credential-vault-key:v1', value: {k: 'credential-vault-key:v1', v: device, updatedAt: 1}}]},
  ]});
  await writeMigrationDatabase({name: 'getbased-cashu', version: 2, stores: [
    {name: 'fee-proofs', keyPath: 'secret', autoIncrement: false, indexes: [], records: [{key: feeKey, value: {secret: feeKey, _payload: sourceFeeEnvelope}}]},
    {name: 'meta', keyPath: 'key', autoIncrement: false, indexes: [], records: [
      {key: 'counter:009a1f', value: {key: 'counter:009a1f', value: 7}},
      {key: 'pendingSwap', value: {key: 'pendingSwap', _payload: sourceMetaEnvelope}},
    ]},
    {name: 'proofs', keyPath: 'secret', autoIncrement: false, indexes: [], records: [{key: proofKey, value: {secret: proofKey, _payload: sourceProofEnvelope}}]},
  ]});
  const blob = await buildMigrationArchive(password, '');
  origin();
  await restoreMigrationArchive(blob, password, '');
  const vaultDb = await readMigrationDatabase('labcharts-wearables-credential-vault');
  const destKey = (vaultDb.stores.find(s => s.name === 'meta')!.records.find(r => r.key === 'credential-vault-key:v1')!.value as {v: CryptoKey}).v;
  expect(destKey).not.toBe(device);
  const restoredCashu = await readMigrationDatabase('getbased-cashu');
  const openDest = async (envelope: string) => {
    const [, iv, ct] = envelope.split(':');
    return decryptMigrationDeviceValue(destKey, {version: 1, iv: _base64ToBytes(iv!), ciphertext: _base64ToBytes(ct!)}) as Promise<{storageKey: string; plaintext: string}>;
  };
  const restoredProof = restoredCashu.stores.find(s => s.name === 'proofs')!.records[0]!.value as {secret: string; _payload: string};
  const restoredFee = restoredCashu.stores.find(s => s.name === 'fee-proofs')!.records[0]!.value as {secret: string; _payload: string};
  const restoredMeta = restoredCashu.stores.find(s => s.name === 'meta')!.records;
  const restoredSwap = restoredMeta.find(r => r.key === 'pendingSwap')!.value as {key: string; _payload: string};
  expect(restoredProof._payload).not.toBe(sourceProofEnvelope);
  expect(restoredFee._payload).not.toBe(sourceFeeEnvelope);
  expect(restoredSwap._payload).not.toBe(sourceMetaEnvelope);
  expect(await openDest(restoredProof._payload)).toEqual({storageKey: `cashu-proof:${proofKey}`, plaintext: proofJson});
  expect(await openDest(restoredFee._payload)).toEqual({storageKey: `cashu-proof:${feeKey}`, plaintext: feeJson});
  expect(await openDest(restoredSwap._payload)).toEqual({storageKey: 'cashu-meta:pendingSwap', plaintext: pendingSwapJson});
  expect(restoredMeta.find(r => r.key === 'counter:009a1f')!.value).toEqual({key: 'counter:009a1f', value: 7});
});

it('migrates device-encrypted saved share-management records preserving authenticated keys', async () => {
  const device = await crypto.subtle.generateKey({name: 'AES-GCM', length: 256}, false, ['encrypt', 'decrypt']);
  const shareKey = 'getbased-profile-shares-v1:SyntheticShareId1234567890';
  const shareJson = JSON.stringify({id: 'SyntheticShareId1234567890', profileId: 'p1', manageToken: 'tok-1', expiresAt: '2099-01-01T00:00:00.000Z'});
  const env = await encryptMigrationDeviceValue(device, {storageKey: shareKey, plaintext: shareJson});
  const sourceEnvelope = 'd1:' + bytesToBase64(env.iv) + ':' + bytesToBase64(new Uint8Array(env.ciphertext));
  localStorage.setItem('labcharts-profiles', '[{"id":"p1","name":"Shared profile"}]');
  localStorage.setItem(shareKey, sourceEnvelope);
  await writeMigrationDatabase({name: 'labcharts-wearables-credential-vault', version: 1, stores: [
    {name: 'daily-metrics', keyPath: ['source', 'date'], autoIncrement: false, indexes: [], records: []},
    {name: 'meta', keyPath: 'k', autoIncrement: false, indexes: [], records: [{key: 'credential-vault-key:v1', value: {k: 'credential-vault-key:v1', v: device, updatedAt: 1}}]},
  ]});
  const blob = await buildMigrationArchive(password, '');
  origin();
  await restoreMigrationArchive(blob, password, '');
  const restoredEnvelope = localStorage.getItem(shareKey);
  expect(restoredEnvelope).toMatch(/^d1:/);
  expect(restoredEnvelope).not.toBe(sourceEnvelope);
  const vaultDb = await readMigrationDatabase('labcharts-wearables-credential-vault');
  const destKey = (vaultDb.stores.find(s => s.name === 'meta')!.records.find(r => r.key === 'credential-vault-key:v1')!.value as {v: CryptoKey}).v;
  const [, iv, ct] = restoredEnvelope!.split(':');
  const opened = await decryptMigrationDeviceValue(destKey, {version: 1, iv: _base64ToBytes(iv!), ciphertext: _base64ToBytes(ct!)}) as {storageKey: string; plaintext: string};
  expect(opened).toEqual({storageKey: shareKey, plaintext: shareJson});
});

it('refuses export when a backup restore is pending and strips orphaned rollback journals', async () => {
  localStorage.setItem('labcharts-profiles', '[{"id":"p1","name":"Backup profile"}]');
  localStorage.setItem('labcharts-backup-restore-pending', 'rollback');
  await writeMigrationDatabase({name: 'labcharts-blobs', version: 1, stores: [
    {name: 'kv', keyPath: null, autoIncrement: false, indexes: [], records: [{key: 'labcharts-backup-restore-journal-v1', value: 'd1:stale:journal'}]},
  ]});
  await expect(buildMigrationArchive(password, '')).rejects.toThrow('interrupted backup restore is still pending');
  // Once the fence is cleared, any orphaned rollback journal is excluded instead of copied with a dead device key.
  localStorage.removeItem('labcharts-backup-restore-pending');
  const blob = await buildMigrationArchive(password, '');
  origin();
  await restoreMigrationArchive(blob, password, '');
  const restoredBlobs = await readMigrationDatabase('labcharts-blobs');
  expect(restoredBlobs.stores.find(s => s.name === 'kv')!.records).toEqual([]);
});

it('recovers cleanly when an automatic handoff restore is interrupted mid-write and clears stale records on retry', async () => {
  await source(false);
  localStorage.setItem('labcharts-stale-chatDraft_main', 'stale draft from first attempt');
  const firstHandoffBlob = await buildMigrationArchive('EphemeralFirstPass1234!', '');

  // Source then changes before the user retries (removes stale key, KB file, and wearable/nutrition databases).
  origin();
  localStorage.setItem('labcharts-profiles', '[{"id":"fresh","name":"Fresh profile"}]');
  const retryHandoffBlob = await buildMigrationArchive('EphemeralRetryPass5678!', '');

  origin();
  faults.writes = 0;
  faults.failAt = 2;
  await expect(restoreMigrationArchive(firstHandoffBlob, 'EphemeralFirstPass1234!', '', undefined, {handoff: true}))
    .rejects.toThrow('Synthetic storage failure');
  // Simulate partial localStorage/file remnants left from the interrupted first attempt.
  localStorage.setItem('labcharts-stale-chatDraft_main', 'stale draft from first attempt');
  const staleDir = await root.getDirectoryHandle('lens-local', {create: true});
  const staleFile = await staleDir.getFileHandle('stale.txt', {create: true});
  staleFile.bytes = new TextEncoder().encode('stale');

  const pending = await getPendingMigration();
  expect(pending?.handoff).toBe(true);
  expect(localStorage.getItem(MIGRATION_PENDING_KEY)).toBe(pending?.id);

  // Re-sending a fresh automatic handoff clears stale keys, databases, and KB files
  // from the interrupted attempt before writing and verifying the new archive.
  faults.failAt = 0;
  const restored = await restoreMigrationArchive(retryHandoffBlob, 'EphemeralRetryPass5678!', '', undefined, {handoff: true});
  expect(restored.inventory.profiles).toBe(1);
  expect(localStorage.getItem('labcharts-profiles')).toContain('Fresh profile');
  expect(localStorage.getItem('labcharts-stale-chatDraft_main')).toBeNull();
  expect(await getPendingMigration()).toBeNull();
  expect(localStorage.getItem(MIGRATION_PENDING_KEY)).toBeNull();
  const remainingDbs = (await indexedDB.databases()).map(db => db.name).filter(name => name && name !== 'getbased-migration');
  expect(remainingDbs).toEqual(['labcharts-blobs']);
  const refreshedBlobs = await readMigrationDatabase('labcharts-blobs');
  expect(refreshedBlobs.stores.find(s => s.name === 'kv')!.records).toEqual([]);
  expect([...root.files.keys()]).toEqual([]);
});
