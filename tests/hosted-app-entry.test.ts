import {afterEach, beforeEach, expect, it, vi} from 'vitest';
const state = vi.hoisted(() => ({transition: null as null | {phase: 'notice' | 'recovery'; demoUrl?: string | null}, initialized: vi.fn()}));
vi.mock('../shared/hosted-transition.js', () => ({getHostedTransition: () => state.transition}));
let replace: ReturnType<typeof vi.fn>;
function stubStorage(entries: Record<string, string> = {}, databases: Array<{name: string}> = []) {
  const keys = Object.keys(entries);
  vi.stubGlobal('localStorage', {
    get length() { return keys.length; },
    key: (index: number) => keys[index] ?? null,
    getItem: (key: string) => entries[key] ?? null,
  });
  vi.stubGlobal('indexedDB', {databases: vi.fn(async () => databases)});
}
beforeEach(() => {
  vi.resetModules();
  state.transition = null;
  state.initialized.mockClear();
  vi.doMock('../js/main-runtime.js', () => {state.initialized(); return {};});
  replace = vi.fn();
  vi.stubGlobal('location', {origin: 'https://app.getbased.health', replace});
  stubStorage();
});
afterEach(() => vi.unstubAllGlobals());
it('routes the hosted cutoff into recovery before loading application owners', async () => {
  state.transition = {phase: 'recovery', demoUrl: 'https://getbased-demo.vercel.app'};
  await (await import('../js/main.js')).initialization;
  expect(replace).toHaveBeenCalledWith('/app/migration.html');
  expect(state.initialized).not.toHaveBeenCalled();
});
it('keeps incomplete destination recovery fenced on every origin', async () => {
  stubStorage({'labcharts-migration-pending': 'synthetic pending fence'});
  await (await import('../js/main.js')).initialization;
  expect(replace).toHaveBeenCalledWith('/app/migration.html');
  expect(state.initialized).not.toHaveBeenCalled();
});
it('redirects brand-new zero-data visitors to the read-only demo during the hosted notice period', async () => {
  state.transition = {phase: 'notice', demoUrl: 'https://getbased-demo.vercel.app'};
  await (await import('../js/main.js')).initialization;
  expect(replace).toHaveBeenCalledWith('https://getbased-demo.vercel.app');
  expect(state.initialized).not.toHaveBeenCalled();
});
it('keeps existing localStorage users on the hosted app during the notice period', async () => {
  state.transition = {phase: 'notice', demoUrl: 'https://getbased-demo.vercel.app'};
  stubStorage({'labcharts-profiles': '[{"id":"default"}]'});
  await (await import('../js/main.js')).initialization;
  expect(replace).not.toHaveBeenCalled();
  expect(state.initialized).toHaveBeenCalledTimes(1);
});
it('keeps existing IndexedDB-only users on the hosted app during the notice period', async () => {
  state.transition = {phase: 'notice', demoUrl: 'https://getbased-demo.vercel.app'};
  stubStorage({}, [{name: 'labcharts-backups'}]);
  await (await import('../js/main.js')).initialization;
  expect(replace).not.toHaveBeenCalled();
  expect(state.initialized).toHaveBeenCalledTimes(1);
});
it('fails safe and avoids redirecting when browser storage cannot be inspected', async () => {
  state.transition = {phase: 'notice', demoUrl: 'https://getbased-demo.vercel.app'};
  vi.stubGlobal('localStorage', {getItem: () => null});
  await (await import('../js/main.js')).initialization;
  expect(replace).not.toHaveBeenCalled();
  expect(state.initialized).toHaveBeenCalledTimes(1);
});
it('fails safe and avoids redirecting when indexedDB.databases is unavailable', async () => {
  state.transition = {phase: 'notice', demoUrl: 'https://getbased-demo.vercel.app'};
  vi.stubGlobal('indexedDB', {});
  await (await import('../js/main.js')).initialization;
  expect(replace).not.toHaveBeenCalled();
  expect(state.initialized).toHaveBeenCalledTimes(1);
});
it('starts the ordinary application when the hosted cutoff does not apply', async () => {
  await (await import('../js/main.js')).initialization;
  expect(state.initialized).toHaveBeenCalledTimes(1);
  expect(replace).not.toHaveBeenCalled();
});
