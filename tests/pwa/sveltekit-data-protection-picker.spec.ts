import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { startKitServer } from './kit-server.js';
import { installDiscussionFixture } from '../helpers/chat-discussion-fixture.js';
const artifact = process.env.GETBASED_KIT_ARTIFACT || path.resolve('.local-notes/sveltekit-build');
async function ready(page: Page) {
  await expect(page.locator('html[data-app-ready][data-shell-framework="sveltekit"]')).toBeAttached({ timeout: 30000 });
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true)); await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
}
async function prepare(page: Page) {
  const menu = page.getByRole('button', { name: 'Menu', exact: true }); if (await menu.isVisible()) await menu.click();
  await page.locator('.nav-item[data-category="insight"]').click(); await expect(page.getByRole('heading', { name: 'Insight', exact: true })).toBeVisible();
}
async function open(page: Page) {
  // Exercise the public delegated entry without importing raw modules that Kit bundles.
  await page.evaluate(() => {
    if (document.getElementById('protection-public-action')) return;
    const button = document.createElement('button'); button.id = 'protection-public-action'; button.textContent = 'Protect your data'; button.dataset.dashboardAiAction = 'open-data-protection-picker'; document.body.prepend(button);
  });
  await page.locator('#protection-public-action').click(); await expect(page.locator('[data-data-protection-view]')).toBeVisible();
}
async function stored(page: Page) {
  return page.evaluate(async () => {
    const request = indexedDB.open('labcharts-blobs', 1), db = await new Promise<IDBDatabase>((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    try {
      const tx = db.transaction('kv', 'readonly'), read = tx.objectStore('kv').get('labcharts-default-imported');
      const value = await new Promise<string>((resolve, reject) => { tx.oncomplete = () => typeof read.result === 'string' ? resolve(read.result) : reject(new Error('Missing committed profile')); tx.onabort = () => reject(tx.error || new Error('Read aborted')); tx.onerror = () => reject(tx.error || read.error || new Error('Read failed')); }); return JSON.parse(value);
    } finally { db.close(); }
  });
}
test('static authored protection picker opens offline, hands off existing setup dialogs and survives two cold launches', async ({ page, context }, testInfo) => {
  test.setTimeout(120000); await installDiscussionFixture(context, {paused: true});
  await context.addInitScript(() => {
    if (!['http:', 'https:'].includes(location.protocol)) return;
    if (!localStorage.getItem('protection-picker-seeded')) { localStorage.setItem('protection-picker-seeded', '1'); localStorage.setItem('labcharts-default-imported', JSON.stringify({ entries: [], notes: [], nutritionMeals: [], contextNotes: 'Keep <profile> & original text' })); }
  });
  const errors: string[] = [], csp: string[] = []; page.on('pageerror', error => errors.push(error.message)); context.on('page', target => target.on('pageerror', error => errors.push(error.message)));
  await context.exposeBinding('protectionPickerCsp', (_, directive: string) => { csp.push(directive); });
  await context.addInitScript(() => document.addEventListener('securitypolicyviolation', event => { void (window as unknown as { protectionPickerCsp(value: string): Promise<void> }).protectionPickerCsp(event.violatedDirective); }));
  const server = await startKitServer(artifact);
  try {
    await page.goto(server.origin + '/app?dev-sw=1'); await ready(page); await prepare(page); await expect(page.locator('link[data-context-editor-stylesheet]')).toHaveCount(0);
    const saved = await stored(page); server.state.offline = true; await open(page);
    const verify = async (target: Page) => {
      const picker = target.locator('[data-data-protection-view]'); await expect(picker.getByRole('heading', { name: 'Protect your data' })).toBeVisible();
      await expect(picker.locator('[data-pick="encryption"]')).toContainText('Set up'); await expect(picker.locator('[data-pick="sync"]')).toContainText('Set up');
      const supported = await target.evaluate(() => typeof Reflect.get(window, 'showDirectoryPicker') === 'function'); await expect(picker.locator('[data-pick="backup"]')).toHaveCount(supported ? 1 : 0);
      expect(await picker.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true); expect(await stored(target)).toEqual(saved);
      await picker.locator('[data-pick="encryption"]').click(); await expect(picker).toHaveCount(0); await expect(target.locator('#passphrase-set-input')).toBeVisible();
      await target.locator('#passphrase-set-cancel').click(); await expect(target.locator('.passphrase-dialog')).toHaveCount(0); expect(await stored(target)).toEqual(saved);
      await open(target); await picker.locator('[data-pick="sync"]').click(); await expect(picker).toHaveCount(0); await expect(target.locator('[data-sync-dialog-view]')).toBeVisible();
      await expect(target.locator('#sync-setup-choices')).toContainText('Join existing'); await target.locator('#sync-setup-cancel').click(); await expect(target.locator('[data-sync-dialog-view]')).toHaveCount(0); expect(await stored(target)).toEqual(saved);
      await open(target); await picker.getByRole('button', { name: 'Close', exact: true }).focus(); await target.keyboard.press('Enter'); await expect(picker).toHaveCount(0);
      expect(await target.evaluate(() => document.body.style.overflow)).toBe(''); expect(await target.evaluate(() => localStorage.getItem('labcharts-encryption-enabled'))).not.toBe('true'); expect(await target.evaluate(() => localStorage.getItem('labcharts-sync-enabled'))).not.toBe('true'); expect(await stored(target)).toEqual(saved);
    };
    if (testInfo.project.name === 'kit-chromium') await page.screenshot({ path: testInfo.outputPath('data-protection-static-dark.png') });
    await verify(page); await page.close();
    for (let launch = 0; launch < 2; launch++) { const cold = await context.newPage(); await cold.goto(server.origin + '/app?dev-sw=1'); await ready(cold); await prepare(cold); await open(cold); await verify(cold); await cold.close(); }
    expect(errors).toEqual([]); expect(csp).toEqual([]);
  } finally { await server.close(); }
});
