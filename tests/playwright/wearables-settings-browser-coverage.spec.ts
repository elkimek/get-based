import { createModuleUrl } from '../helpers/browser-module-url.js';
import { expect, test } from './coverage-fixture.js';

const moduleUrl = createModuleUrl('wearablesSettingsCoverage');

test('wearables settings browser coverage exercises import and connection actions', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });
  await page.waitForSelector('#notification-container', { state: 'attached' });

  const failures = await page.evaluate(async ({ panelUrl, stateUrl, profileUrl, storeUrl, blobUrl }) => {
    const [{ state }, { profileStorageKey }, store, blobStorage, settingsRuntime, settingsBridge, panel] = await Promise.all([
      (import(stateUrl) as Promise<unknown>) as Promise<Pick<typeof import('../../js/state.js'), "state">>,
      (import(profileUrl) as Promise<unknown>) as Promise<Pick<typeof import('../../js/profile.js'), "profileStorageKey">>,
      (import(storeUrl) as Promise<unknown>) as Promise<Pick<typeof import('../../js/wearables-store.js'), "deleteWearablesDB" | "getDaily" | "upsertDaily" | "countSource">>,
      (import(blobUrl) as Promise<unknown>) as Promise<Pick<typeof import('../../js/blob-storage.js'), "getBlob" | "deleteBlob" | "setBlob">>,
      import('/js/wearables-settings-runtime.js'),
      import('/js/settings-runtime-bridge.js'),
      (import(panelUrl) as Promise<unknown>) as Promise<Pick<typeof import('../../js/wearables-settings-panel.js'), "wearableSettingsActionHandlers" | "renderWearablesSettingsSection" | "setWearableStripHidden" | "isWearableStripHidden">>,
    ]);
    const actions = panel.wearableSettingsActionHandlers;

    const failures: string[] = [];
    const check = (name: string, condition: unknown, detail = '') => {
      if (!condition) failures.push(detail ? `${name}: ${detail}` : name);
    };
    const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
    const waitFor = async (predicate: () => unknown | Promise<unknown>, attempts = 300) => {
      for (let i = 0; i < attempts; i += 1) {
        if (await predicate()) return true;
        await delay(10);
      }
      return false;
    };

    const profileId = `wearables-settings-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const importedKey = profileStorageKey(profileId, 'imported');
    const originalActiveProfile = localStorage.getItem('labcharts-active-profile');
    const originalCurrentProfile = state.currentProfile;
    const originalImported = state.importedData;
    const originalSettingsRuntimeDeps = settingsRuntime.configureWearableSettingsRuntimeDeps();
    const originalRequestAnimationFrame = window.requestAnimationFrame;
    const originalImportedLocalValue = localStorage.getItem(importedKey);
    const originalImportedBlobValue = await blobStorage.getBlob(importedKey);
    const originalStripHidden = localStorage.getItem(`wearables-strip-hidden-${profileId}`);
    const calls: unknown[][] = [];
    const previousSettingsBridge = settingsBridge.configureSettingsModuleBridge({
      closeSettingsModal: () => calls.push(['closeSettingsModal']),
    });

    const renderSettings = () => {
      let section = document.getElementById('wearables-section');
      if (!section) {
        section = document.createElement('section');
        section.id = 'wearables-section';
        document.body.append(section);
      }
      section.innerHTML = panel.renderWearablesSettingsSection();
      document.dispatchEvent(new Event('settings:wearables-rendered'));
      return section;
    };

    try {
      await store.deleteWearablesDB(profileId).catch(() => {});
      localStorage.setItem('labcharts-active-profile', profileId);
      state.currentProfile = profileId;
      (state as {importedData: unknown}).importedData = {
        entries: [],
        notes: [],
        supplements: [],
        healthGoals: [],
        diagnoses: null,
        wearableConnections: {},
        wearableSummary: null,
        changeHistory: [],
      };
      settingsRuntime.configureWearableSettingsRuntimeDeps({
        navigate: (route: string) => calls.push(['navigate', route]),
      });

      const section = renderSettings();
      check('settings section renders Apple Health import controls',
        section.textContent.includes('Apple Health')
        && !!section.querySelector('#apple-health-file-input')
        && !!section.querySelector('.apple-health-dropzone'));

      panel.setWearableStripHidden(true);
      const hiddenSet = panel.isWearableStripHidden() === true
        && localStorage.getItem(`wearables-strip-hidden-${profileId}`) === '1';
      panel.setWearableStripHidden(false);
      check('wearable strip hidden toggle persists per profile',
        hiddenSet
        && panel.isWearableStripHidden() === false
        && calls.some(call => call[0] === 'navigate' && call[1] === 'dashboard'));

      actions.handleWearableConnect('apple_health');
      const connectFailureShown = await waitFor(() =>
        document.body.textContent.includes('Connect failed: Adapter apple_health is not OAuth2'));
      check('connect handler reports non-oauth adapter error',
        connectFailureShown);

      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<HealthData>
  <Record type="HKQuantityTypeIdentifierBodyMass" sourceName="Coverage Scale" unit="kg" value="72.4" startDate="2026-06-01 08:00:00 +0000" endDate="2026-06-01 08:00:00 +0000"/>
      </HealthData>`;
      const file = new File([xml], 'export.xml', { type: 'application/xml' });
      (actions.handleAppleHealthDrop as unknown as (event: {dataTransfer: {files: File[]}}) => ReturnType<typeof actions.handleAppleHealthDrop>)({ dataTransfer: { files: [file] } });
      let row: Awaited<ReturnType<typeof store.getDaily>> = null;
      const imported = await waitFor(async () => {
        row = await store.getDaily(profileId, 'apple_health', '2026-06-01');
        return state.importedData.wearableConnections?.apple_health?.coverageDays === 1
          && (row as Awaited<ReturnType<typeof store.getDaily>>)?.weight === 72.4
          && document.getElementById('wearables-section')?.textContent.includes('Imported from export.xml');
      });
      check('Apple Health drop imports file and refreshes settings',
        imported
        && (row as Awaited<ReturnType<typeof store.getDaily>>)?.weight === 72.4
        && state.importedData.wearableConnections.apple_health.fileName === 'export.xml'
        && document.getElementById('wearables-section')?.textContent.includes('Imported from export.xml'));

      const badInput = {
        files: [new File(['not health xml'], 'notes.txt', { type: 'text/plain' })],
        value: 'notes.txt',
      };
      (actions.handleAppleHealthFilePick as unknown as (input: typeof badInput) => ReturnType<typeof actions.handleAppleHealthFilePick>)(badInput);
      const failedImportShown = await waitFor(() =>
        (document.querySelector<HTMLElement>('.apple-health-progress-text')?.textContent || '').includes('Unrecognised file type'));
      check('Apple Health file picker resets same-file value and surfaces import failure',
        badInput.value === ''
        && failedImportShown);

      state.importedData.wearableConnections.apple_health.accessToken = 'coverage-token';
      const syncButton = document.createElement('button');
      const dashboardNavigationsBeforeSync = calls.filter(call => call[0] === 'navigate' && call[1] === 'dashboard').length;
      await actions.handleWearableSyncNow('apple_health', syncButton);
      check('sync-now handler restores trigger state and navigates',
        !syncButton.disabled
        && !syncButton.classList.contains('is-syncing')
        && calls.filter(call => call[0] === 'navigate' && call[1] === 'dashboard').length === dashboardNavigationsBeforeSync + 1);

      const beforeBackfill: unknown = state.importedData.wearableConnections.apple_health.lastSyncAt || 0;
      await actions.handleWearableBackfill('apple_health');
      check('backfill handler updates connection and refreshes settings',
        ((state.importedData.wearableConnections.apple_health.lastSyncAt || 0) as number) >= (beforeBackfill as number)
        && document.getElementById('wearables-section')?.textContent.includes('Imported from export.xml'));

      const disconnectPromise = actions.handleWearableDisconnect('apple_health');
      const confirmReady = await waitFor(() => !!document.getElementById('confirm-ok'));
      document.getElementById('confirm-ok')?.click();
      await disconnectPromise;
      check('disconnect handler confirms removes connection and re-renders import state',
        confirmReady
        && !state.importedData.wearableConnections.apple_health
        && document.getElementById('wearables-section')?.textContent.includes('Import from a file'));

      const strip = document.createElement('div');
      strip.id = 'wearable-strip';
      strip.scrollIntoView = () => calls.push(['scroll', 'wearable-strip']);
      document.body.append(strip);
      (window as {requestAnimationFrame: unknown}).requestAnimationFrame = (callback: FrameRequestCallback) => setTimeout(() => callback(Date.now()), 0);
      actions.handleManualOpenDashboard();
      await waitFor(() => calls.some(call => call[0] === 'scroll' && call[1] === 'wearable-strip'));
      check('manual dashboard handler closes settings navigates and scrolls strip',
        calls.some(call => call[0] === 'closeSettingsModal')
        && calls.some(call => call[0] === 'navigate' && call[1] === 'dashboard')
        && calls.some(call => call[0] === 'scroll' && call[1] === 'wearable-strip'));

      state.importedData.wearableConnections.manual = { connectedAt: new Date().toISOString() };
      await store.upsertDaily(profileId, {
        source: 'manual',
        date: '2026-06-02',
        weight: 80.2,
      });
      if (!await (await import('/js/data.js')).saveImportedData()) throw new Error('Could not persist manual connection fixture');
      settingsRuntime.configureWearableSettingsRuntimeDeps({ showConfirmDialog: async () => true });
      await actions.handleManualDisconnect();
      const manualRows = await store.countSource(profileId, 'manual');
      check('manual disconnect handler clears manual rows and connection',
        manualRows === 0
        && !state.importedData.wearableConnections.manual);
    } finally {
      await store.deleteWearablesDB(profileId).catch(() => {});
      if (originalImportedBlobValue == null) await blobStorage.deleteBlob(importedKey);
      else await blobStorage.setBlob(importedKey, originalImportedBlobValue);
      if (originalImportedLocalValue == null) localStorage.removeItem(importedKey);
      else localStorage.setItem(importedKey, originalImportedLocalValue);
      if (originalStripHidden == null) localStorage.removeItem(`wearables-strip-hidden-${profileId}`);
      else localStorage.setItem(`wearables-strip-hidden-${profileId}`, originalStripHidden);
      if (originalActiveProfile) localStorage.setItem('labcharts-active-profile', originalActiveProfile);
      else localStorage.removeItem('labcharts-active-profile');
      state.currentProfile = originalCurrentProfile;
      (state as {importedData: unknown}).importedData = originalImported;
      settingsBridge.configureSettingsModuleBridge(previousSettingsBridge);
      settingsRuntime.configureWearableSettingsRuntimeDeps(originalSettingsRuntimeDeps);
      (window as {requestAnimationFrame: unknown}).requestAnimationFrame = originalRequestAnimationFrame;
      document.querySelectorAll<HTMLElement>('#wearables-section,#wearable-strip,#confirm-dialog-overlay,.notification-container').forEach(el => el.remove());
    }

    return failures;
  }, {
    panelUrl: moduleUrl('/js/wearables-settings-panel.js'),
    stateUrl: '/js/state.js',
    profileUrl: '/js/profile.js',
    storeUrl: '/js/wearables-store.js',
    blobUrl: '/js/blob-storage.js',
  });

  expect(failures).toEqual([]);
});
