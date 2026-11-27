import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { startTestCompanion } from './cli-companion-fixture.js';
import { startKitServer } from './kit-release-server.js';
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
    for (const name of ['emptyTour','tour']) localStorage.setItem(`labcharts-default-${name}`,'completed');
    localStorage.setItem('labcharts-encryption-nudge-dismissed','true'); localStorage.setItem('labcharts-analytics-consent-seen','1');
    localStorage.setItem('labcharts-legal-acceptance',JSON.stringify({ accepted:true,termsVersion:'2026-08-22',privacyVersion:'2026-08-22',policyScope:'self-hosted-notice',acceptedAt:'2026-10-06T00:00:00Z',appVersion:'test',location:'local-test' }));
  });
  const server=await startKitServer(artifact), errors:string[]=[]; page.on('pageerror',error => errors.push(error.message));
  const companion=await startTestCompanion(server.origin);
  try {
    await companion.restrictConnections(context);
    await page.goto(server.origin+'/app?dev-sw=1'); await ready(page); await settings(page); await page.locator('#settings-nav-data').click();
    await page.locator('#encryption-section').getByRole('button',{ name:'Enable Encryption' }).click(); await page.locator('#passphrase-set-input').fill('SyntheticStrong1!'); await page.locator('#passphrase-confirm-input').fill('SyntheticStrong1!'); await page.locator('#passphrase-set-btn').click(); await expect(page.locator('#encryption-section')).toContainText('Encryption is ON');
    await page.locator('#settings-nav-ai').click(); await page.locator('.ai-provider-btn[data-provider="cli"]').click();
    await companion.pair(page); await page.locator('label.local-agent-toggle:has(input[data-agent="codex"])').click();
    const panel=page.locator('[data-cli-agent-models-view]'); await expect(panel.locator('#cli-agent-model-summary')).toContainText('local first');
    await panel.locator('#cli-agent-model-summary').click(); await panel.locator('[data-settings-action="set-cli-agent-model"][data-value="local-second"]').click(); await expect(panel.locator('#cli-agent-model-summary')).toContainText('local second');
    await panel.locator('#cli-agent-effort-summary').click(); await panel.locator('[data-settings-action="set-cli-agent-effort"][data-value="high"]').click(); await expect(panel.locator('#cli-agent-effort-summary')).toContainText('high');
    await panel.locator('#cli-agent-target-summary').click(); await panel.locator('[data-settings-action="set-cli-agent-target"][data-value="gateway"]').click(); await expect(panel.locator('#cli-agent-model-summary')).toContainText('gateway first'); await expect(panel).toContainText('background feature jobs are not available');
    await panel.locator('#cli-agent-model-summary').click(); await panel.locator('[data-settings-action="set-cli-agent-model"][data-value="gateway-second"]').click(); await expect(panel.locator('#cli-agent-model-summary')).toContainText('gateway second');
    await panel.locator('#cli-agent-target-summary').click(); await panel.locator('[data-settings-action="set-cli-agent-target"][data-value="local"]').click(); await expect(panel.locator('#cli-agent-model-summary')).toContainText('local second'); await expect(panel.locator('#cli-agent-effort-summary')).toContainText('high');
    const stored=await page.evaluate(() => Object.fromEntries(Object.entries(localStorage).filter(([key]) => key.startsWith('labcharts-agent-host-'))));
    expect(stored['labcharts-agent-host-token']).toBeTruthy(); expect(stored['labcharts-agent-host-token']).toMatch(/^v1:/); expect(await page.evaluate(()=>localStorage.getItem('labcharts-companion-pairing'))).toMatch(/^v1:/); expect(await panel.innerHTML()).not.toContain(companion.code); expect(JSON.stringify(stored)).not.toContain(companion.installation);
    const onlineCalls=companion.calls.length;
    await page.locator('#settings-modal [data-settings-action="close"]').click(); server.state.offline=true; await page.close(); const cold=await context.newPage(); cold.on('pageerror',error => errors.push(error.message)); await cold.goto(server.origin+'/app?dev-sw=1');
    await cold.locator('#passphrase-unlock-input').fill('SyntheticStrong1!'); await cold.locator('#passphrase-unlock-input').press('Enter'); await ready(cold); await settings(cold); await cold.locator('#settings-nav-ai').click();
    const saved=cold.locator('[data-cli-agent-models-view]'); await expect(saved.locator('#cli-agent-model-summary')).toContainText('local second'); await expect(saved.locator('#cli-agent-effort-summary')).toContainText('high');
    await saved.locator('#cli-agent-target-summary').click(); await saved.locator('[data-settings-action="set-cli-agent-target"][data-value="gateway"]').click(); await expect(saved.locator('#cli-agent-model-summary')).toContainText('gateway second');
    const calls=companion.calls.slice(onlineCalls).filter(call=>['/v1/models','/v1/targets'].includes(call.path) && call.method==='GET');
    expect(calls.length).toBeGreaterThan(0); expect(calls.every(call=>call.authenticated && call.status===200)).toBe(true);expect(errors).toEqual([]);
    await saved.scrollIntoViewIfNeeded(); await cold.screenshot({ path:test.info().outputPath('cli-models-cold.png') });
  } finally { await companion.close(); await server.close(); }
});
