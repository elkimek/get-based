// test-dashboard-widget-delegated-actions-dom.js — live dashboard widget delegate coverage.
//
// Run: fetch('tests/test-dashboard-widget-delegated-actions-dom.js').then(r=>r.text()).then(s=>Function(s)())

return (async function() {
  let pass = 0, fail = 0;
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

  function assert(name, condition, detail) {
    if (condition) { pass++; console.log(`%c PASS %c ${name}`, 'background:#22c55e;color:#fff;padding:2px 6px;border-radius:3px', '', detail || ''); }
    else { fail++; console.error(`%c FAIL %c ${name}`, 'background:#ef4444;color:#fff;padding:2px 6px;border-radius:3px', '', detail || ''); }
  }

  console.log('%c Dashboard Widget Delegated Actions DOM ', 'background:#6366f1;color:#fff;font-size:14px;padding:4px 12px;border-radius:4px');

  const stateModule = await import('./js/state.js');
  const st = stateModule.state;
  const originalView = st.currentView;

  try {
    if (!window.getActiveData?.()?.dates?.length) {
      const resp = await fetch('data/demo-male.json');
      st.importedData = await resp.json();
      st.profileSex = 'male';
      st.profileDob = '1987-11-22';
      window.saveImportedData?.();
      window.buildSidebar?.();
    }

    window.closeDashboardWidgetPicker?.();
    window.toggleDashboardOrganizeMode?.(false);
    window.navigate?.('dashboard');
    await delay(100);

    const customizeBtn = document.querySelector('.dashboard-sticky-actions [data-dashboard-widget-action="toggle-organize"]');
    assert('dashboard sticky controls render delegated actions', !!customizeBtn);
    customizeBtn?.click();
    await delay(100);

    assert('delegated customize click enters organize mode',
      !!document.querySelector('.dashboard-widgets.is-organizing'));
    assert('dashboard widget chrome has no inline handlers in organize mode',
      !document.querySelector('.dashboard-sticky-actions [onclick], .dashboard-organize-footer [onclick], .dashboard-widget-chrome [onclick], .dashboard-widget[ondragstart], .dashboard-widget[ondragover], .dashboard-widget[ondrop]'));
    assert('organize controls render move/hide data actions',
      !!document.querySelector('.dashboard-widget-tool[data-dashboard-widget-action="move-widget"][data-dashboard-widget-direction]') &&
        !!document.querySelector('.dashboard-widget-tool[data-dashboard-widget-action="hide-widget"]'));

    const addBtn = document.querySelector('.dashboard-sticky-actions [data-dashboard-widget-action="open-picker"]');
    addBtn?.click();
    await delay(100);
    let overlay = document.getElementById('dashboard-widget-picker-overlay');
    assert('delegated add-widget click opens picker', !!overlay);
    assert('dashboard widget picker has no inline handlers',
      !!overlay && !overlay.querySelector('[onclick], [oninput], [ondragstart], [ondragover], [ondrop]'));

    overlay?.querySelector('[data-dashboard-widget-action="close-picker"]')?.click();
    await delay(50);
    assert('delegated picker close action removes overlay',
      !document.getElementById('dashboard-widget-picker-overlay'));

    window.openDashboardWidgetPicker?.();
    await delay(100);
    overlay = document.getElementById('dashboard-widget-picker-overlay');
    const markerSearch = document.getElementById('dashboard-marker-widget-search');
    const markerOptions = Array.from(document.querySelectorAll('.dashboard-marker-widget-option'));
    if (markerSearch && markerOptions.length) {
      markerSearch.value = 'zzzz-no-marker-match';
      markerSearch.dispatchEvent(new Event('input', { bubbles: true }));
      await delay(50);
      assert('delegated marker search input filters picker cards',
        markerOptions.every(option => option.hidden) &&
          document.getElementById('dashboard-marker-widget-empty')?.hidden === false);
    } else {
      assert('delegated marker search input is optional when no marker cards exist', !!markerSearch);
    }

    overlay?.click();
    await delay(50);
    assert('picker backdrop click closes only through delegated target check',
      !document.getElementById('dashboard-widget-picker-overlay'));
  } finally {
    window.closeDashboardWidgetPicker?.();
    window.toggleDashboardOrganizeMode?.(false);
    if (originalView) window.navigate?.(originalView);
  }

  console.log(`\n%c Dashboard Widget Delegated Actions DOM: ${pass} passed, ${fail} failed `, fail > 0 ? 'background:#ef4444;color:#fff;font-size:14px;padding:4px 12px;border-radius:4px' : 'background:#22c55e;color:#fff;font-size:14px;padding:4px 12px;border-radius:4px');
  if (typeof window.__TEST_RESULTS === 'undefined') window.__TEST_RESULTS = {};
  window.__TEST_RESULTS['test-dashboard-widget-delegated-actions-dom'] = { pass, fail };
})();
