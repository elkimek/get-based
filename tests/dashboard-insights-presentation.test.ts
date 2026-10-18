import {expectedOwnedInsightsPublic} from './helpers/dashboard-loading-insights-owned-receipts.js';
// @vitest-environment jsdom
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {createDashboardWidgetRenderers as candidateFactory} from '../js/dashboard-widget-renderers.js';
import {createDashboardWidgetControls} from '../js/dashboard-widget-controls.js';
import {configureDashboardWidgetRuntimeDeps} from '../js/dashboard-widget-runtime.js';
import {state} from '../js/state.js';

type Factory=typeof candidateFactory;
type Spec={insights:unknown;markersThrow?:boolean;insightsThrow?:boolean;dependencyGetter?:boolean};
type Fixture=(trace:string[])=>Spec;
const card=(id:unknown='lipids_apoB',tone:unknown='info',eyebrow:unknown='Trend',title:unknown='Synthetic marker',body:unknown='Synthetic fixture')=>({id,tone,eyebrow,title,body,meta:'preserve-unused'});
const primitive=(trace:string[],name:string,value:unknown)=>({[Symbol.toPrimitive](hint:string){trace.push(name+':'+hint);return value;}});
const fixtures:Record<string,Fixture>={
 'empty':()=>({insights:[]}),
 'one valid ID':()=>({insights:[card()]}),
 'all four tones ordered':()=>({insights:['danger','warn','good','info'].map((tone,j)=>card('custom.marker_'+j,tone,'Tag '+j,'Title '+j,'Body '+j))}),
 'missing ID':()=>({insights:[{tone:'good',eyebrow:'Snapshot',title:'Title',body:'Body'}]}),
 'null ID':()=>({insights:[card(null)]}),
 'empty ID':()=>({insights:[card('')]}),
 'numeric ID':()=>({insights:[card(12)]}),
 'Symbol ID':()=>({insights:[card(Symbol('id'))]}),
 'object ID no coercion':trace=>({insights:[card(primitive(trace,'id','safe.id'))]}),
 'malicious quote ID':()=>({insights:[card('x" data-dashboard-widget-action="navigate')]}),
 'malicious slash ID':()=>({insights:[card('../marker')]}),
 'prototype ID':()=>({insights:[card('__proto__')]}),
 'nested prototype ID':()=>({insights:[card('safe.constructor')]}),
 'too long ID':()=>({insights:[card('x'.repeat(129))]}),
 'maximum valid ID':()=>({insights:[card('x'.repeat(128))]}),
 'escaped labels and tone':()=>({insights:[card('safe.id','<&>"\'','<&>"\'','<button data-dashboard-widget-action="navigate">"&\'</button>','Line\n <script>& \"</script>')]}),
 'nullish fields':()=>({insights:[card(null,null,undefined,null,undefined)]}),
 'numeric and boolean fields':()=>({insights:[card('safe.id',12,false,0,true)]}),
 'Symbols escapeHTML explicit String':()=>({insights:[card('safe.id',Symbol('tone'),Symbol('tag'),Symbol('title'),Symbol('body'))]}),
 'field string coercion chronology':trace=>({insights:[card('safe.id',primitive(trace,'tone','info'),primitive(trace,'tag','Tag'),primitive(trace,'title','Title'),primitive(trace,'body','Body'))]}),
 'ID reads precede tone getter':trace=>({insights:[{get id(){trace.push('id:get');return 'safe.id';},get tone(){trace.push('tone:get');return 'info';},get eyebrow(){trace.push('tag:get');return 'Tag';},get title(){trace.push('title:get');return 'Title';},get body(){trace.push('body:get');return 'Body';}}]}),
 'ID false first read short circuit':trace=>({insights:[{...card(),get id(){trace.push('id:get');return '';}}]}),
 'ID changes on safe check':trace=>{let reads=0;return{insights:[{...card(),get id(){trace.push('id:get:'+ ++reads);return reads===1?'safe.id':'bad id';}}]};},
 'ID changes at attribute emission':trace=>{let reads=0;return{insights:[{...card(),get id(){trace.push('id:get:'+ ++reads);return reads===3?'quoted"&id':'safe.id';}}]};},
 'ID third read throws':trace=>{let reads=0;return{insights:[{...card(),get id(){trace.push('id:get:'+ ++reads);if(reads===3)throw new RangeError('third ID read');return 'safe.id';}}]};},
 'tone getter throws':trace=>({insights:[{...card(),get tone(){trace.push('tone:get');throw new Error('tone getter');}}]}),
 'title getter throws':trace=>({insights:[{...card(),get title(){trace.push('title:get');throw new SyntaxError('title getter');}}]}),
 'body coercion throws':trace=>({insights:[card('safe.id','info','Tag','Title',{[Symbol.toPrimitive](hint:string){trace.push('body:'+hint);throw new TypeError('body coercion');}})]}),
 'dependency getter':()=>({insights:[card()],dependencyGetter:true}),
 'markers producer throws':()=>({insights:[card()],markersThrow:true}),
 'insights producer throws':()=>({insights:[card()],insightsThrow:true}),
 'null insights throws':()=>({insights:null}),
 'undefined insights throws':()=>({insights:undefined}),
 'null card throws':()=>({insights:[null]}),
 'sparse native map':()=>({insights:[card('first'),,...[card('third')]]}),
 'native length getter throws':trace=>({insights:{get length(){trace.push('length:get');throw new Error('length getter');}}}),
 'native empty length getter':trace=>({insights:{get length(){trace.push('length:get');return 0;}}}),
 'native map getter throws':trace=>({insights:{length:1,get map(){trace.push('map:get');throw new Error('map getter');}}}),
 'native custom map and join order':trace=>({insights:{length:1,map(callback:(value:unknown)=>unknown){trace.push('map:call');const value=callback(card());return{get join(){trace.push('join:get');return(separator:string)=>{trace.push('join:call:'+separator);return value;};}};}}}),
 'native join Symbol throw':trace=>({insights:{length:1,map(){trace.push('map:call');return{join(separator:string){trace.push('join:call:'+separator);return Symbol('native-interpolation');}};}}}),
};
const originals=JSON.parse(readFileSync(path.join(import.meta.dirname,'fixtures/dashboard-insights-original.json'),'utf8')) as {name:string;original:unknown}[];
let saved:{importedData:unknown;currentProfile:typeof state.currentProfile;markerRegistry:typeof state.markerRegistry};
beforeEach(()=>{saved={importedData:state.importedData,currentProfile:state.currentProfile,markerRegistry:state.markerRegistry};state.currentProfile='insights-presentation-fixture';(state as {importedData:unknown}).importedData={dates:['2026-01-01'],retained:{opaque:['keep',3]},notes:[]};state.markerRegistry={};localStorage.clear();localStorage.setItem('insights-foreign','opaque-unchanged');document.body.innerHTML='';});
afterEach(()=>{(state as {importedData:unknown}).importedData=saved.importedData;state.currentProfile=saved.currentProfile;state.markerRegistry=saved.markerRegistry;localStorage.clear();document.body.innerHTML='';vi.restoreAllMocks();});
function snapshot(value:unknown):unknown {
 if(typeof value==='symbol')return{type:'symbol',description:value.description};
 if(typeof value==='function')return{type:'function',name:value.name,length:value.length};
 if(value===null||typeof value!=='object')return value;
 return Reflect.ownKeys(value).map(key=>{const d=Object.getOwnPropertyDescriptor(value,key)!;return[String(key),d.enumerable,d.configurable,'value'in d?['value',snapshot(d.value),d.writable]:['accessor',d.get?.name??null,d.set?.name??null]];});
}
function orderedDOM(node:Node):unknown {
 if(node instanceof Element)return{type:node.nodeType,name:node.localName,namespace:node.namespaceURI,attributes:[...node.attributes].map(a=>[a.namespaceURI,a.name,a.value]),children:[...node.childNodes].map(orderedDOM)};
 return{type:node.nodeType,text:node.nodeValue};
}
function publicReceipt(factory:Factory,fixture:Fixture){
 const trace:string[]=[];const spec=fixture(trace),context={opaque:'ctx'},markers={opaque:'markers'},beforeInput=snapshot(spec.insights),beforeProfile=snapshot(state.importedData);
 const deps:Record<string,unknown>={getMobileDashboardMarkers:(ctx:unknown)=>{trace.push('markers:context:'+String(ctx===context));if(spec.markersThrow)throw new Error('markers producer');return markers;},getMobileDashboardInsights:(ctx:unknown,value:unknown)=>{trace.push('insights:context:'+String(ctx===context)+':markers:'+String(value===markers));if(spec.insightsThrow)throw new Error('insights producer');return spec.insights;},rerenderDashboardFromWidgetChange:()=>trace.push('rerender')};
 if(spec.dependencyGetter){const callback=deps.getMobileDashboardInsights;Object.defineProperty(deps,'getMobileDashboardInsights',{get(){trace.push('dependency:get');return callback;}});}
 const renderers=factory(deps),method=renderers.renderDashboardInsightsListWidget;
 const host=document.createElement('main');document.body.append(host);const setter=Object.getOwnPropertyDescriptor(Element.prototype,'innerHTML')!;const assignments:string[]=[];
 Object.defineProperty(host,'innerHTML',{configurable:true,get(){return setter.get!.call(host) as string;},set(value:string){trace.push('host:innerHTML');assignments.push(value);setter.set!.call(host,value);}});
 let raw:string|null=null,error:{name:string;message:string}|null=null,dom:unknown=null;
 try{raw=method(context);host.innerHTML=raw;dom=orderedDOM(host);}catch(thrown){const e=thrown as Error;error={name:e.name,message:e.message};}
 const result={raw,assignments,dom,actions:[...host.querySelectorAll<HTMLElement>('[data-dashboard-widget-action]')].map(el=>({tag:el.localName,action:el.dataset.dashboardWidgetAction,id:el.dataset.dashboardWidgetId??null,label:el.textContent,attributes:[...el.attributes].map(a=>[a.name,a.value])})),trace,error,factoryKeys:Object.keys(renderers),functionName:method.name,functionLength:method.length,beforeInput,afterInput:snapshot(spec.insights),beforeProfile,afterProfile:snapshot(state.importedData),registry:snapshot(state.markerRegistry),storage:[...Array(localStorage.length)].map((_,j)=>{const k=localStorage.key(j)!;return[k,localStorage.getItem(k)];})};host.remove();return result;
}
it.each(Object.entries(fixtures))('%s preserves complete original public render receipts',(name,fixture)=>{const original=originals.find(row=>row.name===name)!.original,candidate=publicReceipt(candidateFactory,fixture);expect(candidate).toEqual(expectedOwnedInsightsPublic(original as Record<string,unknown>));expect(candidate.afterInput).toEqual(candidate.beforeInput);expect(candidate.afterProfile).toEqual(candidate.beforeProfile);});

const delegated=[['valid-click','safe.id','button','click',true],['nested-tag-click','safe.id','.db-insight-tag','click',true],['nested-title-click','safe.id','strong','click',true],['missing-ID-click',null,'button','click',false],['unsafe-ID-click','bad id','button','click',false],['button-Enter-native-delegate-ignored','safe.id','button','Enter',false],['button-Space-native-delegate-ignored','safe.id','button',' ',false],['irrelevant-Escape','safe.id','button','Escape',false]] as const;
function delegatedReceipt(factory:Factory,id:unknown,selector:string,key:string){
 const calls:unknown[][]=[];const previous=configureDashboardWidgetRuntimeDeps({showDetailModal:(value:unknown)=>calls.push(['detail',value])});const listeners:{type:string;callback:EventListenerOrEventListenerObject}[]=[];const add=document.addEventListener.bind(document);const spy=vi.spyOn(document,'addEventListener').mockImplementation((type,callback,options)=>{if(callback)listeners.push({type,callback});add(type,callback,options);});
 const beforeProfile=snapshot(state.importedData);document.body.innerHTML=factory({getMobileDashboardMarkers:()=>[],getMobileDashboardInsights:()=>[card(id)],rerenderDashboardFromWidgetChange:()=>calls.push(['rerender'])}).renderDashboardInsightsListWidget({});createDashboardWidgetControls({});const target=document.querySelector<HTMLElement>(selector)!;const event=key==='click'?new MouseEvent('click',{bubbles:true,cancelable:true}):new KeyboardEvent('keydown',{key,bubbles:true,cancelable:true});
 try{target.dispatchEvent(event);return{calls,key,eventType:event.type,prevented:event.defaultPrevented,dom:orderedDOM(document.body),beforeProfile,afterProfile:snapshot(state.importedData),registry:snapshot(state.markerRegistry),storage:localStorage.getItem('insights-foreign')};}
 finally{spy.mockRestore();for(const {type,callback}of listeners)document.removeEventListener(type,callback);configureDashboardWidgetRuntimeDeps(previous);document.body.innerHTML='';}
}
it.each(delegated)('%s preserves actual native delegated action behavior',(name,id,selector,key,activates)=>{const original=originals.find(row=>row.name===name)!.original,candidate=delegatedReceipt(candidateFactory,id,selector,key);expect(candidate).toEqual(expectedOwnedInsightsPublic(original as Record<string,unknown>));expect(candidate.afterProfile).toEqual(candidate.beforeProfile);expect(candidate.calls).toEqual(activates?[['detail','safe.id']]:[]);});
