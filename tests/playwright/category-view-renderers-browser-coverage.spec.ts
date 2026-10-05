import { createBlankPage } from '../helpers/browser-blank-page.js';
import { expect, test } from './coverage-fixture.js';

const moduleUrl = (path:string) => `${path}?categoryViewRendererCoverage=${Date.now()}-${Math.random().toString(36).slice(2)}`;

const openBlankPage = createBlankPage({
  path: "/category-view-renderers-browser-coverage", status: 200, body: '<!doctype html><html><head><link rel="stylesheet" href="/css/category-views.css"></head><body><main id="fixture"></main></body></html>',
});

test('category view renderers browser coverage exercises chart table heatmap and fatty-acid markup', async ({ page }) => {
  await openBlankPage(page);

  const results = await page.evaluate(async ({ renderersUrl }) => {
    const [renderers, { state }] = await Promise.all([
      ((import(renderersUrl) as Promise<unknown>) as Promise<Pick<typeof import("../../js/category-view-renderers.js"), "renderChartCard" | "renderScrollableTableShell" | "renderTableColgroup" | "renderTableView" | "renderHeatmapView" | "renderFattyAcidsView" | "renderFattyAcidsCharts"> >),
      import('/js/state.js'),
    ]);
    const outcomes:Record<string,unknown> = {};
    const fixture = document.getElementById('fixture');
    const saved = {
      rangeMode: state.rangeMode,
      markerRegistry: state.markerRegistry,
      chartInstances: state.chartInstances,
      Chart: (window as unknown as {Chart?:unknown}).Chart,
    };
    const dateLabels = ['Jan 1', 'Feb 1', 'Mar 1', 'Apr 1', 'May 1'];
    const dates = ['2026-01-01', '2026-02-01', '2026-03-01', '2026-04-01', '2026-05-01'];
    const apoBMarker = {
      name: 'ApoB <script>',
      unit: 'mg/dL',
      values: [80, null, 130, 110, 90],
      refMin: 60,
      refMax: 100,
      optimalMin: 60,
      optimalMax: 90,
    };
    const category = {
      singleDate: false,
      markers: {
        apob: apoBMarker,
        hdl: {
          name: 'HDL',
          unit: 'mg/dL',
          values: [40, 42, 38, 41, 45],
          refMin: 40,
          refMax: 60,
        },
        empty: {
          name: 'Empty Marker',
          unit: '',
          values: [null, null, null, null, null],
          refMin: null,
          refMax: null,
        },
      },
    };

    try {
      state.rangeMode = 'both';
      state.markerRegistry = {};
      state.chartInstances = {};

      fixture!.innerHTML = renderers.renderChartCard('lipids_apob', apoBMarker, dateLabels, dates);
      const card = fixture!.querySelector<HTMLElement>('.chart-card');
      const cardMain = card?.querySelector<HTMLElement>('.chart-card-main');
      outcomes.chartCardEscapesMarkerStoresRegistryAndShowsLatest =
        state.markerRegistry.lipids_apob === apoBMarker
        && card?.getAttribute('role') == null
        && cardMain?.getAttribute('role') === 'button'
        && cardMain!.getAttribute('tabindex') === '0'
        && cardMain!.getAttribute('aria-label')?.includes('ApoB <script>. Normal. Latest 90 mg/dL, May 1.')
        && card!.getAttribute('data-marker-detail-action') === 'show-detail-modal'
        && card!.getAttribute('data-marker-detail-id') === 'lipids_apob'
        && cardMain!.getAttribute('data-marker-detail-action') === 'show-detail-modal'
        && !card!.hasAttribute('onclick')
        && card!.querySelector<HTMLElement>('.chart-card-title-text')?.textContent === 'ApoB <script>'
        && card!.querySelector<HTMLElement>('.chart-card-latest-value')?.textContent === '90'
        && card!.querySelector<HTMLElement>('.chart-card-latest-unit')?.textContent === 'mg/dL'
        && card!.querySelector<HTMLElement>('canvas')?.getAttribute('aria-hidden') === 'true'
        && !card!.querySelector<HTMLElement>('.chart-card-unit')
        && card!.querySelector<HTMLElement>('.chart-card-snapshot-meta')?.textContent === 'May 1'
        && card!.querySelectorAll<HTMLElement>('.chart-value-item').length === 4
        && card!.querySelector<HTMLElement>('.chart-values')?.getAttribute('aria-label') === 'Recent results'
        && card!.querySelector<HTMLElement>('.chart-values-label')?.textContent === 'Recent results'
        && [...card!.querySelectorAll<HTMLElement>('.chart-value-date')].map(el => el.textContent).join('|') === 'Jan 1|Mar 1|Apr 1|May 1'
        && ![...card!.querySelectorAll<HTMLElement>('.chart-value-date')].some(el => el.textContent === 'Feb 1')
        && !card!.querySelector<HTMLElement>('.chart-value-num.val-missing')
        && !card!.querySelector<HTMLElement>('.chart-card-range, .chart-ref-range')
        && [...card!.querySelectorAll<HTMLElement>('.chart-card-range-row > span')].map(el => el.textContent).join('|') === 'Reference|Optimal'
        && [...card!.querySelectorAll<HTMLElement>('.chart-card-range-row > strong')].map(el => el.textContent).join('|') === '60 – 100 mg/dL|60 – 90 mg/dL'
        && card!.querySelector<HTMLElement>('#chart-rec-lipids_apob')
        && !card!.querySelector<HTMLElement>('script');

      state.rangeMode = 'optimal';
      const phaseMarker = {
        name: 'Progesterone', unit: 'nmol/L', values: [17],
        refMin: 0.18, refMax: 75.9, optimalMin: 14, optimalMax: 36,
        phaseLabels: ['luteal'], phaseRefRanges: [{ min: 20, max: 30 }],
      };
      fixture!.innerHTML = renderers.renderChartCard('hormones_progesterone', phaseMarker, ['May 2026'], ['2026-05-20']);
      const phaseCard = fixture!.querySelector<HTMLElement>('.chart-card');
      outcomes.chartCardStatusAndDisplayedRangeUseSamePhaseBounds =
        phaseCard?.classList.contains('chart-card-low')
        && phaseCard!.querySelector<HTMLElement>('.chart-card-status')?.textContent!.includes('Low')
        && phaseCard!.querySelector<HTMLElement>('.chart-card-range-row > span')?.textContent === 'Luteal range'
        && phaseCard!.querySelector<HTMLElement>('.chart-card-range-row > strong')?.textContent === '20 – 30 nmol/L'
        && phaseCard!.querySelector<HTMLElement>('.chart-card-main')?.getAttribute('aria-label')?.includes('Luteal range 20 – 30 nmol/L');

      state.rangeMode = 'reference';
      const guidanceMarker = {
        name: 'FIB-4 Index', unit: '', values: [1.7], refMin: 0, refMax: 1.3,
        rangePolicy: 'guidance', contextRefRanges: [{ min: 0, max: 2 }],
        contextRangeLabels: ['AASLD threshold (65+)'],
      };
      fixture!.innerHTML = renderers.renderChartCard('calculatedRatios_fib4Index', guidanceMarker, ['May 2026'], ['2026-05-20']);
      const guidanceCard = fixture!.querySelector<HTMLElement>('.chart-card');
      const guidanceCardOk =
        guidanceCard?.classList.contains('chart-card-normal')
        && guidanceCard!.querySelector<HTMLElement>('.chart-card-status')?.textContent!.includes('Normal')
        && guidanceCard!.querySelector<HTMLElement>('.chart-card-range-row > span')?.textContent === 'AASLD threshold (65+)'
        && guidanceCard!.querySelector<HTMLElement>('.chart-card-range-row > strong')?.textContent === '0 – 2';
      outcomes.chartCardLabelsContextualGuidanceWithoutCallingItALabReference = guidanceCardOk || {
        className: guidanceCard?.className,
        status: guidanceCard?.querySelector<HTMLElement>('.chart-card-status')?.textContent,
        label: guidanceCard?.querySelector<HTMLElement>('.chart-card-range-row > span')?.textContent,
        value: guidanceCard?.querySelector<HTMLElement>('.chart-card-range-row > strong')?.textContent,
      };

      state.rangeMode = 'both';
      const datedOptimalMarker = {
        name: 'Testosterone', unit: 'nmol/L', values: [12], refMin: 8.64, refMax: 29,
        optimalMin: 15, optimalMax: 25,
        contextOptimalRanges: [{ min: 9.8, max: 15.8 }],
        contextOptimalRangeLabels: ['Lower-mortality cohort band (70–89)'],
      };
      fixture!.innerHTML = renderers.renderChartCard('hormones_testosterone', datedOptimalMarker, ['May 2026'], ['2026-05-20']);
      const datedOptimalRows = [...fixture!.querySelectorAll<HTMLElement>('.chart-card-range-row')];
      const datedOptimalOk = datedOptimalRows.length === 2
        && datedOptimalRows[0]!.querySelector<HTMLElement>('span')?.textContent === 'Reference'
        && datedOptimalRows[0]!.querySelector<HTMLElement>('strong')?.textContent === '8.64 – 29 nmol/L'
        && datedOptimalRows[1]!.querySelector<HTMLElement>('span')?.textContent === 'Lower-mortality cohort band (70–89)'
        && datedOptimalRows[1]!.querySelector<HTMLElement>('strong')?.textContent === '9.80 – 15.8 nmol/L';
      outcomes.chartCardShowsDatedOptimalGuidanceBesideReference = datedOptimalOk || {
        rows: datedOptimalRows.map(row => ({
          label: row.querySelector<HTMLElement>('span')?.textContent,
          value: row.querySelector<HTMLElement>('strong')?.textContent,
        })),
      };

      fixture!.style.width = '360px';
      state.rangeMode = 'reference';
      fixture!.innerHTML = renderers.renderChartCard('custom_pyruvicAcid', {
        name: 'Pyruvic Acid', unit: 'mmol/mol creatinine', values: [3], refMin: 7, refMax: 32,
      }, ['May 2023'], ['2023-05-20']);
      const longUnitSnapshot = fixture!.querySelector<HTMLElement>('.chart-card-snapshot');
      const longUnitMeasurement = fixture!.querySelector<HTMLElement>('.chart-card-latest-measurement');
      const longUnitRange = fixture!.querySelector<HTMLElement>('.chart-card-snapshot-side');
      const longUnitSnapshotRect = longUnitSnapshot?.getBoundingClientRect();
      const longUnitMeasurementRect = longUnitMeasurement?.getBoundingClientRect();
      const longUnitRangeRect = longUnitRange?.getBoundingClientRect();
      const longUnitTextNodes = [
        fixture!.querySelector<HTMLElement>('.chart-card-latest-unit'),
        fixture!.querySelector<HTMLElement>('.chart-card-range-row > strong'),
      ];
      outcomes.chartCardStacksLongUnitsWithoutOverflowing =
        longUnitSnapshot?.classList.contains('chart-card-snapshot-stacked')
        && !!longUnitSnapshotRect
        && !!longUnitMeasurementRect
        && !!longUnitRangeRect
        && longUnitMeasurementRect.bottom <= longUnitRangeRect.top + 0.5
        && longUnitTextNodes.every(node => {
          const rect = node?.getBoundingClientRect();
          return !!node && !!rect
            && rect.left >= longUnitSnapshotRect.left - 0.5
            && rect.right <= longUnitSnapshotRect.right + 0.5
            && node.scrollWidth <= node.clientWidth + 1;
        });

      fixture!.innerHTML = renderers.renderChartCard('lipids_apob', apoBMarker, dateLabels, dates);
      outcomes.chartCardKeepsNormalUnitsInCompactLayout =
        !fixture!.querySelector<HTMLElement>('.chart-card-snapshot')?.classList.contains('chart-card-snapshot-stacked')
        && fixture!.querySelector<HTMLElement>('.chart-card-latest-unit')?.textContent === 'mg/dL';
      fixture!.style.width = '';

      fixture!.style.width = '240px';
      fixture!.innerHTML = renderers.renderChartCard('calculatedRatios_crpHdlRatio', {
        name: 'hs-CRP/HDL-C Ratio', unit: '', values: [0.0001, 2], refMin: 0, refMax: 0.05,
      }, ['April 2026', 'May 2026'], ['2026-04-20', '2026-05-20']);
      const narrowCard = fixture!.querySelector<HTMLElement>('.chart-card');
      const narrowTrend = narrowCard?.querySelector<HTMLElement>('.chart-card-trend');
      const narrowCardRect = narrowCard?.getBoundingClientRect();
      const narrowTrendRect = narrowTrend?.getBoundingClientRect();
      outcomes.chartCardContainsLargeTrendPercentageAtNarrowWidth =
        narrowTrend?.textContent!?.includes('%')
        && narrowTrendRect!.left >= narrowCardRect!.left
        && narrowTrendRect!.right <= narrowCardRect!.right + 0.5;
      fixture!.style.width = '';

      const unratedMarker = { name: 'Unrated', unit: 'u', values: [1.2], refMin: null, refMax: null };
      fixture!.innerHTML = renderers.renderChartCard('custom_unrated', unratedMarker, ['May 2026'], ['2026-05-20']);
      const unratedCard = fixture!.querySelector<HTMLElement>('.chart-card');
      outcomes.chartCardDoesNotCallAValueNormalWithoutARange =
        unratedCard?.classList.contains('chart-card-unrated')
        && unratedCard!.querySelector<HTMLElement>('.chart-card-status')?.textContent === 'No range'
        && unratedCard!.querySelector<HTMLElement>('.chart-card-range-row > strong')?.textContent === 'Not set'
        && !unratedCard!.querySelector<HTMLElement>('.chart-card-range-unit')
        && unratedCard!.querySelector<HTMLElement>('.chart-value-num')?.classList.contains('val-unrated');

      fixture!.innerHTML = renderers.renderChartCard('lipids_duplicate_dates', {
        ...apoBMarker,
        name: 'Duplicate month dates',
        values: [80, 90],
      }, ['May 2026', 'May 2026'], ['2026-05-01', '2026-05-20']);
      outcomes.chartCardDisambiguatesMultipleResultsInTheSameMonth =
        [...fixture!.querySelectorAll<HTMLElement>('.chart-value-date')].map(el => el.textContent).join('|') === 'May 1|May 20'
        && fixture!.querySelector<HTMLElement>('.chart-card-snapshot-meta')?.textContent === 'May 20, 2026';

      state.rangeMode = 'both';
      outcomes.chartCardRejectsUnsafeIds =
        renderers.renderChartCard('lipids_bad"id', apoBMarker, dateLabels) === '';

      fixture!.innerHTML = renderers.renderScrollableTableShell(
        'tiny',
        'tiny-wrap',
        'tiny-table',
        renderers.renderTableColgroup(['safe-col', 'bad" onclick="alert(1)']),
        '<tr><th>A</th></tr>',
        '<tr><td>B</td></tr>',
        120
      );
      const tinyShell = fixture!.querySelector<HTMLElement>('.gb-table-shell-tiny');
      const tinyScroll = fixture!.querySelector<HTMLElement>('.tiny-wrap');
      const tinyTable = tinyScroll!.querySelector<HTMLElement>('table');
      tinyScroll!.style.width = '40px';
      tinyScroll!.style.overflow = 'auto';
      tinyTable!.style.width = '240px';
      tinyScroll!.scrollLeft = 42;
      tinyScroll!.dispatchEvent(new Event('scroll'));
      const syncedScroll = tinyShell?.style.getPropertyValue('--gb-table-scroll-x');
      outcomes.scrollableTableShellClampsWidthEscapesColsAndSyncsScroll =
        tinyShell?.style.getPropertyValue('--gb-table-min-width') === '660px'
        && tinyScroll!.hasAttribute('data-gb-table-scroll-sync')
        && !tinyScroll!.hasAttribute('onscroll')
        && syncedScroll === `${tinyScroll!.scrollLeft}px`
        && tinyScroll!.scrollLeft > 0
        && fixture!.querySelectorAll<HTMLElement>('col').length === 4
        && !fixture!.querySelector<HTMLElement>('col[onclick]');

      fixture!.innerHTML = renderers.renderTableView(category, dateLabels, 'lipids', dates);
      const tableText = fixture!.textContent || '';
      const emptyValueCell = fixture!.querySelector<HTMLElement>('.data-table .value-cell.val-missing[title]');
      outcomes.tableViewFiltersEmptyMarkersEscapesNamesAndAddsManualEntryCells =
        !!fixture!.querySelector<HTMLElement>('.gb-table-shell-data')
        && tableText.includes('ApoB <script>')
        && !tableText.includes('Empty Marker')
        && !fixture!.querySelector<HTMLElement>('script')
        && !fixture!.innerHTML.includes('onclick=')
        && emptyValueCell?.getAttribute('data-marker-detail-action') === 'open-manual-entry'
        && emptyValueCell!.getAttribute('data-marker-detail-id') === 'lipids_apob'
        && emptyValueCell!.getAttribute('data-marker-detail-date') === '2026-02-01';

      fixture!.innerHTML = renderers.renderTableView({ singleDate: false, markers: {} }, dateLabels, 'empty', dates);
      outcomes.tableViewEmptyStateExplainsNoData =
        fixture!.textContent!.includes('No data yet for this category');

      state.markerRegistry = {};
      fixture!.innerHTML = renderers.renderHeatmapView(category, dateLabels, 'lipids');
      const highHeatmapCell = fixture!.querySelector<HTMLElement>('.heatmap-high');
      const missingHeatmapCell = fixture!.querySelector<HTMLElement>('.heatmap-missing');
      outcomes.heatmapViewRegistersMarkersAndRendersStatusCells =
        state.markerRegistry.lipids_apob === apoBMarker
        && !!fixture!.querySelector<HTMLElement>('.gb-table-shell-heatmap')
        && highHeatmapCell?.textContent === '130'
        && missingHeatmapCell?.textContent?.charCodeAt(0) === 8212
        && highHeatmapCell!.getAttribute('data-marker-detail-action') === 'show-detail-modal'
        && highHeatmapCell!.getAttribute('data-marker-detail-id') === 'lipids_apob'
        && !fixture!.innerHTML.includes('onclick=')
        && highHeatmapCell!.getAttribute('aria-label')?.includes('ApoB <script> Mar 1: 130');

      fixture!.innerHTML = renderers.renderHeatmapView({ singleDate: false, markers: {} }, dateLabels, 'empty');
      outcomes.heatmapViewEmptyStateExplainsNoData =
        fixture!.textContent!.includes('No data yet for this category');

      state.rangeMode = 'optimal';
      const fattyAcids = {
        singleDate: '2026-06-01',
        markers: {
          omega3: {
            name: 'Omega 3 (EPA/DHA)',
            unit: '%',
            values: [7],
            refMin: 4,
            refMax: 12,
            optimalMin: 8,
            optimalMax: 12,
          },
          omega6: {
            name: 'Omega 6',
            unit: '%',
            values: [18],
            refMin: 6,
            refMax: 14,
            optimalMin: 6,
            optimalMax: 10,
          },
          'bad"id': {
            name: 'Unsafe',
            unit: '%',
            values: [1],
            refMin: 0,
            refMax: 2,
          },
        },
      };
      fixture!.innerHTML = renderers.renderFattyAcidsView(fattyAcids, 'fatty');
      outcomes.fattyAcidsViewRendersSafeCardsDateAndOptimalRanges =
        fixture!.querySelectorAll<HTMLElement>('.fa-card').length === 2
        && fixture!.textContent!.includes('June 1, 2026')
        && fixture!.textContent!.includes('Omega 3')
        && fixture!.textContent!.includes('Optimal: 8')
        && fixture!.textContent!.includes('12')
        && !fixture!.textContent!.includes('Unsafe')
        && fixture!.querySelector<HTMLElement>('.fa-card')?.getAttribute('data-marker-detail-action') === 'show-detail-modal'
        && fixture!.querySelector<HTMLElement>('.fa-card')?.getAttribute('data-marker-detail-id') === 'fatty_omega3'
        && !fixture!.innerHTML.includes('onclick=');
      outcomes.fattyAcidsViewRejectsUnsafeCategoryKey =
        renderers.renderFattyAcidsView(fattyAcids, 'bad"cat') === '';

      const chartCalls:{ctx:HTMLCanvasElement;config:{type?:unknown;data:{labels:unknown[];datasets:unknown[]}}}[] = [];
      (window as unknown as {Chart?:unknown}).Chart = class {
        constructor(ctx:HTMLCanvasElement, config:{type?:unknown;data:{labels:unknown[];datasets:unknown[]}}) {
          (this as {ctx?:unknown}).ctx = ctx;
          (this as {config?:unknown}).config = config;
          chartCalls.push(this as unknown as {ctx:HTMLCanvasElement;config:{type?:unknown;data:{labels:unknown[];datasets:unknown[]}}});
        }
      };
      fixture!.innerHTML = '<canvas id="chart-fa-bar"></canvas>';
      renderers.renderFattyAcidsCharts(fattyAcids);
      outcomes.fattyAcidsChartsBuildsStubbedChart =
        chartCalls.length === 1
        && chartCalls[0]!.ctx.id === 'chart-fa-bar'
        && chartCalls[0]!.config.type === 'bar'
        && chartCalls[0]!.config.data.labels.includes('Omega 3')
        && chartCalls[0]!.config.data.labels.includes('Omega 6')
        && chartCalls[0]!.config.data.labels.length === 2
        && !chartCalls[0]!.config.data.labels.includes('Unsafe')
        && chartCalls[0]!.config.data.datasets.length === 3
        && state.chartInstances['fa-bar'] === chartCalls[0]!;
    } finally {
      state.rangeMode = saved.rangeMode;
      state.markerRegistry = saved.markerRegistry;
      state.chartInstances = saved.chartInstances;
      if (saved.Chart === undefined) delete (window as unknown as {Chart?:unknown}).Chart;
      else (window as unknown as {Chart?:unknown}).Chart = saved.Chart;
    }

    return outcomes;
  }, {
    renderersUrl: moduleUrl('/js/category-view-renderers.js'),
  });

  const expectedOutcomeKeys = [
    'chartCardEscapesMarkerStoresRegistryAndShowsLatest',
    'chartCardStatusAndDisplayedRangeUseSamePhaseBounds',
    'chartCardLabelsContextualGuidanceWithoutCallingItALabReference',
    'chartCardShowsDatedOptimalGuidanceBesideReference',
    'chartCardStacksLongUnitsWithoutOverflowing',
    'chartCardKeepsNormalUnitsInCompactLayout',
    'chartCardContainsLargeTrendPercentageAtNarrowWidth',
    'chartCardDoesNotCallAValueNormalWithoutARange',
    'chartCardDisambiguatesMultipleResultsInTheSameMonth',
    'chartCardRejectsUnsafeIds',
    'scrollableTableShellClampsWidthEscapesColsAndSyncsScroll',
    'tableViewFiltersEmptyMarkersEscapesNamesAndAddsManualEntryCells',
    'tableViewEmptyStateExplainsNoData',
    'heatmapViewRegistersMarkersAndRendersStatusCells',
    'heatmapViewEmptyStateExplainsNoData',
    'fattyAcidsViewRendersSafeCardsDateAndOptimalRanges',
    'fattyAcidsViewRejectsUnsafeCategoryKey',
    'fattyAcidsChartsBuildsStubbedChart',
  ];
  expect(Object.keys(results)).toEqual(expectedOutcomeKeys);
  for (const [name, passed] of Object.entries(results)) {
    expect.soft(passed, name).toBe(true);
  }
});
