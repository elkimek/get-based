import { importFreshModule } from './helpers/fresh-module.js';
import { setRuntimeValue, captureRuntimeGlobals } from './helpers/runtime-globals.js';
import { createLegacyAssertions } from './helpers/legacy-assertions.js';
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

const { assert, results: legacyAssertions } = createLegacyAssertions(" - ");

console.log('=== Category Page Runtime Tests ===\n');

const runtimeKeys = ['window'];
const restoreRuntime = captureRuntimeGlobals(runtimeKeys);

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

  delete (globalThis as {window?: unknown}).window;
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
  delete (globalThis as {window?: unknown}).window;
  await importFreshModule(new URL('../js/category-page-runtime.js?no-window-probe', import.meta.url));
  assert('category-page runtime imports without a browser window', true);
} catch (error) {
  assert('category-page runtime imports without a browser window', false, (error as {message?: unknown} | null | undefined)?.message || String(error));
} finally {
  if (savedWindow) Object.defineProperty(globalThis, 'window', savedWindow);
  else delete (globalThis as {window?: unknown}).window;
}

console.log(`\nResults: ${legacyAssertions.pass} passed, ${legacyAssertions.fail} failed, ${legacyAssertions.pass + legacyAssertions.fail} total`);
process.exit(legacyAssertions.fail > 0 ? 1 : 0);

export type PreservedOriginalRuntimeImport = typeof setRuntimeValue;
