// @vitest-environment jsdom
import {readFileSync} from 'node:fs';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import * as rendering from '../js/cycle-import-rendering.js';
import * as summary from '../js/cycle-import-summary.js';
import * as loader from '../js/cycle-import-loader.js';
import * as runtime from '../js/cycle-import-runtime.js';
import {cycleRuntimeHarness,loaderNames,originalCycleRendering,renderingNames,runtimeNames} from './helpers/cycle-core-original.js';
const frozen=JSON.parse(readFileSync('tests/fixtures/cycle-import-original.json','utf8')) as {fixedNow:string;samples:{kind:string;name:string;input:{mc?:unknown}}[]};
beforeEach(()=>{vi.useFakeTimers();vi.setSystemTime(frozen.fixedNow);});afterEach(()=>vi.useRealTimers());
it('retains the exact public APIs and forwards pure functions and runtime state by identity',()=>{
 expect(Object.keys(rendering).sort()).toEqual([...renderingNames].sort());expect(Object.keys(loader).sort()).toEqual([...loaderNames].sort());
 for(const name of ['CYCLE_IMPORT_ACTION','cycleImportActionAttrs','cycleImportSourceLabel','getCycleImportSummaryView'] as const)expect(rendering[name]).toBe(summary[name]);
 for(const name of runtimeNames)expect(loader[name]).toBe(runtime[name]);
 expect(loader.isCycleImportModuleLoaded()).toBe(false);expect(loader.renderCycleImportPickerControls()).toBe(originalCycleRendering().renderCycleImportPicker());
});
function summaryReceipt(api:typeof rendering,input:unknown,fault=0){
 const events:string[]=[];let at=0;const observe=(value:string)=>{events.push(value);if(++at===fault)throw Error('fault:'+value);};
 // Exact enumerable getters make normalization/read/coercion chronology visible.
 const mc=input&&typeof input==='object'?Object.defineProperties({},Object.fromEntries(Object.entries(input).map(([key,value])=>[key,{enumerable:true,get(){observe('input:'+key);return value;}}]))):input;
 let html:string|undefined,view:unknown,error:string|undefined;
 const factory=(source:string)=>{observe('factory:'+source);let reads=0;return()=>{observe('label:'+source+':'+ ++reads);return source+' read '+reads+' <literal> & "quoted"';};};
 try{html=api.renderCycleImportSummary(mc,factory);view=api.getCycleImportSummaryView(mc,factory);}catch(value){error=(value as Error).message;}
 return {events,html,view,error};
}
it.each(frozen.samples.filter(row=>row.kind==='summary'))('preserves exact original summary/SDK, row order, stateful label reads and every getter fault for $name',sample=>{
 const original=originalCycleRendering(),expected=summaryReceipt(original,sample.input.mc);expect(expected.error).toBeUndefined();expect(summaryReceipt(rendering,sample.input.mc)).toEqual(expected);
 for(let fault=1;fault<=expected.events.length;fault++)expect(summaryReceipt(rendering,sample.input.mc,fault)).toEqual(summaryReceipt(original,sample.input.mc,fault));
 const before=JSON.stringify(sample.input),cold=originalCycleRendering().renderCycleImportSummary(sample.input.mc,source=>{const label=original.cycleImportSourceLabel(source);return()=>label;});
 expect(loader.renderCycleImportSummarySection(sample.input.mc)).toBe(cold);expect(runtime.getCycleImportSummarySectionView(sample.input.mc)).toEqual(original.getCycleImportSummaryView(sample.input.mc,source=>{const label=original.cycleImportSourceLabel(source);return()=>label;}));expect(JSON.stringify(sample.input)).toBe(before);
});
it('preserves action attribute escaping, omission, coercion and getter fault order',()=>{
 const receipt=(api:typeof rendering,fault=0)=>{const events:string[]=[];let at=0;const data=Object.defineProperties({},{sourceKey:{enumerable:true,get(){events.push('source');if(++at===fault)throw Error('source');return '<&"';}},importId:{enumerable:true,get(){events.push('id');if(++at===fault)throw Error('id');return {toString(){events.push('coerce');if(++at===fault)throw Error('coerce');return 'batch<&"';}};}},empty:{enumerable:true,value:''},missing:{enumerable:true,value:null},zero:{enumerable:true,value:0}});let value:string|undefined,error:string|undefined;try{value=api.cycleImportActionAttrs('remove<&"',data);}catch(e){error=(e as Error).message;}return{events,value,error};};
 const original=originalCycleRendering();expect(receipt(rendering)).toEqual(receipt(original));for(let fault=1;fault<=3;fault++)expect(receipt(rendering,fault)).toEqual(receipt(original,fault));expect(rendering.cycleImportSourceLabel('unlisted')).toBe('unlisted');
});
async function lifecycle(original:boolean){
 const flags:boolean[]=[],calls:unknown[][]=[];let resolve!:(value:unknown)=>void,reject!:(error:unknown)=>void;
 const request=(retry:boolean)=>{flags.push(retry);return new Promise<unknown>((yes,no)=>{resolve=yes;reject=no;});};
 const harness=cycleRuntimeHarness(original,request),api=harness.api;
 const cold=!api.isCycleImportModuleLoaded(),first=api.loadCycleImportModule(),shared=first===api.loadCycleImportModule();reject(Error('offline'));let failed=false;try{await first;}catch{failed=true;}
 const afterFailure=api.isCycleImportModuleLoaded();harness.root.innerHTML='<button data-cycle-import-action="pick-file"></button><input data-cycle-import-action="select-file">';
 const button=harness.root.querySelector('button')!,input=harness.root.querySelector('input')!;
 const click=new MouseEvent('click',{bubbles:true,cancelable:true}),change=new Event('change',{bubbles:true,cancelable:true});button.dispatchEvent(click);input.dispatchEvent(change);
 const retryPromise=api.loadCycleImportModule();const module={parseAppleHealthCycleBlob(...args:unknown[]){calls.push(['parse',...args]);return 'parsed';},showCycleImportPreview(...args:unknown[]){calls.push(['preview',...args]);return 'previewed';},clearCycleProfileData(){calls.push(['clear',this===module]);return false;},async handleCycleImportAction(event:Event){calls.push(['event',event.type,(event.target as HTMLElement).tagName]);}};
 resolve(module);await retryPromise;await Promise.resolve();await Promise.resolve();api.installCycleImportLoaderDelegates();
 const resident=api.clearCycleProfileData(),parse=api.parseAppleHealthCycleBlob(new Blob(['synthetic']),'cycle.xml');
 const after=new MouseEvent('click',{bubbles:true,cancelable:true});button.dispatchEvent(after);await Promise.resolve();
 return {cold,shared,failed,afterFailure,flags,coldPrevented:[click.defaultPrevented,change.defaultPrevented],residentPrevented:after.defaultPrevented,resident,parse,loaded:api.isCycleImportModuleLoaded(),listeners:harness.listeners,calls,notifications:harness.notifications,errors:harness.errors.length};
}
it('preserves one retry cache, immediate delegated click/change replay, resident synchronous returns and implementation this binding',async()=>{
 const before=await lifecycle(true),current=await lifecycle(false);expect(current).toEqual(before);expect(current).toMatchObject({cold:true,shared:true,failed:true,afterFailure:false,flags:[false,true],coldPrevented:[true,true],residentPrevented:false,resident:false,parse:'parsed',loaded:true,listeners:['click','change'],notifications:[],errors:0});expect(current.calls.map(row=>row[0])).toEqual(['event','event','clear','parse','event']);
});
