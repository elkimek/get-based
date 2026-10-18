import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { startKitServer } from './kit-server.js';
import { installDiscussionFixture } from '../helpers/chat-discussion-fixture.js';
const artifact = process.env.GETBASED_KIT_ARTIFACT || path.resolve('.local-notes/sveltekit-build');
async function ready(page: Page) {
  await expect(page.locator('html[data-app-ready][data-shell-framework="sveltekit"]')).toBeAttached({ timeout: 30000 });
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
}
async function open(page: Page) {
  const menu = page.getByRole('button', { name: 'Menu', exact: true });
  if (await menu.isVisible()) await menu.click();
  await page.locator('.nav-item[data-category="insight"]').click();
  const badge = page.locator('[data-food-contaminant-badge]');
  await expect(badge).toContainText('3 food contaminant signals detected');
  await badge.focus(); await page.keyboard.press('Space');
  await expect(page.locator('[data-food-contaminants-view]')).toBeVisible();
}
async function stored(page: Page) {
  return page.evaluate(async () => {
    const request = indexedDB.open('labcharts-blobs', 1);
    const db = await new Promise<IDBDatabase>((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    try {
      const tx = db.transaction('kv', 'readonly'), read = tx.objectStore('kv').get('labcharts-default-imported');
      const value = await new Promise<string>((resolve, reject) => {
        tx.oncomplete = () => typeof read.result === 'string' ? resolve(read.result) : reject(new Error('Missing committed profile'));
        tx.onabort = () => reject(tx.error || new Error('Read aborted'));
        tx.onerror = () => reject(tx.error || read.error || new Error('Read failed'));
      });
      return JSON.parse(value);
    } finally { db.close(); }
  });
}
test('static authored food signals open on offline first use and two cold launches without changing profile data', async ({ page, context }) => {
  test.setTimeout(120000); await installDiscussionFixture(context, {paused: true});
  await context.addInitScript(() => {
    if (!['http:', 'https:'].includes(location.protocol)) return;
    for (const key of ['emptyTour', 'tour']) localStorage.setItem(`labcharts-default-${key}`, 'completed');
    localStorage.setItem('labcharts-encryption-nudge-dismissed', 'true');
    if (!localStorage.getItem('context-food-seeded')) {
      localStorage.setItem('context-food-seeded', '1');
      localStorage.setItem('labcharts-default-imported', JSON.stringify({ entries: [], notes: [], nutritionMeals: [], diet: { breakfast: 'strawberries and yogurt', lunch: 'canned tuna with avocado', note: 'Keep <original> & text' } }));
    }
  });
  const errors: string[] = [], csp: string[] = [];
  page.on('pageerror', error => errors.push(error.message)); context.on('page', target => target.on('pageerror', error => errors.push(error.message)));
  await context.exposeBinding('contextFoodCsp', (_, directive: string) => { csp.push(directive); });
  await context.addInitScript(() => document.addEventListener('securitypolicyviolation', event => { void (window as unknown as { contextFoodCsp(value: string): Promise<void> }).contextFoodCsp(event.violatedDirective); }));
  const server = await startKitServer(artifact);
  try {
    await page.goto(server.origin + '/app?dev-sw=1'); await ready(page);
    await expect(page.locator('link[data-context-editor-stylesheet]')).toHaveCount(0);
    const saved = await stored(page); server.state.offline = true;
    await open(page);
    const verify = async (target: Page) => {
      const modal = target.locator('#detail-modal');
      await expect(modal).toHaveAttribute('aria-labelledby', 'context-food-contaminants-title');
      await expect(modal.getByRole('heading', { level: 3 })).toHaveText(['🥬 Pesticide Residues', '🧴 Plastic Chemicals', '✅ Low Contamination']);
      await expect(modal).toContainText('Strawberries: #2 on EWG Dirty Dozen');
      await expect(modal).toContainText('Plastic chemicals detected in 100% of yogurt products tested');
      await expect(modal).toContainText('BPA detected in canned foods');
      await expect(modal).toContainText('Avocados: on EWG Clean Fifteen');
      expect(await modal.locator('[onclick], [data-lifestyle-action]').count()).toBe(0);
      for (const link of await modal.getByRole('link').all()) {
        await expect(link).toHaveAttribute('href', /^https:\/\//); await expect(link).toHaveAttribute('target', '_blank'); await expect(link).toHaveAttribute('rel', 'noopener');
        expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      }
      await expect(modal.getByRole('button', { name: 'Discuss with AI', exact: true })).toBeEnabled();
      await modal.getByRole('button', { name: 'Close', exact: true }).focus(); await target.keyboard.press('Enter');
      await expect(target.locator('#modal-overlay')).not.toHaveClass(/show/); expect(await stored(target)).toEqual(saved);
    };
    await verify(page); await page.close();
    for (let launch = 0; launch < 2; launch++) {
      const cold = await context.newPage(); await cold.goto(server.origin + '/app?dev-sw=1'); await ready(cold);
      await open(cold); await verify(cold); await cold.close();
    }
    expect(errors).toEqual([]); expect(csp).toEqual([]);
  } finally { await server.close(); }
});
