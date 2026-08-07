#!/usr/bin/env node
// test-demo.js — Verify demo data onboarding redesign
//
// Run: node tests/test-demo.js  (or via npm test)

import './_node-shim.js';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel.replace(/^\//, '')), 'utf-8');
const readJson = (rel) => JSON.parse(read(rel));

let pass = 0, fail = 0;
function assert(name, condition, detail) {
  if (condition) { pass++; console.log(`  PASS: ${name}`); }
  else { fail++; console.log(`  FAIL: ${name}${detail ? ' — ' + detail : ''}`); }
}

console.log('=== Demo Data Onboarding Tests ===\n');

const { state } = await import('../js/state.js');
const exportModule = await import('../js/export.js');
const { findOrCreateLabEntry } = await import('../js/lab-entry-mutations.js');
const { setLabEntryMarker } = await import('../js/lab-entry.js');
const { migrateProfileData } = await import('../js/profile.js');
const { getActiveData, invalidateActiveDataCache, filterDatesByRange } = await import('../js/data.js');
const { computeBiologyScores, getBiologyScoreMapping } = await import('../js/biology-scores.js');
const { buildBiologyScoreContextFingerprint, buildBiologyScoreContextFingerprintsByRange, hasCurrentBiologyScoreContextReview } = await import('../js/biology-score-context-ai.js');
const contextOptions = await import('../js/constants.js');

const DEMO_REFERENCE_NOW = Date.parse('2026-08-07T00:00:00.000Z');
const DAY_MS = 86400000;

function optionValues(name) {
  return new Set((contextOptions[name] || []).map(option => typeof option === 'string' ? option : option.value));
}

function getPath(obj, pathName) {
  return pathName.split('.').reduce((value, key) => value?.[key], obj);
}

const CONTEXT_OPTION_PATHS = [
  ['diet.type', 'DIET_TYPES'], ['diet.restrictions', 'DIET_RESTRICTIONS'], ['diet.pattern', 'DIET_PATTERNS'],
  ['diet.proteinIntake', 'DIET_PROTEIN_INTAKE'], ['diet.hydration', 'DIET_HYDRATION'], ['diet.alcohol', 'DIET_ALCOHOL'],
  ['diet.caffeine', 'DIET_CAFFEINE'], ['diet.caffeineTiming', 'DIET_CAFFEINE_TIMING'], ['diet.recentChanges', 'DIET_RECENT_CHANGES'],
  ['diet.bowelFrequency', 'BOWEL_FREQUENCY'], ['diet.stoolConsistency', 'STOOL_CONSISTENCY'], ['diet.bloating', 'BLOATING_SEVERITY'],
  ['diet.gas', 'GAS_SEVERITY'], ['diet.acidReflux', 'ACID_REFLUX'], ['diet.burping', 'BURPING'],
  ['diet.nausea', 'NAUSEA'], ['diet.appetite', 'APPETITE'], ['diet.abdominalPain', 'ABDOMINAL_PAIN'],
  ['diet.foodSensitivities', 'FOOD_SENSITIVITIES'], ['exercise.frequency', 'EXERCISE_FREQ'], ['exercise.types', 'EXERCISE_TYPES'],
  ['exercise.intensity', 'EXERCISE_INTENSITY'], ['exercise.dailyMovement', 'DAILY_MOVEMENT'], ['exercise.duration', 'EXERCISE_DURATION'],
  ['exercise.muscleContext', 'EXERCISE_MUSCLE_CONTEXT'], ['exercise.limitations', 'EXERCISE_LIMITATIONS'],
  ['sleepRest.duration', 'SLEEP_DURATIONS'], ['sleepRest.quality', 'SLEEP_QUALITY'], ['sleepRest.daytimeSleepiness', 'SLEEP_DAYTIME_SLEEPINESS'],
  ['sleepRest.apneaStatus', 'SLEEP_APNEA_STATUS'], ['sleepRest.papUse', 'SLEEP_PAP_USE'], ['sleepRest.naps', 'SLEEP_NAPS'],
  ['sleepRest.schedule', 'SLEEP_SCHEDULE'], ['sleepRest.roomTemp', 'SLEEP_ROOM_TEMP'], ['sleepRest.issues', 'SLEEP_ISSUES'],
  ['sleepRest.environment', 'SLEEP_ENVIRONMENT'], ['sleepRest.practices', 'SLEEP_PRACTICES'], ['stress.level', 'STRESS_LEVELS'],
  ['stress.sources', 'STRESS_SOURCES'], ['stress.management', 'STRESS_MGMT'], ['stress.duration', 'STRESS_DURATION'], ['stress.trend', 'STRESS_TREND'],
  ['loveLife.status', 'LOVE_STATUS'], ['loveLife.relationship', 'LOVE_RELATIONSHIP'], ['loveLife.satisfaction', 'LOVE_SATISFACTION'],
  ['loveLife.libido', 'LOVE_LIBIDO'], ['loveLife.libidoChange', 'LOVE_LIBIDO_CHANGE'], ['loveLife.frequency', 'LOVE_FREQUENCY'],
  ['loveLife.orgasm', 'LOVE_ORGASM'], ['loveLife.concerns', 'LOVE_CONCERNS'], ['loveLife.reproductiveGoals', 'LOVE_REPRODUCTIVE_GOALS'],
  ['environment.setting', 'ENV_SETTING'], ['environment.climate', 'ENV_CLIMATE'], ['environment.altitude', 'ENV_ALTITUDE'],
  ['environment.inhaledExposures', 'ENV_INHALED_EXPOSURES'], ['environment.occupationalExposures', 'ENV_OCCUPATIONAL_EXPOSURES'],
  ['environment.water', 'ENV_WATER'], ['environment.waterConcerns', 'ENV_WATER_CONCERNS'], ['environment.emf', 'ENV_EMF'],
  ['environment.emfMitigation', 'ENV_EMF_MITIGATION'], ['environment.homeLight', 'ENV_HOME_LIGHT'], ['environment.air', 'ENV_AIR'],
  ['environment.toxins', 'ENV_TOXINS'], ['environment.building', 'ENV_BUILDING'],
];

function invalidContextOptions(demoJson) {
  return CONTEXT_OPTION_PATHS.flatMap(([pathName, optionsName]) => {
    const raw = getPath(demoJson, pathName);
    const values = Array.isArray(raw) ? raw : raw == null || raw === '' ? [] : [raw];
    const allowed = optionValues(optionsName);
    return values.filter(value => !allowed.has(value)).map(value => `${pathName}=${value}`);
  });
}

  // ── 1. Source: dashboard-page-view.js ──
  console.log('\n1. dashboard-page-view.js — Onboarding HTML');
  const dashboardPageViewSrc = read('js/dashboard-page-view.js');
  assert('Has welcome-demo-section', dashboardPageViewSrc.includes('welcome-demo-section'));
  assert('Has welcome-section-label', dashboardPageViewSrc.includes('welcome-section-label'));
  assert('Old onboarding divider markup removed', !dashboardPageViewSrc.includes('onboarding-divider'));
  assert('Has demo-cards container', dashboardPageViewSrc.includes('demo-cards'));
  assert('Has demo-card class', dashboardPageViewSrc.includes('demo-card'));
  assert('Has delegated female demo card action', dashboardPageViewSrc.includes("dashboardWelcomeActionAttrs('load-demo', { demo: 'female' })"));
  assert('Has delegated male demo card action', dashboardPageViewSrc.includes("dashboardWelcomeActionAttrs('load-demo', { demo: 'male' })"));
  assert('Has Sarah, 34 label', dashboardPageViewSrc.includes('Sarah, 34'));
  assert('Has Alex, 38 label', dashboardPageViewSrc.includes('Alex, 38'));
  assert('Has demo-card-avatar', dashboardPageViewSrc.includes('demo-card-avatar'));
  assert('Has demo-card-name', dashboardPageViewSrc.includes('demo-card-name'));
  assert('Has demo-card-desc', dashboardPageViewSrc.includes('demo-card-desc'));
  assert('No old onboarding-demo-btn', !dashboardPageViewSrc.includes('onboarding-demo-btn'));

  // ── 2. Source: export.js ──
  console.log('\n2. export.js — loadDemoData(sex)');
  const exportSrc = read('js/export.js');
  assert('loadDemoData accepts sex param', exportSrc.includes("loadDemoData(sex = 'male')"));
  assert('References demo-female.json', exportSrc.includes('demo-female.json'));
  assert('References demo-male.json', exportSrc.includes('demo-male.json'));
  assert('Passes sex into demo profile metadata', /createProfile\(name,\s*\{[^}]*sex/.test(exportSrc));
  assert('Passes DOB into demo profile metadata', /createProfile\(name,\s*\{[^}]*dob/.test(exportSrc));
  assert('Sets DOB 1991-08-15 for female', exportSrc.includes('1991-08-15'));
  assert('Sets DOB 1987-11-22 for male', exportSrc.includes('1987-11-22'));
  assert('Sets onboarded to profile-set', exportSrc.includes("'profile-set'"));
  assert('Demo loading uses the eager profile module boundary without an ineffective dynamic import',
    /import\s*\{[^}]*\bcreateProfile\b[^}]*\bswitchProfile\b[^}]*}\s*from '\.\/profile\.js';/s.test(exportSrc)
    && !exportSrc.includes("import('./profile.js')"));

  // ── 3. Source: CSS bundle ──
  console.log('\n3. CSS bundle — Demo card styles');
  const cssSrc = [
    read('styles.css'),
    read('css/app-shell.css'),
    read('css/dashboard-core.css'),
    read('css/dashboard-widgets.css'),
    read('css/dashboard-welcome.css'),
    read('css/dashboard-data.css'),
    read('css/import.css'),
  ].join('\n');
  assert('Has .welcome-demo-section rule', cssSrc.includes('.welcome-demo-section'));
  assert('Has .welcome-section-label rule', cssSrc.includes('.welcome-section-label'));
  assert('Old .onboarding-divider rules removed', !cssSrc.includes('.onboarding-divider'));
  assert('Has .demo-cards rule', cssSrc.includes('.demo-cards'));
  assert('Has .demo-card rule', cssSrc.includes('.demo-card {'));
  assert('Has .demo-card:hover rule', cssSrc.includes('.demo-card:hover'));
  assert('Has .demo-card-avatar rule', cssSrc.includes('.demo-card-avatar'));
  assert('Has .demo-card-name rule', cssSrc.includes('.demo-card-name'));
  assert('Has .demo-card-desc rule', cssSrc.includes('.demo-card-desc'));
  assert('No old .onboarding-demo-btn rule', !cssSrc.includes('.onboarding-demo-btn'));
  assert('Demo cards grid layout', cssSrc.includes('.demo-cards { display: grid'));
  assert('Demo card cursor pointer', cssSrc.includes('cursor: pointer'));
  assert('Hidden drop zone stays invisible without progress', cssSrc.includes('.drop-zone-hidden:not(:has(.import-progress-bar)) { display: none; }'));
  assert('Mobile 480px: demo-cards stay two-column grid', cssSrc.includes('.demo-cards { grid-template-columns: 1fr 1fr; }'));

  // ── 4. Computed styles (if onboarding visible) ──
  console.log('\n4. Computed styles (live DOM)');
  const welcomeDemo = document.querySelector('.welcome-demo-section');
  if (welcomeDemo) {
    assert('.welcome-demo-section exists in DOM', !!welcomeDemo);
    const demoStyle = getComputedStyle(welcomeDemo);
    assert('.welcome-demo-section is constrained', demoStyle.maxWidth === '760px');

    const cards = document.querySelectorAll('.demo-card');
    assert('Two .demo-card buttons in DOM', cards.length === 2);
    if (cards.length === 2) {
      assert('First card onclick has female', cards[0].getAttribute('onclick').includes("'female'"));
      assert('Second card onclick has male', cards[1].getAttribute('onclick').includes("'male'"));
      const cardStyle = getComputedStyle(cards[0]);
      assert('Demo card has pointer cursor', cardStyle.cursor === 'pointer');
    }

    const chatPanel = document.querySelector('.welcome-chat-panel');
    assert('Primary chat-first empty-state panel exists', !!chatPanel);
  } else {
    console.log('  ⚠️  Empty dashboard not visible (data already loaded) — skipping DOM checks');
  }

  // ── 5. Module exports ──
  console.log('\n5. Module exports');
  assert('loadDemoData is exported', typeof exportModule.loadDemoData === 'function');
  assert('loadDemoData stays module-only', !('loadDemoData' in window));

  // ── 6. Service worker ──
  console.log('\n6. service-worker.js — Cache version');
  const swSrc = read('service-worker.js');
  assert('SW uses importScripts for version', swSrc.includes("importScripts('/version.js')"));
  assert('SW CACHE_NAME uses semver', swSrc.includes('`labcharts-v${self.APP_VERSION}`'));

  // ── 7. Demo profile feature coverage ──
  console.log('\n7. Demo JSONs — feature coverage + Biology Scores unlock');
  function importShapeFromDemo(demoJson) {
    const data = structuredClone(demoJson);
    const sourceEntries = Array.isArray(data.entries) ? data.entries : [];
    data.entries = [];
    const now = Date.parse('2026-08-07T00:00:00.000Z');
    for (const entry of sourceEntries) {
      if (!entry.date || !entry.markers) continue;
      const existing = findOrCreateLabEntry(data, entry.date, { now });
      for (const [key, value] of Object.entries(entry.markers)) {
        setLabEntryMarker(existing, key, value, { now, mirrorInsulin: true });
      }
    }
    migrateProfileData(data);
    return data;
  }
  const snapshot = structuredClone(state.importedData || {});
  const origSex = state.profileSex;
  const origDob = state.profileDob;
  const origRange = state.dateRangeFilter;
  const origDateNow = Date.now;
  try {
    // Demo fixture assertions must not age into failure as wall-clock time
    // advances. Match the fixed import timestamp used above.
    Date.now = () => Date.parse('2026-08-07T00:00:00.000Z');
    for (const demo of [
      { file: 'data/demo-female.json', sex: 'female', dob: '1991-08-15', label: 'Demo Sarah' },
      { file: 'data/demo-male.json', sex: 'male', dob: '1987-11-22', label: 'Demo Alex' },
    ]) {
      const demoJson = readJson(demo.file);
      assert(`${demo.label} has manual/body/light/genetics/context demo surfaces`,
        Object.keys(demoJson.manualValues || {}).length >= 16
          && (demoJson.sunSessions || []).length >= 7
          && (demoJson.deviceSessions || []).length >= 6
          && (demoJson.lightDevices || []).length >= 2
          && (demoJson.lightMeasurements || []).length >= 8
          && Object.keys(demoJson.genetics?.snps || {}).length >= 7
          && Object.keys(demoJson.contextHealth?.dots || {}).length === 9
          && !!demoJson.channelMixAI
          && typeof demoJson.focusCard?.text === 'string',
        'demo JSON must exercise current app feature surfaces');
      const latestLabDate = (demoJson.entries || []).map(entry => entry.date).filter(Boolean).sort().at(-1);
      const latestLabAgeDays = latestLabDate
        ? Math.floor((DEMO_REFERENCE_NOW - Date.parse(`${latestLabDate}T00:00:00Z`)) / DAY_MS)
        : Number.POSITIVE_INFINITY;
      assert(`${demo.label} latest complete panel is current at the demo reference date`,
        latestLabAgeDays >= 0 && latestLabAgeDays <= 30,
        `latest=${latestLabDate}, age=${latestLabAgeDays}d`);
      const contextErrors = invalidContextOptions(demoJson);
      assert(`${demo.label} profile context uses only current editor option values`,
        contextErrors.length === 0,
        contextErrors.join(', '));
      assert(`${demo.label} exercises the current structured context schema`,
        (demoJson.diagnoses?.conditions || []).every(condition => condition.status)
          && (demoJson.diagnoses?.familyHistory || []).length >= 2
          && !!demoJson.diet?.proteinIntake
          && !!demoJson.diet?.hydration
          && !!demoJson.exercise?.duration
          && !!demoJson.exercise?.muscleContext
          && !!demoJson.sleepRest?.daytimeSleepiness
          && !!demoJson.sleepRest?.apneaStatus
          && !!demoJson.stress?.duration
          && !!demoJson.stress?.trend
          && !!demoJson.environment?.altitude,
        'a current medically useful context field is missing');
      assert(`${demo.label} demonstrates notes and context change history`,
        Object.keys(demoJson.markerNotes || {}).length >= 2
          && Object.keys(demoJson.markerValueNotes || {}).length >= 2
          && (demoJson.changeHistory || []).length >= 3);
      const wearableSource = Object.values(demoJson.wearableSummary?.sources || {})[0];
      const wearableLatestDates = Object.values(demoJson.wearableSummary?.metrics || {}).map(metric => metric.latestDate).filter(Boolean);
      const latestWearableDate = wearableLatestDates.sort().at(-1);
      assert(`${demo.label} wearable timestamps are chronological and recent`,
        !!wearableSource?.lastSyncAt
          && wearableSource.lastSyncAt >= Date.parse(`${wearableSource.connectedSince}T00:00:00Z`)
          && wearableSource.lastSyncAt >= Date.parse(`${latestWearableDate}T00:00:00Z`)
          && DEMO_REFERENCE_NOW - Date.parse(`${latestWearableDate}T00:00:00Z`) <= 30 * DAY_MS,
        `connected=${wearableSource?.connectedSince}, latest=${latestWearableDate}, sync=${wearableSource?.lastSyncAt}`);
      const latestSunAt = Math.max(...(demoJson.sunSessions || []).map(session => Number(session.endedAt || 0)));
      assert(`${demo.label} has recent light and sun activity without fabricated correlations`,
        DEMO_REFERENCE_NOW - latestSunAt <= 14 * DAY_MS
          && Array.isArray(demoJson.sunCorrelations?.pairs)
          && demoJson.sunCorrelations.pairs.length === 0,
        `latest sun age=${Math.floor((DEMO_REFERENCE_NOW - latestSunAt) / DAY_MS)}d`);

      if (demo.sex === 'male') {
        const metabolicEntries = (demoJson.entries || []).filter(entry => Number.isFinite(entry.markers?.['hormones.insulin']));
        const badHoma = metabolicEntries.filter(entry => {
          const glucose = entry.markers?.['biochemistry.glucose'];
          const insulin = entry.markers?.['hormones.insulin'];
          const duplicateInsulin = entry.markers?.['diabetes.insulin_d'];
          const storedHoma = entry.markers?.['diabetes.homaIR'];
          return insulin !== duplicateInsulin || Math.abs((glucose * insulin / 22.5) - storedHoma) > 0.015;
        });
        assert('Demo Alex insulin duplicates and HOMA-IR are internally consistent',
          badHoma.length === 0,
          badHoma.map(entry => entry.date).join(', '));
        assert('Demo Alex profile and sun setup use the same real-world location',
          demoJson.sunDefaults?.coords?.label === 'Boulder, CO'
            && demoJson.sunDefaults.coords.lat > 39
            && demoJson.sunDefaults.coords.lat < 41
            && (demoJson.sunSessions || []).every(session => session.location?.label === 'Boulder, CO'));
      } else {
        const periods = [...(demoJson.menstrualCycle?.periods || [])].sort((a, b) => a.startDate.localeCompare(b.startDate));
        const cadenceErrors = periods.slice(1).filter((period, index) =>
          (Date.parse(`${period.startDate}T00:00:00Z`) - Date.parse(`${periods[index].startDate}T00:00:00Z`)) / DAY_MS !== 29);
        const lastPeriod = periods.at(-1);
        const latestCycleDay = lastPeriod
          ? Math.floor((Date.parse(`${latestLabDate}T00:00:00Z`) - Date.parse(`${lastPeriod.startDate}T00:00:00Z`)) / DAY_MS) + 1
          : null;
        assert('Demo Sarah cycle calendar, latest draw phase, and 29-day cadence agree',
          cadenceErrors.length === 0 && latestCycleDay === 10,
          `cadence errors=${cadenceErrors.length}, latest cycle day=${latestCycleDay}`);
        assert('Demo Sarah is not represented as taking an unstarted thyroid medication',
          !(demoJson.supplements || []).some(item => item.name === 'Levothyroxine')
            && (demoJson.diagnoses?.conditions || []).some(condition => condition.name.includes('under evaluation')));
      }
      const imported = importShapeFromDemo(demoJson);
      state.importedData = imported;
      state.profileSex = demo.sex;
      state.profileDob = demo.dob;
      state.dateRangeFilter = 'all';
      invalidateActiveDataCache();
      const activeData = getActiveData();
      const scores = computeBiologyScores(activeData).filter(score => score.id !== 'biologicalCoherence');
      const liveScores = scores.filter(score => score.score != null);
      assert(`${demo.label} computes every Biology Score detail card`,
        liveScores.length === scores.length && scores.length === getBiologyScoreMapping().length - 1,
        `live=${liveScores.length}/${scores.length}, waiting=${scores.filter(score => score.score == null).map(score => score.id).join(', ')}`);
      const directionalOnly = scores.filter(score => score.evidence === 'experimental' && (score.coverage || 0) < 0.25).map(score => score.id);
      assert(`${demo.label} has no Biology Score stuck at directional-only coverage`,
        directionalOnly.length === 0,
        `directional-only: ${directionalOnly.join(', ')}`);
      const missingCore = scores.flatMap(score => (score.missing || []).filter(item => item.core).map(item => `${score.id}:${item.label || item.path || item.key}`));
      assert(`${demo.label} has no missing core Biology Score markers`,
        missingCore.length === 0,
        `missing core: ${missingCore.join(', ')}`);
      const perfectScores = scores.filter(score => score.score === 100).map(score => score.id);
      assert(`${demo.label} avoids implausible clusters of perfect Biology Scores`,
        perfectScores.length <= 1,
        `perfect scores: ${perfectScores.join(', ')}`);
      imported.biologyScoreContextAI = {
        summary: 'Demo context checked locally. Biology Scores are unlocked for this sample profile without using an AI provider.',
        suggestions: [],
        fingerprint: buildBiologyScoreContextFingerprint(activeData, 'all'),
        fingerprintsByRange: buildBiologyScoreContextFingerprintsByRange(activeData),
        unlockedRanges: ['all', '1y', '6m', '3m'],
        range: 'all',
        updatedAt: Date.parse('2026-08-07T00:00:00.000Z'),
      };
      const badRanges = [];
      for (const range of ['all', '1y', '6m', '3m']) {
        state.dateRangeFilter = range;
        invalidateActiveDataCache();
        const rawRangeData = getActiveData();
        const scoreData = range === 'all' ? rawRangeData : filterDatesByRange(rawRangeData, { fallbackToAll: false });
        if (!hasCurrentBiologyScoreContextReview(scoreData)) badRanges.push(range);
      }
      assert(`${demo.label} Biology Scores unlock is current for every timeframe without AI`,
        badRanges.length === 0,
        `stale ranges: ${badRanges.join(', ')}`);
    }
  } finally {
    state.importedData = snapshot;
    state.profileSex = origSex;
    state.profileDob = origDob;
    state.dateRangeFilter = origRange;
    Date.now = origDateNow;
    invalidateActiveDataCache();
  }

  // ── Summary ──
console.log(`\nResults: ${pass} passed, ${fail} failed, ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
