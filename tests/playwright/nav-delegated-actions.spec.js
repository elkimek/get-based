import { expect, test } from './coverage-fixture.js';

async function prepareApp(page) {
  await page.addInitScript(() => {
    const profileId = localStorage.getItem('labcharts-active-profile') || 'default';
    localStorage.setItem(`labcharts-${profileId}-emptyTour`, 'completed');
    localStorage.setItem(`labcharts-${profileId}-tour`, 'completed');
  });
  await page.goto('/app', { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.buildSidebar === 'function');
  await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    const profileId = state.currentProfile || localStorage.getItem('labcharts-active-profile') || 'default';
    localStorage.setItem(`labcharts-${profileId}-emptyTour`, 'completed');
    localStorage.setItem(`labcharts-${profileId}-tour`, 'completed');
    window.endTour?.();
    document.getElementById('tour-overlay')?.remove();
    document.getElementById('tour-spotlight')?.remove();
    document.getElementById('tour-tooltip')?.remove();
  });
}

test('sidebar nav delegated actions route, filter, and open utilities', async ({ page }) => {
  await prepareApp(page);

  const results = await page.evaluate(async () => {
    const nav = await import('/js/nav.js');
    const { state } = await import('/js/state.js');
    const origDateRangeFilter = state.dateRangeFilter;
    const origCurrentView = state.currentView;
    const origProfiles = state.profiles;
    const origNavigate = window.navigate;
    const origOpenEMF = window.openEMFAssessmentEditor;
    const origOpenLightEnv = window.openLightEnvironmentAssessment;
    const origOpenReportBuilder = window.openReportBuilder;
    const origOpenKB = window.openKnowledgeBaseModal;
    const origOpenCreateMarker = window.openCreateMarkerModal;
    const origOpenClientList = window.openClientList;
    const origIsGroupInAI = window.isGroupInAIContext;
    const origSetGroupInAI = window.setGroupInAIContext;
    const origGroupStorage = localStorage.getItem('labcharts-navgroup-Hormones');

    try {
      const fixtureData = {
        dates: ['2026-05-15'],
        dateLabels: ['May 15'],
        categories: {
          metabolic: {
            label: 'Metabolic',
            markers: {
              glucose: { name: 'Glucose', values: [5.1], refMin: 3.5, refMax: 6.0, unit: 'mmol/L' },
            },
          },
          thyroid: {
            label: 'Hormones: Thyroid',
            group: 'Hormones',
            markers: {
              tsh: { name: 'TSH', values: [2.1], refMin: 0.4, refMax: 4.0, unit: 'mIU/L' },
            },
          },
        },
      };

      state.dateRangeFilter = 'all';
      state.currentView = 'dashboard';
      state.profiles = [{ id: state.currentProfile || 'default', name: 'Demo Client' }];
      localStorage.removeItem('labcharts-navgroup-Hormones');

      const calls = [];
      const aiGroups = new Set();
      window.navigate = route => {
        calls.push(['navigate', route]);
        state.currentView = route;
        window.syncSidebarActive?.(route);
      };
      window.openEMFAssessmentEditor = () => calls.push(['open-emf']);
      window.openLightEnvironmentAssessment = () => calls.push(['open-light-env']);
      window.openReportBuilder = () => calls.push(['open-report-builder']);
      window.openKnowledgeBaseModal = () => calls.push(['open-kb']);
      window.openCreateMarkerModal = () => calls.push(['open-custom-marker']);
      window.openClientList = () => calls.push(['open-client-list']);
      window.isGroupInAIContext = group => aiGroups.has(group);
      window.setGroupInAIContext = (group, on) => {
        calls.push(['set-group-ai', group, on]);
        if (on) aiGroups.add(group);
        else aiGroups.delete(group);
      };

      window.buildSidebar(fixtureData);
      window.renderProfileButton();
      nav.openRecommendationsFromSidebar();

      const inlineHandler = document.querySelector('#sidebar-nav [onclick], #sidebar-nav [oninput], #sidebar-nav [onkeydown], #profile-selector [onclick]');
      document.querySelector('#sidebar-nav .nav-item[data-category="labs"]')?.click();

      const compareItem = document.querySelector('#sidebar-nav .nav-item[data-category="compare"]');
      compareItem?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

      const search = document.getElementById('sidebar-search');
      if (search) {
        search.value = 'thyroid';
        search.dispatchEvent(new Event('input', { bubbles: true }));
      }

      const groupHeader = document.querySelector('.sidebar-group-header[data-group-name="Hormones"]');
      groupHeader?.click();
      const groupCollapsed = groupHeader?.classList.contains('collapsed') === true
        && document.querySelector('.sidebar-group-items[data-group-items="Hormones"]')?.style.display === 'none'
        && groupHeader.querySelector('.sidebar-group-toggle')?.getAttribute('aria-expanded') === 'false';
      groupHeader?.click();
      const groupExpanded = groupHeader?.classList.contains('collapsed') === false
        && document.querySelector('.sidebar-group-items[data-group-items="Hormones"]')?.style.display !== 'none'
        && groupHeader?.querySelector('.sidebar-group-toggle')?.getAttribute('aria-expanded') === 'true';

      document.querySelector('.sidebar-group-header[data-group-name="Hormones"] .sidebar-ai-toggle')?.click();

      document.querySelector('#sidebar-nav .nav-item[data-category="emf"]')?.click();
      document.querySelector('#sidebar-nav .nav-item[data-category="light-env-assessment"]')?.click();
      document.querySelector('#sidebar-nav .nav-item[data-category="reports"]')?.click();
      document.querySelector('#sidebar-nav .nav-item[data-category="knowledge"]')?.click();
      document.querySelector('#sidebar-nav .nav-item[data-category="custom-markers"]')?.click();
      document.querySelector('#sidebar-nav .sidebar-add-marker')?.click();
      document.querySelector('#profile-selector .profile-compact-btn')?.click();

      return {
        noInlineHandlers: !inlineHandler,
        recommendationsHelperRoutes: calls.some(c => c[0] === 'navigate' && c[1] === 'recommendations'),
        labsRoutes: calls.some(c => c[0] === 'navigate' && c[1] === 'labs'),
        compareKeyboardRoutes: calls.some(c => c[0] === 'navigate' && c[1] === 'compare'),
        searchHidesNonMatching: document.querySelector('#sidebar-nav .nav-item[data-category="metabolic"]')?.style.display === 'none',
        searchKeepsMatching: document.querySelector('#sidebar-nav .nav-item[data-category="thyroid"]')?.style.display !== 'none',
        groupCollapsed,
        groupExpanded,
        aiToggleUpdatesContext: aiGroups.has('Hormones')
          && calls.some(c => c[0] === 'set-group-ai' && c[1] === 'Hormones' && c[2] === true),
        utilitiesCallHandlers: calls.some(c => c[0] === 'open-emf')
          && calls.some(c => c[0] === 'open-light-env')
          && calls.some(c => c[0] === 'open-report-builder')
          && calls.some(c => c[0] === 'open-kb')
          && calls.filter(c => c[0] === 'open-custom-marker').length >= 2
          && calls.some(c => c[0] === 'open-client-list'),
      };
    } finally {
      state.dateRangeFilter = origDateRangeFilter;
      state.currentView = origCurrentView;
      state.profiles = origProfiles;
      window.navigate = origNavigate;
      window.openEMFAssessmentEditor = origOpenEMF;
      window.openLightEnvironmentAssessment = origOpenLightEnv;
      window.openReportBuilder = origOpenReportBuilder;
      window.openKnowledgeBaseModal = origOpenKB;
      window.openCreateMarkerModal = origOpenCreateMarker;
      window.openClientList = origOpenClientList;
      window.isGroupInAIContext = origIsGroupInAI;
      window.setGroupInAIContext = origSetGroupInAI;
      if (origGroupStorage == null) localStorage.removeItem('labcharts-navgroup-Hormones');
      else localStorage.setItem('labcharts-navgroup-Hormones', origGroupStorage);
      window.buildSidebar?.();
      window.renderProfileButton?.();
    }
  });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});
