import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {expect,it} from 'vitest';
const read=(file:string)=>readFileSync(file,'utf8');
const originalLoader=read('tests/fixtures/cycle-import-loader-core-original.ts.txt');
const originalRendering=read('tests/fixtures/cycle-import-rendering-core-original.ts.txt');
function part(source:string,start:string,end:string):string{expect(source.split(start)).toHaveLength(2);const at=source.indexOf(start),stop=source.indexOf(end,at);expect(stop).toBeGreaterThan(at);return source.slice(at,stop).trimEnd()+'\n';}
const picker=part(originalLoader,'export function renderCycleImportPickerControls()', '\nexport function renderCycleImportSummarySection(');
const summary=part(originalLoader,'export function renderCycleImportSummarySection(', '\nexport function getCycleImportSummarySectionView(');
const renderPicker=part(originalRendering,'export function renderCycleImportPicker()', '\n// The cold loader captures each label once;');
const renderSummary=originalRendering.slice(originalRendering.indexOf('export function renderCycleImportSummary('));
function expectedRuntime(){
 let source=originalLoader;
 const changes=[
  [originalLoader.split('\n')[0]!,"import {cycleImportSourceLabel, getCycleImportSummaryView} from './cycle-import-summary.js';"],
  ['// cycle-import-loader.js - cold-safe Cycle import runtime facade','// cycle-import-runtime.js - shared cold-safe Cycle import state and delegates'],
  [picker+'\n',''],[summary+'\n',''],
 ] as const;
 for(const [before,after]of changes){expect(source.split(before)).toHaveLength(2);source=source.replace(before,after);}return source;
}
function expectedSummary(){
 let source=originalRendering;
 const changes=[
  ["import {renderHTML as renderCyclePicker} from './components/CycleImportPicker.svelte.html.js';\n",''],
  ["import {renderHTML as renderCycleCoverage} from './components/CycleImportCoverage.svelte.html.js';\n",''],
  [renderPicker+'\n',''],[renderSummary,''],
 ] as const;
 for(const [before,after]of changes){expect(source.split(before)).toHaveLength(2);source=source.replace(before,after);}return source.trimEnd()+'\n';
}
function expectedLoader(){return `// Synchronous HTML compatibility facade over one shared cold runtime.
import {cycleImportSourceLabel, renderCycleImportPicker, renderCycleImportSummary} from './cycle-import-rendering.js';
export {getCycleImportSummarySectionView, isCycleImportModuleLoaded, loadCycleImportModule, parseAppleHealthCycleBlob, showCycleImportPreview, clearCycleProfileData, installCycleImportLoaderDelegates} from './cycle-import-runtime.js';

`+picker+'\n'+summary;}
function expectedRendering(){return `import {renderHTML as renderCyclePicker} from './components/CycleImportPicker.svelte.html.js';
import {renderHTML as renderCycleCoverage} from './components/CycleImportCoverage.svelte.html.js';
import {getCycleImportSummaryView} from './cycle-import-summary.js';
export {CYCLE_IMPORT_ACTION, cycleImportActionAttrs, cycleImportSourceLabel, getCycleImportSummaryView} from './cycle-import-summary.js';

`+renderPicker+'\n'+renderSummary;}
const qualify=(runtime:string,projection:string,loader:string,rendering:string)=>{expect(runtime).toBe(expectedRuntime());expect(projection).toBe(expectedSummary());expect(loader).toBe(expectedLoader());expect(rendering).toBe(expectedRendering());};
it('extracts only exact original controller/projection bodies and retains the original synchronous wrappers',()=>{
 expect(createHash('sha256').update(originalLoader).digest('hex')).toBe('4d89aa570eb2a20e4803eb6c5e5d96a73914ef4ee8a4bd5581c56510d225238f');
 expect(createHash('sha256').update(originalRendering).digest('hex')).toBe('8821036eb243f78ece0b07b6358c0c3ed6dad768f83437e17a3132836a652b8a');
 qualify(read('js/cycle-import-runtime.ts'),read('js/cycle-import-summary.ts'),read('js/cycle-import-loader.ts'),read('js/cycle-import-rendering.ts'));
 for(const file of ['cycle-import-runtime','cycle-import-summary'])expect(read('js/'+file+'.ts')).not.toMatch(/svelte|renderCycleImport|cycle-import-rendering/);
});
it('routes actual production core-only imports through the one shared runtime',()=>{
 for(const file of ['app-shell-hooks','cycle','wearables-apple-health-runtime']){const source=read('js/'+file+'.ts');expect(source).toContain("'./cycle-import-runtime.js'");expect(source).not.toContain("'./cycle-import-loader.js'");}
});
it('keeps original public Svelte owners and SDK branch coordinates byte exact',()=>{
 const pins={"CycleImportPicker": "e22f2141e3404ec4e0c5bb01160ec34ab588e616447f404df94b2aad9c3d92bb", "CycleImportCoverage": "6241d8d9e995e5c3966573aaf2c1d12f769842a00030c4bf5c2c6ccd34a20f66", "CycleImportSourceRow": "dd7200bc1ac3f0847fd7dd0d12c6c666e952cfd7980b8d5a76f47679b4b9d07d"};
 for(const [name,sha]of Object.entries(pins))expect(createHash('sha256').update(read('js/components/'+name+'.svelte')).digest('hex'),name).toBe(sha);
});
it.each([
 ['eager renderer',(source:string)=>"import './cycle-import-rendering.js';\n"+source],
 ['different retry URL',(source:string)=>source.replace('?lazy-retry=1','?lazy-retry=2')],
 ['lost immediate delegate',(source:string)=>source.replace(/\ninstallCycleImportLoaderDelegates\(\);\n$/,'\n')],
 ['different cold-label capture',(source:string)=>source.replace('return () => label;','return () => cycleImportSourceLabel(source);')],
] as const)('rejects controller corruption: %s',(_name,mutate)=>{
 const source=read('js/cycle-import-runtime.ts'),changed=mutate(source);expect(changed).not.toBe(source);expect(()=>qualify(changed,read('js/cycle-import-summary.ts'),read('js/cycle-import-loader.ts'),read('js/cycle-import-rendering.ts'))).toThrow();
});
it('rejects a projection read-count change and removed source-row ordering',()=>{
 const source=read('js/cycle-import-summary.ts');
 for(const changed of [source.replace('const label = readSourceLabel();','const label = readSourceLabel() + readSourceLabel();'),source.replace('Object.entries(coverage.sources || {})','Object.entries(coverage.sources || {}).reverse()')]){expect(changed).not.toBe(source);expect(()=>qualify(read('js/cycle-import-runtime.ts'),changed,read('js/cycle-import-loader.ts'),read('js/cycle-import-rendering.ts'))).toThrow();}
});
