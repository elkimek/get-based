import { expect, test } from './coverage-fixture.js';

async function openBlankPage(page, path) {
  await page.route(`**${path}`, route => route.fulfill({
    status: 200,
    contentType: 'text/html',
    body: '<!doctype html><html><body><main id="main-content"></main></body></html>',
  }));
  await page.goto(path, { waitUntil: 'load' });
}

test('Light & Sun loader caches successful concurrent initialization', async ({ page }) => {
  let moduleRequests = 0;
  await page.route('**/js/app-light-sun-modules.js', route => {
    moduleRequests += 1;
    return route.fulfill({
      status: 200,
      contentType: 'application/javascript',
      body: `
        globalThis.__lightSunModuleEvalCount = (globalThis.__lightSunModuleEvalCount || 0) + 1;
        export const marker = 'light-sun-ready';
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
  await openBlankPage(page, '/light-sun-loader-cache-coverage');

  const results = await page.evaluate(async ({ loaderUrl }) => {
    const loader = await import(loaderUrl);
    const startsUnloaded = loader.isLightSunModulesLoaded() === false;
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
    const sunId = await sunStore.logCompletedSession({
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
      concurrentCallsShareModuleNamespace: first === second,
      laterCallsReuseModuleNamespace: first === third,
      loadedStateFlipsAfterInitialization: loader.isLightSunModulesLoaded() === true,
      lazyModuleEvaluatesOnce:
        globalThis.__lightSunModuleEvalCount === 1
        && first.marker === 'light-sun-ready',
      deferredSunCompletionAnalyzedOnce:
        globalThis.__deferredSunAnalysisIds?.length === 1
        && globalThis.__deferredSunAnalysisIds[0] === sunId,
      deferredDeviceCompletionAnalyzedOnce:
        globalThis.__deferredDeviceAnalysisIds?.length === 1
        && globalThis.__deferredDeviceAnalysisIds[0] === deviceSession?.id,
    };
  }, {
    loaderUrl: '/js/light-sun-loader.js',
  });
  results.lazyModuleRequestedOnce = moduleRequests === 1;

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
