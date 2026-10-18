import {expectedMtdnaPanelHTML,mtdnaNativeTree} from './helpers/dashboard-mtdna-study-owned-receipts.js';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import fs from 'node:fs';
import vm from 'node:vm';
import {JSDOM} from 'jsdom';
import {parse} from 'svelte/compiler';
import {projectDashboardMtdnaPanel,renderDashboardMtdnaPanelPresentation,renderDashboardGenomeLoading} from '../js/dashboard-mtdna-panel-presentation.js';
import type {GenomeEvidence,GenomeHaplogroupTable,MtdnaReader,MtdnaStudyReader} from '../types/dashboard-widget-renderers.js';
const ports=vi.hoisted(()=>({change:(html:string)=>html}));
vi.mock('../js/components/DashboardMtdnaPanel.svelte.html.js',async importOriginal=>{
 const actual=await importOriginal<typeof import('../js/components/DashboardMtdnaPanel.svelte.html.js')>();
 return {renderHTML:(props:Parameters<typeof actual.renderHTML>[0])=>{
  const raw=actual.renderHTML(props),directory=process.env['GETBASED_MTDNA_PANEL_RAW'];
  if(directory){const name='compiled-'+captureIndex++ +'.json';fs.writeFileSync(directory+'/'+name,JSON.stringify({raw,props},null,2),{flag:'wx'});}
  return ports.change(raw);
 }};
});
let captureIndex=0;
const escape=(value:unknown)=>value==null?'':String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
vi.mock('../js/utils.js',()=>({escapeHTML:(value:unknown)=>value==null?'':String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!))}));
const fixture=fs.readFileSync(new URL('./fixtures/dashboard-mtdna-panel-original.txt',import.meta.url),'utf8');
const study=vm.runInNewContext('('+fs.readFileSync(new URL('./fixtures/dashboard-mtdna-study-original.txt',import.meta.url),'utf8')+')',{escapeHTML:escape,escapeAttr:escape});
interface Mismatch {message?:unknown;mismatch?:unknown}
function original(mtdna:MtdnaReader,table:GenomeHaplogroupTable|null,resolve:()=>Mismatch|null,evidence:GenomeEvidence|null):string{
 const fn=vm.runInNewContext('('+fixture+')',{escapeHTML:escape,escapeAttr:escape,detectMtDNAMismatch:resolve,_dashboardGenomeEvidence:evidence,renderDashboardMtdnaEvidenceStudy:study});
 const raw:string=fn(mtdna,table,{}),directory=process.env['GETBASED_MTDNA_PANEL_RAW'];
 if(directory)fs.writeFileSync(directory+'/original-'+captureIndex++ +'.json',JSON.stringify({raw}),{flag:'wx'});
 return raw;
}
function native(markup:string){
 const dom=new JSDOM('',{url:'https://example.invalid/'});
 try{const host=dom.window.document.createElement('template');host.innerHTML=markup;
  function walk(node:Node):unknown{const el=node instanceof dom.window.Element?node:null;
   return {type:node.nodeType,name:node.nodeName,value:node.nodeValue,attrs:el?[...el.attributes].map(a=>[a.name,a.value,a.namespaceURI]):null,
    defaults:el instanceof dom.window.HTMLDetailsElement?{open:el.open}:el instanceof dom.window.HTMLAnchorElement?{href:el.href,target:el.target,rel:el.rel,tabIndex:el.tabIndex}:el instanceof dom.window.HTMLElement?{tabIndex:el.tabIndex}:null,children:[...node.childNodes].map(walk)};}
  return [...host.content.childNodes].map(walk);
 }finally{dom.window.close();}
}
const full:MtdnaReader={origin:'Maternal <region>',source:'Synthetic export',matchedMutations:4,totalDiagnostic:8,haplogroup:'H1',details:'Details',coupling:{shortLabel:'Tight',label:'Coupling',climate:'Cold',description:'Description',implications:'Implications'}};
const table:GenomeHaplogroupTable={_meta:{caveat:'Evidence is contextual',references:[{pmid:'PMID 26406369',direction:'supportive',title:'Study',summary:'Summary'},null,{direction:'mixed',model:'Model',limitations:'Limits'}]}};
beforeEach(()=>{ports.change=html=>html;});afterEach(()=>{ports.change=html=>html;});
describe('complete Dashboard mtDNA panel native source contract',()=>{
 const cases:Array<{m:MtdnaReader;t:GenomeHaplogroupTable|null;r:()=>Mismatch|null}>=[
  {m:{},t:null,r:()=>null},{m:full,t:table,r:()=>({message:'Current latitude context',mismatch:true})},
  {m:{...full,coupling:null,origin:0,source:false,matchedMutations:null,totalDiagnostic:''},t:{_meta:{references:'not an array'}},r:()=>({message:'Match',mismatch:false})},
  {m:{...full,matchedMutations:Infinity,totalDiagnostic:NaN,details:false},t:{_meta:{references:new Array(3)}},r:()=>null},
  {m:{...full,haplogroup:Symbol('H'),origin:{toString:()=>''}},t:{_meta:{references:[],caveat:'unread'}},r:()=>({message:''})},
 ];
 cases.forEach((input,index)=>it('preserves full raw HTML and genuine fragment defaults '+index,()=>{
  const old=original(input.m,input.t,input.r,null),now=renderDashboardMtdnaPanelPresentation(input.m,input.t,input.r,null);
  expect(now).toBe(expectedMtdnaPanelHTML(old));expect(mtdnaNativeTree(now)).toEqual(mtdnaNativeTree(old,true));
 }));
 it('preserves hostile text, native provenance attributes and owned child boundaries',()=>{
  const hostile='<script>bad()</script> & " \' <!--[0--> gb-mtdna-panel-slot-0-end';
  const m={...full,haplogroup:hostile,origin:hostile,source:hostile,details:hostile,coupling:{shortLabel:hostile,label:hostile,climate:hostile,description:hostile,implications:hostile}};
  const t={_meta:{caveat:hostile,references:[{title:hostile,summary:hostile,pmid:'123'}]}};
  const evidence={mtdnaEvidenceIssueUrl:()=>'/issues?title='+hostile} as GenomeEvidence;
  const old=original(m,t,()=>({message:hostile}),evidence),now=renderDashboardMtdnaPanelPresentation(m,t,()=>({message:hostile}),evidence);
  expect(now).toBe(expectedMtdnaPanelHTML(old));expect(mtdnaNativeTree(now)).toEqual(mtdnaNativeTree(old,true));const dom=new JSDOM(now);try{expect(dom.window.document.querySelector('script,img,[onclick]')).toBeNull();expect(dom.window.document.querySelector('details')!.open).toBe(false);}finally{dom.window.close();}
 });
 it('preserves repeated property reads, Number/string coercion and issue callback order',()=>{
  const run=(render:typeof original)=>{const trace:string[]=[];const value=(name:string,result:string|number)=>({[Symbol.toPrimitive](hint:string){trace.push(name+':'+hint);return result;}});
   const coupling=new Proxy(full.coupling!,{get(target,key,receiver){trace.push('coupling.'+String(key));return value(String(key),String(Reflect.get(target,key,receiver)));}});
   const m=new Proxy({...full,coupling},{get(target,key,receiver){trace.push('m.'+String(key));if(key==='coupling')return coupling;const v=Reflect.get(target,key,receiver);return value(String(key),typeof v==='number'?v:String(v));}});
   const meta=new Proxy(table._meta!,{get(target,key,receiver){trace.push('meta.'+String(key));return Reflect.get(target,key,receiver);}});
   const t=new Proxy({_meta:meta},{get(target,key,receiver){trace.push('table.'+String(key));return Reflect.get(target,key,receiver);}});
   const evidence={mtdnaEvidenceIssueUrl(){trace.push('issue');return value('url','https://example.invalid/issues');}} as GenomeEvidence;
   return {html:render(m,t,()=>{trace.push('mismatch');return {message:value('message','Match'),mismatch:false};},evidence),trace};};
  const old=run(original);expect(run(renderDashboardMtdnaPanelPresentation)).toEqual({...old,html:expectedMtdnaPanelHTML(old.html)});
 });
 for(const field of ['origin','matchedMutations','haplogroup','details'] as const)it('stops at original throwing '+field+' getter',()=>{
  const run=(render:typeof original)=>{const trace:string[]=[];const m=new Proxy(full,{get(target,key,receiver){trace.push(String(key));if(key===field)throw new Error(field);return Reflect.get(target,key,receiver);}});expect(()=>render(m,table,()=>null,null)).toThrow(field);return trace;};expect(run(renderDashboardMtdnaPanelPresentation)).toEqual(run(original));
 });
 for(const [name,mutate]of [
  ['foreign comment',(html:string)=>html.replace('</section>','<!--foreign--></section>')],
  ['foreign evidence attribute',(html:string)=>html.replace('data-mtdna-evidence=""','data-mtdna-evidence="foreign"')],
  ['duplicate evidence attribute',(html:string)=>html.replace('data-mtdna-evidence=""','data-mtdna-evidence="" data-mtdna-evidence=""')],
  ['changed lineage',(html:string)=>html.replace('mtDNA H1','mtDNA foreign')],
  ['duplicate lineage',(html:string)=>html.replace('mtDNA H1','mtDNA H1 H1')],
 ]as const)it('independently rejects current SSR corruption '+name,()=>{const expected=expectedMtdnaPanelHTML(original(full,table,()=>null,null));ports.change=mutate;expect(()=>expect(renderDashboardMtdnaPanelPresentation(full,table,()=>null,null)).toBe(expected)).toThrow();});
 for(const count of [0,1,2])it('preserves original loading text, whitespace and native live-region '+count,()=>{
  const literal=fs.readFileSync(new URL('./fixtures/dashboard-genome-loading-original.txt',import.meta.url),'utf8');const old:string=vm.runInNewContext(literal,{snpCount:count});const now=renderDashboardGenomeLoading(count);const expected='<!--[-->'+old+'<!--]-->';expect(now).toBe(expected);expect(native(now)).toEqual(native(expected));
 });
 it('retains sparse Array-subclass mapping, explicit undefined study and issue chronology',()=>{
  const run=(render:typeof original)=>{
   const trace:string[]=[];class NativeStudies extends Array<MtdnaStudyReader|null|undefined>{}
   const references=new NativeStudies(4);
   references[1]=new Proxy({title:'Typed study',summary:'Summary'},{get(target,key,receiver){trace.push('study.'+String(key));return Reflect.get(target,key,receiver);}});
   references[3]=undefined;
   Object.defineProperty(references,'map',{get(){trace.push('map');return Array.prototype.map;}});
   const evidence={mtdnaEvidenceIssueUrl(){trace.push('issue');return '/issues';}} as GenomeEvidence;
   return {html:render(full,{_meta:{references}},()=>null,evidence),trace};
  };
  const old=run(original),current=run(renderDashboardMtdnaPanelPresentation);
  expect(current).toEqual({...old,html:expectedMtdnaPanelHTML(old.html)});
  expect(mtdnaNativeTree(current.html)).toEqual(mtdnaNativeTree(old.html,true));
  const dom=new JSDOM(current.html);try{expect(dom.window.document.querySelectorAll('article')).toHaveLength(2);expect(dom.window.document.querySelector('summary span')!.textContent).toBe('4 sources');}finally{dom.window.close();}
  const references=new Array<MtdnaStudyReader|null|undefined>(4);references[1]={title:'Typed study'};references[3]=undefined;
  const view=projectDashboardMtdnaPanel(full,{_meta:{references}},()=>null,null);
  expect(view.evidence!.studies.map(study=>study.title)).toEqual(['Typed study','Mitochondrial evidence']);
 });
 it.each(['map','study'] as const)('retains native failure/read termination before issue callback: %s',kind=>{
  const run=(render:typeof original)=>{
   const trace:string[]=[];const references=[new Proxy({title:'Study',summary:'Summary'},{get(target,key,receiver){trace.push('study.'+String(key));if(key==='summary'&&kind==='study')throw Error('study');return Reflect.get(target,key,receiver);}})];
   Object.defineProperty(references,'map',{get(){trace.push('map');if(kind==='map')throw Error('map');return Array.prototype.map;}});
   const evidence={mtdnaEvidenceIssueUrl(){trace.push('issue');return '/issues';}} as GenomeEvidence;
   expect(()=>render(full,{_meta:{references}},()=>null,evidence)).toThrow(kind);expect(trace).not.toContain('issue');return trace;
  };expect(run(renderDashboardMtdnaPanelPresentation)).toEqual(run(original));
 });
 it('retains original entire loading Promise/delegate/domain owner by inverse',()=>{
  const current=fs.readFileSync(new URL('../js/dashboard-widget-renderers.ts',import.meta.url),'utf8');
  expect(current).toContain('needsMtdna ? ensureHaplogroupTable() : Promise.resolve(null)');expect(current).toContain('body.innerHTML = renderDashboardGenomeWidget()');
  expect(current).toContain(".catch(() => { _dashboardGenomeDataLoadPromise = null; });");
 });
 it('contains no authored HTML/event handlers and composes the genuine study child',()=>{
  const source=fs.readFileSync(new URL('../js/components/DashboardMtdnaPanel.svelte',import.meta.url),'utf8');const ast=parse(source);expect(ast).toBeDefined();
  expect(source).not.toMatch(/\son[a-z]+\s*=|\bon:[a-z]+/);expect(source).not.toContain('{@html');expect(source).toContain('<DashboardMtdnaStudy view={study} />');
 });
});
