#!/usr/bin/env node
// test-client-list-runtime.js - Client-list browser runtime adapter behavior.

import './_node-shim.js';
import { getCachedKey, updateKeyCache } from '../js/crypto.js';
import { configureDnaModuleBridge } from '../js/dna-runtime-bridge.js';
import {
  configureClientListRuntimeDeps,
  getClientHaplogroupList,
  hasClientListAIProvider,
  navigateClientListRoute,
  refreshClientProfileButton,
  setClientManualHaplogroup,
  showClientListNotification,
} from '../js/client-list-runtime.js';

const originalClientListRuntimeDeps = configureClientListRuntimeDeps();

let pass = 0, fail = 0;
function assert(name, condition, detail) {
  if (condition) { pass++; console.log(`  PASS: ${name}`); }
  else { fail++; console.log(`  FAIL: ${name}${detail ? ' — ' + detail : ''}`); }
}

console.log('=== Client List Runtime Tests ===\n');

const savedAIStorage = {
  provider: localStorage.getItem('labcharts-ai-provider'),
  paused: localStorage.getItem('labcharts-ai-paused'),
  openrouterKey: localStorage.getItem('labcharts-openrouter-key'),
  openrouterCachedKey: getCachedKey('labcharts-openrouter-key'),
};
const previousDnaBridge = configureDnaModuleBridge({
  HAPLOGROUP_LIST: null,
  setManualHaplogroup: null,
});

function restoreRuntime() {
  if (savedAIStorage.provider == null) localStorage.removeItem('labcharts-ai-provider');
  else localStorage.setItem('labcharts-ai-provider', savedAIStorage.provider);
  if (savedAIStorage.paused == null) localStorage.removeItem('labcharts-ai-paused');
  else localStorage.setItem('labcharts-ai-paused', savedAIStorage.paused);
  if (savedAIStorage.openrouterKey == null) localStorage.removeItem('labcharts-openrouter-key');
  else localStorage.setItem('labcharts-openrouter-key', savedAIStorage.openrouterKey);
  updateKeyCache('labcharts-openrouter-key', savedAIStorage.openrouterCachedKey);
}

try {
  const calls = [];
  configureClientListRuntimeDeps({
    navigate: route => calls.push(['navigate', route]),
    renderProfileButton: () => calls.push(['render-profile-button']),
    showNotification: (message, type) => calls.push(['notification', message, type]),
  });

  configureDnaModuleBridge({ HAPLOGROUP_LIST: ['H1', 'J2'] });
  assert('getClientHaplogroupList reads module haplogroup list',
    getClientHaplogroupList().join(',') === 'H1,J2');
  configureDnaModuleBridge({ HAPLOGROUP_LIST: 'H1' });
  assert('getClientHaplogroupList falls back to empty array for invalid module value',
    getClientHaplogroupList().length === 0);

  navigateClientListRoute('dashboard');
  assert('navigateClientListRoute delegates to runtime navigate',
    calls.some(call => call[0] === 'navigate' && call[1] === 'dashboard'));

  refreshClientProfileButton();
  assert('refreshClientProfileButton delegates to runtime profile refresh',
    calls.some(call => call[0] === 'render-profile-button'));

  showClientListNotification('"Ada" updated', 'info');
  assert('showClientListNotification delegates runtime notification',
    calls.some(call => call[0] === 'notification' && call[1] === '"Ada" updated' && call[2] === 'info'));

  configureDnaModuleBridge({ setManualHaplogroup: async haplogroup => {
    calls.push(['set-haplogroup', haplogroup]);
    return true;
  } });
  assert('setClientManualHaplogroup delegates module haplogroup setter',
    await setClientManualHaplogroup('H1') === true &&
    calls.some(call => call[0] === 'set-haplogroup' && call[1] === 'H1'));
  configureDnaModuleBridge({ setManualHaplogroup: null });
  assert('setClientManualHaplogroup returns false when hook is missing',
    await setClientManualHaplogroup('J2') === false);

  configureClientListRuntimeDeps({ navigate: null, renderProfileButton: null });
  const beforeMissingViewCalls = calls.length;
  navigateClientListRoute('labs');
  refreshClientProfileButton();
  assert('client list view callbacks no-op safely when unavailable',
    calls.length === beforeMissingViewCalls);

  localStorage.setItem('labcharts-ai-provider', 'ollama');
  localStorage.removeItem('labcharts-ai-paused');
  assert('hasClientListAIProvider reads connected module provider state',
    hasClientListAIProvider() === true);
  localStorage.setItem('labcharts-ai-paused', 'true');
  assert('hasClientListAIProvider returns false when AI is paused',
    hasClientListAIProvider() === false);
  localStorage.removeItem('labcharts-ai-paused');
  localStorage.setItem('labcharts-ai-provider', 'openrouter');
  localStorage.removeItem('labcharts-openrouter-key');
  updateKeyCache('labcharts-openrouter-key', null);
  assert('hasClientListAIProvider returns false when selected provider is unconfigured',
    hasClientListAIProvider() === false);

} finally {
  configureDnaModuleBridge({
    HAPLOGROUP_LIST: null,
    setManualHaplogroup: null,
    ...previousDnaBridge,
  });
  configureClientListRuntimeDeps(originalClientListRuntimeDeps);
  restoreRuntime();
}

console.log(`\nResults: ${pass} passed, ${fail} failed, ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
