import { expect, test } from './coverage-fixture.js';

function moduleUrl() {
  return `/js/modal-lifecycle.js?dataProtectionStylesheetCoverage=${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

async function openLoaderPage(page, path) {
  await page.route(`**${path}`, route => route.fulfill({
    status: 200,
    contentType: 'text/html',
    body: `<!doctype html><html><head>
      <meta data-genetics-stylesheet-anchor>
      <meta data-data-protection-stylesheet-anchor>
      <meta data-settings-stylesheet-anchor>
    </head><body><div id="notification-container"></div></body></html>`,
  }));
  await page.goto(path, { waitUntil: 'load' });
}

test('data protection stylesheet loader single-flights and preserves cascade order', async ({ page }) => {
  let stylesheetRequests = 0;
  await page.route('**/css/data-protection.css*', route => {
    stylesheetRequests += 1;
    return route.fulfill({
      status: 200,
      contentType: 'text/css',
      body: '.passphrase-overlay { position: fixed; }',
    });
  });
  await openLoaderPage(page, '/data-protection-stylesheet-cache-coverage');

  const outcomes = await page.evaluate(async ({ runtimeUrl }) => {
    const runtime = await import(runtimeUrl);
    const loadedBeforeRequest = runtime.isDataProtectionStylesheetLoaded();
    const [first, second] = await Promise.all([
      runtime.loadDataProtectionStylesheet(),
      runtime.loadDataProtectionStylesheet(),
    ]);
    const third = await runtime.loadDataProtectionStylesheet();
    const anchor = document.querySelector('[data-data-protection-stylesheet-anchor]');
    return {
      loadedBeforeRequest,
      loadedAfterRequest: runtime.isDataProtectionStylesheetLoaded(),
      concurrentCallsShareTheSameLink: first === second,
      laterCallsReuseTheResolvedLink: first === third,
      oneStylesheetLink:
        document.querySelectorAll('link[data-data-protection-stylesheet]').length === 1,
      linkPrecedesAnchor: first.nextElementSibling === anchor,
      anchorPreservesCascade:
        anchor?.previousElementSibling === first
        && anchor?.nextElementSibling?.hasAttribute('data-settings-stylesheet-anchor') === true,
    };
  }, { runtimeUrl: moduleUrl() });

  expect(outcomes).toEqual({
    loadedBeforeRequest: false,
    loadedAfterRequest: true,
    concurrentCallsShareTheSameLink: true,
    laterCallsReuseTheResolvedLink: true,
    oneStylesheetLink: true,
    linkPrecedesAnchor: true,
    anchorPreservesCascade: true,
  });
  expect(stylesheetRequests).toBe(1);
});

test('data protection stylesheet failure is contained and retries with a fresh URL', async ({ page }) => {
  const stylesheetRequests = [];
  await page.route('**/css/data-protection.css*', route => {
    stylesheetRequests.push(route.request().url());
    return route.abort('failed');
  });
  await openLoaderPage(page, '/data-protection-stylesheet-retry-coverage');
  const runtimeUrl = moduleUrl();

  const firstAttempt = await page.evaluate(async ({ runtimeUrl: url }) => {
    const runtime = await import(url);
    return {
      loaded: await runtime.loadDataProtectionStylesheetForAction(),
      links: document.querySelectorAll('link[data-data-protection-stylesheet]').length,
    };
  }, { runtimeUrl });

  expect(firstAttempt).toEqual({ loaded: false, links: 0 });
  expect(stylesheetRequests).toHaveLength(1);

  const encryptedStartup = await page.evaluate(async () => {
    localStorage.setItem('labcharts-encryption-enabled', 'true');
    const cryptoStore = await import(`/js/crypto.js?stylesheetFailure=${Date.now()}`);
    void cryptoStore.initEncryption();
    for (let attempt = 0; attempt < 50; attempt += 1) {
      if (document.getElementById('passphrase-overlay')) break;
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    return {
      unlockStillRenders: !!document.getElementById('passphrase-unlock-btn'),
      failedLinkRemoved:
        document.querySelectorAll('link[data-data-protection-stylesheet]').length === 0,
    };
  });
  expect(encryptedStartup).toEqual({
    unlockStillRenders: true,
    failedLinkRemoved: true,
  });

  await page.unroute('**/css/data-protection.css*');
  const retry = await page.evaluate(async ({ runtimeUrl: url }) => {
    const runtime = await import(url);
    const loaded = await runtime.loadDataProtectionStylesheetForAction();
    const link = document.querySelector('link[data-data-protection-stylesheet]');
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

test('cold startup defers data protection presentation until an encryption action', async ({ page }) => {
  let stylesheetRequests = 0;
  page.on('request', request => {
    if (new URL(request.url()).pathname === '/css/data-protection.css') stylesheetRequests += 1;
  });

  await page.goto('/app', { waitUntil: 'networkidle' });
  expect(stylesheetRequests).toBe(0);
  await expect(page.locator('link[data-data-protection-stylesheet]')).toHaveCount(0);

  const opened = await page.evaluate(async () => {
    const cryptoStore = await import('/js/crypto.js');
    await cryptoStore.showEnableEncryptionModal();
    const overlay = document.getElementById('passphrase-overlay');
    return {
      display: overlay ? getComputedStyle(overlay).display : '',
      position: overlay ? getComputedStyle(overlay).position : '',
    };
  });

  expect(stylesheetRequests).toBe(1);
  await expect(page.locator('link[data-data-protection-stylesheet]')).toHaveCount(1);
  expect(opened).toEqual({ display: 'flex', position: 'fixed' });
});
