import fs from 'node:fs/promises';
import path from 'node:path';
import postcss,{type ChildNode} from 'postcss';
import {describe,it,expect} from 'vitest';
import {emfInterpretationOwnership} from '../scripts/emf-interpretation-style-ownership.mjs';
import {compileEMFComparisonStyles as compileEMFInterpretationStyles} from '../scripts/emf-comparison-style-ownership.mjs';
import {restoreEMFComparisonBodies} from './helpers/emf-comparison-style-inverse.js';
const root=path.resolve('.'),inputPath=path.join(root,'css/emf.base.css');
function declarationRows(input:string){const tree=postcss.parse(input);const rows:unknown[]=[];
 function visit(nodes:ChildNode[],parents:string[]=[]){for(const node of nodes){if(node.type==='rule')rows.push({parents,selector:node.selector,declarations:node.nodes.map(child=>child.type==='decl'?[child.prop,child.value,child.important??false]:child.toString())});else if(node.type==='atrule'&&node.nodes)visit(node.nodes,[...parents,'@'+node.name+' '+node.params]);}}visit(tree.nodes);return rows;}
function removeError(input:string){const tree=postcss.parse(input);const nodes:postcss.Rule[]=[];tree.walkRules(rule=>{if(rule.selector==='.emf-interp-error')nodes.push(rule);});
 if(nodes.length!==1||nodes[0]!.parent!==tree)throw new Error('Exact sole root error receiver');const rule=nodes[0]!;
 if(JSON.stringify(rule.nodes.map(node=>node.type==='decl'?[node.prop,node.value,node.important??false]:null))!==JSON.stringify([['color','var(--red)',false],['padding','12px',false]]))throw new Error('Exact inline-error declarations');
 return input.slice(0,rule.source!.start!.offset!-1)+input.slice(rule.source!.end!.offset!);
}
function foreign(input:string){const tree=postcss.parse(input),edits:Array<[number,number]>=[];tree.walkRules(rule=>{if(rule.selector.includes('.emf-interp-')){const start=rule.source!.start!.offset!,end=rule.source!.end!.offset!;edits.push([input.indexOf('{',start)+1,end-1]);}});
 let result='',cursor=0;for(const[start,end]of edits){result+=input.slice(cursor,start)+'OWNED';cursor=end;}return result+input.slice(cursor);}
describe('EMF interpretation sole utility declaration authority',()=>{
 it('retains all 24 original receivers/71 ordered declarations/foreign bytes and adds only two error declarations',async()=>{
  const input=await fs.readFile(inputPath,'utf8'),original=await fs.readFile('tests/fixtures/emf-interpretation-styles-original.css','utf8');
  const {css}=await compileEMFInterpretationStyles(input,inputPath,root),withoutError=removeError(restoreEMFComparisonBodies(css,await fs.readFile('tests/fixtures/emf-comparison-styles-original.css','utf8')));
  expect(emfInterpretationOwnership.receivers).toHaveLength(25);expect(emfInterpretationOwnership.declarationCount).toBe(73);
  expect(declarationRows(withoutError)).toEqual(declarationRows(original));expect(foreign(withoutError)).toBe(foreign(original));
  expect(css).not.toMatch(/@(?:apply|utility|layer|theme|import)\b/);
 });
 it.each(['missing','foreign-apply','duplicate','wrong-media','extra-declaration'] as const)('rejects malformed ownership %s',async kind=>{
  let input=await fs.readFile(inputPath,'utf8');if(kind==='missing')input=input.replace('@apply gb:emf-interpretation-overlay;','');
  if(kind==='foreign-apply')input=input.replace('@apply gb:emf-interpretation-overlay;','@apply gb:foreign;');
  if(kind==='duplicate')input+='\n.emf-interp-overlay { @apply gb:emf-interpretation-overlay; }';
  if(kind==='wrong-media')input=input.replace('@media (max-width: 600px)','@media (max-width: 601px)');
  if(kind==='extra-declaration')input=input.replace('@apply gb:emf-interpretation-overlay;','@apply gb:emf-interpretation-overlay; color: red;');
  await expect(Promise.resolve().then(()=>compileEMFInterpretationStyles(input,inputPath,root))).rejects.toThrow();
 });
});
