import { expect, test } from './coverage-fixture.js';

function moduleUrl(path) {
  return `${path}?pdfImportMarkerMappingCoverage=${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

async function openIsolatedMarkerMappingPage(page) {
  await page.route('**/pdf-import-marker-mapping-browser-coverage', route => route.fulfill({
    status: 200,
    contentType: 'text/html',
    body: '<!doctype html><html><body></body></html>',
  }));
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

    return outcomes;
  }, {
    mappingUrl: moduleUrl('/js/pdf-import-marker-mapping.js'),
  });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});
