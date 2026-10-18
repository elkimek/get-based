import {priorCategoryStyleReceivers} from './helpers/category-current-style-owners.js';
import {restoreCategoryPageChromeStyleBodies,categoryPageChromeStyleOwners} from './helpers/category-page-chrome-style-inverse.js';
import {restoreCategoryPresentationStyleBodies} from './helpers/category-presentation-style-inverse.js';
import {restoreCorrelationWorkspaceChromeStyleBodies} from './helpers/correlation-workspace-chrome-style-inverse.js';
import {restoreCorrelationWorkspaceControlStyleBodies} from './helpers/correlation-workspace-controls-style-inverse.js';
import {restoreTherapyComparisonStyleBodies} from './helpers/therapy-comparison-style-inverse.js';
import {restoreCorrelationsSelectionStyleBodies} from './helpers/correlations-selection-style-inverse.js';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import postcss,{type ChildNode} from 'postcss';
import {it,expect} from 'vitest';
import {compileCategoryViewsNativeStyles} from '../scripts/category-views-native-styles.mjs';
const root=path.resolve('.'), inputPath=path.join(root,'css/category-views.tailwind.css');
const input=readFileSync(inputPath,'utf8'), original=readFileSync(path.join(root,'tests/fixtures/compare-dates-category-original.css'),'utf8');
function ast(source:string):unknown {
 function node(n:ChildNode):unknown {
  if(n.type==='decl')return {type:n.type,property:n.prop,value:n.value,important:n.important===true};
  if(n.type==='rule')return {type:n.type,selector:n.selector,children:n.nodes.filter(x=>x.type!=='comment').map(node)};
  if(n.type==='atrule')return {type:n.type,name:n.name,params:n.params,...(n.nodes?{children:n.nodes.filter(x=>x.type!=='comment').map(node)}:{})};
  throw new Error('Unexpected CSS node');
 }
 return postcss.parse(source).nodes.filter(n=>n.type!=='comment').map(node);
}
function comments(source:string):string[]{const values:string[]=[];postcss.parse(source).walkComments(n=>{values.push(n.text);});return values;}
it('retains the complete category cascade and exact Correlations suffix while compiling 279 recipes once',async()=>{
 const compiled=await compileCategoryViewsNativeStyles(input,inputPath,root);const result={...compiled,css:restoreCategoryPresentationStyleBodies(restoreCategoryPageChromeStyleBodies(compiled.css),original)};
 expect(priorCategoryStyleReceivers(result.receivers)).toHaveLength(279 + categoryPageChromeStyleOwners.length);
 expect(result.receivers.filter(r=>r.utility.startsWith('compare-'))).toHaveLength(34);
 expect(ast(result.css)).toEqual(ast(original));
 expect(comments(result.css)).toEqual(comments(original));
 const suffix=original.indexOf('/* Recorded-dose comparisons */');expect(suffix).toBeGreaterThan(0);
 expect(restoreCorrelationsSelectionStyleBodies(restoreTherapyComparisonStyleBodies(restoreCorrelationWorkspaceControlStyleBodies(restoreCorrelationWorkspaceChromeStyleBodies(result.css,original),original),original),original).split('/* Recorded-dose comparisons */')[1]).toBe(original.slice(suffix + '/* Recorded-dose comparisons */'.length));
 expect(result.css).not.toContain('@apply');expect(result.css).not.toContain('@utility');
});
it('rejects an extra foreign declaration in an owned Compare Dates receiver',async()=>{
 const changed=input.replace('@apply gb:compare-controls;','@apply gb:compare-controls; color:red;');
 expect(changed).not.toBe(input);await expect(compileCategoryViewsNativeStyles(changed,inputPath,root)).rejects.toThrow();
});
it('rejects a Compare Dates mobile receiver moved into a foreign media condition',async()=>{
 const changed=input.replace('@media (max-width: 768px)','@media (max-width: 769px)');
 expect(changed).not.toBe(input);await expect(compileCategoryViewsNativeStyles(changed,inputPath,root)).rejects.toThrow();
});
