import {expect, it, vi} from 'vitest';
import {
  createDashboardCompositionLoader, createDashboardLensLoader,
  createDashboardRecommendationLoader, createOwnedCompositionGate,
} from '../js/dashboard-composition-loader.js';

type Composition = typeof import('../js/dashboard-view-composition.js');
type Lens = typeof import('../js/lens-pages.js');
type Recommendations = typeof import('../js/recommendation-actions.js');
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {resolve = yes; reject = no;});
  return {promise, resolve, reject};
}
const composition: Composition = {createDashboardViewComposition: () => {throw Error('unused constructor');}};
const lens: Lens = {createLensPageHandlers: () => {throw Error('unused constructor');}};
const recommendations: Recommendations = {createRecommendationActions: () => {throw Error('unused constructor');}};

it('shares cold modules independently without constructing a body, Lens or Tips action', async () => {
  const pending = deferred<Composition>(), ask = vi.fn(() => pending.promise);
  const body = createDashboardCompositionLoader(ask);
  const askLens = vi.fn(async () => lens), askTips = vi.fn(async () => recommendations);
  const pages = createDashboardLensLoader(askLens), tips = createDashboardRecommendationLoader(askTips);
  const first = body.load();
  expect(body.load()).toBe(first);
  expect(ask.mock.calls).toEqual([[false]]);
  expect(askLens).not.toHaveBeenCalled();
  expect(askTips).not.toHaveBeenCalled();
  expect(body.getLoaded()).toBeNull();
  pending.resolve(composition);
  expect(await first).toBe(composition);
  expect(body.getLoaded()).toBe(composition);
  expect(await pages.load()).toBe(lens);
  expect(await tips.load()).toBe(recommendations);
  expect(askLens.mock.calls).toEqual([[false]]);
  expect(askTips.mock.calls).toEqual([[false]]);
});

it('retains independent canonical and fixed-retry identity for each failed root', async () => {
  const failure = Error('cold offline');
  for (const [create, module] of [
    [createDashboardCompositionLoader, composition],
    [createDashboardLensLoader, lens],
    [createDashboardRecommendationLoader, recommendations],
  ] as const) {
    const flags: boolean[] = [];
    // The common contract is tested independently of each module's opaque API.
    const request = (retry: boolean) => {
      flags.push(retry);
      return retry ? Promise.resolve(module) : Promise.reject(failure);
    };
    type Request = typeof request;
    const loader = (create as (request: Request) => {load(): Promise<unknown>; getLoaded(): unknown})(request);
    await expect(loader.load()).rejects.toBe(failure);
    expect(loader.getLoaded()).toBeNull();
    expect(await loader.load()).toBe(module);
    expect(flags).toEqual([false, true]);
    expect(loader.getLoaded()).toBe(module);
  }
});

it('lets a current second request share a stale first import and constructs/publishes once', async () => {
  const pending = deferred<object>(), module = {}, instance = {};
  let firstCurrent = true;
  const create = vi.fn(() => instance), publish = vi.fn();
  const gate = createOwnedCompositionGate(() => pending.promise, create, publish);
  const first = gate.prepare(() => firstCurrent);
  firstCurrent = false;
  const second = gate.prepare(() => true), third = gate.prepare(() => true);
  expect(create).not.toHaveBeenCalled();
  pending.resolve(module);
  expect(await first).toBeUndefined();
  expect(await second).toBe(instance);
  expect(await third).toBe(instance);
  expect(create.mock.calls).toEqual([[module]]);
  expect(publish.mock.calls).toEqual([[instance]]);
  expect(gate.getResident()).toBe(instance);
});

it('does not load for a retired caller or create after a held owner retires', async () => {
  const pending = deferred<object>(), load = vi.fn(() => pending.promise), create = vi.fn(() => ({})), publish = vi.fn();
  const gate = createOwnedCompositionGate(load, create, publish);
  expect(await gate.prepare(() => false)).toBeUndefined();
  expect(load).not.toHaveBeenCalled();
  let current = true;
  const first = gate.prepare(() => current);
  current = false;
  pending.resolve({});
  expect(await first).toBeUndefined();
  expect(create).not.toHaveBeenCalled();
  expect(publish).not.toHaveBeenCalled();
  expect(gate.getResident()).toBeUndefined();
});

it('retains a constructed owner across synchronous retirement without publishing or duplicating delegates', async () => {
  let current = true;
  const instance = {}, create = vi.fn(() => {current = false; return instance;}), publish = vi.fn();
  const gate = createOwnedCompositionGate(async () => ({}), create, publish);
  expect(await gate.prepare(() => current)).toBeUndefined();
  expect(gate.getResident()).toBe(instance);
  expect(publish).not.toHaveBeenCalled();
  current = true;
  expect(await gate.prepare(() => current)).toBe(instance);
  expect(create).toHaveBeenCalledTimes(1);
  expect(publish.mock.calls).toEqual([[instance]]);
});

it('does not retain failed construction, and a publish failure retries only publication', async () => {
  const failure = Error('constructor failure'), instance = {}, publish = vi.fn();
  const create = vi.fn<(_: object) => object>().mockImplementationOnce(() => {throw failure;}).mockReturnValue(instance);
  const gate = createOwnedCompositionGate(async () => ({}), create, publish);
  await expect(gate.prepare(() => true)).rejects.toBe(failure);
  expect(gate.getResident()).toBeUndefined();
  expect(publish).not.toHaveBeenCalled();
  expect(await gate.prepare(() => true)).toBe(instance);
  expect(create).toHaveBeenCalledTimes(2);
  const failPublish = vi.fn().mockImplementationOnce(() => {throw failure;});
  const buildOnce = vi.fn(() => instance), next = createOwnedCompositionGate(async () => ({}), buildOnce, failPublish);
  await expect(next.prepare(() => true)).rejects.toBe(failure);
  expect(next.getResident()).toBe(instance);
  expect(await next.prepare(() => true)).toBe(instance);
  expect(buildOnce).toHaveBeenCalledTimes(1);
  expect(failPublish).toHaveBeenCalledTimes(2);
});
