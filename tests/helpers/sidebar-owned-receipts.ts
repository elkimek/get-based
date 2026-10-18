import assert from 'node:assert/strict';
import branches from '../fixtures/sidebar-presentation-branches.json' with {type:'json'};
/** Independent immutable native skeleton grammar. No production view/projector/component import. */
const icons:readonly string[]=["<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><circle cx=\"11\" cy=\"11\" r=\"8\"></circle><path d=\"M21 21l-4.35-4.35\"></path></svg>", "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><rect x=\"3\" y=\"3\" width=\"7\" height=\"7\" rx=\"1.5\"></rect><rect x=\"14\" y=\"3\" width=\"7\" height=\"7\" rx=\"1.5\"></rect><rect x=\"3\" y=\"14\" width=\"7\" height=\"7\" rx=\"1.5\"></rect><rect x=\"14\" y=\"14\" width=\"7\" height=\"7\" rx=\"1.5\"></rect></svg>", "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M12 2.7s5 6.3 5 11.3a5 5 0 0 1-10 0c0-5 5-11.3 5-11.3z\"></path></svg>", "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M4 17l4-7 4 4 4-8 4 11\"></path><path d=\"M4 20h16\"></path><circle cx=\"8\" cy=\"10\" r=\"1.5\"></circle><circle cx=\"12\" cy=\"14\" r=\"1.5\"></circle><circle cx=\"16\" cy=\"6\" r=\"1.5\"></circle></svg>", "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M4 4c4 3 12 3 16 0\"></path><path d=\"M4 8c4 3 12 3 16 0\"></path><path d=\"M4 12c4 3 12 3 16 0\"></path><path d=\"M4 16c4 3 12 3 16 0\"></path><path d=\"M4 20c4 3 12 3 16 0\"></path></svg>", "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><circle cx=\"12\" cy=\"12\" r=\"6\"></circle><path d=\"M12 9v3l1.5 1.5\"></path><path d=\"M16 4l-2 2\"></path><path d=\"M8 4l2 2\"></path><path d=\"M16 20l-2-2\"></path><path d=\"M8 20l2-2\"></path></svg>", "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><circle cx=\"12\" cy=\"12\" r=\"4\"></circle><path d=\"M12 2v2\"></path><path d=\"M12 20v2\"></path><path d=\"M2 12h2\"></path><path d=\"M20 12h2\"></path><path d=\"M4.93 4.93l1.41 1.41\"></path><path d=\"M17.66 17.66l1.41 1.41\"></path><path d=\"M4.93 19.07l1.41-1.41\"></path><path d=\"M17.66 6.34l1.41-1.41\"></path></svg>", "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M9.5 3a3.5 3.5 0 0 0-3 5.3\"></path><path d=\"M14.5 3a3.5 3.5 0 0 1 3 5.3\"></path><path d=\"M6.5 8.3A4 4 0 0 0 4 12c0 1.7.7 3.2 1.8 4.3\"></path><path d=\"M17.5 8.3A4 4 0 0 1 20 12c0 1.7-.7 3.2-1.8 4.3\"></path><path d=\"M9 21a2 2 0 0 1-2-2v-2\"></path><path d=\"M15 21a2 2 0 0 0 2-2v-2\"></path><path d=\"M12 6v15\"></path></svg>", "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M17 3l4 4-4 4\"></path><path d=\"M3 7h18\"></path><path d=\"M7 21l-4-4 4-4\"></path><path d=\"M21 17H3\"></path></svg>", "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M3 17c3.5-8 7-8 10.5 0s7 8 10.5 0\"></path></svg>", "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M12 2v4\"></path><path d=\"M12 18v4\"></path><path d=\"M4.93 4.93l2.83 2.83\"></path><path d=\"M16.24 16.24l2.83 2.83\"></path><path d=\"M2 12h4\"></path><path d=\"M18 12h4\"></path><path d=\"M4.93 19.07l2.83-2.83\"></path><path d=\"M16.24 7.76l2.83-2.83\"></path></svg>", "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M4 6h16\"></path><path d=\"M4 12h16\"></path><path d=\"M4 18h16\"></path><circle cx=\"8\" cy=\"6\" r=\"2\"></circle><circle cx=\"16\" cy=\"12\" r=\"2\"></circle><circle cx=\"10\" cy=\"18\" r=\"2\"></circle></svg>", "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M4 19.5A2.5 2.5 0 0 1 6.5 17H20\"></path><path d=\"M4 4.5A2.5 2.5 0 0 1 6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5z\"></path></svg>", "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z\"></path><polyline points=\"14 2 14 8 20 8\"></polyline><line x1=\"16\" y1=\"13\" x2=\"8\" y2=\"13\"></line><line x1=\"16\" y1=\"17\" x2=\"8\" y2=\"17\"></line></svg>", "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M12 5v14\"></path><path d=\"M5 12h14\"></path></svg>", "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M5 12.5a7 7 0 0 1 14 0\"></path><path d=\"M8 12.5a4 4 0 0 1 8 0\"></path><path d=\"M12 12.5v.01\"></path><path d=\"M12 17v4\"></path></svg>"];
const decode=(value:string)=>value.replace(/&(amp|lt|gt|quot|#39);/g,(_,key:string)=>({amp:'&',lt:'<',gt:'>',quot:'"','#39':"'"}[key]!));
const text=(value:string)=>decode(value).replace(/[&<]/g,char=>char==='&'?'&amp;':'&lt;');
const attr=(value:string)=>decode(value).replace(/[&<"]/g,char=>char==='&'?'&amp;':char==='<'?'&lt;':'&quot;');
const escaped=(value:string)=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
function icon(native:string):string{const index=icons.indexOf(native);assert.ok(index>=0,'Closed sixteen original native SVG bodies');const split=native.indexOf('>')+1;return native.slice(0,split)+`<!--[${index}-->`+native.slice(split,-6)+'<!--]--></svg><!---->';}
function badge(native:string,mode:'conditional'|'category'|'fixed'):string{
 if(native==='<span class="nav-item-dot"></span>')return '<!--[0-->'+native+'<!--]-->';
 const match=/^<span class="(nav-item-count(?: nav-count| flag-count| count)?)">([^<]*)<\/span>$/.exec(native);assert.ok(match,'Complete original badge grammar');
 const index=mode==='category'?(match[1]==='nav-item-count flag-count'?0:-1):-1;
 assert.ok(mode==='category'?['nav-item-count flag-count','nav-item-count count'].includes(match[1]!):mode==='conditional'?match[1]==='nav-item-count nav-count':match[1]==='nav-item-count');
 return `<!--[${index}--><span class="${match[1]}">${text(match[2]!)}</span><!--]-->`;
}
function action(native:string):string{
 const attrs=[...native.matchAll(/(?:^| )data-nav-(action|route|group)="([^"<>]*)"/g)];assert.equal(attrs.map(x=>x[0]).join(''),native,'Only exact original native delegated attrs');
 assert.equal(attrs[0]?.[1],'action');assert.ok(['navigate','open-emf-assessment','open-light-assessment','open-report-builder','open-context','open-knowledge-base','open-custom-marker','toggle-group'].includes(decode(attrs[0]![2]!)));
 return attrs.map(x=>`${x[0].startsWith(' ')?' ':''}data-nav-${x[1]}="${attr(x[2]!)}"`).join('');
}
export function expectedSidebarHTML(original:string):string{
 if(original==='')return original;
 let cursor=0;
 const peek=(literal:string)=>original.startsWith(literal,cursor);
 function consume(owner:string,kind:string):string{
  const found=branches.filter(row=>row.owner===owner&&row.kind===kind);assert.equal(found.length,1);const branch=found[0]!;
  let at=0,pattern='^';for(const slot of branch.slots){const next=branch.nativeSkeleton.indexOf(slot.coordinate,at);assert.ok(next>=at);pattern+=escaped(branch.nativeSkeleton.slice(at,next))+'([\\s\\S]*?)';at=next+slot.coordinate.length;}pattern+=escaped(branch.nativeSkeleton.slice(at));
  const match=new RegExp(pattern).exec(original.slice(cursor));assert.ok(match,`Whole original Sidebar ${owner}/${kind} grammar at ${cursor}`);cursor+=match[0].length;
  const values=new Map(branch.slots.map((slot,index)=>[slot.port,match[index+1]!]));
  let result='',end=0;
  for(const slot of branch.slots){const next=branch.nativeSkeleton.indexOf(slot.coordinate,end);result+=branch.nativeSkeleton.slice(end,next);let value=values.get(slot.port)!;
   if(slot.port==='icon')value=icon(value);
   else if(slot.port==='badge'&&kind!=='specialty-header')value=badge(value,owner==='_buildNavItem'?'category':owner==='_renderConditionalNavItem'?'conditional':'fixed');
   else if(/ActionAttributes$|^actionAttributes$/.test(slot.port))value=action(value);
   else if(['category','markerNames','groupName','accessibleGroupName'].includes(slot.port))value=attr(value);
   else if(['label','value'].includes(slot.port))value=text(value);
   else if(slot.port==='expanded')assert.ok(value==='true'||value==='false');
   else if(slot.port==='collapsedClass')assert.ok(value===''||value===' collapsed');
   else if(slot.port==='collapsedStyleAttributes')assert.ok(value===''||value===' style="display:none"');
   result+=value;end=next+slot.coordinate.length;
  }
  result+=branch.nativeSkeleton.slice(end);
  if(kind==='search'){const input='<input type="text" class="sidebar-search" id="sidebar-search" placeholder="Search markers..." data-nav-input-action="filter-sidebar">';assert.equal(result.split(input).length,2);result=result.replace(input,input.slice(0,-1)+'/>');}
  return result;
 }
 const fixed=(kind:string)=>consume('buildSidebar',kind);
 let output='<!--[-->'+fixed('search')+fixed('home-section')+fixed('dashboard')+fixed('lenses-section')+fixed('labs')+fixed('biology-scores')+fixed('genome')+fixed('body');
 output+=consume('_renderConditionalNavItem','item')+'<!---->'+fixed('insight')+fixed('recommendations')+fixed('analysis-section')+fixed('compare')+fixed('correlations');
 output+=consume('_renderConditionalNavItem','item')+'<!---->'+consume('_renderConditionalNavItem','item')+'<!---->'+fixed('manage-section')+fixed('reports')+fixed('context')+fixed('knowledge-base')+fixed('custom-markers')+fixed('lab-categories');
 output+='<!--[-->';while(peek('<div class="nav-item"'))output+=consume('_buildNavItem','item');output+='<!--]--><!--[-->';
 while(peek('<div class="sidebar-group-header')){
  let header=fixed('specialty-header');
  // Native specialty badge is an optional exact independent span body.
  const marker=/\n        (<span class="flag-count">([^<]*)<\/span>)?\n      <\/button>/;
  const found=marker.exec(header);assert.ok(found);header=header.replace(marker,`\n        ${found[1]?'<!--[0--><span class="flag-count">'+text(found[2]!)+'</span><!--]-->':'<!--[-1--><!--]-->'}\n      </button>`);
  output+=header+fixed('open-specialty')+'<!--[-->';
  while(peek('<div class="nav-item"'))output+=consume('_buildNavItem','item');
  output+='<!--]-->'+fixed('close-specialty');
 }
 assert.equal(cursor,original.length,'Complete immutable original Sidebar consumed without unknown suffix');return output+'<!--]--><!--]-->';
}
type Tree={tag?:string;attrs?:string[][];children?:Tree[];type?:number;text?:string|null};
function tree(node:Node):Tree{return node.nodeType===Node.ELEMENT_NODE?{tag:(node as Element).tagName,attrs:[...(node as Element).attributes].map(a=>[a.name,a.value]),children:[...node.childNodes].map(tree)}:{type:node.nodeType,text:node.nodeValue};}
function bare(value:Tree):Tree{return value.tag?{...value,children:value.children!.filter(child=>child.type!==Node.COMMENT_NODE).map(bare)}:value;}
function applyNativeState(native:Tree,template:Tree):Tree{
 assert.equal(native.tag,template.tag);assert.equal(native.type,template.type);
 if(!native.tag){assert.equal(native.text,template.text);return structuredClone(native);}
 const originals=native.children!.filter(child=>child.type!==Node.COMMENT_NODE);let index=0;
 const children=template.children!.map(child=>child.type===Node.COMMENT_NODE?structuredClone(child):applyNativeState(originals[index++]!,child));assert.equal(index,originals.length);
 return {...structuredClone(native),children};
}
function element(value:Tree):Node{
 if(value.type===Node.COMMENT_NODE)return document.createComment(value.text||'');if(!value.tag)return document.createTextNode(value.text||'');
 const ns=['svg','path','rect','circle','line','polyline'].includes(value.tag)?'http://www.w3.org/2000/svg':'http://www.w3.org/1999/xhtml';const node=document.createElementNS(ns,ns==='http://www.w3.org/1999/xhtml'?value.tag.toLowerCase():value.tag);
 for(const [name,text]of value.attrs!)node.setAttribute(name!,text!);for(const child of value.children!)node.append(element(child));return node;
}
export function expectedSidebarReceipt<T extends {rawAssignment:string|null;raw:string|null;tree:unknown;stages:unknown[]}>(original:T):T{
 if(original.rawAssignment===null)return structuredClone(original);
 const host=document.createElement('aside');host.id='sidebar-nav';host.className='sidebar';host.innerHTML=original.raw||'';assert.deepEqual(tree(host),original.tree,'Whole native raw and ordered DOM authenticate before expectation transport');
 const native=document.createElement('aside');native.id='sidebar-nav';native.className='sidebar';native.innerHTML=original.rawAssignment;
 const rendered=document.createElement('aside');rendered.id='sidebar-nav';rendered.className='sidebar';const raw=expectedSidebarHTML(original.rawAssignment);rendered.innerHTML=raw;
 assert.deepEqual(bare(tree(rendered)),tree(native),'Only finite SDK comments/context encodings may change original native DOM');
 const template=tree(rendered);
 function qualify(value:unknown):unknown{
  if(Array.isArray(value))return value.map(qualify);
  if(value&&typeof value==='object'){
   const n=value as Tree;if(n.tag==='ASIDE'&&n.attrs?.some(([name,v])=>name==='id'&&v==='sidebar-nav'))return applyNativeState(n,template);
   return Object.fromEntries(Object.entries(value).map(([key,v])=>[key,qualify(v)]));
  }return value;
 }
 const result=structuredClone(original);result.rawAssignment=raw;result.tree=qualify(original.tree);result.stages=qualify(original.stages) as unknown[];
 const state=element(result.tree as Tree) as Element;result.raw=state.innerHTML;return result;
}
