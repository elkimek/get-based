import {expectedDnaPreviewHTML,dnaPreviewNativeTree} from './helpers/dna-preview-owned-receipts.js';
import {afterEach,beforeEach,describe, expect, it,vi} from 'vitest';
import {escapeHTML} from './fixtures/mtdna-preview-escape.js';
vi.mock('../js/utils.js',()=>({escapeHTML,escapeAttr:escapeHTML}));
vi.mock('../js/state.js',()=>({state:{importedData:{}}}));
import type {PendingDnaImport} from '../js/dna-runtime.js';
const compiledMutation=vi.hoisted(()=>({apply:(html:string)=>html}));
vi.mock('../js/components/DnaImportPreview.svelte.html.js',async importOriginal=>{
 const actual=await importOriginal<typeof import('../js/components/DnaImportPreview.svelte.html.js')>();
 return {renderHTML:(props:Parameters<typeof actual.renderHTML>[0])=>compiledMutation.apply(actual.renderHTML(props))};
});
afterEach(()=>{compiledMutation.apply=html=>html;});
const ports=vi.hoisted(()=>({pending:vi.fn(),ensure:vi.fn<()=>HTMLElement>(),open:vi.fn(),close:vi.fn()}));
vi.mock('../js/dna-runtime.js',()=>({setPendingDnaImport:ports.pending,ensureDnaModalOverlay:ports.ensure,loadGeneticsStylesheetForAction:vi.fn(),clearPendingDnaImport:vi.fn(),navigateDnaRoute:vi.fn()}));
vi.mock('../js/modal-lifecycle.js',()=>({openModalOverlay:ports.open,closeModalOverlay:ports.close}));
vi.mock('../js/dna-manual-presentation.js',()=>({renderManualSnpDialog:vi.fn()}));
vi.mock('../js/dna-mtdna.js',()=>({detectMtDNAMismatch:vi.fn()}));
import {JSDOM} from 'jsdom';
import fs from 'node:fs';
import {parse} from 'svelte/compiler';
import {projectDnaImportPreview,renderDnaImportPreview,type DnaPreviewInput,type DnaPreviewFinding} from '../js/dna-preview-presentation.js';
import {snpFindingPresentation,resolveSnpEvidenceProfile} from '../js/dna-evidence.js';
import {originalDnaPreview} from './fixtures/dna-preview-original.js';
function finding(valence:string):DnaPreviewFinding {
 const data={rsid:'rs1801133',gene:'Gene <safe>',variant:'A & B',category:'nutrition',genotype:'CC',effect:'mild',valence,note:'Note <script>safe</script>'};
 return {...data,presentation:snpFindingPresentation(data.effect,data.valence),evidenceProfile:resolveSnpEvidenceProfile(data,data)};
}
function input():DnaPreviewInput{return {source:()=>'<file>&',stats:'2 SNPs scanned',apoe:null,groups:[[finding('risk')],[finding('protective')],[finding('informational')],[finding('neutral')]],categoryLabel:()=>'<category>',importCount:()=>4};}
function nodes(html:string){const dom=new JSDOM(html);return {dom,document:dom.window.document};}
function authored(value:unknown,out:string[]=[]):string[]{
 if(!value||typeof value!=='object')return out;
 const node=value as {type?:string;name?:string};
 if(node.type==='HtmlTag'||node.type==='OnDirective'||node.type==='EventHandler'||node.type==='Attribute'&&/^on/i.test(node.name||''))out.push(node.name||node.type!);
 for(const child of Object.values(value))if(Array.isArray(child))child.forEach(v=>authored(v,out));else authored(child,out);
 return out;
}
describe('complete autosomal preview presentation',()=>{
 it('preserves all four native groups, original element attributes/text and omitted button type',()=>{
  const originalMarkup=originalDnaPreview(input()),actual=renderDnaImportPreview(input());expect(actual).toBe(expectedDnaPreviewHTML(originalMarkup));expect(dnaPreviewNativeTree(actual)).toEqual(dnaPreviewNativeTree(originalMarkup,true));const a=nodes(originalMarkup),b=nodes(actual);
  const elements=(d:Document)=>[...d.querySelectorAll('body *')].map(e=>[e.tagName,[...e.attributes].map(a=>[a.name,a.value]),e.textContent]);
  expect(elements(b.document)).toEqual(elements(a.document));
  expect([...b.document.querySelectorAll('button')].map(b=>[b.type,b.dataset.dnaAction,b.disabled])).toEqual([['submit','close-preview',false],['submit','confirm-import',false]]);
  expect(b.document.querySelectorAll('.dna-preview-group')).toHaveLength(4);
  expect(b.document.querySelectorAll('.dna-preview-assessment')).toHaveLength(3);
  expect(b.document.querySelector('.dna-preview-collapsible')!.getAttribute('tabindex')).toBe('0');
  expect(b.document.querySelector('script')).toBeNull();a.dom.window.close();b.dom.window.close();
 });
 it('preserves empty groups and optional APOE without inventing a disabled or typed action',()=>{
  const i=input();i.groups=[[],[],[],[]];i.apoe='ε3/ε4';const originalMarkup=originalDnaPreview(i),actual=renderDnaImportPreview(i);expect(actual).toBe(expectedDnaPreviewHTML(originalMarkup));expect(dnaPreviewNativeTree(actual)).toEqual(dnaPreviewNativeTree(originalMarkup,true));const a=nodes(originalMarkup),b=nodes(actual);
  expect(b.document.body.textContent).toBe(a.document.body.textContent);
  expect(b.document.querySelectorAll('.dna-preview-group')).toHaveLength(0);
  expect(b.document.querySelector('.dna-preview-apoe')!.textContent).toBe('APOE Haplotype: ε3/ε4');
  expect(b.document.querySelector('button')!.hasAttribute('type')).toBe(false);a.dom.window.close();b.dom.window.close();
 });
 it('retains category/read/string coercion chronology versus the original extracted renderer',()=>{
  const trace:string[]=[];const i=input();i.source=()=>{trace.push('source');return {toString(){trace.push('source-string');return 'file';}};};i.categoryLabel=category=>{trace.push('category:'+String(category));return 'Other';};i.importCount=()=>{trace.push('count');return { [Symbol.toPrimitive](hint:string){trace.push('hint:'+hint);return 4;}};};
  originalDnaPreview(i);const original=[...trace];trace.length=0;projectDnaImportPreview(i);expect(trace).toEqual(original);
 });
 it('never reads assessment or note for collapsed calls',()=>{
  const i=input(),row=finding('neutral');Object.defineProperty(row,'note',{get(){throw new Error('unused note');}});Object.defineProperty(row,'evidenceProfile',{get(){throw new Error('unused assessment');}});i.groups=[[],[],[],[row]];
  expect(()=>projectDnaImportPreview(i)).not.toThrow();expect(()=>originalDnaPreview(i)).not.toThrow();
 });
 it('keeps String(Symbol) text semantics but rejects Symbol template interpolation at final count',()=>{
  const i=input();i.source=()=>Symbol('safe');expect(projectDnaImportPreview(i).source).toBe('Symbol(safe)');i.importCount=()=>Symbol('count');expect(()=>projectDnaImportPreview(i)).toThrow(TypeError);expect(()=>originalDnaPreview(i)).toThrow(TypeError);
 });
 it('propagates getter failures before producing output and never reads later count',()=>{
  const i=input();let count=false;i.source=()=>{throw new Error('source failed');};i.importCount=()=>{count=true;return 1;};expect(()=>renderDnaImportPreview(i)).toThrow('source failed');expect(count).toBe(false);
 });
 it('renders hostile private-token/comment literals without rescanning or collision throws',()=>{
  const i=input();i.source=()=> 'gb-snp-preview-slot-0-end <!--[0-->';i.apoe='gb-snp-preview-slot-2-end';i.categoryLabel=()=> 'gb-snp-preview-slot-4-end';i.groups.forEach(group=>group.forEach(row=>{row.gene='gb-snp-preview-slot-0-end';row.note='<!--]--> gb-snp-preview-slot-1-end';}));
  const originalMarkup=originalDnaPreview(i),actual=renderDnaImportPreview(i);expect(actual).toBe(expectedDnaPreviewHTML(originalMarkup));expect(dnaPreviewNativeTree(actual)).toEqual(dnaPreviewNativeTree(originalMarkup,true));
 });
 for(const [name,mutate] of [
  ['changed root',(html:string)=>html.replace('class="modal dna-preview-modal"','class="foreign"')],
  ['unknown marker',(html:string)=>html.replace('<!--[0-->','<!--[9-->')],
  ['missing marker',(html:string)=>html.replace('<!--]-->','')],
  ['extra marker',(html:string)=>html.replace('<!--[-->','<!--[--><!--foreign-->')],
  ['changed source',(html:string)=>html.replace('DNA Import — &lt;file>&amp;','DNA Import — foreign')],
  ['changed import count',(html:string)=>html.replace('Import 4 SNPs','Import 5 SNPs')],
  ['same-DOM attribute quotes',(html:string)=>html.replace('role="dialog"',"role='dialog'")],
  ['same-DOM text entity',(html:string)=>html.replace('Cancel','C&#97;ncel')],
 ] as const)it(`independently rejects complete actual SSR corruption: ${name}`,()=>{
  const originalMarkup=originalDnaPreview(input());compiledMutation.apply=mutate;const actual=renderDnaImportPreview(input());
  expect(()=>expect(actual).toBe(expectedDnaPreviewHTML(originalMarkup))).toThrow();
  if(name.startsWith('same-DOM'))expect(dnaPreviewNativeTree(actual)).toEqual(dnaPreviewNativeTree(originalMarkup,true));
  else expect(dnaPreviewNativeTree(actual)).not.toEqual(dnaPreviewNativeTree(originalMarkup,true));
 });
 for(let mask=0;mask<16;mask++)for(const apoe of [null,'ε3/ε4'])it(`preserves full native empty/each/APOE branches ${mask}/${apoe}`,()=>{
  const i=input();const take=(index:number)=>mask&(1<<index)?[...i.groups[index]!,...i.groups[index]!]:[];i.groups=[take(0),take(1),take(2),take(3)];i.apoe=apoe;
  const originalMarkup=originalDnaPreview(i),actual=renderDnaImportPreview(i);expect(actual).toBe(expectedDnaPreviewHTML(originalMarkup));expect(dnaPreviewNativeTree(actual)).toEqual(dnaPreviewNativeTree(originalMarkup,true));
 });
 for(const value of ['<script>foreign()</script> &amp; &quot; &#39; < > " \' <!--]--> gb-snp-preview-slot-0-end','\u0000\r\n\ud800 α🧬'])it('keeps exact independent text/class contexts '+JSON.stringify(value),()=>{
  const i=input();i.source=()=>value;i.stats=value;i.apoe=value;i.categoryLabel=()=>value;
  for(const group of i.groups)for(const row of group){row.gene=value;row.variant=value;row.genotype=value;row.note=value;row.evidenceProfile={...row.evidenceProfile,evidenceShortLabel:value,relevanceShortLabel:value};Object.defineProperties(row.evidenceProfile,{evidenceLevel:{value},relevanceLevel:{value}});}
  const originalMarkup=originalDnaPreview(i),actual=renderDnaImportPreview(i);expect(actual).toBe(expectedDnaPreviewHTML(originalMarkup));expect(dnaPreviewNativeTree(actual)).toEqual(dnaPreviewNativeTree(originalMarkup,true));
  const dom=nodes(actual);try{expect(dom.document.querySelector('script,[onload],[onclick]')).toBeNull();}finally{dom.dom.window.close();}
 });
 it('preserves public arity and genuine typed component ownership without private reconstruction',()=>{
  expect(projectDnaImportPreview.length).toBe(1);expect(renderDnaImportPreview.length).toBe(1);
  const source=fs.readFileSync(new URL('../js/dna-preview-presentation.ts',import.meta.url),'utf8');expect(source).not.toMatch(/privateMarkup|gb-snp-preview-slot|matchAll|indexOf|escapeHTML|type Slot/);
 });
 it('keeps the preexisting escaped unsafe icon/count boundary explicit, without native-DOM parity claim',()=>{
  const i=input();i.groups[0][0]!.presentation={...i.groups[0][0]!.presentation,icon:'<img src=x onerror="foreign()">'};i.importCount=()=>'<script>foreign()</script>';
  const originalMarkup=originalDnaPreview(i),actual=renderDnaImportPreview(i);expect(()=>expectedDnaPreviewHTML(originalMarkup)).toThrow();
  const a=nodes(originalMarkup),b=nodes(actual);try{expect(a.document.querySelector('script,img')).not.toBeNull();expect(b.document.querySelector('script,img')).toBeNull();expect(b.document.querySelector('.dna-preview-icon')!.textContent).toBe(i.groups[0][0]!.presentation.icon);expect(b.document.querySelector('.import-btn-primary')!.textContent).toBe('Import <script>foreign()</script> SNPs');}finally{a.dom.window.close();b.dom.window.close();}
 });
 it('contains no raw HTML or authored event handlers, including quoted/braced/directive forms',()=>{
  const source=fs.readFileSync(new URL('../js/components/DnaImportPreview.svelte',import.meta.url),'utf8');expect(authored(parse(source,{modern:true}))).toEqual([]);
  for(const h of ['onclick="bad()"','onclick={bad}','on:click={bad}','on:click|preventDefault','{onclick}'])expect(authored(parse(`<button ${h}>x</button>`,{modern:true})).length).toBeGreaterThan(0);
  expect(authored(parse('{@html provider}',{modern:true}))).toEqual(['HtmlTag']);
 });
});

describe('real autosomal preview controller transaction',()=>{
 let dom:JSDOM;
 beforeEach(()=>{vi.resetModules();vi.resetAllMocks();dom=new JSDOM('<div id="dna-modal-overlay"><p>Prior dialog</p></div>');for(const name of ['document','window','Element','HTMLElement','MouseEvent','KeyboardEvent']as const)vi.stubGlobal(name,dom.window[name]);ports.ensure.mockImplementation(()=>dom.window.document.querySelector<HTMLElement>('#dna-modal-overlay')!);});
 afterEach(()=>{dom.window.close();vi.unstubAllGlobals();});
 function pending():PendingDnaImport{return {source:'Synthetic',totalLines:12,matches:{rs1801133:finding('risk')},coverage:{found:1,total:2}};}
 it('binds pending before APOE/stats and commits one overlay write before exact focus policy',async()=>{
  const ui=await import('../js/dna-ui.js'),result=pending(),overlay=dom.window.document.querySelector('#dna-modal-overlay')!;const trace:string[]=[];
  ports.pending.mockImplementation(value=>{expect(value).toBe(result);trace.push('pending');});ui.configureDnaUi({resolveAPOE:()=>{trace.push('apoe');return null;},getSnpCategoryLabel:()=>{trace.push('category');return 'Other';}});
  ports.ensure.mockImplementation(()=>{trace.push('ensure');return overlay as HTMLElement;});ports.open.mockImplementation(()=>{trace.push('open');expect(overlay.querySelector('.dna-preview-note')).not.toBeNull();});
  ui.showDNAImportPreview(result);expect(trace).toEqual(['pending','apoe','category','ensure','open']);expect(dom.window.document.querySelector('#dna-modal-overlay')).toBe(overlay);expect(ports.open).toHaveBeenCalledWith(overlay,{initialFocus:'.import-btn-primary',focusDelay:30,scrollLock:true});
 });
 it('retains pending side effect but leaves prior DOM intact when a late category getter throws',async()=>{
  const ui=await import('../js/dna-ui.js'),result=pending();ui.configureDnaUi({resolveAPOE:()=>null,getSnpCategoryLabel:()=>{throw new Error('category failed');}});
  expect(()=>ui.showDNAImportPreview(result)).toThrow('category failed');expect(ports.pending).toHaveBeenCalledWith(result);expect(ports.ensure).not.toHaveBeenCalled();expect(ports.open).not.toHaveBeenCalled();expect(dom.window.document.querySelector('#dna-modal-overlay')!.innerHTML).toBe('<p>Prior dialog</p>');
 });
 it('excludes APOE calls and preserves curated override singular/plural stats through the real controller',async()=>{
  const ui=await import('../js/dna-ui.js'),result=pending();result.matches.rs429358=finding('risk');result.matches.rs7412=finding('risk');result.rawMatchedCount=1;result.preservedOverrideCount=1;ui.configureDnaUi({resolveAPOE:()=> 'ε3/ε4',getSnpCategoryLabel:()=> 'Other'});
  ui.showDNAImportPreview(result);expect(dom.window.document.querySelectorAll('.dna-preview-row')).toHaveLength(1);expect(dom.window.document.querySelector('.dna-preview-stats')!.textContent).toContain('preserving 1 curated override');result.preservedOverrideCount=2;ui.showDNAImportPreview(result);expect(dom.window.document.querySelector('.dna-preview-stats')!.textContent).toContain('preserving 2 curated overrides');
 });
});
