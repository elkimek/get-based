import { expect, test } from './coverage-fixture.js';

function moduleUrl(path) {
  return `${path}?syncPullMergeCoverage=${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

async function openBlankPage(page) {
  await page.route('**/sync-pull-merge-browser-coverage', route => route.fulfill({
    status: 200,
    contentType: 'text/html',
    body: '<!doctype html><html><head><title>Sync pull merge coverage</title></head><body></body></html>',
  }));
  await page.goto('/sync-pull-merge-browser-coverage', { waitUntil: 'load' });
}

test('sync pull merge browser coverage exercises row recovery merge persistence and profile updates', async ({ page }) => {
  await openBlankPage(page);

  const results = await page.evaluate(async ({ pullMergeUrl, syncDeltaUrl, cryptoUrl, profileUrl, stateUrl }) => {
    const [pullMerge, syncDelta, cryptoStore, profileStore, { state }] = await Promise.all([
      import(pullMergeUrl),
      import(syncDeltaUrl),
      import(cryptoUrl),
      import(profileUrl),
      import(stateUrl),
    ]);
    const outcomes = {};
    const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
    const payloadForProfile = id => JSON.stringify({
      _v: 3,
      importedData: { entries: [] },
      profile: { id },
    });
    const profileId = `sync-pull-merge-${Date.now()}`;
    const storedProfileId = `${profileId}_stored`;
    const fallbackProfileId = `${profileId}_fallback`;
    const replacementProfileId = `${profileId}_replacement`;
    const localKey = profileStore.profileStorageKey(profileId, 'imported');
    const storedKey = profileStore.profileStorageKey(storedProfileId, 'imported');
    const replacementKey = profileStore.profileStorageKey(replacementProfileId, 'imported');
    const saved = {
      state: {
        currentProfile: state.currentProfile,
        importedData: clone(state.importedData),
        profiles: clone(state.profiles),
      },
      encryptionEnabled: localStorage.getItem('labcharts-encryption-enabled'),
      activeProfile: localStorage.getItem('labcharts-active-profile'),
      profilesRaw: localStorage.getItem('labcharts-profiles'),
      restoreJoinPending: localStorage.getItem('labcharts-sync-restore-join-pending'),
    };
    const restoreLocalValue = (key, value) => {
      if (value == null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    };

    try {
      localStorage.setItem('labcharts-encryption-enabled', 'false');
      await cryptoStore.encryptedRemoveItem(localKey);
      await cryptoStore.encryptedRemoveItem(storedKey);
      await cryptoStore.encryptedRemoveItem(replacementKey);
      localStorage.removeItem(`labcharts-${profileId}-sync-ts`);
      localStorage.removeItem(`labcharts-${storedProfileId}-sync-ts`);
      syncDelta.configureSyncDelta({
        getEvolu: () => ({ getQueryRows: () => [] }),
        getItemRowQuery: () => ({}),
      });

      outcomes.guardsProfileIdsAndMalformedImportedData =
        pullMerge.isSafeProfileId('safe_Profile-1')
        && !pullMerge.isSafeProfileId('../unsafe')
        && pullMerge.isMalformedPulledImportedData('not-an-object')
        && !pullMerge.isMalformedPulledImportedData(null)
        && !pullMerge.isMalformedPulledImportedData({ entries: [] });

      const recoveredRows = await pullMerge.recoverSyncPullRows([
        null,
        { profileId: 'existing_ok', dataJson: '{bad json', syncedAt: '2026-06-01T00:00:00.000Z' },
        { profileId: '', dataJson: payloadForProfile('recovered_ok'), syncedAt: '2026-06-02T00:00:00.000Z' },
        { profileId: '', dataJson: payloadForProfile('../bad'), syncedAt: '2026-06-03T00:00:00.000Z' },
        { profileId: '', dataJson: '{bad json', syncedAt: '2026-06-04T00:00:00.000Z' },
      ]);
      outcomes.recoverRowsKeepsExistingRecoversPayloadAndDropsUnsafe =
        recoveredRows.length === 2
        && recoveredRows.some(row => row.profileId === 'existing_ok')
        && recoveredRows.some(row => row.profileId === 'recovered_ok')
        && !recoveredRows.some(row => row.profileId === '../bad');

      const preparedRows = await pullMerge.prepareSyncPullRows([
        { profileId: '', dataJson: payloadForProfile('dedupe_one'), syncedAt: '2026-06-01T00:00:00.000Z' },
        { profileId: 'dedupe_one', dataJson: '{}', syncedAt: '2026-06-04T00:00:00.000Z', marker: 'newer' },
        { profileId: 'dedupe_two', dataJson: '{}', syncedAt: '2026-06-03T00:00:00.000Z' },
      ]);
      const explicitDedupe = pullMerge.dedupeSyncPullRows([
        { profileId: 'dedupe_three', syncedAt: '2026-06-01T00:00:00.000Z' },
        { profileId: 'dedupe_three', syncedAt: '2026-06-05T00:00:00.000Z', marker: 'newest' },
      ]);
      outcomes.prepareAndDedupeKeepNewestRowsInDescendingOrder =
        preparedRows.length === 2
        && preparedRows[0].profileId === 'dedupe_one'
        && preparedRows[0].marker === 'newer'
        && preparedRows[1].profileId === 'dedupe_two'
        && explicitDedupe.length === 1
        && explicitDedupe[0].marker === 'newest';

      const localUpdatedAt = Date.now();
      state.currentProfile = profileId;
      state.importedData = {
        entries: [
          { date: '2026-06-08', updatedAt: localUpdatedAt, markers: { 'coverage.local': 1 } },
        ],
        lightDevices: [
          { id: 'local-device', name: 'Local lamp', updatedAt: '2026-06-07T00:00:00.000Z' },
        ],
        wearableConnections: {
          oura: { connected: true, refreshToken: 'local-refresh-token' },
        },
        _deleted: { lightDevices: ['locally-deleted-device'] },
        _deletedAt: { lightDevices: { 'locally-deleted-device': 10 } },
        _deletedClearedAt: { lightDevices: { stale: 20 } },
      };
      localStorage.setItem('labcharts-sync-restore-join-pending', '1');
      const remoteImported = {
        entries: [
          { date: '2026-06-07', updatedAt: '2026-06-07T00:00:00.000Z', markers: { 'coverage.remote': 2 } },
        ],
        lightDevices: [
          { id: 'remote-device', name: 'Remote lamp', updatedAt: '2026-06-09T00:00:00.000Z' },
        ],
        wearableConnections: {
          fitbit: { connected: true, refreshToken: 'remote-refresh-token' },
        },
      };
      const mergedCurrent = await pullMerge.mergePulledImportedData(profileId, remoteImported, { debug: () => {} });
      const mergedDates = new Set((mergedCurrent.merged.entries || []).map(entry => entry.date));
      const mergedDeviceIds = new Set((mergedCurrent.merged.lightDevices || []).map(device => device.id));
      outcomes.mergeCurrentProfilePreservesLocalWearablesAndStripsRestoreTombstones =
        mergedCurrent.localKey === localKey
        && mergedCurrent.restoreJoinApplied === true
        && mergedCurrent.merged.wearableConnections?.oura?.refreshToken === 'local-refresh-token'
        && !mergedCurrent.merged.wearableConnections?.fitbit
        && !Object.prototype.hasOwnProperty.call(mergedCurrent.merged, '_deleted');
      outcomes.mergeCurrentProfileUnionsRowsAndFlagsLocalRebroadcast =
        mergedDates.has('2026-06-07')
        && mergedDates.has('2026-06-08')
        && mergedDeviceIds.has('local-device')
        && mergedDeviceIds.has('remote-device')
        && mergedCurrent.needsRebroadcast === true
        && mergedCurrent.localDataChanged === true;

      localStorage.setItem(storedKey, JSON.stringify({
        entries: [{ date: '2026-06-05', markers: { 'coverage.stored-local': 1 } }],
        lightDevices: [{ id: 'stored-local', updatedAt: '2026-06-05T00:00:00.000Z' }],
      }));
      const mergedStored = await pullMerge.mergePulledImportedData(storedProfileId, {
        entries: [{ date: '2026-06-06', markers: { 'coverage.stored-remote': 2 } }],
        lightDevices: [{ id: 'stored-remote', updatedAt: '2026-06-06T00:00:00.000Z' }],
      });
      outcomes.mergeNonCurrentProfileReadsStoredImportedData =
        mergedStored.localImportedForMerge.entries[0].date === '2026-06-05'
        && mergedStored.merged.entries.some(entry => entry.date === '2026-06-05')
        && mergedStored.merged.entries.some(entry => entry.date === '2026-06-06')
        && mergedStored.merged.lightDevices.some(device => device.id === 'stored-local')
        && mergedStored.merged.lightDevices.some(device => device.id === 'stored-remote');

      await pullMerge.persistPulledImportedData(localKey, profileId, mergedCurrent.merged, 1780988400000);
      const persisted = JSON.parse(await cryptoStore.encryptedGetItem(localKey));
      outcomes.persistWritesImportedDataAndSyncTimestamp =
        persisted.entries.some(entry => entry.date === '2026-06-08')
        && persisted.lightDevices.some(device => device.id === 'remote-device')
        && localStorage.getItem(`labcharts-${profileId}-sync-ts`) === '1780988400000';

      state.profiles = [{
        id: profileId,
        name: 'Local name',
        notes: 'local notes stay private',
        status: 'active',
        tags: ['local'],
        pinned: false,
        height: 180,
        lastUpdated: 1,
      }];
      const mergedExistingProfile = await pullMerge.mergePulledProfile(profileId, {
        id: 'ignored-id',
        name: 'Remote name',
        notes: 'remote notes ignored',
        status: 'archived',
        tags: ['remote'],
        pinned: true,
        color: '#123456',
        height: 190,
      });
      const profileAfterFirstMerge = profileStore.getProfiles()
        .find(profile => profile.id === profileId);
      const firstMergeLastUpdated = profileAfterFirstMerge.lastUpdated;
      const identicalMerge = await pullMerge.mergePulledProfile(profileId, {
        id: 'ignored-id',
        name: 'Remote name',
        notes: 'remote notes ignored',
        status: 'archived',
        tags: ['remote'],
        pinned: true,
        color: '#123456',
        height: 190,
      });
      const mergedNewProfile = await pullMerge.mergePulledProfile(`${profileId}_new`, {
        name: 'New remote profile',
        notes: 'not allowlisted',
        pinned: true,
        color: '#abcdef',
      });
      const profiles = profileStore.getProfiles();
      const updatedProfile = profiles.find(profile => profile.id === profileId);
      const addedProfile = profiles.find(profile => profile.id === `${profileId}_new`);
      outcomes.mergePulledProfileUpdatesAllowlistedFieldsAndAddsMissingProfiles =
        mergedExistingProfile === true
        && mergedNewProfile === true
        && updatedProfile.name === 'Remote name'
        && updatedProfile.notes === 'local notes stay private'
        && updatedProfile.status === 'active'
        && updatedProfile.tags[0] === 'remote'
        && updatedProfile.pinned === true
        && updatedProfile.color === '#123456'
        && updatedProfile.height === 180
        && updatedProfile.lastUpdated > 1
        && firstMergeLastUpdated === updatedProfile.lastUpdated
        && identicalMerge === false
        && addedProfile.name === 'New remote profile'
        && addedProfile.pinned === true
        && addedProfile.color === '#abcdef'
        && !Object.prototype.hasOwnProperty.call(addedProfile, 'notes');

      const fallbackAt = Date.now();
      state.profiles = [{
        id: fallbackProfileId,
        name: 'Profile 1',
        createdAt: fallbackAt,
        lastUpdated: fallbackAt,
        _syncFallback: [profileId, fallbackAt],
      }];
      state.currentProfile = fallbackProfileId;
      state.importedData = profileStore.createDefaultProfileData();
      localStorage.setItem('labcharts-active-profile', fallbackProfileId);
      localStorage.setItem(`labcharts-${fallbackProfileId}-lastViewV1`, 'dashboard');
      await cryptoStore.encryptedSetItem(replacementKey, JSON.stringify({
        ...profileStore.createDefaultProfileData(),
        contextNotes: 'fresh relay replacement',
      }));
      const mergedReplacement = await pullMerge.mergePulledProfile(replacementProfileId, {
        name: 'Fresh replacement',
      });
      outcomes.lateRelayReplacementRemovesOnlyUntouchedSafetyFallback =
        mergedReplacement === true
        && state.currentProfile === replacementProfileId
        && state.importedData.contextNotes === 'fresh relay replacement'
        && profileStore.getProfiles().length === 1
        && profileStore.getProfiles()[0].id === replacementProfileId;

      outcomes.allOutcomesReached = true;
    } finally {
      state.currentProfile = saved.state.currentProfile;
      state.importedData = saved.state.importedData;
      state.profiles = saved.state.profiles;
      restoreLocalValue('labcharts-encryption-enabled', saved.encryptionEnabled);
      restoreLocalValue('labcharts-active-profile', saved.activeProfile);
      restoreLocalValue('labcharts-profiles', saved.profilesRaw);
      restoreLocalValue('labcharts-sync-restore-join-pending', saved.restoreJoinPending);
      localStorage.removeItem(`labcharts-${profileId}-sync-ts`);
      localStorage.removeItem(`labcharts-${storedProfileId}-sync-ts`);
      localStorage.removeItem(`labcharts-${fallbackProfileId}-lastViewV1`);
      localStorage.removeItem(storedKey);
      await cryptoStore.encryptedRemoveItem(localKey);
      await cryptoStore.encryptedRemoveItem(storedKey);
      await cryptoStore.encryptedRemoveItem(replacementKey);
    }

    return outcomes;
  }, {
    pullMergeUrl: moduleUrl('/js/sync-pull-merge.js'),
    syncDeltaUrl: moduleUrl('/js/sync-delta.js'),
    cryptoUrl: moduleUrl('/js/crypto.js'),
    profileUrl: moduleUrl('/js/profile.js'),
    stateUrl: '/js/state.js',
  });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});
