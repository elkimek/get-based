import { expect, test } from './coverage-fixture.js';

const moduleUrl = path => `${path}?syncLifecycleCoverage=${Date.now()}-${Math.random().toString(36).slice(2)}`;

async function openBlankPage(page, path) {
  await page.route(`**${path}`, route => route.fulfill({
    status: 200,
    contentType: 'text/html',
    body: '<!doctype html><html><body><div id="notification-container"></div><div id="sync-indicator-slot"></div></body></html>',
  }));
  await page.goto(path, { waitUntil: 'load' });
}

test('sync lifecycle browser coverage handles enable guards success and disable cleanup', async ({ page }) => {
  await openBlankPage(page, '/sync-lifecycle-browser-coverage');

  const results = await page.evaluate(async ({ lifecycleUrl }) => {
    const [lifecycle, runtime, settings, syncUi, syncState] = await Promise.all([
      import(lifecycleUrl),
      import('/js/sync-runtime.js'),
      import('/js/sync-settings-state.js'),
      import('/js/sync-ui.js'),
      import('/js/sync-state.js'),
    ]);
    const outcomes = {};
    const originalSetTimeout = window.setTimeout;
    const hadOwnLocks = Object.prototype.hasOwnProperty.call(navigator, 'locks');
    const ownLocksDescriptor = Object.getOwnPropertyDescriptor(navigator, 'locks');
    const cleanupKeys = [
      'profile-coverage-sync-ts',
      'profile-coverage-delta-snapshot',
      'profile-coverage-sync-cutover-v2',
      'profile-coverage-relay-bytes-owner',
      'labcharts-sync-restore-join-pending',
      'labcharts-relay-quota-warned',
    ];
    const notificationText = () => document.getElementById('notification-container')?.textContent || '';
    let thrownError = null;

    try {
      runtime.clearSyncRuntimeState();
      settings.setSyncEnabled(false, { persist: false });
      localStorage.removeItem(settings.SYNC_STORAGE_KEY);
      document.getElementById('notification-container').innerHTML = '';

      Object.defineProperty(navigator, 'locks', {
        configurable: true,
        value: undefined,
      });
      const blockedEnableResult = await lifecycle.enableSync();
      outcomes.enableGuardShowsUnsupportedNotification =
        blockedEnableResult === false
        && notificationText().includes('Sync unavailable in this browser: navigator.locks not available');
      outcomes.enableGuardDoesNotPersistEnabled = localStorage.getItem(settings.SYNC_STORAGE_KEY) === null;

      if (hadOwnLocks && ownLocksDescriptor) {
        Object.defineProperty(navigator, 'locks', ownLocksDescriptor);
      } else {
        delete navigator.locks;
      }

      document.getElementById('notification-container').innerHTML = '';
      document.getElementById('sync-indicator-slot').innerHTML = '';
      let queryLoaded = false;
      runtime.setSyncEvolu({ kind: 'stub-evolu' });
      runtime.setSyncAppOwner({ id: 'owner-coverage' });
      runtime.setSyncAppOwnerError('stale error');
      runtime.setSyncReadyPromise(Promise.resolve());
      runtime.setSyncQueryLoadedPromise(Promise.resolve().then(() => { queryLoaded = true; }));
      syncUi.configureSyncUI({ isSyncEnabled: settings.isSyncEnabled });
      const successfulEnableResult = await lifecycle.enableSync({ skipPush: true });

      outcomes.enableSuccessPersistsFlag = successfulEnableResult === true
        && localStorage.getItem(settings.SYNC_STORAGE_KEY) === 'true';
      outcomes.enableSuccessClearsOwnerError = runtime.getSyncAppOwnerError() === null;
      outcomes.enableSuccessWaitsForQueryLoaded = queryLoaded;
      outcomes.enableSuccessShowsToast = notificationText().includes('Sync enabled');
      outcomes.enableSuccessRendersIndicator =
        !!document.getElementById('sync-indicator-slot')?.querySelector('#sync-indicator-btn');

      settings.setSyncEnabled(false, { persist: false });
      localStorage.removeItem(settings.SYNC_STORAGE_KEY);
      document.getElementById('notification-container').innerHTML = '';
      document.getElementById('sync-indicator-slot').innerHTML = '';
      const provisionalEnableResult = await lifecycle.enableSync({ skipPush: true, persist: false });
      outcomes.provisionalEnableStaysMemoryOnlyAndSilent = provisionalEnableResult === true
        && settings.isSyncEnabled() === true
        && localStorage.getItem(settings.SYNC_STORAGE_KEY) === null
        && !notificationText().includes('Sync enabled')
        && document.getElementById('sync-indicator-slot')?.innerHTML === '';

      document.getElementById('notification-container').innerHTML = '';
      syncState.updateSyncStatus({ push: 'pending', pull: 'pulling', relay: 'unreachable' });
      for (const key of cleanupKeys) localStorage.setItem(key, 'delete-me');
      localStorage.setItem('coverage-keep-key', 'keep-me');
      let resetCalled = 0;
      runtime.setSyncEvolu({
        resetAppOwner(options) {
          if (options?.reload === false) resetCalled += 1;
          return Promise.resolve();
        },
      });
      runtime.setSyncQueries({
        profileQuery: { name: 'profiles' },
        tombstoneQuery: { name: 'tombstones' },
        itemRowQuery: { name: 'items' },
      });
      runtime.setSyncAppOwner({ id: 'owner-before-disable' });
      runtime.setSyncReadyPromise(Promise.resolve());
      runtime.setSyncQueryLoadedPromise(Promise.resolve());

      const scheduledDelays = [];
      window.setTimeout = (...args) => {
        const delay = args[1] ?? 0;
        scheduledDelays.push(delay);
        return Number(scheduledDelays.length);
      };
      await lifecycle.disableSync();

      outcomes.disablePersistsOff = localStorage.getItem(settings.SYNC_STORAGE_KEY) === 'false';
      outcomes.disableClearsTargetedStorage =
        cleanupKeys.every(key => localStorage.getItem(key) === null)
        && localStorage.getItem('coverage-keep-key') === 'keep-me';
      outcomes.disableResetsRuntime =
        runtime.getSyncEvolu() === null
        && runtime.getSyncProfileQuery() === null
        && runtime.getSyncAppOwner() === null;
      outcomes.disableCallsEvoluResetWithoutReload = resetCalled === 1;
      outcomes.disableResetsStatus =
        syncState.getSyncStatus().push === 'idle'
        && syncState.getSyncStatus().pull === 'idle'
        && syncState.getSyncStatus().relay === 'unknown';
      outcomes.disableClearsIndicator = document.getElementById('sync-indicator-slot')?.innerHTML === '';
      outcomes.disableShowsToast = notificationText().includes('Sync disabled');
      outcomes.disableSchedulesReload = scheduledDelays.includes(250);
    } catch (error) {
      thrownError = error;
    } finally {
      window.setTimeout = originalSetTimeout;
      runtime.clearSyncRuntimeState();
      settings.setSyncEnabled(false, { persist: false });
      localStorage.removeItem(settings.SYNC_STORAGE_KEY);
      localStorage.removeItem('coverage-keep-key');
      for (const key of cleanupKeys) localStorage.removeItem(key);
      if (hadOwnLocks && ownLocksDescriptor) {
        Object.defineProperty(navigator, 'locks', ownLocksDescriptor);
      } else {
        delete navigator.locks;
      }
    }
    if (thrownError) throw thrownError;

    outcomes.allLifecycleOutcomesReached = Object.keys(outcomes).length === 16;
    return outcomes;
  }, {
    lifecycleUrl: moduleUrl('/js/sync-lifecycle.js'),
  });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});

test('sync configure browser coverage wires module actions, UI, and relay quota notifications', async ({ page }) => {
  await openBlankPage(page, '/sync-configure-browser-coverage');

  const results = await page.evaluate(async ({ configureUrl }) => {
    const [configure, relayHealth, runtime, settings, syncUi, syncState, recovery] = await Promise.all([
      import(configureUrl),
      import('/js/sync-relay-health.js'),
      import('/js/sync-runtime.js'),
      import('/js/sync-settings-state.js'),
      import('/js/sync-ui.js'),
      import('/js/sync-state.js'),
      import('/js/sync-recovery.js'),
    ]);
    const outcomes = {};
    const originalSetTimeout = window.setTimeout;
    const notificationText = () => document.getElementById('notification-container')?.textContent || '';
    const enableAction = () => 'enabled';
    const ownerId = `configure-owner-${Date.now()}`;
    const ownerWarnKey = `labcharts-${ownerId}-relay-quota-warned`;
    let thrownError = null;

    try {
      runtime.clearSyncRuntimeState();
      syncState.resetSyncStatus();
      localStorage.removeItem(ownerWarnKey);
      document.getElementById('notification-container').innerHTML = '';
      configure.configureSyncModules({
        enableSync: enableAction,
      });

      outcomes.configureKeepsLifecycleActionsModuleOnly =
        !('enableSync' in window)
        && !('disableSync' in window)
        && !('showSyncDiagnose' in window)
        && !('getDeltaTelemetry' in window);

      settings.setSyncEnabled(true, { persist: false });
      syncUi.renderSyncIndicator();
      outcomes.configureWiresSyncUiEnabledState =
        !!document.getElementById('sync-indicator-slot')?.querySelector('#sync-indicator-btn');

      runtime.setSyncAppOwner({ id: ownerId });
      relayHealth.trackPushBytes(Math.ceil(relayHealth.RELAY_OWNER_QUOTA_BYTES * 0.81));
      outcomes.configureAmberQuotaNotification =
        localStorage.getItem(ownerWarnKey) === 'amber'
        && notificationText().includes('Relay storage is 81% full')
        && notificationText().includes('Reduce storage');

      relayHealth.trackPushBytes(Math.ceil(relayHealth.RELAY_OWNER_QUOTA_BYTES * 0.15));
      const events = syncState.getRecentSyncEvents();
      outcomes.configureRedQuotaLogsAndNotifies =
        localStorage.getItem(ownerWarnKey) === 'red'
        && notificationText().includes('Relay storage is 96% full')
        && events.some(event => event.kind === 'skip' && event.text.includes('Relay storage 96%'));

      document.getElementById('notification-container').innerHTML = '';
      const scheduledDelays = [];
      localStorage.setItem('labcharts-debug', 'true');
      runtime.setSyncEvolu({ kind: 'ready-for-recovery' });
      window.setTimeout = (...args) => {
        const delay = args[1] ?? 0;
        scheduledDelays.push(delay);
        return Number(scheduledDelays.length);
      };
      recovery.bindSyncRecoveryEvents();
      window.dispatchEvent(new Event('offline'));
      window.dispatchEvent(new Event('online'));
      outcomes.configureRecoveryNotifyWrapperShowsNetworkToasts =
        notificationText().includes('Offline')
        && notificationText().includes('Back online');
      outcomes.configureDebugRecoveryPathSchedulesKick = scheduledDelays.includes(100);
    } catch (error) {
      thrownError = error;
    } finally {
      window.setTimeout = originalSetTimeout;
      runtime.clearSyncRuntimeState();
      settings.setSyncEnabled(false, { persist: false });
      localStorage.removeItem('labcharts-debug');
      localStorage.removeItem(settings.SYNC_STORAGE_KEY);
      localStorage.removeItem(ownerWarnKey);
      localStorage.removeItem(`labcharts-relay-bytes-${ownerId}`);
      localStorage.removeItem(`labcharts-relay-cap-${ownerId}`);
    }
    if (thrownError) throw thrownError;

    outcomes.allConfigureOutcomesReached = Object.keys(outcomes).length === 6;
    return outcomes;
  }, {
    configureUrl: moduleUrl('/js/sync-configure.js'),
  });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});

test('sync relay health browser coverage handles default owner reset and verdict snapshots', async ({ page }) => {
  await openBlankPage(page, '/sync-relay-health-browser-coverage');

  const results = await page.evaluate(async ({ relayUrl }) => {
    const relayHealth = await import(relayUrl);
    const outcomes = {};
    const ownerId = `relay-health-owner-${Date.now()}`;
    const relayBytesKey = `labcharts-relay-bytes-${ownerId}`;
    const originalRelayBytes = localStorage.getItem(relayBytesKey);
    let thrownError = null;

    try {
      localStorage.removeItem(relayBytesKey);

      const defaultEstimate = relayHealth.getRelayQuotaEstimate();
      const defaultReset = relayHealth.resetRelayQuotaEstimate();
      outcomes.defaultOwnerDependencyReturnsEmptyState =
        defaultEstimate === null
        && defaultReset === false;

      relayHealth.configureRelayHealth({
        getAppOwner: () => ({ id: ownerId, writeKey: new Uint8Array([1, 2, 3, 4]) }),
        getSyncRelay: () => 'wss://relay.example.test',
      });

      relayHealth.trackPushBytes(4096);
      const beforeReset = relayHealth.getRelayQuotaEstimate();
      const didReset = relayHealth.resetRelayQuotaEstimate();
      const afterReset = relayHealth.getRelayQuotaEstimate();
      outcomes.resetRelayQuotaEstimateClearsOwnerScopedBytes =
        beforeReset?.bytes === 4096
        && localStorage.getItem(relayBytesKey) === null
        && didReset === true
        && afterReset?.bytes === 0;

      const firstVerdict = relayHealth.getRelayHealthVerdict();
      firstVerdict.verdict = 'mutated';
      const secondVerdict = relayHealth.getRelayHealthVerdict();
      outcomes.getRelayHealthVerdictReturnsStableCopy =
        secondVerdict.verdict === 'unknown'
        && secondVerdict.reason === null
        && typeof secondVerdict.at === 'number';
    } catch (error) {
      thrownError = error;
    } finally {
      if (originalRelayBytes == null) localStorage.removeItem(relayBytesKey);
      else localStorage.setItem(relayBytesKey, originalRelayBytes);
    }
    if (thrownError) throw thrownError;

    outcomes.allRelayHealthOutcomesReached = Object.keys(outcomes).length === 3;
    return outcomes;
  }, {
    relayUrl: moduleUrl('/js/sync-relay-health.js'),
  });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});
