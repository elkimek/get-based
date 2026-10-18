import { expect, test } from '@playwright/test';
import { routeHtml } from '../helpers/browser-static-routes.js';
// The 44px target contract applies to coarse pointer input. Desktop density
// is checked against the original UI in sveltekit-settings-density.spec.ts.
test.use({ hasTouch: true });

test('owned Custom API fields, model drafts and accessible states remain private and stable', async ({ page, context }) => {
  test.setTimeout(180_000); await context.addInitScript({ path: 'node_modules/axe-core/axe.min.js' });
  await routeHtml(page, '**/custom-owned-test', '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/css/settings.css"></head><body><main id="settings-modal" class="settings-modal"><div id="ai-provider-panel"><div data-custom-settings-host></div></div></main></body></html>');
  await page.goto('/custom-owned-test');
  await page.evaluate(async () => {
    const panel = await import('/js/custom-settings-component.js'), models = await import('/js/custom-settings-view.js');
    const view = panel.mountCustomSettings(document.querySelector<HTMLElement>('[data-custom-settings-host]')!, { connected: true, models: models.buildCustomModelState([{ id: 'a', name: 'Alpha' }, { id: 'b', name: 'Beta' }], 'a') }, { save: () => {}, remove: () => {}, select: () => {}, apply: () => {} });
    view.setConnection({ url: 'https://synthetic.test/v1', key: 'PRIVATE-KEY' });
  });
  const panel = page.locator('[data-custom-settings-view]'), manual = panel.locator('#custom-manual-model'); await manual.fill('draft-model'); await manual.focus();
  const stable = await page.evaluate(async () => { const view = (await import('/js/custom-settings-component.js')).getCustomSettingsView()!, input = document.getElementById('custom-manual-model'); view.setModels({ ...view.getModels(), pricing: { text: '', tone: 'secondary' } }); return input === document.getElementById('custom-manual-model'); });
  expect(stable).toBe(true); await expect(manual).toHaveValue('draft-model'); await expect(manual).toBeFocused(); expect(await panel.innerHTML()).not.toContain('PRIVATE-KEY');
  for (const theme of ['dark','light','cyberterm','glass','synth-sunrise','neuromancer']) {
    await page.evaluate(async theme => { const themes = await import('/js/theme.js'); await themes.loadExtraThemesStylesheet(); themes.setTheme(theme); }, theme);
    for (const state of ['disconnected','connected','pending','error','manual','unavailable']) {
      await page.evaluate(async state => { const view = (await import('/js/custom-settings-component.js')).getCustomSettingsView()!, models = await import('/js/custom-settings-view.js'); view.refresh({ connected: state !== 'disconnected', models: models.buildCustomModelState(state === 'manual' ? [] : [{ id: 'a', name: 'Alpha' }, { id: 'b', name: 'Beta' }], state === 'unavailable' ? 'outside-model' : 'a') }); view.setSaveState({ pending: state === 'pending', text: state === 'error' ? 'Connection could not be verified. Retry safely.' : state === 'disconnected' ? 'Not connected' : 'Connected', tone: state === 'error' ? 'danger' : 'secondary' }); }, state);
      for (const width of [1280,700,390,320]) {
        await page.setViewportSize({ width, height: 900 }); expect(await panel.evaluate(element => element.scrollWidth <= element.clientWidth), `${theme} ${state} ${width}`).toBe(true);
        const violations = await panel.evaluate(async element => (await (window as unknown as { axe: typeof import('axe-core') }).axe.run(element, { runOnly: { type: 'tag', values: ['wcag2a','wcag2aa','wcag21aa'] } })).violations.map(item => ({ id: item.id, nodes: item.nodes.map(node => ({ target: node.target, summary: node.failureSummary })) })));
        expect(violations, `${theme} ${state} ${width}`).toEqual([]);
      }
      for (const control of await panel.locator('button:visible,input:not([hidden]):visible,select:visible').all()) expect(await control.evaluate(element => element.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
    }
  }
  const held = await panel.locator('#custom-key-input').elementHandle(); await page.evaluate(async () => (await import('/js/settings-provider-bridge.js')).disposeSettingsProviderPanels()); expect(await held!.evaluate(element => (element as HTMLInputElement).value)).toBe(''); await held!.dispose(); await expect(panel).toHaveCount(0);
});
