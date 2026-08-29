import { expect, test } from './coverage-fixture.js';

const moduleUrl = path => `${path}?dashboardRecommendationsCoverage=${Date.now()}-${Math.random().toString(36).slice(2)}`;

async function openBlankPage(page) {
  await page.route('**/dashboard-recommendation-widget-browser-coverage', route => route.fulfill({
    status: 200,
    contentType: 'text/html',
    body: '<!doctype html><html><body><main id="fixture"></main></body></html>',
  }));
  await page.goto('/dashboard-recommendation-widget-browser-coverage', { waitUntil: 'load' });
}

test('dashboard recommendation widget browser coverage exercises candidates rendering and state', async ({ page }) => {
  test.setTimeout(30_000);
  await openBlankPage(page);

  const results = await page.evaluate(async ({ recommendationWidgetUrl }) => {
    const [widgetModule, stateModule, profileModule, recommendationRuntime] = await Promise.all([
      import(recommendationWidgetUrl),
      import('/js/state.js'),
      import('/js/profile.js'),
      import('/js/recommendations-runtime.js'),
    ]);
    const outcomes = {};
    const { state } = stateModule;
    const originalProfile = state.currentProfile;
    const originalView = state.currentView;
    const originalMarkerRegistry = state.markerRegistry;
    const savedWindow = { _snpTableCache: window._snpTableCache };
    const savedCatalog = recommendationRuntime.getRecommendationsCatalogCache();
    let previousRecommendationBridge = null;
    let previousWidgetRuntimeDeps = null;
    const fixture = document.getElementById('fixture');
    const calls = [];
    const profileId = 'dashboardRecommendationCoverage';
    const savedKey = profileModule.profileStorageKey(profileId, 'recommendations-saved-v1');
    const dismissedKey = profileModule.profileStorageKey(profileId, 'recommendations-dismissed-v1');
    let productRecsEnabled = true;
    let activeCtx;
    let loadCatalogCalls = 0;
    let resolveCatalog;

    const catalog = {
      slots: {
        'lipids.ldl': {
          label: 'LDL cholesterol',
          freeActions: ['Eat more soluble fiber'],
          forms: ['Plant sterols'],
        },
        'light.morningLight': {
          freeActions: ['Get outdoor light before 10am'],
        },
        'body.sleep': {
          label: 'Sleep depth',
          foodForms: ['Kiwi before bed'],
        },
        'genome.mthfr': {
          label: 'Methylation support',
          productForms: ['Methylated B complex'],
        },
      },
    };
    const marker = {
      name: 'LDL',
      unit: 'mmol/L',
      values: [2.6, 4.8],
      refMin: 0,
      refMax: 3,
    };
    const data = {
      categories: {
        lipids: {
          label: 'Lipids',
          markers: { ldl: marker },
        },
      },
    };
    activeCtx = {
      data,
      filteredData: data,
      trendAlerts: [{ id: 'lipids_ldl', code: 'past_high' }],
      criticalFlags: [{ id: 'lipids_ldl' }],
    };
    const labCandidateId = 'labs:lipids.ldl:lipids_ldl';
    const lightCandidateId = 'light:light.morningLight:recent';
    const wearableCandidateId = 'body:body.sleep:wearable';
    const dnaCandidateId = 'genome:genome.mthfr:dna';

    const removeRecommendationKeys = () => {
      localStorage.removeItem(savedKey);
      localStorage.removeItem(dismissedKey);
    };
    const restoreWindowProperty = (name, value) => {
      if (value === undefined) delete window[name];
      else window[name] = value;
    };

    try {
      state.currentProfile = profileId;
      state.currentView = 'dashboard';
      state.markerRegistry = {};
      removeRecommendationKeys();
      previousRecommendationBridge = recommendationRuntime.configureRecommendationModuleBridge({
        isProductRecsEnabled: () => productRecsEnabled,
        buildDNAHints: slotKey => slotKey === 'genome.mthfr'
          ? [{ gene: 'MTHFR', text: 'MTHFR variant suggests methylation support.' }]
          : [],
        loadCatalog: () => {
          loadCatalogCalls += 1;
          return new Promise(resolve => { resolveCatalog = resolve; });
        },
      });
      previousWidgetRuntimeDeps = widgetModule.configureDashboardRecommendationRuntimeDeps({
        detectWearableTrendSlots: () => [{
          slotKey: 'body.sleep',
          reason: 'Wearable sleep trend is deteriorating.',
        }],
        dismissRecommendation: (...args) => calls.push(['dismissRecommendation', ...args]),
        discussRecommendation: (...args) => calls.push(['discussRecommendation', ...args]),
        navigate: (...args) => calls.push(['navigate', ...args]),
        openRecommendationDetail: (...args) => calls.push(['openRecommendationDetail', ...args]),
        openSettingsModal: (...args) => calls.push(['openSettingsModal', ...args]),
        saveRecommendation: (...args) => calls.push(['saveRecommendation', ...args]),
        showDetailModal: (...args) => calls.push(['showDetailModal', ...args]),
      });
      window._snpTableCache = { rows: [{ id: 'rs1801133' }] };
      recommendationRuntime.setRecommendationsCatalogCache(null);

      const widget = widgetModule.createDashboardRecommendationWidget({
        markerHasData: nextMarker => Array.isArray(nextMarker?.values) && nextMarker.values.some(v => v !== null),
        buildDashboardWidgetContext: () => activeCtx,
        showRecommendations: nextData => calls.push(['showRecommendations', !!nextData?.categories?.lipids]),
      });

      productRecsEnabled = false;
      const disabledHtml = widget.renderDashboardRecommendationsWidget(activeCtx);
      outcomes.disabledStateLinksToPrivacySettings =
        disabledHtml.includes('Tips are off')
        && disabledHtml.includes('data-dashboard-rec-action="open-privacy-settings"');

      productRecsEnabled = true;
      fixture.innerHTML = `
        <section class="dashboard-widget" data-widget-id="recommendations">
          <div class="dashboard-widget-body"></div>
        </section>
        <section id="recommendations-page"></section>
      `;
      state.currentView = 'recommendations';
      const loadingHtml = widget.renderDashboardRecommendationsWidget(activeCtx);
      widget.refreshRecommendationsWhenCatalogReady();
      outcomes.loadingStateStartsOnlyOneCatalogRequest =
        loadingHtml.includes('Loading tips')
        && loadCatalogCalls === 1;
      resolveCatalog(catalog);
      await Promise.resolve();
      await Promise.resolve();
      outcomes.catalogRefreshUpdatesDashboardAndRecommendationsPage =
        recommendationRuntime.getRecommendationsCatalogCache() === catalog
        && fixture.querySelector('.dashboard-widget-body')?.innerHTML.includes('rec-next-widget')
        && calls.some(call => call.join('|') === 'showRecommendations|true');

      const candidates = widget.getGlobalRecommendationCandidates(activeCtx, catalog);
      const ids = candidates.map(candidate => candidate.id);
      const lightCandidate = candidates.find(candidate => candidate.id === lightCandidateId);
      const labCandidate = candidates.find(candidate => candidate.id === labCandidateId);
      outcomes.candidatesCoverLabsLightWearablesAndDnaHints =
        ids.includes(labCandidateId)
        && ids.includes(lightCandidateId)
        && ids.includes(wearableCandidateId)
        && ids.includes(dnaCandidateId)
        && lightCandidate?.label === 'morning Light'
        && lightCandidate?.primaryAction === 'Get outdoor light before 10am'
        && labCandidate?.reason.includes('current trend signal is past high')
        && state.markerRegistry.lipids_ldl === marker;

      widget.setRecommendationState('saved', labCandidateId, true);
      const savedStorageAfterAdd = JSON.parse(localStorage.getItem(savedKey) || '[]');
      const savedCandidates = widget.getGlobalRecommendationCandidates(activeCtx, catalog);
      const savedCandidate = savedCandidates.find(candidate => candidate.id === labCandidateId);
      widget.setRecommendationState('dismissed', lightCandidateId, true);
      const dismissedStorageAfterAdd = JSON.parse(localStorage.getItem(dismissedKey) || '[]');
      const withoutDismissed = widget.getGlobalRecommendationCandidates(activeCtx, catalog);
      const withDismissed = widget.getGlobalRecommendationCandidates(activeCtx, catalog, { includeDismissed: true });
      widget.setRecommendationState('saved', labCandidateId, false);
      widget.setRecommendationState('dismissed', lightCandidateId, false);
      outcomes.statePersistenceMarksSavedDismissedAndRefreshesSurfaces =
        savedCandidates[0]?.id === labCandidateId
        && savedCandidate?.saved === true
        && savedStorageAfterAdd.includes(labCandidateId)
        && JSON.parse(localStorage.getItem(savedKey) || '[]').length === 0
        && !withoutDismissed.some(candidate => candidate.id === lightCandidateId)
        && dismissedStorageAfterAdd.includes(lightCandidateId)
        && withDismissed.find(candidate => candidate.id === lightCandidateId)?.dismissed === true
        && JSON.parse(localStorage.getItem(dismissedKey) || '[]').length === 0
        && calls.filter(call => call[0] === 'showRecommendations').length >= 3;

      const escapedCard = widget.renderRecommendationCard({
        id: 'rec"<id',
        source: 'Labs<script>',
        slotKey: 'lipids.ldl',
        label: 'LDL <script>',
        reason: 'Reason <b>bold</b>',
        meta: 'Meta <img>',
        primaryAction: 'Action <now>',
        markerId: 'lipids_ldl',
        markerStatus: 'high',
        saved: false,
        dismissed: false,
      });
      const compactCard = widget.renderRecommendationCard({
        id: labCandidateId,
        source: 'Labs',
        slotKey: 'lipids.ldl',
        label: 'LDL',
        reason: 'Reason',
        primaryAction: 'Hidden when compact',
        saved: true,
        dismissed: false,
      }, { compact: true });
      outcomes.renderCardsEscapeMarkupAndBuildActionHandlers =
        escapedCard.includes('&lt;script&gt;')
        && escapedCard.includes('Reason &lt;b&gt;bold&lt;/b&gt;')
        && escapedCard.includes('data-dashboard-rec-action="view-marker"')
        && escapedCard.includes('data-dashboard-rec-action="open-detail"')
        && escapedCard.includes('data-dashboard-rec-action="discuss"')
        && escapedCard.includes('data-dashboard-rec-action="save"')
        && escapedCard.includes('data-dashboard-rec-action="dismiss"')
        && compactCard.includes('rec-next-card-compact')
        && compactCard.includes('Bookmarked')
        && !compactCard.includes('Hidden when compact')
        && !compactCard.includes('Dismiss');

      fixture.innerHTML = `<div class="rec-next-widget">${escapedCard}</div>
        <button type="button" class="db-correlation-empty" data-dashboard-rec-action="navigate" data-dashboard-rec-route="labs">Labs</button>
        <button type="button" class="db-correlation-empty" data-dashboard-rec-action="open-privacy-settings">Privacy</button>`;
      for (const action of ['view-marker', 'open-detail', 'discuss', 'save', 'dismiss']) {
        fixture.querySelector(`[data-dashboard-rec-action="${action}"]`)?.click();
      }
      fixture.querySelector('[data-dashboard-rec-action="navigate"]')?.click();
      fixture.querySelector('[data-dashboard-rec-action="open-privacy-settings"]')?.click();
      outcomes.delegatedActionsUseConfiguredRuntimeDeps =
        calls.some(call => call[0] === 'showDetailModal' && call[1] === 'lipids_ldl' && call[2]?.scrollToRec === true)
        && calls.some(call => call.join('|') === 'openRecommendationDetail|lipids.ldl|LDL <script>|high')
        && calls.some(call => call.join('|') === 'discussRecommendation|rec"<id')
        && calls.some(call => call.join('|') === 'saveRecommendation|rec"<id|true')
        && calls.some(call => call.join('|') === 'dismissRecommendation|rec"<id|true')
        && calls.some(call => call.join('|') === 'navigate|labs')
        && calls.some(call => call.join('|') === 'openSettingsModal|privacy');

      recommendationRuntime.setRecommendationsCatalogCache({ slots: {} });
      const emptyHtml = widget.renderDashboardRecommendationsWidget(activeCtx);
      const customEmptyHtml = widget.renderRecommendationsEmpty('Nothing <ready>');
      outcomes.emptyStatesRenderSafeFallbackActions =
        emptyHtml.includes('No data-linked tips yet.')
        && emptyHtml.includes('data-dashboard-rec-route="labs"')
        && customEmptyHtml.includes('Nothing &lt;ready&gt;')
        && customEmptyHtml.includes('Import labs');
    } finally {
      removeRecommendationKeys();
      state.currentProfile = originalProfile;
      state.currentView = originalView;
      state.markerRegistry = originalMarkerRegistry;
      fixture.innerHTML = '';
      if (previousRecommendationBridge) {
        recommendationRuntime.configureRecommendationModuleBridge(previousRecommendationBridge);
      }
      if (previousWidgetRuntimeDeps) {
        widgetModule.configureDashboardRecommendationRuntimeDeps(previousWidgetRuntimeDeps);
      }
      recommendationRuntime.setRecommendationsCatalogCache(savedCatalog);
      for (const [key, value] of Object.entries(savedWindow)) {
        restoreWindowProperty(key, value);
      }
    }

    return outcomes;
  }, {
    recommendationWidgetUrl: moduleUrl('/js/dashboard-recommendation-widget.js'),
  });

  const expectedOutcomeKeys = [
    'disabledStateLinksToPrivacySettings',
    'loadingStateStartsOnlyOneCatalogRequest',
    'catalogRefreshUpdatesDashboardAndRecommendationsPage',
    'candidatesCoverLabsLightWearablesAndDnaHints',
    'statePersistenceMarksSavedDismissedAndRefreshesSurfaces',
    'renderCardsEscapeMarkupAndBuildActionHandlers',
    'delegatedActionsUseConfiguredRuntimeDeps',
    'emptyStatesRenderSafeFallbackActions',
  ];
  expect(results && typeof results === 'object', 'page.evaluate returned recommendation widget outcomes').toBe(true);
  expect(Object.keys(results)).toEqual(expectedOutcomeKeys);
  for (const [name, passed] of Object.entries(results)) {
    expect.soft(passed, name).toBe(true);
  }
});
