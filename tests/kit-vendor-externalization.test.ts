import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {afterEach,beforeAll,expect,it} from 'vitest';
import {build as buildVite,type Rolldown} from '../tooling/svelte/node_modules/vite/dist/node/index.js';
import {qualifyBrowserVendorAssets,BROWSER_VENDOR_SDKS} from '../scripts/browser-vendor-contracts.mjs';
import {createKitVendorExternals,isKitClientEnvironment} from '../tooling/svelte/kit-vendor-externals.mjs';
import {parseModuleSpecifiers} from '../scripts/architecture-map.mjs';
import {inlineServiceWorkerAssets} from '../scripts/service-worker-source.js';
import {pruneSourceModuleAppShell} from '../scripts/static-build-assets.mjs';
import {summarizeAppShell} from '../scripts/app-shell-budget.mjs';

const root=process.cwd(),temporary:string[]=[];
let vendors:Awaited<ReturnType<typeof qualifyBrowserVendorAssets>>;
beforeAll(async()=>{vendors=await qualifyBrowserVendorAssets({root});});
afterEach(async()=>{await Promise.all(temporary.splice(0).map(directory=>fs.rm(directory,{recursive:true,force:true})));});
const shell=(urls:readonly string[])=>'const APP_SHELL = '+JSON.stringify(urls)+';';
it.each([
 ['client','client',true],['client','server',false],['ssr','server',false],
 ['prerender','server',false],['worker','client',false],['client',undefined,false],
]as const)('only enables exact client browser environment %s/%s',(name,consumer,expected)=>{
 const config=consumer?{consumer}:{};
 expect(isKitClientEnvironment({name,config})).toBe(expected);
 const plugin=createKitVendorExternals({root});
 expect(plugin.apply).toBe('build');expect(plugin.enforce).toBe('pre');
 expect(plugin.applyToEnvironment).toBe(isKitClientEnvironment);
});
async function bundle(code:string,{unknown=[],server=false,failQualification=false}:{unknown?:readonly string[];server?:boolean;failQualification?:boolean}={}):Promise<Rolldown.OutputChunk[]> {
 const entry='getbased:kit-sdk-integration';
 const options=failQualification?{root,read:async()=>{throw new Error('NON_CLIENT_MUST_NOT_QUALIFY_BROWSER_SDKS');}}:{root};
 const result=await buildVite({configFile:false,root,publicDir:false,logLevel:'silent',
  plugins:[createKitVendorExternals(options),{
   name:'controlled-kit-sdk-integration',resolveId(id){return id===entry||unknown.includes(id)?id:null;},
   load(id){if(id===entry)return code;if(unknown.includes(id))return'export const unqualified="UNQUALIFIED_KIT_SDK_MUST_STAY_BUNDLED_'+unknown.indexOf(id)+'";';return null;},
  }],build:{write:false,emptyOutDir:false,minify:false,ssr:server,
   rolldownOptions:{input:entry,preserveEntrySignatures:'strict',output:{format:'es'}}}});
 if(Array.isArray(result)||!('output'in result))throw new Error('Expected one in-memory Vite output');
 return result.output.filter((item):item is Rolldown.OutputChunk=>item.type==='chunk');
}
it.each(['static','dynamic']as const)('real Vite client %s output reuses only the five absolute stable vendor URLs',async mode=>{
 const code=BROWSER_VENDOR_SDKS.map((sdk,i)=>mode==='static'?'export * as sdk'+i+' from '+JSON.stringify(path.join(root,sdk.file))+';':'export const sdk'+i+'=()=>import('+JSON.stringify(path.join(root,sdk.file))+');').join('\n');
 const chunks=await bundle(code);expect(chunks).toHaveLength(1);
 const output=chunks[0]!,graph=parseModuleSpecifiers(output.code,'kit-sdk-integration.js');
 expect(graph.dependencies.map(edge=>edge.specifier).sort()).toEqual(BROWSER_VENDOR_SDKS.map(sdk=>'/'+sdk.file).sort());
 expect(graph.nonLiteralDynamicImports).toEqual([]);
 const modules=Object.keys(output.modules);expect(modules).toContain('getbased:kit-sdk-integration');
 // Vite may inject its own finite preload helper for a dynamic external edge.
 expect(modules.filter(id=>id!=='getbased:kit-sdk-integration'&&id!=='\0vite/preload-helper.js')).toEqual([]);
 for(const sdk of BROWSER_VENDOR_SDKS)expect(output.code).toContain('/'+sdk.file);
});
it('does not qualify or externalize browser URLs in actual Vite SSR output',async()=>{
 const code=BROWSER_VENDOR_SDKS.map((sdk,i)=>'export * as sdk'+i+' from '+JSON.stringify(path.join(root,sdk.file))+';').join('\n');
 const chunks=await bundle(code,{server:true,failQualification:true});
 expect(chunks.flatMap(chunk=>Object.keys(chunk.modules)).filter(id=>BROWSER_VENDOR_SDKS.some(sdk=>id===path.join(root,sdk.file))).sort()).toEqual(BROWSER_VENDOR_SDKS.map(sdk=>path.join(root,sdk.file)).sort());
 for(const chunk of chunks)expect(parseModuleSpecifiers(chunk.code).dependencies.filter(edge=>edge.specifier.startsWith('/vendor/'))).toEqual([]);
});
it('unknown physical siblings, nested basenames and SDK query/hash lookalikes stay bundled in actual Vite client output',async()=>{
 const sdk=path.join(root,'vendor/tinfoil-browser.js');
 const unknown=[path.join(root,'vendor/unqualified/tinfoil-browser.js'),path.join(root,'js/vendor/tinfoil-browser.js'),sdk+'?foreign=1',sdk+'#foreign'];
 const chunks=await bundle(unknown.map((file,i)=>'export {unqualified as copy'+i+'} from '+JSON.stringify(file)+';').join('\n'),{unknown});
 expect(chunks).toHaveLength(1);expect(Object.keys(chunks[0]!.modules).filter(id=>unknown.includes(id)).sort()).toEqual([...unknown].sort());
 for(const i of unknown.keys())expect(chunks[0]!.code).toContain('UNQUALIFIED_KIT_SDK_MUST_STAY_BUNDLED_'+i);
 expect(parseModuleSpecifiers(chunks[0]!.code).dependencies).toEqual([]);
});
it('resolves relative imports from genuine native retry roots but rejects package and public URL lookalikes',()=>{
 const importer=path.join(root,'js/api-venice.js');
 expect(vendors.resolve('../vendor/venice-e2ee.js',importer+'?lazy-retry=1')?.url).toBe('/vendor/venice-e2ee.js');
 for(const source of ['venice-e2ee','/vendor/venice-e2ee.js','../vendor/venice-e2ee.js?foreign=1','../vendor/venice-e2ee.js#foreign'])expect(vendors.resolve(source,importer)).toBeNull();
});
async function copiedDirectory():Promise<string> {
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'getbased-kit-vendors-'));temporary.push(directory);
 await fs.mkdir(path.join(directory,'vendor'));
 for(const asset of vendors.assets)await fs.copyFile(path.join(root,asset.file),path.join(directory,asset.file));
 return directory;
}
it('keeps complete exact copied SDK bytes in both public site and measured service worker shell',async()=>{
 const directory=await copiedDirectory();await expect(vendors.assertCopiedAssets(directory)).resolves.toBeUndefined();
 const raw=inlineServiceWorkerAssets(await fs.readFile('service-worker.js','utf8'),await fs.readFile('service-worker-assets.js','utf8'));
 expect(()=>vendors.assertShell(pruneSourceModuleAppShell(raw,new Set()))).not.toThrow();
 const metrics=await summarizeAppShell({serviceWorkerSource:shell(vendors.assets.map(asset=>asset.url)),artifactRoot:directory});
 expect(metrics).toEqual({resources:5,decodedBytes:729249});
});
it.each(['missing','truncated','same-size-corruption']as const)('rejects copied public SDK %s before emitting a Kit artifact',async kind=>{
 const directory=await copiedDirectory(),file=path.join(directory,'vendor/tinfoil-browser.js');
 if(kind==='missing')await fs.unlink(file);
 else{const bytes=await fs.readFile(file);if(kind==='truncated')await fs.writeFile(file,bytes.subarray(1));else{bytes[0]=bytes[0]!^1;await fs.writeFile(file,bytes);}}
 await expect(vendors.assertCopiedAssets(directory)).rejects.toThrow();
});
it.each(BROWSER_VENDOR_SDKS)('rejects missing or duplicated final APP_SHELL SDK $file',sdk=>{
 const urls=vendors.assets.map(asset=>asset.url);
 expect(()=>vendors.assertShell(shell(urls.filter(url=>url!=='/'+sdk.file)))).toThrow('APP_SHELL');
 expect(()=>vendors.assertShell(shell([...urls,'/'+sdk.file]))).toThrow('APP_SHELL');
});
