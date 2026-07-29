#!/usr/bin/env node
// test-change-history.js — Verify change history recording, dedup, cap, AI context, export/import
//
// Run: node tests/test-change-history.js  (or via npm test)

import './_node-shim.js';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf-8');

let pass = 0, fail = 0;
function assert(name, condition, detail) {
  if (condition) { pass++; console.log(`  PASS: ${name}`); }
  else { fail++; console.log(`  FAIL: ${name}${detail ? ' — ' + detail : ''}`); }
}

console.log('=== Change History Tests ===\n');

// Change-history recording is a module-only context-cards API.
const { state } = await import('../js/state.js');
const contextCards = await import('../js/context-cards.js');
  // ═══════════════════════════════════════
  // 1. recordChange function exists
  // ═══════════════════════════════════════
  console.log('1. Function Exports');

  assert('recordChange is a module function', typeof contextCards.recordChange === 'function');
  assert('recordChange stays off window', !('recordChange' in window));

  // ═══════════════════════════════════════
  // 2. Basic recording
  // ═══════════════════════════════════════
  console.log('2. Basic Recording');

  // Save original state
  const origHistory = state.importedData.changeHistory;
  const origDiet = state.importedData.diet;

  // Reset for testing
  state.importedData.changeHistory = [];
  state.importedData.diet = { type: 'omnivore', restrictions: [], pattern: null, note: '' };

  contextCards.recordChange('diet');
  assert('Records first change', state.importedData.changeHistory.length === 1);
  assert('Entry has field', state.importedData.changeHistory[0].field === 'diet');
  assert('Entry has date (ISO)', /^\d{4}-\d{2}-\d{2}$/.test(state.importedData.changeHistory[0].date));
  assert('Entry has snapshot', state.importedData.changeHistory[0].snapshot != null);
  assert('Snapshot is deep copy', state.importedData.changeHistory[0].snapshot !== state.importedData.diet);
  assert('Snapshot matches current data', JSON.stringify(state.importedData.changeHistory[0].snapshot) === JSON.stringify(state.importedData.diet));

  // ═══════════════════════════════════════
  // 3. Dedup: identical snapshot skipped
  // ═══════════════════════════════════════
  console.log('3. Dedup — Identical Snapshot');

  contextCards.recordChange('diet');
  assert('Identical snapshot not duplicated', state.importedData.changeHistory.length === 1);

  // ═══════════════════════════════════════
  // 4. Dedup: same field + same day overwrites
  // ═══════════════════════════════════════
  console.log('4. Dedup — Same Day Overwrite');

  state.importedData.diet = { type: 'low-carb', restrictions: ['gluten'], pattern: '2 meals', note: '' };
  contextCards.recordChange('diet');
  assert('Same-day update overwrites (no new entry)', state.importedData.changeHistory.length === 1);
  assert('Snapshot updated to new value', state.importedData.changeHistory[0].snapshot.type === 'low-carb');

  // ═══════════════════════════════════════
  // 5. Different fields tracked independently
  // ═══════════════════════════════════════
  console.log('5. Multiple Fields');

  state.importedData.exercise = { frequency: '3x/week', types: ['strength'], intensity: 'moderate', note: '' };
  contextCards.recordChange('exercise');
  assert('Different field creates new entry', state.importedData.changeHistory.length === 2);
  assert('Exercise entry recorded', state.importedData.changeHistory[1].field === 'exercise');

  // ═══════════════════════════════════════
  // 6. Null snapshot for cleared fields
  // ═══════════════════════════════════════
  console.log('6. Null Snapshot');

  // Simulate clearing by setting to different date first
  const h = state.importedData.changeHistory;
  // Force a past date entry so "clear" on today creates a new one
  h[0].date = '2025-01-01';
  state.importedData.diet = null;
  contextCards.recordChange('diet');
  const nullEntry = h.find(e => e.field === 'diet' && e.snapshot === null);
  assert('Null field recorded with null snapshot', nullEntry != null);

  // ═══════════════════════════════════════
  // 7. Cap at 200 entries
  // ═══════════════════════════════════════
  console.log('7. Cap at 200');

  state.importedData.changeHistory = [];
  for (let i = 0; i < 210; i++) {
    state.importedData.changeHistory.push({
      field: 'stress', date: `2024-${String(Math.floor(i / 28) + 1).padStart(2, '0')}-${String((i % 28) + 1).padStart(2, '0')}`,
      snapshot: { level: `level-${i}` }
    });
  }
  // Force a new unique entry
  state.importedData.stress = { level: 'high', sources: ['work'] };
  contextCards.recordChange('stress');
  assert('History capped at 200', state.importedData.changeHistory.length <= 200, `length: ${state.importedData.changeHistory.length}`);

  // ═══════════════════════════════════════
  // 8. String fields (interpretiveLens)
  // ═══════════════════════════════════════
  console.log('8. String Fields');

  state.importedData.changeHistory = [];
  state.importedData.interpretiveLens = 'Functional medicine';
  contextCards.recordChange('interpretiveLens');
  assert('String field snapshot is a string', typeof state.importedData.changeHistory[0].snapshot === 'string');
  assert('String field value correct', state.importedData.changeHistory[0].snapshot === 'Functional medicine');

  // ═══════════════════════════════════════
  // 9. Array fields (healthGoals)
  // ═══════════════════════════════════════
  console.log('9. Array Fields');

  state.importedData.changeHistory = [];
  state.importedData.healthGoals = [{ text: 'Reduce inflammation', severity: 'major' }];
  contextCards.recordChange('healthGoals');
  assert('Array field recorded', state.importedData.changeHistory.length === 1);
  assert('Array snapshot is array', Array.isArray(state.importedData.changeHistory[0].snapshot));
  assert('Array snapshot deep copy', state.importedData.changeHistory[0].snapshot !== state.importedData.healthGoals);

  // ═══════════════════════════════════════
  // 10. Migration guard
  // ═══════════════════════════════════════
  console.log('10. Migration');

  const profileSrc = read('js/profile-data-migrations.js');
  assert('Migration guard for changeHistory', profileSrc.includes("data.changeHistory === undefined") && profileSrc.includes("data.changeHistory = []"));

  // ═══════════════════════════════════════
  // 11. State default
  // ═══════════════════════════════════════
  console.log('11. State Default');

  const stateSrc = read('js/state.js');
  assert('state.js has changeHistory default', stateSrc.includes('changeHistory: []'));

  // ═══════════════════════════════════════
  // 12. Export includes changeHistory
  // ═══════════════════════════════════════
  console.log('12. Export');

  const exportSrc = read('js/export.js');
  assert('Export includes changeHistory', exportSrc.includes('changeHistory: data.changeHistory'));

  // ═══════════════════════════════════════
  // 13. Import handles changeHistory
  // ═══════════════════════════════════════
  console.log('13. Import');

  const exportImportSrc = read('js/export-import.js');
  assert('Import merges changeHistory (single-file path)', exportImportSrc.includes("Array.isArray(json.changeHistory)"));
  assert('Import merges changeHistory (bundle path)', exportImportSrc.includes("Array.isArray(importData.changeHistory)"));

  // ═══════════════════════════════════════
  // 14. AI context integration
  // ═══════════════════════════════════════
  console.log('14. AI Context');

  const labCtxSrc = read('js/lab-context.js');
  const labCtxOutputSrc = read('js/lab-context-output.js');
  assert('buildLabContext reads changeHistory', labCtxSrc.includes('changeHistory'));
  assert('Context Change Timeline section', labCtxSrc.includes('Context Change Timeline'));
  assert('summarizeChange helper exists', labCtxOutputSrc.includes('function summarizeChange'));

  // ═══════════════════════════════════════
  // 15. saveAndRefresh accepts field param
  // ═══════════════════════════════════════
  console.log('15. saveAndRefresh Field Param');

  const ctxSrc = read('js/context-cards.js');
  const ctxMedicalSrc = read('js/context-card-medical-history-editor-impl.js');
  const ctxLifestyleSrc = read('js/context-card-lifestyle-editors-impl.js');
  assert('saveAndRefresh has field parameter', ctxSrc.includes('function saveAndRefresh(msg, field)'));
  assert('Diet passes field to saveAndRefresh', ctxLifestyleSrc.includes("saveContextAndRefresh('Diet & Digestion saved', 'diet')"));
  assert('Exercise passes field to saveAndRefresh', ctxLifestyleSrc.includes("saveContextAndRefresh('Exercise saved', 'exercise')"));
  assert('Sleep passes field to saveAndRefresh', ctxLifestyleSrc.includes("saveContextAndRefresh('Sleep saved', 'sleepRest')"));
  assert('Light passes field to saveAndRefresh', ctxLifestyleSrc.includes("saveContextAndRefresh('Light & circadian saved', 'lightCircadian')"));
  assert('Stress passes field to saveAndRefresh', ctxLifestyleSrc.includes("saveContextAndRefresh('Stress profile saved', 'stress')"));
  assert('Love life passes field to saveAndRefresh', ctxLifestyleSrc.includes("saveContextAndRefresh('Love life saved', 'loveLife')"));
  assert('Environment passes field to saveAndRefresh', ctxLifestyleSrc.includes("saveContextAndRefresh('Environment saved', 'environment')"));
  assert('Diagnoses passes field to saveAndRefresh', ctxMedicalSrc.includes("saveContextAndRefresh('Medical history saved', 'diagnoses')"));

  // ═══════════════════════════════════════
  // 16. Inline save paths call recordChange
  // ═══════════════════════════════════════
  console.log('16. Inline Save Paths');

  assert('addCondition calls recordChange', ctxMedicalSrc.includes("recordContextChange('diagnoses')"));
  assert('addHealthGoal calls recordChange', ctxLifestyleSrc.includes("recordContextChange('healthGoals')"));
  assert('saveInterpretiveLens calls recordChange', ctxLifestyleSrc.includes("recordContextChange('interpretiveLens')"));
  assert('debounceContextNotes calls recordChange', ctxSrc.includes("recordChange('contextNotes')"));

  const cycleSrc = read('js/cycle.js');
  assert('saveMenstrualCycle records context changes through the runtime callback',
    cycleSrc.includes("recordContextCardChangeRuntime('menstrualCycle')"));

  // Restore original state
  state.importedData.changeHistory = origHistory || [];
  state.importedData.diet = origDiet;

  // ═══════════════════════════════════════
console.log(`\nResults: ${pass} passed, ${fail} failed, ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
