import { expect, test } from './coverage-fixture.js';

async function openBlankPage(page) {
  await page.route('**/data-browser-coverage', route => route.fulfill({
    contentType: 'text/html',
    body: `<!doctype html><html><head></head><body>
      <button class="nav-item active" data-category="metabolic"></button>
      <div id="header-dates"></div>
      <div id="header-range-toggle"></div>
      <div id="view-content"><div class="charts-grid">
        <canvas id="chart-metabolic_glucose"></canvas>
        <canvas id="chart-other_marker"></canvas>
      </div></div>
      <main id="fixture"></main>
    </body></html>`,
  }));
  await page.goto('/data-browser-coverage', { waitUntil: 'load' });
}

test('data browser coverage exercises display toggles range refresh and helpers', async ({ page }) => {
  await openBlankPage(page);

  const results = await page.evaluate(async () => {
    const [{ state }, dataMod] = await Promise.all([
      import('/js/state.js'),
      import('/js/data.js'),
    ]);
    const calls = [];
    const outcomes = {};
    const formerGlobalNames = [
      'saveImportedData', 'getFocusCardFingerprint', 'getActiveData', 'invalidateActiveDataCache',
      'applyUnitConversion', 'filterDatesByRange', 'recalculateHOMAIR', 'renderDateRangeFilter',
      'setDateRange', 'renderChartLayersDropdown', 'toggleChartLayersDropdown', 'setSuppOverlay',
      'setNoteOverlay', 'setPhaseOverlay', 'destroyAllCharts', 'countFlagged', 'getLatestValueIndex',
      'getAllFlaggedMarkers', 'statusIcon', 'detectTrendAlerts', 'getKeyTrendMarkers', 'switchUnitSystem',
      'toggleAltUnits', 'getEffectiveRange', 'getEffectiveRangeForDate', 'getEffectiveRangeLabelForDate',
      'getPhaseRefEnvelope', 'getContextRefEnvelope',
      'switchRangeMode', 'updateHeaderDates', 'updateHeaderRangeToggle', 'registerRefreshCallback',
    ];
    outcomes.dataApisStayModuleOnly = formerGlobalNames.every(name =>
      typeof dataMod[name] === 'function' && !(name in window));
    const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
    const profileId = 'data-browser-coverage-profile';
    const saved = {
      importedData: clone(state.importedData),
      currentProfile: state.currentProfile,
      currentView: state.currentView,
      unitSystem: state.unitSystem,
      showAltUnits: state.showAltUnits,
      dateRangeFilter: state.dateRangeFilter,
      profileSex: state.profileSex,
      phaseOverlayMode: state.phaseOverlayMode,
      rangeMode: state.rangeMode,
      activeDetailMarkerId: state._activeDetailMarkerId,
      preserveCategoryCardOrder: clone(state._preserveCategoryCardOrder),
      requestAnimationFrame: window.requestAnimationFrame,
      units: localStorage.getItem(`labcharts-${profileId}-units`),
      altUnits: localStorage.getItem(`labcharts-${profileId}-showAltUnits`),
      phaseOverlay: localStorage.getItem(`labcharts-${profileId}-phaseOverlay`),
      rangeModeStorage: localStorage.getItem(`labcharts-${profileId}-rangeMode`),
    };
    const previousDataRuntime = dataMod.configureDataRuntimeDeps({
      buildSidebar: data => calls.push(['buildSidebar', data?.dates?.length || 0]),
      navigate: (route, data) => calls.push(['navigate', route, data?.dates?.length || 0]),
      showDetailModal: id => calls.push(['showDetailModal', id]),
    });
    const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

    try {
      window.requestAnimationFrame = callback => {
        calls.push(['requestAnimationFrame']);
        callback();
        return 1;
      };

      state.currentProfile = profileId;
      state.currentView = 'metabolic';
      state.unitSystem = 'EU';
      state.showAltUnits = false;
      state.dateRangeFilter = 'all';
      state.profileSex = 'female';
      state.phaseOverlayMode = 'off';
      state.rangeMode = 'optimal';
      state._activeDetailMarkerId = 'metabolic_glucose';
      state.importedData = {
        ...state.importedData,
        entries: [
          {
            date: '2026-01-01',
            markers: {
              'biochemistry.glucose': 5.2,
              'diabetes.insulin': 8,
            },
          },
          {
            date: '2026-02-01',
            markers: {
              'biochemistry.glucose': 6.4,
              'diabetes.insulin': 9,
            },
          },
        ],
        notes: [{ date: '2026-02-01', text: 'note' }],
        supplements: [{ name: 'Magnesium', startDate: '2026-01-01' }],
        menstrualCycle: { periods: [{ startDate: '2025-12-28' }], cycleStatus: 'regular' },
      };

      const fixture = document.getElementById('fixture');
      fixture.innerHTML = dataMod.renderDateRangeFilter();
      const dateRangeBtn = fixture.querySelector('[data-lab-data-action="set-date-range"][data-lab-data-range="6m"]');
      dateRangeBtn?.click();
      outcomes.setDateRangePersistsStateAndUsesCurrentView = state.dateRangeFilter === '6m'
        && fixture.querySelectorAll('[onclick]').length === 0
        && calls.some(call => call[0] === 'buildSidebar')
        && calls.some(call => call[0] === 'navigate' && call[1] === 'metabolic');

      const layersHost = fixture;
      layersHost.innerHTML = dataMod.renderChartLayersDropdown();
      const leakedLayerClicks = [];
      document.addEventListener('click', () => leakedLayerClicks.push('click'));
      const layerTrigger = layersHost.querySelector('[data-lab-data-action="toggle-chart-layers"]');
      layerTrigger?.click();
      await wait(0);
      const dropdown = document.getElementById('chart-layers-dropdown');
      const trigger = document.querySelector('.chart-layers-trigger');
      const opened = dropdown?.classList.contains('open') === true && trigger?.getAttribute('aria-expanded') === 'true';
      const phaseCheckbox = layersHost.querySelector('[data-lab-data-change="set-phase-overlay"]');
      const phaseCallStart = calls.length;
      phaseCheckbox?.click();
      await wait(0);
      const phaseChanged = state.phaseOverlayMode === 'on'
        && localStorage.getItem(`labcharts-${profileId}-phaseOverlay`) === 'on'
        && calls.slice(phaseCallStart).some(call => call[0] === 'navigate' && call[1] === 'metabolic');
      const stayedOpenAfterLayerClick = dropdown?.classList.contains('open') === true
        && trigger?.getAttribute('aria-expanded') === 'true'
        && leakedLayerClicks.length === 0;
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      const closed = dropdown?.classList.contains('open') === false && trigger?.getAttribute('aria-expanded') === 'false';
      outcomes.chartLayersDropdownOpensAndClosesFromKeyboard = layersHost.querySelectorAll('[onclick],[onchange]').length === 0
        && opened
        && phaseChanged
        && stayedOpenAfterLayerClick
        && closed;

      const homaEntry = { markers: { 'biochemistry.glucose': 5, 'diabetes.insulin': 8 } };
      dataMod.recalculateHOMAIR(homaEntry);
      const staleHomaEntry = {
        markers: { 'diabetes.homaIR': 1.2 },
        markerSources: { 'diabetes.homaIR': { file: 'old.pdf' } },
      };
      dataMod.recalculateHOMAIR(staleHomaEntry);
      outcomes.recalculateHOMAIRCreatesAndRemovesCalculatedMarker = homaEntry.markers['diabetes.homaIR'] === Math.round((5 * 8) / 22.5 * 100) / 100
        && !Object.prototype.hasOwnProperty.call(staleHomaEntry.markers, 'diabetes.homaIR')
        && !Object.prototype.hasOwnProperty.call(staleHomaEntry.markerSources, 'diabetes.homaIR');

      const flagged = dataMod.getAllFlaggedMarkers({
        categories: {
          metabolic: {
            markers: {
              glucose: { name: 'Glucose', unit: 'mmol/L', values: [5.2, 7.8], refMin: 3.9, refMax: 5.5 },
              insulin: { name: 'Insulin', unit: 'mIU/L', values: [6, 7], refMin: 2, refMax: 25 },
            },
          },
        },
      });
      outcomes.getAllFlaggedMarkersUsesProvidedData = flagged.length === 1
        && flagged[0].id === 'metabolic_glucose'
        && flagged[0].status === 'high';

      dataMod.switchUnitSystem('US');
      outcomes.switchUnitSystemRefreshesDataHeaderRouteAndDetail = state.unitSystem === 'US'
        && localStorage.getItem(`labcharts-${profileId}-units`) === 'US'
        && document.getElementById('header-dates')?.textContent.includes('Dates:')
        && calls.some(call => call[0] === 'buildSidebar' && call[1] === 2)
        && calls.some(call => call[0] === 'navigate' && call[1] === 'metabolic')
        && calls.some(call => call[0] === 'showDetailModal' && call[1] === 'metabolic_glucose');

      const detailCallsBeforeAlt = calls.filter(call => call[0] === 'showDetailModal').length;
      dataMod.toggleAltUnits(true);
      dataMod.toggleAltUnits(true);
      dataMod.toggleAltUnits(false);
      const detailCallsAfterAlt = calls.filter(call => call[0] === 'showDetailModal').length;
      outcomes.toggleAltUnitsForcesPersistsAndRefreshesDetail = state.showAltUnits === false
        && localStorage.getItem(`labcharts-${profileId}-showAltUnits`) === 'off'
        && detailCallsAfterAlt === detailCallsBeforeAlt + 2;

      dataMod.updateHeaderRangeToggle();
      const prebuiltToggle = document.getElementById('header-range-toggle');
      const hasInitialRangeButtons = prebuiltToggle?.querySelectorAll('.range-toggle-btn').length === 3;
      calls.length = 0;
      const rangeModeBtn = prebuiltToggle?.querySelector('[data-lab-data-action="switch-range-mode"][data-lab-data-range="both"]');
      rangeModeBtn?.click();
      await wait(0);
      await wait(0);
      const activeBoth = document.querySelector('.range-toggle-btn[data-range="both"]');
      outcomes.switchRangeModeCapturesCardOrderAndRefreshesAfterPaint = hasInitialRangeButtons
        && prebuiltToggle?.querySelectorAll('[onclick]').length === 0
        && state.rangeMode === 'both'
        && localStorage.getItem(`labcharts-${profileId}-rangeMode`) === 'both'
        && activeBoth?.classList.contains('active') === true
        && activeBoth?.getAttribute('aria-pressed') === 'true'
        && state._preserveCategoryCardOrder?.categoryKey === 'metabolic'
        && state._preserveCategoryCardOrder?.markerKeys?.join('|') === 'glucose'
        && calls.some(call => call[0] === 'requestAnimationFrame')
        && calls.some(call => call[0] === 'buildSidebar')
        && calls.some(call => call[0] === 'navigate' && call[1] === 'metabolic')
        && calls.some(call => call[0] === 'showDetailModal' && call[1] === 'metabolic_glucose');
    } finally {
      state.importedData = saved.importedData;
      state.currentProfile = saved.currentProfile;
      state.currentView = saved.currentView;
      state.unitSystem = saved.unitSystem;
      state.showAltUnits = saved.showAltUnits;
      state.dateRangeFilter = saved.dateRangeFilter;
      state.profileSex = saved.profileSex;
      state.phaseOverlayMode = saved.phaseOverlayMode;
      state.rangeMode = saved.rangeMode;
      if (saved.activeDetailMarkerId === undefined) delete state._activeDetailMarkerId;
      else state._activeDetailMarkerId = saved.activeDetailMarkerId;
      if (saved.preserveCategoryCardOrder === undefined) delete state._preserveCategoryCardOrder;
      else state._preserveCategoryCardOrder = saved.preserveCategoryCardOrder;
      dataMod.configureDataRuntimeDeps(previousDataRuntime);
      if (saved.requestAnimationFrame) window.requestAnimationFrame = saved.requestAnimationFrame;
      else delete window.requestAnimationFrame;
      if (saved.units == null) localStorage.removeItem(`labcharts-${profileId}-units`);
      else localStorage.setItem(`labcharts-${profileId}-units`, saved.units);
      if (saved.altUnits == null) localStorage.removeItem(`labcharts-${profileId}-showAltUnits`);
      else localStorage.setItem(`labcharts-${profileId}-showAltUnits`, saved.altUnits);
      if (saved.phaseOverlay == null) localStorage.removeItem(`labcharts-${profileId}-phaseOverlay`);
      else localStorage.setItem(`labcharts-${profileId}-phaseOverlay`, saved.phaseOverlay);
      if (saved.rangeModeStorage == null) localStorage.removeItem(`labcharts-${profileId}-rangeMode`);
      else localStorage.setItem(`labcharts-${profileId}-rangeMode`, saved.rangeModeStorage);
    }

    return outcomes;
  });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});

test('data browser coverage applies sourced phase ranges only to predictable natural cycles', async ({ page }) => {
  await openBlankPage(page);

  const results = await page.evaluate(async () => {
    const [{ state }, dataMod] = await Promise.all([
      import('/js/state.js'),
      import('/js/data.js'),
    ]);
    const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
    const saved = {
      importedData: clone(state.importedData),
      profileSex: state.profileSex,
      unitSystem: state.unitSystem,
    };
    const periods = [
      { startDate: '2025-12-01', endDate: '2025-12-05' },
      { startDate: '2025-12-29', endDate: '2026-01-02' },
    ];
    const cycle = {
      cycleStatus: 'regular',
      cycleLength: 28,
      periodLength: 5,
      regularity: 'regular',
      contraceptive: '',
      periods,
    };

    try {
      state.profileSex = 'female';
      state.unitSystem = 'EU';
      state.importedData = {
        ...state.importedData,
        entries: [
          {
            date: '2025-10-01',
            context: {
              cycleDay: 10,
              cyclePhase: 'follicular',
              cyclePhaseDetail: 'late_follicular',
              cyclePhaseSource: 'recorded',
            },
            markers: { 'hormones.estradiol': 300, 'hormones.progesterone': 0.6 },
          },
          { date: '2025-12-05', markers: { 'hormones.estradiol': 200, 'hormones.progesterone': 1.5 } },
          { date: '2026-01-15', markers: { 'hormones.estradiol': 500, 'hormones.progesterone': 20 } },
        ],
        menstrualCycle: cycle,
      };

      const regular = dataMod.getActiveData();
      const estradiol = regular.categories.hormones.markers.estradiol;
      const progesterone = regular.categories.hormones.markers.progesterone;
      const recordedFollicularE2 = estradiol.phaseRefRanges?.[0];
      const menstrualE2 = estradiol.phaseRefRanges?.[1];
      const lutealE2 = estradiol.phaseRefRanges?.[2];
      const menstrualP4 = progesterone.phaseRefRanges?.[1];
      const lutealP4 = progesterone.phaseRefRanges?.[2];

      state.unitSystem = 'US';
      const usMenstrualE2 = dataMod.getActiveData().categories.hormones.markers.estradiol.phaseRefRanges?.[1];

      state.unitSystem = 'EU';
      state.importedData = {
        ...state.importedData,
        menstrualCycle: { ...cycle, regularity: 'irregular' },
      };
      const irregular = dataMod.getActiveData().categories.hormones.markers.estradiol;

      state.importedData = {
        ...state.importedData,
        menstrualCycle: { ...cycle, cycleStatus: 'perimenopause' },
      };
      const perimenopause = dataMod.getActiveData().categories.hormones.markers.estradiol;

      state.importedData = {
        ...state.importedData,
        menstrualCycle: { ...cycle, contraceptive: 'combined pill' },
      };
      const hormonalContraception = dataMod.getActiveData().categories.hormones.markers.estradiol;

      return {
        regularRanges: menstrualE2?.min === 46 && menstrualE2?.max === 609
          && lutealE2?.min === 161 && lutealE2?.max === 775
          && menstrualP4?.min === 0.32 && menstrualP4?.max === 2.86
          && lutealP4?.min === 5.72 && lutealP4?.max === 76,
        regularMetadata: menstrualE2?.label === 'Predicted menstrual range'
          && menstrualE2?.source === 'Labcorp 004515 (Roche cobas ECLIA)'
          && dataMod.getEffectiveRangeLabelForDate(estradiol, 1) === 'Predicted menstrual range',
        recordedDrawContextWinsWithoutHistoricalPeriodCoverage:
          recordedFollicularE2?.label === 'Follicular range'
          && recordedFollicularE2?.phaseSource === 'recorded'
          && estradiol.phaseDisplayLabels?.[0] === 'Late follicular'
          && estradiol.phaseCycleDays?.[0] === 10
          && estradiol.phaseSources?.[0] === 'recorded',
        usConversionPreservesMetadata: usMenstrualE2?.min === Number((46 * 0.2724).toPrecision(4))
          && usMenstrualE2?.max === Number((609 * 0.2724).toPrecision(4))
          && usMenstrualE2?.label === menstrualE2?.label
          && usMenstrualE2?.source === menstrualE2?.source,
        uncertainCyclesSuppressed: irregular.phaseRefRanges?.[0]?.phaseSource === 'recorded'
          && irregular.phaseRefRanges.slice(1).every(range => range == null)
          && !perimenopause.phaseRefRanges
          && !hormonalContraception.phaseRefRanges,
      };
    } finally {
      state.importedData = saved.importedData;
      state.profileSex = saved.profileSex;
      state.unitSystem = saved.unitSystem;
      dataMod.invalidateActiveDataCache();
    }
  });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});
