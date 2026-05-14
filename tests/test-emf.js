#!/usr/bin/env node
// test-emf.js — EMF assessment: SBM-2015 thresholds, getEMFSeverity tiers,
// EMF affiliate catalog (meters / mitigations / coupon / UTM / region
// resolution), EMF chat-context detection, mitigation-in-text detection.
//
// Run: node tests/test-emf.js  (or via npm test)
//
// Pure-logic + module-import test — no DOM-runtime sections, so it ports
// whole (the original's only `document` reference was a bogus result-count
// fallback that always resolved to a hardcoded 130).

import './_node-shim.js';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

let pass = 0, _failCount = 0, _skipCount = 0;
const assert = (name, condition, detail) => {
  if (condition) { pass++; console.log(`  PASS: ${name}`); }
  else { _failCount++; console.log(`  FAIL: ${name}${detail ? ' — ' + detail : ''}`); }
};

console.log('=== EMF Assessment Tests ===\n');

// Skip-on-stub variant — used for assertions that read live catalog
// content (vendors, products, affiliate URLs). Dependabot PRs and forks
// don't get CATALOG_FETCH_TOKEN so the example stub stands in; these
// tests would deterministically fail against the stub. Detected via the
// `_stub: true` marker in data/recommendations.example.json.
let STUB_CATALOG = false;
const assertCatalog = (name, condition, detail) => {
  if (STUB_CATALOG) {
    _skipCount++;
    console.log(`  SKIP: ${name} (stub catalog)`);
    return;
  }
  assert(name, condition, detail);
};

// Import schema functions
const { SBM_2015_THRESHOLDS, getEMFSeverity } = await import('../js/schema.js');

// ── SBM-2015 Thresholds Structure ──
assert('1. SBM_2015_THRESHOLDS exists', typeof SBM_2015_THRESHOLDS === 'object');
const expectedTypes = ['acElectric', 'acMagnetic', 'rfMicrowave', 'dirtyElectricity', 'dcMagnetic'];
assert('2. All 5 measurement types defined', expectedTypes.every(t => SBM_2015_THRESHOLDS[t]));

for (const type of expectedTypes) {
  const def = SBM_2015_THRESHOLDS[type];
  assert(`3. ${type} has name`, typeof def.name === 'string' && def.name.length > 0);
  assert(`4. ${type} has unit`, typeof def.unit === 'string' && def.unit.length > 0);
  assert(`5. ${type} has 4 sleeping tiers`, def.sleeping.length === 4);
  assert(`6. ${type} sleeping tiers ascending`, def.sleeping[0].max < def.sleeping[1].max && def.sleeping[1].max < def.sleeping[2].max);
  assert(`7. ${type} last sleeping tier is Infinity`, def.sleeping[3].max === Infinity);
  assert(`5b. ${type} has 4 daytime tiers`, def.daytime.length === 4);
  assert(`6b. ${type} daytime tiers ascending`, def.daytime[0].max < def.daytime[1].max && def.daytime[1].max < def.daytime[2].max);
  assert(`7b. ${type} last daytime tier is Infinity`, def.daytime[3].max === Infinity);
  assert(`7c. ${type} daytime thresholds >= sleeping`, def.daytime[0].max >= def.sleeping[0].max);
}

// ── getEMFSeverity ──
assert('8. getEMFSeverity exists', typeof getEMFSeverity === 'function');
assert('9. null value returns null', getEMFSeverity('acElectric', null) === null);
assert('10. unknown type returns null', getEMFSeverity('unknown', 5) === null);

// AC Electric: <1 green, 1-5 yellow, 5-50 orange, >50 red
assert('11. AC Electric 0.5 = No concern', getEMFSeverity('acElectric', 0.5).color === 'green');
assert('12. AC Electric 3 = Slight concern', getEMFSeverity('acElectric', 3).color === 'yellow');
assert('13. AC Electric 25 = Severe concern', getEMFSeverity('acElectric', 25).color === 'orange');
assert('14. AC Electric 100 = Extreme concern', getEMFSeverity('acElectric', 100).color === 'red');

// AC Magnetic: <20 green, 20-100 yellow, 100-500 orange, >500 red
assert('15. AC Magnetic 10 = No concern', getEMFSeverity('acMagnetic', 10).color === 'green');
assert('16. AC Magnetic 50 = Slight concern', getEMFSeverity('acMagnetic', 50).color === 'yellow');
assert('17. AC Magnetic 300 = Severe concern', getEMFSeverity('acMagnetic', 300).color === 'orange');
assert('18. AC Magnetic 1000 = Extreme concern', getEMFSeverity('acMagnetic', 1000).color === 'red');

// RF: <0.1 green, 0.1-10 yellow, 10-1000 orange, >1000 red
assert('19. RF 0.05 = No concern', getEMFSeverity('rfMicrowave', 0.05).color === 'green');
assert('20. RF 5 = Slight concern', getEMFSeverity('rfMicrowave', 5).color === 'yellow');
assert('21. RF 500 = Severe concern', getEMFSeverity('rfMicrowave', 500).color === 'orange');
assert('22. RF 5000 = Extreme concern', getEMFSeverity('rfMicrowave', 5000).color === 'red');

// Dirty Electricity: <25 green, 25-50 yellow, 50-200 orange, >200 red
assert('23. DE 10 = No concern', getEMFSeverity('dirtyElectricity', 10).color === 'green');
assert('24. DE 35 = Slight concern', getEMFSeverity('dirtyElectricity', 35).color === 'yellow');
assert('25. DE 150 = Severe concern', getEMFSeverity('dirtyElectricity', 150).color === 'orange');
assert('26. DE 300 = Extreme concern', getEMFSeverity('dirtyElectricity', 300).color === 'red');

// DC Magnetic: <1 green, 1-5 yellow, 5-20 orange, >20 red
assert('27. DC 0.5 = No concern', getEMFSeverity('dcMagnetic', 0.5).color === 'green');
assert('28. DC 3 = Slight concern', getEMFSeverity('dcMagnetic', 3).color === 'yellow');
assert('29. DC 10 = Severe concern', getEMFSeverity('dcMagnetic', 10).color === 'orange');
assert('30. DC 50 = Extreme concern', getEMFSeverity('dcMagnetic', 50).color === 'red');

// ── Daytime thresholds (more lenient) ──
assert('31. AC Electric 2 daytime = No concern', getEMFSeverity('acElectric', 2, false).color === 'green');
assert('32. AC Electric 2 sleeping = Slight concern', getEMFSeverity('acElectric', 2, true).color === 'yellow');
assert('33. Default is sleeping', getEMFSeverity('acElectric', 2).color === 'yellow');

// ── Boundary values (exclusive upper) ──
assert('34. AC Electric exactly 1 = Slight (sleeping)', getEMFSeverity('acElectric', 1).color === 'yellow');
assert('35. Zero value = No concern', getEMFSeverity('acElectric', 0).color === 'green');

// ── Severity label strings ──
assert('35. Green tier label', getEMFSeverity('acElectric', 0).label === 'No concern');
assert('36. Yellow tier label', getEMFSeverity('acElectric', 1).label === 'Slight concern');
assert('37. Orange tier label', getEMFSeverity('acElectric', 5).label === 'Severe concern');
assert('38. Red tier label', getEMFSeverity('acElectric', 50).label === 'Extreme concern');

// ── State defaults ──
const { state } = await import('../js/state.js');
assert('39. state.importedData has emfAssessment', 'emfAssessment' in state.importedData);
assert('40. emfAssessment default is null', state.importedData.emfAssessment === null);

// ── Constants ──
const { EMF_ROOM_PRESETS, EMF_SOURCES, EMF_MITIGATIONS } = await import('../js/constants.js');
assert('41. EMF_ROOM_PRESETS is array', Array.isArray(EMF_ROOM_PRESETS) && EMF_ROOM_PRESETS.length >= 5);
assert('42. EMF_SOURCES is array', Array.isArray(EMF_SOURCES) && EMF_SOURCES.length >= 10);
assert('43. EMF_MITIGATIONS is array', Array.isArray(EMF_MITIGATIONS) && EMF_MITIGATIONS.length >= 10);
assert('44. Bedroom in room presets', EMF_ROOM_PRESETS.includes('Bedroom'));

// ── Lazy-load stub sync check ──
const emfMod = await import('../js/emf.js');
const emfWindowFns = ['openEMFAssessmentEditor','addEMFAssessment','toggleEMFAssessment','selectEMFRoom','handleEMFRoomDropdown','addEMFRoom','removeEMFRoom','deleteEMFAssessment','updateEMFField','updateEMFRoom','updateEMFMeasurement','updateEMFMeter','saveEMFExplicit','toggleEMFCompare','interpretEMFAssessment','interpretEMFComparison','closeEMFInterpretation','discussEMFInterpretation','addEMFPhotos','removeEMFPhoto','viewEMFPhoto','handleEMFPDF'];
const missingExports = emfWindowFns.filter(fn => typeof emfMod[fn] !== 'function');
assert('45. All lazy-stub fns exist in emf.js exports', missingExports.length === 0, missingExports.join(', '));

// ── EMF affiliate catalog (Safe Living Technologies) ──
const recsMod = await import('../js/recommendations.js');
assert('46. loadEMFCatalog exported', typeof recsMod.loadEMFCatalog === 'function');
assert('47. getEMFMeters exported', typeof recsMod.getEMFMeters === 'function');
assert('48. getEMFProductsForMitigations exported', typeof recsMod.getEMFProductsForMitigations === 'function');
assert('49. renderEMFMeterRecs exported', typeof recsMod.renderEMFMeterRecs === 'function');
assert('50. renderEMFMitigationRecs exported', typeof recsMod.renderEMFMitigationRecs === 'function');

// loadEMFCatalog fetches data/recommendations.json — install an fs-backed
// fetch shim so the relative path resolves in Node. (fs/path/url imports
// are grouped at the top of the file.)
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel.replace(/^\//, '')), 'utf-8');
const _realFetch = globalThis.fetch;
globalThis.fetch = async (url, opts) => {
  if (typeof url === 'string' && !/^https?:/.test(url)) {
    const rel = url.replace(/^\//, '');
    try { return new Response(read(rel), { status: 200 }); }
    catch (_) { return new Response('', { status: 404 }); }
  }
  return _realFetch(url, opts);
};

// Post-consolidation: data lives in unified recommendations.json catalog
const emfCat = await recsMod.loadEMFCatalog();
STUB_CATALOG = !!(emfCat && emfCat._stub === true);
if (STUB_CATALOG) console.log('  [stub catalog detected — catalog-content asserts will skip]');
assert('51. Unified catalog loads', !!emfCat, 'expected recommendations.json to fetch');
assertCatalog('52. Catalog has SLT vendor', !!emfCat?.vendors?.slt?.name);
assertCatalog('53. SLT coupon code is "getbased"', emfCat?.vendors?.slt?.coupon?.code === 'getbased');
const meters = emfCat?.products?.['_internal.emfMeters'] || [];
assertCatalog('54. Catalog has at least 3 meters', Array.isArray(meters) && meters.length >= 3);
assertCatalog('55. Pro II meter present', meters.some(m => /Pro II/i.test(m.name)));
assertCatalog('56. EM3 meter present', meters.some(m => /EM3/i.test(m.name)));
assertCatalog('57. Pro II URL has affiliate ID', meters.find(m => /Pro II/i.test(m.name))?.url?.includes('aff=466'));
assertCatalog('58. EM3 URL has affiliate ID', meters.find(m => /EM3/i.test(m.name))?.url?.includes('aff=466'));
assertCatalog('58a. Line EMI meter present (dirty electricity)', meters.some(m => (m.matchTypes || []).includes('dirtyElectricity') && /Line EMI/i.test(m.name)));
assertCatalog('58b. Line EMI URL has affiliate ID', meters.find(m => /Line EMI/i.test(m.name))?.url?.includes('aff=466'));

// Filter meters by measurement type
const rfMeters = recsMod.getEMFMeters(emfCat, ['rfMicrowave']);
assert('59. getEMFMeters filters to RF', rfMeters.length >= 1 && rfMeters.every(m => m.matchTypes.includes('rfMicrowave')));
const allMeters = recsMod.getEMFMeters(emfCat, []);
assertCatalog('60. getEMFMeters returns all when no type filter', allMeters.length === meters.length);

// Mitigation tag → product lookup
const paintProds = recsMod.getEMFProductsForMitigations(emfCat, ['shielding paint (Yshield)']);
assert('61. Paint mitigation finds at least one product', paintProds.length >= 1);
assertCatalog('62. Paint product URL has affiliate ID', paintProds[0]?.url?.includes('aff=466'));

const multiProds = recsMod.getEMFProductsForMitigations(emfCat, ['shielding paint (Yshield)', 'Stetzerizer filters', 'shielding paint (Yshield)']);
assertCatalog('63. getEMFProductsForMitigations dedupes', multiProds.length >= 2 && new Set(multiProds.map(p => p.url + '|' + p.name)).size === multiProds.length);

const noMatch = recsMod.getEMFProductsForMitigations(emfCat, ['nonexistent mitigation tag']);
assert('64. Unknown mitigation returns empty', noMatch.length === 0);

// Render gating: when toggle is OFF, returns empty string
const prevToggle = localStorage.getItem('labcharts-show-product-recs');
localStorage.setItem('labcharts-show-product-recs', 'false');
assert('65. renderEMFMeterRecs respects toggle (off)', recsMod.renderEMFMeterRecs(emfCat) === '');
assert('66. renderEMFMitigationRecs respects toggle (off)', recsMod.renderEMFMitigationRecs(emfCat, ['shielding paint (Yshield)']) === '');
localStorage.setItem('labcharts-show-product-recs', 'true');
const meterHtml = recsMod.renderEMFMeterRecs(emfCat);
assertCatalog('67. renderEMFMeterRecs returns HTML when on', meterHtml.includes('rec-emf-section') && meterHtml.includes('aff=466'));
assert('68. Meter rec HTML carries coupon line', meterHtml.includes('rec-coupon') && meterHtml.includes('getbased'));
const mitHtml = recsMod.renderEMFMitigationRecs(emfCat, ['Stetzerizer filters']);
assertCatalog('69. Mitigation rec HTML mentions Stetzer/Greenwave/dirty', /Stetzerizer|Greenwave|Dirty electricity/i.test(mitHtml));
assert('70. Empty tag list returns empty string', recsMod.renderEMFMitigationRecs(emfCat, []) === '');
if (prevToggle === null) localStorage.removeItem('labcharts-show-product-recs');
else localStorage.setItem('labcharts-show-product-recs', prevToggle);

// ── EMF chat-context detection (one-time hint trigger) ──
assert('71. detectEMFRelevance exported', typeof recsMod.detectEMFRelevance === 'function');
assert('72. Detects "EMF" mention', recsMod.detectEMFRelevance('I am worried about EMF in my bedroom'));
assert('73. Detects RF radiation (compound)', recsMod.detectEMFRelevance('how much RF radiation is too much?'));
assert('74. Detects "5G tower"', recsMod.detectEMFRelevance('the 5G tower next door'));
assert('75. Detects dirty electricity', recsMod.detectEMFRelevance('My LED dimmers cause dirty electricity'));
assert('76. Detects cell tower', recsMod.detectEMFRelevance('there is a cell tower nearby'));
assert('77. Detects Yshield', recsMod.detectEMFRelevance('I want to apply yshield paint'));
assert('78. Detects Stetzer', recsMod.detectEMFRelevance('Stetzer filters help with this'));
assert('79. Detects WiFi+sleep correlation', recsMod.detectEMFRelevance('My wifi router is in my bedroom'));
assert('80. Skips generic insomnia', !recsMod.detectEMFRelevance('I have trouble falling asleep'));
assert('81. Skips generic fatigue', !recsMod.detectEMFRelevance('I am chronically tired and fatigued'));
assert('82. Skips empty/null', !recsMod.detectEMFRelevance('') && !recsMod.detectEMFRelevance(null));
assert('82a. Skips RF ablation (medical, not EMF)', !recsMod.detectEMFRelevance('I had RF ablation for my heart arrhythmia'));
assert('82b. Skips RF coil (MRI, not EMF)', !recsMod.detectEMFRelevance('the RF coil in the MRI machine'));
assert('82c. Skips creatine 5g dose', !recsMod.detectEMFRelevance('I take 5g of creatine daily'));
assert('82d. Skips 5G policy talk', !recsMod.detectEMFRelevance('legislation about 5G is contentious'));

// ── Mitigation detection in AI interpretation text ──
assert('83. detectMitigationsInText exported', typeof recsMod.detectMitigationsInText === 'function');
const m1 = recsMod.detectMitigationsInText('Consider applying Yshield paint to the bedroom walls.');
assert('84. Detects Yshield → shielding paint', m1.includes('shielding paint (Yshield)'));
const m2 = recsMod.detectMitigationsInText('A bed canopy would help with cell-tower RF.');
assert('85. Detects bed canopy → shielding fabric', m2.includes('shielding fabric / canopy'));
const m3 = recsMod.detectMitigationsInText('Stetzerizer filters on bedroom outlets.');
assert('86. Detects Stetzerizer → filters tag', m3.includes('Stetzerizer filters'));
const m4 = recsMod.detectMitigationsInText('Install a demand switch (Netzfreischalter).');
assert('87. Detects demand switch tag', m4.includes('demand switch (Netzfreischalter)'));
const m5 = recsMod.detectMitigationsInText('Use shielded ethernet cables to the router.');
assert('88. Detects shielded cables', m5.includes('shielded cables'));
const m6 = recsMod.detectMitigationsInText('A grounding rod connected to the panel.');
assert('89. Detects grounding rod', m6.includes('grounding rod'));
const m7 = recsMod.detectMitigationsInText('Install Yshield paint, a bed canopy, and Stetzer filters.');
assert('90. Combined detection finds 3 distinct tags', m7.length === 3);
const m8 = recsMod.detectMitigationsInText('Your bedroom RF is severe. Reduce sources at night.');
assert('91. Empty when no specific mitigation mentioned', m8.length === 0);
assert('92. Empty for null/empty text', recsMod.detectMitigationsInText('').length === 0 && recsMod.detectMitigationsInText(null).length === 0);

// ── Coupon click-to-copy renders as button, not <code> ──
localStorage.setItem('labcharts-show-product-recs', 'true');
const couponHtml = recsMod.renderEMFMeterRecs(emfCat);
assert('93. Coupon renders as clickable button', couponHtml.includes('rec-coupon-code') && couponHtml.includes('copyCouponCode'));
assert('94. copyCouponCode exposed on window', typeof window.copyCouponCode === 'function');
assert('94a. Coupon button has aria-label', /aria-label="Copy coupon code/.test(couponHtml));
assert('94b. Coupon wrapper announces flash via aria-live', /aria-live="polite"/.test(couponHtml));
assert('94c. Affiliate links carry aria-label "opens in new tab"', /opens in new tab/.test(couponHtml));
const hostlistedHtml = recsMod.renderEMFMeterRecs(emfCat);
assertCatalog('94d. Trusted SLT URL renders as link', hostlistedHtml.includes('safelivingtechnologies.com'));
const malCat = JSON.parse(JSON.stringify(emfCat));
malCat.products['_internal.emfMeters'][0].url = 'https://attacker.com/?safelivingtechnologies.com=fake';
const malHtml = recsMod.renderEMFMeterRecs(malCat);
assert('94e. Allowlist blocks attacker.com URL', !malHtml.includes('attacker.com'));

// Umami event tagging — six surfaces, opt-out gate inherited from Settings → Privacy
const meterEvents = recsMod.renderEMFMeterRecs(emfCat);
assert('94f. Meter rec links carry Umami events', /data-umami-event="emf-meter-rec-/.test(meterEvents));
const mitEvents = recsMod.renderEMFMitigationRecs(emfCat, ['shielding paint (Yshield)']);
assertCatalog('94g. Mitigation rec links carry Umami events', /data-umami-event="emf-mitigation-rec-/.test(mitEvents));
const customEvent = recsMod.renderEMFMeterRecs(emfCat, { eventPrefix: 'meter-test' });
assert('94h. Custom eventPrefix works', /data-umami-event="emf-meter-test-/.test(customEvent));

// UTM tagging — affiliate dashboard attribution by surface
assert('94i. Meter rec links carry utm_source=getbased', /utm_source=getbased/.test(meterEvents));
assert('94j. Meter rec links carry utm_medium=affiliate', /utm_medium=affiliate/.test(meterEvents));
assert('94k. Meter rec links carry utm_campaign=emf', /utm_campaign=emf(&|")/.test(meterEvents));
assert('94l. Meter rec links carry utm_content matching surface', /utm_content=meter-rec-/.test(meterEvents));
assertCatalog('94m. Mitigation rec links carry utm_content matching surface', /utm_content=mitigation-rec-/.test(mitEvents));
assertCatalog('94n. UTM-tagged URL preserves existing aff=466', /aff=466/.test(meterEvents) && /utm_source=getbased/.test(meterEvents));
const tagged = recsMod._addUTMParams('https://safelivingtechnologies.com/x?aff=466', 'meter-rec-x');
const retagged = recsMod._addUTMParams(tagged, 'meter-rec-x');
assert('94o. _addUTMParams is idempotent', (retagged.match(/utm_source=/g) || []).length === 1);
assert('94p. _addUTMParams returns input unchanged on invalid URL', recsMod._addUTMParams('not a url', 'x') === 'not a url');

// Multi-region vendor resolution — coupon + homepage as Record<RegionCode, …>
const flatCoupon = { code: 'getbased', userDiscount: '10%' };
assert('94q. Flat coupon passes through unchanged', recsMod._resolveCouponForRegion(flatCoupon, 'CZSK') === flatCoupon);
const regionalCoupon = {
  CZ: { code: 'GBCZ10', userDiscount: '10%' },
  SK: { code: 'GBSK10', userDiscount: '10%' },
  EN: { code: 'getbased', userDiscount: '10%' },
};
assert('94r. Regional coupon — direct CZ hit', recsMod._resolveCouponForRegion(regionalCoupon, 'CZ').code === 'GBCZ10');
assert('94s. Regional coupon — multi-region marker decomposes (CZSK → CZ first)', recsMod._resolveCouponForRegion(regionalCoupon, 'CZSK').code === 'GBCZ10');
assert('94t. Regional coupon — falls back to EN/worldwide', recsMod._resolveCouponForRegion(regionalCoupon, 'DE').code === 'getbased');
assert('94u. Regional coupon — null/missing returns null', recsMod._resolveCouponForRegion(null, 'CZ') === null);
assert('94v. Flat homepage string passes through', recsMod._resolveHomepageForRegion('https://x.com?aff=1', 'CZ') === 'https://x.com?aff=1');
const regionalHomepage = {
  CZ: 'https://x.cz?aff=A',
  SK: 'https://x.sk?aff=B',
  EN: 'https://x.com?aff=C',
};
assert('94w. Regional homepage — SK direct hit', recsMod._resolveHomepageForRegion(regionalHomepage, 'SK') === 'https://x.sk?aff=B');
assert('94x. Regional homepage — INTL falls back to EN', recsMod._resolveHomepageForRegion(regionalHomepage, 'INTL') === 'https://x.com?aff=C');

// Region hierarchy — single source of truth shared by product filter + _pickRegional
const chain = recsMod.regionLookupChain;
assert('94y1. CZ chain expands to [CZ, EU, INTL]', JSON.stringify(chain('CZ')) === JSON.stringify(['CZ', 'EU', 'INTL']));
assert('94y2. EU chain expands to [EU, INTL]', JSON.stringify(chain('EU')) === JSON.stringify(['EU', 'INTL']));
assert('94y3. CZSK chain expands to [CZ, SK, EU, INTL]', JSON.stringify(chain('CZSK')) === JSON.stringify(['CZ', 'SK', 'EU', 'INTL']));
assert('94y4. Unknown region falls through with INTL fallback', JSON.stringify(chain('XYZ')) === JSON.stringify(['XYZ', 'INTL']));
assert('94y5. INTL chain is just [INTL]', JSON.stringify(chain('INTL')) === JSON.stringify(['INTL']));

const filterCat = {
  products: {
    'a.b': [
      { name: 'INTL-only', regions: ['INTL'] },
      { name: 'EU-only', regions: ['EU'] },
      { name: 'CZ-only', regions: ['CZ'] },
      { name: 'SK-only', regions: ['SK'] },
    ],
  },
};
const cz = recsMod.getProductsForSlot(filterCat, 'a.b', 'CZ').map(p => p.name);
assert('94y6. CZ user sees INTL + EU + CZ products',
  cz.includes('INTL-only') && cz.includes('EU-only') && cz.includes('CZ-only') && !cz.includes('SK-only'));
const eu = recsMod.getProductsForSlot(filterCat, 'a.b', 'EU').map(p => p.name);
assert('94y7. EU user sees only INTL + EU products',
  eu.includes('INTL-only') && eu.includes('EU-only') && !eu.includes('CZ-only'));
const czsk = recsMod.getProductsForSlot(filterCat, 'a.b', 'CZSK').map(p => p.name);
assert('94y8. CZSK user sees both CZ and SK + EU + INTL',
  czsk.includes('CZ-only') && czsk.includes('SK-only') && czsk.includes('EU-only') && czsk.includes('INTL-only'));

const vendorMap = { EU: 'https://x.eu', INTL: 'https://x.com' };
assert('94y9. CZ user falls through to EU before INTL via hierarchy',
  recsMod._pickRegional(vendorMap, 'CZ') === 'https://x.eu');
assert('94y10. US user with no US key falls through to INTL',
  recsMod._pickRegional({ EU: 'eu', INTL: 'intl' }, 'US') === 'intl');

const usChain = recsMod.regionLookupChain('US');
assert('94y14. US chain is [US, INTL] (not [EU, INTL])', JSON.stringify(usChain) === JSON.stringify(['US', 'INTL']));
const skChain = recsMod.regionLookupChain('SK');
assert('94y15. SK chain is [SK, EU, INTL] (not lumped under CZSK)', JSON.stringify(skChain) === JSON.stringify(['SK', 'EU', 'INTL']));
assert('94y16. Slovak user gets SK URL, not CZ',
  recsMod._pickRegional({ CZ: 'https://x.cz', SK: 'https://x.sk', INTL: 'https://x.com' }, 'SK') === 'https://x.sk');

const taggedCampaign = recsMod._addUTMParams('https://x.com/p?aff=1', 'vitamins-vitaminD-mit', 'vitamins');
assert('94y11. _addUTMParams accepts campaign override', taggedCampaign.includes('utm_campaign=vitamins'));
assert('94y12. _addUTMParams default campaign is emf (back-compat)', recsMod._addUTMParams('https://x.com/p', 'foo').includes('utm_campaign=emf'));
assert('94y13. _addUTMParams preserves existing aff param', taggedCampaign.includes('aff=1') && taggedCampaign.includes('utm_source=getbased'));

// _resolveProductUrlForRegion — products with per-region url/affiliateUrl maps
assert('94z. Flat product url passes through',
  recsMod._resolveProductUrlForRegion({ url: 'https://x.com' }, 'CZ') === 'https://x.com');
assert('94aa. Per-region product url picks by region',
  recsMod._resolveProductUrlForRegion({ url: { CZ: 'https://x.cz', INTL: 'https://x.com' } }, 'CZ') === 'https://x.cz');
assert('94ab. Per-region product url falls back to INTL on unknown region',
  recsMod._resolveProductUrlForRegion({ url: { CZ: 'https://x.cz', INTL: 'https://x.com' } }, 'DE') === 'https://x.com');
assert('94ac. affiliateUrl wins over url when both set',
  recsMod._resolveProductUrlForRegion({ url: 'https://x.com', affiliateUrl: 'https://x.com?aff=1' }, 'CZ') === 'https://x.com?aff=1');
assert('94ad. Per-region affiliateUrl picks correctly',
  recsMod._resolveProductUrlForRegion({ affiliateUrl: { CZ: 'https://x.cz?aff=A', INTL: 'https://x.com?aff=C' } }, 'CZ') === 'https://x.cz?aff=A');
assert('94ae. Multi-region marker decomposes for product URL (CZSK → CZ)',
  recsMod._resolveProductUrlForRegion({ url: { CZ: 'https://x.cz', SK: 'https://x.sk' } }, 'CZSK') === 'https://x.cz');
assert('94af. Null/undefined product returns null',
  recsMod._resolveProductUrlForRegion(null, 'CZ') === null);
assert('94ag. Array-shaped product URL rejected',
  recsMod._resolveProductUrlForRegion({ url: ['https://x'] }, 'CZ') === null);

// 50-char Umami event cap (was an HTTP 400 bug — caps name to fit Umami's API)
function _cap(s) { return s.slice(0, 50).replace(/-+$/, ''); }
assert('94ah. Umami event name capped at 50 chars',
  _cap('rec-vitamins-mitochondriak-infrapanel-mitochondriak-maxi-uvb').length <= 50);
assert('94ai. Cap trims trailing dash',
  !_cap('rec-vitamins-mitochondriak-infrapanel-mitochondriak----').endsWith('-'));

// regionLabel fallback for unknown / null / empty region
assert('94aj. regionLabel(US) → United States', recsMod.regionLabel('US') === 'United States');
assert('94ak. regionLabel(unknown) → worldwide', recsMod.regionLabel('XX') === 'worldwide');
assert('94al. regionLabel(null/empty) → worldwide',
  recsMod.regionLabel(null) === 'worldwide' && recsMod.regionLabel('') === 'worldwide');

// Region indicator + change-link wiring (smoke test for the disclosure footer)
delete window.openProfileLocationEditor;
localStorage.setItem('labcharts-show-product-recs', 'true');
const discMeterHtml = recsMod.renderEMFMeterRecs(emfCat);
assert('94am. Disclosure footer renders region indicator', /Showing for /.test(discMeterHtml));
assert('94an. Disclosure footer renders change link', /class="rec-region-edit"/.test(discMeterHtml));
assert('94ao. Change link calls openProfileLocationEditor on click', /openProfileLocationEditor/.test(discMeterHtml));

// Vendor-name rendering in EMF row (was hardcoded to "Safe Living Technologies")
assertCatalog('94ap. EMF row link copy uses vendor name (not hardcoded)', /View on Safe Living Technologies/.test(discMeterHtml));
const altCat = JSON.parse(JSON.stringify(emfCat));
altCat.vendors.testbrand = { name: 'TestBrand', homepage: 'https://testbrand.example/?ref=g', regions: ['INTL'] };
altCat.products['_internal.emfMeters'].push({
  type: 'product', key: 'tb-meter', name: 'TB Meter', vendor: 'TestBrand', vendorKey: 'testbrand',
  kind: 'RF', blurb: 'demo', url: 'https://testbrand.example/meter?ref=g',
  affiliateUrl: 'https://testbrand.example/meter?ref=g', regions: ['INTL'],
});
const altHtml = recsMod.renderEMFMeterRecs(altCat);
assert('94aq. EMF row link includes non-SLT vendor name', /View on TestBrand/.test(altHtml));
assert('94ar. Non-SLT vendor URL passes affiliate allowlist (catalog-derived)', altHtml.includes('testbrand.example'));

if (prevToggle === null) localStorage.removeItem('labcharts-show-product-recs');
else localStorage.setItem('labcharts-show-product-recs', prevToggle);

const skipNote = _skipCount ? ` (${_skipCount} skipped — stub catalog)` : '';
console.log(`\nResults: ${pass} passed, ${_failCount} failed${skipNote}, ${pass + _failCount} total`);
process.exit(_failCount > 0 ? 1 : 0);
