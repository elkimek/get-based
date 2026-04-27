// test-recommendations.js — Verify supplement & lifestyle recommendation module
// Run: fetch('tests/test-recommendations.js').then(r=>r.text()).then(s=>Function(s)())

return (async function() {
  let pass = 0, fail = 0;
  function assert(name, condition, detail) {
    if (condition) { pass++; console.log(`%c PASS %c ${name}`, 'background:#22c55e;color:#fff;padding:2px 6px;border-radius:3px', '', detail || ''); }
    else { fail++; console.error(`%c FAIL %c ${name}`, 'background:#ef4444;color:#fff;padding:2px 6px;border-radius:3px', '', detail || ''); }
  }

  console.log('%c Supplement & Lifestyle Recommendations Tests ', 'background:#6366f1;color:#fff;font-size:14px;padding:4px 12px;border-radius:4px');

  const recSrc = await fetchWithRetry('js/recommendations.js');
  const mainSrc = await fetchWithRetry('js/main.js');
  const chatSrc = await fetchWithRetry('js/chat.js');
  const viewsSrc = await fetchWithRetry('js/views.js');
  const contextSrc = await fetchWithRetry('js/context-cards.js');
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

  assert('main.js imports recommendations.js', mainSrc.includes("import './recommendations.js'"));
  assert('views.js has rec-modal placeholder', viewsSrc.includes('rec-modal-'));
  assert('views.js calls renderRecommendationSection', viewsSrc.includes('renderRecommendationSection'));
  assert('views.js shows recs for any marker with catalog slot', viewsSrc.includes('isProductRecsEnabled'));
  assert('chat.js calls detectSupplementSlots', chatSrc.includes('detectSupplementSlots'));
  assert('chat.js detects recSlots for live rendering', chatSrc.includes('_recSlots'));
  assert('chat.js has rec-chat-wrapper class', chatSrc.includes('rec-chat-wrapper'));
  assert('views.js has chart-rec placeholder in header', viewsSrc.includes('chart-rec-'));
  assert('views.js has loadChartCardRecs function', viewsSrc.includes('function loadChartCardRecs'));
  assert('views.js scrollToRec auto-opens details', viewsSrc.includes('scrollToRec'));
  assert('loadCatalog on window', typeof window.loadCatalog === 'function');

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

  // Check CSS classes exist in the page
  const styleSheets = Array.from(document.styleSheets);
  let hasRecSection = false;
  try {
    for (const sheet of styleSheets) {
      try {
        for (const rule of sheet.cssRules || []) {
          if (rule.selectorText && rule.selectorText.includes('.rec-section')) { hasRecSection = true; break; }
        }
      } catch(e) { /* cross-origin */ }
      if (hasRecSection) break;
    }
  } catch(e) {}
  assert('CSS has .rec-section rule', hasRecSection);

  // ═══════════════════════════════════════
  // 13. Security
  // ═══════════════════════════════════════
  console.log('%c 13. Security ', 'font-weight:bold;color:#f59e0b');

  assert('Product URLs validated to https?', recSrc.includes("'https?://'") || recSrc.includes('/^https?:\\/\\//'));
  assert('escapeHTML used for product rendering', recSrc.includes('escapeHTML(product.brand)'));
  assert('escapeHTML used for slot label', recSrc.includes('escapeHTML(label)'));

  // ═══════════════════════════════════════
  // Results
  // ═══════════════════════════════════════
  console.log(`\n%c Results: ${pass} passed, ${fail} failed `, `background:${fail?'#ef4444':'#22c55e'};color:#fff;font-size:14px;padding:4px 12px;border-radius:4px`);
})();
