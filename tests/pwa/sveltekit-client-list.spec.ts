import {nativeTabKey} from '../helpers/native-tab-key.js';
import fs from 'node:fs/promises';
import {expect,test,type Page} from '@playwright/test';
import {startKitServer} from './kit-server.js';
import {installDiscussionFixture} from '../helpers/chat-discussion-fixture.js';
import {installOfflineStartupDiagnostics} from '../helpers/offline-launch-diagnostics.js';
import {readyLightArtifact as ready} from '../helpers/light-artifact-navigation.js';
import {activate,artifactInputs,cacheReceipt,profile,sha} from './kit-native-receipts.js';

const authored=['js/client-list-presentation.js','js/components/ClientListOverview.svelte.html.js',
  'js/components/ClientListMenuButton.svelte.html.js', 'js/client-list-form-presentation.js',
  'js/client-list-form-rendering.js', 'js/components/ClientListFormPresentation.svelte.html.js'] as const;
const modules=[...authored,'js/client-list.js','js/client-list-impl.js','js/client-list-form.js','js/client-list-runtime.js',
  'js/modal-focusable.js','js/modal-lifecycle.js','js/app-event-listeners.js','js/nav.js','js/profile.js','js/profile-list-store.js','js/state.js'] as const;
const sheets=['css/client-list.css','css/modal-shared.css','css/app-shell.css','css/redesign-shell.css'] as const;
const ids=['default','pwa-bob','pwa-cara'];
const button='#profile-selector [data-nav-action="open-client-list"]';
const action=(name:string)=>'#client-list-modal [data-cl-action="'+name+'"]';
interface NativeEvent {type:string;target:string;action:string|null;trusted:boolean;key:string|null;pointerType:string|null;value:string|null;at:number}
interface ObservedWindow extends Window {clientListPwaEvents:NativeEvent[];clientListPwaCsp(value:string):Promise<void>}
async function snapshot(page:Page,artifact:Awaited<ReturnType<typeof artifactInputs>>){
  const committed=await profile(page,artifact.state);
  const protectedStores=await page.evaluate(async ids=>{
    const open=indexedDB.open('labcharts-blobs',1);open.onupgradeneeded=()=>open.transaction?.abort();
    const db=await new Promise<IDBDatabase>((resolve,reject)=>{open.onsuccess=()=>resolve(open.result);open.onerror=()=>reject(open.error);});
    try{
      const tx=db.transaction('kv','readonly');const reads=ids.map(id=>({id,local:localStorage.getItem('labcharts-'+id+'-imported'),request:tx.objectStore('kv').get('labcharts-'+id+'-imported')}));
      await new Promise<void>((resolve,reject)=>{tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});
      const profiles=reads.map(({id,local,request})=>{const native:unknown=request.result??null;if(native!==null&&typeof native!=='string')throw new Error('Native profile value is not a string');
        const effective=local??native;if(typeof effective!=='string')throw new Error('Missing synthetic profile '+id);
        return {id,local,native,effective,decoded:JSON.parse(effective) as unknown};});
      const preferences=Object.fromEntries(Object.keys(localStorage).filter(key=>ids.some(id=>key.startsWith('labcharts-'+id+'-'))
        || ['labcharts-theme','labcharts-accent','labcharts-last-manual-backup','labcharts-backup-nudge-snoozed-until','labcharts-encryption-enabled',
          'labcharts-ai-provider','labcharts-ai-paused','labcharts-legal-acceptance','labcharts-ai-transparency-acknowledgement'].includes(key))
        .sort().map(key=>[key,localStorage.getItem(key)]));
      return {profiles,preferences};
    }finally{db.close();}
  },ids);
  return {committed,protectedStores};
}
async function closedChat(page:Page){const close=page.getByRole('button',{name:'Close chat',exact:true});if(await close.isVisible())await activate(page,close);}
async function open(page:Page){
  await closedChat(page);await activate(page,page.locator(button));
  await expect(page.locator('#client-list-overlay')).toHaveClass(/\bshow\b/);await expect(page.locator('#cl-search')).toBeFocused();
  await expect(page.locator('.cl-title')).toHaveText('Clients');await expect(page.locator('.cl-count')).toHaveText('2 active profiles');
  const links=await page.evaluate(()=>{const link=document.querySelector('link[data-client-list-stylesheet]'),anchor=document.querySelector('[data-client-list-stylesheet-anchor]');
    return {count:document.querySelectorAll('link[data-client-list-stylesheet]').length,href:link?.getAttribute('href'),beforeAnchor:link?.nextSibling===anchor};});
  expect(links).toEqual({count:1,href:new URL('/css/client-list.css',page.url()).href,beforeAnchor:true});return links;
}
async function tabTo(page:Page,selector:string){const path=[];
  for(let attempt=0;attempt<60;attempt++){
    await page.keyboard.press(nativeTabKey(page));const sample=await page.evaluate(selector=>({at:performance.now(),matched:!!document.activeElement?.matches(selector),
      active:document.activeElement?{tag:document.activeElement.tagName,id:document.activeElement.id,action:document.activeElement.getAttribute('data-cl-action')}:null}),selector);
    path.push(sample);if(sample.matched)return path;
  }
  throw new Error('Native Tab did not reach '+selector);
}
async function workflow(page:Page){
  const links=await open(page),coarse=await page.evaluate(()=>matchMedia('(pointer: coarse)').matches);
  await expect(page.locator('.cl-list > .cl-row')).toHaveCount(2);
  await expect(page.locator('.cl-list > .cl-row').first()).toHaveAttribute('data-id','pwa-bob');
  await expect(page.locator('.cl-archived-section summary')).toHaveText('Archived (1)');
  await expect(page.locator('.cl-archived-section')).not.toHaveAttribute('open');
  const search=page.locator('#cl-search'),handle=await search.elementHandle();expect(handle).not.toBeNull();
  await page.keyboard.type('Alice');await expect(search).toHaveValue('Alice');await expect(page.locator('.cl-list > .cl-row')).toHaveCount(1);
  expect(await handle!.evaluate(node=>document.getElementById('cl-search')===node)).toBe(true);
  await page.keyboard.press('ArrowLeft');await page.keyboard.press('ArrowLeft');await page.keyboard.press('Backspace');
  await expect(search).toHaveValue('Alce');await expect(search).toBeFocused();
  expect(await search.evaluate(node=>node instanceof HTMLInputElement?{start:node.selectionStart,end:node.selectionEnd}:null)).toEqual({start:2,end:2});
  await page.keyboard.type('i');await expect(search).toHaveValue('Alice');await expect(search).toBeFocused();
  expect(await search.evaluate(node=>node instanceof HTMLInputElement?{start:node.selectionStart,end:node.selectionEnd}:null)).toEqual({start:3,end:3});
  expect(await handle!.evaluate(node=>document.getElementById('cl-search')===node)).toBe(true);
  await page.keyboard.press('ControlOrMeta+A');await page.keyboard.press('Backspace');await expect(search).toHaveValue('');await handle!.dispose();
  await expect(page.locator('.cl-list > .cl-row')).toHaveCount(2);
  await activate(page,page.locator('.cl-archived-section summary'));await expect(page.locator('.cl-archived-section')).toHaveAttribute('open','');
  await expect(page.locator('.cl-archived-section [data-id="pwa-cara"]')).toBeVisible();
  await activate(page,page.locator('.cl-archived-section summary'));await expect(page.locator('.cl-archived-section')).not.toHaveAttribute('open');
  const more=action('toggle-menu')+'[data-cl-profile-id="pwa-bob"]';
  const keyboardPath=coarse?[]:await tabTo(page,more);
  if(coarse)await activate(page,page.locator(more));else await page.keyboard.press('Enter');
  await expect(page.locator('#cl-active-menu')).toHaveClass(/\bshow\b/);await expect(page.locator('#cl-active-menu')).toHaveAttribute('data-profile-id','pwa-bob');
  await expect(page.locator('#cl-active-menu [data-cl-action="unpin-profile"]')).toBeVisible();
  await activate(page,page.locator('.cl-title'));await expect(page.locator('#cl-active-menu')).not.toHaveClass(/\bshow\b/);
  await activate(page,page.locator(action('toggle-tools-menu')));await expect(page.locator('#cl-tools-menu')).toHaveClass(/\bshow\b/);
  await expect(page.locator('#cl-tools-menu [data-cl-action="export-all"]')).toBeVisible();
  await activate(page,page.locator(action('toggle-tools-menu')));await expect(page.locator('#cl-tools-menu')).not.toHaveClass(/\bshow\b/);
  await activate(page,page.locator(action('open-form')));await expect(page.locator('.cl-title')).toHaveText('New Client');
  await expect(page.locator('#cl-name')).toBeFocused();await activate(page,page.locator(action('back-to-list')).first());
  await expect(page.locator('.cl-title')).toHaveText('Clients');
  // Exercise the authored Edit/tag branches offline; Cancel must preserve every committed store.
  await activate(page,page.locator(more));await expect(page.locator('#cl-active-menu')).toHaveClass(/\bshow\b/);
  await activate(page,page.locator('#cl-active-menu [data-cl-action="edit-profile"][data-cl-profile-id="pwa-bob"]'));
  await expect(page.locator('.cl-title')).toHaveText('Edit Client');await expect(page.locator('#cl-name')).toHaveValue('Bob offline');
  await expect(page.getByRole('group',{name:'Sex',exact:true})).toHaveCount(1);
  await expect(page.getByRole('group',{name:'Status',exact:true})).toHaveCount(1);
  const tagInput=page.getByLabel('Tags',{exact:true}),pills=page.locator('#cl-tags-wrap .cl-tag-pill');
  await expect(pills).toHaveText(['metabolic']);await tagInput.fill('METABOLIC');await tagInput.press('Enter');
  await expect(pills).toHaveText(['metabolic']);await expect(tagInput).toHaveValue('');
  await tagInput.fill('offline-tag');await tagInput.press('Enter');await expect(pills).toHaveText(['metabolic','offline-tag']);
  await activate(page,pills.first().getByRole('button',{name:'Remove tag',exact:true}));await expect(pills).toHaveText(['offline-tag']);
  await activate(page,page.locator(action('back-to-list')).first());await expect(page.locator('.cl-title')).toHaveText('Clients');
  await page.keyboard.press(nativeTabKey(page));await expect(page.locator(action('toggle-tools-menu'))).toBeFocused();
  await page.keyboard.press('Escape');await expect(page.locator('#client-list-overlay')).not.toHaveClass(/\bshow\b/);await expect(page.locator(button)).toBeFocused();
  await open(page);await activate(page,page.locator(action('close')).first());
  await expect(page.locator('#client-list-overlay')).not.toHaveClass(/\bshow\b/);await expect(page.locator(button)).toBeFocused();
  return {links,coarse,keyboardPath};
}

test('static Client List first construction offline and two zero-page cold launches retain all profiles',async({page,context},info)=>{
  test.setTimeout(180000);
  const artifact=await artifactInputs(modules,sheets),declarations=await fs.readFile('service-worker-assets.js','utf8');
  for(const module of authored)expect(declarations).toContain("'/"+module+"'");expect(declarations).toContain("'/css/client-list.css'");
  const seeded=JSON.parse(await fs.readFile(new URL('../fixtures/client-list-overview/pwa-profile.json',import.meta.url),'utf8')) as Record<string,unknown>;
  expect(Object.keys(seeded)).toHaveLength(39);expect(Array.isArray(seeded.entries)).toBe(true);expect(seeded.nutritionMeals).toEqual([]);
  const fields={sex:'female',dob:'1990-01-01',createdAt:1,location:{country:'',zip:''},notes:'Synthetic practitioner notes',height:null,heightUnit:'cm',avatar:null};
  const registry=[{...fields,id:'default',name:'Alice offline',tags:['vip'],status:'active',pinned:false,lastUpdated:1},
    {...fields,id:'pwa-bob',name:'Bob offline',tags:['metabolic'],status:'flagged',pinned:true,lastUpdated:2},
    {...fields,id:'pwa-cara',name:'Cara offline',tags:['archive'],status:'archived',pinned:false,lastUpdated:3}];
  await installDiscussionFixture(context,{provider:'openrouter',paused:true});await installOfflineStartupDiagnostics(context);
  await context.addInitScript(({seeded,registry})=>{
    if(!['http:','https:'].includes(location.protocol)||localStorage.getItem('client-list-pwa-seeded'))return;
    localStorage.setItem('client-list-pwa-seeded','1');localStorage.setItem('labcharts-theme','dark');
    localStorage.setItem('labcharts-profiles',JSON.stringify(registry));localStorage.setItem('labcharts-active-profile','default');
    localStorage.setItem('labcharts-analytics-disabled','true');localStorage.setItem('labcharts-show-product-recs','false');
    for(const record of registry)localStorage.setItem('labcharts-'+record.id+'-imported',JSON.stringify(seeded));
    // Disclosed returning-user fixture, actual walltime; no backup timer/style/clock replacement.
    localStorage.setItem('labcharts-last-manual-backup',new Date().toISOString());
  },{seeded,registry});
  const errors:string[]=[],csp:string[]=[],external:string[]=[],traffic:Array<{method:string;url:string}>=[];
  const observe=(target:Page)=>target.on('pageerror',error=>errors.push(error.message));observe(page);context.on('page',observe);
  context.on('request',request=>traffic.push({method:request.method(),url:request.url()}));
  await context.exposeBinding('clientListPwaCsp',(_,value:string)=>csp.push(value));
  await context.addInitScript(()=>{
    const observed=window as unknown as ObservedWindow;observed.clientListPwaEvents=[];
    for(const type of ['pointerdown','click','keydown','focusin','focusout','input','change'])document.addEventListener(type,event=>{
      const target=event.target;if(!(target instanceof Element)||!target.closest('#profile-selector,#client-list-modal'))return;
      const action=target.closest('[data-nav-action],[data-cl-action],[data-cl-input-action],[data-cl-change-action]');
      observed.clientListPwaEvents.push({type,target:target.id||target.tagName,action:action?.getAttribute('data-nav-action')||action?.getAttribute('data-cl-action')
        ||action?.getAttribute('data-cl-input-action')||action?.getAttribute('data-cl-change-action')||null,trusted:event.isTrusted,
        key:event instanceof KeyboardEvent?event.key:null,pointerType:event instanceof PointerEvent?event.pointerType:null,
        value:target instanceof HTMLInputElement||target instanceof HTMLSelectElement?target.value:null,at:performance.now()});
    },true);
    document.addEventListener('securitypolicyviolation',event=>{void observed.clientListPwaCsp(event.violatedDirective);});
  });
  const server=await startKitServer(artifact.directory);let stopped=false;
  await context.route('**/*',async route=>{
    const url=new URL(route.request().url());if(['http:','https:'].includes(url.protocol)&&url.origin!==server.origin){external.push(url.href);await route.abort();}else await route.continue();
  });
  const phases:unknown[]=[],boundaries:Array<{phase:number;beforeNewPage:number|null;afterClose:number}>=[];
  try{
    await ready(page,server.origin);await ready(page,server.origin);await closedChat(page);
    // No public Client List open, synthetic getter, controller import, or DOM construction online.
    await expect(page.locator('#client-list-modal .cl-title')).toHaveCount(0);
    const before=await snapshot(page,artifact);expect(before.committed.rawProfiles).toBe(JSON.stringify(registry));expect(before.committed.profiles).toEqual(registry);
    expect(before.committed.rawCommitted).toBe(JSON.stringify(seeded));expect(before.committed.stored).toEqual(seeded);
    for(const stored of before.protectedStores.profiles)expect(stored.effective).toBe(JSON.stringify(seeded));
    const onlineCache=await cacheReceipt(page,artifact);
    const servedWorker=await fetch(server.origin+'/service-worker.js').then(response=>response.arrayBuffer());expect(sha(new Uint8Array(servedWorker))).toBe(artifact.servedWorkerSHA256);
    await server.close();stopped=true;await expect(fetch(server.origin+'/index.html')).rejects.toThrow();
    for(let phase=0;phase<3;phase++){
      const beforeNewPage=phase?context.pages().length:null;
      if(phase){expect(beforeNewPage).toBe(0);page=await context.newPage();expect(context.pages()).toHaveLength(1);await ready(page,server.origin);}
      expect(await snapshot(page,artifact)).toEqual(before);
      const start=await page.evaluate(()=>(window as unknown as ObservedWindow).clientListPwaEvents.length);
      const workflowReceipt=await workflow(page),after=await snapshot(page,artifact),cache=await cacheReceipt(page,artifact);
      const events=await page.evaluate(start=>(window as unknown as ObservedWindow).clientListPwaEvents.slice(start),start);
      const raw={phase:phase===0?'first-offline':'cold-'+phase,workflow:workflowReceipt,before,after,cache,events};
      await info.attach('client-list-phase-'+phase,{body:JSON.stringify(raw,null,2),contentType:'application/json'});
      expect(after).toEqual(before);expect(cache.keys).toEqual(onlineCache.keys);
      expect(events.filter(event=>event.type==='click'&&event.trusted&&event.action==='open-client-list')).toHaveLength(2);
      expect(events.filter(event=>event.type==='keydown'&&event.trusted&&event.key==='Escape')).toHaveLength(1);
      expect(events.some(event=>event.type==='input'&&event.trusted&&event.action==='search'&&event.value==='Alice')).toBe(true);
      expect(events.some(event=>event.type==='pointerdown'&&event.trusted&&event.pointerType===(workflowReceipt.coarse?'touch':'mouse'))).toBe(true);
      if(!workflowReceipt.coarse)expect(events.some(event=>event.type==='keydown'&&event.trusted&&event.key==='Enter'&&event.action==='toggle-menu')).toBe(true);
      phases.push(raw);for(const client of context.pages())await client.close();expect(context.pages()).toHaveLength(0);
      boundaries.push({phase,beforeNewPage,afterClose:context.pages().length});
    }
    expect(phases).toHaveLength(3);expect(boundaries.slice(1).map(boundary=>boundary.beforeNewPage)).toEqual([0,0]);
    expect(await artifactInputs(modules,sheets)).toEqual(artifact);expect(await fs.readFile('service-worker-assets.js','utf8')).toBe(declarations);
    expect(errors).toEqual([]);expect(csp).toEqual([]);expect(external).toEqual([]);expect(traffic.every(request=>request.method==='GET')).toBe(true);
    await info.attach('client-list-stopped-origin-acceptance',{body:JSON.stringify({artifact,before,onlineCache,servedWorkerSHA256:sha(new Uint8Array(servedWorker)),
      declarationsSHA256:sha(declarations),stoppedListener:true,coldLaunches:2,boundaries,phases,traffic,errors,csp,external,
      boundary:'Actual static Kit source-map bindings, controlling SW/cache bytes and stopped HTTP listener. First Client List construction is offline; two zero-page cold clients. Real profile button, trusted search/keyboard/touch, archived details, nonmutating tools/row menu, authored New/Edit forms, named groups, duplicate/add/remove tags and Cancel, Escape/close/reopen. Whole native committed default profile, all three raw imported stores, live profile/registry/preferences exact. Complete39-field synthetic prebootstrap profiles, paused credential-free OpenRouter, returning-user recent manual backup; existing kit-test-a/version/legacyProbe seam. No backend/provider reply, export/import, profile switch, destructive action, OS install, hardware Safari/iPhone, SW-process termination or full-app acceptance.'},null,2),contentType:'application/json'});
  }finally{if(!stopped)await server.close();}
});
