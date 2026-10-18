import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {readFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {afterEach,expect,it} from 'vitest';
import * as ts from 'typescript/unstable/ast';
import {withParsedSource} from '../scripts/native-typescript-ast.js';
import {compileInlineStyleMap,buildInlineStyleMaps} from '../scripts/build-inline-style-maps.mjs';
import {inlineStyleMapOwners,type InlineStyleMapOwner} from '../scripts/inline-style-map-owners.mjs';
import {isSourceFile} from '../scripts/source-files.js';
import {collectRawModuleAssets} from '../scripts/raw-module-assets.mjs';
import {staticBuildInputFiles,createStaticBuildFingerprint} from '../scripts/static-build-inputs.mjs';
import {syncInlineStyles} from '../js/sync-inline-style-map.generated.js';
import original from './fixtures/sync-inline-style-original.json' with {type:'json'};
const owner=inlineStyleMapOwners.find(row=>row.id===original.owner.id)!;
const root=process.cwd(),inputPath=path.join(root,original.owner.input),source=readFileSync(inputPath,'utf8');
const roots:string[]=[];afterEach(async()=>{await Promise.all(roots.splice(0).map(directory=>fs.rm(directory,{recursive:true,force:true})));});
async function fixture(){const directory=await fs.mkdtemp(path.join(os.tmpdir(),'getbased-inline-map-'));roots.push(directory);return directory;}
async function exact(input=source){const result=await compileInlineStyleMap(input,inputPath,root,owner);expect(result.values).toEqual(Object.fromEntries(original.recipes.map(row=>[row.key,row.body])));return result;}
it('builds every exact native Sync style value once and exposes immutable explicit typed keys',async()=>{
 const result=await exact();expect(syncInlineStyles).toEqual(result.values);expect(Object.isFrozen(syncInlineStyles)).toBe(true);expect(Object.keys(syncInlineStyles)).toHaveLength(64);
 expect(result.declaration).not.toContain('any');expect(result.declaration).not.toContain('Record');for(const [key]of original.owner.recipes)expect(result.declaration).toContain('readonly '+key+': string;');
});
it.each(original.recipes)('rejects changed native value for $key without changing recipe counts',async row=>{
 const token='@utility '+row.utility+' {';const start=source.indexOf(token)+token.length;expect(start).toBeGreaterThan(token.length);
 const changed=source.slice(0,start)+row.body.replace(/:([^;]+)/,':__changed')+source.slice(start+row.body.length);expect(changed).not.toBe(source);await expect(exact(changed)).rejects.toThrow();
});
it.each([
 ['missing recipe',(value:string)=>value.replace('@utility '+original.recipes[0]!.utility+' {','@utility unreviewed {')],
 ['missing apply',(value:string)=>value.replace('@apply gb:'+original.recipes[0]!.utility+';','color:red;')],
 ['foreign rule',(value:string)=>value+'\n.foreign{color:red}'],
 ['foreign group',(value:string)=>value+'\n@supports(display:grid){.foreign{display:grid}}'],
] as const)('rejects %s instead of silently discarding authored CSS',async(_label,change)=>{await expect(exact(change(source))).rejects.toThrow();});
const scalar:InlineStyleMapOwner={id:'scalar',input:'css/scalar-inline.tailwind.css',output:'js/scalar-inline-style-map.generated.js',exportName:'scalarStyles',declarationCount:1,recipes:[['color','scalar-color','color']]};
const scalarCSS='@import "tailwindcss" prefix(gb) source(none) reference;\n@utility scalar-color {color:var(--green)}\n\n.scalar-color { @apply gb:scalar-color; }';
it('projects one CSS property value for native setters without changing unrelated inline style or priorities',async()=>{expect((await compileInlineStyleMap(scalarCSS,path.join(root,scalar.input),root,scalar)).values).toEqual({color:'var(--green)'});});
it('rejects incorrect scalar property identity and priority',async()=>{
 await expect(compileInlineStyleMap(scalarCSS,path.join(root,scalar.input),root,{...scalar,recipes:[['color','scalar-color','background']]})).rejects.toThrow();
 await expect(compileInlineStyleMap(scalarCSS.replace('color:var(--green)','color:var(--green)!important'),path.join(root,scalar.input),root,scalar)).rejects.toThrow();
});
it('checks stale artifacts and rebuilds JS plus exact declarations from a clean source-only tree',async()=>{
 const directory=await fixture();await fs.symlink(path.join(root,'node_modules'),path.join(directory,'node_modules'),'dir');await fs.mkdir(path.join(directory,'css'));await fs.writeFile(path.join(directory,scalar.input),scalarCSS);await buildInlineStyleMaps(directory,[scalar]);await buildInlineStyleMaps(directory,[scalar],true);
 await fs.writeFile(path.join(directory,scalar.output),'foreign JS');await expect(buildInlineStyleMaps(directory,[scalar],true)).rejects.toThrow('stale');await buildInlineStyleMaps(directory,[scalar]);
 await fs.writeFile(path.join(directory,scalar.output.replace(/\.js$/,'.d.ts')),'export const wrong: any;');await expect(buildInlineStyleMaps(directory,[scalar],true)).rejects.toThrow('stale');
});
it('excludes only registered generated artifacts from authored inventory while unknown names stay visible',()=>{
 for(const owner of inlineStyleMapOwners){expect(isSourceFile(path.join(root,owner.output))).toBe(false);expect(isSourceFile(path.join(root,owner.output.replace('.generated.js','-unknown.generated.js')))).toBe(true);}
});
it('versions canonical recipe changes and ignores only registered generated declarations',async()=>{
 const directory=await fixture(),owner=inlineStyleMapOwners[0]!;await fs.mkdir(path.join(directory,'css'));await fs.mkdir(path.join(directory,'js'));await fs.writeFile(path.join(directory,owner.input),'canonical-before');await fs.writeFile(path.join(directory,owner.output.replace(/\.js$/,'.d.ts')),'generated-before');
 const fingerprint=async()=>{const {fingerprint}=await createStaticBuildFingerprint(directory,'rev','tag',[]);return fingerprint.digest('hex');};const before=await fingerprint();await fs.writeFile(path.join(directory,owner.output.replace(/\.js$/,'.d.ts')),'generated-after');expect(await fingerprint()).toBe(before);await fs.writeFile(path.join(directory,owner.input),'canonical-after');expect(await fingerprint()).not.toBe(before);
 await fs.writeFile(path.join(directory,'js/unregistered.generated.d.ts'),'unknown source');expect(await staticBuildInputFiles(directory,[])).toContain('js/unregistered.generated.d.ts');
});
function cachedGeneratedMaps(worker:string){
 const assets=withParsedSource(worker,'service-worker-assets.ts',file=>{let result:string[]|undefined;file.forEachChild(node=>{if(!ts.isVariableStatement(node))return;for(const declaration of node.declarationList.declarations)if(ts.isIdentifier(declaration.name)&&declaration.name.text==='APP_SHELL'){assert.ok(declaration.initializer&&ts.isArrayLiteralExpression(declaration.initializer));result=declaration.initializer.elements.map(element=>{assert.ok(ts.isStringLiteral(element));return element.text;});}});assert.ok(result);return result;});
 for(const owner of inlineStyleMapOwners)assert.equal(assets.filter(url=>url==='/'+owner.output).length,1,'Generated inline map is a cached runtime module');
}
it('retains each generated runtime map in the actual worker roster and rejects a missing asset',()=>{
 const worker=readFileSync('service-worker-assets.ts','utf8');cachedGeneratedMaps(worker);for(const owner of inlineStyleMapOwners)expect(()=>cachedGeneratedMaps(worker.replace("'/"+owner.output+"'","'/missing-map.js'"))).toThrow();
});

it('keeps registered generated values in native import graphs despite authored-inventory exclusion',async()=>{
 for(const owner of inlineStyleMapOwners){
  const entry='/js/current-native-controller.js',dependency='/'+owner.output;
  const graph=await collectRawModuleAssets(new Set([entry]),url=>url===entry?Promise.resolve('import { '+owner.exportName+' } from '+JSON.stringify(dependency)+';\nexport const values = '+owner.exportName+';'):fs.readFile(path.join(root,url.slice(1)),'utf8'));
  expect([...graph].sort()).toEqual([entry,dependency].sort());
 }
});
