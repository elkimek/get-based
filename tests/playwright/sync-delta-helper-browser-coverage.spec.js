import { expect, test } from './coverage-fixture.js';

const moduleUrl = path => `${path}?syncDeltaHelperCoverage=${Date.now()}-${Math.random().toString(36).slice(2)}`;

async function openBlankPage(page, path) {
  await page.route(`**${path}`, route => route.fulfill({
    status: 200,
    contentType: 'text/html',
    body: '<!doctype html><html><body><main id="fixture"></main></body></html>',
  }));
  await page.goto(path, { waitUntil: 'load' });
}

test('sync delta helper browser coverage exercises registry ids config and row codec', async ({ page }) => {
  await openBlankPage(page, '/sync-delta-helper-coverage');

  const results = await page.evaluate(async ({ registryUrl, rowCodecUrl }) => {
    const [registry, rowCodec, syncPayload] = await Promise.all([
      import(registryUrl),
      import(rowCodecUrl),
      import('/js/sync-payload.js'),
    ]);
    const outcomes = {};

    outcomes.registryExportsExpectedSurfacesAndIdentityHelpers =
      registry.DELTA_ARRAYS.includes('entries')
      && registry.DELTA_ARRAYS.includes('lightEnvironment.rooms')
      && registry.DELTA_MAPS.includes('manualValues')
      && registry.DELTA_MAPS.includes('genetics.snps')
      && registry.DELTA_SCALARS.includes('lightEnvironment.burdenAI')
      && registry._djb2('same input') === registry._djb2('same input')
      && registry._djb2('same input') !== registry._djb2('other input')
      && registry._isAllowlistSafeId('abc.DEF_123-4') === true
      && registry._isAllowlistSafeId('bad id') === false
      && registry._isAllowlistSafeId('') === false
      && registry._isProtoPollutionKey('__proto__') === true
      && registry._isAllowlistSafeId('__proto__') === false
      && registry._isAllowlistSafeId('constructor') === false
      && registry._isAllowlistSafeId('prototype') === false;

    const arrayConfig = registry.DELTA_ARRAY_CONFIG;
    const mapConfig = registry.DELTA_MAP_CONFIG;
    outcomes.arrayConfigItemIdFunctionsCoverNaturalKeysAndInvalidInputs =
      arrayConfig.changeHistory.itemIdFn({ field: 'LDL Cholesterol', date: '2026-06-09T00:00:00.000Z' }) === 'LDL_Cholesterol.1780963200000'
      && arrayConfig.changeHistory.itemIdFn({ field: 'LDL', date: 'not-a-date' }) === null
      && arrayConfig.changeHistory.itemIdFn({
        type: 'wearable',
        source: 'google_health',
        metricId: 'hrv_rmssd',
        kind: 'trend-flip',
        ts: 1785578400000,
      }).startsWith('wh_')
      && arrayConfig.changeHistory.itemIdFn(null) === null
      && arrayConfig.changeHistory.noTombstones === true
      && arrayConfig.entries.itemIdFn({ date: '2026-06-09' }) === '2026-06-09'
      && arrayConfig.entries.itemIdFn({ date: '__proto__' }) === null
      && arrayConfig.supplements.itemIdFn({ name: 'Magnesium', startDate: '2026-01-01', type: 'capsule' }).startsWith('s_')
      && arrayConfig.supplements.itemIdFn({}) === null
      && arrayConfig.healthGoals.itemIdFn({ text: 'Walk after meals' }).startsWith('g_')
      && arrayConfig.healthGoals.itemIdFn({ text: '' }) === null
      && arrayConfig.notes.itemIdFn({ date: '2026-06-09', text: 'Note' }).startsWith('n_')
      && arrayConfig.notes.itemIdFn({}) === null
      && arrayConfig.chatSummaries.itemIdFn({ threadId: 42 }).startsWith('cs_')
      && arrayConfig.chatSummaries.itemIdFn({}) === null;

    outcomes.mapConfigKeyIdFunctionsEscapeUnsafeSeparators =
      mapConfig.manualValues.keyIdFn('lipids_LDL:2026-06-09') === 'lipids__LDL_2026-06-09'
      && mapConfig.markerValueNotes.keyIdFn('marker_key:note') === 'marker__key_note'
      && mapConfig.contextSourceSettings.keyIdFn('lab-markers') === 'lab-markers'
      && mapConfig.contextSourceSettings.keyIdFn('lab-group-Fatty Acids') === 'ctxu_006c00610062002d00670072006f00750070002d00460061007400740079002000410063006900640073'
      && mapConfig.manualValues.keyIdFn('') === null
      && mapConfig.markerValueNotes.keyIdFn(null) === null
      && mapConfig.contextSourceSettings.keyIdFn('') === null
      && mapConfig.manualValues.keyIdFn('bad/key') === null;

    const plainDecoded = await rowCodec.decodeRowPayload({
      payload: JSON.stringify({ k: 'plain', v: { ok: true } }),
    });
    const chunkBoundaryBytes = Uint8Array.from(
      { length: 0x8000 + 3 },
      (_, index) => index % 251,
    );
    const chunkBoundaryRoundTrip = syncPayload._base64ToBytes(
      syncPayload._bytesToBase64(chunkBoundaryBytes),
    );
    outcomes.byteCodecRoundTripsAcrossItsArgumentChunkBoundary =
      chunkBoundaryRoundTrip.length === chunkBoundaryBytes.length
      && chunkBoundaryRoundTrip[0] === chunkBoundaryBytes[0]
      && chunkBoundaryRoundTrip[0x7fff] === chunkBoundaryBytes[0x7fff]
      && chunkBoundaryRoundTrip[0x8000] === chunkBoundaryBytes[0x8000]
      && chunkBoundaryRoundTrip.at(-1) === chunkBoundaryBytes.at(-1);

    const gzipEnvelope = `GZ|v1|${syncPayload._bytesToBase64(
      await syncPayload._gzipString(JSON.stringify({ k: 'gzip', v: [1, 2, 3] }))
    )}`;
    const gzipDecoded = await rowCodec.decodeRowPayload({ payload: gzipEnvelope });

    let gzipWithoutStreamReturnedNull = false;
    const originalDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'DecompressionStream');
    try {
      Object.defineProperty(globalThis, 'DecompressionStream', {
        configurable: true,
        writable: true,
        value: undefined,
      });
      gzipWithoutStreamReturnedNull = await rowCodec.decodeRowPayload({ payload: gzipEnvelope }) === null;
    } finally {
      if (originalDescriptor) Object.defineProperty(globalThis, 'DecompressionStream', originalDescriptor);
      else delete globalThis.DecompressionStream;
    }

    const oversizedEnvelope = `GZ|v1|${syncPayload._bytesToBase64(
      await syncPayload._gzipString('x'.repeat(syncPayload._PER_ROW_DECOMPRESSED_CAP_BYTES + 1))
    )}`;
    let oversizedPayloadThrows = false;
    try {
      await rowCodec.decodeRowPayload({ payload: oversizedEnvelope });
    } catch (error) {
      oversizedPayloadThrows = String(error?.message || '').includes('per-row payload exceeds');
    }

    outcomes.rowCodecDecodesPlainAndGzipPayloads =
      plainDecoded.k === 'plain'
      && plainDecoded.v.ok === true
      && gzipDecoded.k === 'gzip'
      && gzipDecoded.v.length === 3
      && gzipWithoutStreamReturnedNull === true
      && oversizedPayloadThrows === true;

    outcomes.allOutcomesReached = true;
    return outcomes;
  }, {
    registryUrl: moduleUrl('/js/sync-delta-registry.js'),
    rowCodecUrl: moduleUrl('/js/sync-delta-row-codec.js'),
  });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});

test('sync delta helper browser coverage exercises observability context and readiness', async ({ page }) => {
  await openBlankPage(page, '/sync-delta-readiness-coverage');

  const results = await page.evaluate(async ({ readinessUrl }) => {
    const [readiness, observabilityContext, stateModule] = await Promise.all([
      import(readinessUrl),
      import('/js/sync-delta-observability-context.js'),
      import('/js/state.js'),
    ]);
    const outcomes = {};
    const profileId = `delta-profile-${Date.now()}`;
    const query = { table: 'itemRow' };
    const rows = [
      { profileId, arrayName: 'entries', itemId: '2026-06-09', payload: '{}' },
      { profileId, arrayName: 'notes', itemId: 'note-only', payload: '{}' },
      { profileId, arrayName: 'markerNotes', itemId: 'LDL', isDeleted: true, payload: '{}' },
      { profileId, arrayName: 'categoryLabels', itemId: 'lipids', payload: '{}' },
      { profileId, arrayName: 'lightEnvironment.rooms', itemId: 'room-a', payload: '{}' },
      { profileId, arrayName: 'lightEnvironment.burdenAI', itemId: 'lightEnvironment.burdenAI', payload: '{}' },
      { profileId: 'other-profile', arrayName: 'supplements', itemId: 'ignored', payload: '{}' },
    ];
    const originalImportedData = stateModule.state.importedData;

    try {
      outcomes.observabilityContextDefaultsToNullProviders =
        observabilityContext.currentDeltaEvolu() === null
        && observabilityContext.currentDeltaItemRowQuery() === null;

      observabilityContext.configureSyncDeltaObservabilityContext({
        getEvolu: () => { throw new Error('context unavailable'); },
        getItemRowQuery: () => { throw new Error('query unavailable'); },
      });
      outcomes.observabilityContextReturnsNullWhenProvidersThrow =
        observabilityContext.currentDeltaEvolu() === null
        && observabilityContext.currentDeltaItemRowQuery() === null;

      observabilityContext.configureSyncDeltaObservabilityContext({
        getEvolu: () => ({
          getQueryRows(providedQuery) {
            return providedQuery === query ? rows : [];
          },
        }),
        getItemRowQuery: () => query,
      });
      outcomes.observabilityContextReturnsConfiguredProviders =
        observabilityContext.currentDeltaItemRowQuery() === query
        && observabilityContext.currentDeltaEvolu()?.getQueryRows(query).length === rows.length;

      const noProfile = readiness.getDeltaCutoverReadiness('', {});
      const importedData = {
        entries: [{ date: '2026-06-09', markers: {} }],
        supplements: [{ name: 'Magnesium', startDate: '2026-01-01', type: 'capsule' }],
        markerNotes: { LDL: 'local note' },
        lightEnvironment: {
          rooms: [{ id: 'room-a', name: 'Bedroom' }],
          burdenAI: { score: 2 },
        },
      };
      const status = readiness.getDeltaCutoverReadiness(profileId, importedData);

      outcomes.readinessClassifiesArraysMapsScalarsRowsAndBlockers =
        noProfile.ready === false
        && noProfile.error === 'no-profile'
        && status.ready === false
        && status.blockerCount === 2
        && status.surfaceCount > 20
        && status.surfaces.entries.shape === 'array'
        && status.surfaces.entries.localCount === 1
        && status.surfaces.entries.rowCount === 1
        && status.surfaces.entries.status === 'ok'
        && status.surfaces.notes.status === 'rows-only'
        && status.surfaces.supplements.status === 'missing-rows'
        && status.surfaces.markerNotes.shape === 'map'
        && status.surfaces.markerNotes.status === 'missing-rows'
        && status.surfaces.categoryLabels.status === 'rows-only'
        && status.surfaces['lightEnvironment.rooms'].shape === 'array'
        && status.surfaces['lightEnvironment.rooms'].status === 'ok'
        && status.surfaces['lightEnvironment.burdenAI'].shape === 'scalar'
        && status.surfaces['lightEnvironment.burdenAI'].status === 'ok'
        && status.surfaces.diet.status === 'no-data';

      stateModule.state.importedData = {
        entries: [{ date: '2026-06-10', markers: {} }],
      };
      observabilityContext.configureSyncDeltaObservabilityContext({
        getEvolu: () => ({ getQueryRows: () => [] }),
        getItemRowQuery: () => query,
      });
      const stateFallback = readiness.getDeltaCutoverReadiness(profileId);
      outcomes.readinessFallsBackToSharedStateImportedData =
        stateFallback.ready === false
        && stateFallback.surfaces.entries.localCount === 1
        && stateFallback.surfaces.entries.rowCount === 0
        && stateFallback.surfaces.entries.status === 'missing-rows';
    } finally {
      stateModule.state.importedData = originalImportedData;
      observabilityContext.configureSyncDeltaObservabilityContext({
        getEvolu: () => null,
        getItemRowQuery: () => null,
      });
    }

    outcomes.allOutcomesReached = true;
    return outcomes;
  }, {
    readinessUrl: moduleUrl('/js/sync-delta-readiness.js'),
  });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});

test('sync delta facade covers default provider guards', async ({ page }) => {
  await openBlankPage(page, '/sync-delta-facade-coverage');

  const results = await page.evaluate(async ({ deltaUrl }) => {
    const delta = await import(deltaUrl);
    const outcomes = {};

    try {
      delta.configureSyncDelta();
      const today = new Date().toISOString().slice(0, 10);
      outcomes.applyArrayDeltaWithoutRuntimeReturnsFalse =
        delta._applyArrayDelta('entries', { ops: [{ kind: 'insert', args: { profileId: 'missing-runtime' } }] }) === false;

      const readiness = delta.getDeltaCutoverReadiness('default-provider-profile', {
        entries: [{ date: today, markers: { 'biochemistry.glucose': 5.4 } }],
      });
      outcomes.defaultProviderReadinessUsesNullQueryState =
        readiness.ready === false
        && readiness.surfaces.entries.localCount === 1
        && readiness.surfaces.entries.rowCount === 0
        && readiness.surfaces.entries.status === 'missing-rows';
    } finally {
      delta.configureSyncDelta({
        getEvolu: () => null,
        getItemRowQuery: () => null,
      });
    }

    outcomes.allOutcomesReached = true;
    return outcomes;
  }, {
    deltaUrl: moduleUrl('/js/sync-delta.js'),
  });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});
