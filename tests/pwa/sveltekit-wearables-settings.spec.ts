import {openStaticSettings, awaitStaticThemeReady} from './settings-entry.js';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { startKitServer } from './kit-server.js';
const artifact=process.env.GETBASED_KIT_ARTIFACT || path.resolve('.local-notes/sveltekit-build');
async function ready(page:Page) {
  await expect(page.locator('html[data-app-ready][data-shell-framework="sveltekit"]')).toBeAttached({timeout:30_000});
  await page.evaluate(()=>navigator.serviceWorker.ready.then(()=>true));
  await expect.poll(()=>page.evaluate(()=>!!navigator.serviceWorker.controller),{timeout:30_000}).toBe(true);
}
async function openWearables(page:Page) {
  await openStaticSettings(page);
  await page.locator('#settings-nav-wearables').click();
  await expect(page.locator('[data-wearables-view]')).toBeVisible();
}
test('Wearables settings mount on offline first use and retain profile visibility on a cold launch',async({page,context})=>{
  test.setTimeout(150_000);
  await context.addInitScript({path:'node_modules/axe-core/axe.min.js'});
  await context.addInitScript(()=>{
    if(!['http:','https:'].includes(location.protocol))return;
    for(const key of ['emptyTour','tour'])localStorage.setItem(`labcharts-default-${key}`,'completed');
    localStorage.setItem('labcharts-encryption-nudge-dismissed','true');localStorage.setItem('labcharts-analytics-consent-seen','1');
    localStorage.setItem('labcharts-legal-acceptance',JSON.stringify({accepted:true,termsVersion:'2026-08-22',privacyVersion:'2026-08-22',policyScope:'self-hosted-notice',acceptedAt:'2026-10-06T00:00:00Z',appVersion:'test',location:'local-test'}));
  });
  const server=await startKitServer(artifact); const errors:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  try {
    await page.goto(server.origin+'/app?dev-sw=1');await ready(page);server.state.offline=true;await openWearables(page);
    const panel=page.locator('[data-wearables-view]');
    await expect(panel.locator('[data-adapter="apple_health"]')).toHaveAttribute('open','');
    await expect(panel.locator('[data-adapter="google_health"]')).toContainText('Available when self-hosted');
    await expect(panel.locator('[data-adapter="google_health"] [data-wearable-settings-action="connect"]')).toHaveCount(0);
    const checkbox=panel.locator('#wearables-strip-hidden-toggle');await expect(checkbox).toBeChecked();
    await checkbox.focus();await page.keyboard.press('Space');await expect(checkbox).not.toBeChecked();
    const preferenceKey=await page.evaluate(()=>Object.keys(localStorage).find(key=>key.startsWith('wearables-strip-hidden-')));
    expect(preferenceKey).toBeTruthy();expect(await page.evaluate(key=>localStorage.getItem(key!),preferenceKey)).toBe('1');
    for(const theme of ['dark','light','cyberterm','glass','synth-sunrise','neuromancer']) {
      await page.locator('#settings-nav-display').click();
      await page.locator('#settings-tab-display [data-settings-action="open-tweaks"]').click();await page.locator(`[data-tweaks-action="select-theme"][data-theme-id="${theme}"]`).click();
      await page.locator('[data-tweaks-action="close"]').click();
      await awaitStaticThemeReady(page, theme);
      const closeChat=page.getByRole('button',{name:'Close chat',exact:true});if(await closeChat.isVisible())await closeChat.click();
      await openWearables(page);
      for(const viewport of [{width:1280,height:900},{width:700,height:900},{width:390,height:844}]) {
        await page.setViewportSize(viewport);await panel.scrollIntoViewIfNeeded();expect(await panel.evaluate(e=>e.scrollWidth<=e.clientWidth)).toBe(true);
        const violations=await panel.evaluate(async e=>(await(window as unknown as {axe:typeof import('axe-core')}).axe.run(e,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}})).violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))})));
        expect(violations,`${theme} ${viewport.width}`).toEqual([]);
        const dropzone=panel.locator('.apple-health-dropzone');await expect(dropzone).toBeVisible();await expect(dropzone).toHaveAttribute('type','button');expect(await dropzone.evaluate(e=>e.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
      }
      await expect(checkbox).not.toBeChecked();
    }
    const xml = '<HealthData><Record type="HKQuantityTypeIdentifierBodyMass" sourceName="Synthetic scale" unit="kg" value="72.4" startDate="2026-06-01 08:00:00 +0000" endDate="2026-06-01 08:00:00 +0000"/></HealthData>';
    await panel.locator('#apple-health-file-input').setInputFiles({ name:'synthetic-export.xml',mimeType:'application/xml',buffer:Buffer.from(xml) });
    await expect(panel.locator('[data-adapter="apple_health"] .wearable-adapter-identity')).toHaveText('Imported from synthetic-export.xml', {timeout:30_000});
    await expect(panel.locator('[data-adapter="apple_health"]')).toContainText('Imported from synthetic-export.xml');
    await expect(panel.locator('[data-adapter="apple_health"]')).toContainText('1 days');
    await page.close();const cold=await context.newPage();cold.on('pageerror',error=>errors.push(error.message));await cold.goto(server.origin+'/app?dev-sw=1');await ready(cold);await openWearables(cold);
    await expect(cold.locator('#wearables-strip-hidden-toggle')).not.toBeChecked();
    await expect(cold.locator('[data-adapter="apple_health"]')).toContainText('Imported from synthetic-export.xml');
    await expect(cold.locator('[data-adapter="apple_health"]')).toContainText('1 days');
    expect(await cold.evaluate(key=>localStorage.getItem(key!),preferenceKey)).toBe('1');
    expect(await cold.evaluate(async()=>(await navigator.serviceWorker.getRegistrations()).map(r=>new URL(r.active!.scriptURL).pathname))).toEqual(['/service-worker.js']);
    expect(errors).toEqual([]);
  } finally { await server.close(); }
});
