import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { startKitServer } from './kit-server.js';
import {openStaticSettings} from './settings-entry.js';
const artifact = process.env.GETBASED_KIT_ARTIFACT || path.resolve('.local-notes/sveltekit-build');
async function ready(page: Page) { await expect(page.locator('html[data-app-ready][data-shell-framework="sveltekit"]')).toBeAttached({ timeout: 30_000 }); await page.evaluate(() => navigator.serviceWorker.ready.then(() => true)); await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true); }
async function settings(page: Page) {
  await openStaticSettings(page);
}
test('static Local AI preserves encrypted connection, cloud guidance and manual VRAM through cached cold launch', async ({ page, context }) => {
  test.setTimeout(150_000);
  await context.addInitScript(() => {
    if (!['http:','https:'].includes(location.protocol)) return;
    const target = window as unknown as { localAiOffline: boolean; localAiCalls: { path: string; method: string; body: string; authorization: string }[] };
    target.localAiOffline = false; target.localAiCalls = [];
    const original = window.fetch.bind(window);
    window.fetch = (input, options) => {
      const url = new URL(input instanceof Request ? input.url : String(input), location.href);
      if (url.origin === 'https://synthetic-local.test' || url.origin === 'http://localhost:11434') {
        target.localAiCalls.push({ path: url.pathname, method: options?.method || 'GET', body: String(options?.body || ''), authorization: new Headers(options?.headers).get('Authorization') || '' });
        if (target.localAiOffline) return Promise.reject(new TypeError('Synthetic endpoint unavailable'));
        if (options?.method === 'HEAD') return Promise.resolve(new Response(null,{ status: 200 }));
        const names = ['llama3.2','qwen2.5:14b','kimi-k2.5:cloud'];
        const body = url.pathname === '/api/tags' ? { models: names.map(name => ({ name, size: 3e9, capabilities: ['completion','vision'], details: { parameter_size: '14B', quantization_level: 'Q4_K_M' } })) }
          : url.pathname === '/api/ps' ? { models: [{ name: 'llama3.2', size_vram: 2e9, context_length: 8192 }] }
            : url.pathname === '/v1/models' ? { data: names.map(id => ({ id, vision: true, size: 3e9 })) } : { error: 'unsupported' };
        return Promise.resolve(new Response(JSON.stringify(body),{ status: url.pathname === '/api/v1/models' ? 404 : 200, headers: { 'Content-Type': 'application/json' } }));
      }
      return original(input,options);
    };
    for (const name of ['emptyTour','tour']) localStorage.setItem(`labcharts-default-${name}`,'completed');
    localStorage.setItem('labcharts-encryption-nudge-dismissed','true'); localStorage.setItem('labcharts-analytics-consent-seen','1');
    localStorage.setItem('labcharts-legal-acceptance',JSON.stringify({ accepted: true, termsVersion: '2026-08-22', privacyVersion: '2026-08-22', policyScope: 'self-hosted-notice', acceptedAt: '2026-10-06T00:00:00Z', appVersion: 'test', location: 'local-test' }));
  });
  const server = await startKitServer(artifact), errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto(server.origin+'/app?dev-sw=1'); await ready(page); await settings(page); await page.locator('#settings-nav-data').click();
    await page.locator('#encryption-section').getByRole('button',{ name: 'Enable Encryption' }).click(); await page.locator('#passphrase-set-input').fill('SyntheticStrong1!'); await page.locator('#passphrase-confirm-input').fill('SyntheticStrong1!'); await page.locator('#passphrase-set-btn').click(); await expect(page.locator('#encryption-section')).toContainText('Encryption is ON');
    await page.locator('#settings-nav-ai').click(); await page.locator('.ai-provider-btn[data-provider="ollama"]').click();
    const panel = page.locator('[data-local-ai-settings-view]'); await expect(panel).toBeVisible(); await expect(panel.locator('#local-ai-status-text')).toContainText('Connected'); await expect(page.locator('#cloud-ai-consent-overlay')).toHaveCount(0);
    await panel.locator('#local-ai-url-input').fill(' https://synthetic-local.test/v1/ '); await panel.locator('#local-ai-apikey-input').fill(' SYNTHETIC-LOCAL-KEY '); await panel.getByRole('button',{ name: 'Test',exact: true }).click();
    const consent = page.locator('#cloud-ai-consent-overlay'); await expect(consent).toBeVisible(); await expect(consent).toContainText('synthetic-local.test');
    expect(await page.evaluate(() => localStorage.getItem('labcharts-ollama'))).toBeNull();
    const calls = await page.evaluate(() => (window as unknown as { localAiCalls: { path: string; method: string; body: string; authorization: string }[] }).localAiCalls.filter(call => call.authorization));
    expect(calls.length).toBeGreaterThan(0); expect(calls.every(call => call.authorization === 'Bearer SYNTHETIC-LOCAL-KEY' && call.body === '' && ['GET','HEAD'].includes(call.method))).toBe(true);
    await consent.locator('#cloud-ai-consent-checkbox').check(); await consent.locator('[data-cloud-ai-consent-action="approve"]').click();
    await expect(panel).toHaveCount(0); await expect(page.getByRole('button',{ name: 'Close chat',exact: true })).toBeVisible(); await settings(page); await page.locator('#settings-nav-ai').click(); await expect(panel.locator('#local-ai-status-text')).toContainText('Connected via Ollama');
    const encrypted = await page.evaluate(() => localStorage.getItem('labcharts-ollama')); expect(encrypted).toBeTruthy(); expect(encrypted).not.toContain('SYNTHETIC-LOCAL-KEY'); expect(encrypted).not.toContain('synthetic-local.test');
    await panel.locator('[data-local-ai-action="toggle-override"]').click();
    if (!await panel.locator('#hw-vram-override-input').isVisible()) await panel.locator('[data-local-ai-action="toggle-override"]').click();
    await panel.locator('#hw-vram-override-input').fill('24'); await panel.locator('[data-local-ai-action="apply-hardware-override"]').click(); await expect(panel.locator('#local-ai-advisor')).toContainText('24 GB');
    await panel.locator('#local-ai-model-select').selectOption('kimi-k2.5:cloud'); await expect(panel).toContainText('Cloud model · provider terms may apply'); await expect(panel).toContainText('off-device');
    expect(await panel.innerHTML()).not.toContain('SYNTHETIC-LOCAL-KEY'); const retained = await panel.locator('#local-ai-apikey-input').elementHandle(); await page.locator('#settings-modal [data-settings-action="close"]').click(); expect(await retained!.evaluate(element => (element as HTMLInputElement).value)).toBe(''); await retained!.dispose();
    server.state.offline = true; await page.close(); const cold = await context.newPage(); cold.on('pageerror', error => errors.push(error.message)); await cold.goto(server.origin+'/app?dev-sw=1');
    await cold.locator('#passphrase-unlock-input').fill('SyntheticStrong1!'); await cold.locator('#passphrase-unlock-input').press('Enter'); await ready(cold); await settings(cold); await cold.locator('#settings-nav-ai').click();
    const saved = cold.locator('[data-local-ai-settings-view]'); await expect(saved.locator('#local-ai-apikey-input')).toHaveValue('SYNTHETIC-LOCAL-KEY'); await expect(saved.locator('#local-ai-url-input')).toHaveValue('https://synthetic-local.test'); await expect(saved.locator('#local-ai-model-select')).toHaveValue('kimi-k2.5:cloud'); await expect(saved.locator('#local-ai-advisor')).toContainText('24 GB'); await expect(saved).toContainText('Cloud model · provider terms may apply');
    await saved.scrollIntoViewIfNeeded(); await cold.screenshot({ path: test.info().outputPath('local-ai-settings-cold.png'),fullPage: true });
    const savedEncrypted = await cold.evaluate(() => localStorage.getItem('labcharts-ollama'));
    await saved.locator('#local-ai-url-input').fill('https://synthetic-local.test/new-server'); await saved.locator('#local-ai-apikey-input').fill('UNSAVED-DRAFT-KEY');
    await cold.evaluate(() => { (window as unknown as { localAiOffline: boolean }).localAiOffline = true; }); await saved.getByRole('button',{ name: 'Test',exact: true }).click(); await expect(saved.locator('#local-ai-status-text')).toContainText('Not connected');
    const stored = await cold.evaluate(() => ({ config: localStorage.getItem('labcharts-ollama'), model: localStorage.getItem('labcharts-ollama-model'), override: localStorage.getItem('labcharts-hw-vram-override') }));
    expect(stored.config).toBe(savedEncrypted); expect(stored.model).toBe('kimi-k2.5:cloud'); expect(stored.override).toBe('24');
    await expect(saved.locator('#local-ai-apikey-input')).toHaveValue('UNSAVED-DRAFT-KEY'); await cold.locator('#settings-modal [data-settings-action="close"]').click();
    await settings(cold); await cold.locator('#settings-nav-ai').click(); await expect(saved.locator('#local-ai-url-input')).toHaveValue('https://synthetic-local.test'); await expect(saved.locator('#local-ai-apikey-input')).toHaveValue('SYNTHETIC-LOCAL-KEY'); expect(errors).toEqual([]);

  } finally { await server.close(); }
});
