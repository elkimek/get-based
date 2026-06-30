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
const aiUtilsSrc = read('js/pdf-import-ai-utils.js');
const exportSrc = read('js/export.js');
const mappingSrc = read('js/pdf-import-marker-mapping.js');
const normalizationSrc = read('js/pdf-import-marker-normalization.js');
const persistenceSrc = read('js/pdf-import-persistence.js');
const settingsDataSrc = read('js/settings-data.js');
const settingsSrc = read('js/settings.js');
const reviewSrc = read('js/pdf-import-review.js');
const labEntrySrc = read('js/lab-entry.js');
const profileSrc = read('js/profile.js');
const importCssSrc = read('css/import.css');
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
    /findOrCreateLabEntry\(state\.importedData,\s*result\.date,\s*\{ now: importTs \}\)/.test(confirmBlock));
  assert('PDF import rolls back in-memory state when durable save fails',
    /const rollback = snapshotImportedData\(\)/.test(confirmBlock)
      && /if \(!saved\) \{[\s\S]{0,200}restoreImportedDataSnapshot\(rollback\)/.test(confirmBlock));
  const jsonImportBlock = exportSrc.substring(exportSrc.indexOf('export function importDataJSON'), exportSrc.indexOf('function importContextField'));
  assert('JSON import preserves markerSources.at instead of stamping wall-clock time',
    /\? \{ \.\.\.entry\.markerSources\[key\] \}/.test(jsonImportBlock)
      && !/\? \{ \.\.\.entry\.markerSources\[key\], at: importTs \}/.test(jsonImportBlock));
  assert('JSON import mirrors insulin through shared lab entry helper',
    /setLabEntryMarker\(existing, key, value,[\s\S]{0,180}mirrorInsulin: true/.test(jsonImportBlock));
  const removeBlock = persistenceSrc.substring(persistenceSrc.indexOf('export async function removeImportedEntry'), persistenceSrc.indexOf('export async function renameImportedEntryDate'));
  assert('import delete records entries tombstone before removing row',
    /recordTombstone\(state\.importedData,\s*['"]entries['"],\s*date\)[\s\S]{0,180}deleteImportedArrayItems\(state\.importedData,\s*['"]entries['"],\s*e => e\.date === date\)/.test(removeBlock));
  assert('import delete uses immediate sync push',
    /await\s+saveImportedData\(\{\s*immediate:\s*true\s*\}\)/.test(removeBlock));
  assert('import delete restores state and returns false when save fails',
    /const rollback = snapshotImportedData\(\)[\s\S]{0,1600}if \(!saved\) \{[\s\S]{0,160}restoreImportedDataSnapshot\(rollback\)[\s\S]{0,120}return false/.test(removeBlock));
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
    /removeImportedEntryFromSettings[\s\S]{0,240}const ok = await removeImportedEntry\(date\)[\s\S]{0,80}if \(ok\) refreshDataEntriesSection\(\)/.test(settingsDataSrc));
  assert('Settings Data rename refreshes only after successful save',
    /renameImportedEntryDateFromSettings[\s\S]{0,260}const ok = await renameImportedEntryDate\(date\)[\s\S]{0,80}if \(ok\) refreshDataEntriesSection\(\)/.test(settingsDataSrc));
  assert('Settings Data Review & Edit lazy-loads pdf-import module before opening snapshot review',
    /loadPdfImport\(\)[\s\S]{0,160}closeSettingsModal\(\)[\s\S]{0,120}openImportReviewFromSnapshot\(actionEl\.dataset\.snapId/.test(settingsSrc)
      && /data-settings-action=\"review-import\"/.test(settingsDataSrc));
  assert('Settings Data import rows use wrapping metadata layout classes',
    settingsDataSrc.includes('imported-entry-snapshot')
      && settingsDataSrc.includes('class=\"ie-mainline\"')
      && settingsDataSrc.includes('class=\"ie-meta\"')
      && settingsDataSrc.includes('class=\"ie-file\"')
      && settingsDataSrc.includes('Imported time'));
  assert('Settings Data Other data counts only markers not owned by import snapshots',
    settingsDataSrc.includes('const legacyKeys = entryMarkerKeys.filter')
      && settingsDataSrc.includes('const manualNonSnapshotKeys = manualKeys.filter')
      && settingsDataSrc.includes('const otherKeys = legacyKeys.length ? legacyKeys : manualNonSnapshotKeys')
      && settingsDataSrc.includes('legacyEntries.push({ entry, otherKeys, manualKeys, hasSnapshotMarkers })')
      && /const cnt = otherKeys\.length/.test(settingsDataSrc));
  assert('Settings Data treats snapshot-derived HOMA-IR as snapshot-owned even for existing rows without marker source',
    settingsDataSrc.includes('isSnapshotDerivedHOMAIR')
      && settingsDataSrc.includes('isSnapshotDerivedHOMAIR(entry, k)')
      && /import \{ deleteLabEntryMarker, isSnapshotDerivedHOMAIR \} from ['"]\.\/lab-entry\.js['"]/.test(persistenceSrc)
      && /glucoseSource\.snapshotId === insulinSource\?\.snapshotId/.test(labEntrySrc)
      && persistenceSrc.includes('isSnapshotDerivedHOMAIR(entry, k)'));
  assert('HOMA-IR recalculation preserves snapshot ownership when glucose and insulin come from the same import snapshot',
    /ensureMarkerSources\(entry\)\['diabetes\.homaIR'\][\s\S]{0,260}snapshotId:\s*sharedSnapshotId/.test(read('js/lab-entry.js')));
  assert('Settings Data does not classify a date row as legacy only because importedWith is missing',
    !/if \(isFullyManual \|\| !entry\.importedWith\)/.test(settingsDataSrc));
  assert('Re-review tombstones an emptied old snapshot entry before deleting it',
    /if \(isReReview\)[\s\S]{0,1200}recordTombstone\(state\.importedData,\s*['"]entries['"],\s*oldEntry\.date\)[\s\S]{0,160}deleteImportedArrayItems\(state\.importedData,\s*['"]entries['"],\s*e => e === oldEntry\)/.test(confirmBlock));
  assert('Re-review purges manual value overrides for removed old snapshot markers',
    /if \(isReReview\)[\s\S]{0,700}const manualValues = state\.importedData\.manualValues \|\| \{\}/.test(confirmBlock)
      && /k\.endsWith\(':' \+ oldSnapshot\.date\)[\s\S]{0,120}removedKeys\.includes\(k\.split\(':'\)\[0\]\)[\s\S]{0,80}delete manualValues\[k\]/.test(confirmBlock));
  assert('Re-review upserts a snapshot row when the original snapshot was concurrently deleted',
    /if \(isReReview\)[\s\S]{0,260}clearTombstone\(state\.importedData,\s*['"]importSnapshots['"],\s*snapshotId\)/.test(confirmBlock)
      && /if \(snapIdx >= 0\)[\s\S]{0,420}else \{[\s\S]{0,120}state\.importedData\.importSnapshots\.push\(\{[\s\S]{0,80}id:\s*snapshotId/.test(confirmBlock));
  assert('Database bundle import merges importSnapshots into existing profiles',
    /Array\.isArray\(importData\.importSnapshots\)[\s\S]{0,260}ensureImportedArray\(current,\s*['"]importSnapshots['"]\)[\s\S]{0,700}appendImportedArrayItem\(current,\s*['"]importSnapshots['"],\s*snap\)/.test(exportSrc));
  assert('Import restore clears snapshot tombstones and updates newer duplicate snapshot ids',
    /clearTombstone\(state\.importedData,\s*['"]importSnapshots['"],\s*snap\.id\)/.test(exportSrc)
      && /clearTombstone\(current,\s*['"]importSnapshots['"],\s*snap\.id\)/.test(exportSrc)
      && /incomingAt >= existingAt/.test(exportSrc));
  assert('Existing profile migration backfills importSnapshots array',
    /if \(data\.importSnapshots === undefined\) data\.importSnapshots = \[\]/.test(profileSrc));
  assert('Import snapshots are tombstone-aware delta array records',
    /importSnapshots:\s*\{[\s\S]{0,180}itemIdFn/.test(read('js/sync-delta-surface-config.js'))
      && /recordTombstone\(state\.importedData,\s*['"]importSnapshots['"],\s*snapId\)/.test(confirmBlock)
      && /deleteImportedArrayItems\(state\.importedData,\s*['"]importSnapshots['"]/.test(confirmBlock));
  assert('Snapshot marker deletes use lab-entry tombstones and HOMA-IR recalculation',
    /import \{ deleteLabEntryMarker,/.test(src)
      && /deleteLabEntryMarker\(oldEntry, key,[\s\S]{0,80}mirrorInsulin:\s*true/.test(confirmBlock)
      && /deleteLabEntryMarker\(entry, key,[\s\S]{0,80}mirrorInsulin:\s*true/.test(confirmBlock)
      && !/delete\s+(?:oldEntry|entry)\.markers\[key\]/.test(confirmBlock));
  assert('Snapshot delete/re-review restores latest remaining same-date snapshot marker value',
    /function findLatestRestorableSnapshotMarker/.test(confirmBlock)
      && /s\.id !== excludedSnapshotId/.test(confirmBlock)
      && /snapshotMarkerDotKey\(marker\) !== dotKey/.test(confirmBlock)
      && /restoreLatestSnapshotMarkerForKey\(entry, snapshot, key\)/.test(confirmBlock)
      && /restoreLatestSnapshotMarkerForKey\(oldEntry, oldSnapshot, key, importTs\)/.test(confirmBlock));
  assert('Snapshot delete purges manual value overrides for removed snapshot markers',
    /const manualValues = state\.importedData\.manualValues \|\| \{\}/.test(confirmBlock)
      && /k\.endsWith\(':' \+ snapshot\.date\)[\s\S]{0,120}removedKeys\.includes\(k\.split\(':'\)\[0\]\)[\s\S]{0,80}delete manualValues\[k\]/.test(confirmBlock));
  assert('Legacy mixed-entry delete uses lab-entry tombstones and HOMA-IR recalculation',
    /import \{ deleteLabEntryMarker, isSnapshotDerivedHOMAIR \} from ['"]\.\/lab-entry\.js['"]/.test(persistenceSrc)
      && /deleteLabEntryMarker\(entry, k,[\s\S]{0,80}mirrorInsulin:\s*true/.test(removeBlock)
      && !/delete\s+entry\.markers\[k\]/.test(removeBlock));

  assert('Review snapshot modal tolerates stored costInfo without a cost field',
    /parseResult\.costInfo && typeof parseResult\.costInfo\.cost === ['"]number['"]/.test(reviewSrc));
  assert('Re-review modal uses update wording instead of import wording',
    /parseResult\._reReviewSnapshotId[\s\S]{0,140}Update Import/.test(reviewSrc)
      && /result\._reReviewSnapshotId[\s\S]{0,140}Update Import/.test(reviewSrc));
  assert('Import review mobile footer actions are sticky',
    /\.import-review-actions \{[\s\S]{0,160}position:\s*sticky[\s\S]{0,80}bottom:\s*0/.test(importCssSrc));
  assert('Review snapshot opener tolerates corrupt snapshot rows without marker arrays',
    /openImportReviewFromSnapshot[\s\S]{0,320}Array\.isArray\(snapshot\.markers\)[\s\S]{0,120}no saved marker review data/.test(confirmBlock));

  // ═══════════════════════════════════════
  // 4. normalizeToSI handles multiply type (inverse)
  // ═══════════════════════════════════════
  console.log('%c 4. Conversion logic ', 'font-weight:bold;color:#f59e0b');

  assert('divides by factor for multiply type', /value \/ \w+\.factor/.test(mappingSrc));
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

  const { normalizeParsedImportMarkers } = await import('../js/pdf-import-marker-normalization.js');
  const spadiaImport = normalizeParsedImportMarkers({
    testType: 'blood',
    markers: [
      { rawName: 'B Kyselina eikosapentaenová C20:5', value: 0.90, mappedKey: 'fattyAcids.epaC20_5', unit: '%', refMin: 3.23, refMax: 4.72 },
      { rawName: 'S Vitamin A', value: 2.39, mappedKey: 'vitamins.vitaminA', unit: 'µmol/l', refMin: 1.05, refMax: 2.80 },
    ],
  }, {
    fileName: 'Spadia 7-2024 Fatty Acids.pdf',
    sourceText: 'SPADIA LAB a. s. Mastné kyseliny',
    existingKeys: new Set(),
  });
  const spadiaFA = spadiaImport.markers[0];
  const spadiaVitaminA = spadiaImport.markers[1];
  assert('Blood-classified Spadia generic FA key is product-prefixed',
    spadiaFA
      && spadiaFA.matched === false
      && spadiaFA.mappedKey === null
      && spadiaFA.suggestedKey === 'spadiaFA.epaC20_5'
      && spadiaFA.suggestedCategoryLabel === 'Spadia'
      && spadiaFA.group === 'Fatty Acids',
    JSON.stringify(spadiaFA));
  assert('Blood-classified Spadia report keeps true blood markers mapped',
    spadiaVitaminA
      && spadiaVitaminA.matched === true
      && spadiaVitaminA.mappedKey === 'vitamins.vitaminA',
    JSON.stringify(spadiaVitaminA));

  // ═══════════════════════════════════════
  // 7. Import mapping reconciliation
  // ═══════════════════════════════════════
  console.log('%c 7. Import mapping reconciliation ', 'font-weight:bold;color:#f59e0b');

  assert('pdf-import exports reconcileImportMarkerMappings',
    /export\s*\{[^}]*reconcileImportMarkerMappings[^}]*\}\s*from\s*['"]\.\/pdf-import-marker-mapping\.js['"]/.test(src)
    && /export function reconcileImportMarkerMappings/.test(mappingSrc));
  assert('pdf-import re-exports tryParseJSON from AI utils',
    /export\s*\{[^}]*tryParseJSON[^}]*\}\s*from\s*['"]\.\/pdf-import-ai-utils\.js['"]/.test(src)
    && /export function tryParseJSON/.test(aiUtilsSrc));
  assert('pdf-import imports existing marker key lookup from mapping module',
    src.includes('getExistingImportMarkerKeys') && !src.includes('_getExistingImportMarkerKeys'));
  assert('Czech/Spadia alias table includes key labels',
    mappingSrc.includes("'glukoza', 'biochemistry.glucose'")
    && mappingSrc.includes("'horcikvery', 'electrolytes.magnesiumRBC'")
    && mappingSrc.includes("'homocystein', 'coagulation.homocysteine'")
    && mappingSrc.includes("'reverset3', 'thyroid.reverseT3'")
    && mappingSrc.includes("'ddimer', 'coagulation.dDimer'")
    && mappingSrc.includes("'cortisol', 'hormones.cortisol'"));

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
      'custom.eosinophilsLegacy': { name: 'Eosinophils %', unit: '%' },
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
      { rawName: 'Unknown Marker', value: 42, unit: 'x', matched: true, mappedKey: 'custom.unknownMarker', suggestedKey: null },
      { rawName: 'Lymphocytes %', value: 36.8, unit: '%', matched: true, mappedKey: 'differential.lymphocytes', suggestedKey: null },
      { rawName: 'Monocytes_PERCENTAGE', value: 7.4, unit: 'PERCENTAGE', matched: true, mappedKey: 'differential.monocytes', suggestedKey: null },
      { rawName: 'Eosinophils %', value: 4.1, unit: '%', matched: true, mappedKey: 'differential.eosinophils', suggestedKey: null },
      { rawName: 'Reverse T3', value: 0.33, unit: 'nmol/l', matched: false, mappedKey: null, suggestedKey: 'custom.reverseT3' },
      { rawName: 'D-dimer', value: 0.22, unit: 'mg/l FEU', matched: false, mappedKey: null, suggestedKey: 'custom.dDimer' },
      { rawName: 'Cortisol', value: 390, unit: 'nmol/l', matched: false, mappedKey: null, suggestedKey: 'custom.cortisol' },
      { rawName: 'Lp(a)', value: 42, unit: 'nmol/l', matched: false, mappedKey: null, suggestedKey: 'custom.lpa' }
    ];
    reconcileImportMarkerMappings(importMarkers, { testType: 'blood' });
    assert('Czech glucose reconciles to existing schema marker',
      importMarkers[0].matched && importMarkers[0].mappedKey === 'biochemistry.glucose');
    assert('Erythrocyte magnesium reconciles to magnesium RBC',
      importMarkers[1].matched && importMarkers[1].mappedKey === 'electrolytes.magnesiumRBC');
    assert('Active B12 reconciles to the standard vitamins schema marker',
      importMarkers[2].matched && importMarkers[2].mappedKey === 'vitamins.activeB12');
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
    assert('Differential lymphocyte percent maps to percentage marker despite AI absolute key',
      importMarkers[13].matched && importMarkers[13].mappedKey === 'differential.lymphocytesPct');
    assert('Differential monocyte percentage label maps to percentage marker despite AI absolute key',
      importMarkers[14].matched && importMarkers[14].mappedKey === 'differential.monocytesPct');
    assert('Unsupported differential percent does not overwrite absolute-count or stale custom marker',
      !importMarkers[15].matched && importMarkers[15].mappedKey === null && importMarkers[15].suggestedKey === 'differential.eosinophilsPct');
    assert('Biology-score specialty-adjacent blood markers reconcile to standard schema keys',
      importMarkers[16].matched && importMarkers[16].mappedKey === 'thyroid.reverseT3'
      && importMarkers[17].matched && importMarkers[17].mappedKey === 'coagulation.dDimer'
      && importMarkers[18].matched && importMarkers[18].mappedKey === 'hormones.cortisol'
      && importMarkers[19].matched && importMarkers[19].mappedKey === 'lipids.lpA',
      JSON.stringify(importMarkers.slice(16, 20)));
    const gutMarkers = [
      { rawName: 'Fecal Calprotectin', value: 20, unit: 'µg/g', matched: false, mappedKey: null, suggestedKey: 'custom.fecalCalprotectin' },
      { rawName: 'Zonulin', value: 40, unit: 'ng/ml', matched: false, mappedKey: null, suggestedKey: 'custom.zonulin' },
      { rawName: 'Secretory IgA', value: 900, unit: 'µg/g', matched: false, mappedKey: null, suggestedKey: 'custom.secretoryIgA' },
    ];
    reconcileImportMarkerMappings(gutMarkers, { testType: 'stool' });
    assert('Gut/stool specialty markers reconcile to adapter keys for Biology Scores',
      gutMarkers[0].matched && gutMarkers[0].mappedKey === 'stool.calprotectin'
      && gutMarkers[1].matched && gutMarkers[1].mappedKey === 'stool.zonulin'
      && gutMarkers[2].matched && gutMarkers[2].mappedKey === 'stool.secretoryIgA',
      JSON.stringify(gutMarkers));
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
  const cPeptideAlias = {
    entries: [{ date: '2026-05-01', markers: { 'hormones.cPeptide': 1.4 } }],
    customMarkers: { 'hormones.cPeptide': { name: 'C-peptide', unit: 'µg/l' } },
    markerValueNotes: { 'hormones.cPeptide:2026-05-01': 'legacy category' }
  };
  migrateProfileData(cPeptideAlias);
  assert('Profile migration canonicalizes legacy hormones.cPeptide to diabetes.cPeptide',
    cPeptideAlias.entries[0].markers['diabetes.cPeptide'] === 1.4
    && cPeptideAlias.entries[0].markers['hormones.cPeptide'] === undefined
    && cPeptideAlias.customMarkers['hormones.cPeptide'] === undefined
    && cPeptideAlias.markerValueNotes['diabetes.cPeptide:2026-05-01'] === 'legacy category');

  const lipidAliases = {
    entries: [{ date: '2026-05-01', markers: { 'lipids.lpa': 42, 'lipids.totalCholesterol': 4.6, 'lipids.hdlCholesterol': 1.4, 'lipids.cholHdlRatio': 3.3 } }],
    customMarkers: {
      'lipids.lpa': { name: 'Lipoprotein A (Lp(a))', unit: 'nmol/l' },
      'lipids.totalCholesterol': { name: 'Total Cholesterol', unit: 'mmol/l' },
      'lipids.hdlCholesterol': { name: 'HDL Cholesterol', unit: 'mmol/l' },
      'lipids.cholHdlRatio': { name: 'Total cholesterol/HDL ratio', unit: '' },
    },
    markerValueNotes: { 'lipids.lpa:2026-05-01': 'duplicate alias' }
  };
  migrateProfileData(lipidAliases);
  assert('Profile migration canonicalizes duplicate lipid aliases onto schema keys',
    lipidAliases.entries[0].markers['lipids.lpA'] === 42
    && lipidAliases.entries[0].markers['lipids.cholesterol'] === 4.6
    && lipidAliases.entries[0].markers['lipids.hdl'] === 1.4
    && lipidAliases.entries[0].markers['calculatedRatios.cholHdlRatio'] === 3.3
    && lipidAliases.entries[0].markers['lipids.lpa'] === undefined
    && lipidAliases.customMarkers['lipids.lpa'] === undefined
    && lipidAliases.markerValueNotes['lipids.lpA:2026-05-01'] === 'duplicate alias');

  const lipidNameAlias = {
    entries: [{ date: '2026-05-01', markers: { 'lipids.lipoproteinMarker': 55 } }],
    customMarkers: { 'lipids.lipoproteinMarker': { name: 'Lipoprotein A', unit: 'nmol/l' } }
  };
  migrateProfileData(lipidNameAlias);
  assert('Profile migration canonicalizes named Lipoprotein A custom duplicates',
    lipidNameAlias.entries[0].markers['lipids.lpA'] === 55
    && lipidNameAlias.customMarkers['lipids.lipoproteinMarker'] === undefined);

  const savedSpadiaFA = {
    entries: [{
      date: '2024-07-04',
      sourceFile: 'Spadia 7-2024 Fatty Acids.pdf',
      sourceFiles: ['Spadia 7-2024 Fatty Acids.pdf'],
      markers: { 'fattyAcids.epaC20_5': 0.90, 'vitamins.vitaminA': 2.39 },
      markerSources: {
        'fattyAcids.epaC20_5': { file: 'Spadia 7-2024 Fatty Acids.pdf', snapshotId: 'snap_spadia' },
        'vitamins.vitaminA': { file: 'Spadia 7-2024 Fatty Acids.pdf', snapshotId: 'snap_spadia' },
      },
    }],
    customMarkers: {
      'fattyAcids.epaC20_5': { name: 'EPA C20:5', unit: '%', refMin: 3.23, refMax: 4.72, categoryLabel: 'Fatty Acids', group: 'Fatty Acids' },
    },
    importSnapshots: [{
      id: 'snap_spadia',
      fileName: 'Spadia 7-2024 Fatty Acids.pdf',
      date: '2024-07-04',
      markers: [
        { rawName: 'B Kyselina eikosapentaenová C20:5', value: 0.90, unit: '%', mappedKey: 'fattyAcids.epaC20_5', suggestedKey: null, matched: true },
        { rawName: 'S Vitamin A', value: 2.39, unit: 'µmol/l', mappedKey: 'vitamins.vitaminA', suggestedKey: null, matched: true },
      ],
    }],
    markerValueNotes: { 'fattyAcids.epaC20_5:2024-07-04': 'already imported note' },
    markerLabels: { 'fattyAcids.epaC20_5': 'EPA label' },
  };
  migrateProfileData(savedSpadiaFA);
  assert('Profile migration moves saved Spadia generic FA marker to spadiaFA',
    savedSpadiaFA.entries[0].markers['spadiaFA.epaC20_5'] === 0.90
    && savedSpadiaFA.entries[0].markers['fattyAcids.epaC20_5'] === undefined);
  assert('Profile migration preserves standard markers in saved Spadia report',
    savedSpadiaFA.entries[0].markers['vitamins.vitaminA'] === 2.39);
  assert('Profile migration remaps Spadia marker source metadata',
    savedSpadiaFA.entries[0].markerSources['spadiaFA.epaC20_5']?.snapshotId === 'snap_spadia'
    && savedSpadiaFA.entries[0].markerSources['fattyAcids.epaC20_5'] === undefined);
  assert('Profile migration creates Spadia category metadata',
    savedSpadiaFA.customMarkers['spadiaFA.epaC20_5']?.categoryLabel === 'Spadia'
    && savedSpadiaFA.customMarkers['spadiaFA.epaC20_5']?.group === 'Fatty Acids'
    && savedSpadiaFA.customMarkers['fattyAcids.epaC20_5'] === undefined);
  assert('Profile migration remaps saved Spadia import snapshot marker',
    savedSpadiaFA.importSnapshots[0].markers[0].mappedKey === 'spadiaFA.epaC20_5'
    && savedSpadiaFA.importSnapshots[0].markers[0].suggestedCategoryLabel === 'Spadia'
    && savedSpadiaFA.importSnapshots[0].markers[1].mappedKey === 'vitamins.vitaminA');
  assert('Profile migration remaps saved Spadia marker notes and labels',
    savedSpadiaFA.markerValueNotes['spadiaFA.epaC20_5:2024-07-04'] === 'already imported note'
    && savedSpadiaFA.markerLabels['spadiaFA.epaC20_5'] === 'EPA label'
    && savedSpadiaFA.markerValueNotes['fattyAcids.epaC20_5:2024-07-04'] === undefined
    && savedSpadiaFA.markerLabels['fattyAcids.epaC20_5'] === undefined);

  const savedGenericFA = {
    entries: [{
      date: '2024-07-04',
      sourceFile: 'Other Lab Fatty Acids.pdf',
      markers: { 'fattyAcids.epaC20_5': 0.90 },
    }],
    customMarkers: {
      'fattyAcids.epaC20_5': { name: 'EPA C20:5', unit: '%', categoryLabel: 'Fatty Acids', group: 'Fatty Acids' },
    },
  };
  migrateProfileData(savedGenericFA);
  assert('Profile migration leaves non-Spadia generic FA marker unchanged',
    savedGenericFA.entries[0].markers['fattyAcids.epaC20_5'] === 0.90
    && savedGenericFA.entries[0].markers['spadiaFA.epaC20_5'] === undefined
    && savedGenericFA.customMarkers['fattyAcids.epaC20_5']);

  // ═══════════════════════════════════════
  // Results
  // ═══════════════════════════════════════
console.log(`\nResults: ${pass} passed, ${fail} failed, ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
