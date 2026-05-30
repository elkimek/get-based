#!/usr/bin/env node
// test-biostarks-adapter.js — BioStarks adapter: registration, detection, markers, normalization
//
// Static source inspection only — fs.readFileSync instead of HTTP fetch.
//
// Run: node tests/test-biostarks-adapter.js  (or via npm test)

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

console.log('=== BioStarks Adapter Tests ===\n');

const adaptersSrc = read('js/adapters.js');
const pdfImportSrc = read('js/pdf-import.js');
const normalizationSrc = read('js/pdf-import-marker-normalization.js');

  // ═══════════════════════════════════════
  // 1. Adapter Registration
  // ═══════════════════════════════════════
  console.log('%c 1. Adapter Registration ', 'font-weight:bold;color:#f59e0b');

  assert('Adapter id defined', adaptersSrc.includes("id: 'biostarks'"));
  assert('testTypes includes biostarks', adaptersSrc.includes("testTypes: ['biostarks']"));
  assert('Has detect function', adaptersSrc.includes('_detectBiostarks'));
  assert('Has normalize function', adaptersSrc.includes('_normalizeBiostarks'));

  // ═══════════════════════════════════════
  // 2. Detection Patterns
  // ═══════════════════════════════════════
  console.log('%c 2. Detection Patterns ', 'font-weight:bold;color:#f59e0b');

  assert('Detects "biostarks" pattern', adaptersSrc.includes("'biostarks'") && adaptersSrc.includes('BIOSTARKS_PATTERNS'));
  assert('Detects "bio starks" variant', adaptersSrc.includes("'bio starks'"));
  assert('Detects "bio-starks" variant', adaptersSrc.includes("'bio-starks'"));
  assert('Returns prefix biostarks', adaptersSrc.includes("prefix: 'biostarks'"));
  assert('Returns label BioStarks', adaptersSrc.includes("label: 'BioStarks'"));

  // ═══════════════════════════════════════
  // 3. Marker Definitions (23 total)
  // ═══════════════════════════════════════
  console.log('%c 3. Marker Definitions ', 'font-weight:bold;color:#f59e0b');

  // Count BioStarks-specific marker entries
  const biostarksEntries = (adaptersSrc.match(/"biostarks[A-Z][a-zA-Z]+\.\w+": \{/g) || []);
  assert('Has 23 BioStarks marker entries', biostarksEntries.length === 23, `found ${biostarksEntries.length}`);

  // Amino Acids (13)
  const aminoMarkers = ['arginine', 'asparagine', 'bcaa', 'carnitine', 'citrulline', 'glutamine', 'proline', 'taurine', 'threonine', 'tryptophan', 'tyrosine', 'valine'];
  for (const m of aminoMarkers) {
    assert(`Has biostarksAmino.${m}`, adaptersSrc.includes(`"biostarksAmino.${m}"`));
  }

  // Fatty Acids (5)
  const faMarkers = ['dha', 'epa', 'linoleicAcid', 'oleicAcid', 'omega3Index'];
  for (const m of faMarkers) {
    assert(`Has biostarksFA.${m}`, adaptersSrc.includes(`"biostarksFA.${m}"`));
  }

  // Intracellular Minerals (3) — µg/gHb, NOT serum
  const mineralMarkers = ['magnesium', 'selenium', 'zinc'];
  for (const m of mineralMarkers) {
    assert(`Has biostarksMineral.${m}`, adaptersSrc.includes(`"biostarksMineral.${m}"`));
  }

  // Hormones (2)
  assert('Has biostarksHormone.cortisol', adaptersSrc.includes('"biostarksHormone.cortisol"'));
  assert('Has biostarksHormone.testCortisolRatio', adaptersSrc.includes('"biostarksHormone.testCortisolRatio"'));

  // Vitamins (1)
  assert('Has biostarksVitamin.vitaminE', adaptersSrc.includes('"biostarksVitamin.vitaminE"'));

  // ═══════════════════════════════════════
  // 4. Marker Properties
  // ═══════════════════════════════════════
  console.log('%c 4. Marker Properties ', 'font-weight:bold;color:#f59e0b');

  // All BioStarks markers have group: "BioStarks"
  assert('All markers have group BioStarks', adaptersSrc.includes('group: "BioStarks"'));

  // Category labels
  assert('Has amino acids category', adaptersSrc.includes('"BioStarks: Amino Acids"'));
  assert('Has fatty acids category', adaptersSrc.includes('"BioStarks: Fatty Acids"'));
  assert('Has minerals category', adaptersSrc.includes('"BioStarks: Minerals"'));
  assert('Has hormones category', adaptersSrc.includes('"BioStarks: Hormones"'));
  assert('Has vitamins category', adaptersSrc.includes('"BioStarks: Vitamins"'));

  // Units — amino acids use µmol/L, FA serum uses µmol/L (not % like Spadia/ZinZino), minerals use µg/gHb
  assert('Amino acid unit is µmol/L', adaptersSrc.includes('biostarksAmino') && adaptersSrc.includes('unit: "µmol/L"'));
  assert('Mineral unit is µg/gHb', adaptersSrc.includes('biostarksMineral') && adaptersSrc.includes('unit: "µg/gHb"'));

  // ═══════════════════════════════════════
  // 5. Normalization Logic
  // ═══════════════════════════════════════
  console.log('%c 5. Normalization Logic ', 'font-weight:bold;color:#f59e0b');

  // Normalize preserves standard schema mappings
  assert('Normalize checks standardCats', adaptersSrc.includes('standardCats.has(catKey)'));
  // Normalize detects intracellular minerals by unit (µg/gHb)
  assert('Normalize checks gHb unit for mineral remap', adaptersSrc.includes("unit.includes('ghb')"));
  // Name lookup with aliases
  assert('Has BCAA alias', adaptersSrc.includes("nameLookup.set('bcaa'"));
  assert('Has T/C ratio alias', adaptersSrc.includes("nameLookup.set('t/c ratio'"));
  // Bare mineral aliases (critical — selenium has no standard schema fallback)
  assert('Has bare selenium alias', adaptersSrc.includes("nameLookup.set('selenium',"));
  assert('Has bare magnesium alias', adaptersSrc.includes("nameLookup.set('magnesium',"));
  assert('Has bare zinc alias', adaptersSrc.includes("nameLookup.set('zinc',"));
  // L-prefix amino acid aliases
  assert('Has l-arginine alias', adaptersSrc.includes("nameLookup.set('l-arginine'"));
  assert('Has l-carnitine alias', adaptersSrc.includes("nameLookup.set('l-carnitine'"));
  // FA chemical name aliases
  assert('Has DHA chemical name alias', adaptersSrc.includes("nameLookup.set('docosahexaenoic acid'"));
  assert('Has EPA chemical name alias', adaptersSrc.includes("nameLookup.set('eicosapentaenoic acid'"));

  // ═══════════════════════════════════════
  // 6. PDF Import Integration
  // ═══════════════════════════════════════
  console.log('%c 6. PDF Import Integration ', 'font-weight:bold;color:#f59e0b');

  // Classification prompt includes biostarks
  assert('Classify prompt has biostarks', pdfImportSrc.includes('"biostarks"') && pdfImportSrc.includes('BioStarks'));

  // Main AI prompt rule 7 mentions biostarks
  assert('Rule 7 includes biostarks testType', pdfImportSrc.includes('"biostarks" for BioStarks'));

  // Rule 8 exception for BioStarks hybrid
  assert('Rule 8 has BioStarks exception', pdfImportSrc.includes('EXCEPTION') && pdfImportSrc.includes('BioStarks') && pdfImportSrc.includes('hybrid'));

  // BioStarks NOT in _specialtyTypes (standard markers should map normally)
  const specialtyMatch = normalizationSrc.match(/const _specialtyTypes\s*=\s*\[([^\]]+)\]/);
  if (specialtyMatch) {
    assert('biostarks NOT in _specialtyTypes', !specialtyMatch[1].includes('biostarks'), 'BioStarks is hybrid — standard markers must pass through');
  } else {
    assert('_specialtyTypes found', false);
  }

  // Image pipeline also mentions biostarks
  assert('Image pipeline has biostarks testType', pdfImportSrc.includes('"biostarks", "DUTCH"'));

console.log(`\nResults: ${pass} passed, ${fail} failed, ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
