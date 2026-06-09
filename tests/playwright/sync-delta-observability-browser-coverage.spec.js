import { expect, test } from './coverage-fixture.js';

const moduleUrl = path => `${path}?syncDeltaObservabilityCoverage=${Date.now()}-${Math.random().toString(36).slice(2)}`;

async function openBlankPage(page, path) {
  await page.route(`**${path}`, route => route.fulfill({
    status: 200,
    contentType: 'text/html',
    body: '<!doctype html><html><body><main id="fixture"></main></body></html>',
  }));
  await page.goto(path, { waitUntil: 'load' });
}

test('sync delta observability browser coverage handles snapshot storage gates', async ({ page }) => {
  await openBlankPage(page, '/sync-delta-snapshot-coverage');

  const results = await page.evaluate(async ({ snapshotUrl }) => {
    const snapshot = await import(snapshotUrl);
    const outcomes = {};
    const profileId = `snapshot-profile-${Date.now()}`;
    const arrayName = 'entries';
    const snapshotKey = `labcharts-${profileId}-delta-${arrayName}`;
    const metaKey = `${snapshotKey}-meta`;
    const originalSnapshot = localStorage.getItem(snapshotKey);
    const originalMeta = localStorage.getItem(metaKey);

    try {
      localStorage.removeItem(snapshotKey);
      localStorage.removeItem(metaKey);
      const missingSnapshot = snapshot._readDeltaSnapshot(profileId, arrayName);

      localStorage.setItem(snapshotKey, '{not valid json');
      const invalidSnapshot = snapshot._readDeltaSnapshot(profileId, arrayName);
      localStorage.removeItem(snapshotKey);

      const firstWrite = snapshot._writeDeltaSnapshot(profileId, arrayName, { a: 'hash-a' }, 100);
      const firstRead = snapshot._readDeltaSnapshot(profileId, arrayName);
      const staleWrite = snapshot._writeDeltaSnapshot(profileId, arrayName, { a: 'stale' }, 99);
      const afterStaleRead = snapshot._readDeltaSnapshot(profileId, arrayName);
      const sameTickWrite = snapshot._writeDeltaSnapshot(profileId, arrayName, { a: 'same-tick' }, 100);
      const afterSameTickRead = snapshot._readDeltaSnapshot(profileId, arrayName);
      const freshWrite = snapshot._writeDeltaSnapshot(profileId, arrayName, { a: 'hash-b' }, 101);
      const freshRead = snapshot._readDeltaSnapshot(profileId, arrayName);
      const ungatedWrite = snapshot._writeDeltaSnapshot(profileId, arrayName, { a: 'ungated' });
      const ungatedRead = snapshot._readDeltaSnapshot(profileId, arrayName);
      const cleared = snapshot.clearDeltaSnapshot(profileId, arrayName);
      const afterClearRead = snapshot._readDeltaSnapshot(profileId, arrayName);

      outcomes.snapshotMissingReadIsEmpty = Object.keys(missingSnapshot).length === 0;
      outcomes.snapshotInvalidJsonReadIsEmpty = Object.keys(invalidSnapshot).length === 0;
      outcomes.snapshotFirstWritePersists = firstWrite === true && firstRead.a === 'hash-a';
      outcomes.snapshotRejectsStalePlannedAt = staleWrite === false && afterStaleRead.a === 'hash-a';
      outcomes.snapshotRejectsSameTickPlannedAt = sameTickWrite === false && afterSameTickRead.a === 'hash-a';
      outcomes.snapshotAcceptsFreshPlannedAt = freshWrite === true && freshRead.a === 'hash-b';
      outcomes.snapshotAllowsUngatedWrite = ungatedWrite === true && ungatedRead.a === 'ungated';
      outcomes.snapshotClearRemovesSnapshotAndMeta = cleared === true
        && Object.keys(afterClearRead).length === 0
        && localStorage.getItem(snapshotKey) === null
        && localStorage.getItem(metaKey) === null;
    } finally {
      if (originalSnapshot == null) localStorage.removeItem(snapshotKey);
      else localStorage.setItem(snapshotKey, originalSnapshot);
      if (originalMeta == null) localStorage.removeItem(metaKey);
      else localStorage.setItem(metaKey, originalMeta);
    }

    outcomes.allOutcomesReached = true;
    return outcomes;
  }, {
    snapshotUrl: moduleUrl('/js/sync-delta-snapshot.js'),
  });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});

test('sync delta observability browser coverage handles pull snapshots telemetry and facade wiring', async ({ page }) => {
  await openBlankPage(page, '/sync-delta-observability-coverage');

  const results = await page.evaluate(async ({ observabilityUrl }) => {
    // The facade re-exports stable-url modules; import those same URLs to assert the shared browser module instances.
    const [observability, pullSnapshot, context] = await Promise.all([
      import(observabilityUrl),
      import('/js/sync-delta-pull-snapshot.js'),
      import('/js/sync-delta-observability-context.js'),
    ]);
    const outcomes = {};
    const profileId = `telemetry-profile-${Date.now()}`;
    const telemetryKey = `labcharts-${profileId}-delta-telemetry`;
    const originalTelemetry = localStorage.getItem(telemetryKey);
    const query = { table: 'itemRow' };
    const evolu = { getQueryRows: () => [] };

    try {
      localStorage.removeItem(telemetryKey);
      observability.resetPullDeltaSnapshot(profileId);
      observability.recordPullDeltaSurface('', { live: 99, tombstones: 99 });
      observability.recordPullDeltaSurface('entries', { live: 2, tombstones: 1 });
      observability.recordPullDeltaSurface('notes', {});
      const matchingPull = pullSnapshot.getPullDeltaSnapshot(profileId);
      const otherPull = pullSnapshot.getPullDeltaSnapshot('other-profile');

      outcomes.pullSnapshotRecordsMatchingProfile = matchingPull.mergedAt > 0
        && matchingPull.perArray.entries.live === 2
        && matchingPull.perArray.entries.tombstones === 1
        && matchingPull.perArray.notes.live === 0
        && matchingPull.perArray.notes.tombstones === 0;
      outcomes.pullSnapshotIgnoresInvalidArrayName =
        !Object.prototype.hasOwnProperty.call(matchingPull.perArray, '');
      outcomes.pullSnapshotReturnsEmptyForOtherProfile = Object.keys(otherPull.perArray).length === 0
        && otherPull.mergedAt === 0;

      observability.configureSyncDeltaObservability({
        getEvolu: () => evolu,
        getItemRowQuery: () => query,
      });
      const readinessViaFacade = observability.getDeltaCutoverReadiness('', {});
      outcomes.observabilityFacadeConfiguresSharedContext =
        context.currentDeltaEvolu() === evolu
        && context.currentDeltaItemRowQuery() === query;
      outcomes.observabilityFacadeReexportsReadiness =
        readinessViaFacade.ready === false
        && readinessViaFacade.error === 'no-profile';

      const resetMissing = observability.resetDeltaTelemetry('');
      const noProfileTelemetry = observability.getDeltaTelemetry('');
      observability._recordPushTelemetry('', 10, [
        { arrayName: 'ignored', plan: { ops: [{ kind: 'insert', args: { payload: 'x' } }] } },
      ]);
      observability._recordPushTelemetry(profileId, 1000, [
        {
          arrayName: 'entries',
          plan: {
            ops: [
              { kind: 'insert', args: { payload: 'abc' } },
              { kind: 'update', args: { payload: 'de' } },
              { kind: 'tombstone', args: { payload: '' } },
              { kind: 'noop', args: { payload: 'z' } },
            ],
          },
        },
        { arrayName: 'notes', plan: { ops: [] } },
      ]);
      const telemetry = observability.getDeltaTelemetry(profileId);

      outcomes.telemetryRejectsEmptyProfileInputs = resetMissing === false
        && noProfileTelemetry === null;
      outcomes.telemetryAggregatesSummary = telemetry.summary.count === 1
        && telemetry.summary.totalBlobBytes === 1000
        && telemetry.summary.totalDeltaBytes === 6
        && telemetry.summary.totalOps === 4
        && telemetry.summary.ratio === 0.006;
      outcomes.telemetryRecordsPerArrayBreakdown = telemetry.pushes[0].perArray.entries.ins === 1
        && telemetry.pushes[0].perArray.entries.upd === 1
        && telemetry.pushes[0].perArray.entries.tom === 1
        && telemetry.pushes[0].perArray.entries.bytes === 6
        && telemetry.pushes[0].perArray.notes.bytes === 0;
      outcomes.telemetryIncludesPullSnapshot = telemetry.pull.perArray.entries.live === 2;

      observability.resetDeltaTelemetry(profileId);
      for (let i = 0; i < 55; i += 1) {
        observability._recordPushTelemetry(profileId, 100 + i, [
          { arrayName: 'entries', plan: { ops: [{ kind: 'insert', args: { payload: String(i) } }] } },
        ]);
      }
      const cappedTelemetry = observability.getDeltaTelemetry(profileId);
      outcomes.telemetryCapsHistoryToLastFiftyPushes =
        cappedTelemetry.summary.count === 50
        && cappedTelemetry.pushes.length === 50
        && cappedTelemetry.pushes[0].blobBytes === 105
        && cappedTelemetry.pushes[49].blobBytes === 154
        && cappedTelemetry.summary.totalOps === 50;

      const resetExisting = observability.resetDeltaTelemetry(profileId);
      outcomes.telemetryResetClearsProfileKey =
        resetExisting === true
        && observability.getDeltaTelemetry(profileId).summary.count === 0
        && localStorage.getItem(telemetryKey) === null;
    } finally {
      if (originalTelemetry == null) localStorage.removeItem(telemetryKey);
      else localStorage.setItem(telemetryKey, originalTelemetry);
      observability.resetPullDeltaSnapshot(null);
      observability.configureSyncDeltaObservability({
        getEvolu: () => null,
        getItemRowQuery: () => null,
      });
    }

    outcomes.allOutcomesReached = true;
    return outcomes;
  }, {
    observabilityUrl: moduleUrl('/js/sync-delta-observability.js'),
  });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});
