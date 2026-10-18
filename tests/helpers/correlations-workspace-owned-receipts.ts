import assert from 'node:assert/strict';
import historical from '../fixtures/correlations-workspace-historical-branches.json' with {type:'json'};
/** Fixed original native skeleton grammar plus explicit SDK marker/context recipes; no production renderer or view imports. */
interface NativeBranch {owner:string;kind:string;nativeSkeleton:string;slots:readonly {coordinate:string;valuePrefix?:string;valueSuffix?:string}[]}
const branches:readonly NativeBranch[]=historical;
const byKind=new Map(branches.map(row=>[row.kind,row]));
const children:Record<string,Record<number,string>>={workspace:{0:'surface',1:'dose-notice*',3:'timeline-panel*|no-series',13:'pair-tabs?',16:'scatter-unavailable?',18:'history?'},'current-dose':{2:'current-dose-list|no-current-dose'},'current-dose-list':{0:'current-dose-item*'},'dose-notice':{2:'confirm-dose?'},'confirm-dose':{1:'confirm-period*'},'timeline-panel':{3:'plot-chart?',4:'usage-timeline*'},'pair-tabs':{0:'pair-tab*'},history:{0:'current-dose*'},surface:{0:'choice-group',1:'custom-dates?',4:'choice-group',5:'choice-group',6:'no-lab-results?',12:'range-error?',13:'tab-button*',14:'ingredient-picker*',16:'series-button*'},'choice-group':{4:'choice-button*'},'ingredient-picker':{2:'ingredient-option*'}};
const booleans:Record<string,Record<number,string>>={workspace:{2:' hidden',4:' hidden',6:' hidden',10:' hidden',12:' open',17:' hidden'},'timeline-panel':{1:' class="sr-only"'},surface:{3:' hidden',7:' hidden',15:' hidden'},'choice-group':{0:' hidden'},'choice-button':{6:' disabled'},'ingredient-option':{1:' selected'}};
const regexEscape=(s:string)=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
function childPattern(spec:string):string{return spec.split('|').map(choice=>{const suffix=choice.at(-1),key=suffix==='?'||suffix==='*'?choice.slice(0,-1):choice;return '(?:'+pattern(key,false)+')'+(suffix==='?'||suffix==='*'?suffix:'');}).join('|');}
function portPattern(key:string,index:number):string{
 const nested=children[key]?.[index];if(nested)return '(?:'+childPattern(nested)+')';
 const flag=booleans[key]?.[index];if(flag)return '(?:'+regexEscape(flag)+')?';
 const branch=byKind.get(key)!,slot=branch.slots[index]!;
 if(slot.valuePrefix)return '(?:true|false)';
 if(key==='workspace'&&index===14)return '(?: role="tabpanel" aria-labelledby="corr-pair-[0-9]+" tabindex="0")?';
 if(key==='pair-tab'&&index===3)return '(?:-1|0)';
 return '[^<>]*?';
}
function pattern(key:string,capture:boolean):string{
 const branch=byKind.get(key);assert.ok(branch,'Closed native branch name');let cursor=0,out='';
 branch.slots.forEach((slot,index)=>{const at=branch.nativeSkeleton.indexOf(slot.coordinate,cursor);assert.ok(at>=cursor);out+=regexEscape(branch.nativeSkeleton.slice(cursor,at));const value=portPattern(key,index);out+=regexEscape(slot.valuePrefix||'')+(capture?'('+value+')':'(?:'+value+')')+regexEscape(slot.valueSuffix||'');cursor=at+slot.coordinate.length;});return out+regexEscape(branch.nativeSkeleton.slice(cursor));
}
const decode=(raw:string)=>raw.replace(/&(amp|lt|gt|quot|#39);/g,(_,key:string)=>({amp:'&',lt:'<',gt:'>',quot:'"','#39':"'"}[key]!));
function encoded(raw:string,attribute:boolean):string{assert.ok(!/&(?!(?:amp|lt|gt|quot|#39);)/.test(raw),'Known original native contextual entity encoding');return decode(raw).replace(attribute?/[&<"]/g:/[&<]/g,char=>char==='&'?'&amp;':char==='<'?'&lt;':'&quot;');}
const each=(raw:string,key:string)=>'<!--[-->'+list(raw,key)+'<!--]-->';
const conditional=(raw:string,key:string)=>raw?'<!--[0-->'+branch(raw,key)+'<!--]-->':'<!--[-1--><!--]-->';
function list(raw:string,key:string):string {const re=new RegExp(pattern(key,false),'g');const matches=[...raw.matchAll(re)];assert.equal(matches.map(row=>row[0]).join(''),raw,'Complete ordered native list grammar '+key);return matches.map(row=>branch(row[0],key)).join('');}
function branch(raw:string,key:string):string{
 const grammar=byKind.get(key)!;const match=new RegExp('^'+pattern(key,true)+'$').exec(raw);assert.ok(match,'Complete original native grammar '+key);const values=match.slice(1);assert.equal(values.length,grammar.slots.length);
 const replacements=values.map((value,index)=>{
  const flag=booleans[key]?.[index];if(flag)return value?(flag===' class="sr-only"'?flag:flag+'=""'):'';
  if(key==='workspace'){
   if(index===0)return branch(value,'surface')+'<!---->';
   if(index===1)return each(value,'dose-notice');
   if(index===3)return value===byKind.get('no-series')!.nativeSkeleton?'<!--[-1-->'+value+'<!--]-->':'<!--[0-->'+each(value,'timeline-panel')+'<!--]-->';
   if(index===13)return conditional(value,'pair-tabs');if(index===16)return conditional(value,'scatter-unavailable');if(index===18)return conditional(value,'history');if(index===14)return value;
  }
  if(key==='surface'){
   if([0,4,5].includes(index))return branch(value,'choice-group')+'<!---->';
   if(index===1)return conditional(value,'custom-dates');if(index===6)return conditional(value,'no-lab-results');if(index===12)return conditional(value,'range-error');
   if(index===13)return each(value,'tab-button');if(index===14)return each(value,'ingredient-picker');if(index===16)return each(value,'series-button');
  }
  if(key==='current-dose'&&index===2)return value.startsWith('<ul>')?'<!--[0-->'+branch(value,'current-dose-list')+'<!--]-->':'<!--[-1-->'+branch(value,'no-current-dose')+'<!--]-->';
  if(key==='current-dose-list'&&index===0)return each(value,'current-dose-item');
  if(key==='dose-notice'&&index===2)return conditional(value,'confirm-dose');if(key==='confirm-dose'&&index===1)return each(value,'confirm-period');
  if(key==='timeline-panel'&&index===3)return conditional(value,'plot-chart');if(key==='timeline-panel'&&index===4)return each(value,'usage-timeline');
  if(key==='pair-tabs'&&index===0)return each(value,'pair-tab');if(key==='history'&&index===0)return each(value,'current-dose');
  if(key==='choice-group'&&index===4)return each(value,'choice-button');if(key==='ingredient-picker'&&index===2)return each(value,'ingredient-option');
  const slot=grammar.slots[index]!;if(slot.valuePrefix)return slot.valuePrefix+value+slot.valueSuffix;
  const position=grammar.nativeSkeleton.indexOf(slot.coordinate);const prefix=grammar.nativeSkeleton.slice(0,position);const inTag=prefix.lastIndexOf('<')>prefix.lastIndexOf('>');return encoded(value,inTag);
 });
 let cursor=0,out='';grammar.slots.forEach((slot,index)=>{const at=grammar.nativeSkeleton.indexOf(slot.coordinate,cursor);out+=grammar.nativeSkeleton.slice(cursor,at)+replacements[index]!;cursor=at+slot.coordinate.length;});out+=grammar.nativeSkeleton.slice(cursor);
 if(key==='custom-dates'||key==='workspace')out=out.replace(/(<input\b[^>]*)(?<!\/)>(?=<\/label>|<\/details>)/g,'$1/>');return out;
}
export function expectedCorrelationWorkspaceHTML(raw:string,owner:'workspace'|'readout'|'usage'):string{return owner==='workspace'?'<!--[-->'+branch(raw,'workspace')+'<!--]-->':'<!--[-->'+each(raw,owner==='readout'?'readout':'usage-segment')+'<!--]-->';}
interface Tree {type:number|string;name?:string;attrs?:string[][];children?:Tree[];text?:string|null;[key:string]:unknown}
function tree(node:Node):Tree{if(node instanceof Element)return{type:node.nodeType,name:node.nodeName,attrs:[...node.attributes].map(a=>[a.name,a.value]),children:[...node.childNodes].map(tree),...(node instanceof HTMLInputElement?{value:node.value,defaultValue:node.defaultValue,type:node.type}:{}),...(node instanceof HTMLOptionElement?{value:node.value,selected:node.selected,defaultSelected:node.defaultSelected}:{}),...(node instanceof HTMLButtonElement?{type:node.type,disabled:node.disabled}:{}),...(node instanceof HTMLDetailsElement?{open:node.open}:{})} as Tree;return {type:node.nodeType,text:node.nodeValue};}
function plainTree(node:Node):unknown{
 if(node instanceof Element){const children:unknown[]=[];for(const child of node.childNodes){if(child.nodeType===Node.COMMENT_NODE)continue;const value=plainTree(child);if(child.nodeType===Node.TEXT_NODE){const last=children.at(-1) as {type?:number;text?:string}|undefined;if(last?.type===Node.TEXT_NODE){last.text=(last.text||'')+(child.nodeValue||'');continue;}}children.push(value);}return {name:node.nodeName,attrs:[...node.attributes].map(a=>[a.name,a.value]),children};}return{type:node.nodeType,text:node.nodeValue};}

function parsed(raw:string):HTMLElement{const host=document.createElement('div');host.innerHTML=raw;return host;}
type Packet={id:string;html:string};
export function expectedCorrelationWorkspaceReceipt<T extends {raw:Packet[];tree:unknown;lifecycle:unknown[]}>(original:T):T{
 const result=structuredClone(original);if(!original.raw.some(row=>row.id==='workspace'))return result;
 const native=original.raw.find(row=>row.id==='workspace')!,initial=parsed(native.html),expected=parsed(expectedCorrelationWorkspaceHTML(native.html,'workspace'));assert.deepEqual(plainTree(expected),plainTree(initial),'Only expected SDK markers/context encoding may change native initial DOM');
 const kinds=(packet:Packet)=>packet.id==='workspace'?'workspace':packet.id==='corr-readout'?'readout':packet.html.startsWith('<span class="corr-use-segment')?'usage':null;
 result.raw=original.raw.map(packet=>{const kind=kinds(packet);if(!kind)return structuredClone(packet);const next=expectedCorrelationWorkspaceHTML(packet.html,kind);assert.deepEqual(plainTree(parsed(next)),plainTree(parsed(packet.html)),'Whole native late owner grammar and DOM authenticate');return {...packet,html:next};});
 function attrs(node:Tree,name:string){return node.attrs?.find(([key])=>key===name)?.[1];}
 function augment(node:Tree,template:Tree):Tree{
  assert.equal(node.name,template.name);assert.equal(node.type,template.type);
  if(!node.children)return structuredClone(node);
  if(attrs(node,'id')==='corr-pair-detail')return structuredClone(node);
  const owner=attrs(node,'id')==='corr-readout'?'readout':attrs(node,'class')==='corr-use-track'?'usage':null;
  if(owner){
   const candidates=original.raw.filter(packet=>kinds(packet)===owner);if(candidates.length===0){assert.equal(node.children.length,0,'Unconstructed native mount remains empty');return structuredClone(node);}let matched:HTMLElement|undefined;
   for(const packet of candidates){const nativeHost=tree(parsed(packet.html));if(JSON.stringify(nativeHost.children)===JSON.stringify(node.children)){matched=parsed(expectedCorrelationWorkspaceHTML(packet.html,owner));break;}}
   assert.ok(matched,'Late full native owner packet authenticates DOM before comment augmentation');const matchedTree=tree(matched);assert.ok(matchedTree.children);template={...template,children:matchedTree.children};
  }
  const existing=node.children.filter(child=>child.type!==Node.COMMENT_NODE);let index=0,offset=0;
  const children=template.children!.map(child=>{
   if(child.type===Node.COMMENT_NODE)return structuredClone(child);
   const nativeChild=existing[index];assert.ok(nativeChild,'Complete original child exists');
   if(child.type===Node.TEXT_NODE){
    assert.equal(nativeChild.type,Node.TEXT_NODE);
    const nativeText=nativeChild.text||'',expectedText=child.text||'';
    // SDK comments may split a native text node. Every split retains exact bytes.
    if(offset===0&&index+1<=existing.length&&nativeText.length===expectedText.length){index++;return {...structuredClone(nativeChild),text:nativeText};}
    if(offset===0&&template.children!.filter(c=>c.type!==Node.COMMENT_NODE).length===existing.length){index++;return structuredClone(nativeChild);}
    assert.equal(nativeText.slice(offset,offset+expectedText.length),expectedText,'Exact expected SDK text boundary');offset+=expectedText.length;if(offset===nativeText.length){index++;offset=0;}return {...structuredClone(nativeChild),text:expectedText};
   }
   assert.equal(offset,0);index++;return augment(nativeChild,child);
  });assert.equal(offset,0);assert.equal(index,existing.length,'Complete native node order retained');return {...structuredClone(node),children};
 }
 const rootTemplate=tree(expected);function qualify(value:unknown):unknown{
  if(Array.isArray(value))return value.map(qualify);
  if(value&&typeof value==='object'){
   const n=value as Tree;if(n.name&&attrs(n,'id')==='workspace')return augment(n,rootTemplate);
   if(n.name&&attrs(n,'id')==='corr-readout')return augment(n,{...n,children:[]});
   return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,qualify(item)]));
  }return value;
 }
 result.tree=qualify(original.tree);result.lifecycle=qualify(original.lifecycle) as unknown[];return result;
}
