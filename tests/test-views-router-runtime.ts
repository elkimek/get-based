#!/usr/bin/env node
import { setRuntimeValue, captureRuntimeGlobals } from './helpers/runtime-globals.js';
import { createLegacyAssertions } from './helpers/legacy-assertions.js';
// test-views-router-runtime.js - Views router browser runtime adapter behavior.

import './_node-shim.js';
import {
  addViewportInputCancelListeners,
  closeMobileSidebarFromRuntime,
  configureViewsRouterRuntimeDeps,
  getViewportHeight,
  getViewportScrollPosition,
  navigateViewportRuntime,
  restoreViewportScroll,
  scrollViewportBy,
  syncImportStatusFabFromRuntime,
} from '../js/views-router-runtime.js';

const { assert, results: legacyAssertions } = createLegacyAssertions();

console.log('=== Views Router Runtime Tests ===\n');

const runtimeKeys = [
  'window',
  'document',
  'scrollX',
  'scrollY',
  'pageXOffset',
  'pageYOffset',
  'innerHeight',
  'scrollTo',
  'scrollBy',
  'addEventListener',
  'removeEventListener',
];
const restoreRuntime = captureRuntimeGlobals(runtimeKeys);
const originalViewsRouterRuntimeDeps = configureViewsRouterRuntimeDeps();

try {
  const calls: unknown[][] = [];

  setRuntimeValue('scrollX', 12);
  setRuntimeValue('scrollY', 34);
  setRuntimeValue('pageXOffset', 56);
  setRuntimeValue('pageYOffset', 78);
  assert('getViewportScrollPosition prefers scrollX/Y',
    JSON.stringify(getViewportScrollPosition()) === JSON.stringify({ x: 12, y: 34 }));

  setRuntimeValue('scrollX', NaN);
  setRuntimeValue('scrollY', NaN);
  assert('getViewportScrollPosition falls back to page offsets',
    JSON.stringify(getViewportScrollPosition()) === JSON.stringify({ x: 56, y: 78 }));

  configureViewsRouterRuntimeDeps({
    closeMobileSidebar: () => calls.push(['close-sidebar']),
    navigate: (view: unknown) => calls.push(['navigate', view]),
    syncImportStatusFab: () => calls.push(['sync-fab']),
  });
  closeMobileSidebarFromRuntime();
  syncImportStatusFabFromRuntime();
  navigateViewportRuntime('dashboard');
  assert('shell callbacks delegate to runtime hooks',
    calls.some(call => call[0] === 'close-sidebar') &&
    calls.some(call => call[0] === 'sync-fab') &&
    calls.some(call => call[0] === 'navigate' && call[1] === 'dashboard'));

  configureViewsRouterRuntimeDeps({ closeMobileSidebar: null, navigate: null });
  let missingCallbacksThrew = false;
  try {
    closeMobileSidebarFromRuntime();
    navigateViewportRuntime('dashboard');
  } catch (_) {
    missingCallbacksThrew = true;
  }
  assert('view callbacks are safe no-ops before shell wiring', !missingCallbacksThrew);

  const listenerAdds: [unknown, unknown, {passive?: unknown; capture?: unknown} | null | undefined][] = [];
  const listenerRemoves: [unknown, unknown, unknown][] = [];
  setRuntimeValue('addEventListener', (type: unknown, fn: unknown, opts: {passive?: unknown; capture?: unknown} | null | undefined) => listenerAdds.push([type, fn, opts]));
  setRuntimeValue('removeEventListener', (type: unknown, fn: unknown, opts: unknown) => listenerRemoves.push([type, fn, opts]));
  const cancel = () => calls.push(['cancel']);
  const cleanup = addViewportInputCancelListeners(cancel);
  cleanup();
  assert('addViewportInputCancelListeners installs and removes wheel touch key guards',
    listenerAdds.map(call => call[0]).join(',') === 'wheel,touchstart,keydown' &&
    listenerRemoves.map(call => call[0]).join(',') === 'wheel,touchstart,keydown' &&
    listenerAdds.every(call => call[1] === cancel && call[2]?.passive === true && call[2]?.capture === true));

  setRuntimeValue('scrollTo', (...args: unknown[]) => calls.push(['scroll-to', args]));
  restoreViewportScroll({ x: 5, y: 9 });
  assert('restoreViewportScroll uses object scrollTo when available',
    calls.some(call => call[0] === 'scroll-to' && (call[1] as ({left?: unknown; top?: unknown} | null | undefined)[] | null | undefined)?.[0]?.left === 5 && (call[1] as ({left?: unknown; top?: unknown} | null | undefined)[] | null | undefined)?.[0]?.top === 9));

  setRuntimeValue('scrollTo', (...args: unknown[]) => {
    if (args.length === 1 && typeof args[0] === 'object') throw new Error('object unsupported');
    calls.push(['scroll-to-fallback', args]);
  });
  restoreViewportScroll({ x: 7, y: 11 });
  assert('restoreViewportScroll falls back to positional scrollTo',
    calls.some(call => call[0] === 'scroll-to-fallback' && (call[1] as unknown[] | null | undefined)?.[0] === 7 && (call[1] as unknown[] | null | undefined)?.[1] === 11));

  setRuntimeValue('innerHeight', 777);
  assert('getViewportHeight reads runtime viewport height',
    getViewportHeight() === 777);

  setRuntimeValue('innerHeight', 0);
  setRuntimeValue('document', {
    documentElement: { clientHeight: 642 },
    body: { clientHeight: 321 },
  });
  assert('getViewportHeight falls back to documentElement height when innerHeight is zero',
    getViewportHeight() === 642);

  setRuntimeValue('innerHeight', NaN);
  setRuntimeValue('document', {
    documentElement: { clientHeight: 0 },
    body: { clientHeight: 321 },
  });
  assert('getViewportHeight falls back to body height when root height is unavailable',
    getViewportHeight() === 321);

  setRuntimeValue('scrollBy', (...args: unknown[]) => calls.push(['scroll-by', args]));
  scrollViewportBy(13);
  assert('scrollViewportBy uses object scrollBy when available',
    calls.some(call => call[0] === 'scroll-by' && (call[1] as ({left?: unknown; top?: unknown} | null | undefined)[] | null | undefined)?.[0]?.top === 13));

  setRuntimeValue('scrollBy', (...args: unknown[]) => {
    if (args.length === 1 && typeof args[0] === 'object') throw new Error('object unsupported');
    calls.push(['scroll-by-fallback', args]);
  });
  scrollViewportBy(17);
  assert('scrollViewportBy falls back to positional scrollBy',
    calls.some(call => call[0] === 'scroll-by-fallback' && (call[1] as unknown[] | null | undefined)?.[0] === 0 && (call[1] as unknown[] | null | undefined)?.[1] === 17));

  delete (globalThis as {window?: unknown}).window;
  assert('runtime adapter no-ops safely when window is missing',
    getViewportScrollPosition() === null &&
    getViewportHeight() === 0 &&
    typeof addViewportInputCancelListeners(() => {}) === 'function');
} finally {
  configureViewsRouterRuntimeDeps(originalViewsRouterRuntimeDeps);
  restoreRuntime();
}

console.log(`\nResults: ${legacyAssertions.pass} passed, ${legacyAssertions.fail} failed, ${legacyAssertions.pass + legacyAssertions.fail} total`);
process.exit(legacyAssertions.fail > 0 ? 1 : 0);
