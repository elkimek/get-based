import fs from 'node:fs';
import vm from 'node:vm';
import {JSDOM} from 'jsdom';
import {expect,it} from 'vitest';
import {escapeHTML} from '../js/utils.js';
import {renderMobileNavigation} from '../js/mobile-navigation-presentation.js';
import {projectLabDateRange} from '../js/lab-date-range-presentation.js';
import {renderMobileDashboardPage} from '../js/mobile-dashboard-presentation.js';
import {renderDashboardWidgetFrame,type DashboardWidgetFrameView} from '../js/dashboard-widget-presentation.js';
import {renderHTML as actionHTML} from '../js/components/DashboardActionBar.svelte.html.js';
import {renderHTML as rangeHTML} from '../js/components/LabDateRange.svelte.html.js';
import type {MobileDataReader} from '../types/mobile-dashboard.js';
const before=fs.readFileSync('tests/fixtures/mobile-dashboard-native-before/mobile-dashboard.js.txt','utf8');
const after=fs.readFileSync('js/mobile-dashboard.js','utf8');
const frame=(id:string):DashboardWidgetFrameView=>({id,className:'dashboard-widget dashboard-widget-full',dragId:null,organizing:false,source:null,title:'Source '+id,description:null,tools:null,content:{kind:'body-sources',view:{empty:true,sources:[]}}});
interface Options {entries?:number;dates?:number;organizing?:boolean;reset?:unknown;firstName?:unknown;missingMain?:boolean;fault?:number;catalogThrows?:boolean}
function procedure(source:string,role:'before'|'after'):string{
 const head=source.indexOf(role==='before'?'function renderMobileSectionHead(':'function projectMobileDashboardWidgetStack(');
 const stop=source.indexOf('export function openMobileDashboardSearch(',head);
 const main=source.indexOf('export function renderMobileDashboard(');expect(head).toBeGreaterThanOrEqual(0);expect(stop).toBeGreaterThan(head);expect(main).toBeGreaterThan(stop);
 return (source.slice(head,stop)+'\n'+source.slice(main)).replaceAll('export function','function');
}
function tree(node:Node):unknown{
 if(node.nodeType===8){expect(['','[',']','[-1',...Array.from({length:20},(_,i)=>'['+i)]).toContain(node.nodeValue);return null;}
 if(node.nodeType===3)return node.nodeValue||null;
 const element=node as Element;const children:unknown[]=[];
 for(const child of node.childNodes){const value=tree(child);if(value===null)continue;const last=children.at(-1);if(typeof value==='string'&&typeof last==='string')children[children.length-1]=last+value;else children.push(value);}
 return {name:element.nodeName,attributes:[...element.attributes].map(a=>[a.name,a.value]),children,
  ...(element.tagName==='BUTTON'?{type:(element as HTMLButtonElement).type,disabled:(element as HTMLButtonElement).disabled,value:(element as HTMLButtonElement).value}:{}),
  ...(element.tagName==='INPUT'?{type:(element as HTMLInputElement).type,value:(element as HTMLInputElement).value,checked:(element as HTMLInputElement).checked}:{}),
  ...(element.tagName==='SELECT'?{value:(element as HTMLSelectElement).value,selected:(element as HTMLSelectElement).selectedIndex}:{}),
 };
}
function run(role:'before'|'after',options:Options={}){
 const dom=new JSDOM(options.missingMain?'<body></body>':'<body><main id="main-content"></main></body>');const w=dom.window,events:string[]=[];let step=0;
 const observe=(label:string)=>{events.push(label);if(++step===options.fault)throw Error('fault:'+label);};
 const entries=Array.from({length:options.entries??0},(_,index)=>({def:{id:'widget-'+index},view:frame('widget-'+index)}));
 const prefs={order:[],hidden:[]},ctx={id:'context'},range=projectLabDateRange('all',true);
 const actions={organizeLabel:options.organizing?'Done' as const:'Customize' as const,showReset:!!options.organizing};
 const deps={
  buildDashboardWidgetContext(data:unknown){observe('build-context');expect(data).toBe(input);return ctx;},
  getDashboardWidgetPrefs(){observe('prefs');return prefs;},
  getVisibleDashboardWidgetEntries(c:unknown,p:unknown){observe('entries');expect(c).toBe(ctx);expect(p).toBe(prefs);return entries;},
  getVisibleDashboardWidgetViews(c:unknown,p:unknown){observe('entries');expect(c).toBe(ctx);expect(p).toBe(prefs);return entries;},
  isDashboardOrganizeMode(){observe('organize');return !!options.organizing;},
  renderDashboardControlButtons(value:{includeReset:unknown}){observe('controls:'+value.includeReset);return actionHTML({view:actions});},
  projectDashboardControlButtons(value:{includeReset:unknown}){observe('controls:'+value.includeReset);return actions;},
  renderDashboardWidget(entry:(typeof entries)[number],p:unknown,index:number,all:unknown){observe('widget:'+index);expect(p).toBe(prefs);expect(all).toBe(entries);return renderDashboardWidgetFrame(entry.view);},
  projectDashboardWidget(entry:(typeof entries)[number],p:unknown,index:number,all:unknown){observe('widget:'+index);expect(p).toBe(prefs);expect(all).toBe(entries);return entry.view;},
  setupDropZone(){observe('drop-zone');},loadContextCardTips(){observe('tips');},loadCommitHash(){observe('commit');},
  loadCatalog(){observe('catalog');if(options.catalogThrows)throw Error('catalog-refused');return {then(callback:(value:unknown)=>void){observe('then');callback({fixture:true});}};},
  cacheCatalog(value:unknown){observe('cache');expect(value).toEqual({fixture:true});},
 };
 const input:MobileDataReader={dates:Array.from({length:options.dates??0},(_,index)=>'2026-01-0'+(index+1)),categories:{}};
 const bindings={mobileDashboardDeps:deps,document:w.document,HTMLElement:w.HTMLElement,escapeHTML,renderMobileNavigation,renderMobileDashboardPage,
  // This VM isolates original shell projection/effects. The real page host owns its
  // separate current lifecycle suite and unchanged browser acceptance scenarios.
  disposeDashboardPage(){},hydrateMobileDashboardPage(){},
  // Explicit resident boundary: original projection/DOM/effect receipts below
  // still run in full; cold loading and retirement have independent tests.
  getLoadedMobileDashboardRenderer(){return {renderMobileDashboardPage,hydrateMobileDashboardPage(){}};},
  beginDashboardRenderRequest(){return {isCurrent:()=>true,mayRunFocusEffects:()=>true};},
  isMobileDashboardViewport(){return true;},
  getMobileDashboardProfile(){observe('profile');return {name:'Profile'};},
  getMobileGreetingName(){observe('name');return options.firstName??'Alex';},
  getMobileDashboardCounts(){observe('counts');return {markerCount:3,latestDate:options.dates?'2026-01-01':'',inRange:2,flagged:1};},
  formatDate(){observe('date-label');return 'Jan 1';},
  syncMobileChromeRootState(){observe('sync');w.document.documentElement.classList.toggle('mobile-dashboard-active',w.document.body.classList.contains('mobile-dashboard-active'));},
  renderDateRangeFilter(){observe('range');return rangeHTML({view:range});},
  projectDateRangeFilter(){observe('range');return range;},
  scrollMobileDashboardToTop(){observe('scroll');},refreshMobileDashboardActiveTab(){observe('tab');if(w.document.body.classList.contains('mobile-dashboard-active'))w.document.querySelectorAll<HTMLElement>('.m-tab').forEach(button=>{const active=button.dataset.tab==='dashboard';button.classList.toggle('active',active);button.setAttribute('aria-current',active?'page':'false');});},loadContextHealthDots(){observe('dots');},input,reset:options.reset??false,
 };
 const context=vm.createContext(bindings);let error:string|null=null;
 try{vm.runInContext(procedure(role==='before'?before:after,role)+'\n;renderMobileDashboard(input,{resetScroll:reset});',context);}catch(value){error=(value as Error).message;}
 const main=w.document.getElementById('main-content');const receipt={events,error,tree:main?tree(main):null,bodyClass:w.document.body.className,rootClass:w.document.documentElement.className};w.close();return receipt;
}
for(const entries of [0,1,2])for(const dates of [0,1,2])for(const organizing of [false,true])it(`preserves complete mobile shell ${entries} widgets/${dates} draws/organize=${organizing}`,()=>{const original=run('before',{entries,dates,organizing,reset:true});expect(original.error).toBeNull();const current=run('after',{entries,dates,organizing,reset:true});expect(current.error).toBeNull();expect(current).toEqual(original);});
it('returns before callbacks and effects when the main receiver is absent',()=>{expect(run('after',{missingMain:true})).toEqual(run('before',{missingMain:true}));expect(run('after',{missingMain:true}).events).toEqual([]);});
it('preserves every synchronous callback fault boundary and partial DOM/class state',()=>{
 const sample=run('before',{entries:2,dates:2,reset:true});expect(sample.error).toBeNull();
 for(let fault=1;fault<=sample.events.length;fault++)expect(run('after',{entries:2,dates:2,reset:true,fault})).toEqual(run('before',{entries:2,dates:2,reset:true,fault}));
});
it('preserves throwing text conversion after class sync and before date controls',()=>{
 const name={toString(){throw Error('name-refused');}};expect(run('after',{firstName:name,dates:1})).toEqual(run('before',{firstName:name,dates:1}));
 expect(run('after',{firstName:name,dates:1}).events.at(-1)).toBe('sync');
});
it('preserves literal greeting text and synchronous catalog failure after mounted navigation',()=>{
 expect(run('after',{firstName:'<literal> & name',dates:1})).toEqual(run('before',{firstName:'<literal> & name',dates:1}));
 expect(run('after',{entries:1,catalogThrows:true})).toEqual(run('before',{entries:1,catalogThrows:true}));
});
it('owns the whole page and stack with genuine children and no ordinary child markup',()=>{
 expect(fs.readFileSync('js/mobile-dashboard.ts','utf8')).not.toMatch(/`<(?:div|section)|renderMobileSectionHead|mobileDashboardActionAttrs|renderDashboardWidget\(/);
 for(const name of ['MobileDashboardPage','MobileDashboardWidgetStack'])expect(fs.readFileSync('js/components/'+name+'.svelte','utf8')).not.toContain('{@html');
 expect(fs.readFileSync('js/components/MobileDashboardPage.svelte','utf8')).toContain('<MobileBottomNavigation');
 expect(fs.readFileSync('js/components/MobileDashboardWidgetStack.svelte','utf8')).toContain('<DashboardWidgetFrame');
});
it('keeps unknown HTML comments observable',()=>{const dom=new JSDOM('<div><!--foreign--></div>');try{expect(()=>tree(dom.window.document.querySelector('div')!)).toThrow();}finally{dom.window.close();}});
