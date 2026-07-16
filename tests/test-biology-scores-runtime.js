#!/usr/bin/env node
// Biology Scores runtime adapter behavior.

import './_node-shim.js';
import { getCachedKey, updateKeyCache } from '../js/crypto.js';
import {
  canOpenBiologyScoresChatPanel,
  configureBiologyScoresRuntimeDeps,
  getBiologyScoresActiveData,
  hasBiologyScoresAIProvider,
  navigateBiologyScoresRoute,
  openBiologyScoreMarkerDetail,
  openBiologyScoresChatPanel,
  scheduleBiologyScoresTask,
  showBiologyScoresNotification,
  useBiologyScoresChatPrompt,
} from '../js/biology-scores-runtime.js';

const originalBiologyScoresRuntimeDeps = configureBiologyScoresRuntimeDeps();

let passed = 0;
let failed = 0;

function assert(name, condition, detail = '') {
  if (condition) {
    passed++;
    console.log(`  PASS: ${name}`);
  } else {
    failed++;
    console.log(`  FAIL: ${name}${detail ? ` -- ${detail}` : ''}`);
  }
}

console.log('=== Biology Scores Runtime Tests ===');

const runtimeKeys = ['window'];
const savedDescriptors = new Map(runtimeKeys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
const savedAIStorage = {
  provider: localStorage.getItem('labcharts-ai-provider'),
  paused: localStorage.getItem('labcharts-ai-paused'),
  openrouterKey: localStorage.getItem('labcharts-openrouter-key'),
  openrouterCachedKey: getCachedKey('labcharts-openrouter-key'),
};

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
  const activeData = { dates: ['2026-06-01'], categories: {} };
  const browserRuntime = {
    navigate(route) { calls.push(['navigate', route, this === browserRuntime]); },
    openChatPanel(prompt) { calls.push(['chat', prompt, this === browserRuntime]); },
    useChatPrompt(prompt) { calls.push(['prompt', prompt, this === browserRuntime]); },
    showNotification(message, type) { calls.push(['notification', message, type, this === browserRuntime]); },
    getActiveData() { calls.push(['data', this === browserRuntime]); return activeData; },
    showDetailModal(markerId) { calls.push(['detail', markerId, this === browserRuntime]); },
    setTimeout(callback, delay) {
      calls.push(['timeout', delay, this === browserRuntime]);
      callback();
      return 42;
    },
  };
  setRuntimeValue('window', browserRuntime);
  configureBiologyScoresRuntimeDeps({
    getActiveData: browserRuntime.getActiveData.bind(browserRuntime),
    navigate: browserRuntime.navigate.bind(browserRuntime),
    openChatPanel: browserRuntime.openChatPanel.bind(browserRuntime),
    showDetailModal: browserRuntime.showDetailModal.bind(browserRuntime),
    showNotification: browserRuntime.showNotification.bind(browserRuntime),
    useChatPrompt: browserRuntime.useChatPrompt.bind(browserRuntime),
  });
  localStorage.setItem('labcharts-ai-provider', 'openrouter');
  localStorage.removeItem('labcharts-ai-paused');
  localStorage.removeItem('labcharts-openrouter-key');
  updateKeyCache('labcharts-openrouter-key', null);

  navigateBiologyScoresRoute('biology-scores');
  openBiologyScoresChatPanel();
  openBiologyScoresChatPanel('Plan labs');
  useBiologyScoresChatPrompt('Interpret score');
  showBiologyScoresNotification('Saved', 'success');
  const providerStatus = hasBiologyScoresAIProvider();
  const data = getBiologyScoresActiveData();
  openBiologyScoreMarkerDetail('biochemistry_glucose');
  const timerId = scheduleBiologyScoresTask(() => calls.push(['task']), 125);

  assert('biology runtime delegates navigation',
    calls.some(call => call[0] === 'navigate' && call[1] === 'biology-scores' && call[2] === true));
  assert('biology runtime delegates chat panel opens with optional prompts',
    canOpenBiologyScoresChatPanel() &&
      calls.some(call => call[0] === 'chat' && call[1] === undefined && call[2] === true) &&
      calls.some(call => call[0] === 'chat' && call[1] === 'Plan labs' && call[2] === true));
  assert('biology runtime delegates prompt notification and provider hooks',
    providerStatus === false &&
      calls.some(call => call[0] === 'prompt' && call[1] === 'Interpret score' && call[2] === true) &&
      calls.some(call => call[0] === 'notification' && call[1] === 'Saved' && call[2] === 'success' && call[3] === true));
  assert('biology runtime delegates active data and marker detail hooks',
    data === activeData &&
      calls.some(call => call[0] === 'data' && call[1] === true) &&
      calls.some(call => call[0] === 'detail' && call[1] === 'biochemistry_glucose' && call[2] === true));
  assert('biology runtime delegates timers with browser binding',
    timerId === 42 &&
      calls.some(call => call[0] === 'timeout' && call[1] === 125 && call[2] === true) &&
      calls.some(call => call[0] === 'task'));

  delete browserRuntime.openChatPanel;
  delete browserRuntime.getActiveData;
  configureBiologyScoresRuntimeDeps({
    getActiveData: null,
    navigate: null,
    openChatPanel: null,
    showDetailModal: null,
    useChatPrompt: null,
  });
  assert('biology runtime handles missing optional browser hooks',
    !canOpenBiologyScoresChatPanel() &&
      openBiologyScoresChatPanel('missing') === false &&
      openBiologyScoreMarkerDetail('biochemistry_glucose') === false &&
      hasBiologyScoresAIProvider() === false &&
      Object.keys(getBiologyScoresActiveData()).length === 0);

  delete globalThis.window;
  assert('biology runtime adapter no-ops without a browser window',
    !canOpenBiologyScoresChatPanel() &&
      openBiologyScoreMarkerDetail('biochemistry_glucose') === false &&
      openBiologyScoresChatPanel() === false);
} finally {
  configureBiologyScoresRuntimeDeps(originalBiologyScoresRuntimeDeps);
  restoreRuntime();
}

const savedWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
try {
  delete globalThis.window;
  await import('../js/biology-scores-runtime.js?no-window-probe');
  assert('biology runtime imports without a browser window', true);
} catch (error) {
  assert('biology runtime imports without a browser window', false, error?.message || String(error));
} finally {
  if (savedWindow) Object.defineProperty(globalThis, 'window', savedWindow);
  else delete globalThis.window;
}

console.log(`\nResults: ${passed} passed, ${failed} failed, ${passed + failed} total`);
if (failed > 0) process.exit(1);
