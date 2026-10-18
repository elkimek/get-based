import {restoreCompleteRecipeBodies} from './marker-detail-complete-receipts.js';
import {customMarkerOwnership} from '../scripts/custom-marker-style-ownership.mjs';
import fs from 'node:fs/promises';
import postcss from 'postcss';
import {isDeepStrictEqual} from 'node:util';
import {markerDetailResultsOwnership} from '../scripts/marker-detail-results-style-ownership.mjs';

// Restore formatting only after exact rule ancestry, declaration/order/priority and closed cardinality gates.
// Existing form tests then compare their original foreign fixture bytes without weakening any rule value.
export async function restoreResultRecipeBodies(output: string): Promise<string> {
  output = await restoreCompleteRecipeBodies(output);
  const native=await fs.readFile(new URL('./fixtures/marker-detail-results-original.css',import.meta.url),'utf8');
  const old=postcss.parse(native);const edits:{start:number;end:number;body:string}[]=[];
  postcss.parse(output).walkRules(rule=>{
    const media=rule.parent?.type==='atrule'?rule.parent.params:null;
    if(!markerDetailResultsOwnership.receivers.some(([,selector,condition])=>selector===rule.selector&&condition===media))return;
    const matches:typeof rule[]=[];
    old.walkRules(candidate=>{if(candidate.selector===rule.selector&&(candidate.parent?.type==='atrule'?candidate.parent.params:null)===media)matches.push(candidate);});
    if(matches.length!==1)throw new Error('Missing unique native result rule');const original=matches[0]!;
    const declarations=(row:typeof rule)=>row.nodes.map(node=>node.type==='decl'?[node.prop,node.value,!!node.important]:[node.type,node.toString()]);
    if(!isDeepStrictEqual(declarations(rule),declarations(original)))throw new Error('Changed native result declarations');
    const start=original.source!.start!.offset!+original.selector.length+(original.raws.between||'').length+1;
    edits.push({start:rule.source!.start!.offset!+rule.selector.length+(rule.raws.between||'').length+1,end:rule.source!.end!.offset!-1,
      body:native.slice(start,original.source!.end!.offset!-1)});
  });
  if(edits.length!==72)throw new Error('Incomplete native result receiver inventory');
  for(const edit of edits.reverse())output=output.slice(0,edit.start)+edit.body+output.slice(edit.end);
  return output;
}

// Placement's immutable fixture predates the separately accepted five-rule Custom suffix.
// Validate the exact complete captured suffix before projecting that finite addition.
export async function originalPlacementStyleBytes(output: string): Promise<string> {
  const qualified=await restoreResultRecipeBodies(output);
  const native=await fs.readFile(new URL('./fixtures/marker-detail-results-original.css',import.meta.url),'utf8');
  const boundary=native.indexOf('/* Fixed Custom Marker presentation;');
  if(boundary<0 || native.indexOf('/* Fixed Custom Marker presentation;',boundary+1)!==-1)throw new Error('Missing unique Custom suffix');
  const previous=await fs.readFile(new URL('./fixtures/custom-marker-styles-original.css',import.meta.url),'utf8');
  if(native.slice(0,boundary)!==previous+'\n')throw new Error('Changed exact Custom separator/prefix');
  const suffix=native.slice(boundary-1);const rules=postcss.parse(suffix).nodes;
  if(rules.length!==6 || rules[0]?.type!=='comment' || rules.slice(1).some(rule=>rule.type!=='rule'))throw new Error('Invalid Custom suffix inventory');
  if(customMarkerOwnership.receivers.length!==5 || customMarkerOwnership.declarationCount!==11)throw new Error('Changed Custom ownership');
  let count=0;rules.slice(1).forEach((rule,index)=>{
    if(rule.type!=='rule' || rule.selector!==customMarkerOwnership.receivers[index]?.[1] || rule.nodes.some(node=>node.type!=='decl'))throw new Error('Changed Custom scope/order');
    count+=rule.nodes.length;
  });
  if(count!==11)throw new Error('Changed Custom declaration cardinality');
  if(!qualified.endsWith(suffix))throw new Error('Changed accepted Custom source suffix');
  return qualified.slice(0,qualified.length-suffix.length);
}
