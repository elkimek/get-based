import { expect, test } from './coverage-fixture.js';

test.setTimeout(30_000);

function moduleUrl(path) {
  return `${path}?startupHelpersCoverage=${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

async function openStartupFixture(page, dependencyRoutes) {
  await page.route('**/startup-helpers-browser-coverage', route => route.fulfill({
    status: 200,
    contentType: 'text/html',
    body: '<!doctype html><html><body><main id="fixture"></main></body></html>',
  }));

  for (const [glob, body] of Object.entries(dependencyRoutes)) {
    await page.route(glob, route => route.fulfill({
      contentType: 'application/javascript',
      body,
    }));
  }

  await page.goto('/startup-helpers-browser-coverage', { waitUntil: 'load' });
}

function expectOutcomes(outcomes) {
  for (const [name, passed] of Object.entries(outcomes)) {
    expect(passed, name).toBe(true);
  }
}

test('startup foundation initializes blocking services in order', async ({ page }) => {
  await openStartupFixture(page, {
    '**/js/crypto.js*': `
      export async function initEncryption() {
        window.__startupFoundationCalls.push('initEncryption');
      }
      export function initBroadcastChannel() {
        window.__startupFoundationCalls.push('initBroadcastChannel');
      }
      export async function initFolderBackup() {
        window.__startupFoundationCalls.push('initFolderBackup');
      }
    `,
    '**/js/sun-uvdata.js*': `
      export async function initMeteoConfigCache() {
        window.__startupFoundationCalls.push('initMeteoConfigCache');
      }
    `,
  });

  const outcomes = await page.evaluate(async ({ foundationUrl }) => {
    window.__startupFoundationCalls = [];
    const foundation = await import(foundationUrl);
    await foundation.initializeStartupFoundation();

    return {
      initializesServicesInBlockingOrder: JSON.stringify(window.__startupFoundationCalls) === JSON.stringify([
        'initEncryption',
        'initMeteoConfigCache',
        'initBroadcastChannel',
        'initFolderBackup',
      ]),
    };
  }, {
    foundationUrl: moduleUrl('/js/startup-foundation.js'),
  });

  expectOutcomes(outcomes);
});

test('startup profile migrates legacy storage and applies saved display state', async ({ page }) => {
  await openStartupFixture(page, {
    '**/js/state.js*': `
      export const state = window.__startupProfileState;
    `,
    '**/js/profile.js*': `
      export async function saveProfiles(profiles) {
        window.__startupProfileCalls.push(['saveProfiles', profiles.length, profiles[0]?.id]);
        localStorage.setItem('labcharts-profiles', JSON.stringify(profiles));
      }
      export function getActiveProfileId() {
        window.__startupProfileCalls.push(['getActiveProfileId']);
        return window.__activeProfileId || 'default';
      }
      export function setActiveProfileId(id) {
        window.__startupProfileCalls.push(['setActiveProfileId', id]);
        window.__activeProfileId = id;
      }
      export function getProfileSex(profileId) {
        window.__startupProfileCalls.push(['getProfileSex', profileId]);
        return window.__profileSex;
      }
      export function getProfileDob(profileId) {
        window.__startupProfileCalls.push(['getProfileDob', profileId]);
        return window.__profileDob;
      }
      export function profileStorageKey(profileId, key) {
        return 'labcharts-' + profileId + '-' + key;
      }
      export function migrateProfileData(importedData) {
        window.__startupProfileCalls.push(['migrateProfileData', Array.isArray(importedData.notes)]);
        importedData.migratedByProfileStub = true;
      }
      export async function initProfilesCache() {
        window.__startupProfileCalls.push(['initProfilesCache']);
      }
    `,
    '**/js/crypto.js*': `
      export function configureCryptoProfileDeps() {}
      export async function encryptedGetItem(key) {
        window.__encryptedReads.push(key);
        return localStorage.getItem(key);
      }
      export async function encryptedSetItem(key, value) {
        window.__encryptedWrites.push([key, value]);
        localStorage.setItem(key, value);
      }
    `,
    '**/js/data-merge.js*': `
      export function ensureImportedArray(importedData, key) {
        window.__startupProfileCalls.push(['ensureImportedArray', key]);
        if (!Array.isArray(importedData[key])) importedData[key] = [];
      }
    `,
  });

  const outcomes = await page.evaluate(async ({ profileUrl }) => {
    localStorage.clear();
    document.body.innerHTML = `
      <button class="unit-toggle-btn" data-unit="SI"></button>
      <button class="unit-toggle-btn" data-unit="US"></button>
      <button class="sex-toggle-btn" data-sex="male"></button>
      <button class="sex-toggle-btn" data-sex="female"></button>
      <button class="range-toggle-btn" data-range="optimal"></button>
      <button class="range-toggle-btn" data-range="both"></button>
      <input id="dob-input">
    `;
    window.__startupProfileCalls = [];
    window.__encryptedReads = [];
    window.__encryptedWrites = [];
    window.__activeProfileId = null;
    window.__profileSex = 'female';
    window.__profileDob = '1990-02-03';
    window.__startupProfileState = {
      currentProfile: '',
      importedData: {},
      unitSystem: 'SI',
      rangeMode: 'optimal',
      profileSex: null,
      profileDob: null,
    };
    localStorage.setItem('labcharts-imported', JSON.stringify({ entries: [{ date: '2026-06-01' }] }));
    localStorage.setItem('labcharts-units', 'US');
    localStorage.setItem('labcharts-default-rangeMode', 'both');

    const profile = await import(profileUrl);
    await profile.initializeProfileData();
    profile.applyProfileDisplayState();

    const activeUnit = document.querySelector('.unit-toggle-btn[data-unit="US"]');
    const inactiveUnit = document.querySelector('.unit-toggle-btn[data-unit="SI"]');
    const activeSex = document.querySelector('.sex-toggle-btn[data-sex="female"]');
    const activeRange = document.querySelector('.range-toggle-btn[data-range="both"]');
    const dobInput = document.getElementById('dob-input');

    return {
      legacyProfileStorageIsCreatedAndOldKeysRemoved:
        JSON.parse(localStorage.getItem('labcharts-profiles') || '[]')[0]?.id === 'default'
        && window.__activeProfileId === 'default'
        && localStorage.getItem('labcharts-imported') === null
        && localStorage.getItem('labcharts-units') === null,
      legacyImportedDataMovesThroughEncryptedStorage:
        window.__encryptedWrites.some(([key, value]) => key === 'labcharts-default-imported' && value.includes('2026-06-01'))
        && window.__encryptedReads.includes('labcharts-default-imported'),
      activeProfileDataLoadsAndMigrates:
        window.__startupProfileState.currentProfile === 'default'
        && Array.isArray(window.__startupProfileState.importedData.notes)
        && window.__startupProfileState.importedData.migratedByProfileStub === true
        && window.__startupProfileCalls.some(call => call[0] === 'initProfilesCache')
        && window.__startupProfileCalls.some(call => call[0] === 'ensureImportedArray' && call[1] === 'notes'),
      savedDisplayStateUpdatesStateAndControls:
        window.__startupProfileState.unitSystem === 'US'
        && window.__startupProfileState.rangeMode === 'both'
        && window.__startupProfileState.profileSex === 'female'
        && window.__startupProfileState.profileDob === '1990-02-03'
        && activeUnit.classList.contains('active')
        && !inactiveUnit.classList.contains('active')
        && activeSex.classList.contains('active')
        && activeRange.classList.contains('active')
        && dobInput.value === '1990-02-03',
    };
  }, {
    profileUrl: moduleUrl('/js/startup-profile.js'),
  });

  expectOutcomes(outcomes);
});

test('startup maintenance starts services and runs non-blocking migrations', async ({ page }) => {
  await openStartupFixture(page, {
    '**/js/state.js*': `
      export const state = window.__startupMaintenanceState;
    `,
    '**/js/wearables-connect.js*': `
      export function loadWearableRuntimeConfig() {
        window.__startupMaintenanceCalls.push('loadWearableRuntimeConfig');
        return Promise.resolve();
      }
      export function initWearableScheduler() {
        window.__startupMaintenanceCalls.push('initWearableScheduler');
      }
    `,
    '**/js/wearables-manual.js*': `
      export async function migrateBiometricsToManual(profileId, biometrics) {
        window.__startupMaintenanceCalls.push(['migrateBiometricsToManual', profileId, biometrics?.weight]);
      }
      export async function hasManualData(profileId) {
        window.__startupMaintenanceCalls.push(['hasManualData', profileId]);
        return true;
      }
    `,
    '**/js/light-devices.js*': `
      export async function hydrateDevicesFromPresets() {
        window.__startupMaintenanceCalls.push('hydrateDevicesFromPresets');
        return true;
      }
    `,
    '**/js/supplement-warnings.js*': `
      export async function preloadMitoCompoundData() {
        window.__startupMaintenanceCalls.push('preloadMitoCompoundData');
        return [];
      }
    `,
    '**/js/wearables-summary.js*': `
      export async function syncWearableSummary(profileId, sources) {
        window.__startupMaintenanceCalls.push(['syncWearableSummary', profileId, sources]);
      }
    `,
  });

  const outcomes = await page.evaluate(async ({ maintenanceUrl }) => {
    const originalSetTimeout = window.setTimeout;
    const originalConsoleLog = console.log;
    const logs = [];
    window.__startupMaintenanceCalls = [];
    window.__startupMaintenanceState = {
      currentProfile: 'startup-maintenance-profile',
      importedData: {
        biometrics: { weight: 70 },
        supplements: [{ name: 'Metformin' }],
        lightDevices: [{ id: 'coverage-light-device', presetId: 'coverage-preset' }],
        sunSessions: [{ id: 'coverage-stale-sun-session', endedAt: 1 }],
        wearableConnections: {
          manual: {
            connectedAt: '2026-07-01T00:00:00.000Z',
            lastSyncAt: 11,
          },
          oura: {
            accessToken: 'coverage-token',
            connectedAt: '2026-07-02T00:00:00.000Z',
            lastSyncAt: 22,
          },
        },
      },
    };
    const startupRuntime = await import('/js/startup-maintenance-runtime.js');
    const previousStartupSunDeps = startupRuntime.configureStartupMaintenanceSunDeps({
      getSunEngineVersion: () => 'maintenance-test',
      rehydrateStaleSessions: async () => {
        window.__startupMaintenanceCalls.push('rehydrateStaleSessions');
        return { rehydrated: 2 };
      },
    });

    window.setTimeout = (callback, delay, ...args) => {
      window.__startupMaintenanceCalls.push(['setTimeout', delay]);
      callback(...args);
      return 1;
    };
    console.log = (...args) => {
      logs.push(args.map(arg => String(arg)).join(' '));
    };
    const waitUntil = async predicate => {
      for (let attempt = 0; attempt < 500; attempt += 1) {
        if (predicate()) return true;
        await new Promise(resolve => originalSetTimeout(resolve, 10));
      }
      return false;
    };

    try {
      const maintenance = await import(maintenanceUrl);
      maintenance.runPostProfileStartupMaintenance();
      const maintenanceSettled = await waitUntil(() => window.__startupMaintenanceCalls
        .some(call => Array.isArray(call) && call[0] === 'syncWearableSummary')
        && window.__startupMaintenanceCalls.includes('initWearableScheduler')
        && window.__startupMaintenanceCalls.includes('hydrateDevicesFromPresets')
        && logs.some(line => line.includes('[light] hydrated user devices from preset library')));
      const trackedDeviceHydrationCount = window.__startupMaintenanceCalls
        .filter(call => call === 'hydrateDevicesFromPresets').length;
      window.__startupMaintenanceState.importedData.lightDevices = [];
      maintenance.runPostProfileStartupMaintenance();
      const emptyDeviceHydrationCount = window.__startupMaintenanceCalls
        .filter(call => call === 'hydrateDevicesFromPresets').length;

      return {
        startupServicesInitializeWearableConfigAndScheduler:
          window.__startupMaintenanceCalls.includes('loadWearableRuntimeConfig')
          && window.__startupMaintenanceCalls.includes('initWearableScheduler'),
        connectedWearableSchedulerStartsAfterProfileLoad:
          window.__startupMaintenanceCalls.includes('initWearableScheduler'),
        sunSessionRehydrateIsDeferredAndLogged:
          window.__startupMaintenanceCalls.some(call => Array.isArray(call) && call[0] === 'setTimeout' && call[1] === 1500)
          && window.__startupMaintenanceCalls.includes('rehydrateStaleSessions')
          && logs.some(line => line.includes('[sun] self-healed 2 session(s) under vmaintenance-test')),
        lightDeviceHydrationRunsAndLogsDirtyState:
          trackedDeviceHydrationCount === 1
          && logs.some(line => line.includes('[light] hydrated user devices from preset library')),
        emptyProfilesSkipLightDevicePresetHydration:
          emptyDeviceHydrationCount === trackedDeviceHydrationCount,
        trackedSupplementsPreloadWarningData:
          window.__startupMaintenanceCalls.includes('preloadMitoCompoundData'),
        legacyBiometricsMigrationRefreshesManualSummary:
          maintenanceSettled
          && window.__startupMaintenanceCalls.some(call => Array.isArray(call)
            && call[0] === 'migrateBiometricsToManual'
            && call[1] === 'startup-maintenance-profile'
            && call[2] === 70)
          && window.__startupMaintenanceCalls.some(call => Array.isArray(call)
            && call[0] === 'syncWearableSummary'
            && call[1] === 'startup-maintenance-profile'
            && JSON.stringify(call[2]) === JSON.stringify({
              manual: {
                connectedSince: '2026-07-01T00:00:00.000Z',
                lastSyncAt: 11,
              },
              oura: {
                connectedSince: '2026-07-02T00:00:00.000Z',
                lastSyncAt: 22,
              },
            })),
      };
    } finally {
      window.setTimeout = originalSetTimeout;
      console.log = originalConsoleLog;
      startupRuntime.configureStartupMaintenanceSunDeps(previousStartupSunDeps);
    }
  }, {
    maintenanceUrl: moduleUrl('/js/startup-maintenance.js'),
  });

  expectOutcomes(outcomes);
});

test('startup UI renders chrome and schedules deferred startup work', async ({ page }) => {
  await openStartupFixture(page, {
    '**/js/startup-profile.js*': `
      export function applyProfileDisplayState() {
        window.__startupUICalls.push('applyProfileDisplayState');
      }
    `,
    '**/js/theme.js*': `
      export function getTheme() {
        window.__startupUICalls.push('getTheme');
        return 'glass';
      }
      export function setTheme(theme) {
        window.__startupUICalls.push(['setTheme', theme]);
      }
    `,
    '**/js/data.js*': `
      export function updateHeaderDates() {
        window.__startupUICalls.push('updateHeaderDates');
      }
      export function updateHeaderRangeToggle() {
        window.__startupUICalls.push('updateHeaderRangeToggle');
      }
    `,
    '**/js/import-file-input.js*': `
      export function bindImportFileInput() {
        window.__startupUICalls.push('bindImportFileInput');
      }
    `,
    '**/js/health-data-loader.js*': `
      export function ensureDnaTablesForPersistedState() {
        window.__startupUICalls.push('ensureDnaTablesForPersistedState');
      }
    `,
    '**/js/changelog.js*': `
      export function maybeShowChangelog() {
        window.__startupUICalls.push('maybeShowChangelog');
      }
    `,
    '**/js/nav.js*': `
      export function buildSidebar() {
        window.__startupUICalls.push('buildSidebar');
      }
      export function renderProfileDropdown() {
        window.__startupUICalls.push('renderProfileDropdown');
      }
    `,
    '**/js/crypto.js*': `
      export function maybeShowBackupNudge() {
        window.__startupUICalls.push('maybeShowBackupNudge');
      }
    `,
    '**/js/sync.js*': `
      export function primeSyncState() {
        window.__startupUICalls.push('primeSyncState');
      }
      export async function initSync() {
        window.__startupUICalls.push('initSync');
      }
      export function renderSyncIndicator() {
        window.__startupUICalls.push('renderSyncIndicator');
      }
    `,
  });

  const outcomes = await page.evaluate(async ({ startupUiUrl }) => {
    const chatRuntime = await import('/js/chat-runtime.js');
    const originalSetTimeout = window.setTimeout;
    const originalRequestAnimationFrame = window.requestAnimationFrame;
    window.__startupUICalls = [];
    document.body.innerHTML = `
      <span id="app-version-text"></span>
      <div id="passphrase-overlay" style="display: none;"></div>
    `;
    window.APP_VERSION = 'startup-ui-test-version';
    const previousChatRuntime = chatRuntime.configureChatRuntimeCallbacks({
      updateChatNudge: () => window.__startupUICalls.push('updateChatNudge'),
    });
    window._openSettingsAfterInit = 'display';
    window._openChatAfterInit = true;
    window.requestAnimationFrame = callback => {
      window.__startupUICalls.push('requestAnimationFrame');
      callback(performance.now());
      return 1;
    };
    window.setTimeout = (callback, delay, ...args) => {
      window.__startupUICalls.push(['setTimeout', delay]);
      callback(...args);
      return 1;
    };

    const waitUntil = async predicate => {
      for (let attempt = 0; attempt < 50; attempt += 1) {
        if (predicate()) return true;
        await new Promise(resolve => originalSetTimeout(resolve, 10));
      }
      return false;
    };

    try {
      const startupUi = await import(startupUiUrl);
      startupUi.configureStartupUIDeps({
        getInitialView: () => 'light',
        initChatImageHandlers: () => {
          window.__startupUICalls.push('initChatImageHandlers');
        },
        maybeShowAnalyticsConsent: () => {
          window.__startupUICalls.push('maybeShowAnalyticsConsent');
        },
        navigate: view => {
          window.__startupUICalls.push(['navigate', view]);
        },
        openChatPanel: () => {
          window.__startupUICalls.push('openChatPanel');
        },
        openSettingsModal: section => {
          window.__startupUICalls.push(['openSettingsModal', section]);
        },
        updateAttachButtonVisibility: () => {
          window.__startupUICalls.push('updateAttachButtonVisibility');
        },
      });
      startupUi.renderStartupUI();
      const deferredWorkCompleted = await waitUntil(() => window.__startupUICalls
        .filter(call => call === 'renderSyncIndicator').length >= 2);

      return {
        footerVersionRendersFromAppVersion:
          document.getElementById('app-version-text')?.textContent === 'startup-ui-test-version',
        firstPaintChromeAndNavigationRun:
          window.__startupUICalls.includes('primeSyncState')
          && window.__startupUICalls.includes('applyProfileDisplayState')
          && window.__startupUICalls.some(call => Array.isArray(call) && call[0] === 'setTheme' && call[1] === 'glass')
          && window.__startupUICalls.includes('buildSidebar')
          && window.__startupUICalls.some(call => Array.isArray(call) && call[0] === 'navigate' && call[1] === 'light'),
        deferredSyncAndCatalogWarmupRun:
          deferredWorkCompleted
          && window.__startupUICalls.includes('requestAnimationFrame')
          && window.__startupUICalls.some(call => Array.isArray(call) && call[0] === 'setTimeout' && call[1] === 0)
          && window.__startupUICalls.includes('initSync')
          && window.__startupUICalls.includes('ensureDnaTablesForPersistedState'),
        changelogNudgesAndDeferredDestinationsRun:
          window.__startupUICalls.includes('maybeShowChangelog')
          && window.__startupUICalls.includes('maybeShowAnalyticsConsent')
          && window.__startupUICalls.includes('maybeShowBackupNudge')
          && window.__startupUICalls.some(call => Array.isArray(call) && call[0] === 'openSettingsModal' && call[1] === 'display')
          && window.__startupUICalls.includes('openChatPanel')
          && !('_openSettingsAfterInit' in window)
          && !('_openChatAfterInit' in window),
        chromeRefreshRunsAndChatAttachmentsStayDeferred:
          window.__startupUICalls.includes('updateHeaderDates')
          && window.__startupUICalls.includes('updateHeaderRangeToggle')
          && window.__startupUICalls.includes('renderProfileDropdown')
          && !window.__startupUICalls.includes('initChatImageHandlers')
          && !window.__startupUICalls.includes('updateAttachButtonVisibility')
          && window.__startupUICalls.includes('updateChatNudge')
          && window.__startupUICalls.includes('bindImportFileInput'),
      };
    } finally {
      chatRuntime.configureChatRuntimeCallbacks(previousChatRuntime);
      window.setTimeout = originalSetTimeout;
      window.requestAnimationFrame = originalRequestAnimationFrame;
      delete window._openSettingsAfterInit;
      delete window._openChatAfterInit;
    }
  }, {
    startupUiUrl: moduleUrl('/js/startup-ui.js'),
  });

  expectOutcomes(outcomes);
});
