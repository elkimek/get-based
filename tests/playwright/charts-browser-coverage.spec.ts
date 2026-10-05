import { createBlankPage } from '../helpers/browser-blank-page.js';
import { expect, test } from './coverage-fixture.js';

const moduleUrl = (path: string) => `${path}?chartsBrowserCoverage=${Date.now()}-${Math.random().toString(36).slice(2)}`;

const openBlankPage = createBlankPage({
  path: "/charts-browser-coverage", body: '<!doctype html><html><head></head><body><main id="fixture"></main></body></html>',
});

test('charts browser coverage exercises annotation supplement and theme callbacks', async ({ page }) => {
  await openBlankPage(page);

  const results = await page.evaluate(async ({ chartsUrl }) => {
    const [{ state }, charts, { getLabDateRangeBounds }] = await Promise.all([
      import('/js/state.js'),
      (import(chartsUrl) as Promise<unknown> as Promise<Pick<typeof import('../../js/charts.js'), 'noteAnnotationPlugin' | 'supplementBarPlugin' | 'phaseBandPlugin' | 'createLineChart' | 'refreshChartThemeColors'>>),
      import('/js/lab-date-range.js'),
    ]);
    const outcomes: Record<string, unknown> = {};

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
      const calls: unknown[][] = [];
      const ctx = {
        calls,
        save: () => calls.push(['save']),
        restore: () => calls.push(['restore']),
        beginPath: () => calls.push(['beginPath']),
        arc: (...args: unknown[]) => calls.push(['arc', ...args]),
        fill: () => calls.push(['fill']),
        stroke: () => calls.push(['stroke']),
        fillRect: (...args: unknown[]) => calls.push(['fillRect', ...args]),
        moveTo: (...args: unknown[]) => calls.push(['moveTo', ...args]),
        lineTo: (...args: unknown[]) => calls.push(['lineTo', ...args]),
        setLineDash: (...args: unknown[]) => calls.push(['setLineDash', ...args]),
        roundRect: (...args: unknown[]) => calls.push(['roundRect', ...args]),
        measureText: (text: unknown) => ({ width: String(text).length * 6 }),
        fillText: (...args: unknown[]) => calls.push(['fillText', ...args]),
        createLinearGradient: (...args: unknown[]) => {
          const stops: unknown[][] = [];
          calls.push(['createLinearGradient', ...args]);
          return {
            stops,
            addColorStop: (offset: unknown, color: unknown) => stops.push([offset, color]),
          };
        },
        set fillStyle(value: unknown) { calls.push(['fillStyle', value]); (this as unknown as Partial<Record<"_fillStyle", unknown>>)._fillStyle = value; },
        get fillStyle() { return (this as unknown as Partial<Record<"_fillStyle", unknown>>)._fillStyle; },
        set strokeStyle(value: unknown) { calls.push(['strokeStyle', value]); (this as unknown as Partial<Record<"_strokeStyle", unknown>>)._strokeStyle = value; },
        get strokeStyle() { return (this as unknown as Partial<Record<"_strokeStyle", unknown>>)._strokeStyle; },
        set lineWidth(value: unknown) { calls.push(['lineWidth', value]); (this as unknown as Partial<Record<"_lineWidth", unknown>>)._lineWidth = value; },
        get lineWidth() { return (this as unknown as Partial<Record<"_lineWidth", unknown>>)._lineWidth; },
        set font(value: unknown) { calls.push(['font', value]); (this as unknown as Partial<Record<"_font", unknown>>)._font = value; },
        get font() { return (this as unknown as Partial<Record<"_font", unknown>>)._font; },
        set textAlign(value: unknown) { calls.push(['textAlign', value]); (this as unknown as Partial<Record<"_textAlign", unknown>>)._textAlign = value; },
        get textAlign() { return (this as unknown as Partial<Record<"_textAlign", unknown>>)._textAlign; },
        set textBaseline(value: unknown) { calls.push(['textBaseline', value]); (this as unknown as Partial<Record<"_textBaseline", unknown>>)._textBaseline = value; },
        get textBaseline() { return (this as unknown as Partial<Record<"_textBaseline", unknown>>)._textBaseline; },
      };
      return ctx;
    };

    type DrawChart = Parameters<typeof charts.noteAnnotationPlugin._getNoteDots>[0];
    type PartialDrawChart = Partial<Omit<DrawChart, 'ctx' | '_hoveredNoteDot' | '_hoveredSuppBar'>> & {
      ctx: ReturnType<typeof makeCtx>;
      _hoveredNoteDot?: DrawChart['_hoveredNoteDot'] | undefined;
      _hoveredSuppBar?: DrawChart['_hoveredSuppBar'] | undefined;
    };
    type Tail<Args extends unknown[]> = Args extends [unknown, ...infer Rest] ? Rest : never;
    const xCategory = {
      type: 'category',
      getPixelForValue: (value: number | string) => 40 + Number(value) * 80,
    };
    const xTime = {
      type: 'time',
      getPixelForValue: (value: number | string) => {
        const start = new Date('2026-01-01T00:00:00').getTime();
        const end = new Date('2026-03-01T00:00:00').getTime();
        return 20 + ((Number(value) - start) / (end - start)) * 200;
      },
    };
    const chartArea = { left: 20, right: 240, top: 30, bottom: 180 };

    const noteChart: PartialDrawChart & Pick<DrawChart, 'canvas' | 'data'> = {
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
    const noteDots = (charts.noteAnnotationPlugin._getNoteDots as unknown as (chart: PartialDrawChart, ...args: Tail<Parameters<typeof charts.noteAnnotationPlugin._getNoteDots>>) => ReturnType<typeof charts.noteAnnotationPlugin._getNoteDots>)(noteChart);
    noteChart._hoveredNoteDot = noteDots[1];
    (charts.noteAnnotationPlugin.afterDatasetsDraw as unknown as (chart: PartialDrawChart, ...args: Tail<Parameters<typeof charts.noteAnnotationPlugin.afterDatasetsDraw>>) => ReturnType<typeof charts.noteAnnotationPlugin.afterDatasetsDraw>)(noteChart);
    const noteMove: Parameters<typeof charts.noteAnnotationPlugin.afterEvent>[1] = { event: { type: 'mousemove', x: noteDots[0]!.x, y: noteDots[0]!.y } };
    (charts.noteAnnotationPlugin.afterEvent as unknown as (chart: PartialDrawChart, ...args: Tail<Parameters<typeof charts.noteAnnotationPlugin.afterEvent>>) => ReturnType<typeof charts.noteAnnotationPlugin.afterEvent>)(noteChart, noteMove);
    const noteLeave: Parameters<typeof charts.noteAnnotationPlugin.afterEvent>[1] = { event: { type: 'mousemove', x: 1, y: 1 } };
    (charts.noteAnnotationPlugin.afterEvent as unknown as (chart: PartialDrawChart, ...args: Tail<Parameters<typeof charts.noteAnnotationPlugin.afterEvent>>) => ReturnType<typeof charts.noteAnnotationPlugin.afterEvent>)(noteChart, noteLeave);
    const timeDots = (charts.noteAnnotationPlugin._getNoteDots as unknown as (chart: PartialDrawChart, ...args: Tail<Parameters<typeof charts.noteAnnotationPlugin._getNoteDots>>) => ReturnType<typeof charts.noteAnnotationPlugin._getNoteDots>)({
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

    const suppChart: PartialDrawChart & Pick<DrawChart, 'canvas'> = {
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
    const exactX = (charts.supplementBarPlugin._dateToPixelX as unknown as (date: Parameters<typeof charts.supplementBarPlugin._dateToPixelX>[0], chart: PartialDrawChart) => ReturnType<typeof charts.supplementBarPlugin._dateToPixelX>)('2026-02-01', suppChart);
    const betweenX = (charts.supplementBarPlugin._dateToPixelX as unknown as (date: Parameters<typeof charts.supplementBarPlugin._dateToPixelX>[0], chart: PartialDrawChart) => ReturnType<typeof charts.supplementBarPlugin._dateToPixelX>)('2026-01-15', suppChart);
    const leftX = (charts.supplementBarPlugin._dateToPixelX as unknown as (date: Parameters<typeof charts.supplementBarPlugin._dateToPixelX>[0], chart: PartialDrawChart) => ReturnType<typeof charts.supplementBarPlugin._dateToPixelX>)('2025-12-01', suppChart);
    const rightX = (charts.supplementBarPlugin._dateToPixelX as unknown as (date: Parameters<typeof charts.supplementBarPlugin._dateToPixelX>[0], chart: PartialDrawChart) => ReturnType<typeof charts.supplementBarPlugin._dateToPixelX>)('2026-04-01', suppChart);
    const rects = (charts.supplementBarPlugin._getBarRects as unknown as (chart: PartialDrawChart, ...args: Tail<Parameters<typeof charts.supplementBarPlugin._getBarRects>>) => ReturnType<typeof charts.supplementBarPlugin._getBarRects>)(suppChart);
    suppChart._hoveredSuppBar = rects.find(rect => rect.ongoing) || rects[0];
    (charts.supplementBarPlugin.afterDatasetsDraw as unknown as (chart: PartialDrawChart, ...args: Tail<Parameters<typeof charts.supplementBarPlugin.afterDatasetsDraw>>) => ReturnType<typeof charts.supplementBarPlugin.afterDatasetsDraw>)(suppChart);
    const suppMove: Parameters<typeof charts.supplementBarPlugin.afterEvent>[1] = { event: { type: 'mousemove', x: rects[0]!.x + 1, y: rects[0]!.y + 1 } };
    (charts.supplementBarPlugin.afterEvent as unknown as (chart: PartialDrawChart, ...args: Tail<Parameters<typeof charts.supplementBarPlugin.afterEvent>>) => ReturnType<typeof charts.supplementBarPlugin.afterEvent>)(suppChart, suppMove);
    const suppLeave: Parameters<typeof charts.supplementBarPlugin.afterEvent>[1] = { event: { type: 'mousemove', x: 1, y: 1 } };
    (charts.supplementBarPlugin.afterEvent as unknown as (chart: PartialDrawChart, ...args: Tail<Parameters<typeof charts.supplementBarPlugin.afterEvent>>) => ReturnType<typeof charts.supplementBarPlugin.afterEvent>)(suppChart, suppLeave);
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

    const phaseChart: PartialDrawChart = {
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
    (charts.phaseBandPlugin.afterDatasetsDraw as unknown as (chart: PartialDrawChart, ...args: Tail<Parameters<typeof charts.phaseBandPlugin.afterDatasetsDraw>>) => ReturnType<typeof charts.phaseBandPlugin.afterDatasetsDraw>)(phaseChart);
    const phasePills = phaseChart.ctx.calls.filter(call => call[0] === 'roundRect');
    const phaseTexts = phaseChart.ctx.calls.filter(call => call[0] === 'fillText').map(call => call[1]);
    outcomes.phasePluginAnnotatesOnlyMeasuredDrawsWithoutBackgroundColumns = phasePills.length === 2
      && phaseTexts.join('|') === 'F · D10|O · D14'
      && !phaseChart.ctx.calls.some(call => call[0] === 'fillRect')
      && phasePills.every(call => (call[2] as number) < chartArea.top);

    const captured: {canvas?: unknown; config?: unknown} = {};
    const singlePointCaptured: {canvas?: unknown; config?: unknown} = {};
    const canvas = document.createElement('canvas');
    canvas.id = 'chart-coverage-marker';
    document.body.appendChild(canvas);
    const singlePointCanvas = document.createElement('canvas');
    singlePointCanvas.id = 'chart-range-single-point';
    document.body.appendChild(singlePointCanvas);
    const originalChart = (window as unknown as {Chart?: unknown}).Chart;
    const originalDateAdapterReady = (window as unknown as {__labChartDateAdapterLoaded?: unknown}).__labChartDateAdapterLoaded;
    (window as unknown as {__labChartDateAdapterLoaded?: unknown}).__labChartDateAdapterLoaded = true;
    (window as unknown as {Chart?: unknown}).Chart = function ChartStub(canvasArg: Parameters<typeof import('../../js/charts-runtime.js').createChartRuntime>[0], config: unknown) {
      const target = canvasArg === singlePointCanvas ? singlePointCaptured : captured;
      target.canvas = canvasArg;
      target.config = config;
      return { canvas: canvasArg, options: (config as {options: unknown}).options, data: (config as {data: unknown}).data, update: () => {} };
    };
    const originalDateRange = state.dateRangeFilter;
    let expectedSinglePointBounds: ReturnType<typeof getLabDateRangeBounds> = null;
    let singlePointDate: string | null = null;
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
      (window as unknown as {Chart?: unknown}).Chart = originalChart;
      (window as unknown as {__labChartDateAdapterLoaded?: unknown}).__labChartDateAdapterLoaded = originalDateAdapterReady;
    }
    // Local reads of the captured constructor payload; the native runtime accepts unknown configuration.
    type CapturedChartConfig = {
      data: {datasets: Array<{data: unknown[]; label?: string}>; labels: string[]};
      options: {plugins: {tooltip: {callbacks: {
        label(point: {dataset: {label?: string} | undefined; parsed: {y: number}}): string;
        afterLabel(point: {datasetIndex: number; dataIndex: number}): string;
      }}}; scales: {y: {min: unknown; ticks: {callback(value: number): string}}; x: {type?: unknown; display?: unknown; min?: unknown; max?: unknown}}};
    };
    const callbacks = (captured.config as CapturedChartConfig).options.plugins.tooltip.callbacks;
    const labelText = callbacks.label({ dataset: (captured.config as CapturedChartConfig).data.datasets[0], parsed: { y: 4.5 } });
    const afterLabelText = callbacks.afterLabel({ datasetIndex: 0, dataIndex: 1 });
    const chronoAfterLabelText = callbacks.afterLabel({ datasetIndex: 1, dataIndex: 1 });
    const yTickCallback = (captured.config as CapturedChartConfig).options.scales.y.ticks.callback;
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
      && (captured.config as CapturedChartConfig).options.scales.y.min === 0;
    outcomes.createLineChartTooltipCallbacksFormatValuesAndRanges = tooltipCallbacksOk || {
      labelText,
      afterLabelText,
      chronoAfterLabelText,
      capturedCanvas: captured.canvas === canvas,
    };
    outcomes.singlePointLabTimelineUsesSharedBoundsWithoutSyntheticDates =
      singlePointCaptured.canvas === singlePointCanvas
      && (singlePointCaptured.config as CapturedChartConfig | undefined)?.options?.scales?.x?.type === 'time'
      && (singlePointCaptured.config as CapturedChartConfig | undefined)?.options?.scales?.x?.display === false
      && (singlePointCaptured.config as CapturedChartConfig | undefined)?.options?.scales?.x?.min === expectedSinglePointBounds?.min
      && (singlePointCaptured.config as CapturedChartConfig | undefined)?.options?.scales?.x?.max === expectedSinglePointBounds?.max
      && (singlePointCaptured.config as CapturedChartConfig | undefined)?.data?.labels?.length === 1
      && (singlePointCaptured.config as CapturedChartConfig | undefined)?.data?.labels?.[0] === singlePointDate
      && (singlePointCaptured.config as CapturedChartConfig | undefined)?.data?.datasets?.[0]?.data?.length === 1
      && (singlePointCaptured.config as CapturedChartConfig | undefined)?.data?.datasets?.[0]?.data?.[0] === 2.2
      && !(singlePointCaptured.config as CapturedChartConfig | undefined)?.data?.labels?.includes('Today');

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
          { borderColor: '', backgroundColor: '', pointBackgroundColor: [] as string[], pointBorderColor: [] as string[], _gbPointStatuses: ['normal', 'high', 'low', 'unrated', 'missing'] },
          { label: 'Chronological Age', borderColor: '' },
        ],
      },
      updateMode: null as string | null,
      update(mode: string) { this.updateMode = mode; },
    };
    state.chartInstances = { themedChart };
    charts.refreshChartThemeColors();
    outcomes.refreshChartThemeColorsAppliesLegendTooltipScalesAndDatasetColors = themedChart.updateMode === 'none'
      && themedChart.options.plugins.legend.labels.color === '#cbd5e1'
      && themedChart.options.plugins.tooltip.backgroundColor === '#111827'
      && themedChart.options.scales.x.ticks.color === '#94a3b8'
      && themedChart.options.scales.y.grid.color === '#475569'
      && themedChart.data.datasets[0]!.borderColor === '#38bdf8'
      && themedChart.data.datasets[0]!.pointBackgroundColor!.join('|') === '#22c55e|#ef4444|#eab308|#94a3b8|transparent'
      && themedChart.data.datasets[1]!.borderColor === '#94a3b8';

    return outcomes;
  }, { chartsUrl: moduleUrl('/js/charts.js') });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, `${name}: ${JSON.stringify(passed)}`).toBe(true);
  }
});
