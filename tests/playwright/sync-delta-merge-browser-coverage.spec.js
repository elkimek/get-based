import { expect, test } from './coverage-fixture.js';

const moduleUrl = path => `${path}?syncDeltaMergeCoverage=${Date.now()}-${Math.random().toString(36).slice(2)}`;

async function openBlankPage(page, path) {
  await page.route(`**${path}`, route => route.fulfill({
    status: 200,
    contentType: 'text/html',
    body: '<!doctype html><html><body><main id="fixture"></main></body></html>',
  }));
  await page.goto(path, { waitUntil: 'load' });
}

test('sync delta merge browser coverage applies grouped row surfaces through the facade', async ({ page }) => {
  await openBlankPage(page, '/sync-delta-merge-coverage');

  const results = await page.evaluate(async ({ mergeUrl, shapesUrl }) => {
    const [merge, shapes, observability, pullSnapshot] = await Promise.all([
      import(mergeUrl),
      import(shapesUrl),
      import('/js/sync-delta-observability.js'),
      import('/js/sync-delta-pull-snapshot.js'),
    ]);
    const outcomes = {};
    const profileId = `merge-profile-${Date.now()}`;
    const queryToken = { table: 'itemRows' };
    const queryCalls = [];
    const payload = value => JSON.stringify(value);
    const safeManualId = rawKey => rawKey.replace(/_/g, '__').replace(/:/g, '_');
    const rows = [
      {
        profileId,
        arrayName: 'lightDevices',
        itemId: 'dev-live',
        payload: payload({ id: 'dev-live', name: 'Remote panel', updatedAt: '2026-06-09T10:00:00.000Z' }),
        syncedAt: '2026-06-09T10:00:00.000Z',
        isDeleted: null,
      },
      {
        profileId,
        arrayName: 'lightDevices',
        itemId: 'dev-tomb',
        payload: null,
        syncedAt: '2026-06-09T11:00:00.000Z',
        isDeleted: true,
      },
      {
        profileId: `${profileId}-other`,
        arrayName: 'lightDevices',
        itemId: 'foreign',
        payload: payload({ id: 'foreign', name: 'Wrong profile', updatedAt: '2026-06-09T12:00:00.000Z' }),
        syncedAt: '2026-06-09T12:00:00.000Z',
        isDeleted: null,
      },
      {
        profileId,
        arrayName: 'manualValues',
        itemId: safeManualId('coverage.marker:2026-06-09'),
        payload: payload({ k: 'coverage.marker:2026-06-09', v: 7.2 }),
        syncedAt: '2026-06-09T10:30:00.000Z',
        isDeleted: null,
      },
      {
        profileId,
        arrayName: 'manualValues',
        itemId: safeManualId('old.marker:2026-06-09'),
        payload: null,
        syncedAt: '2026-06-09T10:45:00.000Z',
        isDeleted: true,
      },
      {
        profileId,
        arrayName: 'diagnoses',
        itemId: 'diagnoses',
        payload: payload({ v: { condition: 'Remote diagnosis' } }),
        syncedAt: '2026-06-09T10:15:00.000Z',
        isDeleted: null,
      },
      {
        profileId,
        arrayName: 'diet',
        itemId: 'diet',
        payload: null,
        syncedAt: '2026-06-09T10:20:00.000Z',
        isDeleted: true,
      },
    ];
    const evolu = {
      getQueryRows(query) {
        queryCalls.push(query === queryToken ? 'expected' : 'unexpected');
        return rows;
      },
    };
    const imported = {
      lightDevices: [
        { id: 'dev-local', name: 'Local keeper', updatedAt: '2026-06-09T09:00:00.000Z' },
        { id: 'dev-tomb', name: 'Deleted device', updatedAt: '2026-06-09T09:30:00.000Z' },
      ],
      manualValues: {
        'old.marker:2026-06-09': 5,
      },
      diagnoses: { condition: 'Local diagnosis' },
      diet: { summary: 'Local diet' },
    };

    try {
      const noDepsImported = { lightDevices: [{ id: 'unchanged' }] };
      const noDepsResult = await merge._mergeItemRowsIntoImported(profileId, noDepsImported);
      outcomes.noDependenciesReturnOriginalImportedData = noDepsResult === noDepsImported;
      outcomes.noDependenciesLeaveArraysUnchanged =
        noDepsImported.lightDevices.length === 1
        && noDepsImported.lightDevices[0].id === 'unchanged';

      outcomes.shapeFacadeExportsArrayDelegate = typeof shapes.mergeArrayRowsIntoImported === 'function';
      outcomes.shapeFacadeExportsMapDelegate = typeof shapes.mergeMapRowsIntoImported === 'function';
      outcomes.shapeFacadeExportsScalarDelegate = typeof shapes.mergeScalarRowsIntoImported === 'function';

      // The merge facade imports the stable observability module; use stable imports
      // here to inspect the same browser singleton.
      observability.resetPullDeltaSnapshot(profileId);
      observability.recordPullDeltaSurface('staleSurface', { live: 99, tombstones: 99 });
      merge.configureSyncDeltaMerge({
        getEvolu: () => evolu,
        getItemRowQuery: () => queryToken,
      });

      const merged = await merge._mergeItemRowsIntoImported(profileId, imported);
      const snapshot = pullSnapshot.getPullDeltaSnapshot(profileId);

      outcomes.facadeReturnsAndMutatesSameImportedObject = merged === imported;
      outcomes.facadeUsesConfiguredItemRowQuery = queryCalls.length === 1 && queryCalls[0] === 'expected';
      outcomes.arrayRowsInsertLiveDevice =
        imported.lightDevices.some(device => device.id === 'dev-live' && device.name === 'Remote panel');
      outcomes.arrayRowsKeepExistingUnrelatedDevice = imported.lightDevices.some(device => device.id === 'dev-local');
      outcomes.arrayRowsApplyTombstone = !imported.lightDevices.some(device => device.id === 'dev-tomb');
      outcomes.arrayRowsIgnoreOtherProfile = !imported.lightDevices.some(device => device.id === 'foreign');
      outcomes.mapRowsPreserveRawKey = imported.manualValues['coverage.marker:2026-06-09'] === 7.2;
      outcomes.mapRowsApplyTombstone =
        !Object.prototype.hasOwnProperty.call(imported.manualValues, 'old.marker:2026-06-09');
      outcomes.scalarRowsApplyLiveValue = imported.diagnoses.condition === 'Remote diagnosis';
      outcomes.scalarRowsApplyTombstone = imported.diet === null;
      outcomes.mergeResetsStalePullSnapshotBeforeRecording =
        !Object.prototype.hasOwnProperty.call(snapshot.perArray, 'staleSurface');
      outcomes.pullSnapshotRecordsArrayRows =
        snapshot.perArray.lightDevices?.live === 1
        && snapshot.perArray.lightDevices?.tombstones === 1;
      outcomes.pullSnapshotRecordsMapRows =
        snapshot.perArray.manualValues?.live === 1
        && snapshot.perArray.manualValues?.tombstones === 1;
      outcomes.pullSnapshotRecordsScalarRows =
        snapshot.perArray.diagnoses?.live === 1
        && snapshot.perArray.diet?.tombstones === 1;
    } finally {
      merge.configureSyncDeltaMerge({
        getEvolu: () => null,
        getItemRowQuery: () => null,
      });
      observability.resetPullDeltaSnapshot(null);
    }

    outcomes.allOutcomesReached = true;
    return outcomes;
  }, {
    mergeUrl: moduleUrl('/js/sync-delta-merge.js'),
    shapesUrl: moduleUrl('/js/sync-delta-merge-shapes.js'),
  });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});
