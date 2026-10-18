import {expect,it,afterEach} from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {wearableChartExpectedQualifier,type NativeArtifact} from './helpers/wearable-pwa-chart-functions.js';
const roots:string[]=[];afterEach(async()=>{for(const root of roots.splice(0))await fs.rm(root,{recursive:true,force:true});});
const entry='import{f as a}from"./format.js";function renderWearableChart(){return{title:e=>a(e)}}';
const format='function a(e){return String(e)}function c(e){return Number(e)}export{a as f,c as h};';
const currentEntry=entry.replace('f as a','f as b').replace('title:e=>a(e)','title:e=>b(e)');
const currentFormat=format.replace('function a(','function b(').replace('a as f','b as f');
const original={functionName:'title',functionLength:1,runtimeSource:'e=>a(e)'};
const sha=(value:string)=>createHash('sha256').update(value).digest('hex');
// Identity mappings for each literal character keep these small source-owned
// module fixtures readable; a/b are the only generated-name changes.
function map(module:string,source:string){return JSON.stringify({version:3,sources:['../../../../'+module],sourcesContent:[source],names:[],mappings:'AAAA'+',CAAC'.repeat(source.length-1)});}
async function fixture(){const root=await fs.mkdtemp(path.join(os.tmpdir(),'wearable-chart-bindings-'));roots.push(root);const native=path.join(root,'native'),old=path.join(native,'clone/.local-notes/original-kit-artifact'),current=path.join(root,'dist'),source=path.join(root,'source');const artifact:NativeArtifact={files:[],mappings:[]};const files:Array<{path:string;sha256:string}>=[];
 for(const [relative,before,after]of [['entry.js',entry,currentEntry],['format.js',format,currentFormat]] as const){
  const module=relative==='entry.js'?'js/wearables-detail-modal.js':'js/wearables-formatters.js',name='_app/immutable/chunks/'+relative;
  for(const [directory,code]of [[old,before!],[current,after!]] as const){await fs.mkdir(path.join(directory,path.dirname(name)),{recursive:true});await fs.writeFile(path.join(directory,name),code!);await fs.writeFile(path.join(directory,name+'.map'),map(module,before!));}
  files.push({path:'/'+name,sha256:sha(before!)},{path:'/'+name+'.map',sha256:sha(map(module,before!))});await fs.mkdir(path.join(source,'js'),{recursive:true});await fs.writeFile(path.join(source,module),before!);
 }
 for(const name of ['vendor/chart.min.js','vendor/chartjs-adapter-native.js']){for(const directory of [old,current]){await fs.mkdir(path.join(directory,'vendor'),{recursive:true});await fs.writeFile(path.join(directory,name),'// unchanged native vendor');}files.push({path:'/'+name,sha256:sha('// unchanged native vendor')});}
 return {native,current,source,artifact:{...artifact,files},qualify:(overrides?:ReadonlyMap<string,string>,metadata:unknown=original)=>wearableChartExpectedQualifier(native,current,source,{...artifact,files},[metadata],overrides)};
}
it('qualifies only the finite original callback using its exact authored body and actual imported export definition',async()=>{const setup=await fixture(),qualified=await setup.qualify();expect(qualified.qualify({callback:original,keep:{canvas:'exact',value:23}})).toEqual({callback:{...original,runtimeSource:'e=>b(e)'},keep:{canvas:'exact',value:23}});expect(qualified.proofs).toHaveLength(1);expect(qualified.proofs[0]!.replacements.map(row=>[row.old,row.current])).toEqual([['a','b']]);});
it.each([
 ['changed logic',currentEntry.replace('b(e)','b(0)')],
 ['wrong imported binding',currentEntry.replace('f as b','h as b')],
 ['extra unmapped rename',currentEntry.replace('b(e)','z(e)')],
] as const)('rejects %s in the actual generated chunk without changing its source-map claim',async(_name,changed)=>{const setup=await fixture();await expect(setup.qualify(new Map([['_app/immutable/chunks/entry.js',changed]]))).rejects.toThrow();});
it.each(['source','name','arity'] as const)('rejects corrupted original callback %s metadata',async kind=>{const setup=await fixture();const changed={...original,...(kind==='source'?{runtimeSource:'e=>a(0)'}:kind==='name'?{functionName:'wrong'}:{functionLength:2})};await expect(setup.qualify(undefined,changed)).rejects.toThrow();});
it('rejects an unknown callback after qualification instead of silently accepting a new function lane',async()=>{const setup=await fixture(),qualified=await setup.qualify();expect(()=>qualified.qualify({...original,runtimeSource:original.runtimeSource+'/*extra*/'})).toThrow();});
