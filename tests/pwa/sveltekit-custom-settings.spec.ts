import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { startKitServer } from './kit-server.js';
import { openStaticSettings as settings } from './settings-entry.js';
const artifact = process.env.GETBASED_KIT_ARTIFACT || path.resolve('.local-notes/sveltekit-build');
async function ready(page: Page) { await expect(page.locator('html[data-app-ready][data-shell-framework="sveltekit"]')).toBeAttached({ timeout: 30_000 }); await page.evaluate(() => navigator.serviceWorker.ready.then(() => true)); await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true); }
test('static Custom API verifies exact endpoint consent and encrypted key persistence through cached cold launch and removal', async ({ page, context }) => {
  test.setTimeout(150_000);
  await context.addInitScript(() => {
    if (!['http:','https:'].includes(location.protocol)) return;
    const target = window as unknown as { customCalls: { path: string; body: string; authorization: string }[]; customOffline: boolean }; target.customCalls = []; target.customOffline = false;
    const fetchOriginal = window.fetch.bind(window);
    window.fetch = (input, options) => {
      const url = new URL(input instanceof Request ? input.url : String(input), location.href);
      if (url.origin === 'https://synthetic-custom.test') {
        target.customCalls.push({ path: url.pathname, body: String(options?.body || ''), authorization: new Headers(options?.headers).get('Authorization') || '' });
        if (target.customOffline) return Promise.reject(new TypeError('Synthetic endpoint unavailable'));
        const body = url.pathname.endsWith('/models') ? { data: [{ id: 'synthetic-a', name: 'Synthetic A' }, { id: 'synthetic-b', name: 'Synthetic B' }] } : { choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 1 } };
        return Promise.resolve(new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } }));
      }
      return fetchOriginal(input, options);
    };
    for (const name of ['emptyTour','tour']) localStorage.setItem(`labcharts-default-${name}`, 'completed');
    localStorage.setItem('labcharts-encryption-nudge-dismissed','true'); localStorage.setItem('labcharts-analytics-consent-seen','1');
    localStorage.setItem('labcharts-legal-acceptance',JSON.stringify({ accepted: true, termsVersion: '2026-08-22', privacyVersion: '2026-08-22', policyScope: 'self-hosted-notice', acceptedAt: '2026-10-06T00:00:00Z', appVersion: 'test', location: 'local-test' }));
  });
  const server = await startKitServer(artifact), errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto(server.origin + '/app?dev-sw=1'); await ready(page); await settings(page); await page.locator('#settings-nav-data').click();
    await page.locator('#encryption-section').getByRole('button', { name: 'Enable Encryption' }).click(); await page.locator('#passphrase-set-input').fill('SyntheticStrong1!'); await page.locator('#passphrase-confirm-input').fill('SyntheticStrong1!'); await page.locator('#passphrase-set-btn').click(); await expect(page.locator('#encryption-section')).toContainText('Encryption is ON');
    await page.locator('#settings-nav-ai').click(); await page.locator('.ai-provider-btn[data-provider="custom"]').click();
    const panel = page.locator('[data-custom-settings-view]'); await expect(panel).toBeVisible(); await panel.locator('#custom-url-input').fill(' https://synthetic-custom.test/v1/ '); await panel.locator('#custom-key-input').fill(' SYNTHETIC-PRIVATE-KEY '); await panel.getByRole('button', { name: 'Save & Validate', exact: true }).click();
    const consent = page.locator('#cloud-ai-consent-overlay'); await expect(consent).toBeVisible(); await expect(consent).toContainText('synthetic-custom.test');
    expect(await page.evaluate(() => localStorage.getItem('labcharts-custom-url'))).toBeNull();
    const calls = await page.evaluate(() => (window as unknown as { customCalls: { path: string; body: string; authorization: string }[] }).customCalls); expect(calls).toHaveLength(2); expect(calls[0]!.authorization).toBe('Bearer SYNTHETIC-PRIVATE-KEY'); expect(JSON.parse(calls[1]!.body)).toEqual({ model: 'x', messages: [{ role: 'user', content: 'hi' }], max_tokens: 1 });
    await consent.locator('#cloud-ai-consent-checkbox').check(); await consent.locator('[data-cloud-ai-consent-action="approve"]').click(); await expect(panel.locator('#custom-key-status')).toHaveText('✓ Connected');
    const encrypted = await page.evaluate(() => localStorage.getItem('labcharts-custom-key')); expect(encrypted).toBeTruthy(); expect(encrypted).not.toContain('SYNTHETIC-PRIVATE-KEY');
    await panel.locator('#custom-model-select').selectOption('synthetic-b'); await panel.locator('#custom-manual-model').fill('manual-synthetic'); await panel.locator('#custom-manual-model').press('Enter'); await expect(panel.locator('#custom-model-select')).toHaveValue('__custom');
    expect(await panel.innerHTML()).not.toContain('SYNTHETIC-PRIVATE-KEY'); const held = await panel.locator('#custom-key-input').elementHandle(); await page.locator('#settings-modal [data-settings-action="close"]').click(); expect(await held!.evaluate(element => (element as HTMLInputElement).value)).toBe(''); await held!.dispose();
    server.state.offline = true; await page.close(); const cold = await context.newPage(); cold.on('pageerror', error => errors.push(error.message)); await cold.goto(server.origin + '/app?dev-sw=1');
    await cold.locator('#passphrase-unlock-input').fill('SyntheticStrong1!'); await cold.locator('#passphrase-unlock-input').press('Enter'); await ready(cold); await cold.evaluate(() => { (window as unknown as { customOffline: boolean }).customOffline = true; }); await settings(cold); await cold.locator('#settings-nav-ai').click();
    const saved = cold.locator('[data-custom-settings-view]'); await expect(saved.locator('#custom-key-input')).toHaveValue('SYNTHETIC-PRIVATE-KEY'); await expect(saved.locator('#custom-model-select')).toHaveValue('__custom'); await expect(saved.locator('#custom-manual-model')).toHaveValue('manual-synthetic'); expect(await cold.evaluate(() => localStorage.getItem('labcharts-custom-url'))).toBe('https://synthetic-custom.test/v1');
    await saved.scrollIntoViewIfNeeded(); await cold.screenshot({ path: test.info().outputPath('custom-settings-cold.png'), fullPage: true }); const retained = await saved.locator('#custom-key-input').elementHandle(); await saved.getByRole('button', { name: 'Remove', exact: true }).click(); await expect(saved.locator('#custom-key-status')).toHaveText('Not connected'); expect(await retained!.evaluate(element => (element as HTMLInputElement).value)).toBe(''); await retained!.dispose(); await expect(saved.locator('#custom-model-area')).toHaveCount(0);
    expect(await cold.evaluate(() => ['url','model','models','vision-models'].map(name => localStorage.getItem('labcharts-custom-' + name)))).toEqual([null,null,null,null]); expect(errors).toEqual([]);
  } finally { await server.close(); }
});
