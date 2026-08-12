import { expect, test } from './coverage-fixture.js';

function moduleUrl(path) {
  return `${path}?dataMergeCoverage=${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function expectAll(outcomes) {
  for (const [name, passed] of Object.entries(outcomes)) {
    expect(passed, name).toBe(true);
  }
}

test('data merge browser coverage covers timestamps lab entries and tombstone merge paths', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });

  const results = await page.evaluate(async ({ dataMergeUrl }) => {
    const dm = await import(dataMergeUrl);
    const outcomes = {};

    outcomes.pickTimestampRejectsInvalidRecords = dm.pickTimestamp(null) === 0
      && dm.pickTimestamp('bad') === 0;
    outcomes.pickTimestampHonorsZeroAndCapturedAt = dm.pickTimestamp({ updatedAt: 0, endedAt: 200 }) === 0
      && dm.pickTimestamp({ capturedAt: 40 }) === 40;
    outcomes.pickTimestampParsesIsoAndFallsThroughNaN =
      dm.pickTimestamp({ createdAt: '2026-05-31T04:00:00.000Z' }) === Date.parse('2026-05-31T04:00:00.000Z')
      && dm.pickTimestamp({ updatedAt: Number.NaN, date: '2026-04-15' }) === Date.parse('2026-04-15');
    outcomes.compareRecordFreshnessOrdersNewerOlderAndTies =
      dm.compareRecordFreshness({ updatedAt: 20 }, { updatedAt: 10 }) === 1
      && dm.compareRecordFreshness({ updatedAt: 10 }, { updatedAt: 20 }) === -1
      && dm.compareRecordFreshness({ updatedAt: 10 }, { updatedAt: 10 }) === 0;
    outcomes.pickFresherRecordKeepsCurrentOnTie =
      dm.pickFresherRecord({ id: 'tie', value: 'current', updatedAt: 10 }, { id: 'tie', value: 'candidate', updatedAt: 10 }).value === 'current';

    const mergedEntry = dm.mergeLabEntry(
      {
        date: '2026-06-01',
        updatedAt: 100,
        markers: {
          'biochemistry.glucose': 5,
          'diabetes.insulin': 8,
          'biochemistry.alp': 1.2,
        },
        markerSources: {
          'biochemistry.glucose': { file: 'old.pdf', at: 100 },
          'biochemistry.alp': { file: 'old.pdf', at: 100 },
        },
        sourceFile: 'old.pdf',
        sourceFiles: ['old.pdf'],
      },
      {
        date: '2026-06-01',
        updatedAt: 200,
        markers: {
          'biochemistry.glucose': 5.5,
        },
        markerSources: {
          'biochemistry.glucose': { file: 'new.pdf', at: 200 },
        },
        deletedMarkers: {
          'biochemistry.alp': 250,
        },
        sourceFile: 'new.pdf',
        sourceFiles: ['new.pdf'],
      }
    );
    outcomes.labEntryMergeKeepsFreshAndExistingMarkers =
      mergedEntry.markers?.['biochemistry.glucose'] === 5.5
      && mergedEntry.markers?.['diabetes.insulin'] === 8;
    outcomes.labEntryMergeAppliesMarkerTombstone =
      !Object.prototype.hasOwnProperty.call(mergedEntry.markers || {}, 'biochemistry.alp')
      && mergedEntry.deletedMarkers?.['biochemistry.alp'] === 250;
    outcomes.labEntryMergeKeepsFreshMarkerSource = mergedEntry.markerSources?.['biochemistry.glucose']?.file === 'new.pdf';
    outcomes.labEntryMergeUnionsSourceFiles =
      mergedEntry.sourceFiles.includes('old.pdf')
      && mergedEntry.sourceFiles.includes('new.pdf')
      && mergedEntry.sourceFile === 'new.pdf';

    const local = {
      genetics: { snps: { rsTest: 'AA' } },
      customMarkers: { localMarker: { name: 'Local' } },
      sunSessions: [
        { id: 's1', note: 'local fresh', updatedAt: 200 },
        { id: 's2', note: 'local only', updatedAt: 150 },
      ],
      lightEnvironment: {
        rooms: [{ id: 'r1', name: 'Desk', updatedAt: 100 }],
        screens: [{ id: 'screen-local', roomId: 'r1', updatedAt: 100 }],
        scalar: 'local',
      },
      notes: [{ date: '2026-05-01', text: 'Local note', updatedAt: 200 }],
      changeHistory: [
        { field: 'stress', date: '2026-05-01', snapshot: 'local', updatedAt: 200 },
        { field: 'sleep', date: '2026-05-02', snapshot: 'local only', updatedAt: 210 },
      ],
      entries: [
        {
          date: '2026-05-01',
          updatedAt: 200,
          markers: { 'biochemistry.alp': 1.2 },
          markerSources: { 'biochemistry.alp': { file: 'may.pdf', at: 200 } },
          sourceFiles: ['may.pdf'],
        },
      ],
      _deleted: { sunSessions: ['s-deleted'] },
      _deletedAt: { sunSessions: { 's-deleted': 500 } },
    };
    const remote = {
      genetics: { ancestry: 'remote-only' },
      customMarkers: { remoteMarker: { name: 'Remote' } },
      sunSessions: [
        { id: 's1', note: 'remote stale', updatedAt: 100 },
        { id: 's3', note: 'remote only', updatedAt: 300 },
        { id: 's-deleted', note: 'should not resurrect', updatedAt: 400 },
      ],
      lightEnvironment: {
        rooms: [{ id: 'r2', name: 'Kitchen', updatedAt: 300 }],
        screens: [{ id: 'screen-remote', roomId: 'r2', updatedAt: 300 }],
        scalar: 'remote',
      },
      notes: [{ date: '2026-05-02', text: 'Remote note', updatedAt: 100 }],
      changeHistory: [
        { field: 'stress', date: '2026-05-01', snapshot: 'remote', updatedAt: 100 },
        { field: 'diet', date: '2026-05-03', snapshot: 'remote only', updatedAt: 300 },
      ],
      entries: [
        {
          date: '2026-05-01',
          updatedAt: 100,
          markers: { 'biochemistry.glucose': 4.7 },
          markerSources: { 'biochemistry.glucose': { file: 'old.pdf', at: 100 } },
          sourceFiles: ['old.pdf'],
        },
      ],
      _deleted: { sunSessions: ['remote-deleted'] },
      _deletedAt: { sunSessions: { 'remote-deleted': 400 } },
    };
    const merged = dm.mergeImportedData(local, remote);
    const mergedMay = merged.entries.find(entry => entry.date === '2026-05-01');
    outcomes.importedDataMergePreservesGeneticsSnpsAndRemoteFields =
      merged.genetics.snps.rsTest === 'AA'
      && merged.genetics.ancestry === 'remote-only';
    outcomes.importedDataMergeMergesLocalWinsMaps =
      !!merged.customMarkers.localMarker
      && !!merged.customMarkers.remoteMarker;
    outcomes.importedDataMergePicksFreshAndAdditiveSunSessions =
      merged.sunSessions.find(session => session.id === 's1')?.note === 'local fresh'
      && merged.sunSessions.some(session => session.id === 's2')
      && merged.sunSessions.some(session => session.id === 's3');
    outcomes.importedDataMergeDropsAndPreservesTombstones =
      !merged.sunSessions.some(session => session.id === 's-deleted')
      && merged._deleted.sunSessions.includes('s-deleted')
      && merged._deleted.sunSessions.includes('remote-deleted');
    outcomes.importedDataMergeUnionsNestedLightEnvironment =
      merged.lightEnvironment.rooms.length === 2
      && merged.lightEnvironment.screens.length === 2
      && merged.lightEnvironment.scalar === 'remote';
    outcomes.importedDataMergeUnionsNaturalKeyNotes = merged.notes.length === 2;
    outcomes.importedDataMergeDedupsCompositeHistory =
      merged.changeHistory.length === 3
      && merged.changeHistory.find(row => row.field === 'stress')?.snapshot === 'local';
    outcomes.importedDataMergeMergesSameDateLabMarkers =
      mergedMay.markers?.['biochemistry.alp'] === 1.2
      && mergedMay.markers?.['biochemistry.glucose'] === 4.7;
    outcomes.importedDataMergeUnionsLabSourceFiles =
      mergedMay.sourceFiles.includes('may.pdf')
      && mergedMay.sourceFiles.includes('old.pdf');

    const freshNow = 2_000_000;
    const pulled = {
      entries: [{ date: '2026-05-01', updatedAt: freshNow - 60_000, markers: { 'biochemistry.glucose': 4.7 } }],
    };
    const freshLocal = {
      entries: [{ date: '2026-06-01', updatedAt: freshNow - 1_000, markers: { 'biochemistry.alp': 1.3 } }],
    };
    const preserveChanged = dm.preserveFreshLocalLabEntries(pulled, freshLocal, freshNow);
    const blockedByTombstone = dm.preserveFreshLocalLabEntries(
      { entries: [], _deleted: { entries: ['2026-06-01'] } },
      freshLocal,
      freshNow
    );
    outcomes.freshLocalLabEntriesRestoreMissingRecentEntry =
      preserveChanged === true
      && pulled.entries.some(entry => entry.date === '2026-06-01');
    outcomes.freshLocalLabEntriesRespectTombstones = blockedByTombstone === false;
    outcomes.freshLocalLabEntriesIgnoreStaleLocalEntry =
      dm.preserveFreshLocalLabEntries({ entries: [] }, { entries: [{ date: '2026-04-01', updatedAt: freshNow - 3 * 60_000 }] }, freshNow) === false;

    const reimportedAfterDelete = {
      entries: [{ date: '2026-05-01', updatedAt: 1_000, markers: { 'biochemistry.alp': 1.3 } }],
    };
    dm.clearTombstone(reimportedAfterDelete, 'entries', '2026-05-01');
    const mergedReimport = dm.mergeImportedData(reimportedAfterDelete, {
      entries: [],
      _deleted: { entries: ['2026-05-01'] },
      _deletedAt: { entries: { '2026-05-01': 500 } },
    });
    outcomes.clearTombstoneKeepsReimportedEntry =
      mergedReimport.entries.some(entry => entry.date === '2026-05-01')
      && !mergedReimport._deleted?.entries?.includes('2026-05-01');
    outcomes.clearTombstonePreservesClearMetadata =
      Number.isFinite(mergedReimport._deletedClearedAt?.entries?.['2026-05-01']);

    return outcomes;
  }, { dataMergeUrl: moduleUrl('/js/data-merge.js') });

  expectAll(results);
});

test('data merge browser coverage covers array mutations and rebroadcast predicates', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });

  const results = await page.evaluate(async ({ dataMergeUrl }) => {
    const dm = await import(dataMergeUrl);
    const outcomes = {};

    const nested = {};
    dm.setAt(nested, 'lightEnvironment.rooms', [{ id: 'room-1' }]);
    dm.setAt(nested, '__proto__.polluted', true);
    dm.setAt(nested, 'constructor.prototype.polluted', true);
    dm.setAt(nested, 'prototype.polluted', true);
    const inheritedPath = Object.create({ lightEnvironment: { rooms: [{ id: 'inherited' }] } });
    dm.setAt(inheritedPath, 'lightEnvironment.rooms', [{ id: 'own-room' }]);
    outcomes.setAtCreatesNestedPaths = dm.getAt(nested, 'lightEnvironment.rooms.0.id') === 'room-1';
    outcomes.getAtReturnsUndefinedForNullRoot = dm.getAt(null, 'anything') === undefined;
    outcomes.getAtIgnoresInheritedPath = dm.getAt(Object.create({ lightEnvironment: { rooms: [] } }), 'lightEnvironment.rooms') === undefined;
    outcomes.setAtWritesOwnPathOverInherited = Object.prototype.hasOwnProperty.call(inheritedPath, 'lightEnvironment')
      && inheritedPath.lightEnvironment.rooms[0].id === 'own-room';
    outcomes.setAtRejectsPrototypePollution = !({}).polluted;
    outcomes.setAtReturnsFalseForFrozenTarget =
      dm.setAt(Object.freeze({}), 'lightEnvironment.rooms', []) === false;

    const idsBlob = {};
    const firstNotes = dm.ensureImportedArray(idsBlob, 'notes');
    dm.appendImportedArrayItem(idsBlob, 'notes', { date: '2026-05-01', text: 'Original note' });
    const originalNoteId = dm.getConfiguredArrayItemId('notes', idsBlob.notes[0]);
    const replaceResult = dm.replaceImportedArrayItem(idsBlob, 'notes', 0, { date: '2026-05-01', text: 'Edited note' });
    const editedNoteId = dm.getConfiguredArrayItemId('notes', idsBlob.notes[0]);
    const deleteResult = dm.deleteImportedArrayItem(idsBlob, 'notes', 0);
    outcomes.ensureImportedArrayCreatesMissingNaturalArray = Array.isArray(firstNotes);
    outcomes.configuredArrayItemIdResolvesNaturalNoteIds =
      typeof originalNoteId === 'string'
      && typeof editedNoteId === 'string';
    outcomes.replaceImportedArrayItemReturnsPreviousAndNext =
      replaceResult.previousItem.text === 'Original note'
      && replaceResult.nextItem.text === 'Edited note';
    outcomes.replaceImportedArrayItemTombstonesOldNaturalId = idsBlob._deleted.notes.includes(originalNoteId);
    outcomes.deleteImportedArrayItemReturnsAndTombstonesRemovedRow =
      deleteResult.removedItem.text === 'Edited note'
      && idsBlob._deleted.notes.includes(editedNoteId);
    outcomes.configuredArrayItemIdAcceptsSafeFallbackId =
      dm.getConfiguredArrayItemId('unknownPath', { id: 'safe-id' }) === 'safe-id';
    outcomes.configuredArrayItemIdRejectsUnsafeFallbackId =
      dm.getConfiguredArrayItemId('unknownPath', { id: '__proto__' }) === null;
    outcomes.singleItemMutationsRejectOutOfBoundsIndexes =
      dm.replaceImportedArrayItem(idsBlob, 'notes', 9, { text: 'Nope' }) === null
      && dm.deleteImportedArrayItem(idsBlob, 'notes', 9) === null;

    const bulkBlob = {
      lightEnvironment: { rooms: [{ id: 'r1', name: 'Desk' }, { id: 'r2', name: 'Bed' }] },
      lightMeasurements: [{ id: 'm1', roomId: 'r1' }, { id: 'm2', roomId: 'r2' }],
      healthGoals: [{ text: 'Lower CRP', severity: 'major' }, { text: 'Raise ferritin', severity: 'minor' }],
      changeHistory: [
        { field: 'b', date: '2026-05-03', snapshot: 3 },
        { field: 'a', date: '2026-05-01', snapshot: 1 },
        { field: 'a', date: '2026-05-02', snapshot: 2 },
      ],
    };
    const removedRooms = dm.deleteImportedArrayItems(bulkBlob, 'lightEnvironment.rooms', room => room.id === 'r1');
    const removedMeasurements = dm.deleteImportedArrayItems(bulkBlob, 'lightMeasurements', measurement => measurement.roomId === 'r1');
    const clearedGoals = dm.clearImportedArray(bulkBlob, 'healthGoals');
    const sortedHistory = dm.sortImportedArray(bulkBlob, 'changeHistory', (a, b) => a.date.localeCompare(b.date));
    const trimmedOldest = dm.trimImportedArray(bulkBlob, 'changeHistory', 2);
    const invalidTrim = dm.trimImportedArray(bulkBlob, 'changeHistory', -1);
    outcomes.deleteImportedArrayItemsHandlesDottedPaths =
      removedRooms.length === 1
      && removedMeasurements.length === 1
      && bulkBlob.lightEnvironment.rooms[0].id === 'r2'
      && bulkBlob.lightMeasurements[0].id === 'm2';
    outcomes.deleteImportedArrayItemsTombstonesDottedPathRows =
      bulkBlob._deleted['lightEnvironment.rooms'].includes('r1')
      && bulkBlob._deleted.lightMeasurements.includes('m1');
    outcomes.clearImportedArrayEmptiesAndTombstonesConfiguredRows =
      clearedGoals.length === 2
      && bulkBlob.healthGoals.length === 0
      && bulkBlob._deleted.healthGoals.length === 2;
    outcomes.sortImportedArraySortsInPlace = sortedHistory[0].date === '2026-05-01';
    outcomes.trimImportedArrayKeepsNewestRows =
      trimmedOldest[0].date === '2026-05-01'
      && bulkBlob.changeHistory.length === 2;
    outcomes.trimImportedArrayRejectsInvalidMaxLength = invalidTrim.length === 0;
    outcomes.bulkMutationsReturnEmptyForMissingArrays =
      dm.deleteImportedArrayItems(bulkBlob, 'missing.path', () => true).length === 0
      && dm.clearImportedArray(bulkBlob, 'missing.path').length === 0
      && dm.sortImportedArray(bulkBlob, 'missing.path', () => 0).length === 0;

    const keepFirstBlob = {
      notes: [
        { date: '2026-05-01', text: 'one' },
        { date: '2026-05-02', text: 'two' },
        { date: '2026-05-03', text: 'three' },
      ],
    };
    const removedTail = dm.trimImportedArray(keepFirstBlob, 'notes', 1, { keep: 'first' });
    outcomes.trimKeepFirstRemovesTailRows =
      keepFirstBlob.notes.length === 1
      && keepFirstBlob.notes[0].text === 'one'
      && removedTail.map(note => note.text).join(',') === 'two,three';
    outcomes.trimKeepFirstTombstonesConfiguredRows = keepFirstBlob._deleted.notes.length === 2;

    const union = dm.unionById(
      [{ id: 'a', updatedAt: 10 }, { id: 'b', updatedAt: 20 }, { localOnly: true }],
      [{ id: 'b', updatedAt: 30, value: 'remote fresh' }, { id: 'c', updatedAt: 40 }, { remoteOnly: true }],
      ['c']
    );
    outcomes.unionByIdPicksFreshConflictWinner =
      union.length === 4
      && union.find(row => row.id === 'b')?.value === 'remote fresh';
    outcomes.unionByIdDropsTombstonedIds = !union.some(row => row.id === 'c');
    outcomes.unionByIdKeepsIdlessRows =
      union.some(row => row.localOnly)
      && union.some(row => row.remoteOnly);

    const tombBlob = {};
    dm.recordTombstone(tombBlob, 'sunSessions', 's1');
    dm.recordTombstone(tombBlob, 'sunSessions', 's1');
    dm.recordTombstone(tombBlob, 'entries', '2026-05-01');
    dm.clearTombstone(tombBlob, 'entries', '2026-05-01');
    dm.recordTombstone(null, 'sunSessions', 'ignored');
    dm.recordTombstone(tombBlob, 'sunSessions', '');
    dm.clearTombstone(null, 'sunSessions', 'ignored');
    dm.clearTombstone(tombBlob, 'sunSessions', '');
    outcomes.recordTombstoneDedupesAndStoresMetadata =
      tombBlob._deleted.sunSessions.filter(id => id === 's1').length === 1
      && Number.isFinite(tombBlob._deletedAt.sunSessions.s1);
    outcomes.clearTombstoneRemovesEntryDeleteAndStoresClearMetadata =
      !tombBlob._deleted.entries
      && Number.isFinite(tombBlob._deletedClearedAt.entries['2026-05-01']);

    outcomes.localHasRowsRemoteLacksDetectsMissingIdRows =
      dm.localHasRowsRemoteLacks({ sunSessions: [{ id: 'a' }, { id: 'b' }] }, { sunSessions: [{ id: 'a' }] }) === true;
    outcomes.localHasRowsRemoteLacksDetectsFreshLocalRows =
      dm.localHasRowsRemoteLacks({ sunSessions: [{ id: 'a', updatedAt: 20 }] }, { sunSessions: [{ id: 'a', updatedAt: 10 }] }) === true;
    outcomes.localHasRowsRemoteLacksIgnoresRemoteSuperset =
      dm.localHasRowsRemoteLacks({ sunSessions: [{ id: 'a' }] }, { sunSessions: [{ id: 'a' }, { id: 'b' }] }) === false;
    outcomes.localHasRowsRemoteLacksIgnoresOrderOnlyDiffs =
      dm.localHasRowsRemoteLacks({ sunSessions: [{ id: 'a' }, { id: 'b' }] }, { sunSessions: [{ id: 'b' }, { id: 'a' }] }) === false;
    outcomes.localHasRowsRemoteLacksDetectsLocalWinsMapRows =
      dm.localHasRowsRemoteLacks({ customMarkers: { local: { name: 'Local' } } }, { customMarkers: {} }) === true;
    outcomes.localHasRowsRemoteLacksDetectsNaturalKeyRows =
      dm.localHasRowsRemoteLacks({ notes: [{ date: '2026-05-02', text: 'Local note' }] }, { notes: [] }) === true;
    outcomes.localHasRowsRemoteLacksDetectsMissingLabMarkers =
      dm.localHasRowsRemoteLacks({ entries: [{ date: '2026-05-01', markers: { a: 1, b: 2 } }] }, { entries: [{ date: '2026-05-01', markers: { a: 1 } }] }) === true;
    outcomes.localHasRowsRemoteLacksDetectsLabMarkerTombstones =
      dm.localHasRowsRemoteLacks({ entries: [{ date: '2026-05-01', deletedMarkers: { b: 200 }, markers: { a: 1 } }] }, { entries: [{ date: '2026-05-01', markers: { a: 1, b: 2 } }] }) === true;
    outcomes.localHasRowsRemoteLacksDetectsNewerTombstoneMetadata =
      dm.localHasRowsRemoteLacks({ _deleted: { sunSessions: ['gone'] }, _deletedAt: { sunSessions: { gone: 200 } } }, { _deleted: { sunSessions: ['gone'] }, _deletedAt: { sunSessions: { gone: 100 } } }) === true;
    outcomes.localHasRowsRemoteLacksDetectsNewerClearMetadata =
      dm.localHasRowsRemoteLacks({ _deletedClearedAt: { entries: { '2026-05-01': 200 } } }, { _deletedClearedAt: { entries: { '2026-05-01': 100 } } }) === true;
    outcomes.localHasRowsRemoteLacksHandlesNullSides =
      dm.localHasRowsRemoteLacks(null, { sunSessions: [{ id: 'a' }] }) === false
      && dm.localHasRowsRemoteLacks({ sunSessions: [{ id: 'a' }] }, null) === true;

    return outcomes;
  }, { dataMergeUrl: moduleUrl('/js/data-merge.js') });

  expectAll(results);
});
