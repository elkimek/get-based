import { expect, test } from '@playwright/test';
import { routeHtml } from '../helpers/browser-static-routes.js';
import type { OpenRouterSettingsSnapshot } from '../../js/openrouter-settings-contract.js';
// The 44px target contract applies to coarse pointer input. Desktop density
// is checked against the original UI in sveltekit-settings-density.spec.ts.
test.use({ hasTouch: true });

test('owned OpenRouter Settings preserve private fields, focused models and accessible theme layouts', async ({ page, context }) => {
  test.setTimeout(150_000); await context.addInitScript({ path: 'node_modules/axe-core/axe.min.js' });
  await routeHtml(page,'**/openrouter-owned-test','<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/css/settings.css"></head><body><main class="settings-modal"><div id="owned-provider-host"></div></main></body></html>');
  await page.goto('/openrouter-owned-test');
  const initial: OpenRouterSettingsSnapshot = { connected: true, models: { selectedModel: 'synthetic-a', modelDisplay: 'Synthetic A', groups: [{ label:'Recommended',options:[{value:'synthetic-a',label:'Synthetic A'},{value:'synthetic-b',label:'Synthetic B'}] }], pricing:{text:'$1.00/M in · $2.00/M out',tone:'secondary'} } };
  await page.evaluate(async initial => { const component = await import('/js/openrouter-settings-component.js'); component.mountOpenRouterSettings(document.getElementById('owned-provider-host')!,initial).setStoredKey('synthetic-private-key'); },initial);
  const panel = page.locator('[data-openrouter-settings-view]'); const input = panel.locator('#openrouter-key-input'); const select = panel.locator('#openrouter-model-select');
  await input.fill('edited-synthetic-key'); await select.focus();
  await page.evaluate(async initial => (await import('/js/openrouter-settings-component.js')).getOpenRouterSettingsView()!.setModels({...initial.models,selectedModel:'synthetic-b'}),initial);
  await expect(select).toBeFocused(); await expect(input).toHaveValue('edited-synthetic-key'); await expect(select).toHaveValue('synthetic-b');
  for (const theme of ['dark','light','cyberterm','glass','synth-sunrise','neuromancer']) {
    await page.evaluate(async theme => { const themes=await import('/js/theme.js');await themes.loadExtraThemesStylesheet();themes.setTheme(theme); },theme);
    for (const mode of ['ready','pending','failure','unconfigured','custom-model']) {
      await page.evaluate(async ({ mode, initial }) => {
        const view = (await import('/js/openrouter-settings-component.js')).getOpenRouterSettingsView()!;
        view.refresh({ ...initial, connected: mode !== 'unconfigured' });
        view.setSaveState({ pending: mode === 'pending', text: mode === 'failure' ? 'Could not finish this key update. Please retry.' : mode === 'pending' ? 'Validating...' : '✓ Connected',tone: mode === 'failure' ? 'danger' : 'success' });
        view.setBalance({ text:'Balance: $0.25',tone:'warning' });
        if (mode === 'custom-model') { view.setModels({ ...initial.models, selectedModel: 'custom/long-synthetic-model' }); view.setModelCheck('error','Offline synthetic model'); }
      },{mode,initial});
      for (const width of [1280,700,390,320]) {
        await page.setViewportSize({width,height:900}); expect(await panel.evaluate(e=>e.scrollWidth<=e.clientWidth),`${theme} ${mode} ${width}`).toBe(true);
        const violations=await panel.evaluate(async e=>(await(window as unknown as {axe:typeof import('axe-core')}).axe.run(e,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}})).violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))})));
        expect(violations,`${theme} ${mode} ${width}`).toEqual([]);
      }
      for (const button of await panel.locator('button:visible').all()) expect(await button.evaluate(e=>e.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
    }
  }
  await expect(input).toHaveAttribute('type','password'); await expect(input).toHaveAttribute('autocomplete','new-password');
  await page.evaluate(async () => {
    const input=document.getElementById('openrouter-key-input') as HTMLInputElement;
    (await import('/js/openrouter-settings-component.js')).disposeOpenRouterSettings();
    if (input.value) throw new Error('Private field was retained after close');
  });
  await expect(panel).toHaveCount(0);
});
