// @vitest-environment jsdom
import {afterEach,expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {runInNewContext} from 'node:vm';
import {stripTypeScriptTypes} from 'node:module';
import {categoryNativeDOM,categoryRawDOM} from './helpers/category-genuine-native-dom.js';
const runtime=vi.hoisted(()=>({trace:[] as unknown[],data:{} as unknown,filtered:{} as unknown,state:{} as Record<string,unknown>,throwAt:'',glyphValue:null as unknown}));
vi.mock('../js/state.js',()=>({state:runtime.state}));
vi.mock('../js/data.js',async()=>{const range=await import('../js/lab-date-range-presentation.js'),child=await import('../js/components/LabDateRange.svelte.html.js');return ({
 getActiveData:()=>{runtime.trace.push('get-active-data');return runtime.data;},
 filterDatesByRange:(data:unknown,options:unknown)=>{runtime.trace.push(['filter',data===runtime.data,options]);if(runtime.throwAt==='filter')throw new RangeError('filter-native');return runtime.filtered;},
 destroyAllCharts:()=>{runtime.trace.push('destroy-charts');},
 dataActionAttrs:(action:string,attrs:Record<string,unknown>)=>'data-lab-data-action="'+action+'" data-lab-data-range="'+String(attrs.range)+'"',
 projectDateRangeFilter:()=>{runtime.trace.push('date-filter');return range.projectLabDateRange(runtime.state.dateRangeFilter);},
 renderDateRangeFilter:()=>{runtime.trace.push('date-filter');return child.renderHTML({view:range.projectLabDateRange(runtime.state.dateRangeFilter)});},
 projectChartLayersDropdown:()=>{runtime.trace.push('chart-layers');return null;},
 renderChartLayersDropdown:()=>{runtime.trace.push('chart-layers');return '';},
});});
vi.mock('../js/health-data-loader.js',()=>({createLineChart:(...args:unknown[])=>{runtime.trace.push(['create-chart',args[0],args[2],args[3],args[4],args[5]]);if(runtime.throwAt==='chart')throw new Error('chart-native');}}));
vi.mock('../js/chart-card-recs.js',()=>({loadChartCardRecs:()=>{runtime.trace.push('load-recommendations');}}));
vi.mock('../js/category-page-runtime.js',()=>({primeCategoryPageCatalogCache:()=>{runtime.trace.push('prime-catalog');},getCategoryPageCatalogSlots:()=>{runtime.trace.push('catalog-slots');return {'chemistry.first':true};}}));
vi.mock('../js/category-glyphs.js',()=>({
 getCategoryGlyphCode:(key:string)=>{runtime.trace.push(['category-glyph',key]);if(runtime.throwAt==='glyph')throw new SyntaxError('glyph-native');return runtime.glyphValue??key;},
}));
vi.mock('../js/category-view-renderers.js',async importOriginal=>{
 const real=await importOriginal<typeof import('../js/category-view-renderers.js')>();
 const html=await import('../js/category-presentation.js');
 const chart=(...args:Parameters<typeof real.projectCategoryChartCard>)=>{runtime.trace.push(['inner-card',args[0],args[2],args[3]]);if(runtime.throwAt==='card')throw new Error('card-native');return real.projectCategoryChartCard(...args);};
 const table=(...args:Parameters<typeof real.projectCategoryTable>)=>{runtime.trace.push(['inner-table',args[1],args[2],args[3]]);return real.projectCategoryTable(...args);};
 const heatmap=(...args:Parameters<typeof real.projectCategoryHeatmap>)=>{runtime.trace.push(['inner-heatmap',args[1],args[2]]);return real.projectCategoryHeatmap(...args);};
 const fatty=(...args:Parameters<typeof real.projectCategoryFattyAcids>)=>{runtime.trace.push(['inner-fatty',args[1]]);return real.projectCategoryFattyAcids(...args);};
 return {...real,projectCategoryChartCard:chart,projectCategoryTable:table,projectCategoryHeatmap:heatmap,projectCategoryFattyAcids:fatty,
 renderChartCard:(...args:Parameters<typeof chart>)=>html.renderCategoryChartCard(chart(...args)),
 renderTableView:(...args:Parameters<typeof table>)=>html.renderCategoryTable(table(...args)),
 renderHeatmapView:(...args:Parameters<typeof heatmap>)=>html.renderCategoryHeatmap(heatmap(...args)),
 renderFattyAcidsView:(...args:Parameters<typeof fatty>)=>html.renderCategoryFatty(fatty(...args)),
 renderFattyAcidsCharts:()=>{runtime.trace.push('fatty-charts');}};
});
import * as candidate from '../js/category-page-view.js';
import * as utils from '../js/utils.js';
import * as dataPorts from '../js/data.js';
import * as renderers from '../js/category-view-renderers.js';
import * as charts from '../js/health-data-loader.js';
import * as recs from '../js/chart-card-recs.js';
import * as runtimePorts from '../js/category-page-runtime.js';
import * as markerAnalysis from '../js/marker-analysis.js';
import * as markerActions from '../js/marker-detail-actions.js';
import * as callbacks from '../js/runtime-callbacks.js';
import * as actionAttrs from '../js/action-attributes.js';
import {getCategoryGlyphCode} from '../js/category-glyphs.js';
const nativeSource=stripTypeScriptTypes(readFileSync(path.join(import.meta.dirname,'fixtures/category-native-before/category-page-view-native.ts.txt'),'utf8'),{mode:'strip'}).replace(/^import[\s\S]*?;\n/gm,'').replace(/^export /gm,'');
const nativeController=runInNewContext(nativeSource+';({showCategory,switchView,configureCategoryPageViewDeps,installCategoryPageActionDelegates})',{
 state:runtime.state,document,Element,Error,RangeError,TypeError,SyntaxError,...utils,...dataPorts,...renderers,...charts,...recs,...runtimePorts,...markerAnalysis,...markerActions,...callbacks,...actionAttrs,
 renderCategoryGlyph:(key:string,label:unknown,{large=false}={})=>`<span class="category-glyph${large?' category-glyph-large':''}" aria-hidden="true">${utils.escapeHTML(`${getCategoryGlyphCode(key,label)}`)}</span>`,
}) as typeof candidate;
interface Scenario {name:string;operation?:'show'|'switch'|'click'|'keyboard';view?:string;range?:string;mode?:string;savedView?:string;throwAt?:string;key?:string;missingMain?:boolean;missingView?:boolean;preserveOrder?:boolean;glyphMode?:string;keyEvent?:string;action?:string;role?:string;interactive?:boolean}
function tree(node:Node):unknown {
 if(node.nodeType===Node.TEXT_NODE||node.nodeType===Node.COMMENT_NODE)return {type:node.nodeType,text:node.nodeValue};
 if(node instanceof Element)return {namespace:node.namespaceURI,name:node.localName,attributes:[...node.attributes].map(a=>[a.name,a.value]),children:[...node.childNodes].map(tree)};
 return {type:node.nodeType,children:[...node.childNodes].map(tree)};
}
function capture(controller:typeof candidate,scenario:Scenario){
 runtime.trace=[];runtime.throwAt=scenario.throwAt??'';runtime.glyphValue=null;
 for(const key of Object.keys(runtime.state))delete runtime.state[key];
 runtime.state.dateRangeFilter=scenario.range??'all';runtime.state.categoryView=scenario.savedView??'charts';runtime.state.markerRegistry={};runtime.state.rangeMode='reference';runtime.state.profileProof={unrelated:{arrays:[1,null,'literal<&>'],unknown:'keep'}};
 if(scenario.preserveOrder)runtime.state._preserveCategoryCardOrder={categoryKey:'chemistry',markerKeys:['second','first']};
 const trace=runtime.trace;
 const coerce=(kind:string,value:string)=>({[Symbol.toPrimitive](hint:string){trace.push(['coercion',kind,hint]);if(scenario.mode==='throw-label'&&kind==='label')throw new TypeError('label-native');return value;},toLowerCase(){trace.push('label-lowercase');return 'native label<&>';}});
 const label=scenario.mode==='coercion'||scenario.mode==='throw-label'?coerce('label','Label <&> "'):(scenario.mode==='symbol-label'||scenario.mode==='no-data-symbol-label')?Symbol('label-native'):'Chemistry <&> "';
 const marker=(name:string,values:unknown[],hidden=false)=>({name,values,hidden,unit:'mg <&>',refMin:0,refMax:10});
 const markers:Record<string,unknown>={first:marker('First <&> "',[1,12]),second:marker('Second <&> "',[1,3]),gap:marker('Gap <&> "',[null,null])};
 if(scenario.mode==='no-data'||scenario.mode==='no-data-symbol-label'||scenario.mode==='outside-range')for(const value of Object.values(markers))((value as {values:unknown[]}).values)=[null,null];
 if(scenario.mode==='empty')for(const key of Object.keys(markers))delete markers[key];
 if(scenario.mode==='hidden')markers.hidden=marker('Hidden',[1,2],true);
 if(scenario.mode==='unsafe')markers['bad<key']=marker('Unsafe <&> "',[1,2]);
 if(scenario.mode==='unsafe-gap')markers['bad<key']=marker('Unsafe gap',[null,null]);
 if(scenario.mode==='null-marker')markers.first=null;
 if(scenario.mode==='getter-marker')markers.gap=new Proxy(marker('Getter gap',[null,null]),{get(t,k,r){trace.push(['gap-get',String(k)]);return Reflect.get(t,k,r);}});
 if(scenario.mode==='coercion')Object.defineProperty(markers.gap,'name',{get(){trace.push('gap-name-read');return coerce('gap-name','Gap native<&>');}});
 const rawMarkers:Record<string,unknown>={...markers,gap:marker('Gap historic',[1,2])};
 if(scenario.mode==='empty'||scenario.mode==='no-data')for(const key of Object.keys(rawMarkers))delete rawMarkers[key];
 const category={label,markers,singleDate:scenario.mode==='fatty'};
 const rawCategory={label,markers:scenario.mode==='outside-range'?{first:marker('Historical',[1,2])}:rawMarkers,singleDate:scenario.mode==='fatty'};
 runtime.filtered={categories:{chemistry:category},dateLabels:['One <&>','Two "'],dates:['2026-01-01','2026-02-01'],phaseLabels:['native-phase'],phaseDisplayLabels:['native-display'],phaseCycleDays:[1,2],phaseSources:['native-source']};
 runtime.data={categories:{chemistry:rawCategory},dateLabels:['One <&>','Two "'],dates:['2026-01-01','2026-02-01']};
 if(scenario.glyphMode==='coercion')runtime.glyphValue=coerce('glyph','<svg data-proof-coercion="literal"></svg>');
 if(scenario.glyphMode==='symbol')runtime.glyphValue=Symbol('glyph-native');
 document.body.innerHTML=scenario.missingMain?'':'<main id="main-content" tabindex="-1"><p data-proof-old="main">Previous</p></main>';
 const main=document.getElementById('main-content');if(main)main.scrollTop=37;
 if(scenario.operation&&scenario.operation!=='show'){
  if(main)main.innerHTML=scenario.missingView?'<button class="view-btn active" data-proof-old="button">Old</button>':'<div class="view-toggle"><button class="view-btn active" role="tab" aria-selected="true" tabindex="0">Charts</button><button class="view-btn" role="tab" aria-selected="false" tabindex="-1">Table</button><button class="view-btn" role="tab" aria-selected="false" tabindex="-1">Heatmap</button></div><div id="view-content"><p data-proof-old="view">Previous view</p></div>';
 }
 const assignment:unknown[]=[];const native=Object.getOwnPropertyDescriptor(Element.prototype,'innerHTML')!;
 Object.defineProperty(Element.prototype,'innerHTML',{configurable:true,get:native.get!,set(this:Element,value:string){if(this.id==='main-content'||this.id==='view-content'){assignment.push({id:this.id,raw:value});trace.push(['assign',this.id]);}native.set!.call(this,value);}});
 let error:string|null=null;let event:unknown=null;
 try{
  const key=scenario.key??'chemistry';
  if(scenario.operation==='switch')controller.switchView(scenario.view??'charts',key,document.querySelectorAll('.view-btn')[1]??document.createElement('button'));
  else if(scenario.operation==='click'||scenario.operation==='keyboard'){
   const listeners:Record<string,((event:Event)=>unknown)[]>={};
   const root={addEventListener(type:string,callback:(event:Event)=>unknown){(listeners[type]??=[]).push(callback);}};
   controller.configureCategoryPageViewDeps({renameCategory:(value:string)=>{trace.push(['rename',value]);}});
   controller.installCategoryPageActionDelegates(root as Parameters<typeof controller.installCategoryPageActionDelegates>[0]);controller.installCategoryPageActionDelegates(root as Parameters<typeof controller.installCategoryPageActionDelegates>[0]);
   const element=document.createElement(scenario.interactive?'button':'span');element.setAttribute('data-category-page-action',scenario.action??'switch-view');element.dataset.categoryPageCategory=key;element.dataset.categoryPageView=scenario.view??'table';if(scenario.role)element.setAttribute('role',scenario.role);
   const e=scenario.operation==='keyboard'?new KeyboardEvent('keydown',{key:scenario.keyEvent??'Enter',cancelable:true}):new MouseEvent('click',{cancelable:true});Object.defineProperty(e,'target',{value:element});
   for(const listener of listeners[scenario.operation==='keyboard'?'keydown':'click']??[])listener(e);
   event={defaultPrevented:e.defaultPrevented,listenerCounts:Object.fromEntries(Object.entries(listeners).map(([kind,rows])=>[kind,rows.length]))};
  } else controller.showCategory(key,scenario.missingMain?{}:runtime.data);
 }catch(e){const fault=e as {name?:unknown;message?:unknown};error=typeof fault?.name==='string'&&typeof fault.message==='string'?fault.name+':'+fault.message:String(e);}
 finally{Object.defineProperty(Element.prototype,'innerHTML',native);}
 return {assignment,dom:tree(document.body),actions:[...document.querySelectorAll('[data-category-page-action],[data-marker-detail-action],[data-lab-data-action]')].map(el=>({name:el.localName,attributes:[...el.attributes].map(a=>[a.name,a.value])})),trace,error,event,state:{categoryView:runtime.state.categoryView,dateRangeFilter:runtime.state.dateRangeFilter,preserveOrder:runtime.state._preserveCategoryCardOrder??null,profileProof:runtime.state.profileProof},mainScrollTop:main?.scrollTop??null};
}
const scenarios:Scenario[]=[
 {name:'charts-populated'}, {name:'charts-hidden',mode:'hidden'}, {name:'charts-unsafe-key',mode:'unsafe'}, {name:'gap-unsafe-key',mode:'unsafe-gap'}, {name:'gap-getter',mode:'getter-marker'}, {name:'native-port-coercion',mode:'coercion'}, {name:'native-glyph-coercion',glyphMode:'coercion'}, {name:'native-glyph-Symbol-throw',glyphMode:'symbol'},
 {name:'charts-no-data',mode:'no-data'},{name:'charts-empty',mode:'empty'},{name:'charts-fatty',mode:'fatty'},{name:'preserved-card-order',preserveOrder:true},{name:'saved-table',savedView:'table'},{name:'saved-heatmap',savedView:'heatmap'},
 ...['3m','6m','1y','other'].map(range=>({name:'outside-'+range,range,mode:'outside-range'})),
 ...['table','heatmap','charts','other'].map(view=>({name:'switch-'+view,operation:'switch' as const,view})),
 {name:'switch-empty',operation:'switch',mode:'empty'},{name:'switch-fatty',operation:'switch',mode:'fatty'},{name:'switch-outside',operation:'switch',range:'3m',mode:'outside-range'},
 {name:'no-main',missingMain:true},{name:'no-view',operation:'switch',missingView:true},{name:'unsafe-category',key:'bad<key'},{name:'unsafe-switch-category',operation:'switch',key:'bad<key'},
 ...['filter','glyph','card','chart'].map(throwAt=>({name:'throw-'+throwAt,throwAt})),{name:'null-marker-throw',mode:'null-marker'},{name:'no-data-Symbol-lowercase-throw',mode:'no-data-symbol-label'},{name:'native-label-Symbol-string',mode:'symbol-label'},{name:'native-label-coercion-throw',mode:'throw-label'},
 {name:'delegated-click-table',operation:'click',view:'table'},{name:'delegated-click-rename',operation:'click',action:'rename-category'}, {name:'delegated-click-unknown',operation:'click',action:'unknown'}, {name:'delegated-click-invalid-view',operation:'click',view:'other'}, {name:'delegated-click-unsafe',operation:'click',key:'bad<key'},
 {name:'delegated-Enter-switch',operation:'keyboard',role:'button',view:'heatmap'}, {name:'delegated-Space-rename',operation:'keyboard',role:'button',keyEvent:' ',action:'rename-category'}, {name:'delegated-other-key',operation:'keyboard',role:'button',keyEvent:'Escape'}, {name:'delegated-native-button-not-doubled',operation:'keyboard',role:'button',interactive:true}, {name:'delegated-no-button-role',operation:'keyboard'},
];
/** Run the native parent and current genuine parent with the same current
 * feature children. This preserves every controller callback/fault assertion
 * while separately qualifying those children against their native receipts. */
function normalize(receipt:ReturnType<typeof capture>){return {...categoryNativeDOM(receipt) as ReturnType<typeof capture>,assignment:receipt.assignment.map(row=>{const write=row as {id:string;raw:string};return {id:write.id,dom:categoryRawDOM(write.raw)};})};}
for(const scenario of scenarios)it('preserves complete native Category page '+scenario.name,()=>{const before=capture(nativeController,scenario),after=capture(candidate,scenario);expect(normalize(after)).toEqual(normalize(before));
 if(scenario.name==='outside-3m')expect(before.assignment).toEqual(expect.arrayContaining([expect.objectContaining({raw:expect.stringContaining('No results in the last 3 months')})]));
 if(scenario.name==='charts-no-data')expect(before.assignment).toEqual(expect.arrayContaining([expect.objectContaining({raw:expect.stringContaining('No Data Available')})]));
 if(scenario.name==='native-port-coercion')expect(before.trace).toContainEqual(['coercion','label','string']);
 if(scenario.name==='no-data-Symbol-lowercase-throw'||scenario.name==='native-label-coercion-throw')expect(before.error).toContain('TypeError');
 if(scenario.name==='native-glyph-Symbol-throw')expect(before.error).toContain('TypeError');
 if(scenario.name==='delegated-click-rename')expect(before.trace).toContainEqual(['rename','chemistry']);
 if(scenario.name==='delegated-Enter-switch')expect(before.event).toMatchObject({defaultPrevented:true,listenerCounts:{click:1,keydown:1}});
});
afterEach(()=>{document.body.replaceChildren();runtime.trace=[];});
