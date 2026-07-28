import { expect, test } from './coverage-fixture.js';

const facadeUrl = () => `/js/context-card-dashboard-ai.js?loaderCoverage=${Date.now()}-${Math.random().toString(36).slice(2)}`;
const syntheticDashboardAI = `
  let syncHandler = null;
  let deps = {};
  const record = (name, ...args) => {
    window.__dashboardAILoaderCalls ||= [];
    window.__dashboardAILoaderCalls.push([name, ...args]);
  };
  export function configureDashboardAISyncSetup(handler) {
    syncHandler = handler;
    record('configure-sync');
  }
  export function configureDashboardAIDataProtectionDeps(update = {}) {
    deps = { ...deps, ...update };
    record('configure-protection', Object.keys(update).sort().join(','));
    return {};
  }
  export function openDataProtectionPicker() {
    record('openDataProtectionPicker');
    syncHandler?.();
    deps.pickFolderForBackup?.();
    deps.showEnableEncryptionModal?.();
    return 'protection';
  }
  export function openContextModal() {
    record('openContextModal');
    return 'context';
  }
  export function openPersonalizeAIPicker() {
    record('openPersonalizeAIPicker');
    return 'personalize';
  }
  export function triggerDNAFilePicker() {
    record('triggerDNAFilePicker');
    return 'dna';
  }
`;

test.beforeEach(async ({ page }) => {
  await page.route('**/dashboard-ai-loader-coverage', route => route.fulfill({
    contentType: 'text/html',
    body: '<!doctype html><html><body><main id="fixture"></main><div id="notification-container"></div></body></html>',
  }));
});

test('dashboard AI modal loader stays cold, single-flights, and applies stored configuration', async ({ page }) => {
  await page.goto('/dashboard-ai-loader-coverage');
  const implementationRequests = [];
  await page.route('**/js/context-card-dashboard-ai-impl.js*', async route => {
    implementationRequests.push(route.request().url());
    await new Promise(resolve => setTimeout(resolve, 25));
    await route.fulfill({
      contentType: 'text/javascript',
      body: syntheticDashboardAI,
    });
  });

  const outcomes = await page.evaluate(async url => {
    const facade = await import(url);
    const callbackCalls = [];
    facade.configureDashboardAISyncSetup(() => callbackCalls.push('sync'));
    facade.configureDashboardAIDataProtectionDeps({
      pickFolderForBackup: () => callbackCalls.push('backup'),
      showEnableEncryptionModal: () => callbackCalls.push('encryption'),
    });
    const cold = !facade.isDashboardAIModuleLoaded();
    const coldMarkup = facade.renderDataProtectionCta({
      encryption: false,
      sync: false,
      backup: false,
      backupSupported: true,
    });
    const first = facade.loadDashboardAIModule();
    const second = facade.loadDashboardAIModule();
    const sharedPromise = first === second;
    await Promise.all([first, second]);
    return {
      cold,
      coldMarkup: coldMarkup.includes('Protect your data'),
      sharedPromise,
      loaded: facade.isDashboardAIModuleLoaded(),
      protection: facade.openDataProtectionPicker(),
      context: facade.openContextModal(),
      personalize: facade.openPersonalizeAIPicker(),
      dna: facade.triggerDNAFilePicker(),
      callbackCalls,
      implementationCalls: window.__dashboardAILoaderCalls || [],
    };
  }, facadeUrl());

  expect(implementationRequests).toHaveLength(1);
  expect(outcomes).toEqual({
    cold: true,
    coldMarkup: true,
    sharedPromise: true,
    loaded: true,
    protection: 'protection',
    context: 'context',
    personalize: 'personalize',
    dna: 'dna',
    callbackCalls: ['sync', 'backup', 'encryption'],
    implementationCalls: [
      ['configure-sync'],
      ['configure-protection', 'pickFolderForBackup,showEnableEncryptionModal'],
      ['openDataProtectionPicker'],
      ['openContextModal'],
      ['openPersonalizeAIPicker'],
      ['triggerDNAFilePicker'],
    ],
  });
});

test('first cold dashboard CTA click loads and runs its delegated action', async ({ page }) => {
  await page.goto('/dashboard-ai-loader-coverage');
  const implementationRequests = [];
  await page.route('**/js/context-card-dashboard-ai-impl.js*', route => {
    implementationRequests.push(route.request().url());
    return route.fulfill({
      contentType: 'text/javascript',
      body: syntheticDashboardAI,
    });
  });

  const loadedBeforeClick = await page.evaluate(async url => {
    const facade = await import(url);
    facade.configureDashboardAISyncSetup(() => {
      window.__dashboardAIFirstClickCallbacks ||= [];
      window.__dashboardAIFirstClickCallbacks.push('sync');
    });
    facade.configureDashboardAIDataProtectionDeps({
      pickFolderForBackup: () => {
        window.__dashboardAIFirstClickCallbacks ||= [];
        window.__dashboardAIFirstClickCallbacks.push('backup');
      },
      showEnableEncryptionModal: () => {
        window.__dashboardAIFirstClickCallbacks ||= [];
        window.__dashboardAIFirstClickCallbacks.push('encryption');
      },
    });
    const fixture = document.getElementById('fixture');
    fixture.innerHTML = facade.renderDataProtectionCta({
      encryption: false,
      sync: false,
      backup: false,
      backupSupported: true,
    });
    const loaded = facade.isDashboardAIModuleLoaded();
    fixture.querySelector('[data-dashboard-ai-action="open-data-protection-picker"]').click();
    return loaded;
  }, facadeUrl());

  expect(loadedBeforeClick).toBe(false);
  await expect.poll(() => page.evaluate(() => ({
    calls: window.__dashboardAILoaderCalls || [],
    callbacks: window.__dashboardAIFirstClickCallbacks || [],
  }))).toEqual({
    calls: [
      ['configure-sync'],
      ['configure-protection', 'pickFolderForBackup,showEnableEncryptionModal'],
      ['openDataProtectionPicker'],
    ],
    callbacks: ['sync', 'backup', 'encryption'],
  });
  expect(implementationRequests).toHaveLength(1);
});

test('dashboard AI modal loader retries with a fixed URL and reports the first failure', async ({ page }) => {
  await page.goto('/dashboard-ai-loader-coverage');
  const implementationRequests = [];
  await page.route('**/js/context-card-dashboard-ai-impl.js*', async route => {
    const url = route.request().url();
    implementationRequests.push(url);
    if (!url.includes('lazy-retry=1')) {
      await route.abort('failed');
      return;
    }
    await route.fulfill({
      contentType: 'text/javascript',
      body: syntheticDashboardAI,
    });
  });

  const outcomes = await page.evaluate(async url => {
    const facade = await import(url);
    const first = await facade.openContextModal();
    const notification = document.querySelector('#notification-container')?.textContent || '';
    const second = await facade.openContextModal();
    return {
      first,
      second,
      loaded: facade.isDashboardAIModuleLoaded(),
      notification,
    };
  }, facadeUrl());

  expect(implementationRequests).toHaveLength(2);
  expect(new URL(implementationRequests[0]).search).toBe('');
  expect(new URL(implementationRequests[1]).search).toBe('?lazy-retry=1');
  expect(outcomes).toEqual({
    first: false,
    second: 'context',
    loaded: true,
    notification: '✗ Dashboard context tools could not be loaded. Try again.',
  });
});
