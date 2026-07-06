// @ts-check
// charts-runtime.js - Browser runtime adapters for Chart.js orchestration.

function getChartsRuntime() {
  return typeof window !== 'undefined'
    ? /** @type {any} */ (window)
    : null;
}

export function getChartConstructorRuntime() {
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

/**
 * @param {HTMLCanvasElement} canvas
 * @param {any} config
 * @returns {any | null}
 */
export function createChartRuntime(canvas, config) {
  const ChartCtor = getChartConstructorRuntime();
  return typeof ChartCtor === 'function' ? new ChartCtor(canvas, config) : null;
}
