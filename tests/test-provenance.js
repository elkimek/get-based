#!/usr/bin/env node
// test-provenance.js — Import provenance (markerSources) tests.
//
// Static source inspection only — switched from HTTP fetch to fs.readFileSync.
//
// Run: node tests/test-provenance.js  (or via npm test)

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

console.log('=== Import Provenance Tests ===\n');

// ─── 1. PDF Import Provenance ───
console.log('1. PDF Import Provenance');
const pdfSrc = read('js/pdf-import.js');
assert('Init markerSources on entry', pdfSrc.includes('if (!entry.markerSources) entry.markerSources = {};'));
assert('Uses importTs timestamp', pdfSrc.includes('const importTs = Date.now()'));
assert('Matched markers get markerSources', pdfSrc.includes('entry.markerSources[m.mappedKey] = { file: result.fileName'));
assert('New markers get markerSources', pdfSrc.includes('entry.markerSources[m.suggestedKey] = { file: result.fileName'));

// ─── 2. Manual Entry Provenance ───
console.log('\n2. Manual Entry Provenance');
const markerDetailSrc = read('js/marker-detail-modal.js');
const markerDetailEditingSrc = read('js/marker-detail-editing.js');
assert('saveManualEntry inits markerSources', markerDetailEditingSrc.includes('if (!entry.markerSources) entry.markerSources = {};'));
assert('saveManualEntry sets file:null', markerDetailEditingSrc.includes("entry.markerSources[dotKey] = { file: null, at: Date.now() }"));
const editSection = markerDetailEditingSrc.split('function editMarkerValue')[1] || '';
assert('editMarkerValue sets provenance', editSection.includes("entry.markerSources[dotKey] = { file: null, at: Date.now() }"));

// ─── 3. Detail Modal Display ───
console.log('\n3. Detail Modal Display');
assert('Detail modal reads markerSources', markerDetailSrc.includes('srcEntry?.markerSources?.[dotKey]'));
assert('Detail modal has mv-source class', markerDetailSrc.includes('class="mv-source"'));
assert('Detail modal shows manual entry label', markerDetailSrc.includes('mv-source-manual'));
assert('Detail modal falls back to sourceFile', markerDetailSrc.includes('srcEntry?.sourceFile'));

// ─── 4. CSS Styles ───
console.log('\n4. CSS Styles');
const cssSrc = read('styles.css') + '\n' + read('css/marker-detail-modal.css');
assert('mv-source style exists', cssSrc.includes('.mv-source'));
assert('mv-source-manual style exists', cssSrc.includes('.mv-source-manual'));

// ─── 5. Backward Compatibility ───
console.log('\n5. Backward Compatibility');
assert('Optional chaining on markerSources', markerDetailSrc.includes('markerSources?.[dotKey]'));

console.log(`\nResults: ${pass} passed, ${fail} failed, ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
