import { execFileSync } from 'node:child_process';
import { describe, it } from 'vitest';

const fixtureUrl = new URL('./helpers/node-browser-fixtures.js', import.meta.url).href;
function runIsolated(source: string): void {
  execFileSync(process.execPath, ['--input-type=module', '-e', `
    import assert from 'node:assert/strict';
    const fixtures = await import(${JSON.stringify(fixtureUrl)});
    ${source}
  `], { stdio: 'pipe' });
}

describe('shared standalone and Vitest browser fixtures', () => {
  it('preserves provided browser globals and does not wrap an existing Worker URL factory', () => {
    runIsolated(`
      const provided = {
        window: {}, document: {}, navigator: {}, CSS: {},
        addEventListener() {}, removeEventListener() {}, dispatchEvent() {}, Worker: class {},
      };
      for (const [key, value] of Object.entries(provided)) {
        Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
      }
      const createObjectURL = URL.createObjectURL;
      for (let attempt = 0; attempt < 2; attempt++) {
        for (const install of Object.values(fixtures)) install();
        for (const [key, value] of Object.entries(provided)) assert.equal(globalThis[key], value);
        assert.equal(URL.createObjectURL, createObjectURL);
      }
    `);
  });

  it('delivers registered events once, removes matching listeners, and reports listener failures', () => {
    runIsolated(`
      fixtures.installNodeWindow();
      fixtures.installNodeCSS();
      fixtures.installNodeDocument();
      fixtures.installNodeEventBus();
      let calls = 0;
      const event = { type: 'verdict' };
      const listener = received => { assert.equal(received, event); calls++; };
      addEventListener('verdict', listener);
      addEventListener('verdict', listener);
      assert.equal(dispatchEvent(event), true);
      assert.equal(calls, 1);
      removeEventListener('verdict', listener);
      dispatchEvent(event);
      assert.equal(calls, 1);
      const errors = [];
      console.error = (...args) => errors.push(args);
      const failure = new Error('listener failed');
      addEventListener('verdict', () => { throw failure; });
      assert.equal(dispatchEvent(event), true);
      assert.equal(errors.length, 1);
      assert.equal(errors[0][1], failure);
      assert.equal(window, globalThis);
      assert.equal(CSS.escape('a:b[c]'), 'a\\\\:b\\\\[c\\\\]');
      assert.deepEqual(document.styleSheets, []);
      assert.notEqual(document.createElement(), document.createElement());
      const originalDocument = document;
      fixtures.installNodeDocument();
      fixtures.installNodeEventBus();
      assert.equal(document, originalDocument);
      dispatchEvent(event);
      assert.equal(errors.length, 2);
    `);
  });

  it('routes Blob worker messages asynchronously and isolates separate worker instances', () => {
    runIsolated(`
      fixtures.installNodeWorker();
      const workerUrl = URL.createObjectURL(new Blob([
        'self.onmessage = event => self.postMessage({ value: event.data.value + 1 });',
      ]));
      const first = new Worker(workerUrl);
      const second = new Worker(workerUrl);
      const received = [];
      const waitFor = (worker, value) => new Promise(resolve => {
        worker.onmessage = event => { received.push(event.data.value); resolve(event.data); };
        worker.postMessage({ value });
      });
      const firstResponse = waitFor(first, 1);
      const secondResponse = waitFor(second, 10);
      assert.deepEqual(received, []);
      assert.deepEqual(await firstResponse, { value: 2 });
      assert.deepEqual(await secondResponse, { value: 11 });
      first.terminate(); second.terminate();
      const installedWorker = Worker;
      const installedUrlFactory = URL.createObjectURL;
      fixtures.installNodeWorker();
      assert.equal(Worker, installedWorker);
      assert.equal(URL.createObjectURL, installedUrlFactory);
    `);
  });

  it('drops messages when no worker handler exists and reports missing Blob failures', () => {
    runIsolated(`
      fixtures.installNodeWorker();
      const quiet = new Worker(URL.createObjectURL(new Blob(['self.marker = true;'])));
      let responded = false;
      quiet.onmessage = () => { responded = true; };
      quiet.postMessage('ignored');
      await new Promise(resolve => setImmediate(resolve));
      assert.equal(responded, false);
      const broken = new Worker('blob:unregistered');
      const error = new Promise(resolve => { broken.onerror = resolve; });
      broken.postMessage('probe');
      assert.match((await error).message, /NodeWorker: no Blob registered for blob:unregistered/);
    `);
  });
});
