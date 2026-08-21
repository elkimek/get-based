import { expect, test } from './coverage-fixture.js';

test('wearables strip actions cover stub collapse sync reorder move and manual save flows', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });
  await page.waitForSelector('#notification-container', { state: 'attached' });

  const failures = await page.evaluate(async () => {
    const [
      { state },
      store,
      { profileStorageKey },
      blobStorage,
      wearablesRuntime,
    ] = await Promise.all([
      import('/js/state.js'),
      import('/js/wearables-store.js'),
      import('/js/profile.js'),
      import('/js/blob-storage.js'),
      import('/js/wearables-runtime.js'),
    ]);
    const wearables = await import('/js/wearables.js');

    const failures = [];
    const check = (name, condition, detail = '') => {
      if (!condition) failures.push(detail ? `${name}: ${detail}` : name);
    };
    const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
    const waitFor = async (predicate, label, attempts = 120) => {
      for (let i = 0; i < attempts; i += 1) {
        if (await predicate()) return true;
        await wait(25);
      }
      failures.push(`Timed out waiting for ${label}`);
      return false;
    };

    const profileId = `wearables-strip-actions-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const importedStorageKey = profileStorageKey(profileId, 'imported');
    const hiddenKey = `wearables-strip-hidden-${profileId}`;
    const stubDismissedKey = `labcharts-wearable-stub-dismissed-${profileId}`;
    const originalActiveProfile = localStorage.getItem('labcharts-active-profile');
    const originalMockOff = localStorage.getItem('wearables-mock-off');
    const originalCollapsed = localStorage.getItem('wearables-strip-collapsed');
    const originalHidden = localStorage.getItem(hiddenKey);
    const originalStubDismissed = localStorage.getItem(stubDismissedKey);
    const originalImportedLocalValue = localStorage.getItem(importedStorageKey);
    const originalImportedBlobValue = await blobStorage.getBlob(importedStorageKey);
    const originalCurrentProfile = state.currentProfile;
    const originalProfiles = state.profiles;
    const originalImportedData = state.importedData;
    const originalReorderMode = state._wearableReorderMode;
    const originalUnitSystem = state.unitSystem;
    const host = document.createElement('section');
    const navigations = [];

    const renderStrip = () => {
      host.innerHTML = wearables.renderWearableStrip();
      return host.querySelector('#wearable-strip') || host.querySelector('.wearable-strip');
    };
    const previousWearablesRuntime = wearablesRuntime.configureWearablesRuntime({
      navigate: route => {
        navigations.push(route);
        if (route === 'dashboard') renderStrip();
      },
    });

    try {
      await store.deleteWearablesDB(profileId).catch(() => {});
      localStorage.setItem('labcharts-active-profile', profileId);
      localStorage.setItem('wearables-mock-off', '1');
      localStorage.removeItem('wearables-strip-collapsed');
      localStorage.removeItem(hiddenKey);
      localStorage.removeItem(stubDismissedKey);
      state.currentProfile = profileId;
      state.unitSystem = 'US';
      state.profiles = [{
        id: profileId,
        name: 'Wearables strip action coverage',
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
        wearableConnections: {},
        wearableSummary: null,
        customMarkers: {},
        markerNotes: {},
        markerValueNotes: {},
        changeHistory: [],
      };
      state._wearableReorderMode = false;
      document.body.appendChild(host);

      renderStrip();
      const stub = host.querySelector('.wearable-strip-stub');
      check('renderWearableStrip shows discovery stub when mock is suppressed and no summary exists', !!stub);
      stub?.querySelector('[data-wearable-action="dismiss-stub"]')?.click();
      await wait(20);
      check('dismiss wearable stub stores per-profile dismissal and navigates dashboard',
        localStorage.getItem(stubDismissedKey) === '1'
        && navigations.includes('dashboard'));

      state.importedData.wearableConnections = {
        manual: {
          source: 'manual',
          connectedAt: new Date().toISOString(),
          lastSyncAt: Date.now() - 15 * 60 * 60 * 1000,
          coverageDays: 0,
          needsReauth: false,
        },
      };
      state.importedData.wearableSummary = {
        summaryUpdatedAt: new Date().toISOString(),
        sources: {
          manual: {
            connectedSince: new Date().toISOString(),
            lastSyncAt: Date.now() - 15 * 60 * 60 * 1000,
            coverageDays: 0,
          },
        },
        metrics: {},
      };
      wearables.setWearableStripHidden(true);
      renderStrip();

      const grid = host.querySelector('.wearable-card-grid');
      const arrow = host.querySelector('.wearable-collapse-arrow');
      check('manual-only strip renders empty cards for hand logging',
        !!grid
        && !!host.querySelector('[data-empty-metric="weight"]')
        && !!host.querySelector('[data-empty-metric="bp_systolic"]')
        && !!host.querySelector('[data-empty-metric="rhr"]'));

      wearables.toggleWearableStrip();
      check('toggleWearableStrip collapses grid and updates persisted state',
        grid?.classList.contains('hidden')
        && arrow?.getAttribute('aria-expanded') === 'false'
        && localStorage.getItem('wearables-strip-collapsed') === '1');
      wearables.toggleWearableStrip();
      check('toggleWearableStrip expands grid and restores aria state',
        !grid?.classList.contains('hidden')
        && arrow?.getAttribute('aria-expanded') === 'true'
        && localStorage.getItem('wearables-strip-collapsed') === '0');

      const syncButton = document.createElement('button');
      syncButton.className = 'wearable-strip-sync';
      await wearables.syncWearableNow(syncButton);
      check('syncWearableNow disables and restores trigger around manual no-op sync',
        syncButton.disabled === false
        && !syncButton.classList.contains('is-syncing'));
      check('syncWearableNow reports already up to date for tokenless manual source',
        document.getElementById('notification-container')?.textContent.includes('already up to date'));

      wearables.toggleWearableReorder();
      await wait(20);
      check('toggleWearableReorder flips state and rerenders dashboard',
        state._wearableReorderMode === true
        && host.querySelector('.wearable-card-grid-reorder'));
      await wearables.moveWearableCard('weight', 1);
      await wait(20);
      check('moveWearableCard persists visible-order swap',
        Array.isArray(state.importedData.wearableCardOrder)
        && state.importedData.wearableCardOrder[0] === 'bp_systolic'
        && state.importedData.wearableCardOrder[1] === 'weight',
        JSON.stringify(state.importedData.wearableCardOrder || []));
      state._wearableReorderMode = false;
      renderStrip();

      wearables.openManualLogForm('weight');
      check('openManualLogForm renders weight form in empty card',
        !!host.querySelector('#wl-weight-val')
        && host.querySelector('#wl-weight-val')?.getAttribute('placeholder') === 'lb'
        && !!host.querySelector('#wl-weight-date')
        && !!host.querySelector('#wl-weight-note'));
      host.querySelector('#wl-weight-val').value = '180';
      host.querySelector('#wl-weight-date').value = '2026-06-10';
      host.querySelector('#wl-weight-note').value = 'coverage strip action';
      await wearables.saveManualLog('weight');
      const saved = await waitFor(async () => {
        const row = await store.getDaily(profileId, 'manual', '2026-06-10');
        return Math.abs((row?.weight || 0) - 81.6466) < 0.01
          && row?.note === 'coverage strip action';
      }, 'manual weight row to save');
      check('saveManualLog stores weight row note and refreshes manual connection',
        saved
        && !!state.importedData.wearableConnections?.manual
        && navigations.filter(route => route === 'dashboard').length >= 4);
    } finally {
      host.remove();
      await store.deleteWearablesDB(profileId).catch(() => {});
      if (originalImportedBlobValue == null) await blobStorage.deleteBlob(importedStorageKey);
      else await blobStorage.setBlob(importedStorageKey, originalImportedBlobValue);
      if (originalImportedLocalValue == null) localStorage.removeItem(importedStorageKey);
      else localStorage.setItem(importedStorageKey, originalImportedLocalValue);
      if (originalActiveProfile == null) localStorage.removeItem('labcharts-active-profile');
      else localStorage.setItem('labcharts-active-profile', originalActiveProfile);
      if (originalMockOff == null) localStorage.removeItem('wearables-mock-off');
      else localStorage.setItem('wearables-mock-off', originalMockOff);
      if (originalCollapsed == null) localStorage.removeItem('wearables-strip-collapsed');
      else localStorage.setItem('wearables-strip-collapsed', originalCollapsed);
      if (originalHidden == null) localStorage.removeItem(hiddenKey);
      else localStorage.setItem(hiddenKey, originalHidden);
      if (originalStubDismissed == null) localStorage.removeItem(stubDismissedKey);
      else localStorage.setItem(stubDismissedKey, originalStubDismissed);
      state.currentProfile = originalCurrentProfile;
      state.profiles = originalProfiles;
      state.importedData = originalImportedData;
      state._wearableReorderMode = originalReorderMode;
      state.unitSystem = originalUnitSystem;
      wearablesRuntime.configureWearablesRuntime(previousWearablesRuntime);
    }

    return failures;
  });

  expect(failures).toEqual([]);
});
