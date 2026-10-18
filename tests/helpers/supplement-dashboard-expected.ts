import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import type {SupplementCase} from './supplement-dashboard-witness.js';
export interface SupplementReceipt {html:string|null;tree:unknown;trace:string[];error:unknown;calls:unknown[][]}
const originalFile='tests/fixtures/supplement-dashboard-original.json';
const originalHash='630f997e9dae2a23372ae8bbc5d3f42a3e0e7565dd65c54e8e07d0b7ad342a4b';
export const supplementGrammarSources={
 'tests/helpers/supplement-dashboard-witness.ts':'e2ab515688df4eea91948264d0c293eb95208761be088bdff9565e6400e180f2',
 'js/components/SupplementTimeline.svelte':'aaa808c403093b1422092c2b27b3064f9b0adef6bd69fb095b89484cfb855b7a',
 'js/components/SupplementTimelineRow.svelte':'5cac4b1f806ea8095176addfe337158588ce4844502472cdb4755d8121644269',
 'js/components/SupplementTimelineBar.svelte':'10c8ee4df1f685a6ef4bc9bdf0f51948ecd1ce1993673d08de0f5c2cffdd05bc',
 'js/components/SupplementMitoEvidence.svelte':'85f7c7990c688fcfb6fbf84cf7209361c397db564de4dd1a9d68b622ce7f0a11',
 'js/supplement-dashboard-presentation.ts':'243df0fa0ac61556b250f06ae3a89a3ddd1eb5c7e8bafe7282d0cc1263d7fca2',
}as const;
const read=(file:string)=>readFileSync(file,'utf8');
const sha=(source:string)=>createHash('sha256').update(source).digest('hex');
export function qualifySupplementGrammar(reader=read):void {
 assert.equal(sha(reader(originalFile)),originalHash,'Immutable complete original Supplement receipts');
 for(const[file,hash]of Object.entries(supplementGrammarSources))assert.equal(sha(reader(file)),hash,'Complete qualified Supplement owner/witness: '+file);
 const lock=JSON.parse(reader('package-lock.json'))as{packages:Record<string,{version?:string}>};assert.equal(lock.packages['node_modules/svelte']?.version,'5.57.1','Qualified Supplement compiler coordinates');
}
const text=(value:string)=>value.replace(/[&<]/g,c=>c==='&'?'&amp;':'&lt;');
const attr=(value:string)=>value.replace(/[&<"]/g,c=>c==='&'?'&amp;':c==='<'?'&lt;':'&quot;');
const collision='gb-supp-direction-class gb-supp-summary <!---->gb-supp-detail<!----> <!--[0-->';
/** Independent immutable witness values, not current projector/rendered output.
 * These are the only three formerly raw fields; all other leaves retain native
 * contextual decoding/encoding. Every capture must equal these exact values. */
function escapeNativeLinks(kind:SupplementCase,html:string):string {
 const expected=kind==='raw-markup'?['" data-native-breakout="yes','<em>123</em>','" data-search="yes']
  :kind==='raw-unclosed-comment'?['https://example.invalid/study','<!-- original unclosed comment','https://example.invalid/search']
  :kind==='marker-collision'?[collision,collision,collision]:['https://example.invalid/study','123','https://example.invalid/search'];
 const pattern=/<div><a href="([\s\S]*?)" target="_blank" rel="noopener" class="supp-mitotox-link">Primary study · PMID ([\s\S]*?)<\/a><a href="([\s\S]*?)" target="_blank" rel="noopener" class="supp-mitotox-link">Related PubMed research<\/a>/g;
 let count=0;
 const result=html.replace(pattern,(_whole:string,study:string,pmid:string,search:string)=>{
  assert.deepEqual([study,pmid,search],expected,'Exactly the independent original raw study/PMID/search witness values');count++;
  return '<div><a href="'+attr(study)+'" target="_blank" rel="noopener" class="supp-mitotox-link">Primary study · PMID '+text(pmid)+'</a><a href="'+attr(search)+'" target="_blank" rel="noopener" class="supp-mitotox-link">Related PubMed research</a>';
 });
 const studies=/ · (\d+) verified stud(?:y|ies)<\/span>/.exec(html);
 assert.equal(count,studies?Number(studies[1]):0,'Every original evidence study has exactly one qualified raw link triple');return result;
}
function receiptTree(html:string,document:Document):unknown {
 const host=document.createElement('template');host.innerHTML=html;
 function node(value:Node):unknown {
  if(value.nodeType!==1)return{type:value.nodeType,text:value.nodeValue};
  const e=value as HTMLElement;
  return{type:1,name:e.localName,namespace:e.namespaceURI,attributes:[...e.attributes].map(a=>[a.name,a.value]),children:[...e.childNodes].map(node),
   ...(e.localName==='details'?{open:(e as HTMLDetailsElement).open}:{}),
   ...(e.localName==='button'?{buttonType:(e as HTMLButtonElement).type,disabled:(e as HTMLButtonElement).disabled,tabIndex:e.tabIndex}:{})};
 }
 return[...host.content.childNodes].map(node);
}
function serialize(node:Node):string {
 if(node.nodeType===3)return text(node.nodeValue??'');
 if(node.nodeType===8){assert(['[','[-1','[0',']',''].includes(node.nodeValue??''),'Only finite authored compiler comments');return'<!--'+node.nodeValue+'-->';}
 assert.equal(node.nodeType,1);const e=node as Element;assert.equal(e.namespaceURI,'http://www.w3.org/1999/xhtml');
 return'<'+e.localName+[...e.attributes].map(a=>' '+a.name+'="'+attr(a.value)+'"').join('')+'>'+[...e.childNodes].map(serialize).join('')+'</'+e.localName+'>';
}
/** Independent expected grammar. The original whole input is authenticated
 * before exact coordinates are added; no actual HTML/tree is transformed. */
export function expectedSupplementReceipt(kind:SupplementCase,original:SupplementReceipt,document:Document):SupplementReceipt {
 const source=read(originalFile);assert.equal(sha(source),originalHash);
 const originals=JSON.parse(source)as Record<SupplementCase,SupplementReceipt>;assert.deepEqual(original,originals[kind],'Whole immutable original Supplement receipt');
 const result=structuredClone(original);if(original.html===null)return result;
 assert.deepEqual(receiptTree(original.html,document),original.tree,'Original complete raw/tree/defaults authenticate before expected transport');
 const host=document.createElement('template');host.innerHTML=escapeNativeLinks(kind,original.html);
 assert.equal(host.content.childNodes.length,1);const section=host.content.firstElementChild!;assert.equal(section.className,'supp-timeline-section');
 const comment=(data:string)=>document.createComment(data);
 function one(root:Element,selector:string):Element {const matches=root.querySelectorAll(selector);assert.equal(matches.length,1,selector);return matches[0]!;}
 const header=one(section,':scope > .supp-timeline-header'),timeline=one(section,':scope > .supp-timeline');
 const heading=one(header,':scope > div'),title=one(heading,':scope > .context-section-title');assert.equal(title.textContent,'Current supplements & medications');
 const history=heading.querySelector(':scope > .supp-history-count');assert.equal(heading.children.length,history?2:1);
 title.after(comment(history?'[0':'[-1'));heading.append(comment(']'));header.after(comment(''));
 const empty=timeline.querySelector(':scope > .supp-empty');
 if(empty){assert.equal(timeline.children.length,1);timeline.prepend(comment('[0'));timeline.append(comment(']'));}
 else {
  const axis=one(timeline,':scope > .supp-timeline-axis'),rows=[...timeline.querySelectorAll(':scope > .supp-bar-row')];assert(rows.length>0);assert.equal(timeline.children.length,rows.length+1);
  timeline.prepend(comment('[-1'));axis.after(comment('['));
  for(const row of rows){assert.equal(row.localName,'div');const track=one(row,':scope > .supp-bar-track');assert(track.children.length>0);for(const bar of track.children)assert.match(bar.className,/^(?:supp-bar-gap|supp-bar supp-bar-(?:supplement|medication)(?: supp-bar-ongoing)?)$/);track.prepend(comment('['));track.append(comment(']'));}
  timeline.append(comment(']'),comment(']'));
 }
 function badges(parent:Element):void {
  const study=one(parent,':scope > .supp-mito-badge'),direction=one(parent,':scope > .supp-mito-direction'),scope=parent.querySelector(':scope > .supp-mito-scope');assert.equal(study.nextElementSibling,direction);
  if(scope){direction.after(comment('[0'));scope.after(comment(']'),comment(''));}else direction.after(comment('[-1'),comment(']'),comment(''));
 }
 function collection(parent:Element,items:Element[],branch:boolean):void {
  assert(items.length>0);assert.equal(parent.lastChild,items.at(-1));items[0]!.before(comment('['));
  for(const item of items)if(branch){item.before(comment(item.classList.contains('supp-mito-compound-group')?'[-1':'[0'));item.after(comment(']'));}
  parent.append(comment(']'));
 }
 const evidence=section.querySelector(':scope > .supp-mitotox');
 if(evidence){
  const groups=[...evidence.querySelectorAll(':scope > details.supp-mitotox-item')];collection(evidence,groups,true);
  for(const group of groups){
   if(group.classList.contains('supp-mito-compound-group')){
    const list=one(group,':scope > .supp-mito-study-list'),studies=[...list.querySelectorAll(':scope > section.supp-mito-study')];collection(list,studies,false);
    for(const study of studies){badges(one(study,':scope > .supp-mito-study-head'));const links=one(study,':scope > div:has(> a.supp-mitotox-link)');assert.equal(links.children.length,3);links.after(comment(''));}
   }else{
    badges(one(group,':scope > summary'));const detail=one(group,':scope > .supp-mito-detail'),links=one(detail,':scope > div:has(> a.supp-mitotox-link)');assert.equal(links.children.length,3);assert.equal(detail.lastChild,links);links.after(comment(''));
   }
  }
 }
 timeline.after(comment(evidence?'[0':'[-1'));section.append(comment(']'));
 result.html='<!--[--><!--[-1-->'+serialize(section)+'<!--]--><!--]-->';result.tree=receiptTree(result.html,document);return result;
}
