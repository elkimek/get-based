// test-category-customization-runtime.js - Category customization browser adapter behavior.

import './_node-shim.js';
import {
  getCategoryCustomizationBuildSidebar,
  getCategoryCustomizationViewportSize,
  navigateCategoryCustomizationRuntime,
  showCategoryCustomizationPrompt,
} from '../js/category-customization-runtime.js';

let pass = 0, fail = 0;
function assert(name, condition, detail) {
  if (condition) { pass++; console.log(`  PASS: ${name}`); }
  else { fail++; console.log(`  FAIL: ${name}${detail ? ' - ' + detail : ''}`); }
}

console.log('=== Category Customization Runtime Tests ===\n');

const runtimeKeys = [
  'window',
  'navigate',
  'buildSidebar',
  'showPromptDialog',
  'innerWidth',
  'innerHeight',
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
  const browserRuntime = {
    innerWidth: 812,
    innerHeight: 640,
    navigate(route, data) {
      calls.push(['navigate', route, data?.category]);
    },
    buildSidebar(data) {
      calls.push(['buildSidebar', data?.category, this === browserRuntime]);
    },
    async showPromptDialog(message, options) {
      calls.push(['prompt', message, options?.defaultValue, this === browserRuntime]);
      return '  renamed  ';
    },
  };
  setRuntimeValue('window', browserRuntime);

  navigateCategoryCustomizationRuntime('lipids', { category: 'lipids' });
  assert('navigateCategoryCustomizationRuntime delegates to browser navigate',
    calls.some(call => call[0] === 'navigate' && call[1] === 'lipids' && call[2] === 'lipids'));

  getCategoryCustomizationBuildSidebar()?.({ category: 'minerals' });
  assert('getCategoryCustomizationBuildSidebar returns a bound runtime callback',
    calls.some(call => call[0] === 'buildSidebar' && call[1] === 'minerals' && call[2] === true));

  const promptResult = await showCategoryCustomizationPrompt('Rename marker:', {
    defaultValue: 'ApoB',
    okLabel: 'Rename',
  });
  assert('showCategoryCustomizationPrompt delegates and returns prompt value',
    promptResult === '  renamed  '
      && calls.some(call => call[0] === 'prompt' && call[1] === 'Rename marker:' && call[2] === 'ApoB' && call[3] === true));

  const viewport = getCategoryCustomizationViewportSize();
  assert('getCategoryCustomizationViewportSize reads browser dimensions',
    viewport.width === 812 && viewport.height === 640);

  delete browserRuntime.navigate;
  delete browserRuntime.buildSidebar;
  delete browserRuntime.showPromptDialog;
  delete browserRuntime.innerWidth;
  delete browserRuntime.innerHeight;
  navigateCategoryCustomizationRuntime('missing');
  assert('runtime hooks no-op when browser callbacks are missing',
    getCategoryCustomizationBuildSidebar() === null
      && await showCategoryCustomizationPrompt('Missing callback') === undefined);
  const fallbackViewport = getCategoryCustomizationViewportSize();
  assert('viewport helper falls back when dimensions are missing',
    fallbackViewport.width === 1024 && fallbackViewport.height === 768);

  delete globalThis.window;
  let globalNavigateCalled = false;
  setRuntimeValue('navigate', route => { globalNavigateCalled = route === 'dashboard'; });
  navigateCategoryCustomizationRuntime('dashboard');
  assert('runtime hooks fall back to globalThis when window is missing', globalNavigateCalled);
} finally {
  restoreRuntime();
}

const savedWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
try {
  delete globalThis.window;
  await import('../js/category-customization-runtime.js?no-window-probe');
  assert('category customization runtime imports without a browser window', true);
} catch (error) {
  assert('category customization runtime imports without a browser window', false, error?.message || String(error));
} finally {
  if (savedWindow) Object.defineProperty(globalThis, 'window', savedWindow);
  else delete globalThis.window;
}

console.log(`\nResults: ${pass} passed, ${fail} failed, ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
