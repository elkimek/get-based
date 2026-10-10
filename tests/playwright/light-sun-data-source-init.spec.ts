import {expect,test} from './coverage-fixture.js';
import {createDefaultProfileData} from '../../js/profile.js';
import {seedLightPageFixture} from '../helpers/light-page-fixture.js';
import {installDiscussionFixture} from '../helpers/chat-discussion-fixture.js';
import type {Page} from '@playwright/test';

const initial={mode:'auto',selfhostUrl:'https://uv.synthetic.invalid/original',selfhostBearer:'synthetic-original-secret',privacyRounding:0.1};
async function readConfig(page:Page){return page.evaluate(async()=>{
 const {encryptedGetItem}=await import('/js/crypto.js');
 const raw=localStorage.getItem('labcharts-meteo-config');
 const plain=await encryptedGetItem('labcharts-meteo-config');
 return {raw,parsed:plain?JSON.parse(plain) as unknown:null};
});}
async function readProfile(page:Page){return page.evaluate(async()=>{
 const {state}=await import('/js/state.js');const {encryptedGetItem}=await import('/js/crypto.js');
 return {imported:JSON.parse(JSON.stringify(state.importedData)) as unknown,profiles:JSON.parse(JSON.stringify(state.profiles)) as unknown,
  current:state.currentProfile,committed:await encryptedGetItem('labcharts-default-imported'),registry:localStorage.getItem('labcharts-profiles'),active:localStorage.getItem('labcharts-active-profile')};
});}

test('cold public Light navigation installs Sun delegates without loading Settings',async({page,context},info)=>{
 test.setTimeout(60000);
 await installDiscussionFixture(context,{provider:'openrouter',paused:true});
 await context.addInitScript(seedLightPageFixture,{defaults:createDefaultProfileData()});
 await context.addInitScript(initial=>{
  if(!['http:','https:'].includes(location.protocol)||localStorage.getItem('sun-delegate-fixture'))return;
  localStorage.setItem('sun-delegate-fixture','1');localStorage.setItem('labcharts-meteo-config',JSON.stringify(initial));
 },initial);
 const settingsRequests:string[]=[],externalRequests:string[]=[],errors:string[]=[],csp:string[]=[];
 page.on('request',request=>{if(new URL(request.url()).pathname==='/js/settings.js')settingsRequests.push(request.url());});
 page.on('pageerror',error=>errors.push(error.message));
 await context.route('**/*',async route=>{
  const url=new URL(route.request().url());
  if(url.origin!==new URL(test.info().project.use.baseURL!).origin){externalRequests.push(url.href);await route.abort('blockedbyclient');return;}
  await route.continue();
 });
 await context.exposeBinding('sunDelegateCsp',(_,value:string)=>csp.push(value));
 await context.addInitScript(()=>{
  const changes:Array<{target:string;trusted:boolean}>=[];
  Object.assign(window,{sunDelegateChanges:changes});
  document.addEventListener('change',event=>{
   const el=event.target;if(el instanceof Element&&el.closest('#sun-data-source-section'))changes.push({target:el.id||el.getAttribute('value')||el.tagName,trusted:event.isTrusted});
  },true);
  document.addEventListener('securitypolicyviolation',event=>{void(window as unknown as {sunDelegateCsp(value:string):Promise<void>}).sunDelegateCsp(event.violatedDirective);});
 });
 await page.goto('/app');
 await expect(page.locator('html[data-app-ready]')).toBeAttached();
 // Public shell navigation is the sole initialization stimulus. No Settings
 // prewarm, manual installer, renderer replacement, save/store or timer mock.
 const menu=page.getByRole('button',{name:'Menu',exact:true});if(await menu.isVisible())await menu.click();
 await page.locator('[data-nav-action="navigate"][data-nav-route="light"]').click();
 await expect(page.locator('.light-page[data-light-page-presentation]')).toBeVisible();
 const details=page.locator('.light-data-source-details');await details.locator('summary').click();
 await expect(details).toHaveAttribute('open','');
 const fields=page.locator('#meteo-selfhost-fields');await expect(fields).toBeHidden();
 expect(settingsRequests).toEqual([]);
 const before=await readProfile(page);const beforeConfig=await readConfig(page);expect(beforeConfig.parsed).toEqual(initial);
 await page.locator('input[name="meteo-mode"][value="selfhost"]').click();
 await expect(fields).toBeVisible();
 await expect.poll(async()=> (await readConfig(page)).parsed).toEqual({...initial,mode:'selfhost'});
 const url='https://uv.synthetic.invalid/revised',bearer='synthetic-revised-secret';
 await page.locator('#meteo-selfhost-url').fill(url);await page.locator('#meteo-selfhost-url').press('Tab');
 await expect.poll(async()=> (await readConfig(page)).parsed).toEqual({...initial,mode:'selfhost',selfhostUrl:url});
 await page.locator('#meteo-selfhost-bearer').fill(bearer);await page.locator('#meteo-selfhost-bearer').press('Tab');
 await expect.poll(async()=> (await readConfig(page)).parsed).toEqual({...initial,mode:'selfhost',selfhostUrl:url,selfhostBearer:bearer});
 await page.locator('input[name="meteo-mode"][value="open-meteo"]').click();
 await expect(fields).toBeHidden();
 const expected={...initial,mode:'open-meteo',selfhostUrl:url,selfhostBearer:bearer};
 await expect.poll(async()=> (await readConfig(page)).parsed).toEqual(expected);
 const saved=await readConfig(page);expect(saved.raw).toMatch(/^d1:/);expect(saved.raw).not.toContain(url);expect(saved.raw).not.toContain(bearer);
 expect(await readProfile(page)).toEqual(before);
 const changes=await page.evaluate(()=>(window as unknown as {sunDelegateChanges:Array<{target:string;trusted:boolean}>}).sunDelegateChanges);
 expect(changes).toEqual([{target:'selfhost',trusted:true},{target:'meteo-selfhost-url',trusted:true},{target:'meteo-selfhost-bearer',trusted:true},{target:'open-meteo',trusted:true}]);
 expect(settingsRequests).toEqual([]);expect(externalRequests).toEqual([]);expect(errors).toEqual([]);expect(csp).toEqual([]);
 await info.attach('cold-Light-native-Sun-initialization',{body:JSON.stringify({before,after:await readProfile(page),initial:beforeConfig,saved,changes,settingsRequests,externalRequests,errors,csp},null,2),contentType:'application/json'});
});
