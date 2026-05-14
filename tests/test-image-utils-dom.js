// test-image-utils-dom.js — DOM-runtime assertions extracted from
// test-image-utils.js (sections 6 + 7). Stays in the puppeteer runner
// because it asserts on the live page's DOM (document.getElementById)
// and resolved CSSOM (document.styleSheets). The source-string checks
// for the same elements + CSS rules live in test-image-utils.js (Vitest).
//
// Run: fetch('tests/test-image-utils-dom.js').then(r=>r.text()).then(s=>Function(s)())

return (async function() {
  let pass = 0, fail = 0;
  function assert(name, condition, detail) {
    if (condition) { pass++; console.log(`%c PASS %c ${name}`, 'background:#22c55e;color:#fff;padding:2px 6px;border-radius:3px', '', detail || ''); }
    else { fail++; console.error(`%c FAIL %c ${name}`, 'background:#ef4444;color:#fff;padding:2px 6px;border-radius:3px', '', detail || ''); }
  }

  console.log('%c Image Utils DOM Tests ', 'background:#6366f1;color:#fff;font-size:14px;padding:4px 12px;border-radius:4px');

  // ═══════════════════════════════════════
  // 6. HTML structure
  // ═══════════════════════════════════════
  console.log('%c 6. HTML Structure ', 'font-weight:bold;color:#f59e0b');

  assert('chat-attach-btn exists', !!document.getElementById('chat-attach-btn'));
  assert('chat-attach-preview exists', !!document.getElementById('chat-attach-preview'));
  assert('chat-image-input exists', !!document.getElementById('chat-image-input'));
  assert('chat-input-row wraps inputs', !!document.querySelector('.chat-input-row'));
  const fileInput = document.getElementById('chat-image-input');
  assert('File input accepts images', fileInput && fileInput.accept.includes('image/'));

  // ═══════════════════════════════════════
  // 7. CSS classes loaded in page
  // ═══════════════════════════════════════
  console.log('%c 7. CSS Classes ', 'font-weight:bold;color:#f59e0b');

  const styleSheets = [...document.styleSheets];
  let allRules = '';
  for (const ss of styleSheets) {
    try { for (const rule of ss.cssRules) allRules += rule.cssText + '\n'; } catch {}
  }
  assert('.chat-attach-btn style loaded', allRules.includes('.chat-attach-btn'));
  assert('.chat-attach-preview style loaded', allRules.includes('.chat-attach-preview'));
  assert('.chat-attach-thumb style loaded', allRules.includes('.chat-attach-thumb'));
  assert('.chat-attach-remove style loaded', allRules.includes('.chat-attach-remove'));
  assert('.chat-image-badge style loaded', allRules.includes('.chat-image-badge'));
  assert('.chat-drop-active style loaded', allRules.includes('.chat-drop-active'));

  console.log(`\n%c Image Utils DOM: ${pass} passed, ${fail} failed `, fail > 0 ? 'background:#ef4444;color:#fff;font-size:14px;padding:4px 12px;border-radius:4px' : 'background:#22c55e;color:#fff;font-size:14px;padding:4px 12px;border-radius:4px');
  if (typeof window.__TEST_RESULTS === 'undefined') window.__TEST_RESULTS = {};
  window.__TEST_RESULTS['test-image-utils-dom'] = { pass, fail };
})();
