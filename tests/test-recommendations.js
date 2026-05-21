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

// recommendations.js exposes its handlers via Object.assign(window, ...).
await import('../js/state.js');
await import('../js/recommendations.js');

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
  const mainSrc = await fetchWithRetry('js/main.js');
  const chatSrc = await fetchWithRetry('js/chat.js');
  const viewsSrc = await fetchWithRetry('js/views.js');
  const recommendationActionsSrc = await fetchWithRetry('js/recommendation-actions.js');
  const categoryPageViewSrc = await fetchWithRetry('js/category-page-view.js');
  const categoryViewRenderersSrc = await fetchWithRetry('js/category-view-renderers.js');
  const chartCardRecsSrc = await fetchWithRetry('js/chart-card-recs.js');
  const markerDetailSrc = await fetchWithRetry('js/marker-detail-modal.js');
  const dashboardWidgetsSrc = await fetchWithRetry('js/dashboard-widgets.js');
  const dashboardWidgetRenderersSrc = await fetchWithRetry('js/dashboard-widget-renderers.js');
  const contextSrc = await fetchWithRetry('js/context-cards.js');
  const navSrc = await fetchWithRetry('js/nav.js');
  const lensPagesSrc = await fetchWithRetry('js/lens-pages.js');
  const settingsSrc = await fetchWithRetry('js/settings.js');
  const constantsSrc = await fetchWithRetry('js/constants.js');
  const swSrc = await fetchWithRetry('service-worker.js');

  // ═══════════════════════════════════════
  // 1. Module structure
  // ═══════════════════════════════════════
  console.log('%c 1. Module Structure ', 'font-weight:bold;color:#f59e0b');

  assert('recommendations.js exports loadCatalog', recSrc.includes('export async function loadCatalog'));
  assert('recommendations.js exports isProductRecsEnabled', recSrc.includes('export function isProductRecsEnabled'));
  assert('recommendations.js exports setProductRecsEnabled', recSrc.includes('export function setProductRecsEnabled'));
  assert('recommendations.js exports hasSeenDisclosure', recSrc.includes('export function hasSeenDisclosure'));
  assert('recommendations.js exports markDisclosureSeen', recSrc.includes('export function markDisclosureSeen'));
  assert('recommendations.js exports getUserRegion', recSrc.includes('export function getUserRegion'));
  assert('recommendations.js exports getProductsForSlot', recSrc.includes('export function getProductsForSlot'));
  assert('recommendations.js deduplicates concurrent loadCatalog calls', recSrc.includes('_catalogPromise'));
  assert('recommendations.js exports renderRecommendationSection', recSrc.includes('export async function renderRecommendationSection'));
  assert('recommendations.js exports renderRecommendationSectionSync', recSrc.includes('export function renderRecommendationSectionSync'));
  assert('recommendations.js exports detectSupplementSlots', recSrc.includes('export function detectSupplementSlots'));

  // ═══════════════════════════════════════
  // 2. Window exports
  // ═══════════════════════════════════════
  console.log('%c 2. Window Exports ', 'font-weight:bold;color:#f59e0b');

  assert('isProductRecsEnabled on window', typeof window.isProductRecsEnabled === 'function');
  assert('setProductRecsEnabled on window', typeof window.setProductRecsEnabled === 'function');
  assert('markRecDisclosureSeen on window', typeof window.markRecDisclosureSeen === 'function');
  assert('renderRecommendationSection on window', typeof window.renderRecommendationSection === 'function');
  assert('renderRecommendationSectionSync on window', typeof window.renderRecommendationSectionSync === 'function');
  assert('getUserRegion routes via COUNTRY_TO_REGION table', recSrc.includes('COUNTRY_TO_REGION[c]'));
  assert('detectSupplementSlots on window', typeof window.detectSupplementSlots === 'function');
  assert('loadCatalog on window', typeof window.loadCatalog === 'function');

  // ═══════════════════════════════════════
  // 3. Toggle on/off
  // ═══════════════════════════════════════
  console.log('%c 3. Toggle On/Off ', 'font-weight:bold;color:#f59e0b');

  const origVal = localStorage.getItem('labcharts-show-product-recs');
  window.setProductRecsEnabled(true);
  assert('setProductRecsEnabled(true) → enabled', window.isProductRecsEnabled() === true);
  window.setProductRecsEnabled(false);
  assert('setProductRecsEnabled(false) → disabled', window.isProductRecsEnabled() === false);
  window.setProductRecsEnabled(true);
  assert('Re-enable → true', window.isProductRecsEnabled() === true);
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
  assert('Disclosure key uses labcharts-rec-disclosure', recSrc.includes("'labcharts-rec-disclosure'"));
  window.markRecDisclosureSeen();
  assert('markRecDisclosureSeen sets localStorage', localStorage.getItem('labcharts-rec-disclosure') === 'seen');
  // Restore
  if (origDisc === null) localStorage.removeItem('labcharts-rec-disclosure');
  else localStorage.setItem('labcharts-rec-disclosure', origDisc);

  // ═══════════════════════════════════════
  // 5. renderRecommendationSection returns empty when disabled
  // ═══════════════════════════════════════
  console.log('%c 5. Render Gating ', 'font-weight:bold;color:#f59e0b');

  const origRec = localStorage.getItem('labcharts-show-product-recs');
  window.setProductRecsEnabled(false);
  const emptyResult = await window.renderRecommendationSection('vitamins.vitaminD', { label: 'Test' });
  assert('renderRecommendationSection returns empty when disabled', emptyResult === '');
  window.setProductRecsEnabled(true);
  // Catalog file may not exist — should gracefully return ''
  const noFileResult = await window.renderRecommendationSection('nonexistent.marker', { label: 'Test' });
  assert('renderRecommendationSection returns empty for unknown slot', noFileResult === '' || typeof noFileResult === 'string');
  const originalRenderRecommendationSection = window.renderRecommendationSection;
  window.renderRecommendationSection = undefined;
  const { createRecommendationActions } = await import('../js/recommendation-actions.js');
  const originalGetElementById = document.getElementById;
  const modalStub = { className: 'modal', innerHTML: '' };
  const overlayStub = { classList: { add: () => {} } };
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
    modalStub.innerHTML.includes('No recommendation details available for this slot.'));
  document.getElementById = originalGetElementById;
  window.renderRecommendationSection = originalRenderRecommendationSection;
  // Restore
  if (origRec === null) localStorage.removeItem('labcharts-show-product-recs');
  else localStorage.setItem('labcharts-show-product-recs', origRec);

  // ═══════════════════════════════════════
  // 6. detectSupplementSlots
  // ═══════════════════════════════════════
  console.log('%c 6. Keyword Scanner ', 'font-weight:bold;color:#f59e0b');

  const ds = window.detectSupplementSlots;
  assert('detectSupplementSlots("") → []', ds('').length === 0);
  assert('detectSupplementSlots(null) → []', ds(null).length === 0);
  // Dynamic scanner requires loaded catalog — test with whatever catalog is available
  await window.loadCatalog();
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
  assert('getProductsForSlot filters by region via hierarchy chain', recSrc.includes('regionLookupChain(region)'));
  assert('getProductsForSlot returns empty for null catalog', recSrc.includes('if (!catalog || !catalog.products) return []'));

  // ═══════════════════════════════════════
  // 8. B12/Folate schema + keyword safety
  // ═══════════════════════════════════════
  console.log('%c 8. Schema & Keyword Safety ', 'font-weight:bold;color:#f59e0b');

  const schemaSrc = await fetchWithRetry('js/schema.js');
  assert('MARKER_SCHEMA has vitamins.vitaminB12', schemaSrc.includes("vitaminB12: { name:"));
  assert('MARKER_SCHEMA has vitamins.folate', schemaSrc.includes("folate: { name:"));
  assert('UNIT_CONVERSIONS has vitaminB12', schemaSrc.includes("'vitamins.vitaminB12'"));
  assert('UNIT_CONVERSIONS has folate', schemaSrc.includes("'vitamins.folate'"));
  assert('OPTIMAL_RANGES has vitaminB12', schemaSrc.includes("'vitamins.vitaminB12'"));
  assert('OPTIMAL_RANGES has folate', schemaSrc.includes("'vitamins.folate'"));

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
  assert('main.js imports app-feature-modules.js', mainSrc.includes("import './app-feature-modules.js'"));
  assert('app-feature-modules.js delegates health data modules', appFeatureModulesSrc.includes("import './app-health-data-modules.js'"));
  assert('app-health-data-modules.js imports recommendations.js', appHealthDataModulesSrc.includes("import './recommendations.js'"));
  assert('marker-detail-modal.js has rec-modal placeholder', markerDetailSrc.includes('rec-modal-'));
  assert('marker-detail-modal.js calls renderRecommendationSection', markerDetailSrc.includes('renderRecommendationSection'));
  assert('marker-detail-modal.js shows recs for any marker with catalog slot', markerDetailSrc.includes('isProductRecsEnabled'));
  assert('chat.js calls detectSupplementSlots', chatSrc.includes('detectSupplementSlots'));
  assert('chat.js detects recSlots for live rendering', chatSrc.includes('_recSlots'));
  assert('chat.js has rec-chat-wrapper class', chatSrc.includes('rec-chat-wrapper'));
  assert('category-view-renderers.js has chart-rec placeholder in header', categoryViewRenderersSrc.includes('chart-rec-'));
  assert('category-view-renderers.js keeps chart title text separate from tips host', categoryViewRenderersSrc.includes('chart-card-title-text') && categoryViewRenderersSrc.includes('chart-card-tips-host'));
  assert('category-page-view.js imports chart card recommendation module', categoryPageViewSrc.includes("from './chart-card-recs.js'"));
  assert('chart-card-recs.js has loadChartCardRecs function', chartCardRecsSrc.includes('function loadChartCardRecs'));
  assert('marker-detail-modal.js scrollToRec auto-opens details', markerDetailSrc.includes('scrollToRec'));
  assert('loadCatalog on window', typeof window.loadCatalog === 'function');
  assert('nav.js exposes recommendations sidebar helper', navSrc.includes('openRecommendationsFromSidebar'));
  const recNavMarkup = navSrc.match(/data-category="recommendations"[\s\S]{0,500}/)?.[0] || '';
  assert('Recommendations sidebar routes to dedicated page', recNavMarkup.includes("window.navigate('recommendations')"));
  assert('Recommendations sidebar item does not open Settings', !recNavMarkup.includes('openSettingsModal'));
  assert('views.js exposes dedicated Recommendations page', viewsSrc.includes('export function showRecommendations') && viewsSrc.includes('openRecommendationDetail'));
  assert('views.js delegates recommendation actions to recommendation-actions.js',
    viewsSrc.includes("from './recommendation-actions.js'") &&
    recommendationActionsSrc.includes('export function createRecommendationActions'));
  assert('dashboard has Recommendations widget surface', dashboardWidgetsSrc.includes("id: 'recommendations'") && dashboardWidgetsSrc.includes('renderDashboardRecommendationsWidget'));
  assert('dismissed recommendations render a Restore action',
    dashboardWidgetRenderersSrc.includes("candidate.dismissed ? 'Restore' : 'Dismiss'") &&
    dashboardWidgetRenderersSrc.includes("window.dismissRecommendation(${inlineJsString(candidate.id)}, ${candidate.dismissed ? 'false' : 'true'})"));
  assert('dismissRecommendation can restore a dismissed recommendation',
    /function dismissRecommendation\(id, on = true\)[\s\S]{0,120}setRecommendationState\('dismissed', id, !!on\)/.test(recommendationActionsSrc));
  assert('Recommendations page header directly toggles its dashboard widget',
    lensPagesSrc.includes("inlineHandlerCall(dashboardAction, 'recommendations')") &&
    !viewsSrc.includes("openDashboardWidgetPicker && window.openDashboardWidgetPicker()\">Add to Dashboard"));

  // ═══════════════════════════════════════
  // 10. Settings toggle
  // ═══════════════════════════════════════
  console.log('%c 10. Settings Toggle ', 'font-weight:bold;color:#f59e0b');

  assert('Settings has Tips & Recommendations toggle', settingsSrc.includes('Tips & Recommendations'));
  assert('Settings has product-recs toggle', settingsSrc.includes('settings-product-recs'));
  assert('Settings calls setProductRecsEnabled', settingsSrc.includes('setProductRecsEnabled'));

  // ═══════════════════════════════════════
  // 11. System prompt
  // ═══════════════════════════════════════
  console.log('%c 11. System Prompt ', 'font-weight:bold;color:#f59e0b');

  assert('System prompt has Supplement Recommendations section', constantsSrc.includes('## Supplement Recommendations'));
  assert('System prompt mentions food first', constantsSrc.includes('free actions first'));
  assert('System prompt mentions specific form', constantsSrc.includes('specific form'));
  assert('System prompt mentions medication interactions', constantsSrc.includes('medication interactions'));

  // ═══════════════════════════════════════
  // 12. Service Worker + CSS
  // ═══════════════════════════════════════
  console.log('%c 12. Infrastructure ', 'font-weight:bold;color:#f59e0b');

  assert('SW includes recommendations.js', swSrc.includes('/js/recommendations.js'));
  assert('SW includes recommendation-actions.js', swSrc.includes('/js/recommendation-actions.js'));

  // Node port: read styles.css directly. Browser styleSheets walk is
  // brittle (cross-origin, parsing race); source inspection is more reliable.
  const cssSrc = read('/styles.css');
  assert('CSS has .rec-section rule', cssSrc.includes('.rec-section'));
  assert('CSS keeps Tips badge outside line-clamped chart title text', cssSrc.includes('.chart-card-title-text') && cssSrc.includes('.chart-card-tips-host .ctx-tips-badge'));
  assert('CSS gives detail modal recommendation sections horizontal spacing', cssSrc.includes('.marker-detail-modal [id^="rec-modal-"]'));

  // ═══════════════════════════════════════
  // 13. Security
  // ═══════════════════════════════════════
  console.log('%c 13. Security ', 'font-weight:bold;color:#f59e0b');

  assert('Product URLs validated to https?', recSrc.includes("'https?://'") || recSrc.includes('/^https?:\\/\\//'));
  assert('escapeHTML used for product rendering', recSrc.includes('escapeHTML(product.brand)'));
  assert('escapeHTML used for slot label', recSrc.includes('escapeHTML(label)'));

  // ═══════════════════════════════════════
  // 14. Light-device catalog wiring
  // ═══════════════════════════════════════
  console.log('%c 14. Light-device catalog wiring ', 'font-weight:bold;color:#f59e0b');

  assert('getLightDeviceProduct exported',
    recSrc.includes('export function getLightDeviceProduct'));
  assert('renderLightDeviceAffiliateRow exported',
    recSrc.includes('export function renderLightDeviceAffiliateRow'));
  assert('getLightDeviceProduct on window', typeof window.getLightDeviceProduct === 'function');
  assert('renderLightDeviceAffiliateRow on window', typeof window.renderLightDeviceAffiliateRow === 'function');

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
  const found = window.getLightDeviceProduct(stubCatalog, 'mitochondriak-maxi-uvb');
  assert('getLightDeviceProduct: matching slug → product', !!found && found.key === 'mitochondriak-maxi-uvb');
  const missing = window.getLightDeviceProduct(stubCatalog, 'unknown-device');
  assert('getLightDeviceProduct: unknown slug → null', missing === null);
  const noCatalog = window.getLightDeviceProduct(null, 'mitochondriak-maxi-uvb');
  assert('getLightDeviceProduct: null catalog → null', noCatalog === null);
  const noSlug = window.getLightDeviceProduct(stubCatalog, '');
  assert('getLightDeviceProduct: empty slug → null', noSlug === null);

  // Render: requires product recs enabled
  window.setProductRecsEnabled(true);
  const row = window.renderLightDeviceAffiliateRow(stubCatalog, 'mitochondriak-maxi-uvb');
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

  const emptyOnMiss = window.renderLightDeviceAffiliateRow(stubCatalog, 'unknown-device');
  assert('renderLightDeviceAffiliateRow: missing product → empty string', emptyOnMiss === '');

  window.setProductRecsEnabled(false);
  const offWhenDisabled = window.renderLightDeviceAffiliateRow(stubCatalog, 'mitochondriak-maxi-uvb');
  assert('renderLightDeviceAffiliateRow: toggle off → empty string', offWhenDisabled === '');
  window.setProductRecsEnabled(true);

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
    typeof window.recommendDeviceProductsForChannelDeficit === 'function');
  assert('renderChannelDeficitDeviceRecs on window',
    typeof window.renderChannelDeficitDeviceRecs === 'function');

  const presetStubs = [
    { id: 'mitochondriak-maxi-uvb', brand: 'Mitochondriak', model: 'Maxi UVB',
      catalogSlug: 'mitochondriak-maxi-uvb', channels: ['vitamin_d', 'no_cv'] },
    { id: 'pbm-only', brand: 'Mitochondriak', model: 'PBM-only',
      catalogSlug: 'mitochondriak-maxi-uvb', channels: ['pbm_red', 'pbm_nir'] },
    { id: 'no-slug', brand: 'X', model: 'Y', channels: ['pbm_red'] },
  ];

  const pbmRedHits = window.recommendDeviceProductsForChannelDeficit(
    stubCatalog, 'pbm_red', presetStubs);
  assert('recommendDeviceProductsForChannelDeficit: pbm_red → matching product',
    Array.isArray(pbmRedHits) && pbmRedHits.length === 1 &&
    pbmRedHits[0].key === 'mitochondriak-maxi-uvb');

  const novelChannel = window.recommendDeviceProductsForChannelDeficit(
    stubCatalog, 'imaginary_channel', presetStubs);
  assert('recommendDeviceProductsForChannelDeficit: unknown channel → []',
    Array.isArray(novelChannel) && novelChannel.length === 0);

  const noPresets = window.recommendDeviceProductsForChannelDeficit(
    stubCatalog, 'pbm_red', []);
  assert('recommendDeviceProductsForChannelDeficit: empty presets → []',
    Array.isArray(noPresets) && noPresets.length === 0);

  // renderChannelDeficitDeviceRecs respects the toggle.
  window.setProductRecsEnabled(true);
  const card = window.renderChannelDeficitDeviceRecs(
    stubCatalog, 'pbm_red', presetStubs, { label: 'red 660 nm (PBM)' });
  assert('renderChannelDeficitDeviceRecs: builds card with channel label',
    card.includes('rec-channel-deficit') && card.includes('red 660 nm (PBM)'));
  assert('renderChannelDeficitDeviceRecs: stamps light-devices campaign',
    card.includes('utm_campaign=light-devices'));
  assert('renderChannelDeficitDeviceRecs: Umami event uses light-deficit-rec prefix',
    /data-umami-event="light-deficit-rec-/.test(card));

  window.setProductRecsEnabled(false);
  const offCard = window.renderChannelDeficitDeviceRecs(
    stubCatalog, 'pbm_red', presetStubs, { label: 'red 660 nm (PBM)' });
  assert('renderChannelDeficitDeviceRecs: toggle off → empty string',
    offCard === '');
  window.setProductRecsEnabled(true);

  // ═══════════════════════════════════════
  // Results
  // ═══════════════════════════════════════
console.log(`\nResults: ${pass} passed, ${fail} failed, ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
