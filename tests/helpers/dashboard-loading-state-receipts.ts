import {vi} from 'vitest';
import type {createDashboardWidgetRenderers} from '../../js/dashboard-widget-renderers.js';
export const loadingOwners = ['renderDashboardLightTodayWidget','renderDashboardLightConditionsWidget','renderDashboardLightSessionLogWidget','renderDashboardLightLiveSessionWidget','renderDashboardLightChannelsWidget'] as const;
export const loadingScenarios = ['pending','resolve','rerender-throw','reject','readiness-throw','loader-throw','then-getter-throw','then-call-throw','catch-getter-throw','finally-getter-throw','loader-undefined','ready'] as const;
export type LoadingScenario = typeof loadingScenarios[number];
function tree(node: Node): unknown {
  return node.nodeType === Node.ELEMENT_NODE
    ? {tag:(node as Element).tagName,namespace:(node as Element).namespaceURI,attributes:[...(node as Element).attributes].map(a=>[a.name,a.value]),children:[...node.childNodes].map(tree)}
    : {type:node.nodeType,text:node.nodeValue};
}
export async function captureLoading(factory: typeof createDashboardWidgetRenderers, scenario: LoadingScenario) {
  const trace:string[]=[]; let resolve!:()=>void,reject!:(error:Error)=>void;
  const pending = new Promise<void>((yes,no)=>{resolve=yes;reject=no;});
  const error=(message:string)=>new RangeError(message);
  const readiness=()=>{trace.push('ready');if(scenario==='readiness-throw')throw error('readiness');return scenario==='ready';};
  const load=()=>{
    trace.push('load');if(scenario==='loader-throw')throw error('loader');
    if(scenario==='loader-undefined')return undefined;
    if(scenario==='then-getter-throw')return {get then(){trace.push('then-get');throw error('then-getter');}};
    if(scenario==='then-call-throw')return {then(){trace.push('then-call');throw error('then-call');}};
    if(scenario==='catch-getter-throw')return {then(){trace.push('then-call');return {get catch(){trace.push('catch-get');throw error('catch-getter');}};}};
    if(scenario==='finally-getter-throw')return {then(){trace.push('then-call');return {catch(){trace.push('catch-call');return {get finally(){trace.push('finally-get');throw error('finally-getter');}};}};}};
    return pending;
  };
  const values:Record<string,unknown>={markerHasData:()=>false,renderDashboardLightChannelsWidget:(n:number)=>{trace.push('channels:'+n);return 'channels';},renderLightConditionsWidgetBody:(options:unknown)=>{trace.push('conditions:'+JSON.stringify(options));return 'conditions';},renderLightLiveSession:(options:unknown)=>{trace.push('live:'+JSON.stringify(options));return 'live';},renderLightSessionLogActions:()=>{trace.push('session');return 'session';},getMobileDashboardMarkers:()=>[],getMobileDashboardInsights:()=>[],getMobileWearableTiles:()=>[],formatMobileWearableValue:()=>'',formatMobileWearableDelta:()=>'',getMobileWearablePriority:()=>[],isLightSunUILoaded:readiness,loadLightSunUI:load,rerenderDashboardFromWidgetChange:()=>{trace.push('rerender');if(scenario==='rerender-throw')throw error('rerender');},renderLightTodayHero:()=>{trace.push('hero');return 'hero';},showRecommendations:()=>{}};
  const deps=new Proxy(values,{get(target,key,receiver){trace.push('dependency:'+String(key));return Reflect.get(target,key,receiver);}});
  const logs:string[]=[];const consoleSpy=vi.spyOn(console,'error').mockImplementation((message:unknown,e:unknown)=>logs.push(String(message)+':'+(e instanceof Error?e.name+':'+e.message:String(e))));
  const outputs:{owner:string;raw:string|null;dom:unknown;error:string|null}[]=[];
  try {
    const renderer=factory(deps),keys=Object.keys(renderer),factoryTrace=[...trace];trace.length=0;
    const render=(owner:typeof loadingOwners[number])=>{
      let raw:string|null=null,failure:string|null=null;
      try{raw=renderer[owner]() as string;}catch(e){failure=e instanceof Error?e.name+':'+e.message:String(e);}
      const host=document.createElement('div');host.innerHTML=raw??'';
      outputs.push({owner,raw,dom:tree(host),error:failure});
    };
    for(const owner of loadingOwners)render(owner);
    const beforeSettlement=[...trace];
    if(scenario==='resolve'||scenario==='rerender-throw')resolve();else if(scenario==='reject')reject(error('rejected'));
    for(let step=0;step<8;step++)await Promise.resolve();
    const afterSettlement=[...trace];
    if(scenario==='resolve'||scenario==='rerender-throw'||scenario==='reject'){render(loadingOwners[0]);for(let step=0;step<8;step++)await Promise.resolve();}
    return {scenario,keys,factoryTrace,outputs,beforeSettlement,afterSettlement,trace,logs};
  } finally {consoleSpy.mockRestore();}
}
