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
  const dashboardWidgetsModule = await import('./js/dashboard-widgets.js');
  const st = stateModule.state;
  const originalView = st.currentView;
  const biometricSelectionKey = dashboardWidgetsModule.dashboardBiometricSelectionKey();
  let originalSyncWearableNow;
  let originalBiometricSelection;
  let originalWearableSummary;
  let originalWearableConnections;
  let hadWearableSummary = false;
  let hadWearableConnections = false;

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
    assert('organize mode uses visual order matching widget order',
      getComputedStyle(document.querySelector('.dashboard-widgets.is-organizing')).gridAutoFlow === 'row');
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

    originalSyncWearableNow = window.syncWearableNow;
    originalBiometricSelection = localStorage.getItem(biometricSelectionKey);
    st.importedData = st.importedData || {};
    hadWearableSummary = Object.prototype.hasOwnProperty.call(st.importedData, 'wearableSummary');
    hadWearableConnections = Object.prototype.hasOwnProperty.call(st.importedData, 'wearableConnections');
    originalWearableSummary = st.importedData.wearableSummary;
    originalWearableConnections = st.importedData.wearableConnections;

    st.importedData.wearableConnections = {
      oura: {
        source: 'oura',
        connectedAt: '2026-01-01T00:00:00.000Z',
        lastSyncAt: Date.now() - (13 * 60 * 60 * 1000),
        coverageDays: 1,
        accessToken: 'test-token',
      },
    };
    st.importedData.wearableSummary = {
      summaryUpdatedAt: new Date().toISOString(),
      sources: {
        manual: { connectedSince: '2026-01-01T00:00:00.000Z', lastSyncAt: Date.now(), coverageDays: 1 },
        oura: { connectedSince: '2026-01-01T00:00:00.000Z', lastSyncAt: Date.now() - (13 * 60 * 60 * 1000), coverageDays: 1 },
      },
      metrics: {
        rhr: {
          primarySource: 'manual',
          latest: 62,
          latestDate: '2026-04-22',
          baseline: 60,
          baselineP25: 58,
          baselineP75: 62,
          rolling: { d7: 62, d30: 60, d90: 60 },
          trend30d: 'flat',
          weekly: [60, 61, 62],
        },
      },
    };
    localStorage.setItem(biometricSelectionKey, JSON.stringify(['bp_systolic', 'rhr']));
    window.addDashboardBiometricMetric?.('rhr');
    window.navigate?.('dashboard');
    await delay(250);

    const biometricWidget = document.querySelector('.dashboard-widget[data-widget-id="wearables"]');
    assert('Biometrics Overview widget renders for delegated action checks',
      !!biometricWidget);
    assert('Biometrics Overview action surface has no inline handlers',
      !!biometricWidget &&
        !biometricWidget.querySelector('.db-biometric-overview-actions [onclick], .db-biometric-overview-grid [onclick], .db-biometric-overview-grid [onkeydown]'));

    let syncCalled = false;
    window.syncWearableNow = (button) => { syncCalled = button?.classList?.contains('db-biometric-sync-btn'); };
    const syncBtn = biometricWidget?.querySelector('[data-dashboard-widget-action="sync-biometric-now"]');
    assert('Biometrics Overview sync button renders delegated action',
      !!syncBtn);
    syncBtn?.click();
    await delay(50);
    assert('Delegated Biometrics Overview sync click calls syncWearableNow',
      syncCalled);

    biometricWidget?.querySelector('[data-dashboard-widget-action="open-biometric-picker"]')?.click();
    await delay(100);
    assert('Delegated Biometrics Overview add-metrics click opens biometric picker',
      !!document.querySelector('.dashboard-biometric-picker'));
    window.closeDashboardWidgetPicker?.();
    await delay(50);

    const bpCard = document.querySelector('.db-biometric-overview-grid [data-dashboard-widget-action="open-biometric-manual-log"][data-dashboard-widget-id="bp_systolic"]');
    assert('Empty BP overview card renders delegated manual-log action',
      !!bpCard);
    bpCard?.click();
    await delay(150);
    assert('Delegated empty BP overview click opens manual BP form',
      !!document.getElementById('wl-bp-sys') && !!document.getElementById('wl-bp-dia'));
    document.querySelector('.db-biometric-overview-grid .wearable-log-cancel')?.click();
    await delay(200);
    assert('Wearable cancel still closes BP form inside dashboard delegate surface',
      !document.getElementById('wl-bp-sys') &&
        !!document.querySelector('.db-biometric-overview-grid [data-dashboard-widget-action="open-biometric-manual-log"][data-dashboard-widget-id="bp_systolic"]'));

    const removeRhr = document.querySelector('.db-biometric-overview-grid .db-biometric-remove[data-dashboard-widget-action="remove-biometric-metric"][data-dashboard-widget-id="rhr"]');
    assert('Biometrics Overview remove button renders delegated action',
      !!removeRhr);
    removeRhr?.click();
    await delay(150);
    const selectedAfterRemove = JSON.parse(localStorage.getItem(biometricSelectionKey) || '[]');
    assert('Delegated remove-metric click updates biometric selection',
      !selectedAfterRemove.includes('rhr'));
  } finally {
    if (typeof originalSyncWearableNow !== 'undefined') window.syncWearableNow = originalSyncWearableNow;
    if (typeof originalBiometricSelection === 'string') localStorage.setItem(biometricSelectionKey, originalBiometricSelection);
    else localStorage.removeItem(biometricSelectionKey);
    if (hadWearableSummary) st.importedData.wearableSummary = originalWearableSummary;
    else if (st.importedData) delete st.importedData.wearableSummary;
    if (hadWearableConnections) st.importedData.wearableConnections = originalWearableConnections;
    else if (st.importedData) delete st.importedData.wearableConnections;
    window.closeDashboardWidgetPicker?.();
    window.toggleDashboardOrganizeMode?.(false);
    if (originalView) window.navigate?.(originalView);
  }

  console.log(`\n%c Dashboard Widget Delegated Actions DOM: ${pass} passed, ${fail} failed `, fail > 0 ? 'background:#ef4444;color:#fff;font-size:14px;padding:4px 12px;border-radius:4px' : 'background:#22c55e;color:#fff;font-size:14px;padding:4px 12px;border-radius:4px');
  if (typeof window.__TEST_RESULTS === 'undefined') window.__TEST_RESULTS = {};
  window.__TEST_RESULTS['test-dashboard-widget-delegated-actions-dom'] = { pass, fail };
})();
