// test-wearables-bp-merge-dom.js — section-4 live idempotency probe extracted
// from test-wearables-bp-merge.js. Stays in the puppeteer runner: it creates
// a real card element, calls openManualLogForm() twice, and verifies the DOM
// still holds exactly one .wearable-log-form (the dia-click rebuild bug fix).
// The source-inspection regex checks live in test-wearables-bp-merge.js (Vitest).
//
// Run: fetch('tests/test-wearables-bp-merge-dom.js').then(r=>r.text()).then(s=>Function(s)())

return (async function() {
  let pass = 0, fail = 0;
  function assert(name, condition, detail) {
    if (condition) { pass++; console.log(`%c PASS %c ${name}`, 'background:#22c55e;color:#fff;padding:2px 6px;border-radius:3px', '', detail || ''); }
    else { fail++; console.error(`%c FAIL %c ${name}`, 'background:#ef4444;color:#fff;padding:2px 6px;border-radius:3px', '', detail || ''); }
  }

  console.log('%c BP Card Merge DOM Tests ', 'background:#6366f1;color:#fff;font-size:14px;padding:4px 12px;border-radius:4px');

  // Live behavior — fake card, run openManualLogForm twice, verify only one form.
  if (typeof window.openManualLogForm === 'function') {
    const card = document.createElement('div');
    card.className = 'wearable-card-empty';
    card.dataset.emptyMetric = 'bp_systolic';
    document.body.appendChild(card);
    try {
      window.openManualLogForm('bp_systolic');
      const formCountFirst = card.querySelectorAll('.wearable-log-form').length;
      assert('After first openManualLogForm call: exactly one form', formCountFirst === 1);
      // Simulate a click inside the form bubbling up to the card's onclick.
      window.openManualLogForm('bp_systolic');
      const formCountSecond = card.querySelectorAll('.wearable-log-form').length;
      assert('After second call: still exactly one form (idempotent)', formCountSecond === 1);
      // Critical sub-assert: the original sys input still has focus / is in the DOM.
      const sysInput = document.getElementById('wl-bp-sys');
      assert('Original sys input still in DOM after second openManualLogForm', !!sysInput);
    } finally {
      card.remove();
    }
  } else {
    assert('window.openManualLogForm available for idempotency probe', false,
      'wearables.js handler missing — cannot run live idempotency check');
  }

  console.log(`\n%c BP Card Merge DOM: ${pass} passed, ${fail} failed `, fail > 0 ? 'background:#ef4444;color:#fff;font-size:14px;padding:4px 12px;border-radius:4px' : 'background:#22c55e;color:#fff;font-size:14px;padding:4px 12px;border-radius:4px');
  if (typeof window.__TEST_RESULTS === 'undefined') window.__TEST_RESULTS = {};
  window.__TEST_RESULTS['test-wearables-bp-merge-dom'] = { pass, fail };
})();
