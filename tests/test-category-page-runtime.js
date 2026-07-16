// test-category-page-runtime.js - Category page browser adapter behavior.

import './_node-shim.js';
import {
  getCategoryPageCatalogSlots,
  primeCategoryPageCatalogCache,
} from '../js/category-page-runtime.js';
import {
  configureRecommendationModuleBridge,
  setRecommendationsCatalogCache,
} from '../js/recommendations-runtime.js';

let pass = 0, fail = 0;
function assert(name, condition, detail) {
  if (condition) { pass++; console.log(`  PASS: ${name}`); }
  else { fail++; console.log(`  FAIL: ${name}${detail ? ' - ' + detail : ''}`); }
}

console.log('=== Category Page Runtime Tests ===\n');

const runtimeKeys = ['window'];
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
  const cachedSlots = {
    'vitamins.vitaminD': { label: 'Vitamin D' },
  };
  setRecommendationsCatalogCache({ slots: cachedSlots });
  assert('getCategoryPageCatalogSlots returns cached slot map',
    getCategoryPageCatalogSlots() === cachedSlots);

  let loadCalls = 0;
  const previousRecommendationBridge = configureRecommendationModuleBridge({
    loadCatalog: async () => {
      loadCalls += 1;
      return { slots: { 'minerals.magnesium': { label: 'Magnesium' } } };
    },
  });
  assert('primeCategoryPageCatalogCache skips when cache already exists',
    primeCategoryPageCatalogCache() === null && loadCalls === 0);

  setRecommendationsCatalogCache(null);
  const loadedCatalog = await primeCategoryPageCatalogCache();
  assert('primeCategoryPageCatalogCache loads and stores catalog when missing',
    loadCalls === 1
      && loadedCatalog?.slots?.['minerals.magnesium']?.label === 'Magnesium'
      && getCategoryPageCatalogSlots() === loadedCatalog.slots);

  setRecommendationsCatalogCache(null);
  configureRecommendationModuleBridge({ loadCatalog: () => ({ slots: {} }) });
  assert('primeCategoryPageCatalogCache ignores non-promise loaders',
    primeCategoryPageCatalogCache() === null && getCategoryPageCatalogSlots() === null);

  configureRecommendationModuleBridge({ loadCatalog: null });
  assert('primeCategoryPageCatalogCache no-ops when loader is missing',
    primeCategoryPageCatalogCache() === null);

  delete globalThis.window;
  assert('runtime adapter no-ops safely when module hooks are missing',
    getCategoryPageCatalogSlots() === null && primeCategoryPageCatalogCache() === null);
  configureRecommendationModuleBridge(previousRecommendationBridge);
} finally {
  configureRecommendationModuleBridge({ loadCatalog: null });
  setRecommendationsCatalogCache(null);
  restoreRuntime();
}

const savedWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
try {
  delete globalThis.window;
  await import('../js/category-page-runtime.js?no-window-probe');
  assert('category-page runtime imports without a browser window', true);
} catch (error) {
  assert('category-page runtime imports without a browser window', false, error?.message || String(error));
} finally {
  if (savedWindow) Object.defineProperty(globalThis, 'window', savedWindow);
  else delete globalThis.window;
}

console.log(`\nResults: ${pass} passed, ${fail} failed, ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
