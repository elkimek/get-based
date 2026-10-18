import { expect, test } from '@playwright/test';
import { routeHtml } from '../helpers/browser-static-routes.js';
import type { WearablesRow } from '../../js/wearables-settings-contract.js';
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

  test('owned Wearables settings retain accessible themes, disclosure state and keyboard import controls', async ({page,context}) => {
    test.setTimeout(150_000);
    await context.addInitScript({path:'node_modules/axe-core/axe.min.js'});
    await routeHtml(page,'**/wearables-owned-test',`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/css/settings.css"><link rel="stylesheet" href="/css/wearables.css"></head><body><main><section id="wearables-section"></section></main></body></html>`,200);
    await page.goto('/wearables-owned-test');
    const base: WearablesRow={id:'manual',name:'Manual',connected:true,wordmark:false,status:'Connected',updated:'Updated 5 minutes ago',tone:'success',detail:'manual',startOpen:false,identity:'Entered manually on this device',meta:'',notices:[],explanation:'Manage entries on the dashboard.',actions:[{action:'manual-dashboard',label:'Open dashboard'},{action:'manual-disconnect',label:'Delete all manual entries',tone:'danger'}]};
    const rows: WearablesRow[]=[
      {...base,id:'oura',name:'Oura',wordmark:true,iconLight:'/brands/oura/wordmark-on-dark.svg',iconDark:'/brands/oura/wordmark-on-light.svg',detail:'oauth',identity:'Long synthetic account@example.test',actions:[{action:'sync-now',adapter:'oura',label:'Update now',hint:'checks the last 7 days'},{action:'backfill',adapter:'oura',label:'Import last 90 days',hint:'fills missing days',tone:'secondary'},{action:'disconnect',adapter:'oura',label:'Disconnect and remove data',tone:'danger'}]},
      {...base,id:'google_health',name:'Google Health',connected:false,status:'Available when self-hosted',updated:'',tone:'secondary',detail:'setup',identity:'',explanation:'Self-host getbased and configure your own Google Cloud OAuth client ID and secret to enable it.',docsUrl:'https://docs.getbased.health/guides/self-hosting#wearable-oauth-apps',docsLabel:'Setup docs',actions:[]},
      {...base,id:'fitbit',name:'Fitbit',status:'Move this connection',tone:'danger',detail:'legacy',identity:'Legacy Fitbit account',notices:['Move this connection to Google Health.'],actions:[{action:'connect',adapter:'google_health',label:'Connect Google Health'},{action:'disconnect',adapter:'fitbit',label:'Disconnect legacy Fitbit',tone:'danger'}]},
      {...base,id:'apple_health',name:'Apple Health',connected:false,status:'Import from a file',updated:'',tone:'secondary',detail:'apple',startOpen:true,identity:'',explanation:'',primaryAction:{action:'pick-apple-health-file',label:'Import'},actions:[]},base,
    ];
    await page.evaluate(async rows=>{
      const component=await import('/js/wearables-settings-component.js');
      component.mountWearablesSettings(document.getElementById('wearables-section')!,{profileId:'synthetic',stripHidden:false,groups:[{id:'local',title:'Health sources',hint:'Synthetic local acceptance',rows}]});
    },rows);
    const panel=page.locator('[data-wearables-view]');
    for(const theme of ['dark','light','cyberterm','glass','synth-sunrise','neuromancer']) {
      await page.evaluate(async theme=>{const themes=await import('/js/theme.js');await themes.loadExtraThemesStylesheet();themes.setTheme(theme);},theme);
      for(const mode of ['ready','importing','failure']) {
        await page.evaluate(async mode=>{
          const view=(await import('/js/wearables-settings-component.js')).getWearablesSettingsView()!;
          view.setManualCounts('2 weight · 3 blood pressure · 1 pulse readings');
          view.setImportProgress(mode==='ready'?null:{percent:mode==='importing'?40:0,message:mode==='importing'?'parsing… 40%':'Failed: Unrecognised file type',failed:mode==='failure'});
          for(const details of document.querySelectorAll<HTMLDetailsElement>('.wearable-row')) details.open=true;
        },mode);
        for(const viewport of [{width:1280,height:900},{width:700,height:900},{width:390,height:844}]) {
          await page.setViewportSize(viewport);
          expect(await panel.evaluate(element=>element.scrollWidth<=element.clientWidth),`${theme} ${mode} ${viewport.width}`).toBe(true);
          const violations=await panel.evaluate(async element=>{
            const result=await (window as unknown as {axe:typeof import('axe-core')}).axe.run(element,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}});
            return result.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))}));
          });
          expect(violations,`${theme} ${mode} ${viewport.width}`).toEqual([]);
        }
        for(const button of await panel.locator('button:visible').all()) expect(await button.evaluate(e=>e.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
      }
    }
    await page.evaluate(async()=>{(await import('/js/wearables-settings-component.js')).getWearablesSettingsView()!.setImportProgress(null);});
    const dropzone=panel.locator('.apple-health-dropzone'); await expect(dropzone).toHaveAttribute('type','button');
    await dropzone.focus(); await page.keyboard.press('Shift+Tab'); await page.keyboard.press('Tab'); await expect(dropzone).toBeFocused();
    const manual=panel.locator('[data-adapter="manual"]'); await manual.locator('summary').focus(); await page.keyboard.press('Enter'); await expect(manual).not.toHaveAttribute('open','');
    await page.keyboard.press('Enter'); await expect(manual).toHaveAttribute('open','');
    await page.setViewportSize({width:320,height:640}); expect(await panel.evaluate(e=>e.scrollWidth<=e.clientWidth)).toBe(true);
    await expect(panel.locator('#apple-health-file-input')).toHaveAttribute('accept','.zip,.xml,application/zip,application/xml');
  });
});
