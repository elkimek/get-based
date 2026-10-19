import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {afterAll, beforeAll, expect, it, vi} from 'vitest';
import {build} from 'rolldown';
import type {OutputChunk} from 'rolldown';
import {buildSvelte, compileAuthoredComponent, HTML_COMPONENTS} from '../scripts/build-svelte.mjs';
import {createSvelteFacadePlugin, compiledSvelteModulePattern} from '../scripts/svelte-facade-plugin.mjs';
import {qualifyArtifactModuleSource} from './pwa/kit-native-receipts.js';

const root=process.cwd();
const names=['DashboardGreeting','HeaderDateSummary','HeaderRangeButtons','SyncIndicatorPresentation'];
let directory:string, chunks:OutputChunk[], originalBytes:number;
let original:Record<string,{renderHTML?:unknown}>, shared:Record<string,{renderHTML?:unknown}>;
function render(module:{renderHTML?:unknown}, props:unknown):string {
  if(typeof module.renderHTML!=='function')throw new Error('Missing actual renderHTML export');
  const html:unknown=module.renderHTML(props);
  if(typeof html!=='string')throw new Error('Invalid actual HTML output');
  return html;
}
async function sharedBuild(repository:string, entries:readonly string[], output:string) {
  const entry='getbased:facade-test';
  return build({input:entry,platform:'browser',plugins:[{
    name:'controlled-facade-test-entry',resolveId:id=>id===entry?id:null,
    load:id=>id===entry?entries.map((name,i)=>`export {renderHTML as render${i}} from ${JSON.stringify(path.join(repository,'js/components',name+'.svelte.html.js'))};`).join('\n'):null,
  },createSvelteFacadePlugin({root:repository,client:'compile'})],
  output:{dir:output,entryFileNames:'facades.mjs',format:'es',minify:true,sourcemap:true}});
}
beforeAll(async()=>{
  directory=await fs.mkdtemp(path.join(os.tmpdir(),'getbased-shared-svelte-'));
  original={};originalBytes=0;
  for(const name of names){
    await buildSvelte({component:path.join(root,'js/components',name+'.svelte'),output:'html',outputDirectory:path.join(directory,'original')});
    const file=path.join(directory,'original',name+'.svelte.html.js');
    originalBytes+=(await fs.readFile(file)).length;
    original[name]=await import(pathToFileURL(file).href);
  }
  const result=await sharedBuild(root,names,path.join(directory,'shared'));
  chunks=result.output.filter((item):item is OutputChunk=>item.type==='chunk');
  const module=await import(pathToFileURL(path.join(directory,'shared/facades.mjs')).href);
  shared=Object.fromEntries(names.map((name,i)=>[name,{renderHTML:module['render'+i]}]));
},30_000);
afterAll(async()=>{if(directory)await fs.rm(directory,{recursive:true,force:true});});

it('retains actual SSR HTML, getter chronology and throws across concrete native presentation branches',()=>{
  const cases:Array<{name:string;props:()=>unknown}>=[
    ...['Dates: none','<Alice> & "Bob"','getbased sentinel <!--[0-->'].map(text=>({name:'HeaderDateSummary',props:()=>({view:{text}})})),
    ...[[],['all'],['all','latest']].map(modes=>({name:'HeaderRangeButtons',props:()=>({view:{buttons:modes.map((mode,i)=>({mode,active:i===0,pressed:i===1,label:mode+'<&"'}))}})})),
    {name:'DashboardGreeting',props:()=>({view:{title:'Today',name:'<Synthetic & Profile>',subtitle:'first\nsecond'}})},
    ...['disabled','synced','syncing','offline','error','stuck','debug','quota'].map(state=>({name:'SyncIndicatorPresentation',props:()=>({view:{state,title:'Status <'+state+'> & "detail"'}})})),
    {name:'HeaderDateSummary',props:()=>({view:{text:Symbol('owned-throw')}})},
  ];
  for(const c of cases){
    const invoke=(module:{renderHTML?:unknown})=>{try{return {html:render(module,c.props())};}catch(error){return {error:error instanceof Error?[error.name,error.message]:error};}};
    expect(invoke(shared[c.name]!)).toEqual(invoke(original[c.name]!));
  }
  for(const throws of [false,true]){
    const invoke=(module:{renderHTML?:unknown})=>{
      const reads:string[]=[], view={get title(){reads.push('title');return 'Title';},get name(){reads.push('name');if(throws)throw new Error('name read failed');return 'Name';},get subtitle(){reads.push('subtitle');return 'Sub';}};
      try{return {html:render(module,{view}),reads};}catch(error){return {error:error instanceof Error?[error.name,error.message]:error,reads};}
    };
    expect(invoke(shared.DashboardGreeting!)).toEqual(invoke(original.DashboardGreeting!));
  }
});

it('shares the actual installed renderer graph instead of embedding one prebundle per facade',()=>{
  const renderer=chunks.flatMap(chunk=>Object.keys(chunk.modules)).filter(id=>id.replaceAll('\\','/').endsWith('/svelte/src/internal/server/renderer.js'));
  expect(renderer).toHaveLength(1);
  expect(chunks.reduce((bytes,chunk)=>bytes+Buffer.byteLength(chunk.code),0)).toBeLessThan(originalBytes);
  for(const chunk of chunks){expect(chunk.imports.filter(id=>id.startsWith('node:'))).toEqual([]);expect(chunk.dynamicImports.filter(id=>id.startsWith('node:')&&id!=='node:async_hooks')).toEqual([]);}
});

it('maps each substituted HTML owner to its exact authored component source',async()=>{
  for(const name of names){
    const filename=path.join(root,'js/components',name+'.svelte'), expected=await fs.readFile(filename,'utf8');
    const matches:string[]=[];
    for(const chunk of chunks){
      if(!chunk.map)throw new Error('Missing actual compiled source map');
      const map:{sources:string[];sourcesContent:Array<string|null>}=JSON.parse(chunk.map.toString());
      for(let i=0;i<map.sources.length;i++)if(map.sources[i]!.replaceAll('\\','/').endsWith('/'+name+'.svelte'))matches.push(map.sourcesContent[i] ?? '');
    }
    expect(matches).toEqual([expected]);
  }
});

it('compiles every registered real HTML owner under the unchanged warning/CSS/compiler contract',async()=>{
  for(const name of HTML_COMPONENTS){const filename=path.join(root,'js/components',name+'.svelte');const source=await fs.readFile(filename,'utf8');expect(compileAuthoredComponent(source,filename,'html').code).not.toBe('');}
},30_000);

it('preserves neutral SSR lifecycle semantics and server compilation of nested components in a browser-target build',async()=>{
  // Controlled authored fixture, not an application service or DOM replacement.
  const fixture=path.join(directory,'lifecycle');await fs.mkdir(path.join(fixture,'js/components'),{recursive:true});
  await fs.writeFile(path.join(fixture,'package.json'),' {"type":"module"}');
  await fs.symlink(path.join(root,'node_modules'),path.join(fixture,'node_modules'),'junction');
  await fs.writeFile(path.join(fixture,'js/components/Child.svelte'),'<script>import {onMount} from "svelte";onMount(()=>{throw new Error("client lifecycle executed in SSR");});</script><strong>Child</strong>');
  const filename=path.join(fixture,'js/components/HeaderDateSummary.svelte');
  await fs.writeFile(filename,'<script>import Child from "./Child.svelte";import {onMount,onDestroy} from "svelte";let {view}=$props();onMount(()=>view.mounted());onDestroy(()=>view.destroyed());</script><span>{view.text}</span><Child/>');
  await buildSvelte({component:filename,output:'html',outputDirectory:path.dirname(filename)});
  const previous=await import(pathToFileURL(filename+'.html.js').href);
  await sharedBuild(fixture,['HeaderDateSummary'],path.join(fixture,'shared'));
  const current=await import(pathToFileURL(path.join(fixture,'shared/facades.mjs')).href);
  const invoke=(module:{renderHTML?:unknown})=>{const calls:string[]=[];const html=render(module,{view:{text:'Owned',mounted:()=>calls.push('mount'),destroyed:()=>calls.push('destroy')}});return {html,calls};};
  const baseline=invoke(previous);expect(baseline.calls).toEqual(['destroy']);expect(invoke({renderHTML:current.render0})).toEqual(baseline);
});

it('rejects unregistered HTML facades instead of silently rebundling opaque or invented output',async()=>{
  const fixture=path.join(directory,'unknown');await fs.mkdir(path.join(fixture,'js/components'),{recursive:true});
  await fs.writeFile(path.join(fixture,'package.json'),'{"type":"module"}');
  await fs.symlink(path.join(root,'node_modules'),path.join(fixture,'node_modules'),'junction');
  await fs.writeFile(path.join(fixture,'js/components/Unregistered.svelte'),'<p>Unknown</p>');
  await fs.writeFile(path.join(fixture,'js/components/Unregistered.svelte.html.js'),'export const renderHTML=()=>"wrong";');
  await expect(sharedBuild(fixture,['Unregistered'],path.join(fixture,'shared'))).rejects.toThrow('Unregistered HTML facade');
});


it('excludes only owned compiled private modules from Kit rune compilation, retaining authored module coverage',()=>{
  const pattern=compiledSvelteModulePattern(root);
  for(const mode of ['html','client'])for(const name of ['HeaderDateSummary','nested/Child']){
    expect(pattern.test('getbased:svelte:'+mode+':'+path.join(root,'js/components',name+'.svelte')+'.compiled.js')).toBe(true);
  }
  for(const id of [
    path.join(root,'js/components/HeaderDateSummary.svelte'),
    path.join(root,'js/state.svelte.js'),
    path.join(root,'js/components/HeaderDateSummary.svelte.html.js'),
    'getbased:svelte:unknown:'+path.join(root,'js/components/HeaderDateSummary.svelte')+'.compiled.js',
    'getbased:svelte:html:'+path.join(root,'foreign/HeaderDateSummary.svelte')+'.compiled.js',
    'getbased:svelte:html:'+path.join(root,'js/components/HeaderDateSummary.svelte')+'.js',
    'getbased:svelte:html:'+path.join(root+'-foreign','js/components/HeaderDateSummary.svelte')+'.compiled.js',
  ])expect(pattern.test(id)).toBe(false);
});

// Source-map receipts qualify each optimized loader wrapper and its complete owner.
const receiptHtml = 'js/components/ChartLayersDropdown.svelte.html.js';
const receiptAuthored = 'js/components/ChartLayersDropdown.svelte';
async function receiptSnapshot(module = receiptHtml) {
  const owner = module.replace(/\.(?:native|html)\.js$/, '');
  const wrapper = await createSvelteFacadePlugin({root, client: 'kit'}).load(path.resolve(module));
  if (typeof wrapper !== 'string') throw new Error('Expected actual canonical loader wrapper');
  const source = await fs.readFile(owner, 'utf8');
  return {wrapper, maps: [{sources: ['../../' + owner], sourcesContent: [source]}]};
}
it('source receipts retain exact ordinary emitted-source equality', async () => {
  const module = 'js/state.js', source = await fs.readFile(module, 'utf8');
  await expect(qualifyArtifactModuleSource(module, source, [])).resolves.toBeUndefined();
  await expect(qualifyArtifactModuleSource(module, source + ' ', [])).rejects.toThrow(/Fresh canonical emitted/);
  await expect(qualifyArtifactModuleSource(module, null, [])).rejects.toThrow(/Fresh canonical emitted/);
});
it('source receipts qualify actual optimized HTML wrapper and complete authored owner', async () => {
  const {wrapper, maps} = await receiptSnapshot();
  await expect(qualifyArtifactModuleSource(receiptHtml, wrapper, maps)).resolves.toBeUndefined();
});
it('source receipts reject altered wrapper content or foreign rendering exports', async () => {
  const {wrapper, maps} = await receiptSnapshot();
  for (const value of [wrapper + ' ', wrapper.replace('renderHTML', 'foreign'), null])
    await expect(qualifyArtifactModuleSource(receiptHtml, value, maps)).rejects.toThrow(/optimized Svelte facade wrapper/);
});
it('source receipts reject standalone bundle at an optimized wrapper coordinate', async () => {
  const {maps} = await receiptSnapshot();
  await expect(qualifyArtifactModuleSource(receiptHtml, await fs.readFile(receiptHtml, 'utf8'), maps)).rejects.toThrow(/optimized Svelte facade wrapper/);
});
it('source receipts reject absent, foreign, changed and missing complete authored source', async () => {
  const {wrapper, maps} = await receiptSnapshot();
  await expect(qualifyArtifactModuleSource(receiptHtml, wrapper, [])).rejects.toThrow(/omits authored Svelte owner/);
  await expect(qualifyArtifactModuleSource(receiptHtml, wrapper, [{sources: ['../../foreign.svelte'], sourcesContent: maps[0]!.sourcesContent}])).rejects.toThrow(/omits authored Svelte owner/);
  for (const value of [maps[0]!.sourcesContent[0] + ' ', null])
    await expect(qualifyArtifactModuleSource(receiptHtml, wrapper, [{sources: ['../../' + receiptAuthored], sourcesContent: [value]}])).rejects.toThrow(/complete authored Svelte owner/);
});
it('source receipts check every matching owner including later corrupted occurrence', async () => {
  const {wrapper, maps} = await receiptSnapshot();
  await expect(qualifyArtifactModuleSource(receiptHtml, wrapper, [...maps, ...maps])).resolves.toBeUndefined();
  await expect(qualifyArtifactModuleSource(receiptHtml, wrapper, [...maps, {sources: ['../../' + receiptAuthored], sourcesContent: ['foreign']}])).rejects.toThrow(/complete authored Svelte owner/);
});
it('source receipts reject unregistered HTML facade with invented wrapper text', async () => {
  await expect(qualifyArtifactModuleSource('js/components/Foreign.svelte.html.js', 'foreign', [])).rejects.toThrow(/Unregistered HTML facade/);
});
it('source receipts qualify native Kit alias with complete authored-owner check', async () => {
  const module = 'js/components/DisplaySettings.svelte.native.js';
  const {wrapper, maps} = await receiptSnapshot(module);
  await expect(qualifyArtifactModuleSource(module, wrapper, maps)).resolves.toBeUndefined();
  await expect(qualifyArtifactModuleSource(module, wrapper, [])).rejects.toThrow(/omits authored Svelte owner/);
});


it('reconstructs exact registered wrappers for an attested producer root without reading that filesystem', async () => {
  const producerRoot = '/synthetic-linux-producer/checkout';
  const producer = createSvelteFacadePlugin({root, client: 'kit', facadeRoot: producerRoot});
  vi.stubEnv('GETBASED_KIT_PRODUCER_ROOT', producerRoot);
  try {
    for (const module of [receiptHtml, 'js/components/DisplaySettings.svelte.native.js']) {
      const {maps} = await receiptSnapshot(module), wrapper = await producer.load(path.resolve(module));
      expect(typeof wrapper).toBe('string');
      await expect(qualifyArtifactModuleSource(module, wrapper as string, maps)).resolves.toBeUndefined();
    }
  } finally {vi.unstubAllEnvs();}
});
it('rejects a different producer root, component, mode, suffix or wrapper byte under the attested namespace', async () => {
  const producerRoot = '/synthetic-linux-producer/checkout';
  const wrapper = await createSvelteFacadePlugin({root, client: 'kit', facadeRoot: producerRoot}).load(path.resolve(receiptHtml));
  if (typeof wrapper !== 'string') throw new Error('Expected registered producer wrapper');
  const {maps} = await receiptSnapshot();
  vi.stubEnv('GETBASED_KIT_PRODUCER_ROOT', producerRoot);
  try {
    for (const corrupt of [wrapper.replace(producerRoot, '/foreign-producer/checkout'), wrapper.replace('ChartLayersDropdown.svelte', 'HeaderDateSummary.svelte'), wrapper.replace(':html:', ':client:'), wrapper.replace('.compiled.js', '.foreign.js'), wrapper + ' '])
      await expect(qualifyArtifactModuleSource(receiptHtml, corrupt, maps)).rejects.toThrow(/optimized Svelte facade wrapper/);
    await expect(qualifyArtifactModuleSource(receiptHtml, wrapper, [])).rejects.toThrow(/omits authored Svelte owner/);
    await expect(qualifyArtifactModuleSource(receiptHtml, wrapper, [{sources: ['../../' + receiptAuthored], sourcesContent: ['foreign']}])).rejects.toThrow(/complete authored Svelte owner/);
  } finally {vi.unstubAllEnvs();}
});
it('requires the verified producer namespace for GitHub transport consumers', async () => {
  const {wrapper, maps} = await receiptSnapshot();
  vi.stubEnv('GITHUB_ACTIONS', 'true'); vi.stubEnv('GETBASED_EXPECTED_KIT_BUILD_ID', 'a'.repeat(64)); vi.stubEnv('GETBASED_KIT_PRODUCER_ROOT', undefined);
  try {await expect(qualifyArtifactModuleSource(receiptHtml, wrapper, maps)).rejects.toThrow('Verified CI transport requires its producer root');}
  finally {vi.unstubAllEnvs();}
});
