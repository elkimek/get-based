import { expect, test } from './coverage-fixture.js';

function moduleUrl(path) {
  return `${path}?syncInitCoverage=${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function evoluBundleBody({ rejectOwner = false, rejectQuery = false } = {}) {
  return `
const trace = window.__syncInitTrace ||= {};
trace.createdCount = trace.createdCount || 0;
trace.loadedQueries = trace.loadedQueries || [];
trace.queries = trace.queries || [];
trace.queryBuilders = trace.queryBuilders || [];
trace.subscriptions = trace.subscriptions || [];
trace.subscriptionCallbacks = trace.subscriptionCallbacks || [];

function makeBuilder(table) {
  return {
    table,
    selected: false,
    whereArgs: [],
    selectAll() {
      this.selected = true;
      return this;
    },
    where(...args) {
      this.whereArgs.push(args);
      return this;
    },
  };
}

export const id = name => \`\${name}Id\`;
export const nullOr = value => ({ nullable: value });
export const NonEmptyString = { kind: 'NonEmptyString' };
export const SimpleName = { orThrow: value => ({ simpleName: value }) };
export const evoluWebDeps = { kind: 'web-deps' };

export function createEvolu(deps) {
  return (schema, options) => {
    trace.createdCount += 1;
    trace.deps = deps;
    trace.schemaKeys = Object.keys(schema);
    trace.options = options;
    let queryId = 0;
    let appOwner = new Promise((resolve, reject) => {
      window.__syncInitResolveOwner = resolve;
      window.__syncInitRejectOwner = reject;
    });
    if (${JSON.stringify(rejectOwner)}) {
      appOwner = Promise.reject(new Error('owner failed'));
    }
    return {
      appOwner,
      createQuery(factory) {
        const db = {
          selectFrom(table) {
            const builder = makeBuilder(table);
            trace.queryBuilders.push(builder);
            return builder;
          },
        };
        const built = factory(db);
        const query = { id: ++queryId, table: built.table, whereArgs: built.whereArgs };
        trace.queries.push(query);
        return query;
      },
      loadQuery(query) {
        trace.loadedQueries.push(query.id);
        if (${JSON.stringify(rejectQuery)}) return Promise.reject(new Error('query failed'));
        return Promise.resolve(query.id);
      },
      subscribeQuery(query) {
        return callback => {
          trace.subscriptions.push(query.id);
          trace.subscriptionCallbacks.push(callback);
          return () => {};
        };
      },
      subscribeError(callback) {
        trace.errorSubscriber = true;
        trace.errorCallback = callback;
        return () => {};
      },
      getQueryRows(query) {
        trace.getRowsFor = query?.id || null;
        return trace.rows || [];
      },
    };
  };
}
`;
}

async function openSyncInitPage(page, path, bundleBody) {
  await page.route('**/vendor/evolu/evolu-bundle.js', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'text/javascript',
      body: bundleBody,
    });
  });
  await page.route(`**${path}*`, async route => {
    await route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: '<!doctype html><html><body><div id="notification-container"></div></body></html>',
    });
  });
  const separator = path.includes('?') ? '&' : '?';
  await page.goto(`${path}${separator}evolu-client=v7`, { waitUntil: 'load' });
}

test('sync init browser coverage handles disabled blocker and import failure paths', async ({ page }) => {
  await openSyncInitPage(page, '/sync-init-failure-browser-coverage', `
export const createEvolu = (() => { throw new Error('evolu import failed'); })();
export const id = () => {};
export const nullOr = value => value;
export const SimpleName = { orThrow: value => value };
export const NonEmptyString = {};
export const evoluWebDeps = {};
`);

  const results = await page.evaluate(async ({ initUrl }) => {
    const [init, runtime, settings] = await Promise.all([
      import(initUrl),
      import('/js/sync-runtime.js'),
      import('/js/sync-settings-state.js'),
    ]);
    const outcomes = {};
    const hadOwnLocks = Object.prototype.hasOwnProperty.call(navigator, 'locks');
    const locksDescriptor = Object.getOwnPropertyDescriptor(navigator, 'locks');
    const errors = [];
    const originalError = console.error;

    const setLocks = value => {
      Object.defineProperty(navigator, 'locks', {
        configurable: true,
        value,
      });
    };
    const restoreLocks = () => {
      if (hadOwnLocks && locksDescriptor) Object.defineProperty(navigator, 'locks', locksDescriptor);
      else delete navigator.locks;
    };

    try {
      console.error = (...args) => { errors.push(args.map(String).join(' ')); };
      runtime.clearSyncRuntimeState();
      settings.setSyncEnabled(false, { persist: false });
      localStorage.removeItem(settings.SYNC_STORAGE_KEY);
      await init.initSync();
      outcomes.disabledPrimeSkipsWithoutRuntime =
        runtime.getSyncEvolu() === null
        && runtime.getSyncAppOwnerError() === null;

      settings.setSyncEnabled(true, { persist: false });
      setLocks(undefined);
      await init.initSync();
      outcomes.blockerSetsOwnerError =
        runtime.getSyncEvolu() === null
        && String(runtime.getSyncAppOwnerError()).includes('navigator.locks not available');

      restoreLocks();
      runtime.clearSyncRuntimeState();
      settings.setSyncEnabled(true, { persist: false });
      await init.initSync();
      outcomes.failedImportDisablesSync =
        settings.isSyncEnabled() === false
        && runtime.getSyncEvolu() === null
        && errors.some(message => message.includes('Failed to initialize Evolu'));
    } finally {
      console.error = originalError;
      restoreLocks();
      runtime.clearSyncRuntimeState();
      settings.setSyncEnabled(false, { persist: false });
      localStorage.removeItem(settings.SYNC_STORAGE_KEY);
    }

    return outcomes;
  }, {
    initUrl: moduleUrl('/js/sync-init.js'),
  });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});

test('sync init browser coverage creates Evolu runtime subscriptions and debug globals', async ({ page }) => {
  await openSyncInitPage(page, '/sync-init-success-browser-coverage', evoluBundleBody());

  const results = await page.evaluate(async ({ initUrl }) => {
    const [init, runtime, settings, subscriptions, identity] = await Promise.all([
      import(initUrl),
      import('/js/sync-runtime.js'),
      import('/js/sync-settings-state.js'),
      import('/js/sync-subscriptions.js'),
      import('/js/sync-identity.js'),
    ]);
    const outcomes = {};
    const original = {
      setTimeout: window.setTimeout,
      clearTimeout: window.clearTimeout,
      setInterval: window.setInterval,
      clearInterval: window.clearInterval,
    };
    const intervals = [];
    const timeouts = [];
    const flushMicrotasks = async () => {
      for (let i = 0; i < 5; i += 1) await Promise.resolve();
    };

    try {
      runtime.clearSyncRuntimeState();
      subscriptions.clearSyncSubscriptionTimers();
      settings.setSyncEnabled(true, { persist: false });
      localStorage.setItem('labcharts-debug', 'true');
      localStorage.setItem('labcharts-sync-relay', 'wss://relay.example/ws');
      sessionStorage.setItem(identity.RESTORE_NOTICE_KEY, 'join');
      window.__syncInitTrace = { rows: [{ profileId: 'debug-profile' }] };
      init.configureSyncInit({
        reconcileLocalStorageWithEvolu: async () => {
          window.__syncInitTrace.reconciledCount = (window.__syncInitTrace.reconciledCount || 0) + 1;
        },
      });
      window.setTimeout = (fn, delay = 0, ...args) => {
        timeouts.push(delay);
        return original.setTimeout.call(window, fn, delay, ...args);
      };
      window.clearTimeout = id => original.clearTimeout.call(window, id);
      window.setInterval = (_fn, delay = 0) => {
        intervals.push(delay);
        return intervals.length;
      };
      window.clearInterval = () => {};

      await init.initSync();
      const trace = window.__syncInitTrace;
      const profileQuery = runtime.getSyncProfileQuery();
      const tombstoneQuery = runtime.getSyncTombstoneQuery();
      const itemRowQuery = runtime.getSyncItemRowQuery();

      outcomes.waitsToReconcileUntilReady = !trace.reconciledCount;

      outcomes.createsEvoluWithSchemaRelayAndDebug =
        trace.createdCount === 1
        && trace.schemaKeys.includes('profileData')
        && trace.schemaKeys.includes('itemRow')
        && trace.options.reloadUrl === '/sync-init-success-browser-coverage?evolu-client=v7'
        && trace.options.enableLogging === true
        && trace.options.transports?.[0]?.url === 'wss://relay.example/ws';

      outcomes.storesRuntimeQueries =
        runtime.getSyncEvolu() !== null
        && profileQuery?.table === 'profileData'
        && tombstoneQuery?.whereArgs?.[0]?.[2] === 1
        && itemRowQuery?.table === 'itemRow';

      await runtime.getSyncQueryLoadedPromise();
      window.__syncInitResolveOwner({ id: 'owner-init', mnemonic: 'alpha beta' });
      await runtime.getSyncReadyPromise();
      await flushMicrotasks();

      outcomes.loadsQueriesAndResolvesOwner =
        trace.loadedQueries.join(',') === '1,2,3'
        && runtime.getSyncAppOwner()?.id === 'owner-init'
        && runtime.getSyncAppOwnerError() === null;

      outcomes.restoreReloadShowsDurableJoinConfirmation =
        document.getElementById('notification-container')?.textContent.includes('Joined existing sync identity') === true
        && sessionStorage.getItem(identity.RESTORE_NOTICE_KEY) === null;

      outcomes.runsConfiguredReconciliationAfterReady = trace.reconciledCount === 1;

      outcomes.bindsSubscriptionsAndRelayProbe =
        trace.subscriptions.join(',') === '1,2,3'
        && trace.errorSubscriber === true
        && intervals.includes(30000)
        && intervals.includes(60000)
        && timeouts.includes(0);

      outcomes.exposesDebugHelpersOnlyInDebugMode =
        window._syncDebug?.getOwner()?.id === 'owner-init'
        && window._syncDebug?.getRows()?.[0]?.profileId === 'debug-profile'
        && window._syncDebug?.evolu === runtime.getSyncEvolu();

      await init.initSync();
      outcomes.reentrantInitDoesNotCreateSecondEvolu = trace.createdCount === 1;
    } finally {
      subscriptions.clearSyncSubscriptionTimers();
      window.setTimeout = original.setTimeout;
      window.clearTimeout = original.clearTimeout;
      window.setInterval = original.setInterval;
      window.clearInterval = original.clearInterval;
      runtime.clearSyncRuntimeState();
      settings.setSyncEnabled(false, { persist: false });
      localStorage.removeItem(settings.SYNC_STORAGE_KEY);
      localStorage.removeItem('labcharts-debug');
      localStorage.removeItem('labcharts-sync-relay');
      sessionStorage.removeItem(identity.RESTORE_NOTICE_KEY);
      delete window._syncDebug;
      delete window.__syncInitTrace;
      delete window.__syncInitResolveOwner;
      delete window.__syncInitRejectOwner;
    }

    return outcomes;
  }, {
    initUrl: moduleUrl('/js/sync-init.js'),
  });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});

test('sync init browser coverage records query and owner initialization failures', async ({ page }) => {
  await openSyncInitPage(
    page,
    '/sync-init-promise-failure-browser-coverage',
    evoluBundleBody({ rejectOwner: true, rejectQuery: true }),
  );

  const results = await page.evaluate(async ({ initUrl }) => {
    const [init, runtime, settings, subscriptions] = await Promise.all([
      import(initUrl),
      import('/js/sync-runtime.js'),
      import('/js/sync-settings-state.js'),
      import('/js/sync-subscriptions.js'),
    ]);
    const outcomes = {};
    const warnings = [];
    const original = {
      warn: console.warn,
      setTimeout: window.setTimeout,
      clearTimeout: window.clearTimeout,
      setInterval: window.setInterval,
      clearInterval: window.clearInterval,
    };

    try {
      console.warn = (...args) => { warnings.push(args.map(String).join(' ')); };
      runtime.clearSyncRuntimeState();
      subscriptions.clearSyncSubscriptionTimers();
      settings.setSyncEnabled(true, { persist: false });
      window.setTimeout = (fn, delay = 0, ...args) => {
        return original.setTimeout.call(window, fn, delay, ...args);
      };
      window.clearTimeout = id => original.clearTimeout.call(window, id);
      window.setInterval = () => 1;
      window.clearInterval = () => {};

      await init.initSync();
      await runtime.getSyncQueryLoadedPromise();
      await runtime.getSyncReadyPromise();

      outcomes.queryAndOwnerFailuresAreHandled =
        runtime.getSyncEvolu() !== null
        && runtime.getSyncAppOwner() === null
        && runtime.getSyncAppOwnerError() === 'owner failed'
        && warnings.some(message => message.includes('Query load failed'))
        && warnings.some(message => message.includes('Owner resolution failed'));
    } finally {
      subscriptions.clearSyncSubscriptionTimers();
      console.warn = original.warn;
      window.setTimeout = original.setTimeout;
      window.clearTimeout = original.clearTimeout;
      window.setInterval = original.setInterval;
      window.clearInterval = original.clearInterval;
      runtime.clearSyncRuntimeState();
      settings.setSyncEnabled(false, { persist: false });
      localStorage.removeItem(settings.SYNC_STORAGE_KEY);
      delete window.__syncInitTrace;
      delete window.__syncInitResolveOwner;
      delete window.__syncInitRejectOwner;
    }

    return outcomes;
  }, {
    initUrl: moduleUrl('/js/sync-init.js'),
  });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});
