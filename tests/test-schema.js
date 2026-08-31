#!/usr/bin/env node
// test-schema.js — Verify specialty marker removal and migration
//
// Run: node tests/test-schema.js  (or via npm test)

import './_node-shim.js';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as dataModule from '../js/data.js';
import { migrateProfileData } from '../js/profile.js';
import { MARKER_SCHEMA } from '../js/schema.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf-8');

let pass = 0, fail = 0;
function assert(name, condition, detail) {
  if (condition) { pass++; console.log(`  PASS: ${name}`); }
  else { fail++; console.log(`  FAIL: ${name}${detail ? ' — ' + detail : ''}`); }
}

console.log('=== Specialty Marker Refactor Tests ===\n');

const schemaSrc = read('js/schema.js');
const adaptersSrc = read('js/adapters.js');
const organicNormalizationSrc = read('js/pdf-import-organic-acid-normalization.js');
const profileSrc = read('js/profile.js');
const profileDataMigrationsSrc = read('js/profile-data-migrations.js');
const dataSrc = read('js/data.js');
const pdfImportSrc = read('js/pdf-import.js');
const pdfImportCommitSrc = read('js/pdf-import-commit.js');
const pdfImportMappingSrc = read('js/pdf-import-marker-mapping.js');
const pdfImportNormalizationSrc = read('js/pdf-import-marker-normalization.js');
  // ═══════════════════════════════════════
  // 1. MARKER_SCHEMA no longer has specialty categories
  // ═══════════════════════════════════════
  console.log('%c 1. Specialty Categories Removed from MARKER_SCHEMA ', 'font-weight:bold;color:#f59e0b');

  const specialtyCats = ['oatMicrobial', 'oatMetabolic', 'oatNeuro', 'oatNutritional', 'oatAminoFatty', 'oxidativeStress', 'urineAmino', 'urineAminoMetab', 'toxicElements', 'nutrientElements'];

  // Specialty categories should NOT appear as MARKER_SCHEMA keys.
  // They should only appear in SPECIALTY_MARKER_DEFS.
  for (const cat of specialtyCats) {
    assert(`MARKER_SCHEMA lacks ${cat}`, !Object.hasOwn(MARKER_SCHEMA, cat), `should not be in MARKER_SCHEMA`);
  }

  // Standard categories should still be present
  const standardCats = ['biochemistry', 'hormones', 'electrolytes', 'lipids', 'iron', 'proteins', 'thyroid', 'vitamins', 'diabetes', 'tumorMarkers', 'coagulation', 'hematology', 'differential', 'boneMetabolism', 'calculatedRatios'];
  for (const cat of standardCats) {
    assert(`MARKER_SCHEMA has ${cat}`, Object.hasOwn(MARKER_SCHEMA, cat));
  }
  const biologyScoreStandardMarkers = [
    'lactate', 'pyruvate', 'cortisol', 'androstenedione', 'solubleTransferrinReceptor',
    'neurofilamentLight', 'reverseT3', 'tpoAb', 'tgAb', 'methylmalonicAcid',
    'fructosamine', 'fibrinogen', 'dDimer', 'cholHdlRatio'
  ];
  const standardMarkerKeys = new Set(
    Object.values(MARKER_SCHEMA).flatMap(category => Object.keys(category.markers || {})),
  );
  for (const marker of biologyScoreStandardMarkers) {
    assert(`MARKER_SCHEMA has biology-score marker ${marker}`, standardMarkerKeys.has(marker));
  }
  assert('C-peptide has one canonical standard schema home under diabetes',
    !!MARKER_SCHEMA.diabetes?.markers?.cPeptide && !MARKER_SCHEMA.hormones?.markers?.cPeptide);
  assert('Chol/HDL ratio has one schema home under calculatedRatios',
    !MARKER_SCHEMA.lipids?.markers?.cholHdlRatio
      && !!MARKER_SCHEMA.calculatedRatios?.markers?.cholHdlRatio);

  // ═══════════════════════════════════════
  // 2. SPECIALTY_MARKER_DEFS owned by adapters.js
  // ═══════════════════════════════════════
  console.log('%c 2. SPECIALTY_MARKER_DEFS (via adapters.js) ', 'font-weight:bold;color:#f59e0b');

  assert('adapters.js exports SPECIALTY_MARKER_DEFS',
    adaptersSrc.includes('export { ADAPTER_MARKERS as SPECIALTY_MARKER_DEFS }'));
  assert('schema.js does not reverse-import adapters.js', !schemaSrc.includes("from './adapters.js'"));

  // Count entries in adapters.js (the single source of truth)
  const entryCount = (adaptersSrc.match(/"[a-zA-Z]+\.\w+": \{/g) || []).length;
  assert('Adapter markers have 225 entries', entryCount === 225, `found ${entryCount}`);

  // Each entry has required fields
  assert('Entries have name field', adaptersSrc.includes('name:'));
  assert('Entries have unit field', adaptersSrc.includes('unit:'));
  assert('Entries have refMin field', adaptersSrc.includes('refMin:'));
  assert('Entries have refMax field', adaptersSrc.includes('refMax:'));
  assert('Entries have categoryLabel field', adaptersSrc.includes('categoryLabel:'));
  assert('Entries have icon field', adaptersSrc.includes('icon:'));

  // Spot-check entries across adapters
  assert('Has oatMicrobial.citramalic', adaptersSrc.includes('"oatMicrobial.citramalic"'));
  assert('Has toxicElements.lead', adaptersSrc.includes('"toxicElements.lead"'));
  assert('Has urineAmino.arginine', adaptersSrc.includes('"urineAmino.arginine"'));
  assert('Has nutrientElements.selenium', adaptersSrc.includes('"nutrientElements.selenium"'));
  assert('Has fattyAcids.omega3Index', adaptersSrc.includes('"fattyAcids.omega3Index"'));
  assert('Has fattyAcids.epaC20_5', adaptersSrc.includes('"fattyAcids.epaC20_5"'));

  // Adapter registry structure
  assert('adapters.js exports getAllAdapterMarkers', adaptersSrc.includes('export function getAllAdapterMarkers'));
  assert('adapters.js exports detectProduct', adaptersSrc.includes('export function detectProduct'));
  assert('adapters.js exports normalizeWithAdapter', adaptersSrc.includes('export function normalizeWithAdapter'));
  assert('adapters.js has FA adapter with detect/normalize', adaptersSrc.includes("id: 'fattyAcids'") && adaptersSrc.includes('detect(') && adaptersSrc.includes('normalize('));
  assert('adapters.js has OAT adapter', adaptersSrc.includes("id: 'oat'"));
  assert('Metabolomix+ has detection and lazy product normalization',
    adaptersSrc.includes("id: 'metabolomix'")
    && adaptersSrc.includes('_detectMetabolomix')
    && organicNormalizationSrc.includes('normalizeMetabolomixProduct'));

  // ═══════════════════════════════════════
  // 3. CORRELATION_PRESETS don't reference specialty keys
  // ═══════════════════════════════════════
  console.log('%c 3. Correlation Presets Cleaned ', 'font-weight:bold;color:#f59e0b');

  const presetsBlock = schemaSrc.substring(
    schemaSrc.indexOf('export const CORRELATION_PRESETS'),
    schemaSrc.indexOf('export const CHIP_COLORS')
  );
  for (const cat of specialtyCats) {
    assert(`Presets lack ${cat} references`, !presetsBlock.includes(`"${cat}.`), `should not reference ${cat}`);
  }
  // Standard presets should still be there
  assert('Has Testosterone vs SHBG preset', presetsBlock.includes('Testosterone vs SHBG'));
  assert('Has TSH vs T3 vs T4 preset', presetsBlock.includes('TSH vs T3 vs T4'));
  assert('Has Lipid Panel preset', presetsBlock.includes('Lipid Panel'));

  // ═══════════════════════════════════════
  // 4. Migration in profile.js
  // ═══════════════════════════════════════
  console.log('%c 4. Migration in profile.js ', 'font-weight:bold;color:#f59e0b');

  assert('profile migration owner imports standard and specialty markers',
    profileDataMigrationsSrc.includes("import { MARKER_SCHEMA } from './schema.js'")
      && profileDataMigrationsSrc.includes("import { SPECIALTY_MARKER_DEFS } from './adapters.js'")
      && profileSrc.includes("from './profile-data-migrations.js'"));
  assert('Migration scans entry markers', profileDataMigrationsSrc.includes('SPECIALTY_MARKER_DEFS[key]'));
  assert('Migration writes to customMarkers', profileDataMigrationsSrc.includes('data.customMarkers[key]'));
  assert('Migration includes icon', profileDataMigrationsSrc.includes('icon: def.icon'));

  // Behavioral test: migrateProfileData with specialty entry data
  if (typeof migrateProfileData === 'function') {
    const testData = {
      entries: [
        { date: '2025-01-01', markers: { 'oatMicrobial.citramalic': 1.5, 'biochemistry.glucose': 5.2 } },
        { date: '2025-02-01', markers: { 'toxicElements.lead': 0.8 } }
      ]
    };
    const migrated = migrateProfileData(testData);
    assert('Migration creates customMarkers for oatMicrobial.citramalic',
      migrated.customMarkers && migrated.customMarkers['oatMicrobial.citramalic'] != null);
    assert('Migration creates customMarkers for toxicElements.lead',
      migrated.customMarkers && migrated.customMarkers['toxicElements.lead'] != null);
    assert('Migration does NOT create customMarkers for biochemistry.glucose',
      !migrated.customMarkers['biochemistry.glucose']);
    if (migrated.customMarkers['oatMicrobial.citramalic']) {
      const cm = migrated.customMarkers['oatMicrobial.citramalic'];
      assert('Migrated marker has correct name', cm.name === 'Citramalic Acid');
      assert('Migrated marker has correct unit', cm.unit === 'mmol/mol creatinine');
      assert('Migrated marker has icon', cm.icon != null);
    }
    assert('Entry marker values untouched', testData.entries[0].markers['oatMicrobial.citramalic'] === 1.5);

    // Idempotency test
    const migrated2 = migrateProfileData(migrated);
    assert('Migration is idempotent', JSON.stringify(migrated2.customMarkers) === JSON.stringify(migrated.customMarkers));

    // No-op for empty entries
    const emptyData = { entries: [] };
    const migratedEmpty = migrateProfileData(emptyData);
    assert('Migration no-op for empty entries', Object.keys(migratedEmpty.customMarkers || {}).length === 0);
  }

  // ═══════════════════════════════════════
  // 5. Custom marker icon support in data.js
  // ═══════════════════════════════════════
  console.log('%c 5. Custom Marker Icon Support ', 'font-weight:bold;color:#f59e0b');

  assert('data.js uses def.icon for custom category icon', dataSrc.includes("def.icon || _inferIcon(_label) || '\\uD83D\\uDD16'"));

  // ═══════════════════════════════════════
  // 6. PDF Import: specialty reference + auto-create custom markers
  // ═══════════════════════════════════════
  console.log('%c 6. PDF Import Specialty Support ', 'font-weight:bold;color:#f59e0b');

  assert('SPECIALTY_PREFIXES removed', !pdfImportSrc.includes('SPECIALTY_PREFIXES'));
  assert('Specialty warning removed', !pdfImportSrc.includes('specialty test data'));
  assert('buildMarkerReference still exists', pdfImportMappingSrc.includes('function buildMarkerReference'));
  assert('pdf-import re-exports buildMarkerReference',
    /export\s*\{[^}]*buildMarkerReference[^}]*\}\s*from\s*['"]\.\/pdf-import-marker-mapping\.js['"]/.test(pdfImportSrc));
  assert('pdf-import commit imports SPECIALTY_MARKER_DEFS', pdfImportCommitSrc.includes('SPECIALTY_MARKER_DEFS'));
  assert('buildMarkerReference includes specialty defs', pdfImportMappingSrc.includes('Object.entries(SPECIALTY_MARKER_DEFS)'));
  assert('confirmImport auto-creates custom markers for specialty keys', pdfImportCommitSrc.includes('SPECIALTY_MARKER_DEFS[m.mappedKey]'));
  assert('Prompt asks for refMin/refMax on all markers', pdfImportSrc.includes('refMin: the lower reference range bound EXACTLY as printed on the PDF'));
  // Adapter integration
  assert('pdf-import normalization imports adapter functions', pdfImportNormalizationSrc.includes("from './adapters.js'"));
  assert('Inline FA functions removed',
    !pdfImportSrc.includes('FA_PRODUCT_PATTERNS') && !pdfImportSrc.includes('function _detectFAProduct')
    && !pdfImportNormalizationSrc.includes('FA_PRODUCT_PATTERNS') && !pdfImportNormalizationSrc.includes('function _detectFAProduct'));
  assert('Uses detectProduct from adapters', pdfImportNormalizationSrc.includes('detectProduct('));
  assert('Uses normalizeWithAdapter from adapters', pdfImportNormalizationSrc.includes('normalizeWithAdapter('));

  // ═══════════════════════════════════════
  // 7. getActiveData merges migrated specialty markers correctly
  // ═══════════════════════════════════════
  console.log('%c 7. Data Pipeline Integration ', 'font-weight:bold;color:#f59e0b');

  if (typeof dataModule.getActiveData === 'function') {
    // Temporarily inject test custom markers to verify icon propagation
    const origCustom = window.importedData?.customMarkers;
    const origEntries = window.importedData?.entries;
    if (window.importedData) {
      window.importedData.customMarkers = {
        'testCat.testMarker': { name: 'Test', unit: 'mg/l', refMin: 1, refMax: 10, categoryLabel: 'Test Category', icon: '\uD83E\uDDA0' }
      };
      window.importedData.entries = [];
      const data = dataModule.getActiveData();
      assert('Custom category created with def.icon', data.categories.testCat && data.categories.testCat.icon === '\uD83E\uDDA0');
      assert('Custom category has correct label', data.categories.testCat && data.categories.testCat.label === 'Test Category');

      // Test without icon (should fallback to bookmark)
      window.importedData.customMarkers = {
        'noIconCat.marker1': { name: 'No Icon', unit: 'mg/l', refMin: 1, refMax: 10, categoryLabel: 'No Icon Cat' }
      };
      const data2 = dataModule.getActiveData();
      assert('Custom category without icon gets bookmark default', data2.categories.noIconCat && data2.categories.noIconCat.icon === '\uD83D\uDD16');

      // Restore
      window.importedData.customMarkers = origCustom || {};
      window.importedData.entries = origEntries || [];
    }
  }

  // ═══════════════════════════════════════
  // Results
  // ═══════════════════════════════════════
console.log(`\nResults: ${pass} passed, ${fail} failed, ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
