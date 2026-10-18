import {openStaticSettings, awaitStaticThemeReady} from './settings-entry.js';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { startKitServer } from './kit-server.js';
const artifact = process.env.GETBASED_KIT_ARTIFACT || path.resolve('.local-notes/sveltekit-build');
async function ready(page: Page) {
  await expect(page.locator('html[data-app-ready][data-shell-framework="sveltekit"]')).toBeAttached({ timeout:30_000 });
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller),{timeout:30_000}).toBe(true);
}
async function openProvider(page: Page) {
  await openStaticSettings(page); await page.locator('#settings-nav-ai').click();
  await expect(page.locator('[data-openrouter-settings-view]')).toBeVisible();
}
test('OpenRouter Settings uses cached assets with an unavailable origin and retains its model through cold launch',async({page,context})=>{
  test.setTimeout(150_000);await context.addInitScript({path:'node_modules/axe-core/axe.min.js'});
  await context.addInitScript(()=>{
    if(!['http:','https:'].includes(location.protocol))return;
    // A controlling worker can bypass Playwright routing in WPE WebKit.
    // Fail only the external provider transport; local requests still exercise
    // the deployed worker and unavailable-origin artifact without a UI mock.
    const transport = window as unknown as { offlineOpenRouterFetches: number };
    transport.offlineOpenRouterFetches = 0;
    const originalFetch = window.fetch.bind(window);
    window.fetch = (input, init) => {
      const url = new URL(input instanceof Request ? input.url : String(input), location.href);
      if (url.origin === 'https://openrouter.ai') {
        ++transport.offlineOpenRouterFetches;
        return Promise.reject(new TypeError('Provider unavailable in offline acceptance'));
      }
      return originalFetch(input, init);
    };
    for(const key of ['emptyTour','tour'])localStorage.setItem(`labcharts-default-${key}`,'completed');
    localStorage.setItem('labcharts-encryption-nudge-dismissed','true');localStorage.setItem('labcharts-analytics-consent-seen','1');
    localStorage.setItem('labcharts-legal-acceptance',JSON.stringify({accepted:true,termsVersion:'2026-08-22',privacyVersion:'2026-08-22',policyScope:'self-hosted-notice',acceptedAt:'2026-10-06T00:00:00Z',appVersion:'test',location:'local-test'}));
    if(localStorage.getItem('openrouter-settings-fixture-seeded'))return;
    localStorage.setItem('openrouter-settings-fixture-seeded','1');localStorage.setItem('labcharts-ai-provider','openrouter');localStorage.setItem('labcharts-ai-paused','false');
    localStorage.setItem('labcharts-openrouter-key','synthetic-nonfunctional-key');localStorage.setItem('labcharts-openrouter-model','synthetic-a');
    localStorage.setItem('labcharts-openrouter-models',JSON.stringify([{id:'synthetic-a',name:'Synthetic A'},{id:'synthetic-b',name:'Synthetic B'}]));
    localStorage.setItem('labcharts-openrouter-vision-models',JSON.stringify(['synthetic-a','synthetic-b']));
    localStorage.setItem('labcharts-openrouter-pricing',JSON.stringify({'synthetic-a':{input:1,output:2},'synthetic-b':{input:3,output:6}}));
  });
  const server=await startKitServer(artifact);const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  try {
    await page.goto(server.origin+'/app?dev-sw=1');await ready(page);server.state.offline=true;await openProvider(page);
    const panel=page.locator('[data-openrouter-settings-view]');const select=panel.locator('#openrouter-model-select');
    await expect(panel.locator('#openrouter-key-input')).toHaveAttribute('type','password');
    await expect(select).toHaveValue('synthetic-a');await select.selectOption('synthetic-b');await expect(select).toHaveValue('synthetic-b');
    expect(await page.evaluate(()=>localStorage.getItem('labcharts-openrouter-model'))).toBe('synthetic-b');
    await expect(panel.locator('#openrouter-model-pricing')).toContainText('$3.00/M in');
    await expect(panel.locator('#or-balance')).toHaveText('Balance: unavailable');
    await expect.poll(() => page.evaluate(() => (window as unknown as {offlineOpenRouterFetches:number}).offlineOpenRouterFetches)).toBeGreaterThan(0);
    for(const theme of ['dark','light','cyberterm','glass','synth-sunrise','neuromancer']) {
      await page.locator('#settings-nav-display').click();await page.locator('#settings-tab-display [data-settings-action="open-tweaks"]').click();
      await page.locator(`[data-tweaks-action="select-theme"][data-theme-id="${theme}"]`).click();await page.locator('[data-tweaks-action="close"]').click();
      await awaitStaticThemeReady(page, theme);
      const closeChat=page.getByRole('button',{name:'Close chat',exact:true});if(await closeChat.isVisible())await closeChat.click();await openProvider(page);
      for(const width of [1280,700,390]) {
        await page.setViewportSize({width,height:900});await panel.scrollIntoViewIfNeeded();expect(await panel.evaluate(e=>e.scrollWidth<=e.clientWidth)).toBe(true);
        const violations=await panel.evaluate(async e=>(await(window as unknown as {axe:typeof import('axe-core')}).axe.run(e,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}})).violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))})));
        expect(violations,`${theme} ${width}`).toEqual([]);
      }
      await expect(select).toHaveValue('synthetic-b');
    }
    await page.close();const cold=await context.newPage();cold.on('pageerror',error=>errors.push(error.message));await cold.goto(server.origin+'/app?dev-sw=1');await ready(cold);await openProvider(cold);
    await expect(cold.locator('#openrouter-model-select')).toHaveValue('synthetic-b');await expect(cold.locator('#openrouter-key-input')).toHaveAttribute('type','password');
    await expect(cold.locator('#openrouter-model-pricing')).toContainText('$3.00/M in');
    expect(await cold.evaluate(async()=>(await navigator.serviceWorker.getRegistrations()).map(r=>new URL(r.active!.scriptURL).pathname))).toEqual(['/service-worker.js']);expect(errors).toEqual([]);
  } finally {await server.close();}
});
