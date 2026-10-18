// @vitest-environment jsdom
import {afterEach, beforeEach, expect, it, vi} from 'vitest';
type Tips = typeof import('../js/recommendation-actions.js');
const boundary = vi.hoisted(() => {
  const set = vi.fn<(...args: unknown[]) => unknown>();
  return {
  load: vi.fn<() => Promise<Tips>>(), set, prepare: null as (() => Promise<void>) | null,
  view: {
    buildDashboardWidgetContext: (_data: unknown) => ({}), getCachedRecommendationsCatalog: () => null,
    getGlobalRecommendationCandidates: () => [], setRecommendationState: (...args: unknown[]) => set(...args),
  },
  };
});
vi.mock('../js/dashboard-view-shell.js', () => ({
  createProductionDashboardShell: (_deps: unknown, publish: (view: typeof boundary.view) => void) => ({
    prepare: async (current: () => boolean) => {
      if (boundary.prepare) await boundary.prepare();
      if (!current()) return undefined;
      publish(boundary.view);
      return boundary.view;
    },
  }),
}));
vi.mock('../js/dashboard-composition-loader.js', async original => ({
  ...await original<typeof import('../js/dashboard-composition-loader.js')>(),
  loadDashboardRecommendations: () => boundary.load(),
}));
import * as runtime from '../js/views-runtime.js';
import {createRecommendationActions} from '../js/recommendation-actions.js';
import {createDashboardCompositionLoader, createDashboardRecommendationLoader} from '../js/dashboard-composition-loader.js';
import {state} from '../js/state.js';
import {recordRouteChange} from '../js/route-lifecycle.js';
import {createDefaultProfileData} from '../js/profile.js';

function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {resolve = yes; reject = no;});
  return {promise, resolve, reject};
}
const previous = {currentView: state.currentView, currentProfile: state.currentProfile, importedData: state.importedData};
beforeEach(() => {
  runtime.retireProductionDashboard();
  Object.assign(runtime.viewsComposition, {dashboardView: undefined, lensPageHandlers: undefined, recommendationActions: undefined});
  Object.assign(state, {currentView: 'recommendations', currentProfile: 'cold-tips', importedData: createDefaultProfileData()});
  document.body.innerHTML = '<main id="main-content"></main><div id="notification-container"></div>';
  boundary.load.mockReset(); boundary.set.mockReset(); boundary.prepare = null;
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  runtime.retireProductionDashboard();
  Object.assign(runtime.viewsComposition, {dashboardView: undefined, lensPageHandlers: undefined, recommendationActions: undefined});
  Object.assign(state, previous); document.body.replaceChildren(); vi.restoreAllMocks();
});

it('preserves every independent Save/Dismiss command in click order during one held action import', async () => {
  const pending = deferred<Tips>();
  boundary.load.mockReturnValue(pending.promise);
  runtime.configureProductionDashboard();
  const first = runtime.saveRecommendation('first', false);
  const second = runtime.dismissRecommendation('second');
  const third = runtime.saveRecommendation('same');
  const fourth = runtime.dismissRecommendation('same', false);
  await Promise.resolve();
  expect(boundary.set).not.toHaveBeenCalled();
  expect(boundary.load).toHaveBeenCalledTimes(4);
  pending.resolve({createRecommendationActions});
  await Promise.all([first, second, third, fourth]);
  expect(boundary.set.mock.calls).toEqual([
    ['saved', 'first', false], ['dismissed', 'second', true],
    ['saved', 'same', true], ['dismissed', 'same', false],
  ]);
});

it.each(['profile', 'data', 'route', 'configuration', 'host'] as const)(
  'retires all pending domain commands after %s ownership changes', async kind => {
    const pending = deferred<Tips>();
    boundary.load.mockReturnValue(pending.promise);
    runtime.configureProductionDashboard();
    const first = runtime.saveRecommendation('first'), second = runtime.dismissRecommendation('second');
    await Promise.resolve();
    expect(boundary.load).toHaveBeenCalledTimes(2);
    if (kind === 'profile') state.currentProfile = 'other-profile';
    if (kind === 'data') state.importedData = createDefaultProfileData();
    if (kind === 'route') {recordRouteChange(); state.currentView = 'labs';}
    if (kind === 'configuration') runtime.retireProductionDashboard();
    if (kind === 'host') document.getElementById('main-content')!.outerHTML = '<main id="main-content">Other host</main>';
    pending.resolve({createRecommendationActions});
    await expect(first).resolves.toBe(false);
    await expect(second).resolves.toBe(false);
    expect(boundary.set).not.toHaveBeenCalled();
    expect(runtime.viewsComposition.recommendationActions).toBeUndefined();
  },
);

it.each(['composition', 'Tips actions'] as const)(
  'reports an owned %s import failure visibly, performs no optimistic write, and succeeds on the fixed retry', async kind => {
    const failure = Error('offline'), flags: boolean[] = [];
    if (kind === 'composition') {
      const loader = createDashboardCompositionLoader(retry => {
        flags.push(retry);
        return retry ? Promise.resolve({createDashboardViewComposition: () => {throw Error('unused test constructor');}})
          : Promise.reject(failure);
      });
      boundary.prepare = () => loader.load().then(() => undefined);
      boundary.load.mockResolvedValue({createRecommendationActions});
    } else {
      const loader = createDashboardRecommendationLoader(retry => {
        flags.push(retry);
        return retry ? Promise.resolve({createRecommendationActions}) : Promise.reject(failure);
      });
      boundary.load.mockImplementation(loader.load);
    }
    runtime.configureProductionDashboard();
    await expect(runtime.saveRecommendation('saved-after-retry')).resolves.toBe(false);
    expect(boundary.set).not.toHaveBeenCalled();
    expect(runtime.viewsComposition.recommendationActions).toBeUndefined();
    const alerts = document.querySelectorAll('#notification-container .notification-toast.error[role="alert"]');
    expect(alerts).toHaveLength(1);
    expect(alerts[0]!.textContent).toBe('✗ Tips could not be loaded. Please try again.');
    if (kind === 'composition') expect(boundary.load).not.toHaveBeenCalled();
    await runtime.saveRecommendation('saved-after-retry');
    expect(flags).toEqual([false, true]);
    expect(boundary.set.mock.calls).toEqual([['saved', 'saved-after-retry', true]]);
    expect(document.querySelectorAll('#notification-container [role="alert"]')).toHaveLength(1);
  },
);

it.each(['save', 'dismiss', 'open', 'discuss'] as const)(
  'makes a current cold %s failure visible without executing its domain action', async kind => {
    boundary.load.mockRejectedValue(Error('action import offline'));
    runtime.configureProductionDashboard();
    const result = kind === 'save' ? runtime.saveRecommendation('first')
      : kind === 'dismiss' ? runtime.dismissRecommendation('first')
        : kind === 'open' ? runtime.openRecommendationDetail('first') : runtime.discussRecommendation('first');
    await expect(result).resolves.toBe(false);
    expect(boundary.set).not.toHaveBeenCalled();
    expect(runtime.viewsComposition.recommendationActions).toBeUndefined();
    expect(document.getElementById('detail-modal')).toBeNull();
    expect(document.querySelectorAll('#notification-container .notification-toast.error[role="alert"]')).toHaveLength(1);
  },
);

it.each(['profile', 'data', 'route', 'configuration', 'host'] as const)(
  'does not notify or write for a rejected cold import after %s retires its owner', async kind => {
    const pending = deferred<Tips>();
    boundary.load.mockReturnValue(pending.promise);
    runtime.configureProductionDashboard();
    const first = runtime.saveRecommendation('stale');
    await Promise.resolve();
    expect(boundary.load).toHaveBeenCalledTimes(1);
    if (kind === 'profile') state.currentProfile = 'other-profile';
    if (kind === 'data') state.importedData = createDefaultProfileData();
    if (kind === 'route') {recordRouteChange(); state.currentView = 'labs';}
    if (kind === 'configuration') runtime.retireProductionDashboard();
    if (kind === 'host') document.getElementById('main-content')!.outerHTML = '<main id="main-content">Other host</main>';
    pending.reject(Error('stale offline request'));
    await expect(first).resolves.toBe(false);
    expect(boundary.set).not.toHaveBeenCalled();
    expect(document.querySelector('#notification-container [role="alert"]')).toBeNull();
    expect(runtime.viewsComposition.recommendationActions).toBeUndefined();
  },
);

it('preserves an accepted nonmodal command across viewport rotation during import', async () => {
  const pending = deferred<Tips>();
  boundary.load.mockReturnValue(pending.promise);
  const previousMatchMedia = Object.getOwnPropertyDescriptor(window, 'matchMedia');
  let mobile = false;
  Object.defineProperty(window, 'matchMedia', {configurable: true, value: () => ({get matches() {return mobile;}})});
  try {
    runtime.configureProductionDashboard();
    const first = runtime.saveRecommendation('rotate-safe'), second = runtime.dismissRecommendation('rotate-safe');
    await Promise.resolve();
    expect(boundary.load).toHaveBeenCalledTimes(2);
    mobile = true;
    pending.resolve({createRecommendationActions});
    await Promise.all([first, second]);
    expect(boundary.set.mock.calls).toEqual([['saved', 'rotate-safe', true], ['dismissed', 'rotate-safe', true]]);
    expect(document.querySelector('#notification-container [role="alert"]')).toBeNull();
  } finally {
    if (previousMatchMedia) Object.defineProperty(window, 'matchMedia', previousMatchMedia);
    else Reflect.deleteProperty(window, 'matchMedia');
  }
});
