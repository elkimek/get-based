import {readFileSync} from 'node:fs';
import path from 'node:path';
import {expect,it} from 'vitest';
import postcss,{type Rule} from 'postcss';
import {restoreCategoryPageChromeStyleBodies} from './helpers/category-page-chrome-style-inverse.js';
import {restoreCategoryPresentationStyleBodies} from './helpers/category-presentation-style-inverse.js';
import {compileCategoryViewsNativeStyles} from '../scripts/category-views-native-styles.mjs';
const root=path.resolve('.'),inputPath=path.join(root,'css/category-views.tailwind.css'),input=readFileSync(inputPath,'utf8');
const receivers=JSON.parse(readFileSync(path.join(import.meta.dirname,'fixtures/category-presentation-style-ownership.json'),'utf8')) as [string,string,string|null][];
const nativeInput=readFileSync(path.join(import.meta.dirname,'fixtures/complete-category-views-authored-original.css'),'utf8');
const families=['.chart-card','.data-table','.heatmap-table','.gb-table-shell'];
it.each(families)('%s cannot acquire an unreviewed duplicate receiver',async family=>{const row=receivers.find(r=>r[1]===family&&r[2]===null)!;expect(row).toBeDefined();const changed=input+'\n'+family+' { color: red; }\n';await expect(compileCategoryViewsNativeStyles(changed,inputPath,root)).rejects.toMatchObject({code:'ERR_ASSERTION'});});
it('rejects an unknown category utility',async()=>{const row=receivers[0]!;const changed=input.replace('@apply gb:'+row[0]+';','@apply gb:category-unreviewed;');expect(changed).not.toBe(input);await expect(compileCategoryViewsNativeStyles(changed,inputPath,root)).rejects.toMatchObject({code:'ERR_ASSERTION'});});
it('rejects an additional declaration in an owned category receiver',async()=>{const row=receivers[0]!;const changed=input.replace('@apply gb:'+row[0]+';','@apply gb:'+row[0]+'; color: red !important;');expect(changed).not.toBe(input);await expect(compileCategoryViewsNativeStyles(changed,inputPath,root)).rejects.toMatchObject({code:'ERR_ASSERTION'});});
it('retains exact native owned multiline gradient values',async()=>{const {css}=await compileCategoryViewsNativeStyles(input,inputPath,root);for(const selector of ['.range-bar-zone-low','.range-bar-zone-high','.range-bar-fill']){const start=nativeInput.indexOf(selector+' {'),end=nativeInput.indexOf('}',start)+1;expect(start).toBeGreaterThan(0);expect(css).toContain(nativeInput.slice(start,end));}});

// Qualify only the intentional chart high-status tint. All immutable source
// receipts and the other presentation declarations remain exact.
it('qualifies one high-status tint while preserving the entire original ordered cascade',async()=>{
 const {css}=await compileCategoryViewsNativeStyles(input,inputPath,root);
 const original=readFileSync(path.join(root,'tests/fixtures/correlation-workspace-controls-category-original.css'),'utf8');
 const prepared=restoreCategoryPageChromeStyleBodies(css);
 const restore=(value:string)=>restoreCategoryPresentationStyleBodies(value,original);
 const records=(value:string)=>{const result:unknown[]=[];postcss.parse(value).walk(node=>{
  if(node.type==='rule')result.push(['rule',node.selector,node.nodes.length]);
  else if(node.type==='atrule')result.push(['at',node.name,node.params,node.nodes?.length??null]);
  else if(node.type==='decl')result.push(['decl',node.prop,node.value,node.important===true]);
  else if(node.type==='comment')result.push(['comment',node.text]);
 });return result;};
 expect(records(restore(prepared))).toEqual(records(original));
 const mutate=(change:(rule:Rule)=>void)=>{const ast=postcss.parse(prepared),matches:Rule[]=[];ast.walkRules('.chart-card-status.status-high',rule=>{matches.push(rule);});expect(matches).toHaveLength(1);change(matches[0]!);return ast.toString();};
 const corruptions:[string,(rule:Rule)=>void][]=[
  ['wrong tint',rule=>{const node=rule.nodes[1]!;if(node.type!=='decl')throw new Error('Tint declaration required');node.value='color-mix(in srgb, var(--red-bg) 26%, transparent)';}],
  ['wrong foreground',rule=>{const node=rule.nodes[0]!;if(node.type!=='decl')throw new Error('Color declaration required');node.value='white';}],
  ['important',rule=>{const node=rule.nodes[1]!;if(node.type!=='decl')throw new Error('Tint declaration required');node.important=true;}],
  ['extra geometry',rule=>{rule.append({prop:'padding',value:'4px'});}],
  ['missing tint',rule=>{rule.nodes[1]!.remove();}],
  ['reordered declarations',rule=>{rule.prepend(rule.nodes[1]!);}],
  ['selector',rule=>{rule.selector='.chart-card-status.status-low';}],
  ['duplicate',rule=>{rule.cloneAfter();}],
  ['media scope',rule=>{const media=postcss.atRule({name:'media',params:'(min-width: 0px)'});rule.replaceWith(media);media.append(rule);}],
 ];
 for(const [name,change] of corruptions)expect(()=>restore(mutate(change)),name).toThrow();
 const foreign=postcss.parse(prepared);foreign.append({selector:'.unowned-contrast-proof',nodes:[postcss.decl({prop:'padding',value:'17px'})]});
 const foreignSource=foreign.toString(),restored=restore(foreignSource);
 expect(restored).toContain('.unowned-contrast-proof');expect(restored).toContain('padding: 17px');
 expect(records(restored)).not.toEqual(records(original));
});
