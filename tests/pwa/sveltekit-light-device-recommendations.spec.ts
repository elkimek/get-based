import path from 'node:path';
import fs from 'node:fs/promises';
import {expect,test,type Page} from '@playwright/test';
import {createDefaultProfileData} from '../../js/profile.js';
import type {ProfileData} from '../../types/app-state.js';
import {startKitServer} from './kit-server.js';
import {installDiscussionFixture} from '../helpers/chat-discussion-fixture.js';
import {readComparisonAcceptanceProfile} from '../helpers/nutrition-comparison-fixture.js';
import {installOfflineStartupDiagnostics} from '../helpers/offline-launch-diagnostics.js';
import {readyLightArtifact as ready,openLightArtifact as openLight} from '../helpers/light-artifact-navigation.js';
type API=Pick<typeof import('../../js/recommendations.js'),'renderChannelDeficitDeviceRecs'|'loadCatalog'|'isProductRecsEnabled'>;
// The renderer is a maintained public module contract, not an automatic Light
// page insertion. Locate its real bundled namespace from the exact artifact.
async function recommendationChunk(artifact:string) {
  const directory=path.join(artifact,'_app/immutable/chunks');
  for(const name of await fs.readdir(directory)) {
    if(!name.endsWith('.js.map'))continue;
    const map=JSON.parse(await fs.readFile(path.join(directory,name),'utf8')) as {sources:string[]};
    if(map.sources.some(source=>source.endsWith('/js/recommendations.js')))return '/_app/immutable/chunks/'+name.slice(0,-4);
  }
  throw new Error('The static artifact lacks its public recommendations module.');
}
function seed({defaults}:{defaults:ProfileData}) {
  if(!['http:','https:'].includes(location.protocol))return;
  localStorage.setItem('labcharts-ai-paused','true');
  if(localStorage.getItem('device-options-seeded'))return;localStorage.setItem('device-options-seeded','1');
  localStorage.setItem('labcharts-profiles',JSON.stringify([{id:'default',name:'Ada',sex:'male',dob:'1990-01-01',createdAt:1}]));
  localStorage.setItem('labcharts-active-profile','default');localStorage.setItem('labcharts-default-lastViewV1','insight');localStorage.setItem('labcharts-show-product-recs','true');
  for(const key of ['emptyTour','tour'])localStorage.setItem(`labcharts-default-${key}`,'completed');
  localStorage.setItem('labcharts-default-imported',JSON.stringify({...defaults,contextNotes:'Unrelated device-options data stays intact',sunDefaults:{fitzpatrick:'II',completedAt:1,coords:{lat:50.1,lon:14.4}},lightDevices:[],deviceSessions:[],sunSessions:[],lightEnvironment:{rooms:[],screens:[]},lightMeasurements:[],lightAudits:[],lightDailyVerdicts:{}}));
}
async function renderPublicOptions(page:Page,url:string,mount=true) {
  return page.evaluate(async({url,mount})=>{
    const module=await import(url) as Record<string,unknown>;
    const api=Object.values(module).find(value=>value&&typeof value==='object'&&'renderChannelDeficitDeviceRecs' in value) as API|undefined;
    if(!api)throw new Error('Missing bundled public recommendation namespace.');
    const catalog=await api.loadCatalog();
    const presets=await(await fetch('/data/light-device-presets.json')).json() as Parameters<API['renderChannelDeficitDeviceRecs']>[2];
    const html=api.renderChannelDeficitDeviceRecs(catalog,'pbm_red',presets,{label:'Red <660> & NIR'});
    document.getElementById('device-options-export-acceptance')?.remove();
    if(mount&&html){const host=document.createElement('div');host.id='device-options-export-acceptance';host.innerHTML=html;
      document.querySelector('.light-page [data-widget-id="light-devices"] .dashboard-widget-body')!.append(host);}
    return{enabled:api.isProductRecsEnabled(),html};
  },{url,mount});
}
async function inspect(page:Page,url:string,toggle:boolean) {
  await openLight(page);expect((await renderPublicOptions(page,url)).enabled).toBe(true);
  const options=page.locator('#device-options-export-acceptance [data-light-device-options]');
  await expect(options).toHaveAttribute('aria-label','Red <660> & NIR channel device options');
  await expect(options.locator('.rec-channel-deficit-head')).toHaveText('Device options related to the Red <660> & NIR channel');
  const links=options.locator('.rec-light-deficit-link');const count=await links.count();expect(count).toBeGreaterThan(0);expect(count).toBeLessThanOrEqual(3);
  for(const link of await links.all()) {
    await expect(link).toHaveAttribute('target','_blank');await expect(link).toHaveAttribute('rel','noopener sponsored');
    const href=new URL((await link.getAttribute('href'))!);expect(href.protocol).toMatch(/^https?:$/);expect(href.searchParams.get('utm_campaign')).toBe('light-devices');expect(href.searchParams.get('utm_content')).toMatch(/^light-deficit-/);
    expect((await link.getAttribute('data-umami-event'))!).toMatch(/^light-deficit-rec-/);expect((await link.getAttribute('data-umami-event'))!.length).toBeLessThanOrEqual(50);
    await expect(link).toHaveAccessibleName(/opens in new tab$/);
  }
  await expect(options.locator('img,script,[onclick]')).toHaveCount(0);
  const optOut=options.getByRole('button',{name:'turn off',exact:true});await optOut.focus();await page.keyboard.press('Space');
  await expect(page.locator('#settings-modal-overlay')).toHaveClass(/\bshow\b/);await expect(page.locator('#settings-tab-privacy')).toBeVisible();
  if(toggle) {
    await page.locator('#settings-nav-display').click();const checkbox=page.locator('#settings-product-recs');await expect(checkbox).toBeChecked();await page.locator('label[for="settings-product-recs"]').click();await expect(checkbox).not.toBeChecked();
    expect(await renderPublicOptions(page,url,false)).toEqual({enabled:false,html:''});
    await page.locator('label[for="settings-product-recs"]').click();await expect(checkbox).toBeChecked();expect((await renderPublicOptions(page,url,false)).enabled).toBe(true);
  }
  await page.locator('#settings-modal [data-settings-action="close"]').click();await expect(page.locator('#settings-modal-overlay')).not.toHaveClass(/\bshow\b/);
  // The established Tips setting navigates to Dashboard; return through real navigation.
  if(toggle){await openLight(page);expect((await renderPublicOptions(page,url)).html).not.toBe('');}
}
test('static public device options and actual settings opt-out work offline with unchanged profile through two cold launches',async({page,context})=>{
  test.setTimeout(120000);await installDiscussionFixture(context);await context.route('https://**',route=>route.abort());await installOfflineStartupDiagnostics(context);await context.addInitScript(seed,{defaults:createDefaultProfileData()});
  const errors:string[]=[],csp:string[]=[];const observe=(page:Page)=>page.on('pageerror',error=>errors.push(error.message));observe(page);context.on('page',observe);
  await context.exposeBinding('deviceOptionsCsp',(_,value:string)=>csp.push(value));await context.addInitScript(()=>document.addEventListener('securitypolicyviolation',event=>{void(window as unknown as{deviceOptionsCsp(value:string):Promise<void>}).deviceOptionsCsp(event.violatedDirective);}));
  const artifact=process.env.GETBASED_KIT_ARTIFACT||path.resolve('.local-notes/sveltekit-build');const url=await recommendationChunk(artifact);const server=await startKitServer(artifact);
  try {
    const loading=[{phase:'initial-online',readyMs:await ready(page,server.origin)}];await expect(page.locator('[data-light-device-options]')).toHaveCount(0);const before=await page.evaluate(readComparisonAcceptanceProfile);server.state.offline=true;
    await inspect(page,url,true);expect(await page.evaluate(readComparisonAcceptanceProfile)).toEqual(before);await page.close();
    for(let launch=0;launch<2;launch++) {const cold=await context.newPage();loading.push({phase:`offline-cold-${launch+1}`,readyMs:await ready(cold,server.origin)});await inspect(cold,url,false);expect(await cold.evaluate(readComparisonAcceptanceProfile)).toEqual(before);await cold.close();}
    expect(errors).toEqual([]);expect(csp).toEqual([]);await fs.writeFile(test.info().outputPath('device-options-loading.json'),JSON.stringify(loading,null,2));
  } finally {await server.close();}
});
