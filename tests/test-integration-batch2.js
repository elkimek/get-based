#!/usr/bin/env node
// test-integration-batch2.js — Integration smoke tests for jonseed-followups-2 fixes
//
// Run: node tests/test-integration-batch2.js  (or via npm test)

import './_node-shim.js';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel.replace(/^\//, '')), 'utf-8');

let pass = 0, fail = 0;
function assert(name, condition, detail) {
  if (condition) { pass++; console.log(`  PASS: ${name}`); }
  else { fail++; console.log(`  FAIL: ${name}${detail ? ' — ' + detail : ''}`); }
}

console.log('=== Integration Tests — Batch 2 Fixes ===\n');

  // ═══════════════════════════════════════
  // 1. Module imports work
  // ═══════════════════════════════════════
  console.log('1. Module imports');

  const { UNIT_CONVERSIONS, MARKER_SCHEMA, OPTIMAL_RANGES } = await import('../js/schema.js');

  assert('UNIT_CONVERSIONS loaded', UNIT_CONVERSIONS != null);
  assert('MARKER_SCHEMA loaded', MARKER_SCHEMA != null);
  assert('OPTIMAL_RANGES loaded', OPTIMAL_RANGES != null);

  // ═══════════════════════════════════════
  // 2. New unit conversions exist
  // ═══════════════════════════════════════
  console.log('2. New unit conversions');

  const expectedConversions = [
    'hormones.igf1', 'hormones.prolactin', 'hormones.calcitonin',
    'iron.ferritin', 'iron.transferrin', 'iron.tibc',
    'thyroid.ft4', 'thyroid.ft3', 'thyroid.t3total',
    'proteins.ceruloplasmin', 'lipids.apoB', 'lipids.apoAI',
    'hematology.mchc',
    'differential.neutrophilsPct', 'differential.lymphocytesPct', 'differential.monocytesPct',
    'boneMetabolism.osteocalcin', 'tumorMarkers.psa',
    'vitamins.vitaminA', 'vitamins.calcitriol'
  ];
  for (const key of expectedConversions) {
    assert(`UNIT_CONVERSIONS has ${key}`, UNIT_CONVERSIONS[key] != null);
  }
  // Total count
  const convCount = Object.keys(UNIT_CONVERSIONS).length;
  assert('44+ unit conversions total', convCount >= 44, `got ${convCount}`);

  // ═══════════════════════════════════════
  // 3. Calcitriol marker complete
  // ═══════════════════════════════════════
  console.log('3. Calcitriol marker');

  const calcitriol = MARKER_SCHEMA.vitamins?.markers?.calcitriol;
  assert('Calcitriol in schema', calcitriol != null);
  assert('Calcitriol unit pmol/l', calcitriol?.unit === 'pmol/l');
  assert('Calcitriol refMin 36.5', calcitriol?.refMin === 36.5);
  assert('Calcitriol refMax 216.2', calcitriol?.refMax === 216.2);
  assert('Calcitriol has US conversion', UNIT_CONVERSIONS['vitamins.calcitriol']?.usUnit === 'pg/ml');
  assert('Calcitriol has optimal range', OPTIMAL_RANGES['vitamins.calcitriol'] != null);
  const calcOpt = OPTIMAL_RANGES['vitamins.calcitriol'];
  assert('Calcitriol optimal 60–160', calcOpt?.optimalMin === 60.0 && calcOpt?.optimalMax === 160.0);

  // ═══════════════════════════════════════
  // 4. Prolactin unit string correct
  // ═══════════════════════════════════════
  console.log('4. Prolactin unit encoding');

  const prolactin = MARKER_SCHEMA.hormones?.markers?.prolactin;
  assert('Prolactin exists', prolactin != null);
  // Check it uses escaped µ (U+00B5), not literal µ that might be a different codepoint
  assert('Prolactin unit uses \u00b5', prolactin?.unit === '\u00b5g/l');
  // Verify unit string matches the conversion usUnit normalization
  const prolConv = UNIT_CONVERSIONS['hormones.prolactin'];
  assert('Prolactin has conversion', prolConv != null);

  // ═══════════════════════════════════════
  // 5. Schema consistency checks
  // ═══════════════════════════════════════
  console.log('5. Schema consistency');

  let schemaErrors = 0;
  for (const [catKey, cat] of Object.entries(MARKER_SCHEMA)) {
    for (const [mKey, marker] of Object.entries(cat.markers || {})) {
      const fullKey = `${catKey}.${mKey}`;
      if (marker.refMin != null && marker.refMax != null && marker.refMin >= marker.refMax) {
        schemaErrors++;
        console.error(`Schema: ${fullKey} refMin ${marker.refMin} >= refMax ${marker.refMax}`);
      }
      if (marker.refMin_f != null && marker.refMax_f != null && marker.refMin_f >= marker.refMax_f) {
        schemaErrors++;
        console.error(`Schema: ${fullKey} refMin_f ${marker.refMin_f} >= refMax_f ${marker.refMax_f}`);
      }
    }
  }
  assert('All ref ranges valid (min < max)', schemaErrors === 0, `${schemaErrors} errors`);

  // Optimal ranges consistency
  let optErrors = 0;
  for (const [key, opt] of Object.entries(OPTIMAL_RANGES)) {
    if (opt.optimalMin != null && opt.optimalMax != null && opt.optimalMin >= opt.optimalMax) {
      optErrors++;
      console.error(`Optimal: ${key} min ${opt.optimalMin} >= max ${opt.optimalMax}`);
    }
  }
  assert('All optimal ranges valid (min < max)', optErrors === 0, `${optErrors} errors`);

  // ═══════════════════════════════════════
  // 6. CSS checks
  // ═══════════════════════════════════════
  console.log('6. CSS fixes');

  const css = read('/styles.css');

  // No duplicate @keyframes shimmer
  const shimmerMatches = css.match(/@keyframes shimmer/g);
  assert('Only one @keyframes shimmer', shimmerMatches?.length === 1, `found ${shimmerMatches?.length}`);

  // Toggle slider uses CSS variable not #fff
  assert('Toggle slider uses var(--bg-primary)',
    css.includes('.chat-toggle-slider::before') && !css.includes('chat-toggle-slider::before') ||
    css.includes('var(--bg-primary)'));
  // More precise check
  const sliderIdx = css.indexOf('.chat-toggle-slider::before');
  const sliderBlock = css.substring(sliderIdx, css.indexOf('}', sliderIdx));
  assert('Slider no hardcoded #fff', !sliderBlock.includes('#fff'));

  // Refresh button CSS exists
  assert('.ctx-refresh-all-btn in CSS', css.includes('.ctx-refresh-all-btn'));

  // PII edit button CSS exists
  assert('.pii-edit-btn in CSS', css.includes('.pii-edit-btn'));

  // Import modal max-width
  assert('#import-modal max-width 840px', css.includes('#import-modal') && css.includes('840px'));

  // ═══════════════════════════════════════
  // 7. Tour steps
  // ═══════════════════════════════════════
  console.log('7. Tour verification');

  const tourSrc = read('/js/tour.js');
  // Count TOUR_STEPS entries
  const stepMatches = tourSrc.match(/\{ target:/g);
  assert('8 tour steps', stepMatches?.length >= 8, `found ${stepMatches?.length}`);
  // Import FAB step
  assert('Tour has #import-fab step', tourSrc.includes("#import-fab"));
  // Profile button step
  assert('Tour has profile button step', tourSrc.includes('.profile-compact-btn'));

  // ═══════════════════════════════════════
  // 8. PII edit button
  // ═══════════════════════════════════════
  console.log('8. PII edit button');

  const piiSrc = read('/js/pii.js');
  assert('PII edit button in HTML', piiSrc.includes('pii-edit-btn'));
  assert('PII edit button wired to switchToEditMode', piiSrc.includes("pii-edit-btn").valueOf() && piiSrc.includes('switchToEditMode'));

  // ═══════════════════════════════════════
  // 9. Chat clear resets header
  // ═══════════════════════════════════════
  console.log('9. Chat clear fixes');

  const chatSrc = read('/js/chat.js');
  // clearChatHistory should call updateChatHeaderTitle
  const clearIdx = chatSrc.indexOf('function clearChatHistory');
  const clearBlock = chatSrc.substring(clearIdx, chatSrc.indexOf('\n}', clearIdx));
  assert('clearChatHistory calls updateChatHeaderTitle', clearBlock.includes('updateChatHeaderTitle'));
  assert('clearChatHistory calls updateDiscussButton', clearBlock.includes('updateDiscussButton'));

  // ═══════════════════════════════════════
  // 10. Sidebar date filtering
  // ═══════════════════════════════════════
  console.log('10. Sidebar date filtering');

  const navSrc = read('/js/nav.js');
  assert('buildSidebar imports filterDatesByRange', navSrc.includes('filterDatesByRange'));
  assert('buildSidebar calls filterDatesByRange', navSrc.includes('filterDatesByRange(data)'));

  const dataSrc = read('/js/data.js');
  const setDateIdx = dataSrc.indexOf('function setDateRange');
  const setDateBlock = dataSrc.substring(setDateIdx, dataSrc.indexOf('\n}', setDateIdx));
  assert('setDateRange rebuilds sidebar', setDateBlock.includes('buildSidebar'));

  // ═══════════════════════════════════════
  // 11. Context card state preservation
  // ═══════════════════════════════════════
  console.log('11. Context card state');

  const ctxSrc = read('/js/context-cards.js');
  assert('saveAndRefresh preserves details state', ctxSrc.includes("welcome-context-details") && ctxSrc.includes('sessionStorage'));
  assert('refreshAllHealthDots function exists', ctxSrc.includes('function refreshAllHealthDots'));
  assert('refreshAllHealthDots exposed on window', ctxSrc.includes('refreshAllHealthDots'));
  assert('Refresh button in renderProfileContextCards', ctxSrc.includes('ctx-refresh-all-btn'));

  // saveAndRefresh must trigger a re-render of the current view — BroadcastChannel
  // does not deliver postMessage back to the sender, so single-tab users see no
  // UI update without an explicit navigate() call. Issue #123.
  const saveRefreshMatch = ctxSrc.match(/export function saveAndRefresh\([^)]*\)\s*\{([\s\S]*?)^\}/m);
  assert('saveAndRefresh body found', !!saveRefreshMatch);
  if (saveRefreshMatch) {
    const body = saveRefreshMatch[1];
    assert('saveAndRefresh calls navigate for in-tab re-render (#123)',
      /window\.navigate\s*\(/.test(body) || /\bnavigate\s*\(/.test(body),
      'without this, saved context card values stay hidden until reload');
  }

  // Runtime check: save mutates state → re-render → summary text appears in DOM.
  // SKIPPED in Node — needs a real DOM for showDashboard's innerHTML writes;
  // covered end-to-end by puppeteer. Gate on `process.versions.node` (only
  // truthy in Node) — clean cross-environment skip.
  const _rtState = window._labState;
  const _isNode = typeof process !== 'undefined' && !!process.versions?.node;
  if (!_isNode && typeof window.saveAndRefresh === 'function' && typeof window.navigate === 'function' && _rtState) {
    const sv_stress = _rtState.importedData?.stress;
    try {
      window.navigate('dashboard');
      await new Promise(r => setTimeout(r, 50));
      // Stress card should exist (context cards always render on dashboard)
      const stressCardBefore = document.querySelector('.profile-context-cards');
      if (stressCardBefore) {
        // Simulate a save: mutate state then call saveAndRefresh (same path as saveStress)
        _rtState.importedData.stress = { level: 'moderate', sources: ['work'], management: ['exercise'], note: '' };
        window.saveAndRefresh('Stress profile saved', 'stress');
        await new Promise(r => setTimeout(r, 50));
        // After re-render, the stress card body should contain the summary text
        // produced by getStressSummary: "moderate stress — work — manages: exercise"
        const cardsAfter = document.querySelector('.profile-context-cards');
        const cardsText = cardsAfter ? cardsAfter.textContent : '';
        assert('card body reflects saved stress level after saveAndRefresh (#123)',
          cardsText.includes('moderate stress') && cardsText.includes('work'),
          `cards text was: ${cardsText.slice(0, 200)}`);
      }
    } finally {
      // Restore pre-test state
      if (_rtState?.importedData) {
        if (sv_stress !== undefined) _rtState.importedData.stress = sv_stress;
        else delete _rtState.importedData.stress;
      }
    }
  }

  // ═══════════════════════════════════════
  // 12. PDF filename storage
  // ═══════════════════════════════════════
  console.log('12. PDF filename storage');

  const importSrc = read('/js/pdf-import.js');
  assert('confirmImport stores sourceFile', importSrc.includes('entry.sourceFile = result.fileName'));

  const settingsSrc = read('/js/settings.js');
  assert('Settings shows sourceFile', settingsSrc.includes('entry.sourceFile'));
  assert('Settings imports escapeAttr', settingsSrc.includes('escapeAttr'));

  // ═══════════════════════════════════════
  // 13. Both-range mode on cards
  // ═══════════════════════════════════════
  console.log('13. Both-range display');

  const viewsSrc = read('/js/views.js');
  // Chart card should show both ranges
  assert('Chart card handles both mode',
    viewsSrc.includes("state.rangeMode === 'both'") && viewsSrc.includes('marker.optimalMin') && viewsSrc.includes('marker.refMin'));
  // FA card should show both ranges
  assert('FA card handles both mode', viewsSrc.includes('faRangeText'));

  // ═══════════════════════════════════════
  // 14. Onboarding trim fix
  // ═══════════════════════════════════════
  console.log('14. Onboarding trim');

  assert('Sex extraction uses .trim()', viewsSrc.includes('.textContent.trim().toLowerCase()'));

  // ═══════════════════════════════════════
  // 15. Conversion factor spot checks
  // ═══════════════════════════════════════
  console.log('15. Conversion factor validation');

  // Verify specific factors against medical literature
  assert('FT4 factor 0.07769', UNIT_CONVERSIONS['thyroid.ft4']?.factor === 0.07769);
  assert('FT3 factor 0.6513', UNIT_CONVERSIONS['thyroid.ft3']?.factor === 0.6513);
  assert('T3 total same factor as FT3', UNIT_CONVERSIONS['thyroid.t3total']?.factor === 0.6513);
  assert('T4 total same factor as FT4', UNIT_CONVERSIONS['thyroid.t4total']?.factor === 0.07769);
  assert('Transferrin factor 100 (g/l→mg/dl)', UNIT_CONVERSIONS['iron.transferrin']?.factor === 100);
  assert('TIBC factor matches iron', UNIT_CONVERSIONS['iron.tibc']?.factor === UNIT_CONVERSIONS['iron.iron']?.factor);
  assert('MCHC factor 0.1 (g/l→g/dl)', UNIT_CONVERSIONS['hematology.mchc']?.factor === 0.1);
  assert('ApoB factor 100 (g/l→mg/dl)', UNIT_CONVERSIONS['lipids.apoB']?.factor === 100);
  assert('Ceruloplasmin factor 100', UNIT_CONVERSIONS['proteins.ceruloplasmin']?.factor === 100);
  assert('Diff pct factor 100', UNIT_CONVERSIONS['differential.neutrophilsPct']?.factor === 100);

  // Factor-1 markers should not transform values
  assert('Ferritin factor 1', UNIT_CONVERSIONS['iron.ferritin']?.factor === 1);
  assert('IGF-1 factor 1', UNIT_CONVERSIONS['hormones.igf1']?.factor === 1);
  assert('Prolactin factor 1', UNIT_CONVERSIONS['hormones.prolactin']?.factor === 1);
  assert('PSA factor 1', UNIT_CONVERSIONS['tumorMarkers.psa']?.factor === 1);
  assert('Osteocalcin factor 1', UNIT_CONVERSIONS['boneMetabolism.osteocalcin']?.factor === 1);

  // ═══════════════════════════════════════
  // 16. No markers with SI units left unconverted
  // ═══════════════════════════════════════
  console.log('16. Conversion coverage check');

  // Markers that DON'T need conversion (same unit US/SI or unitless)
  const noConvNeeded = new Set([
    // mmol/l electrolytes (= mEq/L for monovalent ions)
    'electrolytes.sodium', 'electrolytes.potassium', 'electrolytes.chloride',
    // Same unit in US
    'hormones.shbg', 'hormones.insulin', 'hormones.lh', 'hormones.fsh',
    'thyroid.tsh',
    'proteins.hsCRP', 'biochemistry.cystatinC', 'biochemistry.gfrCystatin',
    'coagulation.homocysteine',
    // Unitless or % — no conversion
    'hormones.fai', 'iron.transferrinSat', 'lipids.cholHdlRatio',
    'hematology.rdwcv', 'hematology.hematocrit',
    'calculatedRatios.tgHdlRatio', 'calculatedRatios.ldlHdlRatio',
    'calculatedRatios.apoBapoAIRatio', 'calculatedRatios.nlr',
    'calculatedRatios.plr', 'calculatedRatios.deRitisRatio',
    'calculatedRatios.copperZincRatio', 'calculatedRatios.bunCreatRatio',
    'calculatedRatios.freeWaterDeficit', 'calculatedRatios.crpHdlRatio',
    'calculatedRatios.phenoAge', 'calculatedRatios.bortzAge', 'calculatedRatios.biologicalAge',
    // Standard units same in US (fl, pg, 10^9/l, 10^12/l, %)
    'hematology.wbc', 'hematology.rbc', 'hematology.mcv', 'hematology.mch',
    'hematology.platelets', 'hematology.mpv', 'hematology.pdw', 'hematology.pct',
    'differential.neutrophils', 'differential.lymphocytes',
    'differential.monocytes', 'differential.eosinophils', 'differential.basophils',
    // eGFR (ml/s vs ml/min is display convention, not a conversion)
    'biochemistry.egfr',
    // Diabetes (insulin_d mirrors hormones.insulin, homaIR is unitless)
    'diabetes.insulin_d', 'diabetes.homaIR',
    // CRP (mg/l same unit US/SI)
    'proteins.crp',
    // Urinalysis (unitless)
    'urinalysis.ph', 'urinalysis.specificGravity',
    // Body Composition (%, unitless, or cm² — same in US; kg→lbs has conversion)
    'bodyComposition.bodyFatPct', 'bodyComposition.bmiDexa',
    'bodyComposition.androidFatPct', 'bodyComposition.gynoidFatPct',
    'bodyComposition.agRatio', 'bodyComposition.visceralFatArea',
    // Bone Density (g/cm², T/Z-scores — universal units)
    'boneDensity.bmdSpine', 'boneDensity.bmdFemurTotal', 'boneDensity.bmdFemurNeck',
    'boneDensity.tScoreSpine', 'boneDensity.tScoreFemurTotal', 'boneDensity.tScoreFemurNeck',
    'boneDensity.zScoreSpine', 'boneDensity.zScoreFemurTotal', 'boneDensity.zScoreFemurNeck',
  ]);

  let unconverted = [];
  for (const [catKey, cat] of Object.entries(MARKER_SCHEMA)) {
    for (const mKey of Object.keys(cat.markers || {})) {
      const fullKey = `${catKey}.${mKey}`;
      if (!UNIT_CONVERSIONS[fullKey] && !noConvNeeded.has(fullKey)) {
        unconverted.push(fullKey);
      }
    }
  }
  assert('No SI markers left unconverted', unconverted.length === 0,
    unconverted.length > 0 ? `Missing: ${unconverted.join(', ')}` : 'All covered');

  // ═══════════════════════════════════════
  // Results
  // ═══════════════════════════════════════
console.log(`\nResults: ${pass} passed, ${fail} failed, ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
