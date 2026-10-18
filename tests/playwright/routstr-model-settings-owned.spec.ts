import { expect, test } from '@playwright/test';
import { routeHtml } from '../helpers/browser-static-routes.js';
import type { RoutstrModelSettingsSnapshot } from '../../js/routstr-model-settings-contract.js';
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

  test('owned Routstr models preserve focused selectors and private disclosures in accessible theme layouts', async ({ page, context }) => {
    test.setTimeout(150_000);
    await context.addInitScript({ path: 'node_modules/axe-core/axe.min.js' });
    await routeHtml(page, '**/routstr-model-owned-test', '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/css/settings.css"></head><body><main id="settings-modal" class="settings-modal"><div id="owned-model-host"></div></main></body></html>');
    await page.goto('/routstr-model-owned-test');
    const initial: RoutstrModelSettingsSnapshot = { connected: true,
      models: { selectedModel: 'tinfoil-a', modelDisplay: 'Private A', groups: [{ label: '', options: [{ value: 'tinfoil-a', label: 'Private A' }, { value: 'tinfoil-b', label: 'Private B' }] }], pricing: { text: '$1.00/M in · $2.00/M out', tone: 'secondary' } },
      mode: { enabled: true, available: true, active: true } };
    await page.evaluate(async initial => (await import('/js/routstr-model-settings-component.js')).mountRoutstrModelSettings(document.getElementById('owned-model-host')!, initial), initial);
    const panel = page.locator('[data-routstr-model-settings-view]'), select = panel.locator('select');
    await select.focus(); await page.evaluate(async initial => (await import('/js/routstr-model-settings-component.js')).getRoutstrModelSettingsView()!.setModels({ ...initial.models, selectedModel: 'tinfoil-b' }), initial);
    await expect(select).toBeFocused(); await expect(select).toHaveValue('tinfoil-b');
    for (const theme of ['dark', 'light', 'cyberterm', 'glass', 'synth-sunrise', 'neuromancer']) {
      await page.evaluate(async theme => {
        const themes = await import('/js/theme.js'); await themes.loadExtraThemesStylesheet();
        if (await themes.setTheme(theme) !== true) throw new Error('Requested theme failed to load: ' + theme);
        const attribute = document.documentElement.getAttribute('data-theme');
        if (themes.getTheme() !== theme || attribute !== (theme === 'dark' ? null : theme)) throw new Error('Requested theme did not become current: ' + theme);
        await document.fonts.ready;
      }, theme);
      for (const state of ['private', 'regular', 'missing-catalog', 'unconfigured', 'saved-unavailable']) {
        await page.evaluate(async ({ state, initial }) => {
          const view = (await import('/js/routstr-model-settings-component.js')).getRoutstrModelSettingsView()!;
          const missing = state === 'missing-catalog', regular = state === 'regular';
          view.refresh({ ...initial, connected: state !== 'unconfigured',
            models: { ...initial.models, groups: missing || state === 'unconfigured' ? [] : initial.models.groups, selectedModel: state === 'saved-unavailable' ? 'tinfoil-saved/unavailable' : initial.models.selectedModel },
            mode: { enabled: !regular, available: !missing, active: !regular && !missing && state !== 'saved-unavailable' } });
        }, { state, initial });
        for (const width of [1280, 700, 390, 320]) {
          await page.setViewportSize({ width, height: 900 });
          expect(await panel.evaluate(element => element.scrollWidth <= element.clientWidth), `${theme} ${state} ${width}`).toBe(true);
          const violations = await panel.evaluate(async element => (await (window as unknown as { axe: typeof import('axe-core') }).axe.run(element, { runOnly: { type: 'tag', values: ['wcag2a','wcag2aa','wcag21aa'] } })).violations.map(item => ({ id: item.id, nodes: item.nodes.map(node => ({ target: node.target, summary: node.failureSummary })) })));
          expect(violations, `${theme} ${state} ${width}`).toEqual([]);
          const controls = await panel.locator('select:visible,#routstr-private-toggle').evaluateAll(elements => elements.map(element => ({ tag: element.tagName, id: element.id, height: element.getBoundingClientRect().height })));
          for (const control of controls) expect(control.height, `${theme} ${state} ${width} ${control.tag}#${control.id}`).toBeGreaterThanOrEqual(44);
        }
      }
    }
    await page.evaluate(async () => (await import('/js/routstr-model-settings-component.js')).disposeRoutstrModelSettings());
    await expect(panel).toHaveCount(0);
  });
});
