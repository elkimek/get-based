#!/usr/bin/env node
// Source-inspection coverage for compare/correlation delegated actions.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

let pass = 0;
let fail = 0;

function assert(name, condition) {
  if (condition) {
    pass += 1;
    console.log(`  PASS: ${name}`);
  } else {
    fail += 1;
    console.log(`  FAIL: ${name}`);
  }
}

const compareSrc = read('js/compare-correlations.js');
const eventNames = ['click', 'keydown', 'change', 'input', 'submit', 'blur', 'toggle'];
const inlineEventPattern = new RegExp(`\\bon(?:${eventNames.join('|')})=["']`);

console.log('=== Compare Correlations Delegated Actions Tests ===');

assert('compare-correlations renderer emits no inline event attributes',
  !inlineEventPattern.test(compareSrc));

assert('compare-correlations imports escapeAttr for delegated data attributes',
  /import\s*\{[^}]*\bescapeAttr\b[^}]*\}\s*from\s*['"]\.\/utils\.js['"]/.test(compareSrc));

assert('compare action attribute helper is exported',
  /export function compareActionAttrs\(action, attrs = \{\}\)/.test(compareSrc)
  && compareSrc.includes('data-compare-action'));

assert('compare delegates install click change input and focusin listeners',
  compareSrc.includes("root.addEventListener('click', handleCompareClick)")
  && compareSrc.includes("root.addEventListener('change', handleCompareChange)")
  && compareSrc.includes("root.addEventListener('input', handleCompareInput)")
  && compareSrc.includes("root.addEventListener('focusin', handleCompareFocus)")
  && compareSrc.includes('installCompareCorrelationDelegates();'));

assert('compare date controls use delegated change actions',
  compareSrc.includes("compareChangeAttrs('set-date', { index: '1' })")
  && compareSrc.includes("compareChangeAttrs('set-date', { index: '2' })")
  && compareSrc.includes("compareActionAttrs('swap-dates')"));

assert('correlation search uses delegated input and focus actions',
  compareSrc.includes("compareInputAttrs('filter-options')")
  && compareSrc.includes("compareFocusAttrs('show-dropdown')"));

assert('correlation preset AI option and chip controls use delegated click actions',
  compareSrc.includes("compareActionAttrs('apply-preset', { index: i })")
  && compareSrc.includes("compareActionAttrs('ask-ai-correlations')")
  && compareSrc.includes("compareActionAttrs('toggle-marker', { key: fullKey })")
  && compareSrc.includes("compareActionAttrs('toggle-marker', { key })"));

assert('compare click delegate routes all rendered actions',
  compareSrc.includes("action === 'swap-dates'")
  && compareSrc.includes("action === 'apply-preset'")
  && compareSrc.includes("action === 'toggle-marker'")
  && compareSrc.includes("action === 'ask-ai-correlations'"));

console.log(`\nCompare correlations delegated actions tests: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
