// test-change-history.js — Verify change history recording, dedup, cap, AI context, export/import
// Run: fetch('tests/test-change-history.js').then(r=>r.text()).then(s=>Function(s)())

return (async function() {
  let pass = 0, fail = 0;
  function assert(name, condition, detail) {
    if (condition) { pass++; console.log(`%c PASS %c ${name}`, 'background:#22c55e;color:#fff;padding:2px 6px;border-radius:3px', '', detail || ''); }
    else { fail++; console.error(`%c FAIL %c ${name}`, 'background:#ef4444;color:#fff;padding:2px 6px;border-radius:3px', '', detail || ''); }
  }

  console.log('%c Change History Tests ', 'background:#6366f1;color:#fff;font-size:14px;padding:4px 12px;border-radius:4px');

  // ═══════════════════════════════════════
  // 1. recordChange function exists
  // ═══════════════════════════════════════
  console.log('%c 1. Function Exports ', 'font-weight:bold;color:#f59e0b');

  assert('recordChange is a window function', typeof window.recordChange === 'function');

  // ═══════════════════════════════════════
  // 2. Basic recording
  // ═══════════════════════════════════════
  console.log('%c 2. Basic Recording ', 'font-weight:bold;color:#f59e0b');

  // Save original state
  const origHistory = window._labState.importedData.changeHistory;
  const origDiet = window._labState.importedData.diet;

  // Reset for testing
  window._labState.importedData.changeHistory = [];
  window._labState.importedData.diet = { type: 'omnivore', restrictions: [], pattern: null, note: '' };

  window.recordChange('diet');
  assert('Records first change', window._labState.importedData.changeHistory.length === 1);
  assert('Entry has field', window._labState.importedData.changeHistory[0].field === 'diet');
  assert('Entry has date (ISO)', /^\d{4}-\d{2}-\d{2}$/.test(window._labState.importedData.changeHistory[0].date));
  assert('Entry has snapshot', window._labState.importedData.changeHistory[0].snapshot != null);
  assert('Snapshot is deep copy', window._labState.importedData.changeHistory[0].snapshot !== window._labState.importedData.diet);
  assert('Snapshot matches current data', JSON.stringify(window._labState.importedData.changeHistory[0].snapshot) === JSON.stringify(window._labState.importedData.diet));

  // ═══════════════════════════════════════
  // 3. Dedup: identical snapshot skipped
  // ═══════════════════════════════════════
  console.log('%c 3. Dedup — Identical Snapshot ', 'font-weight:bold;color:#f59e0b');

  window.recordChange('diet');
  assert('Identical snapshot not duplicated', window._labState.importedData.changeHistory.length === 1);

  // ═══════════════════════════════════════
  // 4. Dedup: same field + same day overwrites
  // ═══════════════════════════════════════
  console.log('%c 4. Dedup — Same Day Overwrite ', 'font-weight:bold;color:#f59e0b');

  window._labState.importedData.diet = { type: 'low-carb', restrictions: ['gluten'], pattern: '2 meals', note: '' };
  window.recordChange('diet');
  assert('Same-day update overwrites (no new entry)', window._labState.importedData.changeHistory.length === 1);
  assert('Snapshot updated to new value', window._labState.importedData.changeHistory[0].snapshot.type === 'low-carb');

  // ═══════════════════════════════════════
  // 5. Different fields tracked independently
  // ═══════════════════════════════════════
  console.log('%c 5. Multiple Fields ', 'font-weight:bold;color:#f59e0b');

  window._labState.importedData.exercise = { frequency: '3x/week', types: ['strength'], intensity: 'moderate', note: '' };
  window.recordChange('exercise');
  assert('Different field creates new entry', window._labState.importedData.changeHistory.length === 2);
  assert('Exercise entry recorded', window._labState.importedData.changeHistory[1].field === 'exercise');

  // ═══════════════════════════════════════
  // 6. Null snapshot for cleared fields
  // ═══════════════════════════════════════
  console.log('%c 6. Null Snapshot ', 'font-weight:bold;color:#f59e0b');

  // Simulate clearing by setting to different date first
  const h = window._labState.importedData.changeHistory;
  // Force a past date entry so "clear" on today creates a new one
  h[0].date = '2025-01-01';
  window._labState.importedData.diet = null;
  window.recordChange('diet');
  const nullEntry = h.find(e => e.field === 'diet' && e.snapshot === null);
  assert('Null field recorded with null snapshot', nullEntry != null);

  // ═══════════════════════════════════════
  // 7. Cap at 200 entries
  // ═══════════════════════════════════════
  console.log('%c 7. Cap at 200 ', 'font-weight:bold;color:#f59e0b');

  window._labState.importedData.changeHistory = [];
  for (let i = 0; i < 210; i++) {
    window._labState.importedData.changeHistory.push({
      field: 'stress', date: `2024-${String(Math.floor(i / 28) + 1).padStart(2, '0')}-${String((i % 28) + 1).padStart(2, '0')}`,
      snapshot: { level: `level-${i}` }
    });
  }
  // Force a new unique entry
  window._labState.importedData.stress = { level: 'high', sources: ['work'] };
  window.recordChange('stress');
  assert('History capped at 200', window._labState.importedData.changeHistory.length <= 200, `length: ${window._labState.importedData.changeHistory.length}`);

  // ═══════════════════════════════════════
  // 8. String fields (interpretiveLens)
  // ═══════════════════════════════════════
  console.log('%c 8. String Fields ', 'font-weight:bold;color:#f59e0b');

  window._labState.importedData.changeHistory = [];
  window._labState.importedData.interpretiveLens = 'Functional medicine';
  window.recordChange('interpretiveLens');
  assert('String field snapshot is a string', typeof window._labState.importedData.changeHistory[0].snapshot === 'string');
  assert('String field value correct', window._labState.importedData.changeHistory[0].snapshot === 'Functional medicine');

  // ═══════════════════════════════════════
  // 9. Array fields (healthGoals)
  // ═══════════════════════════════════════
  console.log('%c 9. Array Fields ', 'font-weight:bold;color:#f59e0b');

  window._labState.importedData.changeHistory = [];
  window._labState.importedData.healthGoals = [{ text: 'Reduce inflammation', severity: 'major' }];
  window.recordChange('healthGoals');
  assert('Array field recorded', window._labState.importedData.changeHistory.length === 1);
  assert('Array snapshot is array', Array.isArray(window._labState.importedData.changeHistory[0].snapshot));
  assert('Array snapshot deep copy', window._labState.importedData.changeHistory[0].snapshot !== window._labState.importedData.healthGoals);

  // ═══════════════════════════════════════
  // 10. Migration guard
  // ═══════════════════════════════════════
  console.log('%c 10. Migration ', 'font-weight:bold;color:#f59e0b');

  const profileSrc = await fetchWithRetry('js/profile.js');
  assert('Migration guard for changeHistory', profileSrc.includes("data.changeHistory === undefined") && profileSrc.includes("data.changeHistory = []"));

  // ═══════════════════════════════════════
  // 11. State default
  // ═══════════════════════════════════════
  console.log('%c 11. State Default ', 'font-weight:bold;color:#f59e0b');

  const stateSrc = await fetchWithRetry('js/state.js');
  assert('state.js has changeHistory default', stateSrc.includes('changeHistory: []'));

  // ═══════════════════════════════════════
  // 12. Export includes changeHistory
  // ═══════════════════════════════════════
  console.log('%c 12. Export ', 'font-weight:bold;color:#f59e0b');

  const exportSrc = await fetchWithRetry('js/export.js');
  assert('Export includes changeHistory', exportSrc.includes('changeHistory: data.changeHistory'));

  // ═══════════════════════════════════════
  // 13. Import handles changeHistory
  // ═══════════════════════════════════════
  console.log('%c 13. Import ', 'font-weight:bold;color:#f59e0b');

  assert('Import merges changeHistory (single-file path)', exportSrc.includes("Array.isArray(json.changeHistory)"));
  assert('Import merges changeHistory (bundle path)', exportSrc.includes("Array.isArray(importData.changeHistory)"));

  // ═══════════════════════════════════════
  // 14. AI context integration
  // ═══════════════════════════════════════
  console.log('%c 14. AI Context ', 'font-weight:bold;color:#f59e0b');

  const labCtxSrc = await fetchWithRetry('js/lab-context.js');
  assert('buildLabContext reads changeHistory', labCtxSrc.includes('changeHistory'));
  assert('Context Change Timeline section', labCtxSrc.includes('Context Change Timeline'));
  assert('summarizeChange helper exists', labCtxSrc.includes('function summarizeChange'));

  // ═══════════════════════════════════════
  // 15. saveAndRefresh accepts field param
  // ═══════════════════════════════════════
  console.log('%c 15. saveAndRefresh Field Param ', 'font-weight:bold;color:#f59e0b');

  const ctxSrc = await fetchWithRetry('js/context-cards.js');
  assert('saveAndRefresh has field parameter', ctxSrc.includes('function saveAndRefresh(msg, field)'));
  assert('Diet passes field to saveAndRefresh', ctxSrc.includes("saveAndRefresh('Diet & Digestion saved', 'diet')"));
  assert('Exercise passes field to saveAndRefresh', ctxSrc.includes("saveAndRefresh('Exercise saved', 'exercise')"));
  assert('Sleep passes field to saveAndRefresh', ctxSrc.includes("saveAndRefresh('Sleep saved', 'sleepRest')"));
  assert('Light passes field to saveAndRefresh', ctxSrc.includes("saveAndRefresh('Light & circadian saved', 'lightCircadian')"));
  assert('Stress passes field to saveAndRefresh', ctxSrc.includes("saveAndRefresh('Stress profile saved', 'stress')"));
  assert('Love life passes field to saveAndRefresh', ctxSrc.includes("saveAndRefresh('Love life saved', 'loveLife')"));
  assert('Environment passes field to saveAndRefresh', ctxSrc.includes("saveAndRefresh('Environment saved', 'environment')"));
  assert('Diagnoses passes field to saveAndRefresh', ctxSrc.includes("saveAndRefresh('Medical history saved', 'diagnoses')"));

  // ═══════════════════════════════════════
  // 16. Inline save paths call recordChange
  // ═══════════════════════════════════════
  console.log('%c 16. Inline Save Paths ', 'font-weight:bold;color:#f59e0b');

  assert('addCondition calls recordChange', ctxSrc.includes("recordChange('diagnoses')"));
  assert('addHealthGoal calls recordChange', ctxSrc.includes("recordChange('healthGoals')"));
  assert('saveInterpretiveLens calls recordChange', ctxSrc.includes("recordChange('interpretiveLens')"));
  assert('debounceContextNotes calls recordChange', ctxSrc.includes("recordChange('contextNotes')"));

  const cycleSrc = await fetchWithRetry('js/cycle.js');
  assert('saveMenstrualCycle calls recordChange', cycleSrc.includes("recordChange('menstrualCycle')"));

  // Restore original state
  window._labState.importedData.changeHistory = origHistory || [];
  window._labState.importedData.diet = origDiet;

  // ═══════════════════════════════════════
  console.log(`\n=== Results ===\n${pass} passed, ${fail} failed`);
  if (fail === 0) console.log('%c All tests passed! ', 'background:#22c55e;color:#fff;font-size:14px;padding:4px 12px;border-radius:4px');
  return { pass, fail };
})();
