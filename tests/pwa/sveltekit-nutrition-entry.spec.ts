import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { startKitServer } from './kit-server.js';
import { installDiscussionFixture } from '../helpers/chat-discussion-fixture.js';
import { captureOfflineLaunchDiagnostics } from '../helpers/offline-launch-diagnostics.js';
const artifact = process.env.GETBASED_KIT_ARTIFACT || path.resolve('.local-notes/sveltekit-build');
async function ready(page: Page) {
  try { await expect(page.locator('html[data-app-ready][data-shell-framework="sveltekit"]')).toBeAttached({ timeout: 30000 }); }
  catch (error) { await captureOfflineLaunchDiagnostics(page, test.info()); throw error; }
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
}
async function readProfile(page: Page): Promise<string> {
  return page.evaluate(async () => {
    const request = indexedDB.open('labcharts-blobs', 1);
    const db = await new Promise<IDBDatabase>((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    try {
      const tx = db.transaction('kv', 'readonly'), read = tx.objectStore('kv').get('labcharts-default-imported');
      return await new Promise<string>((resolve, reject) => {
        tx.oncomplete = () => typeof read.result === 'string' ? resolve(read.result) : reject(new Error('Missing committed profile'));
        tx.onabort = () => reject(tx.error || new Error('Read aborted')); tx.onerror = () => reject(tx.error || read.error || new Error('Read failed'));
      });
    } finally { db.close(); }
  });
}
async function history(page: Page) {
  const menu = page.getByRole('button', { name: 'Menu', exact: true }); if (await menu.isVisible()) await menu.click();
  await page.locator('.nav-item[data-category="insight"]').click(); await expect(page.locator('[data-context-cards-view]')).toBeVisible();
  await page.locator('[data-context-card-key="diet"] [data-nutrition-context-link]').click();
  await expect(page.locator('[data-nutrition-history-view]')).toBeVisible();
}
async function setup(page: Page) {
  await history(page); await page.locator('#detail-modal [data-nutrition-action="open-targets"]').click();
  await expect(page.locator('[data-nutrition-entry-view="targets"]')).toBeVisible();
}
async function drink(page: Page) {
  await page.getByRole('tab', { name: 'Trends', exact: true }).click();
  await page.locator('#detail-modal [data-nutrition-action="open-fluid-log"]').click();
  await expect(page.locator('[data-nutrition-entry-view="fluid"]')).toBeVisible();
}
test('static nutrition setup and drink saves work on first offline use and persist through two cold launches', async ({ page, context }) => {
  test.setTimeout(120000); await installDiscussionFixture(context);
  await context.addInitScript(() => {
    if (!['http:', 'https:'].includes(location.protocol)) return;
    localStorage.setItem('labcharts-ai-paused', 'true');
    if (localStorage.getItem('nutrition-entry-seeded')) return;
    localStorage.setItem('nutrition-entry-seeded', '1');
    const date = new Date(); date.setHours(12, 0, 0, 0); const timestamp = date.toISOString();
    const localDate = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const base = { eatenAt: timestamp, localDate, localTimeMinutes: 720, createdAt: timestamp, updatedAt: timestamp, reviewed: true, images: [], source: { kind: 'manual' } };
    localStorage.setItem('labcharts-default-imported', JSON.stringify({ entries: [], notes: [], contextNotes: 'Keep this note',
      wearableSummary: { metrics: { weight: { latest: 80, primarySource: 'fitbit' } } },
      nutritionMeals: [
        { ...base, id: 'offline-food', name: 'Offline lunch', mealType: 'lunch', nutrients: { energyKcal: 500, proteinG: 20, carbohydrateG: 50, fatG: 20 } },
        { ...base, id: 'offline-water', name: 'Earlier water', mealType: 'drink', nutrients: { fluidMl: 250, plainWaterMl: 250 }, source: { kind: 'manual-water' } },
      ], nutritionTargets: { configured: false, widgetNutrients: ['proteinG', 'carbohydrateG', 'fatG', 'fiberG', 'fluidMl'] },
      contextSourceSettings: { 'meals-nutrition': false },
    }));
  });
  const errors: string[] = [], csp: string[] = [];
  page.on('pageerror', error => errors.push(error.message)); context.on('page', target => target.on('pageerror', error => errors.push(error.message)));
  await context.exposeBinding('nutritionEntryCsp', (_, directive: string) => { csp.push(directive); });
  await context.addInitScript(() => document.addEventListener('securitypolicyviolation', event => { void (window as unknown as { nutritionEntryCsp(value: string): Promise<void> }).nutritionEntryCsp(event.violatedDirective); }));
  const server = await startKitServer(artifact);
  try {
    await page.goto(server.origin + '/app?dev-sw=1'); await ready(page);
    await expect(page.locator('link[href="/css/nutrition.css"]')).toHaveCount(0); server.state.offline = true;
    await setup(page); await page.locator('#nutrition-target-energy').fill('2400');
    await expect(page.locator('#nutrition-target-energy')).toHaveValue('2400');
    await page.locator('#nutrition-target-protein-basis').selectOption('active');
    await expect(page.locator('#nutrition-target-energy')).toHaveValue('2400');
    await expect(page.locator('#nutrition-target-protein-preview')).toContainText('128 g/day');
    await page.locator('[data-nutrition-action="save-targets"]').click(); await expect(page.locator('[data-nutrition-history-view]')).toBeVisible();
    await drink(page); await page.locator('input[name="nutrition-fluid-kind"][value="tea-coffee"]').check();
    await page.locator('#nutrition-fluid-amount').fill('275.5'); await page.locator('#nutrition-fluid-label').fill('Offline tea');
    await page.locator('[data-nutrition-action="save-fluid"]').click(); await expect(page.locator('#modal-overlay')).not.toHaveClass(/show/);
    const committed = await readProfile(page), profile = JSON.parse(committed);
    expect(profile.nutritionTargets).toMatchObject({ configured: true, energyKcal: 2400, proteinBasis: 'active', proteinGPerKg: 1.6 });
    expect(profile.contextNotes).toBe('Keep this note'); expect(profile.nutritionMeals).toHaveLength(3);
    expect(profile.nutritionMeals.find((meal: { name: string }) => meal.name === 'Offline tea')).toMatchObject({ mealType: 'drink', nutrients: { fluidMl: 275.5 }, images: [], source: { kind: 'manual-beverage' } });
    expect(profile.nutritionMeals.find((meal: { id: string }) => meal.id === 'offline-water').nutrients).toEqual({ fluidMl: 250, plainWaterMl: 250 });
    await page.close();
    for (let launch = 0; launch < 2; launch++) {
      const cold = await context.newPage(); await cold.goto(server.origin + '/app?dev-sw=1'); await ready(cold);
      await setup(cold); await expect(cold.locator('#nutrition-target-energy')).toHaveValue('2400');
      await expect(cold.locator('#nutrition-target-protein-basis')).toHaveValue('active');
      await expect(cold.locator('#nutrition-target-protein-preview')).toContainText('128 g/day');
      await cold.locator('[data-nutrition-action="return-history"]').click(); await expect(cold.locator('[data-nutrition-history-view]')).toBeVisible();
      await drink(cold); await expect(cold.locator('#nutrition-fluid-amount')).toHaveValue('350');
      await cold.locator('#detail-modal .modal-close').click(); await expect(cold.locator('#modal-overlay')).not.toHaveClass(/show/);
      expect(await readProfile(cold)).toBe(committed); await cold.close();
    }
    expect(errors).toEqual([]); expect(csp).toEqual([]);
  } finally { await server.close(); }
});
