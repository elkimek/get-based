import path from 'node:path';
import { expect,test,type Page } from '@playwright/test';
import { startKitServer } from './kit-server.js';
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
    const observed=window as unknown as { cliCopied:string[];cliControlRequests:Array<{ action:string;authorization:string }> }; observed.cliCopied=[]; observed.cliControlRequests=[];
    Object.defineProperty(navigator,'clipboard',{ configurable:true,value:{ writeText:async (text:string) => { observed.cliCopied.push(text); } } });
    const endpoint='http://127.0.0.1:8325',token='SYNTHETIC-PRIVATE-CLI-TOKEN',caps=['chat-stream','model-catalog','reasoning-catalog','execution-targets','companion-control','companion-restart'];
    const original=window.fetch.bind(window);
    window.fetch=(input,options) => {
      const url=new URL(input instanceof Request ? input.url : String(input),location.href),mode=localStorage.getItem('test-cli-mode') || 'setup';
      const agent={ id:'codex',name:'Codex CLI',compatible:true,status:mode === 'paused' ? 'paused' : 'available',endpoint,token,controlAuthorized:mode !== 'linked',paused:mode === 'paused',protocolVersion:5,capabilities:mode === 'outdated' ? ['chat-stream'] : mode === 'linked' ? [...caps,'companion-management'] : caps,runtimeMode:mode === 'temporary' ? 'temporary' : 'installed',companionVersion:'1.2.0' };
      const json=(body:unknown,status=200) => Promise.resolve(Response.json(body,{ status }));
      if (url.pathname === '/api/local-agents') return json({ agents:mode === 'setup' ? [] : [agent] });
      if (/^http:\/\/127\.0\.0\.1:83(?:2[4-9]|3[01])$/.test(url.origin)) {
        if (url.origin !== endpoint || mode === 'setup') return json({},404);
        if (url.pathname === '/v1/discovery') return json({ service:'getbased-agent-host',endpoint,token,agents:[agent],protocolVersion:5,capabilities:agent.capabilities,runtimeMode:agent.runtimeMode,paused:agent.paused,companionVersion:'1.2.0' });
        if (url.pathname === '/v1/status') return json({ service:'getbased-agent-host',protocolVersion:5,capabilities:caps,state:agent.paused ? 'paused' : 'running',paused:agent.paused });
        if (url.pathname === '/v1/targets') return json({ targets:[{ id:'local',label:'Local CLI',kind:'local',status:'available' }] });
        if (url.pathname === '/v1/models') return json({ models:[{ id:'first',model:'first',displayName:'First model',isDefault:true,inputModalities:['text'],supportedReasoningEfforts:[] }] });
        if (url.pathname === '/v1/control') {
          const { action }=JSON.parse(String(options?.body)) as { action:string }; observed.cliControlRequests.push({ action,authorization:new Headers(options?.headers).get('Authorization') || '' });
          if (action === 'pause') localStorage.setItem('test-cli-mode','paused');
          if (action === 'resume' || action === 'install') localStorage.setItem('test-cli-mode','installed');
          if (action === 'uninstall') localStorage.setItem('test-cli-mode','temporary');
          return json({ ok:true,restartRequired:action === 'update' });
        }
        return json({},404);
      }
      return original(input,options);
    };
    for (const name of ['emptyTour','tour']) localStorage.setItem(`labcharts-default-${name}`,'completed');
    localStorage.setItem('labcharts-encryption-nudge-dismissed','true');localStorage.setItem('labcharts-analytics-consent-seen','1');
    localStorage.setItem('labcharts-legal-acceptance',JSON.stringify({ accepted:true,termsVersion:'2026-08-22',privacyVersion:'2026-08-22',policyScope:'self-hosted-notice',acceptedAt:'2026-10-06T00:00:00Z',appVersion:'test',location:'local-test' }));
  });
  const server=await startKitServer(artifact),errors:string[]=[];page.on('pageerror',error => errors.push(error.message));
  try {
    await page.goto(server.origin+'/app?dev-sw=1');await expect(page.locator('html[data-app-ready]')).toBeAttached({ timeout:30_000 });await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
    await openSettings(page);await page.locator('#settings-nav-ai').click();await page.locator('.ai-provider-btn[data-provider="cli"]').click();
    const panel=page.locator('[data-cli-agent-settings-view]');await expect(panel).toContainText('Connect your installed CLI agents');
    await panel.getByRole('button',{ name:'Windows',exact:true }).click();await expect(panel.locator('code')).toContainText('Invoke-WebRequest');await panel.getByRole('button',{ name:'Copy connection command',exact:true }).click();
    await expect.poll(() => page.evaluate(() => (window as unknown as { cliCopied:string[] }).cliCopied.at(-1))).toContain('node $p run');
    await panel.getByRole('button',{ name:'macOS',exact:true }).click();await expect(panel.locator('code')).toContainText('curl -fsSL');await panel.getByRole('button',{ name:'Copy the start command',exact:true }).click();
    await expect.poll(() => page.evaluate(() => (window as unknown as { cliCopied:string[] }).cliCopied.at(-1))).toContain('getbased-companion.mjs" start');
    await page.evaluate(() => localStorage.setItem('test-cli-mode','installed'));await panel.getByRole('button',{ name:'Check connection',exact:true }).click();await expect(panel.locator('[data-value="restart-companion"]')).toBeVisible();await panel.locator('label.local-agent-toggle').click();await expect(panel.locator('#cli-agent-model-summary')).toContainText('First model');
    await panel.getByRole('button',{ name:'Test',exact:true }).click();await expect(panel.locator('#local-agent-status')).toHaveText('CLI agent is ready.');
    await panel.getByRole('button',{ name:'Pause',exact:true }).click();await expect(panel.getByRole('button',{ name:'Resume',exact:true })).toBeVisible();await expect(panel.locator('input')).not.toBeChecked();await expect(panel.getByRole('button',{ name:'Reconnect CLIs',exact:true })).toBeDisabled();
    await panel.getByRole('button',{ name:'Resume',exact:true }).click();await expect(panel.getByRole('button',{ name:'Pause',exact:true })).toBeVisible();
    await panel.getByRole('button',{ name:'Check for update',exact:true }).click();await expect(page.locator('#notification-container')).toContainText('Update installed. Select Restart companion');
    await panel.getByRole('button',{ name:'Reconnect CLIs',exact:true }).click();await panel.getByRole('button',{ name:'Uninstall',exact:true }).click();await expect(page.locator('#confirm-dialog-overlay')).toContainText('automatic startup');await page.locator('#confirm-cancel').click();
    expect(await page.evaluate(() => (window as unknown as { cliControlRequests:Array<{ action:string }> }).cliControlRequests.filter(call => call.action === 'uninstall'))).toEqual([]);
    await panel.getByRole('button',{ name:'Uninstall',exact:true }).click();await page.locator('#confirm-ok').click();await expect(panel.getByRole('button',{ name:'Start automatically',exact:true })).toBeVisible();await panel.getByRole('button',{ name:'Start automatically',exact:true }).click();await expect(panel.getByRole('button',{ name:'Uninstall',exact:true })).toBeVisible();
    const requests=await page.evaluate(() => (window as unknown as { cliControlRequests:Array<{ action:string;authorization:string }> }).cliControlRequests);expect(requests.map(call => call.action)).toEqual(['pause','resume','update','restart','uninstall','install']);expect(requests.every(call => call.authorization === 'Bearer SYNTHETIC-PRIVATE-CLI-TOKEN')).toBe(true);expect(await panel.innerHTML()).not.toContain('SYNTHETIC-PRIVATE-CLI-TOKEN');
    await page.evaluate(() => localStorage.setItem('test-cli-mode','linked'));await panel.getByRole('button',{ name:'Check connection',exact:true }).click();await expect(panel.getByRole('link',{ name:'Manage Companion',exact:true })).toHaveAttribute('href','http://127.0.0.1:8325/manage');await expect(panel.locator('[data-settings-action="control-cli-companion"]')).toHaveCount(0);
    await page.evaluate(() => localStorage.setItem('test-cli-mode','outdated'));await panel.getByRole('button',{ name:'Check connection',exact:true }).click();await expect(panel).toContainText('Update required');await panel.getByRole('button',{ name:'Copy one-time update command',exact:true }).click();await expect.poll(() => page.evaluate(() => (window as unknown as { cliCopied:string[] }).cliCopied.at(-1))).toContain('getbased-companion.mjs" install');
    await page.evaluate(() => localStorage.setItem('test-cli-mode','installed'));await page.locator('#settings-modal [data-settings-action="close"]').click();server.state.offline=true;await page.close();const cold=await context.newPage();cold.on('pageerror',error => errors.push(error.message));await cold.goto(server.origin+'/app?dev-sw=1');await expect(cold.locator('html[data-app-ready][data-shell-framework="sveltekit"]')).toBeAttached({ timeout:30_000 });await openSettings(cold);await cold.locator('#settings-nav-ai').click();await cold.locator('.ai-provider-btn[data-provider="cli"]').click();
    const restored=cold.locator('[data-cli-agent-settings-view]');await expect(restored.getByRole('button',{ name:'Restart companion',exact:true })).toBeVisible();expect(await restored.innerHTML()).not.toContain('SYNTHETIC-PRIVATE-CLI-TOKEN');expect(errors).toEqual([]);await restored.scrollIntoViewIfNeeded();await cold.screenshot({ path:test.info().outputPath('cli-settings-cold.png') });
  } finally { await server.close(); }
});
