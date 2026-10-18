import { expect, test } from '@playwright/test';
import { routeHtml } from '../helpers/browser-static-routes.js';
import type { PpqSettingsSnapshot } from '../../js/ppq-settings-contract.js';
// Dense fine-pointer controls retain their native sizing; touch targets use the coarse-pointer styles.
test.describe('coarse-pointer touch targets', () => {
  test.use({ hasTouch: true });
  test.beforeEach(async ({ page }) => {
    expect(await page.evaluate(() => ({
      coarse: matchMedia('(pointer: coarse)').matches,
      fine: matchMedia('(pointer: fine)').matches,
      touch: navigator.maxTouchPoints > 0,
    }))).toEqual({ coarse: true, fine: false, touch: true });
  });

  test('owned PPQ Settings preserve recovery and payment states with accessible theme layouts', async ({ page, context }) => {
    test.setTimeout(180_000);
    await context.addInitScript({ path: 'node_modules/axe-core/axe.min.js' });
    await routeHtml(page, '**/ppq-owned-test', '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/css/settings.css"></head><body><main id="settings-modal" class="settings-modal"><div id="owned-provider-host"></div></main></body></html>');
    await page.goto('/ppq-owned-test');
    const initial: PpqSettingsSnapshot = {
      connected: true,
      models: { selectedModel: 'private/a', modelDisplay: 'Private A', groups: [{ label: '', options: [{ value: 'private/a', label: 'Private A' }, { value: 'private/b', label: 'Private B' }] }], pricing: { text: '$1.00/M in · $2.00/M out', tone: 'secondary' } },
      mode: { enabled: true, available: true, active: true },
    };
    await page.evaluate(async initial => (await import('/js/ppq-settings-component.js')).mountPpqSettings(document.getElementById('owned-provider-host')!, initial).setStoredKey('synthetic-private-key'), initial);
    const panel = page.locator('[data-ppq-settings-view]'); const input = panel.locator('#ppq-key-input'); const select = panel.locator('#ppq-model-select');
    await input.fill('edited-synthetic-key'); await select.focus();
    await page.evaluate(async initial => (await import('/js/ppq-settings-component.js')).getPpqSettingsView()!.setModels({ ...initial.models, selectedModel: 'private/b' }), initial);
    await expect(select).toBeFocused(); await expect(input).toHaveValue('edited-synthetic-key'); await expect(select).toHaveValue('private/b');
    for (const theme of ['dark', 'light', 'cyberterm', 'glass', 'synth-sunrise', 'neuromancer']) {
      await page.evaluate(async theme => {
        const themes = await import('/js/theme.js'); await themes.loadExtraThemesStylesheet();
        if (await themes.setTheme(theme) !== true) throw new Error('Requested theme failed to load: ' + theme);
        if (themes.getTheme() !== theme || document.documentElement.getAttribute('data-theme') !== (theme === 'dark' ? null : theme)) throw new Error('Requested theme did not become current: ' + theme);
        await document.fonts.ready;
      }, theme);
      for (const mode of ['private', 'missing-catalog', 'unconfigured', 'saved-unavailable', 'account', 'picker', 'custom', 'pending', 'invoice', 'success', 'error']) {
        await page.evaluate(async ({ mode, initial }) => {
          const view = (await import('/js/ppq-settings-component.js')).getPpqSettingsView()!;
          view.hideAccount(); view.clearPayment();
          view.refresh({ ...initial, connected: mode !== 'unconfigured', mode: { enabled: true, available: mode !== 'missing-catalog', active: mode !== 'missing-catalog' } });
          view.setSaveState({ pending: mode === 'pending', text: mode === 'pending' ? 'Validating...' : '✓ Connected', tone: 'success' });
          view.setBalance({ text: 'Balance: $0.25', tone: 'warning' });
          view.setTopup({ open: ['picker', 'custom', 'pending', 'invoice', 'success', 'error'].includes(mode), phase: ['pending', 'invoice', 'success', 'error'].includes(mode) ? mode as 'pending' | 'invoice' | 'success' | 'error' : 'picker', method: 'xmr', amount: 5, custom: mode === 'custom', status: { text: mode === 'error' ? 'Could not create this invoice. Please retry.' : 'Waiting for payment… 1:59', tone: mode === 'error' ? 'danger' : 'secondary' } });
          if (mode === 'saved-unavailable') view.setModels({ ...initial.models, selectedModel: 'saved/unavailable-synthetic-model' });
          if (mode === 'account') view.showAccount({ apiKey: 'synthetic-long-private-api-key-for-recovery-layout-check', creditId: 'synthetic-long-credit-id-for-recovery-layout-check', activated: false });
          if (mode === 'invoice') view.showPayment({ method: 'xmr', amount: 5, paymentText: 'synthetic-long-payment-address-for-private-display-and-layout', qrImage: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="140" height="140"%3E%3Crect width="140" height="140" fill="white"/%3E%3C/svg%3E', walletUri: 'monero:synthetic-address', cryptoAmount: 0.02 });
        }, { mode, initial });
        if (mode === 'invoice') await panel.locator('summary').click();
        for (const width of [1280, 700, 390, 320]) {
          await page.setViewportSize({ width, height: 900 });
          expect(await panel.evaluate(element => element.scrollWidth <= element.clientWidth), `${theme} ${mode} ${width}`).toBe(true);
          const violations = await panel.evaluate(async element => (await (window as unknown as { axe: typeof import('axe-core') }).axe.run(element, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } })).violations.map(item => ({ id: item.id, nodes: item.nodes.map(node => ({ target: node.target, summary: node.failureSummary })) })));
          expect(violations, `${theme} ${mode} ${width}`).toEqual([]);
          const controls = await panel.locator('button:visible,summary:visible,#ppq-private-toggle:visible').evaluateAll(elements => elements.map(element => ({id: element.id, tag: element.tagName, height: element.getBoundingClientRect().height})));
          for (const [index, control] of controls.entries()) expect(control.height, `${theme} ${mode} ${width} control ${index} ${control.tag}#${control.id}`).toBeGreaterThanOrEqual(44);
        }
        expect(await panel.locator('[data-clipboard-text]').count()).toBe(0);
      }
    }
    await expect(input).toHaveAttribute('type', 'password'); await expect(input).toHaveAttribute('autocomplete', 'new-password');
    await page.evaluate(async () => { const input = document.getElementById('ppq-key-input') as HTMLInputElement; (await import('/js/ppq-settings-component.js')).disposePpqSettings(); if (input.value) throw new Error('Private field retained after close'); });
    await expect(panel).toHaveCount(0);
  });
});
