import { expect, test } from './coverage-fixture.js';

async function prepareReturningApp(page) {
  await page.addInitScript(() => {
    const profileId = localStorage.getItem('labcharts-active-profile') || 'default';
    localStorage.setItem(`labcharts-${profileId}-emptyTour`, 'completed');
    localStorage.setItem(`labcharts-${profileId}-tour`, 'completed');
  });
  await page.goto('/app', { waitUntil: 'networkidle' });
  await page.waitForFunction(async () => {
    const { state } = await import('/js/state.js');
    return typeof state.currentView === 'string' && !!document.getElementById('profile-selector');
  });
}

test('returning-user startup defers Client List CSS until the real shell action opens it', async ({ page }) => {
  const stylesheetRequests = [];
  page.on('request', request => {
    const url = new URL(request.url());
    if (url.pathname === '/css/client-list.css') stylesheetRequests.push(url.href);
  });

  await prepareReturningApp(page);

  expect(stylesheetRequests).toEqual([]);
  await expect(page.locator('link[data-client-list-stylesheet]')).toHaveCount(0);
  await page.locator('#profile-selector .profile-compact-btn').click();

  const overlay = page.locator('#client-list-overlay');
  await expect(overlay).toHaveClass(/\bshow\b/);
  await expect(overlay.locator('.client-list-modal')).toHaveCSS('display', 'flex');
  await expect(page.locator('link[data-client-list-stylesheet]')).toHaveCount(1);
  expect(stylesheetRequests).toHaveLength(1);
});

test('Client List stylesheet and modal opening are single-flight', async ({ page }) => {
  let stylesheetRequests = 0;
  page.on('request', request => {
    if (new URL(request.url()).pathname === '/css/client-list.css') stylesheetRequests += 1;
  });
  await prepareReturningApp(page);

  const results = await page.evaluate(async () => {
    const clientList = await import('/js/client-list.js');
    const [first, second] = await Promise.all([
      clientList.openClientList(),
      clientList.openClientList(),
    ]);
    return {
      bothCallsOpenTheModal: first === true && second === true,
      overlayVisible: document.getElementById('client-list-overlay')?.classList.contains('show') === true,
      oneStylesheetLink: document.querySelectorAll('link[data-client-list-stylesheet]').length === 1,
    };
  });

  expect(results).toEqual({
    bothCallsOpenTheModal: true,
    overlayVisible: true,
    oneStylesheetLink: true,
  });
  expect(stylesheetRequests).toBe(1);
});

test('Client List stylesheet failure is contained and retries with a cache-busting URL', async ({ page }) => {
  const stylesheetRequests = [];
  let failFirstRequest = true;
  await page.route('**/css/client-list.css*', route => {
    stylesheetRequests.push(route.request().url());
    if (failFirstRequest) {
      failFirstRequest = false;
      return route.abort('failed');
    }
    return route.continue();
  });
  await prepareReturningApp(page);

  const results = await page.evaluate(async () => {
    const clientList = await import('/js/client-list.js');
    const first = await clientList.openClientList();
    const firstFailureWasContained =
      first === false
      && document.querySelectorAll('link[data-client-list-stylesheet]').length === 0
      && document.getElementById('client-list-overlay')?.classList.contains('show') !== true;
    const second = await clientList.openClientList();
    const retryLink = document.querySelector('link[data-client-list-stylesheet]');
    return {
      firstFailureWasContained,
      retryOpensModal: second === true
        && document.getElementById('client-list-overlay')?.classList.contains('show') === true,
      retryUsesCacheBuster:
        retryLink && new URL(retryLink.href).searchParams.get('lazy-retry') === '1',
    };
  });

  expect(results).toEqual({
    firstFailureWasContained: true,
    retryOpensModal: true,
    retryUsesCacheBuster: true,
  });
  expect(stylesheetRequests).toHaveLength(2);
  expect(new URL(stylesheetRequests[1]).searchParams.get('lazy-retry')).toBe('1');
});
