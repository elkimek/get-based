import { expect, test } from './coverage-fixture.js';

function moduleUrl(path) {
  return `${path}?wearablesStylesheetCoverage=${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

async function openWearablesLoaderPage(page, path) {
  await page.route(`**${path}`, route => route.fulfill({
    status: 200,
    contentType: 'text/html',
    body: `<!doctype html><html><head>
      <meta data-client-list-stylesheet-anchor>
      <meta data-wearables-stylesheet-anchor>
      <meta data-light-sun-stylesheet-anchor>
      <link rel="stylesheet" href="/css/chat-panel.css">
    </head><body></body></html>`,
  }));
  await page.goto(path, { waitUntil: 'load' });
}

function syntheticWearablesModule() {
  return `
    globalThis.__wearablesModuleEvalCount = (globalThis.__wearablesModuleEvalCount || 0) + 1;
    export function openWearableDetail(metricId) {
      if (metricId === 'throw') throw new Error('synthetic Wearables action failure');
      globalThis.__openedWearableDetails = [
        ...(globalThis.__openedWearableDetails || []),
        metricId,
      ];
      return metricId;
    }
    export function syncWearableNow(actionEl) {
      return actionEl?.dataset?.provider || 'manual';
    }
    export function openManualLogForm(metricId) {
      return metricId;
    }
    export function _uninstallWearableModalFocusTrap() {
      globalThis.__wearablesFocusTrapCleanup =
        (globalThis.__wearablesFocusTrapCleanup || 0) + 1;
      if (globalThis.__wearablesFocusTrapCleanup > 1) {
        throw new Error('synthetic Wearables cleanup failure');
      }
      return true;
    }
  `;
}

test('Wearables implementation stays cold and lazy actions single-flight its load', async ({ page }) => {
  let moduleRequests = 0;
  await page.route('**/js/wearables.js*', route => {
    moduleRequests += 1;
    return route.fulfill({
      status: 200,
      contentType: 'application/javascript',
      body: syntheticWearablesModule(),
    });
  });
  await openWearablesLoaderPage(page, '/wearables-module-cache-coverage');

  const outcomes = await page.evaluate(async ({ runtimeUrl }) => {
    const runtime = await import(runtimeUrl);
    runtime.configureWearablesRuntime({
      loadModule: useRetryUrl => useRetryUrl
        ? import('/js/wearables.js?lazy-retry=1')
        : import('/js/wearables.js'),
    });
    const startsUnloaded = runtime.isWearablesModuleLoaded() === false;
    const cleanupBeforeLoad = runtime.getWearablesModuleFunction(
      '_uninstallWearableModalFocusTrap',
    )?.();
    const [first, second] = await Promise.all([
      runtime.loadWearablesModule(),
      runtime.loadWearablesModule(),
    ]);
    const third = await runtime.loadWearablesModule();
    const opened = await runtime.getWearablesModuleFunction('openWearableDetail')?.('sleep_score');
    const synced = await runtime.getWearablesModuleFunction('syncWearableNow')?.({
      dataset: { provider: 'oura' },
    });
    const manualForm = await runtime.getWearablesModuleFunction('openManualLogForm')?.('weight');
    const failedAction = await runtime.getWearablesModuleFunction('openWearableDetail')?.('throw');
    const cleaned = runtime.getWearablesModuleFunction('_uninstallWearableModalFocusTrap')?.();
    const failedCleanup = runtime.getWearablesModuleFunction(
      '_uninstallWearableModalFocusTrap',
    )?.();
    return {
      startsUnloaded,
      cleanupBeforeLoadDoesNotInitialize: cleanupBeforeLoad === undefined,
      concurrentCallsShareModuleNamespace: first === second,
      laterCallsReuseModuleNamespace: first === third,
      loadedStateFlipsAfterInitialization: runtime.isWearablesModuleLoaded() === true,
      lazyModuleEvaluatesOnce: globalThis.__wearablesModuleEvalCount === 1,
      actionForwardsMetric:
        opened === 'sleep_score'
        && globalThis.__openedWearableDetails?.join(',') === 'sleep_score',
      remainingActionsDelegate: synced === 'oura' && manualForm === 'weight',
      loadedActionFailureContained: failedAction === false,
      loadedCleanupDelegates:
        cleaned === true
        && globalThis.__wearablesFocusTrapCleanup === 2,
      loadedCleanupFailureContained: failedCleanup === undefined,
    };
  }, { runtimeUrl: moduleUrl('/js/wearables-runtime.js') });

  for (const [name, passed] of Object.entries(outcomes)) {
    expect(passed, name).toBe(true);
  }
  expect(moduleRequests).toBe(1);
});

test('Wearables implementation retries a failed direct import with a fresh URL', async ({ page }) => {
  const moduleRequestUrls = [];
  await page.route('**/js/wearables.js*', route => {
    moduleRequestUrls.push(route.request().url());
    if (moduleRequestUrls.length === 1) return route.abort('failed');
    return route.fulfill({
      status: 200,
      contentType: 'application/javascript',
      body: syntheticWearablesModule(),
    });
  });
  await openWearablesLoaderPage(page, '/wearables-module-retry-coverage');

  const outcomes = await page.evaluate(async ({ runtimeUrl }) => {
    const runtime = await import(runtimeUrl);
    runtime.configureWearablesRuntime({
      loadModule: useRetryUrl => useRetryUrl
        ? import('/js/wearables.js?lazy-retry=1')
        : import('/js/wearables.js'),
    });
    let firstRejected = false;
    try {
      await runtime.loadWearablesModule();
    } catch {
      firstRejected = true;
    }
    const retried = await runtime.loadWearablesModule();
    return {
      firstRejected,
      retrySucceeds: retried.openManualLogForm('weight') === 'weight',
      loadedAfterRetry: runtime.isWearablesModuleLoaded() === true,
    };
  }, { runtimeUrl: moduleUrl('/js/wearables-runtime.js') });

  for (const [name, passed] of Object.entries(outcomes)) {
    expect(passed, name).toBe(true);
  }
  expect(moduleRequestUrls).toHaveLength(2);
  expect(new URL(moduleRequestUrls[1]).searchParams.get('lazy-retry')).toBe('1');
});

test('Wearables lazy actions contain implementation load failures', async ({ page }) => {
  let moduleRequests = 0;
  await page.route('**/js/wearables.js*', route => {
    moduleRequests += 1;
    return route.abort('failed');
  });
  await openWearablesLoaderPage(page, '/wearables-module-entry-failure-coverage');

  const outcomes = await page.evaluate(async ({ runtimeUrl }) => {
    const runtime = await import(runtimeUrl);
    runtime.configureWearablesRuntime({
      loadModule: useRetryUrl => useRetryUrl
        ? import('/js/wearables.js?lazy-retry=1')
        : import('/js/wearables.js'),
    });
    const openDetail = runtime.getWearablesModuleFunction('openWearableDetail');
    return {
      actionFailureContained: await openDetail?.('sleep_score') === false,
      remainsUnloaded: runtime.isWearablesModuleLoaded() === false,
    };
  }, { runtimeUrl: moduleUrl('/js/wearables-runtime.js') });

  expect(outcomes).toEqual({
    actionFailureContained: true,
    remainsUnloaded: true,
  });
  expect(moduleRequests).toBe(1);
});

test('real app shell keeps Wearables implementation cold until its first action', async ({ page }) => {
  let moduleRequests = 0;
  page.on('request', request => {
    if (new URL(request.url()).pathname === '/js/wearables.js') moduleRequests += 1;
  });

  await page.goto('/app', { waitUntil: 'networkidle' });
  expect(moduleRequests).toBe(0);

  const outcomes = await page.evaluate(async () => {
    const runtime = await import('/js/wearables-runtime.js');
    const startsUnloaded = runtime.isWearablesModuleLoaded() === false;
    const module = await runtime.loadWearablesModule();
    return {
      startsUnloaded,
      loadedAfterRequest: runtime.isWearablesModuleLoaded() === true,
      implementationOwnsBridge:
        runtime.getWearablesModuleFunction('openWearableDetail') === module.openWearableDetail
        && runtime.getWearablesModuleFunction('openManualLogForm') === module.openManualLogForm,
    };
  });

  expect(outcomes).toEqual({
    startsUnloaded: true,
    loadedAfterRequest: true,
    implementationOwnsBridge: true,
  });
  expect(moduleRequests).toBe(1);
});

test('Wearables stylesheet loader single-flights and preserves cascade order', async ({ page }) => {
  let stylesheetRequests = 0;
  await page.route('**/css/wearables.css*', route => {
    stylesheetRequests += 1;
    return route.fulfill({
      status: 200,
      contentType: 'text/css',
      body: '.wearable-detail-stats { display: grid; }',
    });
  });
  await openWearablesLoaderPage(page, '/wearables-stylesheet-cache-coverage');

  const outcomes = await page.evaluate(async ({ runtimeUrl }) => {
    const runtime = await import(runtimeUrl);
    const loadedBeforeRequest = runtime.isWearablesStylesheetLoaded();
    const [first, second] = await Promise.all([
      runtime.loadWearablesStylesheet(),
      runtime.loadWearablesStylesheet(),
    ]);
    const third = await runtime.loadWearablesStylesheet();
    const anchor = document.querySelector('[data-wearables-stylesheet-anchor]');
    return {
      loadedBeforeRequest,
      loadedAfterRequest: runtime.isWearablesStylesheetLoaded(),
      concurrentCallsShareTheSameLink: first === second,
      laterCallsReuseTheResolvedLink: first === third,
      oneStylesheetLink:
        document.querySelectorAll('link[data-wearables-stylesheet]').length === 1,
      linkPrecedesAnchor: first.nextElementSibling === anchor,
      lightAnchorFollowsAnchor:
        anchor?.nextElementSibling?.hasAttribute('data-light-sun-stylesheet-anchor') === true,
    };
  }, { runtimeUrl: moduleUrl('/js/wearables-runtime.js') });

  expect(outcomes).toEqual({
    loadedBeforeRequest: false,
    loadedAfterRequest: true,
    concurrentCallsShareTheSameLink: true,
    laterCallsReuseTheResolvedLink: true,
    oneStylesheetLink: true,
    linkPrecedesAnchor: true,
    lightAnchorFollowsAnchor: true,
  });
  expect(stylesheetRequests).toBe(1);
});

test('Wearables stylesheet failure is contained and retries with a fresh URL', async ({ page }) => {
  const stylesheetRequests = [];
  await page.route('**/css/wearables.css*', route => {
    stylesheetRequests.push(route.request().url());
    return route.abort('failed');
  });
  await openWearablesLoaderPage(page, '/wearables-stylesheet-retry-coverage');

  const runtimeUrl = moduleUrl('/js/wearables-runtime.js');
  const firstLoaded = await page.evaluate(
    async ({ runtimeUrl: url }) => (await import(url)).loadWearablesStylesheetForAction(),
    { runtimeUrl },
  );
  expect(firstLoaded).toBe(false);
  expect(stylesheetRequests).toHaveLength(1);
  await expect(page.locator('link[data-wearables-stylesheet]')).toHaveCount(0);

  await page.unroute('**/css/wearables.css*');
  const retry = await page.evaluate(async ({ runtimeUrl: url }) => {
    const runtime = await import(url);
    const loaded = await runtime.loadWearablesStylesheetForAction();
    const link = document.querySelector('link[data-wearables-stylesheet]');
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

test('Dashboard biometric detail waits for Wearables presentation', async ({ page }) => {
  let stylesheetRoute;
  await page.route('**/css/wearables.css*', route => {
    stylesheetRoute = route;
  });
  await page.goto('/app', { waitUntil: 'load' });

  const opened = await page.evaluate(async () => {
    const [dashboardRuntime, wearablesRuntime] = await Promise.all([
      import('/js/dashboard-widget-runtime.js'),
      import('/js/wearables-runtime.js'),
    ]);
    window.__wearablesDetailCalls = [];
    wearablesRuntime.configureWearablesModuleBridge({
      openWearableDetail: id => window.__wearablesDetailCalls.push(id),
    });
    return {
      accepted: dashboardRuntime.openDashboardWearableDetail('sleep_score'),
      callsBeforeStylesheet: [...window.__wearablesDetailCalls],
    };
  });

  expect(opened).toEqual({
    accepted: true,
    callsBeforeStylesheet: [],
  });
  await expect.poll(() => !!stylesheetRoute).toBe(true);
  await stylesheetRoute.fulfill({
    status: 200,
    contentType: 'text/css',
    body: '.wearable-detail-stats { display: grid; }',
  });
  await expect.poll(() => page.evaluate(() => window.__wearablesDetailCalls)).toEqual(['sleep_score']);
});

test('Dashboard manual biometric card stays styled before Wearables presentation loads', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });

  const outcomes = await page.evaluate(() => {
    const host = document.createElement('div');
    host.innerHTML = `<div class="db-biometric-tile-wrap">
      <div class="wearable-card wearable-card-empty db-biometric-manual-empty">
        <div class="wearable-card-top"><span class="wearable-metric-name">Weight</span></div>
        <div class="wearable-value-row wearable-value-row-empty">
          <span class="wearable-value wearable-value-dash">-</span>
        </div>
        <div class="wearable-card-bottom"><div class="wearable-empty-cta">+ Log</div></div>
      </div>
    </div>`;
    document.body.append(host);
    const card = host.querySelector('.db-biometric-manual-empty');
    const title = host.querySelector('.wearable-metric-name');
    const action = host.querySelector('.wearable-empty-cta');
    return {
      stylesheetAbsent:
        document.querySelector('link[data-wearables-stylesheet]') === null,
      cardDisplay: card ? getComputedStyle(card).display : '',
      cardBorderStyle: card ? getComputedStyle(card).borderStyle : '',
      cardMinHeight: card ? getComputedStyle(card).minHeight : '',
      titleTransform: title ? getComputedStyle(title).textTransform : '',
      actionWeight: action ? getComputedStyle(action).fontWeight : '',
    };
  });

  expect(outcomes).toEqual({
    stylesheetAbsent: true,
    cardDisplay: 'flex',
    cardBorderStyle: 'solid',
    cardMinHeight: '104px',
    titleTransform: 'uppercase',
    actionWeight: '600',
  });
});
