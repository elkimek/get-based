import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { startKitServer } from './kit-server.js';
import { installDiscussionFixture } from '../helpers/chat-discussion-fixture.js';
import { captureOfflineLaunchDiagnostics, navigateWithOfflineLaunchDiagnostics } from '../helpers/offline-launch-diagnostics.js';
const artifact = process.env.GETBASED_KIT_ARTIFACT || path.resolve('.local-notes/sveltekit-build');
async function ready(page: Page) {
  try { await expect(page.locator('html[data-app-ready][data-shell-framework="sveltekit"]')).toBeAttached({ timeout: 30000 }); }
  catch (error) { await captureOfflineLaunchDiagnostics(page, test.info()); throw error; }
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true)); await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
}
async function insight(page: Page) {
  const menu = page.getByRole('button', { name: 'Menu', exact: true }); if (await menu.isVisible()) await menu.click();
  await page.locator('.nav-item[data-category="insight"]').click(); await expect(page.locator('[data-context-cards-view]')).toBeVisible();
}
async function stored(page: Page) {
  return page.evaluate(async () => {
    const request = indexedDB.open('labcharts-blobs', 1), db = await new Promise<IDBDatabase>((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    try {
      const tx = db.transaction('kv', 'readonly'), read = tx.objectStore('kv').get('labcharts-default-imported');
      return await new Promise<string>((resolve, reject) => { tx.oncomplete = () => typeof read.result === 'string' ? resolve(read.result) : reject(new Error('Missing committed profile')); tx.onabort = () => reject(tx.error || new Error('Read aborted')); tx.onerror = () => reject(tx.error || read.error || new Error('Read failed')); });
    } finally { db.close(); }
  });
}
async function verifyHistory(page: Page, before: string) {
  await insight(page); await page.locator('[data-context-card-key="diet"] [data-nutrition-context-link]').click();
  const modal = page.locator('#detail-modal'); await expect(modal.locator('[data-nutrition-history-view]')).toBeVisible();
  await modal.locator('[data-nutrition-action="set-history-range"][data-nutrition-range="all"]').click();
  await expect(modal.locator('.nutrition-meal-row')).toHaveCount(12); await expect(modal.locator('.nutrition-history-meals-head')).toContainText('Showing newest 12 of 50');
  await expect(modal.locator('.nutrition-meal-copy strong').first()).toHaveText('Offline history meal 1');
  await modal.locator('.nutrition-history-more').click(); await expect(modal.locator('.nutrition-meal-row')).toHaveCount(24);
  await expect(modal.locator('.nutrition-history-more')).toContainText('26 remaining');
  await page.getByRole('tab', { name: 'Trends', exact: true }).click(); await expect(modal.locator('.nutrition-target-ring')).toHaveClass(/is-poor/);
  await expect(modal.locator('.nutrition-goal-grade')).toHaveCount(4); await expect(modal.locator('.nutrition-fuel-composition')).toBeVisible();
  await expect(modal.locator('.nutrition-history-timing')).toContainText('12:00'); await expect(modal.locator('[data-nutrition-action="ask-history"]')).toBeDisabled();
  await modal.locator('[data-nutrition-action="set-history-range"][data-nutrition-range="30d"]').click();
  await expect(modal.locator('[data-nutrition-action="set-history-range"][data-nutrition-range="30d"]')).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('tab', { name: 'Meals', exact: true }).click(); await expect(modal.locator('.nutrition-history-meals-head')).toContainText('29 entries');
  await modal.locator('.modal-close').click(); await expect(page.locator('#modal-overlay')).not.toHaveClass(/show/); expect(await stored(page)).toBe(before);
}
test('static authored History preserves paging, trends, ranges and profile data offline on first use and two cold launches', async ({ page, context }) => {
  test.setTimeout(120000); await installDiscussionFixture(context);
  await context.addInitScript(() => {
    if (!['http:', 'https:'].includes(location.protocol)) return; localStorage.setItem('labcharts-ai-paused', 'true');
    if (!localStorage.getItem('nutrition-history-owned-seeded')) {
      localStorage.setItem('nutrition-history-owned-seeded', '1');
      const nutritionMeals = Array.from({ length: 50 }, (_, index) => {
        const hour = 12;
        const eatenAt = new Date(); eatenAt.setDate(eatenAt.getDate() - index - 1); eatenAt.setHours(hour, 0, 0, 0);
        const localDate = `${eatenAt.getFullYear()}-${String(eatenAt.getMonth() + 1).padStart(2, '0')}-${String(eatenAt.getDate()).padStart(2, '0')}`;
        return { id: `offline-history-${index}`, name: `Offline history meal ${index + 1}`, eatenAt: eatenAt.toISOString(), localDate, localTimeMinutes: hour * 60, mealType: 'lunch', createdAt: eatenAt.toISOString(), updatedAt: eatenAt.toISOString(), reviewed: true, nutrients: { energyKcal: 500, proteinG: 20, carbohydrateG: 50, fatG: 20, fiberG: 5 }, source: { kind: 'manual' }, images: [] };
      });
      localStorage.setItem('labcharts-default-imported', JSON.stringify({ entries: [], notes: [], nutritionMeals, nutritionTargets: { configured: true, energyKcal: 2000, proteinBasis: 'fixed', proteinFixedG: 100, carbohydrateG: 200, fatG: 70, fiberG: 25, widgetNutrients: ['proteinG', 'carbohydrateG', 'fatG', 'fiberG'] }, contextSourceSettings: { 'meals-nutrition': false } }));
    }
  });
  const errors: string[] = [], csp: string[] = []; page.on('pageerror', error => errors.push(error.message)); context.on('page', target => target.on('pageerror', error => errors.push(error.message)));
  await context.exposeBinding('nutritionHistoryCsp', (_, directive: string) => { csp.push(directive); });
  await context.addInitScript(() => document.addEventListener('securitypolicyviolation', event => { void (window as unknown as { nutritionHistoryCsp(value: string): Promise<void> }).nutritionHistoryCsp(event.violatedDirective); }));
  const server = await startKitServer(artifact);
  try {
    await navigateWithOfflineLaunchDiagnostics(page, server.origin + '/app?dev-sw=1', test.info()); await ready(page); const before = await stored(page);
    await expect(page.locator('link[href="/css/nutrition.css"]')).toHaveCount(0); server.state.offline = true;
    await verifyHistory(page, before); await page.close();
    for (let launch = 0; launch < 2; launch++) {
      const cold = await context.newPage(); await navigateWithOfflineLaunchDiagnostics(cold, server.origin + '/app?dev-sw=1', test.info()); await ready(cold);
      await verifyHistory(cold, before); await cold.close();
    }
    expect(errors).toEqual([]); expect(csp).toEqual([]);
  } finally { await server.close(); }
});
