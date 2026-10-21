import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {beforeAll,expect,it} from 'vitest';
import {build,type OutputChunk} from 'rolldown';
import {createNativeVendorExternals,NATIVE_VENDOR_SDKS} from '../scripts/native-vendor-externals.mjs';
import {parseModuleSpecifiers} from '../scripts/architecture-map.mjs';
import {summarizeAppShell} from '../scripts/app-shell-budget.mjs';
import {inlineServiceWorkerAssets} from '../scripts/service-worker-source.js';
import {pruneSourceModuleAppShell} from '../scripts/static-build-assets.mjs';

const root=process.cwd();
// Independent complete generated vendor bytes, reviewed against locked package
// provenance. The externalization helper cannot manufacture these expectations.
const immutable=[
 ['vendor/tinfoil-browser.js','tinfoil','1.2.1','ff4f3edb6bbc76f59e4201438c0b6e5b8e767eee1b484af8e9a921b9485bbec0'],
 ['vendor/ehbp-browser.js','ehbp','0.3.2','0b1920574176ad02cf22a35cfabb0178c6b3c52fa50281799390399aa936a30c'],
 ['vendor/venice-dcap.js','@phala/dcap-qvl','0.6.3','fce31e45aac962dfb4f7e77500e15df0c1d61e952f4560d2f85bf96159c063ce'],
 ['vendor/venice-e2ee.js','venice-e2ee','0.5.3','02aa0a9aa5d85582c5ad0f95c3af8812930f802bac3a9a261e0f8abbe7636f3d'],
 ['vendor/venice-nvidia.js','venice-e2ee','0.5.3','dd61d41c2ecc02bfe7863fee100d728c523cb880a251c76db87d8d3d9c950480'],
]as const;
let vendors:Awaited<ReturnType<typeof createNativeVendorExternals>>;
beforeAll(async()=>{vendors=await createNativeVendorExternals({root});});
const shell=(urls:readonly string[])=>'const APP_SHELL = '+JSON.stringify(urls)+';';
it('qualifies exactly the five independent complete SDK hashes and locked immutable package provenance',async()=>{
 const manifest=JSON.parse(await fs.readFile('vendor/browser-vendors.json','utf8'))as{runtimes:Array<{output:string;package:string;version:string;sha256:string}>};
 expect(NATIVE_VENDOR_SDKS.map(sdk=>sdk.file)).toEqual(immutable.map(row=>row[0]));expect(vendors.assets).toHaveLength(5);
 for(const[file,pkg,version,digest]of immutable){
  const source=await fs.readFile(file,'utf8');expect(createHash('sha256').update(source).digest('hex')).toBe(digest);
  expect(manifest.runtimes.find(row=>row.output===file)).toMatchObject({package:pkg,version,sha256:digest});
  expect(vendors.assets.find(asset=>asset.file===file)).toEqual({file,url:'/'+file,bytes:Buffer.byteLength(source),sha256:digest});
  expect(vendors.paths[path.join(root,file)]).toBe('../'+file);
 }
});
it('keeps all full SDK resources in the real pruned worker and the complete reviewed APP_SHELL byte metric',async()=>{
 const worker=inlineServiceWorkerAssets(await fs.readFile('service-worker.js','utf8'),await fs.readFile('service-worker-assets.js','utf8'));
 const pruned=pruneSourceModuleAppShell(worker,new Set());expect(()=>vendors.assertShell(pruned)).not.toThrow();
 const urls=vendors.assets.map(asset=>asset.url),metrics=await summarizeAppShell({serviceWorkerSource:shell(urls),artifactRoot:path.join(os.tmpdir(),'getbased-native-vendor-no-artifact'),sourceRoot:root});
 expect(metrics).toEqual({resources:5,decodedBytes:736798});expect(metrics.decodedBytes).toBe(vendors.assets.reduce((bytes,asset)=>bytes+asset.bytes,0));
});
it.each(immutable)('rejects lost or duplicated cached immutable resource %s',file=>{
 const urls=vendors.assets.map(asset=>asset.url);expect(()=>vendors.assertShell(shell(urls.filter(url=>url!=='/'+file)))).toThrow('APP_SHELL');expect(()=>vendors.assertShell(shell([...urls,'/'+file]))).toThrow();
});
async function bundle(code:string,unknown:readonly string[]=[]):Promise<OutputChunk[]> {
 const entry='getbased:native-sdk-integration';
 const result=await build({input:entry,platform:'browser',write:false,plugins:[vendors.plugin,{
  name:'controlled-native-sdk-integration',resolveId(id){return id===entry||unknown.includes(id)?id:null;},
  load(id){if(id===entry)return code;if(unknown.includes(id))return'export const unqualified="UNQUALIFIED_NATIVE_SDK_MUST_STAY_BUNDLED_'+unknown.indexOf(id)+'";';return null;},
 }],output:{dir:path.join(os.tmpdir(),'getbased-native-sdk-integration','js'),format:'es',minify:true,paths:vendors.paths}});
 return result.output.filter((item):item is OutputChunk=>item.type==='chunk');
}
it.each(['static','dynamic']as const)('actual Rolldown %s imports reuse unchanged stable files without bundling any SDK implementation',async mode=>{
 const code=NATIVE_VENDOR_SDKS.map((sdk,i)=>mode==='static'?'export * as sdk'+i+' from '+JSON.stringify(path.join(root,sdk.file))+';':'export const sdk'+i+'=()=>import('+JSON.stringify(path.join(root,sdk.file))+');').join('\n');
 const chunks=await bundle(code);expect(chunks).toHaveLength(1);
 const output=chunks[0]!,graph=parseModuleSpecifiers(output.code,'native-sdk-integration.js');
 expect(graph.dependencies.map(edge=>edge.specifier).sort()).toEqual(NATIVE_VENDOR_SDKS.map(sdk=>'../'+sdk.file).sort());expect(graph.nonLiteralDynamicImports).toEqual([]);
 expect(Object.keys(output.modules)).toEqual(['getbased:native-sdk-integration']);
 for(const sdk of NATIVE_VENDOR_SDKS)expect(output.code).toContain('../'+sdk.file);
});
it('never externalizes an unknown sibling, nested basename or queried lookalike',async()=>{
 const unknown=[path.join(root,'vendor/unqualified/tinfoil-browser.js'),path.join(root,'js/vendor/tinfoil-browser.js'),path.join(root,'vendor/tinfoil-browser.js')+'?unqualified=1'];
 const chunks=await bundle(unknown.map((file,i)=>'export {unqualified as copy'+i+'} from '+JSON.stringify(file)+';').join('\n'),unknown);
 expect(chunks).toHaveLength(1);expect(Object.keys(chunks[0]!.modules).filter(file=>unknown.includes(file)).sort()).toEqual([...unknown].sort());
 for(const i of unknown.keys())expect(chunks[0]!.code).toContain('UNQUALIFIED_NATIVE_SDK_MUST_STAY_BUNDLED_'+i);
 expect(parseModuleSpecifiers(chunks[0]!.code).dependencies).toEqual([]);
});
const readMutated=(change:(file:string,source:string)=>string)=>(async(file:string)=>change(path.relative(root,file).replaceAll(path.sep,'/'),await fs.readFile(file,'utf8')));
it.each(immutable)('rejects a changed complete vendor file %s',async file=>{
 await expect(createNativeVendorExternals({root,read:readMutated((name,source)=>source+(name===file?'\nforeign':''))})).rejects.toThrow('immutable browser SDK');
});
it.each(['manifest-hash','manifest-package','manifest-entry','manifest-format','manifest-minification','manifest-duplicate','lock-version','lock-integrity']as const)('rejects %s provenance corruption',async kind=>{
 const reader=readMutated((file,source)=>{
  if(file==='vendor/browser-vendors.json'&&kind.startsWith('manifest-')){
   const manifest=JSON.parse(source)as{runtimes:Array<{output:string;sha256:string;package:string;entry:string;format:string;minified:boolean}>},sdk=manifest.runtimes.find(entry=>entry.output==='vendor/tinfoil-browser.js')!;
   if(kind==='manifest-hash')sdk.sha256='foreign';if(kind==='manifest-package')sdk.package='foreign';if(kind==='manifest-entry')sdk.entry='foreign';if(kind==='manifest-format')sdk.format='iife';if(kind==='manifest-minification')sdk.minified=false;if(kind==='manifest-duplicate')manifest.runtimes.push({...sdk});return JSON.stringify(manifest);
  }
  if(file==='package-lock.json'&&kind.startsWith('lock-')){const lock=JSON.parse(source)as{packages:Record<string,{version:string;integrity:string}>};if(kind==='lock-version')lock.packages['node_modules/tinfoil']!.version='foreign';else lock.packages['node_modules/tinfoil']!.integrity='foreign';return JSON.stringify(lock);}return source;
 });await expect(createNativeVendorExternals({root,read:reader})).rejects.toThrow();
});
it.each(["\nimport './unlisted.js';","\nimport(globalThis.unqualifiedSDK);","\nnew Worker('./unlisted-worker.js');","\nvoid import.meta.url;"])('rejects added transitive/relative dependency despite an updated digest: %s',async suffix=>{
 const file='vendor/tinfoil-browser.js',changed=await fs.readFile(file,'utf8')+suffix,digest=createHash('sha256').update(changed).digest('hex');
 const reader=readMutated((name,source)=>{if(name===file)return changed;if(name==='vendor/browser-vendors.json'){const manifest=JSON.parse(source)as{runtimes:Array<{output:string;sha256:string}>};manifest.runtimes.find(entry=>entry.output===file)!.sha256=digest;return JSON.stringify(manifest);}return source;});
 await expect(createNativeVendorExternals({root,read:reader})).rejects.toThrow(/transitive|computed|worker|relative/);
});
