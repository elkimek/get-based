import assert from 'node:assert/strict';
import postcss from 'postcss';
import {dashboardAILensReceivers} from '../../scripts/dashboard-ai-cta-style-ownership.mjs';
import {dashboardGenomeRowsOwnership} from '../../scripts/dashboard-genome-rows-style-ownership.mjs';
// Preserve the accepted Panel foreign-byte oracle; restore only new bodies after exact declarations.
export function restoreGenomeBodies(source:string,original:string):string {return restoreBodies(source,original,dashboardGenomeRowsOwnership.receivers);}
export function restoreLensBodies(source:string,original:string):string {return restoreBodies(source,original,dashboardAILensReceivers);}
function restoreBodies(source:string,original:string,receivers:readonly (readonly [string,string,string|null])[]):string {
 const old=postcss.parse(original),edits:Array<{start:number;end:number;body:string}>=[];
 postcss.parse(source).walkRules(rule=>{
  const condition=rule.parent?.type==='atrule'?rule.parent.params:null;
  if(!receivers.some(([,selector,media])=>selector===rule.selector&&media===condition))return;
  const matches:typeof rule[]=[];old.walkRules(n=>{if(n.selector===rule.selector&&(n.parent?.type==='atrule'?n.parent.params:null)===condition)matches.push(n);});
  assert.equal(matches.length,1);const native=matches[0]!;
  const declarations=(n:typeof rule)=>n.nodes.map(d=>d.type==='decl'?[d.prop,d.value,!!d.important]:[d.type,d.toString()]);assert.deepEqual(declarations(rule),declarations(native));
  const start=rule.source!.start!.offset!+rule.selector.length+(rule.raws.between||'').length+1,end=rule.source!.end!.offset!-1;
  const nativeStart=native.source!.start!.offset!+native.selector.length+(native.raws.between||'').length+1;
  edits.push({start,end,body:original.slice(nativeStart,native.source!.end!.offset!-1)});
 });assert.equal(edits.length,receivers.length);let result=source;for(const e of edits.reverse())result=result.slice(0,e.start)+e.body+result.slice(e.end);return result;
}
