#!/usr/bin/env node
// test-supplement-impact.js — Supplement-biomarker impact analysis tests
//
// Run: node tests/test-supplement-impact.js  (or via npm test)

import './_node-shim.js';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf-8');

let pass = 0, fail = 0;
function assert(name, condition, detail) {
  if (condition) { pass++; console.log(`  PASS: ${name}`); }
  else { fail++; console.log(`  FAIL: ${name}${detail ? ' — ' + detail : ''}`); }
}

console.log('=== Supplement Impact Tests ===\n');

const { computeSupplementImpact, computeAllImpacts, parseAmount, ingredientDailyTotal, effectiveTimesPerDay } = await import('../js/supplements.js');

  // ═══════════════════════════════════════
  // 1. computeSupplementImpact — basic case
  // ═══════════════════════════════════════
  console.log('%c 1. Basic Impact Computation ', 'font-weight:bold;color:#f59e0b');

  const supp1 = { name: 'Creatine', startDate: '2024-06-01', endDate: null };
  const dates1 = ['2024-03-15', '2024-04-15', '2024-05-15', '2024-07-15', '2024-08-15', '2024-09-15'];
  const values1 = [80, 85, 82, 92, 95, 93];

  const result1 = computeSupplementImpact(supp1, 'biochemistry.creatinine', 'Creatinine', 'µmol/L', values1, dates1, 62, 106);

  assert('Returns object', result1 !== null);
  assert('markerName correct', result1.markerName === 'Creatinine');
  assert('nBefore = 3', result1.nBefore === 3, `got ${result1.nBefore}`);
  assert('nAfter = 3', result1.nAfter === 3, `got ${result1.nAfter}`);
  assert('beforeMean ≈ 82.3', Math.abs(result1.beforeMean - 82.333) < 0.1, `got ${result1.beforeMean}`);
  assert('afterMean ≈ 93.3', Math.abs(result1.afterMean - 93.333) < 0.1, `got ${result1.afterMean}`);
  assert('pctChange ≈ 13.4', Math.abs(result1.pctChange - 13.36) < 0.5, `got ${result1.pctChange}`);
  assert('direction = up', result1.direction === 'up');
  assert('confidence = high (3+/3+)', result1.confidence === 'high');

  // ═══════════════════════════════════════
  // 2. No before data
  // ═══════════════════════════════════════
  console.log('%c 2. No Before Data ', 'font-weight:bold;color:#f59e0b');

  const supp2 = { name: 'VitD', startDate: '2024-01-01', endDate: null };
  const dates2 = ['2024-03-15', '2024-06-15'];
  const values2 = [75, 120];

  const result2 = computeSupplementImpact(supp2, 'vitamins.d', 'Vitamin D', 'nmol/L', values2, dates2, 75, 150);
  assert('Returns object with no before data', result2 !== null);
  assert('nBefore = 0', result2.nBefore === 0);
  assert('pctChange = null', result2.pctChange === null);
  assert('confidence = low', result2.confidence === 'low');

  // ═══════════════════════════════════════
  // 3. Ended supplement — only active window counts
  // ═══════════════════════════════════════
  console.log('%c 3. Ended Supplement ', 'font-weight:bold;color:#f59e0b');

  const supp3 = { name: 'Zinc', startDate: '2024-04-01', endDate: '2024-07-01' };
  const dates3 = ['2024-03-15', '2024-05-15', '2024-06-15', '2024-08-15'];
  const values3 = [10, 14, 15, 11];

  const result3 = computeSupplementImpact(supp3, 'electrolytes.zinc', 'Zinc', 'µmol/L', values3, dates3, 11, 23);
  assert('nBefore = 1 (only March)', result3.nBefore === 1);
  assert('nAfter = 2 (May + June, not August)', result3.nAfter === 2, `got ${result3.nAfter}`);
  assert('afterMean = 14.5', Math.abs(result3.afterMean - 14.5) < 0.01);

  // ═══════════════════════════════════════
  // 4. Null values skipped
  // ═══════════════════════════════════════
  console.log('%c 4. Null Values ', 'font-weight:bold;color:#f59e0b');

  const supp4 = { name: 'Mag', startDate: '2024-06-01', endDate: null };
  const dates4 = ['2024-03-15', '2024-04-15', '2024-07-15', '2024-08-15'];
  const values4 = [0.8, null, 0.9, null];

  const result4 = computeSupplementImpact(supp4, 'electrolytes.magnesium', 'Magnesium', 'mmol/L', values4, dates4, 0.7, 1.0);
  assert('nBefore = 1 (null skipped)', result4.nBefore === 1);
  assert('nAfter = 1 (null skipped)', result4.nAfter === 1);

  // ═══════════════════════════════════════
  // 5. No data at all
  // ═══════════════════════════════════════
  console.log('%c 5. No Data ', 'font-weight:bold;color:#f59e0b');

  const supp5 = { name: 'Empty', startDate: '2024-06-01', endDate: null };
  const result5 = computeSupplementImpact(supp5, 'x.y', 'X', 'U', [null, null], ['2024-03-15', '2024-07-15'], 0, 10);
  assert('Returns null for all-null values', result5 === null);

  // ═══════════════════════════════════════
  // 6. Confidence levels
  // ═══════════════════════════════════════
  console.log('%c 6. Confidence Levels ', 'font-weight:bold;color:#f59e0b');

  const suppC = { name: 'C', startDate: '2024-06-01', endDate: null };
  // 1 before, 1 after = low
  const resLow = computeSupplementImpact(suppC, 'x.y', 'X', 'U', [5, 10], ['2024-05-15', '2024-07-15'], 0, 20);
  assert('1/1 = low confidence', resLow.confidence === 'low');
  // 2 before, 2 after = moderate
  const resMod = computeSupplementImpact(suppC, 'x.y', 'X', 'U', [5, 6, 10, 11], ['2024-04-15', '2024-05-15', '2024-07-15', '2024-08-15'], 0, 20);
  assert('2/2 = moderate confidence', resMod.confidence === 'moderate');
  // 3 before, 3 after = high
  const resHigh = computeSupplementImpact(suppC, 'x.y', 'X', 'U', [5, 6, 7, 10, 11, 12], ['2024-03-15', '2024-04-15', '2024-05-15', '2024-07-15', '2024-08-15', '2024-09-15'], 0, 20);
  assert('3/3 = high confidence', resHigh.confidence === 'high');

  // ═══════════════════════════════════════
  // 7. computeAllImpacts
  // ═══════════════════════════════════════
  console.log('%c 7. computeAllImpacts ', 'font-weight:bold;color:#f59e0b');

  const mockData = {
    dates: ['2024-03-15', '2024-04-15', '2024-05-15', '2024-07-15', '2024-08-15', '2024-09-15'],
    categories: {
      biochemistry: {
        markers: {
          glucose: { name: 'Glucose', unit: 'mmol/L', values: [5.0, 5.1, 5.2, 5.0, 5.1, 5.0], refMin: 3.9, refMax: 5.8 },
          creatinine: { name: 'Creatinine', unit: 'µmol/L', values: [80, 85, 82, 92, 95, 93], refMin: 62, refMax: 106 }
        }
      }
    }
  };
  const suppAll = { name: 'Creatine', startDate: '2024-06-01', endDate: null };
  const allResults = computeAllImpacts(suppAll, mockData);
  assert('computeAllImpacts returns array', Array.isArray(allResults));
  assert('Filters out <1% changes', allResults.every(r => Math.abs(r.pctChange) >= 1));
  assert('Sorted by |pctChange| desc', allResults.length < 2 || Math.abs(allResults[0].pctChange) >= Math.abs(allResults[allResults.length - 1].pctChange));
  // Creatinine has ~13% change, glucose has ~1.6% change — creatinine should be first
  if (allResults.length > 0) {
    assert('Highest impact first (creatinine)', allResults[0].marker === 'biochemistry.creatinine', `got ${allResults[0].marker}`);
  }

  // ═══════════════════════════════════════
  // 8. Source code checks
  // ═══════════════════════════════════════
  console.log('%c 8. Source & UI Integration ', 'font-weight:bold;color:#f59e0b');

  const suppSrc = read('js/supplements.js');
  const impactSrc = read('js/supplement-impact.js');
  assert('renderSupplementImpact exists', impactSrc.includes('function renderSupplementImpact'));
  assert('Wired into openSupplementsEditor', suppSrc.includes('renderSupplementImpact(s,'));
  assert('Detects overlapping supplements', impactSrc.includes('getOverlappingSupplements'));
  assert('computeAllImpacts on window', suppSrc.includes('computeAllImpacts'));

  // AI-driven display (health dots pattern)
  assert('Uses callClaudeAPI', impactSrc.includes('callClaudeAPI'));
  assert('Uses hasAIProvider', impactSrc.includes('hasAIProvider'));
  assert('Per-supp fingerprint includes dosage+ingredients', impactSrc.includes('getSuppFingerprint') && impactSrc.includes('supp.dosage') && impactSrc.includes('supp.ingredients'));
  assert('Per-supp AI call (not whole batch)', impactSrc.includes('loadImpactsForSupps'));
  assert('Coalesces concurrent renders via debounce', impactSrc.includes('_pendingAnalyses') && impactSrc.includes('scheduleAnalyze'));
  assert('Deduplicates in-flight calls', impactSrc.includes('_batchPromise'));
  assert('Cache keyed by supp name with fp field', impactSrc.includes('cache[s.name]') && impactSrc.includes('fp: getSuppFingerprint'));
  assert('Fingerprint also includes timesPerDay', impactSrc.includes('i.timesPerDay'));
  assert('Ingredient row has ×/day input', suppSrc.includes('supp-ing-times'));
  assert('AI prompt uses computed total with supp-level fallback', impactSrc.includes('ingredientDailyTotal(ing, s)') && impactSrc.includes('effectiveTimesPerDay'));
  assert('Outer ×/day form field exists', suppSrc.includes('id="supp-times"'));
  assert('Row placeholder is just ×/day (no "inherit N" jargon)', suppSrc.includes('placeholder="×/day"'));
  assert('Outer label reads "Doses/day" (non-tech)', suppSrc.includes('<label>Doses/day</label>'));
  assert('Saves supp.timesPerDay when provided', suppSrc.includes('entry.timesPerDay = timesNum'));
  assert('lab-context uses computed total too', (read('js/lab-context.js')).includes('ingredientDailyTotal'));

  // ═══════════════════════════════════════
  // 9. parseAmount — number/unit extraction
  // ═══════════════════════════════════════
  console.log('%c 9. parseAmount ', 'font-weight:bold;color:#f59e0b');

  assert('Parses "890mg"', JSON.stringify(parseAmount('890mg')) === JSON.stringify({ value: 890, unit: 'mg' }));
  assert('Parses "500 IU" with space', JSON.stringify(parseAmount('500 IU')) === JSON.stringify({ value: 500, unit: 'IU' }));
  assert('Parses "25 mcg"', JSON.stringify(parseAmount('25 mcg')) === JSON.stringify({ value: 25, unit: 'mcg' }));
  assert('Parses "0.5mg" decimal', JSON.stringify(parseAmount('0.5mg')) === JSON.stringify({ value: 0.5, unit: 'mg' }));
  assert('Parses "1g"', JSON.stringify(parseAmount('1g')) === JSON.stringify({ value: 1, unit: 'g' }));
  assert('Parses "1 scoop" (value 1, unit scoop)', parseAmount('1 scoop')?.value === 1 && parseAmount('1 scoop')?.unit === 'scoop');
  assert('Returns null for empty', parseAmount('') === null);
  assert('Returns null for null input', parseAmount(null) === null);
  assert('Returns null for pure text', parseAmount('once daily') === null);
  assert('Returns null for "as needed"', parseAmount('as needed') === null);
  assert('Parses "5,4 mg" with comma decimal (European)', parseAmount('5,4 mg')?.value === 5.4 && parseAmount('5,4 mg')?.unit === 'mg');
  assert('Parses "13,8 mg"', parseAmount('13,8 mg')?.value === 13.8);

  // ═══════════════════════════════════════
  // 10. ingredientDailyTotal — amount × timesPerDay
  // ═══════════════════════════════════════
  console.log('%c 10. ingredientDailyTotal ', 'font-weight:bold;color:#f59e0b');

  const t1 = ingredientDailyTotal({ amount: '890mg', timesPerDay: 2 });
  assert('890mg × 2 = 1780mg', t1?.value === 1780 && t1.unit === 'mg', JSON.stringify(t1));
  const t2 = ingredientDailyTotal({ amount: '500 IU', timesPerDay: 1 });
  assert('500 IU × 1 = 500 IU', t2?.value === 500 && t2.unit === 'IU');
  const t3 = ingredientDailyTotal({ amount: '890mg', timesPerDay: 0.5 });
  assert('Fractional times (every other day): 890 × 0.5 = 445', t3?.value === 445);
  assert('No timesPerDay → null', ingredientDailyTotal({ amount: '890mg' }) === null);
  assert('"1 scoop" × 2/day = 2 scoop (permissive parse)', ingredientDailyTotal({ amount: '1 scoop', timesPerDay: 2 })?.value === 2);
  assert('Pure text amount → null', ingredientDailyTotal({ amount: 'as needed', timesPerDay: 2 }) === null);
  assert('No ingredient → null', ingredientDailyTotal(null) === null);

  // ═══════════════════════════════════════
  // 11. effectiveTimesPerDay — inheritance from supp-level default
  // ═══════════════════════════════════════
  console.log('%c 11. effectiveTimesPerDay (inheritance) ', 'font-weight:bold;color:#f59e0b');

  assert('Row override wins', effectiveTimesPerDay({ timesPerDay: 3 }, { timesPerDay: 1 }) === 3);
  assert('Falls back to supp default', effectiveTimesPerDay({}, { timesPerDay: 2 }) === 2);
  assert('Row 0 still counts as override', effectiveTimesPerDay({ timesPerDay: 0 }, { timesPerDay: 2 }) === 0);
  assert('No row + no supp → null', effectiveTimesPerDay({}, {}) === null);
  assert('Total inherits supp default for combo products', ingredientDailyTotal({ amount: '500mg' }, { timesPerDay: 2 })?.value === 1000);
  assert('Row override overrides supp default in total', ingredientDailyTotal({ amount: '500mg', timesPerDay: 3 }, { timesPerDay: 1 })?.value === 1500);
  assert('Uses health dot CSS classes', impactSrc.includes('ctx-health-dot'));
  assert('AI returns dot+summary JSON per supp', impactSrc.includes('"dot":"green|yellow|red|gray"'));
  assert('Shimmer while loading', impactSrc.includes('ctx-health-dot-shimmer'));
  assert('Falls back without AI', impactSrc.includes('Set up an AI provider'));

  // Focus card integration
  const focusCardSrc = read('js/focus-card.js');
  assert('Focus card uses computeAllImpacts', focusCardSrc.includes('computeAllImpacts'));

  // CSS
  const cssSrc = read('styles.css') + '\n' + read('css/context-profile.css');
  assert('Impact CSS exists', cssSrc.includes('.supp-impact-section'));
  assert('Impact summary CSS exists', cssSrc.includes('.supp-impact-summary'));
  assert('Summary color variants', cssSrc.includes('.supp-impact-summary-green'));
  const suppGapCss = (cssSrc.match(/\.supp-bar-gap\s*\{([\s\S]*?)\}/) || [null, ''])[1];
  assert('Supplement timeline off-period gaps stay visible on dark themes',
    suppGapCss &&
    suppGapCss.includes('color-mix(in srgb, var(--text-muted) 14%') &&
    suppGapCss.includes('opacity: 1') &&
    !suppGapCss.includes('opacity: 0.15'));

  // ═══════════════════════════════════════
  // Summary
  // ═══════════════════════════════════════
console.log(`\nResults: ${pass} passed, ${fail} failed, ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
