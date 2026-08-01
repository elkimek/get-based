import { expect, test } from './coverage-fixture.js';

const facadeUrl = () => `/js/changelog.js?loaderCoverage=${Date.now()}-${Math.random().toString(36).slice(2)}`;
const syntheticChangelog = `
  const record = (name, ...args) => {
    window.__changelogLoaderCalls ||= [];
    window.__changelogLoaderCalls.push([name, ...args]);
  };
  export function openChangelog(showAll) {
    record('openChangelog', showAll);
    return 'opened:' + showAll;
  }
  export function closeChangelog() {
    record('closeChangelog');
  }
  export function maybeShowChangelog() {
    record('maybeShowChangelog');
  }
`;

test.beforeEach(async ({ page }) => {
  await page.route('**/changelog-loader-coverage', route => route.fulfill({
    contentType: 'text/html',
    body: '<!doctype html><html><body><div id="notification-container"></div><div id="changelog-modal-overlay"></div></body></html>',
  }));
});

test('changelog archive stays cold for first visits and ordinary patch updates, then single-flights', async ({ page }) => {
  await page.goto('/changelog-loader-coverage');
  const implementationRequests = [];
  await page.route('**/js/changelog-impl.js*', async route => {
    implementationRequests.push(route.request().url());
    await new Promise(resolve => setTimeout(resolve, 25));
    await route.fulfill({
      contentType: 'text/javascript',
      body: syntheticChangelog,
    });
  });

  const outcomes = await page.evaluate(async url => {
    window.APP_VERSION = '1.11.2';
    const facade = await import(url);
    localStorage.removeItem('labcharts-changelog-seen');
    const firstVisitResult = facade.maybeShowChangelog();
    const firstVisitSeen = localStorage.getItem('labcharts-changelog-seen');
    localStorage.setItem('labcharts-changelog-seen', '1.11.1');
    const patchResult = facade.maybeShowChangelog();
    const cold = !facade.isChangelogModuleLoaded();
    facade.closeChangelog();
    const coldCloseSeen = localStorage.getItem('labcharts-changelog-seen');
    const first = facade.loadChangelogModule();
    const second = facade.loadChangelogModule();
    const sharedPromise = first === second;
    await Promise.all([first, second]);
    return {
      firstVisitResult,
      firstVisitSeen,
      patchResult,
      cold,
      coldCloseSeen,
      sharedPromise,
      loaded: facade.isChangelogModuleLoaded(),
      opened: facade.openChangelog(true),
      implementationCalls: window.__changelogLoaderCalls || [],
    };
  }, facadeUrl());

  expect(implementationRequests).toHaveLength(1);
  expect(outcomes).toEqual({
    firstVisitResult: undefined,
    firstVisitSeen: '1.11.2',
    patchResult: undefined,
    cold: true,
    coldCloseSeen: '1.11.2',
    sharedPromise: true,
    loaded: true,
    opened: 'opened:true',
    implementationCalls: [['openChangelog', true]],
  });
});

test('critical force-show metadata loads the changelog archive', async ({ page }) => {
  await page.goto('/changelog-loader-coverage');
  const implementationRequests = [];
  await page.route('**/js/changelog-impl.js*', async route => {
    implementationRequests.push(route.request().url());
    await route.fulfill({
      contentType: 'text/javascript',
      body: syntheticChangelog,
    });
  });

  const outcomes = await page.evaluate(async url => {
    window.APP_VERSION = '1.10.381';
    localStorage.setItem('labcharts-changelog-seen', '1.7.0');
    const facade = await import(url);
    const opened = await facade.maybeShowChangelog();
    return {
      opened,
      loaded: facade.isChangelogModuleLoaded(),
      implementationCalls: window.__changelogLoaderCalls || [],
    };
  }, facadeUrl());

  expect(implementationRequests).toHaveLength(1);
  expect(outcomes).toEqual({
    opened: 'opened:false',
    loaded: true,
    implementationCalls: [['openChangelog', false]],
  });
});

test('changelog loader retries with a fixed URL and reports the first failure', async ({ page }) => {
  await page.goto('/changelog-loader-coverage');
  const implementationRequests = [];
  await page.route('**/js/changelog-impl.js*', async route => {
    const url = route.request().url();
    implementationRequests.push(url);
    if (!url.includes('lazy-retry=1')) {
      await route.abort('failed');
      return;
    }
    await route.fulfill({
      contentType: 'text/javascript',
      body: syntheticChangelog,
    });
  });

  const outcomes = await page.evaluate(async url => {
    window.APP_VERSION = '1.10.381';
    const facade = await import(url);
    const first = await facade.openChangelog(true);
    const notification = document.querySelector('#notification-container')?.textContent || '';
    const second = await facade.openChangelog(false);
    return {
      first,
      second,
      loaded: facade.isChangelogModuleLoaded(),
      notification,
    };
  }, facadeUrl());

  expect(implementationRequests).toHaveLength(2);
  expect(new URL(implementationRequests[0]).search).toBe('');
  expect(new URL(implementationRequests[1]).search).toBe('?lazy-retry=1');
  expect(outcomes).toEqual({
    first: false,
    second: 'opened:false',
    loaded: true,
    notification: '✗ Release notes could not be loaded. Try again.',
  });
});
