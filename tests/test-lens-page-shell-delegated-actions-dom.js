// test-lens-page-shell-delegated-actions-dom.js — live lens shell delegate coverage.
//
// Run: fetch('tests/test-lens-page-shell-delegated-actions-dom.js').then(r=>r.text()).then(s=>Function(s)())

return (async function() {
  let pass = 0, fail = 0;
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

  function assert(name, condition, detail) {
    if (condition) { pass++; console.log(`%c PASS %c ${name}`, 'background:#22c55e;color:#fff;padding:2px 6px;border-radius:3px', '', detail || ''); }
    else { fail++; console.error(`%c FAIL %c ${name}`, 'background:#ef4444;color:#fff;padding:2px 6px;border-radius:3px', '', detail || ''); }
  }

  console.log('%c Lens Page Shell Delegated Actions DOM ', 'background:#6366f1;color:#fff;font-size:14px;padding:4px 12px;border-radius:4px');

  const stateModule = await import('./js/state.js');
  const st = stateModule.state;
  const originalView = st.currentView;
  const originalAddDashboard = window.addDashboardWidgetFromLens;
  const originalRemoveDashboard = window.removeDashboardWidgetFromLens;
  const profileId = window.getActiveProfileId?.() || st.currentProfile || 'default';
  const labsOrderKey = `labcharts-${profileId}-lensPageOrder-labs-v1`;
  const savedLabsOrder = localStorage.getItem(labsOrderKey);

  try {
    if (!window.getActiveData?.()?.dates?.length) {
      const resp = await fetch('data/demo-male.json');
      st.importedData = await resp.json();
      st.profileSex = 'male';
      st.profileDob = '1987-11-22';
      window.saveImportedData?.();
      window.buildSidebar?.();
    }

    localStorage.removeItem(labsOrderKey);
    window.navigate?.('labs');
    await delay(120);

    const widgets = document.querySelector('.lens-page-widgets[data-lens-route="labs"]');
    assert('Labs lens renders through shared page widget shell', !!widgets);
    assert('lens page shell controls have no inline handlers',
      !!widgets && !widgets.querySelector('.dashboard-widget-tools [onclick], .dashboard-widget-tools [onkeydown]'));
    assert('lens page shell renders move action data attributes',
      !!widgets?.querySelector('[data-lens-page-action="move-widget"][data-lens-page-direction="1"]'));

    const beforeFirst = widgets?.querySelector('.dashboard-widget[data-widget-id]')?.dataset.widgetId || '';
    widgets?.querySelector('.dashboard-widget[data-widget-id] [data-lens-page-action="move-widget"][data-lens-page-direction="1"]')?.click();
    await delay(120);
    const afterFirst = document.querySelector('.lens-page-widgets[data-lens-route="labs"] .dashboard-widget[data-widget-id]')?.dataset.widgetId || '';
    assert('delegated move action reorders lens page sections',
      !!beforeFirst && !!afterFirst && beforeFirst !== afterFirst,
      `${beforeFirst} -> ${afterFirst}`);

    const calls = [];
    window.addDashboardWidgetFromLens = id => calls.push(['add', id]);
    window.removeDashboardWidgetFromLens = id => calls.push(['remove', id]);
    const dashboardToggle = document.querySelector('.lens-page-widgets[data-lens-route="labs"] .lens-widget-dashboard-toggle[data-lens-page-action]');
    const toggleAction = dashboardToggle?.dataset.lensPageAction || '';
    const toggleId = dashboardToggle?.dataset.lensPageId || '';
    dashboardToggle?.click();
    await delay(50);
    assert('delegated dashboard toggle calls the matching dashboard bridge',
      !!toggleAction && !!toggleId &&
        calls.some(([kind, id]) => id === toggleId && `${kind}-dashboard-widget` === toggleAction),
      JSON.stringify({ toggleAction, toggleId, calls }));
  } finally {
    window.addDashboardWidgetFromLens = originalAddDashboard;
    window.removeDashboardWidgetFromLens = originalRemoveDashboard;
    if (savedLabsOrder == null) localStorage.removeItem(labsOrderKey);
    else localStorage.setItem(labsOrderKey, savedLabsOrder);
    if (originalView) window.navigate?.(originalView);
  }

  console.log(`\n%c Lens Page Shell Delegated Actions DOM: ${pass} passed, ${fail} failed `, fail > 0 ? 'background:#ef4444;color:#fff;font-size:14px;padding:4px 12px;border-radius:4px' : 'background:#22c55e;color:#fff;font-size:14px;padding:4px 12px;border-radius:4px');
  if (typeof window.__TEST_RESULTS === 'undefined') window.__TEST_RESULTS = {};
  window.__TEST_RESULTS['test-lens-page-shell-delegated-actions-dom'] = { pass, fail };
})();
