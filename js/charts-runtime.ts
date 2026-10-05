// charts-runtime.js - Browser runtime adapters for Chart.js orchestration.

export interface ChartScale {
  getValueForPixel(pixel: number): number;
  getPixelForValue(value: number | string): number;
}
// The Cartesian surface used by the app chart consumers.
export interface ChartInstance {
  destroy(): void;
  scales: Record<string, ChartScale> & { x: ChartScale };
  chartArea: { left: number; right: number; top: number; bottom: number };
}
export interface ChartConstructor {
  new(canvas: HTMLCanvasElement, config: unknown): ChartInstance;
  register(...plugins: unknown[]): void;
}
type ChartsRuntime = Window & typeof globalThis & { Chart?: ChartConstructor; __labChartDateAdapterLoaded?: unknown };

function getChartsRuntime(): ChartsRuntime | null {
  return typeof window !== 'undefined'
    ? (window as ChartsRuntime)
    : null;
}

export function getChartConstructorRuntime(): ChartConstructor | null {
  return getChartsRuntime()?.Chart || null;
}

export function hasChartRuntime() {
  return typeof getChartConstructorRuntime() === 'function';
}

export function isChartDateAdapterReadyRuntime() {
  return getChartsRuntime()?.__labChartDateAdapterLoaded === true;
}

export function markChartDateAdapterReadyRuntime() {
  const runtime = getChartsRuntime();
  if (!runtime) return false;
  runtime.__labChartDateAdapterLoaded = true;
  return true;
}

export function getChartViewportWidthRuntime() {
  const width = Number(getChartsRuntime()?.innerWidth);
  return Number.isFinite(width) && width > 0 ? width : 1024;
}

export function createChartRuntime(canvas: HTMLCanvasElement, config: unknown) {
  const ChartCtor = getChartConstructorRuntime();
  return typeof ChartCtor === 'function' ? new ChartCtor(canvas, config) : null;
}
