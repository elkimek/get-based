import path from 'node:path';
import fs from 'node:fs/promises';
import {expect,test,type Page} from '@playwright/test';
import {createDefaultProfileData} from '../../js/profile.js';
import {DEVICE_ENGINE_VERSION} from '../../js/light-device-session-engine.js';
import type {ProfileData} from '../../types/app-state.js';
import {startKitServer} from './kit-server.js';
import {installDiscussionFixture} from '../helpers/chat-discussion-fixture.js';
import {readComparisonAcceptanceProfile} from '../helpers/nutrition-comparison-fixture.js';
import {installOfflineStartupDiagnostics} from '../helpers/offline-launch-diagnostics.js';
import {readyLightArtifact as ready,openLightArtifact as openLight} from '../helpers/light-artifact-navigation.js';
function seed({defaults,now,version}:{defaults:ProfileData;now:number;version:number}){
  if(!['http:','https:'].includes(location.protocol))return;
  localStorage.setItem('labcharts-ai-paused','true');if(localStorage.getItem('device-library-seeded'))return;localStorage.setItem('device-library-seeded','1');
  localStorage.setItem('labcharts-profiles',JSON.stringify([{id:'default',name:'Ada',sex:'male',dob:'1990-01-01',createdAt:1}]));localStorage.setItem('labcharts-active-profile','default');
  localStorage.setItem('labcharts-default-lastViewV1','insight');localStorage.setItem('labcharts-show-product-recs','true');
  for(const key of ['emptyTour','tour'])localStorage.setItem(`labcharts-default-${key}`,'completed');
  const panel={id:'library-one',brand:'Saved <Panel>',model:'Red & NIR',type:'combined',catalogSlug:'mitochondriak-pulse',channels:['pbm_red','pbm_nir'],peakWavelengths:[660,850],mwPerCm2At15cm:20,recommendedDistanceCm:25,irradianceBasis:'measured-radiometer',addedAt:now-2000};
  const desk={id:'library-two',brand:'Bright desk',model:'Day lamp',type:'sad',channels:['circadian'],peakWavelengths:[460],lux:10000,addedAt:now-1000};
  localStorage.setItem('labcharts-default-imported',JSON.stringify({...defaults,contextNotes:'Unrelated device-library data stays intact',sunDefaults:{fitzpatrick:'II',completedAt:1,coords:{lat:50.1,lon:14.4}},
    lightDevices:[panel,desk],sunSessions:[],deviceSessions:[{id:'library-history',deviceId:panel.id,deviceSnapshot:panel,startedAt:now-3600000,endedAt:now-3180000,durationMin:7,distanceCm:25,bodyArea:'torso',eyesProtected:true,doses:{pbm_red:5,pbm_nir:5},safety:{hasUV:false,unsafeEyeExposure:false},engineVersion:version}],lightEnvironment:{rooms:[],screens:[]},lightMeasurements:[],lightAudits:[],lightDailyVerdicts:{}}));
}
async function inspect(page:Page){
  await openLight(page);
  const library=page.locator('.light-page .light-devices-section[data-light-device-presentation]');
  await expect(library.locator('.light-device-card')).toHaveCount(2);
  const panel=library.locator('.light-device-card[data-id="library-one"]');
  await expect(panel.locator('.light-device-name')).toHaveText('Saved <Panel> Red & NIR');
  await expect(panel.locator('.light-device-typeline')).toContainText('20 mW/cm² @ 25 cm');await expect(panel.locator('.light-device-typeline')).not.toContainText('~20');
  await expect(panel.locator('.light-device-stats')).toContainText('1 session · last');await expect(panel.locator('.light-device-feed-chip')).toHaveCount(2);
  const affiliate=panel.locator('.rec-light-device-link');await expect(affiliate).toHaveCount(1);await expect(affiliate).toHaveAttribute('target','_blank');await expect(affiliate).toHaveAttribute('rel','noopener sponsored');await expect(affiliate).toHaveAttribute('data-umami-event','light-device-rec-mitochondriak-pulse');
  expect(new URL((await affiliate.getAttribute('href'))!).searchParams.get('utm_campaign')).toBe('light-devices');
  await expect(library.locator('img,script,[onclick]')).toHaveCount(0);
  const start=page.locator('.light-session-log-actions [data-light-page-action="quick-log-device"]');
  await start.focus();await page.keyboard.press('Enter');
  const picker=page.getByRole('dialog',{name:'Pick a device to log a session',exact:true});await expect(picker).toBeVisible();
  expect(await picker.locator('.light-device-picker-row').evaluateAll(rows=>rows.map(row=>row.getAttribute('data-device-id')))).toEqual(['library-two','library-one']);
  await page.keyboard.press('Escape');await expect(picker).not.toBeVisible();await expect(start).toBeFocused();
  await start.focus();await page.keyboard.press('Enter');await expect(picker).toBeVisible();
  await picker.locator('[data-device-id="library-one"]').focus();await page.keyboard.press('Space');
  const session=page.getByRole('dialog',{name:'Log device session',exact:true});await expect(session).toBeVisible();await expect(picker).not.toBeVisible();await expect(session.locator('h3')).toHaveText('Log session — Saved <Panel> Red & NIR');
  await session.getByRole('button',{name:'Cancel',exact:true}).click();await expect(session).not.toBeVisible();
  await library.locator('[data-id="library-two"] [data-light-devices-action="log-device-session"]').focus();await page.keyboard.press('Enter');await expect(session).toBeVisible();await expect(session.locator('h3')).toHaveText('Log session — Bright desk Day lamp');await session.getByRole('button',{name:'Cancel',exact:true}).click();
  await library.getByRole('button',{name:'+ Add device',exact:true}).click();const add=page.getByRole('dialog',{name:'Add light device',exact:true});await expect(add).toBeVisible();await add.getByRole('button',{name:'Cancel',exact:true}).click();await expect(add).not.toBeVisible();
  await panel.locator('[data-light-devices-action="delete-device"]').focus();await page.keyboard.press('Enter');await expect(page.locator('#confirm-cancel')).toBeVisible();await expect(page.getByRole('alertdialog',{name:'Confirmation',exact:true})).toContainText('1 saved session will keep a copy of these device details.');await page.locator('#confirm-cancel').click();await expect(panel).toBeVisible();
}
test('static device library first opens offline with picker, affiliate policy and unchanged full profile through two cold launches',async({page,context})=>{
  test.setTimeout(120000);await installDiscussionFixture(context);await context.route('https://**',route=>route.abort());await installOfflineStartupDiagnostics(context);await context.addInitScript(seed,{defaults:createDefaultProfileData(),now:Date.now(),version:DEVICE_ENGINE_VERSION});
  const errors:string[]=[],csp:string[]=[];const observe=(page:Page)=>page.on('pageerror',error=>errors.push(error.message));observe(page);context.on('page',observe);
  await context.exposeBinding('deviceLibraryCsp',(_,value:string)=>csp.push(value));await context.addInitScript(()=>document.addEventListener('securitypolicyviolation',event=>{void(window as unknown as{deviceLibraryCsp(value:string):Promise<void>}).deviceLibraryCsp(event.violatedDirective);}));
  const server=await startKitServer(process.env.GETBASED_KIT_ARTIFACT||path.resolve('.local-notes/sveltekit-build'));
  try{
    const loading=[{phase:'initial-online',readyMs:await ready(page,server.origin)}];await expect(page.locator('[data-light-device-presentation]')).toHaveCount(0);const before=await page.evaluate(readComparisonAcceptanceProfile);server.state.offline=true;
    await inspect(page);expect(await page.evaluate(readComparisonAcceptanceProfile)).toEqual(before);await page.close();
    for(let launch=0;launch<2;launch++){const cold=await context.newPage();loading.push({phase:`offline-cold-${launch+1}`,readyMs:await ready(cold,server.origin)});await inspect(cold);expect(await cold.evaluate(readComparisonAcceptanceProfile)).toEqual(before);await cold.close();}
    expect(errors).toEqual([]);expect(csp).toEqual([]);await fs.writeFile(test.info().outputPath('device-library-loading.json'),JSON.stringify(loading,null,2));
  }finally{await server.close();}
});
