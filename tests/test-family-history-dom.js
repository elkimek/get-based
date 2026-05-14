// test-family-history-dom.js — DOM-runtime slice of test-family-history.js.
//
// The source-inspection + pure-function coverage (COMMON_CONDITIONS,
// getConditionsSummary, the rename strings, CSS hooks, the regex guards)
// lives in tests/test-family-history.js on the Vitest runner. This file
// keeps only what genuinely needs a browser DOM:
//   - the apostrophe-condition round-trip probe (innerHTML parsing of an
//     inline onmousedown handler + dispatchEvent)
//   - the live addFamilyHistoryEntry / deleteFamilyHistoryEntry handler
//     test, which reads #fh-* inputs and re-renders renderDiagnosesModal
//     against a live #detail-modal
//
// Run: fetch('tests/test-family-history-dom.js').then(r=>r.text()).then(s=>Function(s)())

return (async function() {
  let pass = 0, fail = 0;
  function assert(name, condition, detail) {
    if (condition) { pass++; console.log(`%c PASS %c ${name}`, 'background:#22c55e;color:#fff;padding:2px 6px;border-radius:3px', '', detail || ''); }
    else { fail++; console.error(`%c FAIL %c ${name}`, 'background:#ef4444;color:#fff;padding:2px 6px;border-radius:3px', '', detail || ''); }
  }

  console.log('%c Family History — DOM-runtime Tests ', 'background:#6366f1;color:#fff;font-size:14px;padding:4px 12px;border-radius:4px');

  const cards = await import('../js/context-cards.js');
  const state = (await import('../js/state.js')).state;

  // ═══════════════════════════════════════
  // 1. Apostrophe-condition click round-trip
  // ═══════════════════════════════════════
  console.log('%c 1. Apostrophe click round-trip ', 'font-weight:bold;color:#f59e0b');

  // Simulate the round-trip in-page: build a tiny DOM, click, observe.
  const probe = document.createElement('div');
  probe.innerHTML = `<input id="probe-cond-input"><div id="probe-target"></div>`;
  document.body.appendChild(probe);
  try {
    // Synthesize the suggestion HTML the same way filterConditionSuggestions does.
    const m = "Alzheimer's Disease";
    // The library escapeHTML lives in utils.js — re-implement minimally for the probe.
    const escapeHTML = (s) => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const target = document.getElementById('probe-target');
    target.innerHTML = `<div class="ctx-suggestion-item" id="probe-suggest" onmousedown="document.getElementById('probe-cond-input').value = ${escapeHTML(JSON.stringify(m))}">${escapeHTML(m)}</div>`;
    // Simulate the click.
    const evt = new MouseEvent('mousedown', { bubbles: true });
    document.getElementById('probe-suggest').dispatchEvent(evt);
    const result = document.getElementById('probe-cond-input').value;
    assert("Apostrophe condition (Alzheimer's Disease) round-trips through inline onmousedown",
      result === "Alzheimer's Disease", `got: "${result}"`);
  } finally {
    probe.remove();
  }

  // ═══════════════════════════════════════
  // 2. Live addFamilyHistoryEntry / deleteFamilyHistoryEntry
  // ═══════════════════════════════════════
  console.log('%c 2. Live add/delete handler ', 'font-weight:bold;color:#f59e0b');

  // State-manipulation: live-call the handler against fake DOM inputs, verify
  // mutation. Wrap in try/catch because addFamilyHistoryEntry re-renders the
  // modal via renderDiagnosesModal(document.getElementById("detail-modal"))
  // and that node might not be visible in every test-runner state. We care
  // about the data mutation; the render is exercised separately.
  const savedDiag = state.importedData?.diagnoses;
  state.importedData = state.importedData || {};
  state.importedData.diagnoses = { conditions: [], note: '', familyHistory: [] };
  // Ensure the modal exists so renderDiagnosesModal's `modal.innerHTML = …`
  // doesn't throw. Detach + re-attach if necessary.
  let detachedModal = null;
  if (!document.getElementById('detail-modal')) {
    detachedModal = document.createElement('div');
    detachedModal.id = 'detail-modal';
    document.body.appendChild(detachedModal);
  }

  const probe2 = document.createElement('div');
  probe2.innerHTML = `
    <select id="fh-relative"><option value="mother" selected>Mother</option></select>
    <input id="fh-condition" value="Type 2 Diabetes">
    <input id="fh-age" value="45">
    <input id="fh-note" value="on metformin">
    <textarea id="ctx-note-input"></textarea>`;
  document.body.appendChild(probe2);
  try {
    cards.addFamilyHistoryEntry();
    const fh = state.importedData.diagnoses.familyHistory;
    assert('addFamilyHistoryEntry pushed one entry', fh && fh.length === 1);
    const entry = fh && fh[0];
    assert('Entry has relative=mother', entry && entry.relative === 'mother');
    assert('Entry has condition=Type 2 Diabetes', entry && entry.condition === 'Type 2 Diabetes');
    assert('Entry has onsetAge=45', entry && entry.onsetAge === 45);
    assert('Entry preserves note', entry && entry.note === 'on metformin');

    // Reset state for the reject-path test — renderDiagnosesModal replaced
    // probe2's #fh-relative with the modal's, but probe2 still exists and
    // duplicate IDs are tree-order-resolved. Re-inject a fresh probe with a
    // unique-id workaround: nuke the modal contents first so probe2's
    // elements win the getElementById lookup.
    const modalEl = document.getElementById('detail-modal');
    if (modalEl) modalEl.innerHTML = '';
    // Re-render probe2 inputs (in case rendering mutated the DOM elsewhere).
    probe2.innerHTML = `
      <select id="fh-relative"><option value="__evil_relative" selected>x</option></select>
      <input id="fh-condition" value="something">
      <input id="fh-age" value="50">
      <input id="fh-note" value="">
      <textarea id="ctx-note-input"></textarea>`;
    const before = state.importedData.diagnoses.familyHistory.length;
    cards.addFamilyHistoryEntry();
    assert('Tampered relative is rejected silently (no push)',
      state.importedData.diagnoses.familyHistory.length === before);

    // deleteFamilyHistoryEntry removes by index
    const lenBeforeDelete = state.importedData.diagnoses.familyHistory.length;
    cards.deleteFamilyHistoryEntry(0);
    assert('deleteFamilyHistoryEntry removes by index',
      state.importedData.diagnoses.familyHistory.length === lenBeforeDelete - 1);
  } catch (e) {
    console.warn('Live handler test threw:', e?.message || e);
    assert('Live addFamilyHistoryEntry test ran without throwing', false, e?.message);
  } finally {
    probe2.remove();
    if (detachedModal) detachedModal.remove();
    state.importedData.diagnoses = savedDiag;
  }

  console.log(`\n%c ${pass} passed, ${fail} failed `, fail === 0 ? 'background:#22c55e;color:#fff;padding:4px 12px' : 'background:#ef4444;color:#fff;padding:4px 12px');
  console.log(`Result: ${pass} passed, ${fail} failed`);
})();
