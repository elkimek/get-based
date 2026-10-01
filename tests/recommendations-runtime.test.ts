import { expect, it } from 'vitest';
import { createLegacyAssertions } from './helpers/legacy-assertions.js';
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
import type { RecommendationSnpTable } from '../js/recommendations-runtime.js';




it('retains recommendations runtime adapter behavior', async () => {
  const { assert, results: legacyAssertions } = createLegacyAssertions(" -- ");

  console.log('=== Recommendations Runtime Tests ===');

  const savedWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  let previousRecommendationModule: ReturnType<typeof configureRecommendationModuleBridge> | null = null;

  function setRuntime(value: unknown) {
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      writable: true,
      enumerable: true,
      value,
    });
  }

  function restoreWindow() {
    if (savedWindow) Object.defineProperty(globalThis, 'window', savedWindow);
    else delete (globalThis as { window?: unknown }).window;
  }

  try {
    const snpTable = { rs123: { snpHints: {} } };
    const calls: unknown[][] = [];
    const runtime: {
      _snpTableCache?: RecommendationSnpTable;
      openProfileLocationEditor?: () => void;
      openChatPanel: (prompt?: string) => void;
    } = {
      _snpTableCache: snpTable,
      openProfileLocationEditor() { calls.push(['location', this === runtime]); },
      openChatPanel(prompt) { calls.push(['chat', prompt, this === runtime]); },
    };
    previousRecommendationModule = configureRecommendationModuleBridge({
      isProductRecsEnabled() { calls.push(['enabled']); return true; },
      async loadCatalog() { calls.push(['catalog']); return { slots: { magnesium: { label: 'Magnesium' } } }; },
      async renderRecommendationSection(slotKey: string, options: unknown) {
        calls.push(['render', slotKey, options]);
        return `<section>${slotKey}</section>`;
      },
    });
    Object.assign(runtime, {
      setTimeout(this: typeof runtime, callback: () => void, delay: number) {
        calls.push(['timeout', delay, this === runtime]);
        callback();
        return 17;
      },
    });
    setRuntime(runtime);
    const restoreRecommendationsRuntime = configureRecommendationsRuntime({
      closeModal: () => calls.push(['close']),
      openEMFAssessmentEditor: () => calls.push(['emf', true]),
      openChatPanel: prompt => runtime.openChatPanel(prompt),
      openProfileLocationEditor: () => runtime.openProfileLocationEditor!(),
      openSettingsModal: tab => calls.push(['settings', tab]),
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
          && (call[2] as { label?: string } | undefined)?.label === 'Options') &&
        calls.some(call => call[0] === 'chat' && call[1] === 'Discuss this' && call[2] === true));
    assert('recommendations runtime delegates host modal and editor hooks',
      closeRecommendationsModal() &&
        openRecommendationsEmfAssessment() &&
        openRecommendationsLocationEditor() &&
        openRecommendationsPrivacySettings() &&
        calls.some(call => call[0] === 'close') &&
        calls.some(call => call[0] === 'emf' && call[1] === true) &&
        calls.some(call => call[0] === 'location' && call[1] === true) &&
        calls.some(call => call[0] === 'settings' && call[1] === 'privacy'));
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

    delete runtime.openProfileLocationEditor;
    configureRecommendationsRuntime({
      closeModal: null,
      openChatPanel: null,
      openProfileLocationEditor: null,
      openSettingsModal: null,
    });
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
        closeRecommendationsModal() === false &&
        openRecommendationsChatPanel('No-op') === false &&
        openRecommendationsEmfAssessment() === true &&
        openRecommendationsLocationEditor() === false &&
        openRecommendationsPrivacySettings() === false);
    configureRecommendationsRuntime(restoreRecommendationsRuntime);

    delete (globalThis as { window?: unknown }).window;
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
    restoreWindow();
  }

  try {
    delete (globalThis as { window?: unknown }).window;
    const probeUrl = '../js/recommendations-runtime.js?no-window-probe';
    await import(probeUrl);
    assert('recommendations runtime imports without a browser window', true);
  } catch (error) {
    assert('recommendations runtime imports without a browser window', false, (error as Error | null | undefined)?.message || String(error));
  } finally {
    restoreWindow();
  }

  console.log(`\nResults: ${legacyAssertions.pass} passed, ${legacyAssertions.fail} failed, ${legacyAssertions.pass + legacyAssertions.fail} total`);
  expect(legacyAssertions.fail).toBe(0);
});
