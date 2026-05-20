#!/usr/bin/env node
// test-cycle-improvements.js — Browser test for cycle improvements
//
// Run: node tests/test-cycle-improvements.js  (or via npm test)

import './_node-shim.js';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf-8');

let pass = 0, fail = 0;
const results = [];
function assert(name, condition, detail = '') {
  if (condition) { pass++; results.push(`  PASS: ${name}`); }
  else { fail++; results.push(`  FAIL: ${name}${detail ? ' — ' + detail : ''}`); }
}

console.log('=== Cycle Improvements Test Suite ===\n');

// Load state + data.js + cycle.js so window.getActiveData /
// setPhaseOverlay / detectPerimenopausePattern / etc. exist.
await import('../js/state.js');
await import('../js/data.js');
await import('../js/cycle.js');
// charts.js exposes phaseBandPlugin etc. via Object.assign(window, ...).
await import('../js/charts.js');
  // ── Section 1: PERIOD_SYMPTOMS constant ──
  console.log('Section 1: PERIOD_SYMPTOMS constant');
  {
    const mod = await import('../js/constants.js');
    assert('PERIOD_SYMPTOMS exists', Array.isArray(mod.PERIOD_SYMPTOMS));
    assert('PERIOD_SYMPTOMS has 17 items', mod.PERIOD_SYMPTOMS.length === 17, `got ${mod.PERIOD_SYMPTOMS?.length}`);
    assert('PERIOD_SYMPTOMS includes Cramps', mod.PERIOD_SYMPTOMS.includes('Cramps'));
    assert('PERIOD_SYMPTOMS includes Fatigue', mod.PERIOD_SYMPTOMS.includes('Fatigue'));
    assert('PERIOD_SYMPTOMS includes Nausea', mod.PERIOD_SYMPTOMS.includes('Nausea'));
  }

  // ── Section 2: state.phaseOverlayMode ──
  console.log('Section 2: state.phaseOverlayMode');
  {
    const mod = await import('../js/state.js');
    assert('phaseOverlayMode exists in state', 'phaseOverlayMode' in mod.state);
    assert('phaseOverlayMode defaults to off', mod.state.phaseOverlayMode === 'off', `got "${mod.state.phaseOverlayMode}"`);
  }

  // ── Section 3: data.phaseLabels computation ──
  console.log('Section 3: data.phaseLabels computation');
  {
    const { state } = await import('../js/state.js');
    const origSex = state.profileSex;
    const origMC = state.importedData.menstrualCycle;
    const origEntries = state.importedData.entries;

    // Test with female + cycle + entries
    state.profileSex = 'female';
    state.importedData.menstrualCycle = {
      cycleLength: 28, periodLength: 5, regularity: 'regular', flow: 'moderate',
      contraceptive: '', conditions: '', periods: [
        { startDate: '2025-01-01', endDate: '2025-01-05', flow: 'moderate', notes: '' },
        { startDate: '2025-01-29', endDate: '2025-02-02', flow: 'moderate', notes: '' }
      ]
    };
    state.importedData.entries = [
      { date: '2025-01-03', markers: { 'biochemistry.glucose': 5.0 } },
      { date: '2025-01-15', markers: { 'biochemistry.glucose': 5.2 } },
      { date: '2025-02-01', markers: { 'biochemistry.glucose': 4.9 } }
    ];

    const data = window.getActiveData();
    assert('data.phaseLabels exists for female+cycle', Array.isArray(data.phaseLabels));
    assert('data.phaseLabels length matches dates', data.phaseLabels.length === data.dates.length, `${data.phaseLabels?.length} vs ${data.dates.length}`);
    assert('data.phaseLabels contains menstrual for Jan 3', data.phaseLabels[0] === 'menstrual', `got "${data.phaseLabels?.[0]}"`);
    assert('data.phaseLabels contains ovulatory for Jan 15', data.phaseLabels[1] === 'ovulatory', `got "${data.phaseLabels?.[1]}"`);
    assert('data.phaseLabels contains menstrual for Feb 1', data.phaseLabels[2] === 'menstrual', `got "${data.phaseLabels?.[2]}"`);

    // Test without cycle → no phaseLabels
    state.profileSex = 'male';
    const dataM = window.getActiveData();
    assert('data.phaseLabels absent for male', !dataM.phaseLabels);

    state.profileSex = origSex;
    state.importedData.menstrualCycle = origMC;
    state.importedData.entries = origEntries;
  }

  // ── Section 4: filterDatesByRange preserves phaseLabels ──
  console.log('Section 4: filterDatesByRange preserves phaseLabels');
  {
    const src = read('js/data.js');
    assert('filterDatesByRange has phaseLabels spread', src.includes('phaseLabels') && src.includes('indices.map(i => data.phaseLabels[i])'));
  }

  // ── Section 5: setPhaseOverlay function ──
  console.log('Section 5: setPhaseOverlay function');
  {
    assert('setPhaseOverlay is a window function', typeof window.setPhaseOverlay === 'function');
    const src = read('js/data.js');
    assert('setPhaseOverlay sets phaseOverlayMode', src.includes("state.phaseOverlayMode = mode === 'off' ? 'off' : 'on'"));
    assert('setPhaseOverlay persists to localStorage', src.includes("'phaseOverlay'") && src.includes('setPhaseOverlay'));
  }

  // ── Section 6: PER_PROFILE_PREF_SUFFIXES includes phaseOverlay ──
  console.log('Section 6: PER_PROFILE_PREF_SUFFIXES');
  {
    const src = read('js/backup.js');
    assert('phaseOverlay in PER_PROFILE_PREF_SUFFIXES', src.includes("'phaseOverlay'"));
  }

  // ── Section 7: phaseBandPlugin ──
  console.log('Section 7: phaseBandPlugin');
  {
    assert('phaseBandPlugin exists on window', typeof window.phaseBandPlugin === 'object');
    assert('phaseBandPlugin has id phaseBands', window.phaseBandPlugin?.id === 'phaseBands');
    assert('phaseBandPlugin has beforeDraw', typeof window.phaseBandPlugin?.beforeDraw === 'function');
  }

  // ── Section 8: createLineChart accepts 5th param ──
  console.log('Section 8: createLineChart signature');
  {
    const src = read('js/charts.js');
    assert('createLineChart has phaseLabels param', /createLineChart\([^)]*phaseLabels/.test(src));
    assert('phaseBands in chart plugin config', src.includes('phaseBands:'));
    assert('phaseBandPlugin in plugins array', src.includes('phaseBandPlugin'));
  }

  // ── Section 9: renderChartLayersDropdown includes cycle phases ──
  console.log('Section 9: renderChartLayersDropdown');
  {
    const src = read('js/data.js');
    assert('Layers dropdown checks for cycle data', src.includes('hasCycle'));
    assert('Layers dropdown has setPhaseOverlay', src.includes("setPhaseOverlay(this.checked"));
    assert('Layers dropdown shows Cycle Phases label', src.includes('Cycle Phases'));
  }

  // ── Section 10: loadProfile loads phaseOverlay ──
  console.log('Section 10: loadProfile phaseOverlay');
  {
    const src = read('js/profile.js');
    assert('loadProfile reads phaseOverlay', src.includes("'phaseOverlay'") && src.includes('phaseOverlayMode'));
  }

  // ── Section 11: detectPerimenopausePattern ──
  console.log('Section 11: detectPerimenopausePattern');
  {
    assert('detectPerimenopausePattern is a window function', typeof window.detectPerimenopausePattern === 'function');

    // Returns null for <35 age
    const youngMC = {
      cycleLength: 28, periodLength: 5, regularity: 'regular', flow: 'moderate',
      periods: [
        { startDate: '2025-01-01', endDate: '2025-01-05', flow: 'moderate' },
        { startDate: '2025-02-01', endDate: '2025-02-05', flow: 'moderate' },
        { startDate: '2025-03-01', endDate: '2025-03-05', flow: 'moderate' },
        { startDate: '2025-04-01', endDate: '2025-04-05', flow: 'moderate' }
      ]
    };
    const youngDob = '2005-01-01'; // ~20 years old
    const youngResult = window.detectPerimenopausePattern(youngMC, youngDob);
    assert('Returns null for age <35', youngResult === null);

    // Returns null for <4 periods
    const fewMC = {
      periods: [
        { startDate: '2025-01-01', endDate: '2025-01-05', flow: 'moderate' },
        { startDate: '2025-02-01', endDate: '2025-02-05', flow: 'moderate' }
      ]
    };
    const result2 = window.detectPerimenopausePattern(fewMC, '1980-01-01');
    assert('Returns null for <4 periods', result2 === null);

    // Returns null for no DOB
    assert('Returns null for no DOB', window.detectPerimenopausePattern(youngMC, null) === null);
  }

  // ── Section 12: detectPerimenopausePattern with qualifying data ──
  console.log('Section 12: detectPerimenopausePattern qualifying');
  {
    // Age 45, lengthening + heavy + >38 day cycles
    const periMC = {
      cycleLength: 35, periodLength: 6, regularity: 'irregular', flow: 'heavy',
      periods: [
        { startDate: '2024-01-01', endDate: '2024-01-06', flow: 'heavy' },
        { startDate: '2024-02-05', endDate: '2024-02-10', flow: 'heavy' },
        { startDate: '2024-03-20', endDate: '2024-03-25', flow: 'heavy' },
        { startDate: '2024-05-10', endDate: '2024-05-15', flow: 'heavy' },
        { startDate: '2024-07-05', endDate: '2024-07-10', flow: 'heavy' }
      ]
    };
    const periResult = window.detectPerimenopausePattern(periMC, '1979-01-01'); // ~45-46
    assert('Detects perimenopause for qualifying data', periResult !== null);
    assert('Has indicators array', Array.isArray(periResult?.indicators));
    assert('Has 2+ indicators', periResult?.indicators?.length >= 2, `got ${periResult?.indicators?.length}: ${periResult?.indicators?.join(', ')}`);
    assert('Has message string', typeof periResult?.message === 'string');
    assert('Message mentions age', periResult?.message?.includes('age'));
  }

  // ── Section 13: detectCycleIronAlerts empty ──
  console.log('Section 13: detectCycleIronAlerts empty cases');
  {
    assert('detectCycleIronAlerts is a window function', typeof window.detectCycleIronAlerts === 'function');

    // No heavy flow → no alerts
    const mc1 = {
      periods: [
        { startDate: '2025-01-01', endDate: '2025-01-05', flow: 'moderate' },
        { startDate: '2025-02-01', endDate: '2025-02-05', flow: 'light' }
      ]
    };
    const data1 = window.getActiveData();
    const alerts1 = window.detectCycleIronAlerts(mc1, data1);
    assert('No alerts for no heavy flow', alerts1.length === 0);

    // Null mc → empty
    assert('No alerts for null mc', window.detectCycleIronAlerts(null, data1).length === 0);
  }

  // ── Section 14: detectCycleIronAlerts with heavy flow ──
  console.log('Section 14: detectCycleIronAlerts with heavy flow');
  {
    const mc2 = {
      periods: [
        { startDate: '2025-01-01', endDate: '2025-01-05', flow: 'heavy' },
        { startDate: '2025-02-01', endDate: '2025-02-05', flow: 'heavy' }
      ]
    };
    // Build data that has no iron markers → should get info alert
    const { state } = await import('../js/state.js');
    const origEntries = state.importedData.entries;
    state.importedData.entries = [{ date: '2025-01-10', markers: { 'biochemistry.glucose': 5.0 } }];
    const data2 = window.getActiveData();
    const alerts2 = window.detectCycleIronAlerts(mc2, data2);
    assert('Info alert when no iron panel + heavy flow', alerts2.some(a => a.severity === 'info'), `got ${JSON.stringify(alerts2.map(a=>a.severity))}`);
    state.importedData.entries = origEntries;
  }

  // ── Section 15: Period entry form has symptom tags ──
  console.log('Section 15: Period entry form symptoms');
  {
    const src = read('js/cycle.js');
    assert('Editor has mc-period-symptoms container', src.includes('mc-period-symptoms'));
    assert('Editor uses PERIOD_SYMPTOMS', src.includes('PERIOD_SYMPTOMS'));
    assert('Editor has ctx-tag for symptoms', src.includes('ctx-tag') && src.includes('data-value'));
  }

  // ── Section 16: Symptom tags display in period log ──
  console.log('Section 16: Symptom tags in period log');
  {
    const src = read('js/cycle.js');
    assert('Period log shows period-symptom-tag', src.includes('period-symptom-tag'));
    assert('Checks p.symptoms?.length', src.includes('p.symptoms') && src.includes('symptoms.length'));
  }

  // ── Section 17: CSS classes exist ──
  console.log('Section 17: CSS classes');
  {
    const css = read('styles.css');
    assert('.period-symptom-tag CSS exists', css.includes('.period-symptom-tag'));
    assert('.cycle-alert CSS exists', css.includes('.cycle-alert'));
    assert('.cycle-alert-perimenopause CSS exists', css.includes('.cycle-alert-perimenopause'));
    assert('.cycle-alert-critical CSS exists', css.includes('.cycle-alert-critical'));
    assert('.cycle-alert-warning CSS exists', css.includes('.cycle-alert-warning'));
    assert('.cycle-alert-info CSS exists', css.includes('.cycle-alert-info'));
    assert('.cycle-alert-icon CSS exists', css.includes('.cycle-alert-icon'));
    assert('.cycle-alert-detail CSS exists', css.includes('.cycle-alert-detail'));
  }

  // ── Section 18: Source inspection ──
  console.log('Section 18: Source inspection');
  {
    // charts.js
    const chartsSrc = read('js/charts.js');
    assert('phaseBandPlugin exported', chartsSrc.includes('export const phaseBandPlugin'));
    assert('Plugin has menstrual color', chartsSrc.includes('menstrual') && chartsSrc.includes('rgba(239, 68, 68'));
    assert('Plugin has follicular color', chartsSrc.includes('follicular') && chartsSrc.includes('rgba(59, 130, 246'));
    assert('Plugin has ovulatory color', chartsSrc.includes('ovulatory') && chartsSrc.includes('rgba(168, 85, 247'));
    assert('Plugin has luteal color', chartsSrc.includes('luteal') && chartsSrc.includes('rgba(245, 158, 11'));

    // category-page-view.js and marker-detail-modal.js pass phaseLabels
    const categoryPageViewSrc = read('js/category-page-view.js');
    const markerDetailSrc = read('js/marker-detail-modal.js');
    const phasePassCount = (categoryPageViewSrc.match(/phaseLabels/g) || []).length + (markerDetailSrc.match(/phaseLabels/g) || []).length;
    assert('category-page-view.js + marker-detail-modal.js pass phaseLabels to createLineChart', phasePassCount >= 4, `found ${phasePassCount} references`);

    // lab-context.js includes symptom + alert context (extracted from chat.js)
    const labCtxSrc = read('js/lab-context.js');
    assert('lab-context.js includes symptoms in periods', labCtxSrc.includes('p.symptoms'));
    assert('lab-context.js imports detectPerimenopausePattern', labCtxSrc.includes('detectPerimenopausePattern'));
    assert('lab-context.js imports detectCycleIronAlerts', labCtxSrc.includes('detectCycleIronAlerts'));
    assert('lab-context.js includes PERIMENOPAUSE ALERT', labCtxSrc.includes('PERIMENOPAUSE ALERT'));
    assert('lab-context.js includes IRON/FLOW ALERTS', labCtxSrc.includes('IRON/FLOW ALERTS'));

    // cycle.js imports
    const cycleSrc = read('js/cycle.js');
    assert('cycle.js imports PERIOD_SYMPTOMS', cycleSrc.includes("import") && cycleSrc.includes('PERIOD_SYMPTOMS'));
    assert('cycle.js imports linearRegression', cycleSrc.includes('linearRegression'));
    assert('cycle.js exports detectPerimenopausePattern', cycleSrc.includes('export function detectPerimenopausePattern'));
    assert('cycle.js exports detectCycleIronAlerts', cycleSrc.includes('export function detectCycleIronAlerts'));

    // Service worker cache version
    const swSrc = read('service-worker.js');
    assert('SW uses importScripts for version', swSrc.includes("importScripts('/version.js')"));
    assert('SW CACHE_NAME uses semver', swSrc.includes('`labcharts-v${self.APP_VERSION}`'));
  }

  // ── Section 19: addPeriodEntry collects symptoms ──
  console.log('Section 19: addPeriodEntry collects symptoms');
  {
    const src = read('js/cycle.js');
    assert('addPeriodEntry queries selected ctx-tags', src.includes("mc-period-symptoms") && src.includes('.ctx-tag.active'));
    assert('Period push includes symptoms', src.includes('symptoms, notes'));
  }

  // ── Section 20: data.js phaseLabels computation ──
  console.log('Section 20: data.js phaseLabels computation');
  {
    const src = read('js/data.js');
    assert('getActiveData computes data.phaseLabels', src.includes('data.phaseLabels = sortedDates.map'));
    assert('Uses _getCyclePhase for phaseLabels', src.includes('_getCyclePhase(d, mc)'));
  }

  // ── Summary ──
console.log('\n' + results.join('\n'));
console.log(`\nResults: ${pass} passed, ${fail} failed, ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
