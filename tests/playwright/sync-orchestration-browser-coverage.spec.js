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
