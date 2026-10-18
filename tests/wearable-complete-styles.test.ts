import {readFileSync} from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import postcss from 'postcss';
import {expect,it} from 'vitest';
import {compileWearablePresentationStyles,wearablePresentationOwnership,wearableStructureOwnership} from '../scripts/wearable-presentation-style-ownership.mjs';
import {restoreWearableStructureStyles} from './helpers/wearable-structure-style-inverse.js';

const inputPath=path.resolve('css/wearables.base.css'),input=readFileSync(inputPath,'utf8');
const native=readFileSync('tests/fixtures/wearable-structure-native.css','utf8');
function signature(css:string):unknown[]{
  const rows:unknown[]=[];
  postcss.parse(css).walk(node=>{
    if(node.type==='rule')rows.push(['rule',node.selector]);
    else if(node.type==='atrule')rows.push(['group',node.name,node.params]);
    else if(node.type==='decl')rows.push(['decl',node.prop,node.value,node.important===true]);
  });
  return rows;
}
async function qualify(source:string){
  const result=await compileWearablePresentationStyles(source,inputPath,process.cwd());
  expect(result.receivers.map(row=>[row.utility,row.selector,row.condition])).toEqual(wearablePresentationOwnership.receivers);
  expect(signature(result.css)).toEqual(signature(native));
  expect(restoreWearableStructureStyles(result.css)).toBe(native);
  return result;
}
it('pins the independently frozen native stylesheet and compiles all213owners/810declarations with the entire cascade intact',async()=>{
  expect(crypto.createHash('sha256').update(native).digest('hex')).toBe('700e3c2e36ada1b3926b7791ce7ccbc81235bb76eff82bdc250ac1919e5def5b');
  expect(wearableStructureOwnership.receivers).toHaveLength(102);
  expect(wearableStructureOwnership.declarationCount).toBe(346);
  expect(wearablePresentationOwnership.receivers).toHaveLength(213);
  expect(wearablePresentationOwnership.declarationCount).toBe(810);
  await qualify(input);
});
it('leaves no ordinary native Wearables declarations outside its Tailwind recipes',()=>{
  const remaining:string[]=[];
  postcss.parse(input).walkDecls(declaration=>{
    let owned=false;
    for(let parent:postcss.AnyNode|undefined=declaration.parent;parent;parent=parent.parent){
      if(parent.type==='atrule'&&['utility','keyframes','-webkit-keyframes'].includes(parent.name))owned=true;
    }
    if(!owned)remaining.push(declaration.toString());
  });
  expect(remaining).toEqual([]);
});
it.each(wearableStructureOwnership.receivers)('rejects an actual declaration change in semantic recipe %s',async(utility)=>{
  const tree=postcss.parse(input);let changed=false;
  tree.walkAtRules('utility',rule=>{
    if(rule.params!==utility)return;
    const declaration=rule.nodes?.find(node=>node.type==='decl');
    if(declaration?.type!=='decl')throw new Error('Expected an ordinary owned declaration');
    declaration.value=declaration.value==='initial'?'inherit':'initial';changed=true;
  });
  expect(changed).toBe(true);
  const source=tree.toString();expect(source).not.toBe(input);
  await expect(qualify(source)).rejects.toThrow();
});
it.each([
  ['missing apply',(source:string)=>source.replace('@apply gb:wearable-structure-strip;','')],
  ['foreign apply',(source:string)=>source.replace('@apply gb:wearable-structure-strip;','@apply gb:foreign-structure;')],
  ['foreign declaration',(source:string)=>source.replace('@apply gb:wearable-structure-strip;','@apply gb:wearable-structure-strip; color:red;')],
  ['duplicate owner',(source:string)=>source+'\n.wearable-strip {color:red;}\n'],
  ['media boundary',(source:string)=>source.replace('@media (max-width: 600px)','@media (max-width: 599px)')],
  ['changed explanatory note',(source:string)=>source.replace('Reserve enough bottom margin','Reserve unrelated margin')],
  ['foreign rule',(source:string)=>source+'\n.foreign-wearable {color:red;}\n'],
] as const)('rejects whole-stylesheet ownership/cascade corruption: %s',async(_name,mutate)=>{
  const changed=mutate(input);expect(changed).not.toBe(input);
  await expect(qualify(changed)).rejects.toThrow();
});
