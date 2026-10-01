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
