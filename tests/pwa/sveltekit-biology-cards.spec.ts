import path from 'node:path';
import fs from 'node:fs/promises';
import {expect,test,type Page} from '@playwright/test';
import {createDefaultProfileData} from '../../js/profile.js';
import {startKitServer} from './kit-server.js';
import {installDiscussionFixture} from '../helpers/chat-discussion-fixture.js';
import {installOfflineStartupDiagnostics} from '../helpers/offline-launch-diagnostics.js';
import {readComparisonAcceptanceProfile} from '../helpers/nutrition-comparison-fixture.js';
import {readyLightArtifact as ready} from '../helpers/light-artifact-navigation.js';

async function openScores(page:Page){
 const menu=page.getByRole('button',{name:'Menu',exact:true});if(await menu.isVisible())await menu.click();
 await page.locator('[data-nav-action="navigate"][data-nav-route="biology-scores"]').click();
 await expect(page.locator('.biology-score-compact')).toHaveCount(18);
}
async function order(page:Page){
 return page.locator('[data-lens-order-key="biology-scores-baseline"] > [data-widget-id]').evaluateAll(nodes=>nodes.map(node=>node.getAttribute('data-widget-id')!));
}
async function dashboardPreferences(page:Page){
 return page.evaluate(()=>{
  const profileId=localStorage.getItem('labcharts-active-profile');
  if(profileId!=='default')throw new Error('Dashboard action changed the active profile');
  const keys=Object.keys(localStorage).filter(key=>/^labcharts-default-dashboardWidgetsV\d+$/.test(key));
  if(keys.length!==1)throw new Error('Expected exactly one persisted dashboard preference record');
  const key=keys[0]!,stored=localStorage.getItem(key);
  if(!stored)throw new Error('Dashboard action did not persist preferences');
  return {key,value:JSON.parse(stored) as {order:string[];hidden:string[]}};
 });
}
async function openCard(page:Page,id:string){
 const card=page.locator(`[id="${id}"]`);
 if(await card.getAttribute('open')===null){
  await card.locator('[data-biology-score-action="toggle-score"]').focus();await page.keyboard.press('Enter');
 }
 await expect(card).toHaveAttribute('open','');return card;
}
test('static Biology card dashboard actions and page ordering persist through closed-client offline launches without changing lab records',async({page,context})=>{
 test.setTimeout(120000);await installDiscussionFixture(context);await installOfflineStartupDiagnostics(context);
 await context.addInitScript(({defaults,demo})=>{
  if(!['http:','https:'].includes(location.protocol))return;
  localStorage.setItem('labcharts-ai-paused','true');
  if(localStorage.getItem('biology-cards-seeded'))return;localStorage.setItem('biology-cards-seeded','1');
  localStorage.setItem('labcharts-profiles',JSON.stringify([{id:'default',name:'Alex',sex:'male',dob:'1987-11-22',createdAt:1}]));localStorage.setItem('labcharts-active-profile','default');
  for(const key of ['tour','emptyTour'])localStorage.setItem(`labcharts-default-${key}`,'completed');
  localStorage.setItem('labcharts-default-imported',JSON.stringify({...defaults,entries:demo.entries,refOverrides:demo.refOverrides,profile:{firstName:'Alex',age:38},markerNotes:{'thyroid.tsh':'Preserve unrelated note'},sunDefaults:{fitzpatrick:'II',completedAt:1},contextNotes:'Preserve unrelated context'}));
 },{defaults:createDefaultProfileData(),demo:JSON.parse(await fs.readFile('data/demo-male.json','utf8')) as Record<string,unknown>});
 const errors:string[]=[],csp:string[]=[];const observe=(p:Page)=>p.on('pageerror',error=>errors.push(error.message));observe(page);context.on('page',observe);
 await context.exposeBinding('biologyCardsCsp',(_,value:string)=>csp.push(value));
 await context.addInitScript(()=>document.addEventListener('securitypolicyviolation',event=>{void(window as unknown as {biologyCardsCsp(value:string):Promise<void>}).biologyCardsCsp(event.violatedDirective);}));
 const server=await startKitServer(process.env.GETBASED_KIT_ARTIFACT||path.resolve('.local-notes/sveltekit-build'));
 try{
  await page.clock.setFixedTime(new Date('2026-08-07T12:00:00Z'));
  const loading=[{phase:'initial-online',readyMs:await ready(page,server.origin)}];
  const before=await page.evaluate(readComparisonAcceptanceProfile);server.state.offline=true;
  await openScores(page);const originalOrder=await order(page);expect(originalOrder.length).toBeGreaterThan(1);
  const cardId=originalOrder[0]!.replace('biology-score-detail-','biology-score-');
  let card=await openCard(page,cardId);
  const toggle=card.locator('.lens-widget-dashboard-toggle');const initialAction=await toggle.getAttribute('data-lens-page-action');
  expect(['add-dashboard-widget','remove-dashboard-widget']).toContain(initialAction);
  const nextAction=initialAction==='add-dashboard-widget'?'remove-dashboard-widget':'add-dashboard-widget';
  await toggle.focus();await page.keyboard.press('Enter');
  await expect(page.locator(`[id="${cardId}"] .lens-widget-dashboard-toggle`)).toHaveAttribute('data-lens-page-action',nextAction);
  card=await openCard(page,cardId);
  await card.getByRole('button',{name:'Move page section down',exact:true}).focus();await page.keyboard.press('Enter');
  const changedOrder=[originalOrder[1]!,originalOrder[0]!,...originalOrder.slice(2)];await expect.poll(()=>order(page)).toEqual(changedOrder);
  const preferences=await dashboardPreferences(page);
  expect(preferences.value.hidden.includes(cardId)).toBe(nextAction==='add-dashboard-widget');
  expect(await page.evaluate(readComparisonAcceptanceProfile)).toEqual(before);await page.close();
  for(let launch=0;launch<2;launch++){
   const cold=await context.newPage();await cold.clock.setFixedTime(new Date('2026-08-07T12:00:00Z'));
   loading.push({phase:`offline-cold-${launch+1}`,readyMs:await ready(cold,server.origin)});await openScores(cold);
   expect(await order(cold)).toEqual(changedOrder);const persisted=await openCard(cold,cardId);
   await expect(persisted.locator('.lens-widget-dashboard-toggle')).toHaveAttribute('data-lens-page-action',nextAction);
   expect(await dashboardPreferences(cold)).toEqual(preferences);
   expect(await cold.evaluate(readComparisonAcceptanceProfile)).toEqual(before);await cold.close();
  }
  expect(errors).toEqual([]);expect(csp).toEqual([]);await fs.writeFile(test.info().outputPath('biology-cards-loading.json'),JSON.stringify(loading,null,2));
 }finally{await server.close();}
});
