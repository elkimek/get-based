import type { AppleHealthProgressCallback } from '../js/wearables-apple-health-parser.js';

import { expect, it } from 'vitest';
import { setRuntimeValue, captureRuntimeGlobals } from './helpers/runtime-globals.js';
import { createLegacyAssertions } from './helpers/legacy-assertions.js';
// Apple Health import runtime adapter behavior.

import {
  configureAppleHealthRuntimeDeps,
  getAppleHealthJSZip,
  parseAppleHealthCycleRuntime,
  showAppleHealthCyclePreviewRuntime,
} from '../js/wearables-apple-health-runtime.js';

it('retains browser ZIP access, injected cycle callbacks and headless imports', async () => {
  const { assert, results: legacyAssertions } = createLegacyAssertions(" -- ");

  console.log('=== Wearables Apple Health Runtime Tests ===');

  const runtimeKeys = ['window'];
  const restoreRuntime = captureRuntimeGlobals(runtimeKeys);

  try {
    const fakeJSZip = { loadAsync: () => Promise.resolve({}) };
    const browserRuntime: { JSZip?: typeof fakeJSZip; _appleHealth?: unknown } = { JSZip: fakeJSZip };
    setRuntimeValue('window', browserRuntime);

    assert('getAppleHealthJSZip reads the browser JSZip binding',
      (getAppleHealthJSZip() as unknown) === fakeJSZip);

    assert('Apple Health debug helpers stay module-only',
      typeof browserRuntime._appleHealth === 'undefined');

    delete browserRuntime.JSZip;
    assert('getAppleHealthJSZip returns null when JSZip is unavailable',
      getAppleHealthJSZip() === null);

    delete (globalThis as { window?: unknown }).window;
    assert('Apple Health runtime adapter no-ops without a browser window',
      getAppleHealthJSZip() === null && typeof (globalThis as { _appleHealth?: unknown })._appleHealth === 'undefined');

    const runtimeCalls: unknown[][] = [];
    // This forwarding probe deliberately supplies only the observation field it reads.
    const parsed = { observations: [{ date: '2026-07-22' }] } as NonNullable<Exclude<Awaited<ReturnType<typeof parseAppleHealthCycleRuntime>>, false>>;
    const previousRuntime = configureAppleHealthRuntimeDeps({
      parseCycleBlob: async (blob, fileName, onProgress) => {
        runtimeCalls.push(['parse', blob.size, fileName]);
        (onProgress as AppleHealthProgressCallback | null)?.({ stage: 'parsing-cycle' });
        return parsed;
      },
      showCyclePreview: async value => {
        runtimeCalls.push(['preview', value]);
        return { periods: 1 } as NonNullable<Exclude<Awaited<ReturnType<typeof showAppleHealthCyclePreviewRuntime>>, false>>;
      },
    });
    let progressStage = '';
    const parsedResult = await parseAppleHealthCycleRuntime(
      new Blob(['cycle']),
      'export.xml',
      event => { progressStage = event.stage; }
    );
    const previewResult = await showAppleHealthCyclePreviewRuntime(parsedResult as NonNullable<Exclude<typeof parsedResult, false>>);
    configureAppleHealthRuntimeDeps({ parseCycleBlob: null, showCyclePreview: null });
    const missingParsedResult = await parseAppleHealthCycleRuntime(new Blob(), 'missing.xml');
    const missingPreviewResult = await showAppleHealthCyclePreviewRuntime(parsed);
    configureAppleHealthRuntimeDeps(previousRuntime);
    assert('Apple Health runtime invokes injected cycle import callbacks',
      parsedResult === parsed
        && (previewResult as Exclude<typeof previewResult, false>)?.periods === 1
        && progressStage === 'parsing-cycle'
        && JSON.stringify(runtimeCalls) === JSON.stringify([
          ['parse', 5, 'export.xml'],
          ['preview', parsed],
        ]));
    assert('Apple Health cycle runtime safely no-ops without callbacks',
      missingParsedResult === null && missingPreviewResult === null);
  } finally {
    restoreRuntime();
  }

  const savedWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  try {
    delete (globalThis as { window?: unknown }).window;
    const probeUrl = '../js/wearables-apple-health-runtime.js?no-window-probe';
    await import(probeUrl);
    assert('Apple Health runtime imports without a browser window', true);
  } catch (error) {
    assert('Apple Health runtime imports without a browser window', false, (error as Error | null | undefined)?.message || String(error));
  } finally {
    if (savedWindow) Object.defineProperty(globalThis, 'window', savedWindow);
    else delete (globalThis as { window?: unknown }).window;
  }

  console.log(`\nResults: ${legacyAssertions.pass} passed, ${legacyAssertions.fail} failed, ${legacyAssertions.pass + legacyAssertions.fail} total`);
  expect(legacyAssertions.fail).toBe(0);
});
