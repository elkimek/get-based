import {priorCategoryStyleReceivers} from './helpers/category-current-style-owners.js';
import {restoreCategoryPageChromeStyleBodies,categoryPageChromeStyleOwners} from './helpers/category-page-chrome-style-inverse.js';
import {restoreCategoryPresentationStyleBodies} from './helpers/category-presentation-style-inverse.js';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import postcss,{type ChildNode} from 'postcss';
import {it,expect} from 'vitest';
import {compileCategoryViewsNativeStyles} from '../scripts/category-views-native-styles.mjs';
import {restoreCorrelationWorkspaceChromeStyleBodies} from './helpers/correlation-workspace-chrome-style-inverse.js';
const root=path.resolve('.'),inputPath=path.join(root,'css/category-views.tailwind.css');
const input=readFileSync(inputPath,'utf8');
const original=readFileSync(path.join(root,'tests/fixtures/correlation-workspace-chrome-category-original.css'),'utf8');
function records(source:string){
 const out:unknown[]=[];
 function visit(node:ChildNode,coordinate:string){
  if(node.type==='decl')out.push({coordinate,type:node.type,name:node.prop,value:node.value,important:node.important===true});
  else if(node.type==='comment')out.push({coordinate,type:node.type,text:node.text});
  else if(node.type==='rule'||node.type==='atrule'){
   out.push({coordinate,type:node.type,...(node.type==='rule'?{selector:node.selector}:{name:node.name,params:node.params}),children:node.nodes?.length??null});
   node.nodes?.forEach((child,i)=>visit(child,coordinate+'.'+i));
  }else throw new Error('Unexpected CSS node');
 }
 postcss.parse(source).nodes.forEach((node,i)=>visit(node,String(i)));return out;
}
it('preserves the whole original ordered cascade, comments, duplicate ingredient rules and every foreign byte',async()=>{
 const compiled=await compileCategoryViewsNativeStyles(input,inputPath,root);const result={...compiled,css:restoreCategoryPresentationStyleBodies(restoreCategoryPageChromeStyleBodies(compiled.css),original)};
 expect(priorCategoryStyleReceivers(result.receivers)).toHaveLength(279 + categoryPageChromeStyleOwners.length);expect(result.receivers.filter(r=>r.utility.startsWith('corr-workspace-chrome-'))).toHaveLength(50);
 expect(records(result.css)).toEqual(records(original));
 expect(restoreCorrelationWorkspaceChromeStyleBodies(result.css,original)).toBe(original);
 const selectors:unknown[]=[];postcss.parse(result.css).walkRules('.corr-ingredient-picker select',rule=>{selectors.push({media:rule.parent?.type==='atrule'?rule.parent.params:null,source:rule.toString()});});
 expect(selectors).toHaveLength(3);expect(selectors.filter(x=>(x as {media:string|null}).media===null)).toHaveLength(2);
});
it.each([
 ['unknown receiver',(s:string)=>s.replace('@apply gb:corr-workspace-chrome-0;','@apply gb:corr-workspace-chrome-unknown;')],
 ['extra declaration',(s:string)=>s.replace('@apply gb:corr-workspace-chrome-0;','@apply gb:corr-workspace-chrome-0; color:red;')],
 ['duplicate selector',(s:string)=>s+'\n.corr-current-dose {color:red;}\n'],
 ['duplicate recipe',(s:string)=>s+'\n@utility corr-workspace-chrome-0 {color:red;}\n'],
 ['foreign media',(s:string)=>s.replace('.corr-use-track { @apply gb:corr-workspace-chrome-12; }','@media (min-width:0px) { .corr-use-track { @apply gb:corr-workspace-chrome-12; } }')],
] as const)('rejects %s through the unchanged ownership gate',async(_name,mutate)=>{
 const changed=mutate(input);expect(changed).not.toBe(input);await expect(compileCategoryViewsNativeStyles(changed,inputPath,root)).rejects.toMatchObject({code:'ERR_ASSERTION'});
});
it('rejects owned value/order/priority before source formatting restoration',async()=>{
 const compiled=await compileCategoryViewsNativeStyles(input,inputPath,root);const result={...compiled,css:restoreCategoryPresentationStyleBodies(restoreCategoryPageChromeStyleBodies(compiled.css),original)};
 const changed=result.css.replace('.corr-current-heading {\n  display: flex;','.corr-current-heading {\n  display: block;');expect(changed).not.toBe(result.css);
 expect(()=>restoreCorrelationWorkspaceChromeStyleBodies(changed,original)).toThrow();
});
it('retains native chart corruption rather than erasing it',async()=>{
 const compiled=await compileCategoryViewsNativeStyles(input,inputPath,root);const result={...compiled,css:restoreCategoryPresentationStyleBodies(restoreCategoryPageChromeStyleBodies(compiled.css),original)};
 const changed=result.css.replace('.corr-chart { height: 400px;','.corr-chart { height: 401px;');expect(changed).not.toBe(result.css);
 const restored=restoreCorrelationWorkspaceChromeStyleBodies(changed,original);expect(restored).toContain('.corr-chart { height: 401px;');expect(restored).not.toBe(original);
});

it('rejects foreign prefix/comment corruption before the finite metadata whitespace inverse',async()=>{
 const compiled=await compileCategoryViewsNativeStyles(input,inputPath,root);const result={...compiled,css:restoreCategoryPresentationStyleBodies(restoreCategoryPageChromeStyleBodies(compiled.css),original)};
 const changed='/* foreign prefix */'+result.css;expect(changed).not.toBe(result.css);
 expect(()=>restoreCorrelationWorkspaceChromeStyleBodies(changed,original)).toThrow('Exact actual owned metadata prefix');
});
