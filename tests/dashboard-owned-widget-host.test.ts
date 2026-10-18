// @vitest-environment jsdom
import {afterEach,expect,it,vi} from 'vitest';
import {createDashboardLabWidgetRenderers} from '../js/dashboard-lab-widget-renderers.js';
import {state} from '../js/state.js';
import {renderDashboardOwnedWidgetHTML} from '../js/dashboard-owned-widget-html.js';
import {hydrateDashboardOwnedWidgetBodies,disposeDashboardOwnedWidgets} from '../js/dashboard-owned-widget-host.js';
import Component,{hydrate,flushSync,unmount} from '../js/components/DashboardOwnedWidget.svelte.native.js';
import {createDashboardWidgetRegistry} from '../js/dashboard-widgets.js';
import {profileStorageKey} from '../js/profile.js';
import type {DashboardNotesView} from '../types/dashboard-owned-widgets.js';
const imported=state.importedData,currentProfile=state.currentProfile;
afterEach(()=>{disposeDashboardOwnedWidgets();state.importedData=imported;state.currentProfile=currentProfile;document.body.innerHTML='';localStorage.clear();vi.restoreAllMocks();});
function notes():DashboardNotesView {
 (state as {importedData:unknown}).importedData={notes:[{date:'2026-02-02',text:'Second <&>'},{date:'2026-01-01',text:'First'}]};
 return createDashboardLabWidgetRenderers({markerHasData:()=>true,rerenderDashboardFromWidgetChange:()=>{}}).projectDashboardNotesWidget();
}
function fixture(view:DashboardNotesView):HTMLElement {
 document.body.innerHTML='<main id="main-content"><div class="dashboard-widgets"><section data-widget-id="notes"><div class="dashboard-widget-body">'+renderDashboardOwnedWidgetHTML(view)+'</div></section><section data-widget-id="foreign"><div class="dashboard-widget-body"><input value="retained"></div></section></div><div class="dashboard-widgets" data-lens-shell-view><section data-widget-id="notes"><div class="dashboard-widget-body"><p>Foreign Lens</p></div></section></div></main>';
 return document.querySelector<HTMLElement>('main')!;
}
it('hydrates genuine SSR without replacing native-owned nodes or touching foreign/Lens bodies',()=>{
 const view=notes(),main=fixture(view),cards=[...main.querySelectorAll('.note-card')],button=main.querySelector('.add-note-btn'),foreign=main.querySelector('input'),lens=main.querySelector('[data-lens-shell-view]');
 const foreignBefore=foreign!.outerHTML,lensBefore=lens!.outerHTML;
 hydrateDashboardOwnedWidgetBodies(main,[{def:{id:'notes'},ownedView:view},{def:{id:'foreign'}}]);
 expect([...main.querySelectorAll('.note-card')]).toEqual(cards);expect(main.querySelector('.add-note-btn')).toBe(button);expect(main.querySelector('input')).toBe(foreign);expect(foreign!.outerHTML).toBe(foreignBefore);expect(lens!.outerHTML).toBe(lensBefore);
});
it('updates real keyed components while retaining the node belonging to each source index',()=>{
 const view=notes(),main=fixture(view),body=main.querySelector<HTMLElement>('.dashboard-widget-body')!;
 const component=hydrate(Component,{target:body,props:{view},recover:false});flushSync();
 const before=[...body.querySelectorAll<HTMLElement>('.note-card')];
 flushSync(()=>component.setView({kind:'notes',rows:[...view.rows].reverse()}));
 const after=[...body.querySelectorAll<HTMLElement>('.note-card')];expect(after).toEqual([...before].reverse());expect(after.map(n=>n.dataset.dashboardWidgetIndex)).toEqual([...view.rows].reverse().map(n=>String(n.index)));
 void unmount(component);flushSync();
});
it('retires only owned Svelte nodes on the real native profile-switch event',()=>{
 const view=notes(),main=fixture(view),foreign=main.querySelector('input'),lens=main.querySelector('[data-lens-shell-view]');
 hydrateDashboardOwnedWidgetBodies(main,[{def:{id:'notes'},ownedView:view}]);
 state.currentProfile='other-profile';globalThis.dispatchEvent(new Event('labcharts-profile-switched'));expect(main.querySelector('.note-card')).toBeNull();expect(main.querySelector('input')).toBe(foreign);expect(main.querySelector('[data-lens-shell-view]')).toBe(lens);
});
it('rejects foreign-only Lens host instead of hydrating it as Dashboard',()=>{
 const view=notes(),main=fixture(view);main.querySelector('.dashboard-widgets:not([data-lens-shell-view])')!.remove();
 expect(()=>hydrateDashboardOwnedWidgetBodies(main,[{def:{id:'notes'},ownedView:view}])).toThrow('Exactly one native Dashboard-owned body');expect(main.querySelector('[data-lens-shell-view] p')?.textContent).toBe('Foreign Lens');
});
it('rejects mismatched named ownership and duplicate native body discovery',()=>{
 const view=notes(),main=fixture(view);expect(()=>hydrateDashboardOwnedWidgetBodies(main,[{def:{id:'quick-markers'},ownedView:view}])).toThrow('Unqualified owned Dashboard widget identity');
 main.querySelector('.dashboard-widgets:not([data-lens-shell-view])')!.append(main.querySelector('section')!.cloneNode(true));expect(()=>hydrateDashboardOwnedWidgetBodies(main,[{def:{id:'notes'},ownedView:view}])).toThrow('Exactly one native Dashboard-owned body');
});

it('leaves empty Quick organize-mode fallback and foreign bodies native',()=>{
 const view=notes(),main=fixture(view),grid=main.querySelector('.dashboard-widgets:not([data-lens-shell-view])')!;
 const fallback=document.createElement('section');fallback.dataset.widgetId='quick-markers';fallback.innerHTML='<div class="dashboard-widget-body"><div class="dashboard-widget-empty">No data available for this widget.</div></div>';grid.append(fallback);const before=fallback.innerHTML;
 hydrateDashboardOwnedWidgetBodies(main,[{def:{id:'quick-markers'},ownedView:{kind:'quick-markers',rows:[]}}]);expect(fallback.innerHTML).toBe(before);
});
it('preflights every identity before hydrating a first valid body',()=>{
 const view=notes(),main=fixture(view),before=main.innerHTML;
 expect(()=>hydrateDashboardOwnedWidgetBodies(main,[{def:{id:'notes'},ownedView:view},{def:{id:'notes'},ownedView:view}])).toThrow('Unqualified owned Dashboard widget identity');expect(main.innerHTML).toBe(before);
});
it('retires a removed/reinserted owned body while preserving foreign content',async()=>{
 const view=notes(),main=fixture(view),body=main.querySelector<HTMLElement>('.dashboard-widget-body')!,parent=body.parentElement!,foreign=main.querySelector('input');
 hydrateDashboardOwnedWidgetBodies(main,[{def:{id:'notes'},ownedView:view}]);body.remove();parent.append(body);await new Promise<void>(resolve=>queueMicrotask(resolve));
 expect(body.querySelector('.note-card')).toBeNull();expect(main.querySelector('input')).toBe(foreign);
});

it('reuses one genuine projected snapshot for registry SSR and client hydration without rereading domain getters',()=>{
 const trace:string[]=[];const data={dates:['2026-01-01','2026-02-01'],categories:{lipids:{markers:{apoB:{name:'ApoB',unit:'mg/dL',values:[90,120],refMin:50,refMax:100}}}},get notes(){trace.push('notes:get');return [{date:'2026-01-15',text:'Same source snapshot'}];}};
 (state as {importedData:unknown}).importedData=data;localStorage.setItem(profileStorageKey(state.currentProfile,'dashboardQuickMarkerPinsV1'),JSON.stringify(['lipids_apoB']));
 const renderers=createDashboardLabWidgetRenderers({markerHasData:()=>true,rerenderDashboardFromWidgetChange:()=>{}});
 const projectNotes=vi.spyOn(renderers,'projectDashboardNotesWidget'),projectQuick=vi.spyOn(renderers,'projectDashboardQuickMarkersWidget');
 const registry=createDashboardWidgetRegistry(renderers,{isOrganizeMode:()=>false}),ids=registry.getAvailableDashboardFixedWidgetIds() as string[];
 const entries=registry.getVisibleDashboardWidgetEntries({data,filteredData:data,keyMarkers:[{cat:'lipids',key:'apoB'}]}, {order:['notes','quick-markers'],hidden:ids.filter(id=>id!=='notes'&&id!=='quick-markers')}) as {def:{id:string};body:string;ownedView:Parameters<typeof renderDashboardOwnedWidgetHTML>[0]}[];
 expect(projectNotes).toHaveBeenCalledTimes(1);expect(projectQuick).toHaveBeenCalledTimes(1);expect(trace).toEqual(['notes:get','notes:get','notes:get']);
 expect(entries.find(e=>e.def.id==='notes')!.ownedView).toBe(projectNotes.mock.results[0]!.value);expect(entries.find(e=>e.def.id==='quick-markers')!.ownedView).toBe(projectQuick.mock.results[0]!.value);
 document.body.innerHTML='<main><div class="dashboard-widgets">'+entries.map(e=>'<section data-widget-id="'+e.def.id+'"><div class="dashboard-widget-body">'+e.body+'</div></section>').join('')+'</div></main>';
 const main=document.querySelector<HTMLElement>('main')!,before=main.innerHTML,buttons=[...main.querySelectorAll('button')],svg=main.querySelector('svg');
 hydrateDashboardOwnedWidgetBodies(main,entries);expect(main.innerHTML).toBe(before);expect([...main.querySelectorAll('button')]).toEqual(buttons);expect(main.querySelector('svg')).toBe(svg);expect(svg?.namespaceURI).toBe('http://www.w3.org/2000/svg');
 expect(projectNotes).toHaveBeenCalledTimes(1);expect(projectQuick).toHaveBeenCalledTimes(1);expect(trace).toEqual(['notes:get','notes:get','notes:get']);
});

it('keeps fresh correct-profile owners when native shell navigation finishes before the switch event',()=>{
 const first=notes(),main=fixture(first);hydrateDashboardOwnedWidgetBodies(main,[{def:{id:'notes'},ownedView:first}]);
 state.currentProfile='native-next-profile';const next=notes();main.innerHTML='<div class="dashboard-widgets"><section data-widget-id="notes"><div class="dashboard-widget-body">'+renderDashboardOwnedWidgetHTML(next)+'</div></section></div>';
 hydrateDashboardOwnedWidgetBodies(main,[{def:{id:'notes'},ownedView:next}]);const before=main.innerHTML,button=main.querySelector('.add-note-btn'),cards=[...main.querySelectorAll('.note-card')];
 globalThis.dispatchEvent(new CustomEvent('labcharts-profile-switched',{detail:{profileId:state.currentProfile}}));
 expect(main.innerHTML).toBe(before);expect(main.querySelector('.add-note-btn')).toBe(button);expect([...main.querySelectorAll('.note-card')]).toEqual(cards);
});

it('retires stale data identity on the native profile event while retaining foreign bodies',()=>{
 const view=notes(),main=fixture(view),foreign=main.querySelector('input');hydrateDashboardOwnedWidgetBodies(main,[{def:{id:'notes'},ownedView:view}]);(state as {importedData:unknown}).importedData={notes:[]};globalThis.dispatchEvent(new CustomEvent('labcharts-profile-switched',{detail:{profileId:state.currentProfile}}));expect(main.querySelector('.note-card')).toBeNull();expect(main.querySelector('input')).toBe(foreign);
});
it('retires already disconnected owners immediately on the native profile event',()=>{
 const view=notes(),main=fixture(view),body=main.querySelector<HTMLElement>('.dashboard-widget-body')!,foreign=main.querySelector('input');hydrateDashboardOwnedWidgetBodies(main,[{def:{id:'notes'},ownedView:view}]);body.remove();globalThis.dispatchEvent(new CustomEvent('labcharts-profile-switched',{detail:{profileId:state.currentProfile}}));expect(body.childNodes).toHaveLength(0);expect(main.querySelector('input')).toBe(foreign);
});
