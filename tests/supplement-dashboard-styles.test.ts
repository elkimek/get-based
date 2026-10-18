import {describe,expect,it} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import postcss,{type Node,type Rule} from 'postcss';
import {compileSupplementProfileStyles,supplementProfileOwnership} from '../scripts/supplement-form-style-ownership.mjs';
const root=path.resolve(__dirname,'..'),inputPath=path.join(root,'css/context-profile.base.css');
const input=fs.readFileSync(inputPath,'utf8'), original=fs.readFileSync(path.join(__dirname,'fixtures/supplement-dashboard-original.css'),'utf8');
function fullTree(css:string):unknown {
 const tree=postcss.parse(css);
 function visit(node:Node):unknown {
  if(node.type==='decl'){const decl=node as postcss.Declaration;return ['declaration',decl.prop,decl.value,decl.important===true];}
  if(node.type==='rule'){const rule=node as Rule;return ['rule',rule.selector,rule.nodes.map(visit)];}
  if(node.type==='atrule'){const at=node as postcss.AtRule;return ['at-rule',at.name,at.params,at.nodes?.map(visit)??null];}
  if(node.type==='comment')return ['comment',(node as postcss.Comment).text];
  throw new Error('Unknown CSS node');
 }return tree.nodes.map(visit);
}
function condition(rule:Rule):string|null{return rule.parent?.type==='atrule'?(rule.parent as postcss.AtRule).params:null;}
describe('native supplement semantic styles',()=>{
 it('preserves every original rule, declaration, priority, keyframe and media position',async()=>{
  const result=await compileSupplementProfileStyles(input,inputPath,root);expect(fullTree(result.css)).toEqual(fullTree(original));
 });
 it('copies every foreign source byte and replaces only the original owned bodies',async()=>{
  const result=await compileSupplementProfileStyles(input,inputPath,root),native=postcss.parse(original),source=postcss.parse(input);
  const rules:Rule[]=[];native.walkRules(rule=>{rules.push(rule);});
  const authoredRules:Rule[]=[];source.walkRules(rule=>{if(rule.parent?.type!=='atrule'||(rule.parent as postcss.AtRule).name!=='utility')authoredRules.push(rule);});
  const originals=supplementProfileOwnership.receivers.map(([,selector,media])=>{
   const matches=rules.filter(rule=>rule.selector===selector&&condition(rule)===media);expect(matches).toHaveLength(1);return matches[0]!;
  });
  let reconstructed='',cursor=0;
  for(const edit of result.edits){
   reconstructed+=input.slice(cursor,edit.start);
   if(edit.owner==='compile metadata prefix')reconstructed+='';
   else{
    const row=supplementProfileOwnership.receivers.find(([utility])=>utility===edit.owner);expect(row).toBeDefined();
    const index=supplementProfileOwnership.receivers.indexOf(row!);const rule=originals[index]!;
    const start=rule.source!.start!.offset!+rule.selector.length+(rule.raws.between||'').length+1,end=rule.source!.end!.offset!-1;
    reconstructed+=original.slice(start,end);
   }cursor=edit.end;
  }
  reconstructed+=input.slice(cursor);expect(reconstructed).toBe(original);
  expect(authoredRules.map(rule=>[rule.selector,condition(rule)])).toEqual(rules.map(rule=>[rule.selector,condition(rule)]));
  // Shared editor Manage buttons now have checked recipes; their complete native declarations remain exact in the emitted stylesheet and in the full byte reconstruction above.
  for(const selector of ['.supp-add-btn','.supp-add-btn:hover','.supp-add-section .supp-add-btn','.supp-bar-dosage']){
   const old=rules.find(rule=>rule.selector===selector);const rendered:Rule[]=[];postcss.parse(result.css).walkRules(rule=>{if(rule.selector===selector)rendered.push(rule);});expect(rendered).toHaveLength(1);
   expect(fullTree(rendered[0]!.toString())).toEqual(fullTree(old?.toString()||''));
  }
 });
 it.each([
  ['unknown apply',(css:string)=>css.replace('@apply gb:supplement-timeline-section','@apply gb:unknown-supplement')],
  ['duplicate receiver',(css:string)=>css+'\n.supp-timeline-section { @apply gb:supplement-timeline-section; }'],
  ['wrong media',(css:string)=>css.replace('@media (max-width: 480px)','@media (max-width: 479px)')],
  ['wrong selector',(css:string)=>css.replace('.supp-timeline-section { @apply','.foreign-rule { @apply')],
  ['extra declaration',(css:string)=>css.replace('@apply gb:supplement-timeline-section;','@apply gb:supplement-timeline-section; color:red;')],
 ])('rejects %s',async(_name,alter)=>{await expect(compileSupplementProfileStyles(alter(input),inputPath,root)).rejects.toThrow();});
});
