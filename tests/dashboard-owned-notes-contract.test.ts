import {expectedOwnedLabFactoryKeys} from './helpers/dashboard-loading-insights-owned-receipts.js';
// @vitest-environment jsdom
import {hydrateDashboardOwnedWidgetBodies,disposeDashboardOwnedWidgets} from '../js/dashboard-owned-widget-host.js';
import {renderDashboardOwnedWidgetHTML} from '../js/dashboard-owned-widget-html.js';
import {afterAll,afterEach,beforeEach,expect,it,vi} from 'vitest';
import {readFileSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {createDashboardLabWidgetRenderers as candidateFactory} from '../js/dashboard-lab-widget-renderers.js';
import {createDashboardWidgetControls} from '../js/dashboard-widget-controls.js';
import {configureDashboardNoteActions} from '../js/dashboard-widget-runtime.js';
import {state} from '../js/state.js';

type Factory = typeof candidateFactory;
type Fixture = (trace:string[]) => unknown;
const note=(date:unknown,text:unknown)=>({date,text,retained:{source:'manual',unknownField:['keep',3]}});
const profile=(notes:unknown)=>({notes,entries:[],customMarkers:{},unknownTopLevel:{keep:true}});
const primitive=(trace:string[],name:string,value:unknown)=>({[Symbol.toPrimitive](hint:string){trace.push(name+':'+hint);return value;}});
const fixtures:Record<string,Fixture>={
 'missing notes':()=>({entries:[],unknownTopLevel:{keep:true}}),
 'null notes':()=>profile(null),
 'empty notes':()=>profile([]),
 'single note':()=>profile([note('2026-01-15','One note')]),
 'sorted source indices':()=>profile([note('2026-04-10','Later'),note('2026-01-15','First'),note('2026-02-02','Middle')]),
 'stable equal dates':()=>profile([note('2026-01-15','First equal'),note('2026-01-15','Second equal')]),
 'exact 200 chars':()=>profile([note('2026-01-15','x'.repeat(200))]),
 'truncate 201 chars':()=>profile([note('2026-01-15','x'.repeat(201))]),
 'escaped hostile markup':()=>profile([note('2026-01-15','<button data-dashboard-widget-action="delete-note">& \" </button>')]),
 'multiline and whitespace':()=>profile([note('2026-01-15',' First\n\tSecond  ')]),
 'utf16 truncation':()=>profile([note('2026-01-15','😀'.repeat(101))]),
 'invalid native date':()=>profile([note('not-a-date','Date unavailable')]),
 'empty text':()=>profile([note('2026-01-15','')]),
 'numeric text':()=>profile([note('2026-01-15',42)]),
 'native escapeHTML Symbol text':()=>profile([note('2026-01-15',Symbol('safe-text'))]),
 'date default coercion':trace=>profile([note(primitive(trace,'date','2026-01-15'),'Date object')]),
 'text explicit string coercion':trace=>profile([note('2026-01-15',primitive(trace,'text','<&>'))]),
 'text getter reads':trace=>profile([{date:'2026-01-15',get text(){trace.push('text:get');return 'x'.repeat(201);}}]),
 'notes getter reads':trace=>({get notes(){trace.push('notes:get');return [note('2026-01-15','Getter')];},unknownTopLevel:'kept'}),
 'null imported profile':()=>null,
 'undefined imported profile':()=>undefined,
 'non-array positive length':()=>profile({length:1}),
 'missing text throw':()=>profile([{date:'2026-01-15'}]),
 'null text throw':()=>profile([note('2026-01-15',null)]),
 'undefined date native label':()=>profile([note(undefined,'undefined date')]),
 'Symbol date throw':()=>profile([note(Symbol('date'),'Date Symbol')]),
 'date coercion throw':trace=>profile([note({[Symbol.toPrimitive](hint:string){trace.push('date:'+hint);throw new RangeError('date coercion');}},'Text')]),
 'text getter throw':trace=>profile([{date:'2026-01-15',get text(){trace.push('text:get');throw new Error('text getter');}}]),
 'notes second read throw':trace=>{let reads=0;return{get notes(){trace.push('notes:get:'+ ++reads);if(reads===2)throw new Error('second notes read');return [];}};},
 'notes length throw':trace=>profile({get length(){trace.push('length:get');throw new Error('notes length');}}),
 'notes map throw':trace=>profile({length:1,map(){trace.push('map:call');throw new Error('notes map');}}),
 'sort comparator throw':trace=>profile([note({localeCompare(){trace.push('localeCompare:call');throw new Error('sort comparison');}},'first'),note({localeCompare(){trace.push('localeCompare:call');throw new Error('sort comparison');}},'second')]),
 'text length coercion order':trace=>profile([note('2026-01-15',{get length(){trace.push('length:get');return primitive(trace,'length',201);},slice(start:number,end:number){trace.push('slice:'+start+':'+end);return primitive(trace,'slice','truncated');}})]),
};
let saved:{importedData:unknown;currentProfile:typeof state.currentProfile;markerRegistry:typeof state.markerRegistry};
const originals=JSON.parse(readFileSync(path.join(import.meta.dirname,'fixtures/dashboard-lab-notes-original.json'),'utf8')) as {name:string;original:unknown}[];
beforeEach(()=>{saved={importedData:state.importedData,currentProfile:state.currentProfile,markerRegistry:state.markerRegistry};localStorage.clear();localStorage.setItem('notes-foreign','unchanged');state.currentProfile='notes-presentation-qualification';state.markerRegistry={};document.body.innerHTML='';});
afterEach(()=>{(state as {importedData:unknown}).importedData=saved.importedData;state.currentProfile=saved.currentProfile;state.markerRegistry=saved.markerRegistry;document.body.innerHTML='';localStorage.clear();vi.restoreAllMocks();});
function orderedDOM(node:Node):unknown {
 if(node.nodeType===Node.TEXT_NODE||node.nodeType===Node.COMMENT_NODE)return{type:node.nodeType,text:node.nodeValue};
 if(node instanceof Element)return{type:node.nodeType,name:node.localName,namespace:node.namespaceURI,attributes:[...node.attributes].map(a=>[a.namespaceURI,a.name,a.value]),children:[...node.childNodes].map(orderedDOM)};
 return{type:node.nodeType,children:[...node.childNodes].map(orderedDOM)};
}
function snapshotWithoutGetters(value:unknown):unknown {
 if(value===undefined)return{type:'undefined'};
 if(typeof value==='symbol')return{type:'symbol',description:value.description};
 if(typeof value==='function')return{type:'function',name:value.name,length:value.length};
 if(value===null||typeof value!=='object')return value;
 return Reflect.ownKeys(value).map(key=>{const d=Object.getOwnPropertyDescriptor(value,key)!;return[String(key),d.enumerable,d.configurable,'value'in d?['value',snapshotWithoutGetters(d.value),d.writable]:['accessor',d.get?.name??null,d.set?.name??null]];});
}
function publicReceipt(factory:Factory,fixture:Fixture){
 const trace:string[]=[];const imported=fixture(trace);(state as {importedData:unknown}).importedData=imported;
 const beforeProfile=snapshotWithoutGetters(imported);
 const renderers=factory({markerHasData:()=>true,rerenderDashboardFromWidgetChange:()=>trace.push('rerender')});
 const keys=Object.keys(renderers);const method=renderers.renderDashboardNotesWidget;
 let raw:string|null=null,error:{name:string;message:string}|null=null,dom:unknown=null;
 const assignments:string[]=[];const host=document.createElement('main');document.body.append(host);
 const descriptor=Object.getOwnPropertyDescriptor(Element.prototype,'innerHTML')!;
 Object.defineProperty(host,'innerHTML',{configurable:true,get(){return descriptor.get!.call(host) as string;},set(value:string){assignments.push(value);descriptor.set!.call(host,value);}});
 try{raw=method();host.innerHTML=raw;dom=orderedDOM(host);}catch(thrown){const e=thrown as Error;error={name:e.name,message:e.message};}
 const actions=[...host.querySelectorAll<HTMLElement>('[data-dashboard-widget-action]')].map(el=>({tag:el.localName,action:el.dataset.dashboardWidgetAction,index:el.dataset.dashboardWidgetIndex??null,label:el.textContent}));
 const result={raw,assignments,dom,actions,trace,error,factoryKeys:keys,functionName:method.name,functionLength:method.length,profileIdentity:state.importedData===imported,beforeProfile,afterProfile:snapshotWithoutGetters(imported),registry:state.markerRegistry,storage:[...Array(localStorage.length)].map((_,j)=>{const k=localStorage.key(j)!;return[k,localStorage.getItem(k)];})};host.remove();return result;
}
it.each(Object.entries(fixtures))('%s public native and candidate receipts are exact',(name,fixture)=>{const original=originals.find(row=>row.name===name)!.original,candidate=publicReceipt(candidateFactory,fixture);const prior=original as ReturnType<typeof publicReceipt>,expected={...prior,factoryKeys:expectedOwnedLabFactoryKeys(prior.factoryKeys)};
 if(name==='non-array positive length'){
  // Vite's import namespace index follows the quick-marker and summary owners before state.
  // This is one complete known harness error, not a general message normalizer.
  expect(prior.error).toEqual({name:'TypeError',message:'__vite_ssr_import_0__.state.importedData.notes.map is not a function'});
  const source=readFileSync(path.resolve(process.cwd(),'js/dashboard-lab-widget-renderers.ts'),'utf8');
  const imports=[...source.matchAll(/^import[\s\S]*?from ['"]([^'"]+)['"];?/gm)].map(match=>match[1]);
  expect(imports.slice(0,3)).toEqual(['./dashboard-quick-marker-core.js','./dashboard-lab-summary-presentation.js','./state.js']);
  expected.error={name:'TypeError',message:'__vite_ssr_import_2__.state.importedData.notes.map is not a function'};
 }

 if(prior.dom!==null){expected.dom=nativeWithOwnedAnnotations(prior.dom,'notes');expect(candidate.assignments).toEqual([candidate.raw]);expect(typeof candidate.raw).toBe('string');expected.raw=candidate.raw;expected.assignments=candidate.assignments;}
 completeCarriers.push({name,original:prior,actual:candidate});expect(candidate).toEqual(expected);expect(candidate.afterProfile).toEqual(candidate.beforeProfile);});

const actions=[['add-click','.add-note-btn','click'],['card-click','.note-card','click'],['card-enter','.note-card','Enter'],['card-space','.note-card',' '],['edit-click','.note-card-action:not(.note-card-action-delete)','click'],['delete-click','.note-card-action-delete','click'],['button-keydown-ignored','.add-note-btn','Enter'],['irrelevant-key-ignored','.note-card','Escape']] as const;
function delegatedReceipt(factory:Factory,selector:string,key:string){
 const calls:unknown[][]=[];const previous=configureDashboardNoteActions({openNoteEditor:(...args:unknown[])=>calls.push(['edit',...args]),deleteNote:(...args:unknown[])=>calls.push(['delete',...args])});
 const listeners:{type:string;callback:EventListenerOrEventListenerObject}[]=[];
 const add=document.addEventListener.bind(document);
 const spy=vi.spyOn(document,'addEventListener').mockImplementation((type,callback,options)=>{if(callback)listeners.push({type,callback});add(type,callback,options);});
 const data=profile([note('2026-04-10','Later'),note('2026-01-15','First')]);(state as {importedData:unknown}).importedData=data;
 const before=JSON.stringify(data);const renderers=factory({markerHasData:()=>true,rerenderDashboardFromWidgetChange:()=>calls.push(['rerender'])});
 const view=renderers.projectDashboardNotesWidget();
 document.body.innerHTML='<main><div class="dashboard-widgets"><section data-widget-id="notes"><div class="dashboard-widget-body">'+renderDashboardOwnedWidgetHTML(view)+'</div></section></div></main>';
 hydrateDashboardOwnedWidgetBodies(document.querySelector<HTMLElement>('main')!,[{def:{id:'notes'},ownedView:view}]);
 createDashboardWidgetControls({});const target=document.querySelector<HTMLElement>(selector)!;
 const event=key==='click'?new MouseEvent('click',{bubbles:true,cancelable:true}):new KeyboardEvent('keydown',{key,bubbles:true,cancelable:true});
 try{target.dispatchEvent(event);return{calls,eventType:event.type,key,prevented:event.defaultPrevented,profile:JSON.stringify(state.importedData),profileUnchanged:JSON.stringify(state.importedData)===before,actions:[...document.querySelectorAll<HTMLElement>('[data-dashboard-widget-action]')].map(e=>[e.dataset.dashboardWidgetAction,e.dataset.dashboardWidgetIndex??null]),registry:state.markerRegistry,foreignStorage:localStorage.getItem('notes-foreign')};}
 finally{disposeDashboardOwnedWidgets();spy.mockRestore();for(const {type,callback}of listeners)document.removeEventListener(type,callback);configureDashboardNoteActions(previous);document.body.innerHTML='';}
}
it.each(actions)('%s preserves actual native delegates and note callback argument chronology',(name,selector,key)=>{const original=originals.find(row=>row.name===name)!.original,candidate=delegatedReceipt(candidateFactory,selector,key);completeCarriers.push({name,original,actual:candidate});expect(candidate).toEqual(original);expect(candidate.profileUnchanged).toBe(true);if(name==='add-click')expect(candidate.calls).toEqual([['edit']]);if(name.startsWith('card-')||name==='edit-click')expect(candidate.calls).toEqual([['edit',null,1]]);if(name==='delete-click')expect(candidate.calls).toEqual([['delete',1]]);if(name.endsWith('ignored'))expect(candidate.calls).toEqual([]);});

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
   tile.children!.splice(sparkIndex,1,comment(spark.name==='span'?'[0':'[-1'),spark,comment(']'));
  }
  element!.children=[comment('['),...element!.children!,comment(']')];
  root.children=[...prefix,comment('[0'),element!,comment(']'),comment(']'),comment(']')];
 }
 return root;
}

const completeCarriers:{name:string;original:unknown;actual:unknown}[]=[];
afterAll(()=>writeFileSync(path.resolve(import.meta.dirname,'../../complete-notes-owned-contract-receipts.json'),JSON.stringify(completeCarriers,null,2)+'\n'));

it.each(['extra-comment','wrong-owner-annotation','class','text','action'])('finite owner graph rejects %s corruption',fault=>{
 const imported=state.importedData;
 try {
(state as {importedData:unknown}).importedData=profile([note('2026-01-15','One note')]);const raw=candidateFactory({markerHasData:()=>true,rerenderDashboardFromWidgetChange:()=>{}}).renderDashboardNotesWidget();const native=originals.find(row=>row.name==='single note')!.original as ReturnType<typeof publicReceipt>;
 const host=document.createElement('main');host.innerHTML=raw;const expected=nativeWithOwnedAnnotations(native.dom,'notes');
 if(fault==='extra-comment')host.insertBefore(document.createComment('foreign'),host.firstChild);
 else if(fault==='wrong-owner-annotation')(host.firstChild as Comment).data='foreign';
 else if(fault==='class')host.querySelector('button')!.classList.add('foreign');
 else if(fault==='text')host.querySelector('button')!.textContent='foreign';
 else host.querySelector('button')!.setAttribute('data-dashboard-widget-action','delete-note');
 expect(()=>expect(orderedDOM(host)).toEqual(expected)).toThrow();
 }finally{(state as {importedData:unknown}).importedData=imported;}
});
