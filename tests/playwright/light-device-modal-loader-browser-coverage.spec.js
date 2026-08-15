import { expect, test } from './coverage-fixture.js';

const loaderUrl = () => (
  `/js/light-device-modal-loader.js?coverage=${Date.now()}-${Math.random().toString(36).slice(2)}`
);

async function openCoveragePage(page) {
  await page.route('**/light-device-modal-loader-coverage', route => route.fulfill({
    contentType: 'text/html',
    body: '<!doctype html><html><body><div id="notification-container"></div></body></html>',
  }));
  await page.goto('/light-device-modal-loader-coverage');
}

test('Light device form modals stay cold, load independently, and single-flight', async ({ page }) => {
  const setupRequests = [];
  const sessionRequests = [];
  await page.route('**/js/light-device-setup-modal.js*', async route => {
    setupRequests.push(route.request().url());
    await new Promise(resolve => setTimeout(resolve, 25));
    await route.continue();
  });
  await page.route('**/js/light-device-session-modal.js*', async route => {
    sessionRequests.push(route.request().url());
    await new Promise(resolve => setTimeout(resolve, 25));
    await route.continue();
  });
  await openCoveragePage(page);

  const outcomes = await page.evaluate(async url => {
    const [loader, { state }] = await Promise.all([
      import(url),
      import('/js/state.js'),
    ]);
    state.importedData = {
      ...(state.importedData || {}),
      sunDefaults: { ...(state.importedData?.sunDefaults || {}), fitzpatrick: 'III', completedAt: Date.now() },
    };
    const calls = [];
    const device = {
      id: 'device-7',
      brand: 'CoverageLight',
      model: 'Panel',
      type: 'uvb',
      peakWavelengths: [311, 660],
      mwPerCm2At15cm: 10,
      recommendedDistanceCm: 15,
      lastSession: { bodyAreas: ['breast-chest'], durationMin: 8, mode: 'red', eyesProtected: false },
      channelGroups: [
        { id: 'uv', label: 'UV', peaks: [311] },
        { id: 'red', label: 'Red', peaks: [660] },
      ],
      modes: [
        { id: 'all', label: 'All on', groups: ['uv', 'red'], default: true },
        { id: 'red', label: 'Red only', groups: ['red'] },
      ],
    };
    loader.configureLightDeviceModalLoader({
      setup: {
        loadPresets: async () => ({
          types: { combined: { label: 'Red + NIR' } },
          presets: [{
            id: 'preset-7',
            type: 'combined',
            brand: 'CoverageLight',
            model: 'Preset',
            peakWavelengths: [660, 850],
          }],
        }),
        addDeviceFromPreset: async presetId => calls.push(['add-preset', presetId]),
        addCustomDevice: async spec => calls.push(['add-custom', spec.brand, spec.model]),
        wireModal: overlay => document.body.appendChild(overlay),
        refreshLightView: () => calls.push(['refresh']),
      },
      session: {
        hydrateDevicesFromPresets: async () => calls.push(['hydrate']),
        getDevices: () => {
          calls.push(['get-devices']);
          return [device];
        },
        logDeviceSession: async payload => calls.push(['log', payload.deviceId, payload.durationMin, payload.eyesProtected, payload.mode]),
        getActiveDeviceSession: () => null,
        startDeviceSession: async payload => calls.push(['start', payload.deviceId]),
        ensureActiveDeviceTicker: () => calls.push(['ticker']),
        validateModeCoupling: () => ({ ok: true }),
        renderBodySilhouette: () => '<button type="button" data-region="breast-chest">Chest</button>',
        bindBodySilhouette() {},
        navigate: route => calls.push(['navigate', route]),
      },
    });
    const startsCold = {
      setup: !loader.isLightDeviceSetupModuleLoaded(),
      session: !loader.isLightDeviceSessionModuleLoaded(),
    };
    const firstSetupLoad = loader.loadLightDeviceSetupModule();
    const secondSetupLoad = loader.loadLightDeviceSetupModule();
    const setupPromiseShared = firstSetupLoad === secondSetupLoad;
    await Promise.all([firstSetupLoad, secondSetupLoad]);
    await Promise.all([loader.openAddDeviceDialog(), loader.openCustomDeviceDialog()]);

    const addOverlay = document.querySelector('[aria-label="Add light device"]')?.closest('.modal-overlay');
    addOverlay?.querySelector('.light-device-preset-row')?.click();
    addOverlay?.querySelector('#add-device-confirm')?.click();
    const customOverlay = document.querySelector('[aria-label="Add custom light device"]')?.closest('.modal-overlay');
    if (customOverlay) {
      customOverlay.querySelector('#custom-dev-brand').value = 'Manual';
      customOverlay.querySelector('#custom-dev-model').value = 'Panel';
      customOverlay.querySelector('#custom-dev-save')?.click();
    }
    await new Promise(resolve => setTimeout(resolve, 0));

    const firstSessionLoad = loader.loadLightDeviceSessionModule();
    const secondSessionLoad = loader.loadLightDeviceSessionModule();
    const sessionPromiseShared = firstSessionLoad === secondSessionLoad;
    await Promise.all([firstSessionLoad, secondSessionLoad]);
    await loader.openDeviceSessionDialog('device-7');
    const sessionOverlay = document.querySelector('[aria-label="Log device session"]')?.closest('.modal-overlay');
    const startsAsNonUvMode = sessionOverlay?.querySelector('#dev-session-eye-label')?.textContent.includes('Device-appropriate') === true;
    sessionOverlay?.querySelector('[data-mode="all"]')?.click();
    const uvModeRequiresFreshGoggleConfirmation =
      sessionOverlay?.querySelector('#dev-session-eye-label')?.textContent.includes('UV-rated goggles') === true
      && sessionOverlay?.querySelector('#dev-session-eyes')?.checked === false;
    if (sessionOverlay?.querySelector('#dev-session-eyes')) sessionOverlay.querySelector('#dev-session-eyes').checked = true;
    sessionOverlay?.querySelector('#dev-session-save')?.click();
    await new Promise(resolve => setTimeout(resolve, 0));

    return {
      startsCold,
      setupPromiseShared,
      sessionPromiseShared,
      setupLoaded: loader.isLightDeviceSetupModuleLoaded(),
      sessionLoaded: loader.isLightDeviceSessionModuleLoaded(),
      addDialogOpened: !!addOverlay,
      customDialogOpened: !!customOverlay,
      sessionDialogOpened: !!sessionOverlay,
      modeSafetyCopyUpdated: startsAsNonUvMode && uvModeRequiresFreshGoggleConfirmation,
      depsDelegated: {
        preset: calls.some(call => call[0] === 'add-preset' && call[1] === 'preset-7'),
        custom: calls.some(call => (
          call[0] === 'add-custom' && call[1] === 'Manual' && call[2] === 'Panel'
        )),
        refreshes: calls.filter(call => call[0] === 'refresh').length,
        session: calls.some(call => (
          call[0] === 'log' && call[1] === 'device-7' && call[2] === 0.5
          && call[3] === true && call[4] === 'all'
        )),
        hydrated: calls.some(call => call[0] === 'hydrate'),
        navigated: calls.some(call => call[0] === 'navigate' && call[1] === 'light'),
      },
    };
  }, loaderUrl());

  expect(setupRequests).toHaveLength(1);
  expect(sessionRequests).toHaveLength(1);
  expect(outcomes).toEqual({
    startsCold: { setup: true, session: true },
    setupPromiseShared: true,
    sessionPromiseShared: true,
    setupLoaded: true,
    sessionLoaded: true,
    addDialogOpened: true,
    customDialogOpened: true,
    sessionDialogOpened: true,
    modeSafetyCopyUpdated: true,
    depsDelegated: {
      preset: true,
      custom: true,
      refreshes: 2,
      session: true,
      hydrated: true,
      navigated: true,
    },
  });
});

test('failed Light device modal loads retry with fixed URLs', async ({ page }) => {
  const setupRequests = [];
  const sessionRequests = [];
  await page.route('**/js/light-device-setup-modal.js*', route => {
    const url = route.request().url();
    setupRequests.push(url);
    if (!url.includes('lazy-retry=1')) return route.abort('failed');
    return route.continue();
  });
  await page.route('**/js/light-device-session-modal.js*', route => {
    const url = route.request().url();
    sessionRequests.push(url);
    if (!url.includes('lazy-retry=1')) return route.abort('failed');
    return route.continue();
  });
  await openCoveragePage(page);

  const outcomes = await page.evaluate(async url => {
    const loader = await import(url);
    const setupFirst = await loader.loadLightDeviceSetupModule().catch(() => false);
    const setupUnloaded = !loader.isLightDeviceSetupModuleLoaded();
    const setupSecond = await loader.loadLightDeviceSetupModule().then(() => true);
    const sessionFirst = await loader.loadLightDeviceSessionModule().catch(() => false);
    const sessionUnloaded = !loader.isLightDeviceSessionModuleLoaded();
    const sessionSecond = await loader.loadLightDeviceSessionModule().then(() => true);
    return {
      setupFirst,
      setupUnloaded,
      setupSecond,
      setupLoaded: loader.isLightDeviceSetupModuleLoaded(),
      sessionFirst,
      sessionUnloaded,
      sessionSecond,
      sessionLoaded: loader.isLightDeviceSessionModuleLoaded(),
    };
  }, loaderUrl());

  expect(outcomes).toEqual({
    setupFirst: false,
    setupUnloaded: true,
    setupSecond: true,
    setupLoaded: true,
    sessionFirst: false,
    sessionUnloaded: true,
    sessionSecond: true,
    sessionLoaded: true,
  });
  expect(setupRequests).toHaveLength(2);
  expect(sessionRequests).toHaveLength(2);
  expect(new URL(setupRequests[0]).search).toBe('');
  expect(new URL(setupRequests[1]).search).toBe('?lazy-retry=1');
  expect(new URL(sessionRequests[0]).search).toBe('');
  expect(new URL(sessionRequests[1]).search).toBe('?lazy-retry=1');
});
