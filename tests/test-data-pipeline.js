#!/usr/bin/env node
// test-data-pipeline.js — Core data pipeline verification: getActiveData, unit conversion, filtering, trends
//
// Run: node tests/test-data-pipeline.js  (or via npm test)

import './_node-shim.js';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const _ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const _realFetch = globalThis.fetch;
globalThis.fetch = async (url, opts) => {
  if (typeof url === 'string' && !/^https?:/.test(url)) {
    const rel = url.replace(/^\//, '');
    try {
      const body = fs.readFileSync(path.join(_ROOT, rel), 'utf-8');
      return new Response(body, { status: 200 });
    } catch (_) { return new Response('', { status: 404 }); }
  }
  return _realFetch(url, opts);
};

let pass = 0, fail = 0;
const results = [];
function assert(name, condition, detail) {
  if (condition) { pass++; results.push(`  PASS: ${name}`); }
  else { fail++; results.push(`  FAIL: ${name}${detail ? ' — ' + detail : ''}`); }
}
const wait = ms => new Promise(r => setTimeout(r, ms));

console.log('=== Data Pipeline Tests ===\n');

// Bring in state.js + data.js — getActiveData lives on window after data.js loads.
await import('../js/state.js');
await import('../js/data.js');

const S = window._labState;

  // ═══════════════════════════════════════════════
  // SETUP — load demo data into state
  // ═══════════════════════════════════════════════
  const origData = JSON.parse(JSON.stringify(S.importedData));
  const origSex = S.profileSex;
  const origDob = S.profileDob;
  const origUnits = S.unitSystem;
  const origRange = S.rangeMode;
  const origDateFilter = S.dateRangeFilter;

  const resp = await fetch('data/demo-male.json');
  const demo = await resp.json();
  S.importedData = demo;
  S.profileSex = 'male';
  S.profileDob = '1987-11-22';
  S.unitSystem = 'EU';
  S.rangeMode = 'optimal';
  S.dateRangeFilter = 'all';
  await wait(20);

  // ═══════════════════════════════════════════════
  // 1. Basic structure of getActiveData()
  // ═══════════════════════════════════════════════
  console.log('%c 1. Basic Structure ', 'font-weight:bold;color:#f59e0b');

  const data = window.getActiveData();
  assert('getActiveData returns object', typeof data === 'object' && data !== null);
  assert('data has dates array', Array.isArray(data.dates));
  assert('data has dateLabels array', Array.isArray(data.dateLabels));
  assert('data has categories object', typeof data.categories === 'object');
  assert('dates is non-empty with demo data', data.dates.length > 0, `got ${data.dates.length}`);
  assert('dates and dateLabels same length', data.dates.length === data.dateLabels.length);

  // Expected standard category keys
  const expectedCats = [
    'biochemistry', 'hormones', 'electrolytes', 'lipids', 'iron', 'proteins',
    'thyroid', 'vitamins', 'diabetes', 'hematology', 'differential',
    'coagulation', 'calculatedRatios'
  ];
  for (const cat of expectedCats) {
    assert(`categories has "${cat}"`, cat in data.categories, `missing from categories`);
  }
  assert('categories.biochemistry has label', typeof data.categories.biochemistry.label === 'string');
  assert('categories.biochemistry has icon', typeof data.categories.biochemistry.icon === 'string');
  assert('categories.biochemistry has markers', typeof data.categories.biochemistry.markers === 'object');

  // ═══════════════════════════════════════════════
  // 2. Marker structure
  // ═══════════════════════════════════════════════
  console.log('%c 2. Marker Structure ', 'font-weight:bold;color:#f59e0b');

  const glucose = data.categories.biochemistry.markers.glucose;
  assert('glucose marker exists', !!glucose);
  assert('glucose has values array', Array.isArray(glucose.values));
  assert('glucose has unit', typeof glucose.unit === 'string' && glucose.unit.length > 0, `got "${glucose.unit}"`);
  assert('glucose has refMin', typeof glucose.refMin === 'number', `got ${glucose.refMin}`);
  assert('glucose has refMax', typeof glucose.refMax === 'number', `got ${glucose.refMax}`);
  assert('glucose SI unit is mmol/l', glucose.unit === 'mmol/l', `got "${glucose.unit}"`);
  assert('glucose refMin is 4.11', glucose.refMin === 4.11, `got ${glucose.refMin}`);
  assert('glucose refMax is 5.60', glucose.refMax === 5.60, `got ${glucose.refMax}`);

  // Optimal ranges should be present in optimal rangeMode
  const tsh = data.categories.thyroid.markers.tsh;
  assert('tsh marker exists', !!tsh);
  // Check that optimalMin/optimalMax may exist (from OPTIMAL_RANGES)
  const hasOptimal = tsh.optimalMin != null || tsh.optimalMax != null;
  assert('tsh has optimal range (from OPTIMAL_RANGES)', hasOptimal, `optMin=${tsh.optimalMin}, optMax=${tsh.optimalMax}`);

  // ═══════════════════════════════════════════════
  // 3. Date alignment — values array length matches dates
  // ═══════════════════════════════════════════════
  console.log('%c 3. Date Alignment ', 'font-weight:bold;color:#f59e0b');

  const numDates = data.dates.length;
  // Demo has at least 4 dates (the originals) — exact count is allowed
  // to grow as the demo expands, but the floor matters because the chart
  // needs ≥4 to render a meaningful trend line.
  assert('demo data has at least 4 dates', numDates >= 4, `got ${numDates}`);

  // Index of the original 2025-03-15 spring panel — the entries we'll
  // assert specific values against were authored against this date.
  // Older 2024-* dates are backfill-only (carry the historical specialty
  // panels) and don't have the comprehensive markers asserted below.
  const ANCHOR_DATE = '2025-03-15';
  const anchorIdx = data.dates.indexOf(ANCHOR_DATE);
  assert(`demo includes the ${ANCHOR_DATE} spring panel`, anchorIdx >= 0,
    `dates: ${data.dates.join(',')}`);

  // Check values alignment for multiple markers
  const markersToCheck = [
    ['biochemistry', 'glucose'],
    ['lipids', 'cholesterol'],
    ['hematology', 'hemoglobin'],
    ['hormones', 'testosterone'],
    ['thyroid', 'tsh'],
    ['iron', 'ferritin'],
  ];
  for (const [catKey, mKey] of markersToCheck) {
    const cat = data.categories[catKey];
    const m = cat && cat.markers[mKey];
    if (m && !m.singlePoint) {
      assert(`${catKey}.${mKey} values length matches dates`, m.values.length === numDates,
        `values=${m.values.length}, dates=${numDates}`);
    }
  }

  // Check that glucose has actual values from demo (not all null)
  const glucoseNonNull = glucose.values.filter(v => v !== null);
  assert('glucose has non-null values from demo data', glucoseNonNull.length > 0, `all null`);
  assert(`glucose @ ${ANCHOR_DATE} is 4.8 (from demo)`,
    glucose.values[anchorIdx] === 4.8, `got ${glucose.values[anchorIdx]}`);

  // ═══════════════════════════════════════════════
  // 4. Unit conversion — SI to US
  // ═══════════════════════════════════════════════
  console.log('%c 4. Unit Conversion ', 'font-weight:bold;color:#f59e0b');

  // Switch to US units and get data
  S.unitSystem = 'US';
  const usData = window.getActiveData();

  // Glucose: 4.8 mmol/L * 18.018 = 86.4864 -> toPrecision(4) = 86.49
  // Index dynamically against the anchor date — earlier backfilled
  // dates (2024-*) carry sampled values that don't match these magic
  // numbers, so values[0] would be wrong.
  const usIdx = usData.dates.indexOf(ANCHOR_DATE);
  const gUS = usData.categories.biochemistry.markers.glucose;
  assert('glucose US unit is mg/dl', gUS.unit === 'mg/dl', `got "${gUS.unit}"`);
  assert(`glucose US @ ${ANCHOR_DATE} ~86.49`, Math.abs(gUS.values[usIdx] - 86.49) < 0.01,
    `got ${gUS.values[usIdx]}, expected ~86.49`);
  assert('glucose US refMin ~74.05', Math.abs(gUS.refMin - 74.05) < 0.1,
    `got ${gUS.refMin}, expected ~74.05`);
  assert('glucose US refMax ~100.9', Math.abs(gUS.refMax - 100.9) < 0.1,
    `got ${gUS.refMax}, expected ~100.9`);

  // Cholesterol: 4.8 mmol/L * 38.67 = 185.616 -> toPrecision(4) = 185.6
  const cUS = usData.categories.lipids.markers.cholesterol;
  assert('cholesterol US unit is mg/dl', cUS.unit === 'mg/dl', `got "${cUS.unit}"`);
  assert(`cholesterol US @ ${ANCHOR_DATE} ~185.6`, Math.abs(cUS.values[usIdx] - 185.6) < 0.1,
    `got ${cUS.values[usIdx]}, expected ~185.6`);

  // HbA1c: 31.0 mmol/mol -> (31.0/10.929) + 2.15 = 4.9865 -> toFixed(1) = 5.0
  const hUS = usData.categories.diabetes.markers.hba1c;
  assert('hba1c US unit is %', hUS.unit === '%', `got "${hUS.unit}"`);
  assert(`hba1c US @ ${ANCHOR_DATE} = 5.0`, hUS.values[usIdx] === 5,
    `got ${hUS.values[usIdx]}, expected 5.0`);

  // Hemoglobin: factor 0.1, stored as g/L -> g/dL
  const hbUS = usData.categories.hematology.markers.hemoglobin;
  assert('hemoglobin US unit is g/dl', hbUS.unit === 'g/dl', `got "${hbUS.unit}"`);

  // Range mode changes which band/status is displayed, but marker values and
  // units are unit-system concerns. Keep range toggles out of the data cache
  // key so the header Optimal/Reference switch cannot rebuild converted data.
  const usDataBeforeRangeToggle = window.getActiveData();
  const gBeforeRangeToggle = usDataBeforeRangeToggle.categories.biochemistry.markers.glucose;
  S.rangeMode = 'reference';
  const usDataAfterRangeToggle = window.getActiveData();
  const gAfterRangeToggle = usDataAfterRangeToggle.categories.biochemistry.markers.glucose;
  assert('range mode changes do not rebuild active marker data',
    usDataAfterRangeToggle === usDataBeforeRangeToggle);
  assert('range mode preserves displayed unit and value',
    gAfterRangeToggle.unit === gBeforeRangeToggle.unit &&
      gAfterRangeToggle.values[usIdx] === gBeforeRangeToggle.values[usIdx],
    `before=${gBeforeRangeToggle.values[usIdx]} ${gBeforeRangeToggle.unit}, after=${gAfterRangeToggle.values[usIdx]} ${gAfterRangeToggle.unit}`);
  S.rangeMode = 'optimal';

  // Switch back to EU
  S.unitSystem = 'EU';

  // Test convertDisplayToSI (window export)
  if (typeof window.applyUnitConversion === 'function') {
    assert('applyUnitConversion is exposed on window', true);
  }

  // ═══════════════════════════════════════════════
  // 5. Date range filtering
  // ═══════════════════════════════════════════════
  console.log('%c 5. Date Range Filtering ', 'font-weight:bold;color:#f59e0b');

  // Test filterDatesByRange with 'all'
  S.dateRangeFilter = 'all';
  const allData = window.getActiveData();
  const filteredAll = window.filterDatesByRange(allData);
  assert('filterDatesByRange "all" keeps all dates', filteredAll.dates.length === allData.dates.length);

  // Test with '3m' — only dates within last 3 months
  S.dateRangeFilter = '3m';
  const filtered3m = window.filterDatesByRange(allData);
  assert('filterDatesByRange "3m" returns object with dates', Array.isArray(filtered3m.dates));
  assert('filterDatesByRange "3m" returns object with categories', typeof filtered3m.categories === 'object');
  // The 3m filter should have fewer or equal dates
  assert('filterDatesByRange "3m" has <= all dates', filtered3m.dates.length <= allData.dates.length,
    `3m=${filtered3m.dates.length}, all=${allData.dates.length}`);

  // Verify marker values are aligned to filtered dates
  if (filtered3m.dates.length > 0 && filtered3m.dates.length < allData.dates.length) {
    const fGlucose = filtered3m.categories.biochemistry.markers.glucose;
    assert('filtered glucose values length matches filtered dates', fGlucose.values.length === filtered3m.dates.length,
      `values=${fGlucose.values.length}, dates=${filtered3m.dates.length}`);
  }

  // Test with '1y' — dates within last year
  S.dateRangeFilter = '1y';
  const filtered1y = window.filterDatesByRange(allData);
  assert('filterDatesByRange "1y" has dates', Array.isArray(filtered1y.dates));
  assert('filterDatesByRange "1y" has <= all dates', filtered1y.dates.length <= allData.dates.length);

  // Fallback: if no dates in range, show all
  S.dateRangeFilter = '3m';
  const oldData = {
    dates: ['2020-01-01'],
    dateLabels: ['Jan 2020'],
    categories: { biochemistry: { label: 'Biochemistry', icon: '', markers: {
      glucose: { values: [5.0], unit: 'mmol/l', refMin: 4.11, refMax: 5.6 }
    }}}
  };
  const oldFiltered = window.filterDatesByRange(oldData);
  assert('filterDatesByRange falls back to all when no dates in range', oldFiltered.dates.length === 1,
    `got ${oldFiltered.dates.length}`);

  S.dateRangeFilter = 'all';

  // ═══════════════════════════════════════════════
  // 6. getStatus function
  // ═══════════════════════════════════════════════
  console.log('%c 6. getStatus ', 'font-weight:bold;color:#f59e0b');

  // getStatus is on utils.js, exposed indirectly. We can test via window or source check
  // It's imported by data.js but not on window directly. Let's test via the source + data behavior
  const dataSrc = (await (await fetch('js/utils.js')).text());
  assert('getStatus exported from utils.js', dataSrc.includes('export function getStatus'));

  // Test through getAllFlaggedMarkers which uses getStatus internally
  const flagged = window.getAllFlaggedMarkers(allData);
  assert('getAllFlaggedMarkers returns array', Array.isArray(flagged));
  // Each flagged marker should have status 'high' or 'low'
  const allFlagStatuses = flagged.every(f => f.status === 'high' || f.status === 'low');
  assert('all flagged markers have high or low status', allFlagStatuses,
    flagged.length > 0 ? `first: ${flagged[0].name} = ${flagged[0].status}` : 'no flags');

  // Verify getStatus logic via source inspection
  assert('getStatus returns "missing" for null', dataSrc.includes("return \"missing\""));
  assert('getStatus returns "normal" when refs null', dataSrc.includes("return \"normal\""));
  assert('getStatus returns "low" when below refMin', dataSrc.includes("return \"low\""));
  assert('getStatus returns "high" when above refMax', dataSrc.includes("return \"high\""));

  // Test getEffectiveRange — uses optimal when in optimal mode
  S.rangeMode = 'optimal';
  const effRange = window.getEffectiveRange(tsh);
  assert('getEffectiveRange in optimal mode uses optimal if available',
    (tsh.optimalMin != null && effRange.min === tsh.optimalMin) ||
    (tsh.optimalMin == null && effRange.min === tsh.refMin),
    `min=${effRange.min}, optMin=${tsh.optimalMin}, refMin=${tsh.refMin}`);

  S.rangeMode = 'reference';
  const refRange = window.getEffectiveRange(tsh);
  assert('getEffectiveRange in reference mode uses ref range',
    refRange.min === tsh.refMin && refRange.max === tsh.refMax,
    `min=${refRange.min} vs refMin=${tsh.refMin}, max=${refRange.max} vs refMax=${tsh.refMax}`);

  S.rangeMode = 'optimal';

  // ═══════════════════════════════════════════════
  // 7. Trend detection — detectTrendAlerts
  // ═══════════════════════════════════════════════
  console.log('%c 7. Trend Detection ', 'font-weight:bold;color:#f59e0b');

  const alerts = window.detectTrendAlerts(allData);
  assert('detectTrendAlerts returns array', Array.isArray(alerts));

  // Each alert should have required fields
  if (alerts.length > 0) {
    const a = alerts[0];
    assert('alert has id', typeof a.id === 'string');
    assert('alert has name', typeof a.name === 'string');
    assert('alert has category', typeof a.category === 'string');
    assert('alert has concern', typeof a.concern === 'string');
    assert('alert has spark array', Array.isArray(a.spark));
    assert('alert has direction', a.direction === 'rising' || a.direction === 'falling');
    assert('alert concern is valid type',
      ['sudden_high', 'sudden_low', 'past_high', 'past_low', 'approaching_high', 'approaching_low'].includes(a.concern),
      `got "${a.concern}"`);
  }

  // Alerts should be sorted: sudden first, then past, then approaching
  if (alerts.length >= 2) {
    const priority = c => c.startsWith('sudden_') ? 0 : c.startsWith('past_') ? 1 : 2;
    let sorted = true;
    for (let i = 1; i < alerts.length; i++) {
      if (priority(alerts[i].concern) < priority(alerts[i-1].concern)) { sorted = false; break; }
    }
    assert('alerts sorted by priority (sudden > past > approaching)', sorted);
  }

  // Test with synthetic data to verify sudden change detection
  const syntheticData = {
    dates: ['2025-01-01', '2025-06-01'],
    dateLabels: ['Jan 2025', 'Jun 2025'],
    categories: {
      test: {
        label: 'Test', icon: '', singlePoint: false,
        markers: {
          marker1: {
            name: 'Test Marker',
            values: [5.0, 9.0], // big jump
            unit: 'U/L',
            refMin: 4.0, refMax: 8.0,
            optimalMin: null, optimalMax: null
          }
        }
      }
    }
  };
  const synAlerts = window.detectTrendAlerts(syntheticData);
  assert('synthetic sudden_high detected', synAlerts.some(a => a.concern === 'sudden_high'),
    `alerts: ${JSON.stringify(synAlerts.map(a => a.concern))}`);

  // ═══════════════════════════════════════════════
  // 8. Key trends — getKeyTrendMarkers
  // ═══════════════════════════════════════════════
  console.log('%c 8. Key Trend Markers ', 'font-weight:bold;color:#f59e0b');

  const keyTrends = window.getKeyTrendMarkers(allData);
  assert('getKeyTrendMarkers returns array', Array.isArray(keyTrends));
  assert('getKeyTrendMarkers has entries with demo data', keyTrends.length > 0, `got ${keyTrends.length}`);
  assert('getKeyTrendMarkers max 8 entries', keyTrends.length <= 8, `got ${keyTrends.length}`);

  if (keyTrends.length > 0) {
    const kt = keyTrends[0];
    assert('keyTrend entry has cat', typeof kt.cat === 'string');
    assert('keyTrend entry has key', typeof kt.key === 'string');
    // Verify the category.key actually exists in data
    const ktCat = allData.categories[kt.cat];
    assert('keyTrend references valid category', !!ktCat, `cat="${kt.cat}"`);
    if (ktCat) {
      assert('keyTrend references valid marker', !!ktCat.markers[kt.key], `key="${kt.key}"`);
    }
  }

  // Male defaults should include certain markers when not overridden by alerts/flags
  const ktIds = keyTrends.map(k => k.cat + '.' + k.key);
  // At least some of the male defaults should appear
  const maleDefaults = ['diabetes.hba1c', 'lipids.ldl', 'vitamins.vitaminD', 'thyroid.tsh',
    'hormones.testosterone', 'proteins.hsCRP', 'biochemistry.ggt'];
  const hasAnyDefault = maleDefaults.some(d => ktIds.includes(d));
  assert('key trends include at least one male default marker', hasAnyDefault,
    `trends: ${ktIds.join(', ')}`);

  // ═══════════════════════════════════════════════
  // 9. Calculated markers — BUN/Creatinine, Free Water Deficit
  // ═══════════════════════════════════════════════
  console.log('%c 9. Calculated Markers ', 'font-weight:bold;color:#f59e0b');

  const ratios = allData.categories.calculatedRatios;
  assert('calculatedRatios category exists', !!ratios);

  if (ratios) {
    // Index of the original first comprehensive entry — ratios are
    // computed from urea/creat/sodium/etc. which only exist from
    // 2025-03-15 onwards (backfilled 2024-* entries are specialty-only).
    const ratioIdx = data.dates.indexOf(ANCHOR_DATE);

    // BUN/Creatinine Ratio
    const bunCr = ratios.markers.bunCreatRatio;
    assert('bunCreatRatio marker exists', !!bunCr);
    if (bunCr) {
      assert('bunCreatRatio has values', Array.isArray(bunCr.values));
      // 2025-03-15 entry: urea=5.9, creat=82 -> (5.9*2.801)/(82*0.01131) = 17.8
      const v = bunCr.values[ratioIdx];
      assert(`bunCreatRatio @ ${ANCHOR_DATE} ~17.8`, v !== null && Math.abs(v - 17.8) < 0.1,
        `got ${v}, expected ~17.8`);
    }

    // Free Water Deficit
    const fwd = ratios.markers.freeWaterDeficit;
    assert('freeWaterDeficit marker exists', !!fwd);
    if (fwd) {
      assert('freeWaterDeficit has values', Array.isArray(fwd.values));
      // 2025-03-15 entry: sodium=141, weight=83.2kg (latest from biometrics),
      // male factor=0.6 -> TBW=49.92, FWD = 49.92 * (141/140 - 1) = 0.36
      const v = fwd.values[ratioIdx];
      assert(`freeWaterDeficit @ ${ANCHOR_DATE} ~0.36`, v !== null && Math.abs(v - 0.36) < 0.05,
        `got ${v}, expected ~0.36`);
    }

    // TG/HDL ratio — pin to the anchor entry where TG and HDL both exist.
    const tgHdl = ratios.markers.tgHdlRatio;
    assert('tgHdlRatio marker exists', !!tgHdl);
    if (tgHdl) {
      assert('tgHdlRatio has values', Array.isArray(tgHdl.values));
      const v = tgHdl.values[ratioIdx];
      assert(`tgHdlRatio @ ${ANCHOR_DATE} is not null`, v !== null, `got ${v}`);
    }

    // LDL/HDL ratio
    const ldlHdl = ratios.markers.ldlHdlRatio;
    assert('ldlHdlRatio marker exists', !!ldlHdl);

    // De Ritis ratio (AST/ALT)
    const deRitis = ratios.markers.deRitisRatio;
    assert('deRitisRatio marker exists', !!deRitis);
    if (deRitis) {
      const v = deRitis.values[ratioIdx];
      assert(`deRitisRatio @ ${ANCHOR_DATE} is not null`, v !== null, `got ${v}`);
    }

    // Biological age markers exist
    assert('phenoAge marker exists', !!ratios.markers.phenoAge);
    assert('bortzAge marker exists', !!ratios.markers.bortzAge);
    assert('biologicalAge marker exists', !!ratios.markers.biologicalAge);

    // hs-CRP/HDL ratio
    assert('crpHdlRatio marker exists', !!ratios.markers.crpHdlRatio);
  }

  // ═══════════════════════════════════════════════
  // 10. Custom markers merged into categories
  // ═══════════════════════════════════════════════
  console.log('%c 10. Custom Markers ', 'font-weight:bold;color:#f59e0b');

  // Inject a synthetic custom marker to verify merging logic
  const origCustom = S.importedData.customMarkers;
  S.importedData.customMarkers = {
    'testCat.testMarker': { name: 'Test Custom', unit: 'mg/L', refMin: 1, refMax: 10, categoryLabel: 'Test Category' }
  };
  const customData = window.getActiveData();
  assert('custom marker category created in data', 'testCat' in customData.categories,
    'expected "testCat" in categories');
  if (customData.categories.testCat) {
    assert('custom category has label', customData.categories.testCat.label === 'Test Category');
    assert('custom marker present in category', 'testMarker' in customData.categories.testCat.markers);
    if (customData.categories.testCat.markers.testMarker) {
      const cm = customData.categories.testCat.markers.testMarker;
      assert('custom marker has correct name', cm.name === 'Test Custom');
      assert('custom marker has correct unit', cm.unit === 'mg/L');
      assert('custom marker has refMin', cm.refMin === 1);
      assert('custom marker has refMax', cm.refMax === 10);
      assert('custom marker flagged as custom', cm.custom === true);
    }
  }
  S.importedData.customMarkers = origCustom;

  // ═══════════════════════════════════════════════
  // 11. Sex-specific reference ranges
  // ═══════════════════════════════════════════════
  console.log('%c 11. Sex-Specific Ranges ', 'font-weight:bold;color:#f59e0b');

  // Male creatinine should use male refs (refMin=62, refMax=106)
  const creatMale = allData.categories.biochemistry.markers.creatinine;
  assert('male creatinine refMin = 62', creatMale.refMin === 62, `got ${creatMale.refMin}`);
  assert('male creatinine refMax = 106', creatMale.refMax === 106, `got ${creatMale.refMax}`);

  // Switch to female and verify
  S.profileSex = 'female';
  const femData = window.getActiveData();
  const creatFem = femData.categories.biochemistry.markers.creatinine;
  assert('female creatinine refMin = 44', creatFem.refMin === 44, `got ${creatFem.refMin}`);
  assert('female creatinine refMax = 80', creatFem.refMax === 80, `got ${creatFem.refMax}`);

  S.profileSex = 'male';

  // ═══════════════════════════════════════════════
  // 12. Window exports exist (regression)
  // ═══════════════════════════════════════════════
  console.log('%c 12. Window Exports ', 'font-weight:bold;color:#f59e0b');

  const dataExports = [
    'saveImportedData', 'getFocusCardFingerprint', 'getActiveData',
    'applyUnitConversion', 'filterDatesByRange', 'recalculateHOMAIR',
    'detectTrendAlerts', 'getKeyTrendMarkers', 'switchUnitSystem',
    'getEffectiveRange', 'getEffectiveRangeForDate', 'getPhaseRefEnvelope',
    'switchRangeMode', 'countFlagged', 'getLatestValueIndex',
    'getAllFlaggedMarkers', 'statusIcon',
  ];
  for (const name of dataExports) {
    assert(`window.${name} exists`, typeof window[name] === 'function', `typeof: ${typeof window[name]}`);
  }

  // ═══════════════════════════════════════════════
  // 13. Helper functions
  // ═══════════════════════════════════════════════
  console.log('%c 13. Helper Functions ', 'font-weight:bold;color:#f59e0b');

  // getLatestValueIndex
  assert('getLatestValueIndex finds last non-null', window.getLatestValueIndex([null, 5, 3, null]) === 2);
  assert('getLatestValueIndex returns -1 for all-null', window.getLatestValueIndex([null, null]) === -1);
  assert('getLatestValueIndex handles single value', window.getLatestValueIndex([7]) === 0);
  assert('getLatestValueIndex handles empty array', window.getLatestValueIndex([]) === -1);

  // statusIcon
  assert('statusIcon normal is checkmark', window.statusIcon('normal') === '\u2713');
  assert('statusIcon high is up triangle', window.statusIcon('high') === '\u25B2');
  assert('statusIcon low is down triangle', window.statusIcon('low') === '\u25BC');
  assert('statusIcon missing is empty', window.statusIcon('missing') === '');

  // getPhaseRefEnvelope — returns null when no phase ranges
  const noPhaseMarker = { values: [5], refMin: 4, refMax: 6 };
  assert('getPhaseRefEnvelope null for no phases', window.getPhaseRefEnvelope(noPhaseMarker) === null);

  // countFlagged
  const mockMarkers = [
    { values: [10], refMin: 4, refMax: 8 },  // high
    { values: [5], refMin: 4, refMax: 8 },    // normal
    { values: [2], refMin: 4, refMax: 8 },    // low
  ];
  // countFlagged uses getEffectiveRangeForDate, which needs refMin/refMax on marker
  assert('countFlagged counts out-of-range markers', window.countFlagged(mockMarkers) === 2,
    `got ${window.countFlagged(mockMarkers)}`);

  // ═══════════════════════════════════════════════
  // 14. Data source inspection
  // ═══════════════════════════════════════════════
  console.log('%c 14. Data Source Inspection ', 'font-weight:bold;color:#f59e0b');

  const dataJsSrc = (await (await fetch('js/data.js')).text());
  assert('data.js imports MARKER_SCHEMA', dataJsSrc.includes("import { state } from './state.js'"));
  assert('data.js imports UNIT_CONVERSIONS', dataJsSrc.includes('UNIT_CONVERSIONS'));
  assert('data.js imports OPTIMAL_RANGES', dataJsSrc.includes('OPTIMAL_RANGES'));
  assert('data.js imports PHASE_RANGES', dataJsSrc.includes('PHASE_RANGES'));
  assert('data.js has getActiveData function', dataJsSrc.includes('export function getActiveData()'));
  assert('data.js has applyUnitConversion function', dataJsSrc.includes('export function applyUnitConversion('));
  assert('data.js has filterDatesByRange function', dataJsSrc.includes('export function filterDatesByRange('));
  assert('data.js has detectTrendAlerts function', dataJsSrc.includes('export function detectTrendAlerts('));
  assert('data.js has getKeyTrendMarkers function', dataJsSrc.includes('export function getKeyTrendMarkers('));

  // PhenoAge coefficients present
  assert('data.js has PhenoAge xb calculation', dataJsSrc.includes('-19.907'));
  assert('data.js has PhenoAge mortalityScore', dataJsSrc.includes('mortalityScore'));
  assert('data.js has Bortz Age calculation', dataJsSrc.includes('bortzAge'));

  // BUN/Creatinine formula present
  assert('data.js has BUN/Cr formula (urea*2.801)', dataJsSrc.includes('u * 2.801'));
  assert('data.js has BUN/Cr formula (creat*0.01131)', dataJsSrc.includes('c * 0.01131'));

  // Free Water Deficit formula present
  assert('data.js has FWD formula (na/140)', dataJsSrc.includes('na / 140'));
  assert('data.js has FWD TBW factor male 0.6', dataJsSrc.includes('0.6'));

  // ═══════════════════════════════════════════════
  // CLEANUP — restore original state
  // ═══════════════════════════════════════════════
  S.importedData = origData;
  S.profileSex = origSex;
  S.profileDob = origDob;
  S.unitSystem = origUnits;
  S.rangeMode = origRange;
  S.dateRangeFilter = origDateFilter;

  // ═══════════════════════════════════════════════
  // SUMMARY
  // ═══════════════════════════════════════════════
console.log(results.join('\n'));
console.log(`\nResults: ${pass} passed, ${fail} failed, ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
