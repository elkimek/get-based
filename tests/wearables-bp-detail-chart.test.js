// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';

import { state } from '../js/state.js';
import { renderBloodPressureChart } from '../js/wearables-bp-detail-chart.js';

const previousChart = window.Chart;
const previousDateAdapter = window.__labChartDateAdapterLoaded;
const previousModalChart = state.chartInstances.modal;

afterEach(() => {
  if (previousChart === undefined) delete window.Chart;
  else window.Chart = previousChart;
  if (previousDateAdapter === undefined) delete window.__labChartDateAdapterLoaded;
  else window.__labChartDateAdapterLoaded = previousDateAdapter;
  if (previousModalChart === undefined) delete state.chartInstances.modal;
  else state.chartInstances.modal = previousModalChart;
  document.body.replaceChildren();
});

describe('Wearables blood-pressure detail chart', () => {
  it('builds paired baselines, manual points, and accessible tooltip values', () => {
    class ChartStub {
      constructor(canvas, config) {
        this.canvas = canvas;
        this.data = config.data;
        this.options = config.options;
      }
    }

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

    expect(labels).toEqual(expect.arrayContaining([
      expect.stringMatching(/^Systolic/),
      expect.stringMatching(/^Diastolic/),
      'Systolic baseline',
      'Diastolic baseline',
      'Manual systolic',
      'Manual diastolic',
    ]));
    expect(callbacks.label({
      dataset: manualDataset,
      parsed: { y: 118 },
    })).toContain('118 mmHg  (manual entry)');
    expect(callbacks.title([{ raw: { x: '2026-07-23' } }])).not.toBe('');
    expect(callbacks.title([{ label: 'Fallback date' }])).toBe('Fallback date');
    expect(chart.options.interaction.mode).toBe('nearest');
    expect(chart.options.scales.y.min).toBeLessThan(77);
    expect(chart.options.scales.y.max).toBeGreaterThan(126);
  });
});
