import { expect, test } from './coverage-fixture.js';

const moduleUrl = path => `${path}?labEntryBrowserCoverage=${Date.now()}-${Math.random().toString(36).slice(2)}`;

async function openBlankPage(page) {
  await page.route('**/lab-entry-browser-coverage', route => route.fulfill({
    status: 200,
    contentType: 'text/html',
    body: '<!doctype html><html><body><main id="fixture"></main></body></html>',
  }));
  await page.goto('/lab-entry-browser-coverage', { waitUntil: 'load' });
}

test('lab entry browser coverage exercises marker helpers and imported-data mutations', async ({ page }) => {
  const expectedOutcomeKeys = [
    'setMarkerClearsTombstoneAndStoresSource',
    'legacyInsulinCanonicalizesAndMaintainsHomaIr',
    'deleteCanonicalInsulinRecordsTombstoneAndClearsDerivedMarker',
    'renameMarkerMovesValueSourceAndClearsOldTombstone',
    'timestampHelpersNormalizeSourceUpdatedDateAndTombstones',
    'findOrCreateEntryClearsImportTombstone',
    'deleteMarkerFromImportedDataPreservesRowAndClearsMetadata',
    'deleteMarkerValuesPreservesTombstoneRowsAndRemovesEmptyEntry',
  ];

  await openBlankPage(page);

  const results = await page.evaluate(async ({ labEntryUrl, mutationsUrl }) => {
    const [labEntry, mutations] = await Promise.all([
      import(labEntryUrl),
      import(mutationsUrl),
    ]);
    const outcomes = {};
    const hasOwn = (object, key) => Object.prototype.hasOwnProperty.call(object || {}, key);

    const entry = labEntry.createLabEntry('2026-05-01', { now: 100 });
    entry.deletedMarkers = { 'biochemistry.glucose': 90 };
    labEntry.setLabEntryMarker(entry, 'biochemistry.glucose', 5.1, {
      now: 200,
      source: { file: null, at: 200 },
    });
    outcomes.setMarkerClearsTombstoneAndStoresSource =
      entry.updatedAt === 200
      && entry.markers['biochemistry.glucose'] === 5.1
      && entry.markerSources['biochemistry.glucose'].file === null
      && !hasOwn(entry.deletedMarkers, 'biochemistry.glucose');

    labEntry.setLabEntryMarker(entry, 'diabetes.insulin_d', 8, {
      now: 300,
      source: { file: 'manual-entry', at: 300 },
    });
    outcomes.legacyInsulinCanonicalizesAndMaintainsHomaIr =
      entry.markers['diabetes.insulin'] === 8
      && !hasOwn(entry.markers, 'diabetes.insulin_d')
      && !hasOwn(entry.markers, 'hormones.insulin')
      && entry.markerSources['diabetes.insulin'].file === 'manual-entry'
      && entry.markers['diabetes.homaIR'] === Math.round((5.1 * 8) / 22.5 * 100) / 100;

    const deleteInsulin = labEntry.deleteLabEntryMarker(entry, 'diabetes.insulin', {
      now: 350,
    });
    outcomes.deleteCanonicalInsulinRecordsTombstoneAndClearsDerivedMarker =
      deleteInsulin.changed
      && deleteInsulin.deletedKeys.includes('diabetes.insulin')
      && !hasOwn(entry.markers, 'hormones.insulin')
      && !hasOwn(entry.markers, 'diabetes.insulin_d')
      && !hasOwn(entry.markers, 'diabetes.insulin')
      && !hasOwn(entry.markers, 'diabetes.homaIR')
      && entry.deletedMarkers['diabetes.insulin'] === 350;

    const renameEntry = {
      date: '2026-05-03',
      updatedAt: 100,
      markers: { 'legacy.glucose': 7.2 },
      markerSources: { 'legacy.glucose': { file: 'old.pdf', at: 123 } },
      deletedMarkers: { 'legacy.glucose': 99 },
    };
    const renamed = labEntry.renameLabEntryMarker(renameEntry, 'legacy.glucose', 'biochemistry.glucose', {
      now: 450,
    });
    outcomes.renameMarkerMovesValueSourceAndClearsOldTombstone =
      renamed
      && renameEntry.updatedAt === 450
      && renameEntry.markers['biochemistry.glucose'] === 7.2
      && !hasOwn(renameEntry.markers, 'legacy.glucose')
      && renameEntry.markerSources['biochemistry.glucose'].file === 'old.pdf'
      && !hasOwn(renameEntry.markerSources, 'legacy.glucose')
      && !hasOwn(renameEntry.deletedMarkers, 'legacy.glucose');

    const timestampEntry = {
      date: '2026-05-06',
      updatedAt: '2026-05-05T00:00:00.000Z',
      markerSources: { sourced: { at: '2026-05-04T00:00:00.000Z' } },
      deletedMarkers: { removed: '2026-05-07T00:00:00.000Z' },
    };
    outcomes.timestampHelpersNormalizeSourceUpdatedDateAndTombstones =
      labEntry.getLabEntryMarkerValueTimestamp(timestampEntry, 'sourced') === Date.parse('2026-05-04T00:00:00.000Z')
      && labEntry.getLabEntryMarkerValueTimestamp(timestampEntry, 'updatedOnly') === Date.parse('2026-05-05T00:00:00.000Z')
      && labEntry.getLabEntryMarkerValueTimestamp({ date: '2026-05-08' }, 'dateOnly') === Date.parse('2026-05-08')
      && labEntry.getLabEntryMarkerTombstoneAt(timestampEntry, 'removed') === Date.parse('2026-05-07T00:00:00.000Z')
      && labEntry.getLabEntryMarkerTombstoneAt(timestampEntry, 'missing') === 0;

    const importedData = {
      entries: [
        {
          date: '2026-06-01',
          updatedAt: 100,
          markers: {
            'biochemistry.glucose': 4.7,
            'biochemistry.alp': 1.2,
          },
          markerSources: {
            'biochemistry.glucose': { file: 'old.pdf', at: 100 },
            'biochemistry.alp': { file: 'old.pdf', at: 100 },
          },
        },
        {
          date: '2026-06-02',
          updatedAt: 110,
          markers: { 'biochemistry.alp': 1.3 },
          markerSources: { 'biochemistry.alp': { file: 'old.pdf', at: 110 } },
        },
      ],
      manualValues: {
        'biochemistry.glucose:2026-06-01': 4.6,
        'biochemistry.alp:2026-06-01': 1.1,
        'biochemistry.alp:2026-06-02': 1.3,
      },
      markerValueNotes: {
        'biochemistry.glucose:2026-06-01': 'fasted',
        'biochemistry.alp:2026-06-01': 'source row',
        'biochemistry.alp:2026-06-02': 'second row',
      },
      _deleted: { entries: ['2026-07-01'] },
    };

    const createdEntry = mutations.findOrCreateLabEntry(importedData, '2026-07-01', { now: 500 });
    outcomes.findOrCreateEntryClearsImportTombstone =
      createdEntry?.date === '2026-07-01'
      && createdEntry.updatedAt === 500
      && importedData.entries.includes(createdEntry)
      && !importedData._deleted;

    const firstEntry = importedData.entries.find(item => item.date === '2026-06-01');
    const deleteGlucose = mutations.deleteLabEntryMarkerFromImportedData(
      importedData,
      firstEntry,
      'biochemistry.glucose',
      { now: 550 }
    );
    outcomes.deleteMarkerFromImportedDataPreservesRowAndClearsMetadata =
      deleteGlucose.changed
      && !deleteGlucose.removedEntry
      && importedData.entries.includes(firstEntry)
      && !hasOwn(firstEntry.markers, 'biochemistry.glucose')
      && firstEntry.markers['biochemistry.alp'] === 1.2
      && firstEntry.deletedMarkers['biochemistry.glucose'] === 550
      && importedData.manualValues['biochemistry.glucose:2026-06-01'] === null
      && importedData.markerValueNotes['biochemistry.glucose:2026-06-01'] === null;

    const alpDeletes = mutations.deleteLabEntryMarkerValues(importedData, 'biochemistry.alp', { now: 600 });
    outcomes.deleteMarkerValuesPreservesTombstoneRowsAndRemovesEmptyEntry =
      alpDeletes.length === 2
      && importedData.entries.some(item =>
        item.date === '2026-06-01'
        && Object.keys(item.markers || {}).length === 0
        && item.deletedMarkers['biochemistry.glucose'] === 550
        && item.deletedMarkers['biochemistry.alp'] === 600
      )
      && importedData.entries.some(item =>
        item.date === '2026-06-02'
        && Object.keys(item.markers || {}).length === 0
        && item.deletedMarkers['biochemistry.alp'] === 600
      )
      && !importedData.entries.some(item => item.date === '2026-07-01')
      && importedData._deleted?.entries?.includes('2026-07-01')
      && importedData.manualValues['biochemistry.alp:2026-06-01'] === null
      && importedData.markerValueNotes['biochemistry.alp:2026-06-02'] === null;

    return outcomes;
  }, {
    labEntryUrl: moduleUrl('/js/lab-entry.js'),
    mutationsUrl: moduleUrl('/js/lab-entry-mutations.js'),
  });

  for (const key of expectedOutcomeKeys) {
    expect(results[key], key).toBe(true);
  }
});
