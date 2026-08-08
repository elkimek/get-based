import { expect, test } from './coverage-fixture.js';

const facadeUrl = () => `/js/settings-sync-panel.js?loaderCoverage=${Date.now()}-${Math.random().toString(36).slice(2)}`;
const syntheticSettingsSyncPanel = `
  let deps = {};
  const record = (name, ...args) => {
    window.__settingsSyncPanelLoaderCalls ||= [];
    window.__settingsSyncPanelLoaderCalls.push([name, ...args]);
  };
  export function configureSettingsSyncPanelDeps(update = {}) {
    const previous = { ...deps };
    deps = { ...deps, ...update };
    record('configure', Object.keys(update).sort().join(','));
    return previous;
  }
  export function renderSyncSection() {
    record('renderSyncSection');
    return 'sync markup';
  }
  export function renderMessengerSection() {
    record('renderMessengerSection');
    return 'messenger markup';
  }
  export function showSyncSetupModal() {
    record('showSyncSetupModal');
    deps.applyPendingTombstone?.('apply');
    deps.listPendingTombstones?.();
    deps.pushContextToGateway?.();
    deps.rejectPendingTombstone?.('reject');
    deps.updateSyncIndicator?.();
    return 'shown';
  }
  export function closeSyncSetup() {
    record('closeSyncSetup');
    return 'closed-sync';
  }
  export function closeRestoreMnemonicDialog() {
    record('closeRestoreMnemonicDialog');
    return 'closed-restore';
  }
  export function hydrateSettingsSyncPanel() {
    record('hydrateSettingsSyncPanel');
    return 'hydrated';
  }
`;

test.beforeEach(async ({ page }) => {
  await page.route('**/settings-sync-panel-loader-coverage', route => route.fulfill({
    contentType: 'text/html',
    body: '<!doctype html><html><body><div id="notification-container"></div></body></html>',
  }));
});

test('Settings sync panel stays cold, single-flights, and applies stored configuration', async ({ page }) => {
  await page.goto('/settings-sync-panel-loader-coverage');
  const implementationRequests = [];
  await page.route('**/js/settings-sync-panel-impl.js*', async route => {
    implementationRequests.push(route.request().url());
    await new Promise(resolve => setTimeout(resolve, 25));
    await route.fulfill({
      contentType: 'text/javascript',
      body: syntheticSettingsSyncPanel,
    });
  });

  const outcomes = await page.evaluate(async url => {
    const facade = await import(url);
    const callbackCalls = [];
    facade.configureSettingsSyncPanelDeps({
      applyPendingTombstone: id => callbackCalls.push(`apply:${id}`),
      listPendingTombstones: () => callbackCalls.push('list'),
      pushContextToGateway: () => callbackCalls.push('push'),
      rejectPendingTombstone: id => callbackCalls.push(`reject:${id}`),
      updateSyncIndicator: () => callbackCalls.push('indicator'),
    });
    const cold = !facade.isSettingsSyncPanelLoaded();
    const coldCloseSync = facade.closeSyncSetup();
    const coldCloseRestore = facade.closeRestoreMnemonicDialog();
    const first = facade.loadSettingsSyncPanelModule();
    const second = facade.loadSettingsSyncPanelModule();
    const sharedPromise = first === second;
    await Promise.all([first, second]);
    return {
      cold,
      coldCloseSync,
      coldCloseRestore,
      sharedPromise,
      loaded: facade.isSettingsSyncPanelLoaded(),
      syncMarkup: facade.renderSyncSection(),
      messengerMarkup: facade.renderMessengerSection(),
      shown: facade.showSyncSetupModal(),
      closedSync: facade.closeSyncSetup(),
      closedRestore: facade.closeRestoreMnemonicDialog(),
      hydrated: facade.hydrateSettingsSyncPanel(),
      callbackCalls,
      implementationCalls: window.__settingsSyncPanelLoaderCalls || [],
    };
  }, facadeUrl());

  expect(implementationRequests).toHaveLength(1);
  expect(outcomes).toEqual({
    cold: true,
    coldCloseSync: undefined,
    coldCloseRestore: undefined,
    sharedPromise: true,
    loaded: true,
    syncMarkup: 'sync markup',
    messengerMarkup: 'messenger markup',
    shown: 'shown',
    closedSync: 'closed-sync',
    closedRestore: 'closed-restore',
    hydrated: 'hydrated',
    callbackCalls: ['apply:apply', 'list', 'push', 'reject:reject', 'indicator'],
    implementationCalls: [
      ['configure', 'applyPendingTombstone,listPendingTombstones,pushContextToGateway,rejectPendingTombstone,updateSyncIndicator'],
      ['renderSyncSection'],
      ['renderMessengerSection'],
      ['showSyncSetupModal'],
      ['closeSyncSetup'],
      ['closeRestoreMnemonicDialog'],
      ['hydrateSettingsSyncPanel'],
    ],
  });
});

test('cold Settings placeholders hydrate into interactive sync and Agent Access panels', async ({ page }) => {
  await page.goto('/settings-sync-panel-loader-coverage');
  await page.route('**/js/settings-sync-panel-impl.js*', route => route.fulfill({
    contentType: 'text/javascript',
    body: syntheticSettingsSyncPanel,
  }));

  const outcomes = await page.evaluate(async url => {
    document.body.insertAdjacentHTML('beforeend', `
      <section id="sync-section"></section>
      <section id="messenger-section"></section>
    `);
    const facade = await import(url);
    const syncSection = document.getElementById('sync-section');
    const messengerSection = document.getElementById('messenger-section');
    syncSection.innerHTML = facade.renderSyncSection();
    messengerSection.innerHTML = facade.renderMessengerSection();
    const cold = {
      sync: syncSection.textContent,
      messenger: messengerSection.textContent,
    };

    await facade.hydrateSettingsSyncPanel();

    return {
      cold,
      hydrated: {
        sync: syncSection.textContent,
        messenger: messengerSection.textContent,
      },
      placeholdersRemaining: document.querySelectorAll('[data-settings-sync-placeholder]').length,
      implementationCalls: window.__settingsSyncPanelLoaderCalls || [],
    };
  }, facadeUrl());

  expect(outcomes).toEqual({
    cold: {
      sync: 'Loading sync settings…',
      messenger: 'Loading Agent Access…',
    },
    hydrated: {
      sync: 'sync markup',
      messenger: 'messenger markup',
    },
    placeholdersRemaining: 0,
    implementationCalls: [
      ['configure', 'applyPendingTombstone,listPendingTombstones,pushContextToGateway,rejectPendingTombstone,updateSyncIndicator'],
      ['renderSyncSection'],
      ['renderMessengerSection'],
      ['hydrateSettingsSyncPanel'],
    ],
  });
});

test('Settings sync panel retries with a fixed URL and reports the first failure', async ({ page }) => {
  await page.goto('/settings-sync-panel-loader-coverage');
  const implementationRequests = [];
  await page.route('**/js/settings-sync-panel-impl.js*', async route => {
    const url = route.request().url();
    implementationRequests.push(url);
    if (!url.includes('lazy-retry=1')) {
      await route.abort('failed');
      return;
    }
    await route.fulfill({
      contentType: 'text/javascript',
      body: syntheticSettingsSyncPanel,
    });
  });

  const outcomes = await page.evaluate(async url => {
    const facade = await import(url);
    const first = await facade.showSyncSetupModal();
    const notification = document.querySelector('#notification-container')?.textContent || '';
    const second = await facade.showSyncSetupModal();
    return {
      first,
      second,
      loaded: facade.isSettingsSyncPanelLoaded(),
      notification,
    };
  }, facadeUrl());

  expect(implementationRequests).toHaveLength(2);
  expect(new URL(implementationRequests[0]).search).toBe('');
  expect(new URL(implementationRequests[1]).search).toBe('?lazy-retry=1');
  expect(outcomes).toEqual({
    first: false,
    second: 'shown',
    loaded: true,
    notification: '✗ Sync settings could not be loaded. Try again.',
  });
});
