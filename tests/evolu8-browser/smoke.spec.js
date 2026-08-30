import { expect, test } from '@playwright/test';

const LEGACY_BUNDLE = '**/vendor/evolu/evolu-bundle.js';
const ONE_TAB_ERROR = 'Evolu 8 requires this app to stay open in only one tab in this browser';

async function configureCandidate(context, { forceFallback = false } = {}) {
  await context.addInitScript(({ forceOneTabFallback }) => {
    localStorage.setItem('labcharts-sync-enabled', 'true');
    localStorage.setItem('labcharts-sync-relay', 'ws://127.0.0.1:9');
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
  await expect.poll(async () => (await readRuntime(page)).ownerId, {
    timeout: 30_000,
    intervals: [100, 250, 500, 1000],
  }).not.toBeNull();
  return readRuntime(page);
}

test('starts v8 and reuses its durable identity without the v7 worker', async ({ context, page }) => {
  await configureCandidate(context);
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  let blockLegacy = false;
  let legacyRequests = 0;
  await page.route(LEGACY_BUNDLE, route => {
    legacyRequests += 1;
    return blockLegacy ? route.abort() : route.continue();
  });

  await page.goto('/app?evolu-client=v8', { waitUntil: 'domcontentloaded' });
  const first = await waitForOwner(page);
  expect(first.clientVersion).toBe(8);
  expect(legacyRequests).toBeGreaterThan(0);

  blockLegacy = true;
  legacyRequests = 0;
  await page.reload({ waitUntil: 'domcontentloaded' });
  const second = await waitForOwner(page);

  expect(second.ownerId).toBe(first.ownerId);
  expect(second.clientVersion).toBe(8);
  expect(legacyRequests).toBe(0);
  expect(pageErrors).toEqual([]);
});

test('polyfills resource management and enforces the one-tab worker fallback', async ({ context, page }) => {
  await configureCandidate(context, { forceFallback: true });
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));

  await page.goto('/app?evolu-client=v8', { waitUntil: 'domcontentloaded' });
  const first = await waitForOwner(page);
  expect(first.clientVersion).toBe(8);
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
});
