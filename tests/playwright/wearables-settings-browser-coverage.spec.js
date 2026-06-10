import { expect, test } from './coverage-fixture.js';

function moduleUrl(path) {
  return `${path}?wearablesSettingsCoverage=${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

test('wearables settings browser coverage exercises import and connection actions', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });

  const failures = await page.evaluate(async ({ panelUrl, stateUrl, profileUrl, storeUrl, blobUrl }) => {
    const [{ state }, { profileStorageKey }, store, blobStorage] = await Promise.all([
      import(stateUrl),
      import(profileUrl),
      import(storeUrl),
      import(blobUrl),
    ]);
    await import(panelUrl);

    const failures = [];
    const check = (name, condition, detail = '') => {
      if (!condition) failures.push(detail ? `${name}: ${detail}` : name);
    };
    const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
    const waitFor = async (predicate, attempts = 300) => {
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
    const originalNavigate = window.navigate;
    const originalCloseSettings = window.closeSettings;
    const originalShowConfirmDialog = window.showConfirmDialog;
    const originalRequestAnimationFrame = window.requestAnimationFrame;
    const originalImportedLocalValue = localStorage.getItem(importedKey);
    const originalImportedBlobValue = await blobStorage.getBlob(importedKey);
    const originalStripHidden = localStorage.getItem(`wearables-strip-hidden-${profileId}`);
    const calls = [];

    const renderSettings = () => {
      let section = document.getElementById('wearables-section');
      if (!section) {
        section = document.createElement('section');
        section.id = 'wearables-section';
        document.body.append(section);
      }
      section.innerHTML = window.renderWearablesSettingsSection();
      document.dispatchEvent(new Event('settings:wearables-rendered'));
      return section;
    };

    try {
      await store.deleteWearablesDB(profileId).catch(() => {});
      localStorage.setItem('labcharts-active-profile', profileId);
      state.currentProfile = profileId;
      state.importedData = {
        entries: [],
        notes: [],
        supplements: [],
        healthGoals: [],
        diagnoses: null,
        wearableConnections: {},
        wearableSummary: null,
        changeHistory: [],
      };
      window.navigate = route => calls.push(['navigate', route]);

      const section = renderSettings();
      check('settings section renders Apple Health import controls',
        section.textContent.includes('Apple Health')
        && !!section.querySelector('#apple-health-file-input')
        && !!section.querySelector('.apple-health-dropzone'));

      window.setWearableStripHidden(true);
      const hiddenSet = window.isWearableStripHidden() === true
        && localStorage.getItem(`wearables-strip-hidden-${profileId}`) === '1';
      window.setWearableStripHidden(false);
      check('wearable strip hidden toggle persists per profile',
        hiddenSet
        && window.isWearableStripHidden() === false
        && calls.some(call => call[0] === 'navigate' && call[1] === 'dashboard'));

      window.handleWearableConnect('apple_health');
      await delay(20);
      check('connect handler reports non-oauth adapter error',
        document.body.textContent.includes('Connect failed: Adapter apple_health is not OAuth2'));

      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<HealthData>
  <Record type="HKQuantityTypeIdentifierBodyMass" sourceName="Coverage Scale" unit="kg" value="72.4" startDate="2026-06-01 08:00:00 +0000" endDate="2026-06-01 08:00:00 +0000"/>
      </HealthData>`;
      const file = new File([xml], 'export.xml', { type: 'application/xml' });
      window.handleAppleHealthDrop({ dataTransfer: { files: [file] } });
      let row = null;
      const imported = await waitFor(async () => {
        row = await store.getDaily(profileId, 'apple_health', '2026-06-01');
        return state.importedData.wearableConnections?.apple_health?.coverageDays === 1
          && row?.weight === 72.4
          && document.getElementById('wearables-section')?.textContent.includes('Imported from export.xml');
      });
      check('Apple Health drop imports file and refreshes settings',
        imported
        && row?.weight === 72.4
        && state.importedData.wearableConnections.apple_health.fileName === 'export.xml'
        && document.getElementById('wearables-section')?.textContent.includes('Imported from export.xml'));

      const badInput = {
        files: [new File(['not health xml'], 'notes.txt', { type: 'text/plain' })],
        value: 'notes.txt',
      };
      window.handleAppleHealthFilePick(badInput);
      const failedImportShown = await waitFor(() =>
        (document.querySelector('.apple-health-progress-text')?.textContent || '').includes('Unrecognised file type'));
      check('Apple Health file picker resets same-file value and surfaces import failure',
        badInput.value === ''
        && failedImportShown);

      state.importedData.wearableConnections.apple_health.accessToken = 'coverage-token';
      const syncButton = document.createElement('button');
      await window.handleWearableSyncNow('apple_health', syncButton);
      check('sync-now handler restores trigger state and navigates',
        !syncButton.disabled
        && !syncButton.classList.contains('is-syncing')
        && calls.filter(call => call[0] === 'navigate' && call[1] === 'dashboard').length >= 2);

      const beforeBackfill = state.importedData.wearableConnections.apple_health.lastSyncAt || 0;
      await window.handleWearableBackfill('apple_health');
      check('backfill handler updates connection and refreshes settings',
        (state.importedData.wearableConnections.apple_health.lastSyncAt || 0) >= beforeBackfill
        && document.getElementById('wearables-section')?.textContent.includes('Imported from export.xml'));

      const disconnectPromise = window.handleWearableDisconnect('apple_health');
      const confirmReady = await waitFor(() => !!document.getElementById('confirm-ok'));
      document.getElementById('confirm-ok')?.click();
      await disconnectPromise;
      check('disconnect handler confirms removes connection and re-renders import state',
        confirmReady
        && !state.importedData.wearableConnections.apple_health
        && document.getElementById('wearables-section')?.textContent.includes('file import only'));

      const strip = document.createElement('div');
      strip.id = 'wearable-strip';
      strip.scrollIntoView = () => calls.push(['scroll', 'wearable-strip']);
      document.body.append(strip);
      window.closeSettings = () => calls.push(['closeSettings']);
      window.requestAnimationFrame = callback => setTimeout(() => callback(Date.now()), 0);
      window.handleManualOpenDashboard();
      await waitFor(() => calls.some(call => call[0] === 'scroll' && call[1] === 'wearable-strip'));
      check('manual dashboard handler closes settings navigates and scrolls strip',
        calls.some(call => call[0] === 'closeSettings')
        && calls.some(call => call[0] === 'navigate' && call[1] === 'dashboard')
        && calls.some(call => call[0] === 'scroll' && call[1] === 'wearable-strip'));

      state.importedData.wearableConnections.manual = { connectedAt: new Date().toISOString() };
      await store.upsertDaily(profileId, {
        source: 'manual',
        date: '2026-06-02',
        weight: 80.2,
      });
      window.showConfirmDialog = async () => true;
      await window.handleManualDisconnect();
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
      state.importedData = originalImported;
      if (originalNavigate) window.navigate = originalNavigate;
      else delete window.navigate;
      if (originalCloseSettings) window.closeSettings = originalCloseSettings;
      else delete window.closeSettings;
      if (originalShowConfirmDialog) window.showConfirmDialog = originalShowConfirmDialog;
      else delete window.showConfirmDialog;
      window.requestAnimationFrame = originalRequestAnimationFrame;
      document.querySelectorAll('#wearables-section,#wearable-strip,#confirm-dialog-overlay,.notification-container').forEach(el => el.remove());
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
