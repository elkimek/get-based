import { expect, test } from './coverage-fixture.js';

function moduleUrl(path) {
  return `${path}?syncOrchestrationCoverage=${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

test('sync recovery events throttle resume pulls and notify network changes', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });
  await page.waitForSelector('#notification-container', { state: 'attached' });

  const results = await page.evaluate(async ({ recoveryUrl }) => {
    const recovery = await import(recoveryUrl);
    const calls = [];
    const outcomes = {};
    const original = {
      now: Date.now,
      setTimeout: window.setTimeout,
      clearTimeout: window.clearTimeout,
    };
    let now = 1_000_000;
    let visibleState = 'hidden';
    let enabled = true;
    let ready = false;
    const pushCount = () => calls.filter(call => call === 'push').length;
    const pullCount = () => calls.filter(call => call === 'pull').length;
    const notifyCount = () => calls.filter(call => call.startsWith('notify:')).length;
    const pageShow = persisted => {
      const event = new Event('pageshow');
      Object.defineProperty(event, 'persisted', { configurable: true, value: persisted });
      window.dispatchEvent(event);
    };

    try {
      Date.now = () => now;
      window.setTimeout = (fn) => {
        fn();
        return 1;
      };
      window.clearTimeout = () => {};
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: () => visibleState,
      });

      recovery.configureSyncRecovery({
        isSyncEnabled: () => enabled,
        isEvoluReady: () => ready,
        pushCurrentProfile: async () => { calls.push('push'); },
        forcePull: () => { calls.push('pull'); },
        debug: message => { calls.push(`debug:${message}`); },
        notify: (message, type, duration) => { calls.push(`notify:${type}:${duration}:${message}`); },
      });
      recovery.bindSyncRecoveryEvents();
      recovery.bindSyncRecoveryEvents();

      visibleState = 'visible';
      document.dispatchEvent(new Event('visibilitychange'));
      outcomes.gatesUntilReady = calls.length === 0;

      ready = true;
      document.dispatchEvent(new Event('visibilitychange'));
      outcomes.visibilityResumeKicksOnce = pushCount() === 1
        && pullCount() === 1
        && calls.some(call => call === 'debug:Tab resume (visibilitychange) - kicking syncNow');

      document.dispatchEvent(new Event('visibilitychange'));
      outcomes.throttlesRepeatedVisibility = pushCount() === 1 && pullCount() === 1;

      now += 31_000;
      pageShow(false);
      outcomes.ignoresNonPersistedPageShow = pushCount() === 1 && pullCount() === 1;

      pageShow(true);
      outcomes.persistedPageShowKicksAfterThrottle = pushCount() === 2
        && pullCount() === 2
        && calls.some(call => call === 'debug:Tab resume (pageshow-persisted) - kicking syncNow');

      window.dispatchEvent(new Event('offline'));
      outcomes.offlineNotifies = notifyCount() === 1
        && calls.some(call => call.includes('notify:info:5000:Offline'));

      now += 31_000;
      window.dispatchEvent(new Event('online'));
      outcomes.onlineKicksAndNotifies = pushCount() === 3
        && pullCount() === 3
        && calls.some(call => call.includes('notify:success:3000:Back online'));

      enabled = false;
      window.dispatchEvent(new Event('offline'));
      now += 31_000;
      window.dispatchEvent(new Event('online'));
      outcomes.disabledOnlineDoesNotKick = pushCount() === 3
        && pullCount() === 3
        && notifyCount() === 4;
    } finally {
      Date.now = original.now;
      window.setTimeout = original.setTimeout;
      window.clearTimeout = original.clearTimeout;
      delete document.visibilityState;
    }

    return outcomes;
  }, {
    recoveryUrl: moduleUrl('/js/sync-recovery.js'),
  });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});

test('sync pull browser force paths update status and skip unsafe rows', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });
  await page.waitForSelector('#notification-container', { state: 'attached' });

  const results = await page.evaluate(async ({ pullUrl, stateUrl, tombstonesUrl, payloadUrl }) => {
    const pull = await import(pullUrl);
    const syncState = await import(stateUrl);
    const tombstones = await import(tombstonesUrl);
    const payload = await import(payloadUrl);
    const outcomes = {};
    const warnings = [];
    const debugCalls = [];
    const originalWarn = console.warn;
    const queryToken = { name: 'profiles' };
    const rows = [];
    const evolu = {
      getQueryRows(query) {
        debugCalls.push(query === queryToken ? 'query:expected' : 'query:unexpected');
        return rows;
      },
    };
    const debug = (...args) => {
      debugCalls.push(args.map(String).join(' '));
    };

    try {
      console.warn = (...args) => { warnings.push(args.map(String).join(' ')); };
      localStorage.removeItem('labcharts-sync-hash-v2-migrated');
      syncState.resetSyncStatus();
      tombstones.configureSyncTombstones({
        getEvolu: () => null,
        getTombstoneQuery: () => null,
        isSyncEnabled: () => false,
      });

      pull.configureSyncPull({
        getEvolu: () => null,
        getProfileQuery: () => null,
        debug,
      });
      outcomes.forcePullWarnsWithoutDeps = pull.forcePull() === undefined
        && warnings.some(message => message.includes('Cannot force pull'));

      pull.configureSyncPull({
        getEvolu: () => evolu,
        getProfileQuery: () => queryToken,
        isSyncPushInFlight: () => false,
        pushProfile: async profileId => { debugCalls.push(`push:${profileId}`); },
        debug,
      });
      rows.length = 0;
      await pull.forcePull();
      const emptyStatus = syncState.getSyncStatus();
      outcomes.emptyRowsPullUpdatesStatus = emptyStatus.pull === 'received'
        && typeof emptyStatus.pullReceivedAt === 'number'
        && pull.isSyncPulling() === false
        && debugCalls.includes('Force pull triggered')
        && debugCalls.includes('onSyncReceived: 0 rows')
        && debugCalls.includes('query:expected');

      const restoredProfileId = 'restored_profile';
      const restorePendingKey = 'labcharts-sync-backup-restore-pending';
      const preflightOrder = [];
      localStorage.setItem(restorePendingKey, JSON.stringify([restoredProfileId]));
      pull.configureSyncPull({
        getEvolu: () => ({
          getQueryRows() {
            preflightOrder.push('query');
            return [];
          },
        }),
        getProfileQuery: () => queryToken,
        pushProfilesById: async (profileIds, options) => {
          preflightOrder.push(`restore:${profileIds.join(',')}:${options?.force === true}`);
          return { total: 1, succeeded: 1, failed: 0, skipped: 0 };
        },
        pushDirtyProfiles: async options => {
          preflightOrder.push(`dirty:${options?.force === true}`);
          return { total: 0, succeeded: 0, failed: 0, skipped: 0 };
        },
        debug,
      });
      await pull.onSyncReceived();
      outcomes.restoreRepublishesBeforeReadingRelayRows =
        preflightOrder.join('|') === `restore:${restoredProfileId}:true|dirty:true|query`
        && localStorage.getItem(restorePendingKey) === null;

      pull.configureSyncPull({
        getEvolu: () => evolu,
        getProfileQuery: () => queryToken,
        isSyncPushInFlight: () => false,
        pushProfile: async profileId => { debugCalls.push(`push:${profileId}`); },
        pushProfilesById: async () => ({ total: 0, succeeded: 0, failed: 0, skipped: 0 }),
        pushDirtyProfiles: async () => ({ total: 0, succeeded: 0, failed: 0, skipped: 0 }),
        debug,
      });

      rows.splice(
        0,
        rows.length,
        {
          profileId: 'bad id',
          syncedAt: new Date().toISOString(),
          dataJson: await payload.buildSyncPayload('bad id', { entries: [] }),
        },
        {
          profileId: 'safe_profile',
          syncedAt: new Date().toISOString(),
          dataJson: await payload.buildSyncPayload('safe_profile', 'bad-shape'),
        }
      );
      debugCalls.length = 0;
      const firstPull = pull.onSyncReceived();
      await pull.onSyncReceived();
      await firstPull;
      const events = syncState.getRecentSyncEvents();
      outcomes.alreadyPullingSkipsConcurrentCall = debugCalls.some(message => message.includes('already pulling'));
      outcomes.unsafeAndMalformedRowsAreSkipped = events.some(event => event.kind === 'skip'
        && event.text.includes('malformed importedData shape'))
        && !localStorage.getItem('labcharts-bad id-sync-ts')
        && !localStorage.getItem('labcharts-safe_profile-sync-ts')
        && pull.isSyncPulling() === false;

      pull.clearSyncPullTimers();
      outcomes.clearTimersLeavesPullIdle = pull.isSyncPulling() === false;
    } finally {
      console.warn = originalWarn;
      pull.clearSyncPullTimers();
      syncState.resetSyncStatus();
      localStorage.removeItem('labcharts-bad id-sync-ts');
      localStorage.removeItem('labcharts-safe_profile-sync-ts');
      localStorage.removeItem('labcharts-sync-hash-v2-migrated');
      localStorage.removeItem('labcharts-sync-backup-restore-pending');
    }

    return outcomes;
  }, {
    pullUrl: moduleUrl('/js/sync-pull.js'),
    stateUrl: '/js/sync-state.js',
    tombstonesUrl: '/js/sync-tombstones.js',
    payloadUrl: '/js/sync-payload.js',
  });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});

test('sync context defaults and pull retry cover unconfigured browser paths', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });
  await page.waitForSelector('#notification-container', { state: 'attached' });

  const results = await page.evaluate(async ({
    plannerContextUrl,
    diagnosticsContextUrl,
    actionContextUrl,
    pullUrl,
    tombstonesUrl,
    syncDeltaUrl,
    syncStateUrl,
    stateUrl,
    profileUrl,
    cryptoUrl,
  }) => {
    const [
      plannerContext,
      diagnosticsContext,
      actionContext,
      pull,
      tombstones,
      syncDelta,
      syncState,
      { state },
      profileStore,
      cryptoStore,
    ] = await Promise.all([
      import(plannerContextUrl),
      import(diagnosticsContextUrl),
      import(actionContextUrl),
      import(pullUrl),
      import(tombstonesUrl),
      import(syncDeltaUrl),
      import(syncStateUrl),
      import(stateUrl),
      import(profileUrl),
      import(cryptoUrl),
    ]);
    const outcomes = {};
    const profileId = `sync_pull_retry_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const importedKey = profileStore.profileStorageKey(profileId, 'imported');
    const queryToken = { name: 'profiles' };
    const rows = [];
    const debugCalls = [];
    const warnings = [];
    const timers = [];
    const original = {
      currentProfile: state.currentProfile,
      importedData: state.importedData,
      warn: console.warn,
      setTimeout: window.setTimeout,
      clearTimeout: window.clearTimeout,
      chatLock: sessionStorage.getItem('labcharts-chat-local-lock-until'),
    };
    let nextTimerId = 1;
    const waitForPullIdle = async () => {
      for (let i = 0; i < 20 && pull.isSyncPulling(); i += 1) {
        await Promise.resolve();
      }
      return pull.isSyncPulling() === false;
    };

    try {
      outcomes.plannerDefaultsReturnNoRows =
        Array.isArray(plannerContext.getPlannerItemRows(profileId, 'entries'))
        && plannerContext.getPlannerItemRows(profileId, 'entries').length === 0;
      outcomes.diagnosticsDefaultsAreSafe =
        diagnosticsContext.currentDiagnosticEvolu() === null
        && diagnosticsContext.currentDiagnosticProfileQuery() === null
        && diagnosticsContext.currentDiagnosticTombstoneQuery() === null
        && diagnosticsContext.currentDiagnosticAppOwner() === null
        && diagnosticsContext.currentDiagnosticSyncEnabled() === false
        && diagnosticsContext.currentDiagnosticSubscriptionFireCount() === 0
        && diagnosticsContext.currentDiagnosticSyncing() === false
        && diagnosticsContext.currentDiagnosticPulling() === false;
      const defaultEnable = await actionContext.enableSyncForDiagnose({});
      const defaultRestore = await actionContext.restoreMnemonicForDiagnose('words');
      const defaultPush = await actionContext.pushProfileForDiagnose(profileId);
      const defaultPhase2 = actionContext.enablePhase2CutoverForDiagnose(profileId);
      const defaultDisablePhase2 = actionContext.disablePhase2CutoverForDiagnose(profileId);
      const defaultShowDiagnose = await actionContext.showSyncDiagnoseForActions();
      outcomes.actionDefaultsAreCallable =
        actionContext.currentSyncEnabled() === false
        && defaultEnable === false
        && defaultRestore === false
        && defaultPush === undefined
        && defaultPhase2?.ok === false
        && defaultPhase2?.reason === 'unconfigured'
        && defaultDisablePhase2 === false
        && defaultShowDiagnose === undefined;

      console.warn = (...args) => { warnings.push(args.map(String).join(' ')); };
      await pull.onSyncReceived();
      const defaultForce = pull.forcePull();
      outcomes.pullDefaultsSkipAndWarn = defaultForce === undefined
        && pull.isSyncPulling() === false
        && warnings.some(message => message.includes('Cannot force pull'));

      window.setTimeout = (fn, ms) => {
        const id = nextTimerId++;
        timers.push({ id, fn, ms, cleared: false });
        return id;
      };
      window.clearTimeout = id => {
        const timer = timers.find(item => item.id === id);
        if (timer) timer.cleared = true;
      };

      state.currentProfile = profileId;
      const localEntryDate = new Date().toISOString().slice(0, 10);
      state.importedData = {
        entries: [{ date: localEntryDate, markers: { 'coverage.local': 1 } }],
      };
      sessionStorage.setItem('labcharts-chat-local-lock-until', String(Date.now() + 30_000));
      await cryptoStore.encryptedRemoveItem(importedKey);
      localStorage.removeItem(`labcharts-${profileId}-sync-ts`);
      localStorage.removeItem(`labcharts-${profileId}-chat-threads`);
      syncState.resetSyncStatus();
      tombstones.configureSyncTombstones({
        getEvolu: () => null,
        getTombstoneQuery: () => null,
        isSyncEnabled: () => false,
      });
      syncDelta.configureSyncDelta({
        getEvolu: () => ({ getQueryRows: () => [] }),
        getItemRowQuery: () => ({}),
      });
      rows.push({
        profileId,
        syncedAt: new Date().toISOString(),
        dataJson: JSON.stringify({
          _v: 3,
          importedData: { entries: [] },
          profile: null,
          chatData: { threads: 'not-array' },
        }),
      });
      pull.configureSyncPull({
        getEvolu: () => ({
          getQueryRows(query) {
            return query === queryToken ? rows : [];
          },
        }),
        getProfileQuery: () => queryToken,
        debug: (...args) => { debugCalls.push(args.map(String).join(' ')); },
      });

      await pull.onSyncReceived();
      const rebroadcastTimer = timers.find(timer => timer.ms === 100 && !timer.cleared);
      const chatRetryTimer = timers.find(timer => timer.ms >= 1000 && !timer.cleared);
      outcomes.pullSchedulesRebroadcastAndChatRetry =
        !!rebroadcastTimer
        && !!chatRetryTimer
        && debugCalls.some(message => message.includes('rebroadcast'))
        && localStorage.getItem(`labcharts-${profileId}-sync-ts`) !== null
        && pull.isSyncPulling() === false;

      const timersBeforeRetry = timers.length;
      rebroadcastTimer?.fn();
      rows.length = 0;
      chatRetryTimer?.fn();
      const retryPullIdle = await waitForPullIdle();
      outcomes.pullRetryTimerCompletesCleanlyWithEmptyRows =
        timers.length === timersBeforeRetry
        && debugCalls.some(message => message.includes('Retrying chat pull'))
        && retryPullIdle;
    } finally {
      console.warn = original.warn;
      pull.clearSyncPullTimers();
      syncState.resetSyncStatus();
      tombstones.configureSyncTombstones({
        getEvolu: () => null,
        getTombstoneQuery: () => null,
        isSyncEnabled: () => false,
      });
      syncDelta.configureSyncDelta({
        getEvolu: () => null,
        getItemRowQuery: () => null,
      });
      state.currentProfile = original.currentProfile;
      state.importedData = original.importedData;
      if (original.chatLock == null) sessionStorage.removeItem('labcharts-chat-local-lock-until');
      else sessionStorage.setItem('labcharts-chat-local-lock-until', original.chatLock);
      window.setTimeout = original.setTimeout;
      window.clearTimeout = original.clearTimeout;
      localStorage.removeItem(`labcharts-${profileId}-sync-ts`);
      localStorage.removeItem(`labcharts-${profileId}-chat-threads`);
      await cryptoStore.encryptedRemoveItem(importedKey);
    }

    return outcomes;
  }, {
    plannerContextUrl: moduleUrl('/js/sync-delta-planner-context.js'),
    diagnosticsContextUrl: moduleUrl('/js/sync-diagnostics-context.js'),
    actionContextUrl: moduleUrl('/js/sync-diagnose-actions-context.js'),
    pullUrl: moduleUrl('/js/sync-pull.js'),
    tombstonesUrl: '/js/sync-tombstones.js',
    syncDeltaUrl: '/js/sync-delta.js',
    syncStateUrl: '/js/sync-state.js',
    stateUrl: '/js/state.js',
    profileUrl: '/js/profile.js',
    cryptoUrl: '/js/crypto.js',
  });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});

test('sync subscriptions browser coverage handles deferred receives and relay health', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });
  await page.waitForSelector('#notification-container', { state: 'attached' });

  const results = await page.evaluate(async ({ subscriptionsUrl }) => {
    const subscriptions = await import(subscriptionsUrl);
    const outcomes = {};
    const receives = [];
    const statusUpdates = [];
    const debugCalls = [];
    const callbacks = new Map();
    const intervals = [];
    const timeouts = [];
    const original = {
      setInterval: window.setInterval,
      clearInterval: window.clearInterval,
      setTimeout: window.setTimeout,
      clearTimeout: window.clearTimeout,
    };
    const profileQuery = { name: 'profile' };
    const tombstoneQuery = { name: 'tombstones' };
    const itemRowQuery = { name: 'itemRows' };
    let profileRows = [{ id: 'row-1', profileId: 'profile-a', syncedAt: '2026-06-08T10:00:00.000Z' }];
    let tombstoneRows = [];
    let syncing = false;
    let pulling = false;
    let relayOk = true;
    let relayError = null;
    let errorCallback = null;

    const flushMicrotasks = async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    };

    try {
      window.setInterval = (fn, ms) => {
        const id = intervals.length + 1;
        intervals.push({ id, fn, ms, cleared: false });
        return id;
      };
      window.clearInterval = (id) => {
        const timer = intervals.find(item => item.id === id);
        if (timer) timer.cleared = true;
      };
      window.setTimeout = (fn, ms) => {
        const id = 100 + timeouts.length;
        timeouts.push({ id, fn, ms, cleared: false });
        return id;
      };
      window.clearTimeout = (id) => {
        const timer = timeouts.find(item => item.id === id);
        if (timer) timer.cleared = true;
      };

      subscriptions.configureSyncSubscriptions({
        isSyncing: () => syncing,
        isPulling: () => pulling,
        onSyncReceived: () => { receives.push('receive'); },
        checkRelayConnection: async () => {
          if (relayError) throw relayError;
          return relayOk;
        },
        updateSyncStatus: partial => { statusUpdates.push(partial); },
        debug: (...args) => { debugCalls.push(args.map(String).join(' ')); },
      });
      subscriptions.clearSyncSubscriptionTimers();
      subscriptions.bindSyncSubscriptions({});
      outcomes.missingDependenciesDoNotSubscribe = intervals.length === 0
        && subscriptions.getSyncSubscriptionFireCount() === 0;

      const evolu = {
        subscribeQuery(query) {
          return callback => {
            callbacks.set(query.name, callback);
            return () => {};
          };
        },
        getQueryRows(query) {
          if (query === profileQuery) return profileRows;
          if (query === tombstoneQuery) return tombstoneRows;
          return [];
        },
        subscribeError(callback) {
          errorCallback = callback;
          return () => {};
        },
      };

      subscriptions.bindSyncSubscriptions({ evolu, profileQuery, tombstoneQuery, itemRowQuery });
      callbacks.get('profile')();
      outcomes.profileSubscriptionReceivesImmediately = receives.length === 1
        && subscriptions.getSyncSubscriptionFireCount() === 1
        && debugCalls.some(message => message.includes('subscription fired (#1)'));

      syncing = true;
      callbacks.get('tombstones')();
      callbacks.get('itemRows')();
      outcomes.deferredReceivesScheduleSingleRetry = receives.length === 1
        && timeouts.filter(timer => timer.ms === 500 && !timer.cleared).length === 1
        && debugCalls.some(message => message.includes('tombstone subscription: receive deferred'));

      syncing = false;
      timeouts[0].fn();
      outcomes.deferredRetryReceivesWhenIdle = receives.length === 2;

      const pollInterval = intervals.find(timer => timer.ms === 30000);
      profileRows = [{ id: 'row-1', profileId: 'profile-a', syncedAt: '2026-06-08T10:01:00.000Z' }];
      pollInterval.fn();
      const receiveCountAfterPoll = receives.length;
      pollInterval.fn();
      outcomes.pollSignatureChangeReceivesOnce = receiveCountAfterPoll === 3
        && receives.length === 3
        && debugCalls.some(message => message.includes('poll: row signature changed'));

      errorCallback(null);
      errorCallback({ type: 'WebSocketClosed' });
      outcomes.websocketErrorsMarkRelayUnreachable = statusUpdates.some(update => update.relay === 'unreachable'
        && update.lastError?.type === 'WebSocketClosed');

      subscriptions.startRelayProbe();
      await flushMicrotasks();
      outcomes.relayProbeMarksConnected = statusUpdates.some(update => update.relay === 'connected'
        && typeof update.relayCheckedAt === 'number');

      relayOk = false;
      const relayInterval = intervals.find(timer => timer.ms === 60000);
      relayInterval.fn();
      await flushMicrotasks();
      outcomes.relayIntervalMarksUnreachable = statusUpdates.some(update => update.relay === 'unreachable'
        && typeof update.relayCheckedAt === 'number'
        && !update.lastError);

      relayError = new Error('probe failed');
      relayInterval.fn();
      await flushMicrotasks();
      outcomes.relayProbeErrorsCarryLastError = statusUpdates.some(update => update.relay === 'unreachable'
        && update.lastError?.type === 'RelayProbeError'
        && update.lastError?.message === 'probe failed');

      subscriptions.clearSyncSubscriptionTimers();
      outcomes.clearTimersResetsCounters = subscriptions.getSyncSubscriptionFireCount() === 0
        && pollInterval.cleared === true
        && relayInterval.cleared === true;
    } finally {
      subscriptions.clearSyncSubscriptionTimers();
      subscriptions.configureSyncSubscriptions({
        isSyncing: () => false,
        isPulling: () => false,
        onSyncReceived: () => {},
        checkRelayConnection: async () => false,
        updateSyncStatus: () => {},
        debug: () => {},
      });
      window.setInterval = original.setInterval;
      window.clearInterval = original.clearInterval;
      window.setTimeout = original.setTimeout;
      window.clearTimeout = original.clearTimeout;
    }

    return outcomes;
  }, {
    subscriptionsUrl: moduleUrl('/js/sync-subscriptions.js'),
  });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});

test('sync subscriptions browser coverage exercises default dependency no-ops', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });
  await page.waitForSelector('#notification-container', { state: 'attached' });

  const results = await page.evaluate(async ({ subscriptionsUrl }) => {
    const subscriptions = await import(subscriptionsUrl);
    const outcomes = {};
    const callbacks = new Map();
    const intervals = [];
    const original = {
      setInterval: window.setInterval,
      clearInterval: window.clearInterval,
    };
    const profileQuery = { name: 'profile-defaults' };
    const tombstoneQuery = { name: 'tombstones-defaults' };
    const itemRowQuery = { name: 'itemRows-defaults' };
    let errorCallback = null;

    try {
      window.setInterval = (fn, ms) => {
        const id = intervals.length + 1;
        intervals.push({ id, fn, ms, cleared: false });
        return id;
      };
      window.clearInterval = (id) => {
        const timer = intervals.find(item => item.id === id);
        if (timer) timer.cleared = true;
      };

      subscriptions.clearSyncSubscriptionTimers();
      const evolu = {
        subscribeQuery(query) {
          return callback => {
            callbacks.set(query.name, callback);
            return () => {};
          };
        },
        getQueryRows() {
          return [];
        },
        subscribeError(callback) {
          errorCallback = callback;
          return () => {};
        },
      };

      subscriptions.bindSyncSubscriptions({ evolu, profileQuery, tombstoneQuery, itemRowQuery });
      callbacks.get('profile-defaults')?.();
      callbacks.get('tombstones-defaults')?.();
      callbacks.get('itemRows-defaults')?.();
      errorCallback?.({ type: 'IgnoredDefaultError' });

      outcomes.defaultCallbacksDoNotThrow =
        subscriptions.getSyncSubscriptionFireCount() === 1
        && callbacks.size === 3
        && intervals.some(timer => timer.ms === 30000 && !timer.cleared);

      subscriptions.clearSyncSubscriptionTimers();
      outcomes.defaultTimersClear =
        subscriptions.getSyncSubscriptionFireCount() === 0
        && intervals.every(timer => timer.cleared);
    } finally {
      subscriptions.clearSyncSubscriptionTimers();
      window.setInterval = original.setInterval;
      window.clearInterval = original.clearInterval;
    }

    return outcomes;
  }, {
    subscriptionsUrl: moduleUrl('/js/sync-subscriptions.js'),
  });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});

test('sync reconcile browser coverage force-pushes divergent startup state', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });
  await page.waitForSelector('#notification-container', { state: 'attached' });

  const results = await page.evaluate(async ({
    reconcileUrl,
    payloadUrl,
    collectorsUrl,
    identityUrl,
    profileUrl,
    stateUrl,
  }) => {
    const [reconcile, payload, collectors, identity, profile, stateModule] = await Promise.all([
      import(reconcileUrl),
      import(payloadUrl),
      import(collectorsUrl),
      import(identityUrl),
      import(profileUrl),
      import(stateUrl),
    ]);
    const { state } = stateModule;
    const outcomes = {};
    const pushes = [];
    const debugCalls = [];
    const profileId = `sync_reconcile_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const profileQuery = { name: 'profiles' };
    let rows = [];
    let enabled = true;
    const storageKeys = [
      ...collectors.AI_SETTINGS_KEYS,
      identity.RESTORE_JOIN_PENDING_KEY,
      `labcharts-${profileId}-sync-cutover-v2`,
    ];
    const savedStorage = storageKeys.map(key => [key, localStorage.getItem(key)]);
    const savedState = {
      currentProfile: state.currentProfile,
      importedData: state.importedData,
      profiles: state.profiles,
    };
    const evolu = {
      getQueryRows(query) {
        return query === profileQuery ? rows : [];
      },
    };
    const resetCalls = () => {
      pushes.length = 0;
      debugCalls.length = 0;
    };
    const clearAiSettings = () => {
      for (const key of collectors.AI_SETTINGS_KEYS) localStorage.removeItem(key);
    };
    const profileData = devices => ({
      ...profile.createDefaultProfileData(),
      lightDevices: devices,
    });
    const rowFor = async (importedData, aiProvider = 'same-provider') => {
      clearAiSettings();
      localStorage.setItem('labcharts-ai-provider', aiProvider);
      return {
        profileId,
        syncedAt: new Date().toISOString(),
        dataJson: await payload.buildSyncPayload(profileId, importedData),
      };
    };

    try {
      state.currentProfile = profileId;
      state.profiles = [{
        id: profileId,
        name: 'Sync Reconcile',
        sex: null,
        dob: null,
        location: { country: '', zip: '' },
        tags: [],
        notes: '',
        status: 'active',
        avatar: null,
        height: null,
        heightUnit: 'cm',
        createdAt: Date.now(),
        lastUpdated: Date.now(),
        pinned: false,
      }];
      state.importedData = profileData([
        { id: 'lamp-1', name: 'Local lamp', updatedAt: '2026-06-08T10:00:00.000Z' },
      ]);
      clearAiSettings();
      localStorage.removeItem(identity.RESTORE_JOIN_PENDING_KEY);
      reconcile.configureSyncReconcile({
        getEvolu: () => evolu,
        getProfileQuery: () => profileQuery,
        isSyncEnabled: () => enabled,
        pushProfile: async (pushedProfileId, importedData, options) => {
          pushes.push({ profileId: pushedProfileId, importedData, options });
        },
        debug: (...args) => { debugCalls.push(args.map(String).join(' ')); },
      });

      enabled = false;
      await reconcile.reconcileLocalStorageWithEvolu();
      outcomes.disabledSyncSkips = pushes.length === 0;

      enabled = true;
      rows = [];
      await reconcile.reconcileLocalStorageWithEvolu();
      outcomes.missingRemoteRowSkips = pushes.length === 0;

      rows = [{ profileId, syncedAt: new Date().toISOString(), dataJson: '{bad json' }];
      await reconcile.reconcileLocalStorageWithEvolu();
      outcomes.malformedRemotePayloadSkips = pushes.length === 0;

      rows = [await rowFor(state.importedData)];
      await reconcile.reconcileLocalStorageWithEvolu();
      outcomes.matchingRemotePayloadSkips = pushes.length === 0
        && debugCalls.some(message => message.includes('nothing to do'));

      resetCalls();
      rows = [await rowFor(profileData([
        { id: 'lamp-1', name: 'Remote lamp', updatedAt: '2026-06-07T10:00:00.000Z' },
      ]))];
      await reconcile.reconcileLocalStorageWithEvolu();
      outcomes.newerLocalRowsForcePush = pushes.length === 1
        && pushes[0].profileId === profileId
        && pushes[0].importedData === state.importedData
        && pushes[0].options?.force === true
        && debugCalls.some(message => message.includes('unsynced rows'));

      resetCalls();
      rows = [await rowFor(state.importedData, 'remote-provider')];
      localStorage.setItem('labcharts-ai-provider', 'local-provider');
      await reconcile.reconcileLocalStorageWithEvolu();
      outcomes.newerLocalAiSettingsForcePush = pushes.length === 1
        && pushes[0].profileId === profileId
        && pushes[0].options?.force === true
        && debugCalls.some(message => message.includes('newer local AI settings'));

      resetCalls();
      localStorage.setItem(identity.RESTORE_JOIN_PENDING_KEY, String(Date.now()));
      rows = [await rowFor(profileData([
        { id: 'lamp-1', name: 'Remote lamp', updatedAt: '2026-06-07T10:00:00.000Z' },
      ]))];
      await reconcile.reconcileLocalStorageWithEvolu();
      outcomes.restoreJoinPendingSkips = pushes.length === 0
        && debugCalls.some(message => message.includes('skipped until restored mnemonic pulls remote owner data'));
    } finally {
      for (const [key, value] of savedStorage) {
        if (value === null) localStorage.removeItem(key);
        else localStorage.setItem(key, value);
      }
      state.currentProfile = savedState.currentProfile;
      state.importedData = savedState.importedData;
      state.profiles = savedState.profiles;
      reconcile.configureSyncReconcile({
        getEvolu: () => null,
        getProfileQuery: () => null,
        isSyncEnabled: () => false,
        pushProfile: async () => {},
        debug: () => {},
      });
    }

    return outcomes;
  }, {
    reconcileUrl: moduleUrl('/js/sync-reconcile.js'),
    payloadUrl: '/js/sync-payload.js',
    collectorsUrl: '/js/sync-payload-collectors.js',
    identityUrl: '/js/sync-identity.js',
    profileUrl: '/js/profile.js',
    stateUrl: '/js/state.js',
  });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});

test('sync init browser coverage handles disabled and unsupported startup guards', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });
  await page.waitForSelector('#notification-container', { state: 'attached' });

  const results = await page.evaluate(async ({ initUrl, settingsUrl, runtimeUrl }) => {
    const [syncInit, settings, runtime] = await Promise.all([
      import(initUrl),
      import(settingsUrl),
      import(runtimeUrl),
    ]);
    const outcomes = {};
    const savedSyncEnabled = localStorage.getItem(settings.SYNC_STORAGE_KEY);
    const hadOwnLocks = Object.prototype.hasOwnProperty.call(navigator, 'locks');
    const ownLocksDescriptor = Object.getOwnPropertyDescriptor(navigator, 'locks');

    try {
      runtime.clearSyncRuntimeState();
      settings.setSyncEnabled(false, { persist: false });
      await syncInit.initSync();
      outcomes.disabledSyncLeavesRuntimeIdle = runtime.getSyncEvolu() === null
        && runtime.getSyncAppOwnerError() === null;

      runtime.clearSyncRuntimeState();
      settings.setSyncEnabled(true, { persist: false });
      Object.defineProperty(navigator, 'locks', {
        configurable: true,
        value: undefined,
      });
      await syncInit.initSync();
      outcomes.missingWebLocksSetsOwnerError = runtime.getSyncEvolu() === null
        && String(runtime.getSyncAppOwnerError()).includes('navigator.locks not available');
    } finally {
      runtime.clearSyncRuntimeState();
      if (hadOwnLocks && ownLocksDescriptor) {
        Object.defineProperty(navigator, 'locks', ownLocksDescriptor);
      } else {
        delete navigator.locks;
      }
      if (savedSyncEnabled === null) {
        localStorage.removeItem(settings.SYNC_STORAGE_KEY);
        settings.setSyncEnabled(false, { persist: false });
      } else {
        localStorage.setItem(settings.SYNC_STORAGE_KEY, savedSyncEnabled);
        settings.setSyncEnabled(savedSyncEnabled === 'true', { persist: false });
      }
    }

    return outcomes;
  }, {
    initUrl: moduleUrl('/js/sync-init.js'),
    settingsUrl: '/js/sync-settings-state.js',
    runtimeUrl: '/js/sync-runtime.js',
  });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});
