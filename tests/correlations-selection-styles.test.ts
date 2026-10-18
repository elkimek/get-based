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
const root=path.resolve('.'),inputPath=path.join(root,'css/category-views.tailwind.css'),input=readFileSync(inputPath,'utf8');
const original=readFileSync(path.join(root,'tests/fixtures/correlations-selection-category-original.css'),'utf8');
function ast(source:string):unknown{function node(n:ChildNode):unknown{if(n.type==='decl')return {type:n.type,property:n.prop,value:n.value,important:n.important===true};if(n.type==='rule')return {type:n.type,selector:n.selector,children:n.nodes.filter(x=>x.type!=='comment').map(node)};if(n.type==='atrule')return {type:n.type,name:n.name,params:n.params,...(n.nodes?{children:n.nodes.filter(x=>x.type!=='comment').map(node)}:{})};throw new Error('Unexpected CSS node');}return postcss.parse(source).nodes.filter(n=>n.type!=='comment').map(node);}
function comments(source:string){const out:string[]=[];postcss.parse(source).walkComments(n=>{out.push(n.text);});return out;}
it('keeps the whole original category cascade, comments, and both native duplicate option rules',async()=>{const compiled=await compileCategoryViewsNativeStyles(input,inputPath,root);const result={...compiled,css:restoreCategoryPresentationStyleBodies(restoreCategoryPageChromeStyleBodies(compiled.css),original)};expect(priorCategoryStyleReceivers(result.receivers)).toHaveLength(279 + categoryPageChromeStyleOwners.length);expect(result.receivers.filter(r=>r.utility.startsWith('corr-selection-'))).toHaveLength(33);expect(ast(result.css)).toEqual(ast(original));expect(comments(result.css)).toEqual(comments(original));const rules:unknown[]=[];postcss.parse(result.css).walkRules('.corr-options',r=>{rules.push(r.nodes.map(n=>n.toString()));});expect(rules).toHaveLength(2);expect(rules.map(r=>(r as unknown[]).length)).toEqual([11,1]);const suffix=original.indexOf('/* Recorded-dose comparisons */');expect(suffix).toBeGreaterThan(0);expect(restoreCorrelationsSelectionStyleBodies(restoreTherapyComparisonStyleBodies(restoreCorrelationWorkspaceControlStyleBodies(restoreCorrelationWorkspaceChromeStyleBodies(result.css,original),original),original),original).split('/* Recorded-dose comparisons */')[1]).toBe(original.slice(suffix + '/* Recorded-dose comparisons */'.length));});
it.each([
 ['unknown receiver',(s:string)=>s.replace('@apply gb:corr-selection-controls;','@apply gb:corr-selection-unknown;')],
 ['duplicate owned selector without apply',(s:string)=>s+'\n.correlation-controls {color:red;}\n'],
 ['extra receiver declaration',(s:string)=>s.replace('@apply gb:corr-selection-controls;','@apply gb:corr-selection-controls; color:red;')],
 ['duplicate semantic recipe',(s:string)=>s+'\n@utility corr-selection-controls {color:red;}\n'],
 ['mobile receiver media moved',(s:string)=>s.replace('@media (max-width: 600px) { .corr-chart-container, .correlation-controls','@media (max-width: 601px) { .corr-chart-container, .correlation-controls')],
] as const)('rejects %s while preserving the unique receiver gate',async(_name,mutate)=>{const changed=mutate(input);expect(changed).not.toBe(input);await expect(compileCategoryViewsNativeStyles(changed,inputPath,root)).rejects.toMatchObject({code:'ERR_ASSERTION'});});

it('rejects corruption in an owned value before source byte restoration',async()=>{const compiled=await compileCategoryViewsNativeStyles(input,inputPath,root);const result={...compiled,css:restoreCategoryPresentationStyleBodies(restoreCategoryPageChromeStyleBodies(compiled.css),original)};const changed=result.css.replace('.corr-chip button.chip-remove {\n  border: 0;', '.corr-chip button.chip-remove {\n  border: 1;');expect(changed).not.toBe(result.css);expect(()=>restoreCorrelationsSelectionStyleBodies(changed,original)).toThrow();});
it('retains foreign suffix bytes through the bounded formatting inverse',async()=>{const compiled=await compileCategoryViewsNativeStyles(input,inputPath,root);const result={...compiled,css:restoreCategoryPresentationStyleBodies(restoreCategoryPageChromeStyleBodies(compiled.css),original)};const changed=result.css.replace('.corr-chart { height: 400px;', '.corr-chart { height: 401px;');expect(changed).not.toBe(result.css);const inverse=restoreCorrelationsSelectionStyleBodies(changed,original);expect(inverse).toContain('.corr-chart { height: 401px;');expect(inverse.split('/* Recorded-dose comparisons */')[1]).not.toBe(original.split('/* Recorded-dose comparisons */')[1]);});
