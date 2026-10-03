import { importFreshModule } from './helpers/fresh-module.js';
import { setRuntimeValue, captureRuntimeGlobals } from './helpers/runtime-globals.js';
import { createLegacyAssertions } from './helpers/legacy-assertions.js';
// test-chat-render-runtime.js - Chat render browser adapter behavior.

import './_node-shim.js';
import {
  isChatRenderProductRecsEnabled,
  renderChatRecommendationSections,
} from '../js/chat-render-runtime.js';
import {
  configureRecommendationModuleBridge,
  setRecommendationsCatalogCache,
} from '../js/recommendations-runtime.js';

const { assert, results: legacyAssertions } = createLegacyAssertions(" - ");

console.log('=== Chat Render Runtime Tests ===\n');

const runtimeKeys = ['window'];
const restoreRuntime = captureRuntimeGlobals(runtimeKeys);

try {
  const calls: unknown[][] = [];
  const previousRecommendationBridge = configureRecommendationModuleBridge({
    isProductRecsEnabled: () => {
    calls.push(['enabled']);
    return true;
    },
    renderRecommendationSectionSync: (slot: unknown, options: {label?: unknown; maxProducts?: unknown}) => {
      calls.push(['render', slot, options]);
      return `<section>${options.label}:${slot}:${options.maxProducts}</section>`;
    },
  });
  setRecommendationsCatalogCache({
    slots: {
      'vitamins.vitaminD': { label: 'Vitamin D' },
    },
  });

  assert('isChatRenderProductRecsEnabled delegates runtime flag',
    isChatRenderProductRecsEnabled() === true && calls.some(call => call[0] === 'enabled'));

  const sections = renderChatRecommendationSections(['vitamins.vitaminD', 'minerals.magnesium']);
  assert('renderChatRecommendationSections renders all available slots',
    sections.length === 2
      && sections[0] === '<section>Vitamin D:vitamins.vitaminD:2</section>'
      && sections[1] === '<section>magnesium:minerals.magnesium:2</section>');
  assert('renderChatRecommendationSections passes slot labels and max product count',
    calls.some(call => call[0] === 'render'
      && call[1] === 'vitamins.vitaminD'
      && (call[2] as {label?: unknown; maxProducts?: unknown} | null | undefined)?.label === 'Vitamin D'
      && (call[2] as {label?: unknown; maxProducts?: unknown} | null | undefined)?.maxProducts === 2));
  assert('renderChatRecommendationSections falls back to final slot segment',
    calls.some(call => call[0] === 'render'
      && call[1] === 'minerals.magnesium'
      && (call[2] as {label?: unknown; maxProducts?: unknown} | null | undefined)?.label === 'magnesium'));

  configureRecommendationModuleBridge({ isProductRecsEnabled: () => false });
  assert('renderChatRecommendationSections returns empty when product recs are disabled',
    renderChatRecommendationSections(['vitamins.vitaminD']).length === 0);

  configureRecommendationModuleBridge({
    isProductRecsEnabled: () => true,
    renderRecommendationSectionSync: null,
  });
  assert('renderChatRecommendationSections requires the sync renderer',
    renderChatRecommendationSections(['vitamins.vitaminD']).length === 0);

  configureRecommendationModuleBridge({ renderRecommendationSectionSync: () => '<section>unused</section>' });
  setRecommendationsCatalogCache(null);
  assert('renderChatRecommendationSections requires cached catalog slots',
    renderChatRecommendationSections(['vitamins.vitaminD']).length === 0);

  setRecommendationsCatalogCache({ slots: {} });
  assert('renderChatRecommendationSections ignores non-array slot input',
    renderChatRecommendationSections('vitamins.vitaminD').length === 0);

  configureRecommendationModuleBridge({ isProductRecsEnabled: () => { throw new Error('boom'); } });
  assert('isChatRenderProductRecsEnabled returns false when runtime flag throws',
    isChatRenderProductRecsEnabled() === false);

  delete (globalThis as {window?: unknown}).window;
  configureRecommendationModuleBridge({
    isProductRecsEnabled: null,
    renderRecommendationSectionSync: null,
  });
  setRecommendationsCatalogCache(null);
  assert('runtime adapter no-ops safely when module hooks are missing',
    isChatRenderProductRecsEnabled() === false
      && renderChatRecommendationSections(['vitamins.vitaminD']).length === 0);
  configureRecommendationModuleBridge(previousRecommendationBridge);
} finally {
  configureRecommendationModuleBridge({
    isProductRecsEnabled: null,
    renderRecommendationSectionSync: null,
  });
  setRecommendationsCatalogCache(null);
  restoreRuntime();
}

const savedWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
try {
  delete (globalThis as {window?: unknown}).window;
  await importFreshModule(new URL('../js/chat-render-runtime.js?no-window-probe', import.meta.url));
  assert('chat-render runtime imports without a browser window', true);
} catch (error) {
  assert('chat-render runtime imports without a browser window', false, (error as {message?: unknown} | null | undefined)?.message || String(error));
} finally {
  if (savedWindow) Object.defineProperty(globalThis, 'window', savedWindow);
  else delete (globalThis as {window?: unknown}).window;
}

console.log(`\nResults: ${legacyAssertions.pass} passed, ${legacyAssertions.fail} failed, ${legacyAssertions.pass + legacyAssertions.fail} total`);
process.exit(legacyAssertions.fail > 0 ? 1 : 0);

export type PreservedOriginalRuntimeImport = typeof setRuntimeValue;
