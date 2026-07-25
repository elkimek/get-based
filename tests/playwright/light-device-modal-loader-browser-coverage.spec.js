import { expect, test } from '@playwright/test';

const loaderUrl = () => (
  `/js/light-device-modal-loader.js?coverage=${Date.now()}-${Math.random().toString(36).slice(2)}`
);

const syntheticSetupModule = `
  globalThis.__lightDeviceSetupEvalCount = (globalThis.__lightDeviceSetupEvalCount || 0) + 1;
  export function configureLightDeviceSetup(deps) {
    globalThis.__lightDeviceSetupDepKeys = Object.keys(deps).sort();
  }
  export function openAddDeviceDialog() {
    (globalThis.__lightDeviceModalCalls ||= []).push(['setup', 'add']);
    return 'add-opened';
  }
  export function openCustomDeviceDialog() {
    (globalThis.__lightDeviceModalCalls ||= []).push(['setup', 'custom']);
    return 'custom-opened';
  }
`;

const syntheticSessionModule = `
  globalThis.__lightDeviceSessionEvalCount = (globalThis.__lightDeviceSessionEvalCount || 0) + 1;
  export function openDeviceSessionDialog(deviceId, deps) {
    globalThis.__lightDeviceSessionDepKeys = Object.keys(deps).sort();
    (globalThis.__lightDeviceModalCalls ||= []).push(['session', deviceId]);
    return 'session-opened:' + deviceId;
  }
`;

test('Light device form modals stay cold, load independently, and single-flight', async ({ page }) => {
  const setupRequests = [];
  const sessionRequests = [];
  await page.route('**/js/light-device-setup-modal.js*', async route => {
    setupRequests.push(route.request().url());
    await new Promise(resolve => setTimeout(resolve, 25));
    await route.fulfill({ contentType: 'text/javascript', body: syntheticSetupModule });
  });
  await page.route('**/js/light-device-session-modal.js*', async route => {
    sessionRequests.push(route.request().url());
    await new Promise(resolve => setTimeout(resolve, 25));
    await route.fulfill({ contentType: 'text/javascript', body: syntheticSessionModule });
  });
  await page.goto('/js/light-device-modal-loader.js', { waitUntil: 'load' });

  const outcomes = await page.evaluate(async url => {
    const loader = await import(url);
    loader.configureLightDeviceModalLoader({
      setup: {
        addCustomDevice() {},
        addDeviceFromPreset() {},
        loadPresets() {},
      },
      session: {
        getDevices() {},
        logDeviceSession() {},
      },
    });
    const startsCold = {
      setup: !loader.isLightDeviceSetupModuleLoaded(),
      session: !loader.isLightDeviceSessionModuleLoaded(),
    };
    const firstSetupLoad = loader.loadLightDeviceSetupModule();
    const secondSetupLoad = loader.loadLightDeviceSetupModule();
    const setupPromiseShared = firstSetupLoad === secondSetupLoad;
    const [add, custom] = await Promise.all([
      loader.openAddDeviceDialog(),
      loader.openCustomDeviceDialog(),
      firstSetupLoad,
      secondSetupLoad,
    ]);
    const session = await loader.openDeviceSessionDialog('device-7');
    return {
      startsCold,
      setupPromiseShared,
      add,
      custom,
      session,
      setupLoaded: loader.isLightDeviceSetupModuleLoaded(),
      sessionLoaded: loader.isLightDeviceSessionModuleLoaded(),
      setupEvalCount: globalThis.__lightDeviceSetupEvalCount,
      sessionEvalCount: globalThis.__lightDeviceSessionEvalCount,
      setupDepKeys: globalThis.__lightDeviceSetupDepKeys,
      sessionDepKeys: globalThis.__lightDeviceSessionDepKeys,
      calls: globalThis.__lightDeviceModalCalls,
    };
  }, loaderUrl());

  expect(setupRequests).toHaveLength(1);
  expect(sessionRequests).toHaveLength(1);
  expect(outcomes).toEqual({
    startsCold: { setup: true, session: true },
    setupPromiseShared: true,
    add: 'add-opened',
    custom: 'custom-opened',
    session: 'session-opened:device-7',
    setupLoaded: true,
    sessionLoaded: true,
    setupEvalCount: 1,
    sessionEvalCount: 1,
    setupDepKeys: ['addCustomDevice', 'addDeviceFromPreset', 'loadPresets'],
    sessionDepKeys: ['getDevices', 'logDeviceSession'],
    calls: [
      ['setup', 'add'],
      ['setup', 'custom'],
      ['session', 'device-7'],
    ],
  });
});

test('failed Light device modal loads retry with fixed URLs', async ({ page }) => {
  const setupRequests = [];
  const sessionRequests = [];
  await page.route('**/js/light-device-setup-modal.js*', route => {
    const url = route.request().url();
    setupRequests.push(url);
    if (!url.includes('lazy-retry=1')) return route.abort('failed');
    return route.fulfill({ contentType: 'text/javascript', body: syntheticSetupModule });
  });
  await page.route('**/js/light-device-session-modal.js*', route => {
    const url = route.request().url();
    sessionRequests.push(url);
    if (!url.includes('lazy-retry=1')) return route.abort('failed');
    return route.fulfill({ contentType: 'text/javascript', body: syntheticSessionModule });
  });
  await page.goto('/js/light-device-modal-loader.js', { waitUntil: 'load' });

  const outcomes = await page.evaluate(async url => {
    const loader = await import(url);
    const setupFirst = await loader.openAddDeviceDialog();
    const setupUnloaded = !loader.isLightDeviceSetupModuleLoaded();
    const setupSecond = await loader.openAddDeviceDialog();
    const sessionFirst = await loader.openDeviceSessionDialog('first');
    const sessionUnloaded = !loader.isLightDeviceSessionModuleLoaded();
    const sessionSecond = await loader.openDeviceSessionDialog('second');
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
    setupSecond: 'add-opened',
    setupLoaded: true,
    sessionFirst: false,
    sessionUnloaded: true,
    sessionSecond: 'session-opened:second',
    sessionLoaded: true,
  });
  expect(setupRequests).toHaveLength(2);
  expect(sessionRequests).toHaveLength(2);
  expect(new URL(setupRequests[0]).search).toBe('');
  expect(new URL(setupRequests[1]).search).toBe('?lazy-retry=1');
  expect(new URL(sessionRequests[0]).search).toBe('');
  expect(new URL(sessionRequests[1]).search).toBe('?lazy-retry=1');
});
