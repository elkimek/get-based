import * as ts from 'typescript/unstable/ast';
import {withParsedSource} from '../scripts/native-typescript-ast.js';
import fs from 'node:fs';
import vm from 'node:vm';
import {stripTypeScriptTypes} from 'node:module';
import {JSDOM} from 'jsdom';
import {expect,it} from 'vitest';
import {escapeAttr,escapeHTML} from '../js/utils.js';
import {actionAttributes} from '../js/action-attributes.js';
import {renderDashboardLabSummary,summaryAttribute,summaryText} from '../js/dashboard-lab-summary-presentation.js';

const original=JSON.parse(fs.readFileSync(new URL('./fixtures/dashboard-summary-original.json',import.meta.url),'utf8')) as Record<string,string>;
const emitted=fs.readFileSync(new URL('../js/dashboard-lab-widget-renderers.js',import.meta.url),'utf8');
function procedure(kind:string,current:boolean){
 if(!current)return stripTypeScriptTypes(original['renderDashboard'+kind+'Widget']!);
 const names=['projectDashboard'+kind+'Widget','renderDashboard'+kind+'Widget'];
 return withParsedSource(emitted,'dashboard-lab-widget-renderers.js',file=>{
  const declarations=new Map<string,string>();
  function visit(node:ts.Node):void {
   if(ts.isFunctionDeclaration(node)&&node.name&&names.includes(node.name.text)){
    expect(declarations.has(node.name.text)).toBe(false);
    declarations.set(node.name.text,node.getText(file));
   }
   node.forEachChild(visit);
  }
  file.forEachChild(visit);
  expect([...declarations.keys()].sort()).toEqual([...names].sort());
  return names.map(name=>declarations.get(name)!).join('\n');
 });
}
interface Scenario {kind:string;hit?:unknown;age?:unknown;lowMuscleMass?:boolean;pheno?:unknown;bortz?:unknown;result?:unknown;ctx?:unknown}
function run(input:Scenario,current:boolean,failAt=Infinity){
 const trace:string[]=[];const read=(label:string)=>{trace.push(label);if(trace.length===failAt)throw new Error('fault:'+label);};
 const proxied=new WeakMap<object,object>();
 const wrap=(value:unknown,label:string):unknown=>{
  if(!value||typeof value!=='object')return value;if(proxied.has(value))return proxied.get(value);
  const proxy=new Proxy(value,{get(target,key,receiver){read(label+'.'+String(key));return wrap(Reflect.get(target,key,receiver),label+'.'+String(key));}});proxied.set(value,proxy);return proxy;
 };
 const record=structuredClone(input);const ctx=wrap(record.ctx||{data:{}},'ctx');let html:string|null=null,error:string|null=null;
 try{html=vm.runInNewContext(procedure(input.kind,current)+';renderDashboard'+input.kind+'Widget(ctx)',{
  ctx,escapeAttr,escapeHTML,renderDashboardLabSummary,summaryAttribute,summaryText,
  getDashboardBioAgeMarker(){read('bio-hit');return wrap(record.hit,'hit');},getDashboardAge(){read('age');return record.age;},
  getBiologyProfileContext(){read('profile-context');return wrap({lowMuscleMass:record.lowMuscleMass},'profile-context');},
  getDashboardMarkerByPath(_data:unknown,_category:string,key:string){read('path:'+_category+'.'+key);return wrap(key==='phenoAge'?record.pheno:record.bortz,key);},
  getDashboardCorrelationPairs(){read('correlations');return wrap(record.result,'result');},
  formatValue(value:unknown){read('format:'+String(value));return value==null?'—':String(value);},
  dashboardMarkerDetailAttrs:(id:unknown)=>actionAttributes('dashboard-widget','open-marker-detail',{id}),
  dashboardNavigateAttrs:(route:unknown)=>actionAttributes('dashboard-widget','navigate',{route}),
 });}catch(e){error=(e as Error).message;}
 return {trace,html,error};
}
function tree(node:Node):unknown{
 if(node.nodeType===8){expect(['','[',']','[-1','[0','[1','[2']).toContain(node.nodeValue);return null;}
 if(node.nodeType===3)return node.textContent?.trim()?node.textContent:null;
 const el=node as Element;const children:unknown[]=[];
 for(const child of node.childNodes){const next=tree(child);if(next===null)continue;if(typeof next==='string'&&typeof children.at(-1)==='string')children[children.length-1]=(children.at(-1) as string)+next;else children.push(next);}
 return {tag:el.tagName,attributes:el.attributes?[...el.attributes].map(a=>[a.name,a.value]):[],
  button:el.tagName==='BUTTON'?{type:(el as HTMLButtonElement).type,disabled:(el as HTMLButtonElement).disabled}:null,children};
}
const dom=(html:string|null)=>html===null?null:tree(new JSDOM(html).window.document.body);
const scenarios:Scenario[]=[
 {kind:'BioAge',age:null},
 {kind:'BioAge',age:40,hit:{id:'age-marker',value:42.5,marker:{name:'Biological <Age>&'}},pheno:{value:38},bortz:{value:39}},
 {kind:'BioAge',age:0,hit:{id:0,value:null,marker:{}},lowMuscleMass:true},
 {kind:'BioAge',age:55,lowMuscleMass:true},
 {kind:'Correlation',result:null},
 {kind:'Correlation',result:{pairs:[]}},
 {kind:'Correlation',result:{target:{marker:{name:'Target <marker>'}},pairs:[{id:'a',name:'Positive',r:0.45,value:12,unit:'mg/L'},{id:'b',name:'Negative',r:-0.9,value:3,unit:''}]}},
 {kind:'Alerts',ctx:{trendAlerts:[],criticalFlags:[]}},
 {kind:'Alerts',ctx:{trendAlerts:['sudden_high','sudden_low','past_high','past_low','approaching_high','approaching_low'].map((concern,index)=>({id:'m'+index,concern,direction:index%2?'rising':'falling',name:'Marker <'+index+'>',category:'Blood & cells',spark:[1,2,3]})),criticalFlags:[{status:'high',name:'High',value:12,unit:'mg/L',categoryKey:'blood',effectiveMin:1,effectiveMax:4},{status:'low',name:'Low',value:0,unit:'',categoryKey:'blood',effectiveMin:1,effectiveMax:4}]}},
];
it.each(scenarios)('preserves native summary DOM, controls and read order %#',scenario=>{
 const before=run(scenario,false),after=run(scenario,true);expect(after.error).toEqual(before.error);expect(after.error).toBeNull();expect(after.trace).toEqual(before.trace);expect(dom(after.html)).toEqual(dom(before.html));
});
const faultCases = [scenarios[1]!,scenarios[6]!,scenarios[8]!].flatMap(scenario =>
 Array.from({length:run(scenario,false).trace.length},(_,offset)=>({scenario,index:offset+1})));
it.each(faultCases)('preserves observed getter and domain-helper fault boundary %#',({scenario,index})=>{
 const before=run(scenario,false,index),after=run(scenario,true,index);
 expect(after.trace).toEqual(before.trace);expect(after.error).toEqual(before.error);expect(dom(after.html)).toEqual(dom(before.html));
});
it('escapes imported spark content rather than creating HTML',()=>{
 const scenario:Scenario={kind:'Alerts',ctx:{trendAlerts:[{id:'m',concern:'past_high',name:'Marker',category:'Blood',spark:['<img src=x onerror=evil()>']}],criticalFlags:[]}};
 const before=run(scenario,false),after=run(scenario,true);expect(before.error).toBeNull();expect(after.error).toBeNull();
 expect(new JSDOM(before.html!).window.document.querySelector('img')).not.toBeNull();
 const current=new JSDOM(after.html!).window.document;expect(current.querySelector('img')).toBeNull();expect(current.querySelector('.trend-alert-spark')?.textContent).toBe('<img src=x onerror=evil()>');expect(after.trace).toEqual(before.trace);
});
