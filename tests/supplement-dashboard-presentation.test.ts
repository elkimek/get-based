// @vitest-environment jsdom
import {beforeEach,afterEach,describe,expect,it,vi} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {supplementCases,supplementWitness,nativeSupplementTree,type SupplementCase} from './helpers/supplement-dashboard-witness.js';
import {expectedSupplementReceipt,qualifySupplementGrammar,type SupplementReceipt} from './helpers/supplement-dashboard-expected.js';
import type {MitoEvidenceMatch} from '../js/supplement-warnings.js';
import type {SupplementDomainRecord} from '../js/supplement-medication-domain.js';
const fixture=vi.hoisted(()=>({supplements:[] as SupplementDomainRecord[],warnings:[] as MitoEvidenceMatch[],calls:[] as unknown[][],
 loaded:true,load:Promise.resolve(null) as Promise<unknown>}));
vi.mock('../js/state.js',()=>({state:{importedData:{get supplements(){return fixture.supplements;}}}}));
vi.mock('../js/supplement-warnings.js',async importActual=>{
 const actual=await importActual<typeof import('../js/supplement-warnings.js')>();
 return {...actual,hasMitoCompoundData:()=>fixture.loaded,
  preloadMitoCompoundData:()=>{fixture.calls.push(['preload']);return fixture.load;},
  scanSupplementsForWarnings:(rows:unknown)=>{fixture.calls.push(['scan',JSON.parse(JSON.stringify(rows))]);return fixture.warnings;}};
});
beforeEach(()=>{vi.useFakeTimers();vi.setSystemTime(new Date('2024-04-15T12:00:00Z'));fixture.calls=[];fixture.loaded=true;fixture.supplements=[];fixture.warnings=[];document.body.innerHTML='';});
afterEach(()=>{vi.useRealTimers();document.body.innerHTML='';});
function observe(kind:SupplementCase,render:()=>string) {
 const witness=supplementWitness(kind);fixture.supplements=witness.supplements;fixture.warnings=witness.warnings;fixture.calls=[];
 let html:string|null=null,error:unknown=null;
 try {html=render();}catch(e){error=e instanceof Error?{name:e.name,message:e.message}:String(e);}
 return {html,tree:html===null?null:nativeSupplementTree(html,document),trace:witness.trace,error,calls:fixture.calls};
}
import {renderSupplementsSection,askAIMitoContext} from '../js/supplement-dashboard.js';
const original=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/supplement-dashboard-original.json'),'utf8')) as Record<SupplementCase,SupplementReceipt>;
qualifySupplementGrammar();
describe('complete native supplement dashboard presentation',()=>{
 it.each(supplementCases)('preserves complete qualified HTML/tree/defaults and exact original helper/getter chronology: %s',kind=>{
  const actual=observe(kind,renderSupplementsSection);expect(actual).toEqual(expectedSupplementReceipt(kind,original[kind],document));
  expect(actual.trace).toEqual(original[kind].trace);expect(actual.error).toEqual(original[kind].error);expect(actual.calls).toEqual(original[kind].calls);
 });
 it('retains natural AI context action and the exact 500ms input/focus boundary',()=>{
  document.body.innerHTML='<button aria-label="Ask AI">Ask</button><textarea class="chat-input"></textarea>';
  const button=document.querySelector('button')!,input=document.querySelector('textarea')!,calls:string[]=[];
  button.addEventListener('click',()=>calls.push('ask'));input.addEventListener('input',()=>calls.push('input'));
  askAIMitoContext();expect(calls).toEqual(['ask']);vi.advanceTimersByTime(499);expect(input.value).toBe('');
  vi.advanceTimersByTime(1);expect(calls).toEqual(['ask','input']);expect(document.activeElement).toBe(input);
  expect(input.value).toBe('Review the primary-study mitochondrial evidence matched to my current active supplements and medications. Separate human observations from animal, cell, tissue, and isolated-mitochondria findings; relate exposure to my recorded regimen only when the evidence allows it; do not treat mechanistic findings as proof of benefit or harm, and do not advise stopping prescription medication. Cite each PMID and say clearly when the evidence is insufficient.');
 });
 it('coalesces pending catalog refresh and naturally rerenders the same native section only after successful data load',async()=>{
  let resolve:((value:unknown)=>void)|undefined;fixture.load=new Promise(value=>{resolve=value;});fixture.loaded=false;
  fixture.supplements=supplementWitness('active').supplements;document.body.innerHTML=renderSupplementsSection();
  renderSupplementsSection();expect(fixture.calls.filter(c=>c[0]==='preload')).toHaveLength(1);
  const before=document.querySelector('.supp-timeline-section');fixture.loaded=true;resolve?.([{}]);await vi.waitFor(()=>expect(document.querySelector('.supp-timeline-section')).not.toBe(before));
  expect(document.querySelectorAll('.supp-timeline-section')).toHaveLength(1);expect(document.querySelector('.supp-bar-row')?.getAttribute('data-supp-index')).toBe('0');
 });
});

// These three native raw leaves intentionally become literal data in Svelte.
// Keep explicit live-runtime expectations separate from compiler coordinates.
const literalCollision='gb-supp-direction-class gb-supp-summary <!---->gb-supp-detail<!----> <!--[0-->';
const saferCases={
 'raw-markup':{study:'" data-native-breakout="yes',pmid:'<em>123</em>',search:'" data-search="yes'},
 'raw-unclosed-comment':{study:'https://example.invalid/study',pmid:'<!-- original unclosed comment',search:'https://example.invalid/search'},
 'marker-collision':{study:literalCollision,pmid:literalCollision,search:literalCollision},
}as const;
function assertLiteralEvidence(kind:keyof typeof saferCases,html:string):void {
 const host=document.createElement('template');host.innerHTML=html;const links=[...host.content.querySelectorAll('.supp-mitotox-link')],literal=saferCases[kind];
 expect(links).toHaveLength(3);const first=links[0]!,second=links[1]!;
 expect(first.getAttributeNames()).toEqual(['href','target','rel','class']);expect(first.getAttribute('href')).toBe(literal.study);
 expect(second.getAttributeNames()).toEqual(['href','target','rel','class']);expect(second.getAttribute('href')).toBe(literal.search);
 expect(first.childNodes).toHaveLength(1);expect(first.firstChild!.nodeType).toBe(Node.TEXT_NODE);expect(first.textContent).toBe('Primary study · PMID '+literal.pmid);
 expect(second.textContent).toBe('Related PubMed research');expect(links[2]!.textContent).toBe('Report evidence issue');expect(links[2]!.getAttribute('href')).toMatch(/^https:\/\/github\.com\/elkimek\/get-based\/issues\/new\?/);
 expect(host.content.querySelector('[data-native-breakout],[data-search],em,script,img')).toBeNull();
}
it.each(Object.keys(saferCases)as Array<keyof typeof saferCases>)('%s keeps raw PMID markup/comments and quote-bearing links literal without double escaping',kind=>{
 const actual=observe(kind,renderSupplementsSection);expect(actual.error).toBeNull();assertLiteralEvidence(kind,actual.html!);
 expect(actual.trace).toEqual(original[kind].trace);expect(actual.calls).toEqual(original[kind].calls);
});
it.each(Object.keys(saferCases)as Array<keyof typeof saferCases>)('literal evidence guard rejects reintroduced %s raw interpolation',kind=>{
 const actual=observe(kind,renderSupplementsSection),literal=saferCases[kind].pmid,encoded=literal.replace(/[&<]/g,char=>char==='&'?'&amp;':'&lt;');
 const needle='Primary study · PMID '+encoded;expect(actual.html!.split(needle)).toHaveLength(2);
 const corrupt=actual.html!.replace(needle,'Primary study · PMID '+literal);
 expect(()=>assertLiteralEvidence(kind,corrupt)).toThrow();
 const quoted=actual.html!.replace('class="supp-mitotox-link"','class="supp-mitotox-link" data-native-breakout="yes"');expect(()=>assertLiteralEvidence(kind,quoted)).toThrow();
});
it.each([
 ['root',(html:string)=>html.replace('<!--[-->','')],
 ['branch',(html:string)=>html.replace('<!--[-1-->','<!--[8-->')],
 ['snippet',(html:string)=>html.replace('<!---->','')],
 ['foreign comment',(html:string)=>html+'<!--foreign-->'],
 ['visible label',(html:string)=>html.replace('>Manage<','>Foreign<')],
 ['delegate',(html:string)=>html.replace('data-supp-action="open-editor"','data-supp-action="ask-mito"')],
 ['button default',(html:string)=>html.replace('class="supp-add-btn"','type="button" class="supp-add-btn"')],
 ['attribute encoding',(html:string)=>html.replace('data-supp-index="0"',"data-supp-index='0'")],
 ['namespace',(html:string)=>html.replace('<div class="supp-timeline-section"','<div xmlns="urn:foreign" class="supp-timeline-section"')],
 ['bar geometry',(html:string)=>html.replace('width:100%','width:99%')],
]as const)('complete raw/tree/defaults expectation detects current %s corruption',(_name,corrupt)=>{
 const actual=observe('single',()=>corrupt(renderSupplementsSection())),expected=expectedSupplementReceipt('single',original.single,document);expect(actual.html).not.toBe(expected.html);expect(()=>expect(actual).toEqual(expected)).toThrow();
});

it('complete expected period collection rejects reordered real gap/active/ongoing bars',()=>{
 const actual=observe('gaps',()=>{
  const html=renderSupplementsSection(),pattern=/(<div class="supp-bar supp-bar-supplement" style="left:0.00%;width:0.5%"><\/div>)(<div class="supp-bar-gap" style="left:0.36%;width:0.34%"><\/div>)(<div class="supp-bar supp-bar-supplement supp-bar-ongoing" style="left:0.71%;width:99.29%"><\/div>)/;
  expect(html.match(pattern)).not.toBeNull();return html.replace(pattern,(_whole,first:string,gap:string,last:string)=>last+gap+first);
 });
 expect(()=>expect(actual).toEqual(expectedSupplementReceipt('gaps',original.gaps,document))).toThrow();expect(actual.tree).not.toEqual(expectedSupplementReceipt('gaps',original.gaps,document).tree);
});
