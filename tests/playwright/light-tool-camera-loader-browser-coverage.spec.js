import { expect, test } from '@playwright/test';

const lightToolsUrl = () => `/js/light-tools.js?cameraLoaderCoverage=${Date.now()}-${Math.random().toString(36).slice(2)}`;

const syntheticCameraModals = `
  const record = (name, args) => {
    window.__lightToolCameraLoaderCalls ||= [];
    window.__lightToolCameraLoaderCalls.push([name, ...args]);
    return name;
  };
  export async function openLuxMeter(...args) { return record('openLuxMeter', args); }
  export async function openFlickerDetector(...args) { return record('openFlickerDetector', args); }
  export async function openDarknessMeter(...args) { return record('openDarknessMeter', args); }
  export async function openCCTMeter(...args) { return record('openCCTMeter', args); }
  export async function openSpectrumClassifier(...args) { return record('openSpectrumClassifier', args); }
  export async function openGlassTransmission(...args) { return record('openGlassTransmission', args); }
  export function closeLuxMeter() { return record('closeLuxMeter', []); }
  export function closeFlickerDetector() { return record('closeFlickerDetector', []); }
  export function closeDarknessMeter() { return record('closeDarknessMeter', []); }
  export function closeCCTMeter() { return record('closeCCTMeter', []); }
  export function closeSpectrumClassifier() { return record('closeSpectrumClassifier', []); }
  export function closeGlassTransmission() { return record('closeGlassTransmission', []); }
`;

test.beforeEach(async ({ page }) => {
  await page.route('**/light-tool-camera-loader-coverage', route => route.fulfill({
    contentType: 'text/html',
    body: '<!doctype html><html><body><div id="notification-container"></div></body></html>',
  }));
  await page.goto('/light-tool-camera-loader-coverage');
});

test('camera modal loader stays cold, shares its first load, and delegates cleanup only after load', async ({ page }) => {
  const implementationRequests = [];
  await page.route('**/js/light-tool-camera-modals.js*', async route => {
    implementationRequests.push(route.request().url());
    await new Promise(resolve => setTimeout(resolve, 25));
    await route.fulfill({
      contentType: 'text/javascript',
      body: syntheticCameraModals,
    });
  });

  const outcomes = await page.evaluate(async url => {
    const lightTools = await import(url);
    const cold = !lightTools.isLightToolCameraModalsLoaded();
    lightTools.closeLuxMeter();
    const first = lightTools.loadLightToolCameraModals();
    const second = lightTools.loadLightToolCameraModals();
    const sharedPromise = first === second;
    await Promise.all([first, second]);
    const opened = await lightTools.openLuxMeter({ roomId: 'room-1' });
    lightTools.closeLuxMeter();
    return {
      cold,
      sharedPromise,
      loaded: lightTools.isLightToolCameraModalsLoaded(),
      opened,
      calls: window.__lightToolCameraLoaderCalls || [],
    };
  }, lightToolsUrl());

  expect(implementationRequests).toHaveLength(1);
  expect(outcomes).toMatchObject({
    cold: true,
    sharedPromise: true,
    loaded: true,
    opened: 'openLuxMeter',
  });
  expect(outcomes.calls.map(call => call[0])).toEqual(['openLuxMeter', 'closeLuxMeter']);
});

test('camera modal action contains a failed load and retries with the fixed URL', async ({ page }) => {
  const implementationRequests = [];
  await page.route('**/js/light-tool-camera-modals.js*', async route => {
    const url = route.request().url();
    implementationRequests.push(url);
    if (!url.includes('lazy-retry=1')) {
      await route.fulfill({
        status: 503,
        contentType: 'text/javascript',
        body: 'export {};',
      });
      return;
    }
    await route.fulfill({
      contentType: 'text/javascript',
      body: syntheticCameraModals,
    });
  });

  const outcomes = await page.evaluate(async url => {
    const lightTools = await import(url);
    lightTools.closeFlickerDetector();
    const first = await lightTools.openFlickerDetector({ roomId: 'failed-first' });
    const unloadedAfterFailure = !lightTools.isLightToolCameraModalsLoaded();
    const second = await lightTools.openFlickerDetector({ roomId: 'retry' });
    lightTools.closeFlickerDetector();
    return {
      first,
      unloadedAfterFailure,
      second,
      loadedAfterRetry: lightTools.isLightToolCameraModalsLoaded(),
      calls: window.__lightToolCameraLoaderCalls || [],
      notification: document.body.textContent,
    };
  }, lightToolsUrl());

  expect(implementationRequests).toHaveLength(2);
  expect(new URL(implementationRequests[0]).search).toBe('');
  expect(new URL(implementationRequests[1]).searchParams.get('lazy-retry')).toBe('1');
  expect(outcomes).toMatchObject({
    first: false,
    unloadedAfterFailure: true,
    second: 'openFlickerDetector',
    loadedAfterRetry: true,
  });
  expect(outcomes.calls.map(call => call[0])).toEqual(['openFlickerDetector', 'closeFlickerDetector']);
  expect(outcomes.notification).toContain('Camera tool could not be loaded. Try again.');
});
