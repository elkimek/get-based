// test-custom-api-dom.js — Settings-modal DOM assertions extracted from
// test-custom-api.js (sections 13, 14). Stays in the puppeteer runner:
// openSettingsModal renders the provider grid, switchAIProvider renders the
// Custom panel, and the connected-state model dropdown is a real <select>
// with .options. Source-string + behavioral checks live in test-custom-api.js
// (Vitest).
//
// Run: fetch('tests/test-custom-api-dom.js').then(r=>r.text()).then(s=>Function(s)())

return (async function() {
  let pass = 0, fail = 0;
  function assert(name, condition, detail) {
    if (condition) { pass++; console.log(`%c PASS %c ${name}`, 'background:#22c55e;color:#fff;padding:2px 6px;border-radius:3px', '', detail || ''); }
    else { fail++; console.error(`%c FAIL %c ${name}`, 'background:#ef4444;color:#fff;padding:2px 6px;border-radius:3px', '', detail || ''); }
  }

  console.log('%c Custom API Settings-Modal DOM Tests ', 'background:#6366f1;color:#fff;font-size:14px;padding:4px 12px;border-radius:4px');

  // ─── 13. Settings modal DOM ───
  console.log('%c 13. Settings modal DOM ', 'font-weight:bold;color:#f59e0b');
  window.openSettingsModal('ai');
  await new Promise(r => setTimeout(r, 100));
  const providerBtns = document.querySelectorAll('.ai-provider-btn');
  assert('6 provider buttons in settings', providerBtns.length === 6, `found ${providerBtns.length}`);
  const providerValues = Array.from(providerBtns).map(b => b.dataset.provider);
  assert('provider buttons include custom', providerValues.includes('custom'));
  assert('custom button before local', providerValues.indexOf('custom') < providerValues.indexOf('ollama'));
  window.switchAIProvider('custom');
  await new Promise(r => setTimeout(r, 100));
  assert('custom-url-input exists in DOM', !!document.getElementById('custom-url-input'));
  assert('custom-key-input exists in DOM', !!document.getElementById('custom-key-input'));
  assert('panel has Save & Validate button', !!document.querySelector('.ai-provider-panel .import-btn-primary'));
  assert('panel has OpenAI-compatible description', document.querySelector('.ai-provider-desc')?.textContent.includes('OpenAI-compatible'));
  window.closeSettingsModal();

  // ─── 14. Settings DOM with connected state ───
  console.log('%c 14. Settings DOM with connected state ', 'font-weight:bold;color:#f59e0b');
  const sv_url = localStorage.getItem('labcharts-custom-url');
  const sv_key = localStorage.getItem('labcharts-custom-key');
  const sv_model = localStorage.getItem('labcharts-custom-model');
  const sv_models = localStorage.getItem('labcharts-custom-models');
  const sv_prov = localStorage.getItem('labcharts-ai-provider');
  window.setCustomApiUrl('https://api.test.com/v1');
  window.updateKeyCache && window.updateKeyCache('labcharts-custom-key', 'sk-test');
  window.setCustomApiModel('test-model');
  localStorage.setItem('labcharts-custom-models', JSON.stringify([
    { id: 'test-model', name: 'Test Model' },
    { id: 'other-model', name: 'Other Model' }
  ]));
  window.setAIProvider('custom');
  window.openSettingsModal('ai');
  await new Promise(r => setTimeout(r, 100));
  window.switchAIProvider('custom');
  await new Promise(r => setTimeout(r, 100));
  assert('connected status shown', document.getElementById('custom-key-status')?.textContent?.includes('Connected'));
  assert('model dropdown exists in connected state', !!document.getElementById('custom-model-select'));
  const select = document.getElementById('custom-model-select');
  if (select) {
    assert('model dropdown has 2 options', select.options.length === 2, `found ${select.options.length}`);
    assert('selected model is test-model', select.value === 'test-model');
  }
  assert('manual model input exists in connected state', !!document.getElementById('custom-manual-model'));
  assert('Remove button shown in connected state', document.querySelector('.ai-provider-panel')?.innerHTML.includes('handleRemoveCustomApi'));
  window.closeSettingsModal();
  if (sv_url) localStorage.setItem('labcharts-custom-url', sv_url); else localStorage.removeItem('labcharts-custom-url');
  if (sv_key) localStorage.setItem('labcharts-custom-key', sv_key); else localStorage.removeItem('labcharts-custom-key');
  if (sv_model) localStorage.setItem('labcharts-custom-model', sv_model); else localStorage.removeItem('labcharts-custom-model');
  if (sv_models) localStorage.setItem('labcharts-custom-models', sv_models); else localStorage.removeItem('labcharts-custom-models');
  if (sv_prov) localStorage.setItem('labcharts-ai-provider', sv_prov); else localStorage.removeItem('labcharts-ai-provider');
  window.updateKeyCache && window.updateKeyCache('labcharts-custom-key', '');

  console.log(`\n%c Custom API DOM: ${pass} passed, ${fail} failed `, fail > 0 ? 'background:#ef4444;color:#fff;font-size:14px;padding:4px 12px;border-radius:4px' : 'background:#22c55e;color:#fff;font-size:14px;padding:4px 12px;border-radius:4px');
  if (typeof window.__TEST_RESULTS === 'undefined') window.__TEST_RESULTS = {};
  window.__TEST_RESULTS['test-custom-api-dom'] = { pass, fail };
})();
