#!/usr/bin/env node
// test-import-chart-data-integrity.js - import normalization must preserve
// chart semantics for markers whose imported unit labels look like percent.
//
// Run: node tests/test-import-chart-data-integrity.js (or via npm test)

import './_node-shim.js';

const savedGetComputedStyle = globalThis.getComputedStyle;
const chartColorValues = {
  '--bg-card': '#111111',
  '--text-primary': '#f8fafc',
  '--text-secondary': '#cbd5e1',
  '--border': '#334155',
  '--text-muted': '#94a3b8',
  '--chart-grid': '#1f2937',
  '--accent': '#38bdf8',
  '--accent-fill': 'rgba(56,189,248,0.12)',
  '--chart-tooltip-bg': '#020617',
  '--green': '#22c55e',
  '--red': '#ef4444',
  '--yellow': '#f59e0b',
  '--ref-band': 'rgba(34,197,94,0.10)',
  '--ref-border': 'rgba(34,197,94,0.35)',
};

globalThis.getComputedStyle = () => ({
  getPropertyValue: prop => chartColorValues[prop] || '#000000',
});

let pass = 0, fail = 0;
function assert(name, condition, detail) {
  if (condition) { pass++; console.log(`  PASS: ${name}`); }
  else { fail++; console.log(`  FAIL: ${name}${detail ? ' - ' + detail : ''}`); }
}

const approx = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

console.log('=== Import to Chart Data Integrity Tests ===\n');

const { MARKER_SCHEMA } = await import('../js/schema.js');
const { state } = await import('../js/state.js');
const { normalizeToSI } = await import('../js/pdf-import-marker-mapping.js');
const { renderChartCard } = await import('../js/category-view-renderers.js');
const { createLineChart } = await import('../js/charts.js');

const saved = {
  getElementById: document.getElementById,
  chartInstances: state.chartInstances,
  markerRegistry: state.markerRegistry,
  rangeMode: state.rangeMode,
  Chart: window.Chart,
};

const canvases = new Map();
document.getElementById = id => canvases.get(id) || null;
window.Chart = class ChartStub {
  constructor(canvas, config) {
    this.canvas = canvas;
    this.config = config;
    this.data = config.data;
    this.options = config.options;
  }
  update() {}
  destroy() {}
};

function schemaMarker(dotKey) {
  const dot = dotKey.indexOf('.');
  const catKey = dotKey.slice(0, dot);
  const markerKey = dotKey.slice(dot + 1);
  return MARKER_SCHEMA[catKey]?.markers?.[markerKey] || null;
}

function markerFromImport(dotKey, rawValue, rawUnit, importContext = null) {
  const schema = schemaMarker(dotKey);
  const normalized = normalizeToSI(dotKey, rawValue, rawUnit, importContext);
  return {
    ...schema,
    values: [normalized],
  };
}

function assertImportedMarkerCharts(caseDef) {
  const {
    name,
    key,
    rawValue,
    rawUnit,
    expectedStored,
    expectedDisplay,
    importContext = null,
    forbiddenDisplays = [],
  } = caseDef;
  const id = key.replace('.', '_');
  const marker = markerFromImport(key, rawValue, rawUnit, importContext);
  const stored = marker.values[0];
  const unitLabel = marker.unit ? ` ${marker.unit}` : '';

  assert(`${name}: schema marker exists`, !!schemaMarker(key), key);
  assert(`${name}: import stores canonical chart value`,
    approx(stored, expectedStored),
    `stored ${stored}, expected ${expectedStored}`);

  state.rangeMode = 'reference';
  state.markerRegistry = {};
  state.chartInstances = {};

  const html = renderChartCard(id, marker, ['Imported']);
  assert(`${name}: chart card latest value uses canonical value`,
    html.includes(`class="chart-card-latest-value val-normal">${expectedDisplay}</strong>`),
    expectedDisplay);
  assert(`${name}: compact chart value uses canonical value`,
    html.includes(`class="chart-value-num val-normal">${expectedDisplay}</div>`),
    expectedDisplay);
  assert(`${name}: chart card status remains normal`,
    html.includes('class="chart-card chart-card-normal"'),
    html.slice(0, 160));
  for (const forbidden of forbiddenDisplays) {
    assert(`${name}: chart card does not show ${forbidden}`,
      !html.includes(forbidden),
      forbidden);
  }

  const canvas = { id: `chart-${id}`, style: {}, getContext: () => ({}) };
  canvases.set(`chart-${id}`, canvas);
  createLineChart(id, marker, ['Imported']);
  const chart = state.chartInstances[id];
  const chartValue = chart?.data?.datasets?.[0]?.data?.[0];
  assert(`${name}: Chart.js dataset receives canonical value`,
    approx(chartValue, expectedStored),
    `dataset ${chartValue}, expected ${expectedStored}`);

  const label = chart?.options?.plugins?.tooltip?.callbacks?.label?.({
    dataset: chart.data.datasets[0],
    parsed: { y: expectedStored },
  });
  assert(`${name}: Chart.js tooltip formats canonical value`,
    String(label).trim() === `${expectedDisplay}${unitLabel}`.trim(),
    `tooltip "${label}"`);
}

try {
  assertImportedMarkerCharts({
    name: 'neutrophils fraction percent import',
    key: 'differential.neutrophilsPct',
    rawValue: 0.609,
    rawUnit: '%',
    importContext: { refMin: 45, refMax: 70 },
    expectedStored: 0.609,
    expectedDisplay: '0.609',
    forbiddenDisplays: ['0.006', '0.00609'],
  });

  assertImportedMarkerCharts({
    name: 'monocytes fraction percent import',
    key: 'differential.monocytesPct',
    rawValue: 0.074,
    rawUnit: 'PERCENTAGE',
    expectedStored: 0.074,
    expectedDisplay: '0.074',
    forbiddenDisplays: ['0.001', '0.00074'],
  });

  assertImportedMarkerCharts({
    name: 'lymphocytes fraction percent import',
    key: 'differential.lymphocytesPct',
    rawValue: 0.332,
    rawUnit: '%',
    expectedStored: 0.332,
    expectedDisplay: '0.332',
    forbiddenDisplays: ['0.003', '0.00332'],
  });

  assertImportedMarkerCharts({
    name: 'eosinophils fraction percent import',
    key: 'differential.eosinophilsPct',
    rawValue: 0.041,
    rawUnit: '%',
    expectedStored: 0.041,
    expectedDisplay: '0.041',
    forbiddenDisplays: ['0.00041'],
  });

  assertImportedMarkerCharts({
    name: 'basophils fraction percent import',
    key: 'differential.basophilsPct',
    rawValue: 0.006,
    rawUnit: '%',
    expectedStored: 0.006,
    expectedDisplay: '0.006',
    forbiddenDisplays: ['0.00006'],
  });

  assertImportedMarkerCharts({
    name: 'whole-number differential percent import',
    key: 'differential.neutrophilsPct',
    rawValue: 60.9,
    rawUnit: '%',
    expectedStored: 0.609,
    expectedDisplay: '0.609',
    forbiddenDisplays: ['60.9'],
  });

  assertImportedMarkerCharts({
    name: 'whole-number lymphocytes percent import',
    key: 'differential.lymphocytesPct',
    rawValue: 33.2,
    rawUnit: '%',
    expectedStored: 0.332,
    expectedDisplay: '0.332',
    forbiddenDisplays: ['33.2'],
  });

  assertImportedMarkerCharts({
    name: 'whole-number eosinophils percent import',
    key: 'differential.eosinophilsPct',
    rawValue: 4.1,
    rawUnit: '%',
    expectedStored: 0.041,
    expectedDisplay: '0.041',
    forbiddenDisplays: ['4.10'],
  });

  assertImportedMarkerCharts({
    name: 'whole-number basophils percent import',
    key: 'differential.basophilsPct',
    rawValue: 0.6,
    rawUnit: '%',
    importContext: { refMin: 0, refMax: 2 },
    expectedStored: 0.006,
    expectedDisplay: '0.006',
    forbiddenDisplays: ['0.600'],
  });

  assertImportedMarkerCharts({
    name: 'native percent marker import',
    key: 'hormones.freeTestosteronePercentage',
    rawValue: 2.1,
    rawUnit: '%',
    expectedStored: 2.1,
    expectedDisplay: '2.10',
    forbiddenDisplays: ['0.021'],
  });

  assertImportedMarkerCharts({
    name: 'HbA1c percent import',
    key: 'diabetes.hba1c',
    rawValue: 5.7,
    rawUnit: '%',
    expectedStored: 38.8,
    expectedDisplay: '38.8',
    forbiddenDisplays: ['5.70'],
  });

  assertImportedMarkerCharts({
    name: 'absolute differential count import',
    key: 'differential.neutrophils',
    rawValue: 3.22,
    rawUnit: '10^9/l',
    expectedStored: 3.22,
    expectedDisplay: '3.22',
    forbiddenDisplays: ['0.032'],
  });
} finally {
  document.getElementById = saved.getElementById;
  state.chartInstances = saved.chartInstances;
  state.markerRegistry = saved.markerRegistry;
  state.rangeMode = saved.rangeMode;
  if (saved.Chart === undefined) delete window.Chart;
  else window.Chart = saved.Chart;
  if (savedGetComputedStyle === undefined) delete globalThis.getComputedStyle;
  else globalThis.getComputedStyle = savedGetComputedStyle;
}

console.log(`\nResults: ${pass} passed, ${fail} failed, ${pass + fail} total`);
if (fail > 0) process.exit(1);
