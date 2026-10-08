import path from 'node:path';
import fs from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { createDefaultProfileData } from '../../js/profile.js';
import { startKitServer } from './kit-server.js';
import { installDiscussionFixture } from '../helpers/chat-discussion-fixture.js';
import { readComparisonAcceptanceProfile } from '../helpers/nutrition-comparison-fixture.js';
import { installOfflineStartupDiagnostics } from '../helpers/offline-launch-diagnostics.js';
import { readyLightArtifact as ready, openLightArtifact as openLight } from '../helpers/light-artifact-navigation.js';
import type { ProfileData } from '../../types/app-state.js';
function seed(defaults:ProfileData) {
  if(!['http:','https:'].includes(location.protocol))return;
  localStorage.setItem('labcharts-ai-paused','true');
  if(localStorage.getItem('environment-screen-seeded'))return;
  localStorage.setItem('environment-screen-seeded','1');
  localStorage.setItem('labcharts-profiles',JSON.stringify([{id:'default',name:'Ada',sex:'male',dob:'1990-01-01',createdAt:1}]));
  localStorage.setItem('labcharts-active-profile','default');
  localStorage.setItem('labcharts-default-imported',JSON.stringify({...defaults,
    contextNotes:'Preserve unrelated screen migration context',sunDefaults:{fitzpatrick:'II',completedAt:1},
    lightDailyVerdicts:{'2026-01-02':{status:'ok',dot:'green',tip:'Saved daily note',detail:'Preserve historical daily analysis'}},
    lightEnvironment:{rooms:[{id:'screen-office',name:'Office',primarySource:'led-warm',hoursOccupiedPerDay:8,daylightLevel:'some',eveningHoursAfterSunset:1}],screens:[{id:'screen-phone',roomId:'screen-office',device:'phone',hoursPerDay:2,eveningUseAfterSunset:0,blueBlockerEnabled:false,annotation:{futureField:'retained'}}]},
  }));
}
async function assessment(page:Page) {
  await openLight(page);await page.locator('[data-light-env-action="open-assessment"]').click();
  const dialog=page.getByRole('dialog',{name:'Indoor Light Assessment',exact:true});await expect(dialog).toBeVisible();return dialog;
}
async function inspectSaved(page:Page) {
  const dialog=await assessment(page),screen=dialog.locator('[data-light-environment-screen][data-id="screen-phone"]');
  const disclosure=screen.locator('.light-env-screen-disclosure');
  if(await disclosure.getAttribute('aria-expanded')!=='true'){await disclosure.focus();await page.keyboard.press('Enter');}
  await expect(disclosure).toHaveAttribute('aria-expanded','true');
  await expect(screen.getByRole('combobox',{name:'Device type'})).toHaveValue('tablet');
  await expect(screen.getByRole('combobox',{name:'Used in room'})).toHaveValue('');
  await expect(screen.locator('[data-light-env-action="set-screen-hours-bucket"][data-light-env-key="lots"]')).toHaveAttribute('aria-pressed','true');
  await expect(screen.locator('[data-light-env-action="set-screen-evening-bucket"][data-light-env-key="gt3"]')).toHaveAttribute('aria-pressed','true');
  await expect(screen.getByRole('checkbox',{name:'Blue reduction active'})).toBeChecked();
  await expect(screen.locator('[data-light-environment-today]')).toHaveAttribute('aria-pressed','false');
  await expect(dialog.locator('[data-light-environment-screen]')).toHaveCount(2);
  await expect(dialog.locator('[data-light-environment-summary].light-env-summary')).toHaveCount(1);
  await dialog.getByRole('button',{name:'Close',exact:true}).click();
  const summary=page.locator('[data-light-environment-summary].light-env-assessment-summary');
  await expect(summary.locator('.light-env-assessment-metric-label')).toHaveText(['Rooms','Screens','Readings','Audits']);
  await expect(summary.locator('.light-env-assessment-metric strong')).toHaveText(['1','2','0','0']);
  await expect(summary.locator('.light-env-assessment-metric').filter({has:page.locator('.light-env-assessment-metric-label',{hasText:'Screens'})})).toContainText('1 active today');
}
interface Saved {lightEnvironment:{rooms:unknown[];screens:Array<Record<string,unknown>>};[key:string]:unknown}
test('static screen editor creates, edits, reassigns and saves first offline with two closed-client cold launches',async({page,context})=>{
  test.setTimeout(120000);await installDiscussionFixture(context);await installOfflineStartupDiagnostics(context);await context.addInitScript(seed,createDefaultProfileData());
  const errors:string[]=[],csp:string[]=[];const observe=(p:Page)=>p.on('pageerror',error=>errors.push(error.message));observe(page);context.on('page',observe);
  await context.exposeBinding('screenEditorCsp',(_,value:string)=>csp.push(value));
  await context.addInitScript(()=>document.addEventListener('securitypolicyviolation',event=>{void(window as unknown as{screenEditorCsp(value:string):Promise<void>}).screenEditorCsp(event.violatedDirective);}));
  const server=await startKitServer(process.env.GETBASED_KIT_ARTIFACT||path.resolve('.local-notes/sveltekit-build'));
  try{
    const loading=[{phase:'initial-online',readyMs:await ready(page,server.origin)}];
    const before=await page.evaluate(readComparisonAcceptanceProfile) as Saved;server.state.offline=true;
    const dialog=await assessment(page),screen=dialog.locator('[data-light-environment-screen][data-id="screen-phone"]'),disclosure=screen.locator('.light-env-screen-disclosure');
    await expect(dialog.locator('.light-env-room-disclosure[data-id="screen-office"] [data-light-environment-screen]')).toHaveCount(1);
    await disclosure.focus();await page.keyboard.press('Space');await expect(disclosure).toHaveAttribute('aria-expanded','true');
    await screen.getByRole('combobox',{name:'Device type'}).selectOption('tablet');
    await screen.locator('[data-light-env-action="set-screen-hours-bucket"][data-light-env-key="lots"]').click();
    await screen.locator('[data-light-env-action="set-screen-evening-bucket"][data-light-env-key="gt3"]').click();
    await screen.getByRole('checkbox',{name:'Blue reduction active'}).check();
    await screen.locator('[data-light-environment-today]').click();
    await expect(screen.locator('[data-light-environment-today]')).toHaveAttribute('aria-pressed','false');
    await expect(disclosure).toHaveAttribute('aria-expanded','true');
    await screen.getByRole('combobox',{name:'Used in room'}).selectOption('');
    await expect(dialog.locator('.light-env-room-disclosure[data-id="screen-office"] [data-light-environment-screen]')).toHaveCount(0);
    await expect(dialog.locator('.light-env-screen-cards [data-id="screen-phone"]')).toHaveCount(1);
    await dialog.locator('[data-light-env-action="add-screen"]:not([data-light-env-room-id])').click();
    await expect(dialog.locator('[data-light-environment-screen]')).toHaveCount(2);
    const added=dialog.locator('.light-env-screen-cards [data-light-environment-screen]:not([data-id="screen-phone"])');
    await added.locator('.light-env-screen-disclosure').focus();await page.keyboard.press('Enter');
    await added.getByRole('combobox',{name:'Device type'}).selectOption('laptop');
    await expect.poll(async()=>((await page.evaluate(readComparisonAcceptanceProfile)) as Saved).lightEnvironment.screens.find(screen=>screen.id!=='screen-phone')).toMatchObject({device:'laptop',roomId:null});
    const saved=await page.evaluate(readComparisonAcceptanceProfile) as Saved;
    const expected=structuredClone(before);expected.lightEnvironment=saved.lightEnvironment;expect(saved).toEqual(expected);
    expect(saved.lightEnvironment.rooms).toEqual(before.lightEnvironment.rooms);
    const modified=saved.lightEnvironment.screens.find(screen=>screen.id==='screen-phone')!;
    expect(modified).toMatchObject({device:'tablet',roomId:null,hoursPerDay:4.5,eveningUseAfterSunset:4,blueBlockerEnabled:true,todayOverride:{active:false},annotation:{futureField:'retained'}});
    expect(saved.lightEnvironment.screens.find(screen=>screen.id!=='screen-phone')).toMatchObject({device:'laptop',roomId:null});
    await dialog.getByRole('button',{name:'Close',exact:true}).click();await inspectSaved(page);
    expect(await page.evaluate(readComparisonAcceptanceProfile)).toEqual(saved);await page.close();
    for(let launch=0;launch<2;launch++){
      const cold=await context.newPage();loading.push({phase:`offline-cold-${launch+1}`,readyMs:await ready(cold,server.origin)});
      await inspectSaved(cold);expect(await cold.evaluate(readComparisonAcceptanceProfile)).toEqual(saved);await cold.close();
    }
    expect(errors).toEqual([]);expect(csp).toEqual([]);
    await fs.writeFile(test.info().outputPath('environment-screen-loading.json'),JSON.stringify(loading,null,2));
  }finally{await server.close();}
});
