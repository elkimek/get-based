// test-mobile-dashboard-runtime.js - Mobile dashboard browser adapter behavior.

import './_node-shim.js';
import {
  addMobileDashboardBreakpointListener,
  addMobileDashboardVisualViewportListener,
  addMobileDashboardWindowListener,
  exposeMobileDashboardBindings,
  getMobileDashboardVisualBottomOffset,
  isMobileDashboardRuntimeViewport,
  scrollMobileDashboardToTop,
} from '../js/mobile-dashboard-runtime.js';

let pass = 0, fail = 0;
function assert(name, condition, detail) {
  if (condition) { pass++; console.log(`  PASS: ${name}`); }
  else { fail++; console.log(`  FAIL: ${name}${detail ? ' - ' + detail : ''}`); }
}

console.log('=== Mobile Dashboard Runtime Tests ===\n');

const runtimeKeys = [
  'window',
  'document',
  'matchMedia',
  'addEventListener',
  'visualViewport',
  'innerHeight',
  'scrollTo',
  'mobileDashboardProbe',
];
const savedDescriptors = new Map(runtimeKeys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));

function setRuntimeValue(key, value) {
  Object.defineProperty(globalThis, key, {
    configurable: true,
    writable: true,
    enumerable: true,
    value,
  });
}

function restoreRuntime() {
  for (const key of runtimeKeys) {
    const descriptor = savedDescriptors.get(key);
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else delete globalThis[key];
  }
}

try {
  const calls = [];
  const mediaListeners = [];
  const viewportListeners = [];
  setRuntimeValue('matchMedia', query => ({
    media: query,
    matches: query === '(max-width: 799px)',
    addEventListener: (type, listener) => mediaListeners.push([type, listener]),
  }));
  setRuntimeValue('addEventListener', (type, listener, options) => calls.push(['window-listener', type, options?.passive === true, listener]));
  setRuntimeValue('visualViewport', {
    offsetTop: 24,
    height: 700,
    addEventListener: (type, listener, options) => viewportListeners.push([type, listener, options?.passive === true]),
  });
  setRuntimeValue('innerHeight', 812);
  setRuntimeValue('document', { documentElement: { clientHeight: 790 } });
  setRuntimeValue('scrollTo', (x, y) => calls.push(['scroll', x, y]));

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
  scrollMobileDashboardToTop();
  assert('scrollMobileDashboardToTop delegates to scrollTo',
    calls.some(call => call[0] === 'scroll' && call[1] === 0 && call[2] === 0));
  const probe = () => 'ok';
  exposeMobileDashboardBindings({ mobileDashboardProbe: probe });
  assert('exposeMobileDashboardBindings assigns runtime exports',
    globalThis.mobileDashboardProbe === probe);

  setRuntimeValue('matchMedia', query => ({
    media: query,
    matches: true,
    addListener: listener => mediaListeners.push(['legacy', listener]),
  }));
  assert('addMobileDashboardBreakpointListener supports legacy addListener',
    addMobileDashboardBreakpointListener('(max-width: 799px)', breakpointListener) === true &&
    mediaListeners.some(([type, listener]) => type === 'legacy' && listener === breakpointListener));

  delete globalThis.window;
  assert('runtime adapter no-ops safely when window is missing',
    isMobileDashboardRuntimeViewport('(max-width: 799px)') === false &&
    getMobileDashboardVisualBottomOffset() === 0 &&
    addMobileDashboardBreakpointListener('(max-width: 799px)', breakpointListener) === false);
  const beforeNoWindowCalls = calls.length;
  addMobileDashboardWindowListener('resize', resizeListener);
  addMobileDashboardVisualViewportListener('resize', resizeListener);
  scrollMobileDashboardToTop();
  exposeMobileDashboardBindings({ mobileDashboardProbe: null });
  assert('optional browser actions no-op without window',
    calls.length === beforeNoWindowCalls && globalThis.mobileDashboardProbe === probe);
} finally {
  restoreRuntime();
}

const savedWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
try {
  delete globalThis.window;
  await import('../js/mobile-dashboard-runtime.js?no-window-probe');
  assert('mobile-dashboard runtime imports without a browser window', true);
} catch (error) {
  assert('mobile-dashboard runtime imports without a browser window', false, error?.message || String(error));
} finally {
  if (savedWindow) Object.defineProperty(globalThis, 'window', savedWindow);
  else delete globalThis.window;
}

console.log(`\nResults: ${pass} passed, ${fail} failed, ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
