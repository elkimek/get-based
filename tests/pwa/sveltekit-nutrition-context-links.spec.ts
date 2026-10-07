import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { startKitServer } from './kit-server.js';
import { installDiscussionFixture } from '../helpers/chat-discussion-fixture.js';
import { captureOfflineLaunchDiagnostics } from '../helpers/offline-launch-diagnostics.js';
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
async function verifyLinks(page: Page, before: string) {
  await insight(page);
  const meals = page.locator('[data-context-card-key="diet"] [data-nutrition-context-link]');
  await expect(meals).toContainText('Detailed meal log active'); await expect(meals).toContainText('2 logged meals · 1/7 days');
  await meals.focus(); await page.keyboard.press('Enter');
  await expect(page.locator('.nav-item[data-category="body"]')).toHaveClass(/active/);
  await expect(page.locator('#detail-modal .nutrition-history-head h3')).toHaveText('Meals & Nutrition');
  await expect(page.getByRole('tab', { name: 'Meals', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#detail-modal')).toContainText('Offline link breakfast'); await expect(page.locator('#detail-modal')).toContainText('Offline link dinner');
  await page.locator('#detail-modal .modal-close').click(); await expect(page.locator('#modal-overlay')).not.toHaveClass(/show/);
  await insight(page);
  const timing = page.locator('[data-context-card-key="lightCircadian"] [data-nutrition-context-link]');
  await expect(timing).toContainText('7-day average · first 08:00 · last 18:00');
  await timing.focus(); await page.keyboard.press('Space');
  await expect(page.getByRole('tab', { name: 'Trends', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.nutrition-history-timing')).toBeVisible(); await expect(page.locator('.nutrition-history-timing')).toContainText('Logged meal timing');
  await page.locator('#detail-modal .modal-close').click(); await expect(page.locator('#modal-overlay')).not.toHaveClass(/show/);
  expect(await stored(page)).toBe(before);
}
test('static nutrition card links load History offline on first use and two cold launches without profile writes', async ({ page, context }) => {
  test.setTimeout(120000); await installDiscussionFixture(context);
  await context.addInitScript(() => {
    if (!['http:', 'https:'].includes(location.protocol)) return; localStorage.setItem('labcharts-ai-paused', 'true');
    if (!localStorage.getItem('nutrition-context-links-seeded')) {
      localStorage.setItem('nutrition-context-links-seeded', '1');
      const nutritionMeals = [8, 18].map(hour => {
        const eatenAt = new Date(); eatenAt.setDate(eatenAt.getDate() - 1); eatenAt.setHours(hour, 0, 0, 0);
        const localDate = `${eatenAt.getFullYear()}-${String(eatenAt.getMonth() + 1).padStart(2, '0')}-${String(eatenAt.getDate()).padStart(2, '0')}`;
        return { id: `offline-link-${hour}`, name: `Offline link ${hour === 8 ? 'breakfast' : 'dinner'}`, eatenAt: eatenAt.toISOString(), localDate, localTimeMinutes: hour * 60, mealType: hour === 8 ? 'breakfast' : 'dinner', createdAt: eatenAt.toISOString(), updatedAt: eatenAt.toISOString(), reviewed: true, nutrients: { energyKcal: 500, proteinG: 20 }, source: { kind: 'manual' }, images: [] };
      });
      localStorage.setItem('labcharts-default-imported', JSON.stringify({ entries: [], notes: [], nutritionMeals }));
    }
  });
  const errors: string[] = [], csp: string[] = []; page.on('pageerror', error => errors.push(error.message)); context.on('page', target => target.on('pageerror', error => errors.push(error.message)));
  await context.exposeBinding('nutritionLinksCsp', (_, directive: string) => { csp.push(directive); });
  await context.addInitScript(() => document.addEventListener('securitypolicyviolation', event => { void (window as unknown as { nutritionLinksCsp(value: string): Promise<void> }).nutritionLinksCsp(event.violatedDirective); }));
  const server = await startKitServer(artifact);
  try {
    await page.goto(server.origin + '/app?dev-sw=1'); await ready(page); const before = await stored(page);
    await expect(page.locator('link[href="/css/nutrition.css"]')).toHaveCount(0); server.state.offline = true;
    await verifyLinks(page, before); await page.close();
    for (let launch = 0; launch < 2; launch++) {
      const cold = await context.newPage(); await cold.goto(server.origin + '/app?dev-sw=1'); await ready(cold);
      await verifyLinks(cold, before); await cold.close();
    }
    expect(errors).toEqual([]); expect(csp).toEqual([]);
  } finally { await server.close(); }
});
