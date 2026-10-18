import {afterEach,describe,it,expect,vi} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {JSDOM} from 'jsdom';
import {parse} from 'svelte/compiler';
import {renderDashboardGenomeWidgetView} from '../js/dashboard-genome-rows-presentation.js';
import {projectDashboardMtdnaPanel} from '../js/dashboard-mtdna-panel-presentation.js';
import {actionAttributes} from '../js/action-attributes.js';
import {historicalGenomeController,historicalGenomeRows,qualifyCurrentGenomeSources,restoreReviewedGenomeQuickMarkerBoundary,expectedCurrentGenomeTrace} from './helpers/dashboard-genome-review-history.js';
import {expectedGenomeWidgetHTML} from './helpers/dashboard-genome-review-expected.js';
const ports=vi.hoisted(()=>({change:(html:string)=>html}));
const currentPorts=vi.hoisted(()=>({change:(html:string)=>html}));
let serial=0;
function native(html:string):unknown {
 const dom=new JSDOM('',{url:'https://example.invalid/'});try{
  const t=dom.window.document.createElement('template');t.innerHTML=html;
  function walk(n:Node):unknown{const e=n instanceof dom.window.Element?n:null;
   const defaults=e instanceof dom.window.HTMLButtonElement?{type:e.type,disabled:e.disabled,value:e.value,tabIndex:e.tabIndex}
    :e instanceof dom.window.HTMLDetailsElement?{open:e.open,tabIndex:e.tabIndex}
    :e instanceof dom.window.HTMLAnchorElement?{href:e.href,target:e.target,rel:e.rel,tabIndex:e.tabIndex}
    :e instanceof dom.window.HTMLElement?{tabIndex:e.tabIndex}:null;
   return {type:n.nodeType,value:n.nodeValue,tag:e?.tagName??null,namespace:e?.namespaceURI??null,
    attributes:e?[...e.attributes].map(a=>[a.name,a.value,a.namespaceURI,a.prefix]):null,defaults,children:[...n.childNodes].map(walk)};
  }return [...t.content.childNodes].map(walk);
 }finally{dom.window.close();}
}
function capture(kind:string,html:string,props:unknown=null):void{const dir=process.env['GETBASED_DASHBOARD_GENOME_RAW'];if(dir)fs.writeFileSync(path.join(dir,`${serial++}-${kind}.json`),JSON.stringify({kind,html,props,tree:native(html)},null,2),{flag:'wx'});}
vi.mock('../js/components/DashboardGenomeWidget.svelte.html.js',async load=>{
 const actual=await load<typeof import('../js/components/DashboardGenomeWidget.svelte.html.js')>();
 return {renderHTML:(props:Parameters<typeof actual.renderHTML>[0])=>{const raw=actual.renderHTML(props);capture('genuine-compiled',raw,props);return currentPorts.change(raw);}};
});
const original=fs.readFileSync(new URL('./fixtures/dashboard-genome-original-controller.js.txt',import.meta.url),'utf8');
const proposed=historicalGenomeController();
const currentSource=fs.readFileSync(new URL('../js/dashboard-widget-renderers.js',import.meta.url),'utf8');
const panelSource=fs.readFileSync(new URL('./fixtures/dashboard-mtdna-panel-original.txt',import.meta.url),'utf8');
const studySource=fs.readFileSync(new URL('./fixtures/dashboard-mtdna-study-original.txt',import.meta.url),'utf8');
const loadingSource=fs.readFileSync(new URL('./fixtures/dashboard-genome-loading-original.txt',import.meta.url),'utf8');
const escape=(value:unknown)=>value==null?'':String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
interface Owner {renderDashboardGenomeWidget():string}
const profile={evidenceShortLabel:'Strong',relevanceShortLabel:'Direct',scope:'Scope <safe>',context:'Context & safe'};
const catalog={rs1:{category:'first',gene:'Gene',variant:'Variant',references:['https://pubmed.ncbi.nlm.nih.gov/1/?a=<>&b="','not-url','https://pmc.ncbi.nlm.nih.gov/articles/PMC2/'],profile},rs2:{category:'second',gene:'Gene2',references:[],profile:{evidenceShortLabel:'Not graded',relevanceShortLabel:'Unknown'}},rs3:{category:'first',gene:'Gene3',references:['javascript:bad'],profile:{...profile,context:''}}};
interface Options {catalog?:unknown;helpersMissing?:boolean;trace?:string[];panel?:string;document?:Document;completed?:()=>void;failAt?:string;nativeChildren?:boolean}
function owner(source:string,genetics:unknown,options:Options={}):Owner{
 const trace=options.trace??[];
 const helpers:Record<string,(...args:unknown[])=>unknown>={
  dnaStudyReferenceLabel:(ref)=>{trace.push('label');return 'PubMed · '+String(ref);},
  mtdnaEvidenceIssueUrl:()=>{trace.push('mtdna-issue');return 'https://example.invalid/mtdna';},
  newSnpSuggestionIssueUrl:()=>{trace.push('suggest');return 'https://example.invalid/new?a=<>&b="';},
  resolveSnpEvidenceProfile:(entry)=>{trace.push('profile');return Reflect.get(Object(entry),'profile')||profile;},
  snpEvidenceIssueUrl:(id)=>{trace.push('issue:'+String(id));return 'https://example.invalid/'+String(id)+'?a="&b=<x>';},
  snpFindingPresentation:(effect,valence)=>{trace.push('presentation');const tone=effect==='none'?'neutral':valence==='protective'?'protective':valence==='informational'?'trait':'risk';return {tone,shortLabel:tone==='neutral'?'unclassified':tone+' association',rank:tone==='neutral'?99:0};},
  snpFindingRank:()=>{trace.push('rank');return 0;},
 };
 const context={renderBiologyScoresWidget:()=>'',renderDashboardBiologyScoreWidget:()=>'',renderDashboardBiologicalCoherenceWidget:()=>'',state:{importedData:{genetics}},escapeHTML:escape,escapeAttr:escape,
  getDnaModuleFunction:(name:string)=>{trace.push('helper:'+name);if(options.helpersMissing)return null;const callback=helpers[name];return callback?(...args:unknown[])=>{if(options.failAt===name){trace.push('throw:'+name);throw new Error(name);}return callback(...args);}:undefined;},
  getDashboardSnpTableCache:()=>{trace.push('snp-cache');return options.catalog===undefined?catalog:options.catalog;},getDashboardHaplogroupTableCache:()=>{trace.push('mt-cache');return {};},
  getSnpCategoryLabel:(cat:unknown)=>{trace.push('category');return 'Category '+String(cat)+' <safe>';},findGenotypeInfo:()=>{trace.push('genotype');return null;},
  dashboardWidgetActionAttrs:(action:string,attrs:Record<string,unknown>)=>{trace.push('action:'+action);return options.nativeChildren?actionAttributes('dashboard-widget',action,attrs):`data-dashboard-widget-action="${escape(action)}"`+Object.entries(attrs).map(([k,v])=>` data-dashboard-${escape(k)}="${escape(v)}"`).join('');},
  renderDashboardGenomeRows:historicalGenomeRows(html=>ports.change(html)),renderDashboardGenomeWidgetView,projectDashboardMtdnaPanel,
  renderDashboardGenomeLoading:(n:number)=>{trace.push('loading:'+n);return options.nativeChildren?vm.runInNewContext(loadingSource,{snpCount:n}) as string:'<div aria-busy="true">Loading</div>';},
  renderDashboardMtdnaPanelPresentation:(mt:unknown,table:unknown,resolve:()=>unknown,evidence:unknown)=>{
   trace.push('panel');
   if(!options.nativeChildren){resolve();return options.panel??'<section data-existing-panel=""><span>mtDNA</span></section>';}
   const study=vm.runInNewContext('('+studySource+')',{escapeHTML:escape,escapeAttr:escape});
   const panel=vm.runInNewContext('('+panelSource+')',{escapeHTML:escape,escapeAttr:escape,detectMtDNAMismatch:resolve,_dashboardGenomeEvidence:evidence,renderDashboardMtdnaEvidenceStudy:study}) as (mt:unknown,table:unknown,genetics:unknown)=>string;
   return panel(mt,table,genetics);
  },detectMtDNAMismatch:()=>{trace.push('mismatch');return null;},
  createDashboardLabWidgetRenderers:()=>({}),createDashboardRecommendationWidget:()=>({}),
  ensureSNPTable:()=>{trace.push('load-snps');return Promise.resolve({});},ensureHaplogroupTable:()=>{trace.push('load-mtdna');return Promise.resolve({});},loadDnaModule:()=>{trace.push('load-evidence');return Promise.resolve({});},document:options.document??{querySelector:()=>{trace.push('refresh-target');options.completed?.();return null;}},
 };
 const code=source.replace(/^import[\s\S]*?from ['"][^'"]+['"];?\s*$/gm,'').replace(/\bexport /g,'');
 const factory=vm.runInNewContext(code+'\n;createDashboardWidgetRenderers',context) as (deps:Record<string,unknown>)=>Owner;
 return factory({getMobileDashboardMarkers:()=>[],getMobileDashboardInsights:()=>[],getMobileWearableTiles:()=>[],getMobileWearablePriority:()=>[],rerenderDashboardFromWidgetChange:()=>{}});
}
const risk={genotype:'AA',effect:'mild',valence:'risk',note:'Note <safe>'},neutral={genotype:'AA',effect:'none',valence:'neutral',note:''};
const cases:Array<[string,unknown,Options]>=[
 ['missing',null,{}],['empty',{},{}],['risk',{snps:{rs1:risk},source:'Source <safe>',importDate:'2026-10-11'},{}],
 ['all',{snps:{rs1:risk,rs2:{...risk,valence:'protective'},rs3:{...risk,valence:'informational'},rsUnknown:neutral},apoe:'e3/e4',mtdna:{haplogroup:'H'}},{}],
 ['secondary',{snps:{rs2:neutral}},{}],['apoe',{apoe:'e3/<safe>'},{}],['mtdna',{mtdna:{haplogroup:'H'}},{}],
 ['unmatched',{snps:{rsUnknown:{genotype:'',gene:'Gene <safe>',variant:'Variant',note:false,effect:'none'}}},{}],
 ['hostile',{source:'getbased-dashboard-genome-slot-0-end <!--[-->',snps:{rs1:{...risk,gene:'" data-dashboard-genome-action="getbased-dashboard-genome-slot-0-end',note:'<!--foreign--> & <safe>'}},mtdna:{haplogroup:'H'}},{panel:'<section><!--foreign--><span>getbased-dashboard-genome-slot-0-end</span></section>'}],
 ['falsy',{source:0,importDate:false,snps:{rs2:{genotype:0,gene:'Present',note:0,effect:'none'}}},{}],
];
afterEach(()=>{ports.change=html=>html;currentPorts.change=html=>html;});
describe('independently recovered historical Genome exact contracts (all original witnesses)',()=>{
 for(const [name,genetics,options]of cases)it('keeps complete native tree/defaults and callback order '+name,()=>{
  const oldTrace:string[]=[],newTrace:string[]=[];
  const old=owner(original,genetics,{...options,trace:oldTrace}).renderDashboardGenomeWidget();capture('original',old);
  const current=owner(proposed,genetics,{...options,trace:newTrace}).renderDashboardGenomeWidget();capture('candidate',current);
  expect(native(current)).toEqual(native(old));expect(newTrace).toEqual(oldTrace);
 });
 it('preserves mutable reference and source getter/coercion chronology',()=>{
  const runs:string[][]=[];for(const source of [original,proposed]){
   const trace:string[]=[],reference={toString(){trace.push('reference:string');return 'https://pubmed.ncbi.nlm.nih.gov/1/';}},
    data={snps:{rs1:risk},get source(){trace.push('source');return {toString(){trace.push('source:string');return 'Source';}};},get importDate(){trace.push('date');return '2026-10-11';}},
    table={...catalog,rs1:{...catalog.rs1,references:[reference]}};
   const html=owner(source,data,{catalog:table,trace}).renderDashboardGenomeWidget();capture('chronology',html);runs.push(trace);
  }expect(runs[1]).toEqual(runs[0]);expect(runs[0]!.filter(x=>x==='reference:string')).toHaveLength(3);
 });
 for(const field of ['source','importDate','mtdna'])it('preserves throwing getter sequence '+field,()=>{
  const runs:string[][]=[];for(const source of [original,proposed]){
   const trace:string[]=[],data=new Proxy({snps:{rs1:risk}},{get(target,key,receiver){trace.push(String(key));if(key===field)throw new Error(field);return Reflect.get(target,key,receiver);}});
   expect(()=>owner(source,data,{trace}).renderDashboardGenomeWidget()).toThrow(field);runs.push(trace);
  }expect(runs[1]).toEqual(runs[0]);
 });
 it('retains loading return and exact asynchronous load ordering',async()=>{
  const runs:string[][]=[];for(const source of [original,proposed]){const trace:string[]=[];let done:()=>void=()=>{};const completed=new Promise<void>(resolve=>{done=resolve;});const html=owner(source,{snps:{rs1:risk}},{catalog:null,helpersMissing:true,trace,completed:done}).renderDashboardGenomeWidget();capture('loading',html);await completed;runs.push(trace);}expect(runs[1]).toEqual(runs[0]);expect(runs[0]).toContain('load-snps');expect(runs[0]).toContain('load-evidence');
 });
 for(const callback of ['resolveSnpEvidenceProfile','snpFindingPresentation','snpFindingRank','snpEvidenceIssueUrl','dnaStudyReferenceLabel','newSnpSuggestionIssueUrl'])it('retains callback throw chronology '+callback,()=>{
  const traces:string[][]=[];for(const source of [original,proposed]){const trace:string[]=[];expect(()=>owner(source,{snps:{rs1:risk}},{trace,failAt:callback}).renderDashboardGenomeWidget()).toThrow(callback);traces.push(trace);}expect(traces[1]).toEqual(traces[0]);
 });
 it('has no authored raw injection/event handlers',()=>{
  const ast=parse(fs.readFileSync(new URL('../js/components/DashboardGenomeRows.svelte',import.meta.url),'utf8'),{modern:true});
  function visit(v:unknown):void{if(!v||typeof v!=='object')return;const n=v as Record<string,unknown>;expect(n.type).not.toBe('HtmlTag');expect(n.type).not.toBe('EventDirective');if(n.type==='Attribute')expect(String(n.name)).not.toMatch(/^on(?::|[a-z])/i);for(const c of Object.values(n))if(Array.isArray(c))c.forEach(visit);else visit(c);}visit(ast);
 });
 for(const [name,mutate]of [
  ['unknown marker',(s:string)=>s.replace('<!--[-->','<!--unknown-->')],['missing marker',(s:string)=>s.replace('<!--]-->','')],['extra comment',(s:string)=>s+'<!---->'],
  ['missing slot',(s:string)=>s.replace('getbased-dashboard-genome-slot-0-end','gone')],['duplicate slot',(s:string)=>s.replace('getbased-dashboard-genome-slot-0-end','getbased-dashboard-genome-slot-0-end getbased-dashboard-genome-slot-0-end')],['root',(s:string)=>s.replace('class="db-genome-list"','class="foreign"')],
 ]as const)it('rejects private skeleton corruption '+name,()=>{ports.change=mutate;expect(()=>owner(proposed,{snps:{rs1:risk}}).renderDashboardGenomeWidget()).toThrow(/Unqualified/);});
});

function expectedTrace(trace:string[],markup:string):string[]{
 return expectedCurrentGenomeTrace(trace,{
  actions:[...markup.matchAll(/data-dashboard-widget-action="ask-genome-snp"/g)].length,
  panels:[...markup.matchAll(/<section class="db-mtdna-panel"/g)].length,
  loading:markup.includes('class="db-genome-empty db-genome-loading"')?1:0,
 });
}
function compareCurrent(genetics:unknown,options:Options={}):{expected:string;actual:string;oldTrace:string[];newTrace:string[]}{
 const oldTrace:string[]=[],newTrace:string[]=[];
 const nativeHTML=owner(original,genetics,{...options,nativeChildren:true,trace:oldTrace}).renderDashboardGenomeWidget();
 const actual=owner(currentSource,genetics,{...options,nativeChildren:true,trace:newTrace}).renderDashboardGenomeWidget();
 const expected=expectedGenomeWidgetHTML(nativeHTML);
 capture('independent-native-current-reference',nativeHTML);capture('genuine-current',actual);
 expect(actual).toBe(expected);
 expect(native(actual)).toEqual(native(expected));
 expect(newTrace).toEqual(expectedTrace(oldTrace,nativeHTML));
 return{expected,actual,oldTrace,newTrace};
}
describe('genuine current Genome Widget/Rows/mtDNA composition against complete immutable native contracts',()=>{
 it('pins all original inputs/recovered bytes and the exact authored/compiled current SDK composition',()=>{qualifyCurrentGenomeSources();});
 for(const [name,genetics,options]of cases)it('executes the genuine current composition with full raw HTML/default/attribute/action and operation parity: '+name,()=>{
  const input=name==='hostile'?{...(genetics as Record<string,unknown>),mtdna:{haplogroup:'H " <safe> & getbased-dashboard-genome-slot-0-end',origin:'<!--foreign--> & <script>literal</script>',source:'getbased-dashboard-genome-slot-0-end',details:'<section>literal</section>',coupling:{shortLabel:'<safe>',label:'" &',climate:'<!--foreign-->'}}}:genetics;
  const result=compareCurrent(input,options);
  if(name==='hostile'){
   expect(result.actual).not.toContain('<script>');expect(result.actual).not.toContain('<!--foreign-->');
   const dom=new JSDOM(result.actual);try{expect(dom.window.document.querySelector('.db-mtdna-panel')!.getAttribute('data-mtdna-haplogroup')).toBe('H " <safe> & getbased-dashboard-genome-slot-0-end');}finally{dom.window.close();}
  }
 });
 it('retains exact mutable reference/source coercion chronology in the genuine current projector',()=>{
  const run=(source:string)=>{
   const trace:string[]=[],reference={toString(){trace.push('reference:string');return 'https://pubmed.ncbi.nlm.nih.gov/1/';}},
    input={snps:{rs1:risk},get source(){trace.push('source');return{toString(){trace.push('source:string');return 'Source';}};},get importDate(){trace.push('date');return '2026-10-11';}},
    table={...catalog,rs1:{...catalog.rs1,references:[reference]}};
   return{html:owner(source,input,{catalog:table,trace,nativeChildren:true}).renderDashboardGenomeWidget(),trace};
  };
  const before=run(original),actual=run(currentSource);
  expect(actual.html).toBe(expectedGenomeWidgetHTML(before.html));expect(native(actual.html)).toEqual(native(expectedGenomeWidgetHTML(before.html)));
  expect(actual.trace).toEqual(expectedTrace(before.trace,before.html));expect(actual.trace.filter(value=>value==='reference:string')).toHaveLength(3);
 });
 for(const field of ['source','importDate','mtdna'])it('retains genuine current first failure and every getter/helper read: '+field,()=>{
  const run=(source:string)=>{const trace:string[]=[];const input=new Proxy({snps:{rs1:risk}},{get(target,key,receiver){trace.push(String(key));if(key===field)throw Error(field);return Reflect.get(target,key,receiver);}});
   expect(()=>owner(source,input,{trace,nativeChildren:true}).renderDashboardGenomeWidget()).toThrow(field);return trace;};
  const before=run(original),actual=run(currentSource);
  expect(actual).toEqual(expectedCurrentGenomeTrace(before,{actions:field==='mtdna'?0:1,panels:0,loading:0}));
 });
 it('retains genuine loading content, live region and exact completed asynchronous load chronology',async()=>{
  const run=async(source:string)=>{const trace:string[]=[];let done:()=>void=()=>{};const completed=new Promise<void>(resolve=>{done=resolve;});
   const html=owner(source,{snps:{rs1:risk}},{catalog:null,helpersMissing:true,nativeChildren:true,trace,completed:done}).renderDashboardGenomeWidget();
   await completed;return{html,trace};};
  const before=await run(original),actual=await run(currentSource);
  expect(actual.html).toBe(expectedGenomeWidgetHTML(before.html));expect(native(actual.html)).toEqual(native(expectedGenomeWidgetHTML(before.html)));
  expect(actual.trace).toEqual(expectedTrace(before.trace,before.html));expect(actual.trace).toContain('load-snps');expect(actual.trace).toContain('load-evidence');expect(actual.trace).toContain('refresh-target');
 });
 for(const callback of ['resolveSnpEvidenceProfile','snpFindingPresentation','snpFindingRank','snpEvidenceIssueUrl','dnaStudyReferenceLabel','newSnpSuggestionIssueUrl'])it('retains genuine current callback throw boundary/chronology: '+callback,()=>{
  const run=(source:string)=>{const trace:string[]=[];expect(()=>owner(source,{snps:{rs1:risk}},{trace,nativeChildren:true,failAt:callback}).renderDashboardGenomeWidget()).toThrow(callback);return trace;};
  const before=run(original),actual=run(currentSource);
  expect(actual).toEqual(expectedCurrentGenomeTrace(before,{actions:callback==='newSnpSuggestionIssueUrl'?1:0,panels:0,loading:0}));
 });
 for(const [name,mutate]of [
  ['unknown SDK marker',(s:string)=>s.replace('<!--[-->','<!--unknown-->')],
  ['missing SDK marker',(s:string)=>s.replace('<!--]-->','')],
  ['extra foreign comment',(s:string)=>s+'<!---->'],
  ['changed root',(s:string)=>s.replace('class="db-genome-list"','class="foreign"')],
  ['changed public action',(s:string)=>s.replace('data-dashboard-widget-action="ask-genome-snp"','data-dashboard-widget-action="navigate"')],
  ['changed public rsid',(s:string)=>s.replace('data-dashboard-widget-rsid="rs1"','data-dashboard-widget-rsid="rsForeign"')],
  ['changed button default',(s:string)=>s.replace('type="button"','type="submit"')],
  ['changed visible gene',(s:string)=>s.replace('<strong>rs1</strong>','<strong>Foreign</strong>')],
  ['different raw entity with same DOM',(s:string)=>s.replace('&amp;','&#38;')],
 ]as const)it('independently rejects actual genuine-current serializer corruption: '+name,()=>{
  const nativeHTML=owner(original,{snps:{rs1:risk}},{nativeChildren:true}).renderDashboardGenomeWidget();
  const expected=expectedGenomeWidgetHTML(nativeHTML);
  currentPorts.change=raw=>{const changed=mutate(raw);expect(changed).not.toBe(raw);return changed;};
  const corrupted=owner(currentSource,{snps:{rs1:risk}},{nativeChildren:true}).renderDashboardGenomeWidget();
  expect(()=>expect(corrupted).toBe(expected)).toThrow();
  if(name==='different raw entity with same DOM')expect(native(corrupted)).toEqual(native(expected));
  else expect(()=>expect(native(corrupted)).toEqual(native(expected))).toThrow();
 });
 it.each(['extra','missing','reordered'] as const)('rejects actual projector live-callback corruption without changing the actual trace: %s',kind=>{
  const beforeTrace:string[]=[];const nativeHTML=owner(original,{snps:{rs1:risk}},{trace:beforeTrace,nativeChildren:true}).renderDashboardGenomeWidget();
  let changed=currentSource;
  if(kind==='extra')changed=changed.replace('const snpTable = getDashboardSnpTableCache();','getDashboardHaplogroupTableCache();\nconst snpTable = getDashboardSnpTableCache();');
  else if(kind==='missing')changed=changed.replace('const haplogroupTable = getDashboardHaplogroupTableCache();','const haplogroupTable = {};');
  else changed=changed.replace(/const snpTable = getDashboardSnpTableCache\(\);\s*const haplogroupTable = getDashboardHaplogroupTableCache\(\);/,'const haplogroupTable = getDashboardHaplogroupTableCache();\nconst snpTable = getDashboardSnpTableCache();');
  expect(changed).not.toBe(currentSource);const actualTrace:string[]=[];
  owner(changed,{snps:{rs1:risk}},{trace:actualTrace,nativeChildren:true}).renderDashboardGenomeWidget();
  expect(()=>expect(actualTrace).toEqual(expectedTrace(beforeTrace,nativeHTML))).toThrow();
 });
 it('the expected-only native grammar rejects foreign native elements, actions and attributes',()=>{
  const originalHTML=owner(original,{snps:{rs1:risk}},{nativeChildren:true}).renderDashboardGenomeWidget();
  for(const changed of [originalHTML+'<!--foreign-->',originalHTML.replace('class="db-genome-list"','class="foreign"'),originalHTML.replace('data-dashboard-widget-action="ask-genome-snp"','data-dashboard-widget-action="navigate"'),originalHTML.replace('type="button"','type="submit"')]){
   expect(changed).not.toBe(originalHTML);expect(()=>expectedGenomeWidgetHTML(changed)).toThrow();
  }
 });
});

it.each(['missing injection','wrong owner','changed Genome body','foreign bytes'] as const)('rejects altered current Genome composition before its original source pin: %s',mutation=>{
 const source=fs.readFileSync('js/dashboard-widget-renderers.ts','utf8');
 const changed=mutation==='missing injection'?source.replace('  }, quickMarkers);','  });'):
  mutation==='wrong owner'?source.replace("'./dashboard-quick-marker-core.js'","'./state.js'"):
  mutation==='changed Genome body'?source.replace('return renderDashboardGenomeWidgetView(projectDashboardGenomeWidget());','return "foreign";'):source+'\n// foreign';
 expect(changed).not.toBe(source);expect(()=>restoreReviewedGenomeQuickMarkerBoundary(changed)).toThrow();
});
