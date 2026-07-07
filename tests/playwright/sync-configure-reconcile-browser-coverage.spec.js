import { expect, test } from './coverage-fixture.js';

const moduleUrl = path => `${path}?syncConfigureReconcileCoverage=${Date.now()}-${Math.random().toString(36).slice(2)}`;

async function openBlankPage(page, path) {
  await page.route(`**${path}`, route => route.fulfill({
    status: 200,
    contentType: 'text/html',
    body: '<!doctype html><html><body><div id="notification-container"></div><div id="sync-indicator-slot"></div></body></html>',
  }));
  await page.goto(path, { waitUntil: 'load' });
}

test('sync configure browser coverage seeds local profiles through identity restore', async ({ page }) => {
  await openBlankPage(page, '/sync-configure-seed-browser-coverage');

  const results = await page.evaluate(async ({ configureUrl }) => {
    const [configure, identity, runtime, actions, stateModule] = await Promise.all([
      import(configureUrl),
      import('/js/sync-identity.js'),
      import('/js/sync-runtime.js'),
      import('/js/sync-actions.js'),
      import('/js/state.js'),
    ]);
    const { state } = stateModule;
    const outcomes = {};
    const originalSetTimeout = window.setTimeout;
    const savedState = {
      currentProfile: state.currentProfile,
      importedData: state.importedData,
      profiles: state.profiles,
    };
    const pushes = [];
    const restored = [];
    const scheduledTimers = [];
    let thrownError = null;

    try {
      runtime.clearSyncRuntimeState();
      state.currentProfile = 'seed-profile';
      state.importedData = { entries: [{ id: 'marker-1', value: 12 }] };
      state.profiles = [{
        id: 'seed-profile',
        name: 'Seed Profile',
        status: 'active',
        tags: [],
        notes: '',
        createdAt: Date.now(),
        lastUpdated: Date.now(),
      }];
      localStorage.setItem(identity.RESTORE_JOIN_PENDING_KEY, 'stale');

      configure.configureSyncModules({
        enableSync: () => true,
        disableSync: () => true,
      });
      actions.configureSyncActions({
        pushProfile: async (...args) => { pushes.push(args); },
        forcePull: () => {},
        isSyncEnabled: () => true,
        isEvoluReady: () => true,
        isSyncing: () => false,
      });
      runtime.setSyncEvolu({
        restoreAppOwner: async mnemonic => { restored.push(mnemonic); },
      });

      window.setTimeout = (fn, delay = 0) => {
        scheduledTimers.push({ delay, source: String(fn) });
        return scheduledTimers.length;
      };
      const restoredOk = await identity.restoreFromMnemonic('coverage seed mnemonic', { seedLocal: true });
      const notificationText = document.getElementById('notification-container')?.textContent || '';

      outcomes.restoreReturnsTrue = restoredOk === true;
      outcomes.restoreUsesRuntimeEvolu = restored[0] === 'coverage seed mnemonic';
      outcomes.configureSeedLocalProfilesPushesAllProfiles =
        pushes.length === 1
        && pushes[0][0] === 'seed-profile'
        && pushes[0][1] === state.importedData
        && pushes[0][2]?.force === true;
      outcomes.configureSeedClearsRestoreJoinPending =
        localStorage.getItem(identity.RESTORE_JOIN_PENDING_KEY) === null;
      outcomes.configureSeedShowsSuccessNotification =
        notificationText.includes('seeded this device');
      outcomes.configureSeedSchedulesReload =
        scheduledTimers.some(timer => (
          timer.delay === 500
          && timer.source.includes('reload.call')
        ));
    } catch (error) {
      thrownError = error;
    } finally {
      window.setTimeout = originalSetTimeout;
      runtime.clearSyncRuntimeState();
      actions.configureSyncActions({
        pushProfile: async () => {},
        forcePull: () => {},
        isSyncEnabled: () => false,
        isEvoluReady: () => false,
        isSyncing: () => false,
      });
      state.currentProfile = savedState.currentProfile;
      state.importedData = savedState.importedData;
      state.profiles = savedState.profiles;
      localStorage.removeItem(identity.RESTORE_JOIN_PENDING_KEY);
    }
    if (thrownError) throw thrownError;

    outcomes.allConfigureSeedOutcomesReached = Object.keys(outcomes).length === 6;
    return outcomes;
  }, {
    configureUrl: moduleUrl('/js/sync-configure.js'),
  });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});

test('sync reconcile browser coverage exercises default dependency fallbacks', async ({ page }) => {
  await openBlankPage(page, '/sync-reconcile-defaults-browser-coverage');

  const results = await page.evaluate(async ({ reconcileUrl }) => {
    const [reconcile, payload, identity, syncState, stateModule] = await Promise.all([
      import(reconcileUrl),
      import('/js/sync-payload.js'),
      import('/js/sync-identity.js'),
      import('/js/sync-state.js'),
      import('/js/state.js'),
    ]);
    const { state } = stateModule;
    const outcomes = {};
    const profileId = 'reconcile-default-profile';
    const profileQuery = { name: 'profile-query' };
    const localImported = {
      lightDevices: [{ id: 'lamp-1', name: 'Local lamp', updatedAt: '2026-06-09T10:00:00.000Z' }],
    };
    const remoteImported = {
      lightDevices: [{ id: 'lamp-1', name: 'Remote lamp', updatedAt: '2026-06-08T10:00:00.000Z' }],
    };
    let rows = [];
    const evolu = { getQueryRows: () => rows };
    const savedState = {
      currentProfile: state.currentProfile,
      importedData: state.importedData,
      profiles: state.profiles,
    };
    const savedAiSettings = new Map(payload.AI_SETTINGS_KEYS.map(key => [key, localStorage.getItem(key)]));
    let thrownError = null;

    const rowFor = async importedData => ({
      profileId,
      syncedAt: new Date().toISOString(),
      dataJson: await payload.buildSyncPayload(profileId, importedData),
    });

    try {
      for (const key of payload.AI_SETTINGS_KEYS) localStorage.removeItem(key);
      localStorage.removeItem(identity.RESTORE_JOIN_PENDING_KEY);
      syncState.resetSyncStatus();
      state.currentProfile = profileId;
      state.importedData = localImported;
      state.profiles = [{
        id: profileId,
        name: 'Reconcile Defaults',
        status: 'active',
        tags: [],
        notes: '',
        createdAt: Date.now(),
        lastUpdated: Date.now(),
      }];

      await reconcile.reconcileLocalStorageWithEvolu();
      outcomes.defaultGetEvoluSkipsCleanly = true;

      reconcile.configureSyncReconcile({ getEvolu: () => evolu });
      await reconcile.reconcileLocalStorageWithEvolu();
      outcomes.defaultProfileQueryAndEnabledSkipCleanly = true;

      reconcile.configureSyncReconcile({
        getProfileQuery: () => profileQuery,
        isSyncEnabled: () => true,
      });
      rows = [await rowFor(localImported)];
      await reconcile.reconcileLocalStorageWithEvolu();
      outcomes.defaultDebugNoopsForMatchingRemote =
        !syncState.getRecentSyncEvents().some(event => event.kind === 'reconcile');

      rows = [await rowFor(remoteImported)];
      await reconcile.reconcileLocalStorageWithEvolu();
      outcomes.defaultPushAttemptedForDivergentRemote =
        syncState.getRecentSyncEvents().some(event => (
          event.kind === 'reconcile'
          && event.text.includes('local has unsynced rows')
        ));
    } catch (error) {
      thrownError = error;
    } finally {
      for (const [key, value] of savedAiSettings) {
        if (value === null) localStorage.removeItem(key);
        else localStorage.setItem(key, value);
      }
      localStorage.removeItem(identity.RESTORE_JOIN_PENDING_KEY);
      state.currentProfile = savedState.currentProfile;
      state.importedData = savedState.importedData;
      state.profiles = savedState.profiles;
    }
    if (thrownError) throw thrownError;

    outcomes.allReconcileDefaultOutcomesReached = Object.keys(outcomes).length === 4;
    return outcomes;
  }, {
    reconcileUrl: moduleUrl('/js/sync-reconcile.js'),
  });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});

test('sync recovery browser coverage exercises default dependency fallbacks', async ({ page }) => {
  await openBlankPage(page, '/sync-recovery-defaults-browser-coverage');

  const results = await page.evaluate(async ({ recoveryUrl }) => {
    const recovery = await import(recoveryUrl);
    const outcomes = {};
    const originalSetTimeout = window.setTimeout;
    const scheduled = [];
    let thrownError = null;

    const dispatchPersistedPageshow = () => {
      const event = new Event('pageshow');
      Object.defineProperty(event, 'persisted', { value: true });
      window.dispatchEvent(event);
    };

    try {
      recovery.bindSyncRecoveryEvents();
      dispatchPersistedPageshow();
      outcomes.defaultEnabledBlocksResumeKick = scheduled.length === 0;

      recovery.configureSyncRecovery({ isSyncEnabled: () => true });
      dispatchPersistedPageshow();
      outcomes.defaultReadyBlocksResumeKick = scheduled.length === 0;

      window.setTimeout = (fn, delay = 0) => {
        scheduled.push({ fn, delay });
        return scheduled.length;
      };
      recovery.configureSyncRecovery({ isEvoluReady: () => true });
      dispatchPersistedPageshow();
      outcomes.defaultDebugPushAndForceScheduleKick =
        scheduled.length === 1
        && scheduled[0].delay === 100;
      await scheduled[0].fn();

      window.dispatchEvent(new Event('offline'));
      window.dispatchEvent(new Event('online'));
      outcomes.defaultNotifyNoopsForNetworkEvents = true;
    } catch (error) {
      thrownError = error;
    } finally {
      window.setTimeout = originalSetTimeout;
    }
    if (thrownError) throw thrownError;

    outcomes.allRecoveryDefaultOutcomesReached = Object.keys(outcomes).length === 4;
    return outcomes;
  }, {
    recoveryUrl: moduleUrl('/js/sync-recovery.js'),
  });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});
