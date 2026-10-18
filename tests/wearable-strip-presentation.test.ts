import {normalizeWearableReceipt} from './helpers/wearable-genuine-dom.js';
import {expectedWearableSparklineReceipt} from './helpers/wearable-strip-sparkline-owned-receipts.js';
import {expectedWearableEmptyReceipt} from './helpers/wearable-strip-empty-owned-receipts.js';
import {expectedWearableStubReceipt} from './helpers/wearable-strip-stub-owned-receipts.js';
// @vitest-environment jsdom
import {afterAll,afterEach,expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {state} from '../js/state.js';
import {CANONICAL_METRICS} from '../js/wearable-adapters.js';
import {configureWearablesRuntime} from '../js/wearables-runtime.js';
vi.useFakeTimers();vi.setSystemTime(new Date('2026-07-01T12:00:00Z'));
type Listener={type:string;callback:EventListenerOrEventListenerObject};
async function load(loadModule:()=>Promise<typeof import('../js/wearables.js')>){const listeners:Listener[]=[];const native=document.addEventListener.bind(document);const spy=vi.spyOn(document,'addEventListener').mockImplementation((type,callback,opts)=>{if(typeof callback==='function'&&['handleWearableActionClick','handleWearableActionKeydown','handleWearableFormSubmit'].includes(callback.name))listeners.push({type,callback});native(type,callback,opts);});try{const api=await loadModule();expect(listeners.map(row=>row.type)).toEqual(['click','keydown','submit']);for(const row of listeners)document.removeEventListener(row.type,row.callback);return{api,listeners};}finally{spy.mockRestore();}}
const candidate=await load(()=>import('../js/wearables.js'));
const metrics=()=>Object.fromEntries(Object.keys(CANONICAL_METRICS).map(id=>[id,{primarySource:'oura',latest:52,baseline:45,latestDate:'2026-06-29',weekly:[40,43,48,52],trend30d:'rising'}]));
const metric=(overrides:Record<string,unknown>={})=>({primarySource:'oura',latest:52,baseline:45,latestDate:'2026-06-29',weekly:[40,43,48,52],trend30d:'rising',...overrides});
const summary=(values:unknown={hrv_rmssd:metric()},sources:unknown={oura:{coverageDays:30,lastSyncAt:Date.now()}})=>({sources,metrics:values});
const primitive=(trace:string[],name:string,value:unknown)=>({[Symbol.toPrimitive](hint:string){trace.push(name+':'+hint);return value;}});
type Spec={summary?:unknown;mock?:boolean;hidden?:boolean;collapsed?:boolean;reorder?:boolean;order?:unknown;demo?:boolean;dismissed?:boolean;unit?:'EU'|'US';registryId?:keyof typeof CANONICAL_METRICS;registry?:Record<string,unknown>};
type Fixture=(trace:string[])=>Spec;
const fixtures:Record<string,Fixture>={
 'stub no summary':()=>({}),
 'dismissed stub':()=>({dismissed:true}),
 'hidden no summary':()=>({hidden:true}),
 'default mock':()=>({mock:true}),
 'mock hidden manual placeholders':()=>({mock:true,hidden:true}),
 'one source':()=>({summary:summary()}),
 'collapsed':()=>({summary:summary(),collapsed:true}),
 'demo tagged real data':()=>({summary:summary(),demo:true}),
 'all registered metric values':()=>({summary:summary(metrics())}),
 'all registered metric imperial values':()=>({summary:summary(metrics()),unit:'US'}),
 'reorder all registered metrics':()=>({summary:summary(metrics()),reorder:true}),
 'reorder three empty placeholders':()=>({summary:summary({}, {manual:{coverageDays:1,lastSyncAt:0}}),hidden:true,reorder:true}),
 'saved order duplicate and missing':()=>({summary:summary(metrics()),order:['weight','weight','not-real','rhr','bp_systolic']}),
 'empty sources stub':()=>({summary:summary({}, {})}),
 'empty metrics stub':()=>({summary:summary({})}),
 'null metrics stub':()=>({summary:summary(null)}),
 'manual hidden values':()=>({summary:summary({weight:metric({primarySource:'manual',latest:74,baseline:72}),bp_systolic:metric({primarySource:'manual',latest:122}),bp_diastolic:metric({primarySource:'manual',latest:78}),rhr:metric({primarySource:'manual',latest:60})},{manual:{coverageDays:8,lastSyncAt:0}}),hidden:true}),
 'hidden vendor values suppressed':()=>({summary:summary(),hidden:true}),
 'multiple source badge':()=>({summary:summary({hrv_rmssd:metric(),weight:metric({primarySource:'withings'})},{withings:{coverageDays:20,lastSyncAt:0},oura:{coverageDays:30,lastSyncAt:0},manual:{coverageDays:2,lastSyncAt:0}})}),
 'waiting source footer':()=>({summary:summary(undefined,{oura:{coverageDays:30,lastSyncAt:0},polar:{coverageDays:0,lastSyncAt:0},manual:{coverageDays:0,lastSyncAt:0}})}),
 'collapsed waiting footer':()=>({summary:summary(undefined,{oura:{coverageDays:30,lastSyncAt:0},polar:{coverageDays:0,lastSyncAt:0}}),collapsed:true}),
 'fresh and stale sync boundaries':()=>({summary:summary(undefined,{oura:{coverageDays:30,lastSyncAt:Date.now()-12*60*60*1000}})}),
 'per metric stale date':()=>({summary:summary({hrv_rmssd:metric(),rhr:metric({latestDate:'2026-06-30'})})}),
 'malformed staleness date':()=>({summary:summary({hrv_rmssd:metric({latestDate:'bad'}),rhr:metric({latestDate:'zzz'})})}),
 'no sparkline':()=>({summary:summary({hrv_rmssd:metric({weekly:[]})})}),
 'null sparkline':()=>({summary:summary({hrv_rmssd:metric({weekly:null})})}),
 'single sparkline point':()=>({summary:summary({hrv_rmssd:metric({weekly:[52]})})}),
 'zero baseline no delta':()=>({summary:summary({hrv_rmssd:metric({baseline:0})})}),
 'nonfinite baseline no delta':()=>({summary:summary({hrv_rmssd:metric({baseline:Infinity})})}),
 'negative delta':()=>({summary:summary({hrv_rmssd:metric({latest:30,weekly:[55,40,30]})})}),
 'flat delta':()=>({summary:summary({hrv_rmssd:metric({latest:45,weekly:[45,45,45]})})}),
 'improving trend':()=>({summary:summary({hrv_rmssd:metric({trend30d:'improving'})})}),
 'declining trend':()=>({summary:summary({hrv_rmssd:metric({trend30d:'declining'})})}),
 'flat trend':()=>({summary:summary({hrv_rmssd:metric({trend30d:'flat'})})}),
 'zero latest suppression':()=>({summary:summary({hrv_rmssd:metric({latest:0})})}),
 'null latest':()=>({summary:summary({hrv_rmssd:metric({latest:null})})}),
 'paired BP':()=>({summary:summary({bp_systolic:metric({latest:123}),bp_diastolic:metric({latest:78})},{manual:{coverageDays:1,lastSyncAt:0}})}),
 'unpaired BP diastolic':()=>({summary:summary({bp_diastolic:metric({latest:78})},{manual:{coverageDays:1,lastSyncAt:0}})}),
 'tight slash unit':()=>({summary:summary({resilience_level:metric({latest:3})})}),
 'absolute temperature delta':()=>({summary:summary({body_temp_delta:metric({latest:0.8,baseline:0.2})})}),
 'escaping canon fields':()=>({summary:summary(),registry:{label:'<&>"\'',sub:'<span> & "',ariaLabel:'<&>"\''}}),
 'Symbol labels escape explicitly':()=>({summary:summary(),registry:{label:Symbol('label'),sub:Symbol('sub'),ariaLabel:Symbol('aria')}}),
 'empty weight sub-label':()=>({summary:summary(),registryId:'weight',registry:{sub:'empty <&> sub'}}),
 'empty weight native lowercase failure':()=>({summary:summary(),registryId:'weight',registry:{label:Symbol('native lowercase')}}),
 'canon getter chronology':trace=>({summary:summary(),registry:Object.defineProperties({}, {label:{get(){trace.push('canon.label');return 'HRV';}},sub:{get(){trace.push('canon.sub');return 'RMSSD';}},ariaLabel:{get(){trace.push('canon.ariaLabel');return '';}},worseWhen:{get(){trace.push('canon.worseWhen');return 'down';}}})}),
 'canon escaped coercion order':trace=>({summary:summary(),registry:{label:primitive(trace,'label','HRV'),sub:primitive(trace,'sub','RMSSD'),ariaLabel:primitive(trace,'aria','HRV RMSSD')}}),
 'canon sub coercion throws':trace=>({summary:summary(),registry:{sub:{[Symbol.toPrimitive](hint:string){trace.push('sub:'+hint);throw new RangeError('sub coercion');}}}}),
 'latest getter chronology':trace=>({summary:summary({hrv_rmssd:Object.defineProperty(metric(),'latest',{get(){trace.push('latest:get');return 52;}})})}),
 'latest getter throws':trace=>({summary:summary({hrv_rmssd:Object.defineProperty(metric(),'latest',{get(){trace.push('latest:get');throw new SyntaxError('latest getter');}})})}),
 'weekly getter throws':trace=>({summary:summary({hrv_rmssd:Object.defineProperty(metric(),'weekly',{get(){trace.push('weekly:get');throw new Error('weekly getter');}})})}),
 'weekly map Symbol rejection':trace=>({summary:summary({hrv_rmssd:metric({weekly:Object.assign([42,52],{map(){trace.push('weekly.map');return{join(){trace.push('weekly.join');return Symbol('points');}};}})})})}),
 'summary sources getter chronology':trace=>({summary:Object.defineProperty(summary(),'sources',{get(){trace.push('sources:get');return{oura:{coverageDays:30,lastSyncAt:0}};}})}),
 'coverage numeric coercion chronology':trace=>({summary:summary(undefined,{oura:{coverageDays:primitive(trace,'coverage',30),lastSyncAt:0}})}),
 'source sync Symbol native numeric throw':()=>({summary:summary(undefined,{oura:{coverageDays:30,lastSyncAt:Symbol('sync')}})}),
};
function snapshot(value:unknown):unknown{if(value===undefined)return{type:'undefined'};if(typeof value==='number'&&!Number.isFinite(value))return{type:'number',value:String(value)};if(typeof value==='symbol')return{type:'symbol',description:value.description};if(typeof value==='function')return{type:'function',name:value.name,length:value.length};if(value===null||typeof value!=='object')return value;return Reflect.ownKeys(value).map(key=>{const d=Object.getOwnPropertyDescriptor(value,key)!;return[String(key),d.enumerable,d.configurable,'value'in d?['value',snapshot(d.value),d.writable]:['accessor',d.get?.name??null,d.set?.name??null]];});}
function dom(node:Node):unknown{if(node instanceof Element)return{type:node.nodeType,name:node.localName,namespace:node.namespaceURI,attributes:[...node.attributes].map(a=>[a.namespaceURI,a.name,a.value]),children:[...node.childNodes].map(dom)};return{type:node.nodeType,text:node.nodeValue};}
function setup(spec:Spec){localStorage.clear();document.body.innerHTML='';localStorage.setItem('foreign-wearable-fixture','preserved');if(!spec.mock)localStorage.setItem('wearables-mock-off','1');state.currentProfile='wearable-presentation-fixture';state.unitSystem=spec.unit||'EU';state._wearableReorderMode=!!spec.reorder;(state as {importedData:unknown}).importedData={wearableSummary:spec.summary,wearableCardOrder:spec.order,opaque:{keep:['all',3]}};if(spec.hidden)localStorage.setItem('wearables-strip-hidden-'+state.currentProfile,'1');if(spec.collapsed)localStorage.setItem('wearables-strip-collapsed','1');if(spec.dismissed)localStorage.setItem('labcharts-wearable-stub-dismissed-'+state.currentProfile,'1');if(spec.demo)localStorage.setItem('labcharts-profiles',JSON.stringify([{id:state.currentProfile,tags:['demo']}]));}
function receipt(api:typeof candidate.api,fixture:Fixture){const trace:string[]=[];const spec=fixture(trace);setup(spec);const canon=CANONICAL_METRICS[spec.registryId||'hrv_rmssd'];const beforeCanon=Object.getOwnPropertyDescriptors(canon);if(spec.registry)Object.defineProperties(canon,Object.fromEntries(Object.entries(Object.getOwnPropertyDescriptors(spec.registry)).map(([key,descriptor])=>[key,{...descriptor,configurable:true}])) );const before=snapshot(state.importedData),registry=snapshot(state.markerRegistry);const host=document.createElement('main');const setter=Object.getOwnPropertyDescriptor(Element.prototype,'innerHTML')!;const assignments:string[]=[];Object.defineProperty(host,'innerHTML',{get(){return setter.get!.call(host);},set(value:string){assignments.push(value);trace.push('host:assignment');setter.set!.call(host,value);}});let raw:string|null=null,error:unknown=null;try{raw=api.renderWearableStrip();host.innerHTML=raw;}catch(e){const err=e as Error;error={name:err.name,message:err.message};}finally{Object.defineProperties(canon,beforeCanon);}
return{raw,assignments,dom:dom(host),actions:[...host.querySelectorAll<HTMLElement>('[data-wearable-action]')].map(el=>({tag:el.localName,attributes:[...el.attributes].map(a=>[a.name,a.value]),label:el.textContent})),trace,error,before,after:snapshot(state.importedData),registryBefore:registry,registryAfter:snapshot(state.markerRegistry),exports:Object.keys(api),method:{name:api.renderWearableStrip.name,length:api.renderWearableStrip.length},storage:Array.from({length:localStorage.length},(_,j)=>{const key=localStorage.key(j)!;return[key,localStorage.getItem(key)];})};}
const originals=JSON.parse(readFileSync(path.join(import.meta.dirname,'fixtures/wearable-strip-original.json'),'utf8')) as {name:string;original:unknown}[];
it.each(Object.entries(fixtures))('%s preserves genuine original public raw/DOM/action/getter/coercion/throw contracts',(name,fixture)=>{const native=originals.find(row=>row.name===name)!.original,next=receipt(candidate.api,fixture);expect(normalizeWearableReceipt(next)).toEqual(normalizeWearableReceipt(expectedWearableSparklineReceipt(expectedWearableEmptyReceipt(expectedWearableStubReceipt(native as Record<string,unknown>)))));expect(next.after).toEqual(next.before);expect(next.registryAfter).toEqual(next.registryBefore);});
const actions=[['header click','.wearable-strip-header','click'],['chevron click','.wearable-collapse-arrow','click'],['native chevron Enter ignores delegate','.wearable-collapse-arrow','Enter'],['reorder toggle','.wearable-strip-reorder','click'],['stub dismiss','.wearable-strip-stub-dismiss','click'],['irrelevant Escape','.wearable-collapse-arrow','Escape']] as const;
function delegated(loaded:typeof candidate,selector:string,key:string){setup(selector.includes('stub')?{}:{summary:summary()});document.body.innerHTML=loaded.api.renderWearableStrip();const calls:string[]=[];const previous=configureWearablesRuntime({navigate:(route:string)=>calls.push(route)});for(const row of loaded.listeners)document.addEventListener(row.type,row.callback);const target=document.querySelector<HTMLElement>(selector)!;const event=key==='click'?new MouseEvent('click',{bubbles:true,cancelable:true}):new KeyboardEvent('keydown',{key,bubbles:true,cancelable:true});const before=snapshot(state.importedData);try{target.dispatchEvent(event);return{dom:dom(document.body),calls,prevented:event.defaultPrevented,before,after:snapshot(state.importedData),storage:Array.from({length:localStorage.length},(_,j)=>{const k=localStorage.key(j)!;return[k,localStorage.getItem(k)];})};}finally{for(const row of loaded.listeners)document.removeEventListener(row.type,row.callback);configureWearablesRuntime(previous);}}
it.each(actions)('%s preserves actual native delegated calls and ordered DOM',(name,selector,key)=>{const native=originals.find(row=>row.name===name)!.original,next=delegated(candidate,selector,key);expect(normalizeWearableReceipt(next)).toEqual(normalizeWearableReceipt(expectedWearableSparklineReceipt(expectedWearableEmptyReceipt(expectedWearableStubReceipt(native as Record<string,unknown>)))));expect(next.after).toEqual(next.before);});
afterEach(()=>vi.restoreAllMocks());

afterAll(()=>vi.useRealTimers());
