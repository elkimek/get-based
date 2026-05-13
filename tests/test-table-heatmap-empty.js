#!/usr/bin/env node
// test-table-heatmap-empty.js — Table/Heatmap views skip all-null markers.
//
// Run: node tests/test-table-heatmap-empty.js  (or via npm test)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

globalThis.window = globalThis.window || globalThis;
// views.js imports many things and reads `document` at module load.
// `document` shim — same shape as tests/_vitest-setup.js's _stubEl() pattern.
// Greptile #202 P2: the previous narrow stub (only style/appendChild/setAttribute
// on createElement) would silently break if a future views.js init touched a
// missing method like classList.add() — error would point at app code, not the
// shim. Mirror the full _stubEl shape so standalone runs stay in sync with the
// Vitest setup shim.
function _stubEl() {
  return {
    style: {}, dataset: {},
    classList: { add: () => {}, remove: () => {}, contains: () => false, toggle: () => {} },
    appendChild: () => {}, removeChild: () => {}, replaceChild: () => {},
    insertBefore: () => {}, remove: () => {},
    setAttribute: () => {}, getAttribute: () => null, removeAttribute: () => {},
    addEventListener: () => {}, removeEventListener: () => {},
    querySelector: () => null, querySelectorAll: () => [],
    getBoundingClientRect: () => ({ top: 0, left: 0, width: 0, height: 0, right: 0, bottom: 0 }),
    focus: () => {}, blur: () => {}, click: () => {},
    children: [], childNodes: [],
    innerHTML: '', textContent: '', value: '',
    parentElement: null, parentNode: null,
  };
}
if (typeof globalThis.document === 'undefined') {
  globalThis.document = {
    addEventListener: () => {}, removeEventListener: () => {},
    createElement: () => _stubEl(),
    createDocumentFragment: () => _stubEl(),
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    body: _stubEl(),
    head: _stubEl(),
    documentElement: _stubEl(),
    createTextNode: (t) => ({ textContent: t }),
  };
}
function _ls() {
  const s = new Map();
  return { getItem: k => s.has(k) ? s.get(k) : null, setItem: (k, v) => s.set(k, String(v)),
    removeItem: k => s.delete(k), clear: () => s.clear(),
    get length() { return s.size; }, key: i => Array.from(s.keys())[i] ?? null };
}
if (typeof globalThis.localStorage === 'undefined') globalThis.localStorage = _ls();
if (typeof globalThis.sessionStorage === 'undefined') globalThis.sessionStorage = _ls();
if (typeof globalThis.addEventListener !== 'function') {
  const _l = new Map();
  globalThis.addEventListener = (t, f) => { (_l.get(t) || _l.set(t, new Set()).get(t)).add(f); };
  globalThis.removeEventListener = (t, f) => { _l.get(t)?.delete(f); };
  globalThis.dispatchEvent = (ev) => { const fns = _l.get(ev?.type); if (fns) for (const fn of fns) { try { fn(ev); } catch (e) { console.error(e); } } return true; };
}
if (typeof globalThis.CSS === 'undefined') globalThis.CSS = { escape: s => String(s).replace(/[^\w-]/g, c => '\\' + c) };

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
      hasData: { name: 'Has Data', unit: 'mg/dl', values: [null, 5, null, 7], refMin: 0, refMax: 10, dates: [] },
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

  const heatHtml = views.renderHeatmapView(buildCat(), dateLabels, dates, 'testcat');
  assert('Heatmap render includes the "Has Data" marker', heatHtml.includes('Has Data'));
  assert('Heatmap render includes the "Sparse Data" marker', heatHtml.includes('Sparse Data'));
  assert('Heatmap render OMITS the "No Data" marker', !heatHtml.includes('No Data'));
  assert('Heatmap render OMITS the "Another Empty" marker', !heatHtml.includes('Another Empty'));

  const emptyHeat = views.renderHeatmapView(allEmptyCat, dateLabels, dates, 'empty');
  assert('All-empty heatmap renders empty-state message',
    emptyHeat.includes('No data yet for this category'));
  assert("Heatmap empty-state doesn't render the <table>",
    !emptyHeat.includes('<table'));

  // ═══════════════════════════════════════
  // 3. Source-grep — filter logic shape
  // ═══════════════════════════════════════
  console.log('%c 3. Filter logic shape ', 'font-weight:bold;color:#f59e0b');
  const viewsSrc = read('js/views.js');
  assert('renderTableView filters with m.values.some(v => v !== null)',
    /renderTableView[\s\S]{0,800}m\.values\.some\(v => v !== null\)/.test(viewsSrc));
  assert('renderHeatmapView filters with m.values.some(v => v !== null)',
    /renderHeatmapView[\s\S]{0,800}m\.values\.some\(v => v !== null\)/.test(viewsSrc));

console.log(`\nResults: ${pass} passed, ${fail} failed, ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
