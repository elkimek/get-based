#!/usr/bin/env node
// Recommendations runtime adapter behavior.

import './_node-shim.js';
import {
  closeRecommendationsModal,
  configureRecommendationModuleBridge,
  configureRecommendationsRuntime,
  getRecommendationModuleFunction,
  getRecommendationsCatalogCache,
  getRecommendationsSnpTable,
  isRecommendationsProductRecsEnabled,
  loadRecommendationsCatalogRuntime,
  openRecommendationsChatPanel,
  openRecommendationsEmfAssessment,
  openRecommendationsLocationEditor,
  openRecommendationsPrivacySettings,
  renderRecommendationsDetailSection,
  scheduleRecommendationsTask,
  setRecommendationsCatalogCache,
} from '../js/recommendations-runtime.js';
import { configureViewRuntime } from '../js/views-runtime-bridge.js';

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

console.log('=== Recommendations Runtime Tests ===');

const savedWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
let previousViewRuntime = null;
let previousRecommendationModule = null;

function setRuntime(value) {
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    writable: true,
    enumerable: true,
    value,
  });
}

function restoreWindow() {
  if (savedWindow) Object.defineProperty(globalThis, 'window', savedWindow);
  else delete globalThis.window;
}

try {
  const snpTable = { rs123: { snpHints: {} } };
  const calls = [];
  previousViewRuntime = configureViewRuntime({
    closeModal: () => calls.push(['bridge-close']),
  });
  const runtime = {
    _snpTableCache: snpTable,
    closeModal() { calls.push(['close', this === runtime]); },
    openProfileLocationEditor() { calls.push(['location', this === runtime]); },
    openSettingsTab(tab) { calls.push(['settings', tab, this === runtime]); },
    openChatPanel(prompt) { calls.push(['chat', prompt, this === runtime]); },
  };
  previousRecommendationModule = configureRecommendationModuleBridge({
    isProductRecsEnabled() { calls.push(['enabled']); return true; },
    async loadCatalog() { calls.push(['catalog']); return { slots: { magnesium: { label: 'Magnesium' } } }; },
    async renderRecommendationSection(slotKey, options) {
      calls.push(['render', slotKey, options]);
      return `<section>${slotKey}</section>`;
    },
  });
  Object.assign(runtime, {
    setTimeout(callback, delay) {
      calls.push(['timeout', delay, this === runtime]);
      callback();
      return 17;
    },
  });
  setRuntime(runtime);
  const restoreRecommendationsRuntime = configureRecommendationsRuntime({
    openEMFAssessmentEditor: () => calls.push(['emf', true]),
    openProfileLocationEditor: () => runtime.openProfileLocationEditor(),
  });

  const timerId = scheduleRecommendationsTask(() => calls.push(['task']), 125);
  setRecommendationsCatalogCache({ slots: { cached: { label: 'Cached' } } });

  assert('recommendations runtime reads SNP table cache',
    getRecommendationsSnpTable() === snpTable);
  const catalog = await loadRecommendationsCatalogRuntime();
  assert('recommendations runtime delegates product recs flag and catalog loader',
    isRecommendationsProductRecsEnabled() === true &&
      catalog?.slots?.magnesium?.label === 'Magnesium' &&
      calls.some(call => call[0] === 'enabled') &&
      calls.some(call => call[0] === 'catalog'));
  const detailHtml = await renderRecommendationsDetailSection('minerals.magnesium', { label: 'Options' });
  assert('recommendations runtime delegates detail rendering and chat panel hooks',
    detailHtml === '<section>minerals.magnesium</section>' &&
      openRecommendationsChatPanel('Discuss this') &&
      calls.some(call => call[0] === 'render'
        && call[1] === 'minerals.magnesium'
        && call[2]?.label === 'Options') &&
      calls.some(call => call[0] === 'chat' && call[1] === 'Discuss this' && call[2] === true));
  assert('recommendations runtime delegates host modal and editor hooks',
    closeRecommendationsModal() &&
      openRecommendationsEmfAssessment() &&
      openRecommendationsLocationEditor() &&
      openRecommendationsPrivacySettings() &&
      calls.some(call => call[0] === 'close' && call[1] === true) &&
      calls.some(call => call[0] === 'emf' && call[1] === true) &&
      calls.some(call => call[0] === 'location' && call[1] === true) &&
      calls.some(call => call[0] === 'settings' && call[1] === 'privacy' && call[2] === true));
  assert('recommendations runtime delegates timers with browser binding',
    timerId === 17 &&
      calls.some(call => call[0] === 'timeout' && call[1] === 125 && call[2] === true) &&
      calls.some(call => call[0] === 'task'));
  assert('recommendations runtime exposes cycle-safe module hooks and catalog cache',
    typeof getRecommendationModuleFunction('loadCatalog') === 'function'
      && getRecommendationsCatalogCache()?.slots?.cached?.label === 'Cached'
      && !('loadCatalog' in runtime));
  const restoreProbe = configureRecommendationModuleBridge({
    recommendationProbe: () => 'ok',
  });
  const probeRegistered = getRecommendationModuleFunction('recommendationProbe')?.() === 'ok';
  configureRecommendationModuleBridge(restoreProbe);
  assert('recommendation module bridge snapshots remove newly added callbacks on restore',
    probeRegistered && getRecommendationModuleFunction('recommendationProbe') === null);

  delete runtime.closeModal;
  delete runtime.openProfileLocationEditor;
  configureRecommendationsRuntime({ openProfileLocationEditor: null });
  delete runtime.openSettingsTab;
  delete runtime.openChatPanel;
  configureRecommendationModuleBridge({
    isProductRecsEnabled: null,
    loadCatalog: null,
    renderRecommendationSection: null,
  });
  setRecommendationsCatalogCache(null);
  delete runtime._snpTableCache;
  assert('recommendations runtime handles missing optional browser hooks',
    getRecommendationsSnpTable() === null &&
      isRecommendationsProductRecsEnabled() === false &&
      await loadRecommendationsCatalogRuntime() === null &&
      await renderRecommendationsDetailSection('missing.slot', {}) === '' &&
      closeRecommendationsModal() === true &&
      calls.some(call => call[0] === 'bridge-close') &&
      openRecommendationsChatPanel('No-op') === false &&
      openRecommendationsEmfAssessment() === true &&
      openRecommendationsLocationEditor() === false &&
      openRecommendationsPrivacySettings() === false);
  configureRecommendationsRuntime(restoreRecommendationsRuntime);

  delete globalThis.window;
  assert('recommendations runtime no-ops without browser window',
    getRecommendationsSnpTable() === null &&
      isRecommendationsProductRecsEnabled() === false &&
      await loadRecommendationsCatalogRuntime() === null &&
      await renderRecommendationsDetailSection('missing.slot', {}) === '' &&
      openRecommendationsChatPanel('No-op') === false &&
      getRecommendationsCatalogCache() === null);
} finally {
  configureRecommendationModuleBridge({
    isProductRecsEnabled: null,
    loadCatalog: null,
    renderRecommendationSection: null,
    ...previousRecommendationModule,
  });
  setRecommendationsCatalogCache(null);
  if (previousViewRuntime?.closeModal) configureViewRuntime(previousViewRuntime);
  restoreWindow();
}

try {
  delete globalThis.window;
  await import('../js/recommendations-runtime.js?no-window-probe');
  assert('recommendations runtime imports without a browser window', true);
} catch (error) {
  assert('recommendations runtime imports without a browser window', false, error?.message || String(error));
} finally {
  restoreWindow();
}

console.log(`\nResults: ${passed} passed, ${failed} failed, ${passed + failed} total`);
if (failed > 0) process.exit(1);
