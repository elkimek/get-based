import { expect, test } from './coverage-fixture.js';

test.use({ serviceWorkers: 'allow' });

const TEST_IDENTITY = {
  ownerId: 'BSf-8mxNjgk72yD-D7rr1A',
  mnemonic: 'oven federal awkward resist alter sound social version apart misery differ power buyer cloud avocado amount lady wedding silent nest fragile blanket oval fame',
};

test('installed PWA completes a cache-only cold offline relaunch', async ({ page }, testInfo) => {
  testInfo.setTimeout(120_000);
  const failedStaticRequests = [];
  let recordFailures = false;

  page.on('requestfailed', (request) => {
    if (!recordFailures) return;
    const url = new URL(request.url());
    const isSameOriginStatic = url.origin === new URL(page.url()).origin
      && /\.(?:css|js|mjs|woff2|json|svg|png|wasm|pdf)$/.test(url.pathname);
    if (isSameOriginStatic) {
      failedStaticRequests.push({ url: url.pathname, error: request.failure()?.errorText || '' });
    }
  });

  await page.goto('/app?dev-sw=1', { waitUntil: 'networkidle' });
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (navigator.serviceWorker.controller) return;
    await Promise.race([
      new Promise((resolve) => {
        navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true });
      }),
      new Promise((_, reject) => {
        setTimeout(() => reject(new Error('service worker did not claim the app')), 20_000);
      }),
    ]);
  });

  const installed = await page.evaluate(async () => {
    const cacheNames = await caches.keys();
    const appCacheName = cacheNames.find((name) => name.startsWith('labcharts-v')) || '';
    const appCache = await caches.open(appCacheName);
    const cachedPaths = (await appCache.keys()).map((request) => new URL(request.url).pathname);
    return {
      appCacheName,
      cachedPaths,
      controlled: !!navigator.serviceWorker.controller,
    };
  });
  expect(installed.controlled).toBe(true);
  expect(installed.appCacheName).toContain('labcharts-v');
  expect(installed.cachedPaths).toContain('/js/legal-consent-bootstrap.js');
  expect(installed.cachedPaths).toContain('/js/legal-consent.js');
  expect(installed.cachedPaths).toContain('/js/profile-share.js');
  expect(installed.cachedPaths).toContain('/js/chat-onboarding-host-bindings.js');
  expect(installed.cachedPaths).toContain('/js/demo-nutrition.js');
  expect(installed.cachedPaths).toContain('/vendor/fonts/inter-400-7.woff2');
  expect(installed.cachedPaths).toContain('/vendor/evolu/evolu-bundle.js');
  expect(installed.cachedPaths).toContain('/vendor/evolu/Db.worker.js');
  expect(installed.cachedPaths).toContain('/vendor/evolu8/evolu-bundle.js');
  expect(installed.cachedPaths).toContain('/vendor/evolu8/Db.worker.js');
  expect(installed.cachedPaths).toContain('/vendor/evolu8/Shared.worker.js');

  await page.evaluate(async identity => {
    const { createEvolu8IdentityVault } = await import('/js/sync-evolu8-identity-vault.js');
    await createEvolu8IdentityVault().write(identity);
    localStorage.setItem('labcharts-sync-enabled', 'true');
  }, TEST_IDENTITY);

  const client = await page.context().newCDPSession(page);
  await client.send('Network.enable');
  await client.send('Network.clearBrowserCache');
  await page.context().setOffline(true);
  recordFailures = true;

  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('#main-content')).toContainText('Welcome to getbased', { timeout: 20_000 });
  await expect.poll(() => page.evaluate(async () => {
    const runtime = await import('/js/sync-runtime.js');
    return {
      clientVersion: runtime.getSyncEvolu()?.__evoluClientVersion || null,
      ownerId: runtime.getSyncAppOwner()?.id ? String(runtime.getSyncAppOwner().id) : null,
    };
  }), { timeout: 30_000 }).toEqual({ clientVersion: 8, ownerId: TEST_IDENTITY.ownerId });
  await page.waitForTimeout(500);
  expect(failedStaticRequests).toEqual([]);
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
});
