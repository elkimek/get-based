// test-dashboard-data-protection-dom.js — section 6 (picker open/dismiss)
// extracted from test-dashboard-data-protection.js. Stays in the puppeteer
// runner: openDataProtectionPicker() attaches a real overlay to the
// document, the assertions read back classList/querySelectorAll on it, and
// dismissal goes through a real click handler. The HTML-string rendering
// checks (sections 1-5, 7) live in test-dashboard-data-protection.js (Vitest).
//
// Run: fetch('tests/test-dashboard-data-protection-dom.js').then(r=>r.text()).then(s=>Function(s)())

return (async function() {
  let pass = 0, fail = 0;
  function assert(name, condition, detail) {
    if (condition) { pass++; console.log(`%c PASS %c ${name}`, 'background:#22c55e;color:#fff;padding:2px 6px;border-radius:3px', '', detail || ''); }
    else { fail++; console.error(`%c FAIL %c ${name}`, 'background:#ef4444;color:#fff;padding:2px 6px;border-radius:3px', '', detail || ''); }
  }

  console.log('%c Data Protection Picker DOM Tests ', 'background:#6366f1;color:#fff;font-size:14px;padding:4px 12px;border-radius:4px');

  const cards = await import('../js/context-cards.js');

  // ─── 6. Picker behavior ──────────────────────────────────
  cards.openDataProtectionPicker();
  const overlay = document.getElementById('data-protection-picker-overlay');
  assert('picker overlay attached', !!overlay && overlay.classList.contains('show'));
  assert('picker has 3 cards (encryption/sync/backup) when backup supported',
    overlay && overlay.querySelectorAll('.dashboard-picker-card').length === 3);
  assert('cancel button present',
    !!(overlay && overlay.querySelector('#data-protection-picker-cancel')));
  overlay?.querySelector('#data-protection-picker-cancel')?.click();
  assert('cancel dismisses overlay', !!overlay && !overlay.classList.contains('show'));

  console.log(`\n%c Data Protection Picker DOM: ${pass} passed, ${fail} failed `, fail > 0 ? 'background:#ef4444;color:#fff;font-size:14px;padding:4px 12px;border-radius:4px' : 'background:#22c55e;color:#fff;font-size:14px;padding:4px 12px;border-radius:4px');
  if (typeof window.__TEST_RESULTS === 'undefined') window.__TEST_RESULTS = {};
  window.__TEST_RESULTS['test-dashboard-data-protection-dom'] = { pass, fail };
})();
