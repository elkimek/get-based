import {nativeTabKey} from '../helpers/native-tab-key.js';
import path from 'node:path';
import fs from 'node:fs/promises';
import {expect,test,type Page} from '@playwright/test';
import {createDefaultProfileData} from '../../js/profile.js';
import {startKitServer} from './kit-server.js';
import {installDiscussionFixture} from '../helpers/chat-discussion-fixture.js';
import {readComparisonAcceptanceProfile} from '../helpers/nutrition-comparison-fixture.js';
import {installOfflineStartupDiagnostics} from '../helpers/offline-launch-diagnostics.js';
import {readyLightArtifact as ready,openLightArtifact as openLight} from '../helpers/light-artifact-navigation.js';
import type {ProfileData} from '../../types/app-state.js';
function seed(defaults:ProfileData){
  if(!['http:','https:'].includes(location.protocol))return;localStorage.setItem('labcharts-ai-paused','true');
  if(localStorage.getItem('environment-room-seeded'))return;localStorage.setItem('environment-room-seeded','1');
  localStorage.setItem('labcharts-profiles',JSON.stringify([{id:'default',name:'Ada',sex:'male',dob:'1990-01-01',createdAt:1}]));localStorage.setItem('labcharts-active-profile','default');
  localStorage.setItem('labcharts-default-imported',JSON.stringify({...defaults,contextNotes:'Preserve unrelated room migration context',sunDefaults:{fitzpatrick:'II',completedAt:1},
    lightDailyVerdicts:{'2026-01-02':{status:'ok',dot:'green',tip:'Saved daily note',detail:'Preserve historical daily analysis'}},
    lightEnvironment:{rooms:[{id:'room-bedroom',name:'Bedroom',primarySource:'led-cool',hoursOccupiedPerDay:8,daylightLevel:'low',eveningHoursAfterSunset:2,annotation:{futureField:'retained'}}],screens:[]}}));
}
async function assessment(page:Page){await openLight(page);await page.locator('[data-light-env-action="open-assessment"]').click();const dialog=page.getByRole('dialog',{name:'Indoor Light Assessment',exact:true});await expect(dialog).toBeVisible();return dialog;}
async function inspectSaved(page:Page){
  const dialog=await assessment(page),room=dialog.locator('[data-light-environment-room][data-id="room-bedroom"]'),disclosure=room.locator('.light-env-room-disclosure-toggle');
  if(await disclosure.getAttribute('aria-expanded')!=='true'){await disclosure.focus();await page.keyboard.press('Enter');}await expect(disclosure).toHaveAttribute('aria-expanded','true');
  await expect(room.getByRole('textbox',{name:'Room name'})).toHaveValue('Sleep studio');await expect(room.getByRole('combobox',{name:'Primary light source'})).toHaveValue('natural-only');
  await expect(room.locator('[data-light-env-action="set-room-daylight-level"][data-light-env-key="strong"]')).toHaveAttribute('aria-pressed','true');
  await expect(room.locator('[data-light-env-action="set-room-evening-bucket"][data-light-env-key="lt1"]')).toHaveAttribute('aria-pressed','true');
  await expect(room.locator('[data-light-environment-today][data-light-env-kind="room"]')).toHaveAttribute('aria-pressed','false');await expect(room.locator('[data-light-environment-screen]')).toHaveCount(1);await expect(dialog.locator('[data-light-environment-room]')).toHaveCount(2);
  await room.getByText('Set exact hours…',{exact:true}).click();await expect(room.getByRole('spinbutton',{name:'Hours per day'})).toHaveValue('5.5');
  await dialog.getByRole('button',{name:'Close',exact:true}).click();
  const summary=page.locator('[data-light-environment-summary].light-env-assessment-summary');await expect(summary.locator('.light-env-assessment-metric strong')).toHaveText(['2','1','0','0']);
}
interface Saved{lightEnvironment:{rooms:Array<Record<string,unknown>>;screens:Array<Record<string,unknown>>};[key:string]:unknown}
test('static room editor edits all picker modes and saves first offline with two closed-client cold launches',async({page,context})=>{
  test.setTimeout(120000);await installDiscussionFixture(context);await installOfflineStartupDiagnostics(context);await context.addInitScript(seed,createDefaultProfileData());
  const errors:string[]=[],csp:string[]=[];const observe=(p:Page)=>p.on('pageerror',error=>errors.push(error.message));observe(page);context.on('page',observe);
  await context.exposeBinding('roomEditorCsp',(_,value:string)=>csp.push(value));await context.addInitScript(()=>document.addEventListener('securitypolicyviolation',event=>{void(window as unknown as{roomEditorCsp(value:string):Promise<void>}).roomEditorCsp(event.violatedDirective);}));
  const server=await startKitServer(process.env.GETBASED_KIT_ARTIFACT||path.resolve('.local-notes/sveltekit-build'));
  try{
    const loading=[{phase:'initial-online',readyMs:await ready(page,server.origin)}],before=await page.evaluate(readComparisonAcceptanceProfile) as Saved;server.state.offline=true;
    const dialog=await assessment(page),room=dialog.locator('[data-light-environment-room][data-id="room-bedroom"]'),disclosure=room.locator('.light-env-room-disclosure-toggle');
    await expect(disclosure).toHaveAttribute('aria-expanded','true');await disclosure.focus();await page.keyboard.press('Space');await expect(disclosure).toHaveAttribute('aria-expanded','false');await disclosure.focus();await page.keyboard.press('Enter');await expect(disclosure).toHaveAttribute('aria-expanded','true');
    await room.getByRole('textbox',{name:'Room name'}).fill('Sleep studio');await room.getByRole('textbox',{name:'Room name'}).press(nativeTabKey(page));
    await room.locator('[data-light-env-action="set-room-source-archetype"][data-light-env-key="warm"]').click();
    await room.getByText('More source types…',{exact:true}).click();await room.getByRole('combobox',{name:'Primary light source'}).selectOption('natural-only');
    await room.locator('[data-light-env-action="set-room-daylight-level"][data-light-env-key="strong"]').click();
    await room.locator('[data-light-env-action="set-room-hours-bucket"][data-light-env-key="some"]').click();
    await room.getByText('Set exact hours…',{exact:true}).click();await room.getByRole('spinbutton',{name:'Hours per day'}).fill('5.5');await room.getByRole('spinbutton',{name:'Hours per day'}).press(nativeTabKey(page));
    await room.locator('[data-light-env-action="set-room-evening-bucket"][data-light-env-key="lt1"]').click();await room.locator('[data-light-environment-today][data-light-env-kind="room"]').click();
    await room.locator('[data-light-env-action="add-screen-with-device"][data-light-env-device="phone"]').click();await expect(room.locator('[data-light-environment-screen]')).toHaveCount(1);
    await dialog.locator('[data-light-env-action="add-room-named"][data-light-env-name="Office"]').click();await expect(dialog.locator('[data-light-environment-room]')).toHaveCount(2);
    await expect.poll(async()=>((await page.evaluate(readComparisonAcceptanceProfile)) as Saved).lightEnvironment.rooms.find(room=>room.id==='room-bedroom')).toMatchObject({name:'Sleep studio',primarySource:'natural-only',daylightLevel:'strong',hoursOccupiedPerDay:5.5,eveningHoursAfterSunset:.5,todayOverride:{active:false},annotation:{futureField:'retained'}});
    const saved=await page.evaluate(readComparisonAcceptanceProfile) as Saved,expected=structuredClone(before);expected.lightEnvironment=saved.lightEnvironment;expect(saved).toEqual(expected);
    expect(saved.lightEnvironment.rooms.find(room=>room.id!=='room-bedroom')).toMatchObject({name:'Office'});expect(saved.lightEnvironment.screens).toHaveLength(1);expect(saved.lightEnvironment.screens[0]).toMatchObject({device:'phone',roomId:'room-bedroom'});
    await dialog.getByRole('button',{name:'Close',exact:true}).click();await inspectSaved(page);expect(await page.evaluate(readComparisonAcceptanceProfile)).toEqual(saved);await page.close();
    for(let launch=0;launch<2;launch++){const cold=await context.newPage();loading.push({phase:`offline-cold-${launch+1}`,readyMs:await ready(cold,server.origin)});await inspectSaved(cold);expect(await cold.evaluate(readComparisonAcceptanceProfile)).toEqual(saved);await cold.close();}
    expect(errors).toEqual([]);expect(csp).toEqual([]);await fs.writeFile(test.info().outputPath('environment-room-loading.json'),JSON.stringify(loading,null,2));
  }finally{await server.close();}
});
