import { expect, test } from '@playwright/test';
import { routeHtml } from '../helpers/browser-static-routes.js';
import type { NutritionAISettingsSnapshot } from '../../js/nutrition-ai-settings-contract.js';

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

  test('owned meal-model Settings retain keyboard focus, saved choices and accessible theme layouts', async ({ page, context, browserName }) => {
    test.setTimeout(120_000);
    await context.addInitScript({ path: 'node_modules/axe-core/axe.min.js' });
    await routeHtml(page, '**/meal-model-owned-test', '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/css/settings.css"></head><body><main class="settings-modal"><div id="meal-model-host"></div></main></body></html>');
    await page.goto('/meal-model-owned-test');
    const initial: NutritionAISettingsSnapshot = {
      selectedValue: '', automaticLabel: 'Follow chat assistant — Vision A', automaticDisabled: false, providerDisplay: 'Local AI',
      groups: [{ label: 'Local AI vision models', options: [{ value: 'route-b', label: 'Vision B — Local · no token charge' }] }],
    };
    await page.evaluate(async initial => {
      const component = await import('/js/nutrition-ai-settings-component.js');
      component.mountNutritionAISettings(document.getElementById('meal-model-host')!, initial);
    }, initial);
    const panel = page.locator('[data-nutrition-ai-view]');
    const select = panel.locator('select');
    await expect(select.locator('option')).toHaveCount(2);
    await select.focus();
    await expect(select).toBeFocused();
    // Firefox commits an arrow change directly. Chromium's customizable picker
    // and the WPE native picker first open, then commit with Enter.
    const keys = browserName === 'firefox' ? ['ArrowDown'] : ['Space','ArrowDown','Enter'];
    for (const key of keys) await page.keyboard.press(key);
    await expect(select).toHaveValue('route-b');
    const summary = panel.locator('summary');
    await summary.focus(); await page.keyboard.press('Enter');
    await expect(panel.locator('details')).toHaveAttribute('open', '');
    await select.focus();
    await page.evaluate(async initial => {
      (window as unknown as { heldMealControl: Element | null }).heldMealControl = document.activeElement;
      (await import('/js/nutrition-ai-settings-component.js')).getNutritionAISettingsView()!.refresh({ ...initial, selectedValue: 'route-b', automaticDisabled: true });
    }, initial);
    await expect(select).toBeFocused();
    expect(await page.evaluate(() => (window as unknown as { heldMealControl: Element | null }).heldMealControl === document.activeElement)).toBe(true);
    await expect(panel.locator('details')).toHaveAttribute('open', '');
    for (const theme of ['dark','light','cyberterm','glass','synth-sunrise','neuromancer']) {
      await page.evaluate(async theme => { const themes = await import('/js/theme.js'); await themes.loadExtraThemesStylesheet(); themes.setTheme(theme); }, theme);
      for (const width of [1280,700,390,320]) {
        await page.setViewportSize({ width, height: 900 });
        expect(await panel.evaluate(e => e.scrollWidth <= e.clientWidth), `${theme} ${width}`).toBe(true);
        const violations = await panel.evaluate(async e => (await (window as unknown as { axe: typeof import('axe-core') }).axe.run(e, { runOnly: { type: 'tag', values: ['wcag2a','wcag2aa','wcag21aa'] } })).violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => ({ target: n.target, summary: n.failureSummary })) })));
        expect(violations, `${theme} ${width}`).toEqual([]);
        expect(await select.evaluate(e => e.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
        expect(await summary.evaluate(e => e.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
      }
    }
    await page.evaluate(async () => (await import('/js/nutrition-ai-settings-component.js')).disposeNutritionAISettings());
    await expect(panel).toHaveCount(0);
  });
});
