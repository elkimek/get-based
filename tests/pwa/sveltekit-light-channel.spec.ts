import path from 'node:path';
import fs from 'node:fs/promises';
import { expect, test, type Page, type Request } from '@playwright/test';
import { createDefaultProfileData } from '../../js/profile.js';
import { DEVICE_ENGINE_VERSION } from '../../js/light-device-session-engine.js';
import { startKitServer } from './kit-server.js';
import { installDiscussionFixture } from '../helpers/chat-discussion-fixture.js';
import { readComparisonAcceptanceProfile } from '../helpers/nutrition-comparison-fixture.js';
import { installOfflineStartupDiagnostics, captureOfflineRouteFailureDiagnostics } from '../helpers/offline-launch-diagnostics.js';
import { readyLightArtifact as ready, openLightArtifact as openLight } from '../helpers/light-artifact-navigation.js';
import type { ProfileData } from '../../types/app-state.js';
function seed({defaults,now,version}:{defaults:ProfileData;now:number;version:number}){
  if(!['http:','https:'].includes(location.protocol))return;
  localStorage.setItem('labcharts-ai-paused','true');if(localStorage.getItem('channel-seeded'))return;localStorage.setItem('channel-seeded','1');
  localStorage.setItem('labcharts-profiles',JSON.stringify([{id:'default',name:'Ada',sex:'male',dob:'1990-01-01',createdAt:1}]));localStorage.setItem('labcharts-active-profile','default');
  localStorage.setItem('labcharts-default-lastViewV1','insight');
  localStorage.setItem('labcharts-default-dashboardWidgetsV13',JSON.stringify({order:['light-channels'],hidden:[]}));
  for(const key of ['emptyTour','tour'])localStorage.setItem(`labcharts-default-${key}`,'completed');
  const device={id:'channel-panel',brand:'Saved <Panel>',model:'Red & NIR',type:'pbm',channels:['nir_solar','pbm_red'],peakWavelengths:[660,850],mwPerCm2At15cm:20};
  localStorage.setItem('labcharts-default-imported',JSON.stringify({...defaults,contextNotes:'Keep unrelated channel context',
    // Dashboard requires lab, wearable or food data; Light-only logs retain its welcome gate.
    wearableSummary:{metrics:{weight:{latest:80,primarySource:'fitbit'}}},sunDefaults:{fitzpatrick:'II',completedAt:1,coords:{lat:50.1,lon:14.4}},lightDevices:[device],
    sunSessions:[{id:'channel-sun',startedAt:now-3600000,endedAt:now-2700000,durationMin:15,bodyExposure:{preset:'shorts_top_off',fraction:0.45},eyeExposure:{mode:'direct'},
      doses:{vitamin_d:100,circadian:2000,nir_solar:400,no_cv:20,pomc:100,violet_eye:120},safety:{medFraction:0.1,fitzpatrick:'II'},calculationStatus:'computed'}],
    deviceSessions:[{id:'channel-device',deviceId:device.id,deviceSnapshot:device,startedAt:now-1800000,endedAt:now-1380000,durationMin:7,distanceCm:25,bodyArea:'torso',eyesProtected:true,
      doses:{nir_solar:5,pbm_red:5},safety:{hasUV:false,unsafeEyeExposure:false},engineVersion:version}],lightEnvironment:{rooms:[],screens:[]},lightMeasurements:[],lightAudits:[],lightDailyVerdicts:{}}));
}
const channels=['vitamin_d','circadian','nir_solar','no_cv','pomc','violet_eye'];
async function inspectChannels(page:Page){
  // Exercise the real optional Dashboard widget and cross-route navigation.
  if(await page.locator('#chat-panel.open').isVisible())await page.getByRole('button',{name:'Close chat',exact:true}).click();
  const menu=page.getByRole('button',{name:'Menu',exact:true});if(await menu.isVisible())await menu.click();
  await page.locator('[data-nav-action="navigate"][data-nav-route="dashboard"]').click();
  const dashboard=page.locator('.dashboard-widget[data-widget-id="light-channels"]');
  await expect(dashboard.locator('[data-light-dashboard-pills] .light-pill')).toHaveCount(6);
  await dashboard.getByRole('button',{name:'Open Light & Sun',exact:true}).focus();
  await page.keyboard.press('Enter');await expect(page.locator('.light-page')).toBeVisible();
  if(await menu.isVisible())await menu.click();
  await page.locator('[data-nav-action="navigate"][data-nav-route="dashboard"]').click();
  await expect(dashboard.locator('[data-light-dashboard-pills] .light-pill')).toHaveCount(6);
  const shortcut=dashboard.locator('.light-pill[data-channel="circadian"]');
  await expect(shortcut.locator('svg[aria-hidden="true"] rect')).not.toHaveCount(0);
  await shortcut.focus();await page.keyboard.press('Enter');
  const routed=page.locator('.light-page [data-light-channel-presentation]');
  await expect(routed).toHaveAttribute('data-channel','circadian');await expect(routed).toBeFocused();
  await routed.getByRole('button',{name:/^Close .* detail$/}).click();
  await openLight(page);
  for(const channel of channels){
    const pill=page.locator(`.light-page .light-pill[data-channel="${channel}"]`);
    await pill.focus();await page.keyboard.press('Enter');await expect(pill).toHaveAttribute('aria-expanded','true');
    const detail=page.locator('.light-page [data-light-channel-presentation]');await expect(detail).toHaveCount(1);await expect(detail).toHaveAttribute('data-channel',channel);await expect(detail).toBeFocused();
    await expect(detail.locator('.light-channel-hero-primary')).toHaveText(channel==='nir_solar'?'Sunlight + device logged':'Sunlight logged');
    await expect(detail.locator('svg[role="img"]')).toHaveAttribute('aria-label',/7-day per-day exposure:/);
    const bars=detail.locator('svg rect');expect(await bars.count()).toBeGreaterThan(0);
    const research=detail.locator('details');await research.locator('summary').focus();await page.keyboard.press('Enter');await expect(research).toHaveAttribute('open','');
    await expect(research.locator('.light-channel-cit-refs a')).toHaveCount(channel==='nir_solar'?4:3);
    for(const link of await research.locator('.light-channel-cit-refs a').all()){
      await expect(link).toHaveAttribute('target','_blank');await expect(link).toHaveAttribute('rel','noopener');await expect(link).toHaveAttribute('href',/^https:\/\//);
    }
    await expect(detail.locator('[data-light-channel-action="quick-log-sun"]')).toHaveAttribute('type','button');
    await expect(detail.locator('[data-light-channel-action="quick-log-device"]')).toHaveCount(channel==='nir_solar'?1:0);
    if(channel==='vitamin_d'||channel==='nir_solar'){
      await detail.locator(`[data-light-channel-action="${channel==='vitamin_d'?'quick-log-sun':'quick-log-device'}"]`).click();
      const dialog=page.getByRole('dialog',{name:channel==='vitamin_d'?'Start sun session':'Log device session',exact:true});
      await expect(dialog).toBeVisible();
      await dialog.getByRole('button',{name:'Cancel',exact:true}).click();await expect(dialog).not.toBeVisible();
    }
    await detail.getByRole('button',{name:/^Close .* detail$/}).click();await expect(detail).toHaveCount(0);await expect(pill).toHaveAttribute('aria-expanded','false');
  }
}
async function inspect(page:Page){
  const origin=new URL(page.url()).origin,latest=new Set<string>(),pending=new Map<Request,string>();
  const requested=(request:Request)=>{
    const url=new URL(request.url());
    if(request.method()!=='GET'||url.origin!==origin||!url.pathname.startsWith('/_app/immutable/'))return;
    latest.delete(url.href);latest.add(url.href);pending.set(request,url.href);
    if(latest.size>8)latest.delete(latest.values().next().value!);
    if(pending.size>8)pending.delete(pending.keys().next().value!);
  };
  const settled=(request:Request)=>{pending.delete(request);};
  page.on('request',requested);page.on('requestfinished',settled);page.on('requestfailed',settled);
  try{await inspectChannels(page);}
  catch(error){
    try{await captureOfflineRouteFailureDiagnostics(page,test.info(),[...new Set([...pending.values(),...[...latest].reverse()])].slice(0,8));}
    catch{/* Failure evidence must never replace the original acceptance error. */}
    throw error;
  }finally{page.off('request',requested);page.off('requestfinished',settled);page.off('requestfailed',settled);}
}
test('static channel details first open offline with retained source charts, research and full profile across two cold launches',async({page,context})=>{
  test.setTimeout(120000);await installDiscussionFixture(context);await context.route('https://**',route=>route.abort());await installOfflineStartupDiagnostics(context);await context.addInitScript(seed,{defaults:createDefaultProfileData(),now:Date.now(),version:DEVICE_ENGINE_VERSION});
  const errors:string[]=[],csp:string[]=[];const observe=(p:Page)=>p.on('pageerror',error=>errors.push(error.message));observe(page);context.on('page',observe);
  await context.exposeBinding('channelCsp',(_,value:string)=>csp.push(value));await context.addInitScript(()=>document.addEventListener('securitypolicyviolation',event=>{void(window as unknown as{channelCsp(value:string):Promise<void>}).channelCsp(event.violatedDirective);}));
  const server=await startKitServer(process.env.GETBASED_KIT_ARTIFACT||path.resolve('.local-notes/sveltekit-build'));
  try{
    const loading=[{phase:'initial-online',readyMs:await ready(page,server.origin)}];
    // Keep the first Dashboard pill render behind the offline boundary.
    await expect(page.locator('[data-light-dashboard-pills]')).toHaveCount(0);
    const before=await page.evaluate(readComparisonAcceptanceProfile);server.state.offline=true;
    await inspect(page);expect(await page.evaluate(readComparisonAcceptanceProfile)).toEqual(before);await page.close();
    for(let launch=0;launch<2;launch++){const cold=await context.newPage();loading.push({phase:`offline-cold-${launch+1}`,readyMs:await ready(cold,server.origin)});await inspect(cold);expect(await cold.evaluate(readComparisonAcceptanceProfile)).toEqual(before);await cold.close();}
    expect(errors).toEqual([]);expect(csp).toEqual([]);await fs.writeFile(test.info().outputPath('channel-loading.json'),JSON.stringify(loading,null,2));
  }finally{await server.close();}
});
