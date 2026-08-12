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
const pdfCommitSrc = read('js/pdf-import-commit.js');
const labEntrySrc = read('js/lab-entry.js');
assert('Init markerSources on entry', labEntrySrc.includes('function ensureMarkerSources(entry)'));
assert('PDF import facade re-exports commit actions', pdfSrc.includes("from './pdf-import-commit.js'"));
assert('Uses importTs timestamp', pdfCommitSrc.includes('const importTs = Date.now()'));
assert('Matched markers get markerSources', /setLabEntryMarker\(entry, m\.mappedKey[\s\S]{0,180}source: \{ file: result\.fileName/.test(pdfCommitSrc));
assert('New markers get markerSources', /setLabEntryMarker\(entry, m\.suggestedKey[\s\S]{0,180}source: \{ file: result\.fileName/.test(pdfCommitSrc));

// ─── 2. Manual Entry Provenance ───
console.log('\n2. Manual Entry Provenance');
const markerDetailSrc = read('js/marker-detail-modal-impl.js');
const markerDetailHistorySrc = read('js/marker-detail-history.js');
const markerDetailEditingSrc = read('js/marker-detail-editing.js');
const markerDetailStoreSrc = read('js/marker-detail-store.js');
assert('saveManualEntry inits markerSources', labEntrySrc.includes('function ensureMarkerSources(entry)'));
assert('saveManualEntry sets file:null',
  /saveManualEntry[\s\S]{0,6200}saveManualMarkerValue\(\{[\s\S]{0,250}dotKey,[\s\S]{0,250}noteText,[\s\S]{0,250}collectionContext:/.test(markerDetailEditingSrc)
    && /saveManualMarkerValue[\s\S]{0,1200}source: \{ file: null, at: now \}/.test(markerDetailStoreSrc));
const editSection = markerDetailEditingSrc.split('function editMarkerValue')[1] || '';
assert('editMarkerValue sets provenance',
  /editManualMarkerValue\(\{ dotKey, date, storedValue \}\)/.test(editSection)
    && /editManualMarkerValue[\s\S]{0,900}source: \{ file: null, at: now \}/.test(markerDetailStoreSrc));

// ─── 3. Detail Modal Display ───
console.log('\n3. Detail Modal Display');
assert('Detail modal reads markerSources', markerDetailSrc.includes('srcEntry?.markerSources?.[dotKey]'));
assert('Detail modal has mv-source class', markerDetailHistorySrc.includes('class="mv-source"'));
assert('Detail modal shows manual entry label', markerDetailHistorySrc.includes('mv-source-manual'));
assert('Detail modal falls back to sourceFile', markerDetailHistorySrc.includes('entry?.sourceFile'));

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
