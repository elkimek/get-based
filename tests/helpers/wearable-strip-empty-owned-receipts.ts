import inverse from '../fixtures/wearable-strip-controller-inverse.json' with {type:'json'};
import assert from 'node:assert/strict';
/** Fixed independent native card grammar. Apply only to immutable ORIGINAL expectations. */
const card=/<div class="wearable-card wearable-card-empty" data-empty-metric="([^"]*)" (data-wearable-action="open-manual-log" data-wearable-metric="[^"]*" role="button" tabindex="0"|aria-disabled="true") aria-label="Log ([^"]*) manually">\n    <div class="wearable-card-top">\n      <span class="wearable-metric-name">([^<]*)(?: <span class="wearable-metric-sub">([^<]*)<\/span>)?<\/span>\n    <\/div>\n    <div class="wearable-value-row wearable-value-row-empty">\n      <span class="wearable-value wearable-value-dash">–<\/span>\n    <\/div>\n    <div class="wearable-card-bottom">\n      <div class="wearable-empty-cta">\+ Log<\/div>\n    <\/div>\n  <\/div>/g;
const nativeEntities:Record<string,string>={'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&#39;':"'"};
const decode=(value:string)=>value.replace(/&amp;|&lt;|&gt;|&quot;|&#39;/g,entity=>nativeEntities[entity]!);
const text=(value:string)=>decode(value).replace(/[&<]/g,ch=>({'&':'&amp;','<':'&lt;'}[ch]!));
const attr=(value:string)=>decode(value).replace(/[&"<]/g,ch=>({'&':'&amp;','"':'&quot;','<':'&lt;'}[ch]!));
export function expectedWearableEmptyHTML(original:string):string {
 let count=0;const expected=original.replace(card,(_whole,metric:string,actions:string,accessible:string,label:string,sub:string|undefined)=>{
  assert.ok(['weight','bp_systolic','rhr'].includes(decode(metric)));const active=actions!=='aria-disabled="true"';
  assert.equal(actions,active?`data-wearable-action="open-manual-log" data-wearable-metric="${metric}" role="button" tabindex="0"`:'aria-disabled="true"');count++;
  const subHTML=sub===undefined?'<!--[-1--><!--]-->':`<!--[0--> <span class="wearable-metric-sub">${text(sub)}</span><!--]-->`;
  return `<!--[--><div class="wearable-card wearable-card-empty" data-empty-metric="${attr(metric)}" ${actions} aria-label="Log ${attr(accessible)} manually">\n    <div class="wearable-card-top">\n      <span class="wearable-metric-name">${text(label)}${subHTML}</span>\n    </div>\n    <div class="wearable-value-row wearable-value-row-empty">\n      <span class="wearable-value wearable-value-dash">–</span>\n    </div>\n    <div class="wearable-card-bottom">\n      <div class="wearable-empty-cta">+ Log</div>\n    </div>\n  </div><!--]-->`;
 });assert.equal(count,(original.match(/class="wearable-card wearable-card-empty"/g)||[]).length,'Complete counted immutable native empty-card grammar');return expected;
}
type NodeRecord={type:number;name?:string;namespace?:string;attributes?:unknown[][];children?:NodeRecord[];text?:string};
const hasClass=(node:NodeRecord,name:string)=>node.type===1&&node.namespace==='http://www.w3.org/1999/xhtml'&&node.attributes?.some(row=>row[1]==='class'&&row[2]===name)===true;
const comment=(text:string):NodeRecord=>({type:8,text});
export function expectedWearableEmptyDOM(original:unknown):unknown {
 const root=structuredClone(original)as NodeRecord;
 function visit(node:NodeRecord):void {
  if(!node.children)return;const children:NodeRecord[]=[];
  for(const child of node.children){
   if(hasClass(child,'wearable-card wearable-card-empty')){
    assert.equal(child.name,'div');assert.ok(child.children);const top=child.children.find(item=>hasClass(item,'wearable-card-top'));assert.ok(top?.children);const name=top.children.find(item=>hasClass(item,'wearable-metric-name'));assert.ok(name?.children);const old=name.children;
    if(old.length===2){assert.equal(old[0]!.type,3);assert.ok(old[0]!.text?.endsWith(' '));assert.ok(hasClass(old[1]!,'wearable-metric-sub'));const prefix=old[0]!.text!.slice(0,-1);name.children=[...(prefix?[{type:3,text:prefix}]:[]),comment('[0'),{type:3,text:' '},old[1]!,comment(']')];}
    else{assert.ok(old.length<=1);if(old.length)assert.equal(old[0]!.type,3);name.children=[...old,comment('[-1'),comment(']')];}
    children.push(comment('['),child,comment(']'));
   }else{visit(child);children.push(child);}
  }node.children=children;
 }visit(root);return root;
}
export function expectedWearableEmptyReceipt(original:Record<string,unknown>):Record<string,unknown>{const expected=structuredClone(original);if(typeof original['raw']==='string'){expected['raw']=expectedWearableEmptyHTML(original['raw']);expected['assignments']=(original['assignments']as string[]).map(expectedWearableEmptyHTML);}if(original['dom'])expected['dom']=expectedWearableEmptyDOM(original['dom']);return expected;}

/** Replay only finite owned lexemes; old expressions come from the immutable existing inverse fixture. */
export function historicalWearableEmptyControllerSource(source:string):string {
 const sub=inverse.edits.filter(edit=>edit.component==='WearableEmptyCard'&&edit.kind==='subLabel');
 const card=inverse.edits.filter(edit=>edit.component==='WearableEmptyCard'&&edit.kind==='card');
 assert.equal(sub.length,1);assert.equal(card.length,1);
 const edits:readonly (readonly [string,string])[]=[
 ["import {qualifyWearableEmptyAction,renderWearableEmptyCardPresentation,wearableEmptyText} from './wearable-strip-empty-presentation.js';\n",''],
 ["  const subLabel = canon.sub ? wearableEmptyText(canon.sub) : null;", "  const subLabel = canon.sub ? "+sub[0]!.after+" : '';"],
 ["  const interactive = opts.interactive !== false;\n  const actionAttrs = interactive\n    ? `${wearableActionAttrs('open-manual-log', { metric: metricId })} role=\"button\" tabindex=\"0\"`\n    : 'aria-disabled=\"true\"';\n","  const actionAttrs = opts.interactive === false\n    ? 'aria-disabled=\"true\"'\n    : `${wearableActionAttrs('open-manual-log', { metric: metricId })} role=\"button\" tabindex=\"0\"`;\n"],
 ["  const metric = wearableEmptyText(metricId);\n  const accessibleLabel = wearableEmptyText(label.toLowerCase());\n  const displayLabel = wearableEmptyText(label);\n  qualifyWearableEmptyAction(metric, interactive, actionAttrs);\n  return renderWearableEmptyCardPresentation({metric, interactive, accessibleLabel, label: displayLabel,\n    sub: metricId === 'bp_systolic' ? null : subLabel});","  return "+card[0]!.after+";"],
 ];let result=source;for(const [after,before]of edits){assert.equal(result.split(after).length,2);result=result.replace(after,before);}return result;
}
