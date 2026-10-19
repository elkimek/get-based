import { openStaticSettings } from './settings-entry.js';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { getDecodedToken } from '@cashu/cashu-ts';
import { startKitServer } from './kit-server.js';
import { prepareStaticWithdraw } from './withdraw-static-fixture.js';
import { seedStaticWalletMints } from './wallet-static-fixture.js';
const artifact = process.env.GETBASED_KIT_ARTIFACT || path.resolve('.local-notes/sveltekit-build');
async function ready(page: Page) { await expect(page.locator('html[data-app-ready][data-shell-framework="sveltekit"]')).toBeAttached({ timeout: 30_000 }); await page.evaluate(() => navigator.serviceWorker.ready.then(() => true)); await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true); }
async function wallet(page: Page) {
  await openStaticSettings(page);
  await page.locator('#settings-nav-ai').click(); await expect(page.locator('[data-routstr-settings-view]')).toBeVisible();
}
async function journal(page: Page) { return page.evaluate(() => new Promise<unknown>((resolve, reject) => { const request = indexedDB.open('getbased-cashu', 2); request.onerror = () => reject(request.error); request.onsuccess = () => { const db = request.result, tx = db.transaction('meta', 'readonly'), read = tx.objectStore('meta').get('pendingWithdraw'); read.onsuccess = () => resolve(read.result?.value ?? null); tx.oncomplete = () => db.close(); }; })); }
test('static Routstr shell recovers actual SDK outgoing tokens privately after cached cold launch', async ({ page, context }) => {
  test.setTimeout(150_000); const synthetic = await prepareStaticWithdraw(context), server = await startKitServer(artifact, [synthetic.handleRequest]), errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto(server.origin + '/app?dev-sw=1'); await ready(page);
    // Finish an actual deferred Chat owner; mobile startup leaves Chat unloaded.
    if (/\bchat-autostart-reserved\b/.test(await page.locator('body').getAttribute('class') || '') || await page.locator('#chat-panel.open').isVisible()) {
      await expect(page.locator('body')).not.toHaveClass(/\bchat-autostart-reserved\b/);
      await expect(page.locator('#chat-thread-list .chat-thread-item.active .chat-thread-item-name')).toHaveText('New Conversation');
    }
    const closeChat = page.getByRole('button', { name: 'Close chat', exact: true });
    if (await closeChat.isVisible()) await closeChat.click();
    await expect(page.locator('body')).not.toHaveClass(/\bchat-open\b/);
    await expect(page.locator('#chat-backdrop')).toBeHidden();
    await seedStaticWalletMints(page); await page.reload(); await ready(page); await wallet(page);
    await page.locator('#routstr-wallet-actions [data-wallet-action="withdraw"]').click(); const withdraw = page.locator('[data-wallet-withdraw-view]');
    await withdraw.getByRole('button', { name: 'Cashu Token', exact: true }).click(); await withdraw.locator('#routstr-send-amount').fill('4'); await withdraw.getByRole('button', { name: 'Send', exact: true }).click();
    const sent = withdraw.locator('textarea'); await expect(sent).toBeVisible(); const token = await sent.inputValue();
    expect(getDecodedToken(token, [synthetic.keysetId]).proofs.reduce((sum, proof) => sum + Number(proof.amount), 0)).toBe(4); expect(await journal(page)).toBeTruthy();
    await page.locator('#settings-modal [data-settings-action="close"]').click(); await wallet(page);
    const notice = page.getByRole('region', { name: 'Pending withdraw recovery', exact: true }), field = notice.getByRole('textbox'); await expect(field).toHaveValue(token);
    expect(await page.locator('[data-routstr-settings-view]').innerHTML()).not.toContain(token); expect(await page.locator('[data-routstr-settings-view] [data-token],[data-routstr-settings-view] [data-clipboard-text]').count()).toBe(0);
    // Opening a funding view must not erase the independent saved recovery.
    await page.locator('#routstr-wallet-actions [data-wallet-action="deposit"]').click(); await expect(page.locator('[data-wallet-funding-view]')).toBeVisible(); await expect(field).toHaveValue(token);
    const held = await field.elementHandle(); await page.locator('#settings-modal [data-settings-action="close"]').click(); expect(await held!.evaluate(element => (element as HTMLTextAreaElement).value)).toBe(''); await held!.dispose();
    server.state.offline = true; await page.close(); const cold = await context.newPage(); cold.on('pageerror', error => errors.push(error.message)); await cold.goto(server.origin + '/app?dev-sw=1'); await ready(cold); await wallet(cold);
    expect(JSON.parse(String(await journal(cold)))).toMatchObject({ token, localCommit: true, source: 'cashu-send' });
    // The cached shell and journal survive without the origin. Showing a reclaimable
    // outgoing token preserves the domain's mint-state reconciliation requirement.
    await cold.locator('#settings-modal [data-settings-action="close"]').click(); server.state.offline = false; await wallet(cold);
    const recovered = cold.getByRole('region', { name: 'Pending withdraw recovery', exact: true }); await expect(recovered.getByRole('textbox')).toHaveValue(token);
    await recovered.scrollIntoViewIfNeeded(); await cold.screenshot({ path: test.info().outputPath('routstr-shell-recovery.png'), fullPage: true });
    const privateField = await recovered.getByRole('textbox').elementHandle(); await recovered.getByRole('button', { name: 'Recover to Wallet', exact: true }).click(); await expect(recovered).not.toBeAttached(); expect(await privateField!.evaluate(element => (element as HTMLTextAreaElement).value)).toBe(''); await privateField!.dispose();
    await expect(cold.locator('#routstr-wallet-balance')).toContainText('12 sats'); expect(await journal(cold)).toBeNull(); expect(synthetic.counts().swaps).toBe(2); expect(errors).toEqual([]);
  } finally { await server.close(); }
});
