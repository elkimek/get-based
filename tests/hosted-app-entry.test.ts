import {afterEach, beforeEach, expect, it, vi} from 'vitest';
const state = vi.hoisted(() => ({recovery: false, initialized: vi.fn()}));
vi.mock('../shared/hosted-transition.js', () => ({getHostedTransition: () => state.recovery ? {phase: 'recovery'} : null}));
vi.mock('../js/main-runtime.js', () => {state.initialized(); return {};});
let replace: ReturnType<typeof vi.fn>;
beforeEach(() => {vi.resetModules(); state.recovery = false; state.initialized.mockClear(); replace = vi.fn(); vi.stubGlobal('location', {origin: 'https://app.getbased.health', replace}); vi.stubGlobal('localStorage', {getItem: () => null});});
afterEach(() => vi.unstubAllGlobals());
it('routes the hosted cutoff into recovery before loading application owners', async () => {
  state.recovery = true; await (await import('../js/main.js')).initialization; expect(replace).toHaveBeenCalledWith('/app/migration.html'); expect(state.initialized).not.toHaveBeenCalled();
});
it('keeps incomplete destination recovery fenced on every origin', async () => {
  vi.stubGlobal('localStorage', {getItem: () => 'synthetic pending fence'});
  await (await import('../js/main.js')).initialization; expect(replace).toHaveBeenCalledWith('/app/migration.html'); expect(state.initialized).not.toHaveBeenCalled();
});
it('starts the ordinary application when the hosted cutoff does not apply', async () => {
  await (await import('../js/main.js')).initialization; expect(state.initialized).toHaveBeenCalledTimes(1); expect(replace).not.toHaveBeenCalled();
});
