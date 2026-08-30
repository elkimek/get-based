import { devices, expect, test } from '@playwright/test';

const LEGACY_BUNDLE = '**/vendor/evolu/evolu-bundle.js';
const ONE_TAB_ERROR = 'Evolu 8 requires this app to stay open in only one tab in this browser';
const TEST_IDENTITY = {
  ownerId: 'BSf-8mxNjgk72yD-D7rr1A',
  mnemonic: 'oven federal awkward resist alter sound social version apart misery differ power buyer cloud avocado amount lady wedding silent nest fragile blanket oval fame',
};

async function configureCandidate(context, { forceFallback = false } = {}) {
  await context.addInitScript(({ forceOneTabFallback }) => {
    localStorage.setItem('labcharts-sync-relay', 'ws://127.0.0.1:41999');
    if (!forceOneTabFallback) return;

    const replaceGlobal = (name, value) => {
      try {
        Object.defineProperty(globalThis, name, {
          configurable: true,
          writable: true,
          value,
        });
      } catch {}
    };
    replaceGlobal('SharedWorker', undefined);
    replaceGlobal('DisposableStack', undefined);
    replaceGlobal('AsyncDisposableStack', undefined);
    replaceGlobal('SuppressedError', undefined);
    globalThis.__evolu8FallbackForced = typeof globalThis.SharedWorker === 'undefined';
  }, { forceOneTabFallback: forceFallback });
}

async function seedCandidateIdentity(page) {
  await page.evaluate(async identity => {
    const { createEvolu8IdentityVault } = await import('/js/sync-evolu8-identity-vault.js');
    await createEvolu8IdentityVault().write(identity);
    localStorage.setItem('labcharts-sync-enabled', 'true');
  }, TEST_IDENTITY);
}

async function getCompatibleBrowserPage({ browserName, context, page, playwright }, testInfo) {
  if (browserName !== 'webkit') {
    return { context, page, close: async () => {} };
  }

  // WebKit intentionally withholds OPFS in private browsing, while Playwright
  // test contexts are incognito-style. A persistent profile matches normal
  // Safari storage behavior without mocking any filesystem API.
  const persistentContext = await playwright.webkit.launchPersistentContext(
    testInfo.outputPath('webkit-profile'),
    {
      ...devices['Desktop Safari'],
      baseURL: String(testInfo.project.use.baseURL),
      serviceWorkers: 'block',
    },
  );
  const persistentPage = persistentContext.pages()[0] || await persistentContext.newPage();
  return {
    context: persistentContext,
    page: persistentPage,
    close: async () => persistentContext.close(),
  };
}

async function readRuntime(page) {
  return page.evaluate(async () => {
    const runtime = await import('/js/sync-runtime.js');
    const owner = runtime.getSyncAppOwner();
    return {
      clientVersion: runtime.getSyncEvolu()?.__evoluClientVersion || null,
      error: runtime.getSyncAppOwnerError(),
      ownerId: owner?.id ? String(owner.id) : null,
    };
  });
}

async function waitForOwner(page) {
  await expect.poll(async () => {
    const runtime = await readRuntime(page);
    if (runtime.error) throw new Error(runtime.error);
    return runtime.ownerId;
  }, {
    timeout: 30_000,
    intervals: [100, 250, 500, 1000],
  }).not.toBeNull();
  return readRuntime(page);
}

test('starts v8 from its durable identity without the v7 worker', async ({
  browserName, context: defaultContext, page: defaultPage, playwright,
}, testInfo) => {
  const browserPage = await getCompatibleBrowserPage({
    browserName, context: defaultContext, page: defaultPage, playwright,
  }, testInfo);
  const { context, page } = browserPage;
  try {
    await configureCandidate(context);
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    let legacyRequests = 0;
    await page.route(LEGACY_BUNDLE, route => {
      legacyRequests += 1;
      return route.abort();
    });

    await page.goto('/app?evolu-client=v8', { waitUntil: 'domcontentloaded' });
    await seedCandidateIdentity(page);
    await page.reload({ waitUntil: 'domcontentloaded' });
    const first = await waitForOwner(page);
    expect(first.clientVersion).toBe(8);
    expect(first.ownerId).toBe(TEST_IDENTITY.ownerId);
    expect(legacyRequests).toBe(0);

    legacyRequests = 0;
    await page.reload({ waitUntil: 'domcontentloaded' });
    const second = await waitForOwner(page);

    expect(second.ownerId).toBe(first.ownerId);
    expect(second.clientVersion).toBe(8);
    expect(legacyRequests).toBe(0);
    expect(pageErrors).toEqual([]);
  } finally {
    await browserPage.close();
  }
});

test('polyfills resource management and enforces the one-tab worker fallback', async ({
  browserName, context: defaultContext, page: defaultPage, playwright,
}, testInfo) => {
  const browserPage = await getCompatibleBrowserPage({
    browserName, context: defaultContext, page: defaultPage, playwright,
  }, testInfo);
  const { context, page } = browserPage;
  try {
    await configureCandidate(context, { forceFallback: true });
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    let legacyRequests = 0;
    await page.route(LEGACY_BUNDLE, route => {
      legacyRequests += 1;
      return route.abort();
    });

    await page.goto('/app?evolu-client=v8', { waitUntil: 'domcontentloaded' });
    await seedCandidateIdentity(page);
    await page.reload({ waitUntil: 'domcontentloaded' });
    const first = await waitForOwner(page);
    expect(first.clientVersion).toBe(8);
    expect(first.ownerId).toBe(TEST_IDENTITY.ownerId);
    expect(legacyRequests).toBe(0);
    expect(await page.evaluate(() => ({
      asyncDisposableStack: typeof globalThis.AsyncDisposableStack,
      disposableStack: typeof globalThis.DisposableStack,
      fallbackForced: globalThis.__evolu8FallbackForced,
      sharedWorker: typeof globalThis.SharedWorker,
      suppressedError: typeof globalThis.SuppressedError,
    }))).toEqual({
      asyncDisposableStack: 'function',
      disposableStack: 'function',
      fallbackForced: true,
      sharedWorker: 'function',
      suppressedError: 'function',
    });

    const secondPage = await context.newPage();
    secondPage.on('pageerror', error => pageErrors.push(error.message));
    await secondPage.goto('/app?evolu-client=v8', { waitUntil: 'domcontentloaded' });
    await expect.poll(async () => (await readRuntime(secondPage)).error, {
      timeout: 30_000,
      intervals: [100, 250, 500, 1000],
    }).toBe(ONE_TAB_ERROR);

    await secondPage.close();
    expect(pageErrors).toEqual([]);
  } finally {
    await browserPage.close();
  }
});
