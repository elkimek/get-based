import { expect, test } from './coverage-fixture.js';

const moduleUrl = path => `${path}?viewsRouterCoverage=${Date.now()}-${Math.random().toString(36).slice(2)}`;

async function openBlankPage(page) {
  await page.route('**/views-router-browser-coverage', route => route.fulfill({
    status: 200,
    contentType: 'text/html',
    body: '<!doctype html><html><body><main id="fixture"></main></body></html>',
  }));
  await page.goto('/views-router-browser-coverage', { waitUntil: 'load' });
}

test('views router browser coverage exercises route state and scroll restoration', async ({ page }) => {
  await openBlankPage(page);

  const results = await page.evaluate(async ({ dataUrl, routerUrl, profileUrl, stateUrl }) => {
    const [dataModule, routerModule, profileModule, stateModule] = await Promise.all([
      import(dataUrl),
      import(routerUrl),
      import(profileUrl),
      import(stateUrl),
    ]);
    const routerRuntime = await import('/js/views-router-runtime.js');
    const outcomes = {};
    const { state } = stateModule;
    const fixture = document.getElementById('fixture');
    const originalProfile = state.currentProfile;
    const originalCurrentView = state.currentView;
    const originalScrollTo = window.scrollTo;
    const originalScrollBy = window.scrollBy;
    const originalCloseMobileSidebar = window.closeMobileSidebar;
    const hadCloseMobileSidebar = Object.prototype.hasOwnProperty.call(window, 'closeMobileSidebar');
    const originalScrollX = Object.getOwnPropertyDescriptor(window, 'scrollX');
    const originalScrollY = Object.getOwnPropertyDescriptor(window, 'scrollY');
    const originalPageXOffset = Object.getOwnPropertyDescriptor(window, 'pageXOffset');
    const originalPageYOffset = Object.getOwnPropertyDescriptor(window, 'pageYOffset');
    const coverageProfile = 'viewsRouterCoverageProfile';
    const extraProfile = 'viewsRouterCoverageOther';
    const unknownSavedRoute = `viewsRouterMissing${Date.now().toString(36)}`;
    const coverageLastViewKey = profileModule.profileStorageKey(coverageProfile, 'lastViewV1');
    const extraLastViewKey = profileModule.profileStorageKey(extraProfile, 'lastViewV1');
    const calls = [];
    const previousRouterRuntimeDeps = routerRuntime.configureViewsRouterRuntimeDeps({
      syncImportStatusFab: () => calls.push(['syncFab']),
    });
    const scrollByCalls = [];
    const scrollToCalls = [];
    const categoryData = { categories: { lipids: { label: 'Lipids', markers: {} } } };

    const resetFixture = () => {
      fixture.innerHTML = `
        <nav>
          <button class="nav-item active is-active" data-category="dashboard" aria-current="page">Dashboard</button>
          <button class="nav-item" data-category="labs">Labs</button>
          <button class="nav-item" data-category="lipids">Lipids</button>
          <button class="nav-item" data-category="light">Light</button>
        </nav>
        <section id="router-surface"></section>
      `;
    };
    const callKey = call => call.map(item => {
      if (item === undefined) return 'undefined';
      if (typeof item === 'object') return item?._tag || JSON.stringify(item);
      return String(item);
    }).join('|');
    const callKeys = () => calls.map(callKey);
    const createHandlers = () => ({
      dashboard: data => calls.push(['handler', 'dashboard', data]),
      labs: data => calls.push(['handler', 'labs', data]),
      genome: data => calls.push(['handler', 'genome', data]),
      body: data => calls.push(['handler', 'body', data]),
      insight: data => calls.push(['handler', 'insight', data]),
      recommendations: data => calls.push(['handler', 'recommendations', data]),
      correlations: data => calls.push(['handler', 'correlations', data]),
      compare: data => calls.push(['handler', 'compare', data]),
      light: data => calls.push(['handler', 'light', data]),
      category: (route, data) => calls.push(['handler', 'category', route, data]),
    });
    const createNavigator = (handlers = createHandlers()) => routerModule.createNavigate({
      routeHandlers: handlers,
      syncMobileBottomNav: route => calls.push(['bottom', route]),
      destroyAllCharts: () => calls.push(['destroyCharts']),
    });
    const waitForFrame = () => new Promise(resolve => requestAnimationFrame(resolve));
    const restoreDescriptor = (name, descriptor) => {
      if (descriptor) Object.defineProperty(window, name, descriptor);
      else delete window[name];
    };

    try {
      state.currentProfile = coverageProfile;
      state.currentView = 'dashboard';
      localStorage.removeItem(coverageLastViewKey);
      localStorage.removeItem(extraLastViewKey);
      window.closeMobileSidebar = () => calls.push(['closeSidebar']);
      window.scrollTo = arg => {
        scrollToCalls.push(typeof arg === 'object' ? { left: arg.left, top: arg.top, behavior: arg.behavior } : arg);
      };
      window.scrollBy = (...args) => {
        scrollByCalls.push(args.map(arg => (
          arg && typeof arg === 'object'
            ? { left: arg.left, top: arg.top, behavior: arg.behavior }
            : arg
        )));
      };
      const scrollByDelta = call => {
        const first = call?.[0];
        if (first && typeof first === 'object' && Number.isFinite(first.top)) return first.top;
        if (Number.isFinite(call?.[1])) return call[1];
        return null;
      };

      outcomes.routeValidationUsesCorePreDataAndSafeCategoryIds =
        routerModule.CORE_ROUTES.has('dashboard')
        && routerModule.isKnownRoute('dashboard')
        && routerModule.isKnownRoute('custom.category', { categories: { 'custom.category': {} } })
        && !routerModule.isKnownRoute('custom.category', { categories: {} })
        && !routerModule.isKnownRoute('bad-id', { categories: { 'bad-id': {} } })
        && !routerModule.isKnownRoute('__proto__', { categories: { ['__proto__']: {} } });

      localStorage.setItem(coverageLastViewKey, 'light');
      outcomes.initialViewRestoresProfileScopedCoreRoute =
        routerModule.getInitialView() === 'light';
      state.currentProfile = extraProfile;
      localStorage.setItem(extraLastViewKey, 'labs');
      outcomes.initialViewUsesTheActiveProfileKey =
        routerModule.getInitialView() === 'labs';
      localStorage.setItem(extraLastViewKey, 'bad-id');
      const unsafeSavedRouteFallsBack = routerModule.getInitialView() === 'dashboard';
      const activeDataBeforeUnknownRoute = dataModule.getActiveData();
      const unknownSavedRouteIsAbsent = !activeDataBeforeUnknownRoute?.categories?.[unknownSavedRoute];
      localStorage.setItem(extraLastViewKey, unknownSavedRoute);
      outcomes.initialViewFallsBackForUnsafeOrUnknownStoredRoutes =
        unsafeSavedRouteFallsBack
        && unknownSavedRouteIsAbsent
        && routerModule.getInitialView() === 'dashboard';
      state.currentProfile = coverageProfile;

      resetFixture();
      document.body.classList.add('mobile-dashboard-active', 'empty-dashboard-active');
      calls.length = 0;
      const navigate = createNavigator();
      const labsData = { categories: {}, _tag: 'labsData' };
      navigate('labs', labsData);
      const labsButton = document.querySelector('[data-category="labs"]');
      const dashboardButton = document.querySelector('[data-category="dashboard"]');
      outcomes.navigateDispatchesCoreRoutesUpdatesChromeAndPersists =
        state.currentView === 'labs'
        && localStorage.getItem(coverageLastViewKey) === 'labs'
        && callKeys().includes('handler|labs|labsData')
        && callKeys().includes('destroyCharts')
        && callKeys().includes('bottom|labs')
        && callKeys().includes('closeSidebar')
        && callKeys().includes('syncFab')
        && labsButton.classList.contains('active')
        && labsButton.classList.contains('is-active')
        && labsButton.getAttribute('aria-current') === 'page'
        && !dashboardButton.classList.contains('active')
        && !dashboardButton.hasAttribute('aria-current')
        && !document.body.classList.contains('mobile-dashboard-active')
        && !document.body.classList.contains('empty-dashboard-active');

      calls.length = 0;
      navigate('bad-id', { categories: { 'bad-id': {} }, _tag: 'unsafeRouteData' });
      outcomes.navigateFallsBackToDashboardForUnsafeRoutes =
        state.currentView === 'dashboard'
        && localStorage.getItem(coverageLastViewKey) === 'dashboard'
        && callKeys().includes('handler|dashboard|unsafeRouteData')
        && document.querySelector('[data-category="dashboard"]').getAttribute('aria-current') === 'page';

      calls.length = 0;
      navigate('lipids', categoryData);
      outcomes.navigateDispatchesKnownCategoryRoutes =
        state.currentView === 'lipids'
        && localStorage.getItem(coverageLastViewKey) === 'lipids'
        && callKeys().includes('handler|category|lipids|{"categories":{"lipids":{"label":"Lipids","markers":{}}}}')
        && document.querySelector('[data-category="lipids"]').classList.contains('is-active');

      calls.length = 0;
      scrollToCalls.length = 0;
      Object.defineProperty(window, 'scrollX', { configurable: true, value: 12 });
      Object.defineProperty(window, 'scrollY', { configurable: true, value: 345 });
      Object.defineProperty(window, 'pageXOffset', { configurable: true, value: 12 });
      Object.defineProperty(window, 'pageYOffset', { configurable: true, value: 345 });
      state.currentView = 'labs';
      navigate('labs', { preserveScroll: true });
      await waitForFrame();
      outcomes.preserveScrollRestoresPixelsAndStripsOptionsOnlyPayload =
        callKeys().includes('handler|labs|undefined')
        && scrollToCalls.some(call => call?.left === 12 && call?.top === 345 && call?.behavior === 'instant');

      resetFixture();
      state.currentView = 'light';
      let explicitTop = 120;
      const explicitAnchor = document.createElement('section');
      explicitAnchor.dataset.id = 'room.one';
      explicitAnchor.getBoundingClientRect = () => ({
        top: explicitTop,
        bottom: explicitTop + 80,
        left: 0,
        right: 100,
        width: 100,
        height: 80,
        x: 0,
        y: explicitTop,
      });
      fixture.appendChild(explicitAnchor);
      calls.length = 0;
      scrollByCalls.length = 0;
      const explicitNavigate = createNavigator({
        light: () => {
          calls.push(['handler', 'light', 'explicit']);
          explicitTop = 180;
        },
      });
      explicitNavigate('light', { scrollAnchor: '[data-id="room.one"]' });
      window.dispatchEvent(new WheelEvent('wheel', { bubbles: true }));
      await waitForFrame();
      outcomes.explicitScrollAnchorRestoresTheSameElement =
        callKeys().includes('handler|light|explicit')
        && scrollByCalls.some(call => scrollByDelta(call) === 60);

      calls.length = 0;
      scrollByCalls.length = 0;
      const missingAnchorNavigate = createNavigator({
        light: () => {
          calls.push(['handler', 'light', 'missing']);
          explicitTop = 260;
        },
      });
      missingAnchorNavigate('light', { scrollAnchor: '[data-id="missing"]' });
      await waitForFrame();
      outcomes.missingExplicitAnchorDoesNotAutoPickAnotherElement =
        callKeys().includes('handler|light|missing')
        && scrollByCalls.length === 0;

      resetFixture();
      state.currentView = 'light';
      let focusedTop = 90;
      const focusedAnchor = document.createElement('section');
      focusedAnchor.dataset.screenId = 'screen.one';
      focusedAnchor.innerHTML = '<button id="focused-anchor-button">Refresh</button>';
      focusedAnchor.getBoundingClientRect = () => ({
        top: focusedTop,
        bottom: focusedTop + 160,
        left: 0,
        right: 160,
        width: 160,
        height: 160,
        x: 0,
        y: focusedTop,
      });
      fixture.appendChild(focusedAnchor);
      document.getElementById('focused-anchor-button').focus();
      calls.length = 0;
      scrollByCalls.length = 0;
      const focusedNavigate = createNavigator({
        light: () => {
          calls.push(['handler', 'light', 'focused']);
          focusedTop = 30;
        },
      });
      focusedNavigate('light');
      window.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }));
      await waitForFrame();
      outcomes.sameViewNavigationAutoCapturesFocusedStableAncestor =
        callKeys().includes('handler|light|focused')
        && scrollByCalls.some(call => scrollByDelta(call) === -60);
    } finally {
      localStorage.removeItem(coverageLastViewKey);
      localStorage.removeItem(extraLastViewKey);
      state.currentProfile = originalProfile;
      state.currentView = originalCurrentView;
      window.scrollTo = originalScrollTo;
      window.scrollBy = originalScrollBy;
      if (hadCloseMobileSidebar) window.closeMobileSidebar = originalCloseMobileSidebar;
      else delete window.closeMobileSidebar;
      routerRuntime.configureViewsRouterRuntimeDeps(previousRouterRuntimeDeps);
      restoreDescriptor('scrollX', originalScrollX);
      restoreDescriptor('scrollY', originalScrollY);
      restoreDescriptor('pageXOffset', originalPageXOffset);
      restoreDescriptor('pageYOffset', originalPageYOffset);
      document.body.classList.remove('mobile-dashboard-active', 'empty-dashboard-active');
      fixture.innerHTML = '';
    }

    return outcomes;
  }, {
    dataUrl: '/js/data.js',
    routerUrl: moduleUrl('/js/views-router.js'),
    profileUrl: '/js/profile.js',
    stateUrl: '/js/state.js',
  });

  const expectedOutcomeKeys = [
    'routeValidationUsesCorePreDataAndSafeCategoryIds',
    'initialViewRestoresProfileScopedCoreRoute',
    'initialViewUsesTheActiveProfileKey',
    'initialViewFallsBackForUnsafeOrUnknownStoredRoutes',
    'navigateDispatchesCoreRoutesUpdatesChromeAndPersists',
    'navigateFallsBackToDashboardForUnsafeRoutes',
    'navigateDispatchesKnownCategoryRoutes',
    'preserveScrollRestoresPixelsAndStripsOptionsOnlyPayload',
    'explicitScrollAnchorRestoresTheSameElement',
    'missingExplicitAnchorDoesNotAutoPickAnotherElement',
    'sameViewNavigationAutoCapturesFocusedStableAncestor',
  ];
  expect(results && typeof results === 'object', 'page.evaluate returned router coverage outcomes').toBe(true);
  expect(Object.keys(results)).toEqual(expectedOutcomeKeys);
  for (const [name, passed] of Object.entries(results)) {
    expect.soft(passed, name).toBe(true);
  }
});
