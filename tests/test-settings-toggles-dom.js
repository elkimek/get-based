// test-settings-toggles-dom.js — live DOM coverage for delegated Settings/Tweaks toggles.
//
// Run: fetch('tests/test-settings-toggles-dom.js').then(r=>r.text()).then(s=>Function(s)())

return (async function() {
  let pass = 0, fail = 0;
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

  function assert(name, condition, detail) {
    if (condition) {
      pass++;
      console.log(`%c PASS %c ${name}`, 'background:#22c55e;color:#fff;padding:2px 6px;border-radius:3px', '', detail || '');
    } else {
      fail++;
      console.error(`%c FAIL %c ${name}`, 'background:#ef4444;color:#fff;padding:2px 6px;border-radius:3px', '', detail || '');
    }
  }

  console.log('%c Settings Toggle DOM Tests ', 'background:#6366f1;color:#fff;font-size:14px;padding:4px 12px;border-radius:4px');

  const saved = {
    recs: localStorage.getItem('labcharts-show-product-recs'),
    debug: localStorage.getItem('labcharts-debug'),
    theme: localStorage.getItem('labcharts-theme'),
    sunset: localStorage.getItem('labcharts-sunset-mode'),
    crt: localStorage.getItem('labcharts-crt-effects'),
    sync: localStorage.getItem('labcharts-sync-enabled'),
  };
  let syncStateModule = null;

  try {
    syncStateModule = await import('/js/sync-settings-state.js');
    window.endTour?.();
    document.getElementById('tour-overlay')?.remove();
    document.getElementById('tour-spotlight')?.remove();
    document.getElementById('tour-tooltip')?.remove();
    document.getElementById('sync-setup-overlay')?.remove();

    localStorage.removeItem('labcharts-show-product-recs');
    localStorage.removeItem('labcharts-debug');
    localStorage.removeItem('labcharts-sunset-mode');
    localStorage.removeItem('labcharts-crt-effects');
    syncStateModule.setSyncEnabled(false);
    window.setTheme?.('cyberterm');

    window.openSettingsModal('display');
    await delay(50);
    const recToggle = document.querySelector('#settings-product-recs + .toggle-slider');
    const debugToggle = document.querySelector('#debug-mode-toggle + .toggle-slider');
    assert('Settings modal installed delegated actions',
      document.getElementById('settings-modal')?.dataset.delegatedActions === '1');
    recToggle?.click();
    debugToggle?.click();
    await delay(50);
    assert('Recommendations slider click persists off state',
      localStorage.getItem('labcharts-show-product-recs') === 'false');
    assert('Verbose logging slider click persists on state',
      localStorage.getItem('labcharts-debug') === 'true');

    window.openSettingsModal('data');
    await delay(50);
    const syncToggle = document.querySelector('#sync-section [data-sync-action="toggle-sync"] + .chat-toggle-slider');
    syncToggle?.click();
    await delay(50);
    assert('Cross-device sync slider click opens setup modal',
      document.getElementById('sync-setup-overlay')?.classList.contains('show'));
    assert('Cross-device sync checkbox click reaches checked state',
      document.querySelector('#sync-section [data-sync-action="toggle-sync"]')?.checked === true);
    document.querySelector('#sync-setup-overlay [data-sync-setup-action="setup-cancel"]')?.click();
    await delay(50);
    assert('Cross-device sync setup cancel closes modal',
      document.getElementById('sync-setup-overlay')?.classList.contains('show') !== true);

    window.openTweaksPanel();
    await delay(50);
    const sunsetToggle = document.querySelector('#tweaks-sunset-mode + .toggle-slider');
    const crtToggle = document.querySelector('#tweaks-crt-effects + .toggle-slider');
    assert('Tweaks panel installed delegated actions',
      document.getElementById('tweaks-panel-overlay')?.dataset.delegatedActions === '1');
    sunsetToggle?.click();
    crtToggle?.click();
    await delay(50);
    assert('Sunset slider click persists on state',
      localStorage.getItem('labcharts-sunset-mode') === 'true'
        && document.documentElement.dataset.sunsetMode === 'on');
    assert('CRT slider click persists on state',
      localStorage.getItem('labcharts-crt-effects') === 'true'
        && document.documentElement.dataset.crtEffects === 'on');

    window.setTheme?.('dark');
    window.setCrtEffectsEnabled?.(false);
    window.openTweaksPanel();
    await delay(50);
    const disabledCrtInput = document.querySelector('#tweaks-crt-effects');
    const disabledCrtToggle = document.querySelector('#tweaks-crt-effects + .toggle-slider');
    assert('CRT toggle is disabled on unsupported themes',
      disabledCrtInput?.disabled === true);
    disabledCrtToggle?.click();
    await delay(50);
    assert('Disabled CRT slider click does not persist on state',
      localStorage.getItem('labcharts-crt-effects') !== 'true'
        && document.documentElement.dataset.crtEffects !== 'on'
        && disabledCrtInput?.checked === false);

    window.closeTweaksPanel?.();
    window.closeSettingsModal?.();
  } finally {
    if (saved.recs === null) localStorage.removeItem('labcharts-show-product-recs');
    else localStorage.setItem('labcharts-show-product-recs', saved.recs);
    if (saved.debug === null) localStorage.removeItem('labcharts-debug');
    else localStorage.setItem('labcharts-debug', saved.debug);
    if (saved.theme === null) localStorage.removeItem('labcharts-theme');
    else localStorage.setItem('labcharts-theme', saved.theme);
    if (saved.sunset === null) localStorage.removeItem('labcharts-sunset-mode');
    else localStorage.setItem('labcharts-sunset-mode', saved.sunset);
    if (saved.crt === null) localStorage.removeItem('labcharts-crt-effects');
    else localStorage.setItem('labcharts-crt-effects', saved.crt);
    if (syncStateModule) {
      syncStateModule.setSyncEnabled(saved.sync === 'true');
      if (saved.sync === null) localStorage.removeItem('labcharts-sync-enabled');
    } else if (saved.sync === null) localStorage.removeItem('labcharts-sync-enabled');
    else localStorage.setItem('labcharts-sync-enabled', saved.sync);
    document.getElementById('sync-setup-overlay')?.remove();
    window.setTheme?.(localStorage.getItem('labcharts-theme') || 'dark');
    window.setSunsetMode?.(localStorage.getItem('labcharts-sunset-mode') === 'true');
    window.setCrtEffectsEnabled?.(localStorage.getItem('labcharts-crt-effects') === 'true');
  }

  console.log(`\n%c Settings Toggle DOM: ${pass} passed, ${fail} failed `, fail > 0 ? 'background:#ef4444;color:#fff;font-size:14px;padding:4px 12px;border-radius:4px' : 'background:#22c55e;color:#fff;font-size:14px;padding:4px 12px;border-radius:4px');
  if (typeof window.__TEST_RESULTS === 'undefined') window.__TEST_RESULTS = {};
  window.__TEST_RESULTS['test-settings-toggles-dom'] = { pass, fail };
})();
