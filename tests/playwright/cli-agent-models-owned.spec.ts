import { expect, test } from '@playwright/test';
import { routeHtml } from '../helpers/browser-static-routes.js';
test('owned CLI model controls preserve search, keyboard operation, themes and small-screen accessibility', async ({ page,context }) => {
  test.setTimeout(150_000); await context.addInitScript({ path:'node_modules/axe-core/axe.min.js' });
  await routeHtml(page,'**/cli-models-owned-test','<!doctype html><html lang="en"><head><title>CLI controls</title><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/css/settings.css"></head><body><main id="settings-modal" class="settings-modal"><div id="cli-agent-options"></div></main></body></html>');
  await page.goto('/cli-models-owned-test');
  await page.evaluate(async () => {
    const projection = await import('/js/cli-agent-models-presentation.js'), component = await import('/js/cli-agent-models-component.js');
    const models = Array.from({ length:16 },(_,i) => ({ id:`openrouter/model-${i}`, model:`openrouter/model-${i}`, displayName:`Model ${i} · long model description`, description:'', isDefault:i === 0, defaultReasoningEffort:'high',supportedReasoningEfforts:[{ reasoningEffort:'high',description:'' }], inputModalities:['text'] }));
    const state = projection.buildCliAgentModelsSnapshot(models,[{ id:'local',label:'Local CLI' }, { id:'gateway',label:'Personal gateway',kind:'gateway' }],{ agent:'opencode',target:'local',model:'openrouter/model-1',effort:'high',providerFilter:'' });
    component.mountCliAgentModels(document.getElementById('cli-agent-options')!,state,() => {});
  });
  const panel = page.locator('[data-cli-agent-models-view]');
  for (const theme of ['dark','light','cyberterm','glass','synth-sunrise','neuromancer']) {
    await page.evaluate(async theme => { const themes=await import('/js/theme.js'); await themes.loadExtraThemesStylesheet(); themes.setTheme(theme); },theme);
    for (const width of [1280,700,390,320]) {
      await page.setViewportSize({ width,height:900 });
      const summary = panel.locator('#cli-agent-model-summary');
      if (!await summary.locator('..').evaluate(element => element.hasAttribute('open'))) await summary.click();
      const input = panel.locator('[data-cli-agent-model-search]'); await input.fill('model-15'); await expect(panel.locator('#cli-agent-model-result-count')).toHaveText('1 model');
      expect(await panel.evaluate(element => element.scrollWidth <= element.clientWidth),`${theme}/${width}`).toBe(true);
      const violations = await panel.evaluate(async element => (await (window as unknown as { axe:typeof import('axe-core') }).axe.run(element,{ runOnly:{ type:'tag',values:['wcag2a','wcag2aa','wcag21aa'] } })).violations.map(v => ({ id:v.id,nodes:v.nodes.map(n => n.target) })));
      expect(violations,`${theme}/${width}`).toEqual([]);
      for (const control of await panel.locator('summary:visible,button:visible,input:visible').all()) expect(await control.evaluate(element => element.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
      await input.fill(''); await summary.click();
    }
  }
  const summary = panel.locator('#cli-agent-model-summary'); await summary.focus(); await summary.press('Enter');
  await expect(summary.locator('..')).toHaveAttribute('open','');
  const options=panel.locator('#cli-agent-model-options [role="option"]'); await options.first().focus(); await options.first().press('End'); await expect(options.last()).toBeFocused();
  await options.last().press('ArrowDown'); await expect(options.first()).toBeFocused(); await options.first().press('Escape'); await expect(summary).toBeFocused(); await expect(summary.locator('..')).not.toHaveAttribute('open','');
  await page.screenshot({ path:test.info().outputPath('cli-models-owned.png'),fullPage:true });
});
