// @vitest-environment jsdom
import {it,expect,afterEach,beforeEach,vi} from 'vitest';
import * as candidate from '../js/therapy-correlation-view.js';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {compareGenuineReceipt} from './helpers/compare-genuine-native-receipts.js';
import {expectedCorrelationWorkspaceHTML} from './helpers/correlations-workspace-owned-receipts.js';
import {prepareCorrelationSelection} from '../js/therapy-correlations.js';
import {state} from '../js/state.js';
const fault=vi.hoisted(()=>({apply:(raw:string)=>raw}));
vi.mock('../js/components/CorrelationWorkspaceChrome.svelte.html.js',async original=>{const actual=await original<typeof import('../js/components/CorrelationWorkspaceChrome.svelte.html.js')>();return {...actual,renderHTML:(props:Parameters<typeof actual.renderHTML>[0])=>fault.apply(actual.renderHTML(props))};});
const boundary=vi.hoisted(()=>({charts:0,saves:0}));
vi.mock('../js/charts-runtime.js',async importOriginal=>({...await importOriginal<typeof import('../js/charts-runtime.js')>(),createChartRuntime:()=>{boundary.charts++;return null;}}));
vi.mock('../js/correlation-workspace-store.js',()=>({saveCorrelationWorkspace:()=>{boundary.saves++;return Promise.resolve();}}));
const initialView=state.correlationView,initialCharts=state.chartInstances,initialProfile=state.currentProfile;
const before=JSON.parse(readFileSync(path.join(__dirname,'fixtures/correlation-workspace-chrome-original.json'),'utf8')) as {name:string;original:unknown}[];
beforeEach(()=>{vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date(2026,9,12,12));});
afterEach(()=>{fault.apply=raw=>raw;vi.useRealTimers();state.correlationView=initialView;state.chartInstances=initialCharts;state.currentProfile=initialProfile;vi.restoreAllMocks();vi.unstubAllGlobals();});

type Selection=Parameters<typeof candidate.renderCorrelationWorkspace>[0];
type Mode='therapy-timeline'|'therapy-data'|'therapy-scatter'|'marker-timeline'|'marker-data'|'marker-scatter'|'empty'|'unknown-dose'|'range-error'|'warnings-baseline'|'needs-dates';
type Scenario={name:string;view?:Partial<typeof state.correlationView>;multiple?:boolean;ingredients?:boolean;noLabs?:boolean;rangeError?:boolean;trace?:'none'|'getters'|'throw'|'control-getters'|'control-throw'|'chrome-getters'|'chrome-throw';interact?:boolean;chromeActions?:boolean;current?:'unconfirmed'|'confirmed';usageOnly?:boolean;usageBreak?:boolean;mixed?:boolean;invalid?:boolean};
function fixture(mode:Mode,scenario:Scenario):Selection {
 const dates=['2025-12-01','2026-01-10','2026-01-20','2026-02-10','2026-03-10','2026-03-20','2026-04-10'];
 const record={id:'dose-example',name:'<Therapy> & "gb-therapy-slot0"',type:'supplement',...(mode==='needs-dates'?{timesPerDay:1,ingredients:[{name:'Current ingredient',amountValue:500,amountUnit:'mg'}]}:{}),periods:[{start:'2026-01-01',end:'2026-02-28',dose:'500 mg',schedule:{mode:'daily'}},{start:'2026-03-01',end:null,dose:'2000 mg',schedule:{mode:'daily'}}]};
 if(scenario.ingredients){Object.assign(record,{ingredients:[{name:'A <&> gb-wc-private-0-1-end',amount:'500 mg'},{name:'B',amount:'25 mcg'}]});for(const p of record.periods)Object.assign(p,{ingredientDoses:[{ingredient:'A <&> gb-wc-private-0-1-end',value:500,unit:'mg',basis:'day',source:'ingredient'},{ingredient:'B',value:25,unit:'mcg',basis:'day',source:'ingredient'}]});}
 if(scenario.current){Object.assign(record,{timesPerDay:1,ingredients:[{name:'Current <ingredient> gb-chrome-private-0-1-end',amountValue:500,amountUnit:'mg'}]});for(const p of record.periods){delete (p as {dose?:string}).dose;if(scenario.current==='confirmed')Object.assign(p,{ingredientDoses:[{ingredient:'Current <ingredient> gb-chrome-private-0-1-end',value:500,unit:'mg',basis:'day',source:'ingredient'}]});}}
 if(scenario.usageOnly)record.periods.forEach(p=>{p.dose='unknown';});
 if(scenario.usageBreak)record.periods[0]!.end='2026-01-20';
 if(scenario.mixed)record.periods[0]!.dose='25 IU';
 if(scenario.invalid)record.periods[1]!.start='2026-02-01';
 if(mode==='unknown-dose')record.periods[0]!.dose='unknown';
 if(mode==='needs-dates')record.periods.forEach(p=>{p.dose='unknown';});
 const data={dates,dateLabels:dates,categories:{test:{label:'Test',markers:{first:{name:'<Marker> & "gb-therapy-child4"',unit:'mg/dL',values:[2,1,1,1,4,4,4]},second:{name:'Second "<Marker>"',unit:'nmol/L',values:[3,2,2,2,5,5,5]}}}}};
 const imported={entries:dates.map((date,i)=>({id:'source-'+i,date,markers:{'test.first':data.categories.test.markers.first.values[i]!, 'test.second':data.categories.test.markers.second.values[i]!},sourceFile:'<source> & "gb-therapy-slot6"'})),supplements:[record]};
 const isMarker=mode.startsWith('marker');
 const selection=prepareCorrelationSelection(data,imported,isMarker||scenario.multiple?['test.first','test.second']:['test.first'],isMarker?[]:['dose-example'],0,mode==='range-error'||scenario.rangeError?{start:'2026-03-01',end:'2026-01-01'}:{...(scenario.ingredients?{ingredients:{'dose-example':'B'}}:{})});
 if(mode==='empty'){selection.pairs[0]!.rows=[];selection.pairs[0]!.groups=[];selection.pairs[0]!.n=0;selection.pairs[0]!.r=null;selection.pairs[0]!.baseline=null;}
 if(mode==='warnings-baseline'){selection.comparisons[0]!.warnings.push('<Warning> gb-therapy-child4');selection.comparisons[0]!.rows[0]!.reason='<Excluded>';}
 if(scenario.noLabs)selection.markers.forEach(m=>{m.rows=[];});
 return selection;
}
function tree(node:Node):unknown {if(node instanceof Element)return {type:node.nodeType,name:node.nodeName,attrs:[...node.attributes].map(a=>[a.name,a.value]),children:[...node.childNodes].map(tree),...(node instanceof HTMLInputElement?{value:node.value,defaultValue:node.defaultValue,type:node.type}:{}),...(node instanceof HTMLOptionElement?{value:node.value,selected:node.selected,defaultSelected:node.defaultSelected}:{}),...(node instanceof HTMLButtonElement?{type:node.type,disabled:node.disabled}:{}),...(node instanceof HTMLDetailsElement?{open:node.open}: {})};return {type:node.nodeType,text:node.nodeValue};}
function capture(owner:typeof candidate,mode:Mode,traceMode:'none'|'getters'|'throw'|'raw-date'|'formatted-scalar'|'control-getters'|'control-throw'|'chrome-getters'|'chrome-throw'='none',interact=false,scenario:Scenario={name:'default'}){
 vi.stubGlobal('document',document.implementation.createHTMLDocument('One public comparison workspace owner'));const selection=fixture(mode,scenario);state.correlationView={...initialView,tab:mode.endsWith('data')?'data':mode.endsWith('scatter')?'scatter':'timeline',rangePreset:'all',hidden:[],...scenario.view};state.chartInstances={};boundary.charts=0;boundary.saves=0;document.body.innerHTML='<div id="workspace"></div>';const container=document.getElementById('workspace')!;const trace:string[]=[],raw:{id:string;html:string}[]=[],lifecycle:unknown[]=[];let refresh=0;
 if(traceMode==='getters'||traceMode==='throw'){
  const pair=selection.pairs[0]!;
  Object.defineProperty(pair,'markerName',{get(){trace.push('markerName');return {toString(){trace.push('markerName.string');return '<Opaque marker>';}};}});
  Object.defineProperty(pair,'unit',{get(){trace.push('unit');if(traceMode==='throw')throw new RangeError('native-unit');return {toString(){trace.push('unit.string');return '<Opaque unit>';}};}});
  const group=pair.groups[0];if(group){Object.defineProperty(group,'ingredient',{get(){trace.push('group.ingredient');return {toString(){trace.push('group.ingredient.string');return 'Opaque ingredient';}};}});Object.defineProperty(group,'mean',{get(){trace.push('group.mean');return 2;}});}
  const oldBaseline=pair.baseline;Object.defineProperty(pair,'baseline',{get(){trace.push('baseline');return oldBaseline;}});
  const oldWarnings=pair.warnings;Object.defineProperty(pair,'warnings',{get(){trace.push('warnings');return oldWarnings;}});
  const row=pair.rows[0]!;Object.defineProperty(row,'reason',{get(){trace.push('reason');return {toString(){trace.push('reason.string');return '<Opaque reason>';}};}});
 }
 if(traceMode==='raw-date')selection.pairs[0]!.rows[0]!.date='<b>gb-therapy-slot0</b><!--native date-->';
 if(traceMode==='formatted-scalar')Object.defineProperty(selection.pairs[0]!.rows[0]!,'value',{get(){trace.push('scalar.value');return {valueOf(){trace.push('scalar.valueOf');return 1;},toFixed(n:number){trace.push('scalar.toFixed:'+n);return '<i>gb-therapy-slot1</i><!--native scalar-->';}};}});
 if(traceMode==='control-getters'||traceMode==='control-throw'){
  const rangeStart=selection.range.start;Object.defineProperty(selection.range,'start',{get(){trace.push('range.start');return rangeStart;}});
  const h=selection.histories[0]!;const name=h.name;Object.defineProperty(h,'name',{get(){trace.push('history.name');return name;}});
  let reads=0;Object.defineProperty(selection,'rangeError',{get(){trace.push('rangeError');if(traceMode==='control-throw'&&++reads===3)throw new RangeError('native-control');return '<Control alert> gb-wc-private-0-1-end';}});
 }
 if(traceMode==='chrome-getters'||traceMode==='chrome-throw'){
  const h=selection.histories[0]!;const doses=h.currentDoses;
  Object.defineProperty(h,'currentDoses',{get(){trace.push('chrome.currentDoses');return doses;}});
  for(const d of doses){const ingredient=d.ingredient,date=d.confirmedSince;Object.defineProperty(d,'ingredient',{get(){trace.push('chrome.ingredient');return ingredient;}});Object.defineProperty(d,'confirmedSince',{get(){trace.push('chrome.confirmedSince');if(traceMode==='chrome-throw')throw new RangeError('native-current-date');return date;}});}
  for(const m of selection.markers)for(const row of m.rows){const value=row.value;Object.defineProperty(row,'value',{get(){trace.push('chrome.row.value');return value;}});}
 }
 const descriptor=Object.getOwnPropertyDescriptor(Element.prototype,'innerHTML')!;vi.spyOn(Element.prototype,'innerHTML','set').mockImplementation(function(this:Element,value:string){raw.push({id:this.id,html:String(value)});descriptor.set!.call(this,value);});
 let error:string|null=null;try{owner.renderCorrelationWorkspace(selection,container,()=>{refresh++;});}catch(e){if(traceMode!=='throw'&&traceMode!=='control-throw'&&traceMode!=='chrome-throw')throw e;error=e instanceof Error?e.name+':'+e.message:String(e);}
 if(interact){container.querySelector<HTMLButtonElement>('[data-corr-tab="data"]')!.click();lifecycle.push({refresh,tab:state.correlationView.tab});container.querySelector<HTMLButtonElement>('[data-corr-choice="rangePreset"][data-corr-value="custom"]')!.click();lifecycle.push({refresh,rangePreset:state.correlationView.rangePreset,start:state.correlationView.start,end:state.correlationView.end});container.querySelector<HTMLButtonElement>('[data-corr-series]')!.click();lifecycle.push({refresh,hidden:state.correlationView.hidden});const details=container.querySelector<HTMLDetailsElement>('#corr-pair-detail details')!;details.open=true;lifecycle.push({detailOpen:details.open});}
 if(scenario.chromeActions){
  const input=container.querySelector<HTMLInputElement>('#corr-inspect')!;input.value='2026-03-10';input.dispatchEvent(new Event('change',{bubbles:true}));lifecycle.push({action:'inspect',value:input.value,date:state.correlationView.inspectDate,label:container.querySelector('#corr-inspect-label')!.textContent,unpinHidden:container.querySelector('#corr-unpin')!.hasAttribute('hidden'),readout:tree(container.querySelector('#corr-readout')!),saves:boundary.saves});
  container.querySelector<HTMLButtonElement>('#corr-unpin')!.click();lifecycle.push({action:'unpin',view:structuredClone(state.correlationView),unpinHidden:container.querySelector('#corr-unpin')!.hasAttribute('hidden'),saves:boundary.saves});
  const pairTab=container.querySelector<HTMLButtonElement>('[data-corr-pair]');if(pairTab){for(const key of ['ArrowRight','Home','End','ArrowLeft']){pairTab.dispatchEvent(new KeyboardEvent('keydown',{key,bubbles:true,cancelable:true}));lifecycle.push({action:key,pairKey:state.correlationView.pairKey,refresh,focus:document.activeElement?.id});}}
  const disclosure=container.querySelector<HTMLDetailsElement>('.corr-analysis-disclosure')!;disclosure.open=true;disclosure.dispatchEvent(new Event('toggle'));lifecycle.push({action:'analysis-open',analysisOpen:state.correlationView.analysisOpen,saves:boundary.saves});
 }
 const result={raw,tree:tree(container),trace,error,lifecycle,refresh,charts:boundary.charts,saves:boundary.saves,view:structuredClone(state.correlationView)};vi.restoreAllMocks();vi.unstubAllGlobals();return result;
}
const scenarios:Scenario[]=[
 {name:'all-timeline'}, {name:'custom-dates',view:{rangePreset:'custom'}}, {name:'separate-pairs',multiple:true,view:{grouping:'separate'}},
 {name:'aligned-lanes',multiple:true,view:{layout:'lanes'}}, {name:'all-hidden',view:{hidden:['test.first','dose-example']}},
 {name:'ingredient-options',ingredients:true}, {name:'range-error',rangeError:true}, {name:'scatter',view:{tab:'scatter'}}, {name:'data',view:{tab:'data'}},
 {name:'multiple-pair-data',multiple:true,view:{tab:'data'}}, {name:'multiple-pair-scatter',multiple:true,view:{tab:'scatter'}},
 {name:'current-unconfirmed',current:'unconfirmed'}, {name:'current-confirmed',current:'confirmed'},
 {name:'usage-only',usageOnly:true}, {name:'usage-only-lanes',usageOnly:true,view:{layout:'lanes'}},
 {name:'mixed-units-notice',mixed:true}, {name:'mixed-units-scatter-unavailable',mixed:true,view:{tab:'scatter'}}, {name:'usage-recorded-break-unknown',usageOnly:true,usageBreak:true}, {name:'invalid-period-notice',invalid:true},
 {name:'current-getter-order',current:'confirmed',trace:'chrome-getters'}, {name:'current-native-throw',current:'confirmed',trace:'chrome-throw'},
 {name:'inspector-analysis-and-pair-delegates',multiple:true,chromeActions:true}, {name:'usage-inspector-actions',usageOnly:true,chromeActions:true},
];
it.each(scenarios)('$name preserves genuine original full raw setters, ordered tree, native getter/throw/action receipts',scenario=>{
 const old=before.find(r=>r.name===scenario.name)!.original;
 const current=capture(candidate,'therapy-timeline',scenario.trace||'none',scenario.interact||false,scenario);
 const expected=compareGenuineReceipt(old);
 expect(compareGenuineReceipt(current)).toEqual(expected);
 if(scenario.trace==='chrome-throw')expect(current.error).toBe('RangeError:native-current-date');
 if(scenario.current==='unconfirmed')expect(JSON.stringify(current.tree)).toContain('data-corr-confirm-dose');
 if(scenario.usageOnly)expect(current.raw.some(r=>r.html.includes('corr-use-segment'))).toBe(true);
 if(scenario.chromeActions)expect(current.saves).toBeGreaterThan(0);
 if(scenario.mixed&&!scenario.view?.tab)expect(current.raw[0]!.html).toContain('Historical dose units or amount bases differ.');
 if(scenario.mixed&&scenario.view?.tab==='scatter')expect(current.raw[0]!.html).toContain('Scatter unavailable: dose units');
 if(scenario.usageBreak)for(const usage of ['recorded','paused','unknown'])expect(current.raw.some(r=>r.html.includes('corr-use-'+usage))).toBe(true);
 
});

for(const[name,change,sameDOM]of[
 ['root marker',(s:string)=>s.replace('<!--[-->',''),false],['foreign comment',(s:string)=>s.replace('<div','<!--foreign--><div'),false],['class',(s:string)=>s.replace('corr-workspace-tools','foreign-tools'),false],['visible field',(s:string)=>s.replace('Date range','Other range'),false],['action',(s:string)=>s.replace('data-corr-choice="rangePreset"','data-corr-choice="layout"'),false],['extra attribute',(s:string)=>s.replace('<div class="corr-workspace-tools"','<div data-foreign="x" class="corr-workspace-tools"'),false],['missing choice',(s:string)=>s.replace(/<button[^>]*id="corr-rangePreset-3m"[^>]*>3M<\/button>/,''),false],['canvas role',(s:string)=>s.replace('role="img"','role="button"'),false],['inspect date',(s:string)=>s.replace('value="2026-04-10"','value="2026-04-11"'),false],['disclosure',(s:string)=>s.replace('class="corr-analysis-disclosure"','class="corr-analysis-disclosure" open=""'),false],['attribute quote',(s:string)=>s.replace('data-corr-choice="rangePreset"',"data-corr-choice='rangePreset'"),true],['attribute entity',(s:string)=>s.replace('data-corr-choice="rangePreset"','data-corr-choice="rangePr&#101;set"'),true],['text entity',(s:string)=>s.replace('>Date range<','>&#68;ate range<'),true],['void lexeme',(s:string)=>s.replace('max="2026-10-12"/>','max="2026-10-12">'),true]
]as const)it('independent whole raw/DOM/data/action observer rejects '+name,()=>{
 const base=capture(candidate,'therapy-timeline');fault.apply=change;const actual=capture(candidate,'therapy-timeline');const expected=compareGenuineReceipt(before.find(row=>row.name==='all-timeline')!.original);
 // Independently authenticate the unchanged complete initial workspace bytes.
 // Keep the original full-receipt rejection below and add exact corruption
 // rejection, so a representation mismatch cannot make that assertion trivial.
 const native=before.find(row=>row.name==='all-timeline')!.original as {raw:{html:string}[]};
 const expectedHTML=expectedCorrelationWorkspaceHTML(native.raw[0]!.html,'workspace');
 expect(base.raw[0]!.html).toBe(expectedHTML);
 expect(()=>expect(actual.raw[0]!.html).toBe(expectedHTML)).toThrow();
 expect(actual.raw[0]!.html).not.toBe(base.raw[0]!.html);expect(()=>expect(actual).toEqual(expected)).toThrow();if(sameDOM)expect(actual.tree).toEqual(base.tree);else expect(actual.tree).not.toEqual(base.tree);
});
