import { expect, it } from 'vitest';
import { setRuntimeValue, captureRuntimeGlobals } from './helpers/runtime-globals.js';
import { createLegacyAssertions } from './helpers/legacy-assertions.js';
import {
  addMobileDashboardBreakpointListener,
  addMobileDashboardVisualViewportListener,
  addMobileDashboardWindowListener,
  getMobileDashboardVisualBottomOffset,
  isMobileDashboardRuntimeViewport,
  scrollMobileDashboardToTop,
} from '../js/mobile-dashboard-runtime.js';

it('retains mobile-dashboard-runtime adapter behavior', async () => {
  const { assert, results: legacyAssertions } = createLegacyAssertions(" - ");

  console.log('=== Mobile Dashboard Runtime Tests ===\n');

  const runtimeKeys = [
    'window',
    'document',
    'matchMedia',
    'addEventListener',
    'visualViewport',
    'innerHeight',
    'scrollTo',
  ];

  const restoreRuntime = captureRuntimeGlobals(runtimeKeys);

  try {
    const calls: unknown[][] = [];
    const mediaListeners: Array<[string, unknown]> = [];
    const viewportListeners: Array<[string, unknown, boolean]> = [];
    setRuntimeValue('matchMedia', (query: string) => ({
      media: query,
      matches: query === '(max-width: 799px)',
      addEventListener: (type: string, listener: unknown) => mediaListeners.push([type, listener]),
    }));
    setRuntimeValue('addEventListener', (type: string, listener: unknown, options?: AddEventListenerOptions) => calls.push(['window-listener', type, options?.passive === true, listener]));
    setRuntimeValue('visualViewport', {
      offsetTop: 24,
      height: 700,
      addEventListener: (type: string, listener: unknown, options?: AddEventListenerOptions) => viewportListeners.push([type, listener, options?.passive === true]),
    });
    setRuntimeValue('innerHeight', 812);
    setRuntimeValue('document', { documentElement: { clientHeight: 790 } });
    setRuntimeValue('scrollTo', (x: number, y: number) => calls.push(['scroll', x, y]));

    const breakpointListener = () => calls.push(['breakpoint']);
    const resizeListener = () => calls.push(['resize']);

    assert('isMobileDashboardRuntimeViewport delegates matchMedia matches',
      isMobileDashboardRuntimeViewport('(max-width: 799px)') === true &&
      isMobileDashboardRuntimeViewport('(min-width: 800px)') === false);
    assert('addMobileDashboardBreakpointListener registers media change handler',
      addMobileDashboardBreakpointListener('(max-width: 799px)', breakpointListener) === true &&
      mediaListeners.some(([type, listener]) => type === 'change' && listener === breakpointListener));
    addMobileDashboardWindowListener('resize', resizeListener, { passive: true });
    assert('addMobileDashboardWindowListener registers browser listener',
      calls.some(call => call[0] === 'window-listener' && call[1] === 'resize' && call[2] === true && call[3] === resizeListener));
    addMobileDashboardVisualViewportListener('scroll', resizeListener, { passive: true });
    assert('addMobileDashboardVisualViewportListener registers viewport listener',
      viewportListeners.some(([type, listener, passive]) => type === 'scroll' && listener === resizeListener && passive === true));
    assert('getMobileDashboardVisualBottomOffset computes keyboard inset',
      getMobileDashboardVisualBottomOffset() === 88);
    setRuntimeValue('visualViewport', {
      offsetTop: 24,
      addEventListener: (type: string, listener: unknown, options?: AddEventListenerOptions) => viewportListeners.push([type, listener, options?.passive === true]),
    });
    assert('getMobileDashboardVisualBottomOffset ignores transient missing viewport height',
      getMobileDashboardVisualBottomOffset() === 0);
    setRuntimeValue('visualViewport', {
      height: 700,
      addEventListener: (type: string, listener: unknown, options?: AddEventListenerOptions) => viewportListeners.push([type, listener, options?.passive === true]),
    });
    assert('getMobileDashboardVisualBottomOffset ignores transient missing viewport offset',
      getMobileDashboardVisualBottomOffset() === 0);
    setRuntimeValue('visualViewport', {
      offsetTop: 24,
      height: 700,
      addEventListener: (type: string, listener: unknown, options?: AddEventListenerOptions) => viewportListeners.push([type, listener, options?.passive === true]),
    });
    scrollMobileDashboardToTop();
    assert('scrollMobileDashboardToTop delegates to scrollTo',
      calls.some(call => call[0] === 'scroll' && call[1] === 0 && call[2] === 0));
    setRuntimeValue('matchMedia', (query: string) => ({
      media: query,
      matches: true,
      addListener: (listener: unknown) => mediaListeners.push(['legacy', listener]),
    }));
    assert('addMobileDashboardBreakpointListener supports legacy addListener',
      addMobileDashboardBreakpointListener('(max-width: 799px)', breakpointListener) === true &&
      mediaListeners.some(([type, listener]) => type === 'legacy' && listener === breakpointListener));
    setRuntimeValue('matchMedia', (query: string) => ({
      media: query,
      matches: true,
    }));
    assert('addMobileDashboardBreakpointListener reports unsupported listener registration',
      addMobileDashboardBreakpointListener('(max-width: 799px)', breakpointListener) === false);

    delete (globalThis as { window?: unknown }).window;
    assert('runtime adapter no-ops safely when window is missing',
      isMobileDashboardRuntimeViewport('(max-width: 799px)') === false &&
      getMobileDashboardVisualBottomOffset() === 0 &&
      addMobileDashboardBreakpointListener('(max-width: 799px)', breakpointListener) === false);
    const beforeNoWindowCalls = calls.length;
    addMobileDashboardWindowListener('resize', resizeListener);
    addMobileDashboardVisualViewportListener('resize', resizeListener);
    scrollMobileDashboardToTop();
    assert('optional browser actions no-op without window',
      calls.length === beforeNoWindowCalls);
  } finally {
    restoreRuntime();
  }

  const savedWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');

  try {
    delete (globalThis as { window?: unknown }).window;
    const probeUrl = '../js/mobile-dashboard-runtime.js?no-window-probe';
    await import(probeUrl);
    assert('mobile-dashboard runtime imports without a browser window', true);
  } catch (error) {
    assert('mobile-dashboard runtime imports without a browser window', false, (error as Error | null | undefined)?.message || String(error));
  } finally {
    if (savedWindow) Object.defineProperty(globalThis, 'window', savedWindow);
    else delete (globalThis as { window?: unknown }).window;
  }

  console.log(`\nResults: ${legacyAssertions.pass} passed, ${legacyAssertions.fail} failed, ${legacyAssertions.pass + legacyAssertions.fail} total`);

  expect(legacyAssertions.fail).toBe(0);
});
