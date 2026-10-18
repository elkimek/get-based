import { expect, test } from '@playwright/test';
import { routeHtml } from '../helpers/browser-static-routes.js';

// This matrix case intentionally uses actual native public modules and native
// IndexedDB in every configured browser, independent of an optimized artifact.
test('native Nutrition batch capability and exact cursor fallback preserve encrypted ordered bounded reads', async ({page}, info) => {
  const errors: string[] = [], external: string[] = []; page.on('pageerror', error => errors.push(error.message));
  const origin = new URL(String(info.project.use.baseURL)).origin;
  await page.route('**/*', route => {if (new URL(route.request().url()).origin !== origin) {external.push(route.request().url()); return route.abort();} return route.continue();});
  await routeHtml(page, '**/native-nutrition-read-fixture', '<!doctype html><html><head><link rel="icon" href="data:,"></head><body>Finite native encrypted Nutrition read acceptance</body></html>');
  await page.goto(origin + '/native-nutrition-read-fixture');
  const receipt = await page.evaluate(async () => {
    const store = await import('/js/nutrition-store.js');
    type Options = {query: IDBKeyRange | null; count: number; direction: 'prev'};
    type BulkIndex = IDBIndex & {getAllRecords?: (this: IDBIndex, options: Options) => IDBRequest<{value: unknown}[]>};
    const prototype = IDBIndex.prototype as BulkIndex, descriptor = Object.getOwnPropertyDescriptor(prototype, 'getAllRecords'), nativeBulk = prototype.getAllRecords;
    const originalCursor = IDBIndex.prototype.openCursor, originalGet = IDBObjectStore.prototype.get;
    let batchRequests = 0, cursorRequests = 0, keyReads = 0;
    const a = 'browser-native-read-a', b = 'browser-native-read-b';
    const seed = async (profile: string) => Promise.all(['old', 'a', 'z', 'new'].map((id, index) => store.putNutritionMeal(profile, {id, name: `${profile}/${id}`, eatenAt: ['2026-01-01T12:00:00.000Z', '2026-10-10T12:00:00.000Z', '2026-10-10T12:00:00.000Z', '2026-10-11T12:00:00.000Z'][index], nutrients: {proteinG: 0, energyKcal: 100 + index}})));
    await store.deleteNutritionDB(a); await store.deleteNutritionDB(b);
    try {
      const saved = await seed(a), other = await seed(b), expected = [saved[3], saved[2], saved[1], saved[0]];
      if (nativeBulk) Object.defineProperty(prototype, 'getAllRecords', {configurable: true, writable: true, value: function (this: IDBIndex, options: Options) {batchRequests++; return nativeBulk.call(this, options);}});
      IDBIndex.prototype.openCursor = function (...args) {cursorRequests++; return originalCursor.apply(this, args);};
      IDBObjectStore.prototype.get = function (query) {if (this.name === 'meta' && query === 'meal-device-key:v1') keyReads++; return originalGet.call(this, query);};
      const native = await store.listNutritionMeals(a, {limit: 4}), firstCounts = {batchRequests, cursorRequests, keyReads};
      const nativeSince = await store.listNutritionMeals(a, {since: '2026-10-10T12:00:00.000Z', limit: 2});
      const rangedCounts = {batchRequests, cursorRequests, keyReads};
      Object.defineProperty(prototype, 'getAllRecords', {configurable: true, writable: true, value: undefined});
      const fallback = await store.listNutritionMeals(a, {limit: 4});
      const since = await store.listNutritionMeals(a, {since: '2026-10-10T12:00:00.000Z', limit: 2});
      const fractional = await store.listNutritionMeals(a, {limit: 1.5});
      const peer = await store.listNutritionMeals(b, {limit: 1});
      if (descriptor) Object.defineProperty(prototype, 'getAllRecords', descriptor); else delete prototype.getAllRecords;
      const db = await store.openNutritionDB(a), transaction = db.transaction('meals', 'readwrite');
      transaction.objectStore('meals').put({id: 'new', eatenAt: '2026-10-11T12:00:00.000Z', updatedAt: '2026-10-11T12:00:00.000Z', _devicePayload: {version: 1, iv: new Uint8Array(12), ciphertext: new Uint8Array([1, 2, 3])}});
      await new Promise<void>((resolve, reject) => {transaction.oncomplete = () => resolve(); transaction.onerror = () => reject(transaction.error);});
      let corruption = ''; try {await store.listNutritionMeals(a);} catch (error) {corruption = (error as Error).name;}
      return {capable: typeof nativeBulk === 'function', native, nativeSince, fallback, expected, since, fractional, peer, expectedPeer: [other[3]], firstCounts, rangedCounts, corruption};
    } finally {
      IDBIndex.prototype.openCursor = originalCursor; IDBObjectStore.prototype.get = originalGet;
      if (descriptor) Object.defineProperty(prototype, 'getAllRecords', descriptor); else delete prototype.getAllRecords;
      // Public reads settle their request/decryption result before the final
      // readonly transaction necessarily completes. Drain this fixture's own
      // transactions before testing real deletion, including WebKit close-pending.
      for (const profile of [a, b]) {
        const db = await store.openNutritionDB(profile);
        await new Promise<void>((resolve, reject) => {
          const transaction = db.transaction(['meals', 'meta'], 'readonly');
          transaction.oncomplete = () => resolve();
          transaction.onerror = () => reject(transaction.error);
          transaction.onabort = () => reject(transaction.error);
        });
        await store.deleteNutritionDB(profile);
      }
    }
  });
  expect(receipt.native).toEqual(receipt.expected); expect(receipt.fallback).toEqual(receipt.expected); expect(receipt.since).toEqual(receipt.expected.slice(0, 2)); expect(receipt.fractional).toEqual(receipt.expected.slice(0, 2)); expect(receipt.peer).toEqual(receipt.expectedPeer);
  expect(receipt.nativeSince).toEqual(receipt.expected.slice(0, 2));
  expect(receipt.rangedCounts).toEqual({batchRequests: receipt.capable ? 2 : 0, cursorRequests: receipt.capable ? 0 : 2, keyReads: 2});
  expect(receipt.firstCounts).toEqual({batchRequests: receipt.capable ? 1 : 0, cursorRequests: receipt.capable ? 0 : 1, keyReads: 1}); expect(receipt.corruption).toBe('NutritionStorageIntegrityError'); expect(errors).toEqual([]); expect(external).toEqual([]);
  await info.attach('native-nutrition-read-capability', {contentType: 'application/json', body: Buffer.from(JSON.stringify({capable: receipt.capable, firstCounts: receipt.firstCounts, rangedCounts: receipt.rangedCounts, boundary: 'Actual browser IndexedDB and public native module; forced absence compares exact legacy cursor, not a polyfilled batch implementation.'}, null, 2))});
});
