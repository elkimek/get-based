// test-wearables-runtime.js - Wearables dashboard runtime adapter behavior.

import './_node-shim.js';
import {
  closeWearablesModal,
  exposeWearablesBindings,
  getWearablesViewportSize,
  navigateWearables,
  openEMFAssessmentAfterWearablesModalClose,
  openWearablesSettings,
} from '../js/wearables-runtime.js';

let pass = 0, fail = 0;
function assert(name, condition, detail) {
  if (condition) { pass++; console.log(`  PASS: ${name}`); }
  else { fail++; console.log(`  FAIL: ${name}${detail ? ' - ' + detail : ''}`); }
}

console.log('=== Wearables Runtime Tests ===\n');

const runtimeKeys = [
  'window',
  'navigate',
  'closeModal',
  'openSettingsModal',
  'openEMFAssessmentEditor',
  'setTimeout',
  'innerWidth',
  'innerHeight',
  'wearableProbe',
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
  setRuntimeValue('navigate', route => calls.push(['navigate', route]));
  setRuntimeValue('closeModal', () => calls.push(['close-modal']));
  setRuntimeValue('openSettingsModal', section => calls.push(['settings', section]));
  setRuntimeValue('openEMFAssessmentEditor', () => calls.push(['emf-editor']));
  setRuntimeValue('setTimeout', (fn, delay) => {
    calls.push(['timeout', delay]);
    fn();
    return 1;
  });
  setRuntimeValue('innerWidth', 377);
  setRuntimeValue('innerHeight', 812);

  navigateWearables('body');
  navigateWearables();
  closeWearablesModal();
  openWearablesSettings();
  openEMFAssessmentAfterWearablesModalClose(125);
  const viewport = getWearablesViewportSize();

  assert('navigateWearables delegates explicit route',
    calls.some(call => call[0] === 'navigate' && call[1] === 'body'));
  assert('navigateWearables defaults to dashboard',
    calls.some(call => call[0] === 'navigate' && call[1] === 'dashboard'));
  assert('closeWearablesModal delegates to runtime modal close',
    calls.some(call => call[0] === 'close-modal'));
  assert('openWearablesSettings opens wearables settings section',
    calls.some(call => call[0] === 'settings' && call[1] === 'wearables'));
  assert('openEMFAssessmentAfterWearablesModalClose closes then schedules EMF editor',
    calls.some(call => call[0] === 'timeout' && call[1] === 125)
      && calls.some(call => call[0] === 'emf-editor'));
  assert('getWearablesViewportSize reads browser viewport',
    viewport.width === 377 && viewport.height === 812);

  setRuntimeValue('innerWidth', 0);
  setRuntimeValue('innerHeight', 0);
  const zeroViewport = getWearablesViewportSize();
  assert('getWearablesViewportSize preserves zero browser viewport dimensions',
    zeroViewport.width === 0 && zeroViewport.height === 0);

  const lateCalls = [];
  delete globalThis.openEMFAssessmentEditor;
  setRuntimeValue('setTimeout', (fn, delay) => {
    lateCalls.push(['timeout', delay]);
    setRuntimeValue('openEMFAssessmentEditor', () => lateCalls.push(['emf-editor']));
    fn();
    return 2;
  });
  openEMFAssessmentAfterWearablesModalClose(75);
  assert('EMF editor binding is resolved after the close delay',
    lateCalls.some(call => call[0] === 'timeout' && call[1] === 75)
      && lateCalls.some(call => call[0] === 'emf-editor'));

  const probe = () => 'ok';
  exposeWearablesBindings({ wearableProbe: probe });
  assert('exposeWearablesBindings assigns runtime exports',
    globalThis.wearableProbe === probe);

  const beforeNoWindowCalls = calls.length;
  delete globalThis.window;
  navigateWearables('dashboard');
  closeWearablesModal();
  openWearablesSettings();
  openEMFAssessmentAfterWearablesModalClose(50);
  exposeWearablesBindings({ wearableProbe: null });
  const fallbackViewport = getWearablesViewportSize();
  assert('runtime adapter no-ops safely when window is missing',
    calls.length === beforeNoWindowCalls && globalThis.wearableProbe === probe);
  assert('viewport helper returns fallback size without window',
    fallbackViewport.width === 1024 && fallbackViewport.height === 768);
} finally {
  restoreRuntime();
}

const savedWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
try {
  delete globalThis.window;
  await import('../js/wearables.js?no-window-probe');
  assert('wearables module imports without a browser window', true);
} catch (error) {
  assert('wearables module imports without a browser window', false, error?.message || String(error));
} finally {
  if (savedWindow) Object.defineProperty(globalThis, 'window', savedWindow);
  else delete globalThis.window;
}

console.log(`\nResults: ${pass} passed, ${fail} failed, ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
