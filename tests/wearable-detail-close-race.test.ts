// @vitest-environment jsdom
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {state} from '../js/state.js';
import {createDefaultProfileData,migrateProfileData} from '../js/profile.js';
import type {StoredWearableRow} from '../js/wearable-storage-types.js';
import {configureWearablesModuleBridge} from '../js/wearables-runtime.js';
import {configureWearableDetailRuntimeDeps} from '../js/wearables-detail-runtime.js';
import {closeModal,rememberModalTrigger} from '../js/marker-detail-modal.js';
import {configureMarkerDetailRuntime} from '../js/marker-detail-runtime.js';
const runtime=vi.hoisted(()=>({read:async(_profile:string,_source:string,_start:string,_end:string):Promise<StoredWearableRow[]>=>[]}));
vi.mock('../js/wearables-store.js',async importOriginal=>{const original=await importOriginal<typeof import('../js/wearables-store.js')>();return {...original,getDailyRange:(profile:string,source:string,start:string,end:string)=>runtime.read(profile,source,start,end)};});
const candidate=await import('../js/wearables-detail-modal.js');
const flush=()=>new Promise<void>(resolve=>setTimeout(resolve,0));
let chartCalls=0;
let restoreMarkerRuntime:ReturnType<typeof configureMarkerDetailRuntime>;
let restoreBridge:Record<string,unknown>,restoreRuntime:ReturnType<typeof configureWearableDetailRuntimeDeps>;
beforeEach(()=>{
 chartCalls=0;vi.stubGlobal('Chart',class{constructor(_canvas:HTMLCanvasElement,_config:Record<string,unknown>){chartCalls++;}destroy(){}});vi.stubGlobal('__labChartDateAdapterLoaded',true);
 candidate._uninstallWearableModalFocusTrap();localStorage.clear();document.body.innerHTML='<button id="trigger">Weight</button><button id="other-trigger">Other</button><div id="modal-overlay"><div id="detail-modal"></div></div>';
 state.currentProfile='default';state.unitSystem='EU';state.importedData=migrateProfileData({...createDefaultProfileData(),wearableSummary:{sources:{manual:{}},metrics:{weight:{primarySource:'manual',latest:72,latestDate:'2026-08-05',baseline:73,weekly:[]},rhr:{primarySource:'manual',latest:60,latestDate:'2026-08-05',baseline:62,weekly:[]}}}});
 runtime.read=async()=>[];restoreMarkerRuntime=configureMarkerDetailRuntime({closeEMFInterpretation:()=>{}});restoreBridge=configureWearablesModuleBridge({_uninstallWearableModalFocusTrap:candidate._uninstallWearableModalFocusTrap});restoreRuntime=configureWearableDetailRuntimeDeps({rememberModalTrigger});document.getElementById('trigger')!.focus();
});
afterEach(()=>{closeModal();configureMarkerDetailRuntime(restoreMarkerRuntime);configureWearablesModuleBridge(restoreBridge);configureWearableDetailRuntimeDeps(restoreRuntime);document.body.replaceChildren();vi.restoreAllMocks();vi.unstubAllGlobals();});
function deferredRead(at:number){let calls=0,release:((value:StoredWearableRow[])=>void)|undefined;const pending=new Promise<StoredWearableRow[]>(resolve=>{release=resolve;});runtime.read=async()=>++calls===at?pending:[];return {release(){expect(release).toBeTypeOf('function');release!([{date:'2026-08-05',source:'manual',weight:72}]);},calls:()=>calls};}
it.each([1,2])('cancels a pending range read at history boundary %i when the actual public modal closes',async boundary=>{
 await candidate.openWearableDetail('weight');const modal=document.getElementById('detail-modal')!,overlay=document.getElementById('modal-overlay')!,oldHTML=modal.innerHTML,writes=vi.spyOn(modal,'innerHTML','set');const pending=deferredRead(boundary);
 candidate.setWearableDetailRange('weight','all');await flush();expect(pending.calls()).toBe(boundary);closeModal();expect(overlay.classList.contains('show')).toBe(false);expect(document.activeElement).toBe(document.getElementById('trigger'));
 pending.release();await flush();expect(overlay.classList.contains('show')).toBe(false);expect(modal.innerHTML).toBe(oldHTML);expect(writes).not.toHaveBeenCalled();expect(chartCalls).toBe(0);expect(document.activeElement).toBe(document.getElementById('trigger'));expect(state.chartInstances.modal).toBeUndefined();
});
it('keeps a normal completed range update and its focused active control',async()=>{await candidate.openWearableDetail('weight');const pending=deferredRead(1);candidate.setWearableDetailRange('weight','all');pending.release();await flush();const overlay=document.getElementById('modal-overlay')!,active=document.querySelector('[data-wearable-range="all"]');expect(overlay.classList.contains('show')).toBe(true);expect(active?.classList.contains('active')).toBe(true);expect(document.activeElement).toBe(active);expect(localStorage.getItem('wearable-detail-range')).toBe('all');expect(chartCalls).toBe(1);});
it('preserves another surface opened in the shared modal after closing the pending wearable range',async()=>{await candidate.openWearableDetail('weight');const pending=deferredRead(1);candidate.setWearableDetailRange('weight','all');closeModal();const modal=document.getElementById('detail-modal')!,overlay=document.getElementById('modal-overlay')!;modal.innerHTML='<button id="other-control">Other feature</button>';overlay.classList.add('show');document.getElementById('other-control')!.focus();pending.release();await flush();expect(modal.innerHTML).toBe('<button id="other-control">Other feature</button>');expect(overlay.classList.contains('show')).toBe(true);expect(document.activeElement?.id).toBe('other-control');});
it('allows a fresh wearable open to supersede an invalidated pending range without stale writes',async()=>{await candidate.openWearableDetail('weight');const pending=deferredRead(1);candidate.setWearableDetailRange('weight','all');closeModal();document.getElementById('other-trigger')!.focus();await candidate.openWearableDetail('rhr');const modal=document.getElementById('detail-modal')!,fresh=modal.innerHTML,focused=document.activeElement;pending.release();await flush();expect(modal.innerHTML).toBe(fresh);expect(modal.textContent).toContain('Resting');expect(document.activeElement).toBe(focused);expect(document.getElementById('modal-overlay')!.classList.contains('show')).toBe(true);closeModal();expect(document.activeElement).toBe(document.getElementById('other-trigger'));});
