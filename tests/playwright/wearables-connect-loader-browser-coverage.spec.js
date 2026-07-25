import { expect, test } from './coverage-fixture.js';

const loaderUrl = () => `/js/wearables-connect-loader.js?wearablesConnectLoaderCoverage=${Date.now()}-${Math.random().toString(36).slice(2)}`;
const syntheticConnect = `
  export async function handleOAuthCallbackOnLoad() {
    return true;
  }
  export function loadWearableRuntimeConfig() {
    return Promise.resolve();
  }
  export function initWearableScheduler() {
    window.__wearablesConnectLoaderCalls ||= [];
    window.__wearablesConnectLoaderCalls.push('initWearableScheduler');
  }
`;

test.beforeEach(async ({ page }) => {
  await page.route('**/wearables-connect-loader-coverage', route => route.fulfill({
    contentType: 'text/html',
    body: '<!doctype html><html><body></body></html>',
  }));
  await page.goto('/wearables-connect-loader-coverage');
});

test('wearable vendor connection code stays cold and single-flights on demand', async ({ page }) => {
  const implementationRequests = [];
  await page.route('**/js/wearables-connect.js*', async route => {
    implementationRequests.push(route.request().url());
    await new Promise(resolve => setTimeout(resolve, 25));
    await route.fulfill({
      contentType: 'text/javascript',
      body: syntheticConnect,
    });
  });

  const outcomes = await page.evaluate(async url => {
    const loader = await import(url);
    const cold = !loader.isWearablesConnectModuleLoaded();
    const first = loader.loadWearablesConnectModule();
    const second = loader.loadWearablesConnectModule();
    const sharedPromise = first === second;
    const [connect] = await Promise.all([first, second]);
    connect.initWearableScheduler();
    return {
      cold,
      sharedPromise,
      loaded: loader.isWearablesConnectModuleLoaded(),
      calls: window.__wearablesConnectLoaderCalls || [],
    };
  }, loaderUrl());

  expect(implementationRequests).toHaveLength(1);
  expect(outcomes).toEqual({
    cold: true,
    sharedPromise: true,
    loaded: true,
    calls: ['initWearableScheduler'],
  });
});

test('wearable connection loader retries a failed module request with a fixed URL', async ({ page }) => {
  const implementationRequests = [];
  await page.route('**/js/wearables-connect.js*', async route => {
    const url = route.request().url();
    implementationRequests.push(url);
    if (!url.includes('lazy-retry=1')) {
      await route.abort('failed');
      return;
    }
    await route.fulfill({
      contentType: 'text/javascript',
      body: syntheticConnect,
    });
  });

  const outcomes = await page.evaluate(async url => {
    const loader = await import(url);
    let firstRejected = false;
    try {
      await loader.loadWearablesConnectModule();
    } catch {
      firstRejected = true;
    }
    const connect = await loader.loadWearablesConnectModule();
    return {
      firstRejected,
      loaded: loader.isWearablesConnectModuleLoaded(),
      handled: await connect.handleOAuthCallbackOnLoad(),
    };
  }, loaderUrl());

  expect(implementationRequests).toHaveLength(2);
  expect(new URL(implementationRequests[0]).search).toBe('');
  expect(new URL(implementationRequests[1]).search).toBe('?lazy-retry=1');
  expect(outcomes).toEqual({
    firstRejected: true,
    loaded: true,
    handled: true,
  });
});
