// test-dashboard-knowledge-base-dom.js — section 5 (picker open/dismiss)
// extracted from test-dashboard-knowledge-base.js. Stays in the puppeteer
// runner: openPersonalizeAIPicker() attaches a real overlay to the document,
// the assertions read back classList/querySelectorAll on it, and dismissal
// goes through a real click handler. The HTML-string rendering checks
// (sections 1-4, 6, 7) live in test-dashboard-knowledge-base.js (Vitest).
//
// Run: fetch('tests/test-dashboard-knowledge-base-dom.js').then(r=>r.text()).then(s=>Function(s)())

return (async function() {
  let pass = 0, fail = 0;
  function assert(name, condition, detail) {
    if (condition) { pass++; console.log(`%c PASS %c ${name}`, 'background:#22c55e;color:#fff;padding:2px 6px;border-radius:3px', '', detail || ''); }
    else { fail++; console.error(`%c FAIL %c ${name}`, 'background:#ef4444;color:#fff;padding:2px 6px;border-radius:3px', '', detail || ''); }
  }

  console.log('%c Dashboard KB Picker DOM Tests ', 'background:#6366f1;color:#fff;font-size:14px;padding:4px 12px;border-radius:4px');

  const cards = await import('../js/context-cards.js');

  // ─── 5. Picker opens + dismisses ───
  const before = document.getElementById('ai-personalize-picker-overlay');
  assert('picker overlay not present before open', !before || !before.classList.contains('show'));

  cards.openPersonalizeAIPicker();
  const overlay = document.getElementById('ai-personalize-picker-overlay');
  assert('picker overlay attached on open',
    !!overlay && overlay.classList.contains('show'));
  // v1.3.28 reverted to 2 cards — DNA was a category mistake (it's
  // biological data, not a personalization preference).
  assert('picker has two option cards (Lens + KB)',
    overlay && overlay.querySelectorAll('.ai-picker-card').length === 2);
  const titles = overlay
    ? Array.from(overlay.querySelectorAll('.ai-picker-title')).map(t => t.textContent.trim())
    : [];
  assert('picker offers Interpretive Lens and Knowledge Base',
    titles.includes('Interpretive Lens') && titles.includes('Knowledge Base'));
  assert('picker does NOT offer DNA Data', !titles.includes('DNA Data'));
  assert('picker has cancel button',
    !!(overlay && overlay.querySelector('#ai-personalize-picker-cancel')));

  // Dismiss via the Cancel button click handler.
  overlay?.querySelector('#ai-personalize-picker-cancel')?.click();
  assert('cancel dismisses overlay', !!overlay && !overlay.classList.contains('show'));

  console.log(`\n%c Dashboard KB Picker DOM: ${pass} passed, ${fail} failed `, fail > 0 ? 'background:#ef4444;color:#fff;font-size:14px;padding:4px 12px;border-radius:4px' : 'background:#22c55e;color:#fff;font-size:14px;padding:4px 12px;border-radius:4px');
  if (typeof window.__TEST_RESULTS === 'undefined') window.__TEST_RESULTS = {};
  window.__TEST_RESULTS['test-dashboard-knowledge-base-dom'] = { pass, fail };
})();
