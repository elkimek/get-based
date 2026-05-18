// test-wearables-ui-flows.js — DOM click-driven UI behavior
// Drives real wearable UI flows through real DOM clicks: detail-modal manual
// delete (the v1.24.1 confirm-dialog regression), source picker swap,
// modular Biometrics Overview tiles, manual entry inline form, and assert IDB
// / state side-effects.

return (async function() {
  let pass = 0, fail = 0;
  function assert(name, condition, detail) {
    if (condition) { pass++; console.log(`%c PASS %c ${name}`, 'background:#22c55e;color:#fff;padding:2px 6px;border-radius:3px', '', detail || ''); }
    else { fail++; console.error(`%c FAIL %c ${name}`, 'background:#ef4444;color:#fff;padding:2px 6px;border-radius:3px', '', detail || ''); }
  }

  console.log('%c Wearables UI-Flow Tests ', 'background:#6366f1;color:#fff;font-size:14px;padding:4px 12px;border-radius:4px');

  const bust = '?bust=' + Date.now();
  const manual    = await import('../js/wearables-manual.js' + bust);
  const store     = await import('../js/wearables-store.js' + bust);
  const summary   = await import('../js/wearables-summary.js' + bust);

  // ─────────────────────────────────────────────────────────
  // Test profile + state isolation
  // ─────────────────────────────────────────────────────────
  const TEST_PROFILE_ID = 'ui-flow-test-' + Date.now().toString(36);
  const BIOMETRIC_SELECTION_KEY = `labcharts-${TEST_PROFILE_ID}-dashboardBiometricMetricsV1`;
  const DASHBOARD_WIDGET_PREFS_KEY = `labcharts-${TEST_PROFILE_ID}-dashboardWidgetsV9`;
  const origActive = localStorage.getItem('labcharts-active-profile');
  // CRITICAL: saveImportedData() keys off state.currentProfile, NOT the
  // localStorage active-profile entry. Swap both — otherwise any save
  // inside the test writes the fake state to the USER'S real profile.
  const origCurrentProfile = window._labState.currentProfile;
  localStorage.setItem('labcharts-active-profile', TEST_PROFILE_ID);
  window._labState.currentProfile = TEST_PROFILE_ID;
  const origState = window._labState.importedData;
  window._labState.importedData = {
    entries: [],
    wearableConnections: { manual: { source: 'manual', connectedAt: new Date().toISOString(), lastSyncAt: Date.now(), coverageDays: 0 }},
    wearableSummary: null,
    changeHistory: [],
  };

  // Seed manual entries so the overview renders something to click.
  await manual.logManualMetric(TEST_PROFILE_ID, 'weight', { date: '2026-04-22', value: 75.5 });
  await manual.logManualMetric(TEST_PROFILE_ID, 'rhr', { date: '2026-04-22', value: 62 });
  await manual.refreshManualSummary(TEST_PROFILE_ID);

  // Wait for navigate to render the dashboard with the overview widget.
  if (window.navigate) window.navigate('dashboard');
  await new Promise(r => setTimeout(r, 200));

  // ═══════════════════════════════════════
  // 1. Detail modal opens via openWearableDetail
  // ═══════════════════════════════════════
  console.log('%c 1. Detail Modal Open ', 'font-weight:bold;color:#f59e0b');
  await window.openWearableDetail('weight');
  await new Promise(r => setTimeout(r, 300));
  const overlay = document.getElementById('modal-overlay');
  assert('Modal overlay opens via openWearableDetail',
    overlay?.classList?.contains('show'));
  const detailHeader = document.querySelector('#detail-modal h3')?.textContent?.trim();
  assert('Detail modal header shows the metric label',
    detailHeader && detailHeader.includes('Weight'));
  // Manual entries section renders the seed row
  const entryRows = document.querySelectorAll('#detail-modal .wearable-manual-entry');
  assert('Manual entries section renders the seed row',
    entryRows.length === 1);
  const delBtn = document.querySelector('#detail-modal .wearable-manual-entry-del');
  assert('× delete button present on the manual entry',
    !!delBtn);

  // ═══════════════════════════════════════
  // 2. Confirm-dialog click flow — the v1.24.1 regression site
  // ═══════════════════════════════════════
  console.log('%c 2. Confirm Dialog Delete ', 'font-weight:bold;color:#f59e0b');
  delBtn.click();
  await new Promise(r => setTimeout(r, 200));
  // showConfirmDialog (promise-based) renders #confirm-ok / #confirm-cancel.
  // Assert the dialog appeared (not as a no-op TypeError swallowed silently).
  const confirmOk = document.getElementById('confirm-ok');
  assert('Confirm dialog renders an OK button on entry-delete click',
    !!confirmOk);
  // Click confirm and verify the IDB row disappears
  confirmOk.click();
  await new Promise(r => setTimeout(r, 800));
  const rowsAfter = await store.getDailyRange(TEST_PROFILE_ID, 'manual', '2026-04-22', '2026-04-22');
  // The 2026-04-22 row had weight + rhr. Deleting weight should leave a
  // residual row with rhr only (deleteManualMetric preserves other metrics).
  const remaining = rowsAfter.find(r => r.date === '2026-04-22');
  assert('Confirm-OK actually triggers the IDB delete (the v1.24.1 fix)',
    remaining && remaining.weight == null && remaining.rhr === 62);

  // Close any leftover modal
  if (window.closeModal) window.closeModal();
  await new Promise(r => setTimeout(r, 200));

  // ═══════════════════════════════════════
  // 3. Cancel button does NOT trigger delete
  // ═══════════════════════════════════════
  console.log('%c 3. Cancel — no delete ', 'font-weight:bold;color:#f59e0b');
  await window.openWearableDetail('rhr');
  await new Promise(r => setTimeout(r, 300));
  const delBtn2 = document.querySelector('#detail-modal .wearable-manual-entry-del');
  if (delBtn2) {
    delBtn2.click();
    await new Promise(r => setTimeout(r, 200));
    const cancelBtn = document.getElementById('confirm-cancel');
    if (cancelBtn) {
      cancelBtn.click();
      await new Promise(r => setTimeout(r, 400));
      const rowsAfterCancel = await store.getDailyRange(TEST_PROFILE_ID, 'manual', '2026-04-22', '2026-04-22');
      const stillThere = rowsAfterCancel.find(r => r.date === '2026-04-22');
      assert('Cancel button does NOT delete the entry (rhr stays at 62)',
        stillThere?.rhr === 62);
    } else {
      assert('Cancel button rendered', false, 'no #confirm-cancel after delete click');
    }
  } else {
    assert('Found delete button on rhr modal', false);
  }
  if (window.closeModal) window.closeModal();
  await new Promise(r => setTimeout(r, 200));

  // ═══════════════════════════════════════
  // 4. Source-swap button on detail modal opens picker
  // ═══════════════════════════════════════
  console.log('%c 4. Source Picker ', 'font-weight:bold;color:#f59e0b');
  // Add a second source so the swap button renders (gated on ≥2 connected)
  window._labState.importedData.wearableConnections.oura = {
    source: 'oura', connectedAt: new Date().toISOString(),
    lastSyncAt: Date.now(), coverageDays: 0,
    accessToken: 'fake-oura', refreshToken: 'fake-rfr',
    expiresAt: Date.now() + 86400000,
  };
  // Stub the summary with BOTH sources directly — a real syncWearableSummary
  // would also work but skips since oura has zero IDB rows in this test.
  window._labState.importedData.wearableSummary = {
    summaryUpdatedAt: new Date().toISOString(),
    sources: {
      manual: { connectedSince: new Date().toISOString(), lastSyncAt: Date.now(), coverageDays: 1 },
      oura:   { connectedSince: new Date().toISOString(), lastSyncAt: Date.now(), coverageDays: 0 },
    },
    metrics: {
      rhr: { primarySource: 'manual', latest: 62, latestDate: '2026-04-22',
             baseline: 62, baselineP25: 62, baselineP75: 62,
             rolling: { d7: 62, d30: 62, d90: 62 }, trend30d: 'flat', weekly: [62] },
    },
  };
  await window.openWearableDetail('rhr');
  await new Promise(r => setTimeout(r, 300));
  const swapBtn = document.querySelector('#detail-modal .wearable-modal-source-swap');
  assert('Source-swap button renders on detail modal when ≥2 wearables connected',
    !!swapBtn);
  if (swapBtn) {
    swapBtn.click();
    await new Promise(r => setTimeout(r, 200));
    const picker = document.querySelector('.wearable-source-picker');
    assert('Source-swap click opens the picker overlay',
      !!picker);
    if (picker) {
      const options = picker.querySelectorAll('button');
      assert('Picker shows ≥2 source options + an Auto fallback',
        options.length >= 3);
    }
    // dismiss picker
    document.body.click();
    await new Promise(r => setTimeout(r, 100));
  }
  if (window.closeModal) window.closeModal();
  await new Promise(r => setTimeout(r, 200));

  // ═══════════════════════════════════════
  // 5. Biometrics Overview tile click opens detail modal
  // ═══════════════════════════════════════
  console.log('%c 5. Overview Tile → Modal ', 'font-weight:bold;color:#f59e0b');
  if (window.navigate) window.navigate('dashboard');
  await new Promise(r => setTimeout(r, 200));
  const overview = document.querySelector('.dashboard-widget[data-widget-id="wearables"]');
  assert('Biometrics Overview renders on dashboard when wearableSummary populated',
    !!overview);
  assert('Dashboard no longer renders the Wearable Connections strip',
    !document.getElementById('wearable-strip') && !document.querySelector('.dashboard-widget[data-widget-id="wearable-strip"]'));
  const overviewTile = overview?.querySelector('.db-biometric-widget');
  assert('Biometrics Overview renders metric tiles inside a single widget',
    !!overviewTile && !!overview?.querySelector('.db-biometric-overview-grid'));
  if (overviewTile) {
    overviewTile.click();
    await new Promise(r => setTimeout(r, 300));
    assert('Clicking an overview metric opens the detail modal',
      document.getElementById('modal-overlay')?.classList?.contains('show'));
  }
  if (window.closeModal) window.closeModal();
  await new Promise(r => setTimeout(r, 200));

  // ═══════════════════════════════════════
  // 6. Modular metric selection — add/remove inside the overview
  // ═══════════════════════════════════════
  console.log('%c 6. Modular Metric Selection ', 'font-weight:bold;color:#f59e0b');
  await window.addDashboardBiometricMetric?.('weight');
  await new Promise(r => setTimeout(r, 300));
  const overviewAfterAdd = document.querySelector('.dashboard-widget[data-widget-id="wearables"]');
  assert('Adding weight keeps it inside Biometrics Overview',
    !!overviewAfterAdd && /Weight/i.test(overviewAfterAdd.textContent || ''));
  assert('Adding a biometric does not create a standalone biometric widget',
    !document.querySelector('.dashboard-widget[data-widget-id^="biometric_"]'));
  const selectedAfterAdd = JSON.parse(localStorage.getItem(BIOMETRIC_SELECTION_KEY) || '[]');
  assert('Added biometric persists in the overview selection',
    selectedAfterAdd.includes('weight'));
  const weightRemove = Array.from(document.querySelectorAll('.db-biometric-remove'))
    .find(btn => /Weight/i.test(btn.getAttribute('aria-label') || ''));
  assert('Overview metric renders its own remove button',
    !!weightRemove);
  if (weightRemove) {
    weightRemove.click();
    await new Promise(r => setTimeout(r, 300));
    const selectedAfterRemove = JSON.parse(localStorage.getItem(BIOMETRIC_SELECTION_KEY) || '[]');
    assert('Removing a metric updates the same overview selection',
      !selectedAfterRemove.includes('weight'));
  }

  // ═══════════════════════════════════════
  // 7. Picker + stale sync state
  // ═══════════════════════════════════════
  console.log('%c 7. Picker + Stale Sync ', 'font-weight:bold;color:#f59e0b');
  localStorage.setItem(BIOMETRIC_SELECTION_KEY, JSON.stringify(['rhr']));
  if (window._labState.importedData.wearableSummary?.sources?.oura) {
    window._labState.importedData.wearableSummary.sources.oura.coverageDays = 1;
    window._labState.importedData.wearableConnections.oura.lastSyncAt = Date.now();
  }
  const sum = window._labState.importedData.wearableSummary;
  if (sum) {
    sum.metrics.cardio_age = { primarySource: 'oura', latest: 35, latestDate: '2026-04-22',
      baseline: 35, baselineP25: 35, baselineP75: 35,
      rolling: { d7: 35, d30: 35, d90: 35 }, trend30d: 'flat', weekly: [35] };
    sum.metrics.resilience_level = { primarySource: 'oura', latest: 3, latestDate: '2026-04-22',
      baseline: 3, baselineP25: 3, baselineP75: 3,
      rolling: { d7: 3, d30: 3, d90: 3 }, trend30d: 'flat', weekly: [3] };
    if (window.navigate) window.navigate('dashboard');
    await new Promise(r => setTimeout(r, 300));
    const selectedOverview = document.querySelector('.dashboard-widget[data-widget-id="wearables"]');
    assert('Unselected biometrics stay out of the overview by default',
      selectedOverview && !/Cardio age/i.test(selectedOverview.textContent || '') && !/Resilience/i.test(selectedOverview.textContent || ''));
    assert('Fresh connected data does not show a dashboard sync button',
      !document.querySelector('.db-biometric-sync-btn'));
    window.openDashboardWidgetPicker?.();
    await new Promise(r => setTimeout(r, 200));
    const pickerOptions = Array.from(document.querySelectorAll('.dashboard-biometric-widget-option'));
    assert('Picker offers additional biometrics for the overview',
      pickerOptions.some(btn => /Cardio age/i.test(btn.textContent || '')) &&
      pickerOptions.some(btn => /Resilience/i.test(btn.textContent || '')));
    window.closeDashboardWidgetPicker?.();
    window.openDashboardBiometricPicker?.();
    await new Promise(r => setTimeout(r, 200));
    const biometricOnlyText = document.getElementById('dashboard-widget-picker-overlay')?.textContent || '';
    const biometricOnlyOptions = Array.from(document.querySelectorAll('.dashboard-biometric-widget-option'));
    const biometricOnlyGrid = document.querySelector('.dashboard-biometric-picker .dashboard-biometric-widget-grid');
    assert('Biometrics Add metrics opens the biometric-only picker',
      !!document.getElementById('dashboard-biometric-picker-title') &&
      !document.getElementById('dashboard-marker-widget-search') &&
      !biometricOnlyText.includes('Lens and tool widgets'));
    assert('Biometric-only picker has its own scroll container',
      !!biometricOnlyGrid && getComputedStyle(biometricOnlyGrid).overflowY !== 'visible');
    assert('Biometric-only picker still offers wearable/manual metrics',
      biometricOnlyOptions.some(btn => /Cardio age/i.test(btn.textContent || '')) &&
      biometricOnlyOptions.some(btn => /Resilience/i.test(btn.textContent || '')));
    window.closeDashboardWidgetPicker?.();
    await window.addDashboardBiometricMetric?.('cardio_age');
    await new Promise(r => setTimeout(r, 300));
    const overviewWithCardio = document.querySelector('.dashboard-widget[data-widget-id="wearables"]');
    assert('Picker add places the chosen biometric inside Biometrics Overview',
      !!overviewWithCardio && /Cardio age/i.test(overviewWithCardio.textContent || ''));
    window._labState.importedData.wearableConnections.oura.lastSyncAt = Date.now() - (13 * 60 * 60 * 1000);
    if (window.navigate) window.navigate('dashboard');
    await new Promise(r => setTimeout(r, 300));
    assert('Stale connected data shows the dashboard sync button',
      !!document.querySelector('.db-biometric-sync-btn'));
  }

  // ─────────────────────────────────────────────────────────
  // Cleanup — delete IDB rows + restore live state
  // ─────────────────────────────────────────────────────────
  try { await store.clearSource(TEST_PROFILE_ID, 'manual'); } catch {}
  try { await store.clearSource(TEST_PROFILE_ID, 'oura'); } catch {}
  // Drop test-profile storage keys first so a partial write during the test
  // can't survive across the swap-back.
  localStorage.removeItem(`labcharts-${TEST_PROFILE_ID}-imported`);
  localStorage.removeItem(BIOMETRIC_SELECTION_KEY);
  localStorage.removeItem(DASHBOARD_WIDGET_PREFS_KEY);
  if (origActive) localStorage.setItem('labcharts-active-profile', origActive);
  else localStorage.removeItem('labcharts-active-profile');
  window._labState.currentProfile = origCurrentProfile;
  window._labState.importedData = origState;
  try { const { deleteWearablesDB } = await import('/js/wearables-store.js'); await deleteWearablesDB(TEST_PROFILE_ID); } catch {}
  if (window.navigate) window.navigate('dashboard');

  console.log(`\n%c Tests complete: ${pass} passed, ${fail} failed `, fail ? 'background:#ef4444;color:#fff;padding:4px 12px;border-radius:4px' : 'background:#22c55e;color:#fff;padding:4px 12px;border-radius:4px');
  if (typeof window.__TEST_RESULTS !== 'undefined') window.__TEST_RESULTS = { pass, fail };
})();
