import {restorePreviousSharedButtonSelectors} from './helpers/shared-button-specificity-inverse.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import postcss, {type ChildNode,type Node} from 'postcss';
import {expect,it} from 'vitest';
import {buildAppShellStyles,buildRedesignShellStyles} from '../scripts/build-styles.mjs';
import {compileNativeStyleBodies,type NativeStyleOwnership} from '../scripts/native-recipe-styles.mjs';
import {sharedShellStyleOwnership} from '../scripts/shared-shell-style-ownership.mjs';

function tree(source:string):unknown {
 function walk(node:ChildNode):unknown {
  if(node.type==='comment')return ['comment',node.text];
  if(node.type==='decl')return ['declaration',node.prop,node.value,!!node.important];
  if(node.type==='rule')return ['rule',node.selector,node.nodes.map(walk)];
  if(node.type==='atrule')return ['group',node.name,node.params,node.nodes?.map(walk)??null];
  throw Error('Unexpected CSS node');
 }
 return postcss.parse(source).nodes.map(walk);
}
for(const lane of ['app-shell','redesign-shell'] as const){
 it(`${lane} preserves every original runtime CSS byte, declaration, comment and cascade coordinate`,async()=>{
  const original=await fs.readFile(`tests/fixtures/shared-${lane}-original.css`,'utf8');
  expect(createHash('sha256').update(original).digest('hex')).toBe(lane==='app-shell'?'6825adaf4631c617d98d39fda39f73e16bd817c84db616b1c232bc7bc7b0edc8':'d47e89362933b71e757cad57eb41a893cdf072905615205c60e0c30fe9cb3bb8');
  const current=restorePreviousSharedButtonSelectors(lane,await fs.readFile(`css/${lane}.css`,'utf8'));
  expect(current).toBe(original);expect(tree(current)).toEqual(tree(original));
  const input=postcss.parse(await fs.readFile(`css/${lane}.base.css`,'utf8'));let ordinary=0;
  input.walkDecls(declaration=>{let parent:Node['parent']=declaration.parent;while(parent){if(parent.type==='atrule'&&'name' in parent&&typeof parent.name==='string'&&(['utility','theme','keyframes','font-face','property'].includes(parent.name)||parent.name.endsWith('keyframes')))return;parent=parent.parent;}if(!declaration.prop.startsWith('--'))ordinary++;});
  expect(ordinary).toBe(0);
  expect(sharedShellStyleOwnership[lane].receivers).toHaveLength(lane==='app-shell'?183:39);
  expect(sharedShellStyleOwnership[lane].declarationCount).toBe(lane==='app-shell'?650:170);
 });
 it(`${lane} uses the maintained builder and rejects stale runtime output`,async()=>{
  const directory=path.resolve('.local-notes/shared-shell-style-tests');await fs.mkdir(directory,{recursive:true});const outputPath=path.join(directory,lane+'.css');
  const build=lane==='app-shell'?buildAppShellStyles:buildRedesignShellStyles;
  try{await build({outputPath});expect(restorePreviousSharedButtonSelectors(lane,await fs.readFile(outputPath,'utf8'))).toBe(await fs.readFile(`tests/fixtures/shared-${lane}-original.css`,'utf8'));await build({outputPath,check:true});await fs.appendFile(outputPath,'\n/* stale */\n');await expect(build({outputPath,check:true})).rejects.toThrow('CSS is stale');}finally{await fs.rm(outputPath,{force:true});}
 });
}
const input=`@import "tailwindcss" prefix(gb) source(none) reference;
@utility one { color: red; /* source comment */ padding: 2px; }
@utility two { color: blue; }

.repeat { @apply gb:one; }
.repeat { @apply gb:two; }`;
const root=process.cwd(),inputPath=path.join(root,'css/shared-shell-explicit-fixture.css');
const ownership:NativeStyleOwnership={receivers:[['one','.repeat',null,{occurrence:0,preserveFormatting:true}],['two','.repeat',null,{occurrence:1,preserveFormatting:true}]],declarationCount:3,isolateRecipes:true,compactMetadataPrefix:true};
it('compiles explicit duplicate occurrences while retaining exact source comment/formatting after semantic validation',async()=>{
 const {css}=await compileNativeStyleBodies(input,inputPath,root,ownership);
 expect(css).toBe('.repeat { color: red; /* source comment */ padding: 2px; }\n.repeat { color: blue; }');
});
it.each(['legacy-duplicate','wrong-occurrence','out-of-range','unknown-recipe','unknown-option','non-integer','format-without-isolation','extra-apply-declaration','wrong-count'] as const)('rejects %s without weakening the legacy uniqueness/default guards',async kind=>{
 let source=input;let options:NativeStyleOwnership=ownership;
 if(kind==='legacy-duplicate')options={...ownership,receivers:[['one','.repeat',null],['two','.repeat',null]]};
 if(kind==='wrong-occurrence')options={...ownership,receivers:[['one','.repeat',null,{occurrence:1,preserveFormatting:true}],ownership.receivers[1]!]};
 if(kind==='out-of-range')options={...ownership,receivers:[['one','.repeat',null,{occurrence:2,preserveFormatting:true}],ownership.receivers[1]!]};
 if(kind==='unknown-option')options={...ownership,receivers:[['one','.repeat',null,Object.assign({occurrence:0,preserveFormatting:true as const},{foreign:true})],ownership.receivers[1]!]};
 if(kind==='unknown-recipe')source=input+'\n@utility unknown {color:green;}';
 if(kind==='non-integer')options={...ownership,receivers:[['one','.repeat',null,{occurrence:0.5,preserveFormatting:true}],ownership.receivers[1]!]};
 if(kind==='format-without-isolation')options={...ownership,isolateRecipes:false};
 if(kind==='extra-apply-declaration')source=input.replace('@apply gb:one;','@apply gb:one; color:black;');
 if(kind==='wrong-count')options={...ownership,declarationCount:4};
 await expect(compileNativeStyleBodies(source,inputPath,root,options)).rejects.toMatchObject({code:'ERR_ASSERTION'});
});
