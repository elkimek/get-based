/** One independent first-use cache; fixed retry URLs remain owned by each facade. */
export function createRetryingModuleLoader<T>(
  request: (retry: boolean) => Promise<T>, initialize?: (module: T) => T,
) {
  let promise: Promise<T> | null = null;
  let module: T | null = null;
  let retry = false;
  return {
    get promise() { return promise; },
    get module() { return module; },
    load(): Promise<T> {
      if (!promise) {
        const pending = request(retry);
        promise = pending.then(value => {
          module = value;
          return initialize ? initialize(value) : value;
        }).catch(error => {
          promise = null;
          module = null;
          retry = true;
          throw error;
        });
      }
      return promise;
    },
  };
}

/** Keep resident actions synchronous; report cold Promise failures separately. */
export function invokeCachedModule<T, Result, Failure>(
  cache: { readonly module: T | null }, load: () => Promise<T>,
  action: (module: T) => Result,
  report: (error: unknown, phase: 'sync' | 'async') => Failure,
  synchronousLoadErrors: 'report' | 'propagate' = 'report',
) {
  // These facades originally started their cold load outside the catch boundary.
  if (synchronousLoadErrors === 'propagate' && !cache.module) {
    return load().then(action).catch(error => report(error, 'async'));
  }
  try {
    if (cache.module) return action(cache.module);
    return load().then(action).catch(error => report(error, 'async'));
  } catch (error) {
    return report(error, 'sync');
  }
}
