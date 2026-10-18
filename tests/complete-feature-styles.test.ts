import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import postcss from 'postcss';
import {expect,it} from 'vitest';
import {compileCategoryViewsNativeStyles} from '../scripts/category-views-native-styles.mjs';
import {compileStartupBannerStyles} from '../scripts/startup-banner-style-ownership.mjs';
import {completeFeatureStyleOwnership} from '../scripts/complete-feature-style-ownership.mjs';
import {restoreReadableCategoryStatusCss} from './helpers/category-presentation-style-inverse.js';
// The complete-recipe fixture predates later accepted Svelte utility changes.
// Keep its native 27 receivers/82 declarations exact; independently pin every
// current output byte to accepted build04e0, not to a freshly generated fixture.
const acceptedNutritionCss = '835909c298df0bffbca565f50ae5ff2a0386880fe8c7ecd99f84a8d004256b9a';
function nutritionRecipeProjection(css:string){
 const tree=postcss.parse(css);
 const first=tree.nodes.findIndex(node=>node.type==='rule'&&node.selector==='body.nutrition-comparison-presenting');
 expect(first).toBeGreaterThanOrEqual(0);
 const end=tree.nodes.findIndex((node,index)=>index>first&&node.type==='atrule'&&node.name==='property');
 expect(end).toBeGreaterThan(first);
 const block=tree.nodes.slice(first,end);let declarations=0;
 for(const node of block)if(node.type==='rule'||node.type==='atrule')node.walkDecls(()=>{declarations++;});
 // Tailwind expands the 27 authored recipes into these exact native nodes,
 // including color-mix fallback, media ancestry and both animation keyframes.
 expect(block).toHaveLength(26);expect(declarations).toBe(86);
 expect(block.at(-1)!.toString()).toBe('@media (prefers-reduced-motion:reduce){[data-nutrition-editor-view] :is(#nutrition-analyze-btn,#nutrition-recalculate-btn).is-loading:before{animation:none}}');
 return css.slice(block[0]!.source!.start!.offset!,block.at(-1)!.source!.end!.offset!);
}
function assertNutritionRecipeParity(current:string,native:string){expect(nutritionRecipeProjection(current)).toEqual(nutritionRecipeProjection(native));}
// Preserve the accepted complete stylesheet pin while independently proving the
// later narrow-screen ingredient-grid repair. Only its exact compiled span is
// inverted; every other byte and all original native recipes remain qualified.
const currentNutritionGridSelector = String.raw`.gb\:nutrition\:min-\[721px\]\:\[\@media\(pointer\:coarse\)\]\:grid-cols-\[minmax\(150px\,1fr\)_92px_minmax\(126px\,\.65fr\)_45px\]:is([data-nutrition-view],[data-nutrition-view] *)`;
const currentNutritionGridRule = currentNutritionGridSelector+'{grid-template-columns:minmax(150px,1fr) 92px minmax(126px,.65fr) 45px}';
const reviewedNutritionGridSpan = '}@media (min-width:721px){@media (pointer:coarse){'+currentNutritionGridRule+'}}@media (pointer:coarse){';
function restoreReviewedNutritionGridCss(current:string):string {
 const matches:postcss.Rule[]=[];
 postcss.parse(current).walkRules(rule=>{if(rule.selector===currentNutritionGridSelector)matches.push(rule);});
 expect(matches).toHaveLength(1);
 const rule=matches[0]!,coarse=rule.parent,wide=coarse?.parent;
 expect(rule.toString()).toBe(currentNutritionGridRule);
 expect(coarse?.type).toBe('atrule');
 if(coarse?.type!=='atrule'||wide?.type!=='atrule')throw new Error('Exact reviewed Nutrition grid media ancestry required');
 expect([coarse.name,coarse.params,wide.name,wide.params,wide.parent?.type]).toEqual(['media','(pointer:coarse)','media','(min-width:721px)','root']);
 expect(coarse.nodes).toHaveLength(1);expect(wide.nodes).toHaveLength(1);
 expect(current.split(reviewedNutritionGridSpan)).toHaveLength(2);
 const originalRule=currentNutritionGridRule.replace(String.raw`min-\[721px\]\:`, '');
 return current.replace(reviewedNutritionGridSpan,originalRule);
}
function assertNutritionStyles(current:string,native:string){
 expect(createHash('sha256').update(restoreReviewedNutritionGridCss(current)).digest('hex')).toBe(acceptedNutritionCss);
 assertNutritionRecipeParity(current,native);
}
const lanes=[
 ['client-list','tailwind',154,463,'9383465ef52b67152f43f2176402d2b8decf4c7e84732ef4f1c80f0df0aad788'],
 ['category-views','tailwind',58,197,'33a7181578f6afd0cea5cbb028cbf489c93131e248d3101995cb1334ee8df07d'],
 ['nutrition','tailwind',27,82,'8056328cdaa74ffb1b30a5761b700d52ccf402852112d3b7bd66fbe91278c893'],
 ['chat-redesign-open','base',46,96,'abde9d3e7fcb9003a47df93bc1d9a1b8488e94dfab4a5eac26abfe7bd599e747'],
] as const;
for(const [lane,kind,recipes,declarations,hash] of lanes){
 it(lane==='nutrition'?'nutrition preserves all original native recipe bodies and its independently accepted complete stylesheet':`${lane} retains all original compiled CSS bytes and ordered declarations/comments/cascade`,async()=>{
  const native=await fs.readFile(`tests/fixtures/complete-${lane}-original.css`,'utf8'),authored=await fs.readFile(`css/${lane}.css`,'utf8');
  const current=lane==='category-views'?restoreReadableCategoryStatusCss(authored):authored;
  expect(createHash('sha256').update(native).digest('hex')).toBe(hash);
  if(lane==='nutrition'){assertNutritionStyles(current,native);return;}
  expect(current).toBe(native);
  const proof=(s:string)=>{const rows:unknown[]=[];postcss.parse(s).walk(node=>{if(node.type==='decl')rows.push([node.prop,node.value,!!node.important]);else if(node.type==='comment')rows.push(['comment',node.text]);else if(node.type==='rule')rows.push(['selector',node.selector]);else if(node.type==='atrule')rows.push(['group',node.name,node.params]);});return rows;};expect(proof(current)).toEqual(proof(native));
 });
 it(`${lane} owns every remaining ordinary presentation declaration in semantic Tailwind recipes`,async()=>{
  const tree=postcss.parse(await fs.readFile(`css/${lane}.${kind}.css`,'utf8'));let ordinary=0,count=0;
  tree.walkDecls(declaration=>{let parent:postcss.Node|undefined=declaration.parent;while(parent){if(parent.type==='atrule'&&'name'in parent&&typeof parent.name==='string'&&(['utility','theme','keyframes','font-face','property'].includes(parent.name)||parent.name.endsWith('keyframes')))return;parent=parent.parent;}if(!declaration.prop.startsWith('--'))ordinary++;});
  const utilities=tree.nodes.filter(node=>node.type==='atrule'&&node.name==='utility'&&node.params.startsWith('complete-'+lane+'-'));
  for(const utility of utilities)if(utility.type==='atrule')utility.walkDecls(()=>{count++;});
  expect(ordinary).toBe(0);expect(utilities).toHaveLength(recipes);expect(count).toBe(declarations);
 });
}
const root=process.cwd();
for(const lane of ['category-views','chat-redesign-open'] as const){
 async function compile(input:string){const inputPath=path.join(root,'css/'+lane+(lane==='category-views'?'.tailwind.css':'.base.css'));return lane==='category-views'?compileCategoryViewsNativeStyles(input,inputPath,root):compileStartupBannerStyles('chat-redesign',input,inputPath,root);}
 it(`${lane} expands exact original body formatting while retaining all existing feature ownership`,async()=>{
  const source=await fs.readFile('css/'+lane+(lane==='category-views'?'.tailwind.css':'.base.css'),'utf8');const result=await compile(source);expect(lane==='category-views'?restoreReadableCategoryStatusCss(result.css):result.css).toBe(await fs.readFile(`tests/fixtures/complete-${lane}-original.css`,'utf8'));
 });
 it.each(['unknown','extra-declaration','extra-recipe'] as const)(`${lane} rejects %s ownership corruption`,async kind=>{
  const source=await fs.readFile('css/'+lane+(lane==='category-views'?'.tailwind.css':'.base.css'),'utf8'),row=completeFeatureStyleOwnership[lane].receivers[0]!,needle='@apply gb:'+row[0]+';';let changed=source;
  if(kind==='unknown')changed=source.replace(needle,'@apply gb:foreign-unreviewed;');
  if(kind==='extra-declaration')changed=source.replace(needle,needle+' color:red;');
  if(kind==='extra-recipe')changed=source+'\n@utility foreign-unreviewed {color:red;}';
  expect(changed).not.toBe(source);await expect(compile(changed)).rejects.toMatchObject({code:'ERR_ASSERTION'});
 });
}

it('rejects Nutrition native body, ancestry, motion and unrelated utility drift without replacing the original fixture',async()=>{
 const native=await fs.readFile('tests/fixtures/complete-nutrition-original.css','utf8'),current=await fs.readFile('css/nutrition.css','utf8');
 const mutate=(change:(tree:postcss.Root)=>void)=>{const tree=postcss.parse(current);change(tree);const changed=tree.toString();expect(changed).not.toBe(current);return changed;};
 const body=mutate(tree=>{const rule=tree.nodes.find(node=>node.type==='rule'&&node.selector==='body.nutrition-comparison-presenting');if(rule?.type!=='rule'||rule.nodes[0]?.type!=='decl')throw new Error('Native Nutrition body required');rule.nodes[0].value='visible';});
 const ancestry=mutate(tree=>{tree.walkRules('body.nutrition-comparison-presenting',rule=>{const media=postcss.atRule({name:'media',params:'(min-width: 1px)'});rule.replaceWith(media);media.append(rule);});});
 const motion=mutate(tree=>{tree.walkAtRules('keyframes',rule=>{if(rule.params==='nutrition-analysis-spin')rule.append({selector:'50%',nodes:[postcss.decl({prop:'transform',value:'rotate(90deg)'})]});});});
 for(const changed of [body,ancestry,motion])expect(()=>assertNutritionRecipeParity(changed,native)).toThrow();
 let changedUtility=false;
 const foreign=mutate(tree=>{tree.walkRules(rule=>{if(changedUtility||!rule.selector.startsWith('.gb\\:nutrition\\:'))return;const declaration=rule.nodes.find(node=>node.type==='decl');if(declaration?.type!=='decl')throw new Error('Current Svelte utility declaration required');declaration.value='initial';changedUtility=true;});});
 expect(changedUtility).toBe(true);assertNutritionRecipeParity(foreign,native);
 expect(()=>assertNutritionStyles(foreign,native)).toThrow();
});


it.each(['width','selector','declaration','priority','duplicate','unrelated'] as const)('rejects %s drift around the separately qualified Nutrition grid repair',async kind=>{
 const native=await fs.readFile('tests/fixtures/complete-nutrition-original.css','utf8'),current=await fs.readFile('css/nutrition.css','utf8');
 let changed=current;
 if(kind==='width')changed=current.replace(reviewedNutritionGridSpan,reviewedNutritionGridSpan.replace('(min-width:721px)','(min-width:720px)'));
 if(kind==='selector')changed=current.replace(currentNutritionGridSelector,currentNutritionGridSelector.replace('721px','720px'));
 if(kind==='declaration')changed=current.replace(currentNutritionGridRule,currentNutritionGridRule.replace(' 45px}',' 46px}'));
 if(kind==='priority')changed=current.replace(currentNutritionGridRule,currentNutritionGridRule.replace(' 45px}',' 45px!important}'));
 if(kind==='duplicate')changed=current+'@media (min-width:721px){@media (pointer:coarse){'+currentNutritionGridRule+'}}';
 if(kind==='unrelated')changed=current+'\n/* Unreviewed complete stylesheet byte */';
 expect(changed).not.toBe(current);
 expect(()=>assertNutritionStyles(changed,native)).toThrow();
});
