// @vitest-environment jsdom
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {state} from '../js/state.js';
import {createDashboardLabWidgetRenderers} from '../js/dashboard-lab-widget-renderers.js';
import {createDashboardWidgetRegistry} from '../js/dashboard-widgets.js';
import {hydrateDashboardOwnedWidgetBodies,disposeDashboardOwnedWidgets} from '../js/dashboard-owned-widget-host.js';
import {renderDashboardOwnedWidgetHTML} from '../js/dashboard-owned-widget-html.js';
import {configureDashboardWidgetRuntimeDeps} from '../js/dashboard-widget-runtime.js';
import {createDashboardWidgetControls} from '../js/dashboard-widget-controls.js';
const saved={profile:state.currentProfile,data:state.importedData,registry:state.markerRegistry};
beforeEach(()=>{state.currentProfile='typed-lab-host';state.markerRegistry={};localStorage.clear();});
afterEach(()=>{disposeDashboardOwnedWidgets();state.currentProfile=saved.profile;state.importedData=saved.data;state.markerRegistry=saved.registry;localStorage.clear();document.body.innerHTML='';vi.restoreAllMocks();});
function inputs(){
 const data={dates:['2026-01-01','2026-02-01'],categories:{proteins:{label:'Proteins',markers:{apoB:{name:'Moved ApoB',unit:'mg/dL',values:[100,120],refMin:50,refMax:100,storageDotKey:'lipids.apoB'},albumin:{name:'Albumin',unit:'g/L',values:[38,41],refMin:35,refMax:50}}}}};(state as {importedData:unknown}).importedData=data;
 const ctx={data,filteredData:data,keyMarkers:[],trendAlerts:[],criticalFlags:[]};const renderers=createDashboardLabWidgetRenderers({markerHasData:()=>true,rerenderDashboardFromWidgetChange:()=>{}});
 const alias=renderers.projectDashboardSingleMarkerWidget(ctx,'lipids_apoB'),direct=renderers.projectDashboardSingleMarkerWidget(ctx,'proteins_apoB'),spotlight=renderers.projectDashboardSpotlightWidget(ctx);if(!alias||!direct||!spotlight)throw new Error('Genuine native projections required');return {data,ctx,renderers,alias,direct,spotlight};
}
it('keeps supported storage-path widget identity distinct from native moved-marker action identity',()=>{
 const {alias,direct,renderers,ctx}=inputs();expect(alias.widgetId).toBe('marker_lipids_apoB');expect(direct.widgetId).toBe('marker_proteins_apoB');expect(alias.id).toBe('proteins_apoB');expect(direct.id).toBe('proteins_apoB');expect(renderers.renderDashboardSingleMarkerWidget(ctx,'lipids_apoB')).toContain('data-dashboard-widget-id="proteins_apoB"');expect(renderers.projectDashboardSingleMarkerWidget(ctx,'bad\" onclick=x')).toBeNull();
});
it('hydrates distinct legitimate alias widgets plus Spotlight with genuine SVG while foreign Lens remains untouched',()=>{
 const {alias,direct,spotlight,renderers,ctx}=inputs();const views=[alias,direct,spotlight],ids=[alias.widgetId,direct.widgetId,'spotlight'];document.body.innerHTML='<main><div class="dashboard-widgets">'+views.map((view,index)=>'<section data-widget-id="'+ids[index]+'"><div class="dashboard-widget-body">'+renderDashboardOwnedWidgetHTML(view)+'</div></section>').join('')+'</div><div data-lens-shell-view class="dashboard-widgets"><section data-lens-shell-view data-widget-id="spotlight">'+renderers.renderLabsPriorityBanner(ctx)+'<input value="foreign"></section></div></main>';
 const main=document.querySelector<HTMLElement>('main')!,foreign=main.querySelector('[data-lens-shell-view]')!,foreignRaw=foreign.outerHTML,input=foreign.querySelector('input')!,bodies=[...main.querySelectorAll<HTMLElement>('.dashboard-widgets:not([data-lens-shell-view]) .dashboard-widget-body')],before=bodies.map(body=>body.outerHTML);hydrateDashboardOwnedWidgetBodies(main,views.map((ownedView,index)=>({def:{id:ids[index]!},ownedView})));
 expect(bodies.map(body=>body.outerHTML)).toEqual(before);expect(bodies.map(body=>body.querySelector('svg')?.namespaceURI)).toEqual(Array(3).fill('http://www.w3.org/2000/svg'));expect(foreign.outerHTML).toBe(foreignRaw);expect(foreign.querySelector('input')).toBe(input);
 disposeDashboardOwnedWidgets();expect(bodies.map(body=>body.outerHTML)).toEqual(Array(3).fill('<div class="dashboard-widget-body"></div>'));expect(foreign.outerHTML).toBe(foreignRaw);expect(foreign.querySelector('input')).toBe(input);
});
it('projects each registry owner exactly once and reuses the identical snapshot for SSR and hydration',()=>{
 const {ctx,renderers,data}=inputs(),projectSpotlight=vi.spyOn(renderers,'projectDashboardSpotlightWidget'),projectSingle=vi.spyOn(renderers,'projectDashboardSingleMarkerWidget');
 const registry=createDashboardWidgetRegistry(renderers,{getDashboardMarkerWidgetDefinition:(id:unknown)=>id==='marker_lipids_apoB'?{id,render:()=>renderers.renderDashboardSingleMarkerWidget(ctx,'lipids_apoB'),project:()=>renderers.projectDashboardSingleMarkerWidget(ctx,'lipids_apoB')}:null});
 const entries=registry.getVisibleDashboardWidgetEntries(ctx,{order:['spotlight','marker_lipids_apoB'],hidden:[]}) as Array<{def:{id:string};body:string;ownedView:NonNullable<ReturnType<typeof renderers.projectDashboardSpotlightWidget>>|NonNullable<ReturnType<typeof renderers.projectDashboardSingleMarkerWidget>>}>;
 expect(projectSingle).toHaveBeenCalledTimes(1);expect(projectSpotlight).toHaveBeenCalledTimes(1);expect(entries[0]!.ownedView).toBe(projectSpotlight.mock.results[0]!.value);expect(entries[1]!.ownedView).toBe(projectSingle.mock.results[0]!.value);document.body.innerHTML='<main><div class="dashboard-widgets">'+entries.map(entry=>'<section data-widget-id="'+entry.def.id+'"><div class="dashboard-widget-body">'+entry.body+'</div></section>').join('')+'</div></main>';const main=document.querySelector<HTMLElement>('main')!;hydrateDashboardOwnedWidgetBodies(main,entries);expect(projectSingle).toHaveBeenCalledTimes(1);expect(projectSpotlight).toHaveBeenCalledTimes(1);expect(state.importedData).toBe(data);
});
it('retains a single native delegated activation after genuine Labs hydration',()=>{
 const {alias}=inputs(),calls:unknown[]=[],listeners:{type:string;callback:EventListenerOrEventListenerObject}[]=[];const previous=configureDashboardWidgetRuntimeDeps({showDetailModal:(id:unknown)=>calls.push(id)}),add=document.addEventListener.bind(document);vi.spyOn(document,'addEventListener').mockImplementation((type,callback,options)=>{if(callback)listeners.push({type,callback});add(type,callback,options);});
 document.body.innerHTML='<main><div class="dashboard-widgets"><section data-widget-id="'+alias.widgetId+'"><div class="dashboard-widget-body">'+renderDashboardOwnedWidgetHTML(alias)+'</div></section></div></main>';hydrateDashboardOwnedWidgetBodies(document.querySelector<HTMLElement>('main')!,[{def:{id:alias.widgetId},ownedView:alias}]);createDashboardWidgetControls({});try{document.querySelector<HTMLButtonElement>('button')!.click();expect(calls).toEqual(['proteins_apoB']);}finally{for(const {type,callback}of listeners)document.removeEventListener(type,callback);configureDashboardWidgetRuntimeDeps(previous);}
});
it('fails closed on mismatched stored widget identity before retiring existing foreign markup',()=>{
 const {alias}=inputs();document.body.innerHTML='<main><div class="dashboard-widgets"><section data-widget-id="marker_lipids_apoB"><div class="dashboard-widget-body">'+renderDashboardOwnedWidgetHTML(alias)+'</div></section></div><input value="foreign"></main>';const main=document.querySelector<HTMLElement>('main')!,raw=main.outerHTML;expect(()=>hydrateDashboardOwnedWidgetBodies(main,[{def:{id:'marker_proteins_apoB'},ownedView:alias}])).toThrow('identity');expect(main.outerHTML).toBe(raw);
});
