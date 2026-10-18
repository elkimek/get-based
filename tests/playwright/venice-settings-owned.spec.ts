import { expect, test } from '@playwright/test';
import { routeHtml } from '../helpers/browser-static-routes.js';
import type { VeniceSettingsSnapshot } from '../../js/venice-settings-contract.js';
// The 44px target contract applies to coarse pointer input. Desktop density
// is checked against the original UI in sveltekit-settings-density.spec.ts.
test.use({ hasTouch: true });

test('owned Venice Settings preserve private fields, encryption disclosure and accessible theme layouts', async ({ page, context }) => {
  test.setTimeout(150_000);
  await context.addInitScript({ path: 'node_modules/axe-core/axe.min.js' });
  await routeHtml(page, '**/venice-owned-test', '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/css/settings.css"></head><body><main id="settings-modal" class="settings-modal"><div id="owned-provider-host"></div></main></body></html>');
  await page.goto('/venice-owned-test');
  const initial: VeniceSettingsSnapshot = {
    connected: true,
    models: { selectedModel: 'e2ee-a', modelDisplay: 'Encrypted A', groups: [{ label: '', options: [{ value: 'e2ee-a', label: 'Encrypted A' }, { value: 'e2ee-b', label: 'Encrypted B' }] }], pricing: { text: '$1.00/M in · $2.00/M out', tone: 'secondary' } },
    mode: { enabled: true, available: true, active: true },
  };
  await page.evaluate(async initial => {
    const component = await import('/js/venice-settings-component.js');
    component.mountVeniceSettings(document.getElementById('owned-provider-host')!, initial).setStoredKey('synthetic-private-key');
  }, initial);
  const panel = page.locator('[data-venice-settings-view]'); const input = panel.locator('#venice-key-input'); const select = panel.locator('#venice-model-select');
  await input.fill('edited-synthetic-key'); await panel.locator('summary').click(); await select.focus();
  await page.evaluate(async initial => (await import('/js/venice-settings-component.js')).getVeniceSettingsView()!.setModels({ ...initial.models, selectedModel: 'e2ee-b' }), initial);
  await expect(select).toBeFocused(); await expect(input).toHaveValue('edited-synthetic-key'); await expect(select).toHaveValue('e2ee-b');
  await expect(panel.locator('details')).toHaveAttribute('open', '');
  for (const theme of ['dark', 'light', 'cyberterm', 'glass', 'synth-sunrise', 'neuromancer']) {
    await page.evaluate(async theme => { const themes = await import('/js/theme.js'); await themes.loadExtraThemesStylesheet(); themes.setTheme(theme); }, theme);
    for (const mode of ['encrypted', 'regular', 'missing-catalog', 'failure', 'unconfigured', 'saved-unavailable']) {
      await page.evaluate(async ({ mode, initial }) => {
        const view = (await import('/js/venice-settings-component.js')).getVeniceSettingsView()!;
        view.refresh({ ...initial, connected: mode !== 'unconfigured', mode: { enabled: mode !== 'regular', available: mode !== 'missing-catalog', active: mode !== 'regular' } });
        view.setSaveState({ pending: mode === 'missing-catalog', text: mode === 'failure' ? 'Could not finish this key update. Please retry.' : mode === 'missing-catalog' ? 'Validating...' : '✓ Connected', tone: mode === 'failure' ? 'danger' : 'success' });
        view.setBalance({ text: 'Balance: $0.25', tone: 'warning' });
        if (mode === 'saved-unavailable') view.setModels({ ...initial.models, selectedModel: 'saved/unavailable-synthetic-model' });
      }, { mode, initial });
      for (const width of [1280, 700, 390, 320]) {
        await page.setViewportSize({ width, height: 900 });
        expect(await panel.evaluate(element => element.scrollWidth <= element.clientWidth), `${theme} ${mode} ${width}`).toBe(true);
        const violations = await panel.evaluate(async element => (await (window as unknown as { axe: typeof import('axe-core') }).axe.run(element, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } })).violations.map(item => ({ id: item.id, nodes: item.nodes.map(node => ({ target: node.target, summary: node.failureSummary })) })));
        expect(violations, `${theme} ${mode} ${width}`).toEqual([]);
      }
      for (const control of await panel.locator('button:visible,summary:visible,#venice-e2ee-toggle').all()) {
        expect(await control.evaluate(element => element.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
      }
    }
  }
  await expect(input).toHaveAttribute('type', 'password'); await expect(input).toHaveAttribute('autocomplete', 'new-password');
  await page.evaluate(async () => {
    const input = document.getElementById('venice-key-input') as HTMLInputElement;
    (await import('/js/venice-settings-component.js')).disposeVeniceSettings();
    if (input.value) throw new Error('Private field retained after close');
  });
  await expect(panel).toHaveCount(0);
});
