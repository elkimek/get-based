// @vitest-environment jsdom
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import type {DesktopDashboardPageView} from '../js/desktop-dashboard-presentation.js';
import type {MobileDashboardPageView} from '../js/mobile-dashboard-presentation.js';
import type {DashboardWidgetEntry} from '../js/dashboard-widget-presentation.js';
import type {DashboardPageFactoryOperations} from '../types/dashboard-page-view.js';
import type {MobileCallbacks} from '../types/mobile-dashboard.js';

type Desktop = typeof import('../js/desktop-dashboard-renderer.js');
type Mobile = typeof import('../js/mobile-dashboard-renderer.js');
const boundary=vi.hoisted(()=>{
  const value={desktop:null as Desktop|null,mobile:null as Mobile|null,viewport:false,listeners:[] as (()=>void)[],desktopLoad:vi.fn<()=>Promise<Desktop>>(),mobileLoad:vi.fn<()=>Promise<Mobile>>()};
  Object.defineProperty(window,'matchMedia',{configurable:true,value:(query:string)=>({
    get matches(){return value.viewport;},media:query,onchange:null,
    addEventListener(_type:string,callback:()=>void){if(query==='(max-width: 799px)')value.listeners.push(callback);},
    removeEventListener(){},addListener(){},removeListener(){},dispatchEvent(){return true;},
  })});
  return value;
});
vi.mock('../js/dashboard-renderer-loader.js',()=>({
  getLoadedDesktopDashboardRenderer:()=>boundary.desktop,loadDesktopDashboardRenderer:()=>boundary.desktopLoad(),
  getLoadedMobileDashboardRenderer:()=>boundary.mobile,loadMobileDashboardRenderer:()=>boundary.mobileLoad(),
}));
vi.mock('../js/health-data-loader.js',async importOriginal=>({...await importOriginal<typeof import('../js/health-data-loader.js')>(),loadContextHealthDots:vi.fn()}));
vi.mock('../js/commit-hash.js',()=>({loadCommitHash:vi.fn()}));
import {state} from '../js/state.js';
import {createDefaultProfileData} from '../js/profile.js';
import {createDashboardPageView} from '../js/dashboard-page-view.js';
import {configureMobileDashboardView,renderMobileDashboard} from '../js/mobile-dashboard.js';
import {createNavigate} from '../js/views-router.js';
import {recordRouteChange} from '../js/route-lifecycle.js';
import {retireDashboardRenderRequests} from '../js/dashboard-render-request.js';

function deferred<T>(){let resolve!:(value:T)=>void,reject!:(error:unknown)=>void;const promise=new Promise<T>((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};}
const data={dates:['2026-01-01'],dateLabels:['Jan 1'],categories:{}};
const previous={currentView:state.currentView,currentProfile:state.currentProfile,importedData:state.importedData,nutritionSummary:state.nutritionSummary,profileSex:state.profileSex};
beforeEach(()=>{
  boundary.desktop=null;boundary.mobile=null;boundary.viewport=false;boundary.desktopLoad.mockReset();boundary.mobileLoad.mockReset();
  Object.assign(state,{currentView:'dashboard',currentProfile:'render-lifecycle',importedData:createDefaultProfileData(),nutritionSummary:null,profileSex:null});
  document.body.innerHTML='<button id="outside">Outside</button><main id="main-content"></main>';document.body.className='';
  vi.spyOn(console,'error').mockImplementation(()=>{});vi.spyOn(window,'scrollTo').mockImplementation(()=>{});
});
afterEach(async()=>{retireDashboardRenderRequests();await vi.dynamicImportSettled();Object.assign(state,previous);document.body.replaceChildren();document.body.className='';vi.restoreAllMocks();});
function renderers(){
  const desktop=vi.fn((_view:DesktopDashboardPageView)=>'<section class="dashboard-widgets">Desktop</section>');
  const mobile=vi.fn((_view:MobileDashboardPageView)=>'<section class="m-shell">Mobile</section>');
  const hydrateDesktop=vi.fn(),hydrateMobile=vi.fn();
  return {desktop,mobile,hydrateDesktop,hydrateMobile,
    desktopModule:{renderDesktopDashboardPage:desktop,hydrateDesktopDashboardPage:hydrateDesktop} satisfies Desktop,
    mobileModule:{renderMobileDashboardPage:mobile,hydrateMobileDashboardPage:hydrateMobile} satisfies Mobile};
}
function fixture(){
  let entries:readonly DashboardWidgetEntry[]=[];
  const build=vi.fn(()=>({data})),drop=vi.fn(),tips=vi.fn(),tour=vi.fn();
  const deps:DashboardPageFactoryOperations={
    setupDropZone:drop,markerHasData:()=>false,buildDashboardWidgetContext:build,getDashboardWidgetPrefs:()=>({order:[],hidden:[]}),
    getVisibleDashboardWidgetViews:()=>entries,projectOnboardingBanner:()=>null,projectAIConnectionReminder:()=>null,
    projectDashboardControlButtons:()=>({organizeLabel:'Customize',showReset:false}),projectDashboardWidget:()=>null,
    isDashboardOrganizeMode:()=>false,loadFocusCard:vi.fn(),loadContextCardTips:tips,startTour:tour,startEmptyTour:vi.fn(),
  };
  const mobile:MobileCallbacks={buildDashboardWidgetContext:build,getDashboardWidgetPrefs:deps.getDashboardWidgetPrefs,
    getVisibleDashboardWidgetViews:()=>entries,projectDashboardControlButtons:()=>({organizeLabel:'Customize',showReset:false}),
    isDashboardOrganizeMode:()=>false,projectDashboardWidget:()=>null,setupDropZone:drop,loadContextCardTips:tips,
    loadCommitHash:vi.fn(),navigate:vi.fn(),toggleMobileSidebar:vi.fn(),loadCatalog:async()=>null,cacheCatalog:vi.fn()};
  configureMobileDashboardView(mobile);
  return {page:createDashboardPageView(deps),build,drop,tips,tour,mobile,
    setEntries(){entries=[{def:{id:'fresh'},content:{kind:'genome',view:{kind:'empty',contributionHref:null}}}];}};
}
it('keeps synchronous empty Welcome independent of both renderer requests',()=>{
  const f=fixture();localStorage.setItem('labcharts-render-lifecycle-emptyTour','completed');
  expect(f.page.showDashboard({dates:[],categories:{}})).toBeUndefined();expect(boundary.desktopLoad).not.toHaveBeenCalled();expect(boundary.mobileLoad).not.toHaveBeenCalled();
  expect(document.querySelector('[data-prerendered-welcome], .welcome-hero, .welcome-primary')).not.toBeNull();expect(f.build).not.toHaveBeenCalled();
});
it.each(['desktop','mobile'] as const)('defers %s projection until load, reads fresh dependencies, and retains the synchronous resident path',async mode=>{
  const f=fixture(),r=renderers();boundary.viewport=mode==='mobile';
  const pending=mode==='desktop'?deferred<Desktop>():deferred<Mobile>();
  if(mode==='desktop')boundary.desktopLoad.mockReturnValue(pending.promise as Promise<Desktop>);else boundary.mobileLoad.mockReturnValue(pending.promise as Promise<Mobile>);
  const result=f.page.showDashboard(data);expect(result).toBeInstanceOf(Promise);expect(f.build).not.toHaveBeenCalled();expect(document.querySelector('[role="status"]')?.getAttribute('aria-busy')).toBe('true');
  f.setEntries();
  if(mode==='desktop'){boundary.desktop=r.desktopModule;(pending as ReturnType<typeof deferred<Desktop>>).resolve(r.desktopModule);}else{boundary.mobile=r.mobileModule;(pending as ReturnType<typeof deferred<Mobile>>).resolve(r.mobileModule);}
  await result;expect(f.build).toHaveBeenCalledTimes(1);expect(f.drop).toHaveBeenCalledTimes(1);
  if(mode==='desktop'){expect(r.desktop.mock.calls[0]![0].widgets).toHaveLength(1);expect(r.mobile).not.toHaveBeenCalled();expect(boundary.mobileLoad).not.toHaveBeenCalled();}
  else{expect(r.mobile.mock.calls[0]![0].stack.count).toBe('1');expect(r.desktop).not.toHaveBeenCalled();expect(boundary.desktopLoad).not.toHaveBeenCalled();}
  expect(f.page.showDashboard(data)).toBeUndefined();expect(f.build).toHaveBeenCalledTimes(2);
});
it.each(['profile','data','route away/back','same-route refresh','main replacement','viewport'] as const)('prevents late Desktop publication after %s',async kind=>{
  const f=fixture(),r=renderers(),pending=deferred<Desktop>();boundary.desktopLoad.mockReturnValue(pending.promise);
  const first=f.page.showDashboard(data);
  if(kind==='profile')state.currentProfile='new-profile';
  if(kind==='data')state.importedData=createDefaultProfileData();
  if(kind==='route away/back'){recordRouteChange();state.currentView='body';recordRouteChange();state.currentView='dashboard';}
  if(kind==='same-route refresh'){const next=f.page.showDashboard(data);expect(next).toBeInstanceOf(Promise);}
  if(kind==='main replacement')document.getElementById('main-content')!.outerHTML='<main id="main-content">New owner</main>';
  if(kind==='viewport')boundary.viewport=true;
  boundary.desktop=r.desktopModule;pending.resolve(r.desktopModule);await first;
  if(kind==='same-route refresh'){await Promise.resolve();expect(r.desktop).toHaveBeenCalledTimes(1);}else{expect(r.desktop).not.toHaveBeenCalled();expect(r.hydrateDesktop).not.toHaveBeenCalled();expect(f.drop).not.toHaveBeenCalled();}
});
it('shows an owned import failure and retries through the real button without empty completion',async()=>{
  const f=fixture(),r=renderers(),retry=deferred<Desktop>();boundary.desktopLoad.mockRejectedValueOnce(Error('offline')).mockReturnValueOnce(retry.promise);
  await expect(f.page.showDashboard(data)).resolves.toBe(false);expect(document.querySelector('[role="alert"]')?.textContent).toContain('Dashboard could not be loaded');expect(r.desktop).not.toHaveBeenCalled();
  document.querySelector<HTMLButtonElement>('[data-dashboard-render-retry]')!.click();expect(boundary.desktopLoad).toHaveBeenCalledTimes(2);expect(document.querySelector('[role="status"]')).not.toBeNull();
  boundary.desktop=r.desktopModule;retry.resolve(r.desktopModule);await retry.promise;await Promise.resolve();expect(r.desktop).toHaveBeenCalledTimes(1);expect(document.querySelector('[role="alert"]')).toBeNull();
});
it.each(['desktop','mobile'] as const)('retains direct %s rendering while the stored route is Labs, including cold completion',async mode=>{
  const f=fixture(),r=renderers();state.currentView='labs';boundary.viewport=mode==='mobile';
  if(mode==='desktop'){
    const pending=deferred<Desktop>();boundary.desktopLoad.mockReturnValue(pending.promise);
    const first=f.page.showDashboard(data);boundary.desktop=r.desktopModule;pending.resolve(r.desktopModule);await first;
    expect(r.desktop).toHaveBeenCalledTimes(1);expect(r.mobile).not.toHaveBeenCalled();
  }else{
    const pending=deferred<Mobile>();boundary.mobileLoad.mockReturnValue(pending.promise);
    const first=renderMobileDashboard(data,{resetScroll:true});boundary.mobile=r.mobileModule;pending.resolve(r.mobileModule);await first;
    expect(r.mobile).toHaveBeenCalledTimes(1);expect(r.desktop).not.toHaveBeenCalled();expect(window.scrollTo).toHaveBeenCalledWith(0,0);
  }
  expect(f.drop).toHaveBeenCalledTimes(1);
});
it('uses the actual registered breakpoint callback and navigator to recover with Mobile while Desktop remains pending',async()=>{
  const f=fixture(),r=renderers(),desktop=deferred<Desktop>(),mobile=deferred<Mobile>();
  boundary.desktopLoad.mockReturnValue(desktop.promise);boundary.mobileLoad.mockReturnValue(mobile.promise);
  const navigate=createNavigate({routeHandlers:{dashboard:()=>f.page.showDashboard(data)}});
  const navigations:unknown[]=[];configureMobileDashboardView({...f.mobile,navigate:(route:string)=>{const result=navigate(route);navigations.push(result);return result;}});
  const first=navigate('dashboard');expect(boundary.listeners.length).toBeGreaterThan(0);
  boundary.viewport=true;for(const listener of boundary.listeners)listener();expect(boundary.mobileLoad).toHaveBeenCalledTimes(1);expect(navigations).toHaveLength(1);
  boundary.desktop=r.desktopModule;desktop.resolve(r.desktopModule);await first;expect(r.desktop).not.toHaveBeenCalled();
  boundary.mobile=r.mobileModule;mobile.resolve(r.mobileModule);await navigations[0];expect(r.mobile).toHaveBeenCalledTimes(1);expect(f.drop).toHaveBeenCalledTimes(1);expect(document.querySelector('.m-shell')?.textContent).toBe('Mobile');expect(document.querySelector('[role="status"]')).toBeNull();
});
it('allows page completion behind a new focused dialog without stealing its focus or scrolling',async()=>{
  const f=fixture(),r=renderers(),pending=deferred<Mobile>();boundary.viewport=true;boundary.mobileLoad.mockReturnValue(pending.promise);
  const first=renderMobileDashboard(data,{resetScroll:true});const dialog=document.createElement('dialog');dialog.setAttribute('open','');dialog.innerHTML='<button>Owned dialog</button>';document.body.append(dialog);const button=dialog.querySelector('button')!;button.focus();
  boundary.mobile=r.mobileModule;pending.resolve(r.mobileModule);await first;expect(r.mobile).toHaveBeenCalledTimes(1);expect(document.activeElement).toBe(button);expect(window.scrollTo).not.toHaveBeenCalled();expect(f.drop).toHaveBeenCalledTimes(1);
});
it('stops Mobile body/chrome effects if projection reentrantly navigates away',()=>{
  const f=fixture(),r=renderers();boundary.viewport=true;boundary.mobile=r.mobileModule;
  configureMobileDashboardView({...f.mobile,buildDashboardWidgetContext:()=>{recordRouteChange();state.currentView='body';return {data};}});
  expect(renderMobileDashboard(data)).toBe(false);expect(document.body.classList.contains('mobile-dashboard-active')).toBe(false);expect(r.mobile).not.toHaveBeenCalled();expect(f.drop).not.toHaveBeenCalled();
});
