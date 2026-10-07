import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { startKitServer } from './kit-server.js';
const artifact = process.env.GETBASED_KIT_ARTIFACT || path.resolve('.local-notes/sveltekit-build');

async function ready(page: Page) {
  await expect(page.locator('html[data-app-ready][data-shell-framework="sveltekit"]')).toBeAttached({ timeout: 30000 });
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
}
async function rail(page: Page) {
  if (!await page.locator('#chat-panel').getAttribute('class').then(value => value?.includes('open'))) await page.locator('#chat-fab').click();
  await expect(page.locator('[data-chat-thread-navigation-view]')).toBeAttached();
  if (!await page.locator('#chat-thread-rail').getAttribute('class').then(value => value?.split(' ').includes('open'))) await page.getByRole('button', { name: 'Toggle conversations', exact: true }).click();
  await expect(page.locator('#chat-thread-rail')).toHaveClass(/\bopen\b/);
  await expect(page.locator('[data-chat-thread-navigation-view]')).toBeVisible();
}
async function prompt(page: Page, value: string) {
  await page.locator('#prompt-dialog-input').fill(value); await page.locator('#prompt-ok').click();
}
async function threadAction(page: Page, action: string) {
  const row = page.locator('.chat-thread-item[data-thread-id="stored-a"]');
  await row.locator('summary').click(); await row.locator(`[data-chat-thread-action="${action}"]`).click();
}

test('static Chat navigation persists projects pinning edits deletion and message jumps through cached cold launch', async ({ page, context }) => {
  test.setTimeout(150000);
  await context.addInitScript(() => {
    if (!['http:', 'https:'].includes(location.protocol)) return;
    const target = window as unknown as { navigationCsp: string[] };
    target.navigationCsp = []; document.addEventListener('securitypolicyviolation', event => target.navigationCsp.push(event.violatedDirective));
    for (const name of ['emptyTour', 'tour']) localStorage.setItem(`labcharts-default-${name}`, 'completed');
    localStorage.setItem('labcharts-encryption-nudge-dismissed', 'true'); localStorage.setItem('labcharts-analytics-consent-seen', '1');
    localStorage.setItem('labcharts-legal-acceptance', JSON.stringify({ accepted:true,termsVersion:'2026-08-22',privacyVersion:'2026-08-22',policyScope:'self-hosted-notice',acceptedAt:'2026-10-07T00:00:00Z',appVersion:'test',location:'local-test' }));
    localStorage.setItem('labcharts-ai-transparency-acknowledgement', JSON.stringify({ version:'2026-08-31',acknowledged:true,acknowledgedAt:'2026-10-07T00:00:00Z' }));
    if (localStorage.getItem('static-chat-navigation-seeded')) return;
    localStorage.setItem('static-chat-navigation-seeded', '1'); localStorage.setItem('labcharts-ai-paused', 'true'); localStorage.setItem('labcharts-chat-backend', 'direct');
    localStorage.setItem('labcharts-profiles', JSON.stringify([{ id:'default',name:'Synthetic conversation profile',sex:'male',dob:'1990-01-01',createdAt:1 }])); localStorage.setItem('labcharts-active-profile','default');
    localStorage.setItem('labcharts-default-chat-threads', JSON.stringify([
      { id:'stored-a',name:'Stored analysis',createdAt:'2026-10-07T12:00:00Z',updatedAt:'2026-10-07T12:00:00Z',messageCount:2,personality:'default' },
      { id:'stored-b',name:'Different conversation',createdAt:'2026-10-06T12:00:00Z',updatedAt:'2026-10-06T12:00:00Z',messageCount:1,personality:'default',projectName:'Health' },
    ]));
    localStorage.setItem('labcharts-default-chat-t_stored-a', JSON.stringify([{ role:'user',content:'Needle stored question' },{ role:'assistant',content:'Needle stored answer retained after offline reload' }]));
    localStorage.setItem('labcharts-default-chat-t_stored-b', JSON.stringify([{ role:'user',content:'Unrelated conversation to delete' }]));
    localStorage.setItem('labcharts-default-imported', JSON.stringify({ entries:[{ date:'2026-01-01',markers:{ 'biochemistry.glucose':5 },markerSources:{ 'biochemistry.glucose':{ snapshotId:'health-report',file:'Retained health report.pdf' } } }],importSnapshots:[{ id:'health-report',date:'2026-01-01',fileName:'Retained health report.pdf',type:'pdf',markerCount:1,markers:[{ mappedKey:'biochemistry.glucose',value:5,unit:'mmol/l' }],importedAt:1767225600000 }] }));
  });
  const server = await startKitServer(artifact), errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto(server.origin + '/app?dev-sw=1'); await ready(page); await rail(page);
    await expect(page.locator('.chat-thread-item')).toHaveCount(2);
    await threadAction(page, 'rename'); await prompt(page, 'Renamed analysis');
    await expect(page.locator('[data-thread-id="stored-a"] .chat-thread-item-name')).toHaveText('Renamed analysis');
    await threadAction(page, 'move-project');
    await page.locator('[data-chat-project-drop="Health"] .chat-project-action').click();
    await page.locator('[data-chat-project-action="rename"]').click(); await prompt(page,'Wellness');
    await expect(page.locator('[data-chat-project-drop="Wellness"] .chat-thread-item')).toHaveCount(2);
    await page.locator('[data-chat-project-drop="Wellness"] .chat-project-action').click(); await page.locator('[data-chat-project-action="delete"]').click(); await page.locator('#confirm-ok').click();
    await expect(page.locator('.chat-thread-item')).toHaveCount(2); await expect(page.locator('[data-chat-project-drop="Wellness"]')).toHaveCount(0);
    // A real cross-conversation jump saves the departing thread first; that
    // invalidates cached message reads without cancelling the accepted jump.
    await page.locator('.chat-thread-item[data-thread-id="stored-b"] .chat-thread-item-main').click();
    await expect(page.locator('#chat-messages')).toContainText('Unrelated conversation to delete');
    await rail(page); await page.locator('#chat-thread-search').fill('needle');
    await expect(page.locator('.chat-search-result')).toHaveCount(2); await page.locator('.chat-search-result').nth(1).click();
    await expect(page.locator('#chat-msg-1')).toHaveClass(/chat-msg-highlight/);
    await rail(page); await page.locator('#chat-thread-search').fill('');
    await threadAction(page,'pin'); await expect(page.locator('[data-thread-id="stored-a"].pinned')).toBeVisible();
    await page.locator('.chat-thread-item[data-thread-id="stored-b"] summary').click(); await page.locator('[data-thread-id="stored-b"] [data-chat-thread-action="delete"]').click(); await page.locator('#confirm-ok').click();
    await expect(page.locator('.chat-thread-item')).toHaveCount(1); await page.locator('#chat-thread-sort').selectOption('name');
    const search = async (target: Page) => {
      await rail(target); await target.locator('#chat-thread-search').fill('needle'); await expect(target.locator('.chat-search-result')).toHaveCount(2);
      await expect(target.locator('.chat-search-result-thread').first()).toHaveText('Renamed analysis'); await target.locator('.chat-search-result').nth(1).click();
      await expect(target.locator('#chat-msg-1')).toHaveClass(/chat-msg-highlight/); await expect(target.locator('#chat-msg-1 .chat-search-mark')).toHaveText('Needle');
      if (await target.evaluate(() => matchMedia('(max-width: 768px)').matches)) {
        await expect(target.locator('#chat-thread-rail')).not.toHaveClass(/\bopen\b/);
        // The closed rail retains its existing 1px divider; its content width
        // must reach zero after the transition, independently of that border.
        await expect.poll(() => target.locator('#chat-thread-rail').evaluate(element => element.clientWidth)).toBe(0);
        await expect.poll(() => target.locator('#chat-thread-rail').evaluate(element => {
          const style = getComputedStyle(element);
          return element.getBoundingClientRect().width - parseFloat(style.borderLeftWidth) - parseFloat(style.borderRightWidth);
        })).toBe(0);
      }
    };
    server.state.offline = true; await search(page);
    await page.close(); const cold = await context.newPage(); cold.on('pageerror', error => errors.push(error.message));
    await cold.goto(server.origin + '/app?dev-sw=1'); await ready(cold); await rail(cold);
    await expect(cold.locator('.chat-thread-item')).toHaveCount(1); await expect(cold.locator('[data-thread-id="stored-a"].pinned')).toBeVisible(); await expect(cold.locator('#chat-thread-sort')).toHaveValue('name');
    await search(cold); await cold.screenshot({ path:test.info().outputPath('chat-navigation-static-cold.png') });
    expect(await cold.evaluate(() => JSON.parse(localStorage.getItem('labcharts-default-chat-threads') || '[]'))).toEqual([expect.objectContaining({ id:'stored-a',name:'Renamed analysis',pinned:true })]);
    await cold.getByRole('button',{name:'Close chat',exact:true}).click(); await cold.locator('[data-shell-action="open-settings"]').click(); await cold.locator('#settings-nav-data').click();
    await expect(cold.locator('#data-entries-section')).toContainText('Retained health report.pdf'); await expect(cold.locator('#data-entries-section .imported-entry')).toHaveCount(1);
    expect(await cold.evaluate(() => (window as unknown as {navigationCsp:string[]}).navigationCsp)).toEqual([]); expect(errors).toEqual([]);
    // Repeat cold first use with real application encryption and unlock, rather
    // than substituting an encrypted-read mock for persisted-data acceptance.
    const security = cold.locator('#encryption-section');
    await security.getByRole('button', { name:'Enable Encryption',exact:true }).click();
    await cold.locator('#passphrase-set-input').fill('SyntheticChat1!'); await cold.locator('#passphrase-confirm-input').fill('SyntheticChat1!'); await cold.locator('#passphrase-set-btn').click();
    await expect(security).toContainText('Encryption is ON');
    expect(await cold.evaluate(() => ['labcharts-default-chat-threads','labcharts-default-chat-t_stored-a'].map(key => localStorage.getItem(key)?.startsWith('v1:')))).toEqual([true,true]);
    await cold.close(); const encrypted = await context.newPage(); encrypted.on('pageerror', error => errors.push(error.message));
    await encrypted.goto(server.origin + '/app?dev-sw=1'); await expect(encrypted.locator('#passphrase-unlock-input')).toBeVisible();
    await encrypted.locator('#passphrase-unlock-input').fill('SyntheticChat1!'); await encrypted.locator('#passphrase-unlock-input').press('Enter'); await ready(encrypted);
    await search(encrypted); await expect(encrypted.locator('#chat-msg-1')).toContainText('Needle stored answer retained after offline reload');
    await rail(encrypted); await encrypted.locator('#chat-thread-search').fill(''); await expect(encrypted.locator('[data-thread-id="stored-a"].pinned')).toBeVisible(); await expect(encrypted.locator('#chat-thread-sort')).toHaveValue('name');
    const closeRail = encrypted.getByRole('button',{name:'Close conversations',exact:true});
    if (await closeRail.isVisible()) await closeRail.click();
    await encrypted.getByRole('button',{name:'Close chat',exact:true}).click();
    await encrypted.locator('[data-shell-action="open-settings"]').click(); await encrypted.locator('#settings-nav-data').click(); await expect(encrypted.locator('#data-entries-section')).toContainText('Retained health report.pdf');
    expect(await encrypted.evaluate(() => (window as unknown as {navigationCsp:string[]}).navigationCsp)).toEqual([]); expect(errors).toEqual([]);
  } finally { await server.close(); }
});
