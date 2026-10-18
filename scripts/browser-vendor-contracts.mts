import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {parseModuleSpecifiers} from './architecture-map.mjs';
import {parseAppShellEntries} from './app-shell-budget.mjs';

/** These self-contained ESM SDKs already have immutable vendor provenance and
 * full APP_SHELL coverage. Never externalize a directory or an inferred SDK. */
export const BROWSER_VENDOR_SDKS=[
 {file:'vendor/tinfoil-browser.js',package:'tinfoil',entry:'scripts/vendor-entries/tinfoil.js'},
 {file:'vendor/ehbp-browser.js',package:'ehbp',entry:'scripts/vendor-entries/ehbp.js'},
 {file:'vendor/venice-dcap.js',package:'@phala/dcap-qvl',entry:'scripts/vendor-entries/venice-dcap.js'},
 {file:'vendor/venice-e2ee.js',package:'venice-e2ee',entry:'scripts/vendor-entries/venice-e2ee.js'},
 {file:'vendor/venice-nvidia.js',package:'venice-e2ee',entry:'scripts/vendor-entries/venice-nvidia.js'},
]as const;
interface ManifestEntry {output:string;package:string;entry:string;version:string;integrity:string;format:string;minified:boolean;sha256:string}
interface Manifest {schemaVersion:number;runtimes:ManifestEntry[];bundler:{package:string;version:string;integrity:string}}
interface Lock {packages:Record<string,{version:string;integrity:string}>}
export interface BrowserVendorAsset {file:string;url:string;bytes:number;sha256:string}
export async function qualifyBrowserVendorAssets({root,read=(file:string)=>fs.readFile(file,'utf8')}:{root:string;read?:(file:string)=>Promise<string>}) {
 const repository=path.resolve(root),readRelative=(file:string)=>read(path.join(repository,file));
 const [manifestText,lockText]=await Promise.all([readRelative('vendor/browser-vendors.json'),readRelative('package-lock.json')]);
 const manifest=JSON.parse(manifestText)as Manifest,lock=JSON.parse(lockText)as Lock;
 assert.equal(manifest.schemaVersion,2,'Qualified browser vendor manifest schema');
 assert.equal(manifest.bundler.package,'rolldown');assert.equal(manifest.bundler.version,'1.2.5');
 assert.equal(manifest.bundler.version,lock.packages['node_modules/rolldown']?.version);assert.equal(manifest.bundler.integrity,lock.packages['node_modules/rolldown']?.integrity);
 const assets:BrowserVendorAsset[]=[],physical=new Map<string,BrowserVendorAsset>();
 for(const sdk of BROWSER_VENDOR_SDKS){
  const entries=manifest.runtimes.filter(entry=>entry.output===sdk.file);assert.equal(entries.length,1,'Exactly one vendor provenance entry: '+sdk.file);const entry=entries[0]!;
  assert.equal(entry.package,sdk.package);assert.equal(entry.entry,sdk.entry);assert.equal(entry.format,'es');assert.equal(entry.minified,true);
  const locked=lock.packages['node_modules/'+sdk.package];assert(locked?.version&&locked.integrity,'Locked immutable SDK package: '+sdk.package);
  assert.equal(entry.version,locked.version,'Vendor/lock version: '+sdk.file);assert.equal(entry.integrity,locked.integrity,'Vendor/lock package integrity: '+sdk.file);
  const source=await readRelative(sdk.file),digest=createHash('sha256').update(source).digest('hex');assert.equal(digest,entry.sha256,'Exact complete immutable browser SDK: '+sdk.file);
  const graph=parseModuleSpecifiers(source,sdk.file);assert.deepEqual(graph.dependencies,[],'Standalone SDK has no transitive import graph: '+sdk.file);assert.deepEqual(graph.nonLiteralDynamicImports,[],'Standalone SDK has no computed imports: '+sdk.file);
  assert(!/\b(?:Worker|SharedWorker)\b|\bimport\s*\.\s*meta\b/.test(source),'Standalone SDK has no worker or module-relative asset coordinates: '+sdk.file);
  const asset={file:sdk.file,url:'/'+sdk.file,bytes:Buffer.byteLength(source),sha256:digest};
  assets.push(asset);physical.set(path.join(repository,sdk.file),asset);
 }
 return{assets,resolve(source:string,importer?:string):BrowserVendorAsset|null{
  // Queries/fragments and unqualified/package specifiers are deliberately not
  // aliases for these exact physical module identities.
  if(/[?#]/.test(source))return null;
  const origin=importer?.replace(/\?lazy-retry=1$/,'');
  const resolved=path.isAbsolute(source)?path.resolve(source):source.startsWith('.')&&origin&&path.isAbsolute(origin)?path.resolve(path.dirname(origin),source):null;
  return resolved?physical.get(resolved)??null:null;
 },assertShell(source:string){
  const shell=parseAppShellEntries(source);
  for(const asset of assets)assert.equal(shell.filter(url=>url===asset.url).length,1,'Full immutable SDK remains in measured APP_SHELL: '+asset.url);
 },async assertCopiedAssets(directory:string){
  for(const asset of assets){
   const bytes=await fs.readFile(path.join(directory,asset.file));
   assert.equal(bytes.byteLength,asset.bytes,'Complete copied immutable browser SDK size: '+asset.file);
   assert.equal(createHash('sha256').update(bytes).digest('hex'),asset.sha256,'Exact complete copied immutable browser SDK: '+asset.file);
  }
 }};
}
