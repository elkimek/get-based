import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';

/** Execute the emitted classic scripts together, including real importScripts loads. */
export function executeClassicServiceWorker(runtime: Record<string, unknown>, loadVersion: () => void): void {
  const context = createContext({ self: runtime, URL, Error, console });
  for (const key of ['fetch', 'caches']) {
    Object.defineProperty(context, key, {
      get: () => (globalThis as Record<string, unknown>)[key],
      configurable: true,
    });
  }
  const load = (relative: string) => {
    const sourceUrl = new URL('../../' + relative, import.meta.url);
    const source = readFileSync(sourceUrl, 'utf8');
    // V8 collectors attribute real classic scripts only when their filename is a file URL.
    runInContext(source, context, { filename: sourceUrl.href });
  };
  context['importScripts'] = (...urls: string[]) => {
    for (const url of urls) {
      if (url === '/version.js') loadVersion();
      else if (url === '/service-worker-runtime.js' || url === '/service-worker-assets.js') load(url.slice(1));
      else throw new Error(`Unexpected service-worker import: ${url}`);
      const spy = (globalThis as Record<string, unknown>)['importScripts'];
      if (typeof spy === 'function') spy(url);
    }
  };
  load('service-worker.js');
}
