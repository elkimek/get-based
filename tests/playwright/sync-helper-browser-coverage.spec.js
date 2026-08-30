import { expect, test } from './coverage-fixture.js';

function moduleUrl(path) {
  return `${path}?syncHelperCoverage=${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

test('sync apply cutover cleanup and rebroadcast helpers cover guarded browser paths', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });
  await page.waitForSelector('#notification-container', { state: 'attached' });

  const results = await page.evaluate(async ({ applyUrl, cleanupUrl, cutoverUrl, rebroadcastUrl }) => {
    const [
      apply,
      cleanup,
      cutover,
      rebroadcast,
      { state },
      syncState,
      syncDelta,
      chatRuntime,
    ] = await Promise.all([
      import(applyUrl),
      import(cleanupUrl),
      import(cutoverUrl),
      import(rebroadcastUrl),
      import('/js/state.js'),
      import('/js/sync-state.js'),
      import('/js/sync-delta.js'),
      import('/js/chat-runtime.js'),
    ]);
    const outcomes = {};
    const profileId = `sync-helper-${Date.now()}`;
    const debugCalls = [];
    const pushed = [];
    const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
    const aiKeys = [
      'labcharts-ai-provider',
      'labcharts-openrouter-key',
      'labcharts-openrouter-model',
      'labcharts-custom-url',
      'labcharts-venice-model',
      'labcharts-unknown-ai-key',
    ];
    const displayKeys = [
      `labcharts-${profileId}-units`,
      `labcharts-${profileId}-rangeMode`,
      `labcharts-${profileId}-suppOverlay`,
      `labcharts-${profileId}-unknownDisplay`,
    ];
    const cleanupKeys = [
      `labcharts-${profileId}-delta-entries`,
      `labcharts-${profileId}-delta-entries-meta`,
      `labcharts-${profileId}-sync-cutover-v2`,
      `labcharts-${profileId}-relay-bytes-last`,
      `labcharts-${profileId}-sync-ts`,
      `labcharts-${profileId}-keep`,
      'labcharts-sync-restore-join-pending',
      'labcharts-relay-quota-warned',
    ];
    const sessionKeys = [
      'or_oauth_local_settings_lock_until',
      'labcharts-ai-settings-local-lock-until',
    ];
    const storageKeys = [...aiKeys, ...displayKeys, ...cleanupKeys];
    const saved = {
      state: {
        currentProfile: state.currentProfile,
        importedData: clone(state.importedData),
      },
      localStorage: Object.fromEntries(storageKeys.map(key => [key, localStorage.getItem(key)])),
      sessionStorage: Object.fromEntries(sessionKeys.map(key => [key, sessionStorage.getItem(key)])),
    };
    let previousChatRuntime = null;

    const restoreStoredValue = (store, key, value) => {
      if (value == null) store.removeItem(key);
      else store.setItem(key, value);
    };

    try {
      for (const key of storageKeys) localStorage.removeItem(key);
      for (const key of sessionKeys) sessionStorage.removeItem(key);
      let headerUpdates = 0;
      let searchRefreshes = 0;
      previousChatRuntime = chatRuntime.configureChatRuntimeCallbacks({
        updateChatHeaderModel: () => { headerUpdates += 1; },
        refreshWebSearchToggle: () => { searchRefreshes += 1; },
      });

      localStorage.setItem('labcharts-ai-provider', 'local-openrouter');
      localStorage.setItem('labcharts-openrouter-key', 'local-secret');
      sessionStorage.setItem('or_oauth_local_settings_lock_until', String(Date.now() + 60_000));
      await apply.applyAISettings({
        'labcharts-ai-provider': 'remote-provider',
        'labcharts-openrouter-key': 'remote-secret',
        'labcharts-openrouter-model': 'remote-model',
        'labcharts-custom-url': 'https://api.example.test',
        'labcharts-unknown-ai-key': 'ignored',
        'labcharts-venice-model': 'x'.repeat(10001),
      });
      outcomes.applyAISettingsKeepsLockedOAuthAndFiltersInput =
        localStorage.getItem('labcharts-ai-provider') === 'local-openrouter'
        && localStorage.getItem('labcharts-openrouter-key') === 'local-secret'
        && localStorage.getItem('labcharts-openrouter-model') === 'remote-model'
        && localStorage.getItem('labcharts-custom-url') === 'https://api.example.test'
        && localStorage.getItem('labcharts-venice-model') == null
        && headerUpdates === 1
        && searchRefreshes === 1;

      sessionStorage.removeItem('or_oauth_local_settings_lock_until');
      sessionStorage.setItem('labcharts-ai-settings-local-lock-until', String(Date.now() + 60_000));
      await apply.applyAISettings({ 'labcharts-custom-url': 'https://blocked.example.test' });
      outcomes.applyAISettingsHonorsGlobalLocalLock =
        localStorage.getItem('labcharts-custom-url') === 'https://api.example.test'
        && headerUpdates === 1
        && searchRefreshes === 1;

      apply.applyDisplayPrefs(profileId, {
        units: 'si',
        rangeMode: 'optimal',
        suppOverlay: 'compact',
        unknownDisplay: 'ignored',
      });
      outcomes.applyDisplayPrefsWritesAllowlistedSuffixes =
        localStorage.getItem(`labcharts-${profileId}-units`) === 'si'
        && localStorage.getItem(`labcharts-${profileId}-rangeMode`) === 'optimal'
        && localStorage.getItem(`labcharts-${profileId}-suppOverlay`) === 'compact'
        && localStorage.getItem(`labcharts-${profileId}-unknownDisplay`) == null;

      localStorage.setItem(`labcharts-${profileId}-delta-entries`, '{}');
      localStorage.setItem(`labcharts-${profileId}-delta-entries-meta`, '1');
      localStorage.setItem(`labcharts-${profileId}-sync-cutover-v2`, 'true');
      localStorage.setItem(`labcharts-${profileId}-relay-bytes-last`, '12');
      localStorage.setItem(`labcharts-${profileId}-sync-ts`, '123');
      localStorage.setItem(`labcharts-${profileId}-keep`, 'keep');
      localStorage.setItem('labcharts-sync-restore-join-pending', '1');
      localStorage.setItem('labcharts-relay-quota-warned', '1');
      const cleanupClassifies = cleanup.isSyncDisableCleanupKey(`labcharts-${profileId}-delta-entries`)
        && cleanup.isSyncDisableCleanupKey('labcharts-sync-restore-join-pending')
        && !cleanup.isSyncDisableCleanupKey(`labcharts-${profileId}-keep`);
      cleanup.clearSyncDisableStorage();
      outcomes.clearSyncDisableStorageRemovesOnlySyncDisableKeys = cleanupClassifies
        && localStorage.getItem(`labcharts-${profileId}-delta-entries`) == null
        && localStorage.getItem(`labcharts-${profileId}-delta-entries-meta`) == null
        && localStorage.getItem(`labcharts-${profileId}-sync-cutover-v2`) == null
        && localStorage.getItem(`labcharts-${profileId}-relay-bytes-last`) == null
        && localStorage.getItem(`labcharts-${profileId}-sync-ts`) == null
        && localStorage.getItem('labcharts-sync-restore-join-pending') == null
        && localStorage.getItem('labcharts-relay-quota-warned') == null
        && localStorage.getItem(`labcharts-${profileId}-keep`) === 'keep';

      syncDelta.configureSyncDelta({
        getEvolu: () => ({ getQueryRows: () => [] }),
        getItemRowQuery: () => ({}),
      });
      state.importedData = { entries: [{ date: '2026-06-08', markers: {} }] };
      const noProfile = cutover.enablePhase2Cutover('');
      const notReady = cutover.enablePhase2Cutover(profileId);
      state.importedData = {};
      const enabled = cutover.enablePhase2Cutover(profileId);
      const flagAfterEnable = cutover.isPhase2CutoverEnabled(profileId);
      const disabled = cutover.disablePhase2Cutover(profileId);
      outcomes.cutoverGatesOnProfileAndReadiness =
        noProfile.reason === 'no-profile'
        && notReady.reason === 'not-ready'
        && notReady.blockerCount > 0
        && enabled.ok === true
        && flagAfterEnable === true
        && disabled === true
        && cutover.isPhase2CutoverEnabled(profileId) === false;

      state.currentProfile = profileId;
      syncState.resetSyncStatus();
      const skippedNoNeed = rebroadcast.maybeScheduleRebroadcast({
        profileId,
        needsRebroadcast: false,
        pushProfile: () => { pushed.push('unexpected'); },
      });
      syncState.updateSyncStatus({ push: 'pending' });
      const skippedPending = rebroadcast.maybeScheduleRebroadcast({
        profileId,
        needsRebroadcast: true,
        pushProfile: () => { pushed.push('pending'); },
        debug: () => { throw new Error('debug should be swallowed'); },
      });
      syncState.resetSyncStatus();
      state.importedData = { value: 3 };
      const scheduled = rebroadcast.maybeScheduleRebroadcast({
        profileId,
        needsRebroadcast: true,
        pushProfile: (id, data) => { pushed.push({ id, data: clone(data) }); },
        debug: (...args) => { debugCalls.push(args.join(' ')); },
      });
      state.importedData = { value: 33 };
      await new Promise(resolve => setTimeout(resolve, 140));
      const abortedProfileId = `${profileId}-abort`;
      state.currentProfile = abortedProfileId;
      const scheduledAbort = rebroadcast.maybeScheduleRebroadcast({
        profileId: abortedProfileId,
        needsRebroadcast: true,
        pushProfile: (id, data) => { pushed.push({ id, data: clone(data) }); },
        debug: (...args) => { debugCalls.push(args.join(' ')); },
      });
      state.currentProfile = profileId;
      await new Promise(resolve => setTimeout(resolve, 140));
      outcomes.rebroadcastSkipsPendingSchedulesAndAbortsSafely =
        skippedNoNeed === false
        && skippedPending === false
        && scheduled === true
        && scheduledAbort === true
        && pushed.length === 1
        && pushed[0].id === profileId
        && pushed[0].data.value === 33
        && debugCalls.some(message => message.includes('rebroadcast'))
        && debugCalls.some(message => message.includes('active profile switched'));
    } finally {
      state.currentProfile = saved.state.currentProfile;
      state.importedData = saved.state.importedData;
      syncState.resetSyncStatus();
      for (const [key, value] of Object.entries(saved.localStorage)) {
        restoreStoredValue(localStorage, key, value);
      }
      for (const [key, value] of Object.entries(saved.sessionStorage)) {
        restoreStoredValue(sessionStorage, key, value);
      }
      if (previousChatRuntime) chatRuntime.configureChatRuntimeCallbacks(previousChatRuntime);
    }

    return outcomes;
  }, {
    applyUrl: moduleUrl('/js/sync-apply.js'),
    cleanupUrl: moduleUrl('/js/sync-disable-cleanup.js'),
    cutoverUrl: moduleUrl('/js/sync-cutover.js'),
    rebroadcastUrl: moduleUrl('/js/sync-pull-rebroadcast.js'),
  });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});

test('sync delta planners and committed apply cover row mutation contracts', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });
  await page.waitForSelector('#notification-container', { state: 'attached' });

  const results = await page.evaluate(async ({ arrayPlannerUrl, mapPlannerUrl, scalarPlannerUrl, pushDeltasUrl }) => {
    const [arrayPlanner, mapPlanner, scalarPlanner, pushDeltas, syncDelta] = await Promise.all([
      import(arrayPlannerUrl),
      import(mapPlannerUrl),
      import(scalarPlannerUrl),
      import(pushDeltasUrl),
      import('/js/sync-delta.js'),
    ]);
    const outcomes = {};
    const profileId = `sync-delta-plan-${Date.now()}`;
    const manualItemId = rawKey => rawKey.replace(/_/g, '__').replace(/:/g, '_');
    let itemRows = [];
    const applied = [];
    const warnings = [];
    const debugCalls = [];
    const originalWarn = console.warn;
    const deltaKeyPrefix = `labcharts-${profileId}-delta-`;
    const removeDeltaKeys = () => {
      for (const key of Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i)).filter(Boolean)) {
        if (key.startsWith(deltaKeyPrefix)) localStorage.removeItem(key);
      }
    };
    const parsePayload = op => JSON.parse(op.args.payload);

    try {
      console.warn = (...args) => { warnings.push(args.map(String).join(' ')); };
      removeDeltaKeys();
      syncDelta.configureSyncDelta({
        getEvolu: () => ({
          getQueryRows: () => itemRows,
          insert: (table, args) => { applied.push({ table, kind: 'insert', args }); },
          update: (table, args) => { applied.push({ table, kind: 'update', args }); },
        }),
        getItemRowQuery: () => ({}),
      });

      localStorage.setItem(`${deltaKeyPrefix}entries`, JSON.stringify({
        '2026-06-01': 'old',
        '2026-05-01': 'old',
      }));
      itemRows = [
        { id: 'row-entry-live', profileId, arrayName: 'entries', itemId: '2026-06-01', isDeleted: 1 },
        { id: 'row-entry-old', profileId, arrayName: 'entries', itemId: '2026-05-01', isDeleted: null },
      ];
      const entryPlan = await arrayPlanner._planArrayDelta(profileId, 'entries', [
        { date: '2026-06-01', markers: { metabolic: { glucose: 5.1 } } },
        { date: '2026-06-02', markers: {} },
      ]);
      outcomes.arrayPlannerUpdatesInsertsAndTombstones =
        entryPlan.ops.some(op => op.kind === 'update' && op.args.id === 'row-entry-live' && op.args.isDeleted === null)
        && entryPlan.ops.some(op => op.kind === 'insert' && op.args.itemId === '2026-06-02')
        && entryPlan.ops.some(op => op.kind === 'tombstone' && op.args.id === 'row-entry-old');

      const stormPrev = {};
      itemRows = [];
      for (let i = 0; i < 20; i += 1) {
        const itemId = `2026-04-${String(i + 1).padStart(2, '0')}`;
        stormPrev[itemId] = 'old';
        itemRows.push({ id: `row-storm-${i}`, profileId, arrayName: 'entries', itemId, isDeleted: null });
      }
      localStorage.setItem(`${deltaKeyPrefix}entries`, JSON.stringify(stormPrev));
      const stormPlan = await arrayPlanner._planArrayDelta(profileId, 'entries', []);
      outcomes.arrayPlannerRefusesTombstoneStorm =
        stormPlan.ops.length === 0
        && warnings.some(message => message.includes('_planArrayDelta refused tombstone storm'));

      const glucoseKey = 'metabolic.glucose:2026-06-01';
      const ironKey = 'metabolic.iron:2026-06-01';
      const nullKey = 'metabolic.null:2026-06-01';
      localStorage.setItem(`${deltaKeyPrefix}manualValues`, JSON.stringify({
        [manualItemId(glucoseKey)]: 'old',
        [manualItemId(ironKey)]: 'old',
      }));
      itemRows = [
        {
          id: 'row-manual-glucose',
          profileId,
          arrayName: 'manualValues',
          itemId: manualItemId(glucoseKey),
          isDeleted: 1,
        },
        {
          id: 'row-manual-iron',
          profileId,
          arrayName: 'manualValues',
          itemId: manualItemId(ironKey),
          isDeleted: null,
        },
      ];
      const manualValues = Object.create(null);
      manualValues[glucoseKey] = 7;
      manualValues[nullKey] = null;
      Object.defineProperty(manualValues, '__proto__', {
        configurable: true,
        enumerable: true,
        value: 123,
      });
      const mapPlan = await mapPlanner._planKeyedMapDelta(profileId, 'manualValues', manualValues);
      const glucoseOp = mapPlan.ops.find(op => op.args.itemId === manualItemId(glucoseKey));
      const nullOp = mapPlan.ops.find(op => op.args.itemId === manualItemId(nullKey));
      outcomes.mapPlannerPreservesRawKeysAllowsClearsAndTombstones =
        glucoseOp?.kind === 'update'
        && glucoseOp.args.id === 'row-manual-glucose'
        && glucoseOp.args.isDeleted === null
        && parsePayload(glucoseOp).k === glucoseKey
        && parsePayload(glucoseOp).v === 7
        && nullOp?.kind === 'insert'
        && parsePayload(nullOp).v === null
        && mapPlan.ops.some(op => op.kind === 'tombstone' && op.args.id === 'row-manual-iron')
        && mapPlan.ops.every(op => op.args.itemId !== '__proto__');

      localStorage.setItem(`${deltaKeyPrefix}menstrualCycle`, JSON.stringify({ menstrualCycle: 'old' }));
      itemRows = [
        {
          id: 'row-cycle-old',
          profileId,
          arrayName: 'menstrualCycle',
          itemId: 'menstrualCycle',
          syncedAt: '2026-06-01T00:00:00.000Z',
          isDeleted: null,
        },
        {
          id: 'row-cycle-latest',
          profileId,
          arrayName: 'menstrualCycle',
          itemId: 'menstrualCycle',
          syncedAt: '2026-06-02T00:00:00.000Z',
          isDeleted: 1,
        },
      ];
      const scalarUpdatePlan = await scalarPlanner._planScalarDelta(profileId, 'menstrualCycle', { cycleLength: 28 });
      itemRows = [
        {
          id: 'row-cycle-active',
          profileId,
          arrayName: 'menstrualCycle',
          itemId: 'menstrualCycle',
          syncedAt: '2026-06-03T00:00:00.000Z',
          isDeleted: null,
        },
      ];
      const scalarTombstonePlan = await scalarPlanner._planScalarDelta(profileId, 'menstrualCycle', null);
      outcomes.scalarPlannerResurrectsLatestRowAndTombstonesClears =
        scalarUpdatePlan.ops.length === 1
        && scalarUpdatePlan.ops[0].kind === 'update'
        && scalarUpdatePlan.ops[0].args.id === 'row-cycle-latest'
        && scalarUpdatePlan.ops[0].args.isDeleted === null
        && parsePayload(scalarUpdatePlan.ops[0]).v.cycleLength === 28
        && scalarTombstonePlan.ops.length === 1
        && scalarTombstonePlan.ops[0].kind === 'tombstone'
        && scalarTombstonePlan.ops[0].args.id === 'row-cycle-active';

      removeDeltaKeys();
      itemRows = [];
      const planned = await pushDeltas.planProfileDeltas(profileId, {
        lightDevices: [{ id: 'device-one', name: 'Lamp', updatedAt: '2026-06-08T10:00:00.000Z' }],
        manualValues: { 'metabolic.zinc:2026-06-08': 8 },
        genetics: { provider: 'imported', snps: { rs1: 'AA' } },
        menstrualCycle: { cycleLength: 29 },
      });
      const geneticsPlan = planned.deltaPlans.find(({ arrayName }) => arrayName === 'genetics');
      const geneticsPayload = geneticsPlan ? JSON.parse(geneticsPlan.plan.ops[0].args.payload) : null;
      outcomes.planProfileDeltasWalksArraysMapsAndStripsGeneticsSnps =
        planned.deltaOpCount >= 4
        && planned.deltaPlans.some(({ arrayName }) => arrayName === 'lightDevices')
        && planned.deltaPlans.some(({ arrayName }) => arrayName === 'manualValues')
        && planned.deltaPlans.some(({ arrayName }) => arrayName === 'genetics.snps')
        && geneticsPayload?.v?.provider === 'imported'
        && !Object.prototype.hasOwnProperty.call(geneticsPayload.v, 'snps');

      applied.length = 0;
      const committedPlan = {
        ops: [
          {
            kind: 'insert',
            args: {
              profileId,
              arrayName: 'lightDevices',
              itemId: 'device-committed',
              payload: JSON.stringify({ id: 'device-committed' }),
              syncedAt: new Date().toISOString(),
            },
          },
          {
            kind: 'tombstone',
            args: { id: 'row-device-old', isDeleted: 1, syncedAt: new Date().toISOString() },
          },
        ],
        next: { 'device-committed': 'hash' },
        plannedAt: Date.now(),
      };
      syncDelta.resetDeltaTelemetry(profileId);
      pushDeltas.applyCommittedDeltas(
        profileId,
        JSON.stringify({ lightDevices: [{ id: 'device-committed' }] }),
        [{ arrayName: 'lightDevices', plan: committedPlan }],
        committedPlan.ops.length,
        message => { debugCalls.push(message); }
      );
      const telemetry = syncDelta.getDeltaTelemetry(profileId);
      const lastPush = telemetry?.pushes?.at(-1);
      outcomes.applyCommittedDeltasMutatesRowsAdvancesSnapshotAndTelemetry =
        applied.length === 2
        && applied.some(call => call.kind === 'insert' && call.args.itemId === 'device-committed')
        && applied.some(call => call.kind === 'update' && call.args.id === 'row-device-old')
        && JSON.parse(localStorage.getItem(`${deltaKeyPrefix}lightDevices`) || '{}')['device-committed'] === 'hash'
        && debugCalls.some(message => message.includes('Applied 2 delta ops'))
        && telemetry?.summary?.totalOps === 2
        && lastPush?.perArray?.lightDevices?.ins === 1
        && lastPush?.perArray?.lightDevices?.tom === 1
        && lastPush.blobBytes > 0;
    } finally {
      console.warn = originalWarn;
      removeDeltaKeys();
    }

    return outcomes;
  }, {
    arrayPlannerUrl: moduleUrl('/js/sync-delta-array-planner.js'),
    mapPlannerUrl: moduleUrl('/js/sync-delta-map-planner.js'),
    scalarPlannerUrl: moduleUrl('/js/sync-delta-scalar-planner.js'),
    pushDeltasUrl: moduleUrl('/js/sync-push-deltas.js'),
  });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});

test('sync delta merge helpers overlay array map and scalar rows', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });
  await page.waitForSelector('#notification-container', { state: 'attached' });

  const results = await page.evaluate(async ({ arrayMergeUrl, mapMergeUrl, scalarMergeUrl }) => {
    const [arrayMerge, mapMerge, scalarMerge] = await Promise.all([
      import(arrayMergeUrl),
      import(mapMergeUrl),
      import(scalarMergeUrl),
    ]);
    const outcomes = {};
    const payload = value => JSON.stringify(value);
    const manualItemId = rawKey => rawKey.replace(/_/g, '__').replace(/:/g, '_');

    const importedArrays = {
      lightDevices: [
        { id: 'device-a', name: 'Old lamp', updatedAt: '2026-06-01T00:00:00.000Z' },
        { id: 'device-a', name: 'Duplicate lamp', updatedAt: '2026-05-01T00:00:00.000Z' },
        { id: 'device-delete', name: 'Deleted lamp', updatedAt: '2026-06-01T00:00:00.000Z' },
        { id: 'device-local-tomb', name: 'Local tomb', updatedAt: '2026-06-01T00:00:00.000Z' },
      ],
      _deleted: { lightDevices: ['device-local-tomb'] },
    };
    await arrayMerge.mergeArrayRowsIntoImported(importedArrays, 'lightDevices', [
      {
        profileId: 'merge-profile',
        arrayName: 'lightDevices',
        itemId: 'device-a',
        payload: payload({ id: 'device-a', name: 'Remote lamp', updatedAt: '2026-06-02T00:00:00.000Z' }),
        syncedAt: '2026-06-02T00:00:01.000Z',
      },
      {
        profileId: 'merge-profile',
        arrayName: 'lightDevices',
        itemId: 'device-new',
        payload: payload({ id: 'device-new', name: 'New lamp', updatedAt: '2026-06-03T00:00:00.000Z' }),
        syncedAt: '2026-06-03T00:00:01.000Z',
      },
      {
        profileId: 'merge-profile',
        arrayName: 'lightDevices',
        itemId: 'device-delete',
        isDeleted: 1,
        syncedAt: '2026-06-04T00:00:00.000Z',
      },
      {
        profileId: 'merge-profile',
        arrayName: 'lightDevices',
        itemId: 'device-local-tomb',
        payload: payload({ id: 'device-local-tomb', name: 'Remote resurrect', updatedAt: '2026-06-05T00:00:00.000Z' }),
        syncedAt: '2026-06-05T00:00:01.000Z',
      },
    ]);
    outcomes.arrayMergeDedupesAppliesLiveRowsAndHonorsTombstones =
      importedArrays.lightDevices.length === 2
      && importedArrays.lightDevices.some(item => item.id === 'device-a' && item.name === 'Remote lamp')
      && importedArrays.lightDevices.some(item => item.id === 'device-new')
      && !importedArrays.lightDevices.some(item => item.id === 'device-delete')
      && !importedArrays.lightDevices.some(item => item.id === 'device-local-tomb');

    const glucoseKey = 'metabolic.glucose:2026-06-01';
    const ironKey = 'metabolic.iron:2026-06-01';
    const importedMap = {
      manualValues: {
        [glucoseKey]: 5,
        [ironKey]: 9,
      },
    };
    await mapMerge.mergeMapRowsIntoImported(importedMap, 'manualValues', [
      {
        profileId: 'merge-profile',
        arrayName: 'manualValues',
        itemId: manualItemId(glucoseKey),
        payload: payload({ k: glucoseKey, v: 7 }),
        syncedAt: '2026-06-03T00:00:00.000Z',
      },
      {
        profileId: 'merge-profile',
        arrayName: 'manualValues',
        itemId: manualItemId(ironKey),
        isDeleted: 1,
        syncedAt: '2026-06-04T00:00:00.000Z',
      },
      {
        profileId: 'merge-profile',
        arrayName: 'manualValues',
        itemId: '__proto__',
        payload: payload({ k: '__proto__', v: { polluted: true } }),
        syncedAt: '2026-06-05T00:00:00.000Z',
      },
    ]);
    outcomes.mapMergePreservesRawKeysDeletesSynthIdsAndRejectsPollution =
      importedMap.manualValues[glucoseKey] === 7
      && !Object.prototype.hasOwnProperty.call(importedMap.manualValues, ironKey)
      && !({}).polluted
      && !Object.prototype.hasOwnProperty.call(importedMap.manualValues, '__proto__');

    const importedScalars = {
      genetics: { provider: 'local', snps: { rs1: 'AA' } },
      lightEnvironment: { burdenAI: { score: 4 } },
    };
    await scalarMerge.mergeScalarRowsIntoImported(importedScalars, 'genetics', [
      {
        profileId: 'merge-profile',
        arrayName: 'genetics',
        itemId: 'genetics',
        payload: payload({ v: { provider: 'remote' } }),
        syncedAt: '2026-06-02T00:00:00.000Z',
      },
    ]);
    await scalarMerge.mergeScalarRowsIntoImported(importedScalars, 'lightEnvironment.burdenAI', [
      {
        profileId: 'merge-profile',
        arrayName: 'lightEnvironment.burdenAI',
        itemId: 'lightEnvironment.burdenAI',
        isDeleted: 1,
        syncedAt: '2026-06-03T00:00:00.000Z',
      },
    ]);
    outcomes.scalarMergePreservesNestedMapFieldsAndClearsDottedLeaves =
      importedScalars.genetics.provider === 'remote'
      && importedScalars.genetics.snps.rs1 === 'AA'
      && importedScalars.lightEnvironment.burdenAI === null;

    return outcomes;
  }, {
    arrayMergeUrl: moduleUrl('/js/sync-delta-array-merge.js'),
    mapMergeUrl: moduleUrl('/js/sync-delta-map-merge.js'),
    scalarMergeUrl: moduleUrl('/js/sync-delta-scalar-merge.js'),
  });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});
