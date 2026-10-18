import {normalizeWearableReceipt} from './helpers/wearable-genuine-dom.js';
// @vitest-environment jsdom
import {afterAll,afterEach,expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {qualifyWearableDetailExpectedReceipt,WEARABLE_DETAIL_ORIGINAL_FIXTURE_SHA256} from './helpers/wearable-detail-native-emission.js';
import path from 'node:path';
import {state} from '../js/state.js';
import {CANONICAL_METRICS} from '../js/wearable-adapters.js';
import {configureWearableDetailRuntimeDeps} from '../js/wearables-detail-runtime.js';
import {closeModalOverlay} from '../js/modal-lifecycle.js';
import type {StoredWearableRow} from '../js/wearable-storage-types.js';
const runtime=vi.hoisted(()=>({read:async(_profile:string,_source:string,_start:string,_end:string):Promise<StoredWearableRow[]>=>[]}));
vi.mock('../js/wearables-store.js',async importOriginal=>{const real=await importOriginal<typeof import('../js/wearables-store.js')>();return{...real,getDailyRange:(profile:string,source:string,start:string,end:string)=>runtime.read(profile,source,start,end)};});
vi.useFakeTimers();vi.setSystemTime(new Date('2026-07-01T12:00:00Z'));
const candidate=await import('../js/wearables-detail-modal.js');
const metric=(values:Record<string,unknown>={})=>({primarySource:'oura',latest:52,latestDate:'2026-06-30',baseline:45,baselineP25:40,baselineP75:55,rolling:{d7:52,d30:48,d90:45},trend30d:'rising',weekly:[45,48,52],...values});
const row=(metricId='hrv_rmssd',value:unknown=52,date:unknown='2026-06-30',extra:Record<string,unknown>={})=>({source:'oura',date,[metricId]:value,...extra});
type Spec={metricId?:string;metric?:unknown;paired?:unknown;companion?:unknown;sources?:unknown;rows?:unknown;manual?:unknown;readError?:boolean;manualReadError?:boolean;range?:string;fromRangeToggle?:boolean;noModal?:boolean;noOverlay?:boolean;priorChart?:boolean;unit?:'EU'|'US';emf?:unknown;canon?:Record<string,unknown>;race?:boolean;trap?:'forward'|'backward'|'hidden'};
type Fixture=(trace:string[])=>Spec;
const primitive=(trace:string[],name:string,value:unknown)=>({[Symbol.toPrimitive](hint:string){trace.push(name+':'+hint);return value;}});
const fixtures:Record<string,Fixture>={
 'missing metric':()=>({metric:null}),
 'unknown metric ID':()=>({metricId:'unknown',metric:metric()}),
 'HRV empty source':()=>({}),
 'HRV chart':()=>({rows:[row(),row('hrv_rmssd',48,'2026-06-29')]}),
 'range 6 months':()=>({rows:[row()],range:'6m',fromRangeToggle:true}),
 'range 1 year':()=>({rows:[row()],range:'1y'}),
 'range all':()=>({rows:[row()],range:'all'}),
 'invalid saved range native fallback':()=>({rows:[row()],range:'invalid'}),
 'missing modal':()=>({noModal:true}),
 'missing overlay':()=>({noOverlay:true}),
 'prior chart destroyed before assignment':()=>({rows:[row()],priorChart:true}),
 'primary history error':()=>({readError:true}),
 'manual history error tolerated':()=>({metricId:'weight',metric:metric({primarySource:'withings'}),rows:[row('weight',74)],manualReadError:true}),
 'empty weight compact vendor affordance':()=>({metricId:'weight',metric:metric({primarySource:'withings'})}),
 'empty weight full manual section':()=>({metricId:'weight',metric:metric({primarySource:'manual'})}),
 'weight manual rows and tags/note':()=>({metricId:'weight',metric:metric({primarySource:'withings'}),rows:[row('weight',74)],manual:[row('weight',73,'2026-06-28',{tags:['after exercise','<&>"\'',Symbol('tag')],note:'Native <&> "note"'}),row('weight',72,'2026-06-27',{tags:[],note:'  '})]}),
 'weight manual US units':()=>({metricId:'weight',metric:metric({primarySource:'manual'}),rows:[row('weight',74)],manual:[row('weight',74)],unit:'US'}),
 'manual rows older than range':()=>({metricId:'weight',metric:metric({primarySource:'manual'}),manual:[row('weight',74,'2025-01-01')]}),
 'manual all-time older chart':()=>({metricId:'weight',metric:metric({primarySource:'manual'}),rows:[row('weight',74,'2025-01-01')],manual:[row('weight',74,'2025-01-01')],range:'all'}),
 'manual pulse readings':()=>({metricId:'rhr',metric:metric({primarySource:'manual'}),rows:[row('rhr',64)],manual:[row('rhr',64)]}),
 'BP paired same source':()=>({metricId:'bp_systolic',metric:metric({primarySource:'withings',latest:123,baseline:121}),paired:metric({primarySource:'withings',latest:79,baseline:78}),rows:[row('bp_systolic',123,'2026-06-30',{bp_diastolic:79}),row('bp_systolic',121,'2026-06-29',{bp_diastolic:77})]}),
 'BP diastolic ID redirects native':()=>({metricId:'bp_diastolic',metric:metric({primarySource:'withings',latest:123}),paired:metric({primarySource:'withings',latest:79}),rows:[row('bp_systolic',123,'2026-06-30',{bp_diastolic:79})]}),
 'BP paired different sources':()=>({metricId:'bp_systolic',metric:metric({primarySource:'withings',latest:123}),paired:metric({primarySource:'manual',latest:79}),sources:{withings:{},manual:{}},rows:[row('bp_systolic',123)],manual:[row('bp_diastolic',79)]}),
 'BP split summary dates':()=>({metricId:'bp_systolic',metric:metric({latest:123,latestDate:'2026-06-30'}),paired:metric({latest:79,latestDate:'2026-06-29'})}),
 'BP incomplete summary dates':()=>({metricId:'bp_systolic',metric:metric({latest:123,latestDate:''}),paired:metric({latest:79,latestDate:''})}),
 'BP manual pair and source swap':()=>({metricId:'bp_systolic',metric:metric({primarySource:'withings',latest:123}),paired:metric({primarySource:'oura',latest:79}),sources:{withings:{},oura:{}},manual:[row('bp_systolic',120,'2026-06-29',{bp_diastolic:78,note:'pair',tags:['resting']})]}),
 'single source swap':()=>({sources:{oura:{},fitbit:{}},rows:[row()]}),
 'unknown primary source fallback':()=>({metric:metric({primarySource:'<&> unknown'})}),
 'companion latest/7d/30d':()=>({companion:metric({latest:64,rolling:{d7:62,d30:60,d90:59}}),rows:[row()]}),
 'companion no sufficient weekly':()=>({companion:metric({weekly:[60]})}),
 'companion latest only':()=>({companion:metric({rolling:{d7:null,d30:null,d90:null}})}),
 'Polar daytime tooltip':()=>({metric:metric({primarySource:'polar'})}),
 'Whoop daytime tooltip':()=>({metric:metric({primarySource:'whoop'})}),
 'Fitbit daytime tooltip':()=>({metric:metric({primarySource:'fitbit'})}),
 'resting HR missing daytime tooltip':()=>({metricId:'rhr'}),
 'activity all-zero rest mode':()=>({metricId:'activity_score',metric:metric({latest:0,baseline:0}),rows:[row('activity_score',0),row('activity_score',0,'2026-06-29')]}),
 'temperature absolute delta':()=>({metricId:'body_temp_delta',metric:metric({latest:0.8,baseline:0.2})}),
 'steps suppress delta partial chart':()=>({metricId:'steps',metric:metric({latest:5234,baseline:7000}),rows:[row('steps',5234,'2026-07-01'),row('steps',8000,'2026-06-30')]}),
 'zero baseline suppress delta':()=>({metric:metric({baseline:0})}),
 'nonfinite baseline':()=>({metric:metric({baseline:Infinity})}),
 'null latest':()=>({metric:metric({latest:null})}),
 'zero latest suppression':()=>({metric:metric({latest:0})}),
 'improving trend':()=>({metric:metric({trend30d:'improving'})}),
 'declining trend':()=>({metric:metric({trend30d:'declining'})}),
 'native escaped canon labels':()=>({canon:{label:'<&>"\'',sub:'<button> & "'}}),
 'native Symbol canon labels':()=>({canon:{label:Symbol('label'),sub:Symbol('sub')}}),
 'native canon getter order':trace=>({canon:Object.defineProperties({}, {label:{get(){trace.push('label:get');return 'HRV';}},sub:{get(){trace.push('sub:get');return 'RMSSD';}},unit:{get(){trace.push('unit:get');return 'ms';}}})}),
 'native canon string hint':trace=>({canon:{label:primitive(trace,'label','HRV'),sub:primitive(trace,'sub','RMSSD')}}),
 'native label coercion throw':trace=>({canon:{label:{[Symbol.toPrimitive](hint:string){trace.push('label:'+hint);throw new RangeError('label coercion');}}}}),
 'native latest getter chronology':trace=>({metric:Object.defineProperty(metric(),'latest',{get(){trace.push('latest:get');return 52;}})}),
 'native latest getter throws after read':trace=>({metric:Object.defineProperty(metric(),'latest',{get(){trace.push('latest:get');throw new SyntaxError('latest getter');}})}),
 'native baseline Symbol numeric throw':()=>({metric:metric({baseline:Symbol('baseline')})}),
 'native manual note getter':trace=>({metricId:'weight',metric:metric({primarySource:'manual'}),manual:[Object.defineProperty(row('weight',74),'note',{get(){trace.push('note:get');return 'note';}})]}),
 'native manual row date throw':()=>({metricId:'weight',rows:[row('weight',74,null)]}),
 'EMF regressing sleep no assessment':()=>({metric:metric({rolling:{d7:30,d30:45,d90:45}})}),
 'EMF recent assessment suppresses hint':()=>({metric:metric({rolling:{d7:30,d30:45,d90:45}}),emf:{assessments:[{date:'2026-06-30'}]}}),
 'EMF old assessment allows hint':()=>({metric:metric({rolling:{d7:30,d30:45,d90:45}}),emf:{assessments:[{date:'2025-01-01'},{date:'2025-02-01'}]}}),
 'EMF no sources suppresses hint':()=>({metric:metric({rolling:{d7:30,d30:45,d90:45}}),sources:{}}),
 'native async stale operation is discarded':()=>({rows:[row('hrv_rmssd',52,'2026-06-30',{rhr:60})],race:true}),
 'forward Tab native focus wraps':()=>({rows:[row()],trap:'forward'}),
 'backward Tab native focus wraps':()=>({rows:[row()],trap:'backward'}),
 'hidden overlay detaches native trap':()=>({rows:[row()],trap:'hidden'}),
};
function snapshot(value:unknown):unknown{if(value===undefined)return{type:'undefined'};if(typeof value==='number'&&!Number.isFinite(value))return{type:'number',value:String(value)};if(typeof value==='symbol')return{type:'symbol',description:value.description};if(typeof value==='function')return{type:'function',name:value.name,length:value.length,source:value.toString()};if(value===null||typeof value!=='object')return value;return Reflect.ownKeys(value).map(key=>{const d=Object.getOwnPropertyDescriptor(value,key)!;return[String(key),d.enumerable,d.configurable,'value'in d?['value',snapshot(d.value),d.writable]:['accessor',d.get?.name??null,d.set?.name??null]];});}
function orderedDOM(node:Node):unknown{if(node instanceof Element)return{type:node.nodeType,name:node.localName,namespace:node.namespaceURI,attributes:[...node.attributes].map(a=>[a.namespaceURI,a.name,a.value]),children:[...node.childNodes].map(orderedDOM)};return{type:node.nodeType,text:node.nodeValue};}
type Api=typeof candidate;
async function receipt(api:Api,fixture:Fixture){
 candidate._uninstallWearableModalFocusTrap();localStorage.clear();document.body.innerHTML='<button id="native-trigger">Native trigger</button><div id="modal-overlay" class="modal-overlay"><div id="detail-modal" class="modal"></div></div>';document.body.style.overflow='';localStorage.setItem('wearable-detail-foreign','unchanged');const trace:string[]=[];const spec=fixture(trace),id=spec.metricId||'hrv_rmssd',normalized=id==='bp_diastolic'?'bp_systolic':id;const m=spec.metric===undefined?metric():spec.metric;state.currentProfile='wearable-detail-fixture';state.unitSystem=spec.unit||'EU';(state as {importedData:unknown}).importedData={wearableSummary:{sources:spec.sources||{oura:{}},metrics:{[normalized]:m,...(spec.paired?{bp_diastolic:spec.paired}:{}),...(spec.companion?{[id==='hrv_rmssd'?'hrv_day':'hr_day']:spec.companion}:{}),...(spec.race?{rhr:metric()}:{} )}},emfAssessment:spec.emf,opaque:{keep:['profile',3]}};
 if(spec.range)localStorage.setItem('wearable-detail-range',spec.range);if(spec.noModal)document.getElementById('detail-modal')!.remove();if(spec.noOverlay)document.getElementById('modal-overlay')!.remove();
 const canon=CANONICAL_METRICS[normalized as keyof typeof CANONICAL_METRICS];const canonBefore=canon?Object.getOwnPropertyDescriptors(canon):null;if(canon&&spec.canon)Object.defineProperties(canon,Object.fromEntries(Object.entries(Object.getOwnPropertyDescriptors(spec.canon)).map(([key,d])=>[key,{...d,configurable:true}])));
 const before=snapshot(state.importedData),registry=snapshot(state.markerRegistry);const chartCalls:unknown[]=[];const activeChartBefore=state.chartInstances.modal;delete state.chartInstances.modal;if(spec.priorChart)(state.chartInstances as Record<string,unknown>).modal={destroy(){trace.push('prior-chart:destroy');}};
 class RecordingChart{constructor(canvas:HTMLCanvasElement,rawConfig:unknown){const config=rawConfig as Record<string,unknown>;trace.push('chart:construct:'+canvas.id);chartCalls.push({canvas:canvas.id,config:snapshot(config),callbacks:chartCallbackReceipts(config)});}destroy(){trace.push('chart:destroy');}}
 (window as Window & {Chart?:unknown}).Chart=RecordingChart;(window as Window & {__labChartDateAdapterLoaded?:unknown}).__labChartDateAdapterLoaded=true;const previousRuntime=configureWearableDetailRuntimeDeps({rememberModalTrigger:()=>trace.push('remember-trigger')});
 let releaseFirst:((rows:StoredWearableRow[])=>void)|null=null;let reads=0;
 runtime.read=async(profile,source,start,end)=>{trace.push('read:'+profile+':'+source+':'+start+':'+end);if(source==='manual'&&spec.manualReadError)throw new Error('manual synthetic read');if(source!=='manual'&&spec.readError)throw new Error('primary synthetic read');const values=(source==='manual'?spec.manual||[]:spec.rows||[]) as StoredWearableRow[];if(spec.race&&++reads===1)return await new Promise<StoredWearableRow[]>(resolve=>{releaseFirst=resolve;});return source==='manual'&&start!=='1970-01-01'?values.filter(value=>typeof value.date==='string'&&value.date>=start&&value.date<=end):values;};
 const modal=document.getElementById('detail-modal');const setter=Object.getOwnPropertyDescriptor(Element.prototype,'innerHTML')!;const assignments:string[]=[];if(modal)Object.defineProperty(modal,'innerHTML',{configurable:true,get(){return setter.get!.call(modal);},set(value:string){trace.push('modal:assignment');assignments.push(value);setter.set!.call(modal,value);}});document.getElementById('native-trigger')!.focus();let error:unknown=null;
 try{if(spec.race){const pending=api.openWearableDetail(id);await api.openWearableDetail('rhr');const release=releaseFirst as ((rows:StoredWearableRow[])=>void)|null;expect(release).not.toBeNull();release!((spec.rows||[]) as StoredWearableRow[]);await pending;}else await api.openWearableDetail(id,{fromRangeToggle:!!spec.fromRangeToggle});}catch(e){const err=e as Error;error={name:err.name,message:err.message};}
 let trapReceipt:unknown=null;if(spec.trap&&modal){const targets=[...modal.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')];const first=targets[0],last=targets.at(-1);(spec.trap==='backward'?first:last)?.focus();if(spec.trap==='hidden')document.getElementById('modal-overlay')?.classList.remove('show');const event=new KeyboardEvent('keydown',{key:'Tab',shiftKey:spec.trap==='backward',bubbles:true,cancelable:true});document.dispatchEvent(event);trapReceipt={prevented:event.defaultPrevented,focused:document.activeElement instanceof Element?[document.activeElement.localName,[...document.activeElement.attributes].map(a=>[a.name,a.value])]:null};}
 const result={assignments,dom:orderedDOM(document.body),actions:[...document.querySelectorAll<HTMLElement>('[data-wearable-action]')].map(el=>({tag:el.localName,attributes:[...el.attributes].map(a=>[a.name,a.value]),label:el.textContent})),focused:document.activeElement instanceof Element?[document.activeElement.localName,[...document.activeElement.attributes].map(a=>[a.name,a.value])]:null,trapReceipt,trace,error,chartCalls,before,after:snapshot(state.importedData),registryBefore:registry,registryAfter:snapshot(state.markerRegistry),exports:Object.keys(api),method:{name:api.openWearableDetail.name,length:api.openWearableDetail.length},storage:Array.from({length:localStorage.length},(_,j)=>{const key=localStorage.key(j)!;return[key,localStorage.getItem(key)];})};
 api._uninstallWearableModalFocusTrap();closeModalOverlay(document.getElementById('modal-overlay'));configureWearableDetailRuntimeDeps(previousRuntime);if(canon&&canonBefore)Object.defineProperties(canon,canonBefore);if(activeChartBefore===undefined)delete state.chartInstances.modal;else state.chartInstances.modal=activeChartBefore;return result;
}
function chartCallbackReceipts(config:Record<string,unknown>){const data=config.data as {datasets:{label?:unknown;_kind?:unknown;data?:unknown[];segment?:Record<string,(context:{p1DataIndex:number})=>unknown>}[]};const options=config.options as {plugins:{tooltip:{callbacks:{title:(items:unknown)=>unknown;label:(ctx:unknown)=>unknown}}};scales:{y:{ticks:{callback?:(value:unknown)=>unknown}}}};const callbacks=options.plugins.tooltip.callbacks;return{title:[callbacks.title([]),callbacks.title([{label:'Fallback'}]),callbacks.title([{raw:{x:'2026-06-30'}}])],labels:data.datasets.flatMap(dataset=>[0,Math.max(0,(dataset.data?.length||1)-1)].map(dataIndex=>callbacks.label({dataset,parsed:{y:52},dataIndex}))),ticks:[0,52,-2].map(v=>options.scales.y.ticks.callback?.(v)),segments:data.datasets.map(dataset=>Object.entries(dataset.segment||{}).map(([name,callback])=>[name,snapshot(callback({p1DataIndex:0})),snapshot(callback({p1DataIndex:Math.max(0,(dataset.data?.length||1)-1)}))]))};}
const originalFixtureBytes=readFileSync(path.join(import.meta.dirname,'fixtures/wearable-detail-original.json'));
expect(createHash('sha256').update(originalFixtureBytes).digest('hex')).toBe(WEARABLE_DETAIL_ORIGINAL_FIXTURE_SHA256);
const originals=JSON.parse(new TextDecoder().decode(originalFixtureBytes)) as {name:string;original:unknown}[];
it.each(Object.entries(fixtures))('%s preserves genuine public async raw/DOM/focus/action/chart/getter/throw receipts',async(name,fixture)=>{const native=qualifyWearableDetailExpectedReceipt(name,originals.find(row=>row.name===name)!.original),next=await receipt(candidate,fixture);expect(normalizeWearableReceipt(next)).toEqual(normalizeWearableReceipt(native));expect(next.after).toEqual(next.before);expect(next.registryAfter).toEqual(next.registryBefore);});
afterEach(()=>vi.restoreAllMocks());

afterAll(()=>vi.useRealTimers());
