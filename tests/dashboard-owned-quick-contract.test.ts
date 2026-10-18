import {expectedOwnedLabFactoryKeys} from './helpers/dashboard-loading-insights-owned-receipts.js';
// @vitest-environment jsdom
import {afterAll,afterEach,beforeEach,expect,it,vi} from 'vitest';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {createDashboardLabWidgetRenderers as candidateFactory} from '../js/dashboard-lab-widget-renderers.js';
import {createDashboardWidgetControls} from '../js/dashboard-widget-controls.js';
import {configureDashboardWidgetRuntimeDeps} from '../js/dashboard-widget-runtime.js';
import {profileStorageKey} from '../js/profile.js';
import {state} from '../js/state.js';
import type {LabContext} from '../types/dashboard-lab-widget-renderers.js';
type Factory=typeof candidateFactory;
type Input={ctx:LabContext;id:unknown;pins?:unknown;sex?:string};
type Fixture=(trace:string[])=>Input;
const marker=(values:unknown[]=[90,100,120],extra:Record<string,unknown>={})=>({name:'ApoB',unit:'mg/dL',values,refMin:50,refMax:100,...extra});
const data=(m:unknown)=>({dates:['2026-01-01','2026-02-01','2026-03-01'],categories:{lipids:{label:'Lipids',markers:{apoB:m}}}});
const context=(m:unknown):Input=>{const d=data(m);return{ctx:{data:d,filteredData:d,keyMarkers:[{cat:'lipids',key:'apoB'}],trendAlerts:[],criticalFlags:[]},id:'lipids_apoB'};};
const primitive=(trace:string[],name:string,value:unknown)=>({[Symbol.toPrimitive](hint:string){trace.push(name+':'+hint);return value;}});
const fixtures:Record<string,Fixture>={
 'high marker':()=>context(marker()),
 'normal marker':()=>context(marker([70,75,80])),
 'low marker':()=>context(marker([60,50,40])),
 'no range':()=>context(marker([70,80,90],{refMin:null,refMax:null})),
 'minimum only':()=>context(marker([60,50,40],{refMax:null})),
 'maximum only':()=>context(marker([80,100,120],{refMin:null})),
 'zero bounds':()=>context(marker([0,0,0],{refMin:0,refMax:0})),
 'empty unit':()=>context(marker(undefined,{unit:''})),
 'missing unit':()=>context(marker(undefined,{unit:undefined})),
 'one spark point':()=>context(marker([120])),
 'empty values':()=>context(marker([])),
 'null values':()=>context(marker(undefined,{values:null})),
 'flat sparkline':()=>context(marker([120,120,120])),
 'last ten points':()=>context(marker(Array.from({length:14},(_,n)=>n+110))),
 'mixed native scalar spark':()=>context(marker([null,'',false,'120',undefined,NaN,Infinity,130])),
 'hostile name and unit':()=>context(marker(undefined,{name:'<& " \' marker >',unit:'<& " \' unit >'})),
 'marker-name default coercion':trace=>context(marker(undefined,{name:primitive(trace,'name','ApoB <&>')})),
 'marker-unit default coercion':trace=>context(marker(undefined,{unit:primitive(trace,'unit','mg <&>')})),
 'name getter chronology':trace=>{const m=marker();Object.defineProperty(m,'name',{configurable:true,enumerable:true,get(){trace.push('name:get');return 'ApoB';}});return context(m);},
 'unit getter chronology':trace=>{const m=marker();Object.defineProperty(m,'unit',{configurable:true,enumerable:true,get(){trace.push('unit:get');return 'mg/dL';}});return context(m);},
 'values getter chronology':trace=>{const m=marker();Object.defineProperty(m,'values',{configurable:true,enumerable:true,get(){trace.push('values:get');return [90,100,120];}});return context(m);},
 'Symbol name throws':()=>context(marker(undefined,{name:Symbol('name')})),
 'Symbol unit throws':()=>context(marker(undefined,{unit:Symbol('unit')})),
 'Symbol value throws':()=>context(marker([100,Symbol('value')])),
 'name coercion throws':trace=>context(marker(undefined,{name:{[Symbol.toPrimitive](hint:string){trace.push('name:'+hint);throw new RangeError('native name coercion');}}})),
 'unit getter throws':trace=>{const m=marker();Object.defineProperty(m,'unit',{enumerable:true,get(){trace.push('unit:get');throw new Error('native unit getter');}});return context(m);},
 'values filter throws':trace=>context(marker(undefined,{values:{length:1,0:120,filter(){trace.push('filter:call');throw new Error('native spark filter');}}})),
 'hidden marker':()=>context(marker(undefined,{hidden:true})),
 'unsafe marker id':()=>({...context(marker()),id:'lipids_apoB" onclick="x'}),
 'missing marker id':()=>({...context(marker()),id:'lipids_missing'}),
 'null marker id':()=>({...context(marker()),id:null}),
 'filtered fallback':()=>{const x=context(marker());x.ctx.data={categories:{}};return x;},
 'no filtered candidates':()=>({ctx:{data:{categories:{}},filteredData:{categories:{}},keyMarkers:[],trendAlerts:[],criticalFlags:[]},id:'lipids_apoB'}),
 'key marker only fallback':()=>{const x=context(marker());x.ctx.filteredData={categories:{}};return x;},
 'trend alert priority':()=>{const x=context(marker());x.ctx.trendAlerts=[{id:'lipids_apoB',concern:'sudden_high',spark:[90,100,120],direction:'up'}];return x;},
 'critical range priority':()=>{const x=context(marker());x.ctx.criticalFlags=[{id:'lipids_apoB',status:'high',categoryKey:'lipids',value:120,rawValue:120,effectiveMin:50,effectiveMax:100}];return x;},
 'priority tie name ordering':()=>{const x=context(marker([110,120],{name:'Zeta'}));const d=x.ctx.data as ReturnType<typeof data>;Object.assign(d.categories.lipids.markers,{other:marker([110,120],{name:'Alpha'})});x.ctx.keyMarkers=[];return x;},
 'null context data throws':()=>({ctx:{data:null,filteredData:null,keyMarkers:[{cat:'lipids',key:'apoB'}]},id:'lipids_apoB'}),
 'unpinned spotlight is excluded':()=>({...context(marker()),pins:[]}),
 'pin order beats name ordering':()=>{const x=context(marker([110,120],{name:'Zeta'}));Object.assign((x.ctx.data as ReturnType<typeof data>).categories.lipids.markers,{other:marker([110,120],{name:'Alpha'})});return{...x,pins:['lipids_apoB','lipids_other']};},
 'duplicate unsafe and stale pins':()=>({...context(marker()),pins:['lipids_apoB','lipids_apoB','bad"onclick','lipids_missing']}),
 'four pin cap and dynamic tail':()=>{const x=context(marker());const ms=(x.ctx.data as ReturnType<typeof data>).categories.lipids.markers;Object.assign(ms,Object.fromEntries(['one','two','three','four','five'].map((k,n)=>[k,marker([110,120+n],{name:k})])));return{...x,pins:['lipids_five','lipids_four','lipids_three','lipids_two','lipids_one','lipids_apoB']};},
 'malformed pin storage':()=>({...context(marker()),pins:'{broken-json'}),
 'nonarray pin storage':()=>({...context(marker()),pins:{id:'lipids_apoB'}}),
 'female core ranking and goal severity':()=>{const d={dates:['2026-01-01','2026-02-01'],healthGoals:[{text:'Improve glucose and cholesterol',severity:'severe'}],categories:{biochemistry:{markers:{glucose:marker([5,6],{name:'Glucose',unit:'mmol/L',refMin:4,refMax:6}),creatinine:marker([80,90],{name:'Creatinine'})}},lipids:{markers:{apoB:marker(),hdl:marker([40,45],{name:'HDL'}),ldl:marker([70,80],{name:'LDL'})}}}};return{ctx:{data:d,filteredData:d,keyMarkers:[]},id:'biochemistry_glucose',pins:[],sex:'female'};},
 'male core ranking':()=>{const d={dates:['2026-01-01','2026-02-01'],categories:{hormones:{markers:{testosterone:marker([10,12],{name:'Testosterone'})}},lipids:{markers:{apoB:marker(),hdl:marker([40,45],{name:'HDL'}),ldl:marker([70,80],{name:'LDL'})}}}};return{ctx:{data:d,filteredData:d,keyMarkers:[]},id:'hormones_testosterone',pins:[],sex:'male'};},
 'goal text coercion chronology':trace=>{const x=context(marker());Object.assign(x.ctx.data as object,{healthGoals:[{text:primitive(trace,'goal','cholesterol glucose'),severity:'minor'}]});return{...x,pins:[]};},
 'goal text coercion throws':trace=>{const x=context(marker());Object.assign(x.ctx.data as object,{healthGoals:[{text:{[Symbol.toPrimitive](hint:string){trace.push('goal:'+hint);throw new TypeError('native goal coercion');}}}]});return x;},
 'hostile private coordinate text remains data':()=>context(marker(undefined,{name:'gb-dashboard-quick-markers-dashboardquickmarkers-tile-name-end <img src=x onerror=x>',unit:'gb-dashboard-quick-markers-dashboardquickmarkers-unit-unit-end'})),
};
const methods=['renderDashboardQuickMarkersWidget'] as const;
let saved:Pick<typeof state,'importedData'|'markerRegistry'|'currentProfile'|'profileSex'>;
beforeEach(()=>{saved={importedData:state.importedData,markerRegistry:state.markerRegistry,currentProfile:state.currentProfile,profileSex:state.profileSex};state.markerRegistry={};state.currentProfile='quick-markers-qualification';localStorage.clear();localStorage.setItem('foreign','unchanged');document.body.innerHTML='';});
afterEach(()=>{Object.assign(state,saved);document.body.innerHTML='';localStorage.clear();vi.restoreAllMocks();});
function encodeReceipt(value:unknown):unknown{
 if(value===undefined)return['undefined'];if(value===null)return['null'];
 if(typeof value==='number')return['number',Number.isNaN(value)?'NaN':value===Infinity?'Infinity':value===-Infinity?'-Infinity':Object.is(value,-0)?'-0':value];
 if(typeof value==='string'||typeof value==='boolean')return[typeof value,value];
 if(Array.isArray(value))return['array',value.map(encodeReceipt)];
 if(typeof value==='object')return['object',Object.keys(value).map(key=>[key,encodeReceipt((value as Record<string,unknown>)[key])])];
 throw new TypeError('Unqualified raw receipt leaf');
}
function descriptors(value:unknown):unknown{
 if(typeof value==='symbol')return ['symbol',value.description];if(typeof value==='function')return ['function',value.name,value.length];
 if(value===null||typeof value!=='object')return value;
 return Reflect.ownKeys(value).map(k=>{const d=Object.getOwnPropertyDescriptor(value,k)!;return[String(k),d.enumerable,d.configurable,'value'in d?['value',descriptors(d.value),d.writable]:['accessor',d.get?.name??null,d.set?.name??null]];});
}
function orderedDOM(n:Node):unknown{
 if(n.nodeType===Node.TEXT_NODE||n.nodeType===Node.COMMENT_NODE)return{type:n.nodeType,text:n.nodeValue};
 if(n instanceof Element)return{type:n.nodeType,name:n.localName,namespace:n.namespaceURI,attributes:[...n.attributes].map(a=>[a.namespaceURI,a.name,a.value]),children:[...n.childNodes].map(orderedDOM)};
 return{type:n.nodeType,children:[...n.childNodes].map(orderedDOM)};
}
function receipt(factory:Factory,fixture:Fixture,method:typeof methods[number]){
 const trace:string[]=[],input=fixture(trace),before=descriptors(input),registry={};state.profileSex=input.sex??'default';localStorage.setItem(profileStorageKey(state.currentProfile,'dashboardQuickMarkerPinsV1'),typeof input.pins==='string'?input.pins:JSON.stringify(input.pins??['lipids_apoB']));state.markerRegistry=registry;(state as {importedData:unknown}).importedData=input.ctx.data;
 const r=factory({markerHasData:(m:unknown)=>{trace.push('markerHasData');return !!m;},rerenderDashboardFromWidgetChange:()=>trace.push('rerender')});
 const host=document.createElement('main'),assignments:string[]=[];document.body.append(host);const descriptor=Object.getOwnPropertyDescriptor(Element.prototype,'innerHTML')!;
 Object.defineProperty(host,'innerHTML',{get(){return descriptor.get!.call(host) as string;},set(v:string){assignments.push(v);descriptor.set!.call(host,v);}});
 let raw:string|null=null,dom:unknown=null,error:unknown=null;
 try{raw=r[method](input.ctx);host.innerHTML=raw;dom=orderedDOM(host);}catch(e){error={name:(e as Error).name,message:(e as Error).message};}
 const result={raw,assignments,dom,error,trace,keys:Object.keys(r),functionName:r[method].name,functionLength:r[method].length,before,after:descriptors(input),registry:descriptors(state.markerRegistry),registryIdentity:state.markerRegistry===registry,profileIdentity:state.importedData===input.ctx.data,actions:[...host.querySelectorAll<HTMLElement>('[data-dashboard-widget-action]')].map(el=>[el.localName,el.dataset.dashboardWidgetAction,el.dataset.dashboardWidgetId,el.getAttribute('aria-label')]),storage:[...Array(localStorage.length)].map((_,n)=>{const k=localStorage.key(n)!;return[k,localStorage.getItem(k)];})};host.remove();return result;
}
function actionReceipt(factory:Factory,method:typeof methods[number],key:string){
 const calls:unknown[][]=[],listeners:{type:string;callback:EventListenerOrEventListenerObject}[]=[];const previous=configureDashboardWidgetRuntimeDeps({showDetailModal:(id:unknown)=>calls.push(['detail',id])});
 const add=document.addEventListener.bind(document),spy=vi.spyOn(document,'addEventListener').mockImplementation((type,callback,options)=>{if(callback)listeners.push({type,callback});add(type,callback,options);});
 const input=context(marker()),registry={};localStorage.setItem(profileStorageKey(state.currentProfile,'dashboardQuickMarkerPinsV1'),JSON.stringify(['lipids_apoB']));state.markerRegistry=registry;(state as {importedData:unknown}).importedData=input.ctx.data;const before=descriptors(input);
 const r=factory({markerHasData:()=>true,rerenderDashboardFromWidgetChange:()=>calls.push(['rerender'])});document.body.innerHTML=r[method](input.ctx);createDashboardWidgetControls({});
 const target=document.querySelector<HTMLElement>('button')!;const event=key==='click'?new MouseEvent('click',{bubbles:true,cancelable:true}):new KeyboardEvent('keydown',{key,bubbles:true,cancelable:true});
 try{target.dispatchEvent(event);return{calls,eventType:event.type,key,prevented:event.defaultPrevented,dom:orderedDOM(document.body),registry:descriptors(state.markerRegistry),registryIdentity:state.markerRegistry===registry,before,after:descriptors(input),foreignStorage:localStorage.getItem('foreign')};}
 finally{spy.mockRestore();for(const {type,callback}of listeners)document.removeEventListener(type,callback);configureDashboardWidgetRuntimeDeps(previous);document.body.innerHTML='';}
}
const originalBytes=readFileSync(path.join(import.meta.dirname,'fixtures/dashboard-quick-markers-original.json'));
const originals=JSON.parse(new TextDecoder().decode(originalBytes)) as {name:string;original:unknown}[];
it('retains every immutable complete original Quick Markers public receipt',()=>{expect(originalBytes.length).toBe(1182279);expect(createHash('sha256').update(originalBytes).digest('hex')).toBe('d742f21cbaeaab4a6b10be88da19659db4d9a488e91bf298c8ab31bb041b9ce6');expect(originals).toHaveLength(53);expect(new Set(originals.map(row=>row.name)).size).toBe(53);});
it.each(Object.entries(fixtures))('%s retains whole native semantic graph and data/read/coercion/throw contract',(name,fixture)=>{
 const actual=receipt(candidateFactory,fixture,'renderDashboardQuickMarkersWidget'),prior=decodeReceipt(originals.find(row=>row.name===name)!.original) as ReturnType<typeof receipt>;
 const expected={...prior,keys:expectedOwnedLabFactoryKeys(prior.keys)};
 if(prior.dom!==null){expected.dom=nativeWithOwnedAnnotations(prior.dom,'quick-markers');expect(actual.assignments).toEqual([actual.raw]);expect(typeof actual.raw).toBe('string');expected.raw=actual.raw;expected.assignments=actual.assignments;}
 completeCarriers.push({name,original:encodeReceipt(prior),actual:encodeReceipt(actual)});expect(encodeReceipt(actual)).toEqual(encodeReceipt(expected));expect(actual).toEqual(expected);expect(actual.after).toEqual(actual.before);expect(actual.registryIdentity).toBe(true);
});
it.each(['click','Enter',' ','Escape'])('retains genuine native delegated %s behavior with exact owned annotations',key=>{
 const actual=actionReceipt(candidateFactory,'renderDashboardQuickMarkersWidget',key),prior=decodeReceipt(originals.find(row=>row.name==='action '+JSON.stringify(key))!.original) as ReturnType<typeof actionReceipt>;
 completeCarriers.push({name:'action '+JSON.stringify(key),original:encodeReceipt(prior),actual:encodeReceipt(actual)});expect(actual).toEqual({...prior,dom:nativeWithOwnedAnnotations(prior.dom,'quick-markers')});expect(actual.calls).toEqual(key==='click'?[['detail','lipids_apoB']]:[]);
});
function decodeReceipt(value:unknown):unknown {
 const [tag,body]=value as [string,unknown];
 if(tag==='undefined')return undefined;if(tag==='null')return null;
 if(tag==='number')return body==='NaN'?NaN:body==='Infinity'?Infinity:body==='-Infinity'?-Infinity:body==='-0'?-0:body;
 if(tag==='array')return(body as unknown[]).map(decodeReceipt);
 if(tag==='object')return Object.fromEntries((body as [string,unknown][]).map(([key,v])=>[key,decodeReceipt(v)]));
 return body;
}

interface OwnedNode {type:number;text?:string|null;name?:string;namespace?:string|null;attributes?:unknown[][];children?:OwnedNode[]}
const comment=(text:string):OwnedNode=>({type:8,text}),literal=(text:string):OwnedNode=>({type:3,text});
function classes(node:OwnedNode):string {return String(node.attributes?.find(a=>a[1]==='class')?.[2]??'');}
/** Exact authored owner annotations are ADDED to the native expected graph. Nothing is stripped from actual DOM. */
function nativeWithOwnedAnnotations(value:unknown,kind:'notes'|'quick-markers'):OwnedNode {
 const root=structuredClone(value) as OwnedNode;
 if(kind==='quick-markers'&&!root.children?.length)return root;
 const element=root.children?.[0];expect(root.children).toHaveLength(1);expect(element?.type).toBe(1);
 const prefix=[comment('['),comment(''),literal('\n\n'),comment(kind==='notes'?'[0':'[-1'),comment(''),literal('\n\n')];
 if(kind==='notes'){
  expect(classes(element!)).toBe('notes-section dashboard-notes-widget');
  const children=element!.children!;const button=children[0]!;expect(classes(button)).toBe('add-note-btn');
  const rest=children.slice(1),empty=rest.length===1&&classes(rest[0]!)==='dashboard-widget-empty';
  element!.children=[button,comment(empty?'[!':'['),...rest,comment(']')];
  root.children=[...prefix,element!,comment(']'),comment(']')];
 }else{
  expect(classes(element!)).toBe('db-quick-marker-grid');
  for(const tile of element!.children!){
   expect(tile.name).toBe('button');expect(classes(tile)).toContain('db-quick-marker-tile');
   const valueDiv=tile.children!.find(n=>classes(n)==='db-stat-value')!;expect(valueDiv).toBeDefined();
   const small=valueDiv.children!.find(n=>n.name==='small');const text=valueDiv.children!.filter(n=>n.type===3);
   expect(valueDiv.children!.length).toBe(text.length+(small?1:0));
   valueDiv.children=[...text,comment(small?'[0':'[-1'),...(small?[small]:[]),comment(']')];
   const sparkIndex=tile.children!.findIndex(n=>classes(n).startsWith('db-spark '));expect(sparkIndex).toBeGreaterThan(0);
   const spark=tile.children![sparkIndex]!;expect(['span','svg']).toContain(spark.name);
   tile.children!.splice(sparkIndex,1,comment(spark.name==='span'?'[0':'[-1'),spark,comment(']'),comment(''));
  }
  element!.children=[comment('['),...element!.children!,comment(']')];
  root.children=[...prefix,comment('[0'),element!,comment(']'),comment(']'),comment(']')];
 }
 return root;
}

const completeCarriers:{name:string;original:unknown;actual:unknown}[]=[];
afterAll(()=>writeFileSync(path.resolve(import.meta.dirname,'../../complete-quick-owned-contract-receipts.json'),JSON.stringify(completeCarriers,null,2)+'\n'));

it.each(['extra-comment','wrong-owner-annotation','missing-spark-call-boundary','class','text','action'])('finite owner graph rejects %s corruption',fault=>{
 const imported=state.importedData;
 try {
const input=context(marker());(state as {importedData:unknown}).importedData=input.ctx.data;localStorage.setItem(profileStorageKey(state.currentProfile,'dashboardQuickMarkerPinsV1'),JSON.stringify(['lipids_apoB']));const raw=candidateFactory({markerHasData:()=>true,rerenderDashboardFromWidgetChange:()=>{}}).renderDashboardQuickMarkersWidget(input.ctx);const native=decodeReceipt(originals.find(row=>row.name==='high marker')!.original) as ReturnType<typeof receipt>;
 const host=document.createElement('main');host.innerHTML=raw;const expected=nativeWithOwnedAnnotations(native.dom,'quick-markers');
 if(fault==='extra-comment')host.insertBefore(document.createComment('foreign'),host.firstChild);
 else if(fault==='wrong-owner-annotation')(host.firstChild as Comment).data='foreign';
 else if(fault==='missing-spark-call-boundary'){const spark=host.querySelector('.db-spark')!;const branchEnd=spark.nextSibling;expect(branchEnd?.nodeType).toBe(Node.COMMENT_NODE);expect(branchEnd?.nodeValue).toBe(']');const callEnd=branchEnd?.nextSibling;expect(callEnd?.nodeType).toBe(Node.COMMENT_NODE);expect(callEnd?.nodeValue).toBe('');callEnd!.parentNode!.removeChild(callEnd!);}
 else if(fault==='class')host.querySelector('button')!.classList.add('foreign');
 else if(fault==='text')host.querySelector('button')!.textContent='foreign';
 else host.querySelector('button')!.setAttribute('data-dashboard-widget-action','delete-note');
 expect(()=>expect(orderedDOM(host)).toEqual(expected)).toThrow();
 }finally{(state as {importedData:unknown}).importedData=imported;}
});
