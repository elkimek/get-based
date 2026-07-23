import { expect, test } from './coverage-fixture.js';

const moduleUrl = path => `${path}?lightSunLoaderCoverage=${Date.now()}-${Math.random().toString(36).slice(2)}`;

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
  await openBlankPage(page, '/light-sun-loader-cache-coverage');

  const results = await page.evaluate(async ({ loaderUrl }) => {
    const loader = await import(loaderUrl);
    const startsUnloaded = loader.isLightSunModulesLoaded() === false;
    const [first, second] = await Promise.all([
      loader.loadLightSunModules(),
      loader.loadLightSunModules(),
    ]);
    const third = await loader.loadLightSunModules();
    return {
      startsUnloaded,
      concurrentCallsShareModuleNamespace: first === second,
      laterCallsReuseModuleNamespace: first === third,
      loadedStateFlipsAfterInitialization: loader.isLightSunModulesLoaded() === true,
      lazyModuleEvaluatesOnce:
        globalThis.__lightSunModuleEvalCount === 1
        && first.marker === 'light-sun-ready',
    };
  }, {
    loaderUrl: moduleUrl('/js/light-sun-loader.js'),
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
    return {
      failedLoadRejects: firstRejected && secondRejected,
      failureLeavesLoaderUninitialized: loader.isLightSunModulesLoaded() === false,
      retryUsesAFreshPromise: firstPromise !== secondPromise,
    };
  }, {
    loaderUrl: moduleUrl('/js/light-sun-loader.js'),
  });
  results.failedModuleIsOnlyFetchedOnceByBrowserModuleCache = moduleRequests === 1;

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});
