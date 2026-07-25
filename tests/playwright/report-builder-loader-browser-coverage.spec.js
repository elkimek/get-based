import { expect, test } from '@playwright/test';

const exportUrl = () => `/js/export.js?reportBuilderLoaderCoverage=${Date.now()}-${Math.random().toString(36).slice(2)}`;
const syntheticReportBuilder = `
  const record = (name, value) => {
    window.__reportBuilderLoaderCalls ||= [];
    window.__reportBuilderLoaderCalls.push([name, value]);
    return name + ':' + String(value ?? '');
  };
  export function openReportBuilder(presetId) { return record('open', presetId); }
  export function closeReportBuilder() { return record('close'); }
`;

test.beforeEach(async ({ page }) => {
  await page.route('**/report-builder-loader-coverage', route => route.fulfill({
    contentType: 'text/html',
    body: '<!doctype html><html><body><div id="notification-container"></div></body></html>',
  }));
  await page.goto('/report-builder-loader-coverage');
});

test('report builder loader stays cold, shares its first load, and delegates open and close', async ({ page }) => {
  const implementationRequests = [];
  await page.route('**/js/export-report-builder.js*', async route => {
    implementationRequests.push(route.request().url());
    await new Promise(resolve => setTimeout(resolve, 25));
    await route.fulfill({
      contentType: 'text/javascript',
      body: syntheticReportBuilder,
    });
  });

  const outcomes = await page.evaluate(async url => {
    const exportModule = await import(url);
    const cold = !exportModule.isReportBuilderModuleLoaded();
    const coldClose = exportModule.closeReportBuilder();
    const first = exportModule.loadReportBuilderModule();
    const second = exportModule.loadReportBuilderModule();
    const sharedPromise = first === second;
    await Promise.all([first, second]);
    const opened = await exportModule.openReportBuilder('personal');
    const closed = exportModule.closeReportBuilder();
    return {
      cold,
      coldClose,
      sharedPromise,
      loaded: exportModule.isReportBuilderModuleLoaded(),
      opened,
      closed,
      calls: window.__reportBuilderLoaderCalls || [],
    };
  }, exportUrl());

  expect(implementationRequests).toHaveLength(1);
  expect(outcomes).toEqual({
    cold: true,
    coldClose: undefined,
    sharedPromise: true,
    loaded: true,
    opened: 'open:personal',
    closed: 'close:',
    calls: [['open', 'personal'], ['close', undefined]],
  });
});

test('report builder open contains a failed load and retries with the fixed URL', async ({ page }) => {
  const implementationRequests = [];
  await page.route('**/js/export-report-builder.js*', async route => {
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
      body: syntheticReportBuilder,
    });
  });

  const outcomes = await page.evaluate(async url => {
    const exportModule = await import(url);
    const first = await exportModule.openReportBuilder('clinician');
    const unloadedAfterFailure = !exportModule.isReportBuilderModuleLoaded();
    const second = await exportModule.openReportBuilder('personal');
    exportModule.closeReportBuilder();
    return {
      first,
      unloadedAfterFailure,
      second,
      loadedAfterRetry: exportModule.isReportBuilderModuleLoaded(),
      calls: window.__reportBuilderLoaderCalls || [],
      notification: document.body.textContent,
    };
  }, exportUrl());

  expect(implementationRequests).toHaveLength(2);
  expect(new URL(implementationRequests[0]).search).toBe('');
  expect(new URL(implementationRequests[1]).searchParams.get('lazy-retry')).toBe('1');
  expect(outcomes).toMatchObject({
    first: false,
    unloadedAfterFailure: true,
    second: 'open:personal',
    loadedAfterRetry: true,
  });
  expect(outcomes.calls).toEqual([['open', 'personal'], ['close', undefined]]);
  expect(outcomes.notification).toContain('Report builder could not be loaded. Try again.');
});
