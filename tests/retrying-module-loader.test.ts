import { describe, expect, it } from 'vitest';
import { createRetryingModuleLoader, invokeCachedModule } from '../js/retrying-module-loader.js';

describe('independent first-use module caches', () => {
  it('shares the pending promise and publishes the module before initialization', async () => {
    const module = { ready: false };
    let resolve!: (value: typeof module) => void;
    const request = new Promise<typeof module>(complete => { resolve = complete; });
    const flags: boolean[] = [];
    const loader = createRetryingModuleLoader(retry => { flags.push(retry); return request; }, value => {
      expect(loader.module).toBe(value);
      expect(loader.promise).toBe(first);
      value.ready = true;
      return value;
    });
    expect(loader.module).toBeNull();
    expect(loader.promise).toBeNull();
    const first = loader.load();
    expect(loader.load()).toBe(first);
    expect(flags).toEqual([false]);
    resolve(module);
    expect(await first).toBe(module);
    expect(module.ready).toBe(true);
    expect(loader.load()).toBe(first);
  });

  it('clears a failed initialization and keeps selecting the fixed retry after further failures', async () => {
    const failure = new Error('configure failed');
    const flags: boolean[] = [];
    let attempts = 0;
    const loader = createRetryingModuleLoader(retry => { flags.push(retry); return Promise.resolve({ retry }); }, value => {
      expect(loader.module).toBe(value);
      if (++attempts < 3) throw failure;
      return value;
    });
    for (let attempt = 0; attempt < 2; attempt++) {
      await expect(loader.load()).rejects.toBe(failure);
      expect(loader.promise).toBeNull();
      expect(loader.module).toBeNull();
    }
    expect(await loader.load()).toEqual({ retry: true });
    expect(flags).toEqual([false, true, true]);
  });

  it('preserves synchronous request failures and isolates caches', async () => {
    const failure = new Error('request failed synchronously');
    const flags: boolean[] = [];
    const first = createRetryingModuleLoader(retry => { flags.push(retry); throw failure; });
    const second = createRetryingModuleLoader(() => Promise.resolve('other module'));
    expect(() => first.load()).toThrow(failure);
    expect(() => first.load()).toThrow(failure);
    expect(first.promise).toBeNull();
    expect(first.module).toBeNull();
    expect(flags).toEqual([false, false]);
    expect(await second.load()).toBe('other module');
  });
});

describe('resident and cold action dispatch', () => {
  it('keeps resident mutation synchronous and returns its exact value', () => {
    const module = { count: 0 };
    const result = { marker: 'caller result' };
    expect(invokeCachedModule({ module }, () => { throw new Error('must stay warm'); }, value => {
      value.count++;
      return result;
    }, () => { throw new Error('unexpected report'); })).toBe(result);
    expect(module.count).toBe(1);
  });

  it('keeps a resident rejected Promise intact while reporting a cold rejection', async () => {
    const error = new Error('action rejected');
    const rejected = Promise.reject(error);
    const reports: unknown[] = [];
    const report = (failure: unknown, phase: string) => { reports.push([failure, phase]); return false; };
    const resident = invokeCachedModule({ module: {} }, () => Promise.resolve({}), () => rejected, report);
    expect(resident).toBe(rejected);
    await expect(resident).rejects.toBe(error);
    expect(reports).toEqual([]);
    await expect(invokeCachedModule({ module: null }, () => Promise.resolve({}), () => Promise.reject(error), report)).resolves.toBe(false);
    expect(reports).toEqual([[error, 'async']]);
  });

  it('propagates synchronous cold-load failures for facades that load outside their catch', async () => {
    const error = new Error('cold load failed');
    const reports: unknown[] = [];
    const report = (failure: unknown, phase: string) => { reports.push([failure, phase]); return false; };
    expect(() => invokeCachedModule({ module: null }, () => { throw error; }, value => value, report, 'propagate')).toThrow(error);
    expect(reports).toEqual([]);
    await expect(invokeCachedModule({ module: null }, () => Promise.reject(error), value => value, report, 'propagate')).resolves.toBe(false);
    expect(reports).toEqual([[error, 'async']]);
  });

  it.each(['load', 'action'] as const)('reports a synchronous %s error immediately', where => {
    const error = new Error(where);
    const report = (failure: unknown, phase: string) => {
      expect(failure).toBe(error);
      expect(phase).toBe('sync');
      return undefined;
    };
    expect(invokeCachedModule({ module: where === 'action' ? {} : null }, () => { throw error; }, () => { throw error; }, report)).toBeUndefined();
  });
});
