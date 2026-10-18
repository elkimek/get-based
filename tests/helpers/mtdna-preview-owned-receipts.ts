import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
const entities:Readonly<Record<string,string>>={'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&#39;':"'"};
function decode(value:string):string{return value.replace(/&amp;|&lt;|&gt;|&quot;|&#39;/g,entity=>entities[entity]!);}
function text(value:string):string{return decode(value).replace(/[&<]/g,value=>value==='&'?'&amp;':'&lt;');}
function attribute(value:string):string{return decode(value).replace(/[&"<]/g,value=>value==='&'?'&amp;':value==='"'?'&quot;':'&lt;');}
function branch(value:string|undefined,markup:(value:string)=>string):string{return value===undefined?'<!--[-1--><!--]-->':'<!--[0-->'+markup(value)+'<!--]-->';}
/** Only the ORIGINAL immutable native renderer supplies expected values and branches. */
export function expectedMtDnaPreviewHTML(original:string):string {
 const grammar=/^<div class="modal dna-preview-modal" role="dialog"><div class="dna-preview-header">\n    <div class="dna-preview-title">mtDNA Import<\/div>\n    <div class="dna-preview-stats">(?<count>[^<]*) mtDNA markers read from (?<file>[^<]*)<\/div>\n  <\/div>\n  <div class="dna-preview-body">\n    <div class="mtdna-preview-haplogroup">\n      <div class="mtdna-hg-label">Haplogroup<\/div>\n      <div class="mtdna-hg-value">(?<haplogroup>[^<]*)<\/div>\n      <div class="mtdna-hg-confidence">(?<matched>[^<]*)\/(?<total>[^<]*) diagnostic markers matched<\/div>\n    <\/div>(?:<div class="mtdna-preview-coupling">\n      <div class="mtdna-coupling-label">(?<label>[^<]*)<\/div>\n      <div class="mtdna-coupling-climate">(?<climate>[^<]*)<\/div>\n      <div class="mtdna-coupling-desc">(?<description>[^<]*)<\/div>\n    <\/div>)?(?:<div class="mtdna-preview-mismatch mtdna-mismatch-(?<severity>[^"]*)">\n      <strong>Environment mismatch:<\/strong> (?<message>[^<]*)\n      (?:<div class="mtdna-mismatch-implications">(?<implications>[^<]*)<\/div>)?\n    <\/div>|<div class="mtdna-preview-match">(?<match>[^<]*)<\/div>)?<\/div>\n  <div class="dna-preview-disclaimer">Processed locally\. Coupling classification follows the Wallace mitochondrial paradigm - a research framework, not an established clinical standard\.<\/div>\n  <div class="dna-preview-actions">\n    <button class="import-btn import-btn-secondary" data-dna-action="close-mtdna-preview">Cancel<\/button>\n    <button class="import-btn import-btn-primary" data-dna-action="confirm-mtdna-import">Import Haplogroup (?<actionHaplogroup>[^<]*)<\/button>\n  <\/div><\/div>$/;
 const match=grammar.exec(original);assert.ok(match?.groups,'Exact original native mtDNA preview grammar');const g=match.groups;
 const mismatch=g.message!==undefined?'<!--[0--><div class="mtdna-preview-mismatch mtdna-mismatch-'+attribute(g.severity!)+'">\n      <strong>Environment mismatch:</strong> '+text(g.message)+'\n      '+branch(g.implications,value=>'<div class="mtdna-mismatch-implications">'+text(value)+'</div>')+'\n    </div><!--]-->':g.match!==undefined?'<!--[1--><div class="mtdna-preview-match">'+text(g.match)+'</div><!--]-->':'<!--[-1--><!--]-->';
 return `<!--[--><div class="modal dna-preview-modal" role="dialog"><div class="dna-preview-header">
    <div class="dna-preview-title">mtDNA Import</div>
    <div class="dna-preview-stats">${text(g.count!)} mtDNA markers read from ${text(g.file!)}</div>
  </div>
  <div class="dna-preview-body">
    <div class="mtdna-preview-haplogroup">
      <div class="mtdna-hg-label">Haplogroup</div>
      <div class="mtdna-hg-value">${text(g.haplogroup!)}</div>
      <div class="mtdna-hg-confidence">${text(g.matched!)}/${text(g.total!)} diagnostic markers matched</div>
    </div>${branch(g.label,value=>'<div class="mtdna-preview-coupling">\n      <div class="mtdna-coupling-label">'+text(value)+'</div>\n      <div class="mtdna-coupling-climate">'+text(g.climate!)+'</div>\n      <div class="mtdna-coupling-desc">'+text(g.description!)+'</div>\n    </div>')}${mismatch}</div>
  <div class="dna-preview-disclaimer">Processed locally. Coupling classification follows the Wallace mitochondrial paradigm - a research framework, not an established clinical standard.</div>
  <div class="dna-preview-actions">
    <button class="import-btn import-btn-secondary" data-dna-action="close-mtdna-preview">Cancel</button>
    <button class="import-btn import-btn-primary" data-dna-action="confirm-mtdna-import">Import Haplogroup ${text(g.actionHaplogroup!)}</button>
  </div></div><!--]-->`;
}
/** Complete DOM/defaults with expected comments generated only from native input. */
export function mtDnaPreviewTree(markup:string,expected=false):unknown {
 const dom=new JSDOM('');try{
  const host=dom.window.document.createElement('template');host.innerHTML=expected?expectedMtDnaPreviewHTML(markup):markup;
  function walk(node:Node):unknown {const el=node instanceof dom.window.Element?node:null;
   return {type:node.nodeType,name:node.nodeName,value:node.nodeValue,namespace:el?.namespaceURI??null,text:node.textContent,
    attrs:el?[...el.attributes].map(attr=>[attr.name,attr.value,attr.namespaceURI,attr.prefix]):null,
    defaults:el instanceof dom.window.HTMLButtonElement?{type:el.type,disabled:el.disabled,value:el.value,tabIndex:el.tabIndex}:el instanceof dom.window.HTMLElement?{tabIndex:el.tabIndex}:null,
    children:[...node.childNodes].map(walk)};
  }return [...host.content.childNodes].map(walk);
 }finally{dom.window.close();}
}
