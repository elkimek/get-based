import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
beforeEach(() => vi.resetModules());
afterEach(() => {
  vi.doUnmock('../js/lab-context.js');
  vi.doUnmock('../js/lab-context.js?lazy-retry=1');
  vi.resetModules();
});
it('stays cold, shares the first import and returns the same synchronous builder', async () => {
  const evaluated = vi.fn();
  const build = vi.fn(() => 'Exact synchronous context');
  vi.doMock('../js/lab-context.js', () => {
    evaluated();
    return {
      buildLabContext: build
    };
  });
  const loader = await import('../js/lab-context-loader.js');
  expect(loader.getLoadedLabContextBuilder()).toBeNull();
  expect(evaluated).not.toHaveBeenCalled();
  const first = loader.loadLabContextBuilder();
  expect(loader.loadLabContextBuilder()).toBe(first);
  expect(await first).toBe(build);
  expect(evaluated).toHaveBeenCalledOnce();
  expect(build).not.toHaveBeenCalled();
  expect(loader.getLoadedLabContextBuilder()).toBe(build);
  expect(loader.getLoadedLabContextBuilder()!()).toBe('Exact synchronous context');
  expect(loader.loadLabContextBuilder()).toBe(first);
});
it('retains an import failure and recovers through its separately owned fixed retry URL', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'getbased-context-loader-'));
  try {
    // Copy the real emitted loader/helper without editing either canonical file.
    // Native ESM preserves the thrown error identity; Vitest mock factories wrap it.
    for (const name of ['lab-context-loader.js', 'retrying-module-loader.js']) {
      fs.copyFileSync(new URL('../js/' + name, import.meta.url), path.join(directory, name));
    }
    fs.writeFileSync(path.join(directory, 'package.json'), '{"type":"module"}');
    fs.writeFileSync(path.join(directory, 'lab-context.js'), `
      globalThis.contextAttempts.push(import.meta.url);
      if (!new URL(import.meta.url).search) throw globalThis.contextImportFailure;
      globalThis.contextInitializations++;
      globalThis.contextImportStarted();
      await globalThis.contextImportGate;
      export const buildLabContext = globalThis.contextBuilder;
    `);
    const loaderUrl = pathToFileURL(path.join(directory, 'lab-context-loader.js')).href;
    const result = execFileSync(process.execPath, ['--input-type=module', '--eval', `
      import assert from 'node:assert/strict';
      globalThis.contextAttempts = [];
      globalThis.contextInitializations = 0;
      globalThis.contextImportFailure = new Error('Synthetic first import failure');
      globalThis.contextBuilder = options => 'Recovered context: ' + options.queryText;
      let release, markStarted;
      const importStarted = new Promise(resolve => { markStarted = resolve; });
      globalThis.contextImportStarted = markStarted;
      globalThis.contextImportGate = new Promise(resolve => { release = resolve; });
      const loader = await import(${JSON.stringify(loaderUrl)});
      assert.equal(loader.getLoadedLabContextBuilder(), null);
      assert.deepEqual(globalThis.contextAttempts, []);
      const first = loader.loadLabContextBuilder();
      assert.equal(loader.loadLabContextBuilder(), first);
      await assert.rejects(first, error => error === globalThis.contextImportFailure);
      assert.equal(loader.getLoadedLabContextBuilder(), null);
      assert.equal(globalThis.contextAttempts.length, 1);
      const retry = loader.loadLabContextBuilder();
      assert.notEqual(retry, first);
      assert.equal(loader.loadLabContextBuilder(), retry);
      let startupTimeout;
      try {
        await Promise.race([importStarted, new Promise((_, reject) => {
          startupTimeout = setTimeout(() => reject(new Error('Native retry module did not start')), 5000);
        })]);
      } finally {
        clearTimeout(startupTimeout);
      }
      assert.equal(globalThis.contextInitializations, 1);
      assert.equal(loader.getLoadedLabContextBuilder(), null);
      release();
      assert.equal(await retry, globalThis.contextBuilder);
      assert.equal(loader.getLoadedLabContextBuilder(), globalThis.contextBuilder);
      assert.equal(loader.loadLabContextBuilder(), retry);
      assert.equal(loader.getLoadedLabContextBuilder()({ queryText: 'explicit' }), 'Recovered context: explicit');
      assert.deepEqual(globalThis.contextAttempts.map(value => new URL(value).search), ['', '?lazy-retry=1']);
      assert(globalThis.contextAttempts.every(value => new URL(value).pathname.endsWith('/lab-context.js')));
      console.log(JSON.stringify({ sameFailure: true, fixedRetry: true, sharedImport: true, synchronousBuilder: true, attempts: 2 }));
    `], { encoding: 'utf8', timeout: 15000, maxBuffer: 64 * 1024 });
    expect(JSON.parse(result)).toEqual({
      sameFailure: true,
      fixedRetry: true,
      sharedImport: true,
      synchronousBuilder: true,
      attempts: 2,
    });
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
