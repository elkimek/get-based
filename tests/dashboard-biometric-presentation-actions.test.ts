// @vitest-environment jsdom
import {expect,it,vi} from 'vitest';
const nativeActions=vi.hoisted(()=>({calls:[] as unknown[][],detailAccepted:true}));
vi.mock('../js/dashboard-widget-runtime.js',async importOriginal=>{const real=await importOriginal<typeof import('../js/dashboard-widget-runtime.js')>();return{...real,
 openDashboardWearableDetail:(id:unknown)=>{nativeActions.calls.push(['detail',id]);return nativeActions.detailAccepted;},
 openDashboardWearablesSettings:()=>{nativeActions.calls.push(['settings']);},
 openDashboardManualLogForm:(id:unknown,event:Event)=>{nativeActions.calls.push(['manual',id,event.type]);},
 syncDashboardWearableNow:(el:HTMLElement)=>{nativeActions.calls.push(['sync',el.className,el.textContent]);},
};});
import {createDashboardWidgetRenderers} from '../js/dashboard-widget-renderers.js';
import {createDashboardWidgetControls} from '../js/dashboard-widget-controls.js';
import {state} from '../js/state.js';
import {dashboardBiometricSelectionKey} from '../js/dashboard-widgets.js';

const saved=Object.getOwnPropertyDescriptors(state);
function run(kind:'populated'|'manual'|'stale',action:string,key?:string,detailAccepted=true){
 const listeners:Array<[string,EventListenerOrEventListenerObject,boolean|AddEventListenerOptions|undefined]>=[];
 const originalNodes=[...document.body.childNodes];const storage=[...Array(localStorage.length)].map((_,i)=>{const k=localStorage.key(i)!;return[k,localStorage.getItem(k)!] as const;});
 nativeActions.calls=[];nativeActions.detailAccepted=detailAccepted;
 try{
  localStorage.clear();localStorage.setItem(dashboardBiometricSelectionKey(),'["weight"]');
  state.importedData={wearableSummary:{metrics:kind==='manual'?{}:{weight:{latest:72}}},wearableConnections:kind==='stale'?{one:{connectedAt:1,accessToken:'synthetic',lastSyncAt:1}}:{}} as unknown as typeof state.importedData;
  const owner=createDashboardWidgetRenderers({getMobileWearableTiles:()=>[],getMobileWearablePriority:()=>[],formatMobileWearableValue:()=>72,formatMobileWearableDelta:()=>0});
  document.body.innerHTML='<main id="host">'+owner.renderDashboardWearableTilesWidget()+'</main>';
  const add=document.addEventListener.bind(document);const capture=vi.spyOn(document,'addEventListener').mockImplementation((type,listener,options)=>{listeners.push([type,listener,options]);add(type,listener,options);});
  try{createDashboardWidgetControls({state,getDashboardBiometricSelection:()=>['weight'],saveDashboardBiometricSelection:(ids:unknown)=>{nativeActions.calls.push(['save-selection',ids]);},getDashboardBiometricMetricOrder:()=>[],getDashboardBiometricTile:()=>null,rerenderDashboardFromWidgetChange:()=>{nativeActions.calls.push(['rerender']);}});}finally{capture.mockRestore();}
  const el=document.querySelector<HTMLElement>('[data-dashboard-widget-action="'+action+'"]')!;expect(el).not.toBeNull();
  if(key)el.dispatchEvent(new KeyboardEvent('keydown',{key,bubbles:true,cancelable:true}));else el.click();
  return{calls:[...nativeActions.calls],storage:localStorage.getItem(dashboardBiometricSelectionKey()),picker:document.querySelector('.dashboard-biometric-picker')?.getAttribute('aria-labelledby')||null};
 }finally{
  for(const [type,listener,options]of listeners)document.removeEventListener(type,listener,options);
  document.body.replaceChildren(...originalNodes);Object.defineProperties(state,saved);localStorage.clear();for(const [k,v]of storage)localStorage.setItem(k,v);vi.restoreAllMocks();
 }
}
it('delegates actual populated detail action through native controller',()=>{expect(run('populated','open-biometric-detail').calls).toEqual([['detail','weight']]);});
it('preserves native detail fallback to wearable settings',()=>{expect(run('populated','open-biometric-detail',undefined,false).calls).toEqual([['detail','weight'],['settings']]);});
it('delegates removal to the injected native selection/save/rerender chronology without data writes',()=>{expect(run('populated','remove-biometric-metric').calls).toEqual([['save-selection',[]],['rerender']]);});
it('delegates stale synchronization to the injected runtime action without provider writes',()=>{expect(run('stale','sync-biometric-now').calls).toEqual([['sync','dashboard-action-btn db-biometric-sync-btn','Sync stale data']]);});
it('opens the already-Svelte native Add metrics picker',()=>{const result=run('populated','open-biometric-picker');expect(result.picker).toBe('dashboard-biometric-picker-title');expect(result.calls).toEqual([]);});
for(const key of ['Enter',' '])it('keeps keyboard manual logging for '+JSON.stringify(key),()=>{expect(run('manual','open-biometric-manual-log',key).calls).toEqual([['manual','weight','click']]);});
it('keeps click manual logging and the original saved selection untouched',()=>{const result=run('manual','open-biometric-manual-log');expect(result.calls).toEqual([['manual','weight','click']]);expect(result.storage).toBe('["weight"]');});
