import {nativeTabKey} from '../helpers/native-tab-key.js';
import path from 'node:path';
import fs from 'node:fs/promises';
import {expect,test,type Page} from '@playwright/test';
import {createDefaultProfileData} from '../../js/profile.js';
import {startKitServer} from './kit-server.js';
import {installDiscussionFixture} from '../helpers/chat-discussion-fixture.js';
import {installOfflineStartupDiagnostics} from '../helpers/offline-launch-diagnostics.js';
import {readComparisonAcceptanceProfile} from '../helpers/nutrition-comparison-fixture.js';
import {readyLightArtifact as ready} from '../helpers/light-artifact-navigation.js';
async function openLens(page:Page,route:string){
 const menu=page.getByRole('button',{name:'Menu',exact:true});if(await menu.isVisible())await menu.click();
 await page.locator(`[data-nav-action="navigate"][data-nav-route="${route}"]`).click();
 await expect(page.locator('.lens-page-header h2')).toHaveText(route==='genome'?'Genome':'Biometrics');
}
async function inspect(page:Page){
 await openLens(page,'genome');const panel=page.locator('.genome-import-details[data-lens-content-view]');
 await expect(panel.locator('.genetics-overview-card')).toHaveCount(4);await expect(panel).toContainText('Local <raw>');await expect(panel).toContainText('Stored <lineage>');
 await expect(panel.locator('script,img,[onerror]')).toHaveCount(0);await expect(page.locator('[data-lens-page-action="import-snp-report"][data-lens-content-view]')).toBeVisible();
 const reimport=panel.getByRole('button',{name:'Re-import',exact:true});await page.keyboard.press(nativeTabKey(page));await reimport.focus();await expect(reimport).toBeFocused();expect(await reimport.evaluate(node=>parseFloat(getComputedStyle(node).outlineWidth))).toBeGreaterThanOrEqual(2);
 await openLens(page,'body');const sources=page.locator('[data-widget-id="body-sources"] .dashboard-widget-picker-grid[data-lens-content-view]');
 await expect(sources.getByRole('button')).toHaveCount(2);await expect(sources).toContainText('Manual logs');await expect(sources).toContainText('7d coverage');
 const source=sources.getByRole('button').first();await page.keyboard.press(nativeTabKey(page));await source.focus();await expect(source).toBeFocused();expect(await source.evaluate(node=>parseFloat(getComputedStyle(node).outlineWidth))).toBeGreaterThanOrEqual(2);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
}
test('static imported Genome and connected Body source metadata remain escaped and available through closed-client offline launches',async({page,context})=>{
 test.setTimeout(120000);await installDiscussionFixture(context);await installOfflineStartupDiagnostics(context);
 await context.addInitScript(({defaults,demo})=>{
  if(!['http:','https:'].includes(location.protocol))return;localStorage.setItem('labcharts-ai-paused','true');
  if(localStorage.getItem('lens-content-seeded'))return;localStorage.setItem('lens-content-seeded','1');
  localStorage.setItem('labcharts-profiles',JSON.stringify([{id:'default',name:'Alex',sex:'male',dob:'1987-11-22',createdAt:1}]));localStorage.setItem('labcharts-active-profile','default');
  for(const key of ['tour','emptyTour'])localStorage.setItem(`labcharts-default-${key}`,'completed');
  localStorage.setItem('labcharts-default-imported',JSON.stringify({...defaults,entries:demo.entries,refOverrides:demo.refOverrides,profile:{firstName:'Alex',age:38},contextNotes:'Preserve unrelated context',genetics:{snps:{rsOwned1:{genotype:'AG'},rsOwned2:{genotype:'CT'}},source:'Local <raw>',importDate:'2026-02-03',apoe:'E3/E4',coverage:{found:2,total:10},mtdna:{haplogroup:'H1',source:'Manual',details:'Stored <lineage>'}},wearableConnections:{manual:{},oura:{lastSyncAt:'2026-02-03',coverageDays:7}}}));
 },{defaults:createDefaultProfileData(),demo:JSON.parse(await fs.readFile('data/demo-male.json','utf8')) as Record<string,unknown>});
 const errors:string[]=[],csp:string[]=[];const observe=(p:Page)=>p.on('pageerror',error=>errors.push(error.message));observe(page);context.on('page',observe);
 await context.exposeBinding('lensContentCsp',(_,value:string)=>csp.push(value));await context.addInitScript(()=>document.addEventListener('securitypolicyviolation',event=>{void(window as unknown as {lensContentCsp(value:string):Promise<void>}).lensContentCsp(event.violatedDirective);}));
 const server=await startKitServer(process.env.GETBASED_KIT_ARTIFACT||path.resolve('.local-notes/sveltekit-build'));
 try{
  await page.clock.setFixedTime(new Date('2026-08-07T12:00:00Z'));const loading=[{phase:'initial-online',readyMs:await ready(page,server.origin)}];
  const before=await page.evaluate(readComparisonAcceptanceProfile);server.state.offline=true;await inspect(page);expect(await page.evaluate(readComparisonAcceptanceProfile)).toEqual(before);
  if(test.info().project.name==='kit-mobile-webkit')await page.screenshot({path:test.info().outputPath('lens-content-mobile.png')});await page.close();
  for(let launch=0;launch<2;launch++){const cold=await context.newPage();await cold.clock.setFixedTime(new Date('2026-08-07T12:00:00Z'));loading.push({phase:`offline-cold-${launch+1}`,readyMs:await ready(cold,server.origin)});await inspect(cold);expect(await cold.evaluate(readComparisonAcceptanceProfile)).toEqual(before);await cold.close();}
  expect(errors).toEqual([]);expect(csp).toEqual([]);await fs.writeFile(test.info().outputPath('lens-content-loading.json'),JSON.stringify(loading,null,2));
 }finally{await server.close();}
});
