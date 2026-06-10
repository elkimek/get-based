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
    const charts = await import(chartsUrl);
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

    const captured = {};
    const canvas = document.createElement('canvas');
    canvas.id = 'chart-coverage-marker';
    document.body.appendChild(canvas);
    const originalChart = window.Chart;
    window.Chart = function ChartStub(canvasArg, config) {
      captured.canvas = canvasArg;
      captured.config = config;
      return { canvas: canvasArg, options: config.options, data: config.data, update: () => {} };
    };
    try {
      window._labState.rangeMode = 'optimal';
      charts.createLineChart('coverage-marker', {
        name: 'Coverage Marker',
        unit: 'mg/L',
        values: [1.2, 4.5, 2.2],
        refMin: 1,
        refMax: 3,
        optimalMin: 1.5,
        optimalMax: 2.5,
        phaseLabels: ['Follicular', 'Luteal', 'Luteal'],
      }, ['Jan', 'Feb', 'Mar'], ['2026-01-01', '2026-02-01', '2026-03-01'], ['follicular', 'luteal', 'luteal']);
    } finally {
      window.Chart = originalChart;
    }
    const callbacks = captured.config.options.plugins.tooltip.callbacks;
    const labelText = callbacks.label({ dataset: captured.config.data.datasets[0], parsed: { y: 4.5 } });
    const afterLabelText = callbacks.afterLabel({ datasetIndex: 0, dataIndex: 1 });
    const chronoAfterLabelText = callbacks.afterLabel({ datasetIndex: 1, dataIndex: 1 });
    const tooltipCallbacksOk = captured.canvas === canvas
      && labelText === '4.50 mg/L'
      && afterLabelText.includes('Phase: Luteal')
      && afterLabelText.includes('Phase ref:')
      && chronoAfterLabelText === '';
    outcomes.createLineChartTooltipCallbacksFormatValuesAndRanges = tooltipCallbacksOk || {
      labelText,
      afterLabelText,
      chronoAfterLabelText,
      capturedCanvas: captured.canvas === canvas,
    };

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
          { borderColor: '', backgroundColor: '', pointBackgroundColor: [], pointBorderColor: [], _gbPointStatuses: ['normal', 'high', 'low', 'missing'] },
          { label: 'Chronological Age', borderColor: '' },
        ],
      },
      updateMode: null,
      update(mode) { this.updateMode = mode; },
    };
    window._labState.chartInstances = { themedChart };
    charts.refreshChartThemeColors();
    outcomes.refreshChartThemeColorsAppliesLegendTooltipScalesAndDatasetColors = themedChart.updateMode === 'none'
      && themedChart.options.plugins.legend.labels.color === '#cbd5e1'
      && themedChart.options.plugins.tooltip.backgroundColor === '#111827'
      && themedChart.options.scales.x.ticks.color === '#94a3b8'
      && themedChart.options.scales.y.grid.color === '#475569'
      && themedChart.data.datasets[0].borderColor === '#38bdf8'
      && themedChart.data.datasets[0].pointBackgroundColor.join('|') === '#22c55e|#ef4444|#eab308|transparent'
      && themedChart.data.datasets[1].borderColor === '#94a3b8';

    return outcomes;
  }, { chartsUrl: moduleUrl('/js/charts.js') });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, `${name}: ${JSON.stringify(passed)}`).toBe(true);
  }
});
