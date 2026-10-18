import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';

// Test-only grammar of the immutable native study function. No product renderer,
// projection, serializer or candidate receipt supplies these expected fields.
const nativeStudy = /^<article class="db-mtdna-study db-mtdna-study-([^"]*)">\n      <div class="db-mtdna-study-head">\n        <span>([^<]*)<\/span>\n        <em>([^<]*)<\/em>\n      <\/div>\n      <strong>([^<]*)<\/strong>\n      (?:<small>([^<]*)<\/small>)?\n      (?:<p>([^<]*)<\/p>)?\n      (?:<dl><dt>Model<\/dt><dd>([^<]*)<\/dd><\/dl>)?\n      (?:<dl><dt>Limits<\/dt><dd>([^<]*)<\/dd><\/dl>)?\n      (?:<a href="https:\/\/pubmed\.ncbi\.nlm\.nih\.gov\/([0-9]+)\/" target="_blank" rel="noopener">PubMed · PMID ([0-9]+)<\/a>)?\n    <\/article>$/;
const nativeEntities:Readonly<Record<string,string>>={'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&#39;':"'"};
function decodeNative(value:string):string {return value.replace(/&amp;|&lt;|&gt;|&quot;|&#39;/g,entity=>nativeEntities[entity]!);}
// Installed Svelte emits &/< in text and &/"/< in double-quoted attributes.
// Decode the native five-entity table exactly once, then encode that context.
function text(value:string):string {return decodeNative(value).replace(/[&<]/g,char=>char==='&'?'&amp;':'&lt;');}
function attribute(value:string):string {return decodeNative(value).replace(/[&"<]/g,char=>char==='&'?'&amp;':char==='"'?'&quot;':'&lt;');}
function branch(value:string|undefined,markup:(value:string)=>string):string {return value===undefined?'<!--[-1--><!--]-->':'<!--[0-->'+markup(value)+'<!--]-->';}
/** Convert ONLY immutable expected native study markup to its owned SSR transport. */
export function expectedMtdnaStudyHTML(original:string):string {
 const match=nativeStudy.exec(original);assert.ok(match,'Immutable native study grammar');
 const [,direction,label,visible,title,scope,summary,model,limits,pmid,visiblePmid]=match;
 assert.equal(pmid,visiblePmid,'Native PubMed label/URL agree');
 return `<!--[--><article class="db-mtdna-study db-mtdna-study-${attribute(direction!)}">
      <div class="db-mtdna-study-head">
        <span>${text(label!)}</span>
        <em>${text(visible!)}</em>
      </div>
      <strong>${text(title!)}</strong>
      ${branch(scope,value=>'<small>'+text(value)+'</small>')}
      ${branch(summary,value=>'<p>'+text(value)+'</p>')}
      ${branch(model,value=>'<dl><dt>Model</dt><dd>'+text(value)+'</dd></dl>')}
      ${branch(limits,value=>'<dl><dt>Limits</dt><dd>'+text(value)+'</dd></dl>')}
      ${branch(pmid,value=>'<a href="https://pubmed.ncbi.nlm.nih.gov/'+value+'/" target="_blank" rel="noopener">PubMed · PMID '+value+'</a>')}
    </article><!--]-->`;
}
/** Exact grammar of the immutable native PANEL, supplying expected SSR annotations only. */
export function expectedMtdnaPanelHTML(original:string):string {
 const grammar=/^<section class="db-mtdna-panel" data-mtdna-haplogroup="(?<haplogroup>[^"]*)">\n      <div class="db-mtdna-head">\n        <span><small>Maternal lineage<\/small><strong>mtDNA (?<lineage>[^<]*)<\/strong><\/span>\n        <em>(?<lens>[^<]*)<\/em>\n      <\/div>\n      (?:<div class="db-mtdna-coupling"><strong>(?<couplingLabel>[^<]*)<\/strong><span>(?<climate>[^<]*)<\/span><\/div>)?\n      (?:<div class="db-mtdna-facts">(?:<span><small>Origin<\/small><strong>(?<origin>[^<]*)<\/strong><\/span>)?(?:<span><small>Source<\/small><strong>(?<source>[^<]*)<\/strong><\/span>)?(?:<span><small>Marker match<\/small><strong>(?<match>[^<]*)<\/strong><\/span>)?<\/div>)?\n      (?:<div class="db-mtdna-copy">(?<copy>(?:<p>[^<]*<\/p>){1,3})<\/div>)?\n      (?:<div class="db-mtdna-environment(?<environmentClass> is-mismatch| is-match)">(?<environment>[^<]*)<\/div>)?\n      (?:<details class="db-mtdna-evidence" data-mtdna-evidence>\n        <summary>Wallace framework &amp; evidence <span>(?<count>[0-9]+) sources<\/span><\/summary>\n        <div class="db-mtdna-evidence-body">\n          (?:<p class="db-mtdna-caveat">(?<caveat>[^<]*)<\/p>)?\n          <div class="db-mtdna-study-grid">(?<studies>[\s\S]*?)<\/div>\n          (?:<a href="(?<issueURL>[^"]*)" target="_blank" rel="noopener" class="db-genome-contribute-link">Suggest an mtDNA study or correction<\/a>)?\n        <\/div>\n      <\/details>)?\n    <\/section>$/;
 const match=grammar.exec(original);assert.ok(match?.groups,'Immutable native panel grammar');
 const g=match.groups;
 const copy=g.copy===undefined?[]:[...g.copy.matchAll(/<p>([^<]*)<\/p>/g)].map(row=>row[1]!);
 const articles=g.studies===undefined?[]:[...g.studies.matchAll(/<article class="db-mtdna-study db-mtdna-study-[^"]*">[\s\S]*?<\/article>/g)].map(row=>row[0]);
 assert.equal(articles.join(''),g.studies??'','Complete native study list, including sparse-array omission');
 const studies=articles.map(article=>{
  // Nested authored components share the parent's root boundary. This is
  // expected-only syntax from the immutable native study grammar above.
  const expected=expectedMtdnaStudyHTML(article);return expected.slice('<!--[-->'.length,-'<!--]-->'.length);
 }).join('');
 return `<!--[--><section class="db-mtdna-panel" data-mtdna-haplogroup="${attribute(g.haplogroup!)}">
      <div class="db-mtdna-head">
        <span><small>Maternal lineage</small><strong>mtDNA ${text(g.lineage!)}</strong></span>
        <em>${text(g.lens!)}</em>
      </div>
      ${branch(g.couplingLabel,value=>'<div class="db-mtdna-coupling"><strong>'+text(value)+'</strong><span>'+text(g.climate!)+'</span></div>')}
      ${branch(g.origin!==undefined||g.source!==undefined||g.match!==undefined?'facts':undefined,()=>'<div class="db-mtdna-facts">'+branch(g.origin,value=>'<span><small>Origin</small><strong>'+text(value)+'</strong></span>')+branch(g.source,value=>'<span><small>Source</small><strong>'+text(value)+'</strong></span>')+branch(g.match,value=>'<span><small>Marker match</small><strong>'+text(value)+'</strong></span>')+'</div>')}
      ${branch(g.copy,()=>'<div class="db-mtdna-copy">'+[0,1,2].map(index=>branch(copy[index],value=>'<p>'+text(value)+'</p>')).join('')+'</div>')}
      ${branch(g.environment,value=>'<div class="db-mtdna-environment'+g.environmentClass+'">'+text(value)+'</div>')}
      ${branch(g.count,count=>`<details class="db-mtdna-evidence" data-mtdna-evidence="">
        <summary>Wallace framework &amp; evidence <span>${text(count)} sources</span></summary>
        <div class="db-mtdna-evidence-body">
          ${branch(g.caveat,value=>'<p class="db-mtdna-caveat">'+text(value)+'</p>')}
          <div class="db-mtdna-study-grid"><!--[-->${studies}<!--]--></div>
          ${branch(g.issueURL,value=>'<a href="'+attribute(value)+'" target="_blank" rel="noopener" class="db-genome-contribute-link">Suggest an mtDNA study or correction</a>')}
        </div>
      </details>`)}
    </section><!--]-->`;
}
/** Add exact annotations to an ORIGINAL native DOM clone; never candidate DOM. */
function addExpectedStudyAnnotations(fragment:DocumentFragment):void {
 const document=fragment.ownerDocument;
 for(const article of [...fragment.querySelectorAll('article.db-mtdna-study')]) {
  assert.ok(article.parentNode===fragment||article.parentElement?.matches('div.db-mtdna-study-grid'),'Exact native study root/list owner');
  const original=[...article.childNodes];
  assert.equal(original[0]?.nodeType,3);assert.equal(original[0]?.nodeValue,'\n      ');
  const head=original[1] as Element;assert.equal(head.localName,'div');assert.equal(head.className,'db-mtdna-study-head');
  assert.equal(original[2]?.nodeType,3);assert.equal(original[2]?.nodeValue,'\n      ');
  assert.equal((original[3] as Element).localName,'strong');
  let index=4,offset=0;
  const children:Node[]=original.slice(0,4);
  function whitespace(value:string):void {
   const node=original[index];assert.equal(node?.nodeType,3,'Native branch whitespace');
   assert.equal(node!.nodeValue!.slice(offset,offset+value.length),value,'Exact native whitespace boundary');
   offset+=value.length;if(offset===node!.nodeValue!.length){index++;offset=0;}
   children.push(document.createTextNode(value));
  }
  for(const [tag,label]of [['small',null],['p',null],['dl','Model'],['dl','Limits'],['a',null]]as const) {
   whitespace('\n      ');
   const node=original[index];const element=node?.nodeType===1?node as Element:null;
   const present=element?.localName===tag&&(label===null||element.querySelector('dt')?.textContent===label);
   children.push(document.createComment(present?'[0':'[-1'));
   if(present){assert.equal(offset,0);children.push(element!);index++;}
   children.push(document.createComment(']'));
  }
  whitespace('\n    ');assert.equal(index,original.length);assert.equal(offset,0);
  article.replaceChildren(...children);
  article.before(document.createComment('['));article.after(document.createComment(']'));
 }
}
/** Complete native fragment/default tree; only expected=true adds named comments. */
export function mtdnaNativeTree(markup:string,expected=false):unknown {
 const dom=new JSDOM('',{url:'https://example.invalid/'});
 try {
  const host=dom.window.document.createElement('template');host.innerHTML=markup;
  if(expected){if(host.content.firstElementChild?.matches('section.db-mtdna-panel'))host.innerHTML=expectedMtdnaPanelHTML(markup);else addExpectedStudyAnnotations(host.content);}
  function walk(node:Node):unknown {
   const element=node instanceof dom.window.Element?node:null;
   const defaults=element instanceof dom.window.HTMLDetailsElement?{open:element.open}
    :element instanceof dom.window.HTMLAnchorElement?{href:element.href,target:element.target,rel:element.rel,tabIndex:element.tabIndex}
    :element instanceof dom.window.HTMLElement?{tabIndex:element.tabIndex}:null;
   return {type:node.nodeType,name:node.nodeName,value:node.nodeValue,localName:element?.localName??null,namespace:element?.namespaceURI??null,
    attrs:element?[...element.attributes].map(attr=>[attr.name,attr.value,attr.namespaceURI,attr.prefix]):null,defaults,text:node.textContent,children:[...node.childNodes].map(walk)};
  }
  return [...host.content.childNodes].map(walk);
 }finally{dom.window.close();}
}
