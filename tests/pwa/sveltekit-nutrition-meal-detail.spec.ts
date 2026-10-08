import path from 'node:path';
import {expect,test,type Page} from '@playwright/test';
import {createDefaultProfileData} from '../../js/profile.js';
import type {ProfileData} from '../../types/app-state.js';
import {startKitServer} from './kit-server.js';
import {installDiscussionFixture} from '../helpers/chat-discussion-fixture.js';
import {seedNutritionMealDetail} from '../helpers/nutrition-meal-detail-fixture.js';
import {captureOfflineLaunchDiagnostics,navigateWithOfflineLaunchDiagnostics} from '../helpers/offline-launch-diagnostics.js';
const artifact=process.env.GETBASED_KIT_ARTIFACT||path.resolve('.local-notes/sveltekit-build');
async function ready(page:Page,origin:string){
 await navigateWithOfflineLaunchDiagnostics(page,origin+'/app?dev-sw=1',test.info());
 try{await expect(page.locator('html[data-app-ready][data-shell-framework="sveltekit"]')).toBeAttached({timeout:30000});}
 catch(error){await captureOfflineLaunchDiagnostics(page,test.info());throw error;}
 await page.evaluate(()=>navigator.serviceWorker.ready.then(()=>true));await expect.poll(()=>page.evaluate(()=>!!navigator.serviceWorker.controller)).toBe(true);
}
async function stored(page:Page):Promise<ProfileData>{
 return page.evaluate(async()=>{
  const request=indexedDB.open('labcharts-blobs',1),db=await new Promise<IDBDatabase>((resolve,reject)=>{request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
  try{const tx=db.transaction('kv','readonly'),read=tx.objectStore('kv').get('labcharts-default-imported');return await new Promise<ProfileData>((resolve,reject)=>{tx.oncomplete=()=>typeof read.result==='string'?resolve(JSON.parse(read.result)):reject(new Error('Missing committed profile'));tx.onabort=()=>reject(tx.error||new Error('Read aborted'));tx.onerror=()=>reject(tx.error||read.error||new Error('Read failed'));});}finally{db.close();}
 });
}
async function openDetail(page:Page){
 const menu=page.getByRole('button',{name:'Menu',exact:true});if(await menu.isVisible())await menu.click();
 await page.locator('.nav-item[data-category="insight"]').click();await expect(page.locator('[data-context-cards-view]')).toBeVisible();
 await page.locator('[data-context-card-key="diet"] [data-nutrition-context-link]').click();await expect(page.locator('[data-nutrition-history-view]')).toBeVisible();
 await page.locator('[data-nutrition-action="detail"][data-nutrition-id="detail-owned"]').click();const modal=page.locator('#detail-modal');
 await expect(modal.locator('[data-nutrition-meal-detail-view]')).toBeVisible();await expect(modal).toContainText('Fixture vision label scan via ollama');await expect(modal.locator('.nutrition-detail-photo')).toHaveCount(2);
 await expect(modal).toContainText('Keep this meal note');await expect(modal).toContainText('150 tokens (100 in · 50 out)');
}
function unchanged(profile:ProfileData):ProfileData{
 if (!profile.nutritionMeals) return {...profile};
 return {...profile,nutritionMeals:profile.nutritionMeals.map(meal=>{if(meal.id!=='detail-owned')return meal;const {responseCheckIn:_response,updatedAt:_updated,...stable}=meal;return stable;})};
}
function verifyProfile(profile: ProfileData, before: ReturnType<typeof unchanged>, started: number) {
  const previous = before._deletedClearedAt as Record<string, Record<string, unknown>> | undefined;
  // Meal saves already record a restore clock for this record. Keep all other
  // fields exact, and positively assert the one expected sync metadata change.
  expect(unchanged(profile)).toEqual({ ...before, _deletedClearedAt: {
    ...previous, nutritionMeals: { ...previous?.nutritionMeals, 'detail-owned': expect.any(Number) },
  } });
  const metadata = profile._deletedClearedAt as Record<string, Record<string, number>>;
  expect(Number.isFinite(metadata.nutritionMeals!['detail-owned'])).toBe(true);
  expect(metadata.nutritionMeals!['detail-owned']).toBeGreaterThanOrEqual(started);
  const meal = profile.nutritionMeals?.find(value => value.id === 'detail-owned');
  expect(new Date(String(meal?.updatedAt)).getTime()).toBeGreaterThanOrEqual(started);
}
test('static authored meal details save and clear check-ins offline through two cold launches while preserving other profile data',async({page,context})=>{
 test.setTimeout(120000);await installDiscussionFixture(context);const defaults=createDefaultProfileData();delete defaults.manualValues;await context.addInitScript(seedNutritionMealDetail,defaults);
 const errors:string[]=[],csp:string[]=[];page.on('pageerror',error=>errors.push(error.message));context.on('page',target=>target.on('pageerror',error=>errors.push(error.message)));
 await context.exposeBinding('nutritionDetailCsp',(_,directive:string)=>{csp.push(directive);});await context.addInitScript(()=>document.addEventListener('securitypolicyviolation',event=>{void(window as unknown as{nutritionDetailCsp(value:string):Promise<void>}).nutritionDetailCsp(event.violatedDirective);}));
 const server=await startKitServer(artifact);
 try{
  await ready(page,server.origin);const before=unchanged(await stored(page)),started=Date.now();await expect(page.locator('link[href="/css/nutrition.css"]')).toHaveCount(0);server.state.offline=true;
  await openDetail(page);await page.getByLabel('Still satisfied',{exact:true}).check();await page.getByLabel('Steady',{exact:true}).check();await page.locator('[data-nutrition-action="save-response"]').click();await expect(page.locator('.nutrition-response-card')).toContainText('Checked in');const saved=await stored(page);expect(saved.nutritionMeals?.find(meal=>meal.id==='detail-owned')?.responseCheckIn).toMatchObject({satiety2h:3,energy2h:2});verifyProfile(saved,before,started);await page.close();
  for(let launch=0;launch<2;launch++){
   const cold=await context.newPage();await ready(cold,server.origin);await openDetail(cold);
   if(launch===0){await expect(cold.getByLabel('Still satisfied',{exact:true})).toBeChecked();await expect(cold.getByLabel('Steady',{exact:true})).toBeChecked();await cold.locator('[data-nutrition-action="clear-response"]').click();await expect(cold.locator('.nutrition-response-card')).toContainText('Optional');}
   else{await expect(cold.locator('.nutrition-response-card input:checked')).toHaveCount(0);await cold.getByLabel('Slump',{exact:true}).check();await cold.locator('[data-nutrition-action="save-response"]').click();await expect(cold.locator('.nutrition-response-card')).toContainText('Checked in');}
   const profile=await stored(cold);verifyProfile(profile,before,started);
   if(launch===0)expect(profile.nutritionMeals?.find(meal=>meal.id==='detail-owned')).not.toHaveProperty('responseCheckIn');
   else expect(profile.nutritionMeals?.find(meal=>meal.id==='detail-owned')?.responseCheckIn).toMatchObject({energy2h:1});
   await cold.locator('#detail-modal .modal-close').click();await expect(cold.locator('#modal-overlay')).not.toHaveClass(/show/);await cold.close();
  }
  expect(errors).toEqual([]);expect(csp).toEqual([]);
 }finally{await server.close();}
});
