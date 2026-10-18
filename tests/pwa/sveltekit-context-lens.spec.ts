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
  await expect(page.locator('#context-hub-overlay')).toHaveClass(/show/); await page.locator('#context-hub-overlay [data-pick="lens"]').click();
  await expect(page.locator('[data-context-form-view]')).toHaveAttribute('data-context-form-view', 'interpretiveLens');
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
test('static authored Lens opens offline from Context and retains multiline text and history across two cold launches', async ({ page, context }) => {
  test.setTimeout(120000); await installDiscussionFixture(context, {paused: true});
  await context.addInitScript(() => {
    if (!['http:', 'https:'].includes(location.protocol)) return;
    if (!localStorage.getItem('context-lens-seeded')) { localStorage.setItem('context-lens-seeded', '1'); localStorage.setItem('labcharts-default-imported', JSON.stringify({ entries: [], notes: [], nutritionMeals: [], interpretiveLens: 'Original <lens>' })); }
  });
  const errors: string[] = [], csp: string[] = []; page.on('pageerror', error => errors.push(error.message)); context.on('page', target => target.on('pageerror', error => errors.push(error.message)));
  await context.exposeBinding('contextLensCsp', (_, directive: string) => { csp.push(directive); });
  await context.addInitScript(() => document.addEventListener('securitypolicyviolation', event => { void (window as unknown as { contextLensCsp(value: string): Promise<void> }).contextLensCsp(event.violatedDirective); }));
  const server = await startKitServer(artifact);
  try {
    await page.goto(server.origin + '/app?dev-sw=1'); await ready(page); await expect(page.locator('link[data-context-editor-stylesheet]')).toHaveCount(0);
    server.state.offline = true; await open(page); const modal = page.locator('#detail-modal'), input = modal.getByRole('textbox', { name: 'Interpretive lens', exact: true });
    await expect(input).toHaveValue('Original <lens>'); await input.fill('  Offline <lens> & text\nSecond line  '); await modal.getByRole('button', { name: 'Save', exact: true }).click(); await expect(page.locator('#modal-overlay')).not.toHaveClass(/show/);
    const saved = await stored(page); expect(saved.interpretiveLens).toBe('Offline <lens> & text\nSecond line'); expect(saved.changeHistory.find((item: { field: string }) => item.field === 'interpretiveLens').snapshot).toBe(saved.interpretiveLens);
    await open(page); await modal.getByRole('button', { name: 'Clear', exact: true }).click(); await page.locator('#confirm-cancel').click(); await expect(input).toHaveValue(saved.interpretiveLens);
    await input.fill('Unsubmitted'); await modal.getByRole('button', { name: 'Back to Context', exact: true }).click(); await expect(page.locator('#context-hub-overlay')).toHaveClass(/show/); expect(await stored(page)).toEqual(saved); await page.close();
    for (let launch = 0; launch < 2; launch++) {
      const cold = await context.newPage(); await cold.goto(server.origin + '/app?dev-sw=1'); await ready(cold); await open(cold);
      await expect(cold.locator('#interpretive-lens-textarea')).toHaveValue(saved.interpretiveLens); expect(await cold.locator('lens, script[data-context-form-view]').count()).toBe(0); expect(await stored(cold)).toEqual(saved);
      if (launch === 1) { await cold.locator('#detail-modal').getByRole('button', { name: 'Clear', exact: true }).click(); await cold.locator('#confirm-ok').click(); await expect(cold.locator('#modal-overlay')).not.toHaveClass(/show/); const cleared = await stored(cold); expect(cleared.interpretiveLens).toBe(''); expect(cleared.changeHistory.find((item: { field: string }) => item.field === 'interpretiveLens').snapshot).toBe(''); }
      await cold.close();
    }
    expect(errors).toEqual([]); expect(csp).toEqual([]);
  } finally { await server.close(); }
});
