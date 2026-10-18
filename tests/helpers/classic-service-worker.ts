import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { fileURLToPath } from 'node:url';
import { createInstrumenter } from 'istanbul-lib-instrument';
import { inject } from 'vitest';

/** Execute the emitted classic scripts together, including real importScripts loads. */
export function executeClassicServiceWorker(runtime: Record<string, unknown>, loadVersion: () => void): void {
  const context = createContext({ self: runtime, URL, Response, Headers, crypto, Error, console, setTimeout, clearTimeout });
  const coveredFiles = inject('getbasedClassicCoverageFiles') ?? [];
  const instrumenter = coveredFiles.length ? createInstrumenter({
    coverageVariable: '__VITEST_COVERAGE__', coverageGlobalScope: 'globalThis', coverageGlobalScopeFunc: false,
    autoWrap: false, esModules: false, produceSourceMap: false, compact: false,
  }) : null;
  if (instrumenter) Object.defineProperty(context, '__VITEST_COVERAGE__', {
    get: () => Reflect.get(globalThis, '__VITEST_COVERAGE__'),
    set: (store: unknown) => { Reflect.set(globalThis, '__VITEST_COVERAGE__', store); },
    configurable: true,
  });
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
    const filename = fileURLToPath(sourceUrl);
    const executable = instrumenter && coveredFiles.includes(filename) ? instrumenter.instrumentSync(source, filename) : source;
    runInContext(executable, context, { filename: sourceUrl.href });
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
