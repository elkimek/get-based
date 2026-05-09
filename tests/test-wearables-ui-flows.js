// test-wearables-ui-flows.js — DOM click-driven UI behavior
// Drives real wearable UI flows through real DOM clicks: detail-modal manual
// delete (the v1.24.1 confirm-dialog regression), source picker swap,
// reorder ◀▶, manual entry inline form, and assert IDB / state side-effects.

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

  // Seed manual entries so the strip renders something to click.
  await manual.logManualMetric(TEST_PROFILE_ID, 'weight', { date: '2026-04-22', value: 75.5 });
  await manual.logManualMetric(TEST_PROFILE_ID, 'rhr', { date: '2026-04-22', value: 62 });
  await manual.refreshManualSummary(TEST_PROFILE_ID);

  // Wait for navigate to render the dashboard with the strip
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
  // 5. Strip-card click opens detail modal
  // ═══════════════════════════════════════
  console.log('%c 5. Strip Card → Modal ', 'font-keight:bold;color:#f59e0b');
  if (window.navigate) window.navigate('dashboard');
  await new Promise(r => setTimeout(r, 200));
  const strip = document.getElementById('wearable-strip');
  assert('Wearable strip renders on dashboard when wearableSummary populated',
    !!strip);
  const card = strip?.querySelector('.wearable-card[role="button"]');
  if (card) {
    card.click();
    await new Promise(r => setTimeout(r, 300));
    assert('Clicking a strip card opens the detail modal',
      document.getElementById('modal-overlay')?.classList?.contains('show'));
  }
  if (window.closeModal) window.closeModal();
  await new Promise(r => setTimeout(r, 200));

  // ═══════════════════════════════════════
  // 6. Reorder mode — banner + arrows + savedOrder persist
  // ═══════════════════════════════════════
  console.log('%c 6. Reorder Mode ', 'font-weight:bold;color:#f59e0b');
  if (typeof window.toggleWearableReorder === 'function') {
    window.toggleWearableReorder();
    await new Promise(r => setTimeout(r, 200));
    const pill = document.querySelector('.wearable-strip-reorder-pill');
    assert('Reorder mode shows the accent banner pill',
      !!pill);
    const arrows = document.querySelectorAll('.wearable-reorder-arrow');
    assert('Reorder mode renders ◀ ▶ arrows on each card (≥2 cards × 2 arrows)',
      arrows.length >= 4);
    // Click a → arrow on the first non-disabled position to advance a card
    const rightArrow = Array.from(arrows).find(a => a.textContent.trim() === '▶' && !a.disabled);
    if (rightArrow) {
      const beforeOrder = (window._labState.importedData.wearableCardOrder || []).slice();
      rightArrow.click();
      await new Promise(r => setTimeout(r, 200));
      const afterOrder = (window._labState.importedData.wearableCardOrder || []).slice();
      assert('▶ arrow click writes wearableCardOrder (savedOrder persists)',
        afterOrder.length > 0 && JSON.stringify(beforeOrder) !== JSON.stringify(afterOrder));
    }
    // Exit reorder mode
    window.toggleWearableReorder();
    await new Promise(r => setTimeout(r, 200));
    assert('Toggling reorder again removes the banner pill',
      !document.querySelector('.wearable-strip-reorder-pill'));
  } else {
    assert('toggleWearableReorder exposed on window', false);
  }

  // ═══════════════════════════════════════
  // 7. Niche-card disclosure — hides cardio_age/resilience by default
  // ═══════════════════════════════════════
  console.log('%c 7. Niche Disclosure ', 'font-weight:bold;color:#f59e0b');
  // Stub niche metrics into the summary; clear savedOrder so they don't pin inline.
  // Bump oura coverageDays to 1 so it's a "with-data" source (the strip drops
  // 0-coverage sources from baseMetricOrder, which would hide cardio_age too).
  delete window._labState.importedData.wearableCardOrder;
  if (window._labState.importedData.wearableSummary?.sources?.oura) {
    window._labState.importedData.wearableSummary.sources.oura.coverageDays = 1;
  }
  // v1.30.1: cardio_age + resilience render inline alongside the rest —
  // the "vendor-specific scores" disclosure was removed (single-metric
  // collapse with a misleading label, plus pin-drift bugs across origins).
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
    assert('Niche disclosure container is gone',
      !document.querySelector('.wearable-niche-disclosure'));
    const cards = document.querySelectorAll('.wearable-card-grid .wearable-card');
    const labels = Array.from(cards).map(c => c.textContent || '');
    assert('Cardio age renders inline as a regular card',
      labels.some(t => /Cardio age/i.test(t)));
    assert('Resilience renders inline as a regular card',
      labels.some(t => /Resilience/i.test(t)));
  }

  // ─────────────────────────────────────────────────────────
  // Cleanup — delete IDB rows + restore live state
  // ─────────────────────────────────────────────────────────
  try { await store.clearSource(TEST_PROFILE_ID, 'manual'); } catch {}
  try { await store.clearSource(TEST_PROFILE_ID, 'oura'); } catch {}
  // Drop test-profile storage keys first so a partial write during the test
  // can't survive across the swap-back.
  localStorage.removeItem(`labcharts-${TEST_PROFILE_ID}-imported`);
  if (origActive) localStorage.setItem('labcharts-active-profile', origActive);
  else localStorage.removeItem('labcharts-active-profile');
  window._labState.currentProfile = origCurrentProfile;
  window._labState.importedData = origState;
  try { const { deleteWearablesDB } = await import('/js/wearables-store.js'); await deleteWearablesDB(TEST_PROFILE_ID); } catch {}
  if (window.navigate) window.navigate('dashboard');

  console.log(`\n%c Tests complete: ${pass} passed, ${fail} failed `, fail ? 'background:#ef4444;color:#fff;padding:4px 12px;border-radius:4px' : 'background:#22c55e;color:#fff;padding:4px 12px;border-radius:4px');
  if (typeof window.__TEST_RESULTS !== 'undefined') window.__TEST_RESULTS = { pass, fail };
})();
