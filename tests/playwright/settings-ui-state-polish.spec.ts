import { expect, test, type Page } from '@playwright/test';
import { routeHtml } from '../helpers/browser-static-routes.js';

const themes = ['dark', 'light', 'cyberterm', 'glass', 'synth-sunrise', 'neuromancer'];
const states = ['empty', 'loading', 'error', 'long'] as const;
type State = typeof states[number];

// Actual shell and provider component owners with synthetic display states.
// No controller, connection check, credential persistence, or loader retry is
// simulated here; settings-navigation-owner and existing PWA suites cover those.
async function mounted(page: Page) {
  await routeHtml(page, '**/settings-ui-state-polish', '<!doctype html><html lang="en"><head><title>Settings state presentation</title><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/css/modal-shared.css"><link rel="stylesheet" href="/css/settings.css"></head><body><div id="settings-modal-overlay" class="modal-overlay show"><div id="settings-modal" role="dialog" aria-modal="true"></div></div></body></html>');
  await page.goto('/settings-ui-state-polish');
  await page.evaluate(async () => {
    const shell = await import('/js/settings-shell.js');
    const extension = await import('/js/app-extension-runtime.js');
    const ai = await import('/js/ai-settings-component.js');
    const presentation = await import('/js/ai-settings-presentation.js');
    shell.mountSettingsShell(document.getElementById('settings-modal')!, {
      initialTab: 'ai', extensionTabs: extension.renderAppExtensionSettingsSlot('tabs'),
      panels: { displayActive: false, aiActive: true, voiceActive: false, privacyActive: false,
        dataActive: false, wearablesActive: false, agentActive: false, benchmarkEntryEpoch: 1,
        showUsage: true, syncReady: false, messengerReady: false,
        extensionAI: extension.renderAppExtensionSettingsSlot('ai'), extensionPanels: extension.renderAppExtensionSettingsSlot('panels') },
      onNavigateTab: id => {
        shell.selectSettingsShellTab(id);
        for (const panel of document.querySelectorAll<HTMLElement>('.settings-tab-panel')) panel.classList.toggle('active', panel.dataset.tabPanel === id);
      },
    });
    const view = ai.mountAiSettings(document.querySelector<HTMLElement>('[data-ai-settings-host]')!,
      presentation.buildAiSettingsSnapshot({ enabled: true, hideProviders: false, provider: 'custom', backend: 'direct' }),
      { pause: enabled => view.setEnabled(enabled), select: provider => view.setSelected(provider) });
    await document.fonts.ready;
  });
}
async function showState(page: Page, state: State) {
  await page.evaluate(async state => {
    const ai = (await import('/js/ai-settings-component.js')).getAiSettingsView()!;
    const custom = await import('/js/custom-settings-component.js');
    const models = await import('/js/custom-settings-view.js');
    custom.disposeCustomSettings(); ai.getProviderHost()!.replaceChildren();
    ai.setPauseError(state === 'long' ? `Could not update this setting: ${'translation'.repeat(26)}. Long explanatory text with spaces. 合成テキスト確認。` : state === 'error' ? 'AI features could not be updated. Try again.' : '');
    ai.setProviderStatus(state === 'loading' ? 'loading' : state === 'error' ? 'error' : 'ready');
    if (state === 'loading' || state === 'error') return;
    const host = document.createElement('div'); ai.getProviderHost()!.append(host);
    const view = custom.mountCustomSettings(host, { connected: true,
      models: models.buildCustomModelState([], state === 'long' ? 'synthetic/model-' + 'a'.repeat(256) : '') },
      { save: () => {}, remove: () => {}, select: () => {}, apply: () => {} });
    view.setConnection({ url: 'https://synthetic.test/' + (state === 'long' ? 'endpoint'.repeat(38) : 'v1'), key: '' });
    if (state === 'long') view.setSaveState({ pending: false, tone: 'danger', text: 'Connection failed: ' + 'diagnostic'.repeat(29) + '. Use a different endpoint or retry. 合成テキスト。' });
  }, state);
  await expect(page.locator('#ai-provider-panel')).toHaveAttribute('aria-busy', state === 'loading' ? 'true' : 'false');
  if (state === 'loading') await expect(page.getByRole('status').filter({ hasText: 'Loading provider settings...' })).toBeVisible();
  if (state === 'error') await expect(page.getByRole('status').filter({ hasText: 'Provider settings could not load.' })).toBeVisible();
  if (state === 'empty') await expect(page.locator('#custom-manual-model')).toBeVisible();
}
async function settlePresentation(page: Page) {
  await page.evaluate(async () => {
    document.body.getBoundingClientRect(); await document.fonts.ready;
    await Promise.all(document.getAnimations().filter(animation => Number.isFinite(animation.effect?.getComputedTiming().endTime))
      .map(animation => animation.finished.catch(() => {})));
  });
}
async function assertGeometry(page: Page, label: string) {
  await settlePresentation(page);
  const measurements = await page.locator('#settings-modal').evaluate(dialog => {
    const isVisible = (element: Element) => !!element.getClientRects().length;
    const probes = [dialog, ...dialog.querySelectorAll<HTMLElement>('.settings-content, [data-ai-settings-view], [data-custom-settings-view], p, [role="status"], .ai-provider-btn')];
    return { overflowing: probes.filter(isVisible).filter(element => element.scrollWidth > element.clientWidth + 1).map(element => ({ tag: element.tagName, id: element.id, text: element.textContent?.slice(0, 100), scroll: element.scrollWidth, client: element.clientWidth })),
      documentWidth: document.documentElement.scrollWidth, viewport: innerWidth,
      zoom: getComputedStyle(document.documentElement).zoom };
  });
  expect(measurements.overflowing, label + JSON.stringify(measurements)).toEqual([]);
  expect(measurements.documentWidth, label).toBeLessThanOrEqual(measurements.viewport + 1);
  await expect(page.locator('.settings-tabs-bar [aria-selected="true"]')).toHaveCount(1);
  await expect(page.locator('.ai-provider-btn[aria-pressed="true"]')).toHaveCount(1);
}

test('assembled Settings empty/loading/error/long states stay readable in six themes, narrow reflow and enlarged rendering', async ({ page, context }) => {
  test.setTimeout(180_000);
  await context.addInitScript({ path: 'node_modules/axe-core/axe.min.js' });
  await mounted(page);
  for (const theme of themes) {
    await page.evaluate(async theme => { const themes = await import('/js/theme.js'); await themes.loadExtraThemesStylesheet(); themes.setTheme(theme); }, theme);
    for (const state of states) {
      await page.setViewportSize({ width: 320, height: 900 });
      await page.evaluate(() => { document.documentElement.style.zoom = '1'; });
      await showState(page, state); await assertGeometry(page, `${theme}/${state}/320`);
      const violations = await page.locator('#settings-modal').evaluate(async element =>
        (await (window as unknown as { axe: typeof import('axe-core') }).axe.run(element, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } }))
          .violations.map(item => ({ id: item.id, nodes: item.nodes.map(node => ({ target: node.target, summary: node.failureSummary })) })));
      expect(violations, `${theme}/${state}/320`).toEqual([]);
      await page.setViewportSize({ width: 1280, height: 900 });
      // Deliberately CSS zoom stress, NOT browser-chrome zoom or device scale.
      await page.evaluate(() => { document.documentElement.style.zoom = '2'; });
      await assertGeometry(page, `${theme}/${state}/CSS-zoom-2`);
      if (state === 'long' || state === 'empty') {
        const last = page.locator('[data-provider-panel-action="apply-custom-api-model"]');
        await last.focus(); await expect(last).toBeFocused();
        await last.scrollIntoViewIfNeeded(); await expect(last).toBeInViewport();
      }
    }
    await page.evaluate(() => { document.documentElement.style.zoom = '1'; });
    await page.setViewportSize({ width: 640, height: 450 });
    await showState(page, 'long'); await assertGeometry(page, `${theme}/long/640x450-reflow`);
  }
});

test('assembled state updates retain a private draft and keyboard order, then clear it on disposal', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 }); await mounted(page); await showState(page, 'empty');
  const key = page.locator('#custom-key-input'); await key.fill('SYNTHETIC PRIVATE DRAFT'); await key.focus();
  await key.evaluate((element: HTMLInputElement) => element.setSelectionRange(3, 8));
  const draft = await key.elementHandle();
  const stable = await page.evaluate(async () => {
    const ai = (await import('/js/ai-settings-component.js')).getAiSettingsView()!;
    const custom = (await import('/js/custom-settings-component.js')).getCustomSettingsView()!;
    const before = document.getElementById('custom-key-input');
    ai.setPauseError('Synthetic recoverable notice'); ai.setEnabled(false);
    custom.setModels({ ...custom.getModels(), pricing: { text: 'Synthetic updated metadata', tone: 'secondary' } });
    return before === document.getElementById('custom-key-input');
  });
  expect(stable).toBe(true); await expect(key).toHaveValue('SYNTHETIC PRIVATE DRAFT'); await expect(key).toBeFocused();
  expect(await key.evaluate((element: HTMLInputElement) => [element.selectionStart, element.selectionEnd])).toEqual([3, 8]);
  expect(await page.locator('#settings-modal').innerHTML()).not.toContain('SYNTHETIC PRIVATE DRAFT');
  await page.locator('#settings-nav-ai').focus(); await page.keyboard.press('Home'); await expect(page.locator('#settings-nav-display')).toBeFocused();
  await page.keyboard.press('ArrowDown'); await expect(page.locator('#settings-nav-ai')).toBeFocused();
  await page.locator('[data-provider="custom"]').focus(); await page.keyboard.press('Tab');
  await expect(page.locator('[data-provider="ollama"]')).toBeFocused(); await page.keyboard.press('Shift+Tab');
  await expect(page.locator('[data-provider="custom"]')).toBeFocused();
  await page.keyboard.press('Space'); await expect(page.locator('[data-provider="custom"]')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('[data-provider="cli"]').focus(); await page.keyboard.press('Enter'); await expect(page.locator('[data-provider="cli"]')).toHaveAttribute('aria-pressed', 'true');
  await page.setViewportSize({ width: 320, height: 900 });
  await expect(page.locator('[role="tablist"]')).toHaveAttribute('aria-orientation', 'horizontal');
  await page.locator('#settings-nav-ai').focus(); await page.keyboard.press('ArrowRight'); await expect(page.locator('#settings-nav-voice')).toBeFocused();
  await page.keyboard.press('ArrowLeft'); await expect(page.locator('#settings-nav-ai')).toBeFocused();
  await page.evaluate(async () => {
    (await import('/js/custom-settings-component.js')).disposeCustomSettings();
    (await import('/js/ai-settings-component.js')).disposeAiSettings();
    (await import('/js/settings-shell.js')).disposeSettingsShell();
  });
  expect(await draft!.evaluate((element: HTMLInputElement) => element.value)).toBe(''); await draft!.dispose();
});
