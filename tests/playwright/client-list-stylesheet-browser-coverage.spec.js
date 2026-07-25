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
  const implementationRequests = [];
  page.on('request', request => {
    const url = new URL(request.url());
    if (url.pathname === '/css/client-list.css') stylesheetRequests.push(url.href);
    if (url.pathname === '/js/client-list-impl.js') implementationRequests.push(url.href);
  });

  await prepareReturningApp(page);

  expect(stylesheetRequests).toEqual([]);
  expect(implementationRequests).toEqual([]);
  await expect(page.locator('link[data-client-list-stylesheet]')).toHaveCount(0);
  await page.locator('#profile-selector .profile-compact-btn').click();

  const overlay = page.locator('#client-list-overlay');
  await expect(overlay).toHaveClass(/\bshow\b/);
  await expect(overlay.locator('.client-list-modal')).toHaveCSS('display', 'flex');
  await expect(page.locator('link[data-client-list-stylesheet]')).toHaveCount(1);
  expect(stylesheetRequests).toHaveLength(1);
  expect(implementationRequests).toHaveLength(1);
});

test('Client List implementation, stylesheet, and modal opening are single-flight', async ({ page }) => {
  let stylesheetRequests = 0;
  let implementationRequests = 0;
  page.on('request', request => {
    const pathname = new URL(request.url()).pathname;
    if (pathname === '/css/client-list.css') stylesheetRequests += 1;
    if (pathname === '/js/client-list-impl.js') implementationRequests += 1;
  });
  await prepareReturningApp(page);

  const results = await page.evaluate(async () => {
    const clientList = await import('/js/client-list.js');
    const loadedBeforeAction = clientList.isClientListModuleLoaded();
    const [first, second] = await Promise.all([
      clientList.openClientList(),
      clientList.openClientList(),
    ]);
    return {
      loadedBeforeAction,
      loadedAfterAction: clientList.isClientListModuleLoaded(),
      bothCallsOpenTheModal: first === true && second === true,
      overlayVisible: document.getElementById('client-list-overlay')?.classList.contains('show') === true,
      oneStylesheetLink: document.querySelectorAll('link[data-client-list-stylesheet]').length === 1,
    };
  });

  expect(results).toEqual({
    loadedBeforeAction: false,
    loadedAfterAction: true,
    bothCallsOpenTheModal: true,
    overlayVisible: true,
    oneStylesheetLink: true,
  });
  expect(stylesheetRequests).toBe(1);
  expect(implementationRequests).toBe(1);
});

test('Client List implementation failure is contained and retries with a fixed URL', async ({ page }) => {
  const implementationRequests = [];
  let failFirstRequest = true;
  await page.route('**/js/client-list-impl.js*', route => {
    implementationRequests.push(route.request().url());
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
      && clientList.isClientListModuleLoaded() === false
      && document.getElementById('client-list-overlay')?.classList.contains('show') !== true;
    const second = await clientList.openClientList();
    return {
      firstFailureWasContained,
      retryOpensModal: second === true
        && clientList.isClientListModuleLoaded() === true
        && document.getElementById('client-list-overlay')?.classList.contains('show') === true,
    };
  });

  expect(results).toEqual({
    firstFailureWasContained: true,
    retryOpensModal: true,
  });
  expect(implementationRequests).toHaveLength(2);
  expect(new URL(implementationRequests[1]).searchParams.get('lazy-retry')).toBe('1');
});

test('closing the Client List shell does not load its implementation', async ({ page }) => {
  let implementationRequests = 0;
  page.on('request', request => {
    if (new URL(request.url()).pathname === '/js/client-list-impl.js') implementationRequests += 1;
  });
  await prepareReturningApp(page);

  const results = await page.evaluate(async () => {
    const clientList = await import('/js/client-list.js');
    const overlay = document.getElementById('client-list-overlay');
    overlay?.classList.add('show');
    clientList.closeClientList();
    return {
      implementationStayedUnloaded: clientList.isClientListModuleLoaded() === false,
      overlayClosed: overlay?.classList.contains('show') !== true,
    };
  });

  expect(results).toEqual({
    implementationStayedUnloaded: true,
    overlayClosed: true,
  });
  expect(implementationRequests).toBe(0);
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
