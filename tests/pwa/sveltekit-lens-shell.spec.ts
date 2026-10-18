import path from 'node:path';
import fs from 'node:fs/promises';
import {expect,test,type Page,type Request} from '@playwright/test';
import {createDefaultProfileData} from '../../js/profile.js';
import {startKitServer} from './kit-server.js';
import {installDiscussionFixture} from '../helpers/chat-discussion-fixture.js';
import {installOfflineStartupDiagnostics,captureOfflineRouteFailureDiagnostics} from '../helpers/offline-launch-diagnostics.js';
import {readComparisonAcceptanceProfile} from '../helpers/nutrition-comparison-fixture.js';
import {readyLightArtifact as ready} from '../helpers/light-artifact-navigation.js';

const lenses = [
 {route:'labs',title:'Labs',ids:['quick-markers','key-trends']},
 {route:'genome',title:'Genome',ids:['genome']},
 {route:'body',title:'Body',ids:['wearables','body-sources','nutrition','nutrition-fuel-mix','supplements']},
 {route:'insight',title:'Insight',ids:['focus','recommendations','insights','profile-context']},
 {route:'recommendations',title:'Tips',ids:['recommendations-disabled']},
] as const;
async function openLens(page:Page,route:string,title:string){
 const menu=page.getByRole('button',{name:'Menu',exact:true});if(await menu.isVisible())await menu.click();
 await page.locator(`[data-nav-action="navigate"][data-nav-route="${route}"]`).click();
 await expect(page.locator('.lens-page-header[data-lens-shell-view] h2')).toHaveText(title);
}
async function order(page:Page,route:string){
 return page.locator(`.lens-page-widgets[data-lens-route="${route}"] > [data-widget-id]`).evaluateAll(nodes=>nodes.map(node=>node.getAttribute('data-widget-id')!));
}
async function checkLenses(page:Page,labsOrder:readonly string[]){
 for(const lens of lenses){
  await openLens(page,lens.route,lens.title);
  if(lens.route==='recommendations'){
   await expect(page.locator('[data-widget-id="recommendations-disabled"][data-lens-shell-view]')).toBeVisible();
   await expect(page.getByRole('button',{name:'Open settings',exact:true})).toBeVisible();
  }else{
   await expect.poll(()=>order(page,lens.route)).toEqual(lens.route==='labs'?labsOrder:[...lens.ids]);
   await expect(page.locator(`.lens-page-widgets[data-lens-route="${lens.route}"][data-lens-shell-view]`)).toBeVisible();
   for(const id of lens.ids)await expect(page.locator(`.lens-page-widgets[data-lens-route="${lens.route}"] > [data-widget-id="${id}"][data-lens-shell-view]`)).toBeVisible();
  }
 }
}
async function checkColdLenses(page:Page,labsOrder:readonly string[]){
 const origin=new URL(page.url()).origin,latest=new Set<string>(),pending=new Map<Request,string>();
 const requested=(request:Request)=>{
  const url=new URL(request.url());
  if(request.method()!=='GET'||url.origin!==origin||(!url.pathname.startsWith('/_app/immutable/')&&url.pathname!=='/css/genetics.css'))return;
  latest.delete(url.href);latest.add(url.href);pending.set(request,url.href);
  if(latest.size>8)latest.delete(latest.values().next().value!);
  if(pending.size>8)pending.delete(pending.keys().next().value!);
 };
 const settled=(request:Request)=>{pending.delete(request);};
 page.on('request',requested);page.on('requestfinished',settled);page.on('requestfailed',settled);
 try{await checkLenses(page,labsOrder);}
 catch(error){
  try{await captureOfflineRouteFailureDiagnostics(page,test.info(),[...new Set([...pending.values(),...[...latest].reverse()])].slice(0,8));}
  catch{/* Evidence must never replace the original acceptance failure. */}
  throw error;
 }finally{page.off('request',requested);page.off('requestfinished',settled);page.off('requestfailed',settled);}
}
test('static shared lens chrome and keyboard ordering survive closed-client offline launches without changing profile records',async({page,context})=>{
 test.setTimeout(120000);await installDiscussionFixture(context);await installOfflineStartupDiagnostics(context);
 await context.addInitScript(({defaults,demo})=>{
  if(!['http:','https:'].includes(location.protocol))return;
  localStorage.setItem('labcharts-ai-paused','true');localStorage.setItem('labcharts-show-product-recs','false');
  if(localStorage.getItem('lens-shell-seeded'))return;localStorage.setItem('lens-shell-seeded','1');
  localStorage.setItem('labcharts-profiles',JSON.stringify([{id:'default',name:'Alex',sex:'male',dob:'1987-11-22',createdAt:1}]));localStorage.setItem('labcharts-active-profile','default');
  for(const key of ['tour','emptyTour'])localStorage.setItem(`labcharts-default-${key}`,'completed');
  localStorage.setItem('labcharts-default-imported',JSON.stringify({...defaults,entries:demo.entries,refOverrides:demo.refOverrides,profile:{firstName:'Alex',age:38},markerNotes:{'thyroid.tsh':'Preserve unrelated note'},sunDefaults:{fitzpatrick:'II',completedAt:1},contextNotes:'Preserve unrelated context'}));
 },{defaults:createDefaultProfileData(),demo:JSON.parse(await fs.readFile('data/demo-male.json','utf8')) as Record<string,unknown>});
 const errors:string[]=[],csp:string[]=[];const observe=(p:Page)=>p.on('pageerror',error=>errors.push(error.message));observe(page);context.on('page',observe);
 await context.exposeBinding('lensShellCsp',(_,value:string)=>csp.push(value));
 await context.addInitScript(()=>document.addEventListener('securitypolicyviolation',event=>{void(window as unknown as {lensShellCsp(value:string):Promise<void>}).lensShellCsp(event.violatedDirective);}));
 const server=await startKitServer(process.env.GETBASED_KIT_ARTIFACT||path.resolve('.local-notes/sveltekit-build'));
 try{
  await page.clock.setFixedTime(new Date('2026-08-07T12:00:00Z'));
  const loading=[{phase:'initial-online',readyMs:await ready(page,server.origin)}];
  const before=await page.evaluate(readComparisonAcceptanceProfile);server.state.offline=true;
  await checkLenses(page,['quick-markers','key-trends']);await openLens(page,'labs','Labs');
  const down=page.locator('[data-widget-id="quick-markers"] button[data-lens-page-action="move-widget"][data-lens-page-direction="1"]');
  await down.focus();await expect(down).toBeFocused();await page.keyboard.press('Enter');
  const changedOrder=['key-trends','quick-markers'];await expect.poll(()=>order(page,'labs')).toEqual(changedOrder);
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('labcharts-default-lensPageOrder-labs-v1')||'null'))).toEqual(changedOrder);
  expect(await page.evaluate(readComparisonAcceptanceProfile)).toEqual(before);await page.close();
  for(let launch=0;launch<2;launch++){
   const cold=await context.newPage();await cold.clock.setFixedTime(new Date('2026-08-07T12:00:00Z'));
   loading.push({phase:`offline-cold-${launch+1}`,readyMs:await ready(cold,server.origin)});await checkColdLenses(cold,changedOrder);
   expect(await cold.evaluate(readComparisonAcceptanceProfile)).toEqual(before);await cold.close();
  }
  expect(errors).toEqual([]);expect(csp).toEqual([]);await fs.writeFile(test.info().outputPath('lens-shell-loading.json'),JSON.stringify(loading,null,2));
 }finally{await server.close();}
});
