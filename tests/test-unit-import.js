#!/usr/bin/env node
// test-unit-import.js — Verify US-unit values are normalized to SI on import
//
// Run: node tests/test-unit-import.js  (or via npm test)

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

console.log('=== Unit Normalization on Import Tests ===\n');

const src = read('js/pdf-import.js');
const mappingSrc = read('js/pdf-import-marker-mapping.js');
const normalizationSrc = read('js/pdf-import-marker-normalization.js');
const persistenceSrc = read('js/pdf-import-persistence.js');
const settingsSrc = read('js/settings.js');
  // ═══════════════════════════════════════
  // 1. normalizeToSI function exists
  // ═══════════════════════════════════════
  console.log('%c 1. normalizeToSI function ', 'font-weight:bold;color:#f59e0b');

  assert('normalizeToSI defined', mappingSrc.includes('function normalizeToSI('));
  assert('normalizeToSI checks UNIT_CONVERSIONS', mappingSrc.includes('UNIT_CONVERSIONS[key]'));
  assert('normalizeUnitStr handles µ variants', mappingSrc.includes('normalizeUnitStr') && mappingSrc.includes('\\u03bc'));

  // ═══════════════════════════════════════
  // 2. UNIT_CONVERSIONS is imported
  // ═══════════════════════════════════════
  console.log('%c 2. UNIT_CONVERSIONS import ', 'font-weight:bold;color:#f59e0b');

  assert('UNIT_CONVERSIONS imported from schema.js',
    /import\s*\{[^}]*UNIT_CONVERSIONS[^}]*\}\s*from\s*['"]\.\/schema\.js['"]/.test(mappingSrc));

  // ═══════════════════════════════════════
  // 3. confirmImport uses normalizeToSI for matched markers
  // ═══════════════════════════════════════
  console.log('%c 3. confirmImport normalization ', 'font-weight:bold;color:#f59e0b');

  const confirmBlock = src.substring(src.indexOf('function confirmImport'));
  assert('matched markers normalized',
    confirmBlock.includes('normalizeToSI(m.mappedKey, m.value, m.unit)'));
  assert('new (custom) markers normalized',
    confirmBlock.includes('normalizeToSI(m.suggestedKey, m.value, m.unit)'));
  assert('confirmImport waits for async save before closing UI',
    src.includes('export async function confirmImport') && /await\s+saveImportedData\([^)]*\)/.test(confirmBlock));
  assert('PDF import requests immediate sync push after durable save',
    /await\s+saveImportedData\(\{\s*immediate:\s*true\s*\}\)/.test(confirmBlock));
  assert('PDF import clears same-date entry tombstone when intentionally re-importing',
    /clearTombstone\(state\.importedData,\s*['"]entries['"],\s*result\.date\)/.test(confirmBlock));
  assert('PDF import rolls back in-memory state when durable save fails',
    /const rollback = snapshotImportedData\(\)/.test(confirmBlock)
      && /if \(!saved\) \{[\s\S]{0,200}restoreImportedDataSnapshot\(rollback\)/.test(confirmBlock));
  const removeBlock = persistenceSrc.substring(persistenceSrc.indexOf('export async function removeImportedEntry'), persistenceSrc.indexOf('export async function renameImportedEntryDate'));
  assert('import delete records entries tombstone before removing row',
    /recordTombstone\(state\.importedData,\s*['"]entries['"],\s*date\)[\s\S]{0,180}deleteImportedArrayItems\(state\.importedData,\s*['"]entries['"],\s*e => e\.date === date\)/.test(removeBlock));
  assert('import delete uses immediate sync push',
    /await\s+saveImportedData\(\{\s*immediate:\s*true\s*\}\)/.test(removeBlock));
  assert('import delete restores state and returns false when save fails',
    /const rollback = snapshotImportedData\(\)[\s\S]{0,400}if \(!saved\) \{[\s\S]{0,160}restoreImportedDataSnapshot\(rollback\)[\s\S]{0,120}return false/.test(removeBlock));
  const renameStart = persistenceSrc.indexOf('export async function renameImportedEntryDate');
  const renameBlock = persistenceSrc.substring(renameStart);
  assert('import date rename tombstones old date',
    /recordTombstone\(state\.importedData,\s*['"]entries['"],\s*oldDate\)/.test(renameBlock));
  assert('import date rename clears tombstone for new date',
    /clearTombstone\(state\.importedData,\s*['"]entries['"],\s*newDate\)/.test(renameBlock));
  assert('import date rename restores state and returns false when save fails',
    /const saved = await saveImportedData\(\{\s*immediate:\s*true\s*\}\)[\s\S]{0,160}if \(!saved\) \{[\s\S]{0,160}restoreImportedDataSnapshot\(rollback\)[\s\S]{0,120}return false/.test(renameBlock));
  assert('import date rename validates calendar dates without local-timezone shift',
    /function isValidISOCalendarDate\(date\)/.test(persistenceSrc)
      && /Date\.UTC\(year,\s*month - 1,\s*day\)/.test(persistenceSrc)
      && /getUTCFullYear\(\)\s*===\s*year[\s\S]{0,120}getUTCMonth\(\)\s*===\s*month - 1[\s\S]{0,120}getUTCDate\(\)\s*===\s*day/.test(persistenceSrc));
  assert('Settings Data remove refreshes only after successful delete',
    /removeImportedEntryFromSettings[\s\S]{0,240}const ok = await removeImportedEntry\(date\)[\s\S]{0,80}if \(ok\) refreshDataEntriesSection\(\)/.test(settingsSrc));
  assert('Settings Data rename refreshes only after successful save',
    /renameImportedEntryDateFromSettings[\s\S]{0,260}const ok = await renameImportedEntryDate\(date\)[\s\S]{0,80}if \(ok\) refreshDataEntriesSection\(\)/.test(settingsSrc));

  // ═══════════════════════════════════════
  // 4. normalizeToSI handles multiply type (inverse)
  // ═══════════════════════════════════════
  console.log('%c 4. Conversion logic ', 'font-weight:bold;color:#f59e0b');

  assert('divides by factor for multiply type', mappingSrc.includes('value / conv.factor'));
  assert('handles hba1c inverse', mappingSrc.includes('(value - 2.15) * 10.929'));

  // ═══════════════════════════════════════
  // 5. Functional test via module import
  // ═══════════════════════════════════════
  console.log('%c 5. Functional conversion tests ', 'font-weight:bold;color:#f59e0b');

  const { UNIT_CONVERSIONS } = await import('../js/schema.js');

  // Simulate normalizeToSI (same logic as the function)
  function normUnit(s) {
    return s.toLowerCase().replace(/\s/g, '').replace(/[\u00b5\u03bc]/g, 'u').replace(/^mcg/, 'ug').replace(/^iu\//, 'u/');
  }
  function testNormalize(key, value, unit) {
    if (value == null || !unit) return value;
    const conv = UNIT_CONVERSIONS[key];
    if (!conv) return value;
    const aiUnit = normUnit(unit);
    if (conv.type === 'multiply') {
      if (aiUnit === normUnit(conv.usUnit)) return parseFloat((value / conv.factor).toPrecision(6));
    } else if (conv.type === 'hba1c' && aiUnit === '%') {
      return parseFloat(((value - 2.15) * 10.929).toFixed(1));
    }
    return value;
  }

  // Glucose: 95 mg/dL → should be ~5.27 mmol/L
  const glucoseSI = testNormalize('biochemistry.glucose', 95, 'mg/dl');
  assert('Glucose 95 mg/dL → ~5.27 mmol/L',
    Math.abs(glucoseSI - 5.27) < 0.1,
    `got ${glucoseSI}`);

  // Glucose already in SI should pass through unchanged
  const glucosePassthrough = testNormalize('biochemistry.glucose', 5.27, 'mmol/l');
  assert('Glucose 5.27 mmol/L unchanged',
    glucosePassthrough === 5.27,
    `got ${glucosePassthrough}`);

  // HbA1c: 5.7% → should be ~38.8 mmol/mol
  const hba1cSI = testNormalize('diabetes.hba1c', 5.7, '%');
  assert('HbA1c 5.7% → ~38.8 mmol/mol',
    Math.abs(hba1cSI - 38.8) < 0.5,
    `got ${hba1cSI}`);

  // Testosterone: 500 ng/dL → should be ~17.35 nmol/L
  const testoSI = testNormalize('hormones.testosterone', 500, 'ng/dl');
  assert('Testosterone 500 ng/dL → ~17.35 nmol/L',
    Math.abs(testoSI - 17.35) < 0.5,
    `got ${testoSI}`);

  // Cholesterol: 200 mg/dL → should be ~5.17 mmol/L
  const cholSI = testNormalize('lipids.cholesterol', 200, 'mg/dl');
  assert('Cholesterol 200 mg/dL → ~5.17 mmol/L',
    Math.abs(cholSI - 5.17) < 0.1,
    `got ${cholSI}`);

  // µ character variants for DHEA-S (usUnit: 'µg/dl', factor: 36.87)
  // Unicode MICRO SIGN (U+00B5)
  const dhea1 = testNormalize('hormones.dheaS', 200, '\u00b5g/dl');
  assert('DHEA-S with µ (U+00B5) converts',
    Math.abs(dhea1 - 5.424) < 0.01, `got ${dhea1}`);
  // Greek mu (U+03BC)
  const dhea2 = testNormalize('hormones.dheaS', 200, '\u03bcg/dl');
  assert('DHEA-S with μ (U+03BC) converts',
    Math.abs(dhea2 - 5.424) < 0.01, `got ${dhea2}`);
  // mcg
  const dhea3 = testNormalize('hormones.dheaS', 200, 'mcg/dl');
  assert('DHEA-S with mcg converts',
    Math.abs(dhea3 - 5.424) < 0.01, `got ${dhea3}`);

  // Null value should return null
  assert('null value returns null', testNormalize('biochemistry.glucose', null, 'mg/dl') === null);

  // No unit should return value unchanged
  assert('no unit returns value unchanged', testNormalize('biochemistry.glucose', 95, null) === 95);

  // Unknown marker key should return value unchanged
  assert('unknown key returns value unchanged', testNormalize('custom.something', 42, 'mg/dl') === 42);

  // IU/L → U/L normalization (enzyme units are equivalent)
  const altIU = testNormalize('biochemistry.alt', 20, 'IU/L');
  assert('ALT 20 IU/L → ~0.333 µkat/L',
    Math.abs(altIU - 0.333) < 0.01, `got ${altIU}`);
  const astIU = testNormalize('biochemistry.ast', 18, 'IU/L');
  assert('AST 18 IU/L → ~0.3 µkat/L',
    Math.abs(astIU - 0.3) < 0.01, `got ${astIU}`);
  const alpIU = testNormalize('biochemistry.alp', 65, 'IU/L');
  assert('ALP 65 IU/L → ~1.083 µkat/L',
    Math.abs(alpIU - 1.083) < 0.01, `got ${alpIU}`);

  // IU/L should match U/L conversion
  const altUL = testNormalize('biochemistry.alt', 20, 'U/L');
  assert('ALT IU/L and U/L give same result',
    altIU === altUL, `IU/L=${altIU}, U/L=${altUL}`);

  // Hematocrit: 45% stays as 45 (stored natively as %)
  const hctSI = testNormalize('hematology.hematocrit', 45, '%');
  assert('Hematocrit 45% stays 45',
    Math.abs(hctSI - 45) < 0.001, `got ${hctSI}`);

  // Vitamin A: 50 µg/dL → ~1.745 µmol/L
  const vitASI = testNormalize('vitamins.vitaminA', 50, '\u00b5g/dl');
  assert('Vitamin A 50 µg/dL → ~1.745 µmol/L',
    Math.abs(vitASI - 1.745) < 0.05, `got ${vitASI}`);

  // Calcitriol: 60 pg/mL → ~149.8 pmol/L
  const calcSI = testNormalize('vitamins.calcitriol', 60, 'pg/ml');
  assert('Calcitriol 60 pg/mL → ~149.8 pmol/L',
    Math.abs(calcSI - 149.8) < 1, `got ${calcSI}`);

  // Free T4: 1.2 ng/dL → ~15.44 pmol/L
  const ft4SI = testNormalize('thyroid.ft4', 1.2, 'ng/dl');
  assert('Free T4 1.2 ng/dL → ~15.44 pmol/L',
    Math.abs(ft4SI - 15.44) < 0.5, `got ${ft4SI}`);

  // Free T3: 3.5 pg/dL → ~5.37 pmol/L
  const ft3SI = testNormalize('thyroid.ft3', 3.5, 'pg/dl');
  assert('Free T3 3.5 pg/dL → ~5.37 pmol/L',
    Math.abs(ft3SI - 5.37) < 0.2, `got ${ft3SI}`);

  // Transferrin: 250 mg/dL → 2.5 g/L
  const transSI = testNormalize('iron.transferrin', 250, 'mg/dl');
  assert('Transferrin 250 mg/dL → 2.5 g/L',
    Math.abs(transSI - 2.5) < 0.01, `got ${transSI}`);

  // MCHC: 34.0 g/dL → 340 g/L
  const mchcSI = testNormalize('hematology.mchc', 34.0, 'g/dl');
  assert('MCHC 34 g/dL → 340 g/L',
    Math.abs(mchcSI - 340) < 1, `got ${mchcSI}`);

  // Ceruloplasmin: 25 mg/dL → 0.25 g/L
  const ceruSI = testNormalize('proteins.ceruloplasmin', 25, 'mg/dl');
  assert('Ceruloplasmin 25 mg/dL → 0.25 g/L',
    Math.abs(ceruSI - 0.25) < 0.01, `got ${ceruSI}`);

  // Factor-1 markers: unit label changes but value stays same
  const ferritinSI = testNormalize('iron.ferritin', 80, 'ng/ml');
  assert('Ferritin 80 ng/mL → 80 (factor 1)',
    ferritinSI === 80, `got ${ferritinSI}`);

  // BUN/Creatinine ratio exists in schema
  const { MARKER_SCHEMA } = await import('../js/schema.js');
  assert('bunCreatRatio in calculatedRatios',
    MARKER_SCHEMA.calculatedRatios?.markers?.bunCreatRatio != null);
  assert('bunCreatRatio ref range 10-20',
    MARKER_SCHEMA.calculatedRatios.markers.bunCreatRatio.refMin === 10 &&
    MARKER_SCHEMA.calculatedRatios.markers.bunCreatRatio.refMax === 20);

  // ═══════════════════════════════════════
  // 6. FA normalization doesn't rewrite standard markers
  // ═══════════════════════════════════════
  console.log('%c 6. FA normalization safety ', 'font-weight:bold;color:#f59e0b');

  // Verify FA normalization uses adapters.js (not inline functions)
  assert('pdf-import normalization imports adapter functions', normalizationSrc.includes("from './adapters.js'"));
  assert('Inline FA functions removed',
    !src.includes('function _normalizeFattyAcidMarkers(')
    && !src.includes('FA_PRODUCT_PATTERNS')
    && !normalizationSrc.includes('function _normalizeFattyAcidMarkers(')
    && !normalizationSrc.includes('FA_PRODUCT_PATTERNS'));
  assert('Uses detectProduct from adapters', normalizationSrc.includes('detectProduct('));
  assert('Uses normalizeWithAdapter from adapters', normalizationSrc.includes('normalizeWithAdapter('));

  // FA normalize logic lives in adapters.js — check it there
  const adapterSrc = read('js/adapters.js');
  assert('FA normalize checks standardCats', adapterSrc.includes('standardCats.has(catKey)'));
  assert('FA normalize skips standard markers', adapterSrc.includes('continue') && adapterSrc.includes('standard category'));

  // Verify adapter normalization requires AI agreement — product detection alone + blood testType must NOT trigger
  assert('Adapter normalization requires non-blood testType',
    normalizationSrc.includes("testType !== 'blood'") && normalizationSrc.includes('detected') && normalizationSrc.includes('needsAdapterNormalize'));

  // Verify guard at line 367 only fires for non-blood tests
  assert('Guard checks testType !== blood',
    normalizationSrc.includes("testType !== 'blood'") && normalizationSrc.includes('Import Guard'));

  // ═══════════════════════════════════════
  // 7. Import mapping reconciliation
  // ═══════════════════════════════════════
  console.log('%c 7. Import mapping reconciliation ', 'font-weight:bold;color:#f59e0b');

  assert('pdf-import exports reconcileImportMarkerMappings',
    /export\s*\{[^}]*reconcileImportMarkerMappings[^}]*\}\s*from\s*['"]\.\/pdf-import-marker-mapping\.js['"]/.test(src)
    && /export function reconcileImportMarkerMappings/.test(mappingSrc));
  assert('pdf-import imports existing marker key lookup from mapping module',
    src.includes('getExistingImportMarkerKeys') && !src.includes('_getExistingImportMarkerKeys'));
  assert('Czech/Spadia alias table includes key labels',
    mappingSrc.includes("'glukoza', 'biochemistry.glucose'")
    && mappingSrc.includes("'horcikvery', 'electrolytes.magnesiumRBC'")
    && mappingSrc.includes("'homocystein', 'coagulation.homocysteine'"));

  const { reconcileImportMarkerMappings } = await import('../js/pdf-import.js');
  const { state } = await import('../js/state.js');
  const originalImportedData = state.importedData;
  state.importedData = {
    entries: [{
      date: '2026-03-13',
      markers: {
        'custom.activeB12': 145,
        'spadiaFA.epaC20_5': 0.46
      }
    }],
    customMarkers: {
      'custom.activeB12': { name: 'Active B12', unit: 'pmol/l' },
      'spadiaFA.epaC20_5': { name: 'EPA C20:5', unit: '%' },
      'biochemistry.alpUkatL': { name: 'ALP (ukat/l)', unit: 'µkat/l' }
    }
  };
  try {
    const importMarkers = [
      { rawName: 'S Glukóza', value: 4.56, unit: 'mmol/l', matched: false, mappedKey: null, suggestedKey: 'custom.glukoza' },
      { rawName: 'P Hořčík v ery', value: 2.56, unit: 'mmol/l', matched: false, mappedKey: null, suggestedKey: 'custom.magnesiumEry' },
      { rawName: 'S Aktivní B12', value: 300, unit: 'pmol/l', matched: false, mappedKey: null, suggestedKey: 'custom.activeVitaminB12', suggestedName: 'Active B12' },
      { rawName: 'B Neutrofily #', value: 3.22, unit: '10^9/l', matched: false, mappedKey: null, suggestedKey: 'custom.neutrophilsAbs' },
      { rawName: 'U Glukosa', value: 0, unit: 'arb.j.', matched: false, mappedKey: null, suggestedKey: 'custom.urineGlucose' },
      { rawName: 'U pH', value: 5, unit: '-', matched: false, mappedKey: null, suggestedKey: 'custom.urinePh' },
      { rawName: 'S Celk.bílkovina', value: 69.6, unit: 'g/l', matched: false, mappedKey: null, suggestedKey: 'custom.totalProtein' },
      { rawName: 'U Celková bílkovina', value: 0.142, unit: 'g/l', matched: true, mappedKey: 'proteins.totalProtein', suggestedKey: null },
      { rawName: 'EPA C20:5', value: 0.46, unit: '%', matched: false, mappedKey: null, suggestedKey: 'spadiaFA.epaC20_5' },
      { rawName: 'ALP (ukat/l)', value: 1.2, unit: 'µkat/l', matched: false, mappedKey: null, suggestedKey: 'biochemistry.alpUkatL' },
      { rawName: 'ALT [µkat/l]', value: 0.5, unit: 'µkat/l', matched: true, mappedKey: 'biochemistry.altUkatL', suggestedKey: null },
      { rawName: 'USED Leukocyty', value: 4, unit: '/µl', matched: true, mappedKey: 'hematology.wbc', suggestedKey: null },
      { rawName: 'Unknown Marker', value: 42, unit: 'x', matched: true, mappedKey: 'custom.unknownMarker', suggestedKey: null }
    ];
    reconcileImportMarkerMappings(importMarkers, { testType: 'blood' });
    assert('Czech glucose reconciles to existing schema marker',
      importMarkers[0].matched && importMarkers[0].mappedKey === 'biochemistry.glucose');
    assert('Erythrocyte magnesium reconciles to magnesium RBC',
      importMarkers[1].matched && importMarkers[1].mappedKey === 'electrolytes.magnesiumRBC');
    assert('Same-name custom marker reconciles to previous custom key',
      importMarkers[2].matched && importMarkers[2].mappedKey === 'custom.activeB12');
    assert('Differential # value reconciles to absolute-count marker',
      importMarkers[3].matched && importMarkers[3].mappedKey === 'differential.neutrophils');
    assert('Urine glucose is not incorrectly merged into blood glucose',
      !importMarkers[4].matched && importMarkers[4].suggestedKey === 'custom.urineGlucose');
    assert('Urine pH reconciles to urinalysis pH',
      importMarkers[5].matched && importMarkers[5].mappedKey === 'urinalysis.ph');
    assert('Serum total protein reconciles to proteins.totalProtein',
      importMarkers[6].matched && importMarkers[6].mappedKey === 'proteins.totalProtein');
    assert('Urine total protein is demoted instead of overwriting serum total protein',
      !importMarkers[7].matched
      && importMarkers[7].mappedKey === null
      && importMarkers[7].suggestedKey === 'urinalysis.totalProtein');
    assert('Existing product-specific custom key is matched, not new',
      importMarkers[8].matched && importMarkers[8].mappedKey === 'spadiaFA.epaC20_5');
    assert('Unit suffix in marker label does not create duplicate ALP marker',
      importMarkers[9].matched && importMarkers[9].mappedKey === 'biochemistry.alp');
    assert('Invalid matched key with unit suffix is remapped to existing ALT',
      importMarkers[10].matched && importMarkers[10].mappedKey === 'biochemistry.alt');
    assert('Urine sediment prefix is not merged into blood WBC',
      !importMarkers[11].matched
      && importMarkers[11].mappedKey === null
      && importMarkers[11].suggestedKey === 'urinalysis.leukocytesQualitative');
    assert('Unknown invalid mappedKey is demoted so it becomes a real custom marker',
      !importMarkers[12].matched && importMarkers[12].mappedKey === null && importMarkers[12].suggestedKey === 'custom.unknownMarker');
  } finally {
    state.importedData = originalImportedData;
  }

  // ═══════════════════════════════════════
  // 8. Profile repair for already-imported unit-suffixed duplicates
  // ═══════════════════════════════════════
  console.log('%c 8. Profile import repair ', 'font-weight:bold;color:#f59e0b');

  const { migrateProfileData } = await import('../js/profile.js');
  const migrated = {
    entries: [{
      date: '2026-05-01',
      markers: { 'biochemistry.alpUkatL': 1.2 },
      markerSources: { 'biochemistry.alpUkatL': { file: 'spadia.pdf' } }
    }],
    customMarkers: {
      'biochemistry.alpUkatL': { name: 'ALP (ukat/l)', unit: 'µkat/l' }
    },
    markerLabels: {
      'biochemistry.alpUkatL': 'My ALP label'
    },
    markerValueNotes: {
      'biochemistry.alpUkatL:2026-05-01': 'lab note'
    }
  };
  migrateProfileData(migrated);
  assert('Profile migration moves ALP unit-suffixed duplicate onto schema key',
    migrated.entries[0].markers['biochemistry.alp'] === 1.2
    && migrated.entries[0].markers['biochemistry.alpUkatL'] === undefined);
  assert('Profile migration removes duplicate custom marker definition',
    migrated.customMarkers['biochemistry.alpUkatL'] === undefined);
  assert('Profile migration remaps marker value notes',
    migrated.markerValueNotes['biochemistry.alp:2026-05-01'] === 'lab note');
  assert('Profile migration remaps custom marker labels',
    migrated.markerLabels['biochemistry.alp'] === 'My ALP label'
    && migrated.markerLabels['biochemistry.alpUkatL'] === undefined);
  const invisible = {
    entries: [{ date: '2026-05-01', markers: { 'biochemistry.altUkatL': 0.5 } }],
    customMarkers: {}
  };
  migrateProfileData(invisible);
  assert('Profile migration repairs unit-suffixed entry keys even without custom marker definition',
    invisible.entries[0].markers['biochemistry.alt'] === 0.5
    && invisible.entries[0].markers['biochemistry.altUkatL'] === undefined);
  const urineProtein = {
    entries: [{ date: '2026-05-01', markers: { 'urinalysis.totalProtein': 0.142 } }],
    customMarkers: {
      'urinalysis.totalProtein': { name: 'Celková bílkovina', unit: 'g/l' }
    }
  };
  migrateProfileData(urineProtein);
  assert('Profile migration does not remap deliberate urine total protein to serum total protein',
    urineProtein.entries[0].markers['urinalysis.totalProtein'] === 0.142
    && urineProtein.entries[0].markers['proteins.totalProtein'] === undefined
    && urineProtein.customMarkers['urinalysis.totalProtein']);
  const urineProteinUnitDecorated = {
    entries: [{ date: '2026-05-01', markers: { 'urinalysis.totalProteinGl': 0.142 } }],
    customMarkers: {
      'urinalysis.totalProteinGl': { name: 'Total Protein (g/l)', unit: 'g/l' }
    }
  };
  migrateProfileData(urineProteinUnitDecorated);
  assert('Profile migration does not cross-map unit-decorated urine markers into blood categories',
    urineProteinUnitDecorated.entries[0].markers['urinalysis.totalProteinGl'] === 0.142
    && urineProteinUnitDecorated.entries[0].markers['proteins.totalProtein'] === undefined
    && urineProteinUnitDecorated.customMarkers['urinalysis.totalProteinGl']);

  // ═══════════════════════════════════════
  // Results
  // ═══════════════════════════════════════
console.log(`\nResults: ${pass} passed, ${fail} failed, ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
