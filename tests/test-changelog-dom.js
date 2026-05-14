// test-changelog-dom.js — DOM-runtime assertions extracted from test-changelog.js.
// Stays in the puppeteer runner because it needs a live browser DOM: real
// modal elements, classList toggling, innerHTML inspection after openChangelog()
// renders, and localStorage-backed forceShow behavior. The source-string +
// hasCardContent behavioral tests live in test-changelog.js (Vitest).
//
// Run: fetch('tests/test-changelog-dom.js').then(r=>r.text()).then(s=>Function(s)())

return (async function() {
  let pass = 0, fail = 0;
  function assert(name, condition, detail) {
    if (condition) { pass++; console.log(`%c PASS %c ${name}`, 'background:#22c55e;color:#fff;padding:2px 6px;border-radius:3px', '', detail || ''); }
    else { fail++; console.error(`%c FAIL %c ${name}`, 'background:#ef4444;color:#fff;padding:2px 6px;border-radius:3px', '', detail || ''); }
  }

  console.log('%c Changelog DOM Tests ', 'background:#6366f1;color:#fff;font-size:14px;padding:4px 12px;border-radius:4px');

  // ═══════════════════════════════════════
  // HTML modal DOM presence
  // ═══════════════════════════════════════
  console.log('%c HTML Modal in DOM ', 'font-weight:bold;color:#f59e0b');

  const overlayEl = document.getElementById('changelog-modal-overlay');
  const modalEl = document.getElementById('changelog-modal');
  assert('changelog-modal-overlay in DOM', !!overlayEl);
  assert('changelog-modal in DOM', !!modalEl);

  // ═══════════════════════════════════════
  // Open/close behavior
  // ═══════════════════════════════════════
  console.log('%c Open/Close Behavior ', 'font-weight:bold;color:#f59e0b');

  window.openChangelog(true);
  const ovAfterOpen = document.getElementById('changelog-modal-overlay');
  assert('openChangelog adds show class', ovAfterOpen && ovAfterOpen.classList.contains('show'));
  const modalContent = document.getElementById('changelog-modal');
  assert('Modal has close button', modalContent && modalContent.innerHTML.includes('modal-close'));
  assert("Modal has What's New heading", modalContent && modalContent.innerHTML.includes("What's New"));

  window.closeChangelog();
  const ovAfterClose = document.getElementById('changelog-modal-overlay');
  assert('closeChangelog removes show class', ovAfterClose && !ovAfterClose.classList.contains('show'));
  assert('closeChangelog marks version as seen', localStorage.getItem('labcharts-changelog-seen') !== null);

  // ── forceShow behavioral: seen=1.7.0 must auto-open even when later
  // non-forceShow patches have shipped on top of v1.7.1. ──
  console.log('%c forceShow Behavior ', 'font-weight:bold;color:#f59e0b');

  const _origSeen = localStorage.getItem('labcharts-changelog-seen');
  try {
    localStorage.setItem('labcharts-changelog-seen', '1.7.0');
    ovAfterClose?.classList.remove('show');
    window.maybeShowChangelog();
    assert('maybeShowChangelog auto-opens when a forceShow entry is newer than seen',
      ovAfterClose?.classList.contains('show') === true);
    window.closeChangelog();
    // Re-fire idempotency: after closeChangelog markChangelogSeen wrote the
    // current APP_VERSION as seen, so no entry is newer → modal must NOT re-open.
    window.maybeShowChangelog();
    assert('maybeShowChangelog stays closed once user has seen the latest version',
      ovAfterClose?.classList.contains('show') === false);
    // No-forceShow-ahead defense: when seen is newer than every forceShow entry,
    // modal must NOT auto-open even if other non-forceShow entries exist.
    localStorage.setItem('labcharts-changelog-seen', window.APP_VERSION);
    ovAfterClose?.classList.remove('show');
    window.maybeShowChangelog();
    assert('maybeShowChangelog stays closed when no forceShow entry is newer than seen',
      ovAfterClose?.classList.contains('show') === false);
  } finally {
    if (_origSeen !== null) localStorage.setItem('labcharts-changelog-seen', _origSeen);
    else localStorage.removeItem('labcharts-changelog-seen');
  }

  // ═══════════════════════════════════════
  // Inline-tag whitelist (rendered output)
  // ═══════════════════════════════════════
  // Items use <b>/<i>/<em>/<strong>/<code> for emphasis. Verify the renderer
  // both renders those AND keeps escaping anything else.
  console.log('%c Inline-Tag Rendering ', 'font-weight:bold;color:#f59e0b');

  window.openChangelog(true);
  const tagModal = document.getElementById('changelog-modal');
  const itemsHTML = tagModal?.innerHTML || '';
  assert('changelog renders <b> as bold (not literal text)',
    itemsHTML.includes('<b>') && !itemsHTML.includes('&lt;b&gt;'));
  assert('expected bold span "Medical History" present',
    /<b>The Medical Conditions card is now Medical History<\/b>/.test(itemsHTML));
  assert('changelog renders <code> as code (not literal text)',
    !itemsHTML.includes('&lt;code&gt;'));
  assert('changelog renders safe https <a> as a real link',
    /<a href="https:\/\/getbased\.health[^"]*" target="_blank" rel="noopener noreferrer">[^<]+<\/a>/.test(itemsHTML));
  window.closeChangelog();

  // Clean up
  localStorage.removeItem('labcharts-changelog-seen');

  console.log(`\n%c Changelog DOM: ${pass} passed, ${fail} failed `, fail > 0 ? 'background:#ef4444;color:#fff;font-size:14px;padding:4px 12px;border-radius:4px' : 'background:#22c55e;color:#fff;font-size:14px;padding:4px 12px;border-radius:4px');
  if (typeof window.__TEST_RESULTS === 'undefined') window.__TEST_RESULTS = {};
  window.__TEST_RESULTS['test-changelog-dom'] = { pass, fail };
})();
