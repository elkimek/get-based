import fs from 'node:fs';
import vm from 'node:vm';
import {stripTypeScriptTypes} from 'node:module';
import {JSDOM} from 'jsdom';
import {expect,it} from 'vitest';
import {escapeAttr,escapeHTML} from '../js/utils.js';
import {actionAttributes} from '../js/action-attributes.js';
import {getWidgetHeaderDescription} from '../js/dashboard-widget-copy.js';
import {renderDashboardOwnedWidgetHTML} from '../js/dashboard-owned-widget-html.js';
import {projectDashboardWidgetFrame,renderDashboardWidgetFrame,type DashboardWidgetContent,type DashboardWidgetDefinition} from '../js/dashboard-widget-presentation.js';

const nativeSource=fs.readFileSync(new URL('./fixtures/dashboard-widget-frame-original.json',import.meta.url),'utf8');
const original=stripTypeScriptTypes((JSON.parse(nativeSource) as {source:string}).source);
interface Scenario {def:DashboardWidgetDefinition;content:DashboardWidgetContent|null;hidden:string[];organizing:boolean;index:number;count:number}
function run(scenario:Scenario,current:boolean,failAt=Infinity){
 const trace:string[]=[];const read=(label:string)=>{trace.push(label);if(trace.length===failAt)throw new Error('fault:'+label);};
 const def=new Proxy(structuredClone(scenario.def),{get(target,key,receiver){read(String(key));return Reflect.get(target,key,receiver);}});
 const prefs={hidden:scenario.hidden,order:[]};let html:string|null=null,error:string|null=null;
 const content=scenario.content;
 const body=content?.kind==='notes'?renderDashboardOwnedWidgetHTML(content.view):'';
 try{
  html=current?renderDashboardWidgetFrame(projectDashboardWidgetFrame({def,content},prefs,scenario.index,{length:scenario.count},scenario.organizing)):
   vm.runInNewContext(original+';renderDashboardWidget({def,body},prefs,index,visibleEntries)',{
    def,body,prefs,index:scenario.index,visibleEntries:{length:scenario.count},organizeMode:scenario.organizing,
    escapeAttr,escapeHTML,getWidgetHeaderDescription,
    dashboardWidgetActionAttrs:(action:unknown,attrs:Record<string,unknown>)=>actionAttributes('dashboard-widget',action,attrs),
    dashboardWidgetDragAttrs:(id:unknown)=>{const safe=escapeAttr(id);return `data-dashboard-widget-drag-id="${safe}" data-dashboard-widget-drop-id="${safe}"`;},
   }) as string;
 }catch(e){error=(e as Error).message;}
 return {trace,html,error};
}
function tree(node:Node):unknown{
 if(node.nodeType===8){expect(['','[',']','[-1','[0','[1','[2','[3','[4','[!']).toContain(node.nodeValue);return null;}
 if(node.nodeType===3)return node.textContent?.trim()?node.textContent:null;
 const el=node as Element;const children:unknown[]=[];
 for(const child of node.childNodes){const next=tree(child);if(next===null)continue;if(typeof next==='string'&&typeof children.at(-1)==='string')children[children.length-1]=(children.at(-1) as string)+next;else children.push(next);}
 return {tag:el.tagName,attributes:el.attributes?[...el.attributes].map(a=>[a.name,a.value]):[],button:el.tagName==='BUTTON'?{type:(el as HTMLButtonElement).type,disabled:(el as HTMLButtonElement).disabled}:null,children};
}
const dom=(html:string|null)=>html===null?null:tree(new JSDOM(html).window.document.body);
const notes:DashboardWidgetContent={kind:'notes',view:{kind:'notes',rows:[{index:0,dateLabel:'January <1>',preview:'Native note <&>'}]}};
const scenarios:Scenario[]=[
 {def:{id:'custom',title:'Card <&>',description:'Description',source:'Labs',size:'half'},content:notes,hidden:[],organizing:false,index:0,count:1},
 {def:{id:'custom',title:'Card <&>',description:'Description',source:'Labs',size:'half'},content:notes,hidden:[],organizing:true,index:0,count:3},
 {def:{id:'marker_blood',title:'Marker',customMarkerWidget:true},content:notes,hidden:[],organizing:true,index:2,count:3},
 {def:{id:'notes',title:'Notes',description:'Redundant',source:'Labs'},content:{kind:'notes',view:{kind:'notes',rows:[]}},hidden:[],organizing:false,index:1,count:3},
 {def:{id:'custom',title:'Empty'},content:null,hidden:[],organizing:true,index:1,count:3},
 {def:{id:'custom',title:'Empty'},content:null,hidden:[],organizing:false,index:1,count:3},
 {def:{id:'custom',title:'Hidden'},content:notes,hidden:['custom'],organizing:true,index:0,count:1},
];
it.each(scenarios)('preserves native frame/controls/feature child and getter order %#',scenario=>{
 const before=run(scenario,false),after=run(scenario,true);expect(before.error).toBeNull();expect(after.error).toBeNull();expect(after.trace).toEqual(before.trace);expect(dom(after.html)).toEqual(dom(before.html));
});
it('preserves every native metadata fault boundary',()=>{
 for(const scenario of [scenarios[0]!,scenarios[1]!,scenarios[2]!])for(let index=1;index<=run(scenario,false).trace.length;index++){
  const before=run(scenario,false,index),after=run(scenario,true,index);expect(after.error).toEqual(before.error);expect(after.trace).toEqual(before.trace);expect(dom(after.html)).toEqual(dom(before.html));
 }
});
it('keeps unexpected comments observable',()=>{expect(()=>tree(new JSDOM('<div><!--foreign--></div>').window.document.body)).toThrow();});
