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

// Section 1 reads schema source; later sections use the data module API.
const schemaSource = read('js/schema.js');
const schemaEnvironmentSource = read('js/schema-environment.js');
const schema = await import('../js/schema.js');
const dataSource = read('js/data.js');
const markerAnalysisSource = read('js/marker-analysis.js');
const dataModule = await import('../js/data.js');
const cssSource = read('styles.css') + '\n' + read('css/marker-detail-modal.css');
  assert('PHASE_RANGES re-exported from schema.js', schemaSource.includes('PHASE_RANGES') && schemaSource.includes('./schema-environment.js'));
  assert('PHASE_RANGES defined in schema-environment.js', schemaEnvironmentSource.includes('export const PHASE_RANGES'));
  assert('Estradiol in PHASE_RANGES', schemaEnvironmentSource.includes("'hormones.estradiol'"));
  assert('Progesterone in PHASE_RANGES', schemaEnvironmentSource.includes("'hormones.progesterone'"));

  // Check all 4 phases exist for both markers
  for (const phase of ['menstrual', 'follicular', 'ovulatory', 'luteal']) {
    assert(`Estradiol has ${phase} phase`, schemaEnvironmentSource.includes(`${phase}:`));
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
  assert('Estradiol menstrual min=46', e.menstrual.min === 46);
  assert('Estradiol menstrual max=609', e.menstrual.max === 609);
  assert('Estradiol follicular min=46', e.follicular.min === 46);
  assert('Estradiol follicular max=609', e.follicular.max === 609);
  assert('Estradiol ovulatory min=315', e.ovulatory.min === 315);
  assert('Estradiol ovulatory max=1828', e.ovulatory.max === 1828);
  assert('Estradiol luteal min=161', e.luteal.min === 161);
  assert('Estradiol luteal max=775', e.luteal.max === 775);

  // Progesterone values
  const p = PR['hormones.progesterone'];
  assert('Progesterone menstrual min=0.32', p.menstrual.min === 0.32);
  assert('Progesterone menstrual max=2.86', p.menstrual.max === 2.86);
  assert('Progesterone follicular min=0.32', p.follicular.min === 0.32);
  assert('Progesterone follicular max=2.86', p.follicular.max === 2.86);
  assert('Progesterone ovulatory min=0.32', p.ovulatory.min === 0.32);
  assert('Progesterone ovulatory max=38.2', p.ovulatory.max === 38.2);
  assert('Progesterone luteal min=5.72', p.luteal.min === 5.72);
  assert('Progesterone luteal max=76', p.luteal.max === 76);

  const lh = PR['hormones.lh'];
  const fsh = PR['hormones.fsh'];
  assert('LH Roche phase table retained', lh.follicular.min === 2.4 && lh.ovulatory.max === 95.6 && lh.luteal.max === 11.4);
  assert('FSH Roche phase table retained', fsh.follicular.min === 3.5 && fsh.ovulatory.max === 21.5 && fsh.luteal.max === 7.7);
  for (const [name, phaseMap] of Object.entries({ Estradiol: e, Progesterone: p, LH: lh, FSH: fsh })) {
    assert(`${name} exposes assay provenance`, Object.values(phaseMap).every(range => range.source?.includes('Labcorp')));
    assert(`${name} labels ranges as predicted`, Object.values(phaseMap).every(range => range.label?.startsWith('Predicted')));
  }

  // ═══════════════════════════════════════
  // 3. data.js and marker-analysis integration
  // ═══════════════════════════════════════
  console.log('Section 3: data.js / marker-analysis integration');
  assert('data.js imports PHASE_RANGES', dataSource.includes('PHASE_RANGES'));
  assert('data.js has _getCyclePhase helper', dataSource.includes('function _getCyclePhase'));
  assert('marker-analysis exports getEffectiveRangeForDate', markerAnalysisSource.includes('export function getEffectiveRangeForDate'));
  assert('marker-analysis exports getPhaseRefEnvelope', markerAnalysisSource.includes('export function getPhaseRefEnvelope'));
  assert('data.js re-exports marker-analysis helpers', dataSource.includes("} from './marker-analysis.js'"));
  assert('data.js exports getEffectiveRangeForDate', dataSource.includes('getEffectiveRangeForDate'));
  assert('data.js exports getPhaseRefEnvelope', dataSource.includes('getPhaseRefEnvelope'));
  assert('data.js does not install a window facade', !dataSource.includes('Object.assign(window'));

  // ═══════════════════════════════════════
  // 4. getEffectiveRangeForDate function
  // ═══════════════════════════════════════
  console.log('Section 4: getEffectiveRangeForDate');
  assert('getEffectiveRangeForDate is a module API', typeof dataModule.getEffectiveRangeForDate === 'function');
  assert('getEffectiveRangeForDate stays off window', !('getEffectiveRangeForDate' in window));

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
  const r0 = dataModule.getEffectiveRangeForDate(mockMarkerWithPhase, 0);
  assert('Phase range returned for index 0', r0.min === 45 && r0.max === 400, `got ${r0.min}-${r0.max}`);
  const r1 = dataModule.getEffectiveRangeForDate(mockMarkerWithPhase, 1);
  assert('Phase range returned for index 1', r1.min === 400 && r1.max === 1470, `got ${r1.min}-${r1.max}`);
  const r2 = dataModule.getEffectiveRangeForDate(mockMarkerWithPhase, 2);
  assert('Fallback for null phase range', r2.min === 45.4 && r2.max === 854.0, `got ${r2.min}-${r2.max}`);
  const r3 = dataModule.getEffectiveRangeForDate(mockMarkerWithPhase, 3);
  assert('Phase range returned for index 3', r3.min === 180 && r3.max === 780, `got ${r3.min}-${r3.max}`);
  const labeledPhaseMarker = {
    ...mockMarkerWithPhase,
    phaseRefRanges: [{ min: 46, max: 609, label: 'Predicted follicular range' }],
  };
  assert('Assay phase label is exposed to UI and model consumers',
    dataModule.getEffectiveRangeLabelForDate(labeledPhaseMarker, 0) === 'Predicted follicular range');

  // Test without phase ranges (fallback)
  const mockMarkerNoPhase = { refMin: 10, refMax: 50, optimalMin: null, optimalMax: null };
  const rf = dataModule.getEffectiveRangeForDate(mockMarkerNoPhase, 0);
  assert('Fallback when no phaseRefRanges', rf.min === 10 && rf.max === 50, `got ${rf.min}-${rf.max}`);

  const mockMarkerWithContext = {
    refMin: 0, refMax: 1.3, optimalMin: 0, optimalMax: 1,
    rangePolicy: 'guidance',
    contextRefRanges: [{ min: 0, max: 2 }, { min: null, max: null }],
    contextRangeLabels: ['AASLD threshold (65+)', 'Not validated under 35'],
  };
  const contextualRef = dataModule.getEffectiveRangeForDate(mockMarkerWithContext, 0, 'reference');
  assert('Context guidance overrides the static reference for that date', contextualRef.max === 2);
  const contextualOptimal = dataModule.getEffectiveRangeForDate(mockMarkerWithContext, 0, 'optimal');
  assert('Explicit optimal range still wins in optimal mode', contextualOptimal.max === 1);
  const unratedContext = dataModule.getEffectiveRangeForDate(mockMarkerWithContext, 1, 'reference');
  assert('A contextual not-valid state suppresses the static fallback', unratedContext.min == null && unratedContext.max == null);
  assert('Context guidance label is exposed to UI and model consumers',
    dataModule.getEffectiveRangeLabelForDate(mockMarkerWithContext, 0, 'reference') === 'AASLD threshold (65+)');
  const contextEnvelope = dataModule.getContextRefEnvelope(mockMarkerWithContext);
  assert('Context envelope ignores unrated dates', contextEnvelope.min === 0 && contextEnvelope.max === 2);

  // ═══════════════════════════════════════
  // 5. getPhaseRefEnvelope function
  // ═══════════════════════════════════════
  console.log('Section 5: getPhaseRefEnvelope');
  assert('getPhaseRefEnvelope is a module API', typeof dataModule.getPhaseRefEnvelope === 'function');
  assert('getPhaseRefEnvelope stays off window', !('getPhaseRefEnvelope' in window));

  const env = dataModule.getPhaseRefEnvelope(mockMarkerWithPhase);
  assert('Envelope min is smallest across phases', env.min === 45, `got ${env.min}`);
  assert('Envelope max is largest across phases', env.max === 1470, `got ${env.max}`);

  const envNull = dataModule.getPhaseRefEnvelope(mockMarkerNoPhase);
  assert('Envelope null when no phaseRefRanges', envNull === null);

  const allNulls = { phaseRefRanges: [null, null, null] };
  const envAllNull = dataModule.getPhaseRefEnvelope(allNulls);
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

    const data = dataModule.getActiveData();
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
    assert('Menstrual estradiol range 46-609', pr0?.min === 46 && pr0?.max === 609, pr0 ? `got ${pr0.min}-${pr0.max}` : 'null');
    assert('Menstrual estradiol range is explicitly predicted', pr0?.label === 'Predicted menstrual range');

    // 2026-01-15 is day 18 of cycle starting 2025-12-29 → luteal (ovulation day=14, day 18 > 15)
    const phase1 = estradiol?.phaseLabels?.[1];
    assert('Second date is Luteal phase', phase1 === 'Luteal', `got ${phase1}`);
    const pr1 = estradiol?.phaseRefRanges?.[1];
    assert('Luteal estradiol range 161-775', pr1?.min === 161 && pr1?.max === 775, pr1 ? `got ${pr1.min}-${pr1.max}` : 'null');

    // Progesterone phase ranges
    const ppr0 = progesterone?.phaseRefRanges?.[0];
    assert('Menstrual progesterone range 0.32-2.86', ppr0?.min === 0.32 && ppr0?.max === 2.86, ppr0 ? `got ${ppr0.min}-${ppr0.max}` : 'null');
    const ppr1 = progesterone?.phaseRefRanges?.[1];
    assert('Luteal progesterone range 5.72-76', ppr1?.min === 5.72 && ppr1?.max === 76, ppr1 ? `got ${ppr1.min}-${ppr1.max}` : 'null');

    // ═══════════════════════════════════════
    // 7. Male profile — no phaseRefRanges
    // ═══════════════════════════════════════
    console.log('Section 7: Male profile (no phase ranges)');
    window.state.profileSex = 'male';
    const maleData = dataModule.getActiveData();
    const maleEstradiol = maleData.categories.hormones?.markers?.estradiol;
    assert('Male estradiol has no phaseRefRanges', !maleEstradiol?.phaseRefRanges);
    assert('Male estradiol has no phaseLabels', !maleEstradiol?.phaseLabels);

    // ═══════════════════════════════════════
    // 8. Female without cycle data — no phaseRefRanges
    // ═══════════════════════════════════════
    console.log('Section 8: Female without cycle data');
    window.state.profileSex = 'female';
    window.state.importedData.menstrualCycle = null;
    const noCycleData = dataModule.getActiveData();
    const noCycleEstradiol = noCycleData.categories.hormones?.markers?.estradiol;
    assert('No cycle → no phaseRefRanges', !noCycleEstradiol?.phaseRefRanges);

    // ═══════════════════════════════════════
    // 9. Female with cycle but no periods — no phaseRefRanges
    // ═══════════════════════════════════════
    console.log('Section 9: Female with cycle profile but no periods');
    window.state.importedData.menstrualCycle = { cycleLength: 28, periodLength: 5, regularity: 'regular', flow: 'moderate', periods: [] };
    const noPeriodsData = dataModule.getActiveData();
    const noPeriodsEstradiol = noPeriodsData.categories.hormones?.markers?.estradiol;
    assert('No periods → no phaseRefRanges', !noPeriodsEstradiol?.phaseRefRanges);

    // Calendar-only phase inference is unreliable for irregular and
    // perimenopausal cycles, so the generic/lab range remains visible.
    const loggedPeriods = [
      { startDate: '2025-12-01', endDate: '2025-12-05', flow: 'moderate', notes: '' },
      { startDate: '2025-12-29', endDate: '2026-01-02', flow: 'moderate', notes: '' },
    ];
    window.state.importedData.menstrualCycle = {
      cycleStatus: 'regular', cycleLength: 28, periodLength: 5, regularity: 'irregular',
      contraceptive: '', periods: loggedPeriods,
    };
    const irregularData = dataModule.getActiveData();
    assert('Irregular cycle → no predicted phase ranges',
      !irregularData.categories.hormones?.markers?.estradiol?.phaseRefRanges);

    window.state.importedData.menstrualCycle = {
      cycleStatus: 'perimenopause', cycleLength: 28, periodLength: 5, regularity: 'regular',
      contraceptive: '', periods: loggedPeriods,
    };
    const perimenopauseData = dataModule.getActiveData();
    assert('Perimenopause → no predicted phase ranges',
      !perimenopauseData.categories.hormones?.markers?.estradiol?.phaseRefRanges);

    window.state.importedData.menstrualCycle = {
      cycleStatus: 'regular', cycleLength: 28, periodLength: 5, regularity: 'regular',
      contraceptive: 'combined pill', periods: loggedPeriods,
    };
    const contraceptiveData = dataModule.getActiveData();
    assert('Hormonal contraception → no predicted phase ranges',
      !contraceptiveData.categories.hormones?.markers?.estradiol?.phaseRefRanges);

    // ═══════════════════════════════════════
    // 10. Phase can't be determined for some dates
    // ═══════════════════════════════════════
    console.log('Section 10: Null entries for undetermined phases');
    window.state.importedData.menstrualCycle = {
      cycleLength: 28, periodLength: 5, regularity: 'regular', flow: 'moderate',
      periods: [{ startDate: '2025-12-01', endDate: '2025-12-05', flow: 'moderate', notes: '' }]
    };
    // 2025-12-05 is in menstrual range, 2026-01-15 is >35 days from last period (28+7=35) → null
    const partialData = dataModule.getActiveData();
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
    const usData = dataModule.getActiveData();
    const usEstradiol = usData.categories.hormones?.markers?.estradiol;
    // Estradiol conversion: pmol/l → pg/ml, factor = 0.2724 (from UNIT_CONVERSIONS)
    if (usEstradiol?.phaseRefRanges?.[0]) {
      const expectedMin = parseFloat((46 * 0.2724).toPrecision(4));
      const expectedMax = parseFloat((609 * 0.2724).toPrecision(4));
      assert('US conversion applied to phase range min', usEstradiol.phaseRefRanges[0].min === expectedMin,
        `expected ${expectedMin}, got ${usEstradiol.phaseRefRanges[0].min}`);
      assert('US conversion applied to phase range max', usEstradiol.phaseRefRanges[0].max === expectedMax,
        `expected ${expectedMax}, got ${usEstradiol.phaseRefRanges[0].max}`);
      assert('US conversion preserves phase range label',
        usEstradiol.phaseRefRanges[0].label === 'Predicted menstrual range');
      assert('US conversion preserves phase range source',
        usEstradiol.phaseRefRanges[0].source === 'Labcorp 004515 (Roche cobas ECLIA)');
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
    const fullData = dataModule.getActiveData();
    // Manually test filterDatesByRange
    window.state.dateRangeFilter = 'all';
    const filteredAll = dataModule.filterDatesByRange(fullData);
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
  // 14. dashboard composition / marker detail source inspection
  // ═══════════════════════════════════════
  console.log('Section 14: dashboard composition source inspection');
  const dashboardCompositionSource = read('js/dashboard-view-composition.js');
  const categoryViewRenderersSource = read('js/category-view-renderers.js');
  const compareCorrelationsSource = read('js/compare-correlations.js');
  const markerDetailSource = read('js/marker-detail-modal-impl.js');
  assert('dashboard composition imports getEffectiveRangeForDate', dashboardCompositionSource.includes('getEffectiveRangeForDate'));
  assert('renderChartCard uses getEffectiveRangeForDate', categoryViewRenderersSource.includes('getEffectiveRangeForDate(marker, latestIdx)'));
  assert('renderChartCard per-value uses getEffectiveRangeForDate', categoryViewRenderersSource.includes('getEffectiveRangeForDate(marker, i)'));
  assert('showDetailModal uses getEffectiveRangeForDate', markerDetailSource.includes('getEffectiveRangeForDate(marker, i)'));
  assert('showDetailModal shows phase label', markerDetailSource.includes('mv-phase'));
  assert('renderTableView uses getEffectiveRangeForDate', categoryViewRenderersSource.includes('getEffectiveRangeForDate(marker, i)'));
  assert('renderHeatmapView uses getEffectiveRangeForDate', categoryViewRenderersSource.includes('getEffectiveRangeForDate(marker, i)'));
  assert('renderCompareTable uses getEffectiveRangeForDate', compareCorrelationsSource.includes('getEffectiveRangeForDate(marker, idx'));

  // ═══════════════════════════════════════
  // 15. chat marker prompt source inspection
  // ═══════════════════════════════════════
  console.log('Section 15: chat marker prompt source inspection');
  const chatMarkerPromptsSource = read('js/chat-marker-prompts.js');
  assert('chat-marker-prompts.js imports getEffectiveRangeForDate', chatMarkerPromptsSource.includes('getEffectiveRangeForDate'));
  assert('askAIAboutMarker phase-aware serialization', chatMarkerPromptsSource.includes('phaseRefRanges') && chatMarkerPromptsSource.includes('phaseLabels'));
  assert('askAIAboutMarker phase context', chatMarkerPromptsSource.includes('phaseLabels') && chatMarkerPromptsSource.includes('phase-specific'));

  // ═══════════════════════════════════════
  // 17. marker-analysis countFlagged and getAllFlaggedMarkers
  // ═══════════════════════════════════════
  console.log('Section 17: countFlagged and getAllFlaggedMarkers');
  assert('countFlagged uses getEffectiveRangeForDate', markerAnalysisSource.includes('getEffectiveRangeForDate(m, i)'));
  assert('getAllFlaggedMarkers preserves resolved range provenance',
    markerAnalysisSource.includes('const rangeContext = resolveMarkerRangeContext(m, i)')
      && markerAnalysisSource.includes('effectiveSource: r.source'));

  // ═══════════════════════════════════════
  // 18. marker-analysis detectTrendAlerts
  // ═══════════════════════════════════════
  console.log('Section 18: detectTrendAlerts');
  assert('detectTrendAlerts uses phase-aware range for latest', markerAnalysisSource.includes('getEffectiveRangeForDate(marker, latestEntry.i)'));
  assert('detectTrendAlerts keeps aggregate range for normalization', markerAnalysisSource.includes('const r = getEffectiveRange(marker)'));

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
  assert('filterDatesByRange spreads contextRefRanges', dataSource.includes('marker.contextRefRanges && { contextRefRanges'));
  assert('filterDatesByRange spreads contextRangeLabels', dataSource.includes('marker.contextRangeLabels && { contextRangeLabels'));

  // ═══════════════════════════════════════
  // 21. CSS for mv-phase
  // ═══════════════════════════════════════
  console.log('Section 21: CSS');
  assert('CSS has .mv-phase rule', cssSource.includes('.mv-phase'));

  // ═══════════════════════════════════════
  // 22. applyUnitConversion handles phaseRefRanges
  // ═══════════════════════════════════════
  console.log('Section 22: applyUnitConversion');
  assert('applyUnitConversion converts phaseRefRanges', dataSource.includes("'phaseRefRanges'") && dataSource.includes('convertProfileRange'));
  assert('applyUnitConversion converts contextual ranges', dataSource.includes("'contextRefRanges'") && dataSource.includes("'contextOptimalRanges'"));

  // ═══════════════════════════════════════
  // Summary
  // ═══════════════════════════════════════
console.log('\n' + results.join('\n'));
console.log(`\nResults: ${passed} passed, ${failed} failed, ${passed + failed} total`);
process.exit(failed > 0 ? 1 : 0);
