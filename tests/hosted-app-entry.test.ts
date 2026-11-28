import {afterEach, beforeEach, expect, it, vi} from 'vitest';
const state = vi.hoisted(() => ({transition: null as null | {phase: 'notice' | 'recovery'; demoUrl?: string | null}, initialized: vi.fn()}));
vi.mock('../shared/hosted-transition.js', () => ({getHostedTransition: () => state.transition}));
let replace: ReturnType<typeof vi.fn>;
let docDataset: Record<string, string>;
let overlayRemoved: boolean;
function stubStorage(entries: Record<string, string> = {}, databases: Array<{name: string}> = []) {
  const store = new Map(Object.entries(entries));
  vi.stubGlobal('localStorage', {
    get length() { return store.size; },
    key: (index: number) => [...store.keys()][index] ?? null,
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => { store.set(key, String(value)); },
    removeItem: (key: string) => { store.delete(key); },
  });
  vi.stubGlobal('indexedDB', {databases: vi.fn(async () => databases)});
  return store;
}
beforeEach(() => {
  vi.resetModules();
  state.transition = null;
  state.initialized.mockClear();
  vi.doMock('../js/main-runtime.js', () => {state.initialized(); return {};});
  replace = vi.fn();
  docDataset = {};
  overlayRemoved = false;
  vi.stubGlobal('location', {origin: 'https://app.getbased.health', replace});
  vi.stubGlobal('document', {
    documentElement: {dataset: docDataset},
    getElementById: (id: string) => id === 'legal-consent-overlay' ? {remove: () => { overlayRemoved = true; }} : null,
    body: {classList: {remove: vi.fn()}},
  });
  stubStorage();
});
afterEach(() => vi.unstubAllGlobals());
it('routes existing hosted users with saved records into recovery at cutoff before loading application owners', async () => {
  state.transition = {phase: 'recovery', demoUrl: 'https://app.getbased.health'};
  stubStorage({'labcharts-profiles': '[{"id":"default"}]'});
  await (await import('../js/main.js')).initialization;
  expect(replace).toHaveBeenCalledWith('/app/migration.html');
  expect(state.initialized).not.toHaveBeenCalled();
  expect(docDataset.publicDemo).toBeUndefined();
});
it('keeps incomplete destination recovery fenced on every origin', async () => {
  stubStorage({'labcharts-migration-pending': 'synthetic pending fence'});
  await (await import('../js/main.js')).initialization;
  expect(replace).toHaveBeenCalledWith('/app/migration.html');
  expect(state.initialized).not.toHaveBeenCalled();
});
it('opens brand-new zero-data visitors in locked in-place demo mode on app.getbased.health during notice', async () => {
  const store = stubStorage();
  state.transition = {phase: 'notice', demoUrl: 'https://app.getbased.health'};
  await (await import('../js/main.js')).initialization;
  expect(replace).not.toHaveBeenCalled();
  expect(docDataset.publicDemo).toBe('true');
  expect(overlayRemoved).toBe(true);
  expect(store.get('getbased-hosted-demo-session')).toBe('1');
  expect(state.initialized).toHaveBeenCalledTimes(1);
});
it('opens brand-new zero-data visitors in locked in-place demo mode on app.getbased.health during recovery', async () => {
  const store = stubStorage();
  state.transition = {phase: 'recovery', demoUrl: 'https://app.getbased.health'};
  await (await import('../js/main.js')).initialization;
  expect(replace).not.toHaveBeenCalled();
  expect(docDataset.publicDemo).toBe('true');
  expect(overlayRemoved).toBe(true);
  expect(store.get('getbased-hosted-demo-session')).toBe('1');
  expect(state.initialized).toHaveBeenCalledTimes(1);
});
it('keeps returning hosted demo-only visitors locked in in-place demo mode after empty default boot and demo profiles', async () => {
  state.transition = {phase: 'notice', demoUrl: 'https://app.getbased.health'};
  stubStorage(
    {
      'getbased-hosted-demo-session': '1',
      'labcharts-profiles': '[{"id":"default","tags":[]},{"id":"p_sarah","tags":["demo"]}]',
      'labcharts-active-profile': 'p_sarah',
      'labcharts-sidebar-collapsed': 'true',
    },
    [{name: 'labcharts-blobs'}, {name: 'getbased-nutrition-default'}, {name: 'labcharts-wearables-p_sarah'}, {name: 'getbased-nutrition-p_sarah'}],
  );
  await (await import('../js/main.js')).initialization;
  expect(replace).not.toHaveBeenCalled();
  expect(docDataset.publicDemo).toBe('true');
  expect(state.initialized).toHaveBeenCalledTimes(1);
});
it('keeps existing localStorage users on the hosted app without demo mode during the notice period', async () => {
  state.transition = {phase: 'notice', demoUrl: 'https://app.getbased.health'};
  stubStorage({'labcharts-profiles': '[{"id":"default"}]'});
  await (await import('../js/main.js')).initialization;
  expect(replace).not.toHaveBeenCalled();
  expect(docDataset.publicDemo).toBeUndefined();
  expect(state.initialized).toHaveBeenCalledTimes(1);
});
it('keeps existing IndexedDB-only users on the hosted app without demo mode during the notice period', async () => {
  state.transition = {phase: 'notice', demoUrl: 'https://app.getbased.health'};
  stubStorage({}, [{name: 'labcharts-backups'}]);
  await (await import('../js/main.js')).initialization;
  expect(replace).not.toHaveBeenCalled();
  expect(docDataset.publicDemo).toBeUndefined();
  expect(state.initialized).toHaveBeenCalledTimes(1);
});
it('fails safe and avoids demo mode when browser storage cannot be inspected', async () => {
  state.transition = {phase: 'notice', demoUrl: 'https://app.getbased.health'};
  vi.stubGlobal('localStorage', {getItem: () => null});
  await (await import('../js/main.js')).initialization;
  expect(replace).not.toHaveBeenCalled();
  expect(docDataset.publicDemo).toBeUndefined();
  expect(state.initialized).toHaveBeenCalledTimes(1);
});
it('fails safe and avoids demo mode when indexedDB.databases is unavailable', async () => {
  state.transition = {phase: 'notice', demoUrl: 'https://app.getbased.health'};
  vi.stubGlobal('indexedDB', {});
  await (await import('../js/main.js')).initialization;
  expect(replace).not.toHaveBeenCalled();
  expect(docDataset.publicDemo).toBeUndefined();
  expect(state.initialized).toHaveBeenCalledTimes(1);
});
it('starts the ordinary application when the hosted cutoff does not apply', async () => {
  await (await import('../js/main.js')).initialization;
  expect(state.initialized).toHaveBeenCalledTimes(1);
  expect(docDataset.publicDemo).toBeUndefined();
  expect(replace).not.toHaveBeenCalled();
});
