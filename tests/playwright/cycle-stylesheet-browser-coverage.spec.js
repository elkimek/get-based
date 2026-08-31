import { expect, test } from './coverage-fixture.js';

function moduleUrl(path) {
  return `${path}?cycleStylesheetCoverage=${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

async function openCycleLoaderPage(page, path) {
  await page.route(`**${path}`, route => route.fulfill({
    status: 200,
    contentType: 'text/html',
    body: `<!doctype html><html><head>
      <link rel="stylesheet" href="/css/mobile-dashboard.css">
      <meta data-cycle-stylesheet-anchor>
      <meta data-marker-detail-stylesheet-anchor>
    </head><body></body></html>`,
  }));
  await page.goto(path, { waitUntil: 'load' });
}

test('Cycle stylesheet loader single-flights and preserves cascade order', async ({ page }) => {
  let stylesheetRequests = 0;
  await page.route('**/css/cycle.css*', route => {
    stylesheetRequests += 1;
    return route.fulfill({
      status: 200,
      contentType: 'text/css',
      body: '.cycle-section { display: grid; }',
    });
  });
  await openCycleLoaderPage(page, '/cycle-stylesheet-cache-coverage');

  const outcomes = await page.evaluate(async ({ runtimeUrl }) => {
    const runtime = await import(runtimeUrl);
    const loadedBeforeRequest = runtime.isCycleStylesheetLoaded();
    const [first, second] = await Promise.all([
      runtime.loadCycleStylesheet(),
      runtime.loadCycleStylesheet(),
    ]);
    const third = await runtime.loadCycleStylesheet();
    const anchor = document.querySelector('[data-cycle-stylesheet-anchor]');
    return {
      loadedBeforeRequest,
      loadedAfterRequest: runtime.isCycleStylesheetLoaded(),
      concurrentCallsShareTheSameLink: first === second,
      laterCallsReuseTheResolvedLink: first === third,
      oneStylesheetLink:
        document.querySelectorAll('link[data-cycle-stylesheet]').length === 1,
      linkPrecedesAnchor: first.nextElementSibling === anchor,
      markerAnchorFollowsAnchor:
        anchor?.nextElementSibling?.hasAttribute('data-marker-detail-stylesheet-anchor') === true,
    };
  }, { runtimeUrl: moduleUrl('/js/cycle-runtime.js') });

  expect(outcomes).toEqual({
    loadedBeforeRequest: false,
    loadedAfterRequest: true,
    concurrentCallsShareTheSameLink: true,
    laterCallsReuseTheResolvedLink: true,
    oneStylesheetLink: true,
    linkPrecedesAnchor: true,
    markerAnchorFollowsAnchor: true,
  });
  expect(stylesheetRequests).toBe(1);
});

test('Cycle stylesheet failure is contained and retries with a fresh URL', async ({ page }) => {
  const stylesheetRequests = [];
  await page.route('**/css/cycle.css*', route => {
    stylesheetRequests.push(route.request().url());
    return route.abort('failed');
  });
  await openCycleLoaderPage(page, '/cycle-stylesheet-retry-coverage');

  const runtimeUrl = moduleUrl('/js/cycle-runtime.js');
  const firstLoaded = await page.evaluate(
    async ({ runtimeUrl: url }) => (await import(url)).loadCycleStylesheetForAction(),
    { runtimeUrl },
  );
  expect(firstLoaded).toBe(false);
  expect(stylesheetRequests).toHaveLength(1);
  await expect(page.locator('link[data-cycle-stylesheet]')).toHaveCount(0);

  await page.unroute('**/css/cycle.css*');
  const retry = await page.evaluate(async ({ runtimeUrl: url }) => {
    const runtime = await import(url);
    const loaded = await runtime.loadCycleStylesheetForAction();
    const link = document.querySelector('link[data-cycle-stylesheet]');
    return {
      loaded,
      href: link?.href || '',
      sheetLoaded: link?.sheet !== null,
    };
  }, { runtimeUrl });

  expect(retry.loaded).toBe(true);
  expect(retry.sheetLoaded).toBe(true);
  expect(new URL(retry.href).searchParams.get('lazy-retry')).toBe('1');
});

test('Female Body route contains a Cycle stylesheet failure and retries', async ({ page }) => {
  // This intentionally performs two lazy route preparations under full-suite
  // coverage instrumentation; allow Playwright's slow-test budget on loaded CI.
  test.slow();
  await page.route('**/css/cycle.css*', route => route.abort('failed'));
  await page.goto('/app', { waitUntil: 'load' });
  await expect(page.locator('#main-content')).not.toBeEmpty();

  // The test targets stylesheet failure/retry. Preload the independent Body
  // modules so a rejected Promise.all cannot leave their imports competing
  // with the retry while hundreds of coverage workers are active.
  await page.evaluate(async () => {
    const [{ state }, healthData] = await Promise.all([
      import('/js/state.js'),
      import('/js/health-data-loader.js'),
    ]);
    state.profileSex = 'female';
    await healthData.loadBodyHealthDataModules();
  });
  const firstOpened = await page.evaluate(async () => (await import('/js/views.js')).navigate('body'));
  expect(firstOpened).toBe(false);
  await expect(page.locator('#main-content [role="alert"]')).toContainText('Body could not be loaded');
  await expect(page.locator('link[data-cycle-stylesheet]')).toHaveCount(0);

  await page.unroute('**/css/cycle.css*');
  const retryOpened = await page.evaluate(async () => (await import('/js/views.js')).navigate('body'));
  expect(retryOpened).toBe(true);
  await expect(page.locator('link[data-cycle-stylesheet]')).toHaveCount(1);
  await expect(page.locator('.cycle-section')).toBeVisible();
});

test('Female Body route waits for Cycle presentation while the default path stays cold', async ({ page }) => {
  let stylesheetRoute;
  await page.route('**/css/cycle.css*', route => {
    stylesheetRoute = route;
  });
  await page.goto('/app', { waitUntil: 'load' });
  await expect(page.locator('#main-content')).not.toBeEmpty();
  await expect(page.locator('link[data-cycle-stylesheet]')).toHaveCount(0);

  const beforeLoad = await page.evaluate(async () => {
    const [{ state }, views] = await Promise.all([
      import('/js/state.js'),
      import('/js/views.js'),
    ]);
    state.profileSex = 'female';
    window.__cycleBodyNavigation = views.navigate('body');
    return {
      status: document.getElementById('main-content')?.textContent || '',
      links: document.querySelectorAll('link[data-cycle-stylesheet]').length,
    };
  });

  expect(beforeLoad.status).toContain('Loading Body');
  expect(beforeLoad.links).toBe(1);
  await expect.poll(() => !!stylesheetRoute).toBe(true);
  await stylesheetRoute.fulfill({
    status: 200,
    contentType: 'text/css',
    body: '.cycle-section { display: grid; }',
  });

  const afterLoad = await page.evaluate(async () => {
    const opened = await window.__cycleBodyNavigation;
    const section = document.querySelector('.cycle-section');
    return {
      opened,
      hasCycleSection: !!section,
      display: section ? getComputedStyle(section).display : '',
    };
  });
  expect(afterLoad).toEqual({
    opened: true,
    hasCycleSection: true,
    display: 'grid',
  });
});
