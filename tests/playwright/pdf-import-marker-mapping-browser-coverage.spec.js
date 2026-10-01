import { routeHtml } from '../helpers/browser-static-routes.js';
import { createModuleUrl } from '../helpers/browser-module-url.js';
import { expect, test } from './coverage-fixture.js';

const moduleUrl = createModuleUrl('pdfImportMarkerMappingCoverage');

async function openIsolatedMarkerMappingPage(page) {
  await routeHtml(page, '**/pdf-import-marker-mapping-browser-coverage', '<!doctype html><html><body></body></html>', 200);
  await page.goto('/pdf-import-marker-mapping-browser-coverage', { waitUntil: 'load' });
}

test('pdf import marker mapping browser coverage handles percent hints and urine demotion', async ({ page }) => {
  await openIsolatedMarkerMappingPage(page);

  const results = await page.evaluate(async ({ mappingUrl }) => {
    const mapping = await import(mappingUrl);
    const outcomes = {};

    const differentialMarkers = [{
      rawName: 'B Neutrofily %',
      unit: '%',
      value: 52,
      matched: false,
      mappedKey: null,
      suggestedKey: null,
    }];
    mapping.reconcileImportMarkerMappings(differentialMarkers, { testType: 'blood' });
    outcomes.differentialPercentHintSuggestsPercentKey =
      differentialMarkers[0].mappedKey === 'differential.neutrophilsPct'
      && differentialMarkers[0].matched === true
      && differentialMarkers[0].suggestedKey === null;

    const urineMarkers = [{
      rawName: 'U Novel particle marker (mg/l)',
      unit: 'mg/l',
      value: 1,
      matched: true,
      mappedKey: 'biochemistry.glucose',
      suggestedKey: null,
    }];
    mapping.reconcileImportMarkerMappings(urineMarkers, { testType: 'blood' });
    outcomes.urineSpecimenDemotesIncompatibleStandardKey =
      urineMarkers[0].mappedKey === null
      && urineMarkers[0].matched === false
      && urineMarkers[0].suggestedKey === 'urinalysis.novelParticleMarker'
      && urineMarkers[0].suggestedName === 'Novel particle marker'
      && urineMarkers[0].suggestedCategoryLabel === 'Urinalysis';

    const knownUrineMarkers = [{
      rawName: 'U Bilkovina',
      unit: '',
      value: 1,
      matched: true,
      mappedKey: 'proteins.totalProtein',
      suggestedKey: null,
    }];
    mapping.reconcileImportMarkerMappings(knownUrineMarkers, { testType: 'blood' });
    outcomes.knownUrineSpecimenUsesCustomImportKey =
      knownUrineMarkers[0].mappedKey === null
      && knownUrineMarkers[0].suggestedKey === 'urinalysis.proteinQualitative';

    outcomes.cleanImportedDisplayNameStripsSpecimenAndUnits =
      mapping._cleanImportedMarkerDisplayName('S Kreatinin (umol/l)') === 'Kreatinin';
    outcomes.convertImportValueUnitHandlesSecondaryUnits =
      Math.abs(mapping.convertImportValueUnit('biochemistry.glucose', 5.8, 'mmol/l', 'mg/l') - 1045.04) < 0.01
      && Math.abs(mapping.convertImportValueUnit('biochemistry.glucose', 1045.04, 'mg/l', 'mmol/l') - 5.8) < 0.01;
    outcomes.convertImportValueUnitIgnoresUnknownSourceUnits =
      mapping.convertImportValueUnit('biochemistry.glucose', 500, 'wibble', 'mmol/l') === null;
    outcomes.convertGenericImportValueUnitHandlesSafeFamilies =
      Math.abs(mapping.convertGenericImportValueUnit(1000, 'mg/l', 'g/l') - 1) < 0.001
      && Math.abs(mapping.convertGenericImportValueUnit(2, '10^12/l', '10^9/l') - 2000) < 0.001
      && Math.abs(mapping.convertGenericImportValueUnit(1, '\u00b5kat/l', 'U/l') - 60) < 0.001;
    outcomes.convertGenericImportValueUnitRejectsIncompatibleFamilies =
      mapping.convertGenericImportValueUnit(1, 'nmol/l', 'mg/l') === null
      && mapping.convertGenericImportValueUnit(1, 'arb.j.', 'g/l') === null;

    return outcomes;
  }, {
    mappingUrl: moduleUrl('/js/pdf-import-marker-mapping.js'),
  });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});

test('IG percentage and count remain distinct through import validation and migrated display', async ({ page }) => {
  await openIsolatedMarkerMappingPage(page);
  const result = await page.evaluate(async () => {
    const [{ reconcileImportMarkerMappings }, { prepareImportCommit }, { migrateProfileData }, { state }, { getActiveData, invalidateActiveDataCache }, { getStatus }] = await Promise.all([
      import('/js/pdf-import-marker-mapping.js'),
      import('/js/import-commit-validation.js'),
      import('/js/profile-data-migrations.js'),
      import('/js/state.js'),
      import('/js/data.js'),
      import('/js/utils.js'),
    ]);
    const key = 'hematology.immatureGranulocytesPct';
    const absoluteKey = 'hematology.immatureGranulocytes';
    const markers = [
      { rawName: 'Immature Granulocytes', value: 1.2, unit: '%', mappedKey: absoluteKey, matched: true, refMin: 0.1, refMax: 0.9 },
      { rawName: 'Immature Granulocytes (abs)', value: 0.04, unit: '10^9/l', mappedKey: absoluteKey, matched: true },
    ];
    reconcileImportMarkerMappings(markers);
    const commit = prepareImportCommit({ date: '2026-07-01', markers }, new Set());
    state.importedData = migrateProfileData({
      entries: [{ date: '2026-07-01', markers: { [key]: 1.2, [absoluteKey]: 0.04 } }],
      customMarkers: { [key]: { name: 'IG %', unit: '%', refMin: 0.1, refMax: 0.9 } },
      refOverrides: { [key]: { optimalMax: 0.5 } },
      importSnapshots: [{ id: 'report-1', date: '2026-07-01', markers: [{ ...markers[0] }] }],
    });
    invalidateActiveDataCache();
    const adopted = getActiveData().categories.hematology.markers.immatureGranulocytesPct;
    const adoptedRange = { min: adopted.refMin, max: adopted.refMax };
    const adoptedStatus = getStatus(1.2, adopted.refMin, adopted.refMax);
    state.importedData = { entries: [{ date: '2026-07-01', markers: { [key]: 1.2 } }] };
    invalidateActiveDataCache();
    const withoutLabRange = getActiveData().categories.hematology.markers.immatureGranulocytesPct;
    return {
      error: commit.error,
      keys: markers.map(marker => marker.mappedKey),
      values: markers.map(marker => marker.value),
      adoptedRange,
      adoptedStatus,
      withoutLabRange: { min: withoutLabRange.refMin, max: withoutLabRange.refMax },
    };
  });
  expect(result.error).toBeNull();
  expect(result.keys).toEqual(['hematology.immatureGranulocytesPct', 'hematology.immatureGranulocytes']);
  expect(result.values).toEqual([1.2, 0.04]);
  expect(result.adoptedRange).toEqual({ min: 0.1, max: 0.9 });
  expect(result.adoptedStatus).toBe('high');
  expect(result.withoutLabRange).toEqual({ min: null, max: null });
});
