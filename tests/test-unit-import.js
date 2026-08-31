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
const commitSrc = read('js/pdf-import-commit.js');
const aiUtilsSrc = read('js/pdf-import-ai-utils.js');
const exportSrc = read('js/export.js');
const exportImportSrc = read('js/export-import.js');
const mappingSrc = read('js/pdf-import-marker-mapping.js');
const schemaSrc = read('js/schema.js');
const normalizationSrc = read('js/pdf-import-marker-normalization.js');
const persistenceSrc = read('js/pdf-import-persistence.js');
const settingsDataSrc = read('js/settings-data.js');
const settingsSrc = read('js/settings.js');
const reviewSrc = read('js/pdf-import-review.js');
const reviewRuntimeSrc = read('js/pdf-import-review-runtime.js');
const progressSrc = read('js/pdf-import-progress.js');
const labEntrySrc = read('js/lab-entry.js');
const profileSrc = read('js/profile.js');
const profileDataMigrationsSrc = read('js/profile-data-migrations.js');
const importCssSrc = read('css/import.css');
  // ═══════════════════════════════════════
  // 1. normalizeToSI function exists
  // ═══════════════════════════════════════
  console.log('%c 1. normalizeToSI function ', 'font-weight:bold;color:#f59e0b');

  assert('normalizeToSI is schema-owned and re-exported by the import mapper',
    schemaSrc.includes('function normalizeToSI(')
      && /export\s*\{\s*normalizeToSI\s*\}/.test(mappingSrc));
  assert('normalizeToSI checks UNIT_CONVERSIONS', schemaSrc.includes('UNIT_CONVERSIONS[key]'));
  assert('clinical unit normalization handles µ variants',
    schemaSrc.includes('normalizeClinicalUnit') && schemaSrc.includes('\\u03bc'));

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

  const confirmBlock = commitSrc.substring(commitSrc.indexOf('function confirmImport'));
  assert('pdf-import facade re-exports commit actions',
    /export\s*\{[^}]*confirmImport[^}]*deleteImportSnapshot[^}]*openImportReviewFromSnapshot[^}]*\}\s*from\s*['"]\.\/pdf-import-commit\.js['"]/.test(src));
  assert('matched markers normalized',
    confirmBlock.includes('normalizeToSI(m.mappedKey, m.value, m.unit, m)'));
  assert('new (custom) markers normalized',
    confirmBlock.includes('normalizeToSI(m.suggestedKey, m.value, m.unit, m)'));
  assert('confirmImport waits for async save before closing UI',
    commitSrc.includes('export async function confirmImport') && /await\s+saveImportedData\([^)]*\)/.test(confirmBlock));
  assert('PDF import requests immediate sync push after durable save',
    /await\s+saveImportedData\(\{\s*immediate:\s*true\s*\}\)/.test(confirmBlock));
  assert('PDF import clears same-date entry tombstone when intentionally re-importing',
    /findOrCreateLabEntry\(state\.importedData,\s*result\.date,\s*\{ now: importTs \}\)/.test(confirmBlock));
  assert('PDF import rolls back in-memory state when durable save fails',
    /const rollback = snapshotImportedData\(\)/.test(confirmBlock)
      && /if \(!saved\) \{[\s\S]{0,200}restoreImportedDataSnapshot\(rollback\)/.test(confirmBlock));
  const jsonImportBlock = exportImportSrc.substring(exportImportSrc.indexOf('export function importDataJSON'), exportImportSrc.indexOf('function importContextField'));
  assert('JSON import preserves markerSources.at instead of stamping wall-clock time',
    /\? \{ \.\.\.entry\.markerSources\[key\] \}/.test(jsonImportBlock)
      && !/\? \{ \.\.\.entry\.markerSources\[key\], at: importTs \}/.test(jsonImportBlock));
  assert('JSON import canonicalizes insulin through the shared lab entry helper',
    /setLabEntryMarker\(existing, key, value,/.test(jsonImportBlock));
  assert('JSON import implementation loads only on the first import action',
    !exportSrc.includes("from './export-import.js'")
      && exportSrc.includes("import('./export-import.js')")
      && exportSrc.includes("import('./export-import.js?lazy-retry=1')"));
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
  assert('Settings Data Review & Edit lazy-loads the complete import UI before opening snapshot review',
    /loadImportUI\(\)[\s\S]{0,160}closeSettingsModal\(\)[\s\S]{0,120}openImportReviewFromSnapshot\(actionEl\.dataset\.snapId/.test(settingsSrc)
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
    /if \(isReReview\)[\s\S]{0,1500}recordTombstone\(state\.importedData,\s*['"]entries['"],\s*oldEntry\.date\)[\s\S]{0,160}deleteImportedArrayItems\(state\.importedData,\s*['"]entries['"],\s*e => e === oldEntry\)/.test(confirmBlock));
  assert('Re-review purges manual value overrides for removed old snapshot markers',
    /if \(isReReview\)[\s\S]{0,1200}const manualValues = state\.importedData\.manualValues \|\| \{\}/.test(confirmBlock)
      && /k\.endsWith\(':' \+ oldSnapshot\.date\)[\s\S]{0,120}removedKeys\.includes\(k\.split\(':'\)\[0\]\)[\s\S]{0,80}delete manualValues\[k\]/.test(confirmBlock));
  assert('Re-review upserts a snapshot row when the original snapshot was concurrently deleted',
    /if \(isReReview\)[\s\S]{0,260}clearTombstone\(state\.importedData,\s*['"]importSnapshots['"],\s*snapshotId\)/.test(confirmBlock)
      && /if \(snapIdx >= 0\)[\s\S]{0,420}else \{[\s\S]{0,120}state\.importedData\.importSnapshots\.push\(\{[\s\S]{0,80}id:\s*snapshotId/.test(confirmBlock));
  assert('Database bundle import merges importSnapshots into existing profiles',
    /Array\.isArray\(importData\.importSnapshots\)[\s\S]{0,260}ensureImportedArray\(current,\s*['"]importSnapshots['"]\)[\s\S]{0,700}appendImportedArrayItem\(current,\s*['"]importSnapshots['"],\s*snap\)/.test(exportImportSrc));
  assert('Import restore clears snapshot tombstones and updates newer duplicate snapshot ids',
    /clearTombstone\(state\.importedData,\s*['"]importSnapshots['"],\s*snap\.id\)/.test(exportImportSrc)
      && /clearTombstone\(current,\s*['"]importSnapshots['"],\s*snap\.id\)/.test(exportImportSrc)
      && /incomingAt >= existingAt/.test(exportImportSrc));
  assert('Existing profile migration backfills importSnapshots array',
    /if \(data\.importSnapshots === undefined\) data\.importSnapshots = \[\]/.test(profileDataMigrationsSrc));
  assert('Import snapshots are tombstone-aware delta array records',
    /importSnapshots:\s*\{[\s\S]{0,180}itemIdFn/.test(read('js/sync-delta-surface-config.js'))
      && /recordTombstone\(state\.importedData,\s*['"]importSnapshots['"],\s*snapId\)/.test(confirmBlock)
      && /deleteImportedArrayItems\(state\.importedData,\s*['"]importSnapshots['"]/.test(confirmBlock));
  assert('Snapshot marker deletes use lab-entry tombstones and HOMA-IR recalculation',
    /import \{[\s\S]{0,220}deleteLabEntryMarker,[\s\S]{0,220}from ['"]\.\/lab-entry\.js['"]/.test(commitSrc)
      && /deleteLabEntryMarker\(oldEntry, key, \{ now: importTs \}\)/.test(confirmBlock)
      && /deleteLabEntryMarker\(entry, key\)/.test(confirmBlock)
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
      && /deleteLabEntryMarker\(entry, k, \{ now \}\)/.test(removeBlock)
      && !/delete\s+entry\.markers\[k\]/.test(removeBlock));

  assert('Review snapshot modal tolerates stored costInfo without a cost field',
    /parseResult\.costInfo && typeof parseResult\.costInfo\.cost === ['"]number['"]/.test(reviewSrc));
  assert('Import review browser state is isolated in runtime adapter',
    reviewSrc.includes("from './pdf-import-review-runtime.js'")
      && !/\bwindow(?:\.|\s*\[)/.test(reviewSrc)
      && reviewRuntimeSrc.includes('runtime._pendingImport')
      && reviewRuntimeSrc.includes('runtime._batchImportContext')
      && !reviewRuntimeSrc.includes('getViewRuntimeFunction'));
  assert('PDF import persistence delegates view refresh through runtime adapter',
    persistenceSrc.includes("from './pdf-import-review-runtime.js'")
      && persistenceSrc.includes('refreshImportedDataViewsRuntime(state.currentView')
      && reviewRuntimeSrc.includes('export function refreshImportedDataViewsRuntime')
      && !/\bwindow(?:\.|\s*\[)/.test(persistenceSrc));
  assert('PDF import progress delegates dashboard fallback navigation through runtime adapter',
    progressSrc.includes("from './pdf-import-review-runtime.js'")
      && progressSrc.includes("navigateImportReviewRuntime('dashboard')")
      && reviewRuntimeSrc.includes('export function navigateImportReviewRuntime')
      && !/\bwindow(?:\.|\s*\[)/.test(progressSrc));
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

  assert('divides by factor for multiply type', /value \/ \w+\.factor/.test(schemaSrc));
  assert('handles hba1c inverse', schemaSrc.includes('(value - 2.15) * 10.929'));

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

  // Calcitriol: 60 pg/mL (= 60 ng/L) → ~144.0 pmol/L
  const calcSI = testNormalize('vitamins.calcitriol', 60, 'pg/ml');
  assert('Calcitriol 60 pg/mL → ~144.0 pmol/L',
    Math.abs(calcSI - 144.0) < 1, `got ${calcSI}`);

  // Free T4: 1.2 ng/dL → ~15.44 pmol/L
  const ft4SI = testNormalize('thyroid.ft4', 1.2, 'ng/dl');
  assert('Free T4 1.2 ng/dL → ~15.44 pmol/L',
    Math.abs(ft4SI - 15.44) < 0.5, `got ${ft4SI}`);

  // Free T3: the common conventional unit is pg/mL; pg/dL is 100× smaller.
  const ft3SI = testNormalize('thyroid.ft3', 3.5, 'pg/ml');
  assert('Free T3 3.5 pg/mL → ~5.37 pmol/L',
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

  // Broad/hybrid adapters still require AI agreement, while adapters with
  // conservative product signatures can safely correct a mistaken blood type.
  assert('Adapter normalization distinguishes product-scoped detection',
    normalizationSrc.includes("testType !== 'blood'")
    && normalizationSrc.includes('detectedProductScoped')
    && normalizationSrc.includes('needsAdapterNormalize'));

  // Verify guard at line 367 only fires for non-blood tests
  assert('Guard checks testType !== blood',
    normalizationSrc.includes("testType !== 'blood'") && normalizationSrc.includes('Import Guard'));

  const { normalizeParsedImportMarkers } = await import('../js/pdf-import-marker-normalization.js');
  const spadiaImport = normalizeParsedImportMarkers({
    testType: 'blood',
    markers: [
      { rawName: 'B Kyselina eikosapentaenová C20:5', value: 0.90, mappedKey: 'fattyAcids.epaC20_5', unit: '%', refMin: 3.23, refMax: 4.72 },
      { rawName: 'S Vitamin A', value: 2.39, mappedKey: 'vitamins.vitaminA', unit: 'µmol/l', refMin: 1.05, refMax: 2.80 },
      { rawName: 'Unknown FA Segment', value: 1.23, mappedKey: 'fattyAcids.epa', unit: '%' },
      { rawName: 'Malformed FA Segment', value: 1.11, mappedKey: 'fattyAcids.epa.c20_5', unit: '%' },
    ],
  }, {
    fileName: 'EDG328K.pdf',
    sourceText: 'SPADIA LAB a. s. Mastné kyseliny',
    existingKeys: new Set(),
  });
  const spadiaFA = spadiaImport.markers[0];
  const spadiaVitaminA = spadiaImport.markers[1];
  const spadiaUnknownFA = spadiaImport.markers[2];
  const spadiaMalformedFA = spadiaImport.markers[3];
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
  assert('Blood-classified Spadia guard product-prefixes unknown generic FA keys',
    spadiaUnknownFA
      && spadiaUnknownFA.matched === false
      && spadiaUnknownFA.mappedKey === null
      && spadiaUnknownFA.suggestedKey === 'spadiaFA.epa'
      && spadiaUnknownFA.suggestedCategoryLabel === 'Spadia'
      && spadiaUnknownFA.group === 'Fatty Acids',
    JSON.stringify(spadiaUnknownFA));
  assert('Blood-classified Spadia guard demotes malformed generic FA keys',
    spadiaMalformedFA
      && spadiaMalformedFA.matched === false
      && spadiaMalformedFA.mappedKey === null
      && spadiaMalformedFA.suggestedKey === null,
    JSON.stringify(spadiaMalformedFA));

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
    && mappingSrc.includes("'cortisol', 'hormones.cortisol'")
    && mappingSrc.includes("'cholhdl', 'calculatedRatios.cholHdlRatio'"));

  const { buildMarkerReference, reconcileImportMarkerMappings } = await import('../js/pdf-import.js');
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
    const markerRef = buildMarkerReference();
    const reportableCalculatedKeys = [
      'calculatedRatios.tgHdlRatio',
      'calculatedRatios.ldlHdlRatio',
      'calculatedRatios.apoBapoAIRatio',
      'calculatedRatios.cholHdlRatio',
      'calculatedRatios.nlr',
      'calculatedRatios.plr',
      'calculatedRatios.mlr',
      'calculatedRatios.deRitisRatio',
      'calculatedRatios.copperZincRatio',
      'calculatedRatios.ft3ft4Ratio',
      'calculatedRatios.bunCreatRatio',
      'calculatedRatios.crpHdlRatio',
      'calculatedRatios.atherogenicIndexPlasma',
      'calculatedRatios.tygIndex',
      'calculatedRatios.albuminGlobulinRatio',
      'calculatedRatios.fib4Index',
      'calculatedRatios.systemicImmuneInflammationIndex',
      'calculatedRatios.anionGap',
    ];
    assert('Import reference exposes every reportable calculated ratio under its canonical key',
      reportableCalculatedKeys.every(key => markerRef[key] != null)
      && markerRef['lipids.cholHdlRatio'] == null);
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
      { rawName: 'Lp(a)', value: 42, unit: 'nmol/l', matched: false, mappedKey: null, suggestedKey: 'custom.lpa' },
      { rawName: 'Total Cholesterol/HDL Ratio', value: 3.4, unit: '', matched: false, mappedKey: null, suggestedKey: 'custom.cholHdlRatio' },
      { rawName: 'Basophils %', value: 0.6, unit: '%', refMin: 0, refMax: 2, matched: false, mappedKey: null, suggestedKey: 'custom.basophilsPct' }
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
    assert('Urine total protein reconciles to the quantitative urinalysis marker',
      importMarkers[7].matched
      && importMarkers[7].mappedKey === 'urinalysis.totalProtein'
      && importMarkers[7].suggestedKey === null);
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
    assert('Differential eosinophil percent maps to percentage marker',
      importMarkers[15].matched && importMarkers[15].mappedKey === 'differential.eosinophilsPct');
    assert('Differential basophil percent maps to percentage marker',
      importMarkers[21].matched && importMarkers[21].mappedKey === 'differential.basophilsPct');
    assert('Biology-score specialty-adjacent blood markers reconcile to standard schema keys',
      importMarkers[16].matched && importMarkers[16].mappedKey === 'thyroid.reverseT3'
      && importMarkers[17].matched && importMarkers[17].mappedKey === 'coagulation.dDimer'
      && importMarkers[18].matched && importMarkers[18].mappedKey === 'hormones.cortisol'
      && importMarkers[19].matched && importMarkers[19].mappedKey === 'lipids.lpA',
      JSON.stringify(importMarkers.slice(16, 20)));
    assert('Lab-reported total cholesterol/HDL ratio maps to canonical calculated ratio key',
      importMarkers[20].matched && importMarkers[20].mappedKey === 'calculatedRatios.cholHdlRatio',
      JSON.stringify(importMarkers[20]));
    const calculatedMarkers = [
      { rawName: 'TG/HDL Ratio', value: 1.2, unit: '', matched: false, mappedKey: null, suggestedKey: 'biochemistry.tgHdl' },
      { rawName: 'Neutrophil-to-Lymphocyte Ratio', value: 2.1, unit: '', matched: false, mappedKey: null, suggestedKey: 'hematology.nlr' },
      { rawName: 'AST/ALT Ratio', value: 0.9, unit: '', matched: false, mappedKey: null, suggestedKey: 'biochemistry.astAlt' },
      { rawName: 'BUN/Creatinine Ratio', value: 17, unit: '', matched: false, mappedKey: null, suggestedKey: 'biochemistry.bunCreat' },
      { rawName: 'hs-CRP/HDL-C Ratio', value: 0.03, unit: '', matched: false, mappedKey: null, suggestedKey: 'biochemistry.crpHdl' },
      { rawName: 'Atherogenic Index of Plasma', value: 0.15, unit: '', matched: false, mappedKey: null, suggestedKey: 'custom.aip' },
      { rawName: 'TyG Index', value: 8.7, unit: '', matched: false, mappedKey: null, suggestedKey: 'custom.tyg' },
      { rawName: 'Albumin/Globulin Ratio', value: 1.8, unit: '', matched: false, mappedKey: null, suggestedKey: 'custom.agr' },
      { rawName: 'FIB-4 Index', value: 1.1, unit: '', matched: false, mappedKey: null, suggestedKey: 'custom.fib4' },
      { rawName: 'Systemic Immune-Inflammation Index', value: 450, unit: '10^9/l', matched: false, mappedKey: null, suggestedKey: 'custom.sii' },
      { rawName: 'Monocyte-to-Lymphocyte Ratio', value: 0.25, unit: '', matched: false, mappedKey: null, suggestedKey: 'custom.mlr' },
      { rawName: 'Anion Gap', value: 11, unit: 'mmol/l', matched: false, mappedKey: null, suggestedKey: 'custom.anionGap' },
    ];
    reconcileImportMarkerMappings(calculatedMarkers, { testType: 'blood' });
    assert('Lab-reported added calculations map to canonical calculated keys',
      calculatedMarkers.map(marker => marker.mappedKey).join(',') === [
        'calculatedRatios.tgHdlRatio',
        'calculatedRatios.nlr',
        'calculatedRatios.deRitisRatio',
        'calculatedRatios.bunCreatRatio',
        'calculatedRatios.crpHdlRatio',
        'calculatedRatios.atherogenicIndexPlasma',
        'calculatedRatios.tygIndex',
        'calculatedRatios.albuminGlobulinRatio',
        'calculatedRatios.fib4Index',
        'calculatedRatios.systemicImmuneInflammationIndex',
        'calculatedRatios.mlr',
        'calculatedRatios.anionGap',
      ].join(','),
      JSON.stringify(calculatedMarkers));
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
  const legacyProlactinRange = {
    entries: [{
      date: '2026-04-01',
      markers: { 'hormones.prolactin': 12.44 },
      markerSources: { 'hormones.prolactin': { file: 'hormones.pdf', snapshotId: 'snap_prl' } },
    }],
    refOverrides: {
      'hormones.prolactin': { refMin: 86, refMax: 324, refSource: 'import' },
    },
    importSnapshots: [{
      id: 'snap_prl', date: '2026-04-01', fileName: 'hormones.pdf',
      markers: [{ mappedKey: 'hormones.prolactin', value: 263.7, unit: 'mIU/l', refMin: 86, refMax: 324 }],
    }],
  };
  migrateProfileData(legacyProlactinRange);
  assert('Profile migration converts snapshot-backed prolactin lab ranges from mIU/L to µg/L',
    Math.abs(legacyProlactinRange.refOverrides['hormones.prolactin'].refMin - (86 / 21.2)) < 0.001
      && Math.abs(legacyProlactinRange.refOverrides['hormones.prolactin'].refMax - (324 / 21.2)) < 0.001
      && legacyProlactinRange.entries[0].markers['hormones.prolactin'] === 12.44);
  const manualProlactinRange = {
    entries: [{ date: '2026-04-01', markers: { 'hormones.prolactin': 12.44 } }],
    refOverrides: {
      'hormones.prolactin': {
        refMin: 5, refMax: 14, refSource: 'manual', labRefMin: 86, labRefMax: 324,
      },
    },
    importSnapshots: legacyProlactinRange.importSnapshots.map(snapshot => ({
      ...snapshot,
      markers: snapshot.markers.map(marker => ({ ...marker })),
    })),
  };
  migrateProfileData(manualProlactinRange);
  assert('Profile migration preserves manual prolactin ranges while repairing the stashed lab interval',
    manualProlactinRange.refOverrides['hormones.prolactin'].refMin === 5
      && manualProlactinRange.refOverrides['hormones.prolactin'].refMax === 14
      && Math.abs(manualProlactinRange.refOverrides['hormones.prolactin'].labRefMax - (324 / 21.2)) < 0.001);
  const urineProtein = {
    entries: [{ date: '2026-05-01', markers: { 'urinalysis.totalProtein': 0.142 } }],
    customMarkers: {
      'urinalysis.totalProtein': { name: 'Celková bílkovina', unit: 'g/l' }
    }
  };
  migrateProfileData(urineProtein);
  assert('Profile migration adopts the exact urine marker without remapping it to serum total protein',
    urineProtein.entries[0].markers['urinalysis.totalProtein'] === 0.142
    && urineProtein.entries[0].markers['proteins.totalProtein'] === undefined
    && urineProtein.customMarkers['urinalysis.totalProtein'] === undefined);
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

  const legacyUnsupportedDifferentialPct = {
    entries: [{
      date: '2026-05-20',
      markers: {
        'differential.eosinophilsPct': 4.1,
        'differential.basophilsPct': 0.6,
      },
      markerSources: {
        'differential.eosinophilsPct': { file: 'cbc.pdf', snapshotId: 'snap_cbc_new_pct' },
        'differential.basophilsPct': { file: 'cbc.pdf', snapshotId: 'snap_cbc_new_pct' },
      },
    }],
    customMarkers: {
      'differential.eosinophilsPct': { name: 'Eosinophils %', unit: '%', refMin: 0, refMax: 5 },
      'differential.basophilsPct': { name: 'Basophils %', unit: '%', refMin: 0, refMax: 2 },
    },
    importSnapshots: [{
      id: 'snap_cbc_new_pct',
      fileName: 'cbc.pdf',
      date: '2026-05-20',
      markers: [
        { rawName: 'Eosinophils %', value: 4.1, unit: '%', suggestedKey: 'differential.eosinophilsPct', matched: false, refMin: 0, refMax: 5 },
        { rawName: 'Basophils %', value: 0.6, unit: '%', suggestedKey: 'differential.basophilsPct', matched: false, refMin: 0, refMax: 2 },
      ],
    }],
    refOverrides: {
      'differential.eosinophilsPct': { refMin: 0, refMax: 5, labRefMin: 0, labRefMax: 5, refSource: 'import' },
      'differential.basophilsPct': { refMin: 0, refMax: 2, labRefMin: 0, labRefMax: 2, refSource: 'import' },
    },
  };
  migrateProfileData(legacyUnsupportedDifferentialPct);
  assert('Profile migration canonicalizes newly-supported differential percent custom markers',
    legacyUnsupportedDifferentialPct.entries[0].markers['differential.eosinophilsPct'] === 0.041
    && legacyUnsupportedDifferentialPct.entries[0].markers['differential.basophilsPct'] === 0.006
    && legacyUnsupportedDifferentialPct.customMarkers['differential.eosinophilsPct'] === undefined
    && legacyUnsupportedDifferentialPct.customMarkers['differential.basophilsPct'] === undefined);
  assert('Profile migration repairs newly-supported differential percent snapshots and ranges',
    legacyUnsupportedDifferentialPct.importSnapshots[0].markers[0].mappedKey === 'differential.eosinophilsPct'
    && legacyUnsupportedDifferentialPct.importSnapshots[0].markers[0].suggestedKey === null
    && legacyUnsupportedDifferentialPct.importSnapshots[0].markers[0].matched === true
    && legacyUnsupportedDifferentialPct.importSnapshots[0].markers[1].mappedKey === 'differential.basophilsPct'
    && legacyUnsupportedDifferentialPct.refOverrides['differential.eosinophilsPct'].refMax === 0.05
    && legacyUnsupportedDifferentialPct.refOverrides['differential.basophilsPct'].refMax === 0.02);

  const dividedDifferentialPct = {
    entries: [{
      date: '2026-06-01',
      markers: {
        'differential.neutrophilsPct': 0.00609,
        'differential.monocytesPct': 0.00074,
        'differential.lymphocytesPct': 0.328,
        'differential.eosinophilsPct': 0.00041,
        'differential.basophilsPct': 0.00006,
      },
      markerSources: {
        'differential.neutrophilsPct': { file: 'cbc.pdf', snapshotId: 'snap_cbc_fraction_pct' },
        'differential.monocytesPct': { file: 'cbc.pdf', snapshotId: 'snap_cbc_fraction_pct' },
        'differential.lymphocytesPct': { file: 'cbc.pdf', snapshotId: 'snap_cbc_fraction_pct' },
        'differential.eosinophilsPct': { file: 'cbc.pdf', snapshotId: 'snap_cbc_fraction_pct' },
        'differential.basophilsPct': { file: 'cbc.pdf', snapshotId: 'snap_cbc_fraction_pct' },
      },
    }],
    importSnapshots: [{
      id: 'snap_cbc_fraction_pct',
      fileName: 'cbc.pdf',
      date: '2026-06-01',
      markers: [
        { rawName: 'B Neutrofily', value: 0.609, unit: '%', mappedKey: 'differential.neutrophilsPct', matched: true, refMin: 0.45, refMax: 0.70 },
        { rawName: 'B Monocyty', value: 0.074, unit: 'PERCENTAGE', mappedKey: 'differential.monocytesPct', matched: true, refMin: 0.02, refMax: 0.12 },
        { rawName: 'B Lymfocyty', value: 0.328, unit: '%', mappedKey: 'differential.lymphocytesPct', matched: true, refMin: 0.20, refMax: 0.45 },
        { rawName: 'B Eosinofily', value: 0.041, unit: '%', mappedKey: 'differential.eosinophilsPct', matched: true, refMin: 0.00, refMax: 0.05 },
        { rawName: 'B Basofily', value: 0.006, unit: '%', mappedKey: 'differential.basophilsPct', matched: true, refMin: 0.00, refMax: 0.02 },
      ],
    }],
    refOverrides: {
      'differential.neutrophilsPct': { refMin: 0.0045, refMax: 0.007, labRefMin: 0.0045, labRefMax: 0.007, refSource: 'import' },
    },
  };
  migrateProfileData(dividedDifferentialPct);
  assert('Profile migration repairs fraction-stored differential percent values divided during import',
    dividedDifferentialPct.entries[0].markers['differential.neutrophilsPct'] === 0.609
    && dividedDifferentialPct.entries[0].markers['differential.monocytesPct'] === 0.074
    && dividedDifferentialPct.entries[0].markers['differential.lymphocytesPct'] === 0.328
    && dividedDifferentialPct.entries[0].markers['differential.eosinophilsPct'] === 0.041
    && dividedDifferentialPct.entries[0].markers['differential.basophilsPct'] === 0.006);
  assert('Profile migration repairs divided imported differential percent reference overrides',
    dividedDifferentialPct.refOverrides['differential.neutrophilsPct'].refMin === 0.45
    && dividedDifferentialPct.refOverrides['differential.neutrophilsPct'].refMax === 0.70
    && dividedDifferentialPct.refOverrides['differential.neutrophilsPct'].labRefMin === 0.45
    && dividedDifferentialPct.refOverrides['differential.neutrophilsPct'].labRefMax === 0.70);

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

  const calculatedRatioAliases = {
    entries: [{
      date: '2026-05-01',
      markers: { 'biochemistry.fib4': 1.14 },
      markerSources: { 'biochemistry.fib4': { file: 'liver-panel.pdf', snapshotId: 'snap_fib4_old' } },
    }, {
      date: '2026-06-01',
      markers: {
        'biochemistry.fib4Index': 1.21,
        'calculatedRatios.fib4Index': 1.23,
      },
      markerSources: {
        'biochemistry.fib4Index': { file: 'old-liver-panel.pdf' },
        'calculatedRatios.fib4Index': { file: 'new-liver-panel.pdf' },
      },
    }],
    customMarkers: {
      'biochemistry.fib4': { name: 'FIB-4', unit: '', categoryLabel: 'Biochemistry' },
      'biochemistry.fib4Index': { name: 'FIB-4 Index', unit: '', categoryLabel: 'Biochemistry' },
    },
    importSnapshots: [{
      id: 'snap_fib4_old',
      date: '2026-05-01',
      markers: [{
        rawName: 'FIB-4', value: 1.14, unit: '', mappedKey: null,
        suggestedKey: 'biochemistry.fib4', matched: false,
      }],
    }],
    refOverrides: {
      'biochemistry.fib4': { refMin: 0, refMax: 1.3, refSource: 'import' },
    },
    markerNotes: { 'biochemistry.fib4': 'Reported by the lab' },
    markerValueNotes: { 'biochemistry.fib4:2026-05-01': 'legacy ratio note' },
  };
  migrateProfileData(calculatedRatioAliases);
  assert('Profile migration moves historical FIB-4 values into Calculated Ratios',
    calculatedRatioAliases.entries[0].markers['calculatedRatios.fib4Index'] === 1.14
    && calculatedRatioAliases.entries[0].markers['biochemistry.fib4'] === undefined
    && calculatedRatioAliases.entries[0].markerSources['calculatedRatios.fib4Index']?.snapshotId === 'snap_fib4_old');
  assert('Existing canonical reported ratio wins when a historical duplicate shares the draw date',
    calculatedRatioAliases.entries[1].markers['calculatedRatios.fib4Index'] === 1.23
    && calculatedRatioAliases.entries[1].markers['biochemistry.fib4Index'] === undefined
    && calculatedRatioAliases.entries[1].markerSources['calculatedRatios.fib4Index']?.file === 'new-liver-panel.pdf');
  assert('Profile migration removes old ratio cards and canonicalizes their snapshot and metadata',
    calculatedRatioAliases.customMarkers['biochemistry.fib4'] === undefined
    && calculatedRatioAliases.customMarkers['biochemistry.fib4Index'] === undefined
    && calculatedRatioAliases.importSnapshots[0].markers[0].mappedKey === 'calculatedRatios.fib4Index'
    && calculatedRatioAliases.importSnapshots[0].markers[0].suggestedKey === null
    && calculatedRatioAliases.importSnapshots[0].markers[0].matched === true
    && calculatedRatioAliases.refOverrides['calculatedRatios.fib4Index']?.refMax === 1.3
    && calculatedRatioAliases.markerNotes['calculatedRatios.fib4Index'] === 'Reported by the lab'
    && calculatedRatioAliases.markerValueNotes['calculatedRatios.fib4Index:2026-05-01'] === 'legacy ratio note');

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
      sourceFile: 'EDG328K.pdf',
      sourceFiles: ['EDG328K.pdf'],
      markers: { 'fattyAcids.epaC20_5': 0.90, 'vitamins.vitaminA': 2.39 },
      markerSources: {
        'fattyAcids.epaC20_5': { file: 'EDG328K.pdf', snapshotId: 'snap_spadia' },
        'vitamins.vitaminA': { file: 'EDG328K.pdf', snapshotId: 'snap_spadia' },
      },
    }],
    customMarkers: {
      'fattyAcids.epaC20_5': { name: 'EPA C20:5', unit: '%', refMin: 3.23, refMax: 4.72, categoryLabel: 'Fatty Acids', group: 'Fatty Acids', customMeta: 'preserve me' },
    },
    importSnapshots: [{
      id: 'snap_spadia',
      fileName: 'EDG328K.pdf',
      date: '2024-07-04',
      markers: [
        { rawName: 'B Kyselina eikosapentaenová C20:5', value: 0.90, unit: '%', mappedKey: 'fattyAcids.epaC20_5', suggestedKey: null, suggestedCategoryLabel: 'Spadia', suggestedGroup: 'Fatty Acids', matched: true },
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
    && savedSpadiaFA.customMarkers['spadiaFA.epaC20_5']?.customMeta === 'preserve me'
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

  const snapshotReadySpadiaFA = {
    entries: [{
      date: '2024-07-04',
      markers: { 'spadiaFA.omega3Index': 7.1, 'vitamins.vitaminA': 2.39 },
      markerSources: {
        'spadiaFA.omega3Index': { file: 'Spadia Fatty Acids.pdf', snapshotId: 'snap_spadia_ready' },
        'vitamins.vitaminA': { file: 'Spadia Fatty Acids.pdf', snapshotId: 'snap_spadia_ready' },
      },
    }],
    customMarkers: {},
    importSnapshots: [{
      id: 'snap_spadia_ready',
      fileName: 'Spadia Fatty Acids.pdf',
      date: '2024-07-04',
      markers: [
        { rawName: 'Omega-3 Index', value: 7.1, unit: '%', mappedKey: 'spadiaFA.omega3Index', suggestedName: 'Omega-3 Index', suggestedCategoryLabel: 'Spadia', suggestedGroup: 'Fatty Acids', matched: true },
        { rawName: 'Vitamin A', value: 2.39, unit: 'µmol/l', mappedKey: 'vitamins.vitaminA', matched: true },
      ],
    }],
  };
  migrateProfileData(snapshotReadySpadiaFA);
  assert('Profile migration preserves snapshot-ready Spadia values in mixed reports when metadata is missing',
    snapshotReadySpadiaFA.entries[0].markers['spadiaFA.omega3Index'] === 7.1
    && snapshotReadySpadiaFA.entries[0].markers['vitamins.vitaminA'] === 2.39);
  assert('Profile migration rebuilds missing custom marker metadata from snapshot-ready Spadia keys',
    snapshotReadySpadiaFA.customMarkers['spadiaFA.omega3Index']?.name === 'Omega-3 Index'
    && snapshotReadySpadiaFA.customMarkers['spadiaFA.omega3Index']?.unit === '%'
    && snapshotReadySpadiaFA.customMarkers['spadiaFA.omega3Index']?.categoryLabel === 'Spadia'
    && snapshotReadySpadiaFA.customMarkers['spadiaFA.omega3Index']?.group === 'Fatty Acids');

  const productFAFixtures = [
    ['zinzinoFA', 'ZinZino'],
    ['omegaquantFA', 'OmegaQuant'],
    ['metabolomixFA', 'Fatty Acids'],
    ['fattyAcidsTest', 'Fatty Acids Test'],
    ['nutriBalanceFA', 'Nutri Balance'],
  ];
  const snapshotBackedProductFA = { entries: [], customMarkers: {}, importSnapshots: [] };
  for (let i = 0; i < productFAFixtures.length; i++) {
    const [prefix, categoryLabel] = productFAFixtures[i];
    const date = `2026-02-0${i + 1}`;
    const snapshotId = `snap_product_fa_${i}`;
    const key = `${prefix}.omega3Index`;
    snapshotBackedProductFA.entries.push({
      date,
      markers: { [key]: 7 + i, 'vitamins.vitaminA': 2.39 },
      markerSources: { [key]: { file: `${categoryLabel}.pdf`, snapshotId } },
    });
    snapshotBackedProductFA.importSnapshots.push({
      id: snapshotId,
      fileName: `${categoryLabel}.pdf`,
      date,
      markers: [{
        rawName: 'Omega-3 Index',
        value: 7 + i,
        unit: '%',
        mappedKey: key,
        suggestedName: 'Omega-3 Index',
        suggestedCategoryLabel: categoryLabel,
        suggestedGroup: 'Fatty Acids',
        matched: true,
      }],
    });
  }
  migrateProfileData(snapshotBackedProductFA);
  assert('Profile migration preserves snapshot-backed values for every fatty-acid adapter prefix',
    productFAFixtures.every(([prefix], i) =>
      snapshotBackedProductFA.entries[i].markers[`${prefix}.omega3Index`] === 7 + i
      && snapshotBackedProductFA.entries[i].markers['vitamins.vitaminA'] === 2.39));
  assert('Profile migration rebuilds metadata for known and dynamic fatty-acid adapters',
    productFAFixtures.every(([prefix, categoryLabel]) => {
      const def = snapshotBackedProductFA.customMarkers[`${prefix}.omega3Index`];
      return def?.name === 'Omega-3 Index'
        && def?.unit === '%'
        && def?.categoryLabel === categoryLabel
        && def?.group === 'Fatty Acids';
    }));

  const unprovenCorruptFA = {
    entries: [{ date: '2026-02-10', markers: { 'accidentalFA.glucose': 5.2, 'vitamins.vitaminA': 2.39 } }],
    customMarkers: {},
    importSnapshots: [],
  };
  migrateProfileData(unprovenCorruptFA);
  assert('Profile migration still removes unproven FA-prefixed blood-marker corruption',
    unprovenCorruptFA.entries[0].markers['accidentalFA.glucose'] === undefined
    && unprovenCorruptFA.entries[0].markers['vitamins.vitaminA'] === 2.39);

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

  const negatedSpadiaSourceMetadata = {
    entries: [{
      date: '2026-01-20',
      sourceFile: 'Non-Spadia generic fatty acids.csv',
      markers: { 'fattyAcids.epaC20_5': 0.50 },
      markerSources: {
        'fattyAcids.epaC20_5': { file: 'Non-Spadia generic fatty acids.csv', snapshotId: 'snap_non_spadia_generic' },
      },
    }],
    customMarkers: {
      'fattyAcids.epaC20_5': { name: 'EPA C20:5', unit: '%', categoryLabel: 'Fatty Acids', group: 'Fatty Acids' },
    },
    importSnapshots: [{
      id: 'snap_non_spadia_generic',
      fileName: 'Non-Spadia generic fatty acids.csv',
      labName: 'Non-Spadia Lab',
      sourceName: 'Non-Spadia generic fatty acids',
      date: '2026-01-20',
      markers: [
        { rawName: 'EPA C20:5', value: 0.50, unit: '%', mappedKey: 'fattyAcids.epaC20_5', suggestedKey: null, suggestedCategoryLabel: 'Fatty Acids', suggestedGroup: 'Fatty Acids', matched: true },
      ],
    }],
    markerValueNotes: { 'fattyAcids.epaC20_5:2026-01-20': 'generic note' },
  };
  migrateProfileData(negatedSpadiaSourceMetadata);
  assert('Profile migration does not treat negated Spadia source metadata as Spadia',
    negatedSpadiaSourceMetadata.entries[0].markers['fattyAcids.epaC20_5'] === 0.50
    && negatedSpadiaSourceMetadata.entries[0].markers['spadiaFA.epaC20_5'] === undefined
    && negatedSpadiaSourceMetadata.entries[0].markerSources['fattyAcids.epaC20_5']?.snapshotId === 'snap_non_spadia_generic'
    && negatedSpadiaSourceMetadata.importSnapshots[0].markers[0].mappedKey === 'fattyAcids.epaC20_5'
    && negatedSpadiaSourceMetadata.markerValueNotes['fattyAcids.epaC20_5:2026-01-20'] === 'generic note'
    && negatedSpadiaSourceMetadata.markerValueNotes['spadiaFA.epaC20_5:2026-01-20'] === undefined
    && negatedSpadiaSourceMetadata.customMarkers['fattyAcids.epaC20_5']);

  const sharedGenericAndSpadiaFA = {
    entries: [
      {
        date: '2024-07-04',
        sourceFile: 'EDG328K.pdf',
        markers: { 'fattyAcids.omega3Index': 7.1 },
        markerSources: { 'fattyAcids.omega3Index': { file: 'EDG328K.pdf', snapshotId: 'snap_spadia_shared' } },
      },
      {
        date: '2024-08-04',
        sourceFile: 'Other Lab Fatty Acids.pdf',
        markers: { 'fattyAcids.omega3Index': 6.2 },
      },
    ],
    customMarkers: {
      'fattyAcids.omega3Index': { name: 'Omega-3 Index', unit: '%', categoryLabel: 'Fatty Acids', group: 'Fatty Acids' },
    },
    markerNotes: { 'fattyAcids.omega3Index': 'global note' },
    markerLabels: { 'fattyAcids.omega3Index': 'Omega label' },
    refOverrides: { 'fattyAcids.omega3Index': { min: 8, max: 12 } },
    importSnapshots: [{
      id: 'snap_spadia_shared',
      fileName: 'EDG328K.pdf',
      date: '2024-07-04',
      markers: [
        { rawName: 'Omega-3 Index', value: 7.1, unit: '%', mappedKey: 'fattyAcids.omega3Index', suggestedKey: null, suggestedCategoryLabel: 'Spadia', suggestedGroup: 'Fatty Acids', matched: true },
      ],
    }],
  };
  migrateProfileData(sharedGenericAndSpadiaFA);
  assert('Profile migration copies global metadata when generic FA key is still shared',
    sharedGenericAndSpadiaFA.entries[0].markers['spadiaFA.omega3Index'] === 7.1
    && sharedGenericAndSpadiaFA.entries[1].markers['fattyAcids.omega3Index'] === 6.2
    && sharedGenericAndSpadiaFA.markerNotes['spadiaFA.omega3Index'] === 'global note'
    && sharedGenericAndSpadiaFA.markerNotes['fattyAcids.omega3Index'] === 'global note'
    && sharedGenericAndSpadiaFA.markerLabels['spadiaFA.omega3Index'] === 'Omega label'
    && sharedGenericAndSpadiaFA.markerLabels['fattyAcids.omega3Index'] === 'Omega label'
    && sharedGenericAndSpadiaFA.refOverrides['spadiaFA.omega3Index']?.min === 8
    && sharedGenericAndSpadiaFA.refOverrides['fattyAcids.omega3Index']?.min === 8
    && sharedGenericAndSpadiaFA.customMarkers['spadiaFA.omega3Index']?.categoryLabel === 'Spadia'
    && sharedGenericAndSpadiaFA.customMarkers['fattyAcids.omega3Index']);

  const spadiaSnapshotOnlySource = {
    entries: [{
      date: '2024-07-04',
      sourceFile: 'Fatty Acids.pdf',
      markers: { 'fattyAcids.omega3Index': 7.1 },
    }],
    customMarkers: {
      'fattyAcids.omega3Index': { name: 'Omega-3 Index', unit: '%', categoryLabel: 'Fatty Acids', group: 'Fatty Acids' },
    },
    importSnapshots: [{
      id: 'snap_spadia_omega3',
      fileName: 'EDG328K.pdf',
      date: '2024-07-04',
      markers: [
        { rawName: 'Omega-3 Index', value: 7.1, unit: '%', mappedKey: 'fattyAcids.omega3Index', suggestedKey: null, suggestedCategoryLabel: 'Spadia', suggestedGroup: 'Fatty Acids', matched: true },
      ],
    }],
  };
  migrateProfileData(spadiaSnapshotOnlySource);
  assert('Profile migration uses Spadia snapshot evidence to keep entries and snapshots aligned',
    spadiaSnapshotOnlySource.entries[0].markers['spadiaFA.omega3Index'] === 7.1
    && spadiaSnapshotOnlySource.entries[0].markers['fattyAcids.omega3Index'] === undefined
    && spadiaSnapshotOnlySource.importSnapshots[0].markers[0].mappedKey === 'spadiaFA.omega3Index');

  const sourceNamedSpadiaSnapshot = {
    entries: [{
      date: '2024-07-04',
      sourceFile: 'EDG328K.pdf',
      markers: { 'fattyAcids.epaC20_5': 0.90 },
      markerSources: { 'fattyAcids.epaC20_5': { file: 'EDG328K.pdf', snapshotId: 'snap_spadia_source_named' } },
    }],
    customMarkers: {
      'fattyAcids.epaC20_5': { name: 'EPA C20:5', unit: '%', categoryLabel: 'Fatty Acids', group: 'Fatty Acids' },
    },
    importSnapshots: [{
      id: 'snap_spadia_source_named',
      fileName: 'EDG328K.pdf',
      date: '2024-07-04',
      sourceType: 'spadia',
      sourceName: 'Spadia report',
      markers: [
        { rawName: 'EPA C20:5', value: 0.90, unit: '%', mappedKey: 'fattyAcids.epaC20_5', suggestedKey: null, matched: true },
      ],
    }],
    markerValueNotes: { 'fattyAcids.epaC20_5:2024-07-04': 'source metadata note' },
  };
  migrateProfileData(sourceNamedSpadiaSnapshot);
  assert('Profile migration uses Spadia source metadata without filename hints',
    sourceNamedSpadiaSnapshot.entries[0].markers['spadiaFA.epaC20_5'] === 0.90
    && sourceNamedSpadiaSnapshot.entries[0].markers['fattyAcids.epaC20_5'] === undefined
    && sourceNamedSpadiaSnapshot.importSnapshots[0].markers[0].mappedKey === 'spadiaFA.epaC20_5'
    && sourceNamedSpadiaSnapshot.importSnapshots[0].markers[0].suggestedCategoryLabel === 'Spadia'
    && sourceNamedSpadiaSnapshot.markerValueNotes['spadiaFA.epaC20_5:2024-07-04'] === 'source metadata note'
    && sourceNamedSpadiaSnapshot.markerValueNotes['fattyAcids.epaC20_5:2024-07-04'] === undefined
    && sourceNamedSpadiaSnapshot.customMarkers['fattyAcids.epaC20_5'] === undefined);

  const sourceFileAttributedSpadiaSnapshot = {
    entries: [{
      date: '2024-05-10',
      sourceFile: 'Fatty Acids.pdf',
      markers: { 'fattyAcids.epaC20_5': 0.90 },
      markerSources: { 'fattyAcids.epaC20_5': { file: 'Fatty Acids.pdf', snapshotId: 'snap_spadia_source_file' } },
    }],
    customMarkers: {
      'fattyAcids.epaC20_5': { name: 'EPA C20:5', unit: '%', categoryLabel: 'Fatty Acids', group: 'Fatty Acids' },
    },
    importSnapshots: [{
      id: 'snap_spadia_source_file',
      fileName: 'EDG328K.pdf',
      sourceFile: 'Spadia 7-2024 Fatty Acids.pdf',
      importer: 'spadia',
      date: '2024-05-10',
      markers: [
        { rawName: 'EPA C20:5', value: 0.90, unit: '%', mappedKey: 'fattyAcids.epaC20_5', suggestedKey: null, matched: true },
      ],
    }],
    markerValueNotes: { 'fattyAcids.epaC20_5:2024-05-10': 'source file note' },
  };
  migrateProfileData(sourceFileAttributedSpadiaSnapshot);
  assert('Profile migration uses Spadia snapshot sourceFile and importer metadata',
    sourceFileAttributedSpadiaSnapshot.entries[0].markers['spadiaFA.epaC20_5'] === 0.90
    && sourceFileAttributedSpadiaSnapshot.entries[0].markers['fattyAcids.epaC20_5'] === undefined
    && sourceFileAttributedSpadiaSnapshot.importSnapshots[0].markers[0].mappedKey === 'spadiaFA.epaC20_5'
    && sourceFileAttributedSpadiaSnapshot.markerValueNotes['spadiaFA.epaC20_5:2024-05-10'] === 'source file note'
    && sourceFileAttributedSpadiaSnapshot.markerValueNotes['fattyAcids.epaC20_5:2024-05-10'] === undefined
    && sourceFileAttributedSpadiaSnapshot.customMarkers['fattyAcids.epaC20_5'] === undefined);

  const datelessSpadiaFA = {
    entries: [{
      sourceFile: 'EDG328K.pdf',
      markers: { 'fattyAcids.omega3Index': 7.1 },
      markerSources: { 'fattyAcids.omega3Index': { file: 'EDG328K.pdf', snapshotId: 'snap_spadia_dateless' } },
    }],
    customMarkers: {
      'fattyAcids.omega3Index': { name: 'Omega-3 Index', unit: '%', categoryLabel: 'Fatty Acids', group: 'Fatty Acids' },
    },
    importSnapshots: [{
      id: 'snap_spadia_dateless',
      fileName: 'EDG328K.pdf',
      markers: [
        { rawName: 'Omega-3 Index', value: 7.1, unit: '%', mappedKey: 'fattyAcids.omega3Index', suggestedKey: null, suggestedCategoryLabel: 'Spadia', suggestedGroup: 'Fatty Acids', matched: true },
      ],
    }],
    manualValues: { 'fattyAcids.omega3Index:2024-07-04': 7.3 },
    markerValueNotes: { 'fattyAcids.omega3Index:2024-07-04': 'dateless note' },
  };
  migrateProfileData(datelessSpadiaFA);
  assert('Profile migration remaps date-scoped data for dateless Spadia entries',
    datelessSpadiaFA.entries[0].markers['spadiaFA.omega3Index'] === 7.1
    && datelessSpadiaFA.manualValues['spadiaFA.omega3Index:2024-07-04'] === 7.3
    && datelessSpadiaFA.markerValueNotes['spadiaFA.omega3Index:2024-07-04'] === 'dateless note'
    && datelessSpadiaFA.manualValues['fattyAcids.omega3Index:2024-07-04'] === undefined
    && datelessSpadiaFA.markerValueNotes['fattyAcids.omega3Index:2024-07-04'] === undefined);

  const datelessSpadiaSnapshotNoEntrySource = {
    entries: [{
      markers: { 'fattyAcids.epaC20_5': 0.90 },
    }],
    customMarkers: {
      'fattyAcids.epaC20_5': { name: 'EPA C20:5', unit: '%', categoryLabel: 'Fatty Acids', group: 'Fatty Acids' },
    },
    importSnapshots: [{
      id: 'snap_spadia_dateless_value_match',
      fileName: 'EDG328K.pdf',
      markers: [
        { rawName: 'EPA C20:5', value: 0.90, unit: '%', mappedKey: 'fattyAcids.epaC20_5', suggestedKey: null, suggestedCategoryLabel: 'Spadia', suggestedGroup: 'Fatty Acids', matched: true },
      ],
    }],
  };
  migrateProfileData(datelessSpadiaSnapshotNoEntrySource);
  assert('Profile migration value-matches dateless Spadia snapshots to dateless entries without source metadata',
    datelessSpadiaSnapshotNoEntrySource.entries[0].markers['spadiaFA.epaC20_5'] === 0.90
    && datelessSpadiaSnapshotNoEntrySource.entries[0].markers['fattyAcids.epaC20_5'] === undefined
    && datelessSpadiaSnapshotNoEntrySource.importSnapshots[0].markers[0].mappedKey === 'spadiaFA.epaC20_5'
    && datelessSpadiaSnapshotNoEntrySource.customMarkers['spadiaFA.epaC20_5']?.categoryLabel === 'Spadia'
    && datelessSpadiaSnapshotNoEntrySource.customMarkers['fattyAcids.epaC20_5'] === undefined);

  const datedSpadiaSnapshotDatelessEntry = {
    entries: [{
      markers: { 'fattyAcids.epaC20_5': 0.90 },
    }],
    customMarkers: {
      'fattyAcids.epaC20_5': { name: 'EPA C20:5', unit: '%', categoryLabel: 'Fatty Acids', group: 'Fatty Acids' },
    },
    importSnapshots: [{
      id: 'snap_spadia_dated_dateless_entry',
      fileName: 'EDG328K.pdf',
      date: '2024-07-04',
      markers: [
        { rawName: 'EPA C20:5', value: 0.90, unit: '%', mappedKey: 'fattyAcids.epaC20_5', suggestedKey: null, suggestedCategoryLabel: 'Spadia', suggestedGroup: 'Fatty Acids', matched: true },
      ],
    }],
    markerValueNotes: { 'fattyAcids.epaC20_5:2024-07-04': 'dated snapshot note' },
  };
  migrateProfileData(datedSpadiaSnapshotDatelessEntry);
  assert('Profile migration value-matches dated Spadia snapshots to dateless entries without source metadata',
    datedSpadiaSnapshotDatelessEntry.entries[0].markers['spadiaFA.epaC20_5'] === 0.90
    && datedSpadiaSnapshotDatelessEntry.entries[0].markers['fattyAcids.epaC20_5'] === undefined
    && datedSpadiaSnapshotDatelessEntry.importSnapshots[0].markers[0].mappedKey === 'spadiaFA.epaC20_5'
    && datedSpadiaSnapshotDatelessEntry.markerValueNotes['spadiaFA.epaC20_5:2024-07-04'] === 'dated snapshot note'
    && datedSpadiaSnapshotDatelessEntry.markerValueNotes['fattyAcids.epaC20_5:2024-07-04'] === undefined
    && datedSpadiaSnapshotDatelessEntry.customMarkers['fattyAcids.epaC20_5'] === undefined);

  const datelessSpadiaSnapshotGenericPeer = {
    entries: [{
      sourceFile: 'Other Lab Fatty Acids.pdf',
      markers: { 'fattyAcids.omega3Index': 7.1 },
    }],
    customMarkers: {
      'fattyAcids.omega3Index': { name: 'Omega-3 Index', unit: '%', categoryLabel: 'Fatty Acids', group: 'Fatty Acids' },
    },
    importSnapshots: [{
      id: 'snap_spadia_dateless_generic_peer',
      fileName: 'EDG328K.pdf',
      markers: [
        { rawName: 'Omega-3 Index', value: 7.1, unit: '%', mappedKey: 'fattyAcids.omega3Index', suggestedKey: null, suggestedCategoryLabel: 'Spadia', suggestedGroup: 'Fatty Acids', matched: true },
      ],
    }],
  };
  migrateProfileData(datelessSpadiaSnapshotGenericPeer);
  assert('Profile migration does not value-match dateless generic source peers into Spadia',
    datelessSpadiaSnapshotGenericPeer.entries[0].markers['fattyAcids.omega3Index'] === 7.1
    && datelessSpadiaSnapshotGenericPeer.entries[0].markers['spadiaFA.omega3Index'] === undefined
    && datelessSpadiaSnapshotGenericPeer.importSnapshots[0].markers[0].mappedKey === 'spadiaFA.omega3Index'
    && datelessSpadiaSnapshotGenericPeer.customMarkers['fattyAcids.omega3Index']);

  const undatedSpadiaSnapshotSharedScopedData = {
    entries: [
      {
        sourceFile: 'Fatty Acids.pdf',
        markers: { 'fattyAcids.omega3Index': 7.1 },
        markerSources: { 'fattyAcids.omega3Index': { file: 'Fatty Acids.pdf', snapshotId: 'snap_spadia_undated_shared_scope' } },
      },
      {
        date: '2024-08-01',
        sourceFile: 'Other Lab Fatty Acids.pdf',
        markers: { 'fattyAcids.omega3Index': 6.8 },
      },
    ],
    customMarkers: {
      'fattyAcids.omega3Index': { name: 'Omega-3 Index', unit: '%', categoryLabel: 'Fatty Acids', group: 'Fatty Acids' },
    },
    importSnapshots: [{
      id: 'snap_spadia_undated_shared_scope',
      fileName: 'EDG328K.pdf',
      markers: [
        { rawName: 'Omega-3 Index', value: 7.1, unit: '%', mappedKey: 'fattyAcids.omega3Index', suggestedKey: null, suggestedCategoryLabel: 'Spadia', suggestedGroup: 'Fatty Acids', matched: true },
      ],
    }],
    manualValues: { 'fattyAcids.omega3Index:2024-08-01': 6.8 },
    markerValueNotes: { 'fattyAcids.omega3Index:2024-08-01': 'generic dated note' },
    markerLabels: { 'fattyAcids.omega3Index:2024-08-01': 'generic dated label' },
    refOverrides: { 'fattyAcids.omega3Index:2024-08-01': { min: 6, max: 9 } },
  };
  migrateProfileData(undatedSpadiaSnapshotSharedScopedData);
  assert('Profile migration does not copy undated Spadia snapshot metadata onto generic dated peers',
    undatedSpadiaSnapshotSharedScopedData.entries[0].markers['spadiaFA.omega3Index'] === 7.1
    && undatedSpadiaSnapshotSharedScopedData.entries[1].markers['fattyAcids.omega3Index'] === 6.8
    && undatedSpadiaSnapshotSharedScopedData.manualValues['spadiaFA.omega3Index:2024-08-01'] === undefined
    && undatedSpadiaSnapshotSharedScopedData.markerValueNotes['spadiaFA.omega3Index:2024-08-01'] === undefined
    && undatedSpadiaSnapshotSharedScopedData.markerLabels['spadiaFA.omega3Index:2024-08-01'] === undefined
    && undatedSpadiaSnapshotSharedScopedData.refOverrides['spadiaFA.omega3Index:2024-08-01'] === undefined
    && undatedSpadiaSnapshotSharedScopedData.manualValues['fattyAcids.omega3Index:2024-08-01'] === 6.8
    && undatedSpadiaSnapshotSharedScopedData.markerValueNotes['fattyAcids.omega3Index:2024-08-01'] === 'generic dated note'
    && undatedSpadiaSnapshotSharedScopedData.markerLabels['fattyAcids.omega3Index:2024-08-01'] === 'generic dated label'
    && undatedSpadiaSnapshotSharedScopedData.refOverrides['fattyAcids.omega3Index:2024-08-01']?.min === 6);

  const spadiaScopedCleanup = {
    entries: [{
      date: '2024-07-01',
      sourceFile: 'EDG328K.pdf',
      markers: { 'fattyAcids.omega3Index': 7.1 },
      markerSources: { 'fattyAcids.omega3Index': { file: 'EDG328K.pdf', snapshotId: 'snap_spadia_cleanup' } },
    }],
    customMarkers: {
      'fattyAcids.omega3Index': { name: 'Omega-3 Index', unit: '%', categoryLabel: 'Fatty Acids', group: 'Fatty Acids' },
    },
    importSnapshots: [{
      id: 'snap_spadia_cleanup',
      fileName: 'EDG328K.pdf',
      date: '2024-07-01',
      markers: [
        { rawName: 'Omega-3 Index', value: 7.1, unit: '%', mappedKey: 'fattyAcids.omega3Index', suggestedKey: null, suggestedCategoryLabel: 'Spadia', suggestedGroup: 'Fatty Acids', matched: true },
      ],
    }],
    manualValues: {
      'fattyAcids.omega3Index:2024-07-01': 7.1,
      'fattyAcids.omega3Index:2024-07-04': 7.4,
    },
    markerValueNotes: {
      'fattyAcids.omega3Index:2024-07-01': 'import date note',
      'fattyAcids.omega3Index:2024-07-04': 'nearby manual note',
    },
    markerLabels: {
      'fattyAcids.omega3Index:2024-07-01': 'import date label',
      'fattyAcids.omega3Index:2024-07-04': 'nearby manual label',
    },
    refOverrides: {
      'fattyAcids.omega3Index:2024-07-01': { min: 8, max: 12 },
      'fattyAcids.omega3Index:2024-07-04': { min: 7, max: 11 },
    },
  };
  migrateProfileData(spadiaScopedCleanup);
  assert('Profile migration preserves all scoped metadata before generic Spadia cleanup',
    spadiaScopedCleanup.entries[0].markers['spadiaFA.omega3Index'] === 7.1
    && spadiaScopedCleanup.manualValues['spadiaFA.omega3Index:2024-07-01'] === 7.1
    && spadiaScopedCleanup.manualValues['spadiaFA.omega3Index:2024-07-04'] === 7.4
    && spadiaScopedCleanup.markerValueNotes['spadiaFA.omega3Index:2024-07-01'] === 'import date note'
    && spadiaScopedCleanup.markerValueNotes['spadiaFA.omega3Index:2024-07-04'] === 'nearby manual note'
    && spadiaScopedCleanup.markerLabels['spadiaFA.omega3Index:2024-07-01'] === 'import date label'
    && spadiaScopedCleanup.markerLabels['spadiaFA.omega3Index:2024-07-04'] === 'nearby manual label'
    && spadiaScopedCleanup.refOverrides['spadiaFA.omega3Index:2024-07-01']?.min === 8
    && spadiaScopedCleanup.refOverrides['spadiaFA.omega3Index:2024-07-04']?.min === 7
    && spadiaScopedCleanup.manualValues['fattyAcids.omega3Index:2024-07-01'] === undefined
    && spadiaScopedCleanup.manualValues['fattyAcids.omega3Index:2024-07-04'] === undefined
    && spadiaScopedCleanup.markerValueNotes['fattyAcids.omega3Index:2024-07-01'] === undefined
    && spadiaScopedCleanup.markerValueNotes['fattyAcids.omega3Index:2024-07-04'] === undefined
    && spadiaScopedCleanup.markerLabels['fattyAcids.omega3Index:2024-07-01'] === undefined
    && spadiaScopedCleanup.markerLabels['fattyAcids.omega3Index:2024-07-04'] === undefined
    && spadiaScopedCleanup.refOverrides['fattyAcids.omega3Index:2024-07-01'] === undefined
    && spadiaScopedCleanup.refOverrides['fattyAcids.omega3Index:2024-07-04'] === undefined);

  const undatedGenericSnapshotReference = {
    entries: [{
      date: '2024-07-01',
      sourceFile: 'EDG328K.pdf',
      markers: { 'fattyAcids.omega3Index': 7.1 },
      markerSources: { 'fattyAcids.omega3Index': { file: 'EDG328K.pdf', snapshotId: 'snap_spadia_dated_source' } },
    }],
    customMarkers: {
      'fattyAcids.omega3Index': { name: 'Omega-3 Index', unit: '%', categoryLabel: 'Fatty Acids', group: 'Fatty Acids' },
    },
    importSnapshots: [
      {
        id: 'snap_spadia_dated_source',
        fileName: 'EDG328K.pdf',
        date: '2024-07-01',
        sourceType: 'spadia',
        sourceName: 'Spadia report',
        markers: [
          { rawName: 'Omega-3 Index', value: 7.1, unit: '%', mappedKey: 'fattyAcids.omega3Index', suggestedKey: null, matched: true },
        ],
      },
      {
        id: 'snap_generic_undated_fa',
        fileName: 'Other Lab Fatty Acids.pdf',
        markers: [
          { rawName: 'Omega-3 Index', value: 6.8, unit: '%', mappedKey: 'fattyAcids.omega3Index', suggestedKey: null, matched: true },
        ],
      },
    ],
    manualValues: { 'fattyAcids.omega3Index:2024-07-01': 7.1 },
    markerValueNotes: { 'fattyAcids.omega3Index:2024-07-01': 'shared undated snapshot note' },
    markerLabels: { 'fattyAcids.omega3Index:2024-07-01': 'shared undated snapshot label' },
    refOverrides: { 'fattyAcids.omega3Index:2024-07-01': { min: 8, max: 12 } },
  };
  migrateProfileData(undatedGenericSnapshotReference);
  assert('Profile migration keeps old scoped metadata when an undated generic snapshot still owns the key',
    undatedGenericSnapshotReference.entries[0].markers['spadiaFA.omega3Index'] === 7.1
    && undatedGenericSnapshotReference.importSnapshots[0].markers[0].mappedKey === 'spadiaFA.omega3Index'
    && undatedGenericSnapshotReference.importSnapshots[1].markers[0].mappedKey === 'fattyAcids.omega3Index'
    && undatedGenericSnapshotReference.manualValues['spadiaFA.omega3Index:2024-07-01'] === 7.1
    && undatedGenericSnapshotReference.manualValues['fattyAcids.omega3Index:2024-07-01'] === 7.1
    && undatedGenericSnapshotReference.markerValueNotes['spadiaFA.omega3Index:2024-07-01'] === 'shared undated snapshot note'
    && undatedGenericSnapshotReference.markerValueNotes['fattyAcids.omega3Index:2024-07-01'] === 'shared undated snapshot note'
    && undatedGenericSnapshotReference.markerLabels['spadiaFA.omega3Index:2024-07-01'] === 'shared undated snapshot label'
    && undatedGenericSnapshotReference.markerLabels['fattyAcids.omega3Index:2024-07-01'] === 'shared undated snapshot label'
    && undatedGenericSnapshotReference.refOverrides['spadiaFA.omega3Index:2024-07-01']?.min === 8
    && undatedGenericSnapshotReference.refOverrides['fattyAcids.omega3Index:2024-07-01']?.min === 8);

  // ═══════════════════════════════════════
  // Results
  // ═══════════════════════════════════════
console.log(`\nResults: ${pass} passed, ${fail} failed, ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
