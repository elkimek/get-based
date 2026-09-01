import { expect, test } from './coverage-fixture.js';

function syntheticExportFacade() {
  return `
    globalThis.__exportFacadeEvalCount = (globalThis.__exportFacadeEvalCount || 0) + 1;
    const record = (name, ...args) => {
      globalThis.__exportFacadeCalls = globalThis.__exportFacadeCalls || [];
      globalThis.__exportFacadeCalls.push([name, ...args]);
      return name;
    };
    export function configureExportRuntimeDeps(deps) {
      globalThis.__exportFacadeDepKeys = Object.keys(deps).sort();
    }
    export function clearAllData() { return record('clear'); }
    export function closeReportBuilder() { return record('close'); }
    export function exportAllDataJSON() { return record('export-all'); }
    export function exportClientJSON(profileId, includeChat) {
      return record('export-client', profileId, includeChat);
    }
    export function importDataJSON(file) { return record('import', file.name); }
    export function loadDemoData(sex) { return record('demo', sex); }
    export function openReportBuilder(presetId) { return record('report', presetId); }
  `;
}

test('export facade stays cold, applies deps, and single-flights actions', async ({ page }) => {
  await page.route('**/js/export.js', route => route.fulfill({
    status: 200,
    contentType: 'application/javascript',
    body: syntheticExportFacade(),
  }));
  await page.goto('/js/export-loader.js', { waitUntil: 'load' });

  const results = await page.evaluate(async () => {
    const loader = await import(`/js/export-loader.js?coverage=${Date.now()}`);
    loader.configureExportFacadeLoaderDeps({
      buildSidebar() {},
      navigate() {},
    });
    const startsCold = loader.isExportFacadeModuleLoaded() === false;
    const coldClose = loader.closeReportBuilder();
    const [demo, clientExport] = await Promise.all([
      loader.loadDemoData('female'),
      loader.exportClientJSON('profile-1', true),
    ]);
    const remaining = await Promise.all([
      loader.clearAllData(),
      loader.exportAllDataJSON(),
      loader.importDataJSON(new File(['{}'], 'profile.json')),
      loader.openReportBuilder('clinician'),
    ]);
    const warmClose = loader.closeReportBuilder();
    return {
      startsCold,
      coldClose,
      demo,
      clientExport,
      remaining,
      warmClose,
      evalCount: globalThis.__exportFacadeEvalCount,
      depKeys: globalThis.__exportFacadeDepKeys,
      calls: globalThis.__exportFacadeCalls,
      endsLoaded: loader.isExportFacadeModuleLoaded(),
    };
  });

  expect(results).toEqual({
    startsCold: true,
    coldClose: undefined,
    demo: 'demo',
    clientExport: 'export-client',
    remaining: ['clear', 'export-all', 'import', 'report'],
    warmClose: 'close',
    evalCount: 1,
    depKeys: ['buildSidebar', 'navigate'],
    calls: [
      ['demo', 'female'],
      ['export-client', 'profile-1', true],
      ['clear'],
      ['export-all'],
      ['import', 'profile.json'],
      ['report', 'clinician'],
      ['close'],
    ],
    endsLoaded: true,
  });
});

test('export facade clears a failed load and retries with the fixed retry URL', async ({ page }) => {
  let requests = 0;
  const requestUrls = [];
  await page.route('**/js/export.js*', route => {
    requests += 1;
    requestUrls.push(route.request().url());
    if (requests === 1) return route.abort('failed');
    return route.fulfill({
      status: 200,
      contentType: 'application/javascript',
      body: syntheticExportFacade(),
    });
  });
  await page.goto('/js/export-loader.js', { waitUntil: 'load' });

  const results = await page.evaluate(async () => {
    const loader = await import(`/js/export-loader.js?retry=${Date.now()}`);
    const first = await loader.openReportBuilder('personal');
    const afterFailure = loader.isExportFacadeModuleLoaded();
    const second = await loader.openReportBuilder('clinician');
    return {
      first,
      afterFailure,
      second,
      afterRetry: loader.isExportFacadeModuleLoaded(),
    };
  });

  expect(results).toEqual({
    first: false,
    afterFailure: false,
    second: 'report',
    afterRetry: true,
  });
  expect(requestUrls).toHaveLength(2);
  expect(new URL(requestUrls[0]).search).toBe('');
  expect(new URL(requestUrls[1]).searchParams.get('lazy-retry')).toBe('1');
});

test('empty-dashboard demo action loads the real export facade on demand', async ({ page }) => {
  await page.addInitScript(() => {
    performance.setResourceTimingBufferSize(2000);
    localStorage.setItem('labcharts-legal-acceptance', JSON.stringify({
      accepted: true,
      termsVersion: '2026-08-22',
      privacyVersion: '2026-08-22',
      policyScope: 'self-hosted-notice',
      acceptedAt: '2026-07-25T00:00:00.000Z',
      appVersion: 'export-loader-coverage',
      location: 'export-loader-coverage',
    }));
    localStorage.setItem('labcharts-default-onboarded', 'profile-set');
    localStorage.setItem('labcharts-default-emptyTour', 'completed');
    localStorage.setItem('labcharts-default-tour', 'completed');
    localStorage.setItem('labcharts-default-ai-reminder-dismissed', '1');
    localStorage.setItem('labcharts-onboard-extras-done-default', '1');
    localStorage.setItem('labcharts-onboard-provider-skipped-default', '1');
    localStorage.setItem('labcharts-analytics-consent-seen', '1');
  });
  await page.goto('/app', { waitUntil: 'networkidle' });

  const before = await page.evaluate(() => performance.getEntriesByType('resource')
    .map(entry => new URL(entry.name).pathname));
  expect(before).not.toContain('/js/export.js');
  expect(before).not.toContain('/js/export-report.js');
  expect(before).not.toContain('/js/export-report-html.js');

  await page.locator(
    '[data-dashboard-welcome-action="load-demo"][data-dashboard-welcome-demo="female"]',
  ).click();
  await expect.poll(
    () => page.evaluate(async () => {
      const loader = await import('/js/export-loader.js');
      return loader.isExportFacadeModuleLoaded();
    }),
    { timeout: 15_000 },
  ).toBe(true);

  const after = await page.evaluate(async () => {
    const loader = await import('/js/export-loader.js');
    const paths = performance.getEntriesByType('resource')
      .map(entry => new URL(entry.name).pathname);
    return {
      loaded: loader.isExportFacadeModuleLoaded(),
      paths,
    };
  });

  expect(after.loaded).toBe(true);
  expect(after.paths).toContain('/js/export.js');
  expect(after.paths).toContain('/js/export-report.js');
  expect(after.paths).toContain('/js/export-report-html.js');
});
