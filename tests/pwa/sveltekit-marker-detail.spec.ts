import fs from 'node:fs/promises';
import {expect,test,type Page,type Locator,type TestInfo} from '@playwright/test';
import {startKitServer} from './kit-server.js';
import {activate,artifactInputs,cacheReceipt,profile} from './kit-native-receipts.js';
import {installDiscussionFixture} from '../helpers/chat-discussion-fixture.js';
import {installOfflineStartupDiagnostics} from '../helpers/offline-launch-diagnostics.js';
import {readyLightArtifact as ready} from '../helpers/light-artifact-navigation.js';
import {expectedNote,requireExactReceipt,noteText,type NativeProfileReceipt} from '../helpers/marker-detail-pwa-receipt.js';
import {qualifyMarkerDetailNativeShell,modules,sheets} from '../helpers/marker-detail-pwa-receipt.js';
const albumin='proteins_albumin',bio='calculatedRatios_biologicalAge';
const pinKey='labcharts-default-dashboardQuickMarkerPinsV1';
interface NativeAction {type:string;action:string;id:string|null;trusted:boolean}
interface NativeEscape {key:string;modalVisible:boolean;trusted:boolean}
interface ObserverWindow extends Window {markerPwaEscape(value:NativeEscape):Promise<void>;markerPwaAction(value:NativeAction):Promise<void>;markerPwaCsp(value:string):Promise<void>}
async function preferenceReceipt(page:Page){return page.evaluate(keys=>Object.fromEntries(keys.map(key=>[key,localStorage.getItem(key)])),[pinKey,'labcharts-default-showAltUnits','labcharts-default-units','labcharts-default-rangeMode']);}
async function navigateCategory(page:Page,category:string){
 const close=page.getByRole('button',{name:'Close chat',exact:true});if(await close.isVisible())await activate(page,close);
 const nav=page.locator('#sidebar-nav .nav-item[data-nav-action="navigate"][data-category="'+category+'"]');
 const menu=page.getByRole('button',{name:'Menu',exact:true});const sidebar=page.locator('#sidebar-nav');
 if(await menu.isVisible()){if(!await sidebar.evaluate(node=>node.classList.contains('mobile-open')))await activate(page,menu);await expect(sidebar).toHaveClass(/\bmobile-open\b/);await expect(page.locator('#sidebar-backdrop')).toBeVisible();}
 await expect(nav).toBeVisible();await activate(page,nav);await expect(nav).toHaveClass(/\bactive\b/);
 return page.locator('.chart-card-main[data-marker-detail-action="show-detail-modal"][data-marker-detail-id="'+(category==='proteins'?albumin:bio)+'"]');
}
async function open(page:Page,card:Locator){await expect(card).toBeVisible();await card.focus();await activate(page,card);await expect(page.locator('#modal-overlay')).toBeVisible();await expect(page.locator('#detail-modal')).toHaveClass(/\bmarker-detail-modal\b/);}
async function assertAlbumin(page:Page){
 const modal=page.locator('#detail-modal');await expect(modal.locator('h3')).toContainText('Albumin');
 await expect(modal.locator('#marker-desc.loaded')).toHaveText('The most abundant blood protein made by the liver; low levels indicate malnutrition, liver disease, or chronic inflammation.');
 await expect(modal.locator('.modal-unit-alt')).toContainText('g/dl');
 await expect(modal.locator('#chart-modal')).toBeVisible();await expect(modal.locator('.marker-history-list .modal-value-card')).not.toHaveCount(0);
 await expect(modal.locator('[data-marker-detail-action="open-manual-entry"]')).toBeVisible();
 await expect(modal.locator('[data-marker-detail-action="ask-ai"]')).toBeVisible();
}
async function snapshot(page:Page,label:string,info:TestInfo){
 const value=await page.locator('#detail-modal').evaluate(modal=>({html:modal.outerHTML,active:document.activeElement?.outerHTML??null,bodyOverflow:getComputedStyle(document.body).overflow,
  landmarks:Array.from(modal.querySelectorAll('.gb-detail-head,#marker-desc,.gb-detail-summary,.marker-history-list,.marker-note-section,.bio-age-breakdown,.bio-age-component')).map(node=>{const style=getComputedStyle(node);const box=node.getBoundingClientRect();return {tag:node.tagName,class:node.className,text:node.textContent,rect:{x:box.x,y:box.y,width:box.width,height:box.height},style:Array.from(style).map(name=>[name,style.getPropertyValue(name),style.getPropertyPriority(name)])};})}));
 await info.attach(label,{body:JSON.stringify(value,null,2),contentType:'application/json'});return value;
}
test('complete Marker Detail first construction offline and two zero-page cold launches retain one native note mutation',async({page,context,browserName},info)=>{
 test.setTimeout(180000);const artifact=await artifactInputs(modules,sheets),sw=await fs.readFile('service-worker-assets.js','utf8');qualifyMarkerDetailNativeShell(sw);
 const seeded=JSON.parse(await fs.readFile(new URL('../fixtures/marker-detail-complete/pwa-profile.json',import.meta.url),'utf8')) as Record<string,unknown>;expect(Object.keys(seeded)).toHaveLength(39);expect(seeded.markerNotes).toEqual({});
 await installDiscussionFixture(context,{provider:'openrouter',paused:true});await installOfflineStartupDiagnostics(context);
 const registry=JSON.parse(await fs.readFile(new URL('../fixtures/marker-detail-complete/pwa-registry.json',import.meta.url),'utf8'));
 await context.addInitScript(({seeded,registry})=>{
  if(!['http:','https:'].includes(location.protocol)||localStorage.getItem('marker-detail-pwa-seeded'))return;
  localStorage.setItem('marker-detail-pwa-seeded','1');localStorage.setItem('labcharts-theme','dark');localStorage.setItem('labcharts-profiles',JSON.stringify(registry));localStorage.setItem('labcharts-active-profile','default');localStorage.setItem('labcharts-default-imported',JSON.stringify(seeded));
  localStorage.setItem('labcharts-default-showAltUnits','on');localStorage.setItem('labcharts-default-units','EU');localStorage.setItem('labcharts-default-rangeMode','both');localStorage.setItem('labcharts-default-dashboardQuickMarkerPinsV1','[]');
  localStorage.setItem('labcharts-analytics-disabled','true');localStorage.setItem('labcharts-show-product-recs','false');localStorage.setItem('labcharts-last-manual-backup',new Date().toISOString());
 },{seeded,registry});
 const errors:string[]=[],csp:string[]=[],external:string[]=[],actions:NativeAction[]=[],escapes:NativeEscape[]=[],traffic:Array<{method:string;url:string}> = [],failures:Array<{method:string;url:string;error:string|null}>=[];
 const observe=(target:Page)=>{target.on('pageerror',error=>errors.push(error.message));target.on('requestfailed',request=>failures.push({method:request.method(),url:request.url(),error:request.failure()?.errorText??null}));};observe(page);context.on('page',observe);
 context.on('request',request=>traffic.push({method:request.method(),url:request.url()}));await context.exposeBinding('markerPwaEscape',(_,value:NativeEscape)=>escapes.push(value));await context.exposeBinding('markerPwaAction',(_,value:NativeAction)=>actions.push(value));await context.exposeBinding('markerPwaCsp',(_,value:string)=>csp.push(value));
 await context.addInitScript(()=>{const observer=window as unknown as ObserverWindow;for(const type of ['click','keydown'])document.addEventListener(type,event=>{if(event.type==='keydown'&&!['Enter',' '].includes((event as KeyboardEvent).key))return;const target=event.target instanceof Element?event.target.closest<HTMLElement>('[data-marker-detail-action]'):null;if(target)void observer.markerPwaAction({type:event.type,action:target.dataset.markerDetailAction!,id:target.dataset.markerDetailId??null,trusted:event.isTrusted});},true);document.addEventListener('keydown',event=>{if(event.key==='Escape')void observer.markerPwaEscape({key:event.key,modalVisible:document.getElementById('modal-overlay')?.classList.contains('show')===true,trusted:event.isTrusted});},true);document.addEventListener('securitypolicyviolation',event=>void observer.markerPwaCsp(event.violatedDirective));});
 const server=await startKitServer(artifact.directory);let stopped=false;
 await context.route('**/*',async route=>{const url=new URL(route.request().url());if(['http:','https:'].includes(url.protocol)&&url.origin!==server.origin){external.push(url.href);await route.abort();}else await route.continue();});
 const phases:unknown[]=[];let before:NativeProfileReceipt|null=null,expected:NativeProfileReceipt|null=null;
 try{
  await ready(page,server.origin);await ready(page,server.origin);await expect(page.locator('#detail-modal.marker-detail-modal')).toHaveCount(0);
  before=await profile(page,artifact.state);expect(before.stored).toEqual(seeded);expect(before.profiles).toEqual(registry);expect(before.rawProfiles).toBe(JSON.stringify(registry));const cache=await cacheReceipt(page,artifact),preferences=await preferenceReceipt(page);
  await info.attach('marker-initial-profile-cache',{body:JSON.stringify({artifact,before,expected,cache,preferences},null,2),contentType:'application/json'});
  await server.close();stopped=true;await expect(fetch(server.origin+'/index.html')).rejects.toThrow();
  for(let phase=0;phase<3;phase++){
   if(phase){expect(context.pages()).toHaveLength(0);page=await context.newPage();await ready(page,server.origin);}
   requireExactReceipt(await profile(page,artifact.state),phase?expected!:before);
   const card=await navigateCategory(page,'proteins');await open(page,card);await assertAlbumin(page);await snapshot(page,'marker-phase-'+phase+'-opened',info);
   await page.keyboard.press('Escape');await expect(page.locator('#modal-overlay')).toBeHidden();await expect(card).toBeFocused();
   await open(page,card);const pin=page.locator('#detail-modal [data-marker-detail-action="quick-pin"]');await expect(pin).toHaveAttribute('aria-pressed','false');await activate(page,pin);await expect(pin).toHaveAttribute('aria-pressed','true');expect(await page.evaluate(key=>localStorage.getItem(key),pinKey)).toBe('["proteins_albumin"]');requireExactReceipt(await profile(page,artifact.state),phase?expected!:before);await activate(page,pin);await expect(pin).toHaveAttribute('aria-pressed','false');expect(await page.evaluate(key=>localStorage.getItem(key),pinKey)).toBe('[]');requireExactReceipt(await profile(page,artifact.state),phase?expected!:before);
   const editNote=page.locator('#detail-modal .marker-note-edit-btn[data-marker-detail-action="toggle-marker-note-editor"]');
   if(browserName==='firefox'){
    // Native auto-content history rows first occupy intrinsic placeholders; realize them before scrolling below the list.
    const history=page.locator('#detail-modal .marker-history-list');await history.scrollIntoViewIfNeeded();
    await expect.poll(()=>history.locator('.marker-history-row').evaluateAll(rows=>rows.length>0&&rows.every(row=>row.querySelector('.marker-history-date-row')?.checkVisibility({contentVisibilityAuto:true})===true))).toBe(true);
    await editNote.scrollIntoViewIfNeeded();await expect(editNote).toBeInViewport();await info.attach('marker-phase-'+phase+'-note-trigger-rendered',{body:await editNote.screenshot(),contentType:'image/png'});
   }
   await activate(page,editNote);const note=page.locator('#marker-note-input');await expect(note).toBeFocused();
   if(!phase){await note.fill('  '+noteText+'  ');const minimum=await page.evaluate(()=>Date.now());await activate(page,page.locator('#detail-modal [data-marker-detail-action="save-marker-note"]'));await expect(page.locator('#detail-modal .marker-note-text')).toHaveText(noteText);const maximum=await page.evaluate(()=>Date.now());const saved=await profile(page,artifact.state);const row=(saved.profiles as Array<Record<string,unknown>>).find(row=>row.id==='default');expect(row).toBeDefined();expected=expectedNote(before,Number(row!.lastUpdated),{minimum,maximum});requireExactReceipt(saved,expected);await info.attach('marker-save-clock-bounds',{body:JSON.stringify({minimum,maximum,before,saved,expected},null,2),contentType:'application/json'});} 
   else{await expect(note).toHaveValue(noteText);await activate(page,page.locator('#detail-modal .marker-note-actions [data-marker-detail-action="toggle-marker-note-editor"]'));await expect(page.locator('#marker-note-editor')).toBeHidden();}
   await expect(page.locator('#detail-modal .marker-note-text b')).toHaveCount(0);await snapshot(page,'marker-phase-'+phase+'-note',info);await page.keyboard.press('Escape');await expect(page.locator('#modal-overlay')).toBeHidden();
   const bioCard=await navigateCategory(page,'calculatedRatios');await open(page,bioCard);await expect(page.locator('#detail-modal h3')).toContainText('Biological Age');await expect(page.locator('.bio-age-breakdown')).toBeVisible();await expect(page.locator('.bio-age-component')).toHaveCount(2);
   const pheno=page.locator('.bio-age-component').filter({has:page.locator('strong',{hasText:'PhenoAge:'})});await expect(pheno).toHaveClass(/\bbio-age-component-ok\b/);await expect(pheno.locator('.bio-age-input')).toHaveCount(9);await expect(pheno.locator('.bio-age-input.is-missing')).toHaveCount(0);
   await expect(page.locator('.bio-age-breakdown-sub')).toHaveText('Based on your panel from Nov 2025');await expect(page.locator('#detail-modal [data-marker-detail-date="2026-07-12"]')).toHaveCount(0);await snapshot(page,'marker-phase-'+phase+'-bio-age',info);await page.keyboard.press('Escape');await expect(page.locator('#modal-overlay')).toBeHidden();await expect(bioCard).toBeFocused();
   const current=await profile(page,artifact.state);requireExactReceipt(current,expected!);expect(await preferenceReceipt(page)).toEqual(preferences);expect(await cacheReceipt(page,artifact)).toEqual(cache);phases.push({phase,profile:current,preferences:await preferenceReceipt(page)});await page.close();expect(context.pages()).toHaveLength(0);
  }
  const expectedActions:NativeAction[]=[];const action=(action:string,id:string|null,trusted=true):NativeAction=>({type:'click',action,id,trusted});for(let phase=0;phase<3;phase++)expectedActions.push(action('show-detail-modal',albumin),action('close-modal',null,false),action('show-detail-modal',albumin),action('quick-pin',albumin),action('quick-pin',albumin),action('toggle-marker-note-editor',null),phase?action('toggle-marker-note-editor',null):action('save-marker-note',albumin),action('close-modal',null,false),action('show-detail-modal',bio),action('close-modal',null,false));expect(actions).toEqual(expectedActions);expect(escapes).toEqual(Array.from({length:9},()=>({key:'Escape',modalVisible:true,trusted:true})));expect(actions.filter(action=>action.action==='quick-pin')).toHaveLength(6);expect(actions.filter(action=>action.action==='save-marker-note')).toEqual([{type:'click',action:'save-marker-note',id:albumin,trusted:true}]);expect(errors).toEqual([]);expect(csp).toEqual([]);expect(external).toEqual([]);expect(await artifactInputs(modules,sheets)).toEqual(artifact);
  await info.attach('marker-complete-offline-cold-acceptance',{body:JSON.stringify({artifact,before,expected,cache,phases,actions,escapes,traffic,failures,errors,csp,external,boundary:'Real optimized app/category/card actions, schema description, alternate units, reversible native pin preference, one trimmed/literal note mutation with whole39-field live/IDB/wire exact and one bounded native default registry timestamp; all other registry fields/rows and exact raw wire retained. Three offline phases/two zero-page launches with stopped origin. Visible Biological Age uses historical qualified hsCRP panel when latest has standard CRP; no numeric assay substitution. Hidden standalone PhenoAge/Bortz missing-input explanation conditional remains separate accepted native evidence, not this UI path. Four maintained headless profiles. Test worker/version release seam retained. No provider/user data/OS installation/update/theme matrix/whole-app acceptance.'},null,2),contentType:'application/json'});
 }finally{await info.attach('marker-terminal-observer-raw',{body:JSON.stringify({actions,escapes,traffic,failures,errors,csp,external,phases},null,2),contentType:'application/json'});if(!stopped)await server.close();}
});
