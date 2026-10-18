import type { Page, Route } from '@playwright/test';
import { expect, test } from './coverage-fixture.js';
import { installDiscussionFixture } from '../helpers/chat-discussion-fixture.js';

const pagePattern = '**/js/biology-page-view.js*';
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(complete => { resolve = complete; });
  return { promise, resolve };
}
async function prepare(page: Page) {
  await installDiscussionFixture(page.context(), { paused: true });
  await page.goto('/app', { waitUntil: 'load' });
  await page.evaluate(async () => {
    await (await import('/js/category-page-runtime.js')).loadCategoryViewsStylesheet();
    (await import('/js/tour.js')).endTour({ openEmptyChat: false });
  });
}
async function holdPage(page: Page) {
  const requested = deferred(), release = deferred();
  await page.route(pagePattern, async route => {
    requested.resolve(); await release.promise; await route.continue();
  });
  return { requested: requested.promise, release: release.resolve };
}
function open(page: Page) {
  return page.evaluate(async () => await (await import('/js/views.js')).navigate('biology-scores'));
}

test('cold Biology contains a failed module with shared CSS ready and genuinely retries', async ({ page }) => {
  await prepare(page);
  const requests: string[] = [];
  const fail = async (route: Route) => { requests.push(route.request().url()); await route.abort('failed'); };
  await page.route(pagePattern, fail);
  expect(await open(page)).toBe(false);
  await expect(page.locator('#main-content [role="alert"]')).toHaveText('Biology Scores could not be loaded. Try opening the page again.');
  expect(await page.evaluate(async () => (await import('/js/biology-page-loader.js')).getLoadedBiologyPage() === null)).toBe(true);
  expect(requests).toHaveLength(1);
  await page.unroute(pagePattern, fail);
  const retryRequest = page.waitForRequest(request => new URL(request.url()).pathname === '/js/biology-page-view.js');
  expect(await open(page)).toBe(true);
  expect(new URL((await retryRequest).url()).searchParams.get('lazy-retry')).toBe('1');
  await expect(page.locator('.biology-scores-page')).toHaveCount(1);
  await expect(page.locator('.biology-score-compact')).toHaveCount(18);
  const warm = await page.evaluate(async () => {
    const result = (await import('/js/views.js')).navigate('biology-scores');
    return { promise: result instanceof Promise, page: !!document.querySelector('.biology-scores-page') };
  });
  expect(warm).toEqual({ promise: false, page: true });
});

for (const replacement of ['profile', 'away-back', 'root', 'same-route'] as const) {
  test(`cold Biology cannot publish obsolete preparation after ${replacement}`, async ({ page }) => {
    await prepare(page); const pending = await holdPage(page);
    const opened = open(page); await pending.requested;
    await expect(page.locator('#main-content [aria-busy="true"]')).toHaveText('Loading Biology Scores…');
    const sentinel = `Replacement ${replacement}`;
    await page.evaluate(async ({ replacement, sentinel }) => {
      const { state } = await import('/js/state.js');
      if (replacement === 'profile') state.currentProfile = 'replacement-profile';
      if (replacement === 'away-back') {
        const { recordRouteChange } = await import('/js/route-lifecycle.js');
        recordRouteChange(); state.currentView = 'dashboard'; recordRouteChange(); state.currentView = 'biology-scores';
      }
      if (replacement === 'root') {
        const next = document.createElement('main'); next.id = 'main-content';
        document.getElementById('main-content')!.replaceWith(next);
      }
      if (replacement === 'same-route') {
        // A later request is the owner, even though router revision is unchanged.
        const views = await import('/js/views.js');
        Object.assign(window, { laterBiologyNavigation: views.navigate('biology-scores') });
      }
      if (replacement !== 'same-route') document.getElementById('main-content')!.textContent = sentinel;
    }, { replacement, sentinel });
    pending.release(); expect(await opened).toBe(false);
    if (replacement === 'same-route') {
      expect(await page.evaluate(async () => await (window as Window & { laterBiologyNavigation?: Promise<unknown> }).laterBiologyNavigation)).toBe(true);
      await expect(page.locator('.biology-scores-page')).toHaveCount(1);
    } else await expect(page.locator('#main-content')).toHaveText(sentinel);
  });
}

test('held Biology preparation cannot render explicit old data after same-profile imported data replacement', async ({ page }) => {
  await prepare(page); const pending = await holdPage(page);
  const opened = page.evaluate(async () => {
    const [{ navigate }, { getActiveData }] = await Promise.all([import('/js/views.js'), import('/js/data.js')]);
    return await navigate('biology-scores', getActiveData());
  });
  await pending.requested;
  const sentinel = 'Replacement same-profile data owner';
  const identity = await page.evaluate(async sentinel => {
    const { state } = await import('/js/state.js');
    const profile = state.currentProfile, previous = state.importedData;
    state.importedData = { ...previous, contextNotes: 'Replacement context data' };
    document.getElementById('main-content')!.textContent = sentinel;
    return { sameProfile: state.currentProfile === profile, replacedData: state.importedData !== previous };
  }, sentinel);
  expect(identity).toEqual({ sameProfile: true, replacedData: true });
  pending.release(); expect(await opened).toBe(false);
  await expect(page.locator('#main-content')).toHaveText(sentinel);
  await expect(page.locator('.biology-scores-page')).toHaveCount(0);
});

test('persisted initial Biology keeps app readiness pending until its cold page is usable', async ({ page }) => {
  await prepare(page);
  await page.evaluate(() => {
    const profileId = localStorage.getItem('labcharts-active-profile') || 'default';
    localStorage.setItem(`labcharts-${profileId}-lastViewV1`, 'biology-scores');
  });
  const pending = await holdPage(page);
  const reload = page.reload({ waitUntil: 'load' }); await pending.requested;
  // Check an entire bounded observation window while the module is held. An
  // immediate absence check could pass just before the old premature ready write.
  await expect(page.waitForFunction(() => document.documentElement.hasAttribute('data-app-ready'), undefined, { timeout: 600 })).rejects.toThrow(/Timeout/);
  await expect(page.locator('#main-content [aria-busy="true"]')).toHaveText('Loading Biology Scores…');
  pending.release(); await reload;
  await expect(page.locator('html[data-app-ready]')).toHaveCount(1);
  await expect(page.locator('.biology-scores-page')).toHaveCount(1);
  expect(await page.evaluate(() => !!document.querySelector('#main-content [aria-busy="true"]'))).toBe(false);
});
