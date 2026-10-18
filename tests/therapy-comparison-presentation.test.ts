// @vitest-environment jsdom
import {it,expect,afterEach,beforeEach,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {compareGenuineReceipt} from './helpers/compare-genuine-native-receipts.js';
import * as candidate from '../js/therapy-correlation-view.js';
import {prepareCorrelationSelection} from '../js/therapy-correlations.js';
import {state} from '../js/state.js';
import {categoryRawDOM} from './helpers/category-genuine-native-dom.js';
import {renderMarkerPairComparison} from '../js/therapy-comparison-presentation.js';
const boundary=vi.hoisted(()=>({charts:0,saves:0}));
vi.mock('../js/charts-runtime.js',async importOriginal=>({...await importOriginal<typeof import('../js/charts-runtime.js')>(),createChartRuntime:()=>{boundary.charts++;return null;}}));
vi.mock('../js/correlation-workspace-store.js',()=>({saveCorrelationWorkspace:()=>{boundary.saves++;return Promise.resolve();}}));
const initialView=state.correlationView,initialCharts=state.chartInstances,initialProfile=state.currentProfile;const before=JSON.parse(readFileSync(path.join(__dirname,'fixtures/therapy-comparison-original.json'),'utf8')) as {name:string;original:unknown}[];
beforeEach(()=>{vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date(2026,9,12,12));});
afterEach(()=>{vi.useRealTimers();state.correlationView=initialView;state.chartInstances=initialCharts;state.currentProfile=initialProfile;vi.restoreAllMocks();vi.unstubAllGlobals();});

type Selection=Parameters<typeof candidate.renderCorrelationWorkspace>[0];
type Mode='therapy-timeline'|'therapy-data'|'therapy-scatter'|'marker-timeline'|'marker-data'|'marker-scatter'|'empty'|'unknown-dose'|'range-error'|'warnings-baseline'|'needs-dates';
function fixture(mode:Mode):Selection {
 const dates=['2025-12-01','2026-01-10','2026-01-20','2026-02-10','2026-03-10','2026-03-20','2026-04-10'];
 const record={id:'dose-example',name:'<Therapy> & "gb-therapy-slot0"',type:'supplement',...(mode==='needs-dates'?{timesPerDay:1,ingredients:[{name:'Current ingredient',amountValue:500,amountUnit:'mg'}]}:{}),periods:[{start:'2026-01-01',end:'2026-02-28',dose:'500 mg',schedule:{mode:'daily'}},{start:'2026-03-01',end:null,dose:'2000 mg',schedule:{mode:'daily'}}]};
 if(mode==='unknown-dose')record.periods[0]!.dose='unknown';
 if(mode==='needs-dates')record.periods.forEach(p=>{p.dose='unknown';});
 const data={dates,dateLabels:dates,categories:{test:{label:'Test',markers:{first:{name:'<Marker> & "gb-therapy-child4"',unit:'mg/dL',values:[2,1,1,1,4,4,4]},second:{name:'Second "<Marker>"',unit:'nmol/L',values:[3,2,2,2,5,5,5]}}}}};
 const imported={entries:dates.map((date,i)=>({id:'source-'+i,date,markers:{'test.first':data.categories.test.markers.first.values[i]!, 'test.second':data.categories.test.markers.second.values[i]!},sourceFile:'<source> & "gb-therapy-slot6"'})),supplements:[record]};
 const isMarker=mode.startsWith('marker');
 const selection=prepareCorrelationSelection(data,imported,isMarker?['test.first','test.second']:['test.first'],isMarker?[]:['dose-example'],0,mode==='range-error'?{start:'2026-03-01',end:'2026-01-01'}:{});
 if(mode==='empty'){selection.pairs[0]!.rows=[];selection.pairs[0]!.groups=[];selection.pairs[0]!.n=0;selection.pairs[0]!.r=null;selection.pairs[0]!.baseline=null;}
 if(mode==='warnings-baseline'){selection.comparisons[0]!.warnings.push('<Warning> gb-therapy-child4');selection.comparisons[0]!.rows[0]!.reason='<Excluded>';}
 return selection;
}
function tree(node:Node):unknown {if(node instanceof Element)return {type:node.nodeType,name:node.nodeName,attrs:[...node.attributes].map(a=>[a.name,a.value]),children:[...node.childNodes].map(tree),...(node instanceof HTMLInputElement?{value:node.value,defaultValue:node.defaultValue,type:node.type}:{}),...(node instanceof HTMLOptionElement?{value:node.value,selected:node.selected,defaultSelected:node.defaultSelected}:{}),...(node instanceof HTMLButtonElement?{type:node.type,disabled:node.disabled}:{}),...(node instanceof HTMLDetailsElement?{open:node.open}: {})};return {type:node.nodeType,text:node.nodeValue};}
function capture(owner:typeof candidate,mode:Mode,traceMode:'none'|'getters'|'throw'|'raw-date'|'formatted-scalar'='none',interact=false){
 vi.stubGlobal('document',document.implementation.createHTMLDocument('One public comparison workspace owner'));const selection=fixture(mode);state.correlationView={...initialView,tab:mode.endsWith('data')?'data':mode.endsWith('scatter')?'scatter':'timeline',rangePreset:'all',hidden:[]};state.chartInstances={};boundary.charts=0;boundary.saves=0;document.body.innerHTML='<div id="workspace"></div>';const container=document.getElementById('workspace')!;const trace:string[]=[],raw:{id:string;html:string}[]=[],lifecycle:unknown[]=[];let refresh=0;
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
 const descriptor=Object.getOwnPropertyDescriptor(Element.prototype,'innerHTML')!;vi.spyOn(Element.prototype,'innerHTML','set').mockImplementation(function(this:Element,value:string){raw.push({id:this.id,html:String(value)});descriptor.set!.call(this,value);});
 let error:string|null=null;try{owner.renderCorrelationWorkspace(selection,container,()=>{refresh++;});}catch(e){if(traceMode!=='throw')throw e;error=e instanceof Error?e.name+':'+e.message:String(e);}
 if(interact){container.querySelector<HTMLButtonElement>('[data-corr-tab="data"]')!.click();lifecycle.push({refresh,tab:state.correlationView.tab});container.querySelector<HTMLButtonElement>('[data-corr-choice="rangePreset"][data-corr-value="custom"]')!.click();lifecycle.push({refresh,rangePreset:state.correlationView.rangePreset,start:state.correlationView.start,end:state.correlationView.end});container.querySelector<HTMLButtonElement>('[data-corr-series]')!.click();lifecycle.push({refresh,hidden:state.correlationView.hidden});const details=container.querySelector<HTMLDetailsElement>('#corr-pair-detail details')!;details.open=true;lifecycle.push({detailOpen:details.open});}
 const result={raw,tree:tree(container),trace,error,lifecycle,refresh,charts:boundary.charts,saves:boundary.saves,view:structuredClone(state.correlationView)};vi.restoreAllMocks();vi.unstubAllGlobals();return result;
}
it.each(['therapy-timeline','therapy-data','therapy-scatter','marker-timeline','marker-data','marker-scatter','empty','unknown-dose','range-error','warnings-baseline','needs-dates'] as const)('%s preserves complete actual public raw and ordered native trees',mode=>{const old=before.find(r=>r.name===mode)!.original,current=capture(candidate,mode);expect(compareGenuineReceipt(current)).toEqual(compareGenuineReceipt(old));});
it.each(['therapy-data','marker-data'] as const)('%s retains opaque chronology and native throws',kind=>{for(const mode of ['getters','throw'] as const){const old=before.find(r=>r.name===kind+'-'+mode)!.original,current=capture(candidate,kind,mode);expect(compareGenuineReceipt(current)).toEqual(compareGenuineReceipt(old));if(mode==='throw')expect(current.error).toBe('RangeError:native-unit');}});
it.each(['raw-date','formatted-scalar'] as const)('%s preserves public raw compatibility and renders ordinary malformed values literally',mode=>{
 const current=capture(candidate,'marker-data',mode),old=before.find(r=>r.name===mode)!.original as typeof current;
 expect({...current,raw:[],tree:null}).toEqual({...old,raw:[],tree:null});
 expect(compareGenuineReceipt(current.raw.filter(packet=>packet.id!=='corr-pair-detail'))).toEqual(compareGenuineReceipt(old.raw.filter(packet=>packet.id!=='corr-pair-detail')));
 const raw=mode==='raw-date'?'<b>gb-therapy-slot0</b><!--native date-->':'<i>gb-therapy-slot1</i><!--native scalar-->';
 const packet=old.raw.find(packet=>packet.id==='corr-pair-detail')!,host=document.createElement('div');host.innerHTML=packet.html;
 const cell=host.querySelectorAll('tbody tr:first-child td')[mode==='raw-date'?0:1]!;
 expect(cell.innerHTML).toBe(raw);cell.textContent=raw;
 expect(categoryRawDOM(current.raw.find(packet=>packet.id==='corr-pair-detail')!.html)).toEqual(categoryRawDOM(host.innerHTML));
 const pair=fixture('marker-data').pairs[0]!;
 if(mode==='raw-date')pair.rows[0]!.date=raw;
 else Object.defineProperty(pair.rows[0]!,'value',{get(){return {valueOf(){return 1;},toFixed(){return raw;}};}});
 expect(renderMarkerPairComparison(pair,'data',sources=>[...new Set(sources.map(source=>source.source||source.id||source.date))].join(', '))).toBe(packet.html);
});
it('retains actual native workspace delegates and disclosure defaults',()=>{const old=before.find(r=>r.name==='native-delegates')!.original,current=capture(candidate,'therapy-timeline','none',true);expect(compareGenuineReceipt(current)).toEqual(compareGenuineReceipt(old));expect(current.refresh).toBe(3);});
