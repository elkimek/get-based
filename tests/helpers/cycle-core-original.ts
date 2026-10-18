/** Pinned pre-extraction projection and controller, with genuine child renderers. */
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {upgradeMenstrualCycleProfile} from '../../js/cycle-summary.js';
import {escapeAttr} from '../../js/utils.js';
import {projectCycleImportCoverage} from '../../js/cycle-import-presentation.js';
import {renderHTML as renderCyclePicker} from '../../js/components/CycleImportPicker.svelte.html.js';
import {renderHTML as renderCycleCoverage} from '../../js/components/CycleImportCoverage.svelte.html.js';
import {createRetryingModuleLoader,invokeCachedModule} from '../../js/retrying-module-loader.js';
import type * as Rendering from '../../js/cycle-import-rendering.js';
import type * as Loader from '../../js/cycle-import-loader.js';
import type * as Runtime from '../../js/cycle-import-runtime.js';
const read=(file:string)=>readFileSync(file,'utf8');
function pinned(file:string,sha:string){const source=read('tests/fixtures/'+file);assert.equal(createHash('sha256').update(source).digest('hex'),sha);return source;}
const moduleBody=(source:string)=>source.replace(/^import[\s\S]*?;\n/gm,'').replace(/\bexport /g,'');
export const renderingNames=['CYCLE_IMPORT_ACTION','cycleImportActionAttrs','cycleImportSourceLabel','renderCycleImportPicker','getCycleImportSummaryView','renderCycleImportSummary'] as const;
export const runtimeNames=['getCycleImportSummarySectionView','isCycleImportModuleLoaded','loadCycleImportModule','parseAppleHealthCycleBlob','showCycleImportPreview','clearCycleProfileData','installCycleImportLoaderDelegates'] as const;
export const loaderNames=[...runtimeNames,'renderCycleImportPickerControls','renderCycleImportSummarySection'] as const;
export function originalCycleRendering():typeof Rendering{
 const source=pinned('cycle-import-rendering-core-original.js.txt','67914e7f40c61325551a5f2b0c621bfc4dfeca486821cbe9bbd7cafb6dc51d70');
 return vm.runInNewContext(moduleBody(source)+'\n;({'+renderingNames.join(',')+'});',{upgradeMenstrualCycleProfile,escapeAttr,projectCycleImportCoverage,renderCyclePicker,renderCycleCoverage}) as typeof Rendering;
}
export function cycleRuntimeHarness(original:boolean,request:(retry:boolean)=>Promise<unknown>){
 const rendering=originalCycleRendering(),root=document.createElement('div'),notifications:unknown[][]=[],errors:unknown[][]=[],listeners:string[]=[];
 const source=original?pinned('cycle-import-loader-core-original.js.txt','02dc494f27c9c94edafb9c78828a59c4ce45a05c0fb95ddaee0f393d50608e42'):read('js/cycle-import-runtime.js');
 const body=moduleBody(source).replaceAll("import('./cycle-import.js?lazy-retry=1')",'request(true)').replaceAll("import('./cycle-import.js')",'request(false)');
 const api=vm.runInNewContext(body+'\n;({'+(original?loaderNames:runtimeNames).join(',')+'});',{
  ...rendering,createRetryingModuleLoader,invokeCachedModule,request,Element,HTMLElement,
  document:{addEventListener(type:string,listener:EventListener){listeners.push(type);root.addEventListener(type,listener);}},
  showNotification:(...args:unknown[])=>notifications.push(args),console:{error:(...args:unknown[])=>errors.push(args)},
 }) as typeof Runtime & Partial<Pick<typeof Loader,'renderCycleImportPickerControls'|'renderCycleImportSummarySection'>>;
 return {api,root,notifications,errors,listeners};
}
