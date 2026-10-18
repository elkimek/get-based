import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';

// Test-only immutable native renderer grammar. Candidate props/serializers never
// supply expected fields. Existing native icon/count raw-interpolation limits
// are explicit: real dna-ui supplies curated icons and numeric coverage counts.
const labels=['🔴 Risk associations','🟢 Protective associations','🔵 Informational traits','⚪ Reference, neutral, or ungraded calls']as const;
const icons=new Set(['🔴','🟢','🔵','⚪','❓']);
const entities:Readonly<Record<string,string>>={'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&#39;':"'"};
function decode(value:string):string{return value.replace(/&amp;|&lt;|&gt;|&quot;|&#39;/g,entity=>entities[entity]!);}
function text(value:string):string{return decode(value).replace(/[&<]/g,char=>char==='&'?'&amp;':'&lt;');}
function attr(value:string):string{return decode(value).replace(/[&"<]/g,char=>char==='&'?'&amp;':char==='"'?'&quot;':'&lt;');}
const shell=/^<div class="modal dna-preview-modal" role="dialog">\n    <div class="dna-preview-header">\n      <div class="dna-preview-title">DNA Import — ([^<]*)<\/div>\n      <div class="dna-preview-stats">([^<]*)<\/div>\n      (?:<div class="dna-preview-apoe">APOE Haplotype: <strong>([^<]*)<\/strong><\/div>)?\n    <\/div>\n    <div class="dna-preview-body">([\s\S]*)\n    <\/div>\n    <div class="dna-preview-disclaimer">\n      Processed locally — your DNA file was never transmitted\. Evidence strength and personal relevance are separate; neither label is a diagnosis\.\n    <\/div>\n    <div class="dna-preview-actions">\n      <button class="import-btn import-btn-secondary" data-dna-action="close-preview">Cancel<\/button>\n      <button class="import-btn import-btn-primary" data-dna-action="confirm-import">Import ([^<]*) SNPs<\/button>\n    <\/div><\/div>$/;
const row=/^<div class="dna-preview-row">\n        <span class="dna-preview-icon">([^<]*)<\/span>\n        <span class="dna-preview-gene">([^<]*) <span class="dna-preview-variant">([^<]*)<\/span> <span class="dna-preview-category">([^<]*)<\/span><\/span>\n        <span class="dna-preview-genotype">([^<]*)<\/span>\n      <\/div>\n      <div class="dna-preview-assessment">\n      <span class="genetics-axis genetics-axis-evidence genetics-axis-([^"]*)">Evidence · ([^<]*)<\/span>\n      <span class="genetics-axis genetics-axis-relevance genetics-axis-([^"]*)">Relevance · ([^<]*)<\/span>\n    <\/div>\n      <div class="dna-preview-note">([^<]*)<\/div>/;
const collapsedRow=/^<div class="dna-preview-row">\n          <span class="dna-preview-icon">([^<]*)<\/span>\n          <span class="dna-preview-gene">([^<]*) <span class="dna-preview-variant">([^<]*)<\/span> <span class="dna-preview-category">([^<]*)<\/span><\/span>\n          <span class="dna-preview-genotype">([^<]*)<\/span>\n        <\/div>/;
function expectedRows(original:string,collapsed:boolean,count:number):{html:string;consumed:number} {
 let rest=original,result='',seen=0;
 while(seen<count){
  const match=(collapsed?collapsedRow:row).exec(rest);assert.ok(match,'Exact immutable native row grammar');
  const [,icon,gene,variant,category,genotype,evidenceLevel,evidenceLabel,relevanceLevel,relevanceLabel,note]=match;
  assert.ok(icons.has(icon!),'Native curated icon boundary');
  result+=collapsed?`<div class="dna-preview-row">
          <span class="dna-preview-icon">${icon}</span>
          <span class="dna-preview-gene">${text(gene!)} <span class="dna-preview-variant">${text(variant!)}</span> <span class="dna-preview-category">${text(category!)}</span></span>
          <span class="dna-preview-genotype">${text(genotype!)}</span>
        </div>`:`<div class="dna-preview-row">
        <span class="dna-preview-icon">${icon}</span>
        <span class="dna-preview-gene">${text(gene!)} <span class="dna-preview-variant">${text(variant!)}</span> <span class="dna-preview-category">${text(category!)}</span></span>
        <span class="dna-preview-genotype">${text(genotype!)}</span>
      </div>
      <div class="dna-preview-assessment">
      <span class="genetics-axis genetics-axis-evidence genetics-axis-${attr(evidenceLevel!)}">Evidence · ${text(evidenceLabel!)}</span>
      <span class="genetics-axis genetics-axis-relevance genetics-axis-${attr(relevanceLevel!)}">Relevance · ${text(relevanceLabel!)}</span>
    </div>
      <div class="dna-preview-note">${text(note!)}</div>`;
  rest=rest.slice(match[0].length);seen++;
 }
 assert.equal(seen,count,'Whole native rows/count match');return {html:'<!--[-->'+result+'<!--]-->',consumed:original.length-rest.length};
}
function expectedGroups(original:string):string {
 let rest=original,result='';
 for(const [index,label]of labels.entries()) {
  assert.ok(rest.startsWith('\n      '),'Exact native snippet separator');rest=rest.slice(7);result+='\n      ';
  if(!rest.startsWith('<div class="dna-preview-group">')){result+='<!--[-1--><!--]--><!---->';continue;}
  const collapsed=index===3;
  const pattern=collapsed
   ?new RegExp('^<div class="dna-preview-group">\\n      <div class="dna-preview-group-title dna-preview-collapsible" role="button" tabindex="0" data-dna-action="toggle-preview-group">\\n        '+label+' \\(([0-9]+)\\) <span class="dna-preview-expand-hint">show</span>\\n      </div>\\n      <div class="dna-preview-collapsed-items">\\n        ')
   :new RegExp('^<div class="dna-preview-group">\\n      <div class="dna-preview-group-title">'+label+' \\(([0-9]+)\\)</div>\\n      ');
  const match=pattern.exec(rest);
  // This native slot is empty when the next present group has a later label.
  if(!match){result+='<!--[-1--><!--]--><!---->';continue;}
  const count=Number(match[1]);assert.ok(Number.isSafeInteger(count)&&count>0);
  const rowResult=expectedRows(rest.slice(match[0].length),collapsed,count),rows=rowResult.html;
  const trailer=collapsed?'\n      </div>\n    </div>':'\n    </div>';const consumed=match[0].length+rowResult.consumed;
  assert.ok(rest.slice(consumed).startsWith(trailer),'Exact native group close AFTER every counted full row');
  const group=collapsed?`<div class="dna-preview-group">
      <div class="dna-preview-group-title dna-preview-collapsible" role="button" tabindex="0" data-dna-action="toggle-preview-group">
        ${label} (${count}) <span class="dna-preview-expand-hint">show</span>
      </div>
      <div class="dna-preview-collapsed-items">
        ${rows}
      </div>
    </div>`:`<div class="dna-preview-group">
      <div class="dna-preview-group-title">${label} (${count})</div>
      ${rows}
    </div>`;
  result+='<!--[0-->'+(collapsed?'<!--[0-->':'<!--[-1-->')+group+'<!--]--><!--]--><!---->';rest=rest.slice(consumed+trailer.length);
 }
 assert.equal(rest,'','Every original group byte consumed');return result;
}
/** Expected-only source grammar/context transport; actual HTML is never transformed. */
export function expectedDnaPreviewHTML(original:string):string {
 const match=shell.exec(original);assert.ok(match,'Whole immutable native preview shell');
 const [,source,stats,apoe,groups,count]=match;assert.match(count!,/^(?:0|[1-9][0-9]*)$/,'Native numeric coverage boundary');
 return `<!--[--><div class="modal dna-preview-modal" role="dialog">
    <div class="dna-preview-header">
      <div class="dna-preview-title">DNA Import — ${text(source!)}</div>
      <div class="dna-preview-stats">${text(stats!)}</div>
      ${apoe===undefined?'<!--[-1--><!--]-->':'<!--[0--><div class="dna-preview-apoe">APOE Haplotype: <strong>'+text(apoe)+'</strong></div><!--]-->'}
    </div>
    <div class="dna-preview-body">${expectedGroups(groups!)}
    </div>
    <div class="dna-preview-disclaimer">
      Processed locally — your DNA file was never transmitted. Evidence strength and personal relevance are separate; neither label is a diagnosis.
    </div>
    <div class="dna-preview-actions">
      <button class="import-btn import-btn-secondary" data-dna-action="close-preview">Cancel</button>
      <button class="import-btn import-btn-primary" data-dna-action="confirm-import">Import ${count} SNPs</button>
    </div></div><!--]-->`;
}
function nativeAnnotations(fragment:DocumentFragment):void {
 const document=fragment.ownerDocument,roots=[...fragment.children];assert.equal(roots.length,1);
 const modal=roots[0]!;assert.equal(modal.className,'modal dna-preview-modal');assert.equal(modal.getAttribute('role'),'dialog');
 const header=modal.querySelector('.dna-preview-header')!,body=modal.querySelector('.dna-preview-body')!;
 function parts(owner:Element,start:number){
  const original=[...owner.childNodes],children=original.slice(0,start);let index=start,offset=0;
  return {children,peek:()=>original[index],element:()=>{assert.equal(offset,0);const node=original[index++];assert.equal(node?.nodeType,1);return node! as Element;},
   space(value:string){const node=original[index];assert.equal(node?.nodeType,3);assert.equal(node!.nodeValue!.slice(offset,offset+value.length),value);offset+=value.length;if(offset===node!.nodeValue!.length){index++;offset=0;}children.push(document.createTextNode(value));},
   finish(){assert.equal(index,original.length);assert.equal(offset,0);owner.replaceChildren(...children);}};
 }
 const h=parts(header,4);assert.equal((header.childNodes[1]as Element).className,'dna-preview-title');assert.equal((header.childNodes[3]as Element).className,'dna-preview-stats');h.space('\n      ');
 const apoe=h.peek()?.nodeType===1?h.element():null;assert.ok(!apoe||apoe.className==='dna-preview-apoe');h.children.push(document.createComment(apoe?'[0':'[-1'));if(apoe)h.children.push(apoe);h.children.push(document.createComment(']'));h.space('\n    ');h.finish();
 const b=parts(body,0);
 for(const [index,label]of labels.entries()) {
  b.space('\n      ');const next=b.peek();const group=next?.nodeType===1?next as Element:null;
  const present=group?.querySelector('.dna-preview-group-title')?.textContent?.trim().startsWith(label+' (');
  b.children.push(document.createComment(present?'[0':'[-1'));
  if(present){
   assert.equal(b.element(),group);const collapsed=index===3;assert.ok(group!.className==='dna-preview-group'||collapsed&&group!.className==='dna-preview-group expanded','Only native delegated reference-group expansion');
   b.children.push(document.createComment(collapsed?'[0':'[-1'));
   const elements=[...group!.children],title=elements[0]!;const count=Number(title.textContent!.match(/\(([0-9]+)\)/)![1]);
   const rows=collapsed?[...elements[1]!.children]:elements.filter(element=>element.className==='dna-preview-row');assert.equal(rows.length,count);
   if(collapsed){assert.equal(elements.length,2);assert.equal(elements[1]!.className,'dna-preview-collapsed-items');assert.equal(title.getAttribute('role'),'button');assert.equal(title.getAttribute('data-dna-action'),'toggle-preview-group');}
   else assert.deepEqual(elements.map(element=>element.className),['dna-preview-group-title',...rows.flatMap(()=>['dna-preview-row','dna-preview-assessment','dna-preview-note'])]);
   const first=rows[0]!,last=collapsed?rows.at(-1)!:elements.at(-1)!;
   assert.equal(first.previousSibling?.nodeValue,collapsed?'\n        ':'\n      ');assert.equal(last.nextSibling?.nodeValue,collapsed?'\n      ':'\n    ');
   first.before(document.createComment('['));last.after(document.createComment(']'));
   b.children.push(group!,document.createComment(']'));
  }
  b.children.push(document.createComment(']'),document.createComment(''));
 }
 b.space('\n    ');b.finish();modal.before(document.createComment('['));modal.after(document.createComment(']'));
}
/** Exact expected DOM serialization after ORIGINAL native delegated actions. */
export function expectedDnaPreviewDOMHTML(originalLiveDOM:string):string {
 const dom=new JSDOM('');
 try{const host=dom.window.document.createElement('template');host.innerHTML=originalLiveDOM;nativeAnnotations(host.content);return host.innerHTML;}
 finally{dom.window.close();}
}
/** Full immutable native DOM/default tree; expected=true adds only owned annotations. */
export function dnaPreviewNativeTree(markup:string,expected=false):unknown {
 const dom=new JSDOM('',{url:'https://example.invalid/'});
 try {const host=dom.window.document.createElement('template');host.innerHTML=markup;if(expected)nativeAnnotations(host.content);
  function walk(node:Node):unknown {const element=node instanceof dom.window.Element?node:null;
   const defaults=element instanceof dom.window.HTMLButtonElement?{type:element.type,disabled:element.disabled,value:element.value,tabIndex:element.tabIndex}
    :element instanceof dom.window.HTMLAnchorElement?{href:element.href,target:element.target,rel:element.rel,tabIndex:element.tabIndex}
    :element instanceof dom.window.HTMLElement?{tabIndex:element.tabIndex}:null;
   return {type:node.nodeType,name:node.nodeName,value:node.nodeValue,localName:element?.localName??null,namespace:element?.namespaceURI??null,
    attrs:element?[...element.attributes].map(attr=>[attr.name,attr.value,attr.namespaceURI,attr.prefix]):null,defaults,text:node.textContent,children:[...node.childNodes].map(walk)};
  }return [...host.content.childNodes].map(walk);
 }finally{dom.window.close();}
}
