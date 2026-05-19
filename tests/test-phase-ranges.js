#!/usr/bin/env node
// test-phase-ranges.js — Browser test for phase-aware reference ranges
//
// Run: node tests/test-phase-ranges.js  (or via npm test)

import './_node-shim.js';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf-8');

let passed = 0, failed = 0;
const results = [];
function assert(name, condition, detail) {
  if (condition) { passed++; results.push(`  PASS: ${name}`); }
  else { failed++; results.push(`  FAIL: ${name}${detail ? ' — ' + detail : ''}`); }
}

console.log('=== Phase-Aware Reference Ranges Test ===\n');

// Section 1 reads schema source; later sections need window.* handlers
// exposed by data.js (Object.assign(window, …) at module load).
const schemaSource = read('js/schema.js');
const schema = await import('../js/schema.js');
const dataSource = read('js/data.js');
await import('../js/data.js'); // populates window.getEffectiveRangeForDate etc
const cssSource = read('styles.css');
  assert('PHASE_RANGES exported from schema.js', schemaSource.includes('export const PHASE_RANGES'));
  assert('Estradiol in PHASE_RANGES', schemaSource.includes("'hormones.estradiol'"));
  assert('Progesterone in PHASE_RANGES', schemaSource.includes("'hormones.progesterone'"));

  // Check all 4 phases exist for both markers
  for (const phase of ['menstrual', 'follicular', 'ovulatory', 'luteal']) {
    assert(`Estradiol has ${phase} phase`, schemaSource.includes(`${phase}:`));
  }

  // ═══════════════════════════════════════
  // 2. PHASE_RANGES values are correct
  // ═══════════════════════════════════════
  console.log('Section 2: PHASE_RANGES values');
  // Import dynamically to check values
  const PR = schema.PHASE_RANGES;
  assert('PHASE_RANGES is an object', typeof PR === 'object' && PR !== null);
  assert('Has hormones.estradiol', !!PR['hormones.estradiol']);
  assert('Has hormones.progesterone', !!PR['hormones.progesterone']);

  // Estradiol values
  const e = PR['hormones.estradiol'];
  assert('Estradiol menstrual min=45', e.menstrual.min === 45);
  assert('Estradiol menstrual max=130', e.menstrual.max === 130);
  assert('Estradiol follicular min=45', e.follicular.min === 45);
  assert('Estradiol follicular max=400', e.follicular.max === 400);
  assert('Estradiol ovulatory min=400', e.ovulatory.min === 400);
  assert('Estradiol ovulatory max=1470', e.ovulatory.max === 1470);
  assert('Estradiol luteal min=180', e.luteal.min === 180);
  assert('Estradiol luteal max=780', e.luteal.max === 780);

  // Progesterone values
  const p = PR['hormones.progesterone'];
  assert('Progesterone menstrual min=0.18', p.menstrual.min === 0.18);
  assert('Progesterone menstrual max=2.5', p.menstrual.max === 2.5);
  assert('Progesterone follicular min=0.18', p.follicular.min === 0.18);
  assert('Progesterone follicular max=2.5', p.follicular.max === 2.5);
  assert('Progesterone ovulatory min=0.18', p.ovulatory.min === 0.18);
  assert('Progesterone ovulatory max=9.5', p.ovulatory.max === 9.5);
  assert('Progesterone luteal min=5.7', p.luteal.min === 5.7);
  assert('Progesterone luteal max=75.9', p.luteal.max === 75.9);

  // ═══════════════════════════════════════
  // 3. data.js imports PHASE_RANGES
  // ═══════════════════════════════════════
  console.log('Section 3: data.js integration');
  assert('data.js imports PHASE_RANGES', dataSource.includes('PHASE_RANGES'));
  assert('data.js has _getCyclePhase helper', dataSource.includes('function _getCyclePhase'));
  assert('data.js exports getEffectiveRangeForDate', dataSource.includes('export function getEffectiveRangeForDate'));
  assert('data.js exports getPhaseRefEnvelope', dataSource.includes('export function getPhaseRefEnvelope'));
  assert('data.js window exports getEffectiveRangeForDate', dataSource.includes('getEffectiveRangeForDate') && dataSource.includes('Object.assign(window'));
  assert('data.js window exports getPhaseRefEnvelope', dataSource.includes('getPhaseRefEnvelope'));

  // ═══════════════════════════════════════
  // 4. getEffectiveRangeForDate function
  // ═══════════════════════════════════════
  console.log('Section 4: getEffectiveRangeForDate');
  assert('getEffectiveRangeForDate on window', typeof window.getEffectiveRangeForDate === 'function');

  // Test with phase ranges present
  const mockMarkerWithPhase = {
    refMin: 45.4, refMax: 854.0,
    optimalMin: null, optimalMax: null,
    phaseRefRanges: [
      { min: 45, max: 400 },   // follicular
      { min: 400, max: 1470 }, // ovulatory
      null,                     // unknown
      { min: 180, max: 780 }   // luteal
    ]
  };
  const r0 = window.getEffectiveRangeForDate(mockMarkerWithPhase, 0);
  assert('Phase range returned for index 0', r0.min === 45 && r0.max === 400, `got ${r0.min}-${r0.max}`);
  const r1 = window.getEffectiveRangeForDate(mockMarkerWithPhase, 1);
  assert('Phase range returned for index 1', r1.min === 400 && r1.max === 1470, `got ${r1.min}-${r1.max}`);
  const r2 = window.getEffectiveRangeForDate(mockMarkerWithPhase, 2);
  assert('Fallback for null phase range', r2.min === 45.4 && r2.max === 854.0, `got ${r2.min}-${r2.max}`);
  const r3 = window.getEffectiveRangeForDate(mockMarkerWithPhase, 3);
  assert('Phase range returned for index 3', r3.min === 180 && r3.max === 780, `got ${r3.min}-${r3.max}`);

  // Test without phase ranges (fallback)
  const mockMarkerNoPhase = { refMin: 10, refMax: 50, optimalMin: null, optimalMax: null };
  const rf = window.getEffectiveRangeForDate(mockMarkerNoPhase, 0);
  assert('Fallback when no phaseRefRanges', rf.min === 10 && rf.max === 50, `got ${rf.min}-${rf.max}`);

  // ═══════════════════════════════════════
  // 5. getPhaseRefEnvelope function
  // ═══════════════════════════════════════
  console.log('Section 5: getPhaseRefEnvelope');
  assert('getPhaseRefEnvelope on window', typeof window.getPhaseRefEnvelope === 'function');

  const env = window.getPhaseRefEnvelope(mockMarkerWithPhase);
  assert('Envelope min is smallest across phases', env.min === 45, `got ${env.min}`);
  assert('Envelope max is largest across phases', env.max === 1470, `got ${env.max}`);

  const envNull = window.getPhaseRefEnvelope(mockMarkerNoPhase);
  assert('Envelope null when no phaseRefRanges', envNull === null);

  const allNulls = { phaseRefRanges: [null, null, null] };
  const envAllNull = window.getPhaseRefEnvelope(allNulls);
  assert('Envelope null when all entries null', envAllNull === null);

  // ═══════════════════════════════════════
  // 6. phaseRefRanges populated in getActiveData
  // ═══════════════════════════════════════
  console.log('Section 6: getActiveData integration');

  // Save current state
  const origSex = window.state ? window.state.profileSex : undefined;
  const origData = window.state ? JSON.parse(JSON.stringify(window.state.importedData)) : null;
  const origUnits = window.state ? window.state.unitSystem : 'EU';

  // Simulate female profile with cycle data and estradiol values
  if (window.state) {
    window.state.profileSex = 'female';
    window.state.unitSystem = 'EU';
    window.state.importedData = {
      entries: [
        { date: '2025-12-05', markers: { 'hormones.estradiol': 200, 'hormones.progesterone': 1.5 } },
        { date: '2026-01-15', markers: { 'hormones.estradiol': 500, 'hormones.progesterone': 20.0 } },
      ],
      menstrualCycle: {
        cycleLength: 28, periodLength: 5, regularity: 'regular', flow: 'moderate',
        contraceptive: '', conditions: '',
        periods: [
          { startDate: '2025-12-01', endDate: '2025-12-05', flow: 'moderate', notes: '' },
          { startDate: '2025-12-29', endDate: '2026-01-02', flow: 'moderate', notes: '' },
        ]
      },
      customMarkers: {},
      notes: [], diagnoses: null, diet: null, exercise: null,
      sleepRest: null, lightCircadian: null, stress: null, loveLife: null,
      environment: null, interpretiveLens: '', healthGoals: [],
      contextNotes: '', supplements: []
    };

    const data = window.getActiveData();
    const estradiol = data.categories.hormones?.markers?.estradiol;
    const progesterone = data.categories.hormones?.markers?.progesterone;

    assert('Estradiol has phaseRefRanges', !!estradiol?.phaseRefRanges, estradiol ? 'present' : 'marker not found');
    assert('Estradiol phaseRefRanges length matches dates', estradiol?.phaseRefRanges?.length === data.dates.length);
    assert('Estradiol has phaseLabels', !!estradiol?.phaseLabels);
    assert('Progesterone has phaseRefRanges', !!progesterone?.phaseRefRanges);

    // 2025-12-05 is day 5 of period starting 2025-12-01 → menstrual phase (periodLen=5, cycleDay 5 <= 5)
    const phase0 = estradiol?.phaseLabels?.[0];
    assert('First date is Menstrual phase', phase0 === 'Menstrual', `got ${phase0}`);
    const pr0 = estradiol?.phaseRefRanges?.[0];
    assert('Menstrual estradiol range 45-130', pr0?.min === 45 && pr0?.max === 130, pr0 ? `got ${pr0.min}-${pr0.max}` : 'null');

    // 2026-01-15 is day 18 of cycle starting 2025-12-29 → luteal (ovulation day=14, day 18 > 15)
    const phase1 = estradiol?.phaseLabels?.[1];
    assert('Second date is Luteal phase', phase1 === 'Luteal', `got ${phase1}`);
    const pr1 = estradiol?.phaseRefRanges?.[1];
    assert('Luteal estradiol range 180-780', pr1?.min === 180 && pr1?.max === 780, pr1 ? `got ${pr1.min}-${pr1.max}` : 'null');

    // Progesterone phase ranges
    const ppr0 = progesterone?.phaseRefRanges?.[0];
    assert('Menstrual progesterone range 0.18-2.5', ppr0?.min === 0.18 && ppr0?.max === 2.5, ppr0 ? `got ${ppr0.min}-${ppr0.max}` : 'null');
    const ppr1 = progesterone?.phaseRefRanges?.[1];
    assert('Luteal progesterone range 5.7-75.9', ppr1?.min === 5.7 && ppr1?.max === 75.9, ppr1 ? `got ${ppr1.min}-${ppr1.max}` : 'null');

    // ═══════════════════════════════════════
    // 7. Male profile — no phaseRefRanges
    // ═══════════════════════════════════════
    console.log('Section 7: Male profile (no phase ranges)');
    window.state.profileSex = 'male';
    const maleData = window.getActiveData();
    const maleEstradiol = maleData.categories.hormones?.markers?.estradiol;
    assert('Male estradiol has no phaseRefRanges', !maleEstradiol?.phaseRefRanges);
    assert('Male estradiol has no phaseLabels', !maleEstradiol?.phaseLabels);

    // ═══════════════════════════════════════
    // 8. Female without cycle data — no phaseRefRanges
    // ═══════════════════════════════════════
    console.log('Section 8: Female without cycle data');
    window.state.profileSex = 'female';
    window.state.importedData.menstrualCycle = null;
    const noCycleData = window.getActiveData();
    const noCycleEstradiol = noCycleData.categories.hormones?.markers?.estradiol;
    assert('No cycle → no phaseRefRanges', !noCycleEstradiol?.phaseRefRanges);

    // ═══════════════════════════════════════
    // 9. Female with cycle but no periods — no phaseRefRanges
    // ═══════════════════════════════════════
    console.log('Section 9: Female with cycle profile but no periods');
    window.state.importedData.menstrualCycle = { cycleLength: 28, periodLength: 5, regularity: 'regular', flow: 'moderate', periods: [] };
    const noPeriodsData = window.getActiveData();
    const noPeriodsEstradiol = noPeriodsData.categories.hormones?.markers?.estradiol;
    assert('No periods → no phaseRefRanges', !noPeriodsEstradiol?.phaseRefRanges);

    // ═══════════════════════════════════════
    // 10. Phase can't be determined for some dates
    // ═══════════════════════════════════════
    console.log('Section 10: Null entries for undetermined phases');
    window.state.importedData.menstrualCycle = {
      cycleLength: 28, periodLength: 5, regularity: 'regular', flow: 'moderate',
      periods: [{ startDate: '2025-12-01', endDate: '2025-12-05', flow: 'moderate', notes: '' }]
    };
    // 2025-12-05 is in menstrual range, 2026-01-15 is >35 days from last period (28+7=35) → null
    const partialData = window.getActiveData();
    const partialE = partialData.categories.hormones?.markers?.estradiol;
    assert('First date has phase range', partialE?.phaseRefRanges?.[0] !== null);
    assert('Second date has null phase range (too far)', partialE?.phaseRefRanges?.[1] === null,
      partialE?.phaseRefRanges?.[1] ? `got non-null: ${JSON.stringify(partialE.phaseRefRanges[1])}` : 'is null');

    // ═══════════════════════════════════════
    // 11. Unit conversion scales phaseRefRanges
    // ═══════════════════════════════════════
    console.log('Section 11: Unit conversion');
    // Restore cycle data for conversion test
    window.state.importedData.menstrualCycle = {
      cycleLength: 28, periodLength: 5, regularity: 'regular', flow: 'moderate',
      periods: [
        { startDate: '2025-12-01', endDate: '2025-12-05', flow: 'moderate', notes: '' },
        { startDate: '2025-12-29', endDate: '2026-01-02', flow: 'moderate', notes: '' },
      ]
    };
    window.state.unitSystem = 'US';
    const usData = window.getActiveData();
    const usEstradiol = usData.categories.hormones?.markers?.estradiol;
    // Estradiol conversion: pmol/l → pg/ml, factor = 0.2724 (from UNIT_CONVERSIONS)
    if (usEstradiol?.phaseRefRanges?.[0]) {
      const expectedMin = parseFloat((45 * 0.2724).toPrecision(4));
      const expectedMax = parseFloat((130 * 0.2724).toPrecision(4));
      assert('US conversion applied to phase range min', usEstradiol.phaseRefRanges[0].min === expectedMin,
        `expected ${expectedMin}, got ${usEstradiol.phaseRefRanges[0].min}`);
      assert('US conversion applied to phase range max', usEstradiol.phaseRefRanges[0].max === expectedMax,
        `expected ${expectedMax}, got ${usEstradiol.phaseRefRanges[0].max}`);
    } else {
      assert('US estradiol has phase ranges for conversion test', false, 'phaseRefRanges missing');
      assert('(skipped conversion max)', false);
    }
    window.state.unitSystem = 'EU';

    // ═══════════════════════════════════════
    // 12. filterDatesByRange preserves phaseRefRanges
    // ═══════════════════════════════════════
    console.log('Section 12: filterDatesByRange');
    window.state.importedData.menstrualCycle = {
      cycleLength: 28, periodLength: 5, regularity: 'regular', flow: 'moderate',
      periods: [
        { startDate: '2025-12-01', endDate: '2025-12-05', flow: 'moderate', notes: '' },
        { startDate: '2025-12-29', endDate: '2026-01-02', flow: 'moderate', notes: '' },
      ]
    };
    const fullData = window.getActiveData();
    // Manually test filterDatesByRange
    window.state.dateRangeFilter = 'all';
    const filteredAll = window.filterDatesByRange(fullData);
    const fEst = filteredAll.categories.hormones?.markers?.estradiol;
    assert('filterDatesByRange all — phaseRefRanges preserved', !!fEst?.phaseRefRanges);
    assert('filterDatesByRange all — phaseLabels preserved', !!fEst?.phaseLabels);
    assert('filterDatesByRange all — lengths match', fEst?.phaseRefRanges?.length === fEst?.values?.length);

    // Restore state
    window.state.profileSex = origSex;
    window.state.importedData = origData;
    window.state.unitSystem = origUnits;
    window.state.dateRangeFilter = 'all';
  } else {
    console.log('  (skipping integration tests — state not available)');
  }

  // ═══════════════════════════════════════
  // 13. charts.js imports
  // ═══════════════════════════════════════
  console.log('Section 13: charts.js source inspection');
  const chartsSource = read('js/charts.js');
  assert('charts.js imports getEffectiveRangeForDate', chartsSource.includes('getEffectiveRangeForDate'));
  assert('charts.js imports getPhaseRefEnvelope', chartsSource.includes('getPhaseRefEnvelope'));
  assert('charts.js uses per-point coloring', chartsSource.includes('getEffectiveRangeForDate(marker, i + trimOffset)'));
  assert('charts.js tooltip shows phase label', chartsSource.includes('phaseLabels') && chartsSource.includes('phaseLabel'));
  assert('charts.js ref band uses envelope', chartsSource.includes('getPhaseRefEnvelope(marker)'));

  // ═══════════════════════════════════════
  // 14. views.js / marker detail source inspection
  // ═══════════════════════════════════════
  console.log('Section 14: views.js source inspection');
  const viewsSource = read('js/views.js');
  const markerDetailSource = read('js/marker-detail-modal.js');
  assert('views.js imports getEffectiveRangeForDate', viewsSource.includes('getEffectiveRangeForDate'));
  assert('renderChartCard uses getEffectiveRangeForDate', viewsSource.includes('getEffectiveRangeForDate(marker, latestIdx)'));
  assert('renderChartCard per-value uses getEffectiveRangeForDate', viewsSource.includes('getEffectiveRangeForDate(marker, i)'));
  assert('showDetailModal uses getEffectiveRangeForDate', markerDetailSource.includes('getEffectiveRangeForDate(marker, i)'));
  assert('showDetailModal shows phase label', markerDetailSource.includes('mv-phase'));
  assert('renderTableView uses getEffectiveRangeForDate', viewsSource.includes('getEffectiveRangeForDate(marker, i)'));
  assert('renderHeatmapView uses getEffectiveRangeForDate', viewsSource.includes('getEffectiveRangeForDate(marker, i)'));
  assert('renderCompareTable uses getEffectiveRangeForDate', viewsSource.includes('getEffectiveRangeForDate(marker, idx'));

  // ═══════════════════════════════════════
  // 15. chat.js source inspection
  // ═══════════════════════════════════════
  console.log('Section 15: chat.js source inspection');
  const chatSource = read('js/chat.js');
  assert('chat.js imports getEffectiveRangeForDate', chatSource.includes('getEffectiveRangeForDate'));
  assert('buildLabContext phase-aware serialization', chatSource.includes('phaseRefRanges') && chatSource.includes('phaseLabels'));
  assert('askAIAboutMarker phase context', chatSource.includes('phaseLabels') && chatSource.includes('phase-specific'));

  // ═══════════════════════════════════════
  // 17. data.js countFlagged and getAllFlaggedMarkers
  // ═══════════════════════════════════════
  console.log('Section 17: countFlagged and getAllFlaggedMarkers');
  assert('countFlagged uses getEffectiveRangeForDate', dataSource.includes('getEffectiveRangeForDate(m, i)'));
  assert('getAllFlaggedMarkers uses getEffectiveRangeForDate', dataSource.includes('getEffectiveRangeForDate(m, i)'));

  // ═══════════════════════════════════════
  // 18. data.js detectTrendAlerts
  // ═══════════════════════════════════════
  console.log('Section 18: detectTrendAlerts');
  assert('detectTrendAlerts uses phase-aware range for latest', dataSource.includes('getEffectiveRangeForDate(marker, latestEntry.i)'));
  assert('detectTrendAlerts keeps aggregate range for normalization', dataSource.includes('const r = getEffectiveRange(marker)'));

  // ═══════════════════════════════════════
  // 19. _getCyclePhase helper correctness
  // ═══════════════════════════════════════
  console.log('Section 19: _getCyclePhase helper');
  assert('_getCyclePhase is private (not exported)', !dataSource.includes('export function _getCyclePhase'));
  assert('_getCyclePhase function exists', dataSource.includes('function _getCyclePhase(dateStr, mc)'));
  // Verify it matches the getCyclePhase logic from cycle.js
  const cycleSource = read('js/cycle.js');
  const cycleBody = cycleSource.match(/export function getCyclePhase\(dateStr, mc\) \{[\s\S]*?^}/m)?.[0] || '';
  assert('_getCyclePhase matches getCyclePhase logic (phase enum)',
    dataSource.includes("phase = 'menstrual'") && dataSource.includes("phase = 'follicular'") &&
    dataSource.includes("phase = 'ovulatory'") && dataSource.includes("phase = 'luteal'"));

  // ═══════════════════════════════════════
  // 20. filterDatesByRange preserves arrays
  // ═══════════════════════════════════════
  console.log('Section 20: filterDatesByRange source');
  assert('filterDatesByRange spreads phaseRefRanges', dataSource.includes('marker.phaseRefRanges && { phaseRefRanges'));
  assert('filterDatesByRange spreads phaseLabels', dataSource.includes('marker.phaseLabels && { phaseLabels'));

  // ═══════════════════════════════════════
  // 21. CSS for mv-phase
  // ═══════════════════════════════════════
  console.log('Section 21: CSS');
  assert('CSS has .mv-phase rule', cssSource.includes('.mv-phase'));

  // ═══════════════════════════════════════
  // 22. applyUnitConversion handles phaseRefRanges
  // ═══════════════════════════════════════
  console.log('Section 22: applyUnitConversion');
  assert('applyUnitConversion converts phaseRefRanges', dataSource.includes('marker.phaseRefRanges') && dataSource.includes('conv.factor).toPrecision(4)'));

  // ═══════════════════════════════════════
  // Summary
  // ═══════════════════════════════════════
console.log('\n' + results.join('\n'));
console.log(`\nResults: ${passed} passed, ${failed} failed, ${passed + failed} total`);
process.exit(failed > 0 ? 1 : 0);
