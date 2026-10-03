#!/usr/bin/env node
import type { getActiveData } from '../js/data.js';
import { setRuntimeValue, captureRuntimeGlobals } from './helpers/runtime-globals.js';
import { createLegacyAssertions } from './helpers/legacy-assertions.js';
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

const { assert, results: legacyAssertions } = createLegacyAssertions(" -- ");

console.log('=== Biology Scores Runtime Tests ===');

const runtimeKeys = ['window'];
const restoreRuntimeGlobals = captureRuntimeGlobals(runtimeKeys);
const savedAIStorage = {
  provider: localStorage.getItem('labcharts-ai-provider'),
  paused: localStorage.getItem('labcharts-ai-paused'),
  openrouterKey: localStorage.getItem('labcharts-openrouter-key'),
  openrouterCachedKey: getCachedKey('labcharts-openrouter-key'),
};

function restoreRuntime() {
  restoreRuntimeGlobals();
  if (savedAIStorage.provider == null) localStorage.removeItem('labcharts-ai-provider');
  else localStorage.setItem('labcharts-ai-provider', savedAIStorage.provider);
  if (savedAIStorage.paused == null) localStorage.removeItem('labcharts-ai-paused');
  else localStorage.setItem('labcharts-ai-paused', savedAIStorage.paused);
  if (savedAIStorage.openrouterKey == null) localStorage.removeItem('labcharts-openrouter-key');
  else localStorage.setItem('labcharts-openrouter-key', savedAIStorage.openrouterKey);
  updateKeyCache('labcharts-openrouter-key', savedAIStorage.openrouterCachedKey);
}

try {
  const calls: unknown[][] = [];
  const activeData = { dates: ['2026-06-01'], categories: {} };
  const browserRuntime: {
    navigate(route: string): void; openChatPanel?: (prompt?: string) => void; useChatPrompt(prompt: string): void;
    showNotification(message: unknown, type?: string): void; getActiveData?: () => typeof activeData;
    showDetailModal(markerId: string): void; setTimeout(callback: () => void, delay: number): number;
  } = {
    navigate(route: string) { calls.push(['navigate', route, this === browserRuntime]); },
    openChatPanel(prompt?: string) { calls.push(['chat', prompt, this === browserRuntime]); },
    useChatPrompt(prompt: string) { calls.push(['prompt', prompt, this === browserRuntime]); },
    showNotification(message: unknown, type?: string) { calls.push(['notification', message, type, this === browserRuntime]); },
    getActiveData() { calls.push(['data', this === browserRuntime]); return activeData; },
    showDetailModal(markerId: string) { calls.push(['detail', markerId, this === browserRuntime]); },
    setTimeout(callback: () => void, delay: number) {
      calls.push(['timeout', delay, this === browserRuntime]);
      callback();
      return 42;
    },
  };
  setRuntimeValue('window', browserRuntime);
  configureBiologyScoresRuntimeDeps({
    getActiveData: browserRuntime.getActiveData!.bind(browserRuntime) as typeof getActiveData,
    navigate: browserRuntime.navigate.bind(browserRuntime),
    openChatPanel: browserRuntime.openChatPanel!.bind(browserRuntime),
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

  delete (globalThis as { window?: Window }).window;
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
  delete (globalThis as { window?: Window }).window;
  const probeUrl = '../js/biology-scores-runtime.js?no-window-probe';
  const probe: Promise<unknown> = import(probeUrl);
  await probe;
  assert('biology runtime imports without a browser window', true);
} catch (error) {
  assert('biology runtime imports without a browser window', false, (error as { message?: string } | null | undefined)?.message || String(error));
} finally {
  if (savedWindow) Object.defineProperty(globalThis, 'window', savedWindow);
  else delete (globalThis as { window?: Window }).window;
}

console.log(`\nResults: ${legacyAssertions.pass} passed, ${legacyAssertions.fail} failed, ${legacyAssertions.pass + legacyAssertions.fail} total`);
if (legacyAssertions.fail > 0) process.exit(1);
