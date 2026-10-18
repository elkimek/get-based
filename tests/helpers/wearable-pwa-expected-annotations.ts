import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {renderWearableDetailView,type WearableDetailView,type WearableManualEntriesView,type WearableManualEntryView} from '../../js/wearable-detail-presentation.js';
import {renderWearableManualLog,type ManualLogInput} from '../../js/wearables-entry-presentation.js';
/** Expected-only annotation oracle. Presentation facts come from immutable native
 * HTML; current genuine owners supply their exact compiler coordinates. Removing
 * only those coordinates must reproduce every original serialized byte. Actual
 * browser HTML is never rewritten, parsed into equivalence or normalized here. */
const sdkAnchors=new Set(['','[',']','[!','[-1',...Array.from({length:21},(_,i)=>'['+i)]);
function text(node:Element|null):string {assert(node,'Expected native presentation node');return node.textContent??'';}
function required(root:ParentNode,selector:string):Element {const found=root.querySelectorAll(selector);assert.equal(found.length,1,'Exactly one native '+selector);return found[0]!;}
function commentFreeExpected(raw:string):string {return raw.replace(/<!--([\s\S]*?)-->/g,(_whole,value:string)=>{assert(sdkAnchors.has(value),'Only existing source-compiler anchor values');return '';});}
function manualView(root:Element):WearableManualEntriesView|null {
 const section=root.querySelector('.wearable-manual-entries');if(!section)return null;
 const metric=required(section,'[data-wearable-action="open-detail-manual-add"]').getAttribute('data-wearable-metric');assert(metric);
 if(section.classList.contains('wearable-manual-entries-compact'))return {kind:'compact-empty',metric};
 if(section.querySelector('.wearable-manual-entries-empty'))return {kind:'empty',metric};
 const count=Number(text(required(section,'.wearable-manual-entries-count'))),rows:WearableManualEntryView[]=[];
 for(const row of section.querySelectorAll('.wearable-manual-entry')){
  const unit=row.querySelector('.wearable-manual-entry-unit'),value=required(row,'.wearable-manual-entry-val'),tags=row.querySelector('.wearable-manual-entry-tags'),note=row.querySelector('.wearable-manual-entry-note'),remove=required(row,'.wearable-manual-entry-del');
  const first=value.firstChild;assert(first?.nodeType===3&&first.nodeValue!==null);let literal=first.nodeValue;if(unit){assert(literal.endsWith(' '));literal=literal.slice(0,-1);}
  const date=row.getAttribute('data-entry-date'),deleteLabel=remove.getAttribute('aria-label'),deleteDate=remove.getAttribute('data-wearable-date'),rowMetric=remove.getAttribute('data-wearable-metric');assert(date&&deleteLabel&&deleteDate&&rowMetric);
  rows.push({date,shortDate:text(required(row,'.wearable-manual-entry-date')),value:literal,unit:unit?text(unit):null,tags:tags?[...tags.querySelectorAll('.wearable-manual-entry-tag')].map(text):null,note:note?text(note):null,deleteLabel,deleteDate,metric:rowMetric});
 }
 assert.equal(rows.length,count);return {kind:'list',metric,count,rows};
}
function detailView(root:Element):WearableDetailView {
 const heading=required(root,'h3'),sub=heading.querySelector('span'),first=heading.firstChild;assert(first?.nodeType===3&&first.nodeValue!==null);let label=first.nodeValue;if(sub){assert(label.endsWith(' '));label=label.slice(0,-1);}
 const unit=required(root,'.modal-unit'),caption=unit.firstChild;assert(caption?.nodeType===3&&caption.nodeValue!==null);
 const facts=/^\n      (.*?)( · .*? vs baseline)? · (.*?) 30d\n      \n    $/.exec(caption.nodeValue);assert(facts,'Exact original caption grammar');
 assert.equal(root.querySelectorAll('.wearable-modal-source-swap,.wearable-detail-empty,.wearable-detail-emf-hint').length,0,'These immutable manual metric states have no provider swap or empty/sleep notice');
 const ranges=[...root.querySelectorAll('.wearable-detail-range button')].map(button=>{const metric=button.getAttribute('data-wearable-metric'),range=button.getAttribute('data-wearable-range');assert(metric&&range);return {active:button.classList.contains('active'),metric,range,label:text(button)};});assert.equal(ranges.length,4);
 const stats=[...root.querySelectorAll('.wearable-detail-stat')].map(stat=>{const sub=stat.querySelector('.wearable-detail-stat-sub');return {tooltip:stat.getAttribute('title'),label:text(required(stat,'.wearable-detail-stat-label')),value:text(required(stat,'.wearable-detail-stat-val')),sub:sub?text(sub):null};});
 return {label,subLabel:sub?text(sub):null,sourceName:facts[1]!,delta:facts[2]??'',trend:facts[3]!,sourceSwap:null,ranges,emptyHint:null,stats,manualEntries:manualView(root),emfHint:null};
}
function manualForm(original:Element):string {
 const form=required(original,'form.wearable-manual-add-form'),kind=form.getAttribute('data-wearable-kind'),metric=form.getAttribute('data-wearable-metric');assert(kind==='bp'&&metric==='bp_systolic','Qualified original open form is the blood-pressure invalid-entry state');
 const date=required(form,'#wlad-date').getAttribute('value');assert(date);
 const note=required(form,'textarea').id,groups=required(form,'.wearable-log-tags');
 const chips=[...groups.querySelectorAll('button')].map(button=>{const tag=button.getAttribute('data-tag');assert(tag);return {tag,label:text(button)};});
 const input:ManualLogInput={mode:'detail-bp',today:date,form:()=>`data-wearable-form="detail-manual-add" data-wearable-metric="${metric}" data-wearable-kind="${kind}"`,tags:()=>({chips}),note:()=>({id:note}),cancel:()=> 'data-wearable-action="close-detail-manual-add"'};
 return renderWearableManualLog(input);
}
export function expectedWearablePwaRaw(originalRaw:string):string {
 const dom=new JSDOM('<!doctype html><main></main>');try{
  const document=dom.window.document,original=required(document,'main');original.innerHTML=originalRaw;
  assert.equal(original.querySelectorAll('canvas').length,1);const nativeCanvas=required(original,'canvas#chart-modal');assert([...nativeCanvas.attributes].every(attribute=>['id','style','width','height'].includes(attribute.name)&&attribute.namespaceURI===null));
  const expected=document.createElement('main');expected.innerHTML=renderWearableDetailView(detailView(original));
  const canvas=required(expected,'canvas#chart-modal');assert.equal(canvas.outerHTML,'<canvas id="chart-modal"></canvas>','Pristine owner supplies only the authored native canvas');
  for(const attribute of nativeCanvas.attributes)canvas.setAttribute(attribute.name,attribute.value);
  const slot=original.querySelector('#wearable-manual-add-slot');if(slot?.childNodes.length)required(expected,'#wearable-manual-add-slot').innerHTML=manualForm(slot);
  // The unchanged tooltip owner removes the active delete control's title and
  // appends aria-describedby; retain that exact captured interaction state.
  for(const active of original.querySelectorAll('[aria-describedby]')){
   assert(active.matches('button.wearable-manual-entry-del[data-wearable-action="delete-detail-manual-entry"]'));
   assert.equal(active.getAttribute('aria-describedby'),'app-tooltip');assert.equal(active.getAttribute('title'),null);
   const date=active.getAttribute('data-wearable-date'),metric=active.getAttribute('data-wearable-metric');assert(date&&metric);
   const target=required(expected,`button.wearable-manual-entry-del[data-wearable-date="${date}"][data-wearable-metric="${metric}"]`);
   assert.equal(target.getAttribute('title'),'Delete this reading');target.removeAttribute('title');target.setAttribute('aria-describedby','app-tooltip');
   assert.deepEqual([...target.attributes].map(a=>[a.namespaceURI,a.name,a.value]),[...active.attributes].map(a=>[a.namespaceURI,a.name,a.value]));
  }
  const annotated=expected.innerHTML;assert.equal(commentFreeExpected(annotated),originalRaw,'Pristine same-fact genuine SSR differs only by its exact SDK comments, with all original raw bytes unchanged');return annotated;
 }finally{dom.window.close();}
}
