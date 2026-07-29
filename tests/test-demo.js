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
    const now = Date.parse('2026-06-20T00:00:00.000Z');
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
    Date.now = () => Date.parse('2026-06-20T00:00:00.000Z');
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
        updatedAt: Date.parse('2026-06-20T00:00:00.000Z'),
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
