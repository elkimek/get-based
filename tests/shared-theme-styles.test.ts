import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import postcss from 'postcss';
import {expect,it} from 'vitest';
import {buildFoundationStyles,buildExtraThemeStyles} from '../scripts/build-styles.mjs';
import {compileSharedThemeStyles,sharedThemeStyleOwnership} from '../scripts/shared-theme-style-ownership.mjs';
const lanes=[['foundation','styles.css',46,165,48,40,'619922f4ca316d908d6a9596f34e4df0a278ccd9d35b92ce05ee0df5d502663e'],['themes-extra','themes-extra.css',102,204,187,0,'938d6d15cfc33554cd64f99a70d1df5e2a4add08854bf7888242b26dd5df83a5']] as const;
for(const [lane,output,recipes,declarations,nativeTokens,recipeTokens,hash] of lanes){
 it(`${lane} preserves the full native runtime stylesheet including every token, comment, value, priority and cascade byte`,async()=>{
  const original=await fs.readFile(`tests/fixtures/shared-${lane}-original.css`,'utf8');expect(createHash('sha256').update(original).digest('hex')).toBe(hash);expect(await fs.readFile(output,'utf8')).toBe(original);
  const inputPath=path.resolve(`css/${lane}.base.css`),source=await fs.readFile(inputPath,'utf8');expect((await compileSharedThemeStyles(lane,source,inputPath,process.cwd())).css).toBe(original);
 });
 it(`${lane} owns all ordinary presentation while keeping native token and keyframe grammar explicit`,async()=>{
  const tree=postcss.parse(await fs.readFile(`css/${lane}.base.css`,'utf8'));let ordinary=0,native=0,owned=0,ownedVariables=0;
  tree.walkDecls(declaration=>{let recipe=false,special=false;for(let parent:postcss.Node|undefined=declaration.parent;parent;parent=parent.parent)if(parent.type==='atrule'&&'name'in parent&&typeof parent.name==='string'){if(parent.name==='utility')recipe=true;if(['keyframes','font-face','property','theme'].includes(parent.name)||parent.name.endsWith('keyframes'))special=true;}if(special)return;if(recipe){owned++;if(declaration.prop.startsWith('--'))ownedVariables++;}else if(declaration.prop.startsWith('--'))native++;else ordinary++;});
  expect(ordinary).toBe(0);expect(native).toBe(nativeTokens);expect(ownedVariables).toBe(recipeTokens);expect(owned).toBe(declarations);expect(sharedThemeStyleOwnership[lane].receivers).toHaveLength(recipes);expect(sharedThemeStyleOwnership[lane].declarationCount).toBe(declarations);
 });
 it(`${lane} builds deterministically at the existing root runtime URL and rejects stale bytes`,async()=>{
  const directory=path.resolve('.local-notes/shared-theme-tests');await fs.mkdir(directory,{recursive:true});const outputPath=path.join(directory,lane+'.css'),build=lane==='foundation'?buildFoundationStyles:buildExtraThemeStyles;
  try{await build({outputPath});expect(await fs.readFile(outputPath,'utf8')).toBe(await fs.readFile(`tests/fixtures/shared-${lane}-original.css`,'utf8'));await build({outputPath,check:true});await fs.appendFile(outputPath,'\n/* stale */');await expect(build({outputPath,check:true})).rejects.toThrow('CSS is stale');}finally{await fs.rm(outputPath,{force:true});}
 });
 it.each(['unknown-utility','foreign-declaration','duplicate-recipe'] as const)(`${lane} rejects %s before ordinary CSS can escape its declared owner`,async kind=>{
  const inputPath=path.resolve(`css/${lane}.base.css`),source=await fs.readFile(inputPath,'utf8'),row=sharedThemeStyleOwnership[lane].receivers[0]!,needle='@apply gb:'+row[0]+';';let changed=source;
  if(kind==='unknown-utility')changed=source.replace(needle,'@apply gb:unreviewed-foreign;');
  if(kind==='foreign-declaration')changed=source.replace(needle,needle+'color:red;');
  if(kind==='duplicate-recipe')changed=source+'\n@utility '+row[0]+' {color:red;}';
  expect(changed).not.toBe(source);await expect(compileSharedThemeStyles(lane,changed,inputPath,process.cwd())).rejects.toMatchObject({code:'ERR_ASSERTION'});
 });
}
