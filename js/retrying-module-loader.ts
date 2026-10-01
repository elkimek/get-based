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

interface StylesheetLoaderOptions {
  existing?: () => HTMLLinkElement | null;
  createLink: (retry: boolean, existing: HTMLLinkElement | null) => HTMLLinkElement;
  insertLink: (link: HTMLLinkElement) => void;
  requireDocument: string;
  failedLoad: string;
}

/** Each feature owns its links and cascade position; cache state stays independent. */
export function createRetryingStylesheetLoader({ existing: findExisting, createLink, insertLink, requireDocument, failedLoad }: StylesheetLoaderOptions) {
  let promise: Promise<HTMLLinkElement> | null = null;
  let loaded = false;
  let retry = false;
  return {
    get loaded() { return loaded; },
    get retry() { return retry; },
    load(): Promise<HTMLLinkElement> {
      const existing = findExisting ? findExisting() : null;
      if (existing?.sheet) {
        loaded = true;
        return Promise.resolve(existing);
      }
      if (!promise) {
        if (typeof document === 'undefined') return Promise.reject(new Error(requireDocument));
        const link = createLink(retry, existing);
        promise = new Promise<HTMLLinkElement>((resolve, reject) => {
          link.addEventListener('load', () => { loaded = true; resolve(link); }, { once: true });
          link.addEventListener('error', () => reject(new Error(failedLoad)), { once: true });
          insertLink(link);
        }).catch(error => {
          link.remove();
          promise = null;
          loaded = false;
          retry = true;
          throw error;
        });
      }
      return promise;
    },
  };
}

/** Reuse the tagged link first, then the original pathname match in document order. */
export function findStylesheet(marker: string, pathname: string): HTMLLinkElement | null {
  if (typeof document === 'undefined') return null;
  return document.querySelector<HTMLLinkElement>(marker)
    || Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"][href]')).find(link => {
      try { return new URL(link.href).pathname === pathname; }
      catch { return false; }
    })
    || null;
}
