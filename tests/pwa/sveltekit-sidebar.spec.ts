import {nativeTabKey} from '../helpers/native-tab-key.js';
import fs from 'node:fs/promises';
import * as ts from 'typescript/unstable/ast';
import {withParsedSource} from '../../scripts/native-typescript-ast.js';
import {expect,test,type Page,type Locator} from '@playwright/test';
import {createDefaultProfileData,migrateProfileData} from '../../js/profile.js';
import {startKitServer} from './kit-server.js';
import {artifactInputs,cacheReceipt,profile,activate,type StateBinding} from './kit-native-receipts.js';
import {readyLightArtifact as ready} from '../helpers/light-artifact-navigation.js';
import {installDiscussionFixture} from '../helpers/chat-discussion-fixture.js';
import {installOfflineStartupDiagnostics} from '../helpers/offline-launch-diagnostics.js';
import {expectedCurrentSidebarPwaReceipt as expectedSidebarPwaReceipt,qualifySidebarPwaGrammar} from '../helpers/sidebar-pwa-expected-annotations.js';
import {sidebarGroup,sidebarRoutes,sidebarRegistry,sidebarSeedFields,sidebarPresentationReceipt,type SidebarNativeOracle} from '../helpers/sidebar-pwa-receipt.js';

const authored=['js/sidebar-presentation.js','js/components/ConditionalSidebarItem.svelte.html.js','js/components/SidebarCategoryItem.svelte.html.js','js/components/SidebarNavigation.svelte.html.js'] as const;
// Native public URLs remain checked below; the optimized graph composes these
// genuine child sources instead of importing their unused standalone facades.
const artifactOwners = ['js/sidebar-presentation.js','js/components/ConditionalSidebarItem.svelte','js/components/SidebarCategoryItem.svelte','js/components/SidebarNavigation.svelte.html.js','js/components/SidebarNavigation.svelte','js/components/SidebarIcon.svelte'] as const;
const modules=[...artifactOwners,'js/nav.js','js/nav-runtime.js','js/startup-ui.js','js/data.js','js/profile.js','js/profile-list-store.js','js/state.js','js/profile-button-presentation.js','js/profile-button-rendering.js','js/components/ProfileButtonPresentation.svelte.html.js','js/app-event-listeners.js','js/client-list.js','js/client-list-impl.js','js/client-list-form.js','js/client-list-runtime.js','js/light-page-view.js','js/components/LightPagePresentation.svelte.html.js'] as const;
const sheets=['css/app-shell.css','css/redesign-shell.css','css/category-views.css','css/client-list.css','css/modal-shared.css'] as const;
interface NativeEvent {type:string;action:string|null;route:string|null;group:string|null;key:string|null;trusted:boolean;query:string|null}
interface ObservedWindow extends Window {sidebarPwaEvent(event:NativeEvent):Promise<void>;sidebarPwaCsp(value:string):Promise<void>}
async function stateReceipt(page:Page,binding:StateBinding){return page.evaluate(async({chunk,exportName})=>{const namespace=await import(chunk) as Record<string,unknown>,state=namespace[exportName] as {currentProfile:string;currentView:string;dateRangeFilter:string;rangeMode:string};return{profile:state.currentProfile,route:state.currentView,filter:state.dateRangeFilter,range:state.rangeMode,savedRoute:localStorage.getItem('labcharts-default-lastViewV1'),group:localStorage.getItem('labcharts-navgroup-Sidebar specialty')};},binding);}
async function protectedStorage(page:Page){return page.evaluate(()=>Object.fromEntries(Object.keys(localStorage).filter(key=>(key.startsWith('labcharts-default-')&&key!=='labcharts-default-lastViewV1')||key.startsWith('labcharts-other-')||['labcharts-profiles','labcharts-active-profile','labcharts-theme','labcharts-accent','labcharts-encryption-enabled','labcharts-last-manual-backup','labcharts-ai-provider','labcharts-ai-paused','labcharts-openrouter-api-key','labcharts-show-product-recs'].includes(key)).sort().map(key=>[key,localStorage.getItem(key)])));}
async function showSidebar(page:Page){
 const chat=page.getByRole('button',{name:'Close chat',exact:true});if(await chat.isVisible())await activate(page,chat);
 const menu=page.getByRole('button',{name:'Menu',exact:true}),sidebar=page.locator('#sidebar-nav');
 if(await menu.isVisible()&&!await sidebar.evaluate(node=>node.classList.contains('mobile-open')))await activate(page,menu);
 await expect(sidebar).toBeVisible();if(await menu.isVisible()){await expect(sidebar).toHaveClass(/\bmobile-open\b/);await expect(page.locator('#sidebar-backdrop')).toHaveClass(/\bshow\b/);expect(await page.locator('body').evaluate(node=>getComputedStyle(node).overflow)).toBe('hidden');}
 return sidebar;
}
async function keyboardActivate(page:Page,control:Locator){await control.scrollIntoViewIfNeeded();await control.focus();await expect(control).toBeFocused();await page.keyboard.press('Enter');}
async function clientListGuard(page:Page){
 const button=page.locator('#profile-selector > button.profile-compact-btn');await expect(button).toBeVisible();await expect(button).toHaveAttribute('data-nav-action','open-client-list');await expect(button).not.toHaveAttribute('type');await expect(button.locator('.profile-compact-name')).toHaveText('Synthetic Sidebar profile');expect(await button.evaluate(node=>node instanceof HTMLButtonElement&&node.type==='submit'&&node.form===null)).toBe(true);
 await activate(page,button);await expect(page.locator('#client-list-overlay')).toHaveClass(/\bshow\b/);await expect(page.locator('#cl-search')).toBeFocused();await expect(page.locator('#client-list-modal')).toContainText('Keep unrelated Sidebar profile');await page.keyboard.press('Escape');await expect(page.locator('#client-list-overlay')).not.toHaveClass(/\bshow\b/);await expect(button).toBeFocused();
}

test('static Sidebar eager native reconstruction and two zero-page offline startups retain exact native search, disclosure, routes and whole profiles',async({page,context},info)=>{
 test.setTimeout(210000);qualifySidebarPwaGrammar();const oracle=JSON.parse(await fs.readFile(new URL('../fixtures/sidebar-pwa-native.json',import.meta.url),'utf8')) as SidebarNativeOracle;expect(oracle.originalControllerSHA256).toBe('f89c05ff3404421caac2852362d93cca2d6b60ded11adc2a20ed81464559982e');const seeded=migrateProfileData({...createDefaultProfileData(),...structuredClone(sidebarSeedFields)});expect(seeded).toEqual(oracle.seed);expect(Object.keys(seeded)).toEqual(oracle.profileKeys);expect(oracle.profileKeys).toHaveLength(43);expect(Object.keys(oracle.receipts)).toHaveLength(13);const expectedReceipts=Object.fromEntries(Object.entries(oracle.receipts).map(([name,receipt])=>[name,expectedSidebarPwaReceipt(receipt,oracle.rawAssignments[name]!)]as const));
 const artifact=await artifactInputs(modules,sheets);
 const declarations=await fs.readFile('service-worker-assets.js','utf8');
 const offlineURLs=withParsedSource(declarations,'service-worker-assets.js',source=>{
  const lists:string[][]=[];
  const walk=(node:ts.Node)=>{
   if(ts.isVariableDeclaration(node)&&ts.isIdentifier(node.name)&&node.name.text==='APP_SHELL'){
    expect(node.initializer&&ts.isArrayLiteralExpression(node.initializer)).toBe(true);
    if(node.initializer&&ts.isArrayLiteralExpression(node.initializer))lists.push(node.initializer.elements.map(element=>{
     expect(ts.isStringLiteral(element)).toBe(true);
     if(!ts.isStringLiteral(element))throw new Error('Literal source-owned APP_SHELL URL required');
     return element.text;
    }));
   }
   node.forEachChild(walk);
  };
  walk(source);expect(lists).toHaveLength(1);return lists[0]!;
 });
 for(const module of authored)expect(offlineURLs.filter(url=>url==='/'+module)).toEqual(['/'+module]);
 await installDiscussionFixture(context,{paused:true});await installOfflineStartupDiagnostics(context);
 await context.addInitScript(({seeded,registry,group})=>{if(!['http:','https:'].includes(location.protocol)||localStorage.getItem('sidebar-pwa-seeded'))return;localStorage.setItem('sidebar-pwa-seeded','1');localStorage.setItem('labcharts-theme','dark');localStorage.setItem('labcharts-profiles',JSON.stringify(registry));localStorage.setItem('labcharts-active-profile','default');localStorage.setItem('labcharts-default-imported',JSON.stringify(seeded));localStorage.setItem('labcharts-other-imported',JSON.stringify({...seeded,contextNotes:'Keep other complete profile bytes'}));localStorage.setItem('labcharts-default-units','EU');localStorage.setItem('labcharts-default-rangeMode','reference');localStorage.setItem('labcharts-default-lastViewV1','dashboard');localStorage.setItem('labcharts-navgroup-'+group,'collapsed');localStorage.setItem('labcharts-analytics-disabled','true');localStorage.setItem('labcharts-show-product-recs','false');localStorage.setItem('labcharts-last-manual-backup',new Date().toISOString());},{seeded,registry:sidebarRegistry,group:sidebarGroup});
 const errors:string[]=[],csp:string[]=[],external:string[]=[],events:NativeEvent[]=[],traffic:Array<{url:string;method:string}>=[],failures:Array<{url:string;error:string|null}>=[],phases:unknown[]=[];
 const observe=(target:Page)=>{target.on('pageerror',error=>errors.push(error.message));target.on('websocket',socket=>external.push(socket.url()));};observe(page);context.on('page',observe);context.on('request',request=>traffic.push({url:request.url(),method:request.method()}));context.on('requestfailed',request=>failures.push({url:request.url(),error:request.failure()?.errorText??null}));
 await context.exposeBinding('sidebarPwaEvent',(_,event:NativeEvent)=>events.push(event));await context.exposeBinding('sidebarPwaCsp',(_,value:string)=>csp.push(value));await context.addInitScript(()=>{const observed=window as unknown as ObservedWindow;for(const type of ['click','keydown','input'])document.addEventListener(type,event=>{const target=event.target;if(!(target instanceof Element)||!target.closest('#sidebar-nav,#sidebar-toggle,#profile-selector,#client-list-modal'))return;const owner=target.closest('[data-nav-action],[data-nav-input-action],[data-cl-action]');void observed.sidebarPwaEvent({type,action:owner?.getAttribute('data-nav-action')||owner?.getAttribute('data-nav-input-action')||owner?.getAttribute('data-cl-action')||null,route:owner?.getAttribute('data-nav-route')??null,group:owner?.getAttribute('data-nav-group')??null,key:event instanceof KeyboardEvent?event.key:null,trusted:event.isTrusted,query:target instanceof HTMLInputElement?target.value:null});},true);document.addEventListener('securitypolicyviolation',event=>{void observed.sidebarPwaCsp(event.violatedDirective);});});
 await context.routeWebSocket('**/*',socket=>{external.push(socket.url());socket.close();});const server=await startKitServer(artifact.directory);let stopped=false;await context.route('**/*',async route=>{const url=new URL(route.request().url());if(['http:','https:'].includes(url.protocol)&&url.origin!==server.origin){external.push(url.href);await route.abort();}else await route.continue();});
 try{
  await page.clock.setFixedTime(new Date('2026-08-07T12:00:00Z'));await ready(page,server.origin);await ready(page,server.origin);
  // Native startup-ui eagerly constructs Sidebar online. Preserve that native
  // lifecycle; this test qualifies its subsequent offline reconstruction.
  expect(await page.locator('#sidebar-nav').evaluate(sidebarPresentationReceipt)).toEqual(expectedReceipts['constructed-collapsed']);
  await clientListGuard(page);const baseline=await profile(page,artifact.state),storage=await protectedStorage(page),cache=await cacheReceipt(page,artifact);expect(baseline.live).toEqual(seeded);expect(baseline.stored).toEqual(seeded);expect(baseline.profiles).toEqual(sidebarRegistry);expect(baseline.rawProfiles).toBe(JSON.stringify(sidebarRegistry));expect(baseline.rawCommitted).toBe(JSON.stringify(seeded));await info.attach('sidebar-before-stop-raw',{body:JSON.stringify({artifact,baseline,storage,cache,raw:await page.locator('#sidebar-nav').evaluate(node=>node.outerHTML),state:await stateReceipt(page,artifact.state)},null,2),contentType:'application/json'});
  await server.close();stopped=true;await expect(fetch(server.origin+'/index.html')).rejects.toThrow();
  for(let phase=0;phase<3;phase++){
   if(phase){expect(context.pages()).toHaveLength(0);page=await context.newPage();await page.clock.setFixedTime(new Date('2026-08-07T12:00:00Z'));}
   await ready(page,server.origin);await page.evaluate(()=>document.fonts.ready.then(()=>true));expect(await stateReceipt(page,artifact.state)).toEqual({profile:'default',route:'dashboard',filter:'all',range:'reference',savedRoute:'dashboard',group:'collapsed'});
   const steps:unknown[]=[];const check=async(name:string)=>{await expect.poll(()=>page.locator('#sidebar-nav').evaluate(sidebarPresentationReceipt)).toEqual(expectedReceipts[name]);expect(await profile(page,artifact.state)).toEqual(baseline);expect(await protectedStorage(page)).toEqual(storage);expect(await cacheReceipt(page,artifact)).toEqual(cache);expect((await stateReceipt(page,artifact.state)).group).toBe(oracle.groups[name]);const record={name,actual:await page.locator('#sidebar-nav').evaluate(sidebarPresentationReceipt),raw:await page.locator('#sidebar-nav').evaluate(node=>node.outerHTML),state:await stateReceipt(page,artifact.state),profile:await profile(page,artifact.state),storage:await protectedStorage(page)};steps.push(record);await info.attach('sidebar-phase-'+phase+'-'+name+'-raw',{body:JSON.stringify(record,null,2),contentType:'application/json'});};
   await check('constructed-collapsed');await showSidebar(page);const toggle=page.locator('#sidebar-nav .sidebar-group-toggle[data-nav-group="'+sidebarGroup+'"]'),search=page.locator('#sidebar-search');await expect(toggle).toHaveAttribute('aria-expanded','false');await keyboardActivate(page,toggle);await check('expanded');
   await search.fill('Flagged marker');await check('filter-matching');await expect(page.locator('#sidebar-nav .nav-item[data-category="'+sidebarRoutes.group+'"]')).toBeVisible();await expect(page.locator('#sidebar-nav .nav-item[data-category="'+sidebarRoutes.blood+'"]')).toBeHidden();
   await search.fill('no-such-sidebar-marker');await check('filter-missing');await search.fill('');await check('filter-reset-expanded');await activate(page,toggle);await check('collapsed-after-toggle');await search.fill('Flagged marker');await check('filter-transient-expanded');await search.fill('');await check('filter-reset-collapsed');
   await keyboardActivate(page,toggle);const category=page.locator('#sidebar-nav .nav-item[data-category="'+sidebarRoutes.group+'"]');await page.keyboard.press(nativeTabKey(page));await expect(category).toBeFocused();await page.keyboard.press('Enter');await expect(category).toHaveAttribute('aria-current','page');await check('active-group');
   if(await page.getByRole('button',{name:'Menu',exact:true}).isVisible()){await expect(page.locator('#sidebar-nav')).not.toHaveClass(/\bmobile-open\b/);await expect(page.locator('#sidebar-backdrop')).not.toHaveClass(/\bshow\b/);}
   await showSidebar(page);await activate(page,page.locator('#sidebar-nav [data-nav-action="navigate"][data-nav-route="light"]'));await expect(page.locator('.light-page[data-light-page-presentation]')).toBeVisible();await check('active-light');
   await showSidebar(page);await activate(page,page.locator('#sidebar-nav [data-nav-action="navigate"][data-nav-route="dashboard"]'));await check('active-dashboard');await showSidebar(page);await activate(page,toggle);await check('final-collapsed');
   const geometry=await page.locator('#sidebar-nav').evaluate(root=>{const controls=[...root.querySelectorAll<HTMLElement>('#sidebar-search,.sidebar-group-toggle,.nav-item[data-category="dashboard"]')];return controls.map(node=>{const box=node.getBoundingClientRect(),style=getComputedStyle(node);return{tag:node.tagName,role:node.getAttribute('role'),tabIndex:node.tabIndex,text:node.textContent,rect:{x:box.x,y:box.y,width:box.width,height:box.height},style:{display:style.display,font:style.font,color:style.color,background:style.backgroundColor,outline:style.outlineWidth}};});});expect(geometry.every(node=>node.rect.width>0&&node.rect.height>0)).toBe(true);
   const menu=page.getByRole('button',{name:'Menu',exact:true});if(await menu.isVisible()){await page.keyboard.press('Escape');await expect(page.locator('#sidebar-nav')).not.toHaveClass(/\bmobile-open\b/);await expect(page.locator('#sidebar-backdrop')).not.toHaveClass(/\bshow\b/);}
   await clientListGuard(page);expect(await profile(page,artifact.state)).toEqual(baseline);expect(await protectedStorage(page)).toEqual(storage);phases.push({phase,steps,geometry,cache:await cacheReceipt(page,artifact)});await page.close();expect(context.pages()).toHaveLength(0);
  }
  // Native role-button keyboard activation calls HTMLElement.click(); the
  // trusted Enter precedes its untrusted synthetic click. Native button
  // disclosure and pointer route actions retain their own trusted clicks.
  const navigationEvents=events.filter(event=>event.action==='navigate'&&(event.type==='keydown'||event.type==='click'));
  expect(navigationEvents.map(({type,route,key,trusted})=>({type,route,key,trusted}))).toEqual(Array.from({length:3},()=>[
   {type:'keydown',route:sidebarRoutes.group,key:'Enter',trusted:true},
   {type:'click',route:sidebarRoutes.group,key:null,trusted:false},
   {type:'click',route:'light',key:null,trusted:true},
   {type:'click',route:'dashboard',key:null,trusted:true},
  ]).flat());
  expect(events.filter(event=>event.type==='keydown'&&event.action==='toggle-group'&&event.group===sidebarGroup&&event.key==='Enter'&&event.trusted)).toHaveLength(6);expect(events.filter(event=>event.type==='click'&&event.action==='toggle-group'&&event.group===sidebarGroup&&event.trusted)).toHaveLength(12);expect(events.filter(event=>event.type==='click'&&event.action==='open-client-list'&&event.trusted)).toHaveLength(4);expect(events.some(event=>event.type==='input'&&event.action==='filter-sidebar'&&event.trusted&&event.query==='no-such-sidebar-marker')).toBe(true);expect(errors).toEqual([]);expect(csp).toEqual([]);expect(external).toEqual([]);expect(await artifactInputs(modules,sheets)).toEqual(artifact);
  await info.attach('sidebar-offline-native-acceptance',{body:JSON.stringify({artifact,baseline,storage,cache,phases,events,traffic,failures,errors,csp,external,boundary:'Actual optimized source-mapped three Sidebar owners plus nine cached authored URLs; native eager construction online retained, first actual Sidebar startup reconstruction after real origin stop, two zero-page offline startups. Thirteen exact original-controller source states from real profile/data; twelve exact named ordered DOM/style/action states per actual offline phase, trusted native search/disclosure/category/conditionalLight/ProfileButton/ClientList/keyboard/mobile overlay actions. Complete43field live/IDB/raw profiles+registry and protected per-profile/other/profile/provider storage unchanged; native lastView/global group preference values explicitly checked. Existing kit-test-a/version/legacyProbe seam; fixed native wall clock stabilizes original weekly Light badge without overriding product getters or timers. No OS installation, physicalSafari/iPhone, workertermination or whole-app acceptance claim.'},null,2),contentType:'application/json'});
 }finally{await info.attach('sidebar-terminal-observer-raw',{body:JSON.stringify({events,traffic,failures,errors,csp,external,phases},null,2),contentType:'application/json'});if(!stopped)await server.close();}
});
