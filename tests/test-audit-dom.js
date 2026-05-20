// test-audit-dom.js — Functional safeMarkerId-guard assertions extracted from
// test-audit.js's section 3b. Stays in the puppeteer runner: it proves the
// XSS guards in category-page-view.js no-op on adversarial input AT RUNTIME, which needs a
// live DOM (rendered category header, modal-overlay) + a populated state.
// The section-3b *source-inspection* asserts (guard wiring present) live in
// test-audit.js (Vitest).
//
// Run: fetch('tests/test-audit-dom.js').then(r=>r.text()).then(s=>Function(s)())

return (async function() {
  let pass = 0, fail = 0;
  function assert(name, condition, detail) {
    if (condition) { pass++; console.log(`%c PASS %c ${name}`, 'background:#22c55e;color:#fff;padding:2px 6px;border-radius:3px', '', detail || ''); }
    else { fail++; console.error(`%c FAIL %c ${name}`, 'background:#ef4444;color:#fff;padding:2px 6px;border-radius:3px', '', detail || ''); }
  }

  console.log('%c Audit DOM Tests — safeMarkerId runtime guards ', 'background:#6366f1;color:#fff;font-size:14px;padding:4px 12px;border-radius:4px');

  // Functional: prove the guards actually no-op on adversarial input.
  // Need at least one navigation target so a "did anything change?" check
  // is meaningful. Use a known-safe categoryKey for the control.
  if (window.showCategory && window._labState?.importedData) {
    window.showCategory('biochemistry');
    await new Promise(r => setTimeout(r, 50));
    const beforeHeading = document.querySelector('.category-header h2')?.textContent || null;
    // Surface a degraded environment as a FAILURE, not a silent skip — if the
    // control category doesn't render its heading, the two injection-guard
    // probes below can't run, and a hardcoded `true` here would mask that.
    assert('control category heading rendered (precondition for guard probes)', !!beforeHeading);
    if (beforeHeading) {
      window.showCategory("hormones');alert(1);//");
      await new Promise(r => setTimeout(r, 30));
      assert('showCategory no-ops on quote-injection categoryKey (heading unchanged)',
        document.querySelector('.category-header h2')?.textContent === beforeHeading);
      window.showCategory('__proto__');
      await new Promise(r => setTimeout(r, 30));
      assert('showCategory no-ops on __proto__ categoryKey (heading unchanged)',
        document.querySelector('.category-header h2')?.textContent === beforeHeading);
    }
    const overlay = document.getElementById('modal-overlay');
    const openBefore = !!overlay?.classList.contains('show');
    window.showDetailModal("biochemistry_glucose');alert(2);//");
    await new Promise(r => setTimeout(r, 30));
    assert('showDetailModal does not open on quote-injection id',
      !!overlay?.classList.contains('show') === openBefore);
    assert('renderChartCard returns "" on quote-injection id',
      window.renderChartCard("foo';evil('", { name: 'x', values: [1] }, ['2025-01-01']) === '');
    const safeRender = window.renderChartCard('biochemistry_glucose', { name: 'Glucose', values: [5] }, ['2025-01-01']) || '';
    assert('renderChartCard returns valid HTML on safe id',
      safeRender.includes('biochemistry_glucose') && safeRender.includes('chart-card'));
  } else {
    assert('window.showCategory + populated state available for functional guard test', false,
      'category handlers or _labState.importedData missing — cannot run runtime guard probes');
  }

  console.log(`\n%c Audit DOM: ${pass} passed, ${fail} failed `, fail > 0 ? 'background:#ef4444;color:#fff;font-size:14px;padding:4px 12px;border-radius:4px' : 'background:#22c55e;color:#fff;font-size:14px;padding:4px 12px;border-radius:4px');
  if (typeof window.__TEST_RESULTS === 'undefined') window.__TEST_RESULTS = {};
  window.__TEST_RESULTS['test-audit-dom'] = { pass, fail };
})();
