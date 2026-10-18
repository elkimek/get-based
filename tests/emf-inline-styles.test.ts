import {expect,it} from 'vitest';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import postcss from 'postcss';
import fixture from './fixtures/emf-inline-styles-original.json' with {type:'json'};
import {inlineStyleMapOwners} from '../scripts/inline-style-map-owners.mjs';
import {compileInlineStyleMap,buildInlineStyleMaps} from '../scripts/build-inline-style-maps.mjs';
const root=process.cwd(),owner=inlineStyleMapOwners.find(row=>row.id==='emf-inline')!;
const inputPath=path.join(root,'css/emf-inline.tailwind.css'),input=fs.readFileSync(inputPath,'utf8');
const expected=Object.fromEntries(fixture.recipes.map(row=>[row.key,row.body]));
async function exact(source=input){const result=await compileInlineStyleMap(source,inputPath,root,owner);expect(result.values).toEqual(expected);expect(Object.keys(result.values)).toEqual(fixture.recipes.map(row=>row.key));return result;}
it('pins the original inline lexemes and owns exactly27 occurrences,22 declarations and11 recipes',()=>{
 expect(createHash('sha256').update(fs.readFileSync('tests/fixtures/emf-inline-styles-original.json')).digest('hex')).toBe('be00975026b5924c4efdc6aa02b6962d88e13f9c749968131e8b93a347802bae');
 expect(fixture.ordinaryOccurrences).toBe(27);expect(fixture.uniqueRecipeDeclarations).toBe(22);expect(fixture.recipeCount).toBe(11);expect(owner.declarationCount).toBe(22);
 expect(owner.recipes).toEqual(fixture.recipes.map(row=>[row.key,row.utility]));
 expect(fixture.recipes.reduce((n,row)=>n+row.declarations,0)).toBe(22);
});
it('generates byte-exact original style values and a closed readonly typed map through actual Tailwind',async()=>{
 const result=await exact();expect(fs.readFileSync(path.join(root,owner.output),'utf8')).toBe(result.javascript);expect(fs.readFileSync(path.join(root,owner.output.replace(/\.js$/,'.d.ts')),'utf8')).toBe(result.declaration);
 expect(result.javascript).toContain('Object.freeze(');expect(result.declaration.match(/readonly /g)).toHaveLength(11);
});
for(const row of fixture.recipes)it('rejects changed native value for '+row.key,async()=>{
 const tree=postcss.parse(input);let changed=0;tree.walkAtRules('utility',node=>{if(node.params!==row.utility)return;const first=node.nodes?.[0];if(first?.type!=='decl')throw new Error('Expected original declaration');first.value='initial';changed++;});expect(changed).toBe(1);await expect(exact(tree.toString())).rejects.toThrow();
});
for(const[name,mutate]of[
 ['missing recipe',(s:string)=>s.replace('@utility emf-inline-row-fill','@utility foreign-row-fill')],
 ['extra declaration',(s:string)=>s.replace('@apply gb:emf-inline-row-fill;','@apply gb:emf-inline-row-fill;color:red;')],
 ['foreign receiver',(s:string)=>s.replace('.emf-inline-row-fill{','.foreign-row-fill{')],
 ['foreign rule',(s:string)=>s+'\n.foreign{color:red}'],
]as const)it('rejects '+name+' instead of silently generating partial styling',async()=>{const changed=mutate(input);expect(changed).not.toBe(input);await expect(exact(changed)).rejects.toThrow();});
it('changes only the finite native style fragments in all five components, preserving dynamic expressions and every other source byte',()=>{
 for(const component of fixture.components){let source=fs.readFileSync(component.component,'utf8');const imported="\n import {emfStaticStyles} from '../emf-inline-style-map.generated.js';";expect(source.split(imported)).toHaveLength(2);source=source.replace(imported,'');for(const row of component.replacements){expect(source.split(row.after).length-1).toBe(row.occurrences);source=source.split(row.after).join(row.before);}expect(createHash('sha256').update(source).digest('hex')).toBe(component.sourceSha256);}
});
it('retains the native hidden file-picker ports and actual click/label activation contracts',()=>{
 expect(expected.filePickerHidden).toBe('display:none');const editor=fs.readFileSync('js/components/EMFEditor.svelte','utf8'),room=fs.readFileSync('js/components/EMFRoomContent.svelte','utf8'),controller=fs.readFileSync('js/emf-editor.ts','utf8');
 expect(editor).toMatch(/id="emf-pdf-input"[^>]*style=\{emfStaticStyles.filePickerHidden\}/);expect(room).toMatch(/<label class="emf-photo-add" title="Add photo">[\s\S]*?<input type="file"[^>]*style=\{emfStaticStyles.filePickerHidden\}[^>]*data-emf-change-action="photos"/);expect(controller).toContain("document.getElementById('emf-pdf-input')?.click()");
});
it('rejects stale generated maps rather than permitting runtime fallback styles',async()=>{
 const temporary=await fsp.mkdtemp(path.join(os.tmpdir(),'getbased-emf-inline-'));
 try{await fsp.mkdir(path.join(temporary,'css'));await fsp.writeFile(path.join(temporary,owner.input),input);await fsp.symlink(path.join(root,'node_modules'),path.join(temporary,'node_modules'),'dir');await buildInlineStyleMaps(temporary,[owner]);await buildInlineStyleMaps(temporary,[owner],true);await fsp.appendFile(path.join(temporary,owner.output),'// stale\n');await expect(buildInlineStyleMaps(temporary,[owner],true)).rejects.toThrow('Generated inline style map is stale');}finally{await fsp.rm(temporary,{recursive:true,force:true});}
});
it('precaches the generated map exactly once at its public runtime URL',()=>{const source=fs.readFileSync('service-worker-assets.ts','utf8');expect(source.split("'/js/emf-inline-style-map.generated.js'").length-1).toBe(1);});
