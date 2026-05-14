// test-custom-lens-dom.js — DOM-runtime assertions extracted from
// test-custom-lens.js (sections 15, 16). Stays in the puppeteer runner:
// updateLensIndicator() reads back a real chat-header element, and
// openKnowledgeBaseModal() renders the Knowledge Base modal with the lens
// config form fields. Source-string + behavioral checks live in
// test-custom-lens.js (Vitest).
//
// Run: fetch('tests/test-custom-lens-dom.js').then(r=>r.text()).then(s=>Function(s)())

return (async function() {
  let pass = 0, fail = 0;
  function assert(name, condition, detail) {
    if (condition) { pass++; console.log(`%c PASS %c ${name}`, 'background:#22c55e;color:#fff;padding:2px 6px;border-radius:3px', '', detail || ''); }
    else { fail++; console.error(`%c FAIL %c ${name}`, 'background:#ef4444;color:#fff;padding:2px 6px;border-radius:3px', '', detail || ''); }
  }

  console.log('%c Custom Lens DOM Tests ', 'background:#6366f1;color:#fff;font-size:14px;padding:4px 12px;border-radius:4px');

  // ─── 15. Chat header indicator in DOM ───
  console.log('%c 15. Chat header indicator ', 'font-weight:bold;color:#f59e0b');
  const indicator = document.getElementById('chat-lens-indicator');
  assert('chat-lens-indicator element exists', !!indicator);
  assert('chat-lens-dot element exists', !!document.getElementById('chat-lens-dot'));
  const _savedCfg = localStorage.getItem('labcharts-lens-config');
  const _savedKey = localStorage.getItem('labcharts-lens-key');
  localStorage.removeItem('labcharts-lens-config');
  window.updateKeyCache && window.updateKeyCache('labcharts-lens-key', '');
  window.updateLensIndicator();
  assert('indicator hidden when no lens configured', indicator && indicator.style.display === 'none');
  if (_savedCfg) localStorage.setItem('labcharts-lens-config', _savedCfg);
  if (_savedKey) localStorage.setItem('labcharts-lens-key', _savedKey);

  // ─── 16. Knowledge Base modal DOM renders lens section ───
  // v1.3.24: Knowledge Base lives in its own dedicated modal, no longer
  // bundled inside Settings → AI. The same DOM IDs must still exist
  // because handleSaveLensConfig + _loadLocalLensStats look them up by ID.
  console.log('%c 16. Knowledge Base modal DOM ', 'font-weight:bold;color:#f59e0b');
  window.openKnowledgeBaseModal();
  await new Promise(r => setTimeout(r, 100));
  const lensSection = document.getElementById('custom-lens-section');
  assert('custom-lens-section exists in DOM (inside KB modal)', !!lensSection);
  if (lensSection) {
    assert('lens section has url input', !!document.getElementById('lens-url-input'));
    assert('lens section has key input', !!document.getElementById('lens-key-input'));
    assert('lens section has topk input', !!document.getElementById('lens-topk-input'));
    assert('lens section has enabled toggle', !!document.getElementById('lens-enabled-toggle'));
    assert('lens section has Save + connect button', lensSection.innerHTML.includes('handleSaveLensConfig'));
  }
  window.closeKnowledgeBaseModal();
  // Settings → AI must NOT contain the KB section anymore.
  window.openSettingsModal('ai');
  await new Promise(r => setTimeout(r, 100));
  const insideSettings = document.querySelector('.settings-tab-panel[data-tab-panel="ai"] #custom-lens-section');
  assert('Settings → AI no longer renders Knowledge Base section',
    !insideSettings,
    'KB moved to its own modal — Settings → AI should be free of it');
  window.closeSettingsModal();

  console.log(`\n%c Custom Lens DOM: ${pass} passed, ${fail} failed `, fail > 0 ? 'background:#ef4444;color:#fff;font-size:14px;padding:4px 12px;border-radius:4px' : 'background:#22c55e;color:#fff;font-size:14px;padding:4px 12px;border-radius:4px');
  if (typeof window.__TEST_RESULTS === 'undefined') window.__TEST_RESULTS = {};
  window.__TEST_RESULTS['test-custom-lens-dom'] = { pass, fail };
})();
