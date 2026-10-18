import Biometrics,{hydrate as hydrateBiometrics,unmount as unmountBiometrics,flushSync as flushBiometrics} from './components/DashboardBiometricsOverview.svelte.native.js';
import Insights,{hydrate as hydrateInsights,unmount as unmountInsights,flushSync as flushInsights} from './components/DashboardInsights.svelte.native.js';
import OwnedWidget,{hydrate,unmount,flushSync} from './components/DashboardOwnedWidget.svelte.native.js';
import LabMarkers,{hydrate as hydrateLab,unmount as unmountLab,flushSync as flushLab} from './components/DashboardLabMarkers.svelte.native.js';
import {state} from './state.js';
import type {DashboardOwnedWidgetEntry,DashboardOwnedWidgetView} from '../types/dashboard-owned-widgets.js';
interface Owner {body:HTMLElement;release():void;profile:string;data:unknown}
let owners:Owner[]=[];
let observer:MutationObserver|null=null;
function dispose(owner:Owner):void {owner.release();}
function retireOwners(retired:Owner[]):void {
 owners=owners.filter(owner=>!retired.includes(owner));for(const owner of retired)dispose(owner);
 if(!owners.length){observer?.disconnect();observer=null;globalThis.removeEventListener('labcharts-profile-switched',handleProfileSwitched);}
}
/** Native shell navigation precedes this event; retain fresh owners of the current profile/data. */
function handleProfileSwitched():void {retireOwners(owners.filter(owner=>!owner.body.isConnected||owner.profile!==state.currentProfile||owner.data!==state.importedData));}
export function disposeDashboardOwnedWidgets():void {
 observer?.disconnect();observer=null;
 const previous=owners;owners=[];for(const owner of previous)dispose(owner);
 globalThis.removeEventListener('labcharts-profile-switched',handleProfileSwitched);
}
/** The native document delegates remain the sole action owner. */
export function hydrateDashboardOwnedWidgetBodies(main:HTMLElement,entries:readonly DashboardOwnedWidgetEntry[]):void {
 const owned=entries.filter((entry):entry is DashboardOwnedWidgetEntry&{ownedView:DashboardOwnedWidgetView}=>entry.ownedView!==undefined&&!(entry.ownedView.kind==='quick-markers'&&!entry.ownedView.rows.length));
 const ids=new Set<string>();
 const prepared:{body:HTMLElement;view:DashboardOwnedWidgetView}[]=[];
 for(const {def,ownedView} of owned){
  const id=ownedView.kind==='single-marker'?ownedView.widgetId:ownedView.kind;
  if(def.id!==id||ids.has(id))throw new Error('Unqualified owned Dashboard widget identity');
  ids.add(id);
  const bodies=main.querySelectorAll<HTMLElement>('.dashboard-widgets:not([data-lens-shell-view]) > section[data-widget-id="'+id+'"] > .dashboard-widget-body');
  if(bodies.length!==1)throw new Error('Exactly one native Dashboard-owned body required');
  prepared.push({body:bodies[0]!,view:ownedView});
 }
 disposeDashboardOwnedWidgets();
 try {
  for(const {body,view} of prepared){
   // Each public native bundle owns its Svelte runtime; lifecycle APIs must come from the same bundle as its component.
   let release:()=>void;
   if(view.kind==='wearables'){
    const component=hydrateBiometrics(Biometrics,{target:body,props:{view},recover:false});flushBiometrics();release=()=>{void unmountBiometrics(component);flushBiometrics();};
   }else if(view.kind==='insights'){
    const component=hydrateInsights(Insights,{target:body,props:{view},recover:false});flushInsights();release=()=>{void unmountInsights(component);flushInsights();};
   }else if(view.kind==='single-marker'||view.kind==='spotlight'){
    const component=hydrateLab(LabMarkers,{target:body,props:{view},recover:false});flushLab();release=()=>{void unmountLab(component);flushLab();};
   }else{
    const component=hydrate(OwnedWidget,{target:body,props:{view},recover:false});flushSync();release=()=>{void unmount(component);flushSync();};
   }
   owners.push({body,release,profile:state.currentProfile,data:state.importedData});
  }
 }catch(error){disposeDashboardOwnedWidgets();throw error;}
 if(!owners.length)return;
 observer=new MutationObserver(records=>{
  const retired=owners.filter(owner=>!owner.body.isConnected||owner.profile!==state.currentProfile||owner.data!==state.importedData||records.some(record=>[...record.removedNodes].some(node=>node===owner.body||(node instanceof Element&&node.contains(owner.body)))));
  retireOwners(retired);
 });
 observer.observe(main.ownerDocument.documentElement,{childList:true,subtree:true});
 globalThis.addEventListener('labcharts-profile-switched',handleProfileSwitched);
}
