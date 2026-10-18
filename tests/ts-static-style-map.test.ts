import fs from 'node:fs/promises';
import path from 'node:path';
import {expect,it} from 'vitest';
import {compileInlineStyleMap,buildInlineStyleMaps} from '../scripts/build-inline-style-maps.mjs';
import {tsStaticStyleOwner as owner} from '../scripts/ts-static-style-owner.mjs';
import type {InlineStyleMapOwner} from '../scripts/inline-style-map-owners.mjs';
import {tsStaticStyles} from '../js/ts-static-ui-inline-style-map.generated.js';
import original from './fixtures/ts-static-style-original.json' with {type:'json'};
const root=process.cwd(),inputPath=path.join(root,owner.input);
it('retains every independent original CSStext/property lexeme and exact typed keys in a frozen generated map',async()=>{
 expect(owner).toEqual(original.owner);expect(owner.recipes).toHaveLength(10);expect(owner.declarationCount).toBe(28);expect(Object.keys(tsStaticStyles)).toEqual(Object.keys(original.values));expect(tsStaticStyles).toEqual(original.values);expect(Object.isFrozen(tsStaticStyles)).toBe(true);
 const result=await compileInlineStyleMap(await fs.readFile(inputPath,'utf8'),inputPath,root,owner);expect(result.values).toEqual(original.values);expect(result.javascript).toBe(await fs.readFile(owner.output,'utf8'));expect(result.declaration).toBe(await fs.readFile(owner.output.replace(/\.js$/,'.d.ts'),'utf8'));
});
it('builds/checks both generated artifacts and rejects stale bytes without overwriting them',async()=>{
 const testOwner={...owner,output:'js/.local-notes/ts-static-test.generated.js'};
 try{await buildInlineStyleMaps(root,[testOwner]);await buildInlineStyleMaps(root,[testOwner],true);await fs.appendFile(testOwner.output,'\n// stale');await expect(buildInlineStyleMaps(root,[testOwner],true)).rejects.toThrow('stale');expect(await fs.readFile(testOwner.output,'utf8')).toContain('// stale');}finally{await fs.rm(testOwner.output,{force:true});await fs.rm(testOwner.output.replace(/\.js$/,'.d.ts'),{force:true});}
});
it.each(['foreign-root','extra-property','wrong-property','important-property','unknown-apply']as const)('rejects %s instead of silently changing physical inline behavior',async kind=>{
 let input=await fs.readFile(inputPath,'utf8');let candidate:InlineStyleMapOwner=owner;
 if(kind==='foreign-root')input+='\n.foreign{color:red}';
 if(kind==='extra-property'){input=input.replace('@utility ts-static-commit-link-color {color:var(--text-muted)}','@utility ts-static-commit-link-color {color:var(--text-muted);opacity:1}');candidate={...owner,declarationCount:29};}
 if(kind==='wrong-property')candidate={...owner,recipes:owner.recipes.map(row=>row[0]==='commitLinkColor'?[row[0],row[1],'opacity']as const:row)};
 if(kind==='important-property')input=input.replace('@utility ts-static-commit-link-color {color:var(--text-muted)}','@utility ts-static-commit-link-color {color:var(--text-muted)!important}');
 if(kind==='unknown-apply')input=input.replace('@apply gb:ts-static-editor-input;','@apply gb:unreviewed;');
 expect(input!==await fs.readFile(inputPath,'utf8')||candidate!==owner).toBe(true);await expect(compileInlineStyleMap(input,inputPath,root,candidate)).rejects.toMatchObject({code:'ERR_ASSERTION'});
});
