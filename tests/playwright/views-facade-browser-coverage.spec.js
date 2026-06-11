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
    const [views, stateModule, profileModule] = await Promise.all([
      import(viewsUrl),
      import('/js/state.js'),
      import('/js/profile.js'),
    ]);
    const { state } = stateModule;
    const profileId = `viewsFacadeCoverage${Date.now().toString(36)}`;
    const widgetPrefsKey = profileModule.profileStorageKey(profileId, 'dashboardWidgetsV10');
    const biometricKey = profileModule.profileStorageKey(profileId, 'dashboardBiometricMetricsV1');
    const quickPinsKey = profileModule.profileStorageKey(profileId, 'dashboardQuickMarkerPinsV1');
    const outcomes = {};

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
    outcomes.showGenomeLensUsesViewsFacade =
      genomeText.includes('Dedicated DNA workspace')
      && genomeText.includes('Actionable Genetic Modifiers')
      && genomeText.includes('mtDNA H1')
      && genomeHtml.includes('23andMe &lt;raw&gt;')
      && !genomeHtml.includes('23andMe <raw>');

    views.openDashboardWidgetPicker();
    views.filterDashboardMarkerWidgetPicker('apo');
    views.filterDashboardBiometricWidgetPicker('weight');
    const markerOptions = [...document.querySelectorAll('.dashboard-marker-widget-option')];
    const biometricOptions = [...document.querySelectorAll('.dashboard-biometric-widget-option')];
    const visibleMarkerTexts = markerOptions.filter(option => !option.hidden).map(option => option.textContent || '');
    const visibleBiometricTexts = biometricOptions.filter(option => !option.hidden).map(option => option.textContent || '');
    outcomes.markerPickerFilterUsesViewsFacade =
      visibleMarkerTexts.length === 1
      && visibleMarkerTexts[0].includes('Apo B')
      && markerOptions.some(option => option.hidden && option.textContent.includes('Vitamin D'))
      && document.getElementById('dashboard-marker-widget-empty')?.hidden === true;
    outcomes.biometricPickerFilterUsesViewsFacade =
      visibleBiometricTexts.length === 1
      && visibleBiometricTexts[0].includes('Weight')
      && biometricOptions.every(option => option.textContent.includes('Weight') || option.hidden)
      && document.getElementById('dashboard-biometric-widget-empty')?.hidden === true;

    state.currentView = 'labs';
    window.toggleDashboardQuickMarkerPin('lipids_apoB');
    const pinsAfterAdd = JSON.parse(localStorage.getItem(quickPinsKey) || '[]');
    window.toggleDashboardQuickMarkerPin('lipids_apoB');
    const pinsAfterRemove = JSON.parse(localStorage.getItem(quickPinsKey) || '[]');
    const toastText = document.getElementById('notification-container')?.textContent || '';
    outcomes.quickPinUsesViewsWindowFacade =
      pinsAfterAdd[0] === 'lipids_apoB'
      && pinsAfterRemove.length === 0
      && toastText.includes('Pinned to Quick Markers')
      && toastText.includes('Removed from Quick Markers');

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
