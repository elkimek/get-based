import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import postcss from 'postcss';
import {expect,it} from 'vitest';
import {compileInlineThemeStyles,inlineThemeStyleOwnership} from '../scripts/inline-theme-style-ownership.mjs';
import {withInlineThemeStyleSnapshot} from '../scripts/inline-theme-style-snapshot.mjs';
import {buildInlineThemeStyles} from '../scripts/build-styles.mjs';
import {staticKitTemplate} from '../scripts/sveltekit-contracts.mjs';
const root=process.cwd();
async function originals(){return{index:await fs.readFile('index.html','utf8'),critical:await fs.readFile('tests/fixtures/inline-startup-layout-original.css','utf8'),modes:await fs.readFile('tests/fixtures/inline-shared-theme-modes-original.css','utf8')};}
for(const [lane,recipes,declarations,variables,hash]of [['startup-layout',1,1,0,'654ff67ecc0253ba68c3ebe6897184540dd05be79006bab6d83c82aa96fc695f'],['shared-theme-modes',10,62,4,'70a247e432e64a4e94c7e19583f6648c089abfb14138b565b6d4d83430c97e7a']]as const){
 it(`${lane} compiles exact original eager CSS including whitespace, token order and native media`,async()=>{
  const native=await fs.readFile(`tests/fixtures/inline-${lane}-original.css`,'utf8');expect(createHash('sha256').update(native).digest('hex')).toBe(hash);const file=path.join(root,`css/${lane}.base.css`),input=await fs.readFile(file,'utf8');expect((await compileInlineThemeStyles(lane,input,file,root)).css).toBe(native);
 });
 it(`${lane} owns every ordinary declaration and retains explicit native token grammar`,async()=>{
  const tree=postcss.parse(await fs.readFile(`css/${lane}.base.css`,'utf8'));let ordinary=0,tokens=0,owned=0;
  tree.walkDecls(declaration=>{let recipe=false;for(let parent:postcss.Node|undefined=declaration.parent;parent;parent=parent.parent)if(parent.type==='atrule'&&'name'in parent&&parent.name==='utility')recipe=true;if(recipe)owned++;else if(declaration.prop.startsWith('--'))tokens++;else ordinary++;});
  expect(ordinary).toBe(0);expect(tokens).toBe(variables);expect(owned).toBe(declarations);expect(inlineThemeStyleOwnership[lane].receivers).toHaveLength(recipes);expect(inlineThemeStyleOwnership[lane].declarationCount).toBe(declarations);
 });
}
it('leaves every current index byte identical, including critical timing, Legal bootstrap and complete AppShell',async()=>{
 const {index,critical,modes}=await originals();expect(withInlineThemeStyleSnapshot(index,critical,modes)).toBe(index);
 expect(index.indexOf(critical)).toBeLessThan(index.indexOf('<link rel="stylesheet" href="vendor/fonts/fonts.css">'));expect(index.indexOf(modes)).toBeGreaterThan(index.indexOf('<meta data-extra-themes-stylesheet-anchor>'));
});
it('replaces only the exact stylesheet bodies while preserving all document regions and doctype',async()=>{
 const {index,critical,modes}=await originals(),nextCritical=critical.replace('180px','181px'),nextModes=modes+'\n/* authored future update */';
 expect(withInlineThemeStyleSnapshot(index,nextCritical,nextModes)).toBe(index.replace(critical,nextCritical).replace(modes,nextModes));
});
it('preserves both eager styles in the actual Kit template outside its body ownership',async()=>{
 const {index,critical,modes}=await originals(),template=staticKitTemplate(withInlineThemeStyleSnapshot(index,critical,modes));expect(template).toContain(critical);expect(template).toContain(modes);expect(template.indexOf(critical)).toBeLessThan(template.indexOf('%sveltekit.head%'));expect(template.indexOf(modes)).toBeLessThan(template.indexOf('%sveltekit.head%'));expect(template.indexOf('PRODUCTION_LEGAL_BOOTSTRAP_START')).toBeLessThan(template.indexOf('%sveltekit.body%'));
});
it.each(['missing-critical','duplicate-critical','missing-shared','duplicate-shared','wrong-critical-owner','critical-after-fonts','shared-before-anchor','missing-bootstrap','missing-head','duplicate-head']as const)('rejects %s without widening inline ownership',async kind=>{
 const {index,critical,modes}=await originals();let input=index;
 const early='<style>'+critical+'</style>',shared='<style data-shared-theme-modes>'+modes+'</style>';
 if(kind==='missing-critical')input=index.replace(early,'');if(kind==='duplicate-critical')input=index.replace(early,early+early);if(kind==='missing-shared')input=index.replace(shared,'');if(kind==='duplicate-shared')input=index.replace(shared,shared+shared);
 if(kind==='wrong-critical-owner')input=index.replace(critical,'.foreign{color:red}');
 if(kind==='critical-after-fonts')input=index.replace(early,'').replace('<link rel="stylesheet" href="vendor/fonts/fonts.css">','<link rel="stylesheet" href="vendor/fonts/fonts.css">'+early);
 if(kind==='shared-before-anchor')input=index.replace(shared,'').replace('<meta data-extra-themes-stylesheet-anchor>',shared+'<meta data-extra-themes-stylesheet-anchor>');
 if(kind==='missing-bootstrap')input=index.replace('<script src="js/theme-bootstrap.js"></script>','');if(kind==='missing-head')input=index.replace('</head>','');if(kind==='duplicate-head')input=index.replace('<head>','<head><head>');
 expect(input).not.toBe(index);expect(()=>withInlineThemeStyleSnapshot(input,critical,modes)).toThrow();
});
it.each(['</style><script>foreign()</script>','</STYLE >foreign']as const)('rejects CSS that closes the embedding style element: %s',async foreign=>{
 const {index,critical,modes}=await originals();expect(()=>withInlineThemeStyleSnapshot(index,critical+foreign,modes)).toThrow('cannot close');expect(()=>withInlineThemeStyleSnapshot(index,critical,modes+foreign)).toThrow('cannot close');
});
it('uses maintained build/check entry to detect and repair only stale stylesheet bytes',async()=>{
 const {index,critical}=await originals(),directory=path.resolve('.local-notes/inline-theme-tests');await fs.mkdir(directory,{recursive:true});const outputPath=path.join(directory,'index.html');
 try{await fs.writeFile(outputPath,index);await buildInlineThemeStyles({outputPath,check:true});await fs.writeFile(outputPath,index.replace(critical,critical.replace('180px','181px')));await expect(buildInlineThemeStyles({outputPath,check:true})).rejects.toThrow('Inline theme CSS is stale');await buildInlineThemeStyles({outputPath});expect(await fs.readFile(outputPath,'utf8')).toBe(index);}finally{await fs.rm(outputPath,{force:true});}
});
