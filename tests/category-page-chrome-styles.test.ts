import {completeFeatureStyleOwnership} from '../scripts/complete-feature-style-ownership.mjs';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {expect,it} from 'vitest';
import postcss from 'postcss';
import {compileCategoryViewsNativeStyles} from '../scripts/category-views-native-styles.mjs';
import {restoreCategoryPageChromeStyleBodies,categoryPageChromeStyleOwners} from './helpers/category-page-chrome-style-inverse.js';
import inverse from './fixtures/category-page-chrome-style-inverse.json' with {type:'json'};
import {restoreReadableCategoryStatusCss} from './helpers/category-presentation-style-inverse.js';
const root=path.resolve('.'),inputPath=path.join(root,'css/category-views.tailwind.css'),input=readFileSync(inputPath,'utf8'),prior=readFileSync(path.join(import.meta.dirname,'fixtures/category-page-chrome-original.css'),'utf8');
function primitives(css:string){const rows:unknown[]=[];postcss.parse(css).walk(n=>{const ancestry:unknown[]=[];for(let p:postcss.Node|undefined=n.parent;p;p=p.parent)if(p.type==='atrule'){const at=p as postcss.AtRule;ancestry.unshift([at.name,at.params]);}else if(p.type==='rule')ancestry.unshift(['rule',(p as postcss.Rule).selector]);if(n.type==='decl')rows.push(['decl',n.prop,n.value,!!n.important,ancestry]);else if(n.type==='comment')rows.push(['comment',n.text,ancestry]);});return rows;}
it('adds exactly ten named chrome receivers and preserves complete prior bytes plus every ordered CSS value/comment/priority/scope',async()=>{const out=await compileCategoryViewsNativeStyles(input,inputPath,root);expect(categoryPageChromeStyleOwners).toHaveLength(10);expect(out.receivers.filter(r=>!completeFeatureStyleOwnership['category-views'].receivers.some(([utility])=>utility===r.utility))).toHaveLength(289);expect(out.receivers).toHaveLength(347);expect(out.receivers.filter(r=>completeFeatureStyleOwnership['category-views'].receivers.some(([utility])=>utility===r.utility))).toHaveLength(58);expect(out.receivers.filter(r=>categoryPageChromeStyleOwners.some(([utility])=>utility===r.utility)).map(r=>[r.utility,r.selector,r.condition])).toEqual(categoryPageChromeStyleOwners);expect(restoreCategoryPageChromeStyleBodies(restoreReadableCategoryStatusCss(out.css))).toBe(prior);expect(primitives(restoreReadableCategoryStatusCss(out.css))).toEqual(primitives(prior));expect(primitives(prior)).toHaveLength(1121);});
const invalid:[string,(source:string)=>string][]=[
 ['unknown chrome receiver',s=>s.replace('@apply gb:category-page-category-title-text;','@apply gb:category-page-unknown;')],
 ['duplicate chrome receiver',s=>s+'\n.category-title-text {color:red;}'],
 ['duplicate chrome recipe',s=>s+'\n@utility category-page-category-title-text {color:red;}'],
 ['extra chrome declaration',s=>s.replace('@apply gb:category-page-category-title-text;','@apply gb:category-page-category-title-text;color:red;')],
 ['wrong chrome ancestry',s=>s.replace('.category-title-text { @apply gb:category-page-category-title-text; }','@supports(display:grid){.category-title-text { @apply gb:category-page-category-title-text; }}')],
];
it.each(invalid)('rejects %s before source restoration',async(_name,change)=>{const changed=change(input);expect(changed).not.toBe(input);await expect(compileCategoryViewsNativeStyles(changed,inputPath,root)).rejects.toMatchObject({code:'ERR_ASSERTION'});});
it('rejects corrupted owned raw declarations before exact native body restoration',async()=>{const {css}=await compileCategoryViewsNativeStyles(input,inputPath,root);const row=inverse.ownedBodies[0]!,changed=css.replace(row.compiled,row.compiled.replace('min-width:','unreviewed-min-width:'));expect(changed).not.toBe(css);expect(()=>restoreCategoryPageChromeStyleBodies(changed)).toThrow();});
it('rejects extra metadata newlines at the exact native comment boundary',async()=>{const {css}=await compileCategoryViewsNativeStyles(input,inputPath,root),at=inverse.metadata.afterPrefix.length,changed=css.slice(0,at)+'\n'+css.slice(at);expect(()=>restoreCategoryPageChromeStyleBodies(changed)).toThrow();});
it('retains every foreign byte after the bounded ten-body and metadata inverse',async()=>{const foreign='\n/* foreign category chrome sibling */\n.foreign-chrome {\n background:\n   linear-gradient(135deg, var(--accent), transparent),\n   var(--bg-card);\n}\n';const {css}=await compileCategoryViewsNativeStyles(input+foreign,inputPath,root);expect(restoreCategoryPageChromeStyleBodies(restoreReadableCategoryStatusCss(css))).toBe(prior+foreign);});
