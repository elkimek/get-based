import path from 'node:path';
import { expect, test } from '@playwright/test';
import { startKitServer } from './kit-server.js';
const artifact = process.env.GETBASED_KIT_ARTIFACT || path.resolve('.local-notes/sveltekit-build');

test('static AI chooser preserves all providers and feature pause through cached cold launch', async ({ page, context }) => {
  test.setTimeout(120_000);
  await context.addInitScript(() => {
    if (!['http:','https:'].includes(location.protocol)) return;
    const original = window.fetch.bind(window);
    window.fetch = (input, options) => {
      const url = new URL(input instanceof Request ? input.url : String(input), location.href);
      if (url.pathname === '/api/local-agents' || /^http:\/\/(?:127\.0\.0\.1|localhost):(?:83\d\d|11434|1234)/.test(url.origin)) return Promise.resolve(Response.json({}, { status: 404 }));
      // A controlling WebKit worker may bypass Playwright routing. The provider
      // chooser exercises an unavailable external transport, never live nodes.
      if (['http:', 'https:'].includes(url.protocol) && url.origin !== location.origin) {
        return Promise.resolve(Response.json({data: []}, {status: 503}));
      }
      return original(input, options);
    };
    for (const name of ['emptyTour','tour']) localStorage.setItem(`labcharts-default-${name}`,'completed');
    localStorage.setItem('labcharts-encryption-nudge-dismissed','true'); localStorage.setItem('labcharts-analytics-consent-seen','1');
    localStorage.setItem('labcharts-legal-acceptance',JSON.stringify({ accepted:true,termsVersion:'2026-08-22',privacyVersion:'2026-08-22',policyScope:'self-hosted-notice',acceptedAt:'2026-10-06T00:00:00Z',appVersion:'test',location:'local-test' }));
  });
  const server = await startKitServer(artifact), errors: string[] = [], externalRequests: string[] = [];
  context.on('request', request => {
    const url = new URL(request.url());
    if (['http:', 'https:'].includes(url.protocol) && url.origin !== server.origin) externalRequests.push(url.origin + url.pathname);
  });
  page.on('pageerror',error => errors.push(error.message));
  const open = async (target: typeof page) => {
    await expect(target.locator('body')).not.toHaveClass(/\bchat-autostart-reserved\b/, { timeout: 30_000 });
    const closeChat = target.getByRole('button', { name: 'Close chat', exact: true });
    if (await closeChat.isVisible()) await closeChat.click();
    await target.locator('[data-shell-action="open-settings"]').click();
    await target.locator('#settings-nav-ai').click();
    await expect(target.locator('[data-ai-settings-view]')).toBeVisible();
  };
  try {
    await page.goto(server.origin + '/app?dev-sw=1');
    await expect(page.locator('html[data-app-ready][data-shell-framework="sveltekit"]')).toBeAttached({ timeout: 30_000 });
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
    await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
    server.state.offline = true;
    await open(page);
    const expected = [
      ['ppq','ppq'], ['routstr','routstr'], ['openrouter','openrouter'], ['venice','venice'], ['custom','custom'], ['ollama','local-ai'], ['cli','cli-agent'],
    ];
    for (const [provider, owner] of expected) {
      await page.locator(`.ai-provider-btn[data-provider="${provider}"]`).click();
      await expect(page.locator(`[data-${owner}-settings-view]`)).toBeVisible();
      await expect(page.locator('.ai-provider-btn[aria-pressed="true"]')).toHaveCount(1);
      await expect(page.locator(`.ai-provider-btn[data-provider="${provider}"]`)).toHaveAttribute('aria-pressed','true');
      if (provider !== 'cli') expect(await page.evaluate(() => localStorage.getItem('labcharts-ai-provider'))).toBe(provider);
    }
    await page.locator('[data-provider="custom"]').click();
    await expect(page.locator('[data-custom-settings-view]')).toBeVisible();
    await page.locator('#custom-key-input').fill('PRIVATE UNSAVED DRAFT');
    await page.locator('#ai-pause-toggle').uncheck();
    await expect(page.locator('#custom-key-input')).toHaveValue('PRIVATE UNSAVED DRAFT');
    expect(await page.evaluate(() => localStorage.getItem('labcharts-ai-paused'))).toBe('true');
    await page.locator('#settings-modal [data-settings-action="close"]').click();
    await page.close();
    const cold = await context.newPage(); cold.on('pageerror',error => errors.push(error.message));
    await cold.goto(server.origin + '/app?dev-sw=1');
    await expect(cold.locator('html[data-app-ready][data-shell-framework="sveltekit"]')).toBeAttached({ timeout: 30_000 });
    await open(cold);
    await expect(cold.locator('[data-provider="custom"]')).toHaveAttribute('aria-pressed','true');
    await expect(cold.locator('#custom-key-input')).toHaveValue('');
    await expect(cold.locator('#ai-pause-toggle')).not.toBeChecked();
    await cold.locator('#ai-pause-toggle').check();
    expect(await cold.evaluate(() => localStorage.getItem('labcharts-ai-paused'))).toBe('false');
    const activeColor = await cold.locator('.ai-provider-btn[aria-pressed="true"]').evaluate(button => getComputedStyle(button).backgroundColor);
    await expect.poll(() => cold.locator('#ai-pause-toggle').evaluate(input => getComputedStyle(input.nextElementSibling!).backgroundColor)).toBe(activeColor);
    expect(errors).toEqual([]);
    expect(externalRequests).toEqual([]);
    await cold.screenshot({ path: test.info().outputPath('ai-settings-cold.png') });
  } finally { await server.close(); }
});
