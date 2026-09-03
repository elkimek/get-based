import { expect, test } from './coverage-fixture.js';

async function openBlankPage(page, path) {
  await page.route(`**${path}`, route => route.fulfill({
    status: 200,
    contentType: 'text/html',
    body: '<!doctype html><html><body><main id="main-content"></main></body></html>',
  }));
  await page.goto(path, { waitUntil: 'load' });
}

function syntheticSettingsModule() {
  return `
    globalThis.__settingsModuleEvalCount = (globalThis.__settingsModuleEvalCount || 0) + 1;
    export function configureSettingsRuntime(runtime) {
      globalThis.__settingsRuntimeConfigs = [
        ...(globalThis.__settingsRuntimeConfigs || []),
        runtime.marker,
      ];
    }
    export function openSettingsModal(tab) {
      globalThis.__openedSettingsTabs = [...(globalThis.__openedSettingsTabs || []), tab];
      return tab;
    }
    export function closeSettingsModal() { return 'closed-settings'; }
    export function openTweaksPanel() { return 'opened-tweaks'; }
    export function closeTweaksPanel() { return 'closed-tweaks'; }
    export function updatePrivacyStatusCard() {
      globalThis.__settingsRefreshes = [...(globalThis.__settingsRefreshes || []), 'privacy'];
    }
    export function updateSettingsUI() {
      globalThis.__settingsRefreshes = [...(globalThis.__settingsRefreshes || []), 'settings'];
    }
    export function updateTweaksUI() {
      globalThis.__settingsRefreshes = [...(globalThis.__settingsRefreshes || []), 'tweaks'];
    }
  `;
}

test('Settings loader caches initialization and preserves lazy bridge actions', async ({ page }) => {
  let settingsRequests = 0;
  let settingsStylesheetRequests = 0;
  await page.route('**/js/settings.js*', route => {
    settingsRequests += 1;
    return route.fulfill({
      status: 200,
      contentType: 'application/javascript',
      body: syntheticSettingsModule(),
    });
  });
  await page.route('**/css/settings.css*', route => {
    settingsStylesheetRequests += 1;
    return route.fulfill({
      status: 200,
      contentType: 'text/css',
      body: '.settings-modal { display: block; }',
    });
  });
  await openBlankPage(page, '/settings-loader-cache-coverage');

  const results = await page.evaluate(async () => {
    const loader = await import('/js/settings-loader.js');
    const bridge = await import('/js/settings-runtime-bridge.js');
    const startsUnloaded = loader.isSettingsModuleLoaded() === false;
    const unloadedRefreshStaysLazy =
      bridge.getSettingsModuleFunction('updateSettingsUI')?.() === undefined;
    const previous = loader.configureSettingsLoader({
      configureModule(module) {
        module.configureSettingsRuntime({ marker: 'configured-once' });
      },
    });
    const [first, second] = await Promise.all([
      loader.loadSettingsModule(),
      loader.loadSettingsModule(),
    ]);
    const third = await loader.loadSettingsModule();
    const openedTab = await bridge.getSettingsModuleFunction('openSettingsModal')?.('privacy');
    const closedSettings = await bridge.getSettingsModuleFunction('closeSettingsModal')?.();
    const openedTweaks = await bridge.getSettingsModuleFunction('openTweaksPanel')?.();
    const closedTweaks = await bridge.getSettingsModuleFunction('closeTweaksPanel')?.();
    await bridge.getSettingsModuleFunction('updatePrivacyStatusCard')?.();
    await bridge.getSettingsModuleFunction('updateSettingsUI')?.();
    await bridge.getSettingsModuleFunction('updateTweaksUI')?.();
    loader.configureSettingsLoader(previous);
    return {
      startsUnloaded,
      unloadedRefreshStaysLazy,
      concurrentCallsShareModuleNamespace: first === second,
      laterCallsReuseModuleNamespace: first === third,
      loadedStateFlipsAfterInitialization: loader.isSettingsModuleLoaded() === true,
      lazyModuleEvaluatesOnce: globalThis.__settingsModuleEvalCount === 1,
      runtimeConfiguredOnce:
        globalThis.__settingsRuntimeConfigs?.length === 1
        && globalThis.__settingsRuntimeConfigs[0] === 'configured-once',
      bridgeOpensRequestedTab:
        openedTab === 'privacy'
        && globalThis.__openedSettingsTabs?.length === 1
        && globalThis.__openedSettingsTabs[0] === 'privacy',
      bridgeRunsRemainingModalActions:
        closedSettings === 'closed-settings'
        && openedTweaks === 'opened-tweaks'
        && closedTweaks === 'closed-tweaks',
      bridgeRefreshesLoadedSettings:
        globalThis.__settingsRefreshes?.join(',') === 'privacy,settings,tweaks',
    };
  });
  results.lazyModuleRequestedOnce = settingsRequests === 1;
  results.lazyStylesheetRequestedOnce = settingsStylesheetRequests === 1;

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});

test('Settings loader retries direct loads after a failed import', async ({ page }) => {
  let settingsRequests = 0;
  await page.route('**/js/settings.js*', route => {
    settingsRequests += 1;
    if (settingsRequests === 1) return route.abort('failed');
    return route.fulfill({
      status: 200,
      contentType: 'application/javascript',
      body: syntheticSettingsModule(),
    });
  });
  await openBlankPage(page, '/settings-loader-retry-coverage');

  const results = await page.evaluate(async () => {
    const loader = await import('/js/settings-loader.js');
    let firstRejected = false;
    try {
      await loader.loadSettingsModule();
    } catch {
      firstRejected = true;
    }
    const retried = await loader.loadSettingsModule();
    return {
      firstRejected,
      retrySucceeds: retried.openSettingsModal('display') === 'display',
      loadedAfterRetry: loader.isSettingsModuleLoaded() === true,
    };
  });
  results.retryIssuedSecondRequest = settingsRequests === 2;

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});

test('Settings loader retries a failed stylesheet without re-evaluating its module', async ({ page }) => {
  let settingsRequests = 0;
  let settingsStylesheetRequests = 0;
  await page.route('**/js/settings.js*', route => {
    settingsRequests += 1;
    return route.fulfill({
      status: 200,
      contentType: 'application/javascript',
      body: syntheticSettingsModule(),
    });
  });
  await page.route('**/css/settings.css*', route => {
    settingsStylesheetRequests += 1;
    if (settingsStylesheetRequests === 1) return route.abort('failed');
    return route.fulfill({
      status: 200,
      contentType: 'text/css',
      body: '.settings-modal { display: block; }',
    });
  });
  await openBlankPage(page, '/settings-stylesheet-retry-coverage');

  const results = await page.evaluate(async () => {
    const loader = await import('/js/settings-loader.js');
    let firstRejected = false;
    try {
      await loader.loadSettingsModule();
    } catch {
      firstRejected = true;
    }
    const retried = await loader.loadSettingsModule();
    const stylesheet = document.querySelector('link[data-settings-stylesheet]');
    return {
      firstRejected,
      retrySucceeds: retried.openSettingsModal('display') === 'display',
      loadedAfterRetry: loader.isSettingsModuleLoaded() === true,
      moduleEvaluatedOnce: globalThis.__settingsModuleEvalCount === 1,
      retryUsesFixedStylesheetUrl: stylesheet?.href.includes('lazy-retry=1') === true,
    };
  });
  results.moduleRequestedOnce = settingsRequests === 1;
  results.stylesheetRequestedTwice = settingsStylesheetRequests === 2;

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});

test('Settings model selects use a persistent picker on desktop', async ({ page }) => {
  await page.route('**/settings-model-select-coverage', route => route.fulfill({
    status: 200,
    contentType: 'text/html',
    body: `<!doctype html>
      <html data-theme="dark">
        <head><link rel="stylesheet" href="/css/settings.css"></head>
        <body>
          <div class="settings-modal">
            <select id="model-select" class="api-key-input">
              <option>Model one</option>
              <option>Model two</option>
            </select>
          </div>
        </body>
      </html>`,
  }));
  await page.goto('/settings-model-select-coverage', { waitUntil: 'load' });

  const modelSelect = page.locator('#model-select');
  await expect(modelSelect).toBeVisible();
  const pickerSupport = await page.evaluate(() => CSS.supports('appearance', 'base-select'));

  if (pickerSupport) {
    await expect(modelSelect).toHaveCSS('appearance', 'base-select');
    await modelSelect.click({ position: { x: 20, y: 20 } });
    await expect.poll(() => modelSelect.evaluate(select => select.matches(':open'))).toBe(true);
    await page.keyboard.press('Escape');
  } else {
    await expect(modelSelect).not.toHaveCSS('appearance', 'none');
  }
});

test('Settings lazy entry points contain load failures', async ({ page }) => {
  let settingsRequests = 0;
  await page.route('**/js/settings.js*', route => {
    settingsRequests += 1;
    return route.abort('failed');
  });
  await openBlankPage(page, '/settings-loader-entry-failure-coverage');

  const actionFailureContained = await page.evaluate(async () => (
    (await import('/js/settings-loader.js')).openSettingsModal('privacy')
  )) === false;
  expect(actionFailureContained).toBe(true);
  expect(settingsRequests).toBe(1);
});

test('returning-user startup defers Settings until a shell action opens it', async ({ page }) => {
  let settingsRequests = 0;
  let settingsStylesheetRequests = 0;
  let settingsSyncPanelImplementationRequests = 0;
  page.on('request', request => {
    const pathname = new URL(request.url()).pathname;
    if (pathname === '/js/settings.js') settingsRequests += 1;
    if (pathname === '/css/settings.css') settingsStylesheetRequests += 1;
    if (pathname === '/js/settings-sync-panel-impl.js') settingsSyncPanelImplementationRequests += 1;
  });
  await page.addInitScript(() => {
    localStorage.setItem('labcharts-accent-override', 'blue');
    localStorage.setItem('labcharts-default-onboarded', 'profile-set');
    localStorage.setItem('labcharts-default-emptyTour', 'completed');
    localStorage.setItem('labcharts-default-tour', 'completed');
    localStorage.setItem('labcharts-default-ai-reminder-dismissed', '1');
    localStorage.setItem('labcharts-onboard-extras-done-default', '1');
    localStorage.setItem('labcharts-onboard-provider-skipped-default', '1');
    localStorage.setItem('labcharts-analytics-consent-seen', '1');
  });

  await page.goto('/app', { waitUntil: 'networkidle' });
  expect(settingsRequests).toBe(0);
  expect(settingsStylesheetRequests).toBe(0);
  expect(settingsSyncPanelImplementationRequests).toBe(0);
  await expect(page.locator('link[data-settings-stylesheet]')).toHaveCount(0);
  await expect(page.locator('link[data-data-protection-stylesheet]')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => (
    document.documentElement.style.getPropertyValue('--accent')
  ))).toBe('#4f8cff');
  await page.locator('[data-shell-action="open-settings"]').evaluate(button => button.click());
  await expect(page.locator('#settings-modal-overlay')).toHaveClass(/show/);
  await expect(page.locator('[data-settings-tab="display"]')).toHaveAttribute('aria-selected', 'true');
  expect(settingsRequests).toBe(1);
  expect(settingsStylesheetRequests).toBe(1);
  expect(settingsSyncPanelImplementationRequests).toBe(1);
  await expect(page.locator('link[data-settings-stylesheet]')).toHaveCount(1);
  await expect(page.locator('link[data-data-protection-stylesheet]')).toHaveCount(1);
  await expect(page.locator('#settings-modal .settings-layout')).toHaveCSS('display', 'grid');
  await expect.poll(() => page.evaluate(async () => (
    (await import('/js/settings-loader.js')).isSettingsModuleLoaded()
  ))).toBe(true);
  await expect.poll(() => page.evaluate(async () => (
    (await import('/js/settings-sync-panel.js')).isSettingsSyncPanelLoaded()
  ))).toBe(true);
  await expect(page.locator('#messenger-section [data-sync-action="toggle-messenger"]')).toHaveCount(1);
  await expect(page.locator('#settings-modal [data-settings-sync-placeholder]')).toHaveCount(0);
  await page.locator('[data-settings-tab="agent"]').click();
  const agentAccessSlider = page.locator(
    '#messenger-section [data-sync-action="toggle-messenger"] + .sync-settings-toggle-slider',
  );
  await expect(agentAccessSlider).toBeVisible();
  await expect(agentAccessSlider).toHaveCSS('width', '32px');
  await expect(agentAccessSlider).toHaveCSS('height', '18px');
});
