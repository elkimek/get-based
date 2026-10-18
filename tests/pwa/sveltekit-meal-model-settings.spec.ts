import {openStaticSettings, awaitStaticThemeReady} from './settings-entry.js';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { startKitServer } from './kit-server.js';

const artifact = process.env.GETBASED_KIT_ARTIFACT || path.resolve('.local-notes/sveltekit-build');
const routeB = JSON.stringify({ provider: 'custom', model: 'synthetic-vision-b' });
async function ready(page: Page) {
  await expect(page.locator('html[data-app-ready][data-shell-framework="sveltekit"]')).toBeAttached({ timeout: 30_000 });
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
}
async function openModels(page: Page) {
  await openStaticSettings(page);
  await page.locator('#settings-nav-ai').click();
  await expect(page.locator('[data-nutrition-ai-view]')).toBeVisible();
}

test('meal-model Settings load offline and retain a dedicated route through a cold launch', async ({ page, context }) => {
  test.setTimeout(150_000);
  await context.addInitScript({ path: 'node_modules/axe-core/axe.min.js' });
  await context.route('https://synthetic.invalid/**', route => route.abort());
  await context.addInitScript(() => {
    if (!['http:','https:'].includes(location.protocol)) return;
    for (const key of ['emptyTour','tour']) localStorage.setItem(`labcharts-default-${key}`, 'completed');
    localStorage.setItem('labcharts-encryption-nudge-dismissed','true');
    localStorage.setItem('labcharts-analytics-consent-seen','1');
    localStorage.setItem('labcharts-legal-acceptance', JSON.stringify({ accepted: true, termsVersion: '2026-08-22', privacyVersion: '2026-08-22', policyScope: 'self-hosted-notice', acceptedAt: '2026-10-06T00:00:00Z', appVersion: 'test', location: 'local-test' }));
    if (localStorage.getItem('meal-model-fixture-seeded')) return;
    localStorage.setItem('meal-model-fixture-seeded','1');
    localStorage.setItem('labcharts-ai-provider','custom');
    localStorage.setItem('labcharts-ai-paused','false');
    localStorage.setItem('labcharts-custom-url','https://synthetic.invalid/v1');
    localStorage.setItem('labcharts-custom-key','synthetic-nonfunctional-key');
    localStorage.setItem('labcharts-custom-model','synthetic-vision-a');
    localStorage.setItem('labcharts-custom-models', JSON.stringify([{ id:'synthetic-vision-a', name:'Synthetic Vision A' }, { id:'synthetic-vision-b', name:'Synthetic Vision B' }, { id:'synthetic-text-only', name:'Synthetic Text Only' }]));
    localStorage.setItem('labcharts-custom-vision-models', JSON.stringify(['synthetic-vision-a','synthetic-vision-b']));
  });
  const server = await startKitServer(artifact);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto(server.origin + '/app?dev-sw=1'); await ready(page);
    server.state.offline = true;
    await openModels(page);
    const panel = page.locator('[data-nutrition-ai-view]');
    const select = panel.locator('select');
    await expect(select).toContainText('Synthetic Vision A');
    await expect(select).toContainText('Synthetic Vision B');
    await expect(select).not.toContainText('Synthetic Text Only');
    await expect(select).toHaveValue('');
    await select.selectOption(routeB);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('labcharts-nutrition-ai-route')!))).toEqual({ provider:'custom', model:'synthetic-vision-b' });
    expect(await page.evaluate(() => localStorage.getItem('labcharts-custom-model'))).toBe('synthetic-vision-a');
    await panel.locator('summary').focus(); await page.keyboard.press('Enter');
    await expect(panel.locator('details')).toHaveAttribute('open','');
    for (const theme of ['dark','light','cyberterm','glass','synth-sunrise','neuromancer']) {
      await page.locator('#settings-nav-display').click();
      await page.locator('#settings-tab-display [data-settings-action="open-tweaks"]').click();
      await page.locator(`[data-tweaks-action="select-theme"][data-theme-id="${theme}"]`).click();
      await page.locator('[data-tweaks-action="close"]').click();
      await awaitStaticThemeReady(page, theme);
      const closeChat = page.getByRole('button',{name:'Close chat',exact:true});
      if (await closeChat.isVisible()) await closeChat.click();
      await openModels(page);
      await panel.locator('summary').click();
      for (const width of [1280,700,390]) {
        await page.setViewportSize({width,height:900}); await panel.scrollIntoViewIfNeeded();
        expect(await panel.evaluate(e => e.scrollWidth <= e.clientWidth)).toBe(true);
        const violations = await panel.evaluate(async e => (await (window as unknown as { axe: typeof import('axe-core') }).axe.run(e,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}})).violations.map(v => ({id:v.id,nodes:v.nodes.map(n => ({target:n.target,summary:n.failureSummary}))})));
        expect(violations,`${theme} ${width}`).toEqual([]);
      }
      await expect(select).toHaveValue(routeB);
    }
    await page.close();
    const cold = await context.newPage(); cold.on('pageerror', error => errors.push(error.message)); await cold.goto(server.origin + '/app?dev-sw=1'); await ready(cold); await openModels(cold);
    const coldSelect = cold.locator('[data-nutrition-ai-view] select');
    await expect(coldSelect).toHaveValue(routeB);
    await expect(coldSelect).not.toContainText('Synthetic Text Only');
    expect(await cold.evaluate(() => localStorage.getItem('labcharts-custom-model'))).toBe('synthetic-vision-a');
    await coldSelect.selectOption('');
    expect(await cold.evaluate(() => localStorage.getItem('labcharts-nutrition-ai-route'))).toBeNull();
    expect(await cold.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).map(r => new URL(r.active!.scriptURL).pathname))).toEqual(['/service-worker.js']);
    expect(errors).toEqual([]);
  } finally { await server.close(); }
});
