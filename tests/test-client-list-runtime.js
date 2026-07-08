#!/usr/bin/env node
// test-client-list-runtime.js - Client-list browser runtime adapter behavior.

import './_node-shim.js';
import { getCachedKey, updateKeyCache } from '../js/crypto.js';
import {
  closeClientListFromRuntime,
  getClientHaplogroupList,
  hasClientListAIProvider,
  navigateClientListRoute,
  publishClientListWindowBindings,
  refreshClientProfileButton,
  setClientManualHaplogroup,
  showClientListNotification,
} from '../js/client-list-runtime.js';

let pass = 0, fail = 0;
function assert(name, condition, detail) {
  if (condition) { pass++; console.log(`  PASS: ${name}`); }
  else { fail++; console.log(`  FAIL: ${name}${detail ? ' — ' + detail : ''}`); }
}

console.log('=== Client List Runtime Tests ===\n');

const runtimeKeys = [
  'HAPLOGROUP_LIST',
  'closeClientList',
  'navigate',
  'renderProfileButton',
  'showNotification',
  'setManualHaplogroup',
  '__clientListRuntimeProbe',
];
const saved = Object.fromEntries(runtimeKeys.map(key => [key, globalThis[key]]));
const savedAIStorage = {
  provider: localStorage.getItem('labcharts-ai-provider'),
  paused: localStorage.getItem('labcharts-ai-paused'),
  openrouterKey: localStorage.getItem('labcharts-openrouter-key'),
  openrouterCachedKey: getCachedKey('labcharts-openrouter-key'),
};

function restoreRuntime() {
  for (const key of runtimeKeys) {
    if (typeof saved[key] === 'undefined') delete globalThis[key];
    else globalThis[key] = saved[key];
  }
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

  globalThis.HAPLOGROUP_LIST = ['H1', 'J2'];
  assert('getClientHaplogroupList reads runtime haplogroup list',
    getClientHaplogroupList().join(',') === 'H1,J2');
  globalThis.HAPLOGROUP_LIST = 'H1';
  assert('getClientHaplogroupList falls back to empty array for invalid runtime value',
    getClientHaplogroupList().length === 0);

  globalThis.closeClientList = () => calls.push(['close']);
  closeClientListFromRuntime(() => calls.push(['fallback-close']));
  delete globalThis.closeClientList;
  closeClientListFromRuntime(() => calls.push(['fallback-close']));
  assert('closeClientListFromRuntime prefers runtime close and falls back when missing',
    calls.filter(call => call[0] === 'close').length === 1 &&
    calls.filter(call => call[0] === 'fallback-close').length === 1);

  globalThis.navigate = route => calls.push(['navigate', route]);
  navigateClientListRoute('dashboard');
  assert('navigateClientListRoute delegates to runtime navigate',
    calls.some(call => call[0] === 'navigate' && call[1] === 'dashboard'));

  globalThis.renderProfileButton = () => calls.push(['render-profile-button']);
  refreshClientProfileButton();
  assert('refreshClientProfileButton delegates to runtime profile refresh',
    calls.some(call => call[0] === 'render-profile-button'));

  globalThis.showNotification = (message, type) => calls.push(['notification', message, type]);
  showClientListNotification('"Ada" updated', 'info');
  assert('showClientListNotification delegates runtime notification',
    calls.some(call => call[0] === 'notification' && call[1] === '"Ada" updated' && call[2] === 'info'));

  globalThis.setManualHaplogroup = async haplogroup => {
    calls.push(['set-haplogroup', haplogroup]);
    return true;
  };
  assert('setClientManualHaplogroup delegates runtime haplogroup setter',
    await setClientManualHaplogroup('H1') === true &&
    calls.some(call => call[0] === 'set-haplogroup' && call[1] === 'H1'));
  delete globalThis.setManualHaplogroup;
  assert('setClientManualHaplogroup returns false when hook is missing',
    await setClientManualHaplogroup('J2') === false);

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

  publishClientListWindowBindings({ __clientListRuntimeProbe: () => 'ok' });
  assert('publishClientListWindowBindings installs legacy globals',
    globalThis.__clientListRuntimeProbe?.() === 'ok');
} finally {
  restoreRuntime();
}

console.log(`\nResults: ${pass} passed, ${fail} failed, ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
