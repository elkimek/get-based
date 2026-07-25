import { expect, test } from '@playwright/test';

const exportUrl = () => `/js/export.js?importLoaderCoverage=${Date.now()}-${Math.random().toString(36).slice(2)}`;
const syntheticImportModule = `
  export async function importDataJSON(file) {
    window.__exportImportLoaderCalls ||= [];
    window.__exportImportLoaderCalls.push(file.name);
    return 'imported:' + file.name;
  }
`;

test.beforeEach(async ({ page }) => {
  await page.route('**/export-import-loader-coverage', route => route.fulfill({
    contentType: 'text/html',
    body: '<!doctype html><html><body><div id="notification-container"></div></body></html>',
  }));
  await page.goto('/export-import-loader-coverage');
});

test('JSON import loader stays cold, shares its first load, and delegates the file', async ({ page }) => {
  const implementationRequests = [];
  await page.route('**/js/export-import.js*', async route => {
    implementationRequests.push(route.request().url());
    await new Promise(resolve => setTimeout(resolve, 25));
    await route.fulfill({
      contentType: 'text/javascript',
      body: syntheticImportModule,
    });
  });

  const outcomes = await page.evaluate(async url => {
    const exportModule = await import(url);
    const cold = !exportModule.isExportImportModuleLoaded();
    const first = exportModule.loadExportImportModule();
    const second = exportModule.loadExportImportModule();
    const sharedPromise = first === second;
    await Promise.all([first, second]);
    const result = await exportModule.importDataJSON(new File(['{}'], 'profile.json'));
    return {
      cold,
      sharedPromise,
      loaded: exportModule.isExportImportModuleLoaded(),
      result,
      calls: window.__exportImportLoaderCalls || [],
    };
  }, exportUrl());

  expect(implementationRequests).toHaveLength(1);
  expect(outcomes).toEqual({
    cold: true,
    sharedPromise: true,
    loaded: true,
    result: 'imported:profile.json',
    calls: ['profile.json'],
  });
});

test('JSON import action contains a failed load and retries with the fixed URL', async ({ page }) => {
  const implementationRequests = [];
  await page.route('**/js/export-import.js*', async route => {
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
      body: syntheticImportModule,
    });
  });

  const outcomes = await page.evaluate(async url => {
    const exportModule = await import(url);
    const first = await exportModule.importDataJSON(new File(['{}'], 'first.json'));
    const unloadedAfterFailure = !exportModule.isExportImportModuleLoaded();
    const second = await exportModule.importDataJSON(new File(['{}'], 'retry.json'));
    return {
      first,
      unloadedAfterFailure,
      second,
      loadedAfterRetry: exportModule.isExportImportModuleLoaded(),
      calls: window.__exportImportLoaderCalls || [],
      notification: document.body.textContent,
    };
  }, exportUrl());

  expect(implementationRequests).toHaveLength(2);
  expect(new URL(implementationRequests[0]).search).toBe('');
  expect(new URL(implementationRequests[1]).searchParams.get('lazy-retry')).toBe('1');
  expect(outcomes).toMatchObject({
    first: undefined,
    unloadedAfterFailure: true,
    second: 'imported:retry.json',
    loadedAfterRetry: true,
    calls: ['retry.json'],
  });
  expect(outcomes.notification).toContain('JSON import could not be loaded. Try again.');
});
