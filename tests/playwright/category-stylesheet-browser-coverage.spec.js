import { expect, test } from './coverage-fixture.js';

function moduleUrl(path) {
  return `${path}?categoryStylesheetCoverage=${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

async function openCategoryLoaderPage(page, path) {
  await page.route(`**${path}`, route => route.fulfill({
    status: 200,
    contentType: 'text/html',
    body: `<!doctype html><html><head>
      <link rel="stylesheet" href="/css/dashboard-data.css">
      <meta data-category-views-stylesheet-anchor>
      <link rel="stylesheet" href="/css/context-profile.css">
    </head><body></body></html>`,
  }));
  await page.goto(path, { waitUntil: 'load' });
}

test('Category stylesheet loader single-flights and preserves cascade order', async ({ page }) => {
  let stylesheetRequests = 0;
  await page.route('**/css/category-views.css*', route => {
    stylesheetRequests += 1;
    return route.fulfill({
      status: 200,
      contentType: 'text/css',
      body: '.category-header { margin-bottom: 24px; }',
    });
  });
  await openCategoryLoaderPage(page, '/category-stylesheet-cache-coverage');

  const outcomes = await page.evaluate(async ({ runtimeUrl }) => {
    const runtime = await import(runtimeUrl);
    const loadedBeforeRequest = runtime.isCategoryViewsStylesheetLoaded();
    const [first, second] = await Promise.all([
      runtime.loadCategoryViewsStylesheet(),
      runtime.loadCategoryViewsStylesheet(),
    ]);
    const third = await runtime.loadCategoryViewsStylesheet();
    const anchor = document.querySelector('[data-category-views-stylesheet-anchor]');
    return {
      loadedBeforeRequest,
      loadedAfterRequest: runtime.isCategoryViewsStylesheetLoaded(),
      concurrentCallsShareTheSameLink: first === second,
      laterCallsReuseTheResolvedLink: first === third,
      oneStylesheetLink:
        document.querySelectorAll('link[data-category-views-stylesheet]').length === 1,
      linkPrecedesAnchor: first.nextElementSibling === anchor,
      contextStylesheetFollowsAnchor:
        anchor?.nextElementSibling?.getAttribute('href') === '/css/context-profile.css',
    };
  }, { runtimeUrl: moduleUrl('/js/category-page-runtime.js') });

  expect(outcomes).toEqual({
    loadedBeforeRequest: false,
    loadedAfterRequest: true,
    concurrentCallsShareTheSameLink: true,
    laterCallsReuseTheResolvedLink: true,
    oneStylesheetLink: true,
    linkPrecedesAnchor: true,
    contextStylesheetFollowsAnchor: true,
  });
  expect(stylesheetRequests).toBe(1);
});

test('Compare route contains a stylesheet failure and retries with a fresh URL', async ({ page }) => {
  const stylesheetRequests = [];
  await page.route('**/css/category-views.css*', route => {
    stylesheetRequests.push(route.request().url());
    return route.abort('failed');
  });
  await page.goto('/app', { waitUntil: 'load' });

  const firstOpen = await page.evaluate(async () => {
    const views = await import('/js/views.js');
    const opened = await views.navigate('compare');
    return {
      opened,
      status: document.getElementById('main-content')?.textContent || '',
      links: document.querySelectorAll('link[data-category-views-stylesheet]').length,
    };
  });

  expect(firstOpen.opened).toBe(false);
  expect(firstOpen.status).toContain('Compare could not be loaded');
  expect(firstOpen.links).toBe(0);
  expect(stylesheetRequests).toHaveLength(1);

  await page.unroute('**/css/category-views.css*');
  const retryOpen = await page.evaluate(async () => {
    const views = await import('/js/views.js');
    const opened = await views.navigate('compare');
    const link = document.querySelector('link[data-category-views-stylesheet]');
    return {
      opened,
      workspace: document.getElementById('main-content')?.textContent || '',
      href: link?.href || '',
      sheetLoaded: link?.sheet !== null,
    };
  });

  expect(retryOpen.opened).toBe(true);
  expect(retryOpen.workspace).toContain('Compare Dates');
  expect(retryOpen.sheetLoaded).toBe(true);
  expect(new URL(retryOpen.href).searchParams.get('lazy-retry')).toBe('1');
});

test('Dashboard-owned shared styles remain eager without Category presentation', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });

  const outcomes = await page.evaluate(() => {
    const host = document.createElement('div');
    host.innerHTML = `
      <div class="dashboard-greeting category-header"></div>
      <div class="alerts-section"><div class="alert-card alert-high">
        <span class="alert-indicator">High</span>
      </div></div>
      <div class="date-range-filter"><button class="range-btn active">All</button></div>`;
    document.body.append(host);
    const greeting = host.querySelector('.dashboard-greeting');
    const alert = host.querySelector('.alert-card');
    const range = host.querySelector('.range-btn');
    return {
      categoryStylesheetAbsent:
        document.querySelector('link[data-category-views-stylesheet]') === null,
      greetingMargin: greeting ? getComputedStyle(greeting).marginBottom : '',
      alertDisplay: alert ? getComputedStyle(alert).display : '',
      alertLeftWidth: alert ? getComputedStyle(alert).borderLeftWidth : '',
      rangeWeight: range ? getComputedStyle(range).fontWeight : '',
    };
  });

  expect(outcomes).toEqual({
    categoryStylesheetAbsent: true,
    greetingMargin: '24px',
    alertDisplay: 'flex',
    alertLeftWidth: '3px',
    rangeWeight: '600',
  });
});
