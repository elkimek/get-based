import { expect, test } from './coverage-fixture.js';

function moduleUrl(path) {
  return `${path}?geneticsStylesheetCoverage=${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

async function openGeneticsLoaderPage(page, path) {
  await page.route(`**${path}`, route => route.fulfill({
    status: 200,
    contentType: 'text/html',
    body: `<!doctype html><html><head><meta data-genetics-stylesheet-anchor></head><body>
      <div id="notification-container"></div>
    </body></html>`,
  }));
  await page.goto(path, { waitUntil: 'load' });
}

test('Genetics stylesheet loader single-flights and preserves cascade order', async ({ page }) => {
  let stylesheetRequests = 0;
  await page.route('**/css/genetics.css*', route => {
    stylesheetRequests += 1;
    return route.fulfill({
      status: 200,
      contentType: 'text/css',
      body: '.genetics-overview-grid { display: grid; }',
    });
  });
  await openGeneticsLoaderPage(page, '/genetics-stylesheet-cache-coverage');

  const outcomes = await page.evaluate(async ({ runtimeUrl }) => {
    const runtime = await import(runtimeUrl);
    const loadedBeforeRequest = runtime.isGeneticsStylesheetLoaded();
    const [first, second] = await Promise.all([
      runtime.loadGeneticsStylesheet(),
      runtime.loadGeneticsStylesheet(),
    ]);
    const third = await runtime.loadGeneticsStylesheet();
    const anchor = document.querySelector('[data-genetics-stylesheet-anchor]');
    return {
      loadedBeforeRequest,
      loadedAfterRequest: runtime.isGeneticsStylesheetLoaded(),
      concurrentCallsShareTheSameLink: first === second,
      laterCallsReuseTheResolvedLink: first === third,
      oneStylesheetLink: document.querySelectorAll('link[data-genetics-stylesheet]').length === 1,
      linkPrecedesAnchor: first.nextElementSibling === anchor,
    };
  }, { runtimeUrl: moduleUrl('/js/dna-runtime.js') });

  expect(outcomes).toEqual({
    loadedBeforeRequest: false,
    loadedAfterRequest: true,
    concurrentCallsShareTheSameLink: true,
    laterCallsReuseTheResolvedLink: true,
    oneStylesheetLink: true,
    linkPrecedesAnchor: true,
  });
  expect(stylesheetRequests).toBe(1);
});

test('Genome route contains a stylesheet failure and retries with a fresh URL', async ({ page }) => {
  const stylesheetRequests = [];
  await page.route('**/css/genetics.css*', route => {
    stylesheetRequests.push(route.request().url());
    return route.abort('failed');
  });
  await page.goto('/app', { waitUntil: 'load' });
  await expect(page.locator('#main-content')).not.toBeEmpty();

  const firstOpen = await page.evaluate(async () => {
    const views = await import('/js/views.js');
    const opened = await views.navigate('genome');
    return {
      opened,
      status: document.getElementById('main-content')?.textContent || '',
      links: document.querySelectorAll('link[data-genetics-stylesheet]').length,
    };
  });

  expect(firstOpen.opened).toBe(false);
  expect(firstOpen.status).toContain('Genome could not be loaded');
  expect(firstOpen.links).toBe(0);
  expect(stylesheetRequests).toHaveLength(1);

  await page.unroute('**/css/genetics.css*');
  await page.route('**/css/genetics.css*', route => route.fulfill({
    status: 200,
    contentType: 'text/css',
    body: '.genetics-overview-grid { display: grid; }',
  }));
  const retryOpen = await page.evaluate(async () => {
    const views = await import('/js/views.js');
    const opened = await views.navigate('genome');
    const link = document.querySelector('link[data-genetics-stylesheet]');
    return {
      opened,
      workspace: document.getElementById('main-content')?.textContent || '',
      href: link?.href || '',
      sheetLoaded: link?.sheet !== null,
    };
  });

  expect(retryOpen.opened).toBe(true);
  expect(retryOpen.workspace).toContain('Dedicated DNA workspace');
  expect(retryOpen.sheetLoaded).toBe(true);
  expect(new URL(retryOpen.href).searchParams.get('lazy-retry')).toBe('1');
});

test('DNA modal entry contains a stylesheet failure', async ({ page }) => {
  await page.route('**/css/genetics.css*', route => route.abort('failed'));
  await openGeneticsLoaderPage(page, '/genetics-stylesheet-action-failure-coverage');

  const outcomes = await page.evaluate(async ({ runtimeUrl }) => {
    const runtime = await import(runtimeUrl);
    const loaded = await runtime.loadGeneticsStylesheetForAction();
    return {
      returnsFalse: loaded === false,
      failedLinkWasRemoved:
        document.querySelectorAll('link[data-genetics-stylesheet]').length === 0,
      errorWasExplained:
        document.getElementById('notification-container')?.textContent
          ?.includes('Could not open DNA tools') === true,
    };
  }, { runtimeUrl: moduleUrl('/js/dna-runtime.js') });

  expect(outcomes).toEqual({
    returnsFalse: true,
    failedLinkWasRemoved: true,
    errorWasExplained: true,
  });
});
