// test-openrouter-dom.js — Settings-modal DOM assertions extracted from
// test-openrouter.js's section 10. Stays in the puppeteer runner because
// it needs a live DOM: openSettingsModal renders cards, querySelectorAll
// + getElementById run against real elements. Source-string + behavioral
// checks (everything else from test-openrouter.js) live in Vitest.
//
// Run: fetch('tests/test-openrouter-dom.js').then(r=>r.text()).then(s=>Function(s)())

return (async function() {
  let pass = 0, fail = 0;
  function assert(name, condition, detail) {
    if (condition) { pass++; console.log(`%c PASS %c ${name}`, 'background:#22c55e;color:#fff;padding:2px 6px;border-radius:3px', '', detail || ''); }
    else { fail++; console.error(`%c FAIL %c ${name}`, 'background:#ef4444;color:#fff;padding:2px 6px;border-radius:3px', '', detail || ''); }
  }

  console.log('%c OpenRouter Settings-Modal DOM Tests ', 'background:#6366f1;color:#fff;font-size:14px;padding:4px 12px;border-radius:4px');

  // Provider panel cards rendered by Settings modal.
  const oldProvider = localStorage.getItem('labcharts-ai-provider');
  window.openSettingsModal('ai');
  await new Promise(r => setTimeout(r, 100));

  const providerBtns = document.querySelectorAll('.ai-provider-btn');
  assert('6 provider buttons in settings', providerBtns.length === 6, `found ${providerBtns.length}`);
  const providerValues = Array.from(providerBtns).map(b => b.dataset.provider);
  assert('provider buttons include ppq', providerValues.includes('ppq'));
  assert('provider buttons include routstr', providerValues.includes('routstr'));
  assert('provider buttons include venice', providerValues.includes('venice'));
  assert('provider buttons include ollama', providerValues.includes('ollama'));
  assert('provider buttons include openrouter', providerValues.includes('openrouter'));
  assert('button order: OpenRouter before Venice',
    providerValues.indexOf('openrouter') < providerValues.indexOf('venice'),
    `openrouter@${providerValues.indexOf('openrouter')}, venice@${providerValues.indexOf('venice')}`);
  const providerRows = Array.from(providerBtns).map(btn => Math.round(btn.getBoundingClientRect().top));
  const providerRowCount = new Set(providerRows).size;
  assert('provider buttons stay on one desktop row',
    window.innerWidth <= 720 || providerRowCount === 1,
    `rows=${providerRowCount}, viewport=${window.innerWidth}`);
  const overflowingProvider = Array.from(providerBtns).find(btn => btn.scrollWidth > btn.clientWidth + 1);
  assert('provider button labels fit on desktop',
    window.innerWidth <= 720 || !overflowingProvider,
    overflowingProvider ? `${overflowingProvider.dataset.provider}: ${overflowingProvider.scrollWidth}px > ${overflowingProvider.clientWidth}px` : '');

  window.switchAIProvider('openrouter');
  await new Promise(r => setTimeout(r, 100));
  assert('openrouter-key-input exists in DOM', !!document.getElementById('openrouter-key-input'));
  assert('openrouter-key-status exists in DOM', !!document.getElementById('openrouter-key-status'));
  assert('openrouter-model-area exists in DOM', !!document.getElementById('openrouter-model-area'));
  assert('save-openrouter-key-btn exists in DOM', !!document.getElementById('save-openrouter-key-btn'));

  if (oldProvider) window.setAIProvider(oldProvider);
  window.closeSettingsModal();

  console.log(`\n%c OpenRouter DOM: ${pass} passed, ${fail} failed `, fail > 0 ? 'background:#ef4444;color:#fff;font-size:14px;padding:4px 12px;border-radius:4px' : 'background:#22c55e;color:#fff;font-size:14px;padding:4px 12px;border-radius:4px');
  if (typeof window.__TEST_RESULTS === 'undefined') window.__TEST_RESULTS = {};
  window.__TEST_RESULTS['test-openrouter-dom'] = { pass, fail };
})();
