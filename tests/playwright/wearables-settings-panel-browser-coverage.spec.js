import { expect, test } from './coverage-fixture.js';

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

    const [{ state }, settings, store] = await Promise.all([
      import('/js/state.js'),
      import('/js/wearables-settings-panel.js'),
      import('/js/wearables-store.js'),
    ]);

    const profileId = `wearables-settings-render-${Date.now()}`;
    const hiddenKey = `wearables-strip-hidden-${profileId}`;
    const oldActiveProfile = localStorage.getItem('labcharts-active-profile');
    const oldHiddenValue = localStorage.getItem(hiddenKey);
    const oldCurrentProfile = state.currentProfile;
    const oldProfiles = state.profiles;
    const oldImportedData = state.importedData;
    const oldNavigate = window.navigate;
    const oldCloseSettings = window.closeSettings;
    const oldScrollIntoView = Element.prototype.scrollIntoView;
    const navigations = [];
    let closedSettings = 0;
    let scrolledToStrip = 0;

    try {
      localStorage.setItem('labcharts-active-profile', profileId);
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

      window.navigate = route => { navigations.push(route); };
      window.closeSettings = () => { closedSettings += 1; };
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
      const manualRow = section.querySelector('[data-adapter="manual"]');
      const appleRow = section.querySelector('[data-adapter="apple_health"]');
      const manualCounts = section.querySelector('[data-role="manual-counts"]')?.textContent || '';

      check('strip visible toggle starts checked', toggle?.checked === true);
      check('connected OAuth row renders status and identity',
        ouraRow?.textContent.includes('connected') && ouraRow?.textContent.includes('oura@example.test'));
      check('needs reauth row renders reconnect action',
        fitbitRow?.textContent.includes('needs reconnection') && fitbitRow?.textContent.includes('Reconnect'));
      check('manual row renders browser-populated counts',
        manualRow?.textContent.includes('Manual')
        && manualCounts.includes('1 weight')
        && manualCounts.includes('1 blood pressure')
        && manualCounts.includes('1 pulse'));
      check('Apple Health row renders file import management',
        appleRow?.textContent.includes('coverage-export.zip')
        && appleRow?.textContent.includes('42 days')
        && !!section.querySelector('#apple-health-file-input'));

      settings.setWearableStripHidden(true);
      check('setWearableStripHidden stores per-profile hidden preference',
        settings.isWearableStripHidden() === true && localStorage.getItem(hiddenKey) === '1');
      settings.setWearableStripHidden(false);
      check('setWearableStripHidden removes hidden preference',
        settings.isWearableStripHidden() === false && localStorage.getItem(hiddenKey) == null);

      const dashboardNavBefore = navigations.filter(route => route === 'dashboard').length;
      window.handleManualOpenDashboard();
      await new Promise(resolve => requestAnimationFrame(resolve));
      const dashboardNavAfter = navigations.filter(route => route === 'dashboard').length;
      check('manual dashboard handler closes settings navigates and scrolls strip',
        closedSettings === 1
        && dashboardNavAfter === dashboardNavBefore + 1
        && scrolledToStrip === 1,
        JSON.stringify({ closedSettings, navigations, dashboardNavBefore, dashboardNavAfter, scrolledToStrip }));
    } finally {
      document.getElementById('wearables-section')?.remove();
      document.getElementById('wearable-strip')?.remove();
      await store.clearSource(profileId, 'manual').catch(() => {});
      if (oldActiveProfile == null) localStorage.removeItem('labcharts-active-profile');
      else localStorage.setItem('labcharts-active-profile', oldActiveProfile);
      if (oldHiddenValue == null) localStorage.removeItem(hiddenKey);
      else localStorage.setItem(hiddenKey, oldHiddenValue);
      state.currentProfile = oldCurrentProfile;
      state.profiles = oldProfiles;
      state.importedData = oldImportedData;
      window.navigate = oldNavigate;
      window.closeSettings = oldCloseSettings;
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

    const [{ state }, settings, store] = await Promise.all([
      import('/js/state.js'),
      import('/js/wearables-settings-panel.js'),
      import('/js/wearables-store.js'),
    ]);

    const profileId = `wearables-settings-delete-${Date.now()}`;
    const oldActiveProfile = localStorage.getItem('labcharts-active-profile');
    const oldCurrentProfile = state.currentProfile;
    const oldProfiles = state.profiles;
    const oldImportedData = state.importedData;
    const oldNavigate = window.navigate;
    const oldShowConfirmDialog = window.showConfirmDialog;
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

      window.navigate = route => { navigations.push(route); };
      window.showConfirmDialog = async message => {
        confirmMessages.push(message);
        return true;
      };
      document.body.insertAdjacentHTML('beforeend', `
        <section id="wearables-section">${settings.renderWearablesSettingsSection()}</section>
      `);

      await window.handleManualDisconnect();

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
      window.navigate = oldNavigate;
      window.showConfirmDialog = oldShowConfirmDialog;
    }
    return failures;
  });

  expect(results).toEqual([]);
});
