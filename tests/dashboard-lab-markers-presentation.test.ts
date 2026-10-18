// @vitest-environment jsdom
import {afterAll,afterEach,beforeEach,expect,it,vi} from 'vitest';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {createDashboardLabWidgetRenderers as candidateFactory} from '../js/dashboard-lab-widget-renderers.js';
import {createDashboardWidgetControls} from '../js/dashboard-widget-controls.js';
import {configureDashboardWidgetRuntimeDeps} from '../js/dashboard-widget-runtime.js';
import {state} from '../js/state.js';
import type {LabContext} from '../types/dashboard-lab-widget-renderers.js';
import {nativeWithLabMarkerAnnotations,nativeWithOwnedAnnotations,nativeWithBioAgeAnnotations,decodeNativeReceipt} from './helpers/dashboard-lab-marker-owned-annotations.js';
type Factory=typeof candidateFactory;
type Input={ctx:LabContext;id:unknown};
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
};
const methods=['renderDashboardSingleMarkerWidget','renderDashboardSpotlightWidget','renderLabsPriorityBanner'] as const;
let saved:Pick<typeof state,'importedData'|'markerRegistry'|'currentProfile'>;
const originalBytes=readFileSync(path.join(import.meta.dirname,'fixtures/dashboard-lab-markers-original.json'));
const originals=JSON.parse(new TextDecoder().decode(originalBytes)) as {name:string;original:unknown}[];
it('retains all 129 immutable whole native public receipts without fixture repinning',()=>{expect(originalBytes.length).toBe(2490817);expect(createHash('sha256').update(originalBytes).digest('hex')).toBe('534df7195627a36aad743402e90d2db08bde9fbff1c8b8086a8856207f4c4e7b');expect(originals).toHaveLength(129);expect(new Set(originals.map(row=>row.name)).size).toBe(129);});
beforeEach(()=>{saved={importedData:state.importedData,markerRegistry:state.markerRegistry,currentProfile:state.currentProfile};state.markerRegistry={};state.currentProfile='lab-markers-qualification';localStorage.clear();localStorage.setItem('foreign','unchanged');document.body.innerHTML='';});
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
function receipt(factory:Factory,fixture:Fixture,method:typeof methods[number]|'renderDashboardQuickMarkersWidget'|'renderDashboardBioAgeWidget'|'renderDashboardNotesWidget'){
 const trace:string[]=[],input=fixture(trace),before=descriptors(input),registry={};state.markerRegistry=registry;(state as {importedData:unknown}).importedData=input.ctx.data;
 const r=factory({markerHasData:(m:unknown)=>{trace.push('markerHasData');return !!m;},rerenderDashboardFromWidgetChange:()=>trace.push('rerender')});
 const host=document.createElement('main'),assignments:string[]=[];document.body.append(host);const descriptor=Object.getOwnPropertyDescriptor(Element.prototype,'innerHTML')!;
 Object.defineProperty(host,'innerHTML',{get(){return descriptor.get!.call(host) as string;},set(v:string){assignments.push(v);descriptor.set!.call(host,v);}});
 let raw:string|null=null,dom:unknown=null,error:unknown=null;
 try{raw=method==='renderDashboardSingleMarkerWidget'?r[method](input.ctx,input.id):method==='renderDashboardNotesWidget'?r[method]():r[method](input.ctx);host.innerHTML=raw;dom=orderedDOM(host);}catch(e){error={name:(e as Error).name,message:(e as Error).message};}
 const result={raw,assignments,dom,error,trace,keys:Object.keys(r),functionName:r[method].name,functionLength:r[method].length,before,after:descriptors(input),registry:descriptors(state.markerRegistry),registryIdentity:state.markerRegistry===registry,profileIdentity:state.importedData===input.ctx.data,actions:[...host.querySelectorAll<HTMLElement>('[data-dashboard-widget-action]')].map(el=>[el.localName,el.dataset.dashboardWidgetAction,el.dataset.dashboardWidgetId,el.getAttribute('aria-label')]),storage:[...Array(localStorage.length)].map((_,n)=>{const k=localStorage.key(n)!;return[k,localStorage.getItem(k)];})};host.remove();return result;
}
const completeCarriers:{name:string;original:unknown;actual:unknown}[]=[];
afterAll(()=>writeFileSync(path.resolve(import.meta.dirname,'../../complete-lab-owned-contract-receipts.json'),JSON.stringify(completeCarriers,null,2)+'\n'));
const projectExports=['projectDashboardQuickMarkersWidget','projectDashboardNotesWidget','projectDashboardSingleMarkerWidget','projectDashboardSpotlightWidget','projectLabsPriorityBanner'];
/** Exact public key positions include the newly owned independent projectors. */
function currentFactoryKeys(original:readonly string[]):string[]{
 const keys=[...original,...projectExports];
 expect(keys.filter(name=>name==='buildDashboardWidgetContext')).toHaveLength(1);
 keys.splice(keys.indexOf('buildDashboardWidgetContext')+1,0,'projectDashboardAlertsWidget','projectDashboardCorrelationWidget','projectDashboardBioAgeWidget');
 expect(keys.filter(name=>name==='renderDashboardKeyTrendsWidget')).toHaveLength(1);
 keys.splice(keys.indexOf('renderDashboardKeyTrendsWidget')+1,0,'projectDashboardKeyTrendsWidget');
 return keys;
}

const kinds={renderDashboardSingleMarkerWidget:'single-marker',renderDashboardSpotlightWidget:'spotlight',renderLabsPriorityBanner:'priority'} as const;
it.each(methods.flatMap(method=>Object.entries(fixtures).map(([name,fixture])=>({name:method+' / '+name,method,fixture}))))('$name preserves every whole native data/read/coercion/error/action field and exact typed annotations',({name,method,fixture})=>{
 const original=originals.find(row=>row.name===name)!.original,prior=decodeNativeReceipt(original) as ReturnType<typeof receipt>,candidate=receipt(candidateFactory,fixture,method),expected={...prior,keys:currentFactoryKeys(prior.keys)};
 if(prior.dom!==null){expected.dom=nativeWithLabMarkerAnnotations(prior.dom,kinds[method]);expect(candidate.dom).toEqual(expected.dom);expect(candidate.assignments).toEqual([candidate.raw]);expected.raw=candidate.raw;expected.assignments=candidate.assignments;}
 completeCarriers.push({name,original,actual:encodeReceipt(candidate)});expect(encodeReceipt(candidate)).toEqual(encodeReceipt(expected));expect(candidate.after).toEqual(candidate.before);expect(candidate.registryIdentity).toBe(true);
});
const actionCases=methods.flatMap(method=>['click','Enter',' ','Escape'].map(key=>({name:method+' / action '+JSON.stringify(key),method,key})));
function actionReceipt(factory:Factory,method:typeof methods[number],key:string){
 const calls:unknown[][]=[],listeners:{type:string;callback:EventListenerOrEventListenerObject}[]=[];const previous=configureDashboardWidgetRuntimeDeps({showDetailModal:(id:unknown)=>calls.push(['detail',id])});
 const add=document.addEventListener.bind(document),spy=vi.spyOn(document,'addEventListener').mockImplementation((type,callback,options)=>{if(callback)listeners.push({type,callback});add(type,callback,options);});
 const input=context(marker()),registry={};state.markerRegistry=registry;(state as {importedData:unknown}).importedData=input.ctx.data;const before=descriptors(input);
 const r=factory({markerHasData:()=>true,rerenderDashboardFromWidgetChange:()=>calls.push(['rerender'])});document.body.innerHTML=method==='renderDashboardSingleMarkerWidget'?r[method](input.ctx,input.id):r[method](input.ctx);createDashboardWidgetControls({});
 const target=document.querySelector<HTMLElement>('button')!;const event=key==='click'?new MouseEvent('click',{bubbles:true,cancelable:true}):new KeyboardEvent('keydown',{key,bubbles:true,cancelable:true});
 try{target.dispatchEvent(event);return{calls,eventType:event.type,key,prevented:event.defaultPrevented,dom:orderedDOM(document.body),registry:descriptors(state.markerRegistry),registryIdentity:state.markerRegistry===registry,before,after:descriptors(input),foreignStorage:localStorage.getItem('foreign')};}
 finally{spy.mockRestore();for(const {type,callback}of listeners)document.removeEventListener(type,callback);configureDashboardWidgetRuntimeDeps(previous);document.body.innerHTML='';}
}
it.each(actionCases)('$name preserves actual native delegates and marker runtime adapter',({name,method,key})=>{const original=originals.find(row=>row.name===name)!.original,prior=decodeNativeReceipt(original) as ReturnType<typeof actionReceipt>,candidate=actionReceipt(candidateFactory,method,key);completeCarriers.push({name,original,actual:encodeReceipt(candidate)});expect(candidate).toEqual({...prior,dom:nativeWithLabMarkerAnnotations(prior.dom,kinds[method])});expect(candidate.after).toEqual(candidate.before);expect(candidate.calls).toEqual(key==='click'?[['detail','lipids_apoB']]:[]);});

it.each(['renderDashboardQuickMarkersWidget','renderDashboardBioAgeWidget','renderDashboardNotesWidget'] as const)('%s retains native full public data and owned presentation',method=>{const name=method+' / retained foreign owner',fixture=()=>context(marker()),original=originals.find(row=>row.name===name)!.original,prior=decodeNativeReceipt(original) as ReturnType<typeof receipt>,candidate=receipt(candidateFactory,fixture,method),expected={...prior,keys:currentFactoryKeys(prior.keys)};if(prior.dom!==null){expected.dom=method==='renderDashboardBioAgeWidget'?nativeWithBioAgeAnnotations(prior.dom):nativeWithOwnedAnnotations(prior.dom,method==='renderDashboardNotesWidget'?'notes':'quick-markers');expect(candidate.dom).toEqual(expected.dom);expect(candidate.assignments).toEqual([candidate.raw]);expected.raw=candidate.raw;expected.assignments=candidate.assignments;}completeCarriers.push({name,original,actual:encodeReceipt(candidate)});expect(candidate).toEqual(expected);});

it.each(['extra-comment','status','text','action','spark-points','spark-namespace'])('exact native expected graph rejects %s without removing actual nodes',fault=>{
 const fixture=()=>context(marker()),actual=receipt(candidateFactory,fixture,'renderDashboardSingleMarkerWidget'),prior=decodeNativeReceipt(originals.find(row=>row.name==='renderDashboardSingleMarkerWidget / high marker')!.original) as ReturnType<typeof receipt>;const host=document.createElement('main');host.innerHTML=actual.raw!;
 if(fault==='extra-comment')host.insertBefore(document.createComment('foreign'),host.firstChild);else if(fault==='status')host.querySelector('button')!.classList.add('foreign');else if(fault==='text')host.querySelector('.db-stat-reason')!.textContent='foreign';else if(fault==='action')host.querySelector('button')!.setAttribute('data-dashboard-widget-action','delete-note');else if(fault==='spark-points')host.querySelector('polyline')!.setAttribute('points','0,0');else host.querySelector('svg')!.replaceWith(document.createElement('svg'));
 expect(()=>expect(orderedDOM(host)).toEqual(nativeWithLabMarkerAnnotations(prior.dom,'single-marker'))).toThrow();
});
