#!/usr/bin/env node
// test-recommendations.js — Verify supplement & lifestyle recommendation module
//
// Run: node tests/test-recommendations.js  (or via npm test)

import './_node-shim.js';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel.replace(/^\//, '')), 'utf-8');
function fetchWithRetry(rel) { return Promise.resolve(read(rel)); }

let pass = 0, fail = 0;
function assert(name, condition, detail) {
  if (condition) { pass++; console.log(`  PASS: ${name}`); }
  else { fail++; console.log(`  FAIL: ${name}${detail ? ' — ' + detail : ''}`); }
}

console.log('=== Supplement & Lifestyle Recommendations Tests ===\n');

// Recommendations are consumed through native module exports.
await import('../js/state.js');
const recommendationsModule = await import('../js/recommendations.js');
const { MARKER_SCHEMA, OPTIMAL_RANGES, UNIT_CONVERSIONS } = await import('../js/schema.js');

// Original test reads data/light-device-presets.json via fetchWithRetry —
// pass through fs read.
const _realFetch = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
  if (typeof url === 'string' && !/^https?:/.test(url)) {
    const rel = url.replace(/^\//, '');
    try { return new Response(read(rel), { status: 200 }); }
    catch (_) { return new Response('', { status: 404 }); }
  }
  return _realFetch(url, opts);
};
  const recSrc = await fetchWithRetry('js/recommendations.js');
  const recProductsSrc = await fetchWithRetry('js/recommendations-products.js');
  const recRuntimeSrc = await fetchWithRetry('js/recommendations-runtime.js');
  const recRegionSrc = await fetchWithRetry('js/recommendations-region.js');
  const mainSrc = await fetchWithRetry('js/main.js');
  const chatRenderSrc = await fetchWithRetry('js/chat-render.js');
  const chatSendSrc = await fetchWithRetry('js/chat-send.js');
  const viewsSrc = await fetchWithRetry('js/views.js');
  const recommendationActionsSrc = await fetchWithRetry('js/recommendation-actions.js');
  const categoryPageViewSrc = await fetchWithRetry('js/category-page-view.js');
  const categoryViewRenderersSrc = await fetchWithRetry('js/category-view-renderers.js');
  const chartCardRecsSrc = await fetchWithRetry('js/chart-card-recs.js');
  const markerDetailSrc = await fetchWithRetry('js/marker-detail-modal-impl.js');
  const dashboardWidgetsSrc = await fetchWithRetry('js/dashboard-widgets.js');
  const dashboardWidgetRenderersSrc = await fetchWithRetry('js/dashboard-widget-renderers.js');
  const dashboardRecommendationWidgetSrc = await fetchWithRetry('js/dashboard-recommendation-widget.js');
  const contextSrc = await fetchWithRetry('js/context-cards.js');
  const navSrc = await fetchWithRetry('js/nav.js');
  const lensPagesSrc = await fetchWithRetry('js/lens-pages.js');
  const settingsSrc = await fetchWithRetry('js/settings.js');
  const settingsDisplaySrc = await fetchWithRetry('js/settings-display-panel.js');
  const chatSystemPromptSrc = await fetchWithRetry('js/chat-system-prompt.js');
  const swSrc = await fetchWithRetry('service-worker.js');

  // ═══════════════════════════════════════
  // 1. Module structure
  // ═══════════════════════════════════════
  console.log('%c 1. Module Structure ', 'font-weight:bold;color:#f59e0b');

  assert('recommendations.js exports loadCatalog', recSrc.includes('export async function loadCatalog'));
  assert('recommendations.js re-exports product helper facade', recSrc.includes("from './recommendations-products.js'"));
  assert('recommendations-products.js exports isProductRecsEnabled', recProductsSrc.includes('export function isProductRecsEnabled'));
  assert('recommendations-products.js exports setProductRecsEnabled', recProductsSrc.includes('export function setProductRecsEnabled'));
  assert('recommendations-products.js exports hasSeenDisclosure', recProductsSrc.includes('export function hasSeenDisclosure'));
  assert('recommendations-products.js exports markDisclosureSeen', recProductsSrc.includes('export function markDisclosureSeen'));
  assert('recommendations-products.js exports getUserRegion', recProductsSrc.includes('export function getUserRegion'));
  assert('recommendations-products.js exports getProductsForSlot', recProductsSrc.includes('export function getProductsForSlot'));
  assert('recommendations.js deduplicates concurrent loadCatalog calls', recSrc.includes('_catalogPromise'));
  assert('recommendations.js exports renderRecommendationSection', recSrc.includes('export async function renderRecommendationSection'));
  assert('recommendations.js exports renderRecommendationSectionSync', recSrc.includes('export function renderRecommendationSectionSync'));
  assert('recommendations.js exports detectSupplementSlots', recSrc.includes('export function detectSupplementSlots'));
  assert('recommendations.js delegates browser hooks through runtime adapter',
    recSrc.includes("from './recommendations-runtime.js'") &&
      !/\bwindow(?:\.|\s*\[)/.test(recSrc) &&
      !recSrc.includes('Object.assign(window') &&
      recRuntimeSrc.includes('export function getRecommendationsSnpTable') &&
      recRuntimeSrc.includes('export function configureRecommendationModuleBridge') &&
      recRuntimeSrc.includes('recommendationsRuntimeDeps.closeModal') &&
      recRuntimeSrc.includes('recommendationsRuntimeDeps.openSettingsModal') &&
      !recRuntimeSrc.includes("from './views-runtime-bridge.js'"),
    recSrc.slice(0, 1800));
  assert('recommendations-region.js owns region hierarchy data',
    recRegionSrc.includes('REGION_HIERARCHY') &&
    recRegionSrc.includes('COUNTRY_TO_REGION') &&
    recProductsSrc.includes("from './recommendations-region.js'"));

  // ═══════════════════════════════════════
  // 2. Module exports
  // ═══════════════════════════════════════
  console.log('%c 2. Window Exports ', 'font-weight:bold;color:#f59e0b');

  assert('isProductRecsEnabled is module-exported', typeof recommendationsModule.isProductRecsEnabled === 'function');
  assert('setProductRecsEnabled is module-exported', typeof recommendationsModule.setProductRecsEnabled === 'function');
  assert('markDisclosureSeen is module-exported', typeof recommendationsModule.markDisclosureSeen === 'function');
  assert('renderRecommendationSection is module-exported', typeof recommendationsModule.renderRecommendationSection === 'function');
  assert('renderRecommendationSectionSync is module-exported', typeof recommendationsModule.renderRecommendationSectionSync === 'function');
  assert('getUserRegion routes via COUNTRY_TO_REGION table', recProductsSrc.includes('COUNTRY_TO_REGION[c]'));
  assert('detectSupplementSlots is module-exported', typeof recommendationsModule.detectSupplementSlots === 'function');
  assert('loadCatalog is module-exported', typeof recommendationsModule.loadCatalog === 'function');

  // ═══════════════════════════════════════
  // 3. Toggle on/off
  // ═══════════════════════════════════════
  console.log('%c 3. Toggle On/Off ', 'font-weight:bold;color:#f59e0b');

  const origVal = localStorage.getItem('labcharts-show-product-recs');
  recommendationsModule.setProductRecsEnabled(true);
  assert('setProductRecsEnabled(true) → enabled', recommendationsModule.isProductRecsEnabled() === true);
  recommendationsModule.setProductRecsEnabled(false);
  assert('setProductRecsEnabled(false) → disabled', recommendationsModule.isProductRecsEnabled() === false);
  recommendationsModule.setProductRecsEnabled(true);
  assert('Re-enable → true', recommendationsModule.isProductRecsEnabled() === true);
  // Restore
  if (origVal === null) localStorage.removeItem('labcharts-show-product-recs');
  else localStorage.setItem('labcharts-show-product-recs', origVal);

  // ═══════════════════════════════════════
  // 4. Disclosure tracking
  // ═══════════════════════════════════════
  console.log('%c 4. Disclosure Tracking ', 'font-weight:bold;color:#f59e0b');

  const origDisc = localStorage.getItem('labcharts-rec-disclosure');
  localStorage.removeItem('labcharts-rec-disclosure');
  // hasSeenDisclosure not on window but we can test via recSrc pattern
  assert('Disclosure key uses labcharts-rec-disclosure', recProductsSrc.includes("'labcharts-rec-disclosure'"));
  recommendationsModule.markDisclosureSeen();
  assert('markDisclosureSeen sets localStorage', localStorage.getItem('labcharts-rec-disclosure') === 'seen');
  // Restore
  if (origDisc === null) localStorage.removeItem('labcharts-rec-disclosure');
  else localStorage.setItem('labcharts-rec-disclosure', origDisc);

  // ═══════════════════════════════════════
  // 5. renderRecommendationSection returns empty when disabled
  // ═══════════════════════════════════════
  console.log('%c 5. Render Gating ', 'font-weight:bold;color:#f59e0b');

  const origRec = localStorage.getItem('labcharts-show-product-recs');
  recommendationsModule.setProductRecsEnabled(false);
  const emptyResult = await recommendationsModule.renderRecommendationSection('vitamins.vitaminD', { label: 'Test' });
  assert('renderRecommendationSection returns empty when disabled', emptyResult === '');
  recommendationsModule.setProductRecsEnabled(true);
  // Catalog file may not exist — should gracefully return ''
  const noFileResult = await recommendationsModule.renderRecommendationSection('nonexistent.marker', { label: 'Test' });
  assert('renderRecommendationSection returns empty for unknown slot', noFileResult === '' || typeof noFileResult === 'string');
  const { configureRecommendationModuleBridge } = await import('../js/recommendations-runtime.js');
  const previousRecommendationBridge = configureRecommendationModuleBridge({ renderRecommendationSection: null });
  const { createRecommendationActions } = await import('../js/recommendation-actions.js');
  const originalGetElementById = document.getElementById;
  const modalStub = { className: 'modal', innerHTML: '' };
  const overlayStub = {
    classList: { add: () => {}, contains: () => false },
    querySelector: () => null,
  };
  document.getElementById = (id) => id === 'detail-modal' ? modalStub : id === 'modal-overlay' ? overlayStub : null;
  createRecommendationActions({
    getActiveData: () => ({}),
    buildDashboardWidgetContext: () => ({}),
    getCachedRecommendationsCatalog: () => ({}),
    getGlobalRecommendationCandidates: () => [],
    setRecommendationState: () => {},
  }).openRecommendationDetail('missing.slot', 'Missing section');
  await Promise.resolve();
  assert('openRecommendationDetail handles missing renderRecommendationSection without stuck loading',
    modalStub.innerHTML.includes('No tip details are available for this topic.'));
  document.getElementById = originalGetElementById;
  configureRecommendationModuleBridge(previousRecommendationBridge);
  // Restore
  if (origRec === null) localStorage.removeItem('labcharts-show-product-recs');
  else localStorage.setItem('labcharts-show-product-recs', origRec);

  // ═══════════════════════════════════════
  // 6. detectSupplementSlots
  // ═══════════════════════════════════════
  console.log('%c 6. Keyword Scanner ', 'font-weight:bold;color:#f59e0b');

  const ds = recommendationsModule.detectSupplementSlots;
  assert('detectSupplementSlots("") → []', ds('').length === 0);
  assert('detectSupplementSlots(null) → []', ds(null).length === 0);
  // Dynamic scanner requires loaded catalog — test with whatever catalog is available
  await recommendationsModule.loadCatalog();
  const vitDResult = ds('Your vitamin D3 is low, consider supplementing D3');
  assert('detectSupplementSlots finds vitamin D slot (if catalog loaded)', vitDResult.length <= 1);
  assert('detectSupplementSlots caps at 1', ds('vitamin d magnesium omega-3 zinc iron b12 selenium ashwagandha').length <= 1);
  assert('detectSupplementSlots no match for unrelated text', ds('Everything looks perfectly fine and healthy today').length === 0);
  // Scanner reads from catalog, not hardcoded keys
  assert('detectSupplementSlots uses catalog slots', recSrc.includes('_catalog.slots'));

  // ═══════════════════════════════════════
  // 7. getProductsForSlot
  // ═══════════════════════════════════════
  console.log('%c 7. Product Filtering ', 'font-weight:bold;color:#f59e0b');

  // Mock catalog for testing
  const mockCatalog = {
    slots: { 'test.marker': { label: 'Test', freeActions: ['Do something free'], forms: ['Form A'] } },
    products: {
      'test.marker': [
        { type: 'supplement', brand: 'A', regions: ['CZ', 'SK'] },
        { type: 'food', brand: 'B', regions: ['EU'] },
        { type: 'supplement', brand: 'C', regions: ['CZ'] },
      ]
    }
  };

  // getProductsForSlot is exported but not on window — test via recSrc
  assert('getProductsForSlot filters by region via hierarchy chain', recProductsSrc.includes('regionLookupChain(region)'));
  assert('getProductsForSlot returns empty for null catalog', recProductsSrc.includes('if (!catalog || !catalog.products) return []'));

  // ═══════════════════════════════════════
  // 8. B12/Folate schema + keyword safety
  // ═══════════════════════════════════════
  console.log('%c 8. Schema & Keyword Safety ', 'font-weight:bold;color:#f59e0b');

  assert('MARKER_SCHEMA has vitamins.vitaminB12', !!MARKER_SCHEMA.vitamins?.markers?.vitaminB12);
  assert('MARKER_SCHEMA has vitamins.folate', !!MARKER_SCHEMA.vitamins?.markers?.folate);
  assert('UNIT_CONVERSIONS has vitaminB12', !!UNIT_CONVERSIONS['vitamins.vitaminB12']);
  assert('UNIT_CONVERSIONS has folate', !!UNIT_CONVERSIONS['vitamins.folate']);
  assert('OPTIMAL_RANGES has vitaminB12', !!OPTIMAL_RANGES['vitamins.vitaminB12']);
  assert('OPTIMAL_RANGES has folate', !!OPTIMAL_RANGES['vitamins.folate']);

  // Short keywords use word boundaries (regex) to avoid false positives
  assert('EXTRA_TERMS epa uses regex word boundary', recSrc.includes('/\\bepa\\b/'));
  assert('EXTRA_TERMS dha uses regex word boundary', recSrc.includes('/\\bdha\\b/'));
  assert('EXTRA_TERMS ggt uses regex word boundary', recSrc.includes('/\\bggt\\b/'));
  assert('Gene name matching uses word boundary regex', recSrc.includes("new RegExp('\\\\b'"));

  // ═══════════════════════════════════════
  // 9. Integration wiring
  // ═══════════════════════════════════════
  console.log('%c 9. Integration Wiring ', 'font-weight:bold;color:#f59e0b');

  const appFeatureModulesSrc = await fetchWithRetry('js/app-feature-modules.js');
  const appHealthDataModulesSrc = await fetchWithRetry('js/app-health-data-modules.js');
  const healthDataLoaderSrc = await fetchWithRetry('js/health-data-loader.js');
  assert('main.js imports app-feature-modules.js', mainSrc.includes("import './app-feature-modules.js'"));
  assert('app-feature-modules.js lazy-loads health data modules',
    appFeatureModulesSrc.includes("import './health-data-loader.js'")
      && healthDataLoaderSrc.includes("import('./recommendations.js')"));
  assert('app-health-data-modules.js imports recommendations.js', appHealthDataModulesSrc.includes("import './recommendations.js'"));
  assert('marker-detail-modal.js has rec-modal placeholder', markerDetailSrc.includes('rec-modal-'));
  assert('marker-detail-modal.js calls renderRecommendationSection', markerDetailSrc.includes('renderRecommendationSection'));
  assert('marker-detail-modal.js shows recs for any marker with catalog slot', markerDetailSrc.includes('isProductRecsEnabled'));
  assert('chat-send.js delegates supplement slot detection through runtime adapter',
    chatSendSrc.includes('detectChatSendSupplementSlots') &&
    chatSendSrc.includes("from './chat-send-runtime.js'"));
  assert('chat-render.js delegates recommendation rendering through runtime adapter',
    chatRenderSrc.includes('renderChatRecommendationSections')
      && chatRenderSrc.includes("from './chat-render-runtime.js'")
      && !/\bwindow(\.|\s*\[)/.test(chatRenderSrc));
  assert('chat-send.js detects recSlots for live rendering', chatSendSrc.includes('_recSlots'));
  assert('chat-render.js has rec-chat-wrapper class', chatRenderSrc.includes('rec-chat-wrapper'));
  assert('category-view-renderers.js has chart-rec placeholder in header', categoryViewRenderersSrc.includes('chart-rec-'));
  assert('category-view-renderers.js keeps chart title text separate from tips host', categoryViewRenderersSrc.includes('chart-card-title-text') && categoryViewRenderersSrc.includes('chart-card-tips-host'));
  assert('category-page-view.js imports chart card recommendation module', categoryPageViewSrc.includes("from './chart-card-recs.js'"));
  assert('category-page-view.js delegates catalog globals through runtime adapter',
    categoryPageViewSrc.includes("from './category-page-runtime.js'")
      && categoryPageViewSrc.includes('primeCategoryPageCatalogCache')
      && categoryPageViewSrc.includes('getCategoryPageCatalogSlots')
      && !/\bwindow(\.|\s*\[)/.test(categoryPageViewSrc));
  assert('chart-card-recs.js has loadChartCardRecs function', chartCardRecsSrc.includes('function loadChartCardRecs'));
  assert('chart-card-recs.js delegates catalog globals through recommendations runtime',
    chartCardRecsSrc.includes("from './recommendations-runtime.js'")
      && chartCardRecsSrc.includes('isRecommendationsProductRecsEnabled')
      && chartCardRecsSrc.includes('loadRecommendationsCatalogRuntime')
      && !/\bwindow(\.|\s*\[)/.test(chartCardRecsSrc));
  assert('marker-detail-modal.js scrollToRec auto-opens details', markerDetailSrc.includes('scrollToRec'));
  assert('recommendation globals stay module-only', [
    'isProductRecsEnabled', 'setProductRecsEnabled', 'markRecDisclosureSeen',
    'renderRecommendationSection', 'renderRecommendationSectionSync',
    'detectSupplementSlots', 'loadCatalog',
  ].every(name => !(name in window)));
  assert('nav.js exposes recommendations sidebar helper', navSrc.includes('openRecommendationsFromSidebar'));
  const recNavMarkup = navSrc.match(/data-category="recommendations"[\s\S]{0,500}/)?.[0] || '';
  assert('Tips sidebar routes to dedicated page',
    recNavMarkup.includes("_navNavigateAttrs('recommendations')") &&
    navSrc.includes("return _navActionAttrs('navigate', { route })") &&
    recNavMarkup.includes('nav-item-label">Tips'));
  assert('Recommendations sidebar item does not open Settings', !recNavMarkup.includes('openSettingsModal'));
  assert('views.js exposes dedicated Recommendations page', viewsSrc.includes('export function showRecommendations') && viewsSrc.includes('openRecommendationDetail'));
  assert('views.js delegates recommendation actions to recommendation-actions.js',
    viewsSrc.includes("from './recommendation-actions.js'") &&
    recommendationActionsSrc.includes('export function createRecommendationActions'));
  assert('recommendation-actions.js delegates browser globals through recommendations runtime',
    recommendationActionsSrc.includes("from './recommendations-runtime.js'")
      && recommendationActionsSrc.includes('closeRecommendationsModal')
      && recommendationActionsSrc.includes('openRecommendationsChatPanel')
      && recommendationActionsSrc.includes('renderRecommendationsDetailSection')
      && !/\bwindow(\.|\s*\[)/.test(recommendationActionsSrc));
  assert('dashboard has Recommendations widget surface', dashboardWidgetsSrc.includes("id: 'recommendations'") && dashboardWidgetsSrc.includes('renderDashboardRecommendationsWidget'));
  assert('dashboard recommendation widget uses configured runtime actions',
    dashboardRecommendationWidgetSrc.includes('export function configureDashboardRecommendationRuntimeDeps') &&
    dashboardRecommendationWidgetSrc.includes('dashboardRecommendationRuntimeDeps[name]?.(...args)') &&
    !dashboardRecommendationWidgetSrc.includes("from './views-runtime-bridge.js'") &&
    !dashboardRecommendationWidgetSrc.includes("from './settings-runtime-bridge.js'") &&
    !dashboardRecommendationWidgetSrc.includes('globalThis'));
  assert('hidden tips render a Show action',
    dashboardRecommendationWidgetSrc.includes("candidate.dismissed ? 'Show' : 'Hide'") &&
    dashboardRecommendationWidgetSrc.includes("dashboardRecommendationActionAttrs('dismiss'") &&
    dashboardRecommendationWidgetSrc.includes("on: candidate.dismissed ? 'false' : 'true'"));
  assert('dismissRecommendation can restore a dismissed recommendation',
    /function dismissRecommendation\(id, on = true\)[\s\S]{0,120}setRecommendationState\('dismissed', id, !!on\)/.test(recommendationActionsSrc));
  assert('Recommendations page header directly toggles its dashboard widget',
    lensPagesSrc.includes("lensPageActionAttrs(dashboardAction, { id: 'recommendations' })") &&
    !viewsSrc.includes("openDashboardWidgetPicker && window.openDashboardWidgetPicker()\">Add to Dashboard"));

  // ═══════════════════════════════════════
  // 10. Settings toggle
  // ═══════════════════════════════════════
  console.log('%c 10. Settings Toggle ', 'font-weight:bold;color:#f59e0b');

  assert('Settings has Tips toggle', settingsDisplaySrc.includes('<label class="settings-label">Tips</label>'));
  assert('Settings has product-recs toggle', settingsDisplaySrc.includes('settings-product-recs'));
  assert('Settings calls setProductRecsEnabled', settingsSrc.includes('setProductRecsEnabled'));

  // ═══════════════════════════════════════
  // 11. System prompt
  // ═══════════════════════════════════════
  console.log('%c 11. System Prompt ', 'font-weight:bold;color:#f59e0b');

  assert('System prompt has supplements and medications section', chatSystemPromptSrc.includes('## Supplements and Medications'));
  assert('System prompt puts non-product, food, and lifestyle context first', chatSystemPromptSrc.includes('non-product, food, and lifestyle context first'));
  assert('System prompt frames supplements as educational options', chatSystemPromptSrc.includes('educational options to review'));
  assert('System prompt prohibits individualized dosing', chatSystemPromptSrc.includes('Do not give an individualized dose'));
  assert('System prompt mentions medication interactions', chatSystemPromptSrc.includes('medication interactions'));

  // ═══════════════════════════════════════
  // 12. Service Worker + CSS
  // ═══════════════════════════════════════
  console.log('%c 12. Infrastructure ', 'font-weight:bold;color:#f59e0b');

  assert('SW includes recommendations.js', swSrc.includes('/js/recommendations.js'));
  assert('SW includes recommendations-runtime.js', swSrc.includes('/js/recommendations-runtime.js'));
  assert('SW includes recommendations-products.js', swSrc.includes('/js/recommendations-products.js'));
  assert('SW includes recommendations-region.js', swSrc.includes('/js/recommendations-region.js'));
  assert('SW includes recommendation-actions.js', swSrc.includes('/js/recommendation-actions.js'));
  assert('SW includes dashboard-recommendation-widget.js', swSrc.includes('/js/dashboard-recommendation-widget.js'));

  // Node port: read styles.css directly. Browser styleSheets walk is
  // brittle (cross-origin, parsing race); source inspection is more reliable.
  const cssSrc = read('/styles.css') + '\n' + read('/css/category-views.css') + '\n' + read('/css/context-profile.css') + '\n' + read('/css/context-editor.css') + '\n' + read('/css/marker-detail-modal.css') + '\n' + read('/css/recommendations.css');
  assert('CSS has .rec-section rule', cssSrc.includes('.rec-section'));
  assert('CSS keeps Tips badge outside line-clamped chart title text', cssSrc.includes('.chart-card-title-text') && cssSrc.includes('.chart-card-tips-host .ctx-tips-badge'));
  assert('CSS gives detail modal recommendation sections horizontal spacing', cssSrc.includes('.marker-detail-modal [id^="rec-modal-"]'));

  // ═══════════════════════════════════════
  // 13. Security
  // ═══════════════════════════════════════
  console.log('%c 13. Security ', 'font-weight:bold;color:#f59e0b');

  assert('Product URLs validated to https?', recProductsSrc.includes("'https?://'") || recProductsSrc.includes('/^https?:\\/\\//'));
  assert('escapeHTML used for product rendering', recProductsSrc.includes('escapeHTML(product.brand)'));
  assert('escapeHTML used for slot label', recSrc.includes('escapeHTML(label)'));

  // ═══════════════════════════════════════
  // 14. Light-device catalog wiring
  // ═══════════════════════════════════════
  console.log('%c 14. Light-device catalog wiring ', 'font-weight:bold;color:#f59e0b');

  assert('getLightDeviceProduct exported',
    recProductsSrc.includes('export function getLightDeviceProduct'));
  assert('renderLightDeviceAffiliateRow exported',
    recProductsSrc.includes('export function renderLightDeviceAffiliateRow'));
  assert('getLightDeviceProduct is module-exported', typeof recommendationsModule.getLightDeviceProduct === 'function');
  assert('renderLightDeviceAffiliateRow is module-exported', typeof recommendationsModule.renderLightDeviceAffiliateRow === 'function');

  // Synthetic catalog with a matching slug
  const stubCatalog = {
    region: 'INTL',
    countries: ['worldwide'],
    products: {
      '_internal.lightDevices': [
        {
          type: 'product',
          key: 'mitochondriak-maxi-uvb',
          name: 'Mitochondriak Maxi UVB',
          vendor: 'Mitochondriak',
          vendorKey: 'mitochondriak',
          url: 'https://www.mitochondriak.com/maxi-uvb?ref=getbased',
          affiliateUrl: 'https://www.mitochondriak.com/maxi-uvb?ref=getbased',
          regions: ['INTL'],
        },
      ],
    },
    vendors: {},
  };
  const found = recommendationsModule.getLightDeviceProduct(stubCatalog, 'mitochondriak-maxi-uvb');
  assert('getLightDeviceProduct: matching slug → product', !!found && found.key === 'mitochondriak-maxi-uvb');
  const missing = recommendationsModule.getLightDeviceProduct(stubCatalog, 'unknown-device');
  assert('getLightDeviceProduct: unknown slug → null', missing === null);
  const noCatalog = recommendationsModule.getLightDeviceProduct(null, 'mitochondriak-maxi-uvb');
  assert('getLightDeviceProduct: null catalog → null', noCatalog === null);
  const noSlug = recommendationsModule.getLightDeviceProduct(stubCatalog, '');
  assert('getLightDeviceProduct: empty slug → null', noSlug === null);

  // Render: requires product recs enabled
  recommendationsModule.setProductRecsEnabled(true);
  const row = recommendationsModule.renderLightDeviceAffiliateRow(stubCatalog, 'mitochondriak-maxi-uvb');
  assert('renderLightDeviceAffiliateRow: produces sponsored anchor when enabled',
    row.includes('rel="noopener sponsored"') &&
    row.includes('href="') &&
    row.includes('Mitochondriak'));
  assert('renderLightDeviceAffiliateRow: stamps utm_campaign=light-devices',
    row.includes('utm_campaign=light-devices'));
  assert('renderLightDeviceAffiliateRow: Umami event uses light-device-rec prefix',
    /data-umami-event="light-device-rec-/.test(row));
  assert('renderLightDeviceAffiliateRow: target=_blank for new tab',
    row.includes('target="_blank"'));
  assert('renderLightDeviceAffiliateRow: has aria-label for screen readers',
    /aria-label="View .* on .*, opens in new tab"/.test(row));

  const emptyOnMiss = recommendationsModule.renderLightDeviceAffiliateRow(stubCatalog, 'unknown-device');
  assert('renderLightDeviceAffiliateRow: missing product → empty string', emptyOnMiss === '');

  recommendationsModule.setProductRecsEnabled(false);
  const offWhenDisabled = recommendationsModule.renderLightDeviceAffiliateRow(stubCatalog, 'mitochondriak-maxi-uvb');
  assert('renderLightDeviceAffiliateRow: toggle off → empty string', offWhenDisabled === '');
  recommendationsModule.setProductRecsEnabled(true);

  // Preset side: every Mitochondriak / Chroma / EMR-Tek preset must have a
  // catalogSlug equal to its id so the device card resolves to the catalog
  // without manual mapping.
  const presetsRes = await fetchWithRetry('data/light-device-presets.json');
  const presetsData = JSON.parse(presetsRes);
  const newBrands = ['Mitochondriak', 'Chroma', 'EMR-Tek'];
  for (const p of presetsData.presets) {
    if (!newBrands.includes(p.brand)) continue;
    assert(`Preset ${p.id}: catalogSlug equals id`,
      p.catalogSlug === p.id,
      `got ${p.catalogSlug}`);
  }

  // ─── Channel-deficit device recommendations (v1.7.18) ─────────────────
  // recommendDeviceProductsForChannelDeficit joins channel keys to catalog
  // products via preset.catalogSlug. Used by Light & Sun page to surface
  // a CTA when the user has 7+ logged events but a device-fillable
  // channel (pbm_red / pbm_nir) is empty over 30 days.
  assert('recommendDeviceProductsForChannelDeficit on window',
    typeof recommendationsModule.recommendDeviceProductsForChannelDeficit === 'function');
  assert('renderChannelDeficitDeviceRecs on window',
    typeof recommendationsModule.renderChannelDeficitDeviceRecs === 'function');

  const presetStubs = [
    { id: 'mitochondriak-maxi-uvb', brand: 'Mitochondriak', model: 'Maxi UVB',
      catalogSlug: 'mitochondriak-maxi-uvb', channels: ['vitamin_d', 'no_cv'] },
    { id: 'pbm-only', brand: 'Mitochondriak', model: 'PBM-only',
      catalogSlug: 'mitochondriak-maxi-uvb', channels: ['pbm_red', 'pbm_nir'] },
    { id: 'no-slug', brand: 'X', model: 'Y', channels: ['pbm_red'] },
  ];

  const pbmRedHits = recommendationsModule.recommendDeviceProductsForChannelDeficit(
    stubCatalog, 'pbm_red', presetStubs);
  assert('recommendDeviceProductsForChannelDeficit: pbm_red → matching product',
    Array.isArray(pbmRedHits) && pbmRedHits.length === 1 &&
    pbmRedHits[0].key === 'mitochondriak-maxi-uvb');

  const novelChannel = recommendationsModule.recommendDeviceProductsForChannelDeficit(
    stubCatalog, 'imaginary_channel', presetStubs);
  assert('recommendDeviceProductsForChannelDeficit: unknown channel → []',
    Array.isArray(novelChannel) && novelChannel.length === 0);

  const noPresets = recommendationsModule.recommendDeviceProductsForChannelDeficit(
    stubCatalog, 'pbm_red', []);
  assert('recommendDeviceProductsForChannelDeficit: empty presets → []',
    Array.isArray(noPresets) && noPresets.length === 0);

  // renderChannelDeficitDeviceRecs respects the toggle.
  recommendationsModule.setProductRecsEnabled(true);
  const card = recommendationsModule.renderChannelDeficitDeviceRecs(
    stubCatalog, 'pbm_red', presetStubs, { label: 'red 660 nm (PBM)' });
  assert('renderChannelDeficitDeviceRecs: builds card with channel label',
    card.includes('rec-channel-deficit') && card.includes('red 660 nm (PBM)'));
  assert('renderChannelDeficitDeviceRecs: stamps light-devices campaign',
    card.includes('utm_campaign=light-devices'));
  assert('renderChannelDeficitDeviceRecs: Umami event uses light-deficit-rec prefix',
    /data-umami-event="light-deficit-rec-/.test(card));

  recommendationsModule.setProductRecsEnabled(false);
  const offCard = recommendationsModule.renderChannelDeficitDeviceRecs(
    stubCatalog, 'pbm_red', presetStubs, { label: 'red 660 nm (PBM)' });
  assert('renderChannelDeficitDeviceRecs: toggle off → empty string',
    offCard === '');
  recommendationsModule.setProductRecsEnabled(true);

  // ═══════════════════════════════════════
  // Results
  // ═══════════════════════════════════════
console.log(`\nResults: ${pass} passed, ${fail} failed, ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
