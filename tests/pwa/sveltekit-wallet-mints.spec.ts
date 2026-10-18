import {openStaticSettings} from './settings-entry.js';
import path from 'node:path';
import { getDecodedToken } from '@cashu/cashu-ts';
import { expect, test, type Page } from '@playwright/test';
import { startKitServer } from './kit-server.js';
import { prepareStaticWallet, seedStaticWalletMints } from './wallet-static-fixture.js';
const artifact = process.env.GETBASED_KIT_ARTIFACT || path.resolve('.local-notes/sveltekit-build');
const mint = 'https://mint.minibits.cash/Bitcoin', other = 'https://mint.other.test';
async function ready(page: Page) { await expect(page.locator('html[data-app-ready][data-shell-framework="sveltekit"]')).toBeAttached({ timeout: 30_000 }); await page.evaluate(() => navigator.serviceWorker.ready.then(() => true)); await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller), { timeout: 30_000 }).toBe(true); }
async function wallet(page: Page) { await openStaticSettings(page); await page.locator('#settings-nav-ai').click(); }
async function exported(page: Page) { await page.locator('[data-routstr-wallet-action="toggle-wallet-menu"]').click(); await page.locator('[data-routstr-wallet-action="wallet-action"][data-wallet-action="backup"]').click(); await expect(page.locator('[data-wallet-export-view] textarea')).toBeAttached(); }
test('wallet mints and readonly private exports preserve per-mint funds and recovery across cached cold launch', async ({ page, context }) => {
  test.setTimeout(150_000); await prepareStaticWallet(context);
  const server = await startKitServer(artifact), errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto(server.origin + '/app?dev-sw=1'); await ready(page);
    const keysetId = await seedStaticWalletMints(page);
    server.state.offline = true; await wallet(page); await expect(page.locator('#routstr-wallet-balance')).toContainText('12 sats');
    await exported(page); const panel = page.locator('[data-wallet-export-view]'), text = panel.locator('textarea');
    const original = getDecodedToken(await text.inputValue(), [keysetId]); expect(original.mint).toBe(mint); expect(original.proofs.reduce((sum, proof) => sum + Number(proof.amount), 0)).toBe(12);
    expect(await panel.locator('[data-token],[data-clipboard-text]').count()).toBe(0); expect(await panel.textContent()).not.toContain('cashuB');
    await panel.locator('summary').click(); await expect(text).toBeVisible(); await text.focus();
    expect(await text.evaluate(element => (element as HTMLTextAreaElement).selectionEnd)).toBe((await text.inputValue()).length);
    await panel.getByRole('button', { name: 'Close export' }).click(); await expect(panel).toHaveCount(0);
    await page.locator('[data-provider-panel-action="show-routstr-mint-edit"]').click(); const picker = page.locator('[data-wallet-mint-view]');
    await expect(picker).toContainText('12 sats'); await expect(picker).toContainText('7 sats'); await picker.locator('[data-mint-url="' + other + '"]').click(); await picker.getByRole('button', { name: 'Select mint', exact: true }).click();
    await expect(picker).toHaveCount(0); await expect(page.locator('#routstr-wallet-balance')).toContainText('7 sats'); await exported(page);
    const next = getDecodedToken(await page.locator('[data-wallet-export-view] textarea').inputValue(), [keysetId]); expect(next.mint).toBe(other); expect(next.proofs.reduce((sum, proof) => sum + Number(proof.amount), 0)).toBe(7);
    const field = await page.locator('[data-wallet-export-view] textarea').elementHandle();
    await page.locator('#settings-modal [data-settings-action="close"]').click(); await expect(page.locator('[data-wallet-export-view]')).toHaveCount(0);
    expect(await field!.evaluate(element => (element as HTMLTextAreaElement).value)).toBe(''); await field!.dispose();
    await page.close(); const cold = await context.newPage(); cold.on('pageerror', error => errors.push(error.message)); await cold.goto(server.origin + '/app?dev-sw=1'); await ready(cold); await wallet(cold);
    await expect(cold.locator('#routstr-wallet-balance')).toContainText('7 sats'); await expect(cold.locator('[data-wallet-export-view]')).toHaveCount(0); await cold.locator('[data-provider-panel-action="show-routstr-mint-edit"]').click();
    await expect(cold.locator('[data-wallet-mint-view]')).toContainText('12 sats'); await expect(cold.locator('[data-wallet-mint-view]')).toContainText('7 sats');
    const records = await cold.evaluate(async () => { const db = await new Promise<IDBDatabase>((resolve, reject) => { const req = indexedDB.open('getbased-cashu', 2); req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); }); try { return await new Promise<{proofs: number; refund: unknown}>(resolve => { const tx = db.transaction(['proofs', 'meta'], 'readonly'), count = tx.objectStore('proofs').count(), refund = tx.objectStore('meta').get('pendingNodeRefund'); tx.oncomplete = () => resolve({ proofs: count.result, refund: refund.result }); }); } finally { db.close(); } });
    expect(records.proofs).toBe(5); expect(records.refund).toEqual({ key: 'pendingNodeRefund', value: { nodeUrl: 'https://synthetic-routstr.test', key: 'SYNTHETIC-RECOVERY', token: 'SYNTHETIC-NODE-TOKEN', createdAt: 1 } });
    expect(await cold.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).map(registration => new URL(registration.active!.scriptURL).pathname))).toEqual(['/service-worker.js']); expect(errors).toEqual([]);
  } finally { await server.close(); }
});
