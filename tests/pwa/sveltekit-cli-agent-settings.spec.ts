import path from 'node:path';
import { expect,test,type Page } from '@playwright/test';
import { startTestCompanion } from './cli-companion-fixture.js';
import { startKitServer } from './kit-release-server.js';
const artifact=process.env.GETBASED_KIT_ARTIFACT || path.resolve('.local-notes/sveltekit-build');
async function openSettings(page:Page) {
  // Empty desktop startup reserves space while its delayed chat opener loads.
  // Settle that public state before dismissing chat so it cannot race the gear.
  await expect(page.locator('body')).not.toHaveClass(/\bchat-autostart-reserved\b/,{ timeout:30_000 });
  const closeChat=page.getByRole('button',{ name:'Close chat',exact:true });
  if (await closeChat.isVisible()) await closeChat.click();
  await expect(page.locator('#chat-panel')).not.toHaveClass(/\bopen\b/);
  await page.locator('[data-shell-action="open-settings"]').click();
  await expect(page.locator('#settings-modal')).toBeVisible();
}
test('static CLI settings preserves setup, private companion actions and cached cold-launch controls',async ({ page,context }) => {
  test.setTimeout(150_000);
  await context.addInitScript(() => {
    if (!['http:','https:'].includes(location.protocol)) return;
    const observed=window as unknown as {cliCopied:string[]};observed.cliCopied=[];
    Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async(text:string)=>{observed.cliCopied.push(text);}}});
    for (const name of ['emptyTour','tour']) localStorage.setItem(`labcharts-default-${name}`,'completed');
    localStorage.setItem('labcharts-encryption-nudge-dismissed','true');localStorage.setItem('labcharts-analytics-consent-seen','1');
    localStorage.setItem('labcharts-legal-acceptance',JSON.stringify({ accepted:true,termsVersion:'2026-08-22',privacyVersion:'2026-08-22',policyScope:'self-hosted-notice',acceptedAt:'2026-10-06T00:00:00Z',appVersion:'test',location:'local-test' }));
  });
  const server=await startKitServer(artifact),errors:string[]=[];page.on('pageerror',error => errors.push(error.message));
  const companion=await startTestCompanion(server.origin);
  try {
    await companion.restrictConnections(context);
    await page.goto(server.origin+'/app?dev-sw=1');await expect(page.locator('html[data-app-ready]')).toBeAttached({ timeout:30_000 });await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
    await openSettings(page);await page.locator('#settings-nav-ai').click();await page.locator('.ai-provider-btn[data-provider="cli"]').click();
    const panel=page.locator('[data-cli-agent-settings-view]');await expect(panel).toContainText('Connect your installed CLI agents');
    await panel.getByRole('button',{ name:'Windows',exact:true }).click();await expect(panel.locator('code[title]')).toContainText('Invoke-WebRequest');await panel.getByRole('button',{ name:'Copy connection command',exact:true }).click();
    await expect.poll(() => page.evaluate(() => (window as unknown as { cliCopied:string[] }).cliCopied.at(-1))).toContain('node $p run');
    await panel.getByRole('button',{ name:'macOS',exact:true }).click();await expect(panel.locator('code[title]')).toContainText('curl -fsSL');await panel.getByRole('button',{ name:'Copy the start command',exact:true }).click();
    await expect.poll(() => page.evaluate(() => (window as unknown as { cliCopied:string[] }).cliCopied.at(-1))).toContain('getbased-companion.mjs" start');
    await companion.pair(page);await panel.locator('label.local-agent-toggle').click();await expect(panel.locator('#cli-agent-model-summary')).toContainText('local first');
    await panel.getByRole('button',{name:'Test',exact:true}).click();await expect(panel.locator('#local-agent-status')).toHaveText('CLI agent is ready.');
    const link=panel.getByRole('link',{name:'Manage Companion',exact:true});await expect(link).toHaveAttribute('href',companion.endpoint+'/manage');
    await expect(panel.locator('[data-settings-action="control-cli-companion"]')).toHaveCount(0);
    const opened=context.waitForEvent('page');await link.click();const local=await opened;
    await local.getByLabel('Management code').fill(companion.managementCode());await local.getByRole('button',{name:'Unlock controls'}).click();await expect(local.locator('#status')).toHaveText('Connected');
    await local.getByText('Advanced',{exact:true}).click();await local.getByRole('button',{name:'Pause',exact:true}).click();await expect(local.locator('#status')).toContainText('Paused');
    await panel.getByRole('button',{name:'Check connection',exact:true}).click();await expect(panel.locator('.local-agent-state')).toContainText('Companion paused');await expect(panel.getByRole('button',{name:'Test',exact:true})).toBeDisabled();await expect(panel.locator('input[data-agent="codex"]')).toBeDisabled();
    await local.getByRole('button',{name:'Resume',exact:true}).click();await expect(local.locator('#status')).toContainText('Connected');
    await local.getByRole('button',{name:'Check for update',exact:true}).click();await expect(local.locator('#message')).toContainText('Update installed');
    await local.getByRole('button',{name:'Reconnect CLIs',exact:true}).click();await local.getByRole('button',{name:'Uninstall…',exact:true}).click();await local.getByRole('button',{name:'Cancel',exact:true}).click();
    expect(companion.calls.some(call=>call.action==='uninstall')).toBe(false);
    await local.getByRole('button',{name:'Uninstall…',exact:true}).click();await local.getByRole('button',{name:'Uninstall Companion',exact:true}).click();await local.getByRole('button',{name:'Start automatically',exact:true}).click();await expect(local.locator('#startup-description')).toContainText('Starts automatically');
    const controls=companion.calls.filter(call=>call.path==='/manage/control');expect(controls.map(call=>call.action)).toEqual(['pause','resume','update','restart','uninstall','install']);expect(controls.every(call=>call.authenticated && call.status===200)).toBe(true);expect(companion.calls.filter(call=>call.path==='/v1/control')).toEqual([]);
    await local.close(); expect(await panel.innerHTML()).not.toContain(companion.installation);
    companion.setOutdated(true);await panel.getByRole('button',{name:'Check connection',exact:true}).click();await expect(panel).toContainText('Update required');await panel.getByRole('button',{name:'Copy one-time update command',exact:true}).click();await expect.poll(()=>page.evaluate(()=>(window as unknown as {cliCopied:string[]}).cliCopied.at(-1))).toContain('getbased-companion.mjs" install');
    companion.setOutdated(false);await page.locator('#settings-modal [data-settings-action="close"]').click();server.state.offline=true;await page.close();const cold=await context.newPage();cold.on('pageerror',error => errors.push(error.message));await cold.goto(server.origin+'/app?dev-sw=1');await expect(cold.locator('html[data-app-ready][data-shell-framework="sveltekit"]')).toBeAttached({ timeout:30_000 });await openSettings(cold);await cold.locator('#settings-nav-ai').click();await cold.locator('.ai-provider-btn[data-provider="cli"]').click();
    const restored=cold.locator('[data-cli-agent-settings-view]');await expect(restored.getByRole('link',{name:'Manage Companion',exact:true})).toHaveAttribute('href',companion.endpoint+'/manage');expect(await restored.innerHTML()).not.toContain(companion.code);expect(errors).toEqual([]);await restored.scrollIntoViewIfNeeded();await cold.screenshot({ path:test.info().outputPath('cli-settings-cold.png') });
  } finally { await companion.close(); await server.close(); }
});
