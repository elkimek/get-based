// test-wearables-dom.js — DOM-runtime islands extracted from test-wearables.js.
// Stays in the puppeteer runner: the openWearableDetail() sections build a
// live #detail-modal with a Chart.js instance, and the JSZip smoke needs a
// real <script> injection to load /vendor/jszip.min.js. Everything else from
// test-wearables.js (~549 asserts) runs in Vitest.
//
// Four islands:
//   A. Detail modal — HRV + activity_score: modal-overlay show class,
//      detail-modal innerHTML, chart-modal canvas, chartInstances.modal.
//   B. JSZip lazy-loader functional smoke — clear window.JSZip, route a
//      .zip File through importAppleHealthFile, confirm loadJSZip set it.
//   C. SpO2 modal-renderer parity — modal renders "97 %" not "97.0 %".
//   D. Daytime-empty-state HRV modal — "Not from Oura · why?" row + tooltip.
//
// Run: fetch('tests/test-wearables-dom.js').then(r=>r.text()).then(s=>Function(s)())

return (async function() {
  let pass = 0, fail = 0;
  function assert(name, condition, detail) {
    if (condition) { pass++; console.log(`%c PASS %c ${name}`, 'background:#22c55e;color:#fff;padding:2px 6px;border-radius:3px', '', detail || ''); }
    else { fail++; console.error(`%c FAIL %c ${name}`, 'background:#ef4444;color:#fff;padding:2px 6px;border-radius:3px', '', detail || ''); }
  }
  async function waitFor(condition, timeoutMs = 1200, intervalMs = 25) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (condition()) return true;
      await new Promise(r => setTimeout(r, intervalMs));
    }
    return condition();
  }

  console.log('%c Wearables DOM Tests ', 'background:#6366f1;color:#fff;font-size:14px;padding:4px 12px;border-radius:4px');

  const store = await import('../js/wearables-store.js');
  const ah = await import('../js/wearables-apple-health.js');
  await import('../js/wearables.js'); // registers window.openWearableDetail / closeModal / renderWearableStrip

  window._labState.importedData = window._labState.importedData || {};
  const TEST_PROFILE = window._labState.currentProfile || ('__test-wearables-dom-' + Math.random().toString(36).slice(2, 8));

  // ═══════════════════════════════════════
  // A. Detail modal — HRV + activity_score
  // ═══════════════════════════════════════
  console.log('%c A. Detail Modal ', 'font-weight:bold;color:#f59e0b');
  const detailSummary = {
    sources: { oura: { connectedSince: '2026-01-01', lastSyncAt: Date.now(), coverageDays: 5 } },
    metrics: {
      hrv_rmssd: { primarySource: 'oura', latest: 42, latestDate: '2026-04-22', baseline: 40, baselineP25: 36, baselineP75: 44, rolling: { d7: 42, d30: 40, d90: 40 }, trend30d: 'rising', weekly: [38, 40, 42] },
      activity_score: { primarySource: 'oura', latest: 0, latestDate: '2026-04-22', baseline: 0, baselineP25: 0, baselineP75: 0, rolling: { d7: 0, d30: 0, d90: 0 }, trend30d: 'flat', weekly: [0,0,0,0,0] },
    },
  };
  window._labState.importedData.wearableSummary = detailSummary;
  await store.upsertDailyBatch(TEST_PROFILE, [
    { source: 'oura', date: '2026-04-20', hrv_rmssd: 40, activity_score: 0 },
    { source: 'oura', date: '2026-04-21', hrv_rmssd: 41, activity_score: 0 },
    { source: 'oura', date: '2026-04-22', hrv_rmssd: 42, activity_score: 0 },
  ]);

  await window.openWearableDetail('hrv_rmssd');
  await waitFor(() => window._labState?.chartInstances?.modal?.data?.datasets?.[0]?.data?.length === 3);
  assert('Detail modal opens on a valid metric', document.getElementById('modal-overlay').classList.contains('show'));
  const modalHtml = document.getElementById('detail-modal').innerHTML;
  assert('Detail modal includes metric label HRV', modalHtml.includes('HRV'));
  assert('Detail modal shows latest value', /42/.test(modalHtml));
  assert('Detail modal shows Baseline (90d) stat', /Baseline/.test(modalHtml));
  assert('Detail modal shows Coverage stat', /Coverage/.test(modalHtml));
  assert('Chart canvas mounted on modal', !!document.getElementById('chart-modal'));
  assert('Chart instance stored under state.chartInstances.modal', !!window._labState.chartInstances?.modal);
  const modalChart = window._labState.chartInstances?.modal;
  assert('Chart has 3 data points matching L1 row count', modalChart?.data?.datasets?.[0]?.data?.length === 3);
  assert('Chart labels array has 3 entries', modalChart?.data?.labels?.length === 3);
  assert('Chart x-axis is time type', modalChart?.options?.scales?.x?.type === 'time');
  window.closeModal();
  assert('closeModal clears modal chart instance', !window._labState.chartInstances?.modal);

  await window.openWearableDetail('activity_score');
  await new Promise(r => setTimeout(r, 60));
  assert('Rest-mode hint shown on all-zero activity score',
    /Rest Mode/.test(document.getElementById('detail-modal').innerHTML));
  window.closeModal();
  delete window._labState.importedData.wearableSummary;

  // ═══════════════════════════════════════
  // B. JSZip lazy-loader functional smoke
  // ═══════════════════════════════════════
  // Clear window.JSZip, route through importAppleHealthFile (the public entry
  // point) with a tiny PK-header File whose name ends in .zip. JSZip will
  // reject the malformed archive — we don't care about the parse outcome,
  // only that loadJSZip set window.JSZip before the throw.
  console.log('%c B. JSZip lazy-loader ', 'font-weight:bold;color:#f59e0b');
  const _origJSZip = window.JSZip;
  try {
    delete window.JSZip;
    const bogusZip = new File(
      [new Uint8Array([0x50, 0x4b, 0x03, 0x04])],
      'bogus.zip',
      { type: 'application/zip' }
    );
    await ah.importAppleHealthFile(bogusZip).catch(() => {});
    assert('First ZIP-path call sets window.JSZip via lazy-loader',
      typeof window.JSZip !== 'undefined');
  } finally {
    if (_origJSZip) window.JSZip = _origJSZip;
  }

  // ═══════════════════════════════════════
  // C. SpO2 modal-renderer parity
  // ═══════════════════════════════════════
  // The strip-renderer version of this check ("97" not "97.0") runs in Vitest;
  // here we assert the *modal* renderer matches — catches the v1.22.2
  // divergence where the modal's inline formatV fell through to .toFixed(1).
  console.log('%c C. SpO2 Modal Parity ', 'font-weight:bold;color:#f59e0b');
  window._labState.importedData.wearableSummary = {
    sources: { oura: { connectedSince: '2026-01-01', lastSyncAt: Date.now(), coverageDays: 10 } },
    metrics: {
      spo2_avg: { primarySource: 'oura', latest: 97, latestDate: '2026-04-22', baseline: 96, baselineP25: 95, baselineP75: 98, rolling: { d7: 97, d30: 97, d90: 96 }, trend30d: 'flat', weekly: [96, 96, 97, 97, 97] },
    },
  };
  await store.upsertDailyBatch(TEST_PROFILE, [
    { source: 'oura', date: '2026-04-22', spo2_avg: 97 },
  ]);
  await window.openWearableDetail('spo2_avg');
  await new Promise(r => setTimeout(r, 60));
  const modalSpo2Html = document.getElementById('detail-modal').innerHTML;
  assert('Modal renders SpO2 97 as integer (no .0)', !/97\.0/.test(modalSpo2Html));
  window.closeModal();
  delete window._labState.importedData.wearableSummary;

  // ═══════════════════════════════════════
  // D. Daytime-empty-state HRV modal
  // ═══════════════════════════════════════
  // Primary is Oura, which has no daytime HRV → the modal's stats grid should
  // surface a "Not from {Source} · why?" empty-state row carrying the long
  // explanation in a title attr.
  console.log('%c D. Daytime-Empty-State Modal ', 'font-weight:bold;color:#f59e0b');
  const _origImported = window._labState.importedData;
  window._labState.importedData = {
    entries: [],
    wearableConnections: {
      oura:   { source: 'oura',   connectedAt: new Date().toISOString(), lastSyncAt: Date.now() },
      manual: { source: 'manual', connectedAt: new Date().toISOString(), lastSyncAt: Date.now() },
    },
    wearableSummary: {
      summaryUpdatedAt: new Date().toISOString(),
      sources: {
        oura:   { connectedSince: '2026-01-01', lastSyncAt: Date.now(), coverageDays: 5 },
        manual: { connectedSince: '2026-01-01', lastSyncAt: Date.now(), coverageDays: 1 },
      },
      metrics: {
        hrv_rmssd: { primarySource: 'oura', latest: 38, latestDate: '2026-04-23',
          baseline: 36, baselineP25: 32, baselineP75: 40,
          rolling: { d7: 37, d30: 36, d90: 36 }, trend30d: 'flat', weekly: [36, 37, 38] },
        rhr: { primarySource: 'manual', latest: 62, latestDate: '2026-04-23',
          baseline: 62, baselineP25: 62, baselineP75: 62,
          rolling: { d7: 62, d30: 62, d90: 62 }, trend30d: 'flat', weekly: [62] },
      },
    },
    changeHistory: [],
  };
  await window.openWearableDetail('hrv_rmssd');
  await new Promise(r => setTimeout(r, 250));
  const modalText = document.getElementById('detail-modal')?.textContent || '';
  assert('v1.26 P1-2: HRV modal shows empty-state row "Not from Oura · why?" (behavior)',
    /Not from Oura · why\?/.test(modalText));
  const tooltipCarrier = document.querySelector('#detail-modal .wearable-detail-stat[title*="overnight HRV only"]');
  assert('v1.26 P1-2: empty-state row carries the long explanation in title attr',
    !!tooltipCarrier);
  if (window.closeModal) window.closeModal();
  window._labState.importedData = _origImported;

  console.log(`\n%c Wearables DOM: ${pass} passed, ${fail} failed `, fail > 0 ? 'background:#ef4444;color:#fff;font-size:14px;padding:4px 12px;border-radius:4px' : 'background:#22c55e;color:#fff;font-size:14px;padding:4px 12px;border-radius:4px');
  if (typeof window.__TEST_RESULTS === 'undefined') window.__TEST_RESULTS = {};
  window.__TEST_RESULTS['test-wearables-dom'] = { pass, fail };
})();
