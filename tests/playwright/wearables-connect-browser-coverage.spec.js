import { expect, test } from './coverage-fixture.js';

function moduleUrl(path) {
  return `${path}?wearablesConnectCoverage=${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

async function openBlankPage(page, path) {
  await page.route(`**${path}`, route => route.fulfill({
    contentType: 'text/html',
    body: '<!doctype html><html><body></body></html>',
  }));
  await page.route('**/wearables-connect-frame-*', route => route.fulfill({
    contentType: 'text/html',
    body: '<!doctype html><html><body></body></html>',
  }));
  await page.goto(path, { waitUntil: 'load' });
}

test('wearables connect browser coverage drives OAuth callback, backfill, refresh, and disconnect', async ({ page }) => {
  await openBlankPage(page, '/wearables-connect-browser-coverage');

  const results = await page.evaluate(async ({ connectUrl, storeUrl }) => {
    const failures = [];
    const check = (name, condition, detail = '') => {
      if (!condition) failures.push(detail ? `${name}: ${detail}` : name);
    };
    const wait = (ms = 0) => new Promise(resolve => setTimeout(resolve, ms));
    const jsonResponse = (body, status = 200) => new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
    const sleepDay = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const { state } = await import('/js/state.js');
    const connect = await import(connectUrl);
    const connectRuntime = await import('/js/wearables-connect-runtime.js');
    const credentialVault = await import('/js/wearables-credential-vault.js');
    const store = await import(storeUrl);
    await import('/js/wearable-adapters.js');

    const profileId = `wearables-connect-coverage-${Date.now()}`;
    const originalFetch = window.fetch;
    const originalLocationSearch = window.location.search;
    const navigations = [];
    const requests = [];
    let refreshCount = 0;
    const originalConnectRuntimeDeps = connectRuntime.configureWearablesConnectRuntimeDeps({
      navigate: route => navigations.push(route),
    });

    localStorage.setItem('labcharts-active-profile', profileId);
    state.currentProfile = profileId;
    state.profiles = [{ id: profileId, name: 'Wearables coverage', createdAt: Date.now(), lastUpdated: Date.now(), tags: [], notes: '', status: 'active', pinned: false }];
    state.importedData = { entries: [], notes: [], supplements: [], healthGoals: [], diagnoses: null, wearableConnections: {}, wearableSummary: null, customMarkers: {}, markerNotes: {}, markerValueNotes: {}, changeHistory: [] };

    document.body.innerHTML = '<div id="notification-container"></div>';
    await store.clearSource(profileId, 'oura').catch(() => {});
    await store.clearSource(profileId, 'polar').catch(() => {});

    function bodyForProxy(proxy) {
      if (proxy.oura_token_exchange) {
        return { access_token: 'oura-access-token', refresh_token: 'oura-refresh-token', expires_in: 3600, scope: 'personal daily' };
      }
      if (proxy.oura_token_refresh) {
        refreshCount += 1;
        return { access_token: `oura-refreshed-${refreshCount}`, refresh_token: `oura-refresh-${refreshCount}`, expires_in: 3600, scope: 'personal daily' };
      }
      if (proxy.polar_token_exchange) {
        return { access_token: 'polar-access-token', refresh_token: 'polar-refresh-token', expires_in: 3600, x_user_id: 'polar-user-1', scope: 'accesslink.read_all' };
      }
      if (proxy.polar_token_refresh) {
        return { access_token: 'polar-refreshed-token', refresh_token: 'polar-refresh-token-2', expires_in: 3600, x_user_id: 'polar-user-1' };
      }
      if (proxy.wearable_runtime_config) {
        return { overrides: { oura: 'override-oura-client', polar: 'override-polar-client' } };
      }
      if (proxy.url) {
        const url = new URL(proxy.url);
        const path = url.pathname;
        if (path.endsWith('/personal_info')) {
          return { email: 'oura@example.test', age: 42, weight: 72, height: 180, biological_sex: 'female' };
        }
        if (path.endsWith('/sleep')) {
          return { data: [
            { day: sleepDay, total_sleep_duration: 26000, average_hrv: 41, lowest_heart_rate: 52 },
            { day: sleepDay, total_sleep_duration: 1200, average_hrv: 10, lowest_heart_rate: 70 },
          ], next_token: null };
        }
        if (path.endsWith('/daily_sleep')) return { data: [{ day: sleepDay, score: 88 }], next_token: null };
        if (path.endsWith('/daily_readiness')) return { data: [{ day: sleepDay, score: 81, temperature_deviation: -0.2 }], next_token: null };
        if (path.endsWith('/daily_activity')) return { data: [{ day: sleepDay, score: 77, steps: 7890 }], next_token: null };
        if (path.endsWith('/daily_spo2')) return { data: [{ day: sleepDay, spo2_percentage: { average: 97 }, breathing_disturbance_index: 3 }], next_token: null };
        if (path.endsWith('/daily_stress')) return { data: [{ day: sleepDay, stress_high: 1800 }], next_token: null };
        if (path.endsWith('/daily_resilience')) return { data: [{ day: sleepDay, level: 'strong' }], next_token: null };
        if (path.endsWith('/daily_cardiovascular_age')) return { data: [{ day: sleepDay, vascular_age: 38 }], next_token: null };
        if (path.endsWith('/vO2_max')) return { data: [{ day: sleepDay, vo2_max: { value: 42 } }], next_token: null };
        if (path.endsWith('/heartrate')) return { data: [
          { timestamp: `${sleepDay}T12:00:00Z`, bpm: 72, source: 'awake' },
          { timestamp: `${sleepDay}T12:05:00Z`, bpm: 78, source: 'awake' },
        ], next_token: null };
        if (path.endsWith('/v3/users')) return {};
        if (path.includes('/polar-accesslink/v3/users/')) return { nights: [] };
      }
      return {};
    }

    window.fetch = async (url, options = {}) => {
      if (String(url) !== '/api/proxy') return originalFetch(url, options);
      const proxy = JSON.parse(String(options.body || '{}'));
      requests.push(proxy);
      return jsonResponse(bodyForProxy(proxy));
    };

    async function exerciseDispatchBegins() {
      const stateKeys = {
        oura: 'oura-oauth-pending',
        whoop: 'whoop-oauth-pending',
        withings: 'withings-oauth-pending',
        ultrahuman: 'ultrahuman-oauth-pending',
        fitbit: 'fitbit-oauth-pending',
        google_health: 'google_health-oauth-pending',
        polar: 'polar-oauth-pending',
      };
      const outcomes = {};
      for (const id of Object.keys(stateKeys)) {
        const frame = document.createElement('iframe');
        let timeoutId = null;
        const loaded = new Promise((resolve, reject) => {
          frame.onload = () => {
            if (timeoutId != null) clearTimeout(timeoutId);
            resolve();
          };
          frame.onerror = () => {
            if (timeoutId != null) clearTimeout(timeoutId);
            reject(new Error(`Failed to load wearables connect iframe for ${id}`));
          };
          timeoutId = setTimeout(() => reject(new Error(`Timed out loading wearables connect iframe for ${id}`)), 5000);
        });
        frame.src = `/wearables-connect-frame-${id}`;
        document.body.appendChild(frame);
        try {
          await loaded;
          frame.contentWindow.sessionStorage.removeItem(stateKeys[id]);
          sessionStorage.removeItem(stateKeys[id]);
          const frameMod = await frame.contentWindow.eval(`import(${JSON.stringify(`${connectUrl}&frame=${id}`)})`);
          const redirectUri = `${frame.contentWindow.location.origin}${frame.contentWindow.location.pathname}`;
          const maybePromise = frameMod.OAUTH_DISPATCH[id].begin({
            clientId: `client-${id}`,
            registeredUris: [redirectUri],
            scopes: ['scope:one'],
            profileId,
          });
          if (maybePromise?.catch) maybePromise.catch(() => {});
          const raw = frame.contentWindow.sessionStorage.getItem(stateKeys[id]) || sessionStorage.getItem(stateKeys[id]);
          const pending = JSON.parse(raw || '{}');
          outcomes[id] = pending.clientId === `client-${id}`
            && pending.profileId === profileId
            && pending.redirectUri === redirectUri
            && typeof pending.state === 'string'
            && pending.state.length >= 16;
        } finally {
          if (timeoutId != null) clearTimeout(timeoutId);
          frame.remove();
        }
      }
      return outcomes;
    }

    try {
      const beginOutcomes = await exerciseDispatchBegins();
      check('all OAuth dispatch begin closures store pending state', Object.values(beginOutcomes).every(Boolean), JSON.stringify(beginOutcomes));

      let unknownError = '';
      let manualError = '';
      try { connect.beginConnectOAuth('missing'); } catch (error) { unknownError = error.message; }
      try { connect.beginConnectOAuth('manual'); } catch (error) { manualError = error.message; }
      check('beginConnectOAuth validates unknown and non-OAuth adapters', /Unknown adapter/.test(unknownError) && /not OAuth2/.test(manualError));

      sessionStorage.setItem('oura-oauth-pending', JSON.stringify({
        state: 'oura-state-ok',
        redirectUri: `${location.origin}${location.pathname}`,
        startedAt: Date.now(),
        clientId: 'oura-client',
        profileId,
      }));
      history.replaceState(null, '', `${location.pathname}?code=oura-code&state=oura-state-ok`);
      const handled = await connect.handleOAuthCallbackOnLoad();
      await wait(250);

      const conn = connect.getConnection('oura');
      const callbackCredentials = await credentialVault.loadWearableCredentials(profileId, 'oura');
      const l1Rows = await store.getDailyRange(profileId, 'oura', sleepDay, sleepDay);
      check('handleOAuthCallbackOnLoad handles Oura callback', handled === true
        && conn?.accessToken == null
        && conn?.hasStoredCredentials === true
        && callbackCredentials?.accessToken === 'oura-access-token'
        && conn.account?.email === 'oura@example.test');
      check('callback cleans URL and navigates dashboard', window.location.search === '' && navigations.includes('dashboard'));
      check('background backfill writes Oura L1 rows', l1Rows.some(row => row.date === sleepDay && row.hrv_rmssd === 41 && row.rhr === 52 && row.sleep_score === 88));
      check('listConnectedSources exposes connected Oura source', connect.listConnectedSources().oura?.connectedSince === conn.connectedAt);

      state.importedData.wearableConnections.oura.expiresAt = 0;
      await connect.incrementalSyncWearable('oura', { force: true });
      const refreshedCredentials = await credentialVault.loadWearableCredentials(profileId, 'oura');
      check('incremental sync refreshes expired token', refreshCount >= 1
        && refreshedCredentials?.accessToken?.startsWith('oura-refreshed-'));

      const syncResult = await connect.syncNow('oura', { force: true });
      check('syncNow completes source and summary refresh', syncResult.rows >= 1 && state.importedData.wearableSummary?.sources?.oura?.coverageDays >= 1);

      const recoverWithRows = await connect.recoverIfL1Empty('oura');
      check('recoverIfL1Empty skips when rows exist', recoverWithRows.skipped === true && recoverWithRows.rows >= 1);

      await connect.disconnectWearable('oura');
      const afterDisconnectRows = await store.getDailyRange(profileId, 'oura', '2026-01-01', '2099-12-31');
      check('disconnectWearable removes connection, source rows, meta, and summary source',
        connect.getConnection('oura') == null &&
        afterDisconnectRows.length === 0 &&
        state.importedData.wearableSummary == null);

      const skippedSync = await connect.syncNow('oura');
      check('syncNow skips disconnected source', skippedSync.skipped === true && skippedSync.reason === 'not-connected');
    } finally {
      connectRuntime.configureWearablesConnectRuntimeDeps(originalConnectRuntimeDeps);
      window.fetch = originalFetch;
      history.replaceState(null, '', `${location.pathname}${originalLocationSearch || ''}`);
      await store.clearSource(profileId, 'oura').catch(() => {});
      await store.clearSource(profileId, 'polar').catch(() => {});
    }

    return {
      failures,
      requests,
      toastText: document.getElementById('notification-container')?.textContent || '',
    };
  }, {
    connectUrl: moduleUrl('/js/wearables-connect.js'),
    storeUrl: moduleUrl('/js/wearables-store.js'),
  });

  expect(results.failures).toEqual([]);
  expect(results.requests.some(req => req.oura_token_exchange)).toBe(true);
  expect(results.requests.some(req => req.oura_token_refresh)).toBe(true);
  expect(results.toastText).toMatch(/connected|backfilled|sync/i);
});

test('wearables connect browser coverage exercises runtime config, stale sync, Polar guards, and error branches', async ({ page }) => {
  await openBlankPage(page, '/wearables-connect-scheduler-coverage');

  const results = await page.evaluate(async ({ connectUrl, storeUrl }) => {
    const failures = [];
    const check = (name, condition, detail = '') => {
      if (!condition) failures.push(detail ? `${name}: ${detail}` : name);
    };
    const wait = (ms = 0) => new Promise(resolve => setTimeout(resolve, ms));
    const jsonResponse = (body, status = 200) => new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });

    const { state } = await import('/js/state.js');
    const connect = await import(connectUrl);
    const store = await import(storeUrl);
    const adapters = await import('/js/wearable-adapters.js');

    const profileId = `wearables-scheduler-coverage-${Date.now()}`;
    const originalFetch = window.fetch;
    const requests = [];
    let runtimeConfigCalls = 0;
    let polarRegistrationCalls = 0;
    let polarCommitCalls = 0;

    localStorage.setItem('labcharts-active-profile', profileId);
    state.currentProfile = profileId;
    state.profiles = [{ id: profileId, name: 'Wearables scheduler coverage', createdAt: Date.now(), lastUpdated: Date.now(), tags: [], notes: '', status: 'active', pinned: false }];
    state.importedData = { entries: [], notes: [], supplements: [], healthGoals: [], diagnoses: null, wearableConnections: {}, wearableSummary: null, customMarkers: {}, markerNotes: {}, markerValueNotes: {}, changeHistory: [] };

    document.body.innerHTML = '<div id="notification-container"></div>';
    await store.clearSource(profileId, 'polar').catch(() => {});

    window.fetch = async (url, options = {}) => {
      if (String(url) !== '/api/proxy') return originalFetch(url, options);
      const proxy = JSON.parse(String(options.body || '{}'));
      requests.push(proxy);
      if (proxy.wearable_runtime_config) {
        runtimeConfigCalls += 1;
        if (runtimeConfigCalls === 1) return jsonResponse({ error: 'temporary runtime-config failure' }, 503);
        return jsonResponse({
          overrides: { oura: 'runtime-oura-client', polar: 'runtime-polar-client', google_health: 'runtime-google-health-client' },
          configured: { google_health: true },
        });
      }
      if (proxy.polar_token_exchange) {
        return jsonResponse({ access_token: 'polar-access', refresh_token: 'polar-refresh', expires_in: 3600, x_user_id: 'polar-user-7', scope: 'accesslink.read_all' });
      }
      if (proxy.url) {
        const urlObj = new URL(proxy.url);
        const path = urlObj.pathname;
        if (path.endsWith('/v3/users') && proxy.method === 'POST') {
          polarRegistrationCalls += 1;
          return jsonResponse({});
        }
        if (path.endsWith('/nights/sleep')) {
          return jsonResponse({ nights: [{ date: '2026-06-02', 'sleep-score': 86, 'heart-rate-samples': { min: 51 } }] });
        }
        if (path.endsWith('/activity-transactions') && proxy.method === 'POST') {
          return jsonResponse({ 'transaction-id': 'act-1', 'activity-log': ['https://www.polaraccesslink.com/v3/users/polar-user-7/activity/1'] });
        }
        if (path.endsWith('/activity/1')) {
          return jsonResponse({ date: '2026-06-02', 'active-steps': 3456, 'heart-rate': { average: 69 } });
        }
        if (path.endsWith('/exercise-transactions') && proxy.method === 'POST') {
          return jsonResponse({ 'transaction-id': 'ex-1', exercises: ['https://www.polaraccesslink.com/v3/users/polar-user-7/exercises/1'] });
        }
        if (path.endsWith('/exercises/1')) {
          return jsonResponse({ 'start-time': '2026-06-02T12:00:00Z', 'heart-rate-variability-avg': 44, 'heart-rate': { average: 74 } });
        }
        if (/\/activity-transactions\/act-1$|\/exercise-transactions\/ex-1$/.test(path) && proxy.method === 'PUT') {
          polarCommitCalls += 1;
          return jsonResponse({});
        }
      }
      return jsonResponse({});
    };

    try {
      check('adapterSupportsMetric returns true for a supported metric',
        adapters.adapterSupportsMetric('oura', 'hrv_rmssd') === true);
      check('adapterSupportsMetric returns false for an unknown metric',
        adapters.adapterSupportsMetric('oura', 'not_a_metric') === false);
      check('adapterSupportsMetric returns false for an unknown adapter',
        adapters.adapterSupportsMetric('not-a-real-adapter', 'steps') === false);

      await connect.loadWearableRuntimeConfig({ waitForFetch: true });
      check('failed runtime config remains retryable and fails Google Health closed',
        runtimeConfigCalls === 1 && adapters.isOAuthAdapterConfigured('google_health') === false);
      await connect.syncStaleWearablesNow();
      check('scheduler retries runtime config and applies Google Health capability',
        runtimeConfigCalls === 2 &&
        adapters.getOAuthClientId('oura') === 'runtime-oura-client' &&
        adapters.getOAuthClientId('polar') === 'runtime-polar-client' &&
        adapters.getOAuthClientId('google_health') === 'runtime-google-health-client' &&
        adapters.isOAuthAdapterConfigured('google_health') === true);
      await connect.loadWearableRuntimeConfig();
      check('successful runtime config promise is reused', runtimeConfigCalls === 2);

      const withingsBaselineClient = adapters.adapterById('withings')?.oauth?.clientId || null;
      adapters.applyOAuthOverrides({ withings: 'browser-withings-client' });
      check('apply OAuth overrides updates adapter client before reset',
        adapters.getOAuthClientId('withings') === 'browser-withings-client');
      adapters._resetOAuthOverrides();
      check('reset OAuth overrides restores adapter baseline in browser',
        adapters.getOAuthClientId('withings') === withingsBaselineClient);
      adapters.applyOAuthOverrides({ oura: 'runtime-oura-client', polar: 'runtime-polar-client' });

      sessionStorage.setItem('polar-oauth-pending', JSON.stringify({
        state: 'polar-state-ok',
        redirectUri: `${location.origin}${location.pathname}`,
        startedAt: Date.now(),
        clientId: 'polar-client',
        profileId,
      }));
      history.replaceState(null, '', `${location.pathname}?code=polar-code&state=polar-state-ok`);
      const handledPolar = await connect.handleOAuthCallbackOnLoad();
      await wait(250);
      const polarConn = connect.getConnection('polar');
      const polarRows = await store.getDailyRange(profileId, 'polar', '2026-06-02', '2026-06-02');
      check('Polar callback stores user id, registers user, backfills rows, and commits transactions',
        handledPolar === true &&
        polarConn?.userId === 'polar-user-7' &&
        polarConn?.polarRegistered === true &&
        polarRegistrationCalls === 1 &&
        polarCommitCalls === 2 &&
        polarRows.some(row => row.date === '2026-06-02' && row.sleep_score === 86 && row.steps === 3456 && row.hrv_day === 44));

      const forcedStaleAt = Date.now() - (13 * 60 * 60 * 1000);
      state.importedData.wearableConnections.polar.lastSyncAt = forcedStaleAt;
      await connect.syncStaleWearablesNow();
      const staleUpdatedAt = connect.getConnection('polar')?.lastSyncAt || 0;
      check('syncStaleWearablesNow refreshes stale connected sources', staleUpdatedAt > forcedStaleAt);

      state.importedData.wearableConnections.polar.needsReauth = true;
      const recoverSkipped = await connect.recoverIfL1Empty('polar');
      check('recoverIfL1Empty skips needs-reauth connections', recoverSkipped.skipped === true && recoverSkipped.reason === 'needs-reauth');
      delete state.importedData.wearableConnections.polar.needsReauth;

      const savedPolarConnection = { ...state.importedData.wearableConnections.polar };
      state.importedData.wearableConnections.ghost = {
        accessToken: 'Bearer SECRET_ACCESS_TOKEN_123456789',
        refreshToken: 'SECRET_REFRESH_TOKEN_123456789',
        expiresAt: Date.now() + 3600000,
        connectedAt: new Date().toISOString(),
      };
      let ghostError = '';
      try {
        await connect.syncNow('ghost');
      } catch (error) {
        ghostError = error.message;
      }
      check(
        'syncNow unknown connected source exercises generic failure branch',
        /not.*function|cannot read|is not a function|undefined/i.test(ghostError),
        ghostError
      );
      delete state.importedData.wearableConnections.ghost;

      state.importedData.wearableConnections.polar = { ...savedPolarConnection, userId: null };
      let missingUserHandled = false;
      try {
        await connect.syncNow('polar');
      } catch (error) {
        missingUserHandled = error?.code === 'needs-reauth' || /missing userId/.test(error.message);
      }
      check('syncNow Polar missing user id surfaces needs-reauth path', missingUserHandled);

      const badProfileId = `${profileId}-other`;
      localStorage.setItem('labcharts-active-profile', badProfileId);
      sessionStorage.setItem('polar-oauth-pending', JSON.stringify({
        state: 'polar-state-wrong-profile',
        redirectUri: `${location.origin}${location.pathname}`,
        startedAt: Date.now(),
        clientId: 'polar-client',
        profileId,
      }));
      history.replaceState(null, '', `${location.pathname}?code=polar-code&state=polar-state-wrong-profile`);
      const wrongProfileHandled = await connect.handleOAuthCallbackOnLoad();
      const toastText = document.getElementById('notification-container')?.textContent || '';
      check('OAuth callback aborts when active profile changed', wrongProfileHandled === true && /different profile/.test(toastText));
      localStorage.setItem('labcharts-active-profile', profileId);
    } finally {
      window.fetch = originalFetch;
      history.replaceState(null, '', location.pathname);
      await store.clearSource(profileId, 'polar').catch(() => {});
    }

    return {
      failures,
      requests,
      toastText: document.getElementById('notification-container')?.textContent || '',
    };
  }, {
    connectUrl: moduleUrl('/js/wearables-connect.js'),
    storeUrl: moduleUrl('/js/wearables-store.js'),
  });

  expect(results.failures).toEqual([]);
  expect(results.requests.some(req => req.polar_token_exchange)).toBe(true);
  expect(results.toastText).toMatch(/Polar/);
});
