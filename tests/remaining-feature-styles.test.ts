import fs from 'node:fs';
import path from 'node:path';
import postcss from 'postcss';
import {expect,it} from 'vitest';
import {compileRemainingFeatureStyles} from '../scripts/remaining-feature-style-ownership.mjs';
import {compilePIIReviewStyles} from '../scripts/pii-review-style-ownership.mjs';
import {compileDnaManualStyles} from '../scripts/dna-manual-style-ownership.mjs';
import {compileMarkerDetailCompleteStyles} from '../scripts/marker-detail-complete-style-ownership.mjs';
import originals from './fixtures/remaining-feature-style-original.json' with {type:'json'};
const root=process.cwd();
const lanes=[['protection',3,11],['genetics',11,35],['marker',17,87],['import',1,4],['nutrition',4,17],['recommendations',18,70]] as const;
for(const [lane,count,decls]of lanes){
 const record=originals[lane],file=path.join(root,'css',record.name+'.base.css'),input=fs.readFileSync(file,'utf8');
 async function exact(source:string){const result=lane==='protection'?await compilePIIReviewStyles(source,file,root):lane==='genetics'?await compileDnaManualStyles(source,file,root):lane==='marker'?await compileMarkerDetailCompleteStyles(source,file,root):await compileRemainingFeatureStyles(lane,source,file,root);expect(result.css).toBe(record.original);return result;}
 it('preserves all '+lane+' native bytes, selectors, conditions, order and priorities',async()=>{
  const result=await exact(input);expect(record.records).toHaveLength(count);expect(record.declarationCount).toBe(decls);expect(result.receivers.filter(row=>row.utility.startsWith('feature-native-'))).toHaveLength(count);
  let ordinary=0;postcss.parse(input).walkRules(rule=>{for(let p=rule.parent;p&&p.type!=='root';p=p.parent)if(p.type==='atrule'&&(p.name==='utility'||p.name.endsWith('keyframes')))return;ordinary+=rule.nodes.filter(node=>node.type==='decl').length;});expect(ordinary).toBe(0);
 });
 it('rejects each '+lane+' recipe value mutation without changing the inventory count',async()=>{
  for(const receiver of record.records){const tree=postcss.parse(input),utilities:postcss.AtRule[]=[];tree.walkAtRules('utility',node=>{if(node.params===receiver.utility)utilities.push(node);});expect(utilities).toHaveLength(1);const declaration=utilities[0]!.nodes?.find(node=>node.type==='decl');if(declaration?.type!=='decl')throw new Error('Exact native declaration required');declaration.value+='__changed';const changed=tree.toString();expect(changed).not.toBe(input);await expect(exact(changed)).rejects.toThrow();}
 });
 for(const [label,change]of [
  ['missing receiver',(s:string)=>s.replace('@apply gb:'+record.records[0]!.utility+';','display: none;')],
  ['missing recipe',(s:string)=>s.replace('@utility '+record.records[0]!.utility+' {','@utility unreviewed {')],
  ['foreign comment',(s:string)=>s+'\n/* changed foreign bytes */'],
  ['extra rule',(s:string)=>s+'\n.foreign-unreviewed { color:red; }'],
 ]as const)it('rejects '+lane+' '+label,async()=>{const changed=change(input);expect(changed).not.toBe(input);await expect(exact(changed)).rejects.toThrow();});
}
