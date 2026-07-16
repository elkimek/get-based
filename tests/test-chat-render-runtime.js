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

let pass = 0, fail = 0;
function assert(name, condition, detail) {
  if (condition) { pass++; console.log(`  PASS: ${name}`); }
  else { fail++; console.log(`  FAIL: ${name}${detail ? ' - ' + detail : ''}`); }
}

console.log('=== Chat Render Runtime Tests ===\n');

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
  const calls = [];
  const previousRecommendationBridge = configureRecommendationModuleBridge({
    isProductRecsEnabled: () => {
    calls.push(['enabled']);
    return true;
    },
    renderRecommendationSectionSync: (slot, options) => {
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
      && call[2]?.label === 'Vitamin D'
      && call[2]?.maxProducts === 2));
  assert('renderChatRecommendationSections falls back to final slot segment',
    calls.some(call => call[0] === 'render'
      && call[1] === 'minerals.magnesium'
      && call[2]?.label === 'magnesium'));

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

  delete globalThis.window;
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
  delete globalThis.window;
  await import('../js/chat-render-runtime.js?no-window-probe');
  assert('chat-render runtime imports without a browser window', true);
} catch (error) {
  assert('chat-render runtime imports without a browser window', false, error?.message || String(error));
} finally {
  if (savedWindow) Object.defineProperty(globalThis, 'window', savedWindow);
  else delete globalThis.window;
}

console.log(`\nResults: ${pass} passed, ${fail} failed, ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
