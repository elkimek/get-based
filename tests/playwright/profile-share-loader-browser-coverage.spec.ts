import { createBlankPage } from '../helpers/browser-blank-page.js';
import { expect, test } from './coverage-fixture.js';

const openBlankPage = createBlankPage({
  status: 200, body: '<!doctype html><html><body><main id="main-content"></main></body></html>',
});

function syntheticProfileShareModule() {
  return `
    globalThis.__profileShareModuleEvalCount = (globalThis.__profileShareModuleEvalCount || 0) + 1;
    export function openProfileShareModal(profileId) {
      globalThis.__openedProfileShares = [
        ...(globalThis.__openedProfileShares || []),
        profileId,
      ];
      return profileId;
    }
    export function handleProfileShareDeepLink() {
      globalThis.__handledProfileShareDeepLinks =
        (globalThis.__handledProfileShareDeepLinks || 0) + 1;
      return true;
    }
  `;
}

test('Profile Sharing loader caches initialization and preserves lazy actions', async ({ page }) => {
  let profileShareRequests = 0;
  await page.route('**/js/profile-share.js*', route => {
    profileShareRequests += 1;
    return route.fulfill({
      status: 200,
      contentType: 'application/javascript',
      body: syntheticProfileShareModule(),
    });
  });
  await openBlankPage(page, '/profile-share-loader-cache-coverage');

  const results: Record<string, unknown> = await page.evaluate(async () => {
    const loader = await import('/js/profile-share-loader.js');
    const startsUnloaded = loader.isProfileShareModuleLoaded() === false;
    const [first, second] = await Promise.all([
      loader.loadProfileShareModule(),
      loader.loadProfileShareModule(),
    ]);
    const third = await loader.loadProfileShareModule();
    const openedProfile = await loader.openProfileShareModal('profile-lazy');
    return {
      startsUnloaded,
      concurrentCallsShareModuleNamespace: first === second,
      laterCallsReuseModuleNamespace: first === third,
      loadedStateFlipsAfterInitialization: loader.isProfileShareModuleLoaded() === true,
      lazyModuleEvaluatesOnce: (globalThis as unknown as {__profileShareModuleEvalCount?: number}).__profileShareModuleEvalCount === 1,
      wrapperForwardsRequestedProfile:
        openedProfile === 'profile-lazy'
        && (globalThis as unknown as {__openedProfileShares?: string[]}).__openedProfileShares?.join(',') === 'profile-lazy',
    };
  });
  results.lazyModuleRequestedOnce = profileShareRequests === 1;

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});

test('Profile Sharing loader retries direct loads after a failed import', async ({ page }) => {
  let profileShareRequests = 0;
  await page.route('**/js/profile-share.js*', route => {
    profileShareRequests += 1;
    if (profileShareRequests === 1) return route.abort('failed');
    return route.fulfill({
      status: 200,
      contentType: 'application/javascript',
      body: syntheticProfileShareModule(),
    });
  });
  await openBlankPage(page, '/profile-share-loader-retry-coverage');

  const results: Record<string, unknown> = await page.evaluate(async () => {
    const loader = await import('/js/profile-share-loader.js');
    let firstRejected = false;
    try {
      await loader.loadProfileShareModule();
    } catch {
      firstRejected = true;
    }
    const retried = await loader.loadProfileShareModule();
    return {
      firstRejected,
      retrySucceeds: (retried.openProfileShareModal as (...args: Parameters<typeof retried.openProfileShareModal>) => unknown)('profile-retry') === 'profile-retry',
      loadedAfterRetry: loader.isProfileShareModuleLoaded() === true,
    };
  });
  results.retryIssuedSecondRequest = profileShareRequests === 2;

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});

test('Profile Sharing lazy entry points contain load failures', async ({ page }) => {
  let profileShareRequests = 0;
  await page.route('**/js/profile-share.js*', route => {
    profileShareRequests += 1;
    return route.abort('failed');
  });
  await openBlankPage(page, '/profile-share-loader-entry-failure-coverage');

  const actionFailureContained = await page.evaluate(async () => (
    (await import('/js/profile-share-loader.js')).openProfileShareModal('profile-failure')
  )) === false;
  expect(actionFailureContained).toBe(true);
  expect(profileShareRequests).toBe(1);
});

test('Profile Sharing loader detects startup and hash deep links without eager loading', async ({ page }) => {
  let profileShareRequests = 0;
  await page.route('**/js/profile-share.js*', route => {
    profileShareRequests += 1;
    return route.fulfill({
      status: 200,
      contentType: 'application/javascript',
      body: syntheticProfileShareModule(),
    });
  });
  await openBlankPage(page, '/profile-share-loader-deep-link-coverage');

  const results: Record<string, unknown> = await page.evaluate(async () => {
    const loader = await import('/js/profile-share-loader.js');
    const validId = 'abcdefghijklmnopqrstuvwx';
    const noLinkStaysLazy = await loader.handleProfileShareLoaderDeepLink() === false
      && loader.isProfileShareModuleLoaded() === false;
    const routeDetection = {
      hashPath: loader.hasProfileShareDeepLink({
        hash: `#share/${validId}`,
        href: `https://example.test/app#share/${validId}`,
      }),
      hashEquals: loader.hasProfileShareDeepLink({
        hash: `#share=${validId}`,
        href: `https://example.test/app#share=${validId}`,
      }),
      query: loader.hasProfileShareDeepLink({
        hash: '',
        href: `https://example.test/app?share=${validId}`,
      }),
      rejectsShort: !loader.hasProfileShareDeepLink({
        hash: '#share/short',
        href: 'https://example.test/app#share/short',
      }),
      rejectsMalformedLocation: !loader.hasProfileShareDeepLink({
        hash: '',
        href: 'not a valid URL',
      }),
    };

    history.pushState(null, '', `#share/${validId}`);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    for (let attempt = 0; attempt < 40 && !(globalThis as unknown as {__handledProfileShareDeepLinks?: number}).__handledProfileShareDeepLinks; attempt += 1) {
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    const firstHandleCount = (globalThis as unknown as {__handledProfileShareDeepLinks?: number}).__handledProfileShareDeepLinks || 0;
    const duplicateInitRejected = loader.initProfileShareLoaderLinks() === false;
    history.replaceState(null, '', location.pathname);

    return {
      noLinkStaysLazy,
      recognizesSupportedRoutes: Object.values(routeDetection).every(Boolean),
      hashChangeLoadsAndDelegates:
        loader.isProfileShareModuleLoaded() === true
        && firstHandleCount >= 1,
      duplicateInitRejected,
    };
  });
  results.deepLinkLoadsModuleOnce = profileShareRequests === 1;

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});

test('real shared-profile routes load the feature and open its import modal', async ({ page }) => {
  const shareId = 'zyxwvutsrqponmlkjihg';
  await page.addInitScript(() => {
    localStorage.setItem('labcharts-default-emptyTour', 'completed');
    localStorage.setItem('labcharts-default-tour', 'completed');
    localStorage.setItem('labcharts-default-onboarded', 'dismissed');
  });
  await page.goto(`/app#share/${shareId}`, { waitUntil: 'networkidle' });

  await expect(page.locator('#profile-share-overlay')).toBeVisible();
  await expect(page.locator('[data-profile-share-form="load"]')).toHaveAttribute('data-share-id', shareId);
  await expect.poll(() => page.evaluate(async () => (
    (await import('/js/profile-share-loader.js')).isProfileShareModuleLoaded()
  ))).toBe(true);
});
