import {readFileSync} from 'node:fs';
import path from 'node:path';
import {describe,it,expect} from 'vitest';
import assert from 'node:assert/strict';
import postcss from 'postcss';
import {wearableEntryOwnership} from '../scripts/wearable-entry-style-ownership.mjs';
import {compileLegacyWearableEntryStyles as compileWearableEntryStyles} from './helpers/wearable-presentation-style-inverse.js';
const input=readFileSync('css/wearables.base.css','utf8');
const fixture=JSON.parse(readFileSync('tests/fixtures/wearable-entry-styles-original.json','utf8')) as {original:string;edits:Array<{before:string;selector:string;condition:string|null}>;receivers:Array<{selector:string;condition:string|null;declarations:Array<[string,string,boolean]>}>};
function declarations(source:string){const rows:unknown[]=[];postcss.parse(source).walkRules(rule=>{const conditions:string[]=[];for(let parent=rule.parent;parent&&parent.type!=='root';parent=parent.parent){if(parent.type!=='atrule')throw new Error('Unexpected native owner');conditions.unshift(parent.name+' '+parent.params);}rows.push({selector:rule.selector,conditions,declarations:rule.nodes.map(node=>node.type==='decl'?[node.prop,node.value,node.important===true]:node.toString())});});return rows;}
function foreignInverse(source:string):string {
 const edits:Array<{start:number;end:number;before:string}>=[];
 postcss.parse(source).walkRules(rule=>{
  let condition:string|null=null;
  if(rule.parent?.type==='atrule')condition=rule.parent.params;
  const original=fixture.edits.find(row=>row.selector===rule.selector&&row.condition===condition);
  if(!original)return;
  const start=rule.source?.start?.offset,end=rule.source?.end?.offset;
  assert.equal(typeof start,'number');assert.equal(typeof end,'number');
  const open=start!+rule.selector.length+(rule.raws.between||'').length;
  assert.equal(source[open],'{');assert.equal(source[end!-1],'}');
  edits.push({start:open+1,end:end!-1,before:original.before});
 });
 assert.equal(edits.length,33);
 let result=source;
 for(const edit of edits.sort((a,b)=>b.start-a.start))result=result.slice(0,edit.start)+edit.before+result.slice(edit.end);
 return result;
}
async function compiled(source=input){return compileWearableEntryStyles(source,path.resolve('css/wearables.base.css'),process.cwd());}
describe('Wearable entry exact native recipe ownership',()=>{
 it('expands exactly33rules139declarations with exact native declarations and foreign bytes',async()=>{const result=await compiled();expect(wearableEntryOwnership.receivers).toHaveLength(33);expect(fixture.receivers).toHaveLength(33);expect(wearableEntryOwnership.declarationCount).toBe(139);expect(foreignInverse(result.css)).toBe(fixture.original);expect(declarations(result.css)).toEqual(declarations(fixture.original));expect(result.receivers).toHaveLength(33);});
 it('retains grouped coarse Add/Save/Cancel and all foreign media/keyframes bytes',async()=>{const result=await compiled();expect(result.css).toContain('.wearable-manual-add-btn,\n  .wearable-log-save,\n  .wearable-log-cancel { min-height: 44px; padding: 8px 14px; }');expect(foreignInverse(result.css)).toBe(fixture.original);});
 it.each(['missing apply','unknown recipe','changed media','foreign declaration','changed shorthand'])('rejects corruption: %s',async kind=>{
  let bad=input;if(kind==='missing apply')bad=bad.replace('@apply gb:wearable-entry-01;','');else if(kind==='unknown recipe')bad=bad.replace('@utility wearable-entry-01','@utility wearable-entry-unknown');else if(kind==='changed media')bad=bad.replace('@media (pointer: coarse)','@media (pointer: fine)');else if(kind==='foreign declaration')bad=bad.replace('font: inherit;','font: initial;');else bad=bad.replace('flex: 1;','flex: 2;');
  let result;
  try { result=await compiled(bad); } catch(error) { expect(error).toBeInstanceOf(Error); return; }
  expect(declarations(result.css)).not.toEqual(declarations(fixture.original));
 });
});
