import assert from 'node:assert/strict';
/** Independent fixed native grammar; no production view/projector/serializer import. */
const decode=(value:string)=>value.replace(/&(amp|lt|gt|quot|#39);/g,(_,key:string)=>({amp:'&',lt:'<',gt:'>',quot:'"','#39':"'"}[key]!));
const text=(value:string)=>value.replace(/[&<]/g,char=>char==='&'?'&amp;':'&lt;');
const header=/<div class="emf-compare-header">\n    <span class="emf-compare-label">Before: ([^<]*)<\/span>\n    <span class="emf-compare-arrow">→<\/span>\n    <span class="emf-compare-label">After: ([^<]*)<\/span>\n  <\/div>/g;
const tableStart='<div class="emf-compare-table"><table>\n    <thead><tr><th>Room</th>';
const tableMiddle='</tr></thead><tbody>',tableEnd='</tbody></table></div>';
const color='[a-z-]+';
const paired=new RegExp(`^<span style="color:var\\(--(${color})\\)">([^<>]*)</span>\\n          <span style="color:(var\\(--(?:green|red|text-muted)\\));font-weight:600">([↓↑=])</span>\\n          <span style="color:var\\(--(${color})\\)">([^<>]*)</span>$`);
const added=new RegExp(`^<span style="color:var\\(--text-muted\\)">—</span> → <span style="color:var\\(--(${color})\\)">([^<>]*)</span>$`);
const removed=new RegExp(`^<span style="color:var\\(--(${color})\\)">([^<>]*)</span> → <span style="color:var\\(--text-muted\\)">—</span>$`);
function cell(raw:string):string{
 if(raw==='—')return '<!--[0-->—<!--]-->';
 const pair=paired.exec(raw);if(pair)return `<!--[1--><span style="color:var(--${pair[1]})">${text(pair[2]!)}</span>\n          <span style="color:${pair[3]};font-weight:600">${pair[4]}</span>\n          <span style="color:var(--${pair[5]})">${text(pair[6]!)}</span><!--]-->`;
 const add=added.exec(raw);if(add)return `<!--[2--><span style="color:var(--text-muted)">—</span> → <span style="color:var(--${add[1]})">${text(add[2]!)}</span><!--]-->`;
 const remove=removed.exec(raw);assert.ok(remove,'Complete native empty/paired/added/removed cell grammar');return `<!--[-1--><span style="color:var(--${remove[1]})">${text(remove[2]!)}</span> → <span style="color:var(--text-muted)">—</span><!--]-->`;
}
export function expectedEMFComparisonHTML(original:string):string{
 const matches=[...original.matchAll(header)];assert.equal(matches.length,(original.match(/<div class="emf-compare-header">/g)||[]).length);if(matches.length===0)return original;assert.equal(matches.length,1);
 const match=matches[0]!,start=match.index;let cursor=start+match[0].length;
 let out=`<!--[--><div class="emf-compare-header">\n    <span class="emf-compare-label">Before: ${text(decode(match[1]!))}</span>\n    <span class="emf-compare-arrow">→</span>\n    <span class="emf-compare-label">After: ${text(decode(match[2]!))}</span>\n  </div>`;
 const note=/^<div class="emf-compare-note">Comparing the two most recent assessments\. ([0-9]+) earlier assessment(s?) not shown\.<\/div>/.exec(original.slice(cursor));
 if(note){out+='<!--[0-->'+note[0]+'<!--]-->';cursor+=note[0].length;}else out+='<!--[-1--><!--]-->';
 assert.equal(original.slice(cursor,cursor+tableStart.length),tableStart);out+=tableStart+'<!--[-->';cursor+=tableStart.length;
 const middle=original.indexOf(tableMiddle,cursor);assert.ok(middle>=cursor);const columns=original.slice(cursor,middle);const heads=[...columns.matchAll(/<th>([^<>]*)<\/th>/g)];assert.equal(heads.map(row=>row[0]).join(''),columns);assert.deepEqual(heads.map(row=>row[1]),['AC Electric','AC Magnetic','RF/Microwave','Dirty Elec.','DC Magnetic']);out+=heads.map(row=>'<th>'+text(row[1]!)+'</th>').join('')+'<!--]-->'+tableMiddle+'<!--[-->';cursor=middle+tableMiddle.length;
 const end=original.indexOf(tableEnd,cursor);assert.ok(end>=cursor);const body=original.slice(cursor,end);const rowPattern=/<tr><td class="emf-compare-room">([^<]*)<\/td>((?:<td class="emf-compare-cell">[\s\S]*?<\/td>)*)<\/tr>/g;const rows=[...body.matchAll(rowPattern)];assert.equal(rows.map(row=>row[0]).join(''),body,'Complete ordered native room grammar');
 for(const row of rows){const cells=[...row[2]!.matchAll(/<td class="emf-compare-cell">([\s\S]*?)<\/td>/g)];assert.equal(cells.length,5);assert.equal(cells.map(c=>c[0]).join(''),row[2]);out+='<tr><td class="emf-compare-room">'+text(decode(row[1]!))+'</td><!--[-->'+cells.map(c=>'<td class="emf-compare-cell">'+cell(c[1]!)+'</td>').join('')+'<!--]--></tr>';}
 out+='<!--]-->'+tableEnd;cursor=end+tableEnd.length;
 const action='<div style="margin-top:12px">\n      <button type="button" class="import-btn import-btn-secondary" data-emf-action="interpret-comparison">Interpret Changes</button>\n    </div>';
 if(original.slice(cursor,cursor+action.length)===action){out+='<!--[0-->'+action+'<!--]-->';cursor+=action.length;}else out+='<!--[-1--><!--]-->';
 out+='<!--]-->';return original.slice(0,start)+out+original.slice(cursor);
}
/** Expected-only parent grammar applied to immutable native receipts; actual
 * output and the complete ordered graph remain untouched and exact. */
export function expectedEMFEditorHTML(original:string):string {
 if(original==='')return original;
 const close='<button type="button" class="modal-close" aria-label="Close" data-emf-action="close-editor">&times;</button>';
 assert.ok(original.startsWith(close),'Original editor close grammar');
 const ending='<div id="emf-meter-recs-slot"></div>';assert.ok(original.endsWith(ending));
 const boundary='    </div>',at=original.indexOf(boundary);assert.ok(at>0);
 let head=original.slice(0,at+boundary.length).replace(close,close.replace('&times;','×'));
 const importBranch='<button type="button" class="import-btn import-btn-secondary" data-emf-action="trigger-pdf-import">Import PDF</button>\n      <input type="file" id="emf-pdf-input" accept=".pdf" style="display:none" data-emf-change-action="pdf-input">';
 const importGap='      \n      <a href="data/emf-assessment-template.html"';
 if(head.includes(importBranch))head=head.replace(importBranch,'<!--[0-->'+importBranch.replace('data-emf-change-action="pdf-input">','data-emf-change-action="pdf-input"/>')+'<!--]-->');
 else {assert.ok(head.includes(importGap));head=head.replace(importGap,'      <!--[-1--><!--]-->\n      <a href="data/emf-assessment-template.html"');}
 const compare=/<button type="button" class="import-btn import-btn-secondary" data-emf-action="toggle-compare">(Exit Compare|Compare)<\/button>/;
 if(compare.test(head))head=head.replace(compare,'<!--[0-->$&<!--]-->');
 else {const gap='      \n    </div>';assert.ok(head.endsWith(gap));head=head.slice(0,-gap.length)+'      <!--[-1--><!--]-->\n    </div>';}
 const body=original.slice(at+boundary.length,-ending.length);let projected:string;
 if(body.startsWith('<div class="emf-compare-header">')){
  const child=expectedEMFComparisonHTML(body);assert.ok(child.startsWith('<!--[-->')&&child.endsWith('<!--]-->'));
  projected='<!--[1-->'+child.slice('<!--[-->'.length,-'<!--]-->'.length)+'<!--]-->';
 }else if(body.startsWith('<div class="emf-empty">'))projected='<!--[0-->'+body+'<!--]-->';
 else {
  const cards=[...body.matchAll(/<div class="emf-assessment-card">[\s\S]*?<\/div><\/div>/g)];assert.equal(cards.map(row=>row[0]).join(''),body,'Complete native collapsed card grammar');
  projected='<!--[-1--><!--[-->'+cards.map(row=>{
   let card=row[0].replace(/data-emf-assessment-id="([^"]*)"/g,(_,value:string)=>'data-emf-assessment-id="'+decode(value).replace(/[&<"]/g,char=>char==='&'?'&amp;':char==='<'?'&lt;':'&quot;')+'"');
   const info=/<span class="emf-assessment-date">([^<]*)<\/span>\n            (<span class="emf-assessment-label">[^<]*<\/span>)?\n            (<span class="emf-assessment-consultant">[^<]*<\/span>)?/;
   assert.ok(info.test(card));card=card.replace(info,(_,date:string,label:string|undefined,consultant:string|undefined)=>'<span class="emf-assessment-date">'+date+'</span>\n            '+(label?'<!--[0-->'+label.replace(/>([^<]*)<\/span>/,(_m:string,value:string)=>'>'+text(decode(value))+'</span>')+'<!--]-->':'<!--[-1--><!--]-->')+'\n            '+(consultant?'<!--[0-->'+consultant.replace(/>([^<]*)<\/span>/,(_m:string,value:string)=>'>'+text(decode(value))+'</span>')+'<!--]-->':'<!--[-1--><!--]-->'));
   const badge=/<span class="emf-badge emf-badge-([a-z]+)">[^<]*<\/span>/;assert.ok(badge.test(card));card=card.replace(badge,(value,color:string)=>(color==='none'?'<!--[-1-->':'<!--[0-->')+value+'<!--]-->');
   assert.ok(card.endsWith('</div></div>'));return card.slice(0,-'</div>'.length)+'<!--[-1--><!--]--></div>';
  }).join('')+'<!--]--><!--]-->';
 }
 return '<!--[--><!--[-1--><!--]-->'+head+projected+ending+'<!--]-->';
}
function tree(n:Node):unknown{return n.nodeType===Node.ELEMENT_NODE?{tag:(n as Element).tagName,namespace:(n as Element).namespaceURI,attributes:[...(n as Element).attributes].map(a=>[a.name,a.value]),children:[...n.childNodes].map(tree)}:{type:n.nodeType,text:n.nodeValue};}
export function expectedEMFComparisonReceipt<T extends {raw:string;dom:unknown}>(original:T):T{
 const native=document.createElement('div');native.innerHTML=original.raw;assert.deepEqual(tree(native),original.dom,'Whole immutable original DOM must match original raw before finite expectation transport');
 const result=structuredClone(original),raw=expectedEMFEditorHTML(original.raw),expected=document.createElement('div');expected.innerHTML=raw;result.raw=raw;result.dom=tree(expected);return result;
}
