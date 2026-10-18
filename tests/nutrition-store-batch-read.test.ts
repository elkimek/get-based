import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { getNutritionMeal, listNutritionMeals, openNutritionDB, putNutritionMeal, resetNutritionDB, deleteNutritionDB, NutritionStorageIntegrityError } from '../js/nutrition-store.js';
import { state } from '../js/state.js';

type BatchOptions = {query: IDBKeyRange | null; count: number; direction: 'prev'};
type BulkIndex = IDBIndex & {getAllRecords(options: BatchOptions): IDBRequest<{value: unknown}[]>};
const prototype = IDBIndex.prototype as BulkIndex;
const bulkDescriptor = Object.getOwnPropertyDescriptor(prototype, 'getAllRecords')!;
const profiles = new Set<string>(); let serial = 0, profile: string;
let saved: Awaited<ReturnType<typeof putNutritionMeal>>[];
const dates = ['2026-01-01T12:00:00.000Z', '2026-10-10T12:00:00.000Z', '2026-10-10T12:00:00.000Z', '2026-10-11T12:00:00.000Z'];
async function seed(id: string) {
  profiles.add(id);
  return Promise.all(['old', 'a', 'z', 'new'].map((key, index) => putNutritionMeal(id, {id: key, name: `${id}/${key}`, eatenAt: dates[index]!, nutrients: {proteinG: 0, energyKcal: 100 + index}})));
}
beforeEach(async () => {profile = `batch-read-${++serial}`; saved = await seed(profile);});
afterEach(async () => {vi.restoreAllMocks(); Object.defineProperty(prototype, 'getAllRecords', bulkDescriptor); await Promise.all([...profiles].map(deleteNutritionDB)); profiles.clear();});
const expected = () => [saved[3], saved[2], saved[1], saved[0]];
function countKeyReads() {
  const original = IDBObjectStore.prototype.get, calls: string[] = [];
  vi.spyOn(IDBObjectStore.prototype, 'get').mockImplementation(function (this: IDBObjectStore, query: IDBValidKey | IDBKeyRange) {
    if (this.name === 'meta' && query === 'meal-device-key:v1') calls.push(this.transaction.db.name);
    return original.call(this, query);
  });
  return calls;
}
function cursorOnly() {Object.defineProperty(prototype, 'getAllRecords', {configurable: true, writable: true, value: undefined});}
async function writeMeta(value: unknown, remove = false) {
  const db = await openNutritionDB(profile), transaction = db.transaction('meta', 'readwrite'), store = transaction.objectStore('meta');
  if (remove) store.delete('meal-device-key:v1'); else store.put({k: 'meal-device-key:v1', value});
  await new Promise<void>((resolve, reject) => {transaction.oncomplete = () => resolve(); transaction.onerror = () => reject(transaction.error);});
}
async function deviceKey() {
  const db = await openNutritionDB(profile); return new Promise<CryptoKey>((resolve, reject) => {const request = db.transaction('meta', 'readonly').objectStore('meta').get('meal-device-key:v1'); request.onsuccess = () => resolve(request.result.value as CryptoKey); request.onerror = () => reject(request.error);});
}
async function replaceRow(id: string, value: unknown) {
  const db = await openNutritionDB(profile), transaction = db.transaction('meals', 'readwrite'); transaction.objectStore('meals').put(value);
  await new Promise<void>((resolve, reject) => {transaction.oncomplete = () => resolve(); transaction.onerror = () => reject(transaction.error);});
  expect((value as {id: string}).id).toBe(id);
}

it('actual bulk and cursor reads retain complete payloads, descending ties and inclusive since filtering', async () => {
  const original = prototype.getAllRecords, options: BatchOptions[] = [], cursor = vi.spyOn(IDBIndex.prototype, 'openCursor');
  vi.spyOn(prototype, 'getAllRecords').mockImplementation(function (this: BulkIndex, value) {options.push(value); return original.call(this, value);});
  expect(await listNutritionMeals(profile)).toEqual(expected()); expect(cursor).not.toHaveBeenCalled(); expect(options).toEqual([{query: null, count: 500, direction: 'prev'}]);
  const since = dates[1]!; expect(await listNutritionMeals(profile, {since, limit: 2})).toEqual(expected().slice(0, 2)); expect(options[1]!.query!.lower).toBe(since); expect(options[1]!.query!.lowerOpen).toBe(false);
  cursorOnly(); expect(await listNutritionMeals(profile)).toEqual(expected()); expect(await listNutritionMeals(profile, {since, limit: 3})).toEqual(expected().slice(0, 3)); expect(cursor).toHaveBeenCalled();
});
it.each([1, 2, 4, 500, 0xffffffff])('bounded primitive integer %s uses one native batch request without a cursor or key/decrypt skips', async limit => {
  const bulk = vi.spyOn(prototype, 'getAllRecords'), cursor = vi.spyOn(IDBIndex.prototype, 'openCursor'), keys = countKeyReads(), decrypt = vi.spyOn(crypto.subtle, 'decrypt');
  const result = await listNutritionMeals(profile, {limit}); expect(result).toEqual(expected().slice(0, limit)); expect(bulk).toHaveBeenCalledOnce(); expect(cursor).not.toHaveBeenCalled(); expect(keys).toHaveLength(1); expect(decrypt).toHaveBeenCalledTimes(result.length);
});
it.each([0, -3, 1.5, Number.NaN, Infinity, 0x100000000, '2', true, null])('legacy limit %s keeps the exact original cursor path', async limit => {
  const bulk = vi.spyOn(prototype, 'getAllRecords'), cursor = vi.spyOn(IDBIndex.prototype, 'openCursor');
  const result = await listNutritionMeals(profile, {limit}); const count = Math.ceil(Math.max(1, Number(limit) || 500));
  expect(result).toEqual(expected().slice(0, count)); expect(bulk).not.toHaveBeenCalled(); expect(cursor).toHaveBeenCalledOnce();
});
it('opaque changing limit coercion runs at its original per-cursor positions', async () => {
  let reads = 0; const limit = {valueOf() {return ++reads === 1 ? 3 : 1;}}; const bulk = vi.spyOn(prototype, 'getAllRecords');
  expect(await listNutritionMeals(profile, {limit})).toEqual(expected().slice(0, 1)); expect(reads).toBe(2); expect(bulk).not.toHaveBeenCalled();
});
it('since is coerced exactly once and never normalized into a new date contract', async () => {
  let reads = 0; const since = {toString() {reads++; return dates[1]!;}};
  expect(await listNutritionMeals(profile, {since, limit: 10})).toEqual(expected().slice(0, 3)); expect(reads).toBe(1);
});
it('independent simultaneous lists have one fresh key read each and decrypt every selected row', async () => {
  const keys = countKeyReads(), decrypt = vi.spyOn(crypto.subtle, 'decrypt');
  expect(await Promise.all([listNutritionMeals(profile), listNutritionMeals(profile)])).toEqual([expected(), expected()]); expect(keys).toHaveLength(2); expect(decrypt).toHaveBeenCalledTimes(8);
});
it('standalone and opaque profile IDs retain their original nonshared key reader and coercion counts', async () => {
  const keys = countKeyReads(); let coercions = 0; const opaque = {toString() {coercions++; return profile;}};
  expect(await listNutritionMeals(opaque)).toEqual(expected()); expect(coercions).toBe(5); expect(keys).toHaveLength(4); keys.length = 0;
  for (const row of expected()) expect(await getNutritionMeal(profile, row!.id)).toEqual(row); expect(keys).toHaveLength(4);
});
it.each([undefined, ''])('default profile argument %s keeps per-row key reads', async id => {
  const defaults = await seed('default'), keys = countKeyReads();
  expect(await listNutritionMeals(id)).toEqual([defaults[3], defaults[2], defaults[1], defaults[0]]); expect(keys).toHaveLength(4);
});
it('zero rows and all invalid envelopes never read or create a device key', async () => {
  const empty = `${profile}-empty`; profiles.add(empty); const keys = countKeyReads(), generated = vi.spyOn(crypto.subtle, 'generateKey');
  expect(await listNutritionMeals(empty)).toEqual([]); expect(keys).toHaveLength(0); expect(generated).not.toHaveBeenCalled();
  await replaceRow('new', {id: 'new', eatenAt: dates[3], updatedAt: dates[3], _devicePayload: {version: 2}});
  await expect(listNutritionMeals(profile, {limit: 1})).rejects.toBeInstanceOf(NutritionStorageIntegrityError); expect(keys).toHaveLength(0); expect(generated).not.toHaveBeenCalled();
});
it('a selected missing payload rejects with the exact message while an older excluded corrupt row stays unvisited', async () => {
  await replaceRow('old', {id: 'old', eatenAt: dates[0], updatedAt: dates[0]});
  expect(await listNutritionMeals(profile, {limit: 3})).toEqual(expected().slice(0, 3));
  await expect(listNutritionMeals(profile)).rejects.toThrow('A stored meal is missing its encrypted payload.');
});
it.each(['missing', 'invalid'] as const)('%s key rejects every still-encrypted batch without generating a replacement', async kind => {
  await writeMeta(kind === 'invalid' ? {type: 'public', algorithm: {name: 'RSA'}} : null, kind === 'missing');
  const keys = countKeyReads(), generated = vi.spyOn(crypto.subtle, 'generateKey');
  await expect(listNutritionMeals(profile)).rejects.toBeInstanceOf(NutritionStorageIntegrityError); expect(keys).toHaveLength(1); expect(generated).not.toHaveBeenCalled();
});
it('metadata errors preserve identity outside the crypto catch and a later list retries fresh', async () => {
  const original = IDBObjectStore.prototype.get, error = new Error('Native key read failed');
  const failure = vi.spyOn(IDBObjectStore.prototype, 'get').mockImplementation(function (this: IDBObjectStore, query) {if (this.name === 'meta' && query === 'meal-device-key:v1') throw error; return original.call(this, query);});
  await expect(listNutritionMeals(profile)).rejects.toBe(error); failure.mockRestore(); expect(await listNutritionMeals(profile)).toEqual(expected());
});
it('synchronous and asynchronous batch request errors reject instead of silently retrying a cursor', async () => {
  const error = new Error('Native batch fault'), cursor = vi.spyOn(IDBIndex.prototype, 'openCursor');
  const bulk = vi.spyOn(prototype, 'getAllRecords').mockImplementationOnce(() => {throw error;});
  await expect(listNutritionMeals(profile)).rejects.toBe(error); expect(cursor).not.toHaveBeenCalled(); bulk.mockRestore();
  const original = prototype.getAllRecords; vi.spyOn(prototype, 'getAllRecords').mockImplementationOnce(function (this: BulkIndex, options) {const request = original.call(this, options); this.objectStore.transaction.abort(); return request;});
  await expect(listNutritionMeals(profile)).rejects.toMatchObject({name: 'AbortError'}); expect(cursor).not.toHaveBeenCalled();
});
it('later calls reread a replaced/deleted key and reopen after reset rather than retaining any lifetime cache', async () => {
  const old = await deviceKey(); const keys = countKeyReads(); expect(await listNutritionMeals(profile)).toEqual(expected());
  const replacement = await crypto.subtle.generateKey({name: 'AES-GCM', length: 256}, false, ['encrypt', 'decrypt']); await writeMeta(replacement);
  await expect(listNutritionMeals(profile)).rejects.toBeInstanceOf(NutritionStorageIntegrityError); await writeMeta(old); expect(await listNutritionMeals(profile)).toEqual(expected());
  resetNutritionDB(profile); expect(await listNutritionMeals(profile)).toEqual(expected()); await writeMeta(null, true); await expect(listNutritionMeals(profile)).rejects.toBeInstanceOf(NutritionStorageIntegrityError); expect(keys).toHaveLength(5);
});
it('explicit profile lists remain bound to their own database when active profile state changes', async () => {
  const other = `${profile}-other`, otherRows = await seed(other), current = state.currentProfile;
  try {const first = listNutritionMeals(profile); state.currentProfile = other; const second = listNutritionMeals(other); expect(await first).toEqual(expected()); expect(await second).toEqual([otherRows[3], otherRows[2], otherRows[1], otherRows[0]]);}
  finally {state.currentProfile = current;}
});
it('an accepted held decrypt may finish after reset but the next invocation reads a fresh key', async () => {
  const original = crypto.subtle.decrypt.bind(crypto.subtle); let release!: () => void, entered = 0;
  const gate = new Promise<void>(resolve => {release = resolve;}), keys = countKeyReads();
  const held = vi.spyOn(crypto.subtle, 'decrypt').mockImplementation(async (algorithm, key, data) => {entered++; await gate; return original(algorithm, key, data);});
  const pending = listNutritionMeals(profile); await vi.waitFor(() => expect(entered).toBe(4)); resetNutritionDB(profile); release();
  expect(await pending).toEqual(expected()); held.mockRestore(); expect(await listNutritionMeals(profile)).toEqual(expected()); expect(keys).toHaveLength(2);
});
it('a corrupt selected ciphertext is never silently omitted from either read path', async () => {
  await replaceRow('new', {id: 'new', eatenAt: dates[3], updatedAt: dates[3], _devicePayload: {version: 1, iv: new Uint8Array(12), ciphertext: new Uint8Array([1, 2, 3])}});
  await expect(listNutritionMeals(profile)).rejects.toBeInstanceOf(NutritionStorageIntegrityError); cursorOnly(); await expect(listNutritionMeals(profile)).rejects.toBeInstanceOf(NutritionStorageIntegrityError);
});
