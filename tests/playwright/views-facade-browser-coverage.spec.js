import { expect, test } from './coverage-fixture.js';

const moduleUrl = path => `${path}?viewsFacadeCoverage=${Date.now()}-${Math.random().toString(36).slice(2)}`;

async function openBlankPage(page) {
  await page.route('**/views-facade-browser-coverage', route => route.fulfill({
    status: 200,
    contentType: 'text/html',
    body: `<!doctype html><html><body>
      <div id="notification-container"></div>
      <main id="main-content"></main>
    </body></html>`,
  }));
  await page.goto('/views-facade-browser-coverage', { waitUntil: 'load' });
}

test('views facade browser coverage exercises genome lens picker filters and quick pins', async ({ page }) => {
  await openBlankPage(page);

  const results = await page.evaluate(async ({ viewsUrl }) => {
    const [views, dashboardComposition, stateModule, profileModule] = await Promise.all([
      import(viewsUrl),
      import('/js/dashboard-view-composition.js'),
      import('/js/state.js'),
      import('/js/profile.js'),
    ]);
    views.configureDashboardViewFactory(dashboardComposition.createDashboardViewComposition);
    const { state } = stateModule;
    const profileId = `viewsFacadeCoverage${Date.now().toString(36)}`;
    const widgetPrefsKey = profileModule.profileStorageKey(profileId, 'dashboardWidgetsV10');
    const biometricKey = profileModule.profileStorageKey(profileId, 'dashboardBiometricMetricsV1');
    const quickPinsKey = profileModule.profileStorageKey(profileId, 'dashboardQuickMarkerPinsV1');
    const outcomes = {};
    const bridgedViewActions = [
      'getInitialView', 'showDetailModal', 'openRecommendationDetail', 'discussRecommendation',
      'saveRecommendation', 'dismissRecommendation', 'openChatProviderQuiz', 'setOnboardingFocus',
      'renameCategory', 'renameMarker', 'revertMarkerName', 'openCreateMarkerModal',
      'loadFocusCard', 'renderLightTodayStrip', 'renderLightChannelsLive',
      '_openChannelOnLightPage', 'rememberModalTrigger', 'closeModal', 'navigate',
    ];
    outcomes.viewFacadeExportsModuleActions = bridgedViewActions.every(name => typeof views[name] === 'function');
    outcomes.viewActionsStayOffWindow = bridgedViewActions.every(name => !(name in window));
    const waitForToastText = async expectedTexts => {
      for (let i = 0; i < 20; i++) {
        const text = document.getElementById('notification-container')?.textContent || '';
        if (expectedTexts.every(expected => text.includes(expected))) return text;
        await new Promise(resolve => setTimeout(resolve, 25));
      }
      return document.getElementById('notification-container')?.textContent || '';
    };

    state.currentProfile = profileId;
    state.currentView = 'dashboard';
    state.profileSex = 'female';
    state.markerRegistry = {};
    state.importedData = {
      entries: [
        {
          date: '2026-01-02',
          markers: {
            'lipids.apoB': 0.92,
            'vitamins.vitaminD': 82,
          },
        },
      ],
      notes: [],
      supplements: [],
      healthGoals: [],
      diagnoses: null,
      diet: null,
      exercise: null,
      sleepRest: null,
      lightCircadian: null,
      stress: null,
      loveLife: null,
      environment: null,
      interpretiveLens: '',
      contextNotes: '',
      menstrualCycle: null,
      emfAssessment: null,
      customMarkers: {},
      markerNotes: {},
      markerValueNotes: {},
      changeHistory: [],
      wearableConnections: {},
      wearableSummary: null,
      genetics: {
        source: '23andMe <raw>',
        importDate: '2026-02-03',
        coverage: { found: 1234, total: 5678 },
        apoe: 'E3/E4',
        snps: {
          rs429358: { genotype: 'CT', gene: 'APOE' },
          rs1801133: { genotype: 'GA', gene: 'MTHFR' },
        },
        mtdna: {
          haplogroup: 'H1',
          importDate: '2026-02-04',
          coupling: { label: 'Stored maternal lineage', shortLabel: 'Maternal lineage' },
        },
      },
    };
    localStorage.removeItem(widgetPrefsKey);
    localStorage.setItem(biometricKey, '[]');
    localStorage.removeItem(quickPinsKey);

    views.showGenomeLens();
    const main = document.getElementById('main-content');
    const genomeText = main?.textContent || '';
    const genomeHtml = main?.innerHTML || '';
    outcomes.showGenomeLensRendersDedicatedWorkspace = genomeText.includes('DNA findings and traits linked to your labs.');
    outcomes.showGenomeLensRendersGeneticModifiers = genomeText.includes('Genetic Findings & Traits');
    outcomes.showGenomeLensRendersMtDnaHaplogroup = genomeText.includes('mtDNA H1');
    outcomes.showGenomeLensEscapesGeneticSource = genomeHtml.includes('23andMe &lt;raw&gt;');
    outcomes.showGenomeLensDoesNotRenderRawGeneticSource = !genomeHtml.includes('23andMe <raw>');

    views.openDashboardWidgetPicker();
    views.filterDashboardMarkerWidgetPicker('apo');
    views.filterDashboardBiometricWidgetPicker('weight');
    const markerOptions = [...document.querySelectorAll('.dashboard-marker-widget-option')];
    const biometricOptions = [...document.querySelectorAll('.dashboard-biometric-widget-option')];
    const visibleMarkerOptions = markerOptions.filter(option => !option.hidden);
    const apoBOption = markerOptions.find(option => (option.textContent || '').includes('Apo B'));
    const vitaminDOption = markerOptions.find(option => (option.textContent || '').includes('Vitamin D'));
    const weightOption = biometricOptions.find(option => option.dataset.dashboardWidgetId === 'weight');
    outcomes.markerPickerFilterShowsApoB = apoBOption?.hidden === false;
    outcomes.markerPickerFilterShowsOnlyApoB = visibleMarkerOptions.length === 1 && visibleMarkerOptions[0] === apoBOption;
    outcomes.markerPickerFilterHidesVitaminD = vitaminDOption?.hidden === true;
    outcomes.markerPickerFilterKeepsEmptyHidden = document.getElementById('dashboard-marker-widget-empty')?.hidden === true;
    outcomes.biometricPickerFilterShowsWeightMetric =
      weightOption?.hidden === false
      && (weightOption.textContent || '').includes('Weight');
    outcomes.biometricPickerFilterMatchesSearchAttribute = biometricOptions.every(option => {
      const matchesNeedle = (option.dataset.biometricSearch || '').includes('weight');
      return matchesNeedle ? option.hidden === false : option.hidden === true;
    });
    outcomes.biometricPickerFilterKeepsEmptyHidden = document.getElementById('dashboard-biometric-widget-empty')?.hidden === true;

    state.currentView = 'labs';
    const quickPinFacade = views.toggleDashboardQuickMarkerPin;
    outcomes.quickPinModuleApiExists = typeof quickPinFacade === 'function';
    outcomes.quickPinStaysOffWindow = !('toggleDashboardQuickMarkerPin' in window);
    if (typeof quickPinFacade === 'function') quickPinFacade('lipids_apoB');
    const pinsAfterAdd = JSON.parse(localStorage.getItem(quickPinsKey) || '[]');
    if (typeof quickPinFacade === 'function') quickPinFacade('lipids_apoB');
    const pinsAfterRemove = JSON.parse(localStorage.getItem(quickPinsKey) || '[]');
    const toastText = await waitForToastText(['Pinned to Quick Markers', 'Removed from Quick Markers']);
    outcomes.quickPinAddsMarkerToStorage = pinsAfterAdd[0] === 'lipids_apoB';
    outcomes.quickPinRemovesMarkerFromStorage = pinsAfterRemove.length === 0;
    outcomes.quickPinShowsPinnedToast = toastText.includes('Pinned to Quick Markers');
    outcomes.quickPinShowsRemovedToast = toastText.includes('Removed from Quick Markers');

    views.closeDashboardWidgetPicker();
    return outcomes;
  }, {
    viewsUrl: moduleUrl('/js/views.js'),
  });

  expect(results && typeof results === 'object', 'page.evaluate returned views facade outcomes').toBe(true);
  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});
