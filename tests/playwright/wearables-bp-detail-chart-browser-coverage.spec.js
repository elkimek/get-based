import { expect, test } from './coverage-fixture.js';

test('Wearables blood-pressure chart builds paired baselines and manual tooltips', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });

  const outcomes = await page.evaluate(async () => {
    const [{ state }, { renderBloodPressureChart }] = await Promise.all([
      import('/js/state.js'),
      import('/js/wearables-bp-detail-chart.js'),
    ]);
    const previousChart = window.Chart;
    const previousDateAdapter = window.__labChartDateAdapterLoaded;
    const previousModalChart = state.chartInstances.modal;

    class ChartStub {
      constructor(canvas, config) {
        this.canvas = canvas;
        this.data = config.data;
        this.options = config.options;
      }
    }

    try {
      window.Chart = ChartStub;
      window.__labChartDateAdapterLoaded = true;
      const canvas = document.createElement('canvas');
      canvas.id = 'wearables-bp-chart-coverage';
      document.body.append(canvas);

      renderBloodPressureChart(
        canvas,
        { unit: 'mmHg' },
        { primarySource: 'withings', baseline: 124 },
        [
          { date: '2026-07-22', v: 126 },
          { date: '2026-07-24', v: 121 },
        ],
        [
          { date: '2026-07-22', v: 82 },
          { date: '2026-07-24', v: 79 },
        ],
        [
          { date: '2026-07-23', v: 118, pairedV: 77 },
          { date: '', v: Number.NaN, pairedV: null },
        ],
        { primarySource: 'manual', baseline: 80 },
      );

      const chart = state.chartInstances.modal;
      const labels = chart.data.datasets.map(dataset => dataset.label);
      const callbacks = chart.options.plugins.tooltip.callbacks;
      const manualDataset = chart.data.datasets.find(
        dataset => dataset.label === 'Manual systolic',
      );
      return {
        pairedPrimarySeries:
          labels.some(label => label.startsWith('Systolic'))
          && labels.some(label => label.startsWith('Diastolic')),
        pairedBaselines:
          labels.includes('Systolic baseline')
          && labels.includes('Diastolic baseline'),
        manualSeries:
          labels.includes('Manual systolic')
          && labels.includes('Manual diastolic'),
        manualTooltip:
          callbacks.label({
            dataset: manualDataset,
            parsed: { y: 118 },
          }).includes('118 mmHg  (manual entry)'),
        datedTooltipTitle:
          callbacks.title([{ raw: { x: '2026-07-23' } }]).length > 0,
        fallbackTooltipTitle:
          callbacks.title([{ label: 'Fallback date' }]) === 'Fallback date',
        nearestManualInteraction: chart.options.interaction.mode === 'nearest',
        paddedYAxis:
          chart.options.scales.y.min < 77
          && chart.options.scales.y.max > 126,
      };
    } finally {
      if (previousChart === undefined) delete window.Chart;
      else window.Chart = previousChart;
      if (previousDateAdapter === undefined) delete window.__labChartDateAdapterLoaded;
      else window.__labChartDateAdapterLoaded = previousDateAdapter;
      if (previousModalChart === undefined) delete state.chartInstances.modal;
      else state.chartInstances.modal = previousModalChart;
      document.getElementById('wearables-bp-chart-coverage')?.remove();
    }
  });

  for (const [name, passed] of Object.entries(outcomes)) {
    expect(passed, name).toBe(true);
  }
});
