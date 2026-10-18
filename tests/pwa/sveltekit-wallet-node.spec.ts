import path from 'node:path';
import { getDecodedToken } from '@cashu/cashu-ts';
import { expect, test, type Page } from '@playwright/test';
import { startKitServer } from './kit-server.js';
import { prepareStaticNode } from './node-static-fixture.js';
import { seedStaticWalletMints } from './wallet-static-fixture.js';
const artifact = process.env.GETBASED_KIT_ARTIFACT || path.resolve('.local-notes/sveltekit-build');
async function ready(page: Page) { await expect(page.locator('html[data-app-ready][data-shell-framework="sveltekit"]')).toBeAttached({ timeout: 30_000 }); await page.evaluate(() => navigator.serviceWorker.ready.then(() => true)); await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true); }
async function wallet(page: Page) {
  const settings = page.locator('[data-shell-action="open-settings"]');
  try { await settings.click({ timeout: 1500 }); } catch (error) { const close = page.getByRole('button', { name: 'Close chat', exact: true }); if (!await close.isVisible()) throw error; await close.click(); await settings.click(); }
  await page.locator('#settings-nav-ai').click();
}
async function records(page: Page) { return page.evaluate(async () => {
  const db = await new Promise<IDBDatabase>((resolve, reject) => { const req = indexedDB.open('getbased-cashu', 2); req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });
  try { return await new Promise<Array<{ key: string; value: unknown }>>((resolve, reject) => { const req = db.transaction('meta', 'readonly').objectStore('meta').getAll(); req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); }); } finally { db.close(); }
}); }
async function saved(page: Page) { await page.locator('[data-routstr-wallet-action="toggle-wallet-menu"]').click(); await page.getByRole('button', { name: 'Saved node refunds', exact: true }).click(); await expect(page.locator('[data-wallet-node-view]')).toBeVisible(); }
test('node wallet uses actual static SDK deposits and private refund journals through cached cold recovery', async ({ page, context }) => {
  test.setTimeout(150_000); const synthetic = await prepareStaticNode(context), server = await startKitServer(artifact, [synthetic.handleRequest]); const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto(server.origin + '/app?dev-sw=1'); await ready(page); await seedStaticWalletMints(page); await page.waitForLoadState('networkidle'); await page.reload(); await ready(page); await wallet(page);
    await page.locator('[data-node-action="deposit"]').click(); const panel = page.locator('[data-wallet-node-view]'); await expect(panel).toContainText('12 sats'); await page.screenshot({ path: test.info().outputPath('node-deposit.png') });
    await panel.locator('#routstr-deposit-amount').fill('4'); await panel.getByRole('button', { name: 'Deposit', exact: true }).click();
    const consent = page.getByRole('dialog').filter({ has: page.getByRole('heading', { name: 'Activate the Routstr node at https://synthetic-routstr.test?' }) });
    await consent.getByRole('checkbox').check(); await consent.getByRole('button', { name: 'Allow & activate' }).click();
    await expect.poll(() => synthetic.counts().deposits).toBe(1);
    await expect(page.locator('#settings-modal')).not.toBeVisible(); await wallet(page);
    await expect(page.locator('[data-routstr-model-settings-view]')).toBeVisible(); await expect(page.locator('#routstr-model-select')).toHaveValue('claude-sonnet-4.6');
    await expect(page.locator('#routstr-wallet-balance')).toContainText('8 sats'); await expect(page.locator('#routstr-node-balance')).toContainText('4 sats');
    expect((await records(page)).find(record => record.key === 'pendingDeposit')?.value).toBeFalsy();
    synthetic.failReceive(true); await page.locator('[data-node-action="withdraw"]').click(); await expect(panel).toContainText('Node refund outcome unconfirmed');
    const text = panel.locator('textarea'); await expect(text).toBeVisible(); const token = await text.inputValue(), decoded = getDecodedToken(token, [synthetic.keysetId]); expect(decoded.mint).toBe('https://mint.minibits.cash/Bitcoin'); expect(decoded.proofs.reduce((sum, proof) => sum + Number(proof.amount), 0)).toBe(4);
    const pending = (await records(page)).filter(record => record.key.startsWith('pendingNodeRefund') && (record.value as { token?: string })?.token === token); expect(pending).toHaveLength(1); const original = pending[0]!.value as { generation: string; key: string }; expect(original.generation).toBeTruthy(); expect(original.key).toMatch(/^sk-/);
    await page.screenshot({ path: test.info().outputPath('node-refund-recovery.png') }); expect(await panel.locator('[data-token],[data-clipboard-text],[data-recovery-id],[data-generation]').count()).toBe(0); expect(await panel.innerHTML()).not.toContain(original.key); expect(await panel.innerHTML()).not.toContain(original.generation);
    const held = await text.elementHandle(); await page.locator('#settings-modal [data-settings-action="close"]').click(); expect(await held!.evaluate(element => (element as HTMLTextAreaElement).value)).toBe(''); await held!.dispose();
    server.state.offline = true; await page.close(); const cold = await context.newPage(); cold.on('pageerror', error => errors.push(error.message)); await cold.goto(server.origin + '/app?dev-sw=1'); await ready(cold); await wallet(cold); await saved(cold);
    const recovery = cold.locator('[data-wallet-node-view] article').filter({ hasText: 'Token mint: https://mint.minibits.cash/Bitcoin' }); await expect(recovery.locator('textarea')).toHaveValue(token); const still = (await records(cold)).find(record => record.key === pending[0]!.key)!.value; expect(still).toEqual(original);
    server.state.offline = false; synthetic.failReceive(false);
    await recovery.getByRole('button', { name: 'Retry refund recovery' }).click();
    await expect(cold.locator('[data-wallet-node-view]')).toContainText('Node refund received in your wallet'); await expect(cold.locator('#routstr-wallet-balance')).toContainText('12 sats'); expect(synthetic.counts().refunds).toBe(1);
    const completed = await records(cold); expect(completed.find(record => record.key === pending[0]!.key)?.value).toBeNull(); expect(completed.find(record => record.key === 'pendingNodeRefund')!.value).toMatchObject({ token: 'SYNTHETIC-NODE-TOKEN', key: 'SYNTHETIC-RECOVERY' }); await expect(cold.locator('[data-wallet-node-view] textarea')).toHaveCount(0); expect(errors).toEqual([]);
  } finally { await server.close(); }
});
