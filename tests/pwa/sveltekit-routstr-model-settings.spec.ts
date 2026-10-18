import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { startKitServer } from './kit-server.js';
const artifact = process.env.GETBASED_KIT_ARTIFACT || path.resolve('.local-notes/sveltekit-build');
async function ready(page: Page) {
  await expect(page.locator('html[data-app-ready][data-shell-framework="sveltekit"]')).toBeAttached({ timeout: 30_000 });
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller), { timeout: 30_000 }).toBe(true);
}
async function openRoutstr(page: Page) {
  await expect(page.locator('body')).not.toHaveClass(/\bchat-autostart-reserved\b/, {timeout: 30_000});
  const closeChat = page.getByRole('button', {name: 'Close chat', exact: true});
  if (await closeChat.isVisible()) await closeChat.click();
  await page.locator('[data-shell-action="open-settings"]').click(); await page.locator('#settings-nav-ai').click();
  await expect(page.locator('[data-routstr-model-settings-view]')).toBeVisible();
}
test('static Routstr models retain private and regular choices through unavailable-origin cold launch', async ({ page, context }) => {
  test.setTimeout(120_000);
  await context.addInitScript(() => {
    if (!['http:', 'https:'].includes(location.protocol)) return;
    const original = window.fetch.bind(window);
    const transport = window as unknown as { offlineRoutstrModels: number }; transport.offlineRoutstrModels = 0;
    window.fetch = (input, init) => {
      const url = new URL(input instanceof Request ? input.url : String(input), location.href);
      if (url.origin !== location.origin) {
        if (url.href === 'https://synthetic-routstr.test/v1/models') ++transport.offlineRoutstrModels;
        return Promise.reject(new TypeError('Synthetic external transport unavailable'));
      }
      return original(input, init);
    };
    for (const key of ['emptyTour', 'tour']) localStorage.setItem(`labcharts-default-${key}`, 'completed');
    localStorage.setItem('labcharts-encryption-nudge-dismissed', 'true'); localStorage.setItem('labcharts-analytics-consent-seen', '1');
    localStorage.setItem('labcharts-legal-acceptance', JSON.stringify({ accepted: true, termsVersion: '2026-08-22', privacyVersion: '2026-08-22', policyScope: 'self-hosted-notice', acceptedAt: '2026-10-06T00:00:00Z', appVersion: 'test', location: 'local-test' }));
    if (localStorage.getItem('routstr-model-fixture-seeded')) return;
    localStorage.setItem('routstr-model-fixture-seeded', '1'); localStorage.setItem('labcharts-ai-provider', 'routstr'); localStorage.setItem('labcharts-ai-paused', 'false');
    localStorage.setItem('labcharts-chat-backend', 'direct'); localStorage.setItem('labcharts-routstr-node', 'https://synthetic-routstr.test');
    localStorage.setItem('labcharts-routstr-key', 'sk-synthetic-nonfunctional'); localStorage.setItem('labcharts-routstr-model', 'claude-sonnet-4.6');
    localStorage.setItem('labcharts-routstr-models', JSON.stringify([{ id: 'claude-sonnet-4.6', name: 'Claude' }, { id: 'gpt-6-astra', name: 'GPT' }]));
    localStorage.setItem('labcharts-routstr-private-models', JSON.stringify([{ id: 'tinfoil-gemma4-31b', name: 'Gemma Private' }, { id: 'tinfoil-kimi-k2-6', name: 'Kimi Private' }]));
    localStorage.setItem('labcharts-routstr-model-private', 'tinfoil-kimi-k2-6');
    localStorage.setItem('labcharts-routstr-pricing', JSON.stringify({ 'tinfoil-gemma4-31b': { input: 1, output: 2 } }));
  });
  const server = await startKitServer(artifact), errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto(server.origin + '/app?dev-sw=1'); await ready(page); server.state.offline = true; await openRoutstr(page);
    const panel = page.locator('[data-routstr-model-settings-view]'), select = panel.locator('#routstr-model-select'), toggle = panel.locator('#routstr-private-toggle');
    await expect(select).toHaveValue('claude-sonnet-4.6'); await select.selectOption('gpt-6-astra');
    await expect.poll(() => page.evaluate(() => (window as unknown as { offlineRoutstrModels: number }).offlineRoutstrModels)).toBeGreaterThan(0);
    await toggle.check(); await expect(select).toHaveValue('tinfoil-kimi-k2-6'); await select.selectOption('tinfoil-gemma4-31b');
    await toggle.uncheck(); await expect(select).toHaveValue('gpt-6-astra'); await toggle.check(); await expect(select).toHaveValue('tinfoil-gemma4-31b');
    await expect(panel.locator('#routstr-private-indicator')).toBeVisible(); await expect(panel).toContainText('session, selected model, and billing metadata');
    await expect(panel).toContainText('Web search and images are disabled'); await expect(panel.locator('#routstr-model-pricing')).toContainText('$1.00/M in');
    expect(await page.evaluate(() => ({ regular: localStorage.getItem('labcharts-routstr-model-regular'), private: localStorage.getItem('labcharts-routstr-model-private') }))).toEqual({ regular: 'gpt-6-astra', private: 'tinfoil-gemma4-31b' });
    await page.locator('#settings-modal [data-settings-action="close"]').click(); await page.close();
    const cold = await context.newPage(); cold.on('pageerror', error => errors.push(error.message));
    await cold.goto(server.origin + '/app?dev-sw=1'); await ready(cold); await openRoutstr(cold);
    await expect(cold.locator('#routstr-model-select')).toHaveValue('tinfoil-gemma4-31b'); await expect(cold.locator('#routstr-private-toggle')).toBeChecked();
    await expect(cold.locator('#routstr-model-pricing')).toContainText('$1.00/M in'); await expect(cold.locator('#routstr-private-indicator')).toBeVisible();
    await cold.locator('[data-routstr-model-settings-view]').scrollIntoViewIfNeeded();
    await cold.screenshot({ path: test.info().outputPath('routstr-model-cold.png'), fullPage: true });
    expect(await cold.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).map(registration => new URL(registration.active!.scriptURL).pathname))).toEqual(['/service-worker.js']);
    expect(errors).toEqual([]);
  } finally { await server.close(); }
});
