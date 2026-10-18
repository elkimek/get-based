import assert from 'node:assert/strict';
import {expectedMtdnaPanelHTML} from './dashboard-mtdna-study-owned-receipts.js';
const entities:Readonly<Record<string,string>>={'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&#39;':"'"};
const decode=(value:string)=>value.replace(/&amp;|&lt;|&gt;|&quot;|&#39;/g,entity=>entities[entity]!);
const text=(value:string)=>decode(value).replace(/[&<]/g,char=>char==='&'?'&amp;':'&lt;');
const attribute=(value:string)=>decode(value).replace(/[&"<]/g,char=>char==='&'?'&amp;':char==='"'?'&quot;':'&lt;');
const branch=(markup:string|null)=>markup===null?'<!--[-1--><!--]-->':'<!--[0-->'+markup+'<!--]-->';
class OriginalCursor {
 private at=0;
 private readonly source:string;
 constructor(source:string){this.source=source;}
 starts(value:string){return this.source.startsWith(value,this.at);}
 literal(value:string){assert(this.starts(value),'Complete immutable native literal at '+this.at);this.at+=value.length;return value;}
 take(pattern:RegExp){const match=pattern.exec(this.source.slice(this.at));assert(match&&match.index===0,'Complete immutable native grammar at '+this.at);this.at+=match[0].length;return match;}
 remaining(){return this.source.slice(this.at);}
 done(){assert.equal(this.at,this.source.length,'Entire original markup consumed, no unknown suffix');}
}
function contribution(c:OriginalCursor):string {
 if(!c.starts('<div class="db-genome-contribute">'))return branch(null);
 const found=c.take(/^<div class="db-genome-contribute">\n      <span><strong>Improve the public catalog<\/strong> Suggest a well-supported SNP or correct an annotation\. The link does not include your genotype or imported data\.<\/span>\n      <a href="([^"]*)" target="_blank" rel="noopener" class="db-genome-contribute-link">Suggest a SNP<\/a>\n    <\/div>/);
 return branch(`<div class="db-genome-contribute">
      <span><strong>Improve the public catalog</strong> Suggest a well-supported SNP or correct an annotation. The link does not include your genotype or imported data.</span>
      <a href="${attribute(found[1]!)}" target="_blank" rel="noopener" class="db-genome-contribute-link">Suggest a SNP</a>
    </div>`);
}
function interpretation(original:string):string {
 if(!original)return branch(null);
 const found=/^<div class="db-snp-interpretation">\n          (?:<p><strong>What it supports\.<\/strong> ([^<]*)<\/p>)?\n          (?:<p><strong>Use in context\.<\/strong> ([^<]*)<\/p>)?\n        <\/div>$/.exec(original);
 assert(found,'Closed original interpretation grammar');
 return branch('<div class="db-snp-interpretation">\n          '+branch(found[1]===undefined?null:'<p><strong>What it supports.</strong> '+text(found[1])+'</p>')+'\n          '+branch(found[2]===undefined?null:'<p><strong>Use in context.</strong> '+text(found[2])+'</p>')+'\n        </div>');
}
function references(original:string):string {
 if(original==='<span>No catalog source linked yet</span>')return '<!--[-1-->'+original+'<!--]-->';
 const c=new OriginalCursor(original);c.literal('<span class="db-snp-evidence-source-label">Sources:</span>');let result='<!--[0--><span class="db-snp-evidence-source-label">Sources:</span><!--[-->',index=0;
 while(c.starts('<a href="')){
  const found=c.take(/^<a href="([^"]*)" target="_blank" rel="noopener" class="db-snp-evidence-source">([^<]*)<\/a>/);
  result+=branch(index?'<span aria-hidden="true">·</span>':null)+'<a href="'+attribute(found[1]!)+'" target="_blank" rel="noopener" class="db-snp-evidence-source">'+text(found[2]!)+'</a>';
  index++;if(c.starts('<span aria-hidden="true">·</span>'))c.literal('<span aria-hidden="true">·</span>');else break;
 }
 assert(index>0,'Nonempty complete original source list');c.done();return result+'<!--]--><!--]-->';
}
function evidence(original:string):string {
 if(!original)return branch(null);
 const found=/^<details class="db-snp-evidence" data-snp-evidence="([^"]*)">\n      <summary>Evidence &amp; interpretation <small>([^<]*)<\/small><\/summary>\n      <div class="db-snp-evidence-body">\n        ([\s\S]*?)\n        <div class="db-snp-evidence-footer">\n          ([\s\S]*?)\n          <span aria-hidden="true">·<\/span>\n          <button type="button" class="db-snp-text-action db-snp-ai-action" data-dashboard-widget-action="ask-genome-snp" data-dashboard-widget-rsid="([^"]*)">Ask AI<\/button>\n          <span aria-hidden="true">·<\/span>\n          <a href="([^"]*)" target="_blank" rel="noopener" class="db-snp-text-action db-snp-correction-action">Suggest correction<\/a>\n        <\/div>\n      <\/div>\n    <\/details>$/.exec(original);
 assert(found,'Closed original evidence/default/action/attribute grammar');
 assert.equal(found[1],found[5],'Native public Ask action identifies its evidence row');
 return branch(`<details class="db-snp-evidence" data-snp-evidence="${attribute(found[1]!)}">
      <summary>Evidence &amp; interpretation <small>${text(found[2]!)}</small></summary>
      <div class="db-snp-evidence-body">
        ${interpretation(found[3]!)}
        <div class="db-snp-evidence-footer">
          ${references(found[4]!)}
          <span aria-hidden="true">·</span>
          <button type="button" class="db-snp-text-action db-snp-ai-action" data-dashboard-widget-action="ask-genome-snp" data-dashboard-widget-rsid="${attribute(found[5]!)}">Ask AI</button>
          <span aria-hidden="true">·</span>
          <a href="${attribute(found[6]!)}" target="_blank" rel="noopener" class="db-snp-text-action db-snp-correction-action">Suggest correction</a>
        </div>
      </div>
    </details>`);
}
function row(c:OriginalCursor):string {
 const found=c.take(/^<div class="([^"]*)">\n      <span class="db-snp-main">\n        <strong>([^<]*)<\/strong>\n        <small>([^<]*)<\/small>\n      <\/span>\n      <span class="db-snp-impact">([^<]*)<\/span>\n      <span class="db-snp-geno">([^<]*)<\/span>\n      (?:<span class="db-snp-note">([^<]*)<\/span>)?\n      (<details class="db-snp-evidence"[\s\S]*?<\/details>)?\n    <\/div>/);
 assert(/^db-snp-row db-snp-(risk|protective|trait|neutral|pending)$/.test(found[1]!), 'Closed native row class/tone');
 return `<div class="${attribute(found[1]!)}">
      <span class="db-snp-main">
        <strong>${text(found[2]!)}</strong>
        <small>${text(found[3]!)}</small>
      </span>
      <span class="db-snp-impact">${text(found[4]!)}</span>
      <span class="db-snp-geno">${text(found[5]!)}</span>
      ${branch(found[6]===undefined?null:'<span class="db-snp-note">'+text(found[6])+'</span>')}
      ${evidence(found[7]??'')}
    </div>`;
}
function groups(c:OriginalCursor):string {
 let result='<!--[-->';
 while(c.starts('<div class="db-genome-category ')){
  const found=c.take(/^<div class="([^"]*)">\n      <div class="db-genome-category-head">\n        <strong>([^<]*)<\/strong>\n        <span>([^<]*)<\/span>\n        <em>([^<]*)<\/em>\n      <\/div>\n      <div class="db-genome-category-rows">/);
  assert(/^db-genome-category db-genome-category-(risk|protective|trait|neutral|pending)( db-genome-category-secondary)?$/.test(found[1]!), 'Closed native group class/tone');
  result+=`<div class="${attribute(found[1]!)}">
      <div class="db-genome-category-head">
        <strong>${text(found[2]!)}</strong>
        <span>${text(found[3]!)}</span>
        <em>${text(found[4]!)}</em>
      </div>
      <div class="db-genome-category-rows"><!--[-->`;
  let count=0;while(c.starts('<div class="db-snp-row ')){result+=row(c);count++;}
  assert(count>0,'Each immutable original group has native rows');
  c.literal('</div>\n    </div>');result+='<!--]--></div>\n    </div>';
 }
 return result+'<!--]-->';
}
const legend=`<div class="db-genome-legend" aria-label="Genome interpretation legend">
      <span class="db-genome-legend-item db-genome-legend-risk"><span>🔴</span> risk association</span>
      <span class="db-genome-legend-item db-genome-legend-protective"><span>🟢</span> protective association</span>
      <span class="db-genome-legend-item db-genome-legend-trait"><span>🔵</span> trait</span>
      <span class="db-genome-legend-item db-genome-legend-informational"><span>⚪</span> neutral</span>
      <span class="db-genome-legend-help">Direction, evidence, and relevance are separate. Strong evidence is not a diagnosis or a proven intervention.</span>
    </div>`;
const noPriority=`<div class="db-genome-empty db-genome-no-priority">
      <strong>No priority or informational trait calls</strong>
      <span>Normal, neutral, and unclassified imported calls are collapsed below.</span>
    </div>`;
/** Full expected-only native grammar. Actual markup is never parsed, changed,
 * normalized, stripped or used to produce this expected component transport. */
export function expectedGenomeWidgetHTML(original:string):string {
 const c=new OriginalCursor(original);
 if(c.starts('<div class="db-genome-list">\n        <div class="db-genome-summary">')){
  const loading=c.take(/^<div class="db-genome-list">\n        <div class="db-genome-summary">([0-9]+) imported SNP(s?)<\/div>\n        <div class="db-genome-empty db-genome-loading" aria-live="polite">\n          <strong>Loading SNP interpretations<\/strong>\n          <span>Matching your variants to the SNP catalog so effect, category, and notes render correctly\.<\/span>\n        <\/div>\n      <\/div>/);
  assert.equal(loading[2],loading[1]==='1'?'':'s');c.done();return '<!--[--><!--[0-->'+original+'<!--]--><!--]-->';
 }
 if(c.starts('<div class="db-genome-list">\n        ')){
  const prefix=c.literal(`<div class="db-genome-list">
        <div class="db-genome-empty">
          <strong>No DNA data imported yet</strong>
          <span>Import a raw DNA file above to see curated findings and traits alongside your labs and body signals.</span>
        </div>
        `);
  const content=contribution(c),tail=c.literal('\n      </div>');c.done();
  return '<!--[--><!--[-1--><!--[0-->'+prefix+content+'<!---->'+tail+'<!--]--><!--]--><!--]-->';
 }
 let result='<!--[--><!--[-1--><!--[-1-->'+c.literal('<div class="db-genome-list">\n      ');
 const meta=c.starts('<div class="db-genome-summary">')?c.take(/^<div class="db-genome-summary">([^<]*)<\/div>/):null;
 result+=branch(meta?'<div class="db-genome-summary">'+text(meta[1]!)+'</div>':null)+c.literal('\n      ');
 result+=branch(c.starts(legend)?c.literal(legend):null)+c.literal('\n      ');
 const apoe=c.starts('<div class="db-snp-row db-snp-row-apoe">')?c.take(/^<div class="db-snp-row db-snp-row-apoe"><span class="db-snp-main"><strong>APOE<\/strong><small>Haplotype · ([^<]*)<\/small><\/span><span class="db-snp-impact">context<\/span><span class="db-snp-geno">([^<]*)<\/span><\/div>/):null;
 result+=branch(apoe?'<div class="db-snp-row db-snp-row-apoe"><span class="db-snp-main"><strong>APOE</strong><small>Haplotype · '+text(apoe[1]!)+'</small></span><span class="db-snp-impact">context</span><span class="db-snp-geno">'+text(apoe[2]!)+'</span></div>':null)+c.literal('\n      ');
 const panel=c.starts('<section class="db-mtdna-panel"')?c.take(/^<section class="db-mtdna-panel"[\s\S]*?<\/section>/)[0]:null;
 result+=branch(panel?expectedMtdnaPanelHTML(panel).slice(8,-8):null)+c.literal('\n      ');
 result+=branch(c.starts(noPriority)?c.literal(noPriority):null)+c.literal('\n      ');
 result+=groups(c)+'<!---->'+c.literal('\n      ');
 if(c.starts('<details class="db-genome-secondary">')){
  const secondary=c.take(/^<details class="db-genome-secondary">\n      <summary>Other imported SNPs \(([0-9]+)\)<\/summary>\n      <div class="db-genome-secondary-list">/);
  result+='<!--[0--><details class="db-genome-secondary">\n      <summary>Other imported SNPs ('+secondary[1]+')</summary>\n      <div class="db-genome-secondary-list">'+groups(c)+'<!---->'+c.literal('</div>\n    </details>')+'<!--]-->';
 }else result+=branch(null);
 result+=c.literal('\n      ')+contribution(c)+'<!---->'+c.literal('\n    </div>')+'<!--]--><!--]--><!--]-->';c.done();return result;
}
