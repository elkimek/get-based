import { expect, it, vi } from 'vitest';
import { createBiologyPageLoader } from '../js/biology-page-loader.js';

type PageModule = Awaited<ReturnType<ReturnType<typeof createBiologyPageLoader>['load']>>;
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function module(): PageModule {
  return { renderBiologyPage: () => 'owned page', scheduleBiologyScoreAIReconcile: () => {} };
}

it('shares the cold request and keeps the exact loaded module resident', async () => {
  const pending = deferred<PageModule>();
  const request = vi.fn(() => pending.promise);
  const loader = createBiologyPageLoader(request);
  expect(loader.getLoaded()).toBeNull();
  const first = loader.load();
  expect(loader.load()).toBe(first);
  expect(request.mock.calls).toEqual([[false]]);
  const loaded = module(); pending.resolve(loaded);
  expect(await first).toBe(loaded);
  expect(loader.getLoaded()).toBe(loaded);
  expect(loader.load()).toBe(first);
  expect(request).toHaveBeenCalledTimes(1);
});

it('clears a failed request and chooses the fixed retry URL branch', async () => {
  const failure = new Error('module unavailable');
  const loaded = module();
  const flags: boolean[] = [];
  const loader = createBiologyPageLoader(retry => {
    flags.push(retry);
    return retry ? Promise.resolve(loaded) : Promise.reject(failure);
  });
  await expect(loader.load()).rejects.toBe(failure);
  expect(loader.getLoaded()).toBeNull();
  expect(await loader.load()).toBe(loaded);
  expect(flags).toEqual([false, true]);
});

it('does not publish a failed import or disturb independent module caches', async () => {
  const failure = new Error('offline');
  const pending = deferred<PageModule>();
  const first = createBiologyPageLoader(() => pending.promise);
  const secondModule = module();
  const second = createBiologyPageLoader(() => Promise.resolve(secondModule));
  const failed = first.load();
  pending.reject(failure);
  await expect(failed).rejects.toBe(failure);
  expect(first.getLoaded()).toBeNull();
  expect(await second.load()).toBe(secondModule);
  expect(first.getLoaded()).toBeNull();
});
