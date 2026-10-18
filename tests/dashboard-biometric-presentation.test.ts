// @vitest-environment jsdom
import {afterEach,expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {createDashboardWidgetRenderers as candidate} from '../js/dashboard-widget-renderers.js';
import {expectedOwnedBiometricReceipt} from './helpers/dashboard-biometric-owned-receipts.js';
import {state} from '../js/state.js';
import {dashboardBiometricSelectionKey,DASHBOARD_MANUAL_BIOMETRIC_METRICS} from '../js/dashboard-widgets.js';
const saved={importedData:state.importedData,unitSystem:state.unitSystem};
afterEach(()=>{state.importedData=saved.importedData;state.unitSystem=saved.unitSystem;localStorage.clear();vi.restoreAllMocks();});
type Scenario={name:string;selection?:unknown;sync?:string;mode?:string;trace?:string};
function tree(n:Node):unknown{return n.nodeType===Node.ELEMENT_NODE?{tag:(n as Element).tagName,namespace:(n as Element).namespaceURI,attributes:[...(n as Element).attributes].map(a=>[a.name,a.value]),children:[...n.childNodes].map(tree)}:{type:n.nodeType,text:n.nodeValue};}
const now=1791806400000,stale=12*60*60*1000;
function capture(factory:typeof candidate,s:Scenario){
 const trace:string[]=[],key=dashboardBiometricSelectionKey();localStorage.clear();
 if(s.selection!==undefined)localStorage.setItem(key,s.selection==='malformed'?'{invalid':JSON.stringify(s.selection));
 const coerce=(kind:string)=>({[Symbol.toPrimitive](hint:string){trace.push(kind+':'+hint);return 'gb-biometric-dashboardbiometrictile-populated-value-end <&> " value';}});
 const metrics:Record<string,unknown>={weight:{latest:72},resting_hr:{latest:58},bp_systolic:{latest:120},bp_diastolic:{latest:80},steps:{latest:2500}};
 if(s.mode==='empty')Object.keys(metrics).forEach(k=>{delete metrics[k];});
 if(s.mode==='null-latest')metrics.weight={latest:null};
 if(s.mode==='getter'||s.trace==='throw-metric')metrics.weight=new Proxy({latest:72},{get(t,k,r){trace.push('metric.'+String(k));if(s.trace==='throw-metric'&&k==='latest')throw new RangeError('metric-latest');return Reflect.get(t,k,r);}});
 const connections:Record<string,unknown>={};
 const conn=(lastSyncAt:unknown,extra:Record<string,unknown>={})=>({connectedAt:now-86400000,accessToken:'synthetic-only-token',lastSyncAt,...extra});
 switch(s.sync){case 'fresh':connections.one=conn(now-1000);break;case 'minutes':connections.one=conn(now-15*60000);break;case 'hours':connections.one=conn(now-3*3600000);break;case 'days':connections.one=conn(now-3*86400000);break;case 'stale':connections.one=conn(now-stale);break;case 'before-boundary':connections.one=conn(now-stale+1);break;case 'unsynced':connections.one=conn(undefined);break;case 'reauth':connections.one=conn(0,{needsReauth:true});break;case 'tokenless':connections.one=conn(0,{accessToken:''});break;case 'unconnected':connections.one=conn(0,{connectedAt:0});break;case 'future':connections.one=conn(now+1000);break;case 'mixed':connections.one=conn(now-stale);connections.two=conn(now-1000);break;case 'coercion':connections.one=conn({valueOf(){trace.push('lastSyncAt:number');return now-stale;}});break;case 'nan':connections.one=conn(NaN);break;}
 if(s.trace==='connection')connections.one=new Proxy(conn(now-stale),{get(t,k,r){trace.push('connection.'+String(k));return Reflect.get(t,k,r);}});
 if(s.trace==='throw-connection')connections.one=new Proxy(conn(now-stale),{get(t,k,r){trace.push('connection.'+String(k));if(k==='accessToken')throw new SyntaxError('connection-token');return Reflect.get(t,k,r);}});
 const imported={wearableSummary:s.mode==='no-summary'?null:{metrics},wearableConnections:connections};
 state.importedData=imported as unknown as typeof state.importedData;state.unitSystem=s.mode==='imperial'?'imperial':'metric';
 vi.spyOn(Date,'now').mockReturnValue(now);
 const deps={getMobileWearableTiles:()=>{trace.push('default-tiles');return [{id:'weight'},{id:'steps'}];},getMobileWearablePriority:()=>[],getMobileDashboardMarkers:()=>[],getMobileDashboardInsights:()=>[],rerenderDashboardFromWidgetChange:()=>{},
  formatMobileWearableValue:(id:unknown)=>{trace.push('value:'+String(id));if(s.trace==='throw-value')throw new Error('value');if(s.mode==='symbol-value')return Symbol('formatter-value');if(s.mode==='coercion')return coerce('value');return id==='bp_systolic'?'120 / 80':'72 <&> "';},
  formatMobileWearableDelta:(id:unknown)=>{trace.push('change:'+String(id));if(s.mode==='coercion')return coerce('change');return s.mode==='falsy-change'?0:'-1 <&>';}};
 let raw='',error:string|null=null,selection:unknown=null,keys:string[]=[];
 try{const owner=factory(deps);keys=Object.keys(owner);selection=owner.getDashboardBiometricSelection();trace.length=0;raw=owner.renderDashboardWearableTilesWidget();}catch(e){error=e instanceof Error?e.name+':'+e.message:String(e);}
 const host=document.createElement('div');host.innerHTML=raw;
 return{raw,dom:tree(host),actions:[...host.querySelectorAll('[data-dashboard-widget-action]')].map(el=>({tag:el.tagName,attributes:[...el.attributes].map(a=>[a.name,a.value])})),selection,keys,trace,error,storage:[...Array(localStorage.length)].map((_,n)=>{const k=localStorage.key(n)!;return[k,localStorage.getItem(k)];}),profileKeys:Object.keys(imported),metricsKeys:Object.keys(metrics),connectionsKeys:Object.keys(connections)};
}
const scenarios:Scenario[]=[
 {name:'default'}, {name:'malformed-selection',selection:'malformed'}, {name:'nonarray-selection',selection:{}},{name:'invalid-selection',selection:['unsafe<','unknown',null]},
 {name:'empty-selection',selection:[]},{name:'one-populated',selection:['weight']},{name:'plural-populated',selection:['weight','steps']},{name:'duplicate-selection',selection:['weight','weight','steps']},
 {name:'blood-pressure-pair',selection:['bp_systolic','bp_diastolic']},{name:'diastolic-first',selection:['bp_diastolic','bp_systolic']},
 {name:'manual-empty',selection:[...DASHBOARD_MANUAL_BIOMETRIC_METRICS],mode:'empty'},{name:'no-summary-manual',selection:['weight','steps'],mode:'no-summary'},{name:'null-latest-manual',selection:['weight'],mode:'null-latest'},
 ...['fresh','minutes','hours','days','stale','before-boundary','unsynced','reauth','tokenless','unconnected','future','mixed','coercion','nan'].map(sync=>({name:'sync-'+sync,selection:['weight'],sync})),
 ...['imperial','falsy-change','getter','coercion','symbol-value'].map(mode=>({name:'tile-'+mode,selection:['weight','steps'],mode})),
 ...['connection','throw-connection','throw-metric','throw-value'].map(trace=>({name:'native-'+trace,selection:['weight','steps'],trace})),
 {name:'empty-selection-stale',selection:[],sync:'stale'},
];
const originalReceipts=JSON.parse(readFileSync(path.join(import.meta.dirname,'fixtures/dashboard-biometric-presentation-original.json'),'utf8')) as {name:string;original:ReturnType<typeof capture>}[];
for(const scenario of scenarios)it('preserves native complete Biometrics presentation '+scenario.name,()=>{
 const receipt=originalReceipts.find(x=>x.name===scenario.name);expect(receipt).toBeDefined();const before=receipt!.original,after=capture(candidate,scenario);expect(after).toEqual(expectedOwnedBiometricReceipt(before));
 if(scenario.name==='one-populated')expect(before.actions.map(a=>a.attributes.find(([k])=>k==='data-dashboard-widget-action')?.[1])).toEqual(['open-biometric-picker','open-biometric-detail','remove-biometric-metric']);
 if(scenario.name==='empty-selection')expect(before.raw).toContain('No biometrics selected.');
 if(scenario.name==='sync-stale')expect(before.raw).toContain('Sync stale data');
 if(scenario.name==='sync-before-boundary')expect(before.raw).not.toContain('Sync stale data');
 if(scenario.name==='tile-coercion')expect(before.trace).toContain('value:default');
 if(scenario.name==='tile-symbol-value')expect(before.error).toContain('TypeError');
});
