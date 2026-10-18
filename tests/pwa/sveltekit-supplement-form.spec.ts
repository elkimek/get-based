import fs from 'node:fs/promises';
import {expect,test,type Page} from '@playwright/test';
import {createDefaultProfileData,migrateProfileData} from '../../js/profile.js';
import {startKitServer} from './kit-server.js';
import {installDiscussionFixture} from '../helpers/chat-discussion-fixture.js';
import {installOfflineStartupDiagnostics} from '../helpers/offline-launch-diagnostics.js';
import {readyLightArtifact as ready} from '../helpers/light-artifact-navigation.js';
import {activate,artifactInputs,cacheReceipt,profile} from './kit-native-receipts.js';
import {verifySupplementEdit,type SupplementEdit} from '../helpers/supplement-pwa-receipt.js';
const authored=['js/supplement-form-presentation.js','js/components/SupplementIngredientRow.svelte.html.js','js/components/SupplementPeriodRow.svelte.html.js',
 'js/components/SupplementQualityRow.svelte.html.js','js/components/SupplementForm.svelte.html.js',
 'js/supplement-dashboard-presentation.js','js/components/SupplementTimeline.svelte.html.js',
 'js/components/SupplementTimelineRow.svelte.html.js','js/components/SupplementTimelineBar.svelte.html.js','js/components/SupplementMitoEvidence.svelte.html.js'] as const;
// Require actual bundled component sources; native public facade cache assertions remain exact.
const artifactOwners=['js/supplement-form-presentation.js','js/components/SupplementIngredientRow.svelte.html.js','js/components/SupplementPeriodRow.svelte.html.js',
 'js/components/SupplementQualityRow.svelte.html.js','js/components/SupplementForm.svelte.html.js',
 'js/supplement-dashboard-presentation.js','js/components/SupplementTimeline.svelte.html.js',
 'js/components/SupplementTimelineRow.svelte','js/components/SupplementTimelineBar.svelte','js/components/SupplementMitoEvidence.svelte'] as const;
const modules=[...artifactOwners,'js/supplement-form-ui.js','js/supplements.js','js/supplement-action-delegates.js',
 'js/supplement-medication-domain.js','js/supplement-quality.js','js/data-core.js','js/profile-data-writes.js','js/profile.js','js/profile-list-store.js','js/state.js'] as const;
const sheets=['css/context-profile.css','css/modal-shared.css','styles.css'] as const;
type NativeProfile=Awaited<ReturnType<typeof profile>>;
interface EventReceipt {type:string;target:string;action:string|null;trusted:boolean;value:string|null}
interface ObservedWindow extends Window {supplementPwaEvent(value:EventReceipt):Promise<void>;supplementPwaCsp(value:string):Promise<void>}
const panel=(page:Page)=>page.locator('#modal-overlay.show #supp-form-panel[data-edit-index="0"]');
async function showWidget(page:Page){
 const close=page.getByRole('button',{name:'Close chat',exact:true});if(await close.isVisible())await activate(page,close);
 const manage=page.locator('.dashboard-widget[data-widget-id="supplements"] .supp-add-btn[data-supp-action="open-editor"]');
 if(!await manage.isVisible()){
  await activate(page,page.locator('[data-dashboard-widget-action="open-picker"]').first());
  const picker=page.locator('#dashboard-widget-picker-overlay:has([data-dashboard-picker-view])');await expect(picker).toBeVisible();
  await activate(page,picker.locator('[data-dashboard-widget-action="show-widget"][data-dashboard-widget-id="supplements"]'));
  await expect(picker).toHaveCount(0);
 }
 await expect(manage).toBeVisible();return manage;
}
async function openForm(page:Page){
 await activate(page,await showWidget(page));await expect(page.locator('#modal-overlay')).toHaveClass(/\bshow\b/);
 await activate(page,page.locator('#detail-modal .supp-list-item[data-supp-action="toggle-accordion"][data-supp-index="0"]'));
 await expect(panel(page)).toBeVisible();await expect(panel(page).locator('#supp-name')).toBeVisible();
}
async function rawForm(page:Page){return panel(page).evaluate(element=>{
 function read(node:Node):unknown{if(node instanceof Element)return {type:node.nodeType,name:node.localName,namespace:node.namespaceURI,attributes:[...node.attributes].map(a=>[a.name,a.value]),defaults:node instanceof HTMLInputElement?{type:node.type,value:node.value,defaultValue:node.defaultValue,checked:node.checked,defaultChecked:node.defaultChecked,disabled:node.disabled,required:node.required,min:node.min,max:node.max,step:node.step,hidden:node.hidden}:node instanceof HTMLSelectElement?{value:node.value,selectedIndex:node.selectedIndex,disabled:node.disabled}:node instanceof HTMLOptionElement?{selected:node.selected,defaultSelected:node.defaultSelected,value:node.value}:node instanceof HTMLTextAreaElement?{value:node.value,defaultValue:node.defaultValue}:null,children:[...node.childNodes].map(read)};return {type:node.nodeType,text:node.nodeValue};}
 return {html:element.outerHTML,tree:read(element),focus:document.activeElement?.id??null};
});}
async function defaults(page:Page,name:string,note:string){
 const form=panel(page);await expect(form.locator('#supp-name')).toHaveValue(name);await expect(form.locator('#supp-note')).toHaveValue(note);
 const ingredient=form.locator('#supp-ingredients .supp-ingredient-row');await expect(ingredient).toHaveCount(1);
 await expect(ingredient.locator('.supp-ing-name')).toHaveValue('Magnesium');await expect(ingredient.locator('.supp-ing-amount')).toHaveValue('25');
 await expect(ingredient.locator('.supp-ing-unit')).toHaveValue('mg');await expect(ingredient.locator('.supp-ing-unit-custom')).toBeHidden();
 await expect(ingredient.locator('.supp-ing-times')).toHaveValue('2');await expect(ingredient.locator('.supp-ing-total')).toHaveText('50 mg/day');
 const period=form.locator('#supp-periods .supp-period-row');await expect(period).toHaveCount(1);
 await expect(period.locator('.supp-period-start')).toHaveValue('2024-01-01');await expect(period.locator('.supp-period-start')).toHaveAttribute('required','');
 await expect(period.locator('.supp-period-end')).toHaveValue('');await expect(period.locator('.supp-period-dose')).toHaveValue('50 mg');await expect(period.locator('.supp-period-remove')).toBeHidden();
 const quality=form.locator('#supp-quality-tests .supp-quality-row');await expect(quality).toHaveCount(1);
 await expect(quality.locator('.supp-quality-category')).toHaveValue('contaminant');await expect(quality.locator('.supp-quality-analyte')).toHaveValue('Lead');
 await expect(quality.locator('.supp-quality-result')).toHaveValue('ND');await expect(quality.locator('.supp-quality-unit')).toHaveValue('mg');
 await expect(quality.locator('.supp-quality-basis')).toHaveValue('per capsule');await expect(quality.locator('.supp-quality-ai-context')).toBeChecked();
}
async function temporaryNativeRows(page:Page){
 const form=panel(page);await activate(page,form.locator('[data-supp-action="add-ingredient"]'));
 const ingredient=form.locator('#supp-ingredients .supp-ingredient-row').last();await expect(form.locator('#supp-ingredients .supp-ingredient-row')).toHaveCount(2);
 await expect(ingredient.locator('.supp-ing-name')).toBeFocused();await expect(ingredient.locator('.supp-ing-name')).toHaveValue('');
 await expect(ingredient.locator('.supp-ing-amount')).toHaveValue('');await expect(ingredient.locator('.supp-ing-unit')).toHaveValue('');
 await expect(ingredient.locator('.supp-ing-unit-custom')).toBeHidden();await expect(ingredient.locator('.supp-ing-times')).toHaveValue('');
 await activate(page,ingredient.locator('[data-supp-action="remove-ingredient"]'));await expect(form.locator('#supp-ingredients .supp-ingredient-row')).toHaveCount(1);
 await activate(page,form.locator('[data-supp-action="add-period"]'));const period=form.locator('#supp-periods .supp-period-row').last();await expect(form.locator('#supp-periods .supp-period-row')).toHaveCount(2);
 await expect(period.locator('.supp-period-start')).toHaveValue('');await expect(period.locator('.supp-period-end')).toHaveValue('');await expect(period.locator('.supp-period-dose')).toHaveValue('');
 await activate(page,period.locator('[data-supp-action="remove-period"]'));await expect(form.locator('#supp-periods .supp-period-row')).toHaveCount(1);
 await activate(page,form.locator('[data-supp-action="add-quality-test"]'));const quality=form.locator('#supp-quality-tests .supp-quality-row').last();await expect(form.locator('#supp-quality-tests .supp-quality-row')).toHaveCount(2);
 await expect(quality.locator('.supp-quality-analyte')).toBeFocused();await expect(quality.locator('.supp-quality-category')).toHaveValue('other');
 await expect(quality.locator('.supp-quality-analyte')).toHaveValue('');await expect(quality.locator('.supp-quality-result')).toHaveValue('');await expect(quality.locator('.supp-quality-ai-context')).toBeChecked();
 await activate(page,quality.locator('[data-supp-action="remove-quality-test"]'));await expect(form.locator('#supp-quality-tests .supp-quality-row')).toHaveCount(1);
}
test('static authored Supplement form first use offline and two zero-page cold launches preserve exact native edits and profile',async({page,context},info)=>{
 test.setTimeout(180000);const artifact=await artifactInputs(modules,sheets);
 const declarations=await fs.readFile('service-worker-assets.js','utf8');for(const module of authored)expect(declarations).toContain("'/"+module+"'");
 const seeded=migrateProfileData({...createDefaultProfileData(),entries:[{date:'2024-01-01',markers:{'biochemistry.glucose':4.5}},{date:'2024-04-01',markers:{'biochemistry.glucose':4.8}}],notes:[{date:'2024-01-01',text:'Keep unrelated synthetic note'}],contextNotes:'Keep entire unrelated context',markerNotes:{'biochemistry.glucose':'Keep marker note'},supplements:[
  {id:'sm_pwa_form_a',schemaVersion:2,name:'Synthetic Magnesium',type:'supplement',note:'Keep original note',startDate:'2024-01-01',endDate:null,periods:[{start:'2024-01-01',end:null,dose:'50 mg',schedule:{mode:'daily',timesPerDay:2},opaque:'Keep period metadata'}],ingredients:[{name:'Magnesium',amount:'25 mg',amountValue:25,amountUnit:'mg',timesPerDay:2,opaque:'Keep ingredient metadata'}],qualityTests:[{category:'contaminant',analyte:'Lead',resultText:'ND',unit:'mg',basis:'per capsule',includeInAIContext:true,status:'not-detected',opaque:'Keep quality metadata'}],qualityEvidenceScope:'unknown',schedule:{mode:'daily',timesPerDay:2},timesPerDay:2,lifecycle:{state:'active'},brand:'Keep brand',updatedAt:1,opaque:'Keep original record metadata'},
  {id:'sm_pwa_form_b',schemaVersion:2,name:'Keep second record',type:'medication',note:'Keep second note',startDate:'2023-01-01',endDate:'2023-01-31',periods:[{start:'2023-01-01',end:'2023-01-31'}],schedule:{mode:'daily'},lifecycle:{state:'ended'},updatedAt:2}
 ]});
 const registry=[{id:'default',name:'Synthetic Supplement profile',sex:'male',dob:'1987-11-22',createdAt:1,lastUpdated:1,tags:[],notes:'',status:'active',pinned:false,height:null,heightUnit:'cm',location:{country:'',zip:''}},{id:'other',name:'Keep other registry profile',sex:'female',dob:'1988-01-01',createdAt:2,lastUpdated:2,tags:[],notes:'',status:'active',pinned:false,height:null,heightUnit:'cm',location:{country:'',zip:''}}];
 await installDiscussionFixture(context,{paused:true});await installOfflineStartupDiagnostics(context);
 await context.addInitScript(({seeded,registry})=>{
  if(!['http:','https:'].includes(location.protocol)||localStorage.getItem('supplement-pwa-seeded'))return;
  localStorage.setItem('supplement-pwa-seeded','1');localStorage.setItem('labcharts-theme','dark');localStorage.setItem('labcharts-profiles',JSON.stringify(registry));localStorage.setItem('labcharts-active-profile','default');localStorage.setItem('labcharts-default-imported',JSON.stringify(seeded));localStorage.setItem('labcharts-analytics-disabled','true');localStorage.setItem('labcharts-show-product-recs','false');localStorage.setItem('labcharts-last-manual-backup',new Date().toISOString());
 },{seeded,registry});
 const requests:Array<{url:string;method:string;resourceType:string}>=[],requestFailures:Array<{url:string;method:string;error:string|null}>=[];context.on('request',request=>requests.push({url:request.url(),method:request.method(),resourceType:request.resourceType()}));context.on('requestfailed',request=>requestFailures.push({url:request.url(),method:request.method(),error:request.failure()?.errorText??null}));
 const errors:string[]=[],csp:string[]=[],external:string[]=[],events:EventReceipt[]=[];const observe=(target:Page)=>{target.on('pageerror',error=>errors.push(error.message));target.on('websocket',socket=>external.push(socket.url()));};observe(page);context.on('page',observe);
 await context.exposeBinding('supplementPwaEvent',(_,value:EventReceipt)=>events.push(value));await context.exposeBinding('supplementPwaCsp',(_,value:string)=>csp.push(value));
 await context.addInitScript(()=>{const observed=window as unknown as ObservedWindow;for(const type of ['click','input','change','keydown'])document.addEventListener(type,event=>{const element=event.target;if(!(element instanceof Element)||!element.closest('#detail-modal,#confirm-dialog-overlay,.dashboard-widget[data-widget-id="supplements"]'))return;void observed.supplementPwaEvent({type,target:element.id||element.className,action:element.closest('[data-supp-action]')?.getAttribute('data-supp-action')??null,trusted:event.isTrusted,value:element instanceof HTMLInputElement||element instanceof HTMLSelectElement||element instanceof HTMLTextAreaElement?element.value:null});},true);document.addEventListener('securitypolicyviolation',event=>{void observed.supplementPwaCsp(event.violatedDirective);});});
 await context.routeWebSocket('**/*',socket=>{external.push(socket.url());socket.close();});
 const server=await startKitServer(artifact.directory);let stopped=false;await context.route('**/*',async route=>{const url=new URL(route.request().url());if(['http:','https:'].includes(url.protocol)&&url.origin!==server.origin){external.push(url.href);await route.abort();}else await route.continue();});
 const phases:Array<{phase:number;before:NativeProfile;after:NativeProfile;mutation:ReturnType<typeof verifySupplementEdit>}>=[];
 try{
  await ready(page,server.origin);await ready(page,server.origin);await showWidget(page);await expect(page.locator('#supp-form-panel')).toHaveCount(0);
  let expected=await profile(page,artifact.state);expect(expected.stored).toEqual(seeded);expect(expected.live).toEqual(seeded);expect(expected.profiles).toEqual(registry);expect(expected.rawCommitted).toBe(JSON.stringify(seeded));expect(expected.rawProfiles).toBe(JSON.stringify(registry));const cache=await cacheReceipt(page,artifact);
  await info.attach('supplement-before-origin-stop-raw',{body:JSON.stringify({artifact,expected,cache},null,2),contentType:'application/json'});
  await server.close();stopped=true;await expect(fetch(server.origin+'/index.html')).rejects.toThrow();
  for(let phase=0;phase<3;phase++){
   if(phase){expect(context.pages()).toHaveLength(0);page=await context.newPage();await ready(page,server.origin);}
   const before=await profile(page,artifact.state);await info.attach('supplement-phase-'+phase+'-before-raw',{body:JSON.stringify(before,null,2),contentType:'application/json'});expect(before).toEqual(expected);
   await openForm(page);await info.attach('supplement-phase-'+phase+'-opened-form-raw',{body:JSON.stringify(await rawForm(page),null,2),contentType:'application/json'});
   const prior=phase?{name:'Offline Supplement '+(phase-1)+' <literal> & "quote"',note:'Saved offline note '+(phase-1)}:{name:'Synthetic Magnesium',note:'Keep original note'};
   await defaults(page,prior.name,prior.note);await temporaryNativeRows(page);await defaults(page,prior.name,prior.note);
   await panel(page).locator('#supp-note').fill('Cancelled unsaved draft');await activate(page,panel(page).locator('[data-supp-action="toggle-accordion"]'));const confirmation=page.getByRole('alertdialog',{name:'Unsaved supplement changes',exact:true});await expect(confirmation).toBeVisible();await expect(panel(page)).toBeVisible();expect(await profile(page,artifact.state)).toEqual(before);await info.attach('supplement-phase-'+phase+'-discard-confirmation-raw',{body:JSON.stringify({confirmation:await confirmation.evaluate(element=>element.outerHTML),form:await rawForm(page),profile:await profile(page,artifact.state)},null,2),contentType:'application/json'});await activate(page,confirmation.getByRole('button',{name:'Discard changes',exact:true}));await expect(confirmation).toBeHidden();await expect(page.locator('#supp-form-panel')).toHaveCount(0);expect(await profile(page,artifact.state)).toEqual(before);
   await activate(page,page.locator('#detail-modal .supp-list-item[data-supp-index="0"]'));await expect(panel(page)).toBeVisible();await defaults(page,prior.name,prior.note);
   await panel(page).locator('#supp-name').fill('');await activate(page,panel(page).locator('[data-supp-action="save"]'));await expect(panel(page).locator('#supp-name')).toBeFocused();await expect(page.getByRole('alert').filter({hasText:'Name is required'})).toBeVisible();expect(await profile(page,artifact.state)).toEqual(before);
   const edit:SupplementEdit={name:'Offline Supplement '+phase+' <literal> & "quote"',note:'Saved offline note '+phase};await panel(page).locator('#supp-name').fill(edit.name);await panel(page).locator('#supp-note').fill(edit.note);
   const min=await page.evaluate(()=>Date.now());await activate(page,panel(page).locator('[data-supp-action="save"]'));
   await expect.poll(async()=>{const value=await profile(page,artifact.state);return Array.isArray(value.stored.supplements)?(value.stored.supplements[0] as {name:unknown}|undefined)?.name:null;}).toBe(edit.name);
   await expect(panel(page).locator('#supp-name')).toHaveValue(edit.name);await expect(panel(page).locator('[data-supp-action="save"]')).toBeEnabled();const savedRow=page.locator('#detail-modal').getByRole('button',{name:'Edit '+edit.name,exact:true});await expect(savedRow).toBeVisible();await expect(savedRow.locator('.supp-list-name')).toHaveText(edit.name+' Current');await expect(page.locator('#detail-modal literal')).toHaveCount(0);
   const after=await profile(page,artifact.state),max=await page.evaluate(()=>Date.now());await info.attach('supplement-phase-'+phase+'-after-save-raw',{body:JSON.stringify({after,min,max,edit,form:await rawForm(page),listRow:await savedRow.evaluate(element=>element.outerHTML)},null,2),contentType:'application/json'});
   const mutation=verifySupplementEdit(before,after,edit,min,max);await defaults(page,edit.name,edit.note);expect(await cacheReceipt(page,artifact)).toEqual(cache);phases.push({phase,before,after,mutation});expected=after;
   await page.close();expect(context.pages()).toHaveLength(0);
  }
  for(const action of ['open-editor','toggle-accordion','add-ingredient','remove-ingredient','add-period','remove-period','add-quality-test','remove-quality-test','save'])expect(events.filter(event=>event.type==='click'&&event.action===action)).toHaveLength(action==='save'?6:action==='toggle-accordion'?9:3);
  const discards=events.filter(event=>event.type==='click'&&event.target==='confirm-ok');expect(discards).toHaveLength(3);expect(discards.every(event=>event.trusted)).toBe(true);expect(events.filter(event=>event.type==='click'&&event.action!==null).every(event=>event.trusted)).toBe(true);expect(events.some(event=>event.type==='input'&&event.target==='supp-name'&&event.trusted)).toBe(true);
  expect(errors).toEqual([]);expect(csp).toEqual([]);expect(external).toEqual([]);expect(await artifactInputs(modules,sheets)).toEqual(artifact);
  await info.attach('supplement-offline-cold-acceptance',{body:JSON.stringify({artifact,cache,phases,events,errors,csp,external,boundary:'Actual optimized static app and source-qualified authored form/row owners. First form use only after maintained origin shutdown and host fetch rejection; two zero-page cold launches. Native UI defaults, add/remove row delegates, cancellation, required-name rejection and exact native IDB saves. Complete live/committed profile and two-row registry exact apart from named text changes and bounded native updatedAt/lastUpdated metadata. Four maintained headless projects; dark theme only here; no physical install, provider/import API, user data or whole-app acceptance.'},null,2),contentType:'application/json'});
 }finally{try{await info.attach('supplement-final-raw-diagnostics',{body:JSON.stringify({artifact,phases,events,errors,csp,external,requests,requestFailures,originStopped:stopped,lastPageClosed:page.isClosed(),lastPageDOM:page.isClosed()?null:await page.content().catch(error=>'DOM capture failed: '+String(error))},null,2),contentType:'application/json'});}finally{if(!stopped)await server.close();}}
});
