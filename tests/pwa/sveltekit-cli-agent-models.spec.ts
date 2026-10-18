import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { startKitServer } from './kit-server.js';
const artifact = process.env.GETBASED_KIT_ARTIFACT || path.resolve('.local-notes/sveltekit-build');
async function ready(page: Page) { await expect(page.locator('html[data-app-ready][data-shell-framework="sveltekit"]')).toBeAttached({ timeout:30_000 }); await page.evaluate(() => navigator.serviceWorker.ready.then(() => true)); await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true); }
async function settings(page: Page) {
  await expect(page.locator('body')).not.toHaveClass(/\bchat-autostart-reserved\b/, { timeout: 30_000 });
  const closeChat = page.getByRole('button', { name: 'Close chat', exact: true });
  if (await closeChat.isVisible()) await closeChat.click();
  await page.locator('[data-shell-action="open-settings"]').click();
}
test('static CLI model and reasoning choices remain isolated by execution target through encrypted cached cold launch', async ({ page,context }) => {
  test.setTimeout(150_000);
  await context.addInitScript(() => {
    if (!['http:','https:'].includes(location.protocol)) return;
    const endpoint='http://127.0.0.1:8324', token='SYNTHETIC-PRIVATE-CLI-TOKEN';
    const capabilities=['chat-stream','model-catalog','reasoning-catalog','companion-control','execution-targets'];
    const agents=[{ id:'codex',name:'Codex CLI',compatible:true,status:'available',endpoint,token,protocolVersion:5,capabilities,runtimeMode:'temporary' }];
    const observed=window as unknown as { cliRequests:Array<{ path:string;authorization:string }> }; observed.cliRequests=[];
    const original=window.fetch.bind(window);
    window.fetch=(input,options) => {
      const url=new URL(input instanceof Request ? input.url : String(input),location.href);
      if (url.pathname === '/api/local-agents') return Promise.resolve(new Response(JSON.stringify({ agents }),{ status:200,headers:{ 'Content-Type':'application/json' } }));
      if (/^http:\/\/127\.0\.0\.1:83(?:2[4-9]|3[01])$/.test(url.origin)) {
        if (url.origin !== endpoint) return Promise.resolve(new Response('{}',{ status:404 }));
        observed.cliRequests.push({ path:url.pathname,authorization:new Headers(options?.headers).get('Authorization') || '' });
        const target=url.searchParams.get('target') || 'local';
        const body=url.pathname === '/v1/discovery' ? { service:'getbased-agent-host',endpoint,token,agents,protocolVersion:5,capabilities }
          : url.pathname === '/v1/status' ? { ok:true,service:'getbased-agent-host',protocolVersion:5,capabilities,state:'running',paused:false }
          : url.pathname === '/v1/targets' ? { targets:[{ id:'local',label:'Local CLI',kind:'local',status:'available' },{ id:'gateway',label:'Personal gateway',kind:'gateway',status:'available',supportsLocalTools:false }] }
          : { models:['first','second'].map((name,i) => ({ id:`${target}-${name}`,model:`${target}-${name}`,displayName:`${target} ${name}`,isDefault:i === 0,inputModalities:['text','image'],defaultReasoningEffort:'low',supportedReasoningEfforts:[{ reasoningEffort:'low',description:'Low' },{ reasoningEffort:'high',description:'High' }] })) };
        return Promise.resolve(new Response(JSON.stringify(body),{ status:200,headers:{ 'Content-Type':'application/json' } }));
      }
      return original(input,options);
    };
    for (const name of ['emptyTour','tour']) localStorage.setItem(`labcharts-default-${name}`,'completed');
    localStorage.setItem('labcharts-encryption-nudge-dismissed','true'); localStorage.setItem('labcharts-analytics-consent-seen','1');
    localStorage.setItem('labcharts-legal-acceptance',JSON.stringify({ accepted:true,termsVersion:'2026-08-22',privacyVersion:'2026-08-22',policyScope:'self-hosted-notice',acceptedAt:'2026-10-06T00:00:00Z',appVersion:'test',location:'local-test' }));
  });
  const server=await startKitServer(artifact), errors:string[]=[]; page.on('pageerror',error => errors.push(error.message));
  try {
    await page.goto(server.origin+'/app?dev-sw=1'); await ready(page); await settings(page); await page.locator('#settings-nav-data').click();
    await page.locator('#encryption-section').getByRole('button',{ name:'Enable Encryption' }).click(); await page.locator('#passphrase-set-input').fill('SyntheticStrong1!'); await page.locator('#passphrase-confirm-input').fill('SyntheticStrong1!'); await page.locator('#passphrase-set-btn').click(); await expect(page.locator('#encryption-section')).toContainText('Encryption is ON');
    await page.locator('#settings-nav-ai').click(); await page.locator('.ai-provider-btn[data-provider="cli"]').click();
    await expect(page.locator('.local-agent-row')).toHaveCount(1); await page.locator('label.local-agent-toggle:has(input[data-agent="codex"])').click();
    const panel=page.locator('[data-cli-agent-models-view]'); await expect(panel.locator('#cli-agent-model-summary')).toContainText('local first');
    await panel.locator('#cli-agent-model-summary').click(); await panel.locator('[data-settings-action="set-cli-agent-model"][data-value="local-second"]').click(); await expect(panel.locator('#cli-agent-model-summary')).toContainText('local second');
    await panel.locator('#cli-agent-effort-summary').click(); await panel.locator('[data-settings-action="set-cli-agent-effort"][data-value="high"]').click(); await expect(panel.locator('#cli-agent-effort-summary')).toContainText('high');
    await panel.locator('#cli-agent-target-summary').click(); await panel.locator('[data-settings-action="set-cli-agent-target"][data-value="gateway"]').click(); await expect(panel.locator('#cli-agent-model-summary')).toContainText('gateway first'); await expect(panel).toContainText('background feature jobs are not available');
    await panel.locator('#cli-agent-model-summary').click(); await panel.locator('[data-settings-action="set-cli-agent-model"][data-value="gateway-second"]').click(); await expect(panel.locator('#cli-agent-model-summary')).toContainText('gateway second');
    await panel.locator('#cli-agent-target-summary').click(); await panel.locator('[data-settings-action="set-cli-agent-target"][data-value="local"]').click(); await expect(panel.locator('#cli-agent-model-summary')).toContainText('local second'); await expect(panel.locator('#cli-agent-effort-summary')).toContainText('high');
    const stored=await page.evaluate(() => Object.fromEntries(Object.entries(localStorage).filter(([key]) => key.startsWith('labcharts-agent-host-'))));
    expect(stored['labcharts-agent-host-token']).toBeTruthy(); expect(JSON.stringify(stored)).not.toContain('SYNTHETIC-PRIVATE-CLI-TOKEN'); expect(await panel.innerHTML()).not.toContain('SYNTHETIC-PRIVATE-CLI-TOKEN');
    await page.locator('#settings-modal [data-settings-action="close"]').click(); server.state.offline=true; await page.close(); const cold=await context.newPage(); cold.on('pageerror',error => errors.push(error.message)); await cold.goto(server.origin+'/app?dev-sw=1');
    await cold.locator('#passphrase-unlock-input').fill('SyntheticStrong1!'); await cold.locator('#passphrase-unlock-input').press('Enter'); await ready(cold); await settings(cold); await cold.locator('#settings-nav-ai').click();
    const saved=cold.locator('[data-cli-agent-models-view]'); await expect(saved.locator('#cli-agent-model-summary')).toContainText('local second'); await expect(saved.locator('#cli-agent-effort-summary')).toContainText('high');
    await saved.locator('#cli-agent-target-summary').click(); await saved.locator('[data-settings-action="set-cli-agent-target"][data-value="gateway"]').click(); await expect(saved.locator('#cli-agent-model-summary')).toContainText('gateway second');
    const restored=await cold.evaluate(() => ({ encrypted:localStorage.getItem('labcharts-agent-host-token'),
      calls:(window as unknown as { cliRequests:Array<{ path:string;authorization:string }> }).cliRequests.filter(call => ['/v1/models','/v1/targets'].includes(call.path)) }));
    expect(restored.encrypted).toMatch(/^v1:/); expect(restored.encrypted).not.toContain('SYNTHETIC-PRIVATE-CLI-TOKEN');
    expect(restored.calls.length).toBeGreaterThan(0); expect(restored.calls.every(call => call.authorization === 'Bearer SYNTHETIC-PRIVATE-CLI-TOKEN')).toBe(true); expect(errors).toEqual([]);
    await saved.scrollIntoViewIfNeeded(); await cold.screenshot({ path:test.info().outputPath('cli-models-cold.png') });
  } finally { await server.close(); }
});
