import { expect, test } from './coverage-fixture.js';
import { routeHtml } from '../helpers/browser-static-routes.js';

test.describe('AI chooser touch targets', () => {
  test.use({ hasTouch: true });

test('AI chooser keeps accessible provider controls across themes and narrow layouts', async ({ page, context }) => {
  test.setTimeout(150_000);
  await context.addInitScript({ path: 'node_modules/axe-core/axe.min.js' });
  await routeHtml(page, '**/ai-settings-owned-test', '<!doctype html><html lang="en"><head><title>AI settings</title><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/css/settings.css"></head><body><main id="settings-modal" class="settings-modal" style="width:min(100%,610px)"><div data-ai-settings-host></div></main></body></html>');
  await page.goto('/ai-settings-owned-test');
  await page.evaluate(async () => {
    const component = await import('/js/ai-settings-component.js');
    const { buildAiSettingsSnapshot } = await import('/js/ai-settings-presentation.js');
    const view = component.mountAiSettings(document.querySelector<HTMLElement>('[data-ai-settings-host]')!, buildAiSettingsSnapshot({ enabled: true, hideProviders: false, provider: 'custom', backend: 'codex' }), {
      pause: enabled => view.setEnabled(enabled), select: provider => view.setSelected(provider),
    });
    view.setProviderStatus('ready');
  });
  const panel = page.locator('[data-ai-settings-view]');
  for (const theme of ['dark','light','cyberterm','glass','synth-sunrise','neuromancer']) {
    await page.evaluate(async theme => { const themes = await import('/js/theme.js'); await themes.loadExtraThemesStylesheet(); themes.setTheme(theme); }, theme);
    for (const width of [1280,700,390,320]) {
      await page.setViewportSize({ width, height: 900 });
      const label = `${theme}/${width}`;
      expect(await panel.evaluate(element => element.scrollWidth <= element.clientWidth),label).toBe(true);
      const controls = panel.locator('button:visible,input:visible');
      await expect(controls).toHaveCount(8);
      for (const control of await controls.all()) {
        const bounds = await control.boundingBox();
        expect(bounds?.height,label).toBeGreaterThanOrEqual(44);
        expect(bounds?.width,label).toBeGreaterThanOrEqual(44);
        expect(await control.evaluate(element => element.scrollWidth <= element.clientWidth + 1),label).toBe(true);
      }
      if (width > 720) expect(await panel.locator('button').evaluateAll(buttons => new Set(buttons.map(button => Math.round(button.getBoundingClientRect().top))).size),label).toBe(1);
      const violations = await panel.evaluate(async element => (await (window as unknown as { axe: typeof import('axe-core') }).axe.run(element, { runOnly: { type: 'tag', values: ['wcag2a','wcag2aa','wcag21aa'] } })).violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => n.target) })));
      expect(violations,label).toEqual([]);
    }
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.locator('#settings-modal').evaluate(element => { element.style.width = '500px'; });
  expect(await panel.locator('button').evaluateAll(buttons => new Set(buttons.map(button => Math.round(button.getBoundingClientRect().top))).size)).toBe(4);
  expect(await panel.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  await page.locator('#settings-modal').evaluate(element => { element.style.width = 'min(100%,610px)'; });
  const cli = panel.locator('[data-provider="cli"]');
  await cli.focus(); await cli.press('Enter'); await expect(cli).toHaveAttribute('aria-pressed','true');
  const ppq = panel.locator('[data-provider="ppq"]');
  await ppq.focus(); await ppq.press('Space'); await expect(ppq).toHaveAttribute('aria-pressed','true');
  await expect(cli).toHaveAttribute('aria-pressed','false');
  await page.evaluate(async () => (await import('/js/theme.js')).setTheme('dark'));
  await page.setViewportSize({ width: 390, height: 900 });
  await page.screenshot({ path: test.info().outputPath('ai-settings-mobile.png'), fullPage: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.screenshot({ path: test.info().outputPath('ai-settings-desktop.png'), fullPage: true });
});

});

test('Settings keeps extension interception, latest selection and pause persistence', async ({ page }) => {
  await page.route('**/api/local-agents*', route => route.fulfill({ status: 404, contentType: 'application/json', body: '{}' }));
  await page.route(/^http:\/\/127\.0\.0\.1:83(?:2[4-9]|3[01])\//, route => route.fulfill({ status: 404, contentType: 'application/json', body: '{}' }));
  await page.addInitScript(() => {
    localStorage.setItem('labcharts-default-emptyTour','completed'); localStorage.setItem('labcharts-default-tour','completed');
  });
  await page.goto('/app');
  await page.evaluate(async () => {
    (window as unknown as { endTour?: () => unknown }).endTour?.();
    await (await import('/js/settings-loader.js')).openSettingsModal('ai');
    const { configureAppExtension } = await import('/js/app-extension-runtime.js');
    configureAppExtension({ id: 'owned-settings-test', settings: { handleAction: context => {
      if (context.action !== 'switch-ai-provider') return false;
      document.body.dataset.extensionButton = (context.actionEl as HTMLButtonElement).dataset.provider;
      return true;
    } } });
  });
  const current = await page.evaluate(async () => (await import('/js/api.js')).getAIProvider());
  await page.locator('[data-provider="custom"]').click();
  await expect(page.locator('body')).toHaveAttribute('data-extension-button','custom');
  expect(await page.evaluate(async () => (await import('/js/api.js')).getAIProvider())).toBe(current);
  await page.evaluate(async () => {
    const { configureAppExtension } = await import('/js/app-extension-runtime.js');
    configureAppExtension({ id: 'owned-settings-test', settings: { handleAction: context => {
      if (context.action !== 'switch-ai-provider') return false;
      if ((context.actionEl as HTMLButtonElement).dataset.provider !== 'custom') return false;
      return new Promise<boolean>(resolve => { (window as unknown as { releaseSelection: () => void }).releaseSelection = () => resolve(false); });
    } } });
  });
  await page.locator('[data-provider="custom"]').click();
  await page.locator('[data-provider="cli"]').click();
  await expect(page.locator('[data-cli-agent-settings-view]')).toBeVisible();
  await page.evaluate(() => (window as unknown as { releaseSelection: () => void }).releaseSelection());
  await expect(page.locator('[data-provider="cli"]')).toHaveAttribute('aria-pressed','true');
  expect(await page.evaluate(async () => (await import('/js/api.js')).getAIProvider())).toBe(current);
  const toggle = page.locator('#ai-pause-toggle');
  await toggle.uncheck(); await expect(toggle).not.toBeChecked();
  expect(await page.evaluate(() => localStorage.getItem('labcharts-ai-paused'))).toBe('true');
  await page.evaluate(async () => { const settings = await import('/js/settings.js'); settings.closeSettingsModal(); await settings.openSettingsModal('ai'); });
  await expect(toggle).not.toBeChecked();
  await toggle.check(); expect(await page.evaluate(() => localStorage.getItem('labcharts-ai-paused'))).toBe('false');
    const activeColor = await page.locator('.ai-provider-btn[aria-pressed="true"]').evaluate(button => getComputedStyle(button).backgroundColor);
    await expect.poll(() => page.locator('#ai-pause-toggle').evaluate(input => getComputedStyle(input.nextElementSibling!).backgroundColor)).toBe(activeColor);
  await page.locator('[data-provider="custom"]').click();
  await page.locator('#settings-modal [data-settings-action="close"]').click();
  await page.evaluate(async () => { await (await import('/js/settings-loader.js')).openSettingsModal('ai'); });
  await page.evaluate(() => (window as unknown as { releaseSelection: () => void }).releaseSelection());
  await expect(page.locator(`.ai-provider-btn[data-provider="${current}"]`)).toHaveAttribute('aria-pressed','true');
  expect(await page.evaluate(async () => (await import('/js/api.js')).getAIProvider())).toBe(current);
  await page.evaluate(async () => {
    (await import('/js/app-extension-runtime.js')).configureAppExtension({ id: 'owned-settings-test', settings: { getPolicy: () => ({ hideProviderSettings: true }) } });
    await (await import('/js/settings.js')).openSettingsModal('ai');
  });
  await expect(page.locator('#ai-provider-settings')).toBeHidden();
  await expect(toggle).toBeVisible();
  await page.evaluate(async () => { (await import('/js/app-extension-runtime.js')).configureAppExtension(null); });
});
