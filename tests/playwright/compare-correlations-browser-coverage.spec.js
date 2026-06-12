import { expect, test } from './coverage-fixture.js';

function moduleUrl(path) {
  return `${path}?compareCorrelationsCoverage=${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

async function openBlankPage(page) {
  await page.route('**/compare-correlations-browser-coverage', route => route.fulfill({
    status: 200,
    contentType: 'text/html',
    body: `<!doctype html><html><head><style>
      :root {
        --bg-card: #111827;
        --text-primary: #f8fafc;
        --text-secondary: #cbd5e1;
        --text-muted: #94a3b8;
        --border: #334155;
        --chart-grid: #475569;
        --accent: #38bdf8;
        --accent-fill: rgba(56, 189, 248, 0.12);
        --chart-tooltip-bg: #020617;
        --green: #22c55e;
        --red: #ef4444;
        --yellow: #eab308;
      }
      .corr-chart { height: 240px; }
    </style></head><body><main id="main-content"></main></body></html>`,
  }));
  await page.goto('/compare-correlations-browser-coverage', { waitUntil: 'load' });
}

test('compare dates browser contract renders date controls table and updates state', async ({ page }) => {
  await openBlankPage(page);

  const results = await page.evaluate(async ({ compareUrl }) => {
    const compare = await import(compareUrl);
    const [dataModule, stateModule] = await Promise.all([
      import('/js/data.js'),
      import('/js/state.js'),
    ]);
    const { state } = stateModule;
    const outcomes = {};
    const originalImportedData = state.importedData;
    const originalCompareDate1 = state.compareDate1;
    const originalCompareDate2 = state.compareDate2;

    try {
      state.importedData = {
        entries: [
          {
            date: '2026-01-01',
            markers: {
              'biochemistry.glucose': 4.5,
              'lipids.ldl': 2.8,
              'lipids.hdl': 1.2,
              'proteins.hsCRP': 1.0,
            },
          },
          {
            date: '2026-02-01',
            markers: {
              'biochemistry.glucose': 6.2,
              'lipids.ldl': 2.3,
              'lipids.hdl': 1.5,
              'proteins.hsCRP': 0.8,
            },
          },
          {
            date: '2026-03-01',
            markers: {
              'biochemistry.glucose': 5.0,
              'lipids.ldl': 3.4,
              'lipids.hdl': 1.1,
              'proteins.hsCRP': 2.4,
            },
          },
        ],
        notes: [],
        supplements: [],
        customMarkers: {},
        markerNotes: {},
        markerValueNotes: {},
        changeHistory: [],
      };
      state.compareDate1 = null;
      state.compareDate2 = null;
      dataModule.invalidateActiveDataCache();

      compare.configureCompareCorrelationViews({
        renderTableColgroup: cols => `<colgroup data-cols="${cols.join('|')}"></colgroup>`,
        renderScrollableTableShell: (kind, wrapperClass, tableClass, colgroup, headHtml, bodyHtml) =>
          `<div class="${wrapperClass}" data-kind="${kind}"><table class="${tableClass}">${colgroup}<thead>${headHtml}</thead><tbody>${bodyHtml}</tbody></table></div>`,
        renderCategoryGlyph: (categoryKey, label = '') =>
          `<span data-glyph="${categoryKey}">${label}</span>`,
      });

      compare.showCompare();
      const select1 = document.getElementById('compare-select-1');
      const select2 = document.getElementById('compare-select-2');
      const rows = Array.from(document.querySelectorAll('#compare-results tbody tr'));

      outcomes.initialCompareControlsAndDefaults =
        document.querySelector('.category-header h2')?.textContent === 'Compare Dates'
        && select1?.value === '2026-01-01'
        && select2?.value === '2026-03-01'
        && document.querySelectorAll('#compare-select-1 option').length === 3
        && document.querySelector('.compare-swap-btn')?.getAttribute('aria-label') === 'Swap dates';
      outcomes.compareTableUsesInjectedShellAndRendersMarkers =
        document.querySelector('[data-kind="compare"] .compare-table')
        && document.querySelector('colgroup')?.getAttribute('data-cols')?.includes('gb-col-marker')
        && rows.some(row => row.textContent.includes('Glucose'))
        && rows.some(row => row.textContent.includes('LDL Cholesterol'))
        && !!document.querySelector('[data-glyph="biochemistry"]')
        && !!document.querySelector('.compare-improved');

      compare.setCompareDate1('2026-02-01');
      outcomes.setCompareDate1RebuildsTable =
        state.compareDate1 === '2026-02-01'
        && document.getElementById('compare-results')?.textContent.includes('6.2');
      compare.setCompareDate2('2026-01-01');
      outcomes.setCompareDate2RebuildsTable =
        state.compareDate2 === '2026-01-01'
        && document.getElementById('compare-results')?.textContent.includes('-1.7');

      compare.swapCompareDates();
      outcomes.swapUpdatesStateSelectsAndTable =
        state.compareDate1 === '2026-01-01'
        && state.compareDate2 === '2026-02-01'
        && select1?.value === '2026-01-01'
        && select2?.value === '2026-02-01'
        && document.getElementById('compare-results')?.textContent.includes('+1.7');

      state.compareDate1 = 'missing';
      compare.updateCompare();
      outcomes.invalidDateClearsResults = document.getElementById('compare-results')?.innerHTML === '';

      compare.showCompare({ dates: ['2026-01-01'], dateLabels: ['Jan 2026'], categories: {} });
      outcomes.notEnoughDataRendersEmptyState =
        document.querySelector('.empty-state h3')?.textContent === 'Not Enough Data';
    } finally {
      state.importedData = originalImportedData;
      state.compareDate1 = originalCompareDate1;
      state.compareDate2 = originalCompareDate2;
      dataModule.invalidateActiveDataCache();
      document.getElementById('main-content').innerHTML = '';
    }

    return outcomes;
  }, {
    compareUrl: moduleUrl('/js/compare-correlations.js'),
  });

  const expectedOutcomeKeys = [
    'initialCompareControlsAndDefaults',
    'compareTableUsesInjectedShellAndRendersMarkers',
    'setCompareDate1RebuildsTable',
    'setCompareDate2RebuildsTable',
    'swapUpdatesStateSelectsAndTable',
    'invalidDateClearsResults',
    'notEnoughDataRendersEmptyState',
  ];
  expect(Object.keys(results)).toEqual(expectedOutcomeKeys);
  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});

test('correlations browser contract filters markers toggles chips and builds chart config', async ({ page }) => {
  await openBlankPage(page);

  const results = await page.evaluate(async ({ compareUrl }) => {
    const compare = await import(compareUrl);
    const [dataModule, stateModule, schemaModule] = await Promise.all([
      import('/js/data.js'),
      import('/js/state.js'),
      import('/js/schema.js'),
    ]);
    const { state } = stateModule;
    const outcomes = {};
    const originalImportedData = state.importedData;
    const originalSelected = [...state.selectedCorrelationMarkers];
    const originalCharts = state.chartInstances;
    const originalChart = window.Chart;
    const chartCaptures = [];
    let destroyCount = 0;

    function ChartStub(canvas, config) {
      chartCaptures.push({ canvas, config });
      return {
        canvas,
        config,
        data: config.data,
        options: config.options,
        destroy() { destroyCount += 1; },
      };
    }

    try {
      window.Chart = ChartStub;
      state.importedData = {
        entries: [
          {
            date: '2026-01-01',
            markers: {
              'lipids.cholesterol': 4.5,
              'lipids.hdl': 1.2,
              'lipids.ldl': 2.8,
              'lipids.triglycerides': 1.1,
              'proteins.hsCRP': 1.0,
              'vitamins.vitaminD': 70,
              'electrolytes.calciumTotal': 2.30,
            },
          },
          {
            date: '2026-02-01',
            markers: {
              'lipids.cholesterol': 4.2,
              'lipids.hdl': 1.5,
              'lipids.ldl': 2.3,
              'lipids.triglycerides': 0.9,
              'proteins.hsCRP': 0.8,
              'vitamins.vitaminD': 82,
              'electrolytes.calciumTotal': 2.35,
            },
          },
          {
            date: '2026-03-01',
            markers: {
              'lipids.cholesterol': 5.1,
              'lipids.hdl': 1.1,
              'lipids.ldl': 3.4,
              'lipids.triglycerides': 1.7,
              'proteins.hsCRP': 2.4,
              'vitamins.vitaminD': 96,
              'electrolytes.calciumTotal': 2.42,
            },
          },
        ],
        notes: [],
        supplements: [],
        customMarkers: {},
        markerNotes: {},
        markerValueNotes: {},
        changeHistory: [],
      };
      state.selectedCorrelationMarkers = [];
      state.chartInstances = {};
      dataModule.invalidateActiveDataCache();

      compare.showCorrelations();
      const activeData = dataModule.getActiveData();
      const ldlMarker = activeData.categories.lipids.markers.ldl;
      const expectedLdlPct = ((2.3 - ldlMarker.refMin) / (ldlMarker.refMax - ldlMarker.refMin)) * 100;
      const optionCount = document.querySelectorAll('.corr-option').length;
      const dropdown = document.getElementById('corr-options');
      dropdown?.classList.remove('show');
      compare.showCorrelationDropdown();
      outcomes.showCorrelationDropdownOpensOptions = dropdown?.classList.contains('show') === true;
      dropdown?.classList.remove('show');
      document.getElementById('corr-search').value = 'vitamin';
      compare.filterCorrelationOptions();
      const vitaminOption = Array.from(document.querySelectorAll('.corr-option'))
        .find(option => option.dataset.key === 'vitamins.vitaminD');
      const glucoseOption = Array.from(document.querySelectorAll('.corr-option'))
        .find(option => option.dataset.key === 'biochemistry.glucose');
      outcomes.searchDropdownFiltersByMarkerOrCategory =
        optionCount > 20
        && document.getElementById('corr-options')?.classList.contains('show') === true
        && vitaminOption?.style.display === ''
        && glucoseOption?.style.display === 'none';

      compare.toggleCorrelationMarker('lipids.ldl');
      outcomes.singleMarkerRendersChipWithoutChart =
        state.selectedCorrelationMarkers.join(',') === 'lipids.ldl'
        && document.querySelectorAll('.corr-chip').length === 1
        && document.getElementById('corr-chart-container')?.style.display === 'none'
        && chartCaptures.length === 0;

      compare.toggleCorrelationMarker('proteins.hsCRP');
      const firstChart = chartCaptures.at(-1);
      const firstDataset = firstChart?.config?.data?.datasets?.[0];
      const tooltipLabel = firstChart?.config?.options?.plugins?.tooltip?.callbacks?.label({
        dataset: firstDataset,
        dataIndex: 1,
        parsed: { y: firstDataset?.data?.[1] },
      });
      outcomes.secondMarkerBuildsNormalizedChart =
        state.selectedCorrelationMarkers.length === 2
        && document.getElementById('corr-chart-container')?.style.display === 'block'
        && firstChart?.canvas?.id === 'chart-correlation'
        && firstChart.config.type === 'line'
        && firstChart.config.data.labels.join('|') === 'Jan 2026|Feb 2026|Mar 2026'
        && firstChart.config.data.datasets.length === 2
        && firstDataset.label === 'LDL Cholesterol'
        && Math.abs(firstDataset.data[1] - expectedLdlPct) < 0.001
        && String(tooltipLabel).includes('LDL Cholesterol')
        && String(tooltipLabel).includes('mmol')
        && firstChart.config.options.plugins.refBand.refMin === 0
        && firstChart.config.options.plugins.refBand.refMax === 100
        && firstChart.config.plugins.length === 3;

      const lipidPresetIndex = schemaModule.CORRELATION_PRESETS.findIndex(p => p.label === 'Lipid Panel');
      compare.applyCorrelationPreset(lipidPresetIndex);
      const presetChart = chartCaptures.at(-1);
      outcomes.presetRendersFourChipsAndRefreshesChart =
        lipidPresetIndex !== -1
        && state.selectedCorrelationMarkers.join('|') === 'lipids.cholesterol|lipids.hdl|lipids.ldl|lipids.triglycerides'
        && document.querySelectorAll('.corr-chip').length === 4
        && presetChart?.config?.data?.datasets?.length === 4
        && presetChart.config.data.datasets.some(dataset => dataset.label === 'Triglycerides');

      compare.toggleCorrelationMarker('lipids.hdl');
      compare.toggleCorrelationMarker('lipids.ldl');
      compare.toggleCorrelationMarker('lipids.triglycerides');
      outcomes.removingBelowTwoHidesChartAndDestroysInstance =
        state.selectedCorrelationMarkers.join('|') === 'lipids.cholesterol'
        && document.getElementById('corr-chart-container')?.style.display === 'none'
        && destroyCount >= 1
        && state.chartInstances.correlation === undefined;

      state.selectedCorrelationMarkers = [
        'lipids.cholesterol',
        'lipids.hdl',
        'lipids.ldl',
        'lipids.triglycerides',
        'proteins.hsCRP',
        'vitamins.vitaminD',
        'electrolytes.calciumTotal',
        'biochemistry.glucose',
      ];
      compare.toggleCorrelationMarker('hormones.testosterone');
      outcomes.selectionLimitStopsNinthMarker =
        state.selectedCorrelationMarkers.length === 8
        && !state.selectedCorrelationMarkers.includes('hormones.testosterone');
    } finally {
      if (originalChart === undefined) delete window.Chart;
      else window.Chart = originalChart;
      state.importedData = originalImportedData;
      state.selectedCorrelationMarkers = originalSelected;
      state.chartInstances = originalCharts;
      dataModule.invalidateActiveDataCache();
      document.getElementById('main-content').innerHTML = '';
    }

    return outcomes;
  }, {
    compareUrl: moduleUrl('/js/compare-correlations.js'),
  });

  const expectedOutcomeKeys = [
    'showCorrelationDropdownOpensOptions',
    'searchDropdownFiltersByMarkerOrCategory',
    'singleMarkerRendersChipWithoutChart',
    'secondMarkerBuildsNormalizedChart',
    'presetRendersFourChipsAndRefreshesChart',
    'removingBelowTwoHidesChartAndDestroysInstance',
    'selectionLimitStopsNinthMarker',
  ];
  expect(Object.keys(results)).toEqual(expectedOutcomeKeys);
  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});
