// test-chat-send-runtime.js - Chat send browser adapter behavior.

import './_node-shim.js';
import {
  detectChatSendSupplementSlots,
  getChatSendProviderAttestation,
  getChatSendRecommendationRuntime,
  isChatSendEMFRelevant,
  isChatSendProductRecsEnabled,
} from '../js/chat-send-runtime.js';
import { configureRecommendationModuleBridge } from '../js/recommendations-runtime.js';

let pass = 0, fail = 0;
function assert(name, condition, detail) {
  if (condition) { pass++; console.log(`  PASS: ${name}`); }
  else { fail++; console.log(`  FAIL: ${name}${detail ? ' - ' + detail : ''}`); }
}

console.log('=== Chat Send Runtime Tests ===\n');

const runtimeKeys = [
  'window',
  '_ppqAttestation',
  '_routstrAttestation',
  '_veniceAttestation',
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
  const ppqAttestation = { provider: 'ppq', verified: true };
  const routstrAttestation = { provider: 'routstr', verified: true };
  const veniceAttestation = { provider: 'venice', verified: true };
  setRuntimeValue('_ppqAttestation', ppqAttestation);
  setRuntimeValue('_routstrAttestation', routstrAttestation);
  setRuntimeValue('_veniceAttestation', veniceAttestation);
  const previousRecommendationBridge = configureRecommendationModuleBridge({
    isProductRecsEnabled: () => {
      calls.push(['enabled']);
      return true;
    },
    detectSupplementSlots: text => {
      calls.push(['slots', text]);
      return ['magnesium'];
    },
    detectEMFRelevance: text => {
      calls.push(['emf', text]);
      return text.includes('WiFi');
    },
    renderRecommendationSection: async slot => `<section>${slot}</section>`,
    renderRecommendationSectionSync: slot => `<section>${slot}</section>`,
    loadCatalog: async () => ({ slots: { magnesium: { label: 'Magnesium' } } }),
  });

  assert('getChatSendProviderAttestation reads PPQ attestation',
    getChatSendProviderAttestation('ppq') === ppqAttestation);
  assert('getChatSendProviderAttestation reads Routstr attestation',
    getChatSendProviderAttestation('routstr') === routstrAttestation);
  assert('getChatSendProviderAttestation reads Venice attestation for other providers',
    getChatSendProviderAttestation('venice') === veniceAttestation);
  assert('isChatSendProductRecsEnabled delegates runtime flag',
    isChatSendProductRecsEnabled() === true && calls.some(call => call[0] === 'enabled'));
  assert('detectChatSendSupplementSlots delegates when product recs are enabled',
    detectChatSendSupplementSlots('try magnesium').includes('magnesium'));
  assert('isChatSendEMFRelevant delegates when product recs are enabled',
    isChatSendEMFRelevant('WiFi in bedroom') === true && isChatSendEMFRelevant('generic fatigue') === false);
  const recommendationRuntime = getChatSendRecommendationRuntime();
  assert('getChatSendRecommendationRuntime returns bound renderer functions',
    typeof recommendationRuntime?.renderRecommendationSection === 'function'
      && typeof recommendationRuntime.renderRecommendationSectionSync === 'function'
      && typeof recommendationRuntime.loadCatalog === 'function');

  configureRecommendationModuleBridge({ isProductRecsEnabled: () => false });
  assert('detectChatSendSupplementSlots returns empty when product recs are disabled',
    detectChatSendSupplementSlots('try magnesium').length === 0);
  assert('isChatSendEMFRelevant returns false when product recs are disabled',
    isChatSendEMFRelevant('WiFi in bedroom') === false);

  configureRecommendationModuleBridge({ renderRecommendationSectionSync: null });
  assert('getChatSendRecommendationRuntime requires the sync renderer',
    getChatSendRecommendationRuntime() === null);

  delete globalThis.window;
  configureRecommendationModuleBridge({
    isProductRecsEnabled: null,
    detectSupplementSlots: null,
    detectEMFRelevance: null,
    renderRecommendationSection: null,
    renderRecommendationSectionSync: null,
    loadCatalog: null,
  });
  assert('runtime adapter no-ops safely when module hooks are missing',
    getChatSendProviderAttestation('ppq') === undefined
      && isChatSendProductRecsEnabled() === false
      && detectChatSendSupplementSlots('try magnesium').length === 0
      && isChatSendEMFRelevant('WiFi in bedroom') === false
      && getChatSendRecommendationRuntime() === null);
  configureRecommendationModuleBridge(previousRecommendationBridge);
} finally {
  configureRecommendationModuleBridge({
    isProductRecsEnabled: null,
    detectSupplementSlots: null,
    detectEMFRelevance: null,
    renderRecommendationSection: null,
    renderRecommendationSectionSync: null,
    loadCatalog: null,
  });
  restoreRuntime();
}

const savedWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
try {
  delete globalThis.window;
  await import('../js/chat-send-runtime.js?no-window-probe');
  assert('chat-send runtime imports without a browser window', true);
} catch (error) {
  assert('chat-send runtime imports without a browser window', false, error?.message || String(error));
} finally {
  if (savedWindow) Object.defineProperty(globalThis, 'window', savedWindow);
  else delete globalThis.window;
}

console.log(`\nResults: ${pass} passed, ${fail} failed, ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
