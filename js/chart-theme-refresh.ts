// Updating resident chart colors does not load chart creation or plugins.
import {state} from './state.js';
import {getChartColors} from './theme.js';
import type {DrawingChart} from './charts.js';
type ChartColors = ReturnType<typeof getChartColors>;

function getStatusChartColor(status: unknown, tc: ChartColors) {
  if (status === 'normal') return tc.green;
  if (status === 'high') return tc.red;
  if (status === 'low') return tc.yellow;
  if (status === 'unrated') return tc.tickColor;
  return 'transparent';
}

function applyChartThemeColors(chart: DrawingChart, tc: ChartColors) {
  const plugins = chart.options?.plugins || {};
  if (plugins.legend?.labels) plugins.legend.labels.color = tc.legendColor;
  if (plugins.tooltip) {
    plugins.tooltip.backgroundColor = tc.tooltipBg;
    plugins.tooltip.titleColor = tc.tooltipTitle;
    plugins.tooltip.bodyColor = tc.tooltipBody;
    plugins.tooltip.borderColor = tc.tooltipBorder;
  }

  const xScale = chart.options?.scales?.x;
  const yScale = chart.options?.scales?.y;
  if (xScale?.ticks) xScale.ticks.color = tc.tickColor;
  if (xScale?.grid && xScale.grid.display !== false) xScale.grid.color = tc.gridColor;
  if (yScale?.ticks) yScale.ticks.color = tc.tickColor;
  if (yScale?.grid) yScale.grid.color = tc.gridColor;

  const datasets = chart.data?.datasets || [];
  const primary = datasets[0];
  if (primary) {
    primary.borderColor = tc.lineColor;
    primary.backgroundColor = tc.lineFill;
    if (Array.isArray(primary._gbPointStatuses)) {
      const pointColors = primary._gbPointStatuses.map(status => getStatusChartColor(status, tc));
      primary.pointBackgroundColor = pointColors;
      primary.pointBorderColor = pointColors;
    }
  }
  for (const dataset of datasets) {
    if (dataset.label === 'Chronological Age') dataset.borderColor = tc.chronoLineColor;
  }
  chart.update('none');
}

let chartThemeRefreshToken = 0;

export function refreshChartThemeColors(options: { batchSize?: number } = {}) {
  const charts = Object.values(state.chartInstances).filter(Boolean) as DrawingChart[];
  if (!charts.length) return;
  const tc = getChartColors();
  const batchSize = Number.isFinite(options.batchSize)
    ? Math.max(1, Math.floor(options.batchSize!))
    : charts.length;
  const token = ++chartThemeRefreshToken;
  let index = 0;
  const runBatch = () => {
    if (token !== chartThemeRefreshToken) return;
    const end = Math.min(index + batchSize, charts.length);
    for (; index < end; index++) applyChartThemeColors(charts[index]!, tc);
    if (index < charts.length) setTimeout(runBatch, 0);
  };
  runBatch();
}
