import { expect, test } from './coverage-fixture.js';

test('wearables settings loads runtime credentials for a fresh unconnected profile', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });

  const result = await page.evaluate(async () => {
    const [{ state }, adapters, settings] = await Promise.all([
      import('/js/state.js'),
      import('/js/wearable-adapters.js'),
      import('/js/wearables-settings-panel.js'),
    ]);
    const originalFetch = window.fetch;
    const originalSetTimeout = window.setTimeout;
    let runtimeConfigCalls = 0;
    let hangingRequestAborted = false;
    adapters._resetOAuthOverrides();
    state.importedData = { wearableConnections: {} };
    document.getElementById('wearables-section')?.remove();
    window.setTimeout = (handler, delay = 0, ...args) => originalSetTimeout(
      handler, delay === 10000 ? 0 : delay, ...args);

    window.fetch = async (url, options = {}) => {
      if (String(url) === '/api/proxy') {
        const payload = JSON.parse(String(options.body || '{}'));
        if (payload.wearable_runtime_config) {
          runtimeConfigCalls += 1;
          if (runtimeConfigCalls === 1) return new Response(null, { status: 503 });
          if (runtimeConfigCalls === 2) return new Promise((_resolve, reject) => {
            options.signal?.addEventListener('abort', () => {
              hangingRequestAborted = true;
              reject(new DOMException('Aborted', 'AbortError'));
            }, { once: true });
          });
          await new Promise(resolve => setTimeout(resolve, 25));
          return new Response(JSON.stringify({
            overrides: {
              google_health: 'hosted-google-health-client',
              ultrahuman: 'self-host-ultrahuman-client',
              whoop: 'self-host-whoop-client',
            },
            configured: { google_health: true, ultrahuman: true, whoop: true },
          }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
      }
      return originalFetch(url, options);
    };

    try {
      document.body.insertAdjacentHTML('beforeend', `
        <section id="wearables-section">${settings.renderWearablesSettingsSection()}</section>
      `);
      const initialRow = document.querySelector('[data-adapter="google_health"]');
      const initiallySelfHostOnly = initialRow?.textContent.includes('self-host only');
      const initiallyHasConnect = Boolean(initialRow
        ?.querySelector('[data-wearable-settings-action="connect"]'));

      document.dispatchEvent(new Event('settings:wearables-rendered'));
      while (runtimeConfigCalls < 1) await new Promise(resolve => setTimeout(resolve, 10));
      await new Promise(resolve => setTimeout(resolve, 0));
      const afterFailureStillSelfHostOnly = document.querySelector('[data-adapter="google_health"]')
        ?.textContent.includes('self-host only');
      document.dispatchEvent(new Event('settings:wearables-rendered'));
      while (!hangingRequestAborted) await new Promise(resolve => setTimeout(resolve, 10));
      await new Promise(resolve => setTimeout(resolve, 0));
      document.dispatchEvent(new Event('settings:wearables-rendered'));
      for (let attempt = 0; attempt < 80; attempt += 1) {
        const row = document.querySelector('[data-adapter="google_health"]');
        if (row?.textContent.includes('optional health hub')) break;
        await new Promise(resolve => setTimeout(resolve, 25));
      }

      const configuredRow = document.querySelector('[data-adapter="google_health"]');
      const adapterIdsInGroup = groupId => Array.from(document.querySelectorAll(
        `[data-wearable-group="${groupId}"] [data-adapter]`,
      )).map(row => row.getAttribute('data-adapter'));
      return {
        runtimeConfigCalls,
        initiallySelfHostOnly,
        initiallyHasConnect,
        afterFailureStillSelfHostOnly,
        hangingRequestAborted,
        configuredText: configuredRow?.textContent || '',
        configuredHasConnect: Boolean(configuredRow
          ?.querySelector('[data-wearable-settings-action="connect"]')),
        ultrahumanConfigured: document.querySelector('[data-adapter="ultrahuman"]')
          ?.textContent.includes('experimental · self-hosted')
          && Boolean(document.querySelector('[data-adapter="ultrahuman"] [data-wearable-settings-action="connect"]')),
        whoopConfigured: document.querySelector('[data-adapter="whoop"]')
          ?.textContent.includes('experimental · self-hosted')
          && Boolean(document.querySelector('[data-adapter="whoop"] [data-wearable-settings-action="connect"]')),
        groupIds: Array.from(document.querySelectorAll('[data-wearable-group]'))
          .map(group => group.getAttribute('data-wearable-group')),
        availableOrder: adapterIdsInGroup('available'),
        selfHostOrder: adapterIdsInGroup('self_host'),
        localOrder: adapterIdsInGroup('local'),
      };
    } finally {
      window.fetch = originalFetch;
      window.setTimeout = originalSetTimeout;
      document.getElementById('wearables-section')?.remove();
    }
  });

  expect(result).toMatchObject({
    runtimeConfigCalls: 3,
    initiallySelfHostOnly: true,
    initiallyHasConnect: false,
    afterFailureStillSelfHostOnly: true,
    hangingRequestAborted: true,
    configuredHasConnect: true,
    ultrahumanConfigured: true,
    whoopConfigured: true,
  });
  expect(result.configuredText).toContain('optional health hub');
  expect(result.configuredText).not.toContain('waiting on partner credentials');
  expect(result.groupIds).toEqual(['available', 'self_host', 'local']);
  expect(result.availableOrder).toEqual(['oura', 'withings', 'polar']);
  expect(result.selfHostOrder).toEqual(['google_health', 'whoop', 'ultrahuman']);
  expect(result.localOrder).toEqual(['apple_health', 'manual']);
});

test('wearables settings panel browser coverage renders rows, counts, and navigation toggles', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });
  await page.waitForSelector('#notification-container', { state: 'attached' });

  const results = await page.evaluate(async () => {
    const failures = [];
    const check = (name, condition, detail = '') => {
      if (!condition) failures.push(detail ? `${name}: ${detail}` : name);
    };
    const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
    const waitFor = async (predicate, label) => {
      for (let attempt = 0; attempt < 80; attempt += 1) {
        if (predicate()) return true;
        await wait(25);
      }
      failures.push(`Timed out waiting for ${label}`);
      return false;
    };

    const [{ state }, settings, store, settingsBridge, settingsRuntime] = await Promise.all([
      import('/js/state.js'),
      import('/js/wearables-settings-panel.js'),
      import('/js/wearables-store.js'),
      import('/js/settings-runtime-bridge.js'),
      import('/js/wearables-settings-runtime.js'),
    ]);

    const profileId = `wearables-settings-render-${Date.now()}`;
    const hiddenKey = `wearables-strip-hidden-${profileId}`;
    const betaFlagKey = 'labcharts-show-beta-wearables';
    const oldActiveProfile = localStorage.getItem('labcharts-active-profile');
    const oldHiddenValue = localStorage.getItem(hiddenKey);
    const oldBetaFlag = localStorage.getItem(betaFlagKey);
    const oldCurrentProfile = state.currentProfile;
    const oldProfiles = state.profiles;
    const oldImportedData = state.importedData;
    const oldScrollIntoView = Element.prototype.scrollIntoView;
    const navigations = [];
    const docsClicks = [];
    let closedSettings = 0;
    let scrolledToStrip = 0;
    const previousSettingsBridge = settingsBridge.configureSettingsModuleBridge({
      closeSettingsModal: () => { closedSettings += 1; },
    });
    const previousSettingsRuntimeDeps = settingsRuntime.configureWearableSettingsRuntimeDeps({
      navigate: route => { navigations.push(route); },
    });

    try {
      localStorage.setItem('labcharts-active-profile', profileId);
      localStorage.setItem(betaFlagKey, 'true');
      localStorage.removeItem(hiddenKey);
      state.currentProfile = profileId;
      state.profiles = [{
        id: profileId,
        name: 'Wearables settings coverage',
        createdAt: Date.now(),
        lastUpdated: Date.now(),
        tags: [],
        notes: '',
        status: 'active',
        pinned: false,
      }];
      state.importedData = {
        entries: [],
        notes: [],
        supplements: [],
        healthGoals: [],
        diagnoses: null,
        wearableConnections: {
          oura: {
            connectedAt: Date.now() - 10 * 60 * 1000,
            lastSyncAt: Date.now() - 5 * 60 * 1000,
            account: { email: 'oura@example.test' },
          },
          fitbit: {
            connectedAt: Date.now() - 60 * 60 * 1000,
            lastSyncAt: Date.now() - 60 * 60 * 1000,
            needsReauth: true,
          },
          manual: {
            connectedAt: Date.now() - 2 * 60 * 60 * 1000,
            lastSyncAt: Date.now() - 2 * 60 * 60 * 1000,
          },
          apple_health: {
            connectedAt: Date.now() - 24 * 60 * 60 * 1000,
            lastSyncAt: Date.now() - 24 * 60 * 60 * 1000,
            fileName: 'coverage-export.zip',
            coverageDays: 42,
          },
        },
        wearableSummary: null,
        customMarkers: {},
        markerNotes: {},
        markerValueNotes: {},
        changeHistory: [],
      };

      await store.clearSource(profileId, 'manual').catch(() => {});
      await store.upsertDailyBatch(profileId, [
        { source: 'manual', date: '2026-06-01', weight: 72.4 },
        { source: 'manual', date: '2026-06-02', bp_systolic: 121, bp_diastolic: 78 },
        { source: 'manual', date: '2026-06-03', rhr: 54 },
      ]);

      Element.prototype.scrollIntoView = function scrollIntoView() {
        if (this.id === 'wearable-strip') scrolledToStrip += 1;
      };

      document.body.insertAdjacentHTML('beforeend', `
        <section id="wearables-section">${settings.renderWearablesSettingsSection()}</section>
        <div id="wearable-strip"></div>
      `);
      document.dispatchEvent(new Event('settings:wearables-rendered'));
      await waitFor(
        () => document.querySelector('[data-role="manual-counts"]')?.textContent.includes('pulse'),
        'manual counts to populate'
      );

      const section = document.getElementById('wearables-section');
      const toggle = document.getElementById('wearables-strip-hidden-toggle');
      const ouraRow = section.querySelector('[data-adapter="oura"]');
      const fitbitRow = section.querySelector('[data-adapter="fitbit"]');
      const ultrahumanRow = section.querySelector('[data-adapter="ultrahuman"]');
      const manualRow = section.querySelector('[data-adapter="manual"]');
      const appleRow = section.querySelector('[data-adapter="apple_health"]');
      const manualCounts = section.querySelector('[data-role="manual-counts"]')?.textContent || '';
      const connectedOrder = Array.from(section.querySelectorAll(
        '[data-wearable-group="connected"] [data-adapter]',
      )).map(row => row.getAttribute('data-adapter'));

      check('strip visible toggle starts checked', toggle?.checked === true);
      check('connected group puts the migration warning before healthy connections',
        connectedOrder.join(',') === 'fitbit,oura,manual,apple_health', connectedOrder.join(','));
      check('connected sources are removed from the setup groups',
        !section.querySelector('[data-wearable-group="available"] [data-adapter="oura"]')
        && !section.querySelector('[data-wearable-group="local"] [data-adapter="manual"]')
        && !section.querySelector('[data-wearable-group="local"] [data-adapter="apple_health"]'));
      check('connected OAuth row renders status and identity',
        ouraRow?.textContent.includes('connected') && ouraRow?.textContent.includes('oura@example.test'));
      check('legacy Fitbit reauth state explains self-host Google Health migration',
        fitbitRow?.textContent.includes('migration required')
        && fitbitRow?.textContent.includes('self-host only')
        && fitbitRow?.textContent.includes('Disconnect legacy Fitbit')
        && !fitbitRow?.textContent.includes('Connect Google Health')
        && !fitbitRow?.textContent.includes('Reconnect'));
      const ultrahumanDocsLink = ultrahumanRow?.querySelector('.wearable-row-detail a.wearable-row-link');
      check('experimental self-host setup row renders native docs link without Connect',
        ultrahumanRow?.textContent.includes('experimental · setup required')
        && ultrahumanDocsLink?.getAttribute('href') === 'https://docs.getbased.health/guides/self-hosting#wearable-oauth-apps'
        && !ultrahumanRow?.querySelector('[data-wearable-settings-action="connect"]')
        && !ultrahumanRow?.querySelector('summary a[href]'));
      check('manual row renders browser-populated counts',
        manualRow?.textContent.includes('Manual')
        && manualCounts.includes('1 weight')
        && manualCounts.includes('1 blood pressure')
        && manualCounts.includes('1 pulse'));
      check('Apple Health row renders file import management',
        appleRow?.textContent.includes('coverage-export.zip')
        && appleRow?.textContent.includes('42 days')
        && !!section.querySelector('#apple-health-file-input'));

      toggle.checked = false;
      toggle.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
      check('delegated strip visibility toggle stores per-profile hidden preference',
        settings.isWearableStripHidden() === true && localStorage.getItem(hiddenKey) === '1');
      toggle.checked = true;
      toggle.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
      check('delegated strip visibility toggle removes hidden preference',
        settings.isWearableStripHidden() === false && localStorage.getItem(hiddenKey) == null);

      const dashboardNavBefore = navigations.filter(route => route === 'dashboard').length;
      section.querySelector('[data-wearable-settings-action="manual-dashboard"]')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      await new Promise(resolve => requestAnimationFrame(resolve));
      const dashboardNavAfter = navigations.filter(route => route === 'dashboard').length;
      check('delegated manual dashboard action closes settings navigates and scrolls strip',
        closedSettings === 1
        && dashboardNavAfter === dashboardNavBefore + 1
        && scrolledToStrip === 1,
        JSON.stringify({ closedSettings, navigations, dashboardNavBefore, dashboardNavAfter, scrolledToStrip }));

      ultrahumanDocsLink?.addEventListener('click', event => {
        docsClicks.push({
          defaultPrevented: event.defaultPrevented,
          currentTarget: event.currentTarget === ultrahumanDocsLink,
        });
      });
      ultrahumanDocsLink?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      check('pending docs link reaches target uncanceled without toggling row',
        docsClicks.length === 1
        && docsClicks[0].currentTarget === true
        && docsClicks[0].defaultPrevented === false
        && !ultrahumanRow?.hasAttribute('open'),
        JSON.stringify({ docsClicks, rowOpen: ultrahumanRow?.hasAttribute('open') }));
    } finally {
      document.getElementById('wearables-section')?.remove();
      document.getElementById('wearable-strip')?.remove();
      await store.clearSource(profileId, 'manual').catch(() => {});
      if (oldActiveProfile == null) localStorage.removeItem('labcharts-active-profile');
      else localStorage.setItem('labcharts-active-profile', oldActiveProfile);
      if (oldHiddenValue == null) localStorage.removeItem(hiddenKey);
      else localStorage.setItem(hiddenKey, oldHiddenValue);
      if (oldBetaFlag == null) localStorage.removeItem(betaFlagKey);
      else localStorage.setItem(betaFlagKey, oldBetaFlag);
      state.currentProfile = oldCurrentProfile;
      state.profiles = oldProfiles;
      state.importedData = oldImportedData;
      settingsBridge.configureSettingsModuleBridge(previousSettingsBridge);
      settingsRuntime.configureWearableSettingsRuntimeDeps(previousSettingsRuntimeDeps);
      Element.prototype.scrollIntoView = oldScrollIntoView;
    }
    return failures;
  });

  expect(results).toEqual([]);
});

test('wearables settings panel browser coverage deletes manual data after confirmation', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });
  await page.waitForSelector('#notification-container', { state: 'attached' });

  const results = await page.evaluate(async () => {
    const failures = [];
    const check = (name, condition, detail = '') => {
      if (!condition) failures.push(detail ? `${name}: ${detail}` : name);
    };
    const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
    const waitUntil = async (predicate, label) => {
      for (let attempt = 0; attempt < 80; attempt += 1) {
        if (predicate()) return true;
        await wait(25);
      }
      failures.push(`Timed out waiting for ${label}`);
      return false;
    };

    const [{ state }, settings, store, settingsRuntime] = await Promise.all([
      import('/js/state.js'),
      import('/js/wearables-settings-panel.js'),
      import('/js/wearables-store.js'),
      import('/js/wearables-settings-runtime.js'),
    ]);

    const profileId = `wearables-settings-delete-${Date.now()}`;
    const oldActiveProfile = localStorage.getItem('labcharts-active-profile');
    const oldCurrentProfile = state.currentProfile;
    const oldProfiles = state.profiles;
    const oldImportedData = state.importedData;
    const oldSettingsRuntimeDeps = settingsRuntime.configureWearableSettingsRuntimeDeps();
    const navigations = [];
    const confirmMessages = [];

    try {
      localStorage.setItem('labcharts-active-profile', profileId);
      state.currentProfile = profileId;
      state.profiles = [{
        id: profileId,
        name: 'Wearables manual delete coverage',
        createdAt: Date.now(),
        lastUpdated: Date.now(),
        tags: [],
        notes: '',
        status: 'active',
        pinned: false,
      }];
      state.importedData = {
        entries: [],
        notes: [],
        supplements: [],
        healthGoals: [],
        diagnoses: null,
        wearableConnections: {
          manual: {
            connectedAt: Date.now() - 60 * 1000,
            lastSyncAt: Date.now() - 60 * 1000,
          },
        },
        wearableSummary: {
          summaryUpdatedAt: new Date().toISOString(),
          sources: { manual: { connectedSince: Date.now() - 60 * 1000, lastSyncAt: Date.now() - 60 * 1000 } },
          metrics: {},
        },
        customMarkers: {},
        markerNotes: {},
        markerValueNotes: {},
        changeHistory: [],
      };

      await store.clearSource(profileId, 'manual').catch(() => {});
      await store.upsertDailyBatch(profileId, [
        { source: 'manual', date: '2026-06-04', weight: 71.2, tags: ['morning-fasted'], note: 'coverage note' },
        { source: 'manual', date: '2026-06-05', rhr: 58 },
      ]);

      settingsRuntime.configureWearableSettingsRuntimeDeps({
        navigate: route => { navigations.push(route); },
        showConfirmDialog: async message => {
          confirmMessages.push(message);
          return true;
        },
      });
      document.body.insertAdjacentHTML('beforeend', `
        <section id="wearables-section">${settings.renderWearablesSettingsSection()}</section>
      `);

      document.querySelector('[data-wearable-settings-action="manual-disconnect"]')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      await waitUntil(
        () => state.importedData.wearableConnections?.manual == null
          && navigations.includes('dashboard')
          && (document.getElementById('notification-container')?.textContent || '').includes('All manual entries deleted'),
        'delegated manual disconnect to finish'
      );

      const rows = await store.getDailyRange(profileId, 'manual', '2000-01-01', '2099-12-31');
      const sectionText = document.getElementById('wearables-section')?.textContent || '';
      const toastText = document.getElementById('notification-container')?.textContent || '';

      check('manual disconnect prompts with destructive confirmation copy',
        confirmMessages.length === 1 && confirmMessages[0].includes('Delete all manual entries'));
      check('manual disconnect clears manual L1 rows', rows.length === 0);
      check('manual disconnect removes manual connection record',
        state.importedData.wearableConnections?.manual == null);
      check('manual disconnect refreshes settings row and dashboard',
        !sectionText.includes('Delete all manual entries') && navigations.includes('dashboard'));
      check('manual disconnect shows success toast',
        toastText.includes('All manual entries deleted'));
    } finally {
      document.getElementById('wearables-section')?.remove();
      document.querySelectorAll('.notification-toast').forEach(el => el.remove());
      await store.clearSource(profileId, 'manual').catch(() => {});
      if (oldActiveProfile == null) localStorage.removeItem('labcharts-active-profile');
      else localStorage.setItem('labcharts-active-profile', oldActiveProfile);
      state.currentProfile = oldCurrentProfile;
      state.profiles = oldProfiles;
      state.importedData = oldImportedData;
      settingsRuntime.configureWearableSettingsRuntimeDeps(oldSettingsRuntimeDeps);
    }
    return failures;
  });

  expect(results).toEqual([]);
});
