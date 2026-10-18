import {openStaticSettings} from './settings-entry.js';
import path from 'node:path';
import { expect, test, type Page, type BrowserContext } from '@playwright/test';
import { prepareStaticWallet } from './wallet-static-fixture.js';
import { startKitServer } from './kit-server.js';
test.use({ actionTimeout: 15_000, navigationTimeout: 30_000 });
const artifact = process.env.GETBASED_KIT_ARTIFACT || path.resolve('.local-notes/sveltekit-build');
interface SyntheticAccount { mode: 'valid' | 'malformed'; creates: number; clipboard: string }
async function prepare(context: BrowserContext, mode: SyntheticAccount['mode']) {
  await prepareStaticWallet(context, true, false, false, mode);
}
async function ready(page: Page) { await expect(page.locator('html[data-app-ready][data-shell-framework="sveltekit"]')).toBeAttached({ timeout: 30_000 }); await page.evaluate(() => navigator.serviceWorker.ready.then(() => true)); await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true); }
async function open(page: Page) {
  await openStaticSettings(page); await page.locator('#settings-nav-ai').click(); await expect(page.locator('[data-routstr-settings-view]')).toBeVisible(); await page.locator('[data-routstr-settings-view] summary').click();
}
async function consent(page: Page) {
  const overlay = page.locator('#cloud-ai-consent-overlay');
  await expect(overlay).toBeVisible(); await overlay.getByRole('checkbox').check();
  await overlay.getByRole('button',{name:'Allow & activate',exact:true}).click(); await expect(overlay).not.toBeAttached();
}
async function journal(page: Page) { return page.evaluate(() => new Promise<unknown>((resolve, reject) => { const request = indexedDB.open('getbased-cashu',2); request.onerror = () => reject(request.error); request.onsuccess = () => { const db=request.result, tx=db.transaction('meta','readonly'), read=tx.objectStore('meta').get('pendingDeposit'); read.onsuccess=() => resolve(read.result?.value ?? null); tx.oncomplete=() => db.close(); }; })); }
test('static Routstr connection owns its receipt, retains encrypted node storage and cold-launches without the origin', async ({ page, context }) => {
  test.setTimeout(150_000); await prepare(context,'valid'); const server = await startKitServer(artifact), errors: string[] = []; page.on('pageerror',error => errors.push(error.message));
  try {
    await page.goto(server.origin + '/app?dev-sw=1'); await ready(page); await open(page);
    await page.locator('#routstr-key-input').fill('cashu:cashuA-SYNTHETIC-NONSPENDABLE'); await page.locator('#save-routstr-key-btn').click();
    await consent(page); const receipt=page.locator('#routstr-session-key-receipt'); await expect(receipt).toHaveValue('sk-SYNTHETIC-CREATED');
    await expect(page.locator('#routstr-model-select')).toHaveValue('claude-sonnet-5'); expect(await journal(page)).toBeNull();
    const shell=page.locator('[data-routstr-settings-view]'); expect(await shell.innerHTML()).not.toContain('sk-SYNTHETIC-CREATED'); expect(await shell.locator('[data-key],[data-token],[data-clipboard-text]').count()).toBe(0);
    const stored=await page.evaluate(() => localStorage.getItem('labcharts-routstr-sessions')); expect(stored?.startsWith('d1:')).toBe(true); expect(stored).not.toContain('sk-SYNTHETIC');
    await shell.getByRole('button',{name:'Copy Key',exact:true}).click(); await expect(shell.getByRole('button',{name:'✓ Copied (clears in 60s)',exact:true})).toBeVisible();
    expect(await page.evaluate(() => (window as unknown as {syntheticAccount: SyntheticAccount}).syntheticAccount)).toMatchObject({creates:1,clipboard:'sk-SYNTHETIC-CREATED'});
    const held=await receipt.elementHandle(); await shell.getByRole('button',{name:'I’ve saved it',exact:true}).click(); await expect(receipt).not.toBeAttached(); await expect(shell.locator('summary')).toBeFocused(); expect(await held!.evaluate(element => (element as HTMLTextAreaElement).value)).toBe(''); await held!.dispose();
    await page.locator('#settings-modal [data-settings-action="close"]').click(); server.state.offline=true; await page.close(); const cold=await context.newPage(); cold.on('pageerror',error => errors.push(error.message)); await cold.goto(server.origin+'/app?dev-sw=1'); await ready(cold); await open(cold);
    await expect(cold.locator('#routstr-key-input')).toHaveValue(''); await expect(cold.locator('#routstr-node-label')).toContainText('✓'); await expect(cold.locator('#routstr-model-select')).toHaveValue('claude-sonnet-5'); expect(await cold.evaluate(() => localStorage.getItem('labcharts-routstr-sessions'))).toBe(stored); expect(await journal(cold)).toBeNull();
    await cold.screenshot({path:test.info().outputPath('routstr-account-static-cold.png'),fullPage:true});
    await cold.locator('#routstr-key-input').fill('UNSAVED-SYNTHETIC-DRAFT'); const input=await cold.locator('#routstr-key-input').elementHandle(); await cold.locator('#settings-modal [data-settings-action="close"]').click(); expect(await input!.evaluate(element => (element as HTMLInputElement).value)).toBe(''); await input!.dispose(); expect(errors).toEqual([]);
  } finally { await server.close(); }
});
test('malformed static token conversion retains its recovery journal through cold launch and never redeems it twice', async ({ page, context }) => {
  test.setTimeout(150_000); await prepare(context,'malformed'); const server=await startKitServer(artifact), errors:string[]=[]; page.on('pageerror',error=>errors.push(error.message));
  try {
    await page.goto(server.origin+'/app?dev-sw=1'); await ready(page); await open(page); await page.locator('#routstr-key-input').fill('cashuA-SYNTHETIC-RECOVERY'); await page.locator('#save-routstr-key-btn').click(); await consent(page);
    await expect(page.locator('#routstr-key-status')).toContainText('valid account key'); await expect(page.locator('#save-routstr-key-btn')).toBeEnabled(); await expect(page.locator('#routstr-key-input')).toBeVisible(); const record=await journal(page); expect(record).toMatchObject({token:'cashuA-SYNTHETIC-RECOVERY',nodeUrl:'https://synthetic-routstr.test',submitted:true}); expect(await page.locator('#routstr-key-input').inputValue()).toBe('cashuA-SYNTHETIC-RECOVERY'); expect(await page.evaluate(()=>localStorage.getItem('labcharts-routstr-sessions'))).toBeNull();
    await page.locator('#save-routstr-key-btn').click(); await expect(page.locator('#routstr-key-status')).toContainText('Reconcile'); expect(await page.evaluate(()=>(window as unknown as {syntheticAccount:SyntheticAccount}).syntheticAccount.creates)).toBe(1);
    await page.locator('#settings-modal [data-settings-action="close"]').click(); server.state.offline=true; await page.close(); const cold=await context.newPage(); cold.on('pageerror',error=>errors.push(error.message)); await cold.goto(server.origin+'/app?dev-sw=1'); await ready(cold); await open(cold); expect(await journal(cold)).toEqual(record);
    await expect(cold.getByRole('textbox',{name:'Pending deposit recovery token',exact:true})).toHaveValue('cashuA-SYNTHETIC-RECOVERY'); await expect(cold.locator('#routstr-key-input')).toHaveValue(''); expect(await cold.evaluate(()=>(window as unknown as {syntheticAccount:SyntheticAccount}).syntheticAccount.creates)).toBe(0); expect(errors).toEqual([]);
  } finally { await server.close(); }
});
