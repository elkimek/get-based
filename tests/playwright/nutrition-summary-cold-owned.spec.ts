import type { Page } from '@playwright/test';
import { expect, test } from './coverage-fixture.js';
import { installDiscussionFixture } from '../helpers/chat-discussion-fixture.js';
import { seedNutritionMealDetail } from '../helpers/nutrition-meal-detail-fixture.js';

async function receipt(page: Page) {
  return page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    const { encryptedGetItem } = await import('/js/crypto.js');
    return {profile: state.currentProfile, data: structuredClone(state.importedData), stored: await encryptedGetItem(`labcharts-${state.currentProfile}-imported`)};
  });
}
async function start(page: Page) {
  await page.goto('/app'); await expect(page.locator('html[data-app-ready]')).toBeAttached();
  await page.locator('.nav-item[data-category="body"]').click();
  await expect(page.locator('[data-nutrition-dashboard-view="intake"]')).toBeVisible();
  await expect(page.locator('#modal-overlay')).not.toHaveClass(/show/);
}
function control(page: Page, action: string) {return page.locator(`[data-nutrition-dashboard-view="intake"] [data-nutrition-action="${action}"]`).first();}

test.beforeEach(async ({ context }) => {await installDiscussionFixture(context, {paused: true}); await context.addInitScript(seedNutritionMealDetail);});

test('Body summaries are ready before editor requests, and a held actual first-click opens exactly one editor without altering saved data', async ({ page }) => {
  const errors: string[] = [], moduleRequests: string[] = []; page.on('pageerror', error => errors.push(error.message));
  let release!: () => void; const gate = new Promise<void>(done => {release = done;});
  await page.route('**/js/nutrition.js', async route => {moduleRequests.push(route.request().url()); await gate; await route.continue();});
  try {
    await start(page); expect(moduleRequests).toEqual([]); const before = await receipt(page);
    await control(page, 'open').dblclick(); await expect.poll(() => moduleRequests.length).toBe(1);
    await expect(page.locator('[data-nutrition-editor-view]')).toHaveCount(0); await expect(control(page, 'open')).toBeFocused();
    release(); await expect(page.locator('[data-nutrition-editor-view]')).toBeVisible(); await expect(page.locator('[data-nutrition-editor-view]')).toHaveCount(1);
    expect(await receipt(page)).toEqual(before); expect(moduleRequests).toHaveLength(1);
    await page.locator('#detail-modal .modal-close').click(); await expect(page.locator('#modal-overlay')).not.toHaveClass(/show/);
    await control(page, 'open-targets').click(); await expect(page.locator('#nutrition-target-settings')).toBeVisible(); expect(moduleRequests).toHaveLength(1); expect(await receipt(page)).toEqual(before); expect(errors).toEqual([]);
  } finally {release();}
});

for (const retired of ['escape', 'data', 'root'] as const) test(`actual held ${retired} control cannot open into a newer owner`, async ({page}) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  let release!: () => void, requested = false; const gate = new Promise<void>(done => {release = done;});
  await page.route('**/js/nutrition.js', async route => {requested = true; await gate; await route.continue();});
  try {
    await start(page); const before = await receipt(page); await control(page, 'open-targets').click(); await expect.poll(() => requested).toBe(true);
    if (retired === 'escape') await page.keyboard.press('Escape');
    else await page.evaluate(async reason => {
      if (reason === 'data') { const { state } = await import('/js/state.js'); state.importedData = {...state.importedData!, contextNotes: 'New owner data'}; }
      else document.querySelector('[data-nutrition-dashboard-view="intake"]')!.replaceWith(document.createElement('section'));
    }, retired);
    const current = await receipt(page); release();
    await page.evaluate(async () => {await (await import('/js/nutrition-context.js')).loadNutritionModule(); await new Promise(resolve => setTimeout(resolve, 50));});
    await expect(page.locator('#modal-overlay')).not.toHaveClass(/show/); await expect(page.locator('#nutrition-target-settings')).toHaveCount(0);
    expect(await receipt(page)).toEqual(current); expect(current.stored).toBe(before.stored); expect(errors).toEqual([]);
  } finally {release();}
});

test('a failed actual editor fetch retries once at the fixed URL and resident delegates remain single', async ({page}) => {
  const errors: string[] = [], requests: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.route('**/js/nutrition.js*', async route => {
    requests.push(new URL(route.request().url()).pathname + new URL(route.request().url()).search);
    if (requests.length === 1) await route.abort('failed'); else await route.continue();
  });
  await start(page); const before = await receipt(page); await control(page, 'open-targets').click();
  await expect(page.locator('.notification-toast.error')).toContainText('Meals & Nutrition could not be loaded. Try again.');
  await expect(page.locator('#modal-overlay')).not.toHaveClass(/show/); await control(page, 'open-targets').click();
  await expect(page.locator('#nutrition-target-settings')).toBeVisible(); expect(requests).toEqual(['/js/nutrition.js', '/js/nutrition.js?lazy-retry=1']);
  expect(await receipt(page)).toEqual(before);
  await page.locator('#detail-modal .modal-close').click(); await control(page, 'open').click(); await expect(page.locator('[data-nutrition-editor-view]')).toHaveCount(1);
  expect(requests).toHaveLength(2); expect(await receipt(page)).toEqual(before); expect(errors).toEqual([]);
});

for (const action of ['open', 'open-history'] as const) test(`Escape retires actual cold ${action} after dispatch while its real IndexedDB read is held`, async ({page}) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await start(page); const before = await receipt(page);
  await page.evaluate(async selected => {
    localStorage.setItem('labcharts-debug', 'true');
    const { state } = await import('/js/state.js'); const { openNutritionDB } = await import('/js/nutrition-store.js');
    const db = await openNutritionDB(state.currentProfile), storeName = selected === 'open' ? 'meta' : 'meals';
    let released = false, reads = 0;
    const originalGet = IDBObjectStore.prototype.get, originalCursor = IDBIndex.prototype.openCursor;
    const indexPrototype = IDBIndex.prototype as IDBIndex & {getAllRecords?: (...args: unknown[]) => IDBRequest<unknown>};
    const recordsDescriptor = Object.getOwnPropertyDescriptor(indexPrototype, 'getAllRecords');
    const originalRecords = indexPrototype.getAllRecords;
    if (typeof originalRecords === 'function') {
      indexPrototype.getAllRecords = function (...args) {
        if (this.objectStore.name === 'meals') reads++;
        return originalRecords.apply(this, args);
      };
    }
    IDBObjectStore.prototype.get = function (key) {if (this.name === 'meta' && this.transaction.mode === 'readonly' && key === 'nutrition-comparison:v1') reads++; return originalGet.call(this, key);};
    IDBIndex.prototype.openCursor = function (...args) {if (this.objectStore.name === 'meals') reads++; return originalCursor.apply(this, args);};
    const transaction = db.transaction(storeName, 'readwrite');
    const done = new Promise<void>((resolve, reject) => {transaction.oncomplete = () => resolve(); transaction.onabort = () => reject(transaction.error || new Error('Fixture hold aborted'));});
    // A genuine conflicting native transaction holds the actual controller's
    // readonly request. Every read is real; no module or persistence is mocked.
    const pump = () => {const request = transaction.objectStore(storeName).get('__finite_read_hold__'); request.onsuccess = () => {if (!released) pump();};}; pump();
    (window as unknown as {nutritionReadHold: {readonly reads: number; finish(): Promise<void>}}).nutritionReadHold = {
      get reads() {return reads;},
      async finish() {released = true; await done; IDBObjectStore.prototype.get = originalGet; IDBIndex.prototype.openCursor = originalCursor;
        if (recordsDescriptor) Object.defineProperty(indexPrototype, 'getAllRecords', recordsDescriptor);
        await new Promise<void>((resolve, reject) => {const drain = db.transaction(storeName, 'readonly'); drain.oncomplete = () => resolve(); drain.onerror = () => reject(drain.error);});
        await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      },
    };
  }, action);
  try {
    await control(page, action).click();
    await expect.poll(() => page.evaluate(() => (window as unknown as {nutritionReadHold: {reads: number}}).nutritionReadHold.reads)).toBeGreaterThan(0);
    await expect(page.locator('#modal-overlay')).not.toHaveClass(/show/); await page.keyboard.press('Escape');
  } finally {await page.evaluate(() => (window as unknown as {nutritionReadHold: {finish(): Promise<void>}}).nutritionReadHold.finish());}
  await expect(page.locator('#modal-overlay')).not.toHaveClass(/show/); expect(await receipt(page)).toEqual(before); expect(errors).toEqual([]);
});
