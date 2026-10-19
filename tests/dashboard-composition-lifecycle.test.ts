// @vitest-environment jsdom
import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import type {DesktopDashboardPageView} from '../js/desktop-dashboard-presentation.js';
import type {MobileDashboardPageView} from '../js/mobile-dashboard-presentation.js';

type Composition = typeof import('../js/dashboard-view-composition.js');
const boundary = vi.hoisted(() => {
  const value = {mobile: false, listeners: [] as (() => void)[], load: vi.fn<() => Promise<Composition>>(), lens: vi.fn(), tips: vi.fn(),
    desktop: vi.fn<(_: DesktopDashboardPageView) => string>(), hydrateDesktop: vi.fn(),
    mobileRender: vi.fn<(_: MobileDashboardPageView) => string>(), hydrateMobile: vi.fn(), light: vi.fn()};
  Object.defineProperty(window, 'matchMedia', {configurable: true, value: (query: string) => ({
    get matches() {return query === '(max-width: 799px)' && value.mobile;}, media: query, onchange: null,
    addEventListener(type: string, listener: () => void) {
      if (query === '(max-width: 799px)' && type === 'change') value.listeners.push(listener);
    },
    removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent() {return true;},
  })});
  return value;
});
vi.mock('../js/dashboard-composition-loader.js', async original => ({
  ...await original<typeof import('../js/dashboard-composition-loader.js')>(),
  loadDashboardComposition: () => boundary.load(),
  loadDashboardLens: () => boundary.lens(),
  loadDashboardRecommendations: () => boundary.tips(),
}));
vi.mock('../js/dashboard-renderer-loader.js', () => ({
  getLoadedDesktopDashboardRenderer: () => ({renderDesktopDashboardPage: boundary.desktop, hydrateDesktopDashboardPage: boundary.hydrateDesktop}),
  loadDesktopDashboardRenderer: vi.fn(),
  getLoadedMobileDashboardRenderer: () => ({renderMobileDashboardPage: boundary.mobileRender, hydrateMobileDashboardPage: boundary.hydrateMobile}),
  loadMobileDashboardRenderer: vi.fn(),
}));
vi.mock('../js/health-data-loader.js', async original => ({
  ...await original<typeof import('../js/health-data-loader.js')>(),
  isDashboardHealthDataReady: () => true, loadDashboardHealthDataModules: vi.fn(),
  loadContextHealthDots: vi.fn(), loadContextCardTips: vi.fn(),
}));
vi.mock('../js/commit-hash.js', () => ({loadCommitHash: vi.fn()}));
vi.mock('../js/light-sun-loader.js', async original => ({
  ...await original<typeof import('../js/light-sun-loader.js')>(),
  isLightSunUILoaded: () => true,
  getLoadedLightSunModule: () => ({showLight: boundary.light}),
}));
import * as runtime from '../js/views-runtime.js';
import {state} from '../js/state.js';
import {recordRouteChange} from '../js/route-lifecycle.js';
import {createDefaultProfileData, profileStorageKey} from '../js/profile.js';
import {invalidateActiveDataCache} from '../js/data.js';
import {getLensWidgetChrome} from '../js/lens-page-shell-core.js';
import {dashboardWidgetStorageKey, DASHBOARD_WIDGET_DEFAULT_IDS} from '../js/dashboard-widgets.js';
import {createDashboardViewComposition} from '../js/dashboard-view-composition.js';
import {createLensPageHandlers} from '../js/lens-pages.js';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(yes => {resolve = yes;});
  return {promise, resolve};
}
const originalState = {currentView: state.currentView, currentProfile: state.currentProfile, importedData: state.importedData,
  nutritionSummary: state.nutritionSummary, profileSex: state.profileSex, chatHistory: state.chatHistory,
  rangeMode: state.rangeMode, dateRangeFilter: state.dateRangeFilter};
const data = {
  dates: ['2026-01-01'], dateLabels: ['Jan 1'],
  categories: {
    lipids: {label: 'Lipids', markers: {
      apoB: {name: 'ApoB', unit: 'g/L', values: [0.8], refMin: 0, refMax: 1},
    }},
  },
};
beforeEach(() => {
  runtime.retireProductionDashboard();
  Object.assign(runtime.viewsComposition, {dashboardView: undefined, lensPageHandlers: undefined, recommendationActions: undefined});
  Object.assign(state, {currentView: 'dashboard', currentProfile: 'cold-composition', importedData: createDefaultProfileData(),
    nutritionSummary: null, profileSex: null, chatHistory: []});
  invalidateActiveDataCache();
  localStorage.clear();
  localStorage.setItem(profileStorageKey(state.currentProfile, 'emptyTour'), 'complete');
  document.body.innerHTML = '<button id="outside">Outside</button><main id="main-content">Before</main>';
  document.body.className = '';
  boundary.mobile = false;
  boundary.load.mockReset(); boundary.lens.mockReset(); boundary.tips.mockReset();
  boundary.desktop.mockReset().mockReturnValue('<section class="actual-projection-receiver">Desktop</section>');
  boundary.mobileRender.mockReset().mockReturnValue('<section class="actual-mobile-receiver">Mobile</section>');
  boundary.hydrateDesktop.mockReset(); boundary.hydrateMobile.mockReset(); boundary.light.mockReset();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
});
afterEach(async () => {
  runtime.retireProductionDashboard();
  await vi.dynamicImportSettled();
  Object.assign(runtime.viewsComposition, {dashboardView: undefined, lensPageHandlers: undefined, recommendationActions: undefined});
  Object.assign(state, originalState);
  invalidateActiveDataCache();
  document.body.replaceChildren(); document.body.className = ''; localStorage.clear();
  delete (globalThis as {_demoLoadingProfileId?: unknown})._demoLoadingProfileId;
  vi.restoreAllMocks();
});

it.each(['profile', 'data', 'route away/back', 'literal view', 'main replacement', 'viewport', 'configuration'] as const)(
  'does not construct or publish after %s changes during first-party import', async kind => {
    const pending = deferred<Composition>(), create = vi.fn(() => {throw Error('retired constructor ran');});
    boundary.load.mockReturnValue(pending.promise);
    runtime.configureProductionDashboard();
    const navigation = runtime.navigate('dashboard', data);
    expect(boundary.load).toHaveBeenCalledTimes(1);
    expect(runtime.viewsComposition.dashboardView).toBeUndefined();
    if (kind === 'profile') state.currentProfile = 'next-profile';
    if (kind === 'data') state.importedData = createDefaultProfileData();
    if (kind === 'route away/back') {recordRouteChange(); state.currentView = 'labs'; recordRouteChange(); state.currentView = 'dashboard';}
    if (kind === 'literal view') state.currentView = 'labs';
    if (kind === 'main replacement') document.getElementById('main-content')!.outerHTML = '<main id="main-content">New host</main>';
    if (kind === 'viewport') boundary.mobile = true;
    if (kind === 'configuration') {runtime.retireProductionDashboard(); runtime.configureProductionDashboard();}
    const ownedHTML = document.getElementById('main-content')!.innerHTML;
    pending.resolve({createDashboardViewComposition: create});
    await expect(navigation).resolves.toBe(false);
    expect(create).not.toHaveBeenCalled();
    expect(boundary.lens).not.toHaveBeenCalled();
    expect(boundary.tips).not.toHaveBeenCalled();
    expect(runtime.viewsComposition.dashboardView).toBeUndefined();
    expect(document.getElementById('main-content')!.innerHTML).toBe(ownedHTML);
  },
);

it.each(['new modal', 'modal opened then removed', 'outside focus', 'newer request'] as const)(
  'does not open a cold picker after %s takes ownership', async kind => {
    const pending = deferred<Composition>(), create = vi.fn(() => {throw Error('retired picker constructor ran');});
    boundary.load.mockReturnValue(pending.promise);
    runtime.configureProductionDashboard();
    const first = runtime.openDashboardWidgetPicker();
    if (kind === 'new modal' || kind === 'modal opened then removed') {
      const modal = document.createElement('div'); modal.className = 'modal-overlay show';
      modal.innerHTML = '<div class="modal"><button>New modal</button></div>'; document.body.append(modal);
      if (kind === 'modal opened then removed') modal.remove();
    }
    if (kind === 'outside focus') document.getElementById('outside')!.focus();
    if (kind === 'newer request') runtime.showDashboard({dates: [], categories: {}});
    await Promise.resolve();
    pending.resolve({createDashboardViewComposition: create});
    await expect(first).resolves.toBe(false);
    expect(create).not.toHaveBeenCalled();
    expect(document.getElementById('dashboard-widget-picker-overlay')).toBeNull();
    expect(runtime.viewsComposition.dashboardView).toBeUndefined();
  },
);

it('keeps real Desktop/Mobile empty and demo Welcome synchronous, then prepares a saved Lens and one shared real controls owner', async () => {
  const pending = deferred<Composition>(), construct = vi.fn(createDashboardViewComposition);
  boundary.load.mockReturnValue(pending.promise);
  boundary.lens.mockResolvedValue({createLensPageHandlers});
  runtime.configureProductionDashboard();
  for (const mobile of [false, true]) {
    boundary.mobile = mobile;
    expect(runtime.showDashboard({dates: [], categories: {}})).toBeUndefined();
    expect(document.querySelector('.welcome-hero, .welcome-primary')).not.toBeNull();
    expect(boundary.load).not.toHaveBeenCalled();
    expect(boundary.lens).not.toHaveBeenCalled();
    expect(boundary.tips).not.toHaveBeenCalled();
    expect(runtime.viewsComposition.dashboardView).toBeUndefined();
  }
  (globalThis as {_demoLoadingProfileId?: unknown})._demoLoadingProfileId = state.currentProfile;
  expect(runtime.showDashboard({dates: [], categories: {}})).toBeUndefined();
  expect(document.getElementById('main-content')!.getAttribute('aria-busy')).toBe('true');
  expect(boundary.load).not.toHaveBeenCalled();
  delete (globalThis as {_demoLoadingProfileId?: unknown})._demoLoadingProfileId;

  const retired = runtime.navigate('dashboard', data);
  const savedLens = runtime.navigate('labs');
  expect(construct).not.toHaveBeenCalled();
  expect(boundary.lens).not.toHaveBeenCalled();
  pending.resolve({createDashboardViewComposition: construct});
  await expect(retired).resolves.toBe(false);
  await savedLens;
  expect(construct).toHaveBeenCalledTimes(1);
  expect(boundary.lens).toHaveBeenCalledTimes(1);
  expect(document.getElementById('main-content')!.textContent).toContain('Labs');
  const resident = runtime.viewsComposition.dashboardView as ReturnType<typeof createDashboardViewComposition>;
  expect(resident).toBeDefined();
  expect(construct.mock.calls[0]![1]).toEqual({quickMarkers: expect.any(Object), deferRuntimeWiring: true});
  const ids = resident.getAvailableDashboardFixedWidgetIds();
  localStorage.setItem(dashboardWidgetStorageKey(), JSON.stringify({order: ids, hidden: ids.filter(id => id !== 'quick-markers')}));
  runtime.toggleDashboardQuickMarkerPin('lipids_apoB');
  expect(JSON.parse(localStorage.getItem(profileStorageKey(state.currentProfile, 'dashboardQuickMarkerPinsV1'))!)).toEqual(['lipids_apoB']);

  boundary.mobile = false;
  await runtime.navigate('dashboard', data);
  expect(boundary.desktop).toHaveBeenCalledTimes(1);
  expect(boundary.hydrateDesktop).toHaveBeenCalledTimes(1);
  expect(boundary.desktop.mock.calls[0]![0].widgets).toHaveLength(1);
  const quick = boundary.desktop.mock.calls[0]![0].widgets[0]!.content;
  expect(quick?.kind).toBe('quick-markers');
  if (quick?.kind !== 'quick-markers') throw new Error('Expected the real pinned Quick Markers projection');
  expect(quick.view.rows).toEqual([expect.objectContaining({
    id: 'lipids_apoB', name: 'ApoB', value: '0.800', unit: 'g/L', reason: 'Pinned · manual pick',
  })]);
  expect(document.querySelector('.actual-projection-receiver')).not.toBeNull();
  boundary.mobile = true;
  await runtime.navigate('dashboard', data);
  expect(boundary.mobileRender).toHaveBeenCalledTimes(1);
  expect(boundary.hydrateMobile).toHaveBeenCalledTimes(1);
  expect(document.querySelector('.actual-mobile-receiver')).not.toBeNull();
  expect(runtime.viewsComposition.dashboardView).toBe(resident);
  expect(construct).toHaveBeenCalledTimes(1);
  runtime.toggleDashboardOrganizeMode(true);
  expect(resident.isDashboardOrganizeMode()).toBe(true);
  runtime.toggleDashboardOrganizeMode(false);
  expect(resident.isDashboardOrganizeMode()).toBe(false);
});

it('prepares a saved Light route before its genuine Lens preference callback is used', async () => {
  const pending = deferred<Composition>(), construct = vi.fn(createDashboardViewComposition);
  boundary.load.mockReturnValue(pending.promise);
  boundary.light.mockImplementation(() => {
    const view = getLensWidgetChrome('quick-markers', 'Quick markers', '', 'full', {dashboardId: 'quick-markers'});
    document.getElementById('main-content')!.textContent = JSON.stringify(view);
  });
  runtime.configureProductionDashboard();
  const navigation = runtime.navigate('light');
  expect(boundary.light).not.toHaveBeenCalled();
  boundary.mobile = true;
  for (const listener of boundary.listeners) listener();
  expect(boundary.load).toHaveBeenCalledTimes(1);
  pending.resolve({createDashboardViewComposition: construct});
  await navigation;
  expect(construct).toHaveBeenCalledTimes(1);
  expect(boundary.light).toHaveBeenCalledTimes(1);
  expect(boundary.lens).not.toHaveBeenCalled();
  expect(boundary.tips).not.toHaveBeenCalled();
  expect(document.getElementById('main-content')!.textContent).toContain('Quick markers');
});

it('uses the actual registered breakpoint callback to replace a held Desktop composition request with one genuine Mobile owner', async () => {
  const pending = deferred<Composition>(), construct = vi.fn(createDashboardViewComposition);
  boundary.load.mockReturnValue(pending.promise);
  state.importedData.entries = [{date: '2026-01-01', markers: {'lipids.apoB': 0.8}}];
  state.rangeMode = 'reference'; state.dateRangeFilter = 'all';
  invalidateActiveDataCache();
  localStorage.setItem(dashboardWidgetStorageKey(), JSON.stringify({
    order: ['quick-markers'], hidden: DASHBOARD_WIDGET_DEFAULT_IDS.filter(id => id !== 'quick-markers'),
  }));
  runtime.configureProductionDashboard();
  state.currentView = 'labs';
  runtime.toggleDashboardQuickMarkerPin('lipids_apoB');
  const first = runtime.navigate('dashboard');
  let firstSettled = false;
  void Promise.resolve(first).then(() => {firstSettled = true;});
  expect(boundary.load).toHaveBeenCalledTimes(1);
  expect(boundary.listeners).toHaveLength(1);
  expect(construct).not.toHaveBeenCalled();
  expect(boundary.desktop).not.toHaveBeenCalled();
  expect(boundary.mobileRender).not.toHaveBeenCalled();
  boundary.mobile = true;
  for (const listener of boundary.listeners) listener();
  expect(boundary.load).toHaveBeenCalledTimes(2);
  await Promise.resolve();
  expect(firstSettled).toBe(false);
  expect(construct).not.toHaveBeenCalled();
  expect(boundary.hydrateMobile).not.toHaveBeenCalled();
  pending.resolve({createDashboardViewComposition: construct});
  await expect(first).resolves.toBe(false);
  await vi.waitFor(() => expect(boundary.hydrateMobile).toHaveBeenCalledTimes(1));
  expect(construct).toHaveBeenCalledTimes(1);
  expect(boundary.desktop).not.toHaveBeenCalled();
  expect(boundary.hydrateDesktop).not.toHaveBeenCalled();
  expect(boundary.mobileRender).toHaveBeenCalledTimes(1);
  expect(boundary.mobileRender.mock.calls[0]![0].stack.count).toBe('1');
  expect(document.querySelector('.actual-mobile-receiver')).not.toBeNull();
  expect(runtime.viewsComposition.dashboardView).toBe(construct.mock.results[0]!.value);
});

it('finishes a saved Labs route across the actual breakpoint callback without a Dashboard-only replacement', async () => {
  const pending = deferred<Composition>(), construct = vi.fn(createDashboardViewComposition);
  boundary.load.mockReturnValue(pending.promise);
  boundary.lens.mockResolvedValue({createLensPageHandlers});
  runtime.configureProductionDashboard();
  const navigation = runtime.navigate('labs');
  expect(construct).not.toHaveBeenCalled();
  boundary.mobile = true;
  for (const listener of boundary.listeners) listener();
  expect(boundary.load).toHaveBeenCalledTimes(1);
  pending.resolve({createDashboardViewComposition: construct});
  await navigation;
  expect(construct).toHaveBeenCalledTimes(1);
  expect(boundary.lens).toHaveBeenCalledTimes(1);
  expect(document.getElementById('main-content')!.textContent).toContain('Labs');
  expect(document.getElementById('main-content')!.textContent).not.toContain('Loading Labs');
  expect(boundary.desktop).not.toHaveBeenCalled();
  expect(boundary.mobileRender).not.toHaveBeenCalled();
});
