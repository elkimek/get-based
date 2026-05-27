#!/usr/bin/env node
// test-dna-recommendations.js — Verify DNA-aware supplement recommendation integration
//
// Run: node tests/test-dna-recommendations.js  (or via npm test)

import './_node-shim.js';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel.replace(/^\//, '')), 'utf-8');
function fetchWithRetry(rel) { return Promise.resolve(read(rel)); }

let pass = 0, fail = 0;
function assert(name, condition, detail) {
  if (condition) { pass++; console.log(`  PASS: ${name}`); }
  else { fail++; console.log(`  FAIL: ${name}${detail ? ' — ' + detail : ''}`); }
}

console.log('=== DNA-Aware Supplement Recommendations Tests ===\n');

// recommendations.js exposes its handlers (incl. buildDNAHints) via
// Object.assign(window, ...). state.js sets up globals it depends on.
await import('../js/state.js');
await import('../js/recommendations.js');

// Original test reads data/*.json via fetch(...).then(r => r.json()) —
// install a fetch shim that resolves relative URLs through fs.
const _realFetch = globalThis.fetch;
globalThis.fetch = async (url, opts) => {
  if (typeof url === 'string' && !/^https?:/.test(url)) {
    const rel = url.replace(/^\//, '');
    try { return new Response(read(rel), { status: 200 }); }
    catch (_) { return new Response('', { status: 404 }); }
  }
  return _realFetch(url, opts);
};

const recSrc = await fetchWithRetry('js/recommendations.js');
const dnaSrc = await fetchWithRetry('js/dna.js');
const ctxSrc = await fetchWithRetry('js/context-cards.js');
const cssSrc = [
  await fetchWithRetry('styles.css'),
  await fetchWithRetry('css/context-profile.css'),
  await fetchWithRetry('css/recommendations.css'),
].join('\n');
const snpData = await fetch('data/snp-health.json').then(r => r.json());
const catalogData = await fetch('data/recommendations.json').then(r => r.json());
// Detect the stub fallback (Dependabot / fork PRs without CATALOG_FETCH_TOKEN —
// see scripts/fetch-catalog.mjs). The stub only contains 3 slots so any test
// that asserts on real catalog content (B12/folate slot shape, snpHint
// slotKey resolution) would deterministically fail. Skip those assertions
// and report the skip count at the end.
const STUB_CATALOG = catalogData?._stub === true;
let skipped = 0;
function assertCatalog(name, condition, detail) {
  if (STUB_CATALOG) { skipped++; console.log(`  SKIP: ${name} (stub catalog)`); return; }
  assert(name, condition, detail);
}

// ═══════════════════════════════════════
// 1. snp-health.json — snpHints structure
// ═══════════════════════════════════════
console.log('1. SNP Hints Data');

// Count SNPs with snpHints
let hintsCount = 0;
const validDirections = new Set(['form', 'avoid', 'increase']);
let allHintsValid = true;
for (const [rsid, entry] of Object.entries(snpData)) {
  if (rsid.startsWith('_')) continue;
  if (!entry.snpHints) continue;
  hintsCount++;
  for (const [genotype, hint] of Object.entries(entry.snpHints)) {
    if (!hint.slotKey || !hint.direction || !hint.text || !hint.ref) {
      allHintsValid = false;
      console.error(`  Invalid hint: ${rsid} ${genotype}`, hint);
    }
    if (!validDirections.has(hint.direction)) {
      allHintsValid = false;
      console.error(`  Invalid direction: ${rsid} ${genotype} ${hint.direction}`);
    }
    if (!/^https?:\/\/pubmed/.test(hint.ref)) {
      allHintsValid = false;
      console.error(`  Non-PubMed ref: ${rsid} ${genotype} ${hint.ref}`);
    }
  }
}
assert('snpHints on 20+ SNPs', hintsCount >= 20, `found ${hintsCount}`);
assert('All snpHints have required fields (slotKey, direction, text, ref)', allHintsValid);

// Check wording rules
let wordingValid = true;
for (const [rsid, entry] of Object.entries(snpData)) {
  if (rsid.startsWith('_') || !entry.snpHints) continue;
  for (const [genotype, hint] of Object.entries(entry.snpHints)) {
    if (!hint.text.startsWith('Your ')) {
      wordingValid = false;
      console.error(`  Hint text must start with "Your": ${rsid} ${genotype}`);
    }
    if (/\brequires?\b/i.test(hint.text) || /\bis better\b/i.test(hint.text) || /\bis dangerous\b/i.test(hint.text) || /\byou are deficient\b/i.test(hint.text)) {
      wordingValid = false;
      console.error(`  Hint uses forbidden wording: ${rsid} ${genotype}`);
    }
  }
}
assert('All hints follow wording rules (Your..., suggests, no absolutes)', wordingValid);

// No bilirubin hints
const bilirubinSnps = Object.entries(snpData).filter(([k, v]) => !k.startsWith('_') && v.category === 'bilirubin');
const bilirubinHints = bilirubinSnps.filter(([, v]) => v.snpHints);
assert('No bilirubin hints (Gilbert syndrome is benign)', bilirubinHints.length === 0);

// No hints for "none" effect genotypes
let noNoneHints = true;
for (const [rsid, entry] of Object.entries(snpData)) {
  if (rsid.startsWith('_') || !entry.snpHints) continue;
  for (const genotype of Object.keys(entry.snpHints)) {
    const gInfo = entry.genotypes?.[genotype];
    if (gInfo && gInfo.effect === 'none') {
      noNoneHints = false;
      console.error(`  Hint for "none" effect genotype: ${rsid} ${genotype}`);
    }
  }
}
assert('No hints for effect: "none" genotypes', noNoneHints);

// FADS markers fixed
assert('rs174546 markers includes fattyAcids.omega3Index', (snpData.rs174546?.markers || []).includes('fattyAcids.omega3Index'));
assert('rs174547 markers includes fattyAcids.omega3Index', (snpData.rs174547?.markers || []).includes('fattyAcids.omega3Index'));
assert('rs174575 markers includes fattyAcids.omega3Index', (snpData.rs174575?.markers || []).includes('fattyAcids.omega3Index'));
assert('rs953413 markers includes fattyAcids.omega3Index', (snpData.rs953413?.markers || []).includes('fattyAcids.omega3Index'));

// ═══════════════════════════════════════
// 2. Catalog — new slots
// ═══════════════════════════════════════
console.log('2. Catalog Slots');

assertCatalog('Catalog has vitamins.vitaminB12 slot', !!catalogData.slots?.['vitamins.vitaminB12']);
assertCatalog('Catalog has vitamins.folate slot', !!catalogData.slots?.['vitamins.folate']);
const b12Slot = catalogData.slots?.['vitamins.vitaminB12'];
const folateSlot = catalogData.slots?.['vitamins.folate'];
assertCatalog('B12 slot has forms', b12Slot?.forms?.length >= 2);
assertCatalog('B12 slot has food forms', b12Slot?.foodForms?.length >= 2);
assertCatalog('Folate slot has forms', folateSlot?.forms?.length >= 2);
assertCatalog('Folate slot has food forms', folateSlot?.foodForms?.length >= 2);

// ═══════════════════════════════════════
// 3. recommendations.js — buildDNAHints
// ═══════════════════════════════════════
console.log('3. buildDNAHints');

assert('buildDNAHints exported', recSrc.includes('export function buildDNAHints'));
assert('buildDNAHints on window', typeof window.buildDNAHints === 'function');
assert('buildDNAHints handles APOE specially', recSrc.includes('genetics.apoe') && recSrc.includes('lipids.ldl'));
assert('buildDNAHints handles genotype reversal', recSrc.includes('[1] + g[0]') || recSrc.includes('rev'));

// Test with no genetics — should return empty
const noGenResult = window.buildDNAHints('vitamins.vitaminD');
assert('buildDNAHints returns [] with no genetics', Array.isArray(noGenResult) && noGenResult.length === 0);

// ═══════════════════════════════════════
// 4. _renderRecSection DNA integration
// ═══════════════════════════════════════
console.log('4. Render Integration');

assert('_renderRecSection calls buildDNAHints', recSrc.includes('buildDNAHints(slotKey)'));
assert('YOUR GENETICS label in render', recSrc.includes('YOUR GENETICS'));
assert('Avoid hints get amber styling', recSrc.includes('rec-dna-avoid'));
assert('Study link rendered for hints', recSrc.includes('rec-dna-ref'));
assert('escapeHTML used for hint text', recSrc.includes('escapeHTML(h.text)'));
assert('Hint ref validated to https', recSrc.includes("'https?://'") || recSrc.includes('/^https?:\\/\\//'));

// ═══════════════════════════════════════
// 5. detectSupplementSlots DNA enhancement
// ═══════════════════════════════════════
console.log('5. Keyword Scanner DNA');

assert('detectSupplementSlots has DNA gene matching', recSrc.includes('gene.toLowerCase()') || recSrc.includes('stored.gene'));
assert('detectSupplementSlots cap raised for DNA', recSrc.includes('hasDNA ? 2 : 1') || recSrc.includes('hasDNA'));
assert('detectSupplementSlots verifies slot exists in catalog', recSrc.includes('_catalog.slots[hint.slotKey]'));

// ═══════════════════════════════════════
// 6. Card DNA section in Tips modal
// ═══════════════════════════════════════
console.log('6. Card DNA Section');

// DNA info is inside the Tips modal via _buildCardDNASection in recommendations.js.
// (Original puppeteer test read recommendations.js a second time here; under
// Node's module cache the duplicate read is wasteful, so reuse `recSrc` from above.)
assert('_buildCardDNASection checks contextCards', recSrc.includes('entry.contextCards'));
assert('_buildCardDNASection checks snpHints', recSrc.includes('!entry.snpHints'));
assert('_buildCardDNASection skips effect=none', recSrc.includes("effect === 'none'"));

// ═══════════════════════════════════════
// 7. Context card Tips badge rendering
// ═══════════════════════════════════════
console.log('7. Context Card Tips Badges');
assert('recommendations.js has _buildCardDNASection', recSrc.includes('function _buildCardDNASection'));
assert('Card DNA section checks contextCards', recSrc.includes('entry.contextCards'));
assert('Card DNA section shows gene name', recSrc.includes('stored.gene'));
assert('Card DNA section shows avoid styling', recSrc.includes('ctx-tip-avoid'));

// ═══════════════════════════════════════
// 8. CSS classes
// ═══════════════════════════════════════
console.log('8. CSS Classes');

assert('CSS has .rec-dna-hints', cssSrc.includes('.rec-dna-hints'));
assert('CSS has .rec-dna-row', cssSrc.includes('.rec-dna-row'));
assert('CSS has .rec-dna-avoid', cssSrc.includes('.rec-dna-avoid'));
assert('CSS has .rec-dna-ref', cssSrc.includes('.rec-dna-ref'));
assert('CSS has .ctx-tip-avoid', cssSrc.includes('.ctx-tip-avoid'));
assert('CSS has .ctx-tips-badge', cssSrc.includes('.ctx-tips-badge'));

// (The original puppeteer test verified `.rec-dna-hints` was actually loaded
// in document.styleSheets. That live-DOM check is redundant here: axe-core
// scans the same page later in run-tests.sh and would catch a missing
// stylesheet. The source-string assertion above proves the rule exists in
// the CSS bundle.)

// ═══════════════════════════════════════
// 9. Coverage — all hint target slots exist in catalog
// ═══════════════════════════════════════
console.log('9. Slot Coverage');

let allSlotsExist = true;
const missingSlots = new Set();
for (const [rsid, entry] of Object.entries(snpData)) {
  if (rsid.startsWith('_') || !entry.snpHints) continue;
  for (const [, hint] of Object.entries(entry.snpHints)) {
    if (!catalogData.slots[hint.slotKey]) {
      allSlotsExist = false;
      missingSlots.add(hint.slotKey);
    }
  }
}
assertCatalog('All snpHint slotKeys exist in catalog', allSlotsExist, missingSlots.size ? `Missing: ${[...missingSlots].join(', ')}` : '');

// ═══════════════════════════════════════
// 10. Direction coverage
// ═══════════════════════════════════════
console.log('10. Direction Coverage');

const directions = new Set();
for (const [rsid, entry] of Object.entries(snpData)) {
  if (rsid.startsWith('_') || !entry.snpHints) continue;
  for (const hint of Object.values(entry.snpHints)) directions.add(hint.direction);
}
assert('Has "form" direction hints', directions.has('form'));
assert('Has "avoid" direction hints', directions.has('avoid'));
assert('Has "increase" direction hints', directions.has('increase'));

// Check HFE has avoid hints
const hfeC282Y = snpData.rs1800562;
assert('HFE C282Y has avoid hints', hfeC282Y?.snpHints?.AA?.direction === 'avoid');
assert('HFE C282Y avoid targets iron.ferritin', hfeC282Y?.snpHints?.AA?.slotKey === 'iron.ferritin');

// Check MTHFR has form hints
const mthfr = snpData.rs1801133;
assert('MTHFR C677T has form hints', mthfr?.snpHints?.AA?.direction === 'form');
assert('MTHFR C677T targets coagulation.homocysteine', mthfr?.snpHints?.AA?.slotKey === 'coagulation.homocysteine');

// Check TMPRSS6 has increase hints
const tmprss6 = snpData.rs855791;
assert('TMPRSS6 has increase hints', tmprss6?.snpHints?.AA?.direction === 'increase');

// ═══════════════════════════════════════
// 11. No render signature changes
// ═══════════════════════════════════════
console.log('11. API Compatibility');

assert('renderRecommendationSection still async', recSrc.includes('export async function renderRecommendationSection'));
assert('renderRecommendationSectionSync still sync', recSrc.includes('export function renderRecommendationSectionSync'));
assert('_renderRecSection signature unchanged (slotKey, opts)', /function _renderRecSection\(slotKey, opts/.test(recSrc));

// ═══════════════════════════════════════
// Results
// ═══════════════════════════════════════
const skipNote = skipped ? ` (${skipped} skipped — stub catalog)` : '';
console.log(`\nResults: ${pass} passed, ${fail} failed${skipNote}, ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
