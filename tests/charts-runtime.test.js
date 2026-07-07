import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

import {
  createChartRuntime,
  getChartConstructorRuntime,
  getChartViewportWidthRuntime,
  hasChartRuntime,
  isChartDateAdapterReadyRuntime,
  markChartDateAdapterReadyRuntime,
} from '../js/charts-runtime.js';

const savedWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');

function setRuntimeWindow(runtime) {
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    writable: true,
    value: runtime,
  });
}

afterEach(() => {
  if (savedWindow) Object.defineProperty(globalThis, 'window', savedWindow);
  else delete globalThis.window;
});

describe('charts runtime adapter', () => {
  it('delegates Chart constructor and date-adapter readiness', () => {
    class ChartStub {
      constructor(canvas, config) {
        this.canvas = canvas;
        this.config = config;
      }
    }
    const runtime = { Chart: ChartStub, innerWidth: 640 };
    const canvas = { id: 'chart-demo' };
    const config = { type: 'line' };
    setRuntimeWindow(runtime);

    expect(getChartConstructorRuntime()).toBe(ChartStub);
    expect(hasChartRuntime()).toBe(true);
    expect(getChartViewportWidthRuntime()).toBe(640);
    expect(isChartDateAdapterReadyRuntime()).toBe(false);
    expect(markChartDateAdapterReadyRuntime()).toBe(true);
    expect(isChartDateAdapterReadyRuntime()).toBe(true);
    expect(createChartRuntime(canvas, config)).toMatchObject({ canvas, config });
  });

  it('uses safe fallbacks when a browser runtime is missing', () => {
    delete globalThis.window;

    expect(getChartConstructorRuntime()).toBeNull();
    expect(hasChartRuntime()).toBe(false);
    expect(getChartViewportWidthRuntime()).toBe(1024);
    expect(markChartDateAdapterReadyRuntime()).toBe(false);
    expect(isChartDateAdapterReadyRuntime()).toBe(false);
    expect(createChartRuntime({ id: 'chart-demo' }, { type: 'line' })).toBeNull();
  });

  it('keeps charts.js browser globals behind the adapter', () => {
    const chartsSrc = readFileSync(new URL('../js/charts.js', import.meta.url), 'utf8');
    const swSrc = readFileSync(new URL('../service-worker.js', import.meta.url), 'utf8');

    expect(chartsSrc).toContain("from './charts-runtime.js'");
    expect(/\bwindow(?:\.|\s*\[)/.test(chartsSrc)).toBe(false);
    expect(swSrc).toContain("'/js/charts-runtime.js'");
  });

  it('keeps Chart.js construction behind the runtime adapter', () => {
    const chartConsumers = [
      readFileSync(new URL('../js/category-view-renderers.js', import.meta.url), 'utf8'),
      readFileSync(new URL('../js/compare-correlations.js', import.meta.url), 'utf8'),
      readFileSync(new URL('../js/wearables-bp-detail-chart.js', import.meta.url), 'utf8'),
    ];

    for (const src of chartConsumers) {
      expect(src).toContain("from './charts-runtime.js'");
      expect(src).toContain('createChartRuntime');
      expect(src).toContain('hasChartRuntime');
      expect(src).not.toContain('window.Chart');
    }
  });
});
