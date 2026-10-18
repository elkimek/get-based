import path from 'node:path';
import { getDecodedToken } from '@cashu/cashu-ts';
import { expect, test, type Page } from '@playwright/test';
import { startKitServer } from './kit-server.js';
import { prepareStaticWithdraw } from './withdraw-static-fixture.js';
import { seedStaticWalletMints } from './wallet-static-fixture.js';
import { makeTestInvoice } from '../fixtures/lightning-invoices.js';
const artifact = process.env.GETBASED_KIT_ARTIFACT || path.resolve('.local-notes/sveltekit-build');
async function ready(page: Page) { await expect(page.locator('html[data-app-ready][data-shell-framework="sveltekit"]')).toBeAttached({ timeout: 30_000 }); await page.evaluate(() => navigator.serviceWorker.ready.then(() => true)); await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true); }
async function wallet(page: Page) {
  const settings = page.locator('[data-shell-action="open-settings"]');
  try { await settings.click({ timeout: 1500 }); }
  catch (error) { const closeChat = page.getByRole('button', { name: 'Close chat', exact: true }); if (!await closeChat.isVisible()) throw error; await closeChat.click(); await settings.click(); }
  await page.locator('#settings-nav-ai').click();
}
async function withdraw(page: Page) { await page.locator('[data-routstr-wallet-action="toggle-wallet-menu"]').click(); await page.locator('[data-wallet-action="withdraw"]').click(); await expect(page.locator('[data-wallet-withdraw-view]')).toBeVisible(); }
async function journal(page: Page) { return page.evaluate(async () => { const db = await new Promise<IDBDatabase>((resolve, reject) => { const req = indexedDB.open('getbased-cashu', 2); req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); }); try { return await new Promise<unknown>((resolve, reject) => { const req = db.transaction('meta', 'readonly').objectStore('meta').get('pendingWithdraw'); req.onsuccess = () => resolve(req.result?.value); req.onerror = () => reject(req.error); }); } finally { db.close(); } }); }
test('wallet withdrawal uses actual static SDK tokens and journals through close cold recovery and uncertain payment', async ({ page, context }) => {
  test.setTimeout(120_000); const synthetic = await prepareStaticWithdraw(context); const server = await startKitServer(artifact, [synthetic.handleRequest]); const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto(server.origin + '/app?dev-sw=1'); await ready(page);
    // Complete returning Dashboard startup before reloading the seeded wallet.
    if (await page.locator('body').evaluate(body => body.classList.contains('chat-autostart-reserved')) || await page.locator('#chat-panel.open').isVisible()) {
      await expect(page.locator('body')).not.toHaveClass(/\bchat-autostart-reserved\b/);
      await expect(page.locator('#chat-thread-list .chat-thread-item.active .chat-thread-item-name')).toHaveText('New Conversation');
    }
    const closeChat = page.getByRole('button', { name: 'Close chat', exact: true });
    if (await closeChat.isVisible()) await closeChat.click();
    await expect(page.locator('body')).not.toHaveClass(/\bchat-open\b/);
    await expect(page.locator('#chat-backdrop')).toBeHidden();
    await seedStaticWalletMints(page); await page.waitForLoadState('networkidle'); await page.reload(); await ready(page); await wallet(page); await withdraw(page);
    const panel = page.locator('[data-wallet-withdraw-view]'); await expect(panel).toContainText('12 sats'); await panel.getByRole('button', { name: 'Cashu Token', exact: true }).click(); await panel.locator('#routstr-send-amount').fill('4'); await panel.getByRole('button', { name: 'Send', exact: true }).click();
    const field = panel.locator('textarea'); await expect(field).toBeVisible(); const token = await field.inputValue(); const decoded = getDecodedToken(token, [synthetic.keysetId]); expect(decoded.mint).toBe('https://mint.minibits.cash/Bitcoin'); expect(decoded.proofs.reduce((sum, proof) => sum + Number(proof.amount), 0)).toBe(4);
    expect(synthetic.counts().swaps).toBe(1); expect(JSON.parse(String(await journal(page)))).toMatchObject({ token, mint: decoded.mint, localCommit: true, source: 'cashu-send' }); expect(await panel.locator('[data-clipboard-text],[data-token],[data-quote-id]').count()).toBe(0);
    await field.focus(); await expect.poll(() => field.evaluate(input => { const text = input as HTMLTextAreaElement; return text.selectionEnd! - text.selectionStart!; })).toBe(token.length);
    const held = await field.elementHandle(); await page.locator('#settings-modal [data-settings-action="close"]').click(); expect(await held!.evaluate(element => (element as HTMLTextAreaElement).value)).toBe(''); await held!.dispose(); expect(await journal(page)).toBeTruthy();
    await page.close(); const cold = await context.newPage(); cold.on('pageerror', error => errors.push(error.message)); await cold.goto(server.origin + '/app?dev-sw=1'); await ready(cold); await wallet(cold); await withdraw(cold);
    const recovered = cold.locator('[data-wallet-withdraw-view]'); await recovered.getByRole('button', { name: 'Check outgoing recovery', exact: true }).click(); await expect(recovered.locator('textarea')).toHaveValue(token); await recovered.getByRole('button', { name: 'Recover token to wallet', exact: true }).click(); await expect(recovered).toContainText('Outgoing token recovered to wallet.'); expect(await journal(cold)).toBeNull(); expect(synthetic.counts().swaps).toBe(2);
    await recovered.getByRole('button', { name: '⚡ Lightning', exact: true }).click(); await recovered.locator('#routstr-withdraw-input').fill(makeTestInvoice(4)); await recovered.getByRole('button', { name: 'Withdraw', exact: true }).click(); await expect(recovered).toContainText('Fee reserve: 1 sats'); expect(await recovered.locator('[data-quote-id]').count()).toBe(0);
    await recovered.getByRole('button', { name: 'Confirm Withdraw', exact: true }).click(); await expect(recovered).toContainText('awaiting confirmation'); expect(synthetic.counts().melts).toBe(1); expect(JSON.parse(String(await journal(cold)))).toMatchObject({ quoteId: 'synthetic-withdraw-quote', mint: decoded.mint, localCommit: true }); expect(await recovered.locator('textarea').count()).toBe(0);
    await recovered.getByRole('button', { name: 'Check outgoing recovery', exact: true }).click(); await expect(recovered).toContainText('Pending payments remain recorded'); expect(await journal(cold)).toBeTruthy(); expect(errors).toEqual([]);
  } finally { await server.close(); }
});
