import assert from 'node:assert/strict';
import {restoreWearableStructureStyles} from './wearable-structure-style-inverse.js';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import postcss from 'postcss';
import {compileWearablePresentationStyles,wearablePresentationOwnership} from '../../scripts/wearable-presentation-style-ownership.mjs';
import {wearableEntryOwnership} from '../../scripts/wearable-entry-style-ownership.mjs';
const records=JSON.parse(readFileSync(path.join(import.meta.dirname,'../fixtures/wearable-presentation-style-bodies.json'),'utf8')) as {edits:{selector:string;condition:string|null;before:string;after:string;scope:'strip'|'detail'}[]};
/** Restore only the exactly qualified bodies outside a prior suite's owner. */
export function restoreWearablePresentationBodies(css:string,scope:'all'|'strip'|'detail'){
 css=restoreWearableStructureStyles(css);
 const edits:{start:number;end:number;before:string;after:string}[]=[];
 for(const record of records.edits){
  const hits:postcss.Rule[]=[];postcss.parse(css).walkRules(rule=>{if(rule.selector===record.selector&&(rule.parent?.type==='atrule'?rule.parent.params:null)===record.condition)hits.push(rule);});
  assert.equal(hits.length,1,'Exact single receiver and media condition required');const rule=hits[0]!;
  assert.equal(rule.parent?.type,record.condition===null?'root':'atrule');if(rule.parent?.type==='atrule')assert.equal(rule.parent.name,'media');
  const start=rule.source!.start!.offset!+rule.selector.length+(rule.raws.between||'').length+1,end=rule.source!.end!.offset!-1;
  assert.equal(css.slice(start,end),record.before,'Exact compiled ordered declarations/value/priority/raw body required');
  if(scope==='all'||record.scope===scope)edits.push({start,end,before:record.before,after:record.after});
 }
 assert.equal(edits.length,scope==='all'?78:scope==='strip'?46:32);let restored=css;
 for(const e of edits.sort((a,b)=>b.start-a.start))restored=restored.slice(0,e.start)+e.after+restored.slice(e.end);
 return restored;
}
async function qualified(...args:Parameters<typeof compileWearablePresentationStyles>){
 const result=await compileWearablePresentationStyles(...args);
 assert.equal(wearablePresentationOwnership.receivers.length,213);assert.equal(wearablePresentationOwnership.declarationCount,810);
 assert.deepEqual(wearablePresentationOwnership.receivers.slice(0,33),wearableEntryOwnership.receivers);
 assert.deepEqual(result.receivers.map(row=>[row.utility,row.selector,row.condition]),wearablePresentationOwnership.receivers);
 restoreWearableStructureStyles(result.css);
 return {...result,receivers:result.receivers.slice(0,111)};
}
export async function compileLegacyWearableEntryStyles(...args:Parameters<typeof compileWearablePresentationStyles>){const result=await qualified(...args);return {...result,css:restoreWearablePresentationBodies(result.css,'all'),receivers:result.receivers.slice(0,33)};}
export async function compileLegacyWearableStripStyles(...args:Parameters<typeof compileWearablePresentationStyles>){const result=await qualified(...args);return {...result,css:restoreWearablePresentationBodies(result.css,'detail'),receivers:result.receivers.slice(0,79)};}
export async function compileLegacyWearableDetailStyles(...args:Parameters<typeof compileWearablePresentationStyles>){const result=await qualified(...args);return {...result,css:restoreWearablePresentationBodies(result.css,'strip'),receivers:[...result.receivers.slice(0,33),...result.receivers.slice(79)]};}
