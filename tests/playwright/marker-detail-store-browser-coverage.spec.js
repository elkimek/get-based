import { expect, test } from './coverage-fixture.js';

const moduleUrl = (path) => `${path}?markerDetailStoreBrowserCoverage=${Date.now()}-${Math.random().toString(36).slice(2)}`;

async function openBlankPage(page) {
  await page.route('**/marker-detail-store-browser-coverage', route => route.fulfill({
    contentType: 'text/html',
    body: '<!doctype html><html><body><main id="fixture"></main></body></html>',
  }));
  await page.goto('/marker-detail-store-browser-coverage', { waitUntil: 'load' });
}

function expectAll(outcomes) {
  const failed = Object.entries(outcomes)
    .filter(([, value]) => value !== true)
    .map(([key, value]) => `${key}: ${JSON.stringify(value)}`);
  expect(failed).toEqual([]);
}

test('marker detail store browser coverage persists manual values notes ranges and tombstones', async ({ page }) => {
  await openBlankPage(page);

  const outcomes = await page.evaluate(async ({ storeUrl }) => {
    const [
      store,
      { state },
      { profileStorageKey },
      { encryptedGetItem, encryptedRemoveItem },
    ] = await Promise.all([
      import(storeUrl),
      import('/js/state.js'),
      import('/js/profile.js'),
      import('/js/crypto.js'),
    ]);
    const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
    const storage = new Map(Array.from({ length: localStorage.length }, (_, i) => {
      const key = localStorage.key(i);
      return [key, localStorage.getItem(key)];
    }));
    const saved = {
      importedData: clone(state.importedData),
      currentProfile: state.currentProfile,
    };
    const profileId = `marker-detail-store-browser-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const importedKey = profileStorageKey(profileId, 'imported');
    const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj || {}, key);
    const outcomes = {};

    try {
      state.currentProfile = profileId;
      state.importedData = null;
      const missingKeySave = await store.saveManualMarkerValue({
        date: '2026-06-01',
        storedValue: 1,
        now: 100,
      });
      const missingDateSave = await store.saveManualMarkerValue({
        dotKey: 'biochemistry.glucose',
        storedValue: 1,
        now: 101,
      });
      const createdEntry = await store.saveManualMarkerValue({
        dotKey: 'biochemistry.glucose',
        date: '2026-06-01',
        storedValue: 4.8,
        noteText: 'fingerstick',
        now: 102,
      });
      const createdEntryRevert = await store.revertManualMarkerValue('biochemistry.glucose', '2026-06-01', { now: 103 });
      const persistedAfterCreate = JSON.parse(await encryptedGetItem(importedKey));
      outcomes.guardsAndEnsureImportedDataCreateAndPersist =
        missingKeySave === null
        && missingDateSave === null
        && createdEntryRevert === null
        && createdEntry?.date === '2026-06-01'
        && createdEntry.markers['biochemistry.glucose'] === 4.8
        && state.importedData.manualValues['biochemistry.glucose:2026-06-01'] === true
        && state.importedData.markerValueNotes['biochemistry.glucose:2026-06-01'] === 'fingerstick'
        && persistedAfterCreate.entries.some(e => e.date === '2026-06-01');

      state.importedData = {
        entries: [{
          date: '2026-05-01',
          updatedAt: 100,
          markers: {
            'diabetes.insulin': 8,
            'biochemistry.glucose': 4.7,
          },
          markerSources: {
            'diabetes.insulin': { file: 'lab.pdf', at: 100 },
            'biochemistry.glucose': { file: 'lab.pdf', at: 100 },
          },
          sourceFiles: ['lab.pdf'],
        }],
        manualValues: {},
        markerValueNotes: {},
        markerNotes: {},
        refOverrides: {},
      };
      const entry = state.importedData.entries[0];

      await store.saveManualMarkerValue({
        dotKey: 'diabetes.insulin',
        date: '2026-05-01',
        storedValue: 9,
        noteText: 'fasted',
        now: 1_000,
      });
      outcomes.saveManualMarkerValueStoresCanonicalInsulinOriginalNoteAndHOMAIR =
        entry.markers['diabetes.insulin'] === 9
        && entry.markers['diabetes.homaIR'] === 1.88
        && entry.markerSources['diabetes.insulin'].file === null
        && state.importedData.manualValues['diabetes.insulin:2026-05-01'] === 8
        && store.getManualOriginalForMarker('diabetes.insulin', '2026-05-01') === 8
        && state.importedData.markerValueNotes['diabetes.insulin:2026-05-01'] === 'fasted'
        && store.getMarkerValueNote('diabetes.insulin', '2026-05-01') === 'fasted'
        && store.hasMarkerValueForDate('diabetes.insulin', '2026-05-01')
        && !store.hasMarkerValueForDate('hormones.cortisol', '2026-05-01');

      const editedGlucose = await store.editManualMarkerValue({
        dotKey: 'biochemistry.glucose',
        date: '2026-05-01',
        storedValue: 5.2,
        now: 1_100,
      });
      const missingEdit = await store.editManualMarkerValue({
        dotKey: 'biochemistry.glucose',
        date: '2026-05-02',
        storedValue: 5.1,
        now: 1_101,
      });
      const revertedGlucose = await store.revertManualMarkerValue('biochemistry.glucose', '2026-05-01', { now: 1_200 });
      const missingRevert = await store.revertManualMarkerValue('diabetes.insulin', '2026-05-02', { now: 1_201 });
      outcomes.editAndRevertManualValueRestoreImportedSource =
        editedGlucose === entry
        && missingEdit === null
        && revertedGlucose === entry
        && missingRevert === null
        && entry.markers['biochemistry.glucose'] === 4.7
        && entry.updatedAt === 1_200
        && state.importedData.manualValues['biochemistry.glucose:2026-05-01'] === null
        && !hasOwn(entry.markerSources, 'biochemistry.glucose');

      const deleteMissing = await store.deleteManualMarkerValue('hormones.cortisol', '2026-05-01', { now: 1_250 });
      const deletedInsulin = await store.deleteManualMarkerValue('diabetes.insulin', '2026-05-01', { now: 1_300 });
      outcomes.deleteManualMarkerValueStoresCanonicalTombstoneAndClearsHOMAIR =
        deleteMissing === null
        && deletedInsulin?.changed === true
        && !hasOwn(entry.markers, 'hormones.insulin')
        && !hasOwn(entry.markers, 'diabetes.insulin_d')
        && !hasOwn(entry.markers, 'diabetes.insulin')
        && !hasOwn(entry.markers, 'diabetes.homaIR')
        && entry.deletedMarkers['diabetes.insulin'] === 1_300
        && state.importedData.manualValues['diabetes.insulin:2026-05-01'] === null;

      const savedLongNote = await store.saveMarkerValueNote('diabetes.insulin', '2026-05-01', 'x'.repeat(520));
      const savedSameNoteAgain = await store.saveMarkerValueNote('diabetes.insulin', '2026-05-01', 'x'.repeat(520));
      const deletedValueNote = await store.deleteMarkerValueNote('diabetes.insulin', '2026-05-01');
      const deletedMissingValueNote = await store.deleteMarkerValueNote('diabetes.insulin', '2026-05-02');
      outcomes.valueNotesCapAndDeleteAsNulls =
        savedLongNote === true
        && savedSameNoteAgain === false
        && deletedValueNote === true
        && deletedMissingValueNote === false
        && state.importedData.markerValueNotes['diabetes.insulin:2026-05-01'] === null;

      state.importedData.refOverrides['biochemistry.alt'] = {
        refMin: 7,
        refMax: 40,
        refSource: 'import',
      };
      const savedRef = await store.saveRefRangeOverride('biochemistry.alt', 'ref', { min: 8, max: 32 });
      const savedRefStashedLabRange = savedRef?.labRefMin === 7
        && savedRef.labRefMax === 40
        && savedRef.refMin === 8
        && savedRef.refSource === 'manual';
      const revertedRef = await store.revertRefRangeOverride('biochemistry.alt', 'ref');
      const savedOptimal = await store.saveRefRangeOverride('biochemistry.alt', 'optimal', { min: 10, max: 20 });
      const savedOptimalManualRange = savedOptimal?.optimalMin === 10
        && savedOptimal.optimalMax === 20
        && savedOptimal.optimalSource === 'manual';
      const revertedOptimal = await store.revertRefRangeOverride('biochemistry.alt', 'optimal');
      const badRange = await store.saveRefRangeOverride('biochemistry.alt', 'bad-type', { min: 1, max: 2 });
      const badRevert = await store.revertRefRangeOverride('biochemistry.alt', 'bad-type');
      outcomes.refRangeOverridesHandleRefOptimalRevertsAndGuards =
        savedRefStashedLabRange
        && revertedRef.message === 'Range reverted to lab range'
        && state.importedData.refOverrides['biochemistry.alt'].refMin === 7
        && state.importedData.refOverrides['biochemistry.alt'].refSource === 'import'
        && savedOptimalManualRange
        && revertedOptimal.message === 'Range reverted to default'
        && !hasOwn(state.importedData.refOverrides['biochemistry.alt'], 'optimalMin')
        && badRange === null
        && badRevert === null;

      const emptyNoteNoop = await store.saveMarkerNoteText('biochemistry.alt', '');
      const savedMarkerNote = await store.saveMarkerNoteText('biochemistry.alt', '  liver context  ');
      const whitespaceDeletedMarkerNote = await store.saveMarkerNoteText('biochemistry.alt', '  ');
      const resavedMarkerNote = await store.saveMarkerNoteText('biochemistry.alt', 'liver context');
      const deletedMarkerNote = await store.deleteMarkerNoteText('biochemistry.alt');
      const deletedMissingMarkerNote = await store.deleteMarkerNoteText('biochemistry.alt');
      const missingKeyNote = await store.saveMarkerNoteText('', 'ignored');
      outcomes.markerNotesTrimSaveDeleteAndGuard =
        emptyNoteNoop.action === 'noop'
        && savedMarkerNote.action === 'saved'
        && whitespaceDeletedMarkerNote.action === 'deleted'
        && resavedMarkerNote.action === 'saved'
        && deletedMarkerNote === true
        && deletedMissingMarkerNote === false
        && missingKeyNote.action === 'noop'
        && !hasOwn(state.importedData.markerNotes, 'biochemistry.alt');
    } finally {
      await encryptedRemoveItem(importedKey).catch(() => {});
      state.importedData = saved.importedData;
      state.currentProfile = saved.currentProfile;
      localStorage.clear();
      for (const [key, value] of storage) {
        if (key && value != null) localStorage.setItem(key, value);
      }
    }

    return outcomes;
  }, {
    storeUrl: moduleUrl('/js/marker-detail-store.js'),
  });

  expectAll(outcomes);
});
