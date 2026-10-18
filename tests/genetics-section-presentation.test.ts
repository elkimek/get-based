import {afterEach,describe,expect,it,vi} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {JSDOM} from 'jsdom';
import {parse} from 'svelte/compiler';
import * as evidence from '../js/dna-evidence.js';
import {findGenotypeInfo} from '../js/dna-genotype.js';
import {renderGeneticsSectionView,captureGeneticsText,captureGeneticsAction as captureActualGeneticsAction} from '../js/genetics-section-presentation.js';
const ports=vi.hoisted(()=>({change:(s:string)=>s,pristine:''}));
let index=0;
function tree(markup:string):unknown {
  const dom=new JSDOM('');try{
    const t=dom.window.document.createElement('template');t.innerHTML=markup;
    function walk(n:Node):unknown{
      const e=n instanceof dom.window.Element?n:null;
      const native=e instanceof dom.window.HTMLButtonElement?{type:e.type,disabled:e.disabled,value:e.value}
        :e instanceof dom.window.HTMLDetailsElement?{open:e.open,tabIndex:e.tabIndex}
        :e instanceof dom.window.HTMLElement?{tabIndex:e.tabIndex}:null;
      return {type:n.nodeType,value:n.nodeValue,tag:e?.tagName??null,namespace:e?.namespaceURI??null,
        attributes:e?[...e.attributes].map(a=>[a.name,a.value,a.namespaceURI,a.prefix]):null,native,
        children:[...n.childNodes].map(walk)};
    }
    return [...t.content.childNodes].map(walk);
  }finally{dom.window.close();}
}
/** Keep the complete native receipt. Only compiler-owned hydration comments
 * are removed, after their exact values and positions match the pristine SSR
 * result for these same props. Adjacent text is rejoined without trimming. */
function currentTree(markup:string):unknown {
  type ReceiptNode={type:number;value:string|null;children:ReceiptNode[]};
  const actual=tree(markup) as ReceiptNode[],pristine=tree(ports.pristine) as ReceiptNode[];
  function markers(nodes:ReceiptNode[],prefix:number[]=[]):Array<[number[],string|null]>{
    return nodes.flatMap((n,i)=>n.type===8?[[[...prefix,i],n.value] as [number[],string|null]]:markers(n.children,[...prefix,i]));
  }
  const expected=markers(pristine);
  for(const [,value]of expected)if(typeof value!=='string'||!/^(?:\[(?:-1|[0-9]+)?|\]|)$/.test(value))throw new Error('Unqualified Genetics compiler comment');
  expect(markers(actual)).toEqual(expected);
  function native(nodes:ReceiptNode[]):ReceiptNode[]{
    const result:ReceiptNode[]=[];
    for(const n of nodes){
      if(n.type===8)continue;
      const node={...n,children:native(n.children)},previous=result.at(-1);
      if(node.type===3&&previous?.type===3)previous.value=(previous.value??'')+(node.value??'');
      else result.push(node);
    }
    return result;
  }
  return native(actual);
}
function raw(kind:string,markup:string,props:unknown=null):void{
  const dir=process.env['GETBASED_GENETICS_SECTION_RAW'];if(dir)fs.writeFileSync(path.join(dir,`raw-${index++}-${kind}.json`),JSON.stringify({kind,props,markup,tree:tree(markup)},null,2),{flag:'wx'});
}
vi.mock('../js/components/GeneticsSection.svelte.html.js',async load=>{
  const real=await load<typeof import('../js/components/GeneticsSection.svelte.html.js')>();
  return {renderHTML:(props:Parameters<typeof real.renderHTML>[0])=>{const html=real.renderHTML(props);ports.pristine=html;raw('compiled',html,props);return ports.change(html);}};
});
const escapeHTML=(x:unknown)=>x==null?'':String(x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
interface Owner {renderGeneticsSection():string;configureDnaUi(deps:Record<string,unknown>):unknown;toggleGeneticsCollapse():void;toggleGeneticsExpand(button:HTMLElement):void}
const original=fs.readFileSync(new URL('./fixtures/genetics-section-original-controller.js.txt',import.meta.url),'utf8');
function owner(source:string,genetics:unknown,options:{collapsed?:boolean;table?:unknown;mismatch?:unknown;stale?:unknown;trace?:string[];document?:Document}={}):{api:Owner;writes:Array<[string,string]>}{
  const trace=options.trace??[],writes:Array<[string,string]>=[];
  const actions=(action:string,attrs:Record<string,unknown>={})=>{
    trace.push('action:'+action);return `data-dna-action="${escapeHTML(action)}"`+Object.entries(attrs).filter(([,v])=>v!==undefined&&v!==null&&v!=='').map(([k,v])=>` data-dna-${escapeHTML(k)}="${escapeHTML(String(v))}"`).join('');
  };
  const context={state:{importedData:{genetics}},escapeHTML,escapeAttr:escapeHTML,dnaActionAttrs:actions,...evidence,
    renderGeneticsSectionView,captureGeneticsText,
    captureGeneticsAction:(...args:Parameters<typeof captureActualGeneticsAction>)=>{trace.push('action:'+args[0]);return captureActualGeneticsAction(...args);},
    detectMtDNAMismatch:()=>{trace.push('mismatch');return options.mismatch??null;},
    navigateDnaRoute:(r:string)=>trace.push('navigate:'+r),document:options.document,
    localStorage:{getItem:(k:string)=>{trace.push('get:'+k);return options.collapsed?'1':null;},setItem:(k:string,v:string)=>writes.push([k,v])},
  };
  const code=source.replace(/^import[\s\S]*?from ['"][^'"]+['"];?\s*$/gm,'').replace(/\bexport /g,'');
  const api=vm.runInNewContext(code+'\n;({renderGeneticsSection,configureDnaUi,toggleGeneticsCollapse,toggleGeneticsExpand})',context) as Owner;
  api.configureDnaUi({getSnpTable:()=>{trace.push('table');return options.table===undefined?catalog:options.table;},findGenotypeInfo,
    getSnpCategoryLabels:()=>{trace.push('labels');return {first:'First <category>',second:'Second & category'};},
    geneticsStalenessHint:()=>{trace.push('stale');return options.stale??null;},
    loadSnpTable:()=>{trace.push('load');return Promise.resolve(catalog);}});
  return {api,writes};
}
const candidate=fs.readFileSync(new URL('../js/dna-ui.js',import.meta.url),'utf8');
const call=(valence:string)=>({effect:valence==='risk'?'mild':'none',valence,note:'note <safe>&'});
const catalog:Record<string,unknown>={};
const snps:Record<string,unknown>={};
for(let i=0;i<14;i++){
 const id='rs'+(1000+i),valence=i<10?['risk','protective','informational'][i%3]!:'neutral';
 catalog[id]={gene:'Gene '+i,variant:'Variant '+i,category:i<5?'first':'second',references:i%2?['https://pubmed.ncbi.nlm.nih.gov/1/?a="&b=<x>']:[],genotypes:{AA:call(valence)}};
 snps[id]={genotype:'AA',gene:i===0?'Gene <script>safe</script>':undefined};
}
const mt={haplogroup:'H <safe>',origin:'Europe & Asia',source:'lab <safe>',importDate:'2026-10-01',matchedMutations:3,totalDiagnostic:8,details:'Details <safe>',
 coupling:{label:'Coupled',climate:'Cold & temperate',shortLabel:'coupled',description:'Description <safe>',implications:'Implications & safe'}};
const cases:Array<[string,unknown,Parameters<typeof owner>[2]]>=[
 ['missing',null,{}],['empty',{},{}],['mt-only',{mtdna:{haplogroup:'H'}},{}],['mt-full',{mtdna:mt},{mismatch:{mismatch:false,message:'Matches & source'}}],
 ['mismatch-significant',{mtdna:mt},{mismatch:{mismatch:true,severity:'significant',message:'Mismatch <safe>'}}],
 ['mismatch-moderate',{mtdna:mt},{mismatch:{mismatch:true,severity:'moderate',message:'Moderate'}}],
 ['single',{source:'file',snps:{rs1000:snps.rs1000}},{}],['all',{source:'raw <file>',importDate:'2026-10-02',snps,mtdna:mt,coverage:{found:10,total:20}},{stale:'Stale <safe>&'}],
 ['collapsed',{source:'raw',snps},{collapsed:true}],['no-catalog-match',{snps:{rs999999:{genotype:'CC'}}},{}],
 ['apoe',{snps,apoe:'ε3/ε4',mtdna:mt},{}],['bad-coverage',{snps,coverage:{found:'bad',total:0}},{}],
 ['legacy-date-raw',{mtdna:{haplogroup:'H'},importDate:'<b data-legacy-date="true">date</b>'},{}],
 ['private-literals',{source:'getbased-genetics-private-slot-0-end <!--[--> \n',snps,mtdna:{...mt,details:'getbased-genetics-private-slot-1-end'}},{stale:'<!--]--> private'}],
];
afterEach(()=>{ports.change=s=>s;});
describe('complete Genetics section original native contract',()=>{
 for(const [name,genetics,options]of cases)it('preserves whole native tree/defaults/read chronology '+name,()=>{
   const oldTrace:string[]=[],newTrace:string[]=[];
   const old=owner(original,genetics,{...options,trace:oldTrace}).api.renderGeneticsSection();raw('original',old);
   const current=owner(candidate,genetics,{...options,trace:newTrace}).api.renderGeneticsSection();raw('candidate',current);
   if(name==='legacy-date-raw'){
     // Imported dates are data: the genuine component displays this formerly
     // interpolated HTML literally. Every other native node remains exact.
     const literal='<b data-legacy-date="true">date</b>';
     expect(old.split(literal)).toHaveLength(2);
     expect(currentTree(current)).toEqual(tree(old.replace(literal,escapeHTML(literal))));
     const dom=new JSDOM(current);try{expect(dom.window.document.querySelector('[data-legacy-date]')).toBeNull();expect(dom.window.document.querySelector('.section-meta')!.textContent).toContain(literal);}finally{dom.window.close();}
   }else expect(currentTree(current)).toEqual(tree(old));
   expect(newTrace).toEqual(oldTrace);
 });
 it('preserves missing-catalog async navigation and exact empty return',async()=>{
   for(const source of [original,candidate]){const trace:string[]=[];const api=owner(source,{snps},{table:null,trace}).api;const html=api.renderGeneticsSection();raw('loading',html);expect(html).toBe('');await Promise.resolve();expect(trace).toEqual(['table','load','navigate:dashboard']);}
 });
 it('preserves getter/string/Number coercions and late exceptions atomically',()=>{
   for(const failing of [false,true]){
     const traces:string[][]=[];
     for(const source of [original,candidate]){
       const trace:string[]=[],g={snps,coverage:{found:{valueOf(){trace.push('found');return 4;}},total:{valueOf(){trace.push('total');return 20;}}},
         get source(){trace.push('source');return {toString(){trace.push('source:string');return '<source>';}};},
         get importDate(){trace.push('date');if(failing)throw new Error('date failed');return '2026-10-01';}};
       const render=()=>owner(source,g,{trace}).api.renderGeneticsSection();
       if(failing)expect(render).toThrow('date failed');else {const dom=new JSDOM(render());try{expect(dom.window.document.querySelector('.section-meta')!.textContent).toContain('<source>');expect(dom.window.document.querySelector('source')).toBeNull();}finally{dom.window.close();}}traces.push(trace);
     }
     expect(traces[1]).toEqual(traces[0]);
   }
 });
 it('retains collapse storage and expansion without domain writes',()=>{
   for(const source of [original,candidate]){
     const dom=new JSDOM('');try{const {api,writes}=owner(source,{snps},{document:dom.window.document});dom.window.document.body.innerHTML=api.renderGeneticsSection();
       api.toggleGeneticsCollapse();expect(writes).toEqual([['labcharts-genetics-collapsed','1']]);expect(dom.window.document.querySelector('.genetics-body')!.classList.contains('hidden')).toBe(true);
       const button=dom.window.document.querySelector<HTMLElement>('.genetics-show-all')!;api.toggleGeneticsExpand(button);expect(dom.window.document.querySelector('.genetics-findings')!.classList.contains('expanded')).toBe(true);
     }finally{dom.window.close();}
   }
 });
 it('has no authored raw HTML or event attributes/directives',()=>{
   const ast=parse(fs.readFileSync(new URL('../js/components/GeneticsSection.svelte',import.meta.url),'utf8'),{modern:true});
   function visit(v:unknown):void{if(!v||typeof v!=='object')return;const n=v as Record<string,unknown>;expect(n.type).not.toBe('HtmlTag');expect(n.type).not.toBe('EventDirective');if(n.type==='Attribute')expect(String(n.name)).not.toMatch(/^on(?::|[a-z])/i);for(const x of Object.values(n))if(Array.isArray(x))x.forEach(visit);else visit(x);}visit(ast);
 });
 for(const [name,mutate]of [
   ['unknown root marker',(s:string)=>s.replace('<!--[-->','<!--unknown-->')],
   ['missing marker',(s:string)=>s.replace('<!--]-->','')],
   ['extra comment',(s:string)=>s+'<!---->'],
   ['private value missing',(s:string)=>s.replace('getbased-genetics-private-slot-0-end','gone')],
   ['duplicate slot',(s:string)=>s.replace('getbased-genetics-private-slot-0-end','getbased-genetics-private-slot-0-end getbased-genetics-private-slot-0-end')],
   ['root classes',(s:string)=>s.replace('class="dashboard-section genetics-section"','class="foreign"')],
 ]as const)it('rejects native receipt corruption '+name,()=>{
   const genetics={snps,source:'getbased-genetics-private-slot-0-end'};
   const expected=owner(original,genetics).api.renderGeneticsSection();
   ports.change=mutate;
   const current=owner(candidate,genetics).api.renderGeneticsSection();
   expect(current).not.toBe(ports.pristine);
   expect(()=>expect(currentTree(current)).toEqual(tree(expected))).toThrow();
 });
});
