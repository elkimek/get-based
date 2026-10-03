type QueriedModuleOperations = {isCashuWalletModuleLoaded: (...args: Parameters<typeof import('../../js/export-runtime.js').isCashuWalletModuleLoaded>) => boolean; loadCashuWalletModule: (...args: Parameters<typeof import('../../js/export-runtime.js').loadCashuWalletModule>) => Promise<unknown>; destroyWalletRuntimeDB: (...args: Parameters<typeof import('../../js/export-runtime.js').destroyWalletRuntimeDB>) => Promise<unknown>};

import { routeHtml } from '../helpers/browser-static-routes.js';
import { expect, test } from './coverage-fixture.js';

const runtimeUrl = () => `/js/export-runtime.js?cashuLoaderCoverage=${Date.now()}-${Math.random().toString(36).slice(2)}`;
const syntheticWallet = `
  export async function destroyWalletDB() {
    window.__cashuWalletLoaderCalls ||= [];
    window.__cashuWalletLoaderCalls.push('destroyWalletDB');
    return 'destroyed';
  }
`;

test.beforeEach(async ({ page }) => {
  await routeHtml(page, '**/cashu-wallet-loader-coverage', '<!doctype html><html><body></body></html>');
  await page.goto('/cashu-wallet-loader-coverage');
});

test('Cashu wallet stays cold, single-flights, and loads for explicit database destruction', async ({ page }) => {
  const implementationRequests: string[] = [];
  await page.route('**/js/cashu-wallet.js*', async route => {
    implementationRequests.push(route.request().url());
    await new Promise(resolve => setTimeout(resolve, 25));
    await route.fulfill({
      contentType: 'text/javascript',
      body: syntheticWallet,
    });
  });

  const outcomes = await page.evaluate(async url => {
    const runtime = (await import(url) as unknown) as QueriedModuleOperations;
    const cold = !runtime.isCashuWalletModuleLoaded();
    const first = runtime.loadCashuWalletModule();
    const second = runtime.loadCashuWalletModule();
    const sharedPromise = first === second;
    await Promise.all([first, second]);
    await runtime.destroyWalletRuntimeDB();
    return {
      cold,
      sharedPromise,
      loaded: runtime.isCashuWalletModuleLoaded(),
      calls: (window as Window & {__cashuWalletLoaderCalls?: unknown[]}).__cashuWalletLoaderCalls || [],
    };
  }, runtimeUrl());

  expect(implementationRequests).toHaveLength(1);
  expect(outcomes).toEqual({
    cold: true,
    sharedPromise: true,
    loaded: true,
    calls: ['destroyWalletDB'],
  });
});

test('Cashu wallet database destruction retries with a fixed module URL', async ({ page }) => {
  const implementationRequests: string[] = [];
  await page.route('**/js/cashu-wallet.js*', async route => {
    const url = route.request().url();
    implementationRequests.push(url);
    if (!url.includes('lazy-retry=1')) {
      await route.abort('failed');
      return;
    }
    await route.fulfill({
      contentType: 'text/javascript',
      body: syntheticWallet,
    });
  });

  const outcomes = await page.evaluate(async url => {
    const runtime = (await import(url) as unknown) as QueriedModuleOperations;
    let firstRejected = false;
    try {
      await runtime.destroyWalletRuntimeDB();
    } catch {
      firstRejected = true;
    }
    await runtime.destroyWalletRuntimeDB();
    return {
      firstRejected,
      loaded: runtime.isCashuWalletModuleLoaded(),
      calls: (window as Window & {__cashuWalletLoaderCalls?: unknown[]}).__cashuWalletLoaderCalls || [],
    };
  }, runtimeUrl());

  expect(implementationRequests).toHaveLength(2);
  expect(new URL(implementationRequests[0]!).search).toBe('');
  expect(new URL(implementationRequests[1]!).search).toBe('?lazy-retry=1');
  expect(outcomes).toEqual({
    firstRejected: true,
    loaded: true,
    calls: ['destroyWalletDB'],
  });
});
