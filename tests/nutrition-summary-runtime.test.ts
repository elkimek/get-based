// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
const calls = vi.hoisted(() => ({ hydrate: vi.fn() }));
vi.mock('../js/nutrition-store.js', () => ({ hydrateNutritionSummary: calls.hydrate }));
const listeners: Array<[string, EventListenerOrEventListenerObject]> = [];
afterEach(() => { vi.restoreAllMocks(); for (const [name, listener] of listeners.splice(0)) window.removeEventListener(name, listener); calls.hydrate.mockReset(); });
async function runtime() {
  vi.resetModules(); const original = window.addEventListener;
  vi.spyOn(window, 'addEventListener').mockImplementation((name: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions) => {listeners.push([name, listener]); original.call(window, name, listener, options);});
  const { state } = await import('../js/state.js'); state.currentProfile = 'a';
  const module = await import('../js/nutrition-summary-runtime.js'); return {state, module};
}
function held() {let resolve!: (value: unknown) => void; const promise = new Promise<unknown>(done => {resolve = done;}); return {promise, resolve};}
it('startup awaits the actual store hydration and forwards the requested profile and returned result', async () => {
  const { module } = await runtime(), gate = held(); calls.hydrate.mockReturnValue(gate.promise);
  let ready = false; const hydration = module.hydrateNutritionSummary('requested').then(result => {ready = true; return result;});
  await vi.waitFor(() => expect(calls.hydrate).toHaveBeenCalledExactlyOnceWith('requested')); expect(ready).toBe(false);
  const result = { totalMeals: 5 }; gate.resolve(result); await expect(hydration).resolves.toBe(result);
});
it('registers sync reconciliation synchronously, captures each profile, and preserves serialized order', async () => {
  const { state } = await runtime(), first = held(); calls.hydrate.mockReturnValueOnce(first.promise).mockResolvedValueOnce({});
  expect(listeners.filter(([name]) => name === 'labcharts-sync-applied')).toHaveLength(1);
  window.dispatchEvent(new Event('labcharts-sync-applied')); state.currentProfile = 'b'; window.dispatchEvent(new Event('labcharts-sync-applied'));
  await vi.waitFor(() => expect(calls.hydrate).toHaveBeenCalledExactlyOnceWith('a'));
  first.resolve({}); await vi.waitFor(() => expect(calls.hydrate.mock.calls).toEqual([['a'], ['b']]));
});
it('a rejected reconciliation warns and leaves the next captured profile retry usable', async () => {
  const { state } = await runtime(), error = new Error('encrypted store unavailable'); const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
  calls.hydrate.mockRejectedValueOnce(error).mockResolvedValueOnce({}); window.dispatchEvent(new Event('labcharts-sync-applied'));
  await vi.waitFor(() => expect(warning).toHaveBeenCalledExactlyOnceWith('[nutrition] Synced meals could not be hydrated:', error));
  state.currentProfile = 'next'; window.dispatchEvent(new Event('labcharts-sync-applied'));
  await vi.waitFor(() => expect(calls.hydrate.mock.calls).toEqual([['a'], ['next']]));
});
