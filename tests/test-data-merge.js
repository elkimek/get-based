#!/usr/bin/env node
// test-data-merge.js — per-array union-by-id sync merge: additions, edit
// conflict resolution, tombstones (no resurrection of deleted rows), nested
// paths inside lightEnvironment, single-object LWW preservation.
//
// Run: node tests/test-data-merge.js  (or via npm test — wrapped by _vitest-legacy.test.js)

let pass = 0, fail = 0;
function assert(name, condition, detail) {
  if (condition) { pass++; console.log(`  PASS: ${name}`); }
  else { fail++; console.log(`  FAIL: ${name}${detail ? ' — ' + detail : ''}`); }
}

console.log('=== Data Merge Tests ===\n');

globalThis.window = globalThis.window || {};

const {
  compareRecordFreshness,
  appendImportedArrayItem,
  clearImportedArray,
  deleteImportedArrayItem,
  deleteImportedArrayItems,
  ensureImportedArray,
  mergeImportedData,
  preserveFreshLocalLabEntries,
  replaceImportedArrayItem,
  recordTombstone,
  recordArrayItemTombstone,
  clearTombstone,
  unionById,
  ID_KEYED_ARRAYS,
  NATURAL_KEYED_ARRAYS,
  TOMBSTONE_ARRAY_PATHS,
  localHasRowsRemoteLacks,
  pickTimestamp,
  pickFresherRecord,
} = await import('../js/data-merge.js');
const { mergeArrayRowsIntoImported } = await import('../js/sync-delta-array-merge.js');
const { DELTA_ARRAY_CONFIG } = await import('../js/sync-delta-surface-config.js');

  // ─── pickTimestamp precedence (v1.7.20) ───────────────────────────────
  // Direct test for the field-precedence walk used by every cross-device
  // merge. Earlier coverage was indirect (asserted via unionById behavior
  // — a regression that swapped two precedence steps could pass the
  // "higher updatedAt wins" test depending on which step grabbed first).
  console.log('%c 0. pickTimestamp field precedence ', 'font-weight:bold;color:#f59e0b');
  assert('null record → 0', pickTimestamp(null) === 0);
  assert('non-object record → 0', pickTimestamp('hello') === 0);
  assert('updatedAt wins over endedAt',
    pickTimestamp({ updatedAt: 100, endedAt: 200 }) === 100);
  assert('endedAt wins when updatedAt missing',
    pickTimestamp({ endedAt: 200, startedAt: 50 }) === 200);
  assert('startedAt wins when later siblings missing',
    pickTimestamp({ startedAt: 50, capturedAt: 30 }) === 50);
  assert('capturedAt > loggedAt > createdAt > at chain',
    pickTimestamp({ capturedAt: 40 }) === 40 &&
    pickTimestamp({ loggedAt: 30 }) === 30 &&
    pickTimestamp({ createdAt: 20 }) === 20 &&
    pickTimestamp({ at: 10 }) === 10);
  assert('createdAt ISO strings are parsed for chat-summary freshness',
    pickTimestamp({ createdAt: '2026-05-31T04:00:00.000Z' }) === Date.parse('2026-05-31T04:00:00.000Z'));
  assert('takenAt and addedAt are recognized for light tools/devices',
    pickTimestamp({ takenAt: 70 }) === 70 && pickTimestamp({ addedAt: 80 }) === 80);
  assert('falls back to Date.parse(date) when no numeric field',
    pickTimestamp({ date: '2026-04-15' }) === Date.parse('2026-04-15'));
  assert('returns 0 on totally bare record', pickTimestamp({}) === 0);
  assert('non-finite numeric field falls through to date parse',
    pickTimestamp({ updatedAt: NaN, date: '2026-04-15' }) === Date.parse('2026-04-15'));
  assert('zero updatedAt is honored (epoch — not falsy fallthrough)',
    pickTimestamp({ updatedAt: 0, endedAt: 200 }) === 0);
  assert('compareRecordFreshness reports newer/older/equal',
    compareRecordFreshness({ updatedAt: 20 }, { updatedAt: 10 }) === 1
      && compareRecordFreshness({ updatedAt: 10 }, { updatedAt: 20 }) === -1
      && compareRecordFreshness({ updatedAt: 10 }, { updatedAt: 10 }) === 0);
  assert('pickFresherRecord keeps current record on timestamp tie',
    pickFresherRecord({ id: 'tie', value: 'current', updatedAt: 10 }, { id: 'tie', value: 'candidate', updatedAt: 10 }).value === 'current');

  // ─── 1. Coverage of known arrays ──────────────────────────────────────
  console.log('%c 1. ID_KEYED_ARRAYS coverage ', 'font-weight:bold;color:#f59e0b');
  for (const path of ['sunSessions','deviceSessions','lightDevices','lightMeasurements','lightEnvironment.rooms','lightEnvironment.screens']) {
    assert(`covers ${path}`, ID_KEYED_ARRAYS.includes(path));
  }
  for (const path of ['supplements','healthGoals','notes','chatSummaries']) {
    assert(`natural-key merge covers ${path}`, NATURAL_KEYED_ARRAYS.includes(path));
    assert(`tombstone path covers ${path}`, TOMBSTONE_ARRAY_PATHS.includes(path));
  }
  assert('entries is an explicit tombstone path', TOMBSTONE_ARRAY_PATHS.includes('entries'));

  // ─── 2. unionById additivity ──────────────────────────────────────────
  console.log('%c 2. unionById additive merge ', 'font-weight:bold;color:#f59e0b');
  const A = [{id:'a',startedAt:1},{id:'b',startedAt:2}];
  const B = [{id:'b',startedAt:2},{id:'c',startedAt:3}];
  const u = unionById(A, B, []);
  assert('union has all 3 ids', u.length === 3 && u.find(x=>x.id==='a') && u.find(x=>x.id==='b') && u.find(x=>x.id==='c'));

  // Conflict: higher updatedAt wins
  const L = [{id:'x', text:'old', updatedAt:100}];
  const R = [{id:'x', text:'new', updatedAt:200}];
  const c = unionById(L, R, []);
  assert('higher updatedAt wins', c.length === 1 && c[0].text === 'new');

  // Falls back to startedAt when updatedAt absent
  const L2 = [{id:'y', text:'old', startedAt:500}];
  const R2 = [{id:'y', text:'new', startedAt:400}];
  const c2 = unionById(L2, R2, []);
  assert('falls back to startedAt', c2.length === 1 && c2[0].text === 'old');

  // Items without ids preserved on both sides
  const L3 = [{foo:1}];
  const R3 = [{bar:2}];
  const c3 = unionById(L3, R3, []);
  assert('id-less items preserved (both sides)', c3.length === 2);

  // ─── 3. Tombstones drop resurrected rows ──────────────────────────────
  console.log('%c 3. Tombstone resurrection guard ', 'font-weight:bold;color:#f59e0b');
  const remoteWithStale = [{id:'a',startedAt:1},{id:'b',startedAt:2}]; // remote hasn't pulled the delete yet
  const localAfterDelete = [{id:'a',startedAt:1}]; // local deleted b
  const tomb = ['b'];
  const u2 = unionById(localAfterDelete, remoteWithStale, tomb);
  assert('tombstoned id is dropped from union', u2.length === 1 && u2[0].id === 'a');

  // ─── 4. mergeImportedData end-to-end (the user's symptom) ─────────────
  console.log('%c 4. mergeImportedData additive ', 'font-weight:bold;color:#f59e0b');

  // Phone state after logging session C
  const phone = {
    sunSessions: [{id:'a',startedAt:1},{id:'b',startedAt:2},{id:'c',startedAt:3}],
    lightDevices: [{id:'X',addedAt:1}],
    sunDefaults: { coords: { lat: 49.8, lon: 15.5 } },
  };
  // Desktop state after adding device Y (hadn't pulled C yet)
  const desktop = {
    sunSessions: [{id:'a',startedAt:1},{id:'b',startedAt:2}],
    lightDevices: [{id:'X',addedAt:1},{id:'Y',addedAt:5}],
    sunDefaults: { coords: { lat: 49.8, lon: 15.5 } },
  };

  // Phone pulls desktop's blob — should keep C and gain Y
  const onPhone = mergeImportedData(phone, desktop);
  assert('phone keeps own session C after pull', onPhone.sunSessions.find(s=>s.id==='c'));
  assert('phone gains desktop device Y', onPhone.lightDevices.find(d=>d.id==='Y'));
  assert('phone keeps session A and B', onPhone.sunSessions.find(s=>s.id==='a') && onPhone.sunSessions.find(s=>s.id==='b'));

  // Desktop pulls phone's blob — should keep Y and gain C
  const onDesktop = mergeImportedData(desktop, phone);
  assert('desktop keeps own device Y after pull', onDesktop.lightDevices.find(d=>d.id==='Y'));
  assert('desktop gains phone session C', onDesktop.sunSessions.find(s=>s.id==='c'));

  // Lab entries have no `id`; they are keyed by collection date and must
  // still merge additively. Otherwise a stale sync pull can wipe a just-
  // imported PDF entry from Settings → Data.
  const localLabs = {
    entries: [
      { date: '2026-03-01', markers: { 'biochemistry.glucose': 4.8 } },
      { date: '2026-05-01', updatedAt: 200, markers: { 'biochemistry.alp': 1.2 }, markerSources: { 'biochemistry.alp': { file: 'may.pdf' } }, sourceFiles: ['may.pdf'] }
    ],
    customMarkers: { 'custom.activeB12': { name: 'Active B12' } }
  };
  const remoteLabs = {
    entries: [
      { date: '2026-03-01', updatedAt: 100, markers: { 'biochemistry.glucose': 4.7, 'biochemistry.alt': 0.5 }, sourceFiles: ['march.pdf'] }
    ],
    customMarkers: { 'custom.oldMarker': { name: 'Old Marker' } }
  };
  const mergedLabs = mergeImportedData(localLabs, remoteLabs);
  const march = mergedLabs.entries.find(e => e.date === '2026-03-01');
  const may = mergedLabs.entries.find(e => e.date === '2026-05-01');
  assert('lab entries merge by date instead of stale remote replacing local',
    mergedLabs.entries.length === 2 && may?.markers?.['biochemistry.alp'] === 1.2);
  assert('same-date lab entries merge marker keys',
    march?.markers?.['biochemistry.glucose'] === 4.8 && march?.markers?.['biochemistry.alt'] === 0.5);
  assert('custom marker maps merge local and remote definitions',
    mergedLabs.customMarkers['custom.activeB12'] && mergedLabs.customMarkers['custom.oldMarker']);

  const deltaImported = {
    entries: [{
      date: '2026-05-01',
      updatedAt: 200,
      markers: { 'biochemistry.alp': 1.2 },
      markerSources: { 'biochemistry.alp': { file: 'may.pdf' } },
      sourceFiles: ['may.pdf'],
    }],
  };
  await mergeArrayRowsIntoImported(deltaImported, 'entries', [{
    itemId: '2026-05-01',
    syncedAt: '2026-05-26T08:00:00.000Z',
    isDeleted: 0,
    payload: JSON.stringify({
      date: '2026-05-01',
      updatedAt: 100,
      markers: { 'biochemistry.glucose': 4.7 },
      markerSources: { 'biochemistry.glucose': { file: 'old-sync.pdf' } },
      sourceFiles: ['old-sync.pdf'],
    }),
  }]);
  const deltaMay = deltaImported.entries.find(e => e.date === '2026-05-01');
  assert('per-row entries overlay merges same-date markers instead of replacing fresh import',
    deltaMay?.markers?.['biochemistry.alp'] === 1.2
      && deltaMay?.markers?.['biochemistry.glucose'] === 4.7);
  const editedDeviceSession = {
    deviceSessions: [{
      id: 'devsess_duration_edit',
      durationMin: 20,
      endedAt: 1_200_000,
      updatedAt: 2_000_000,
      doses: { circadian: 200 },
    }],
  };
  await mergeArrayRowsIntoImported(editedDeviceSession, 'deviceSessions', [{
    itemId: 'devsess_duration_edit',
    syncedAt: new Date(1_500_000).toISOString(),
    isDeleted: 0,
    payload: JSON.stringify({
      id: 'devsess_duration_edit',
      durationMin: 10,
      endedAt: 600_000,
      updatedAt: 1_000_000,
      doses: { circadian: 100 },
    }),
  }]);
  assert('stale per-row deviceSession does not revert fresh local duration edit',
    editedDeviceSession.deviceSessions[0].durationMin === 20
      && editedDeviceSession.deviceSessions[0].doses?.circadian === 200);
  await mergeArrayRowsIntoImported(editedDeviceSession, 'deviceSessions', [{
    itemId: 'devsess_duration_edit',
    syncedAt: new Date(2_500_000).toISOString(),
    isDeleted: 0,
    payload: JSON.stringify({
      id: 'devsess_duration_edit',
      durationMin: 25,
      endedAt: 1_500_000,
      updatedAt: 3_000_000,
      doses: { circadian: 250 },
    }),
  }]);
  assert('newer per-row deviceSession still updates local copy',
    editedDeviceSession.deviceSessions[0].durationMin === 25
      && editedDeviceSession.deviceSessions[0].doses?.circadian === 250);
  const magnesiumV1 = {
    name: 'Magnesium',
    startDate: '2026-05-01',
    type: 'supplement',
    dosage: '100 mg',
    updatedAt: 1_000_000,
  };
  const magnesiumId = DELTA_ARRAY_CONFIG.supplements.itemIdFn(magnesiumV1);
  const editedSupplement = {
    supplements: [{
      name: 'Magnesium',
      startDate: '2026-05-01',
      type: 'supplement',
      dosage: '200 mg',
      updatedAt: 2_000_000,
    }],
  };
  await mergeArrayRowsIntoImported(editedSupplement, 'supplements', [{
    itemId: magnesiumId,
    syncedAt: new Date(1_500_000).toISOString(),
    isDeleted: 0,
    payload: JSON.stringify(magnesiumV1),
  }]);
  assert('stale per-row supplement does not revert fresh local stable-id edit',
    editedSupplement.supplements[0].dosage === '200 mg');
  await mergeArrayRowsIntoImported(editedSupplement, 'supplements', [{
    itemId: magnesiumId,
    syncedAt: new Date(2_500_000).toISOString(),
    isDeleted: 0,
    payload: JSON.stringify({
      name: 'Magnesium',
      startDate: '2026-05-01',
      type: 'supplement',
      dosage: '300 mg',
      updatedAt: 3_000_000,
    }),
  }]);
  assert('newer per-row supplement still updates stable-id local copy',
    editedSupplement.supplements[0].dosage === '300 mg');
  const zincRemote = { name: 'Zinc', startDate: '2026-05-02', type: 'supplement', dosage: '10 mg' };
  const tieSupplement = {
    supplements: [{ name: 'Zinc', startDate: '2026-05-02', type: 'supplement', dosage: '15 mg' }],
  };
  await mergeArrayRowsIntoImported(tieSupplement, 'supplements', [{
    itemId: DELTA_ARRAY_CONFIG.supplements.itemIdFn(zincRemote),
    syncedAt: new Date(4_000_000).toISOString(),
    isDeleted: 0,
    payload: JSON.stringify(zincRemote),
  }]);
  assert('timestamp tie keeps current stable-id array item instead of reverting',
    tieSupplement.supplements[0].dosage === '15 mg');
  const blobSupplementLocal = {
    supplements: [{
      name: 'Magnesium',
      startDate: '2026-05-01',
      type: 'supplement',
      dosage: '400 mg',
      updatedAt: 5_000_000,
    }],
  };
  const blobSupplementRemote = {
    supplements: [{
      name: 'Magnesium',
      startDate: '2026-05-01',
      type: 'supplement',
      dosage: '100 mg',
      updatedAt: 1_000_000,
    }],
  };
  const mergedSupplementBlob = mergeImportedData(blobSupplementLocal, blobSupplementRemote);
  assert('blob merge preserves fresher local natural-key supplement before row overlay',
    mergedSupplementBlob.supplements.length === 1
      && mergedSupplementBlob.supplements[0].dosage === '400 mg');
  assert('localHasRowsRemoteLacks detects natural-key supplement timestamp drift',
    localHasRowsRemoteLacks(blobSupplementLocal, blobSupplementRemote) === true);
  const notesUnion = mergeImportedData(
    { notes: [{ date: '2026-05-01', text: 'Local note' }] },
    { notes: [{ date: '2026-05-02', text: 'Remote note' }] },
  );
  assert('natural-key notes merge additively instead of whole-array LWW',
    notesUnion.notes.length === 2
      && notesUnion.notes.some(n => n.text === 'Local note')
      && notesUnion.notes.some(n => n.text === 'Remote note'));
  const oldNote = { date: '2026-05-01', text: 'Original note' };
  const editedNote = { date: '2026-05-01', text: 'Edited note' };
  const editedNoteLocal = { notes: [editedNote] };
  recordArrayItemTombstone(editedNoteLocal, 'notes', oldNote);
  const mergedEditedNote = mergeImportedData(editedNoteLocal, { notes: [oldNote] });
  assert('notes identity edit tombstone prevents old text ghost duplicate',
    mergedEditedNote.notes.length === 1
      && mergedEditedNote.notes[0].text === 'Edited note');
  const renamedSupplementLocal = {
    supplements: [{
      name: 'Magnesium glycinate',
      startDate: '2026-05-01',
      type: 'supplement',
      dosage: '200 mg',
      updatedAt: 6_000_000,
    }],
  };
  recordArrayItemTombstone(renamedSupplementLocal, 'supplements', {
    name: 'Magnesium',
    startDate: '2026-05-01',
    type: 'supplement',
    dosage: '200 mg',
    updatedAt: 5_000_000,
  });
  const mergedRenamedSupplement = mergeImportedData(renamedSupplementLocal, {
    supplements: [{
      name: 'Magnesium',
      startDate: '2026-05-01',
      type: 'supplement',
      dosage: '200 mg',
      updatedAt: 5_000_000,
    }],
  });
  assert('supplement identity edit tombstone prevents old-name ghost duplicate',
    mergedRenamedSupplement.supplements.length === 1
      && mergedRenamedSupplement.supplements[0].name === 'Magnesium glycinate');
  const healthGoalLocal = { healthGoals: [{ text: 'Lower CRP', severity: 'major', updatedAt: 5_000_000 }] };
  await mergeArrayRowsIntoImported(healthGoalLocal, 'healthGoals', [{
    itemId: DELTA_ARRAY_CONFIG.healthGoals.itemIdFn({ text: 'Lower CRP', severity: 'minor' }),
    syncedAt: new Date(4_000_000).toISOString(),
    isDeleted: 0,
    payload: JSON.stringify({ text: 'Lower CRP', severity: 'minor', updatedAt: 1_000_000 }),
  }]);
  assert('stale per-row health goal does not revert fresh local severity',
    healthGoalLocal.healthGoals[0].severity === 'major');
  const chatSummaryLocal = {
    chatSummaries: [{
      id: 's_local',
      threadId: 't_lab',
      threadName: 'Lab',
      content: 'Fresh',
      createdAt: '2026-05-31T04:00:00.000Z',
    }],
  };
  await mergeArrayRowsIntoImported(chatSummaryLocal, 'chatSummaries', [{
    itemId: DELTA_ARRAY_CONFIG.chatSummaries.itemIdFn({ threadId: 't_lab' }),
    syncedAt: '2026-05-31T04:01:00.000Z',
    isDeleted: 0,
    payload: JSON.stringify({
      id: 's_remote',
      threadId: 't_lab',
      threadName: 'Lab',
      content: 'Stale',
      createdAt: '2026-05-31T03:00:00.000Z',
    }),
  }]);
  assert('stale per-row chat summary respects ISO createdAt freshness',
    chatSummaryLocal.chatSummaries[0].content === 'Fresh');
  const freshNow = 2_000_000;
  const stalePulledImport = {
    entries: [{
      date: '2026-03-01',
      updatedAt: freshNow - 60_000,
      markers: { 'biochemistry.glucose': 4.7 },
    }],
  };
  const localAfterMayImport = {
    entries: [{
      date: '2026-05-01',
      updatedAt: freshNow - 1000,
      markers: { 'biochemistry.alp': 1.2 },
      markerSources: { 'biochemistry.alp': { file: 'may.pdf', at: freshNow - 1000 } },
      sourceFiles: ['may.pdf'],
    }],
  };
  assert('fresh local lab import is restored after stale pull overlay drops it',
    preserveFreshLocalLabEntries(stalePulledImport, localAfterMayImport, freshNow) === true
      && stalePulledImport.entries.some(e => e.date === '2026-05-01' && e.markers?.['biochemistry.alp'] === 1.2));
  const tombstonedFreshPulledImport = {
    entries: [],
    _deleted: { entries: ['2026-05-01'] },
    _deletedAt: { entries: { '2026-05-01': freshNow } },
  };
  assert('fresh local lab import is not restored over a merged entry tombstone',
    preserveFreshLocalLabEntries(tombstonedFreshPulledImport, localAfterMayImport, freshNow) === false
      && !tombstonedFreshPulledImport.entries.some(e => e.date === '2026-05-01'));
  const sameDatePulledImport = {
    entries: [{
      date: '2026-05-01',
      updatedAt: freshNow - 60_000,
      markers: { 'biochemistry.glucose': 4.7 },
    }],
  };
  assert('fresh same-date lab import markers survive stale pull overlay',
    preserveFreshLocalLabEntries(sameDatePulledImport, localAfterMayImport, freshNow) === true
      && sameDatePulledImport.entries[0].markers?.['biochemistry.alp'] === 1.2
      && sameDatePulledImport.entries[0].markers?.['biochemistry.glucose'] === 4.7);
  const oldLocalImport = {
    entries: [{
      date: '2026-04-01',
      updatedAt: freshNow - 3 * 60 * 1000,
      markers: { 'biochemistry.alt': 0.5 },
    }],
  };
  assert('old local lab entry is not resurrected by freshness guard',
    preserveFreshLocalLabEntries({ entries: [] }, oldLocalImport, freshNow) === false);
  const tombstoneImported = {
    entries: [{
      date: '2026-05-01',
      updatedAt: 200,
      markers: { 'biochemistry.alp': 1.2 },
    }],
  };
  await mergeArrayRowsIntoImported(tombstoneImported, 'entries', [{
    itemId: '2026-05-01',
    syncedAt: new Date(100).toISOString(),
    isDeleted: 1,
    payload: '{}',
  }]);
  assert('stale per-row entries tombstone does not delete fresher local import',
    tombstoneImported.entries.some(e => e.date === '2026-05-01' && e.markers?.['biochemistry.alp'] === 1.2));
  await mergeArrayRowsIntoImported(tombstoneImported, 'entries', [{
    itemId: '2026-05-01',
    syncedAt: new Date(300).toISOString(),
    isDeleted: 1,
    payload: '{}',
  }]);
  assert('newer per-row entries tombstone still deletes older local import',
    !tombstoneImported.entries.some(e => e.date === '2026-05-01'));

  // ─── 5. mergeImportedData with tombstones ─────────────────────────────
  console.log('%c 5. mergeImportedData tombstones ', 'font-weight:bold;color:#f59e0b');

  // Phone deletes session B → tombstoned + removed locally
  const phoneAfterDelete = {
    sunSessions: [{id:'a',startedAt:1},{id:'c',startedAt:3}],
    _deleted: { sunSessions: ['b'] },
  };
  // Desktop didn't see the delete; still has B
  const desktopStale = {
    sunSessions: [{id:'a',startedAt:1},{id:'b',startedAt:2}],
  };
  const merged = mergeImportedData(phoneAfterDelete, desktopStale);
  assert('deleted session B does NOT resurrect on merge', !merged.sunSessions.find(s=>s.id==='b'));
  assert('non-deleted sessions A and C remain', merged.sunSessions.find(s=>s.id==='a') && merged.sunSessions.find(s=>s.id==='c'));
  assert('tombstone preserved through merge', merged._deleted && merged._deleted.sunSessions && merged._deleted.sunSessions.includes('b'));
  const localAfterLabDelete = {
    entries: [{ date: '2026-03-01', markers: { 'biochemistry.glucose': 4.8 } }],
    _deleted: { entries: ['2026-05-01'] },
    _deletedAt: { entries: { '2026-05-01': Date.now() } },
  };
  const remoteWithDeletedLab = {
    entries: [
      { date: '2026-03-01', markers: { 'biochemistry.glucose': 4.8 } },
      { date: '2026-05-01', markers: { 'biochemistry.alp': 1.2 } },
    ],
  };
  const mergedLabDelete = mergeImportedData(localAfterLabDelete, remoteWithDeletedLab);
  assert('deleted lab import date does NOT resurrect on blob merge',
    !mergedLabDelete.entries.some(e => e.date === '2026-05-01'));
  assert('lab entry tombstone preserved through blob merge',
    mergedLabDelete._deleted?.entries?.includes('2026-05-01'));
  assert('lab entry tombstone timestamp preserved through blob merge',
    Number.isFinite(mergedLabDelete._deletedAt?.entries?.['2026-05-01']));
  const reimportedAfterDelete = {
    entries: [{ date: '2026-05-01', updatedAt: Date.now(), markers: { 'biochemistry.alp': 1.3 } }],
  };
  clearTombstone(reimportedAfterDelete, 'entries', '2026-05-01');
  const stalePeerDelete = {
    entries: [],
    _deleted: { entries: ['2026-05-01'] },
    _deletedAt: { entries: { '2026-05-01': Date.now() - 10_000 } },
  };
  const mergedReimport = mergeImportedData(reimportedAfterDelete, stalePeerDelete);
  assert('re-imported lab date clears older synced tombstone',
    mergedReimport.entries.some(e => e.date === '2026-05-01' && e.markers?.['biochemistry.alp'] === 1.3)
      && !mergedReimport._deleted?.entries?.includes('2026-05-01'));
  assert('entry tombstone clear marker is preserved for rebroadcast',
    Number.isFinite(mergedReimport._deletedClearedAt?.entries?.['2026-05-01']));

  // ─── 6. Nested paths (lightEnvironment.rooms / .screens) ──────────────
  console.log('%c 6. Nested path merge (lightEnvironment) ', 'font-weight:bold;color:#f59e0b');

  const phoneEnv = {
    lightEnvironment: {
      rooms: [{id:'r1',name:'Bedroom',createdAt:1},{id:'r2',name:'Office',createdAt:2}],
      screens: [{id:'s1',roomId:'r1',createdAt:1}],
      somethingScalar: 'phone-value',
    },
  };
  const desktopEnv = {
    lightEnvironment: {
      rooms: [{id:'r1',name:'Bedroom',createdAt:1},{id:'r3',name:'Kitchen',createdAt:3}],
      screens: [{id:'s2',roomId:'r3',createdAt:3}],
      somethingScalar: 'desktop-value',
    },
  };
  const mergedEnv = mergeImportedData(phoneEnv, desktopEnv);
  assert('rooms union: r1 + r2 + r3 all present',
    mergedEnv.lightEnvironment.rooms.length === 3 &&
    mergedEnv.lightEnvironment.rooms.find(r=>r.id==='r1') &&
    mergedEnv.lightEnvironment.rooms.find(r=>r.id==='r2') &&
    mergedEnv.lightEnvironment.rooms.find(r=>r.id==='r3'));
  assert('screens union: s1 + s2 both present',
    mergedEnv.lightEnvironment.screens.length === 2 &&
    mergedEnv.lightEnvironment.screens.find(s=>s.id==='s1') &&
    mergedEnv.lightEnvironment.screens.find(s=>s.id==='s2'));
  // Scalar inside lightEnvironment falls through to LWW (remote wins)
  assert('non-id-keyed scalar inside nested path uses LWW (remote)',
    mergedEnv.lightEnvironment.somethingScalar === 'desktop-value');

  // ─── 7. Single-object subtrees stay LWW ───────────────────────────────
  console.log('%c 7. Single-object LWW preservation ', 'font-weight:bold;color:#f59e0b');

  const phoneCfg = { sunDefaults: { coords:{lat:49.8,lon:15.5}, fitzpatrick:'III' } };
  const desktopCfg = { sunDefaults: { coords:{lat:49.8,lon:15.5}, fitzpatrick:'IV' } };
  const mergedCfg = mergeImportedData(phoneCfg, desktopCfg);
  // No timestamp on these — pull-side blob (desktop) should win as remote.
  assert('sunDefaults uses remote LWW (no merge inside)',
    mergedCfg.sunDefaults.fitzpatrick === 'IV');

  // ─── 8. Empty / null inputs ───────────────────────────────────────────
  console.log('%c 8. Empty / null edge cases ', 'font-weight:bold;color:#f59e0b');

  assert('null remote returns local',
    mergeImportedData({sunSessions:[{id:'a'}]}, null).sunSessions.length === 1);
  assert('null local returns remote',
    mergeImportedData(null, {sunSessions:[{id:'a'}]}).sunSessions.length === 1);
  // Empty arrays merge cleanly
  const e1 = mergeImportedData({sunSessions:[]}, {sunSessions:[{id:'a'}]});
  assert('empty + one returns the one', e1.sunSessions.length === 1 && e1.sunSessions[0].id === 'a');

  // ─── 9. recordTombstone helper ────────────────────────────────────────
  console.log('%c 9. recordTombstone ', 'font-weight:bold;color:#f59e0b');
  const blob = { sunSessions: [{id:'a'},{id:'b'}] };
  recordTombstone(blob, 'sunSessions', 'b');
  assert('first tombstone creates _deleted entry',
    blob._deleted && Array.isArray(blob._deleted.sunSessions) && blob._deleted.sunSessions.includes('b'));
  assert('recordTombstone stores tombstone timestamp metadata',
    Number.isFinite(blob._deletedAt?.sunSessions?.b));
  recordTombstone(blob, 'sunSessions', 'b');
  assert('duplicate tombstone is deduped',
    blob._deleted.sunSessions.filter(x=>x==='b').length === 1);
  recordTombstone(blob, 'lightDevices', 'X');
  assert('multiple paths tracked separately',
    blob._deleted.lightDevices.includes('X') && blob._deleted.sunSessions.includes('b'));
  recordTombstone(blob, 'entries', '2026-05-01');
  assert('entries tombstone can be recorded',
    blob._deleted.entries.includes('2026-05-01'));
  clearTombstone(blob, 'entries', '2026-05-01');
  assert('clearTombstone removes entry tombstone',
    !blob._deleted.entries);
  assert('clearTombstone stores tombstone-clear timestamp metadata',
    Number.isFinite(blob._deletedClearedAt?.entries?.['2026-05-01']));

  // ─── 9b. Sync-aware imported array mutations ─────────────────────────
  console.log('%c 9b. imported array mutation helpers ', 'font-weight:bold;color:#f59e0b');
  const helperBlob = {};
  const ensuredNotes = ensureImportedArray(helperBlob, 'notes');
  appendImportedArrayItem(helperBlob, 'notes', { date: '2026-05-01', text: 'Original note' });
  assert('ensureImportedArray creates missing top-level arrays',
    Array.isArray(ensuredNotes) && helperBlob.notes.length === 1);
  const originalNoteId = DELTA_ARRAY_CONFIG.notes.itemIdFn(helperBlob.notes[0]);
  replaceImportedArrayItem(helperBlob, 'notes', 0, { date: '2026-05-01', text: 'Edited note' });
  assert('replaceImportedArrayItem tombstones old natural-key identity on edit',
    helperBlob.notes.length === 1
      && helperBlob.notes[0].text === 'Edited note'
      && helperBlob._deleted?.notes?.includes(originalNoteId));
  const outOfBoundsReplace = replaceImportedArrayItem(helperBlob, 'notes', 4, { date: '2026-05-02', text: 'Sparse note' });
  assert('replaceImportedArrayItem rejects out-of-bounds indexes without sparse holes',
    outOfBoundsReplace === null
      && helperBlob.notes.length === 1
      && !Object.prototype.hasOwnProperty.call(helperBlob.notes, 4));
  const editedNoteId = DELTA_ARRAY_CONFIG.notes.itemIdFn(helperBlob.notes[0]);
  deleteImportedArrayItem(helperBlob, 'notes', 0);
  assert('deleteImportedArrayItem tombstones removed natural-key rows',
    helperBlob.notes.length === 0
      && helperBlob._deleted?.notes?.includes(editedNoteId));

  const nestedBlob = {
    lightEnvironment: { rooms: [{ id: 'r1', name: 'Desk' }, { id: 'r2', name: 'Bed' }] },
    lightMeasurements: [
      { id: 'm1', roomId: 'r1', tool: 'lux' },
      { id: 'm2', roomId: 'r2', tool: 'lux' },
    ],
  };
  deleteImportedArrayItems(nestedBlob, 'lightEnvironment.rooms', r => r.id === 'r1');
  deleteImportedArrayItems(nestedBlob, 'lightMeasurements', m => m.roomId === 'r1');
  assert('deleteImportedArrayItems handles dotted paths and cascaded id tombstones',
    nestedBlob.lightEnvironment.rooms.length === 1
      && nestedBlob.lightEnvironment.rooms[0].id === 'r2'
      && nestedBlob.lightMeasurements.length === 1
      && nestedBlob._deleted?.['lightEnvironment.rooms']?.includes('r1')
      && nestedBlob._deleted?.lightMeasurements?.includes('m1'));

  const clearedBlob = {
    healthGoals: [
      { text: 'Lower CRP', severity: 'major' },
      { text: 'Raise ferritin', severity: 'minor' },
    ],
  };
  const clearedGoalIds = clearedBlob.healthGoals.map(g => DELTA_ARRAY_CONFIG.healthGoals.itemIdFn(g));
  clearImportedArray(clearedBlob, 'healthGoals');
  assert('clearImportedArray tombstones every configured row',
    clearedBlob.healthGoals.length === 0
      && clearedGoalIds.every(id => clearedBlob._deleted?.healthGoals?.includes(id)));

  // ─── 10. Tombstone union from both sides ──────────────────────────────
  console.log('%c 10. Tombstone union ', 'font-weight:bold;color:#f59e0b');
  const phoneT = { sunSessions:[{id:'a'}], _deleted:{sunSessions:['b']} };
  const desktopT = { sunSessions:[{id:'a'}], _deleted:{sunSessions:['c']} };
  const mt = mergeImportedData(phoneT, desktopT);
  assert('both deletes kept in merged tombstones',
    mt._deleted.sunSessions.includes('b') && mt._deleted.sunSessions.includes('c'));

  // ─── 11. localHasRowsRemoteLacks (rebroadcast trigger) ────────────────
  console.log('%c 11. localHasRowsRemoteLacks ', 'font-weight:bold;color:#f59e0b');

  // Local has C that remote lacks → rebroadcast needed
  assert('local has unsynced row → true',
    localHasRowsRemoteLacks(
      {sunSessions:[{id:'a'},{id:'b'},{id:'c'}]},
      {sunSessions:[{id:'a'},{id:'b'}]}
    ) === true);

  // Local is a subset of remote → no rebroadcast
  assert('local subset of remote → false',
    localHasRowsRemoteLacks(
      {sunSessions:[{id:'a'},{id:'b'}]},
      {sunSessions:[{id:'a'},{id:'b'},{id:'c'}]}
    ) === false);

  // Identical → no rebroadcast (no infinite loop)
  assert('identical sides → false',
    localHasRowsRemoteLacks(
      {sunSessions:[{id:'a'},{id:'b'}], lightDevices:[{id:'X'}]},
      {sunSessions:[{id:'a'},{id:'b'}], lightDevices:[{id:'X'}]}
    ) === false);

  // Same ids but different INSERTION ORDER must NOT trigger rebroadcast —
  // this was the bug that would have caused a JSON.stringify-based diff to
  // ping-pong endlessly across devices.
  assert('different insertion order, same ids → false (no ping-pong)',
    localHasRowsRemoteLacks(
      {sunSessions:[{id:'a'},{id:'b'},{id:'c'}]},
      {sunSessions:[{id:'b'},{id:'c'},{id:'a'}]}
    ) === false);

  // Local tombstone that remote lacks → rebroadcast (delete needs to propagate)
  assert('local tombstone not on remote → true',
    localHasRowsRemoteLacks(
      {sunSessions:[{id:'a'}], _deleted:{sunSessions:['b']}},
      {sunSessions:[{id:'a'},{id:'b'}]}
    ) === true);
  assert('local lab-entry tombstone not on remote → true',
    localHasRowsRemoteLacks(
      {entries: [], _deleted:{entries:['2026-05-01']}},
      {entries:[{date:'2026-05-01', markers:{'biochemistry.alp':1.2}}]}
    ) === true);

  // Both sides have the same tombstone → no rebroadcast
  assert('matching tombstones → false',
    localHasRowsRemoteLacks(
      {sunSessions:[{id:'a'}], _deleted:{sunSessions:['b']}},
      {sunSessions:[{id:'a'}], _deleted:{sunSessions:['b']}}
    ) === false);
  assert('matching lab-entry tombstones → false',
    localHasRowsRemoteLacks(
      {entries: [], _deleted:{entries:['2026-05-01']}},
      {entries: [], _deleted:{entries:['2026-05-01']}}
    ) === false);
  assert('local tombstone-clear marker not on remote → true',
    localHasRowsRemoteLacks(
      { entries: [{ date: '2026-05-01', markers: { 'biochemistry.alp': 1.3 } }], _deletedClearedAt: { entries: { '2026-05-01': Date.now() } } },
      { entries: [{ date: '2026-05-01', markers: { 'biochemistry.alp': 1.3 } }], _deleted: { entries: ['2026-05-01'] } }
    ) === true);

  // Null guards
  assert('null local → false', localHasRowsRemoteLacks(null, {sunSessions:[{id:'a'}]}) === false);
  assert('null remote → true (everything local is news)',
    localHasRowsRemoteLacks({sunSessions:[{id:'a'}]}, null) === true);
  assert('local lab entry date missing remotely → true',
    localHasRowsRemoteLacks(
      { entries: [{ date: '2026-05-01', markers: { 'biochemistry.alp': 1.2 } }] },
      { entries: [] }
    ) === true);
  assert('local lab marker missing remotely → true',
    localHasRowsRemoteLacks(
      { entries: [{ date: '2026-05-01', markers: { 'biochemistry.alp': 1.2, 'biochemistry.alt': 0.5 } }] },
      { entries: [{ date: '2026-05-01', markers: { 'biochemistry.alp': 1.2 } }] }
    ) === true);
  assert('remote superset of lab markers → false',
    localHasRowsRemoteLacks(
      { entries: [{ date: '2026-05-01', markers: { 'biochemistry.alp': 1.2 } }] },
      { entries: [{ date: '2026-05-01', markers: { 'biochemistry.alp': 1.2, 'biochemistry.alt': 0.5 } }] }
    ) === false);

  // Within-id conflict: same id, local's record has a strictly higher
  // pickTimestamp than remote's. After mergeImportedData this means
  // the local copy is the canonical one and remote's row is stale →
  // rebroadcast so the other device pulls our winner. Regression
  // guard for the live "phone ended at 26min, desktop ended same
  // session at 41min, phone never re-pulls" bug.
  assert('same id, local endedAt > remote endedAt → true (rebroadcast)',
    localHasRowsRemoteLacks(
      {sunSessions:[{id:'s1', startedAt: 100, endedAt: 200}]},
      {sunSessions:[{id:'s1', startedAt: 100, endedAt: 150}]}
    ) === true);
  assert('same id, equal endedAt → false (no rebroadcast)',
    localHasRowsRemoteLacks(
      {sunSessions:[{id:'s1', startedAt: 100, endedAt: 200}]},
      {sunSessions:[{id:'s1', startedAt: 100, endedAt: 200}]}
    ) === false);
  assert('same id, remote endedAt > local endedAt → false (remote wins, we pull)',
    localHasRowsRemoteLacks(
      {sunSessions:[{id:'s1', startedAt: 100, endedAt: 150}]},
      {sunSessions:[{id:'s1', startedAt: 100, endedAt: 200}]}
    ) === false);
  // updatedAt takes precedence over endedAt in pickTimestamp — verify
  // the conflict-detection uses the same precedence so the rebroadcast
  // decision aligns with the merge winner.
  assert('updatedAt outranks endedAt for the conflict check',
    localHasRowsRemoteLacks(
      {sunSessions:[{id:'s1', endedAt: 100, updatedAt: 500}]},
      {sunSessions:[{id:'s1', endedAt: 200, updatedAt: 400}]}
    ) === true);

  // ─── 12. Hardening: prototype-pollution guard via _deleted key ────────
  console.log('%c 12. Prototype pollution guard ', 'font-weight:bold;color:#f59e0b');

  // Remote payload tries to inject __proto__ / constructor keys into _deleted.
  // mergeImportedData should drop them (only ID_KEYED_ARRAYS paths are kept).
  const evilRemote = {
    sunSessions: [{id:'a'}],
    _deleted: {
      __proto__: ['x','y'],
      constructor: ['z'],
      sunSessions: ['legit-tombstone'],
      randomUnknownPath: ['noise'],
    },
  };
  const safeLocal = { sunSessions: [{id:'a'}] };
  const m12 = mergeImportedData(safeLocal, evilRemote);
  assert('legit tombstone is preserved',
    m12._deleted && Array.isArray(m12._deleted.sunSessions) && m12._deleted.sunSessions.includes('legit-tombstone'));
  assert('__proto__ key is NOT present in _deleted',
    !('__proto__' in m12._deleted) || m12._deleted.__proto__ === Object.prototype || m12._deleted.__proto__ === null,
    'merged.__proto__: ' + Object.getPrototypeOf(m12._deleted));
  assert('constructor key dropped from _deleted',
    !Object.prototype.hasOwnProperty.call(m12._deleted, 'constructor') || !Array.isArray(m12._deleted.constructor));
  assert('unknown remote paths dropped from _deleted',
    !Object.prototype.hasOwnProperty.call(m12._deleted, 'randomUnknownPath'));
  // Confirm prototype chain wasn't poisoned
  assert('plain object literal still has Object.prototype methods unaffected',
    typeof ({}).hasOwnProperty === 'function');

  // ─── 13. Hardening: tombstone DoS cap ─────────────────────────────────
  console.log('%c 13. Tombstone cap ', 'font-weight:bold;color:#f59e0b');

  // Build a remote payload with 6000 fabricated tombstones (over the 5000 cap).
  const huge = [];
  for (let i = 0; i < 6000; i++) huge.push('id_' + i);
  const m13 = mergeImportedData(
    { sunSessions: [{id:'real'}] },
    { sunSessions: [{id:'real'}], _deleted: { sunSessions: huge } }
  );
  assert('tombstone list capped at 5000 entries',
    m13._deleted.sunSessions.length === 5000,
    'got length=' + m13._deleted.sunSessions.length);

  // ─── 14. Composite-keyed merge: changeHistory dedup + 200-cap ─────────
  // changeHistory entries lack `id` and were silently doubling on every
  // cross-device pull (unionById's noId fallback kept both copies).
  // Now lives in COMPOSITE_KEYED_ARRAYS, deduped by `field|date`, capped
  // at 200 — matching the per-site write caps in context-cards.js,
  // export.js, wearables-summary.js. Regression guard for the live bug
  // that filled a user's localStorage to 4.4 MB / 5 MB cap.
  console.log('%c 14. changeHistory composite-key merge ', 'font-weight:bold;color:#f59e0b');
  assert('changeHistory NOT in ID_KEYED_ARRAYS (would double on merge)',
    !ID_KEYED_ARRAYS.includes('changeHistory'));
  // Same field+date on both sides → dedup, newer (higher updatedAt) wins.
  const m14a = mergeImportedData(
    { changeHistory: [{ field: 'diet', date: '2026-05-01', snapshot: { v: 1 }, updatedAt: 1 }] },
    { changeHistory: [{ field: 'diet', date: '2026-05-01', snapshot: { v: 2 }, updatedAt: 2 }] }
  );
  assert('same field+date deduped to 1 entry', m14a.changeHistory.length === 1);
  assert('higher updatedAt wins on dedup', m14a.changeHistory[0].snapshot.v === 2);

  // Different field+date pairs both kept.
  const m14b = mergeImportedData(
    { changeHistory: [{ field: 'diet', date: '2026-05-01', snapshot: {} }] },
    { changeHistory: [{ field: 'exercise', date: '2026-05-01', snapshot: {} }] }
  );
  assert('different field+date pairs both kept', m14b.changeHistory.length === 2);

  // 200-cap enforced post-merge: throw 250 distinct entries at it,
  // verify result is sorted-newest-first and trimmed to 200.
  const big = [];
  for (let i = 0; i < 250; i++) big.push({
    field: 'diet', date: `2024-01-${String(i % 31 + 1).padStart(2,'0')}-${i}`,
    snapshot: { i }, updatedAt: i,
  });
  const m14c = mergeImportedData({ changeHistory: big.slice(0, 125) }, { changeHistory: big.slice(125) });
  assert('changeHistory capped at 200 post-merge', m14c.changeHistory.length === 200);
  // The 50 oldest (i = 0..49) should be dropped; newest (i = 200..249) retained.
  const ids = new Set(m14c.changeHistory.map(e => e.snapshot.i));
  assert('newest entries retained after cap', ids.has(249) && ids.has(200));
  assert('oldest entries dropped after cap', !ids.has(0) && !ids.has(49));

  // Tie-break: when only one side has updatedAt, the side with the stamp wins.
  // v1.7.5 fix: recordChange() now stamps updatedAt; old entries without it
  // must lose to a stamped entry on conflict (otherwise old entries permanently
  // shadow newer cross-device edits).
  const m14d = mergeImportedData(
    { changeHistory: [{ field: 'diet', date: '2026-05-01', snapshot: { v: 'old' } }] },
    { changeHistory: [{ field: 'diet', date: '2026-05-01', snapshot: { v: 'new' }, updatedAt: 5 }] }
  );
  assert('updatedAt-stamped entry wins over unstamped on tie',
    m14d.changeHistory[0].snapshot.v === 'new');

console.log(`\nResults: ${pass} passed, ${fail} failed, ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
