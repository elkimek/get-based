// test-table-heatmap-empty.js — Table/Heatmap views skip all-null markers
// Covers: renderTableView and renderHeatmapView filter markers with no values,
// render an empty-state message when zero markers have data, and still render
// markers that have at least one non-null value.
// Run: fetch('tests/test-table-heatmap-empty.js').then(r=>r.text()).then(s=>Function(s)())

return (async function() {
  let pass = 0, fail = 0;
  function assert(name, condition, detail) {
    if (condition) { pass++; console.log(`%c PASS %c ${name}`, 'background:#22c55e;color:#fff;padding:2px 6px;border-radius:3px', '', detail || ''); }
    else { fail++; console.error(`%c FAIL %c ${name}`, 'background:#ef4444;color:#fff;padding:2px 6px;border-radius:3px', '', detail || ''); }
  }

  console.log('%c Table/Heatmap empty-marker filter Tests ', 'background:#6366f1;color:#fff;font-size:14px;padding:4px 12px;border-radius:4px');

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
  const viewsSrc = await fetch('js/views.js').then(r => r.text());
  assert('renderTableView filters with m.values.some(v => v !== null)',
    /renderTableView[\s\S]{0,800}m\.values\.some\(v => v !== null\)/.test(viewsSrc));
  assert('renderHeatmapView filters with m.values.some(v => v !== null)',
    /renderHeatmapView[\s\S]{0,800}m\.values\.some\(v => v !== null\)/.test(viewsSrc));

  console.log(`\n%c ${pass} passed, ${fail} failed `, fail === 0 ? 'background:#22c55e;color:#fff;padding:4px 12px' : 'background:#ef4444;color:#fff;padding:4px 12px');
  console.log(`Result: ${pass} passed, ${fail} failed`);
})();
