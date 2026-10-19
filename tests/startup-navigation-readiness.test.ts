// @vitest-environment jsdom
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {afterEach, expect, it, vi} from 'vitest';

type Composition = typeof import('../js/dashboard-view-composition.js');
type Desktop = typeof import('../js/desktop-dashboard-renderer.js');
type Mobile = typeof import('../js/mobile-dashboard-renderer.js');
const boundary = vi.hoisted(() => {
  const value = {
    mobile: false, listeners: [] as (() => void)[],
    composition: vi.fn<() => Promise<Composition>>(),
    desktop: null as Desktop | null, mobileRenderer: null as Mobile | null,
    loadDesktop: vi.fn<() => Promise<Desktop>>(), loadMobile: vi.fn<() => Promise<Mobile>>(),
    restoreDraft: vi.fn<() => Promise<void>>(), extension: vi.fn(),
  };
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
  loadDashboardComposition: () => boundary.composition(),
}));
vi.mock('../js/dashboard-renderer-loader.js', () => ({
  getLoadedDesktopDashboardRenderer: () => boundary.desktop, loadDesktopDashboardRenderer: () => boundary.loadDesktop(),
  getLoadedMobileDashboardRenderer: () => boundary.mobileRenderer, loadMobileDashboardRenderer: () => boundary.loadMobile(),
}));
vi.mock('../js/startup-foundation.js', () => ({initializeStartupFoundation: vi.fn(async () => {})}));
vi.mock('../js/startup-profile.js', () => ({initializeProfileData: vi.fn(async () => {}), applyProfileDisplayState: vi.fn()}));
vi.mock('../js/startup-oauth-callbacks.js', () => ({handleStartupOAuthCallbacks: vi.fn(async () => {})}));
vi.mock('../js/startup-maintenance.js', () => ({runPostProfileStartupMaintenance: vi.fn()}));
vi.mock('../js/app-event-listeners.js', () => ({installGlobalEventListeners: vi.fn(), registerAppRefreshCallback: vi.fn()}));
vi.mock('../js/import-loader.js', async original => ({
  ...await original<typeof import('../js/import-loader.js')>(), restorePendingImportReviewDraft: () => boundary.restoreDraft(),
}));
vi.mock('../js/app-extension-runtime.js', async original => ({
  ...await original<typeof import('../js/app-extension-runtime.js')>(), runAppExtensionStartup: () => boundary.extension(),
}));
vi.mock('../js/sync-configure.js', () => ({configureSyncModules: vi.fn()}));
vi.mock('../js/sync.js', async original => ({
  ...await original<typeof import('../js/sync.js')>(),
  configureSyncLifecycleDeps: vi.fn(), primeSyncState: vi.fn(), initSync: vi.fn(async () => {}), renderSyncIndicator: vi.fn(),
}));
vi.mock('../js/health-data-loader.js', async original => ({
  ...await original<typeof import('../js/health-data-loader.js')>(),
  isDashboardHealthDataReady: () => true, loadDashboardHealthDataModules: vi.fn(),
  loadContextHealthDots: vi.fn(), loadContextCardTips: vi.fn(), ensureDnaTablesForPersistedState: vi.fn(),
}));
vi.mock('../js/commit-hash.js', () => ({loadCommitHash: vi.fn()}));
vi.mock('../js/nav.js', async original => ({
  ...await original<typeof import('../js/nav.js')>(), buildSidebar: vi.fn(), renderProfileDropdown: vi.fn(),
}));
vi.mock('../js/legal-consent.js', async original => ({
  ...await original<typeof import('../js/legal-consent.js')>(), maybeShowLegalConsentGate: () => true,
}));
vi.mock('../js/import-file-input.js', () => ({bindImportFileInput: vi.fn()}));

import * as runtime from '../js/views-runtime.js';
import {configureStartupUIDeps, configureStartupNavigationCompletion, renderStartupUI} from '../js/startup-ui.js';
import {startApp} from '../js/startup-orchestrator.js';
import {state} from '../js/state.js';
import {createDefaultProfileData, profileStorageKey} from '../js/profile.js';
import {getActiveData, invalidateActiveDataCache} from '../js/data.js';
import {DASHBOARD_WIDGET_DEFAULT_IDS, dashboardWidgetStorageKey} from '../js/dashboard-widgets.js';
import {createDashboardViewComposition} from '../js/dashboard-view-composition.js';
import * as desktop from '../js/desktop-dashboard-renderer.js';
import * as mobile from '../js/mobile-dashboard-renderer.js';
import {disposeDashboardPage} from '../js/dashboard-page-owner.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const originalState = {currentView: state.currentView, currentProfile: state.currentProfile, importedData: state.importedData,
  nutritionSummary: state.nutritionSummary, profileSex: state.profileSex, chatHistory: state.chatHistory,
  rangeMode: state.rangeMode, dateRangeFilter: state.dateRangeFilter};
afterEach(async () => {
  disposeDashboardPage(); runtime.retireProductionDashboard();
  // Hydration starts real catalog imports outside the navigation-ready boundary.
  // Settle that module graph before restoring globals or ending the environment.
  await vi.dynamicImportSettled();
  Object.assign(runtime.viewsComposition, {dashboardView: undefined, lensPageHandlers: undefined, recommendationActions: undefined});
  Object.assign(state, originalState); invalidateActiveDataCache();
  configureStartupNavigationCompletion();
  document.body.replaceChildren(); document.body.className = ''; localStorage.clear();
  delete document.documentElement.dataset.appReady;
  vi.restoreAllMocks();
});
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {resolve = yes; reject = no;});
  return {promise, resolve, reject};
}
function declaration(source: string, name: string) {
  const start = source.indexOf('export function ' + name + '(');
  expect(start).toBeGreaterThanOrEqual(0);
  const end = source.indexOf('\n}\n', start) + 3;
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

it('keeps original injected startup configuration byte-exact and changes only the final optional completion port', () => {
  const bytes = fs.readFileSync(path.join(ROOT, 'tests/fixtures/dashboard-production-boundary/native-startup-ui.json'), 'utf8');
  expect(createHash('sha256').update(bytes).digest('hex')).toBe('da1722a18d4b5a1b470bb724b0bd3de9b2da40a4f4dc43d6709174be67ba5210');
  const native = JSON.parse(bytes) as {configure: string; render: string};
  const source = fs.readFileSync(path.join(ROOT, 'js/startup-ui.ts'), 'utf8');
  expect(declaration(source, 'configureStartupUIDeps')).toBe(native.configure);
  const current = declaration(source, 'renderStartupUI');
  const portReturn = '  return startupNavigationCompletion ? startupNavigationCompletion.completeInitial(navigation) : navigation;';
  expect(current.split(portReturn)).toHaveLength(2);
  expect(current.replace(portReturn, '  return navigation;')).toBe(native.render);
});

it('keeps empty and opaque injected startup returns synchronous when the optional first-party port is absent', () => {
  document.body.innerHTML = '<main id="main-content"></main>';
  vi.spyOn(globalThis, 'requestAnimationFrame').mockReturnValue(0);
  const opaque = {}, navigate = vi.fn(() => opaque);
  const previous = configureStartupUIDeps({getInitialView: () => 'dashboard', navigate});
  expect(renderStartupUI()).toBe(opaque);
  expect(navigate.mock.calls).toEqual([['dashboard']]);
  configureStartupUIDeps({navigate: () => undefined});
  expect(renderStartupUI()).toBeUndefined();
  configureStartupUIDeps(previous);
});

it('keeps appReady behind genuine replacement hydration and navigation begun during import-draft restoration', async () => {
  const originalDeps = configureStartupUIDeps({getInitialView: () => 'dashboard', navigate: runtime.navigate});
  configureStartupNavigationCompletion({
    completeInitial: runtime.completeProductionStartupNavigation, drain: runtime.drainProductionStartupNavigation,
  });
  Object.assign(state, {currentView: 'labs', currentProfile: 'startup-route-readiness', importedData: createDefaultProfileData(),
    nutritionSummary: null, profileSex: null, chatHistory: [], rangeMode: 'reference', dateRangeFilter: 'all'});
  state.importedData.entries = [{date: '2026-01-01', markers: {'lipids.apoB': 0.8}}];
  invalidateActiveDataCache();
  expect(getActiveData().dates).toEqual(['2026-01-01']);
  document.body.innerHTML = '<main id="main-content"></main><div id="notification-container"></div>';
  localStorage.setItem(profileStorageKey(state.currentProfile, 'emptyTour'), 'complete');
  localStorage.setItem(dashboardWidgetStorageKey(), JSON.stringify({
    order: ['quick-markers'], hidden: DASHBOARD_WIDGET_DEFAULT_IDS.filter(id => id !== 'quick-markers'),
  }));
  const construct = vi.fn(createDashboardViewComposition);
  boundary.composition.mockResolvedValue({createDashboardViewComposition: construct});
  const desktopRequest = deferred<Desktop>(), mobileRequest = deferred<Mobile>(), draft = deferred<void>();
  boundary.loadDesktop.mockReturnValue(desktopRequest.promise); boundary.loadMobile.mockReturnValue(mobileRequest.promise);
  boundary.restoreDraft.mockReturnValue(draft.promise);
  const desktopModule: Desktop = {renderDesktopDashboardPage: vi.fn(desktop.renderDesktopDashboardPage),
    hydrateDesktopDashboardPage: vi.fn(desktop.hydrateDesktopDashboardPage)};
  const mobileModule: Mobile = {renderMobileDashboardPage: vi.fn(mobile.renderMobileDashboardPage),
    hydrateMobileDashboardPage: vi.fn(mobile.hydrateMobileDashboardPage)};
  const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  vi.spyOn(document, 'readyState', 'get').mockReturnValue('complete');
  vi.spyOn(globalThis, 'requestAnimationFrame').mockReturnValue(0);
  runtime.configureProductionDashboard();
  runtime.toggleDashboardQuickMarkerPin('lipids_apoB');
  startApp();
  await vi.waitFor(() => expect(boundary.loadDesktop).toHaveBeenCalledTimes(1));
  expect(construct).toHaveBeenCalledTimes(1);
  expect(desktopModule.renderDesktopDashboardPage).not.toHaveBeenCalled();
  expect(document.documentElement.dataset.appReady).toBeUndefined();
  expect(boundary.extension).not.toHaveBeenCalled();
  expect(boundary.restoreDraft).not.toHaveBeenCalled();

  expect(boundary.listeners).toHaveLength(1);
  boundary.mobile = true;
  for (const listener of boundary.listeners) listener();
  await vi.waitFor(() => expect(boundary.loadMobile).toHaveBeenCalledTimes(1));
  expect(document.documentElement.dataset.appReady).toBeUndefined();
  expect(boundary.extension).not.toHaveBeenCalled();
  boundary.mobileRenderer = mobileModule;
  mobileRequest.resolve(mobileModule);
  await vi.waitFor(() => expect(boundary.restoreDraft).toHaveBeenCalledTimes(1));
  expect(mobileModule.renderMobileDashboardPage).toHaveBeenCalledTimes(1);
  expect(mobileModule.hydrateMobileDashboardPage).toHaveBeenCalledTimes(1);
  expect(document.querySelector('.m-shell')?.textContent).toContain('0.800');
  expect(desktopModule.renderDesktopDashboardPage).not.toHaveBeenCalled();
  expect(boundary.extension).toHaveBeenCalledTimes(1);
  expect(document.documentElement.dataset.appReady).toBeUndefined();

  // The initial Desktop import still has not settled. The replacement Mobile
  // route nevertheless reached the later bootstrap stage. A second real
  // breakpoint now starts another owner while draft restoration is pending.
  boundary.mobile = false;
  for (const listener of boundary.listeners) listener();
  await vi.waitFor(() => expect(boundary.loadDesktop).toHaveBeenCalledTimes(2));
  draft.resolve();
  for (let tick = 0; tick < 10; tick++) await Promise.resolve();
  expect(document.documentElement.dataset.appReady).toBeUndefined();
  expect(desktopModule.hydrateDesktopDashboardPage).not.toHaveBeenCalled();
  boundary.desktop = desktopModule;
  desktopRequest.resolve(desktopModule);
  await vi.waitFor(() => expect(document.documentElement.dataset.appReady).toBe(''));
  expect(desktopModule.renderDesktopDashboardPage).toHaveBeenCalledTimes(1);
  expect(desktopModule.hydrateDesktopDashboardPage).toHaveBeenCalledTimes(1);
  expect(document.querySelector('.dashboard-widgets')?.textContent).toContain('0.800');
  expect(document.querySelector('.m-shell')).toBeNull();
  expect(construct).toHaveBeenCalledTimes(1);
  expect(errors).not.toHaveBeenCalled();

  // The completed startup window must not observe later public navigation
  // Promises or consume their live failures. An explicit caller owns this one.
  const resident = runtime.viewsComposition.dashboardView as ReturnType<typeof createDashboardViewComposition>;
  const later = deferred<undefined>(), failure = Error('post-ready live navigation');
  const then = vi.spyOn(later.promise, 'then');
  const originalShowDashboard = resident.showDashboard;
  let showCalls = 0;
  // Vitest function mocks observe returned Promises for settledResults. Use a
  // plain controlled function so only production observation can reach `then`.
  resident.showDashboard = () => {showCalls++; return later.promise;};
  try {
    expect(runtime.navigate('dashboard', getActiveData())).toBe(later.promise);
    expect(showCalls).toBe(1);
    expect(then).not.toHaveBeenCalled();
    expect(runtime.drainProductionStartupNavigation()).toBeUndefined();
    const received = Promise.prototype.then.call(later.promise, () => undefined, (error: unknown) => error);
    later.reject(failure);
    await expect(received).resolves.toBe(failure);
    expect(then).not.toHaveBeenCalled();
  } finally {
    resident.showDashboard = originalShowDashboard;
  }
  configureStartupUIDeps(originalDeps);
});
