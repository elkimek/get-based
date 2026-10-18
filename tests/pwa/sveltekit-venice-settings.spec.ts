import {openStaticSettings, awaitStaticThemeReady} from './settings-entry.js';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { startKitServer } from './kit-server.js';
test.use({ actionTimeout: 15_000 });
const artifact = process.env.GETBASED_KIT_ARTIFACT || path.resolve('.local-notes/sveltekit-build');
async function ready(page: Page) {
  await expect(page.locator('html[data-app-ready][data-shell-framework="sveltekit"]')).toBeAttached({ timeout:30_000 });
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller),{timeout:30_000}).toBe(true);
}
async function openVenice(page: Page) {
  await openStaticSettings(page); await page.locator('#settings-nav-ai').click();
  await expect(page.locator('[data-venice-settings-view]')).toBeVisible();
}
test('Venice Settings uses cached assets with an unavailable origin and retains encrypted selections through cold launch',async({page,context})=>{
  test.setTimeout(150_000);await context.addInitScript({path:'node_modules/axe-core/axe.min.js'});
  await context.addInitScript(()=>{
    if(!['http:','https:'].includes(location.protocol))return;
    // A controlling worker can bypass Playwright routing in WPE WebKit.
    // Fail only the external provider transport; local requests still exercise
    // the deployed worker and unavailable-origin artifact without a UI mock.
    const transport = window as unknown as { offlineVeniceFetches: number };
    transport.offlineVeniceFetches = 0;
    const originalFetch = window.fetch.bind(window);
    window.fetch = (input, init) => {
      const url = new URL(input instanceof Request ? input.url : String(input), location.href);
      if (url.origin === 'https://api.venice.ai') {
        ++transport.offlineVeniceFetches;
        return Promise.reject(new TypeError('Provider unavailable in offline acceptance'));
      }
      return originalFetch(input, init);
    };
    for(const key of ['emptyTour','tour'])localStorage.setItem(`labcharts-default-${key}`,'completed');
    localStorage.setItem('labcharts-encryption-nudge-dismissed','true');localStorage.setItem('labcharts-analytics-consent-seen','1');
    localStorage.setItem('labcharts-legal-acceptance',JSON.stringify({accepted:true,termsVersion:'2026-08-22',privacyVersion:'2026-08-22',policyScope:'self-hosted-notice',acceptedAt:'2026-10-06T00:00:00Z',appVersion:'test',location:'local-test'}));
    if(localStorage.getItem('venice-settings-fixture-seeded'))return;
    localStorage.setItem('venice-settings-fixture-seeded','1');localStorage.setItem('labcharts-ai-provider','venice');localStorage.setItem('labcharts-ai-paused','false');
    localStorage.setItem('labcharts-venice-key','synthetic-nonfunctional-key');localStorage.setItem('labcharts-venice-model','synthetic-a');
    localStorage.setItem('labcharts-venice-models',JSON.stringify([{id:'synthetic-a',name:'Synthetic A'},{id:'synthetic-b',name:'Synthetic B'}]));
    localStorage.setItem('labcharts-venice-e2ee','off');
    localStorage.setItem('labcharts-venice-e2ee-models',JSON.stringify([{id:'e2ee-a',name:'Encrypted A',model_spec:{capabilities:{supportsE2EE:true}}},{id:'e2ee-b',name:'Encrypted B',model_spec:{capabilities:{supportsE2EE:true}}}]));
    localStorage.setItem('labcharts-venice-model-e2ee','e2ee-b');
    localStorage.setItem('labcharts-venice-pricing',JSON.stringify({'synthetic-a':{input:1,output:2},'synthetic-b':{input:3,output:6},'e2ee-a':{input:1,output:2},'e2ee-b':{input:2,output:4}}));
  });
  const server=await startKitServer(artifact);const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  try {
    await page.goto(server.origin+'/app?dev-sw=1');await ready(page);server.state.offline=true;await openVenice(page);
    const panel=page.locator('[data-venice-settings-view]');const select=panel.locator('#venice-model-select');
    await expect(panel.locator('#venice-key-input')).toHaveAttribute('type','password');
    await expect(select).toHaveValue('synthetic-a');await select.selectOption('synthetic-b');await expect(select).toHaveValue('synthetic-b');
    expect(await page.evaluate(()=>localStorage.getItem('labcharts-venice-model'))).toBe('synthetic-b');
    await expect(panel.locator('#venice-model-pricing')).toContainText('$3.00/M in');
    await expect(panel.locator('#venice-balance')).toHaveText('Balance: unavailable');
    await expect.poll(() => page.evaluate(() => (window as unknown as {offlineVeniceFetches:number}).offlineVeniceFetches)).toBeGreaterThan(0);
    const toggle=panel.locator('#venice-e2ee-toggle');
    await toggle.check();await expect(select).toHaveValue('e2ee-b');
    await select.selectOption('e2ee-a');await expect(select).toHaveValue('e2ee-a');
    await toggle.uncheck();await expect(select).toHaveValue('synthetic-b');
    await toggle.check();await expect(select).toHaveValue('e2ee-a');
    await expect(panel.locator('#venice-e2ee-indicator')).toBeVisible();
    await panel.locator('summary').click();await expect(panel.locator('details')).toHaveAttribute('open','');
    await expect(panel).toContainText('they do not prove that both are running together');
    await expect(panel).toContainText('Web search and images are disabled');
    expect(await page.evaluate(()=>({encrypted:localStorage.getItem('labcharts-venice-e2ee'),regular:localStorage.getItem('labcharts-venice-model-regular'),private:localStorage.getItem('labcharts-venice-model-e2ee')}))).toEqual({encrypted:'on',regular:'synthetic-b',private:'e2ee-a'});

    for(const theme of ['dark','light','cyberterm','glass','synth-sunrise','neuromancer']) {
      await page.locator('#settings-nav-display').click();await page.locator('#settings-tab-display [data-settings-action="open-tweaks"]').click();
      await page.locator(`[data-tweaks-action="select-theme"][data-theme-id="${theme}"]`).click();await page.locator('[data-tweaks-action="close"]').click();
      await awaitStaticThemeReady(page, theme);
      const closeChat=page.getByRole('button',{name:'Close chat',exact:true});if(await closeChat.isVisible())await closeChat.click();await openVenice(page);
      for(const width of [1280,700,390]) {
        await page.setViewportSize({width,height:900});await panel.scrollIntoViewIfNeeded();expect(await panel.evaluate(e=>e.scrollWidth<=e.clientWidth)).toBe(true);
        const violations=await panel.evaluate(async e=>(await(window as unknown as {axe:typeof import('axe-core')}).axe.run(e,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}})).violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))})));
        expect(violations,`${theme} ${width}`).toEqual([]);
      }
      await expect(select).toHaveValue('e2ee-a');
    }
    await page.close();const cold=await context.newPage();cold.on('pageerror',error=>errors.push(error.message));await cold.goto(server.origin+'/app?dev-sw=1');await ready(cold);await openVenice(cold);
    await expect(cold.locator('#venice-model-select')).toHaveValue('e2ee-a');await expect(cold.locator('#venice-key-input')).toHaveAttribute('type','password');
    await expect(cold.locator('#venice-model-pricing')).toContainText('$1.00/M in');await expect(cold.locator('#venice-e2ee-toggle')).toBeChecked();
    expect(await cold.evaluate(async()=>(await navigator.serviceWorker.getRegistrations()).map(r=>new URL(r.active!.scriptURL).pathname))).toEqual(['/service-worker.js']);expect(errors).toEqual([]);
  } finally {await server.close();}
});
