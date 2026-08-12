import { expect, test } from './coverage-fixture.js';

const moduleUrl = (path) => `${path}?chartsBrowserCoverage=${Date.now()}-${Math.random().toString(36).slice(2)}`;

async function openBlankPage(page) {
  await page.route('**/charts-browser-coverage', route => route.fulfill({
    contentType: 'text/html',
    body: '<!doctype html><html><head></head><body><main id="fixture"></main></body></html>',
  }));
  await page.goto('/charts-browser-coverage', { waitUntil: 'load' });
}

test('charts browser coverage exercises annotation supplement and theme callbacks', async ({ page }) => {
  await openBlankPage(page);

  const results = await page.evaluate(async ({ chartsUrl }) => {
    const [{ state }, charts, { getLabDateRangeBounds }] = await Promise.all([
      import('/js/state.js'),
      import(chartsUrl),
      import('/js/lab-date-range.js'),
    ]);
    const outcomes = {};

    const rootStyle = document.documentElement.style;
    rootStyle.setProperty('--chart-tooltip-bg', '#101820');
    rootStyle.setProperty('--text-primary', '#f8fafc');
    rootStyle.setProperty('--text-secondary', '#cbd5e1');
    rootStyle.setProperty('--text-muted', '#94a3b8');
    rootStyle.setProperty('--bg-card', '#111827');
    rootStyle.setProperty('--border', '#334155');
    rootStyle.setProperty('--chart-grid', '#475569');
    rootStyle.setProperty('--accent', '#38bdf8');
    rootStyle.setProperty('--accent-fill', 'rgba(56, 189, 248, 0.12)');
    rootStyle.setProperty('--green', '#22c55e');
    rootStyle.setProperty('--red', '#ef4444');
    rootStyle.setProperty('--yellow', '#eab308');

    const makeCtx = () => {
      const calls = [];
      const ctx = {
        calls,
        save: () => calls.push(['save']),
        restore: () => calls.push(['restore']),
        beginPath: () => calls.push(['beginPath']),
        arc: (...args) => calls.push(['arc', ...args]),
        fill: () => calls.push(['fill']),
        stroke: () => calls.push(['stroke']),
        fillRect: (...args) => calls.push(['fillRect', ...args]),
        moveTo: (...args) => calls.push(['moveTo', ...args]),
        lineTo: (...args) => calls.push(['lineTo', ...args]),
        setLineDash: (...args) => calls.push(['setLineDash', ...args]),
        roundRect: (...args) => calls.push(['roundRect', ...args]),
        measureText: text => ({ width: String(text).length * 6 }),
        fillText: (...args) => calls.push(['fillText', ...args]),
        createLinearGradient: (...args) => {
          const stops = [];
          calls.push(['createLinearGradient', ...args]);
          return {
            stops,
            addColorStop: (offset, color) => stops.push([offset, color]),
          };
        },
        set fillStyle(value) { calls.push(['fillStyle', value]); this._fillStyle = value; },
        get fillStyle() { return this._fillStyle; },
        set strokeStyle(value) { calls.push(['strokeStyle', value]); this._strokeStyle = value; },
        get strokeStyle() { return this._strokeStyle; },
        set lineWidth(value) { calls.push(['lineWidth', value]); this._lineWidth = value; },
        get lineWidth() { return this._lineWidth; },
        set font(value) { calls.push(['font', value]); this._font = value; },
        get font() { return this._font; },
        set textAlign(value) { calls.push(['textAlign', value]); this._textAlign = value; },
        get textAlign() { return this._textAlign; },
        set textBaseline(value) { calls.push(['textBaseline', value]); this._textBaseline = value; },
        get textBaseline() { return this._textBaseline; },
      };
      return ctx;
    };

    const xCategory = {
      type: 'category',
      getPixelForValue: value => 40 + Number(value) * 80,
    };
    const xTime = {
      type: 'time',
      getPixelForValue: value => {
        const start = new Date('2026-01-01T00:00:00').getTime();
        const end = new Date('2026-03-01T00:00:00').getTime();
        return 20 + ((Number(value) - start) / (end - start)) * 200;
      },
    };
    const chartArea = { left: 20, right: 240, top: 30, bottom: 180 };

    const noteChart = {
      data: {
        labels: [
          new Date('2026-01-01T00:00:00').toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
          new Date('2026-02-01T00:00:00').toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
          new Date('2026-03-01T00:00:00').toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
        ],
      },
      options: {
        plugins: {
          noteAnnotations: {
            chartDates: ['2026-01-01', '2026-02-01', '2026-03-01'],
            notes: [
              { date: '2026-01-01', text: 'Exact label note' },
              { date: '2026-01-16', text: 'Interpolated note with a long label that should truncate in the tooltip' },
              { date: '2026-04-01', text: 'Out of range' },
            ],
          },
        },
      },
      chartArea,
      scales: { x: xCategory },
      canvas: document.createElement('canvas'),
      ctx: makeCtx(),
    };
    const noteDots = charts.noteAnnotationPlugin._getNoteDots(noteChart);
    noteChart._hoveredNoteDot = noteDots[1];
    charts.noteAnnotationPlugin.afterDatasetsDraw(noteChart);
    const noteMove = { event: { type: 'mousemove', x: noteDots[0].x, y: noteDots[0].y } };
    charts.noteAnnotationPlugin.afterEvent(noteChart, noteMove);
    const noteLeave = { event: { type: 'mousemove', x: 1, y: 1 } };
    charts.noteAnnotationPlugin.afterEvent(noteChart, noteLeave);
    const timeDots = charts.noteAnnotationPlugin._getNoteDots({
      ...noteChart,
      scales: { x: xTime },
      options: {
        plugins: {
          noteAnnotations: {
            chartDates: ['2026-01-01', '2026-02-01', '2026-03-01'],
            notes: [{ date: '2026-02-01', text: 'Time dot' }],
          },
        },
      },
    });
    outcomes.notePluginDrawsHoverableCategoryAndTimeDots = noteDots.length === 2
      && timeDots.length === 1
      && noteMove.changed === true
      && noteLeave.changed === true
      && noteChart.canvas.style.cursor === ''
      && noteChart.ctx.calls.some(call => call[0] === 'arc')
      && noteChart.ctx.calls.some(call => call[0] === 'fillText' && String(call[1]).includes('Interpolated'));

    const suppChart = {
      options: {
        plugins: {
          supplementBars: {
            chartDates: ['2026-01-01', '2026-02-01', '2026-03-01'],
            supplements: [
              {
                name: 'Magnesium',
                type: 'supplement',
                dosage: '200mg',
                note: 'Taken nightly with meals and tracked for sleep support over time',
                periods: [
                  { start: '2026-01-05', end: '2026-01-25' },
                  { start: '2026-02-10', end: null },
                ],
              },
              {
                name: 'Thyroid Rx',
                type: 'medication',
                dosage: '25mcg',
                startDate: '2025-12-01',
                endDate: '2026-01-10',
              },
            ],
          },
        },
      },
      chartArea,
      scales: { x: xCategory },
      canvas: document.createElement('canvas'),
      ctx: makeCtx(),
    };
    const exactX = charts.supplementBarPlugin._dateToPixelX('2026-02-01', suppChart);
    const betweenX = charts.supplementBarPlugin._dateToPixelX('2026-01-15', suppChart);
    const leftX = charts.supplementBarPlugin._dateToPixelX('2025-12-01', suppChart);
    const rightX = charts.supplementBarPlugin._dateToPixelX('2026-04-01', suppChart);
    const rects = charts.supplementBarPlugin._getBarRects(suppChart);
    suppChart._hoveredSuppBar = rects.find(rect => rect.ongoing) || rects[0];
    charts.supplementBarPlugin.afterDatasetsDraw(suppChart);
    const suppMove = { event: { type: 'mousemove', x: rects[0].x + 1, y: rects[0].y + 1 } };
    charts.supplementBarPlugin.afterEvent(suppChart, suppMove);
    const suppLeave = { event: { type: 'mousemove', x: 1, y: 1 } };
    charts.supplementBarPlugin.afterEvent(suppChart, suppLeave);
    outcomes.supplementPluginDrawsBarsTooltipsAndHoverState = exactX === 120
      && betweenX > 40
      && leftX === 40
      && rightX === 200
      && rects.length >= 2
      && rects.some(rect => rect.ongoing)
      && suppMove.changed === true
      && suppLeave.changed === true
      && suppChart.canvas.style.cursor === ''
      && suppChart.ctx.calls.some(call => call[0] === 'roundRect')
      && suppChart.ctx.calls.some(call => call[0] === 'createLinearGradient')
      && suppChart.ctx.calls.some(call => call[0] === 'fillText' && String(call[1]).includes('Magnesium'));

    const phaseChart = {
      options: {
        plugins: {
          phaseBands: {
            phases: ['follicular', 'luteal', 'ovulatory'],
            chartDates: ['2026-01-01', '2026-02-01', '2026-03-01'],
            observed: [true, false, true],
            cycleDays: [10, 27, 14],
          },
        },
      },
      chartArea,
      scales: { x: xTime },
      ctx: makeCtx(),
    };
    charts.phaseBandPlugin.afterDatasetsDraw(phaseChart);
    const phasePills = phaseChart.ctx.calls.filter(call => call[0] === 'roundRect');
    const phaseTexts = phaseChart.ctx.calls.filter(call => call[0] === 'fillText').map(call => call[1]);
    outcomes.phasePluginAnnotatesOnlyMeasuredDrawsWithoutBackgroundColumns = phasePills.length === 2
      && phaseTexts.join('|') === 'F · D10|O · D14'
      && !phaseChart.ctx.calls.some(call => call[0] === 'fillRect')
      && phasePills.every(call => call[2] < chartArea.top);

    const captured = {};
    const singlePointCaptured = {};
    const canvas = document.createElement('canvas');
    canvas.id = 'chart-coverage-marker';
    document.body.appendChild(canvas);
    const singlePointCanvas = document.createElement('canvas');
    singlePointCanvas.id = 'chart-range-single-point';
    document.body.appendChild(singlePointCanvas);
    const originalChart = window.Chart;
    const originalDateAdapterReady = window.__labChartDateAdapterLoaded;
    window.__labChartDateAdapterLoaded = true;
    window.Chart = function ChartStub(canvasArg, config) {
      const target = canvasArg === singlePointCanvas ? singlePointCaptured : captured;
      target.canvas = canvasArg;
      target.config = config;
      return { canvas: canvasArg, options: config.options, data: config.data, update: () => {} };
    };
    const originalDateRange = state.dateRangeFilter;
    let expectedSinglePointBounds = null;
    let singlePointDate = null;
    try {
      state.rangeMode = 'optimal';
      charts.createLineChart('coverage-marker', {
        name: 'Coverage Marker',
        unit: 'mg/L',
        values: [1.2, 4.5, 2.2],
        refMin: 0.17,
        refMax: 3,
        optimalMin: 1.5,
        optimalMax: 2.5,
        phaseLabels: ['Follicular', 'Luteal', 'Luteal'],
      }, ['Jan', 'Feb', 'Mar'], ['2026-01-01', '2026-02-01', '2026-03-01'], ['follicular', 'luteal', 'luteal'], {
        displayLabels: ['Late follicular', 'Late luteal', 'Luteal'],
        cycleDays: [10, 27, 20],
        sources: ['recorded', 'recorded', 'predicted'],
      });

      state.dateRangeFilter = '3m';
      const recent = new Date();
      recent.setUTCMonth(recent.getUTCMonth() - 1);
      singlePointDate = recent.toISOString().slice(0, 10);
      expectedSinglePointBounds = getLabDateRangeBounds([singlePointDate], '3m');
      charts.createLineChart('range-single-point', {
        name: 'Single Result Marker',
        unit: 'mg/L',
        values: [2.2],
        refMin: 1,
        refMax: 3,
      }, ['Only result'], [singlePointDate]);
    } finally {
      state.dateRangeFilter = originalDateRange;
      window.Chart = originalChart;
      window.__labChartDateAdapterLoaded = originalDateAdapterReady;
    }
    const callbacks = captured.config.options.plugins.tooltip.callbacks;
    const labelText = callbacks.label({ dataset: captured.config.data.datasets[0], parsed: { y: 4.5 } });
    const afterLabelText = callbacks.afterLabel({ datasetIndex: 0, dataIndex: 1 });
    const chronoAfterLabelText = callbacks.afterLabel({ datasetIndex: 1, dataIndex: 1 });
    const yTickCallback = captured.config.options.scales.y.ticks.callback;
    const tooltipCallbacksOk = captured.canvas === canvas
      && labelText === '4.50 mg/L'
      && afterLabelText.includes('Draw phase: Late luteal · cycle day 27 (recorded)')
      && afterLabelText.includes('Optimal:')
      && chronoAfterLabelText === ''
      && yTickCallback(1.000000000000009) === '1'
      && yTickCallback(449.6) === '449.6'
      && yTickCallback(12.34567) === '12.3'
      && yTickCallback(1.23456) === '1.23'
      && yTickCallback(0.123456) === '0.123'
      && captured.config.options.scales.y.min === 0;
    outcomes.createLineChartTooltipCallbacksFormatValuesAndRanges = tooltipCallbacksOk || {
      labelText,
      afterLabelText,
      chronoAfterLabelText,
      capturedCanvas: captured.canvas === canvas,
    };
    outcomes.singlePointLabTimelineUsesSharedBoundsWithoutSyntheticDates =
      singlePointCaptured.canvas === singlePointCanvas
      && singlePointCaptured.config?.options?.scales?.x?.type === 'time'
      && singlePointCaptured.config?.options?.scales?.x?.display === false
      && singlePointCaptured.config?.options?.scales?.x?.min === expectedSinglePointBounds?.min
      && singlePointCaptured.config?.options?.scales?.x?.max === expectedSinglePointBounds?.max
      && singlePointCaptured.config?.data?.labels?.length === 1
      && singlePointCaptured.config?.data?.labels?.[0] === singlePointDate
      && singlePointCaptured.config?.data?.datasets?.[0]?.data?.length === 1
      && singlePointCaptured.config?.data?.datasets?.[0]?.data?.[0] === 2.2
      && !singlePointCaptured.config?.data?.labels?.includes('Today');

    const themedChart = {
      options: {
        plugins: {
          legend: { labels: { color: '' } },
          tooltip: { backgroundColor: '', titleColor: '', bodyColor: '', borderColor: '' },
        },
        scales: {
          x: { ticks: { color: '' }, grid: { color: '', display: true } },
          y: { ticks: { color: '' }, grid: { color: '' } },
        },
      },
      data: {
        datasets: [
          { borderColor: '', backgroundColor: '', pointBackgroundColor: [], pointBorderColor: [], _gbPointStatuses: ['normal', 'high', 'low', 'unrated', 'missing'] },
          { label: 'Chronological Age', borderColor: '' },
        ],
      },
      updateMode: null,
      update(mode) { this.updateMode = mode; },
    };
    state.chartInstances = { themedChart };
    charts.refreshChartThemeColors();
    outcomes.refreshChartThemeColorsAppliesLegendTooltipScalesAndDatasetColors = themedChart.updateMode === 'none'
      && themedChart.options.plugins.legend.labels.color === '#cbd5e1'
      && themedChart.options.plugins.tooltip.backgroundColor === '#111827'
      && themedChart.options.scales.x.ticks.color === '#94a3b8'
      && themedChart.options.scales.y.grid.color === '#475569'
      && themedChart.data.datasets[0].borderColor === '#38bdf8'
      && themedChart.data.datasets[0].pointBackgroundColor.join('|') === '#22c55e|#ef4444|#eab308|#94a3b8|transparent'
      && themedChart.data.datasets[1].borderColor === '#94a3b8';

    return outcomes;
  }, { chartsUrl: moduleUrl('/js/charts.js') });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, `${name}: ${JSON.stringify(passed)}`).toBe(true);
  }
});
