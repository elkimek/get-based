import {categoryNativeDOM,categoryRawDOM} from './helpers/category-genuine-native-dom.js';
// @vitest-environment jsdom
import {afterEach,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import * as candidate from '../js/category-view-renderers.js';
import {state} from '../js/state.js';
import type {CategoryMarkerReader,CategoryReader} from '../types/category-view-renderers.js';

type Renderer = typeof candidate;
type Scenario = {name:string;owner:'chart'|'table'|'heatmap'|'fatty'|'columns'|'shell'|'scroll';variant?:string;mode?:typeof state.rangeMode;trace?:'getter'|'throw'|'symbol'|'coercion'};
const saved={rangeMode:state.rangeMode,markerRegistry:state.markerRegistry};
afterEach(()=>{state.rangeMode=saved.rangeMode;state.markerRegistry=saved.markerRegistry;document.body.replaceChildren();});
const originalReceipts=JSON.parse(readFileSync(path.join(import.meta.dirname,'fixtures/category-presentation-original.json'),'utf8')) as {name:string;original:unknown}[];
function tree(n:Node):unknown{return n.nodeType===Node.ELEMENT_NODE?{tag:(n as Element).tagName,attrs:[...(n as Element).attributes].map(a=>[a.name,a.value]),children:[...n.childNodes].map(tree)}:{type:n.nodeType,text:n.nodeValue};}
function capture(renderer:Renderer,scenario:Scenario){
 const trace:string[]=[];let nameReads=0;
 let marker:CategoryMarkerReader={name:'ApoB <&> gb-category-categorychartcard-shell-name',unit:'mg/dL',values:[80,null,130,110,90],refMin:60,refMax:100,optimalMin:60,optimalMax:90};
 const empty:CategoryMarkerReader={name:'Empty',unit:'',values:[null,undefined,null,null,null],refMin:null,refMax:null};
 const sparse:CategoryMarkerReader={name:'Sparse',unit:'long qualifier / sample',values:[null,42,null,null,null],refMin:40,refMax:60};
 const labels:unknown[]=['Jan 1 &lt;raw&gt;','Feb 1','Mar 1','Apr 1','May 1'];const dates=['2026-01-01','2026-02-01','2026-03-01','2026-04-01','2026-05-01'];
 const variant=scenario.variant;
 if(variant==='missing')marker={...marker,values:[null,null,null,null,null]};
 if(variant==='undefined')marker={...marker,values:[undefined,undefined]};
 if(variant==='unrated')marker={...marker,refMin:null,refMax:null,optimalMin:null,optimalMax:null};
 if(variant==='phase')Object.assign(marker,{phaseLabels:['luteal'],phaseRefRanges:[null,null,null,null,{min:100,max:120}]});
 if(variant==='context')Object.assign(marker,{contextRefRanges:[null,null,null,null,{min:80,max:110}],contextOptimalRanges:[null,null,null,null,{min:85,max:95}]});
 if(variant==='unset-context')Object.assign(marker,{contextRefRanges:[null,null,null,null,{min:null,max:null}],contextOptimalRanges:[null,null,null,null,{min:null,max:null}]});
 if(variant==='single')Object.assign(marker,{singlePoint:true,singleDateLabel:'One sample'});
 if(variant==='duplicate-labels')labels.splice(0,labels.length,'May','May','May','May','May');
 if(variant==='long-unit')marker.unit='ratio / plasma sample';
 if(variant==='unicode-unit')marker.unit='🧬'.repeat(13);
 if(variant==='reversed')Object.assign(marker,{refMin:100,refMax:60,values:[150]});
 if(variant==='low-outlier')marker.values=[1];
 if(variant==='high-outlier')marker.values=[500];
 if(variant==='equal-range')Object.assign(marker,{refMin:90,refMax:90,values:[90]});
 if(variant==='partial-range')Object.assign(marker,{refMin:null,refMax:100});
 if(variant==='single-fatty')marker.values=[8];
 if(scenario.trace==='symbol')marker.name=Symbol('native-name');
 if(scenario.trace==='getter'||scenario.trace==='throw'){
  const data=marker;marker=new Proxy(data,{get(target,key,receiver){if(typeof key==='string'){trace.push('marker.'+key);if(key==='name'&&scenario.trace==='throw'&&++nameReads===1)throw new RangeError('native-category-name');}return Reflect.get(target,key,receiver);}});
 }
 state.rangeMode=scenario.mode||'reference';state.markerRegistry={};
 let cat:CategoryReader={markers:{apob:marker,sparse,empty}};
 if(variant==='empty')cat={markers:{empty}};
 if(variant==='sparse')marker.values=[undefined,5,null,7];
 if(variant==='single-date')Object.assign(cat,{singleDate:'2026-05-20',singleDateLabel:'May 20'});
 if(variant==='unsafe-key')cat={markers:{'unsafe<':marker,apob:marker}};
 const coerce=(label:string,value:string)=>({[Symbol.toPrimitive](hint:string){trace.push(label+':'+hint);return value;}});
 let raw='',error:string|null=null;let delegates:unknown=null;
 try{
  if(scenario.owner==='chart')raw=renderer.renderChartCard(variant==='unsafe-id'?'bad<':'lipids_apob',marker,labels,dates);
  else if(scenario.owner==='table')raw=renderer.renderTableView(cat,labels,variant==='no-key'?null:'lipids',variant==='no-dates'?null:dates);
  else if(scenario.owner==='heatmap')raw=renderer.renderHeatmapView(cat,labels,'lipids');
  else if(scenario.owner==='fatty')raw=renderer.renderFattyAcidsView(cat,variant==='unsafe-id'?'bad<':'fatty');
  else if(scenario.owner==='columns')raw=renderer.renderTableColgroup(scenario.trace==='coercion'?[coerce('column','gb-col-<&>'),'gb-col-date']:['gb-col-marker','gb-col-date']);
  else if(scenario.owner==='shell')raw=renderer.renderScrollableTableShell('data','data-table-wrapper','data-table',coerce('columns','<colgroup><col></colgroup>'),coerce('head','<tr><th>native</th></tr>'),coerce('body','<tr><td>body</td></tr>'),variant==='nan-width'?NaN:300.3);
  else{
   const listeners:{type:string;callback:(event:Event)=>void;options:unknown}[]=[];
   const host=document.createElement('div');host.innerHTML='<div class="gb-table-shell"><div data-gb-table-scroll-sync></div></div>';document.body.append(host);const scroll=host.querySelector<HTMLElement>('[data-gb-table-scroll-sync]')!;scroll.scrollLeft=93;
   const root={contains:(n:HTMLElement)=>host.contains(n),addEventListener:(type:string,callback:(event:Event)=>void,options:unknown)=>{listeners.push({type,callback,options});}};
   renderer.installCategoryRendererDelegates(root);renderer.installCategoryRendererDelegates(root);
   const event=new Event('scroll');Object.defineProperties(event,{target:{value:scroll},currentTarget:{value:root}});listeners[0]!.callback(event);delegates={count:listeners.length,type:listeners[0]!.type,options:listeners[0]!.options,offset:host.querySelector<HTMLElement>('.gb-table-shell')!.style.getPropertyValue('--gb-table-scroll-x')};
  }
 }catch(e){error=e instanceof Error?e.name+':'+e.message:String(e);}
 const fixture=document.createElement('div');fixture.innerHTML=raw;
 const actions=[...fixture.querySelectorAll('[data-marker-detail-action]')].map(e=>({tag:e.tagName,attrs:[...e.attributes].map(a=>[a.name,a.value])}));
 const registry=Object.entries(state.markerRegistry).map(([key,value])=>({key,source:value===marker?'marker':value===sparse?'sparse':'other'}));
 return{raw,tree:tree(fixture),actions,registry,trace,error,delegates};
}
const scenarios:Scenario[]=[
 ...['default','missing','undefined','unrated','phase','context','unset-context','single','duplicate-labels','long-unit','unicode-unit','partial-range','unsafe-id'].map(variant=>({name:'chart-'+variant,owner:'chart' as const,variant})),
 {name:'chart-both',owner:'chart',mode:'both'},{name:'chart-optimal',owner:'chart',mode:'optimal'},
 {name:'chart-getters',owner:'chart',trace:'getter'},{name:'chart-throw',owner:'chart',trace:'throw'},{name:'chart-symbol',owner:'chart',trace:'symbol'},
 ...['default','empty','sparse','single-date','no-key','no-dates'].map(variant=>({name:'table-'+variant,owner:'table' as const,variant})),
 {name:'table-both',owner:'table',mode:'both'},{name:'table-getters',owner:'table',trace:'getter'},
 ...['default','empty','sparse','single-date'].map(variant=>({name:'heatmap-'+variant,owner:'heatmap' as const,variant})),
 {name:'heatmap-getters',owner:'heatmap',trace:'getter'},
 ...['default','single-date','unsafe-id','unsafe-key','reversed','low-outlier','high-outlier','equal-range','partial-range'].map(variant=>({name:'fatty-'+variant,owner:'fatty' as const,variant})),
 {name:'fatty-both',owner:'fatty',mode:'both'},{name:'fatty-optimal',owner:'fatty',mode:'optimal'},
 {name:'fatty-getters',owner:'fatty',trace:'getter'},{name:'fatty-symbol',owner:'fatty',trace:'symbol'},
 {name:'columns-default',owner:'columns'},{name:'columns-coercion',owner:'columns',trace:'coercion'},
 {name:'shell-repeated-coercion',owner:'shell',trace:'coercion'},{name:'shell-nan-width',owner:'shell',variant:'nan-width'},
 {name:'native-scroll-delegates',owner:'scroll'},
];
it.each(scenarios)('$name preserves original ordered DOM, actions, registry and getter/coercion/throw chronology',scenario=>{
 const old=originalReceipts.find(receipt=>receipt.name===scenario.name);expect(old).toBeDefined();const current=capture(candidate,scenario);const original=old!.original as typeof current;expect({...categoryNativeDOM(current) as typeof current,raw:categoryRawDOM(current.raw)}).toEqual({...categoryNativeDOM(original) as typeof current,raw:categoryRawDOM(original.raw)});
 if(scenario.name==='shell-repeated-coercion')expect(current.trace).toEqual(['columns:string','head:string','columns:string','head:string','body:string']);
 if(scenario.name==='chart-throw')expect(current.error).toBe('RangeError:native-category-name');
 if(scenario.trace==='symbol'&&scenario.owner==='chart')expect(current.error).toMatch(/^TypeError:/);
 if(scenario.trace==='symbol'&&scenario.owner==='fatty'){expect(current.error).toBeNull();expect(current.raw).toContain('Symbol(native-name)');}
 if(scenario.name==='table-sparse')expect(current.actions.some(a=>a.attrs.some(([k,v])=>k==='data-marker-detail-action'&&v==='open-manual-entry'))).toBe(true);
});
