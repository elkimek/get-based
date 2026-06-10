import { expect, test } from './coverage-fixture.js';

const moduleUrl = (path) => `${path}?dataBrowserCoverage=${Date.now()}-${Math.random().toString(36).slice(2)}`;

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

  const results = await page.evaluate(async ({ dataUrl }) => {
    const dataMod = await import(dataUrl);
    const state = window._labState;
    const calls = [];
    const outcomes = {};
    const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
    const profileId = 'data-browser-coverage-profile';
    const saved = {
      importedData: clone(state.importedData),
      currentProfile: state.currentProfile,
      currentView: state.currentView,
      unitSystem: state.unitSystem,
      showAltUnits: state.showAltUnits,
      dateRangeFilter: state.dateRangeFilter,
      phaseOverlayMode: state.phaseOverlayMode,
      rangeMode: state.rangeMode,
      activeDetailMarkerId: state._activeDetailMarkerId,
      preserveCategoryCardOrder: clone(state._preserveCategoryCardOrder),
      buildSidebar: window.buildSidebar,
      navigate: window.navigate,
      showDetailModal: window.showDetailModal,
      requestAnimationFrame: window.requestAnimationFrame,
      units: localStorage.getItem(`labcharts-${profileId}-units`),
      altUnits: localStorage.getItem(`labcharts-${profileId}-showAltUnits`),
      phaseOverlay: localStorage.getItem(`labcharts-${profileId}-phaseOverlay`),
      rangeModeStorage: localStorage.getItem(`labcharts-${profileId}-rangeMode`),
    };
    const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

    try {
      window.buildSidebar = data => calls.push(['buildSidebar', data?.dates?.length || 0]);
      window.navigate = (route, data) => calls.push(['navigate', route, data?.dates?.length || 0]);
      window.showDetailModal = id => calls.push(['showDetailModal', id]);
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
              'hormones.insulin': 8,
            },
          },
          {
            date: '2026-02-01',
            markers: {
              'biochemistry.glucose': 6.4,
              'hormones.insulin': 9,
            },
          },
        ],
        notes: [{ date: '2026-02-01', text: 'note' }],
        supplements: [{ name: 'Magnesium', startDate: '2026-01-01' }],
        menstrualCycle: { periods: [{ startDate: '2025-12-28' }], cycleStatus: 'regular' },
      };

      dataMod.setDateRange('6m');
      outcomes.setDateRangePersistsStateAndUsesCurrentView = state.dateRangeFilter === '6m'
        && calls.some(call => call[0] === 'buildSidebar')
        && calls.some(call => call[0] === 'navigate' && call[1] === 'metabolic');

      const layersHost = document.getElementById('fixture');
      layersHost.innerHTML = dataMod.renderChartLayersDropdown();
      const stopCalls = [];
      dataMod.toggleChartLayersDropdown({ stopPropagation: () => stopCalls.push('stop') });
      await wait(0);
      const dropdown = document.getElementById('chart-layers-dropdown');
      const trigger = document.querySelector('.chart-layers-trigger');
      const opened = dropdown?.classList.contains('open') === true && trigger?.getAttribute('aria-expanded') === 'true';
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      const closed = dropdown?.classList.contains('open') === false && trigger?.getAttribute('aria-expanded') === 'false';
      outcomes.chartLayersDropdownOpensAndClosesFromKeyboard = stopCalls.length === 1
        && opened
        && closed;

      dataMod.setPhaseOverlay('on');
      outcomes.setPhaseOverlayPersistsAndNavigatesActiveCategory = state.phaseOverlayMode === 'on'
        && localStorage.getItem(`labcharts-${profileId}-phaseOverlay`) === 'on'
        && calls.some(call => call[0] === 'navigate' && call[1] === 'metabolic');

      const homaEntry = { markers: { 'biochemistry.glucose': 5, 'hormones.insulin': 8 } };
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
      dataMod.switchRangeMode('both');
      await wait(0);
      await wait(0);
      const activeBoth = document.querySelector('.range-toggle-btn[data-range="both"]');
      outcomes.switchRangeModeCapturesCardOrderAndRefreshesAfterPaint = hasInitialRangeButtons
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
      state.phaseOverlayMode = saved.phaseOverlayMode;
      state.rangeMode = saved.rangeMode;
      if (saved.activeDetailMarkerId === undefined) delete state._activeDetailMarkerId;
      else state._activeDetailMarkerId = saved.activeDetailMarkerId;
      if (saved.preserveCategoryCardOrder === undefined) delete state._preserveCategoryCardOrder;
      else state._preserveCategoryCardOrder = saved.preserveCategoryCardOrder;
      if (saved.buildSidebar) window.buildSidebar = saved.buildSidebar;
      else delete window.buildSidebar;
      if (saved.navigate) window.navigate = saved.navigate;
      else delete window.navigate;
      if (saved.showDetailModal) window.showDetailModal = saved.showDetailModal;
      else delete window.showDetailModal;
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
  }, { dataUrl: moduleUrl('/js/data.js') });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});
