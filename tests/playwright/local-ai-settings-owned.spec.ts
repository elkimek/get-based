import { expect, test } from '@playwright/test';
import { routeHtml } from '../helpers/browser-static-routes.js';
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

  test('owned Local AI connection and advisor states preserve fields, keyboard controls and accessibility', async ({ page, context }) => {
    test.setTimeout(180_000); await context.addInitScript({ path: 'node_modules/axe-core/axe.min.js' });
    await routeHtml(page, '**/local-ai-owned-test', '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/css/settings.css"></head><body><main id="settings-modal" class="settings-modal"><div id="ai-provider-panel"><div data-local-ai-settings-host></div></div></main></body></html>');
    await page.goto('/local-ai-owned-test');
    await page.evaluate(async () => {
      const panels = await import('/js/provider-local-ai-controls.js'); panels.hydrateLocalAiSettings();
      (await import('/js/local-ai-settings-component.js')).getLocalAiSettingsView()!.setConnection({ url: 'https://synthetic.test', apiKey: 'PRIVATE-LOCAL-KEY' });
    });
    const panel = page.locator('[data-local-ai-settings-view]'), key = panel.locator('#local-ai-apikey-input'); await key.focus();
    const stable = await page.evaluate(async () => { const view = (await import('/js/local-ai-settings-component.js')).getLocalAiSettingsView()!, input = document.getElementById('local-ai-apikey-input'); view.refresh({ ...view.getSnapshot(), selectedModel: 'long-model', models: [{ value: 'long-model', label: 'Long model' }] }); return input === document.getElementById('local-ai-apikey-input'); });
    expect(stable).toBe(true); await expect(key).toBeFocused(); await expect(key).toHaveValue('PRIVATE-LOCAL-KEY'); expect(await panel.innerHTML()).not.toContain('PRIVATE-LOCAL-KEY');
    for (const theme of ['dark','light','cyberterm','glass','synth-sunrise','neuromancer']) {
      await page.evaluate(async theme => { const themes = await import('/js/theme.js'); await themes.loadExtraThemesStylesheet(); themes.setTheme(theme); },theme);
      for (const state of ['disconnected','empty','local','remote','cloud','unknown','error','pending']) {
        await page.evaluate(async state => {
          const view = (await import('/js/local-ai-settings-component.js')).getLocalAiSettingsView()!, projection = await import('/js/local-ai-settings-view.js');
          const name = state === 'cloud' ? 'kimi-k2.5:cloud' : 'organization/long-model-name-with-context-and-runtime-metadata';
          const details = projection.checkedAdvisorModels([{ name, size: state === 'unknown' ? 0 : 3e9, quantLevel: 'Q4_K_M', paramSize: '14B', loaded: true, vramAllocated: 2e9, contextLength: 16384, maxContextLength: 65536 }]);
          const local = state !== 'remote';
          const hardware = { gpu: { name: 'Synthetic GPU', vram: state === 'unknown' || state === 'remote' ? null : 16, unified: false, renderer: null, source: 'manual' }, ram: { gb: 32, source: 'manual' }, cpuThreads: 8 };
          const connected = !['disconnected','empty','error'].includes(state);
          view.refresh({ ...projection.localAiLocationSnapshot(local ? 'http://localhost:11434' : 'http://remote.test',name), selectedModel: name, models: connected ? [{ value: name, label: name }] : [], advisor: connected ? projection.buildLocalAiAdvisor(details,hardware,local,true,name,null) : null });
          view.setStatus(connected ? 'connected' : 'disconnected', state === 'error' ? 'Connection could not be verified. Retry safely.' : state === 'empty' ? 'Connected but no text-generation models were found.' : connected ? 'Connected' : 'Not connected',state === 'pending');
        },state);
        for (const width of [1280,700,390,320]) {
          await page.setViewportSize({ width, height: 900 }); expect(await panel.evaluate(element => element.scrollWidth <= element.clientWidth), `${theme} ${state} ${width}`).toBe(true);
          const violations = await panel.evaluate(async element => (await (window as unknown as { axe: typeof import('axe-core') }).axe.run(element, { runOnly: { type: 'tag', values: ['wcag2a','wcag2aa','wcag21aa'] } })).violations.map(item => ({ id: item.id, nodes: item.nodes.map(node => ({ target: node.target, summary: node.failureSummary })) })));
          expect(violations, `${theme} ${state} ${width}`).toEqual([]);
        }
        for (const control of await panel.locator('button:visible,input:not([hidden]):visible,select:visible').all()) expect(await control.evaluate(element => element.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
      }
    }
    const toggle = panel.locator('[data-local-ai-action="toggle-override"]'); await toggle.focus(); await toggle.press('Enter'); await expect(toggle).toHaveAttribute('aria-expanded','true'); await toggle.press(' '); await expect(toggle).toHaveAttribute('aria-expanded','false');
    const retained = await key.elementHandle(); await page.evaluate(async () => (await import('/js/settings-provider-bridge.js')).disposeSettingsProviderPanels()); expect(await retained!.evaluate(element => (element as HTMLInputElement).value)).toBe(''); await retained!.dispose(); await expect(panel).toHaveCount(0);
  });
});
