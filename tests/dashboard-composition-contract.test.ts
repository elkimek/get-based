// @vitest-environment jsdom
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {afterEach, expect, it, vi} from 'vitest';
import * as facade from '../js/views.js';
import * as runtime from '../js/views-runtime.js';
import {createDashboardQuickMarkerCore} from '../js/dashboard-quick-marker-core.js';
import {createDashboardLabWidgetRenderers} from '../js/dashboard-lab-widget-renderers.js';
import {createDashboardWidgetRenderers} from '../js/dashboard-widget-renderers.js';
import {createDashboardViewComposition} from '../js/dashboard-view-composition.js';
import {state} from '../js/state.js';
import {profileStorageKey} from '../js/profile.js';
import {invalidateActiveDataCache} from '../js/data.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file: string) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const fixtureBytes = read('tests/fixtures/dashboard-production-boundary/native-configure.json');
const native = JSON.parse(fixtureBytes) as {source: string; quickPinSource: string; exports: string[]};
const sha = (source: string) => createHash('sha256').update(source).digest('hex');
const originalState = {currentProfile: state.currentProfile, currentView: state.currentView, importedData: state.importedData};
afterEach(() => {
  runtime.retireProductionDashboard();
  runtime.viewsComposition.dashboardView = undefined;
  runtime.viewsComposition.lensPageHandlers = undefined;
  runtime.viewsComposition.recommendationActions = undefined;
  Object.assign(state, originalState);
  localStorage.clear();
  invalidateActiveDataCache();
  vi.restoreAllMocks();
});

function originalConfigure(source: string) {
  const start = source.indexOf('export function configureDashboardViewFactory(');
  expect(start).toBeGreaterThan(0);
  let body = source.slice(start);
  expect(body.endsWith('\n')).toBe(true);
  expect(body.match(/^  retireProductionDashboard\(\);$/gm)).toHaveLength(1);
  body = body.replace('  retireProductionDashboard();\n', '');
  return body.replace(/\bviewsComposition\.(dashboardView|lensPageHandlers|recommendationActions)\b/g, '$1');
}

it('pins the independently recovered native constructor, pin algorithm and full original export list', () => {
  expect(sha(fixtureBytes)).toBe('b793335dfa92646b030cb3a9e0f26e50f6fc6c6c5c88d514be81b6947c136b64');
  expect(sha(native.source)).toBe('21dba9905ee22a5e90747e71fb6d54417bc030eee3c79ae1574d9f18d7466bd4');
  expect(sha(native.quickPinSource)).toBe('0e3cfb40264fcab6b63dc81d571dd8b8245e498b3995d97c75dcc8e9180a4a43');
  expect(originalConfigure(read('js/views.ts'))).toBe(native.source);
  expect(read('js/dashboard-quick-marker-core.ts')).toContain(native.quickPinSource);
  expect(Object.keys(facade).sort()).toEqual([...native.exports].sort());
  for (const name of native.exports.filter(name => name !== 'configureDashboardViewFactory')) {
    expect((facade as Record<string, unknown>)[name], name).toBe((runtime as Record<string, unknown>)[name]);
  }
  expect(createDashboardViewComposition.length).toBe(1);
  expect(createDashboardWidgetRenderers.length).toBe(1);
  expect(createDashboardLabWidgetRenderers.length).toBe(1);
});

it('rejects missing retirement, reordered native reads or a changed partial-assignment target', () => {
  const source = read('js/views.ts');
  expect(() => originalConfigure(source.replace('  retireProductionDashboard();\n', ''))).toThrow();
  for (const corrupted of [
    source.replace('viewsComposition.lensPageHandlers =', 'viewsComposition.recommendationActions ='),
    source.replace(').buildDashboardWidgetContext,', ').projectLabsPriorityBanner,'),
    source.replace('return viewsComposition.dashboardView;', 'return undefined;'),
  ]) expect(originalConfigure(corrupted)).not.toBe(native.source);
});

it('executes the original opaque factory once synchronously with exact native callback/getter order', () => {
  const reads: string[] = [], calls: unknown[][] = [];
  const object = new Proxy({}, {get(_target, property) {
    reads.push(String(property));
    return (...args: unknown[]) => {calls.push([property, ...args]); return property;};
  }});
  const factory = vi.fn((deps: unknown) => {
    expect(Object.keys(deps as object)).toEqual([
      'navigate', 'showRecommendations', 'showEmojiPicker', 'renderFocusCard', 'loadFocusCard',
      'projectOnboardingBanner', 'projectAIConnectionReminder',
    ]);
    return object;
  });
  expect(facade.configureDashboardViewFactory(factory)).toBe(object);
  expect(factory).toHaveBeenCalledTimes(1);
  const originalReads = [...native.source.matchAll(/\(dashboardView as DashboardOperations\)\.(\w+)/g)].map(match => match[1]);
  expect(reads).toEqual(originalReads);
  expect(calls).toEqual([]);
  expect(runtime.viewsComposition.lensPageHandlers).toBeDefined();
  expect(runtime.viewsComposition.recommendationActions).toBeDefined();
  expect(facade.configureDashboardViewFactory(factory)).toBe(object);
  expect(factory).toHaveBeenCalledTimes(1);
  expect(reads).toEqual(originalReads);
  expect(() => facade.configureDashboardViewFactory(null)).toThrow('configureDashboardViewFactory requires a dashboard view factory');
  expect(facade.toggleDashboardOrganizeMode(true)).toBe('toggleDashboardOrganizeMode');
  expect(calls).toEqual([['toggleDashboardOrganizeMode', true]]);
});

it('preserves each original getter fault and the exact partial assignment stage', () => {
  const fields = [...native.source.matchAll(/\(dashboardView as DashboardOperations\)\.(\w+)/g)].map(match => match[1]!);
  for (let stop = 0; stop < fields.length; stop++) {
    runtime.viewsComposition.dashboardView = undefined;
    runtime.viewsComposition.lensPageHandlers = undefined;
    runtime.viewsComposition.recommendationActions = undefined;
    const reads: string[] = [], failure = Error('getter ' + stop);
    const object = new Proxy({}, {get(_target, property) {
      reads.push(String(property));
      if (reads.length === stop + 1) throw failure;
      return () => undefined;
    }});
    const factory = vi.fn(() => object);
    expect(() => facade.configureDashboardViewFactory(factory)).toThrow(failure);
    expect(reads).toEqual(fields.slice(0, stop + 1));
    expect(runtime.viewsComposition.dashboardView).toBe(object);
    // The first thirteen getter reads form the Lens callback snapshot. Later
    // faults happen in Tips construction, after the Lens owner was assigned.
    const lensReadCount = native.source.slice(0, native.source.indexOf('  recommendationActions ='))
      .match(/\(dashboardView as DashboardOperations\)\./g)!.length;
    expect(runtime.viewsComposition.lensPageHandlers !== undefined).toBe(stop >= lensReadCount);
    expect(runtime.viewsComposition.recommendationActions).toBeUndefined();
    expect(facade.configureDashboardViewFactory(factory)).toBe(object);
    expect(factory).toHaveBeenCalledTimes(1);
  }
});

it('uses the unchanged profile-scoped pin algorithm before any body is resident', () => {
  state.currentProfile = 'composition-pin-core';
  state.currentView = 'labs';
  (state as {importedData: unknown}).importedData = {};
  invalidateActiveDataCache();
  const rerender = vi.fn(), core = createDashboardQuickMarkerCore(rerender);
  const key = profileStorageKey(state.currentProfile, 'dashboardQuickMarkerPinsV1');
  localStorage.setItem(key, '{malformed');
  expect(core.getDashboardQuickMarkerPins()).toEqual([]);
  localStorage.setItem(key, JSON.stringify(['lipids_apoB', 'lipids_apoB', 'bad"<', 'lipids_ldl',
    'vitamins_vitaminD', 'thyroid_tsh', 'iron_ferritin']));
  expect(core.getDashboardQuickMarkerPins()).toEqual(['lipids_apoB', 'lipids_ldl', 'vitamins_vitaminD', 'thyroid_tsh']);
  localStorage.setItem(key, '[]');
  core.toggleDashboardQuickMarkerPin('lipids_apoB');
  expect(core.isDashboardQuickMarkerPinned('lipids_apoB')).toBe(true);
  expect(JSON.parse(localStorage.getItem(key)!)).toEqual(['lipids_apoB']);
  core.toggleDashboardQuickMarkerPin('lipids_apoB');
  expect(JSON.parse(localStorage.getItem(key)!)).toEqual([]);
  core.toggleDashboardQuickMarkerPin('invalid\"<');
  expect(JSON.parse(localStorage.getItem(key)!)).toEqual([]);
  expect(rerender).not.toHaveBeenCalled();
  state.currentView = 'dashboard';
  core.toggleDashboardQuickMarkerPin('lipids_apoB');
  expect(rerender).toHaveBeenCalledTimes(1);
  state.currentProfile = 'other-profile';
  expect(core.getDashboardQuickMarkerPins()).toEqual([]);
  expect(JSON.parse(localStorage.getItem(key)!)).toEqual(['lipids_apoB']);
});

it('keeps actual first-party imports cold and publishes native event handlers only after the real body exists', () => {
  const boot = read('js/app-shell-hooks.ts'), runtimeSource = read('js/views-runtime.ts');
  expect(boot).not.toContain("from './dashboard-view-composition.js'");
  expect(boot).toContain('configureProductionDashboard();');
  for (const file of ['main.ts', 'app-shell-hooks.ts', 'app-ui-shell-modules.ts', 'light-env-shell-hooks.ts',
    'light-channel-view-ui-hooks.ts', 'sun-session-ui-hooks.ts', 'light-tools-ui-hooks.ts', 'light-page-view-ui-hooks.ts']) {
    expect(read('js/' + file), file).not.toContain("'./views.js'");
    expect(read('js/' + file), file).toContain("'./views-runtime.js'");
  }
  expect(runtimeSource).not.toMatch(/^import \{[^\n]*createLensPageHandlers/m);
  expect(runtimeSource).not.toMatch(/^import \{[^\n]*createRecommendationActions/m);
  expect(runtimeSource).not.toContain("from './dashboard-view-composition.js'");
  for (const name of ['startDashboardWidgetDrag', 'allowDashboardWidgetDrop', 'dropDashboardWidget']) {
    const declaration = runtimeSource.split('\n').find(line => line.startsWith('export const ' + name + ' ='))!;
    expect(declaration).toContain('=> getDashboardView().' + name + '(...args);');
    expect(declaration).not.toContain('withProductionDashboard');
  }
});
