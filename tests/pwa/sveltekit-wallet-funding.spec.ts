import {openStaticSettings} from './settings-entry.js';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { prepareStaticWallet } from './wallet-static-fixture.js';
import { startKitServer } from './kit-server.js';
const artifact = process.env.GETBASED_KIT_ARTIFACT || path.resolve('.local-notes/sveltekit-build');
const mint = 'https://mint.minibits.cash/Bitcoin';
async function ready(page: Page) {
  await expect(page.locator('html[data-app-ready][data-shell-framework="sveltekit"]')).toBeAttached({ timeout: 30_000 });
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller), { timeout: 30_000 }).toBe(true);
}
async function openFunding(page: Page) {
  await openStaticSettings(page); await page.locator('#settings-nav-ai').click();
  await page.locator('[data-routstr-wallet-action="wallet-action"][data-wallet-action="deposit"]').click();
  await expect(page.locator('[data-wallet-funding-view]')).toBeVisible();
}
async function pendingQuotes(page: Page) {
  return page.evaluate(() => new Promise<{ key: string; value: { quote?: string; mint?: string; amount?: number } }[]>((resolve, reject) => {
    const open = indexedDB.open('getbased-cashu'); open.onerror = () => reject(open.error);
    open.onsuccess = () => { const db = open.result; const tx = db.transaction('meta', 'readonly'); const request = tx.objectStore('meta').getAll();
      request.onsuccess = () => resolve(request.result.filter((row: { key: string }) => row.key.startsWith('pendingQuote:')));
      request.onerror = () => reject(request.error); tx.oncomplete = () => db.close(); };
  }));
}
test('wallet funding loads from cached static assets, preserves original-mint quotes and reconciles after a cold launch', async ({ page, context }) => {
  test.setTimeout(150_000); await context.addInitScript({ path: 'node_modules/axe-core/axe.min.js' });
  await prepareStaticWallet(context);
  const server = await startKitServer(artifact); const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto(server.origin + '/app?dev-sw=1'); await ready(page); server.state.offline = true; await openFunding(page);
    const panel = page.locator('[data-wallet-funding-view]');
    await panel.locator('[data-routstr-wallet-action="fund-wallet-preset"][data-sats="1000"]').click();
    await expect(panel.locator('#routstr-wfund-status')).toContainText('Could not create this invoice');
    expect(await pendingQuotes(page)).toEqual([]);
    await page.evaluate(() => { (window as unknown as { syntheticFundingEnabled: boolean }).syntheticFundingEnabled = true; });
    await panel.locator('[data-routstr-wallet-action="fund-wallet-preset"][data-sats="1000"]').click();
    const qr = panel.locator('img'); await expect(qr).toBeVisible(); await expect(qr).toHaveAttribute('src', /^data:image\/svg\+xml/);
    await expect.poll(() => qr.evaluate(element => (element as HTMLImageElement).complete && (element as HTMLImageElement).naturalWidth > 0)).toBe(true);
    await expect(panel.locator('a[href^="lightning:"]')).toBeVisible(); await expect(panel).toContainText('Invoice mint: mint.minibits.cash/Bitcoin');
    await panel.locator('summary').click(); await expect(panel.locator('textarea')).toHaveValue(/^lnbc/);
    expect(await panel.locator('[data-token],[data-quote],[data-mint],[data-clipboard-text]').count()).toBe(0);
    expect(await pendingQuotes(page)).toEqual([expect.objectContaining({ value: expect.objectContaining({ mint, quote: 'synthetic-static-funding-quote', amount: 1000 }) })]);
    for (const width of [1280, 700, 390, 320]) {
      await page.setViewportSize({ width, height: 900 }); expect(await panel.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
      const violations = await panel.evaluate(async element => (await (window as unknown as { axe: typeof import('axe-core') }).axe.run(element, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } })).violations.map(item => item.id)); expect(violations).toEqual([]);
    }
    await panel.locator('#routstr-wcashu-input').fill('cashuAsynthetic-private-unsubmitted-token');
    await page.close(); const cold = await context.newPage(); cold.on('pageerror', error => errors.push(error.message)); await cold.goto(server.origin + '/app?dev-sw=1'); await ready(cold); await openFunding(cold);
    await expect(cold.locator('#routstr-wcashu-input')).toHaveValue(''); await expect(cold.locator('[data-wallet-funding-view] img')).toHaveCount(0);
    await cold.locator('[data-routstr-wallet-action="recover-wallet-funding"]').click();
    await expect(cold.locator('#routstr-wfund-status')).toContainText('Recovery record retained');
    expect(await pendingQuotes(cold)).toEqual([expect.objectContaining({ value: expect.objectContaining({ mint, quote: 'synthetic-static-funding-quote', amount: 1000 }) })]);
    expect(await cold.evaluate(() => localStorage.getItem('labcharts-cashu-wallet-mnemonic'))).toMatch(/^d1:/);
    await cold.locator('[data-routstr-wallet-action="toggle-wallet-menu"]').click();
    await cold.locator('[data-routstr-wallet-action="wallet-action"][data-wallet-action="seed"]').click();
    await expect(cold.locator('#wallet-seed-display')).toHaveAttribute('aria-pressed', 'false');
    expect(await cold.locator('[data-wallet-seed-view] [data-clipboard-text]').count()).toBe(0);
    await cold.locator('#wallet-seed-display').click();
    await expect(cold.locator('#wallet-seed-display')).toHaveText('abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about');
    expect(await cold.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).map(registration => new URL(registration.active!.scriptURL).pathname))).toEqual(['/service-worker.js']); expect(errors).toEqual([]);
  } finally { await server.close(); }
});
