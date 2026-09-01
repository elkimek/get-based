import { expect, test } from './coverage-fixture.js';

async function openBlankPage(page, path) {
  await page.route(`**${path}`, route => route.fulfill({
    status: 200,
    contentType: 'text/html',
    body: '<!doctype html><html><head><meta data-light-sun-stylesheet-anchor></head><body><main id="main-content"></main></body></html>',
  }));
  await page.goto(path, { waitUntil: 'load' });
}

test('Light & Sun module loader caches background initialization without loading UI styles', async ({ page }) => {
  let moduleRequests = 0;
  let stylesheetRequests = 0;
  await page.route('**/js/app-light-sun-modules.js', route => {
    moduleRequests += 1;
    return route.fulfill({
      status: 200,
      contentType: 'application/javascript',
      body: `
        globalThis.__lightSunModuleEvalCount = (globalThis.__lightSunModuleEvalCount || 0) + 1;
        export const marker = 'light-sun-ready';
        export function configureLightEnv(deps) {
          globalThis.__lightEnvironmentLoaderDepKeys = Object.keys(deps).sort();
        }
        export function renderLightTodayHero() {
          return '<section>loaded Light Today hero</section>';
        }
      `,
    });
  });
  await page.route('**/js/sun-ai-analysis.js', route => route.fulfill({
    status: 200,
    contentType: 'application/javascript',
    body: `
      export function maybeAnalyzeSessionAfterFinish(session) {
        globalThis.__deferredSunAnalysisIds = [...(globalThis.__deferredSunAnalysisIds || []), session.id];
      }
    `,
  }));
  await page.route('**/js/light-device-ai-analysis.js', route => route.fulfill({
    status: 200,
    contentType: 'application/javascript',
    body: `
      export function maybeAnalyzeDeviceSessionAfterFinish(session) {
        globalThis.__deferredDeviceAnalysisIds = [...(globalThis.__deferredDeviceAnalysisIds || []), session.id];
      }
    `,
  }));
  await page.route('**/css/light-*.css*', route => {
    stylesheetRequests += 1;
    return route.fulfill({
      status: 200,
      contentType: 'text/css',
      body: '.light-page { display: grid; }',
    });
  });
  await openBlankPage(page, '/light-sun-loader-cache-coverage');

  const results = await page.evaluate(async ({ loaderUrl }) => {
    const loader = await import(loaderUrl);
    const heroBeforeLoad = loader.renderLoadedLightTodayHero();
    loader.configureLightEnvironmentLoaderDeps({
      getMeasurementsForRoom() {},
      navigate() {},
    });
    const startsUnloaded = loader.isLightSunModulesLoaded() === false;
    const startsUIUnloaded = loader.isLightSunUILoaded() === false;
    const [first, second] = await Promise.all([
      loader.loadLightSunModules(),
      loader.loadLightSunModules(),
    ]);
    const third = await loader.loadLightSunModules();
    const [{ state }, sunStore, deviceStore] = await Promise.all([
      import('/js/state.js'),
      import('/js/sun-sessions-store.js'),
      import('/js/light-devices-store.js'),
    ]);
    state.importedData = {
      entries: [],
      healthGoals: [],
      supplements: [],
      sunSessions: [],
      deviceSessions: [],
      lightDevices: [{
        id: 'loader-coverage-device',
        type: 'sad',
        lux: 10000,
        channels: ['circadian'],
      }],
    };
    const endedAt = Date.now();
    await sunStore.logCompletedSession({
      startedAt: endedAt - 10 * 60 * 1000,
      endedAt,
      doses: { circadian: 10 },
    });
    const deviceSession = await deviceStore.logDeviceSession({
      deviceId: 'loader-coverage-device',
      durationMin: 10,
    });
    await new Promise(resolve => setTimeout(resolve, 50));
    return {
      startsUnloaded,
      startsUIUnloaded,
      loadedHeroUnavailableBeforeInitialization: heroBeforeLoad === '',
      concurrentCallsShareModuleNamespace: first === second,
      laterCallsReuseModuleNamespace: first === third,
      loadedStateFlipsAfterInitialization: loader.isLightSunModulesLoaded() === true,
      loadedHeroAvailableAfterInitialization:
        loader.renderLoadedLightTodayHero() === '<section>loaded Light Today hero</section>',
      backgroundLoadLeavesUIUninitialized: loader.isLightSunUILoaded() === false,
      backgroundLoadAddsNoStylesheets:
        document.querySelectorAll('link[data-light-sun-stylesheet]').length === 0,
      lazyModuleEvaluatesOnce:
        globalThis.__lightSunModuleEvalCount === 1
        && first.marker === 'light-sun-ready',
      lightEnvironmentDepsAppliedOnLazyLoad:
        globalThis.__lightEnvironmentLoaderDepKeys?.join(',') === 'getMeasurementsForRoom,navigate',
      incompleteSunRecordDoesNotRequestAnalysis:
        !globalThis.__deferredSunAnalysisIds?.length,
      deferredDeviceCompletionAnalyzedOnce:
        globalThis.__deferredDeviceAnalysisIds?.length === 1
        && globalThis.__deferredDeviceAnalysisIds[0] === deviceSession?.id,
    };
  }, {
    loaderUrl: '/js/light-sun-loader.js',
  });
  results.lazyModuleRequestedOnce = moduleRequests === 1;
  results.backgroundLoadMakesNoStylesheetRequests = stylesheetRequests === 0;

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});

test('Light & Sun UI loader caches concurrent ordered stylesheet initialization', async ({ page }) => {
  let moduleRequests = 0;
  const stylesheetRequests = [];
  await page.route('**/js/app-light-sun-modules.js', route => {
    moduleRequests += 1;
    return route.fulfill({
      status: 200,
      contentType: 'application/javascript',
      body: `
        globalThis.__lightSunUIEvalCount = (globalThis.__lightSunUIEvalCount || 0) + 1;
        export const marker = 'light-sun-ui-ready';
      `,
    });
  });
  await page.route('**/css/light-*.css*', route => {
    stylesheetRequests.push(new URL(route.request().url()).pathname);
    return route.fulfill({
      status: 200,
      contentType: 'text/css',
      body: '.light-page { display: grid; }',
    });
  });
  await openBlankPage(page, '/light-sun-ui-loader-cache-coverage');

  const results = await page.evaluate(async ({ loaderUrl }) => {
    const loader = await import(loaderUrl);
    const [first, second] = await Promise.all([
      loader.loadLightSunUI(),
      loader.loadLightSunUI(),
    ]);
    const third = await loader.loadLightSunUI();
    const stylesheetPaths = [...document.querySelectorAll('link[data-light-sun-stylesheet]')]
      .map(link => new URL(link.href).pathname);
    return {
      concurrentCallsShareModuleNamespace: first === second,
      laterCallsReuseModuleNamespace: first === third,
      UIStateFlipsAfterInitialization: loader.isLightSunUILoaded() === true,
      moduleStateAlsoLoaded: loader.isLightSunModulesLoaded() === true,
      moduleEvaluatedOnce:
        globalThis.__lightSunUIEvalCount === 1
        && first.marker === 'light-sun-ui-ready',
      stylesheetsPreserveCascadeOrder: stylesheetPaths.join(',') === [
        '/css/light-sun.css',
        '/css/light-channels.css',
        '/css/light-devices.css',
        '/css/light-conditions-now.css',
        '/css/light-setup.css',
        '/css/light-tools.css',
        '/css/light-env.css',
      ].join(','),
    };
  }, {
    loaderUrl: '/js/light-sun-loader.js',
  });
  results.lazyModuleRequestedOnce = moduleRequests === 1;
  results.eachStylesheetRequestedOnce =
    stylesheetRequests.length === 7
    && new Set(stylesheetRequests).size === 7;

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});

test('Light & Sun UI loader retries failed styles without re-evaluating its module', async ({ page }) => {
  let moduleRequests = 0;
  const stylesheetRequests = [];
  let failedEnvironmentStylesheet = false;
  await page.route('**/js/app-light-sun-modules.js', route => {
    moduleRequests += 1;
    return route.fulfill({
      status: 200,
      contentType: 'application/javascript',
      body: `
        globalThis.__lightSunUIRetryEvalCount = (globalThis.__lightSunUIRetryEvalCount || 0) + 1;
        export const marker = 'light-sun-ui-retried';
      `,
    });
  });
  await page.route('**/css/light-*.css*', route => {
    const url = new URL(route.request().url());
    stylesheetRequests.push(`${url.pathname}${url.search}`);
    if (url.pathname === '/css/light-env.css' && !failedEnvironmentStylesheet) {
      failedEnvironmentStylesheet = true;
      return route.abort('failed');
    }
    return route.fulfill({
      status: 200,
      contentType: 'text/css',
      body: '.light-page { display: grid; }',
    });
  });
  await openBlankPage(page, '/light-sun-ui-loader-retry-coverage');

  const results = await page.evaluate(async ({ loaderUrl }) => {
    const loader = await import(loaderUrl);
    let firstRejected = false;
    try {
      await loader.loadLightSunUI();
    } catch {
      firstRejected = true;
    }
    const linksRemovedAfterFailure =
      document.querySelectorAll('link[data-light-sun-stylesheet]').length === 0;
    const retried = await loader.loadLightSunUI();
    const links = [...document.querySelectorAll('link[data-light-sun-stylesheet]')];
    return {
      firstRejected,
      linksRemovedAfterFailure,
      retrySucceeds: retried.marker === 'light-sun-ui-retried',
      UIStateFlipsAfterRetry: loader.isLightSunUILoaded() === true,
      moduleEvaluatedOnce: globalThis.__lightSunUIRetryEvalCount === 1,
      retryUsesFixedStylesheetUrls:
        links.length === 7
        && links.every(link => new URL(link.href).searchParams.get('lazy-retry') === '1'),
    };
  }, {
    loaderUrl: '/js/light-sun-loader.js',
  });
  results.moduleRequestedOnce = moduleRequests === 1;
  results.twoCompleteStylesheetBatchesRequested =
    stylesheetRequests.length === 14
    && stylesheetRequests.slice(7).every(url => url.endsWith('?lazy-retry=1'));

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});

test('Light & Sun loader clears its cached promise after failure', async ({ page }) => {
  let moduleRequests = 0;
  await page.route('**/js/app-light-sun-modules.js', route => {
    moduleRequests += 1;
    return route.abort('failed');
  });
  await openBlankPage(page, '/light-sun-loader-failure-coverage');

  const results = await page.evaluate(async ({ loaderUrl }) => {
    const loader = await import(loaderUrl);
    const firstPromise = loader.loadLightSunModules();
    let firstRejected = false;
    try {
      await firstPromise;
    } catch {
      firstRejected = true;
    }
    const secondPromise = loader.loadLightSunModules();
    let secondRejected = false;
    try {
      await secondPromise;
    } catch {
      secondRejected = true;
    }
    const [{ state }, sunStore, deviceStore] = await Promise.all([
      import('/js/state.js'),
      import('/js/sun-sessions-store.js'),
      import('/js/light-devices-store.js'),
    ]);
    state.importedData = {
      entries: [],
      healthGoals: [],
      supplements: [],
      sunSessions: [],
      deviceSessions: [],
      lightDevices: [{
        id: 'loader-failure-device',
        type: 'sad',
        lux: 10000,
        channels: ['circadian'],
      }],
    };
    const endedAt = Date.now();
    await sunStore.logCompletedSession({
      startedAt: endedAt - 5 * 60 * 1000,
      endedAt,
      doses: { circadian: 5 },
    });
    const deviceSession = await deviceStore.logDeviceSession({
      deviceId: 'loader-failure-device',
      durationMin: 5,
    });
    await new Promise(resolve => setTimeout(resolve, 50));
    return {
      failedLoadRejects: firstRejected && secondRejected,
      failureLeavesLoaderUninitialized: loader.isLightSunModulesLoaded() === false,
      retryUsesAFreshPromise: firstPromise !== secondPromise,
      deferredCompletionFailuresStayContained:
        state.importedData.sunSessions.length === 1
        && state.importedData.deviceSessions.length === 1
        && !!deviceSession,
    };
  }, {
    loaderUrl: '/js/light-sun-loader.js',
  });
  results.failedModuleIsOnlyFetchedOnceByBrowserModuleCache = moduleRequests === 1;

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});

test('returning-user startup defers Light UI resources until the Light route opens', async ({ page }) => {
  const lightStylesheetPaths = new Set([
    '/css/light-sun.css',
    '/css/light-channels.css',
    '/css/light-devices.css',
    '/css/light-conditions-now.css',
    '/css/light-setup.css',
    '/css/light-tools.css',
    '/css/light-env.css',
  ]);
  const stylesheetRequests = [];
  let moduleRequests = 0;
  let lightTodayAIRequests = 0;
  const privacyModuleRequests = [];
  page.on('request', request => {
    const pathname = new URL(request.url()).pathname;
    if (lightStylesheetPaths.has(pathname)) stylesheetRequests.push(pathname);
    if (pathname === '/js/app-light-sun-modules.js') moduleRequests += 1;
    if (pathname === '/js/light-today-ai.js') lightTodayAIRequests += 1;
    if (
      pathname === '/js/settings-runtime.js'
      || pathname === '/js/settings-privacy.js'
      || pathname === '/js/pii.js'
    ) {
      privacyModuleRequests.push(pathname);
    }
  });
  await page.addInitScript(() => {
    localStorage.setItem('labcharts-legal-acceptance', JSON.stringify({
      accepted: true,
      termsVersion: '2026-08-22',
      privacyVersion: '2026-08-22',
      policyScope: 'self-hosted-notice',
      acceptedAt: '2026-07-24T00:00:00.000Z',
      appVersion: 'light-ui-loader-coverage',
      location: 'light-ui-loader-coverage',
    }));
    localStorage.setItem('labcharts-default-onboarded', 'profile-set');
    localStorage.setItem('labcharts-default-emptyTour', 'completed');
    localStorage.setItem('labcharts-default-tour', 'completed');
    localStorage.setItem('labcharts-default-ai-reminder-dismissed', '1');
    localStorage.setItem('labcharts-onboard-extras-done-default', '1');
    localStorage.setItem('labcharts-onboard-provider-skipped-default', '1');
  });

  await page.goto('/app', { waitUntil: 'networkidle' });
  expect(stylesheetRequests).toEqual([]);
  expect(moduleRequests).toBe(0);
  expect(lightTodayAIRequests).toBe(0);
  expect(privacyModuleRequests).toEqual([]);
  await expect(page.locator('link[data-light-sun-stylesheet]')).toHaveCount(0);

  await page.evaluate(async () => (await import('/js/views.js')).navigate('light'));
  await expect(page.locator('.light-page')).toBeVisible();
  await expect(page.locator('#sun-data-source-section')).toHaveCount(1);
  await expect(page.locator('#sun-data-source-section')).toContainText('Sun data source');
  await expect(page.locator('.light-page')).toHaveCSS('display', 'grid');
  await expect(page.locator('link[data-light-sun-stylesheet]')).toHaveCount(7);
  expect(moduleRequests).toBe(1);
  expect(lightTodayAIRequests).toBe(1);
  expect(new Set(privacyModuleRequests)).toEqual(new Set([
    '/js/settings-runtime.js',
    '/js/settings-privacy.js',
    '/js/pii.js',
  ]));
  expect(stylesheetRequests.length).toBe(7);
  expect(new Set(stylesheetRequests)).toEqual(lightStylesheetPaths);
});
