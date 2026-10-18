import {openStaticSettings} from './settings-entry.js';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { startKitServer } from './kit-server.js';
import { prepareStaticWallet } from './wallet-static-fixture.js';
const artifact = process.env.GETBASED_KIT_ARTIFACT || path.resolve('.local-notes/sveltekit-build');
const words = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
async function ready(page: Page) {
  await expect(page.locator('html[data-app-ready][data-shell-framework="sveltekit"]')).toBeAttached({ timeout: 30_000 });
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller), { timeout: 30_000 }).toBe(true);
}
async function seedPanel(page: Page) {
  await openStaticSettings(page); await page.locator('#settings-nav-ai').click();
  await page.locator('[data-routstr-wallet-action="toggle-wallet-menu"]').click();
  await page.locator('[data-routstr-wallet-action="wallet-action"][data-wallet-action="seed"]').click();
  await expect(page.locator('[data-wallet-seed-view]')).toBeVisible();
}
test('wallet seed generates encrypted words offline restores through the SDK and survives cached cold launch', async ({ page, context }) => {
  test.setTimeout(150_000); await prepareStaticWallet(context, false);
  const server = await startKitServer(artifact), errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto(server.origin + '/app?dev-sw=1'); await ready(page); server.state.offline = true;
    await seedPanel(page); const panel = page.locator('[data-wallet-seed-view]');
    await expect(panel).toContainText('24-word Data Sync mnemonic'); await expect(panel).toContainText('separate 12-word recovery seed');
    await panel.locator('[data-routstr-wallet-action="setup-wallet-seed"]').click(); await expect(panel.locator('#routstr-seed-continue')).toBeDisabled();
    await expect(panel.locator('#routstr-seed-phrase')).toHaveAttribute('aria-pressed', 'false');
    await panel.locator('#routstr-seed-phrase').click(); const generated = await panel.locator('#routstr-seed-phrase').innerText();
    expect(generated.split(' ')).toHaveLength(12);
    expect(await page.evaluate(() => localStorage.getItem('labcharts-cashu-wallet-mnemonic'))).toMatch(/^d1:/);
    await panel.locator('#routstr-seed-phrase').click(); expect(await panel.textContent()).not.toContain(generated);
    await panel.locator('#routstr-seed-ack').check(); await panel.locator('#routstr-seed-continue').click();
    await expect(panel.locator('#wallet-seed-display')).toHaveAttribute('aria-pressed', 'false');
    const restore = panel.locator('#routstr-restore-seed'); await restore.fill(words + ' ' + words); await panel.locator('[data-routstr-wallet-action="wallet-restore"]').click();
    await expect(panel.locator('#routstr-restore-status')).toContainText('Enter exactly 12 words');
    await restore.fill(words.toUpperCase().replaceAll(' ', '\n  ')); await panel.locator('[data-routstr-wallet-action="wallet-restore"]').click();
    await expect(panel.locator('#routstr-restore-status')).toContainText('Local funds and recovery records are retained');
    await panel.locator('#wallet-seed-display').click(); await expect(panel.locator('#wallet-seed-display')).toHaveText(generated); await panel.locator('#wallet-seed-display').click();
    await expect(restore).toHaveValue(words.toUpperCase().replaceAll(' ', '\n  '));
    await page.evaluate(() => { (window as unknown as { syntheticFundingEnabled: boolean }).syntheticFundingEnabled = true; });
    await panel.locator('[data-routstr-wallet-action="wallet-restore"]').click();
    await expect(panel.locator('#routstr-restore-status')).toContainText('✓ Restored! Balance: ⚡ 0 sats', { timeout: 45_000 }); await expect(restore).toHaveValue('');
    expect(await page.evaluate(() => (window as unknown as { syntheticRestoreRequests: number }).syntheticRestoreRequests)).toBeGreaterThan(0);
    await panel.locator('#wallet-seed-display').click(); await expect(panel.locator('#wallet-seed-display')).toHaveText(words); await panel.locator('#wallet-seed-display').click();
    expect(await page.evaluate(() => localStorage.getItem('labcharts-cashu-wallet-mnemonic'))).toMatch(/^d1:/);
    expect(await panel.textContent()).not.toContain(words); expect(await panel.locator('[data-clipboard-text],[data-mnemonic]').count()).toBe(0);
    await page.close(); const cold = await context.newPage(); cold.on('pageerror', error => errors.push(error.message));
    await cold.goto(server.origin + '/app?dev-sw=1'); await ready(cold); await seedPanel(cold);
    const coldPanel = cold.locator('[data-wallet-seed-view]'); await expect(coldPanel.locator('#wallet-seed-display')).toHaveAttribute('aria-pressed', 'false'); await expect(coldPanel.locator('#routstr-restore-seed')).toHaveValue('');
    expect(await coldPanel.textContent()).not.toContain(words); await coldPanel.locator('#wallet-seed-display').click(); await expect(coldPanel.locator('#wallet-seed-display')).toHaveText(words);
    expect(await cold.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).map(registration => new URL(registration.active!.scriptURL).pathname))).toEqual(['/service-worker.js']); expect(errors).toEqual([]);
  } finally { await server.close(); }
});
