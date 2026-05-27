#!/usr/bin/env node
// test-family-history.js — Medical History card + family-history subsection.
// Covers: COMMON_CONDITIONS coverage, the apostrophe-condition click fix
// (source guard), FAMILY_RELATIVES allowlist + addFamilyHistoryEntry guards
// (source), saveDiagnoses null-guard, getConditionsSummary family inclusion,
// AI context emission, areas-list counting, the "Medical History" rename, UI
// subsection markers, and CSS hooks.
//
// Run: node tests/test-family-history.js  (or via npm test)
//
// Source-inspection + pure-function port. The DOM-runtime sections — the
// apostrophe round-trip probe and the live addFamilyHistoryEntry /
// deleteFamilyHistoryEntry handler test (both need real innerHTML parsing,
// dispatchEvent, and renderDiagnosesModal against a live #detail-modal) —
// live in test-family-history-dom.js on the puppeteer runner.

import './_node-shim.js';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel.replace(/^\//, '')), 'utf-8');

// fs-backed fetch shim for the source-inspection reads.
const _realFetch = globalThis.fetch;
globalThis.fetch = async (url, opts) => {
  if (typeof url === 'string' && !/^https?:/.test(url)) {
    try { return new Response(read(url), { status: 200 }); }
    catch (_) { return new Response('', { status: 404 }); }
  }
  return _realFetch(url, opts);
};

let pass = 0, fail = 0;
function assert(name, condition, detail) {
  if (condition) { pass++; console.log(`  PASS: ${name}`); }
  else { fail++; console.log(`  FAIL: ${name}${detail ? ' — ' + detail : ''}`); }
}

console.log('=== Family History + Medical History Tests ===\n');

const cards = await import('../js/context-cards.js');
const constants = await import('../js/constants.js');

// ═══════════════════════════════════════
// 1. Expanded COMMON_CONDITIONS
// ═══════════════════════════════════════
console.log('1. COMMON_CONDITIONS coverage');

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
// 2. Apostrophe-condition click fix (source guard)
// ═══════════════════════════════════════
console.log('2. Apostrophe click fix');

const ctxSrc = await fetch('js/context-cards.js').then(r => r.text());
// filterConditionSuggestions must wrap the inline call arg in JSON.stringify
// so apostrophes survive the HTML-attribute → JS-string round-trip. The
// live DOM round-trip probe lives in test-family-history-dom.js.
assert("filterConditionSuggestions uses JSON.stringify(m) for inline onclick arg",
  /selectConditionSuggestion\(\$\{escapeHTML\(JSON\.stringify\(m\)\)\}\)/.test(ctxSrc));
assert("filterFamilyConditionSuggestions uses JSON.stringify(m) for inline onclick arg",
  /selectFamilyConditionSuggestion\(\$\{escapeHTML\(JSON\.stringify\(m\)\)\}\)/.test(ctxSrc));

// ═══════════════════════════════════════
// 3. FAMILY_RELATIVES allowlist + addFamilyHistoryEntry guards (source)
// ═══════════════════════════════════════
console.log('3. FAMILY_RELATIVES + addEntry guards');

// FAMILY_RELATIVES isn't exported (private to context-cards.js), so we
// assert its allowlist + the handler's guards via the source. The live
// handler-mutation test lives in test-family-history-dom.js.
assert('FAMILY_RELATIVES declared with 8 first-degree+grandparent keys',
  /FAMILY_RELATIVES\s*=\s*\[[^\]]*'mother'[^\]]*'father'[^\]]*'sibling'[^\]]*'child'[^\]]*'maternal_grandmother'[^\]]*'maternal_grandfather'[^\]]*'paternal_grandmother'[^\]]*'paternal_grandfather'/s.test(ctxSrc));
assert('addFamilyHistoryEntry validates relative against FAMILY_RELATIVES',
  /addFamilyHistoryEntry[\s\S]{0,1000}if \(!FAMILY_RELATIVES\.some\(r => r\.key === relative\)\) return/.test(ctxSrc));
assert('addFamilyHistoryEntry clamps onsetAge to 0–120',
  /Math\.max\(0,\s*Math\.min\(120,\s*parseInt\(ageRaw, 10\)\)\)/.test(ctxSrc));
assert('addFamilyHistoryEntry early-returns when relative or condition empty',
  /if \(!relative \|\| !condition\) return/.test(ctxSrc));

// ═══════════════════════════════════════
// 4. saveDiagnoses null-guard with familyHistory-only
// ═══════════════════════════════════════
console.log('4. saveDiagnoses null-guard');

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
console.log('5. Summary inclusion');

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
console.log('6. AI context family history');

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
console.log('7. Active areas list');

assert('Active-areas list counts both conditions and family entries',
  /label: 'Medical History', detail \}\)/.test(labCtxSrc) &&
  /family entr/.test(labCtxSrc));

// ═══════════════════════════════════════
// 8. "Medical History" rename — verifying user-facing strings
// ═══════════════════════════════════════
console.log('8. Medical History rename');

assert("Card label is 'Medical History'",
  /label:\s*'Medical History'/.test(ctxSrc));
assert("Modal headline reads 'Medical History'",
  /renderContextEditorModal\(modal,\s*'Medical History'/.test(ctxSrc));
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
console.log('9. UI subsection');

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
console.log('10. CSS hooks');
const stylesSrc = [
  await fetch('styles.css').then(r => r.text()),
  await fetch('css/context-profile.css').then(r => r.text()),
].join('\n');
for (const cls of [
  '.ctx-family-history', '.ctx-family-head', '.ctx-family-count',
  '.ctx-family-list', '.ctx-family-item', '.ctx-family-relative',
  '.ctx-family-condition', '.ctx-family-age', '.ctx-family-note',
  '.ctx-family-add', '.ctx-family-add-row',
]) {
  assert(`CSS defines ${cls}`, new RegExp(cls.replace('.', '\\.') + '\\s*\\{').test(stylesSrc));
}

console.log(`\nResults: ${pass} passed, ${fail} failed, ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
