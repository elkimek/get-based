import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { startKitServer } from './kit-server.js';
import { installDiscussionFixture } from '../helpers/chat-discussion-fixture.js';
const artifact = process.env.GETBASED_KIT_ARTIFACT || path.resolve('.local-notes/sveltekit-build');
async function ready(page: Page) {
  await expect(page.locator('html[data-app-ready][data-shell-framework="sveltekit"]')).toBeAttached({ timeout: 30000 });
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true)); await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
}
async function open(page: Page) {
  const menu = page.getByRole('button', { name: 'Menu', exact: true }); if (await menu.isVisible()) await menu.click(); await page.locator('.nav-item[data-category="context"]').click();
  await expect(page.locator('[data-context-hub-view]')).toHaveAttribute('data-context-save-state', 'idle');
}
async function stored(page: Page) {
  return page.evaluate(async () => {
    const request = indexedDB.open('labcharts-blobs', 1); const db = await new Promise<IDBDatabase>((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    try {
      const tx = db.transaction('kv', 'readonly'), read = tx.objectStore('kv').get('labcharts-default-imported');
      const value = await new Promise<string>((resolve, reject) => { tx.oncomplete = () => typeof read.result === 'string' ? resolve(read.result) : reject(new Error('Missing committed profile')); tx.onabort = () => reject(tx.error || new Error('Read aborted')); tx.onerror = () => reject(tx.error || read.error || new Error('Read failed')); });
      return JSON.parse(value);
    } finally { db.close(); }
  });
}
test('static authored Context hub autosaves canonical sources offline and retains them across two cold launches', async ({ page, context }) => {
  test.setTimeout(120000); await installDiscussionFixture(context, {paused: true});
  await context.addInitScript(() => {
    if (!['http:', 'https:'].includes(location.protocol)) return;
    if (!localStorage.getItem('context-hub-seeded')) {
      localStorage.setItem('context-hub-seeded', '1'); localStorage.setItem('labcharts-default-ai-ctx-wearables', 'off'); localStorage.setItem('labcharts-ai-ctx-genetics-inventory', 'on');
      localStorage.setItem('labcharts-default-imported', JSON.stringify({ entries: [], notes: [], nutritionMeals: [], diet: { breakfast: 'eggs' }, interpretiveLens: 'Original <lens> & text' }));
    }
  });
  const errors: string[] = [], csp: string[] = []; page.on('pageerror', error => errors.push(error.message)); context.on('page', target => target.on('pageerror', error => errors.push(error.message)));
  await context.exposeBinding('contextHubCsp', (_, directive: string) => { csp.push(directive); });
  await context.addInitScript(() => document.addEventListener('securitypolicyviolation', event => { void (window as unknown as { contextHubCsp(value: string): Promise<void> }).contextHubCsp(event.violatedDirective); }));
  const server = await startKitServer(artifact);
  try {
    await page.goto(server.origin + '/app?dev-sw=1'); await ready(page); await expect(page.locator('link[data-context-editor-stylesheet]')).toHaveCount(0);
    server.state.offline = true; await open(page); const hub = page.locator('[data-context-hub-view]');
    await expect(hub.locator('[data-context-toggle]')).toHaveCount(9); await expect(hub.locator('[data-context-toggle="body-wearables"]')).not.toBeChecked();
    const migrated = await stored(page); expect(migrated.contextSourceSettings).toEqual({ wearables: false, 'genetics-inventory': true });
    await hub.locator('[data-context-toggle="light-sun"]').uncheck(); await expect(hub).toHaveAttribute('data-context-save-state', 'idle');
    await hub.locator('#nutrition-context-days').selectOption('90'); await expect(hub).toHaveAttribute('data-context-save-state', 'idle');
    const saved = await stored(page); expect(saved.contextSourceSettings).toEqual({ ...migrated.contextSourceSettings, 'light-sun': false }); expect(saved.biologyScoreContextSettings.includeLightContext).toBe(false); expect(saved.nutritionContextDays).toBe(90); expect(saved.changeHistory).toEqual([]);
    await hub.locator('[data-pick="lens"]').click(); await expect(page.locator('#interpretive-lens-textarea')).toHaveValue(saved.interpretiveLens); await page.locator('#detail-modal').getByRole('button', { name: 'Back to Context', exact: true }).click(); await expect(hub).toHaveAttribute('data-context-save-state', 'idle');
    await hub.locator('[data-pick="kb"]').click(); await expect(page.locator('#kb-modal-overlay')).toHaveClass(/show/); await page.locator('#kb-modal .context-back-btn').click(); await expect(hub).toHaveAttribute('data-context-save-state', 'idle');
    await hub.getByRole('button', { name: 'Done', exact: true }).click(); expect(await stored(page)).toEqual(saved); await page.close();
    for (let launch = 0; launch < 2; launch++) {
      const cold = await context.newPage(); await cold.goto(server.origin + '/app?dev-sw=1'); await ready(cold); await open(cold); const view = cold.locator('[data-context-hub-view]');
      await expect(view.locator('[data-context-toggle="light-sun"]')).not.toBeChecked(); await expect(view.locator('[data-context-toggle="body-wearables"]')).not.toBeChecked(); await expect(view.locator('#nutrition-context-days')).toHaveValue('90'); expect(await stored(cold)).toEqual(saved);
      await view.getByRole('button', { name: 'Done', exact: true }).click(); await expect(cold.locator('#context-hub-overlay')).not.toHaveClass(/show/); expect(await cold.evaluate(() => document.body.style.overflow)).toBe(''); await cold.close();
    }
    expect(errors).toEqual([]); expect(csp).toEqual([]);
  } finally { await server.close(); }
});
