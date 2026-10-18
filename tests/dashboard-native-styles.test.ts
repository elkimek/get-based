import fs from 'node:fs';
import path from 'node:path';
import postcss from 'postcss';
import {expect, it} from 'vitest';
import {compileDashboardLabMarkerDataStyles,compileDashboardLabMarkerWidgetStyles} from '../scripts/dashboard-lab-markers-style-ownership.mjs';
import {compileDashboardWelcomeStyles} from '../scripts/dashboard-welcome-style-ownership.mjs';
import originals from './fixtures/dashboard-native-style-original.json' with {type: 'json'};
import {restoreReviewedBiometricCss} from './helpers/dashboard-biometric-style-inverse.js';
const root=process.cwd();
const lanes=[
    ['data', compileDashboardLabMarkerDataStyles, 127, 472],
    ['widgets', compileDashboardLabMarkerWidgetStyles, 85, 232],
    ['core', (input:string,file:string,base:string)=>compileDashboardWelcomeStyles('greeting',input,file,base), 12, 47],
    ['welcome', (input:string,file:string,base:string)=>compileDashboardWelcomeStyles('welcome',input,file,base), 2, 7],
] as const;
for(const [lane,compile,count,declarations]of lanes){
 const record=originals[lane],file=path.join(root,'css',record.name+'.base.css'),input=fs.readFileSync(file,'utf8');
 async function exact(source:string){const result=await compile(source,file,root);expect(lane==='data'?restoreReviewedBiometricCss(result.css):result.css).toBe(record.original);return result;}
 it('preserves every compiled '+lane+' stylesheet byte, complete cascade and all original ownership',async()=>{
  const result=await exact(input);expect(record.records).toHaveLength(count);expect(record.declarationCount).toBe(declarations);
  expect(result.receivers.filter(receiver=>receiver.utility.startsWith('dashboard-native-'))).toHaveLength(count);
  const tree=postcss.parse(input);let ordinary=0;tree.walkRules(rule=>{let p=rule.parent;while(p&&p.type!=='root'){if(p.type==='atrule'&&(p.name==='utility'||p.name.endsWith('keyframes')))return;p=p.parent;}ordinary+=rule.nodes.filter(node=>node.type==='decl').length;});expect(ordinary).toBe(0);
 });
 it.each(record.records)('rejects '+lane+' recipe $utility mutation against the independent complete native stylesheet',async(receiver)=>{
   const marker='@utility '+receiver.utility+' {';expect(input.split(marker)).toHaveLength(2);
   const tree=postcss.parse(input),utilities:postcss.AtRule[]=[];tree.walkAtRules('utility',node=>{if(node.params===receiver.utility)utilities.push(node);});
   expect(utilities).toHaveLength(1);const declaration=utilities[0]!.nodes?.find(node=>node.type==='decl');
   expect(declaration?.type).toBe('decl');if(declaration?.type!=='decl')throw new Error('Native declaration required');
   declaration.value+='__changed';const changed=tree.toString();expect(changed).not.toBe(input);
   await expect(exact(changed)).rejects.toThrow();
 });
 for(const [label,change] of [
  ['missing recipe',(source:string)=>source.replace('@utility '+record.records[0]!.utility+' {','@utility unknown {')],
  ['missing receiver',(source:string)=>source.replace('@apply gb:'+record.records[0]!.utility+';','color: red;')],
  ['foreign value',(source:string)=>source.replace('/*','/* foreign native bytes ')],
  ['extra rule',(source:string)=>source+'\n.unreviewed-native {color:red;}'],
 ] as const)it('rejects '+lane+' '+label,async()=>{const changed=change(input);expect(changed).not.toBe(input);await expect(exact(changed)).rejects.toThrow();});
}
