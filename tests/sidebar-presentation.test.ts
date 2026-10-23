import {withoutStandaloneLensEntries} from './helpers/sidebar-lens-entries.js';
import {expectedSidebarReceipt} from './helpers/sidebar-owned-receipts.js';
// @vitest-environment jsdom
import {afterEach,expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import * as candidate from '../js/nav.js';
import {state} from '../js/state.js';
import {invalidateActiveDataCache} from '../js/data.js';
import {configureNavRuntime} from '../js/nav-runtime.js';
import {configureContextCardsRuntimeCallbacks} from '../js/context-cards-runtime.js';
import type {ActiveData,ActiveMarker,ActiveCategory} from '../js/data-view-types.js';
type Renderer=typeof candidate;
type Scenario={name:string;variant?:string;trace?:'getter'|'throw'|'coercion'|'symbol';actions?:boolean;mobile?:boolean;filter?:boolean;current?:string;dateRange?:string;missing?:boolean;fallback?:boolean};
const saved={importedData:state.importedData,dateRangeFilter:state.dateRangeFilter,currentView:state.currentView,rangeMode:state.rangeMode,markerRegistry:state.markerRegistry};
afterEach(()=>{Object.assign(state,saved);invalidateActiveDataCache();vi.useRealTimers();document.body.replaceChildren();localStorage.clear();});
const listeners=new Map<Renderer,Map<string,EventListener>>();
const originalReceipts=JSON.parse(readFileSync(path.join(import.meta.dirname,'fixtures/sidebar-presentation-original.json'),'utf8')) as {name:string;original:unknown}[];
function tree(n:Node):unknown{return n.nodeType===Node.ELEMENT_NODE?{tag:(n as Element).tagName,attrs:[...(n as Element).attributes].map(a=>[a.name,a.value]),children:[...n.childNodes].map(tree)}:{type:n.nodeType,text:n.nodeValue};}
function capture(renderer:Renderer,s:Scenario){
 vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-12T12:00:00Z'));localStorage.clear();document.body.innerHTML='<button id="launch">Launch</button><aside id="sidebar-nav" class="sidebar"></aside><div id="sidebar-backdrop" tabindex="-1"></div><div id="profile-selector"></div><div id="outside" data-nav-action="navigate" data-nav-route="outside"></div>';
 let rawAssignment:string|null=null;const navElement=document.getElementById('sidebar-nav')!;const descriptor=Object.getOwnPropertyDescriptor(Element.prototype,'innerHTML')!;Object.defineProperty(navElement,'innerHTML',{get(){return descriptor.get!.call(this);},set(value:string){rawAssignment=withoutStandaloneLensEntries(value);descriptor.set!.call(this,rawAssignment);},configurable:true});
 const trace:string[]=[];const calls:unknown[]=[];state.dateRangeFilter=s.dateRange||'all';state.currentView=s.current||'dashboard';state.rangeMode='reference';state.markerRegistry={};
 const marker=(name:string,values:Array<number|null>)=>({name,unit:'mg/dL',values,refMin:60,refMax:100} satisfies ActiveMarker);
 let first=marker('ApoB <&> gb-sidebar-sidebarcategoryitem-item-label-end',[80,130]);const hidden={...marker('Hidden',[170,200]),hidden:true};const nulls=marker('No data',[null,null]);
 let label:unknown='Blood <&>';const group=`Hormones <&"'>`;
 if(s.trace==='coercion')label={ [Symbol.toPrimitive](hint:string){trace.push('label:'+hint);return 'Blood <&> gb-sidebar-sidebarcategoryitem-item-label-end';}};
 if(s.trace==='symbol')label=Symbol('native-sidebar-label');
 if(s.trace==='getter'||s.trace==='throw')first=new Proxy(first,{get(target,key,receiver){if(typeof key==='string'){trace.push('marker.'+key);if(s.trace==='throw'&&key==='name')throw new RangeError('native-sidebar-name');}return Reflect.get(target,key,receiver);}});
 const categories:Record<string,ActiveCategory>={lipids:{label:label as string,icon:'blood',markers:{first,hidden,nulls}},thyroid:{label:group+': Thyroid',icon:'thyroid',group,markers:{tsh:marker('TSH | <&>',[75,80])}},sex:{label:group+': Sex',icon:'sex',group,markers:{testosterone:marker('Testosterone',[120,140])}},empty:{label:'Empty',icon:'empty',markers:{nulls}},hidden:{label:'Hidden',icon:'hidden',markers:{hidden}}};
 if(s.variant==='empty')for(const key of Object.keys(categories))delete categories[key];
 if(s.variant==='all-hidden')for(const cat of Object.values(categories))for(const m of Object.values(cat.markers))m.hidden=true;
 if(s.variant==='all-null')for(const cat of Object.values(categories))for(const m of Object.values(cat.markers))m.values=[null,null];
 if(s.variant==='undefined')first.values=[undefined,undefined] as unknown as ActiveMarker['values'];
 if(s.variant==='sparse')first.values=[,80] as ActiveMarker['values'];
 if(s.variant==='normal')first.values=[70,80];
 if(s.variant==='unrated')Object.assign(first,{refMin:null,refMax:null});
 if(s.variant==='single-point')Object.assign(categories.thyroid!,{singlePoint:true,singleDate:'2025-01-01'});
 let data:ActiveData={dates:['2025-01-01','2026-10-12'],dateLabels:['Old','Today'],categories};
 if(s.trace==='getter')data=new Proxy(data,{get(target,key,receiver){if(typeof key==='string')trace.push('data.'+key);return Reflect.get(target,key,receiver);}});
 const imported:Record<string,unknown>={entries:[],customMarkers:{}};
 if(s.variant==='genome-snps')imported.genetics={snps:{a:{},b:{}}};
 if(s.variant==='genome-haplo')imported.genetics={mtdna:{haplogroup:'H <&> gb-sidebar-sidebarnavigation-genome-badge-value-end'}};
 if(s.variant==='genome-both')imported.genetics={snps:{a:{},b:{}},mtdna:{haplogroup:'H <&>'}};
 if(s.variant==='body')imported.wearableConnections={alpha:{},beta:{}};
 if(s.variant?.startsWith('sun-')){const count=Number(s.variant.slice(4));imported.sunSessions=Array.from({length:count},(_,index)=>index%2?{startedAt:Date.now()}:{startedAt:1,endedAt:Date.now()});}
 if(s.variant==='sun-old')imported.sunSessions=[{startedAt:1},{startedAt:Date.now()-8*86400000},{startedAt:Date.now()-7*86400000-1}];
 if(s.variant==='emf')imported.emfAssessment={assessments:[{},{}]};
 if(s.variant==='light-rooms')imported.lightEnvironment={rooms:[{}]};
 if(s.variant==='light-audits')imported.lightAudits=[{},{}];
 if(s.variant==='light-both'){imported.lightEnvironment={rooms:[{}]};imported.lightAudits=[{},{}];}
 if(s.variant==='bad-arrays'){imported.emfAssessment={assessments:{length:3}};imported.lightEnvironment={rooms:{length:4}};imported.lightAudits={length:5};}
 state.importedData=imported as typeof state.importedData;invalidateActiveDataCache();
 if(s.variant==='collapsed'||s.filter)localStorage.setItem('labcharts-navgroup-'+group,'collapsed');
 if(s.missing)document.getElementById('sidebar-nav')!.remove();
 const previousRuntime=configureNavRuntime({navigate:route=>calls.push(['navigate',route]),openEMFAssessmentEditor:()=>calls.push(['emf']),openCreateMarkerModal:()=>calls.push(['marker']),openReportBuilder:()=>calls.push(['report'])});
 const previousContext=configureContextCardsRuntimeCallbacks({openContextModal:()=>calls.push(['context'])});const previousActions=renderer.configureNavActions({openLightEnvironmentAssessment:()=>calls.push(['light-assessment']),openKnowledgeBase:options=>calls.push(['knowledge',options]),openClientList:()=>calls.push(['client'])});
 let raw:string|null=null,error:string|null=null;const stages:unknown[]=[];let delegates=listeners.get(renderer);const originalAdd=document.addEventListener.bind(document);if(!delegates){delegates=new Map();listeners.set(renderer,delegates);document.addEventListener=((type:string,callback:EventListenerOrEventListenerObject|null)=>{if(callback&&typeof callback==='function')delegates!.set(type,callback);}) as typeof document.addEventListener;}
 try{renderer.buildSidebar(s.fallback?undefined:data);renderer.installNavActionDelegates();raw=document.getElementById('sidebar-nav')?.innerHTML??null;}catch(e){error=e instanceof Error?e.name+':'+e.message:String(e);}finally{document.addEventListener=originalAdd;}
 const nav=document.getElementById('sidebar-nav');const initial=nav?tree(nav):null;const actionRows=nav?[...nav.querySelectorAll('[data-nav-action]')].map(e=>({tag:e.tagName,attrs:[...e.attributes].map(a=>[a.name,a.value])})):[];
 const invoke=(type:string,target:Element)=>{const event=new Event(type,{cancelable:true});Object.defineProperty(event,'target',{value:target});delegates!.get(type)?.(event);return{type,target:target.getAttribute('data-category')||target.id,prevented:event.defaultPrevented};};
 if(!error&&nav&&s.actions){for(const e of nav.querySelectorAll<HTMLElement>('.nav-item[data-nav-action]'))stages.push(invoke('click',e.querySelector('svg')||e));stages.push(invoke('click',document.getElementById('outside')!));const profile=document.getElementById('profile-selector')!;profile.innerHTML='<button id="client-action" data-nav-action="open-client-list">Client</button>';stages.push(invoke('click',profile.firstElementChild!));const toggle=nav.querySelector('.sidebar-group-toggle');if(toggle){stages.push(invoke('click',toggle));stages.push({toggled:tree(nav),storage:localStorage.getItem('labcharts-navgroup-'+group)});stages.push(invoke('click',toggle));}}
 if(!error&&nav&&s.filter){const input=nav.querySelector<HTMLInputElement>('#sidebar-search')!;for(const query of ['tsh','no-match','   ']){input.value=query;stages.push(invoke('input',input));stages.push({query,tree:tree(nav),storage:localStorage.getItem('labcharts-navgroup-'+group)});}}
 if(!error&&s.mobile){const launch=document.getElementById('launch')!;launch.focus();renderer.toggleMobileSidebar();stages.push({mobile:'open',tree:tree(document.body),focus:document.activeElement?.id});if(nav){const knowledge=nav.querySelector('[data-category="knowledge-base"]')!;stages.push(invoke('click',knowledge));}stages.push({mobile:'closed',tree:tree(document.body),focus:document.activeElement?.id});renderer.toggleMobileSidebar();renderer.toggleMobileSidebar();stages.push({mobile:'toggle-twice',tree:tree(document.body),focus:document.activeElement?.id});}
 renderer.configureNavActions(previousActions);configureNavRuntime(previousRuntime);configureContextCardsRuntimeCallbacks(previousContext);renderer.closeMobileSidebar();
 return{rawAssignment,raw,tree:initial,actionRows,trace,error,calls,stages,delegates:[...delegates!.keys()],registry:Object.keys(state.markerRegistry)};
}
const scenarios:Scenario[]=[...['default','empty','all-hidden','all-null','undefined','sparse','normal','unrated','collapsed','single-point','genome-snps','genome-haplo','genome-both','body','sun-1','sun-9','sun-10','sun-old','emf','light-rooms','light-audits','light-both','bad-arrays'].map(variant=>({name:'sidebar-'+variant,variant})),{name:'getters',trace:'getter'},{name:'throw',trace:'throw'},{name:'coercion',trace:'coercion'},{name:'symbol',trace:'symbol'},{name:'active-labs',current:'labs'},{name:'active-missing',current:'missing-route'},{name:'date-last-month',dateRange:'1m'},{name:'missing-sidebar',missing:true},{name:'fallback-active-data',fallback:true},{name:'delegated-actions',actions:true},{name:'search-collapsed-groups',filter:true},{name:'mobile-focus',mobile:true},{name:'mobile-no-sidebar',mobile:true,missing:true}];
it.each(scenarios)('$name preserves genuine native/candidate raw HTML, ordered DOM, actions, registry, getters, coercion, throws and delegates',s=>{const old=originalReceipts.find(receipt=>receipt.name===s.name);expect(old).toBeDefined();const current=capture(candidate,s);expect(current).toEqual(expectedSidebarReceipt(old!.original as Parameters<typeof expectedSidebarReceipt>[0]));if(s.name==='throw')expect(current.error).toBe('RangeError:native-sidebar-name');if(s.name==='symbol'){expect(current.error).toBeNull();expect(current.raw).toContain('Symbol(native-sidebar-label)');}if(s.name==='coercion')expect(current.trace).toEqual(['label:string']);if(s.name==='sidebar-sun-10')expect(current.raw).toContain('9+');if(s.name==='delegated-actions')expect(current.calls).toContainEqual(['navigate','genome']);});


// EMF opens a modal from the role-button sidebar row. Close the mobile surface
// before the native runtime handoff, as the other modal navigation actions do.
type EMFNavActivation = 'click' | 'Enter' | ' ';
async function captureEMFMobileHandoff(activation: EMFNavActivation, mobile: boolean, missingSidebar = false, action: 'open-emf-assessment' | 'open-custom-marker' = 'open-emf-assessment', addButton = false) {
  vi.resetModules();
  const nav = await import('../js/nav.js');
  const runtime = await import('../js/nav-runtime.js');
  const appEvents = await import('../js/app-event-listeners.js');
  const lifecycle = await import('../js/modal-lifecycle.js');
  const freshState = (await import('../js/state.js')).state;
  document.body.style.overflow = '';
  document.body.innerHTML = '<button id="emf-nav-launch">Menu</button><aside id="sidebar-nav" class="sidebar"></aside><div id="sidebar-backdrop" class="sidebar-backdrop modal-overlay"></div><div id="profile-selector"></div><div id="modal-overlay" class="modal-overlay"><div id="detail-modal"><button type="button">Editor</button></div></div>';
  const originalProfile = JSON.stringify(freshState.importedData);
  const originalRegistry = JSON.stringify(freshState.profiles);
  localStorage.setItem('emf-nav-protected-fixture', 'unchanged');
  const calls: Array<{sidebarOpen: boolean; backdropShown: boolean; bodyOverflow: string; modalShown: boolean}> = [];
  const events: Array<{type: string; key: string | null; prevented: boolean; trusted: boolean}> = [];
  const registrations = vi.spyOn(document, 'addEventListener');
  const openEditor = () => {
    calls.push({sidebarOpen: !!document.getElementById('sidebar-nav')?.classList.contains('mobile-open'), backdropShown: !!document.getElementById('sidebar-backdrop')?.classList.contains('show'), bodyOverflow: document.body.style.overflow, modalShown: !!document.getElementById('modal-overlay')?.classList.contains('show')});
    lifecycle.openModalOverlay('modal-overlay', {scrollLock: true, autoFocus: false});
  };
  const previousRuntime = runtime.configureNavRuntime(action === 'open-emf-assessment'
    ? {openEMFAssessmentEditor: openEditor} : {openCreateMarkerModal: openEditor});
  const backdropRemoval = vi.spyOn(document.getElementById('sidebar-backdrop')!.classList, 'remove');
  try {
    nav.buildSidebar({dates: [], dateLabels: [], categories: {}});
    appEvents.installGlobalEventListeners();
    const control = document.querySelector<HTMLElement>(`#sidebar-nav ${addButton ? '.sidebar-add-marker' : '.nav-item'}[data-nav-action="${action}"]`)!;
    if (!addButton) expect(control.getAttribute('role')).toBe('button');
    expect(control.tagName).toBe(addButton ? 'BUTTON' : 'DIV');
    expect(control.tabIndex).toBe(0);
    if (missingSidebar) document.getElementById('profile-selector')!.append(control);
    document.getElementById('emf-nav-launch')!.focus();
    if (mobile) nav.toggleMobileSidebar();
    if (missingSidebar) document.getElementById('sidebar-nav')!.remove();
    const observe = (event: Event) => events.push({type: event.type, key: event instanceof KeyboardEvent ? event.key : null, prevented: event.defaultPrevented, trusted: event.isTrusted});
    document.addEventListener('click', observe);
    document.addEventListener('keydown', observe);
    const event = activation === 'click' ? new MouseEvent('click', {bubbles: true, cancelable: true}) : new KeyboardEvent('keydown', {key: activation, bubbles: true, cancelable: true});
    control.focus();
    (activation === 'click' ? control.querySelector('span') || control : control).dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(JSON.stringify(freshState.importedData)).toBe(originalProfile);
    expect(JSON.stringify(freshState.profiles)).toBe(originalRegistry);
    expect(localStorage.getItem('emf-nav-protected-fixture')).toBe('unchanged');
    return {calls, events, backdropClosures: backdropRemoval.mock.calls.filter(args => args.includes('show')).length, sidebarOpen: !!document.getElementById('sidebar-nav')?.classList.contains('mobile-open'), backdropShown: !!document.getElementById('sidebar-backdrop')?.classList.contains('show'), modalShown: !!document.getElementById('modal-overlay')?.classList.contains('show'), bodyOverflow: document.body.style.overflow};
  } finally {
    backdropRemoval.mockRestore();
    runtime.configureNavRuntime(previousRuntime);
    nav.closeMobileSidebar();
    lifecycle.closeModalOverlay('modal-overlay', {restoreFocus: false});
    for (const [type, listener, options] of registrations.mock.calls) if (listener) document.removeEventListener(type, listener, options);
    registrations.mockRestore();
  }
}

it.each(['click', 'Enter', ' '] as const)('closes the genuine mobile Sidebar before the EMF %s runtime handoff', async activation => {
  const receipt = await captureEMFMobileHandoff(activation, true);
  expect(receipt.calls).toEqual([{sidebarOpen: false, backdropShown: false, bodyOverflow: '', modalShown: false}]);
  expect(receipt).toMatchObject({sidebarOpen: false, backdropShown: false, modalShown: true, bodyOverflow: 'hidden'});
  expect(receipt.events).toEqual(activation === 'click' ? [{type: 'click', key: null, prevented: true, trusted: false}] : [{type: 'click', key: null, prevented: true, trusted: false}, {type: 'keydown', key: activation, prevented: true, trusted: false}]);
});
it('retains the desktop EMF handoff without a mobile surface', async () => {
  const receipt = await captureEMFMobileHandoff('click', false);
  expect(receipt.calls).toEqual([{sidebarOpen: false, backdropShown: false, bodyOverflow: '', modalShown: false}]);
  expect(receipt).toMatchObject({sidebarOpen: false, backdropShown: false, modalShown: true, bodyOverflow: 'hidden'});
});
it('tolerates a missing Sidebar while retaining the scoped profile action handoff', async () => {
  const receipt = await captureEMFMobileHandoff('Enter', false, true);
  expect(receipt.calls).toEqual([{sidebarOpen: false, backdropShown: false, bodyOverflow: '', modalShown: false}]);
  expect(receipt.modalShown).toBe(true);
});


it.each(['click', 'Enter', ' '] as const)('closes the mobile Sidebar exactly once before the Custom markers row %s handoff', async activation => {
  const receipt = await captureEMFMobileHandoff(activation, true, false, 'open-custom-marker');
  expect(receipt.calls).toEqual([{sidebarOpen: false, backdropShown: false, bodyOverflow: '', modalShown: false}]);
  expect(receipt).toMatchObject({backdropClosures: 1, sidebarOpen: false, backdropShown: false, modalShown: true, bodyOverflow: 'hidden'});
  expect(receipt.events).toEqual(activation === 'click' ? [{type: 'click', key: null, prevented: true, trusted: false}] : [{type: 'click', key: null, prevented: true, trusted: false}, {type: 'keydown', key: activation, prevented: true, trusted: false}]);
});
it('closes the mobile Sidebar before its custom-marker add button hands off once', async () => {
  const receipt = await captureEMFMobileHandoff('click', true, false, 'open-custom-marker', true);
  expect(receipt.calls).toEqual([{sidebarOpen: false, backdropShown: false, bodyOverflow: '', modalShown: false}]);
  expect(receipt).toMatchObject({backdropClosures: 1, sidebarOpen: false, backdropShown: false, modalShown: true, bodyOverflow: 'hidden'});
});
it.each([false, true])('retains the desktop Custom markers handoff without closing a mobile surface (add button %s)', async addButton => {
  const receipt = await captureEMFMobileHandoff('click', false, false, 'open-custom-marker', addButton);
  expect(receipt.calls).toEqual([{sidebarOpen: false, backdropShown: false, bodyOverflow: '', modalShown: false}]);
  expect(receipt).toMatchObject({backdropClosures: 0, sidebarOpen: false, backdropShown: false, modalShown: true, bodyOverflow: 'hidden'});
});
