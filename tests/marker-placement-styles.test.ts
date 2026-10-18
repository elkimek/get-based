import {originalPlacementStyleBytes} from './marker-detail-result-style-receipts.js';
import {compileMarkerDetailCompleteStyles as compileManualMarkerEntryStyles} from '../scripts/marker-detail-complete-style-ownership.mjs';
import {describe,expect,it} from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import postcss,{type ChildNode} from 'postcss';
import original from './fixtures/marker-placement-styles-original.json' with {type:'json'};
import foreign from './fixtures/marker-placement-styles-foreign.json' with {type:'json'};
import {markerDetailFormOwnership} from '../scripts/manual-marker-entry-style-ownership.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const inputPath=path.join(root,'css/marker-detail-modal.base.css');
function native(node:ChildNode):unknown {
  if(node.type==='decl')return ['decl',node.prop,node.value,node.important===true];
  if(node.type==='rule')return ['rule',node.selector,node.nodes.map(native)];
  if(node.type==='atrule')return ['atrule',node.name,node.params,node.nodes?.map(native)??null];
  if(node.type==='comment')return ['comment',node.text];
  throw new Error('Unknown native CSS node');
}
function foreignBytes(source:string):string {
  const edits:{start:number;end:number}[]=[];
  postcss.parse(source).walkRules(rule=>{
    const media=rule.parent?.type==='atrule'&&rule.parent.name==='media'?rule.parent.params:null;
    if(!markerDetailFormOwnership.receivers.some(([,selector,condition])=>selector===rule.selector&&condition===media))return;
    const start=rule.source?.start?.offset,end=rule.source?.end?.offset;
    if(typeof start!=='number'||typeof end!=='number'||source[end-1]!=='}')throw new Error('Missing exact CSS source offsets');
    const open=start+rule.selector.length+(rule.raws.between||'').length;
    if(source[open]!=='{')throw new Error('Incorrect CSS opening coordinate');
    edits.push({start:open+1,end:end-1});
  });
  for(const edit of edits.sort((a,b)=>b.start-a.start))source=source.slice(0,edit.start)+source.slice(edit.end);
  return source;
}
describe('marker placement in-place Tailwind ownership',()=>{
  it('preserves the entire original rule/media/declaration order and values, plus every foreign source byte',async()=>{
    const input=await fs.readFile(inputPath,'utf8');
    const result=await compileManualMarkerEntryStyles(input,inputPath,root);
    expect(postcss.parse(await originalPlacementStyleBytes(result.css)).nodes.map(native)).toEqual(original);
    expect(foreignBytes(await originalPlacementStyleBytes(result.css))).toBe(foreign);
    let wanted=input;
    for(const edit of [...result.edits].sort((a,b)=>b.start-a.start)){
      expect(input.slice(edit.start,edit.end)).toBe(edit.before);
      wanted=wanted.slice(0,edit.start)+edit.after+wanted.slice(edit.end);
    }
    expect(result.css).toBe(wanted);
  });
  it.each([
    ['unknown utility',(input:string)=>input.replace('@apply gb:marker-placement-summary-row;','@apply gb:unknown-placement;')],
    ['duplicate receiver',(input:string)=>input+'\n.gb-detail-category-row { @apply gb:marker-placement-summary-row; }'],
    ['foreign selector',(input:string)=>input.replace('.gb-detail-category-row {',' .foreign-placement {')],
    ['wrong media',(input:string)=>input.replaceAll('@media (max-width: 640px)','@media (max-width: 641px)')],
  ])('rejects %s rather than changing a foreign owner',async(_name,change)=>{
    const input=await fs.readFile(inputPath,'utf8');
    await expect(compileManualMarkerEntryStyles(change(input),inputPath,root)).rejects.toThrow();
  });
});
