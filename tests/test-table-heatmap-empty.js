#!/usr/bin/env node
// test-table-heatmap-empty.js — Table/Heatmap views skip all-null markers.
//
// Run: node tests/test-table-heatmap-empty.js  (or via npm test)

import './_node-shim.js';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel.replace(/^\//, '')), 'utf-8');

let pass = 0, fail = 0;
function assert(name, condition, detail) {
  if (condition) { pass++; console.log(`  PASS: ${name}`); }
  else { fail++; console.log(`  FAIL: ${name}${detail ? ' — ' + detail : ''}`); }
}

console.log('=== Table/Heatmap Empty-Marker Filter Tests ===\n');

await import('../js/state.js');
const views = await import('../js/views.js');

  // Build a tiny category-shaped object with mixed markers.
  const buildCat = ({ allEmpty = false } = {}) => ({
    label: 'Test Category',
    singleDate: null,
    singleDateLabel: null,
    markers: {
      hasData: { name: 'Has Data', unit: 'mg/dl', values: [undefined, 5, null, 7], refMin: 0, refMax: 10, dates: [] },
      sparseData: { name: 'Sparse Data', unit: 'mg/dl', values: [null, null, 3, null], refMin: 0, refMax: 10, dates: [] },
      noData: { name: 'No Data', unit: 'mg/dl', values: [null, null, null, null], refMin: 0, refMax: 10, dates: [] },
      anotherEmpty: { name: 'Another Empty', unit: 'mg/dl', values: [null, null, null, null], refMin: 0, refMax: 10, dates: [] },
      ...(allEmpty ? {} : {}),
    },
  });
  const allEmptyCat = {
    label: 'Empty Cat',
    singleDate: null,
    markers: {
      a: { name: 'A', unit: 'x', values: [null, null], refMin: null, refMax: null, dates: [] },
      b: { name: 'B', unit: 'x', values: [null, null], refMin: null, refMax: null, dates: [] },
    },
  };

  const dateLabels = ['Jan 1', 'Feb 1', 'Mar 1', 'Apr 1'];
  const dates = ['2024-01-01', '2024-02-01', '2024-03-01', '2024-04-01'];

  // ═══════════════════════════════════════
  // 1. renderTableView filters all-null markers
  // ═══════════════════════════════════════
  console.log('%c 1. renderTableView ', 'font-weight:bold;color:#f59e0b');

  const tableHtml = views.renderTableView(buildCat(), dateLabels, 'testcat', dates);
  assert('Table render includes the "Has Data" marker', tableHtml.includes('Has Data'));
  assert('Table render includes the "Sparse Data" marker (has 1 non-null)', tableHtml.includes('Sparse Data'));
  assert('Table render OMITS the "No Data" marker', !tableHtml.includes('No Data'));
  assert('Table render OMITS the "Another Empty" marker', !tableHtml.includes('Another Empty'));
  assert('Table render omits a date column with no marker values', !tableHtml.includes('Jan 1'));
  assert('Table render keeps date columns with at least one marker value',
    tableHtml.includes('Feb 1') && tableHtml.includes('Mar 1') && tableHtml.includes('Apr 1'));
  assert('Table rows render cells only for populated date columns',
    (tableHtml.match(/class="value-cell/g) || []).length === 6);

  const emptyTable = views.renderTableView(allEmptyCat, dateLabels, 'empty', dates);
  assert('All-empty category renders an empty-state message',
    emptyTable.includes('No data yet for this category'));
  assert('Empty-state message points users to the sidebar or PDF import',
    /sidebar to add a value or import a PDF/i.test(emptyTable));
  assert("Empty-state doesn't render the <table>",
    !emptyTable.includes('<table'));

  // ═══════════════════════════════════════
  // 2. renderHeatmapView filters all-null markers
  // ═══════════════════════════════════════
  console.log('%c 2. renderHeatmapView ', 'font-weight:bold;color:#f59e0b');

  const heatHtml = views.renderHeatmapView(buildCat(), dateLabels, 'testcat');
  assert('Heatmap render includes the "Has Data" marker', heatHtml.includes('Has Data'));
  assert('Heatmap render includes the "Sparse Data" marker', heatHtml.includes('Sparse Data'));
  assert('Heatmap render OMITS the "No Data" marker', !heatHtml.includes('No Data'));
  assert('Heatmap render OMITS the "Another Empty" marker', !heatHtml.includes('Another Empty'));
  assert('Heatmap render omits a date column with no marker values', !heatHtml.includes('Jan 1'));
  assert('Heatmap render keeps date columns with at least one marker value',
    heatHtml.includes('Feb 1') && heatHtml.includes('Mar 1') && heatHtml.includes('Apr 1'));
  assert('Heatmap rows render cells only for populated date columns',
    (heatHtml.match(/class="heatmap-(?:normal|high|low|missing|unrated)"/g) || []).length === 6);

  const emptyHeat = views.renderHeatmapView(allEmptyCat, dateLabels, 'empty');
  assert('All-empty heatmap renders empty-state message',
    emptyHeat.includes('No data yet for this category'));
  assert("Heatmap empty-state doesn't render the <table>",
    !emptyHeat.includes('<table'));

  // ═══════════════════════════════════════
  // 3. Source-grep — filter logic shape
  // ═══════════════════════════════════════
  console.log('%c 3. Filter logic shape ', 'font-weight:bold;color:#f59e0b');
  const categoryViewRenderersSrc = read('js/category-view-renderers.js');
  assert('Table/Heatmap share populated-date column filtering',
    (categoryViewRenderersSrc.match(/const dateColumnIndexes = populatedDateColumnIndexes\(markerEntries, labels\)/g) || []).length === 2);
  assert('Populated-date filtering treats null and undefined as missing',
    /value !== null && value !== undefined/.test(categoryViewRenderersSrc));

console.log(`\nResults: ${pass} passed, ${fail} failed, ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
