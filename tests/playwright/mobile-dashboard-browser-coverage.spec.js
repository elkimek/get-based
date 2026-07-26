import { expect, test } from './coverage-fixture.js';

const moduleUrl = (path) => `${path}?mobileDashboardCoverage=${Date.now()}-${Math.random().toString(36).slice(2)}`;

async function openBlankPage(page) {
  await page.route('**/mobile-dashboard-browser-coverage', route => route.fulfill({
    contentType: 'text/html',
    body: '<!doctype html><html><head></head><body><main id="main-content"></main><input id="sidebar-search"></body></html>',
  }));
  await page.goto('/mobile-dashboard-browser-coverage', { waitUntil: 'load' });
}

test('mobile dashboard browser coverage exercises defaults breakpoint search and jumps', async ({ page }) => {
  await openBlankPage(page);

  const results = await page.evaluate(async ({ mobileDashboardUrl }) => {
    const calls = [];
    const mediaListeners = [];
    const saved = {
      matchMedia: window.matchMedia,
      scrollTo: window.scrollTo,
    };

    window.matchMedia = query => ({
      media: query,
      matches: true,
      onchange: null,
      addEventListener: (type, callback) => {
        if (type === 'change') mediaListeners.push(callback);
      },
      removeEventListener: () => {},
      addListener: callback => mediaListeners.push(callback),
      removeListener: () => {},
      dispatchEvent: () => false,
    });
    window.scrollTo = (...args) => calls.push(['scrollTo', ...args]);

    const [{ state }, mobileDashboard] = await Promise.all([
      import('/js/state.js'),
      import(mobileDashboardUrl),
    ]);
    const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
    const originalState = {
      importedData: clone(state.importedData),
      currentProfile: state.currentProfile,
      currentView: state.currentView,
      markerRegistry: clone(state.markerRegistry),
    };
    const profilesStorage = localStorage.getItem('labcharts-profiles');
    const activeProfile = localStorage.getItem('labcharts-active-profile');
    const outcomes = {};
    const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

    const mobileData = {
      dates: ['2026-01-01', '2026-02-01'],
      dateLabels: ['Jan 1, 2026', 'Feb 1, 2026'],
      categories: {
        metabolic: {
          label: 'Metabolic',
          markers: {
            glucose: {
              name: 'Glucose',
              unit: 'mg/dL',
              values: [82, 108],
              refMin: 70,
              refMax: 99,
            },
          },
        },
      },
    };

    try {
      localStorage.setItem('labcharts-profiles', JSON.stringify([{ id: 'mobile-profile', name: 'Mobile Tester' }]));
      localStorage.setItem('labcharts-active-profile', 'mobile-profile');
      state.currentProfile = 'mobile-profile';
      state.importedData = {
        ...state.importedData,
        entries: [],
        notes: [],
        supplements: [],
        customMarkers: {},
        wearableSummary: {
          sources: { fitbit: true },
          metrics: {
            steps: { latest: 12345, baseline: 10000 },
            bp_systolic: { latest: 118, baseline: 122 },
            bp_diastolic: { latest: 76, baseline: 78 },
          },
        },
      };
      mobileDashboard.configureMobileDashboardView({
        navigate: route => calls.push(['navigate', route]),
        toggleMobileSidebar: () => calls.push(['toggleMobileSidebar']),
        loadContextCardTips: () => calls.push(['loadContextCardTips']),
        loadCatalog: async () => {
          calls.push(['loadCatalog']);
          return { catalog: true };
        },
        cacheCatalog: catalog => calls.push(['cacheCatalog', catalog?.catalog === true]),
      });

      outcomes.breakpointListenerWasRegistered = mediaListeners.length > 0
        && mobileDashboard.isMobileDashboardViewport() === true;

      const wearablePriority = mobileDashboard.getMobileWearablePriority();
      outcomes.mobileWearablePriorityKeepsHighSignalOrder =
        wearablePriority.slice(0, 4).join('|') === 'hrv_rmssd|sleep_score|readiness_score|steps'
        && wearablePriority.includes('bp_systolic')
        && wearablePriority.indexOf('steps') < wearablePriority.indexOf('bp_systolic');

      state.currentView = 'dashboard';
      mediaListeners[0]?.({ matches: true });
      state.currentView = 'labs';
      mediaListeners[0]?.({ matches: true });
      outcomes.breakpointRefreshNavigatesOrSyncsTabs = calls.some(call => call[0] === 'navigate' && call[1] === 'dashboard')
        && document.getElementById('mobile-bottom-tabs')?.querySelector('[data-tab="labs"]')?.classList.contains('active') === true;

      mobileDashboard.renderMobileDashboard(mobileData, { resetScroll: true });
      await wait(0);
      const firstRenderHtml = document.getElementById('main-content')?.innerHTML || '';
      const defaultDepsOk = document.body.classList.contains('mobile-dashboard-active') === true
        && document.documentElement.classList.contains('mobile-dashboard-active') === true
        && firstRenderHtml.includes('Hey Mobile.')
        && firstRenderHtml.includes('No widgets are visible.')
        && calls.some(call => call[0] === 'scrollTo' && call[1] === 0 && call[2] === 0)
        && calls.some(call => call[0] === 'loadContextCardTips')
        && calls.some(call => call[0] === 'loadCatalog')
        && calls.some(call => call[0] === 'cacheCatalog' && call[1] === true);
      outcomes.defaultDepsRenderEmptyWidgetStackAndRunShellHooks = defaultDepsOk || {
        bodyActive: document.body.classList.contains('mobile-dashboard-active'),
        rootActive: document.documentElement.classList.contains('mobile-dashboard-active'),
        greeting: firstRenderHtml.match(/Hey [^<]+/)?.[0] || '',
        hasEmptyWidget: firstRenderHtml.includes('No widgets are visible.'),
        calls,
      };

      mobileDashboard.configureMobileDashboardView({
        getVisibleDashboardWidgetEntries: () => [{ def: { id: 'coverage-widget' }, body: '<p>custom body ignored by default renderer</p>' }],
      });
      mobileDashboard.renderMobileDashboard(mobileData);
      const secondRenderHtml = document.getElementById('main-content')?.innerHTML || '';
      outcomes.defaultRenderDashboardWidgetCallbackHandlesVisibleEntries = secondRenderHtml.includes('Dashboard widgets')
        && secondRenderHtml.includes('m-dashboard-widgets')
        && !secondRenderHtml.includes('custom body ignored by default renderer')
        && !secondRenderHtml.includes('No widgets are visible.');

      mobileDashboard.mobileDashboardSetTab('labs');
      const activeLabs = document.querySelector('.m-tab[data-tab="labs"]');
      const activeDashboard = document.querySelector('.m-tab[data-tab="dashboard"]');
      outcomes.mobileDashboardSetTabUpdatesActiveState = activeLabs?.classList.contains('active') === true
        && activeLabs?.getAttribute('aria-current') === 'page'
        && activeDashboard?.getAttribute('aria-current') === 'false';

      document.querySelector('.m-tab[data-tab="light"]')?.click();
      const activeLight = document.querySelector('.m-tab[data-tab="light"]');
      outcomes.mobileDashboardTabsUseDelegatedActions = activeLight?.classList.contains('active') === true
        && activeLight?.getAttribute('data-mobile-dashboard-action') === 'navigate-tab'
        && activeLight?.getAttribute('data-mobile-dashboard-route') === 'light'
        && calls.some(call => call[0] === 'navigate' && call[1] === 'light')
        && !document.querySelector('.m-tab[data-tab="light"]')?.hasAttribute('onclick')
        && !firstRenderHtml.includes('onclick=');

      mobileDashboard.openMobileDashboardSearch();
      await wait(100);
      outcomes.openMobileDashboardSearchTogglesSidebarAndFocusesSearch = calls.some(call => call[0] === 'toggleMobileSidebar')
        && document.activeElement?.id === 'sidebar-search';

      mobileDashboard.mobileDashboardJump('body');
      mobileDashboard.mobileDashboardJump('recommendations');
      mobileDashboard.mobileDashboardJump('unknown-route');
      outcomes.mobileDashboardJumpNormalizesRoutesAndTabs = calls.some(call => call[0] === 'navigate' && call[1] === 'body')
        && calls.some(call => call[0] === 'navigate' && call[1] === 'recommendations')
        && calls.some(call => call[0] === 'navigate' && call[1] === 'dashboard')
        && document.querySelector('.m-tab[data-tab="dashboard"]')?.classList.contains('active') === true;
    } finally {
      state.importedData = originalState.importedData;
      state.currentProfile = originalState.currentProfile;
      state.currentView = originalState.currentView;
      state.markerRegistry = originalState.markerRegistry;
      if (profilesStorage == null) localStorage.removeItem('labcharts-profiles');
      else localStorage.setItem('labcharts-profiles', profilesStorage);
      if (activeProfile == null) localStorage.removeItem('labcharts-active-profile');
      else localStorage.setItem('labcharts-active-profile', activeProfile);
      window.matchMedia = saved.matchMedia;
      if (saved.scrollTo) window.scrollTo = saved.scrollTo;
      else delete window.scrollTo;
      mobileDashboard.configureMobileDashboardView({
        navigate: () => {},
        toggleMobileSidebar: () => {},
        loadContextCardTips: () => {},
        loadCatalog: async () => null,
        cacheCatalog: () => {},
      });
      document.body.classList.remove('mobile-dashboard-active', 'mobile-tabs-active');
      document.documentElement.classList.remove('mobile-dashboard-active', 'mobile-tabs-active');
      document.documentElement.style.removeProperty('--mobile-visual-bottom-offset');
    }

    return outcomes;
  }, { mobileDashboardUrl: moduleUrl('/js/mobile-dashboard.js') });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, `${name}: ${JSON.stringify(passed)}`).toBe(true);
  }
});
