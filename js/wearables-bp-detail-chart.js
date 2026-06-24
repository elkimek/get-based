// @ts-check

import { state } from './state.js';
import { adapterById, isMetricValueMeaningful } from './wearable-adapters.js';
import { ensureChartJs, isChartDateAdapterReady } from './charts.js';
import { getChartColors } from './theme.js';
import { formatValue, shortDate } from './wearables-formatters.js';

export function renderBloodPressureChart(canvas, canon, m, systolicSeries, diastolicSeries = [], manualSeries = [], pairedMetric = null) {
  if (!window.Chart || !isChartDateAdapterReady()) {
    const retryToken = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    canvas.dataset.bpRenderToken = retryToken;
    ensureChartJs().then(() => {
      const currentCanvas = document.getElementById(canvas.id);
      if (currentCanvas === canvas && canvas.isConnected && canvas.dataset.bpRenderToken === retryToken) {
        renderBloodPressureChart(canvas, canon, m, systolicSeries, diastolicSeries, manualSeries, pairedMetric);
      }
    }).catch(() => {});
    return;
  }

  const tc = getChartColors();
  const sysData = systolicSeries.map(p => ({ x: p.date, y: p.v }));
  const diaData = diastolicSeries.map(p => ({ x: p.date, y: p.v }));
  const manualSysData = manualSeries
    .filter(p => isMetricValueMeaningful('bp_systolic', p.v))
    .map(p => ({ x: p.date, y: p.v }));
  const manualDiaData = manualSeries
    .filter(p => isMetricValueMeaningful('bp_diastolic', p.pairedV))
    .map(p => ({ x: p.date, y: p.pairedV }));
  const xDates = [...systolicSeries, ...diastolicSeries, ...manualSeries].map(p => p.date).filter(Boolean).sort();
  const values = [...sysData, ...diaData, ...manualSysData, ...manualDiaData]
    .map(p => p.y)
    .filter(v => typeof v === 'number' && isFinite(v));
  if (values.length === 0) return;

  const unit = canon.unit || '';
  const formatV = v => formatValue(v, unit);
  const primaryAdapter = adapterById(m.primarySource);
  const primaryLabel = primaryAdapter?.displayName || 'Primary source';
  const pairedAdapter = adapterById(pairedMetric?.primarySource);
  const pairedLabel = pairedAdapter?.displayName || primaryLabel;
  const sysColor = tc.lineColor || '#60a5fa';
  const diaColor = '#a78bfa';
  const manualColor = '#f59e0b';
  // Keep manual diastolic visually distinct from the primary diastolic line.
  const manualDiaColor = '#f43f5e';

  const baselineDatasets = [];
  if (xDates.length && typeof m.baseline === 'number' && isFinite(m.baseline)) {
    baselineDatasets.push({
      label: 'Systolic baseline',
      data: [{ x: xDates[0], y: m.baseline }, { x: xDates[xDates.length - 1], y: m.baseline }],
      _kind: 'baseline',
      borderColor: sysColor,
      backgroundColor: 'transparent',
      borderWidth: 1,
      borderDash: [4, 4],
      pointRadius: 0,
      pointHoverRadius: 0,
      tension: 0,
    });
  }
  if (xDates.length && typeof pairedMetric?.baseline === 'number' && isFinite(pairedMetric.baseline)) {
    baselineDatasets.push({
      label: 'Diastolic baseline',
      data: [{ x: xDates[0], y: pairedMetric.baseline }, { x: xDates[xDates.length - 1], y: pairedMetric.baseline }],
      _kind: 'baseline',
      borderColor: diaColor,
      backgroundColor: 'transparent',
      borderWidth: 1,
      borderDash: [4, 4],
      pointRadius: 0,
      pointHoverRadius: 0,
      tension: 0,
    });
  }

  const datasets = [];
  if (sysData.length) datasets.push({
    label: `Systolic (${primaryLabel})`,
    data: sysData,
    _kind: 'primary',
    borderColor: sysColor,
    backgroundColor: 'transparent',
    borderWidth: 2,
    pointRadius: 3,
    pointHoverRadius: 5,
    tension: 0.3,
    spanGaps: true,
  });
  if (diaData.length) datasets.push({
    label: `Diastolic (${pairedLabel})`,
    data: diaData,
    _kind: 'primary',
    borderColor: diaColor,
    backgroundColor: 'transparent',
    borderWidth: 2,
    pointRadius: 3,
    pointHoverRadius: 5,
    tension: 0.3,
    spanGaps: true,
  });
  datasets.push(...baselineDatasets);
  if (manualSysData.length) datasets.push({
    type: 'scatter',
    label: 'Manual systolic',
    data: manualSysData,
    _kind: 'manual',
    borderColor: manualColor,
    backgroundColor: manualColor,
    pointRadius: 5,
    pointHoverRadius: 7,
    showLine: false,
  });
  if (manualDiaData.length) datasets.push({
    type: 'scatter',
    label: 'Manual diastolic',
    data: manualDiaData,
    _kind: 'manual',
    borderColor: manualDiaColor,
    backgroundColor: manualDiaColor,
    pointRadius: 5,
    pointHoverRadius: 7,
    showLine: false,
  });

  const yValues = [...values];
  if (typeof m.baseline === 'number' && isFinite(m.baseline)) yValues.push(m.baseline);
  if (typeof pairedMetric?.baseline === 'number' && isFinite(pairedMetric.baseline)) yValues.push(pairedMetric.baseline);
  const ymin = Math.min(...yValues);
  const ymax = Math.max(...yValues);
  const pad = Math.max((ymax - ymin) * 0.08, 2);
  const titleForPoint = (items) => {
    const rawX = items?.[0]?.raw?.x;
    if (typeof rawX === 'string') return shortDate(rawX);
    return items?.[0]?.label || '';
  };

  state.chartInstances['modal'] = new window.Chart(canvas, {
    type: 'line',
    data: { datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: datasets.some(d => d._kind === 'manual') ? 'nearest' : 'index', intersect: false, axis: 'x' },
      plugins: {
        legend: { display: true },
        tooltip: {
          backgroundColor: tc.tooltipBg, titleColor: tc.tooltipTitle,
          bodyColor: tc.tooltipBody, borderColor: tc.tooltipBorder, borderWidth: 1,
          callbacks: {
            title: titleForPoint,
            label: (c) => `${c.dataset.label}: ${formatV(c.parsed.y)}${unit ? ' ' + unit : ''}${c.dataset._kind === 'manual' ? '  (manual entry)' : ''}`,
          },
        },
      },
      scales: {
        x: {
          type: 'time',
          time: { tooltipFormat: 'MMM d, yyyy', displayFormats: { day: 'MMM d', month: 'MMM yyyy' } },
          ticks: { source: 'auto', color: tc.tickColor, font: { size: 10 }, maxTicksLimit: 8 },
          grid: { display: false },
        },
        y: {
          min: ymin - pad, max: ymax + pad,
          ticks: { color: tc.tickColor, font: { size: 10 } },
          grid: { color: tc.gridColor },
        },
      },
    },
  });
}
