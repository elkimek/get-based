import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { inlineServiceWorkerAssets, readServiceWorkerSource, SERVICE_WORKER_ASSETS_IMPORT } from '../scripts/service-worker-source.js';

const bootstrap = `${SERVICE_WORKER_ASSETS_IMPORT}\ninstall(self.GetBasedServiceWorkerAssets);`;
const manifest = "const APP_SHELL = ['/app'];\nself.GetBasedServiceWorkerAssets = APP_SHELL;";

describe('actual classic-worker source graph', () => {
  it('retains classic script scope and the original function execution mode', () => {
    const context = createContext({ self: {} });
    for (const name of ['version', 'service-worker-runtime', 'service-worker-assets']) {
      runInContext(readFileSync(new URL('../' + name + '.js', import.meta.url), 'utf8'), context);
    }
    // Strict functions reject this property access. The pre-migration runtime
    // was a classic non-strict script; native emission must preserve that mode.
    expect(runInContext('installServiceWorkerRuntime.arguments', context)).toBeNull();
    expect(runInContext('self.GetBasedServiceWorkerAssets === APP_SHELL', context)).toBe(true);
    expect(runInContext('self.APP_VERSION', context)).toBeTruthy();
  });

  it('follows the development loader and preserves exact source bytes in loader order', () => {
    const reads: string[] = [];
    const source = readServiceWorkerSource(relative => {
      reads.push(relative);
      return relative === 'service-worker.js' ? bootstrap : manifest;
    });
    expect(reads).toEqual(['service-worker.js', 'service-worker-assets.js']);
    expect(source).toBe(manifest + '\ninstall(self.GetBasedServiceWorkerAssets);');
  });

  it('reads the asynchronous source graph in the same order', async () => {
    const reads: string[] = [];
    const source = await readServiceWorkerSource(async relative => {
      reads.push(relative);
      return relative === 'service-worker.js' ? bootstrap : manifest;
    });
    expect(reads).toEqual(['service-worker.js', 'service-worker-assets.js']);
    expect(source).toBe(inlineServiceWorkerAssets(bootstrap, manifest));
  });

  it('uses an inlined production worker without reading a separate manifest', () => {
    const production = inlineServiceWorkerAssets(bootstrap, manifest);
    const reads: string[] = [];
    expect(readServiceWorkerSource(relative => { reads.push(relative); return production; })).toBe(production);
    expect(reads).toEqual(['service-worker.js']);
  });

  it('propagates a missing manifest instead of letting offline assertions inspect an incomplete graph', async () => {
    const read = (relative: string) => {
      if (relative === 'service-worker.js') return bootstrap;
      throw new Error('missing manifest');
    };
    expect(() => readServiceWorkerSource(read)).toThrow('missing manifest');
    await expect(readServiceWorkerSource(async relative => read(relative))).rejects.toThrow('missing manifest');
    expect(() => inlineServiceWorkerAssets('install([]);', manifest)).toThrow('does not load its asset manifest');
  });
});
