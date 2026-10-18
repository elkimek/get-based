#!/usr/bin/env node
import { ownedRule, escapedClass } from './helpers/legacy-light-chat-contracts.js';
import { createLegacyAssertions } from './helpers/legacy-assertions.js';
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
// live in tests/playwright/family-history-dom.spec.js on the Playwright runner.

import './_node-shim.js';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel.replace(/^\//, '')), 'utf-8');

// fs-backed fetch shim for the source-inspection reads.
const _realFetch = globalThis.fetch;
globalThis.fetch = async (url, opts) => {
  if (typeof url === 'string' && !/^https?:/.test(url)) {
    try { return new Response(read(url), { status: 200 }); }
    catch (_) { return new Response('', { status: 404 }); }
  }
  return _realFetch(url, opts);
};


const { assert, results: legacyAssertions } = createLegacyAssertions();

console.log('=== Family History + Medical History Tests ===\n');

const cards = await import('../js/context-cards.js');
const constants = await import('../js/constants.js');
const { getContextSummary } = await import('../js/chat-context-summary.js');

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
const ctxSummarySrc = await fetch('js/context-card-summaries.js').then(r => r.text());
const ctxMedicalFacadeSrc = await fetch('js/context-card-medical-history-editor.js').then(r => r.text());
const ctxMedicalSrc = await fetch('js/context-card-medical-history-editor-impl.js').then(r => r.text());
const medicalViewSrc = read('js/context-medical-history-view.ts');
const medicalComponentSrc = read('js/components/ContextMedicalHistory.svelte');
const conditionInputSrc = read('js/components/ContextConditionInput.svelte');
const medicalModel = await import('../js/context-medical-history-model.js');
const { FAMILY_RELATIVES, familyHistoryValue, medicalHistoryDraft, medicalHistoryValue } = medicalModel;
const familyInput = { relative: 'mother', condition: "Alzheimer's Disease", age: '52', note: 'fixture' };
const ctxCardSrc = `${ctxSrc}\n${ctxSummarySrc}\n${ctxMedicalSrc}`;
assert('Condition suggestions use delegated data values',
  medicalComponentSrc.includes('id="condition-input" listId="condition-suggestions"') && conditionInputSrc.includes('onclick={() => select(suggestion)}') && conditionInputSrc.includes('{suggestion}</button>') && medicalModel.conditionSuggestions("Alzheimer'", medicalHistoryDraft(null), '', false).includes("Alzheimer's Disease"));
assert('Family condition suggestions use delegated data values',
  medicalComponentSrc.includes('id="fh-condition" listId="fh-condition-suggestions"') && medicalComponentSrc.includes('conditionSuggestions(family.condition, draft, sex, true)') && conditionInputSrc.includes('change(text); hide(); control.focus();'));
assert('Medical history editor has no inline event attributes',
  !/\son[a-z]+\s*=/.test(ctxMedicalSrc));

// ═══════════════════════════════════════
// 3. FAMILY_RELATIVES allowlist + addFamilyHistoryEntry guards (source)
// ═══════════════════════════════════════
console.log('3. FAMILY_RELATIVES + addEntry guards');

// The authored model now owns the allowlist and validation. Exercise it directly;
// the component and session contracts below retain UI and persistence ownership.
assert('FAMILY_RELATIVES declared with 8 first-degree+grandparent keys',
  JSON.stringify(FAMILY_RELATIVES.map(row => row.key)) === JSON.stringify(['mother', 'father', 'sibling', 'half_sibling', 'child', 'maternal_grandmother', 'maternal_grandfather', 'maternal_relative', 'paternal_grandmother', 'paternal_grandfather', 'paternal_relative']));
assert('addFamilyHistoryEntry validates relative against FAMILY_RELATIVES',
  familyHistoryValue({ ...familyInput, relative: 'unlisted' }) === null && FAMILY_RELATIVES.every(relative => familyHistoryValue({ ...familyInput, relative: relative.key })?.relative === relative.key));
assert('addFamilyHistoryEntry clamps onsetAge to 0–120',
  familyHistoryValue({ ...familyInput, age: '-1' })?.onsetAge === 0 && familyHistoryValue({ ...familyInput, age: '121' })?.onsetAge === 120 && familyHistoryValue(familyInput)?.onsetAge === 52);
assert('addFamilyHistoryEntry early-returns when relative or condition empty',
  familyHistoryValue({ ...familyInput, relative: '' }) === null && familyHistoryValue({ ...familyInput, condition: '  ' }) === null);

// ═══════════════════════════════════════
// 4. saveDiagnoses null-guard with familyHistory-only
// ═══════════════════════════════════════
console.log('4. saveDiagnoses null-guard');

assert('saveDiagnoses considers familyHistory.length before nulling diagnoses',
  medicalHistoryValue(medicalHistoryDraft({ familyHistory: [{ relative: 'mother', condition: 'Hypertension' }] }))?.familyHistory?.length === 1 && medicalHistoryValue(medicalHistoryDraft(null)) === null && read('js/context-medical-history-session.ts').includes('draft.diagnoses = value === null ? null : medicalHistoryValue(value);'));

// Profile migration backfills familyHistory on legacy diagnoses objects.
const profSrc = await fetch('js/profile-data-migrations.js').then(r => r.text());
assert('profile migration owner converts string diagnoses with familyHistory: []',
  /data\.diagnoses\.trim\(\)\s*\?\s*\{ conditions: \[\], note: data\.diagnoses\.trim\(\), familyHistory: \[\] \}/.test(profSrc));
assert('profile migration owner backfills familyHistory=[] on legacy diagnoses',
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

const labCtxSrc = await fetch('js/lab-context-assembly.js').then(r => r.text());
const labCtxTimelineSrc = await fetch('js/lab-context-change-timeline.js').then(r => r.text());
assert('Family history block emitted within [section:diagnoses]',
  /\[section:diagnoses\][\s\S]{0,1500}### Family history \(heritable\/environmental risk signal\)/.test(labCtxSrc));
assert('Family history block iterates diag.familyHistory',
  /Array\.isArray\(diag\.familyHistory\) && diag\.familyHistory\.length[\s\S]{0,800}for \(const e of diag\.familyHistory\)/.test(labCtxSrc));
assert('Family history line format includes relative, condition, optional onset age, optional note',
  /\$\{rel\}: \$\{e\.condition \|\| ''\}\$\{age\}\$\{note\}/.test(labCtxSrc));

// ═══════════════════════════════════════
// 7. Exact context receipt includes Medical History
// ═══════════════════════════════════════
console.log('7. Active areas list');

const medicalReceipt = getContextSummary('[section:diagnoses]\n## Medical History / Diagnoses\n- Hypertension\n### Family history\n- mother: Type 2 Diabetes\n[/section:diagnoses]');
assert('Active-areas list reflects the exact final Medical History section',
  medicalReceipt.some(area => area.label === 'Medical History / Diagnoses'));

// ═══════════════════════════════════════
// 8. "Medical History" rename — verifying user-facing strings
// ═══════════════════════════════════════
console.log('8. Medical History rename');

assert("Card label is 'Medical History'",
  /label:\s*'Medical History'/.test(ctxCardSrc));
assert("Modal headline reads 'Medical History'",
  medicalViewSrc.includes("const TITLE = 'Medical History'") && medicalComponentSrc.includes('id="context-medical-title" class={editorTitle}>Medical History</h2>'));
assert('Modal description explains that entries should matter for interpretation',
  medicalComponentSrc.includes('Add only what matters for interpretation. Nothing changes until you save.'));
assert('Card placeholder mentions family history',
  /'Add diagnoses or family history'/.test(ctxCardSrc));
assert("saveDiagnoses toast says 'Medical history saved'",
  medicalViewSrc.includes("const message = `Medical history ${clear ? 'cleared' : 'saved'}`") && medicalViewSrc.includes('return save(view, false)') && medicalViewSrc.includes('owned.afterCommit(message)'));
assert("clearDiagnoses toast says 'Medical history cleared'",
  medicalViewSrc.includes("const message = `Medical history ${clear ? 'cleared' : 'saved'}`") && medicalViewSrc.includes('return save(view, true)'));
assert('Tooltip mentions family history reframing risk',
  /heart attack at 52 reframes a borderline LDL/.test(ctxCardSrc));
assert('AI context section header renamed to Medical History / Diagnoses',
  labCtxSrc.includes('## Medical History / Diagnoses'));
assert("Field-label map uses 'Medical History'",
  /diagnoses:\s*'Medical History'/.test(`${labCtxSrc}\n${labCtxTimelineSrc}`));

// ═══════════════════════════════════════
// 9. UI subsection markers (CSS hooks the renderer relies on)
// ═══════════════════════════════════════
console.log('9. UI subsection');

assert('Modal renders the collapsible family-history section',
  medicalComponentSrc.includes('<details id="ctx-family-section" bind:open={familyOpen} class={section}>') && medicalComponentSrc.includes('Family history{draft.familyHistory.length'));
assert('Relative dropdown uses <optgroup> grouping',
  JSON.stringify(medicalModel.FAMILY_GROUPS.map(group => group.label)) === JSON.stringify(['Parents', 'Siblings & Children', 'Maternal grandparents', 'Paternal grandparents']) && medicalComponentSrc.includes('<optgroup label={group.label}>') && medicalComponentSrc.includes('FAMILY_GROUPS as group'));
assert('Add form is split into two rows for legibility',
  medicalComponentSrc.includes('grid-cols-[minmax(0,200px)_minmax(0,1fr)]') && medicalComponentSrc.includes('grid-cols-[130px_minmax(0,1fr)]') && medicalComponentSrc.indexOf('id="fh-condition"') < medicalComponentSrc.indexOf('id="fh-age"'));
assert('Relative chip emoji mapping defined',
  medicalModel.RELATIVE_EMOJI.mother === '👩' && medicalModel.RELATIVE_EMOJI.father === '👨' && medicalModel.familyHistoryRows(medicalHistoryDraft({ familyHistory: [{ relative: 'mother', condition: 'Hypertension' }] }))[0]?.emoji === '👩');
assert('Closing-suggestions handler also clears fh-condition-suggestions',
  medicalViewSrc.includes('view.component.hideSuggestions(); flushSync();') && medicalComponentSrc.includes('conditionControl?.hide(); familyControl?.hide();') && conditionInputSrc.includes('const visible = $derived(expanded && suggestions.length > 0 && !disabled)') && conditionInputSrc.includes('hidden={!visible}') && conditionInputSrc.includes('export function hide(): void { expanded = false; active = -1; }'));
assert('Condition rows expose delegated edit action',
  ctxMedicalFacadeSrc.includes("case 'edit-condition':") && ctxMedicalSrc.includes("medicalHistoryAction('editCondition', index)") && medicalComponentSrc.includes('aria-label="Edit condition"') && medicalComponentSrc.includes('editCondition(index);'));
assert('Family rows expose delegated edit action',
  ctxMedicalFacadeSrc.includes("case 'edit-family-history':") && ctxMedicalSrc.includes("medicalHistoryAction('editFamilyHistoryEntry', index)") && medicalComponentSrc.includes('aria-label="Edit family history entry"') && medicalComponentSrc.includes('editFamily(rowData.index);'));
assert('Condition edit updates existing row instead of appending',
  medicalComponentSrc.includes('draft.conditions[conditionIndex] = value; else draft.conditions.push(value)'));
assert('Family history edit updates existing row instead of appending',
  medicalComponentSrc.includes('draft.familyHistory[familyIndex] = value; else draft.familyHistory.push(value)'));

// ═══════════════════════════════════════
// 10. CSS hooks
// ═══════════════════════════════════════
console.log('10. CSS hooks');
// Legacy assertion labels retain their original role; each row now pins the exact
// authored successor and its current scoped generated declaration.
const stylesSrc = read('css/context-editor.css');
const familyStyleContracts = [
  ['.ctx-family-history', '<details id="ctx-family-section"', 'overflow-clip', 'overflow', 'clip'],
  ['.ctx-family-head', '<summary class={summary}>Family history', 'font-bold', 'font-weight', 'var(--gb-font-weight-bold)'],
  ['.ctx-family-count', 'saved relative${draft.familyHistory.length', 'text-xs', 'font-size', 'var(--gb-text-xs)'],
  ['.ctx-family-list', 'id="ctx-family-list"', 'list-none', 'list-style-type', 'none'],
  ['.ctx-family-item', 'ctx-family-item ${row}', 'flex', 'display', 'flex'],
  ['.ctx-family-main', 'gb:context-form:items-center gb:context-form:gap-2 gb:context-form:max-[600px]:flex-wrap', 'items-center', 'align-items', 'center'],
  ['.ctx-family-relative', 'title={rowData.label}', 'basis-[32%]', 'flex-basis', '32%'],
  ['.ctx-family-condition', 'ctx-family-condition gb:context-form:min-w-0', 'truncate', 'text-overflow', 'ellipsis'],
  ['.ctx-family-age', 'age {rowData.entry.onsetAge}', 'shrink-0', 'flex-shrink', '0'],
  ['.ctx-family-note', 'title={rowData.entry.note}', 'max-w-[28%]', 'max-width', '28%'],
  ['.ctx-family-actions', 'aria-label="Edit family history entry"', 'shrink-0', 'flex-shrink', '0'],
  ['.ctx-family-add', 'onclick={addFamily}', 'gap-2', 'gap', 'calc(var(--gb-spacing) * 2)'],
  ['.ctx-family-add-row', 'grid-cols-[130px_minmax(0,1fr)]', 'grid', 'display', 'grid'],
] as const;
for (const [role, markup, utility, property, value] of familyStyleContracts) {
  assert(`CSS defines ${role}`, medicalComponentSrc.includes(markup) && ownedRule(stylesSrc,
    escapedClass('gb:context-form:' + utility) + ':is([data-context-form-modal],[data-context-form-modal] *)',
    { [property]: value }));
}
assert('Family rows do not wrap by default on desktop',
  medicalComponentSrc.includes('const row = \'gb:context-form:flex gb:context-form:items-center')
    && !medicalComponentSrc.match(/const row = [^;]*gb:context-form:flex-wrap/)
    && medicalComponentSrc.includes('gb:context-form:max-[600px]:flex-wrap'));
assert('Long family row text gets ellipsis instead of forcing row height',
  medicalComponentSrc.includes('ctx-family-condition gb:context-form:min-w-0 gb:context-form:flex-1 gb:context-form:truncate')
    && medicalComponentSrc.includes('gb:context-form:basis-[32%] gb:context-form:truncate')
    && ownedRule(stylesSrc, escapedClass('gb:context-form:truncate') + ':is([data-context-form-modal],[data-context-form-modal] *)',
      { overflow: 'hidden', 'text-overflow': 'ellipsis', 'white-space': 'nowrap' }));

console.log(`\nResults: ${legacyAssertions.pass} passed, ${legacyAssertions.fail} failed, ${legacyAssertions.pass + legacyAssertions.fail} total`);
process.exit(legacyAssertions.fail > 0 ? 1 : 0);
