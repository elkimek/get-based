// @vitest-environment jsdom
import {afterEach,beforeEach,expect,expectTypeOf,it} from 'vitest';
import * as shell from '../js/lens-page-shell.js';
import * as core from '../js/lens-page-shell-core.js';
import {state} from '../js/state.js';
import {profileStorageKey} from '../js/profile.js';
import {originalLensCore,originalShellValueExports} from './helpers/lens-core-original.js';
import type {LensWidgetContent} from '../js/lens-widget-content.js';

const before={profile:state.currentProfile,route:state.currentView};
let restore:ReturnType<typeof core.configureLensPageShell>;
beforeEach(()=>{restore=core.configureLensPageShell();localStorage.clear();state.currentProfile='lens-core-fixture';state.currentView='body';});
afterEach(()=>{core.configureLensPageShell(restore);localStorage.clear();state.currentProfile=before.profile;state.currentView=before.route;document.body.replaceChildren();});
it('keeps the exact public named value exports and forwards one shared core instance',()=>{
  expect(Object.keys(shell).sort()).toEqual([...originalShellValueExports].sort());
  for(const name of ['configureLensPageShell','lensPageActionAttrs','getLensPageWidgetOrder','moveLensPageWidget','getLensDashboardToggleView','getLensWidgetChrome','getLensContentGrid'] as const)expect(shell[name]).toBe(core[name]);
  const available=()=>['shared'],first=core.configureLensPageShell({getAvailableDashboardFixedWidgetIds:available,getDashboardWidgetPrefs:()=>({hidden:[]})});
  expect(shell.getLensDashboardToggleView('shared')?.action).toBe('remove-dashboard-widget');expect(shell.renderLensDashboardToggle('shared')).toContain('Remove from Dashboard');
  const second=shell.configureLensPageShell({getDashboardWidgetPrefs:()=>({hidden:['shared']})});expect(second.getAvailableDashboardFixedWidgetIds).toBe(available);
  expect(core.getLensDashboardToggleView('shared')?.action).toBe('add-dashboard-widget');core.configureLensPageShell(first);
  expectTypeOf<shell.LensPageShellDeps>().toEqualTypeOf<core.LensPageShellDeps>();expectTypeOf<shell.LensContentGrid<number>>().toEqualTypeOf<core.LensContentGrid<number>>();
});
it('shares ordering/profile state between public rendering, core chrome and core delegates',()=>{
  const calls:string[]=[],source={kind:'body-sources',view:{empty:true,sources:[]}} satisfies LensWidgetContent;
  core.configureLensPageShell({getAvailableDashboardFixedWidgetIds:()=>['a','b'],getDashboardWidgetPrefs:()=>({hidden:[]}),navigate:route=>calls.push(route)});
  const key=profileStorageKey(state.currentProfile,'lensPageOrder-body-group-v1');localStorage.setItem(key,'["b","a"]');
  const grid=core.getLensContentGrid('body',[{id:'a',title:'A',content:source},{id:'b',title:'B',content:source}],{group:'group'});expect(grid.widgets.map(row=>row.view.id)).toEqual(['b','a']);
  document.body.innerHTML=shell.renderLensPageWidgets('body',[{id:'a',title:'A',body:source},{id:'b',title:'B',body:source}],{group:'group'});
  document.querySelector<HTMLButtonElement>('[data-widget-id="b"] [data-lens-page-direction="1"]')!.click();expect(localStorage.getItem(key)).toBe('["a","b"]');expect(calls).toEqual(['body']);
  expect(shell.getLensPageWidgetOrder('body-group',['a','b'])).toEqual(['a','b']);
});

type Scenario='header'|'widget'|'grid'|'toggle';
function receipt(api:typeof shell,scenario:Scenario,fault=0){
  const events:string[]=[];let at=0;
  const observe=(label:string)=>{events.push(label);if(++at===fault)throw new Error('fault:'+label);};
  const deps={getAvailableDashboardFixedWidgetIds(){observe('available');return ['sources'];},getDashboardWidgetPrefs(){observe('prefs');return {get hidden(){observe('hidden');return ['sources'];}};}};
  api.configureLensPageShell(deps);
  const title={toString(){observe('title');return 'Source <literal> & title';}},subtitle={toString(){observe('subtitle');return 'Subtitle & literal';}};
  const body:LensWidgetContent={get kind(){observe('body.kind');return 'body-sources' as const;},view:{empty:true,sources:[]}};
  const options={get dashboardId(){observe('dashboard-id');return 'sources';},get pageRoute(){observe('page-route');return 'body';},get pageIndex(){observe('page-index');return 0;},get pageCount(){observe('page-count');return 2;},get compactScore(){observe('compact');return false;}};
  let html:string|undefined,error:string|undefined;
  try{
    if(scenario==='header')html=api.renderLensHeader(title,subtitle,null,{get className(){observe('class-name');return 'native-header';}});
    if(scenario==='widget')html=api.renderLensWidget('sources',title,'Description & literal',body,'half',options);
    if(scenario==='grid')html=api.renderLensPageWidgets('body',[false,null,{id:'sources',title,body,opts:options},{id:'other',title:'Other',body:null}],{get group(){observe('group');return 'group';}});
    if(scenario==='toggle')html=api.renderLensDashboardToggle('sources');
  }catch(value){error=(value as Error).message;}
  return {events,html,error};
}
it.each(['header','widget','grid','toggle'] as const)('preserves exact pre-extraction raw HTML/SDK, reads, coercion and every failure boundary for %s',scenario=>{
  const original=originalLensCore(),expected=receipt(original,scenario);expect(expected.error).toBeUndefined();expect(expected.html).toBeTypeOf('string');
  expect(receipt(shell,scenario)).toEqual(expected);
  for(let fault=1;fault<=expected.events.length;fault++)expect(receipt(shell,scenario,fault)).toEqual(receipt(originalLensCore(),scenario,fault));
});
it('retains original default-return identity on invalid stored orders',()=>{
  const ids=['a','b'];localStorage.setItem(profileStorageKey(state.currentProfile,'lensPageOrder-body-v1'),'null');expect(core.getLensPageWidgetOrder('body',ids)).toBe(ids);
  localStorage.setItem(profileStorageKey(state.currentProfile,'lensPageOrder-body-v1'),'{invalid');expect(shell.getLensPageWidgetOrder('body',ids)).toBe(ids);
});
