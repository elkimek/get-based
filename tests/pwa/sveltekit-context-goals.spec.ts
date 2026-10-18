import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { startKitServer } from './kit-server.js';
import { installDiscussionFixture } from '../helpers/chat-discussion-fixture.js';
const artifact = process.env.GETBASED_KIT_ARTIFACT || path.resolve('.local-notes/sveltekit-build');
async function ready(page: Page) {
  await expect(page.locator('html[data-app-ready][data-shell-framework="sveltekit"]')).toBeAttached({ timeout: 30000 });
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true)); await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
}
async function insight(page: Page) {
  const menu = page.getByRole('button', { name: 'Menu', exact: true }); if (await menu.isVisible()) await menu.click(); await page.locator('.nav-item[data-category="insight"]').click();
  await expect(page.locator('#main-content [data-context-cards-view]')).toBeVisible();
}
async function open(page: Page) {
  await page.locator('#main-content [data-context-card-key="healthGoals"] [data-context-card-action="open-editor"]').click();
  await expect(page.locator('[data-context-goals-view]')).toBeVisible();
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
async function add(page: Page, text: string, priority: 'High' | 'Medium' | 'Low') {
  const modal = page.locator('#detail-modal'); await modal.getByRole('textbox', { name: 'Add goal', exact: true }).fill(text);
  await modal.getByRole('group', { name: 'Priority', exact: true }).getByRole('button', { name: priority, exact: true }).click();
  await modal.getByRole('textbox', { name: 'Add goal', exact: true }).press('Enter'); await expect(modal.getByRole('status')).toHaveText('Saved');
}
test('static authored Goals work on offline first use and retain edits and deletion markers across two cold launches', async ({ page, context }) => {
  test.setTimeout(120000); await installDiscussionFixture(context, {paused: true});
  await context.addInitScript(() => {
    if (!['http:', 'https:'].includes(location.protocol)) return;
    if (!localStorage.getItem('context-goals-seeded')) { localStorage.setItem('context-goals-seeded', '1'); localStorage.setItem('labcharts-default-imported', JSON.stringify({ entries: [], notes: [], nutritionMeals: [], healthGoals: [] })); }
  });
  const errors: string[] = [], csp: string[] = [];
  page.on('pageerror', error => errors.push(error.message)); context.on('page', target => target.on('pageerror', error => errors.push(error.message)));
  await context.exposeBinding('contextGoalsCsp', (_, directive: string) => { csp.push(directive); });
  await context.addInitScript(() => document.addEventListener('securitypolicyviolation', event => { void (window as unknown as { contextGoalsCsp(value: string): Promise<void> }).contextGoalsCsp(event.violatedDirective); }));
  const server = await startKitServer(artifact);
  try {
    await page.goto(server.origin + '/app?dev-sw=1'); await ready(page); await insight(page); await expect(page.locator('link[data-context-editor-stylesheet]')).toHaveCount(0);
    server.state.offline = true; await open(page); await add(page, 'Offline <goal> & text', 'High'); await add(page, 'Remove then restore', 'Low');
    const modal = page.locator('#detail-modal');
    await modal.getByRole('button', { name: 'Remove goal: Remove then restore', exact: true }).click(); await expect(modal.locator('.goals-text')).toHaveText(['Offline <goal> & text']);
    await add(page, 'Remove then restore', 'Medium'); await add(page, 'Delete permanently', 'Low');
    await modal.getByRole('button', { name: 'Remove goal: Delete permanently', exact: true }).click(); await expect(modal.locator('.goals-text')).toHaveText(['Offline <goal> & text', 'Remove then restore']);
    await modal.getByRole('button', { name: 'Clear All', exact: true }).click(); await page.locator('#confirm-cancel').click();
    const saved = await stored(page); expect(saved.healthGoals.map((goal: { text: string; severity: string }) => [goal.text, goal.severity])).toEqual([['Offline <goal> & text', 'major'], ['Remove then restore', 'mild']]);
    expect(saved._deleted.healthGoals).toHaveLength(1); expect(saved.changeHistory.find((item: { field: string }) => item.field === 'healthGoals').snapshot).toEqual(saved.healthGoals);
    await modal.getByRole('button', { name: 'Done', exact: true }).click(); await expect(page.locator('#modal-overlay')).not.toHaveClass(/show/); await expect(page.locator('#main-content [data-context-card-key="healthGoals"]')).toContainText('Offline <goal> & text'); await page.close();
    for (let launch = 0; launch < 2; launch++) {
      const cold = await context.newPage(); await cold.goto(server.origin + '/app?dev-sw=1'); await ready(cold); await insight(cold); await open(cold);
      await expect(cold.locator('.goals-text')).toHaveText(['Offline <goal> & text', 'Remove then restore']); expect(await cold.locator('goal, script[data-context-goals-view]').count()).toBe(0);
      expect(await stored(cold)).toEqual(saved); await cold.close();
    }
    expect(errors).toEqual([]); expect(csp).toEqual([]);
  } finally { await server.close(); }
});
