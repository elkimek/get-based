// test-family-history.js — Medical History card + family-history subsection
// Covers: addFamilyHistoryEntry / deleteFamilyHistoryEntry, FAMILY_RELATIVES
// allowlist, onsetAge bounds, saveDiagnoses null-guard with familyHistory-only,
// getConditionsSummary inclusion, AI context emission, areas-list counting,
// expanded COMMON_CONDITIONS, apostrophe-condition click fix, and the
// "Medical History" rename.
// Run: fetch('tests/test-family-history.js').then(r=>r.text()).then(s=>Function(s)())

return (async function() {
  let pass = 0, fail = 0;
  function assert(name, condition, detail) {
    if (condition) { pass++; console.log(`%c PASS %c ${name}`, 'background:#22c55e;color:#fff;padding:2px 6px;border-radius:3px', '', detail || ''); }
    else { fail++; console.error(`%c FAIL %c ${name}`, 'background:#ef4444;color:#fff;padding:2px 6px;border-radius:3px', '', detail || ''); }
  }

  console.log('%c Family History + Medical History Tests ', 'background:#6366f1;color:#fff;font-size:14px;padding:4px 12px;border-radius:4px');

  const cards = await import('../js/context-cards.js');
  const state = (await import('../js/state.js')).state;
  const constants = await import('../js/constants.js');

  // ═══════════════════════════════════════
  // 1. Expanded COMMON_CONDITIONS
  // ═══════════════════════════════════════
  console.log('%c 1. COMMON_CONDITIONS coverage ', 'font-weight:bold;color:#f59e0b');

  const conditions = constants.COMMON_CONDITIONS;
  assert('COMMON_CONDITIONS is an array', Array.isArray(conditions));
  assert('COMMON_CONDITIONS expanded beyond original 27 entries',
    conditions.length >= 100, `length=${conditions.length}`);
  // Specific items the user flagged as missing
  assert("COMMON_CONDITIONS includes Psoriasis", conditions.includes('Psoriasis'));
  assert("COMMON_CONDITIONS includes Epilepsy", conditions.includes('Epilepsy'));
  assert("COMMON_CONDITIONS includes Alzheimer's Disease",
    conditions.includes("Alzheimer's Disease"));
  // Major categories that should be covered
  assert("COMMON_CONDITIONS includes Parkinson's Disease",
    conditions.includes("Parkinson's Disease"));
  assert('COMMON_CONDITIONS includes Heart Attack (MI)',
    conditions.includes('Heart Attack (MI)'));
  assert('COMMON_CONDITIONS includes Stroke', conditions.includes('Stroke'));
  assert('COMMON_CONDITIONS includes Breast Cancer', conditions.includes('Breast Cancer'));
  assert('COMMON_CONDITIONS includes Prostate Cancer', conditions.includes('Prostate Cancer'));
  assert('COMMON_CONDITIONS includes Multiple Sclerosis', conditions.includes('Multiple Sclerosis'));
  assert('COMMON_CONDITIONS includes Bipolar Disorder', conditions.includes('Bipolar Disorder'));
  assert('COMMON_CONDITIONS includes Osteoporosis', conditions.includes('Osteoporosis'));
  // No duplicates
  const dupSet = new Set(conditions);
  assert('COMMON_CONDITIONS has no duplicates', dupSet.size === conditions.length);

  // ═══════════════════════════════════════
  // 2. Apostrophe-condition click fix
  // ═══════════════════════════════════════
  console.log('%c 2. Apostrophe click fix ', 'font-weight:bold;color:#f59e0b');

  const ctxSrc = await fetch('js/context-cards.js').then(r => r.text());
  // filterConditionSuggestions must wrap the inline call arg in JSON.stringify
  // so apostrophes survive the HTML-attribute → JS-string round-trip.
  assert("filterConditionSuggestions uses JSON.stringify(m) for inline onclick arg",
    /selectConditionSuggestion\(\$\{escapeHTML\(JSON\.stringify\(m\)\)\}\)/.test(ctxSrc));
  assert("filterFamilyConditionSuggestions uses JSON.stringify(m) for inline onclick arg",
    /selectFamilyConditionSuggestion\(\$\{escapeHTML\(JSON\.stringify\(m\)\)\}\)/.test(ctxSrc));
  // Simulate the round-trip in-page to be sure: build a tiny DOM, click, observe.
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
  // 3. FAMILY_RELATIVES allowlist + addFamilyHistoryEntry
  // ═══════════════════════════════════════
  console.log('%c 3. FAMILY_RELATIVES + addEntry ', 'font-weight:bold;color:#f59e0b');

  // FAMILY_RELATIVES isn't exported (private to context-cards.js), so we
  // assert its allowlist via the source.
  assert('FAMILY_RELATIVES declared with 8 first-degree+grandparent keys',
    /FAMILY_RELATIVES\s*=\s*\[[^\]]*'mother'[^\]]*'father'[^\]]*'sibling'[^\]]*'child'[^\]]*'maternal_grandmother'[^\]]*'maternal_grandfather'[^\]]*'paternal_grandmother'[^\]]*'paternal_grandfather'/s.test(ctxSrc));
  assert('addFamilyHistoryEntry validates relative against FAMILY_RELATIVES',
    /addFamilyHistoryEntry[\s\S]{0,1000}if \(!FAMILY_RELATIVES\.some\(r => r\.key === relative\)\) return/.test(ctxSrc));
  assert('addFamilyHistoryEntry clamps onsetAge to 0–120',
    /Math\.max\(0,\s*Math\.min\(120,\s*parseInt\(ageRaw, 10\)\)\)/.test(ctxSrc));
  assert('addFamilyHistoryEntry early-returns when relative or condition empty',
    /if \(!relative \|\| !condition\) return/.test(ctxSrc));

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

  // ═══════════════════════════════════════
  // 4. saveDiagnoses null-guard with familyHistory-only
  // ═══════════════════════════════════════
  console.log('%c 4. saveDiagnoses null-guard ', 'font-weight:bold;color:#f59e0b');

  assert('saveDiagnoses considers familyHistory.length before nulling diagnoses',
    /const fhLen = Array\.isArray\(state\.importedData\.diagnoses\.familyHistory\)[\s\S]{0,300}fhLen === 0/.test(ctxSrc));

  // Profile migration backfills familyHistory on legacy diagnoses objects.
  const profSrc = await fetch('js/profile.js').then(r => r.text());
  assert('profile.js migrates string-diagnoses into structured object with familyHistory: []',
    /data\.diagnoses\.trim\(\)\s*\?\s*\{ conditions: \[\], note: data\.diagnoses\.trim\(\), familyHistory: \[\] \}/.test(profSrc));
  assert('profile.js backfills familyHistory=[] on existing diagnoses objects without it',
    /data\.diagnoses && typeof data\.diagnoses === 'object' && !Array\.isArray\(data\.diagnoses\.familyHistory\)[\s\S]{0,200}data\.diagnoses\.familyHistory = \[\]/.test(profSrc));

  // ═══════════════════════════════════════
  // 5. getConditionsSummary includes family history
  // ═══════════════════════════════════════
  console.log('%c 5. Summary inclusion ', 'font-weight:bold;color:#f59e0b');

  const sum1 = cards.getConditionsSummary({
    conditions: [],
    familyHistory: [{ relative: 'father', condition: 'Heart Attack (MI)', onsetAge: 52 }]
  });
  assert('Summary includes "Family:" prefix when conditions empty', sum1.includes('Family:'));
  assert('Summary compacts relative + condition + @age',
    /father Heart Attack \(MI\)@52/.test(sum1), `got: "${sum1}"`);

  const sum2 = cards.getConditionsSummary({
    conditions: [],
    familyHistory: [{ relative: 'maternal_grandmother', condition: 'Breast Cancer' }]
  });
  assert('Summary normalizes "maternal_" → "mat." prefix',
    sum2.includes('mat. grandmother'), `got: "${sum2}"`);

  const sum3 = cards.getConditionsSummary({
    conditions: [{ name: 'Hypertension', severity: 'mild' }],
    familyHistory: [{ relative: 'mother', condition: 'Type 2 Diabetes', onsetAge: 45 }]
  });
  assert('Summary joins your-conditions + family with " — "',
    sum3.includes('Hypertension') && sum3.includes('Family:') && sum3.includes(' — '));

  // ═══════════════════════════════════════
  // 6. AI context emission — family history block
  // ═══════════════════════════════════════
  console.log('%c 6. AI context family history ', 'font-weight:bold;color:#f59e0b');

  const labCtxSrc = await fetch('js/lab-context.js').then(r => r.text());
  assert('Family history block emitted within [section:diagnoses]',
    /\[section:diagnoses\][\s\S]{0,1500}### Family history \(heritable\/environmental risk signal\)/.test(labCtxSrc));
  assert('Family history block iterates diag.familyHistory',
    /Array\.isArray\(diag\.familyHistory\) && diag\.familyHistory\.length[\s\S]{0,800}for \(const e of diag\.familyHistory\)/.test(labCtxSrc));
  assert('Family history line format includes relative, condition, optional onset age, optional note',
    /\$\{rel\}: \$\{e\.condition \|\| ''\}\$\{age\}\$\{note\}/.test(labCtxSrc));

  // ═══════════════════════════════════════
  // 7. Areas list counts family entries
  // ═══════════════════════════════════════
  console.log('%c 7. Active areas list ', 'font-weight:bold;color:#f59e0b');

  assert('Active-areas list counts both conditions and family entries',
    /label: 'Medical History', detail \}\)/.test(labCtxSrc) &&
    /family entr/.test(labCtxSrc));

  // ═══════════════════════════════════════
  // 8. "Medical History" rename — verifying user-facing strings
  // ═══════════════════════════════════════
  console.log('%c 8. Medical History rename ', 'font-weight:bold;color:#f59e0b');

  assert("Card label is 'Medical History'",
    /label:\s*'Medical History'/.test(ctxSrc));
  assert("Modal headline reads 'Medical History'",
    /<h3>Medical History<\/h3>/.test(ctxSrc));
  assert('Modal description mentions both diagnoses and family history',
    /diagnoses and family history/.test(ctxSrc));
  assert('Card placeholder mentions family history',
    /'Add diagnoses or family history'/.test(ctxSrc));
  assert("saveAndRefresh toast says 'Medical history saved'",
    ctxSrc.includes("saveAndRefresh('Medical history saved', 'diagnoses')"));
  assert("clearDiagnoses toast says 'Medical history cleared'",
    ctxSrc.includes("'Medical history cleared'"));
  assert('Tooltip mentions family history reframing risk',
    /heart attack at 52 reframes a borderline LDL/.test(ctxSrc));
  assert('AI context section header renamed to Medical History / Diagnoses',
    labCtxSrc.includes('## Medical History / Diagnoses'));
  assert("Field-label map uses 'Medical History'",
    /diagnoses:\s*'Medical History'/.test(labCtxSrc));

  // ═══════════════════════════════════════
  // 9. UI subsection markers (CSS hooks the renderer relies on)
  // ═══════════════════════════════════════
  console.log('%c 9. UI subsection ', 'font-weight:bold;color:#f59e0b');

  assert("Modal renders <div class='ctx-family-history'> wrapper",
    /class="ctx-family-history"/.test(ctxSrc));
  assert('Relative dropdown uses <optgroup> grouping',
    /<optgroup label="Parents"/.test(ctxSrc) &&
    /<optgroup label="Siblings & Children"/.test(ctxSrc) &&
    /<optgroup label="Maternal grandparents"/.test(ctxSrc) &&
    /<optgroup label="Paternal grandparents"/.test(ctxSrc));
  assert('Add form is split into two rows for legibility',
    (ctxSrc.match(/ctx-family-add-row/g) || []).length >= 2);
  assert('Relative chip emoji mapping defined',
    /RELATIVE_EMOJI\s*=\s*\{/.test(ctxSrc));
  assert("Closing-suggestions handler also clears fh-condition-suggestions",
    /fh-condition-suggestions[\s\S]{0,200}fhContainer\.innerHTML\s*=\s*''/.test(ctxSrc));

  // ═══════════════════════════════════════
  // 10. CSS hooks
  // ═══════════════════════════════════════
  console.log('%c 10. CSS hooks ', 'font-weight:bold;color:#f59e0b');
  const stylesSrc = await fetch('styles.css').then(r => r.text());
  for (const cls of [
    '.ctx-family-history', '.ctx-family-head', '.ctx-family-count',
    '.ctx-family-list', '.ctx-family-item', '.ctx-family-relative',
    '.ctx-family-condition', '.ctx-family-age', '.ctx-family-note',
    '.ctx-family-add', '.ctx-family-add-row',
  ]) {
    assert(`CSS defines ${cls}`, new RegExp(cls.replace('.', '\\.') + '\\s*\\{').test(stylesSrc));
  }

  console.log(`\n%c ${pass} passed, ${fail} failed `, fail === 0 ? 'background:#22c55e;color:#fff;padding:4px 12px' : 'background:#ef4444;color:#fff;padding:4px 12px');
  console.log(`Result: ${pass} passed, ${fail} failed`);
})();
