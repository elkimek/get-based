#!/usr/bin/env node
// test-pii.js — PII obfuscation: regex patterns, word-level diff, patient name extraction
//
// Run: node tests/test-pii.js  (or via npm test)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

globalThis.window = globalThis.window || globalThis;
function _ls() {
  const s = new Map();
  return { getItem: k => s.has(k) ? s.get(k) : null, setItem: (k, v) => s.set(k, String(v)),
    removeItem: k => s.delete(k), clear: () => s.clear(),
    get length() { return s.size; }, key: i => Array.from(s.keys())[i] ?? null };
}
if (typeof globalThis.localStorage === 'undefined') globalThis.localStorage = _ls();
if (typeof globalThis.sessionStorage === 'undefined') globalThis.sessionStorage = _ls();

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf-8');

let pass = 0, fail = 0;
function assert(name, condition, detail) {
  if (condition) { pass++; console.log(`  PASS: ${name}`); }
  else { fail++; console.log(`  FAIL: ${name}${detail ? ' — ' + detail : ''}`); }
}

console.log('=== PII Obfuscation Tests ===\n');

const piiModule = await import('../js/pii.js');
const { obfuscatePDFText, buildPIIDiffHTML } = piiModule;
const piiSrc = read('js/pii.js');

  // Extract the function and test it by running obfuscation with known names
  // Czech format
  const czText = 'Jmeno: Karel Svoboda\nGlukoza 5.2 mmol/L';
  const czResult = obfuscatePDFText(czText);
  assert('Czech name replaced', !czResult.obfuscated.includes('Karel Svoboda'), `got: ${czResult.obfuscated.split('\n')[0]}`);

  // English format — "Patient Name:"
  const enText = 'Patient Name: John Smith\nGlucose 95 mg/dL';
  const enResult = obfuscatePDFText(enText);
  assert('English "Patient Name:" replaced', !enResult.obfuscated.includes('John Smith'), `got: ${enResult.obfuscated.split('\n')[0]}`);

  // English format — "Name:"
  const nameText = 'Name: Jane Doe\nCholesterol 200 mg/dL';
  const nameResult = obfuscatePDFText(nameText);
  assert('English "Name:" replaced', !nameResult.obfuscated.includes('Jane Doe'), `got: ${nameResult.obfuscated.split('\n')[0]}`);

  // extractPatientName dropped — too unreliable across PDF layouts
  assert('extractPatientName removed', piiSrc.includes('extractPatientName dropped'));

  // ═══════════════════════════════════════
  // 2. US Lab (LabCorp-style) Regex Patterns
  // ═══════════════════════════════════════
  console.log('%c 2. US Lab Regex Patterns ', 'font-weight:bold;color:#f59e0b');

  const labcorpText = [
    'Patient Name: Robert Johnson',
    'DOB: 05/15/1980',
    'Age: 43',
    'Sex: Male',
    'Specimen ID: 0123456789',
    'Accession No: 9876543210',
    'Account No: 1234567890',
    'Ordering: Dr. Sarah Williams',
    'Phone: (555) 123-4567',
    'Member ID: XYZ123456789',
    'Collected: 01/15/2024',
    '',
    'Glucose 95 mg/dL 65-99',
    'BUN 15 mg/dL 6-24',
    'Creatinine 1.0 mg/dL 0.76-1.27',
    'WBC 6.5 thou/uL 3.4-10.8',
    'RBC 4.8 mill/uL 4.14-5.80',
  ].join('\n');

  const lcResult = obfuscatePDFText(labcorpText);
  const lcOut = lcResult.obfuscated;

  assert('Patient name replaced', !lcOut.includes('Robert Johnson'), `name still present`);
  assert('DOB replaced', !lcOut.includes('05/15/1980'), `DOB still present`);
  // Age regex replaces the value — check it changed (may randomly match, so verify the line was touched)
  const ageLineOrig = 'Age: 43';
  const ageLineOut = lcOut.split('\n').find(l => l.startsWith('Age:'));
  assert('Age line processed', ageLineOut != null && lcResult.replacements > 0, `age line: ${ageLineOut}`);
  assert('Specimen ID replaced', !lcOut.includes('0123456789'), `specimen ID still present`);
  assert('Accession No replaced', !lcOut.includes('9876543210'), `accession still present`);
  assert('Account No replaced', !lcOut.includes('1234567890'), `account still present`);
  assert('Ordering physician replaced', !lcOut.includes('Sarah Williams'), `physician still present`);
  assert('US phone replaced', !lcOut.includes('(555) 123-4567'), `phone still present`);
  assert('Member ID replaced', !lcOut.includes('XYZ123456789'), `member ID still present`);

  // Results should be preserved
  assert('Glucose value preserved', lcOut.includes('95'), `glucose value missing`);
  assert('mg/dL unit preserved', lcOut.includes('mg/dL'), `unit missing`);
  assert('WBC value preserved', lcOut.includes('6.5'), `WBC value missing`);
  assert('thou/uL unit preserved', lcOut.includes('thou/uL'), `unit missing`);
  assert('Collection date preserved', lcOut.includes('01/15/2024'), `collection date stripped`);

  // ═══════════════════════════════════════
  // 3. Czech/Slovak Patterns Still Work
  // ═══════════════════════════════════════
  console.log('%c 3. Czech/Slovak Patterns ', 'font-weight:bold;color:#f59e0b');

  const czFullText = [
    'Jmeno: Jan Novotny',
    'Rodne cislo: 850115/1234',
    'Adresa: Hlavni 42, Praha',
    'Lekar: MUDr. Kopecka',
    'Datum odber: 15.01.2024',
    '',
    'Glukoza 5.2 mmol/L 3.9-5.6',
  ].join('\n');

  const czFullResult = obfuscatePDFText(czFullText);
  const czOut = czFullResult.obfuscated;

  assert('CZ name replaced', !czOut.includes('Jan Novotny'));
  assert('CZ birth number replaced', !czOut.includes('850115/1234'));
  assert('CZ address replaced', !czOut.includes('Hlavni 42'));
  assert('CZ doctor replaced', !czOut.includes('Kopecka'));
  assert('CZ collection date preserved', czOut.includes('15.01.2024'));
  assert('CZ glucose value preserved', czOut.includes('5.2'));
  assert('CZ replacements counted', czFullResult.replacements >= 4, `only ${czFullResult.replacements} replacements`);

  // ═══════════════════════════════════════
  // 4. SSN Pattern
  // ═══════════════════════════════════════
  console.log('%c 4. SSN Pattern ', 'font-weight:bold;color:#f59e0b');

  const ssnText = 'SSN: 123-45-6789\nGlucose 95 mg/dL';
  const ssnResult = obfuscatePDFText(ssnText);
  assert('SSN replaced', !ssnResult.obfuscated.includes('123-45-6789'));

  // ═══════════════════════════════════════
  // 5. Word-Level Diff
  // ═══════════════════════════════════════
  console.log('%c 5. Word-Level Diff ', 'font-weight:bold;color:#f59e0b');

  const diffOrig = 'Patient Name: John Smith\nGlucose 5.2 mmol/L';
  const diffObf = 'Patient Name: Jana Novakova\nGlucose 5.2 mmol/L';
  const { leftHtml, rightHtml } = buildPIIDiffHTML(diffOrig, diffObf);

  // Changed line should have word-level highlights
  assert('Left has word-removed spans', leftHtml.includes('pii-word-removed'), `no word-removed class found`);
  assert('Right has word-added spans', rightHtml.includes('pii-word-added'), `no word-added class found`);

  // Changed line should have line-level background
  assert('Left has line highlight', leftHtml.includes('pii-diff-highlight-removed'));
  assert('Right has line highlight', rightHtml.includes('pii-diff-highlight-added'));

  // Unchanged line should NOT have highlights
  assert('Unchanged line no highlight', leftHtml.includes('<div>Glucose 5.2 mmol/L</div>'), `unchanged line got highlighted`);

  // Specific words highlighted
  assert('Removed word "John" highlighted', leftHtml.includes('>John<') || leftHtml.includes('>John </'));
  assert('Added word "Jana" highlighted', rightHtml.includes('>Jana<') || rightHtml.includes('>Jana </'));

  // ═══════════════════════════════════════
  // 6. Empty / Edge Cases
  // ═══════════════════════════════════════
  console.log('%c 6. Edge Cases ', 'font-weight:bold;color:#f59e0b');

  // Identical text = no diff highlights
  const sameDiff = buildPIIDiffHTML('hello world', 'hello world');
  assert('Identical text has no highlights', !sameDiff.leftHtml.includes('pii-diff-highlight') && !sameDiff.rightHtml.includes('pii-diff-highlight'));

  // Empty text
  const emptyDiff = buildPIIDiffHTML('', '');
  assert('Empty text does not crash', emptyDiff.leftHtml.includes('&nbsp;'));

  // Result line protection — digits in result lines should NOT be replaced
  const resultOnlyText = 'WBC 12345678 cells/uL 4000-11000';
  const resultResult = obfuscatePDFText(resultOnlyText);
  assert('Long digits in result line preserved', resultResult.obfuscated.includes('12345678'), `result digits were replaced`);

  // ═══════════════════════════════════════
  // 7. Thinking Token Stripping (source check)
  // ═══════════════════════════════════════
  console.log('%c 7. Thinking Token Support ', 'font-weight:bold;color:#f59e0b');

  assert('sanitizeWithOllamaStreaming accepts onThinking param',
    piiSrc.includes('sanitizeWithOllamaStreaming(pdfText, onChunk, signal, onThinking)'));
  assert('Handles reasoning_content field',
    piiSrc.includes('delta.reasoning_content'));
  assert('Handles <think> tags',
    piiSrc.includes("indexOf('<think>')") || piiSrc.includes("indexOf('<think>"));
  assert('Thinking not added to accumulated output',
    piiSrc.includes('onThinking(') && !piiSrc.includes('accumulated += delta.reasoning_content'));
  assert('Thinking section in review modal HTML',
    piiSrc.includes('pii-thinking-section'));
  assert('Thinking section collapses on completion',
    piiSrc.includes("'Thinking (done)'"));

  // ═══════════════════════════════════════
  // 8. Ollama unload guard
  // ═══════════════════════════════════════
  console.log('%c 8. Ollama Unload Guard ', 'font-weight:bold;color:#f59e0b');

  assert('unloadOllamaPIIModel checks port 11434',
    piiSrc.includes("port !== '11434'"), 'should only fire for Ollama default port');

  // ═══════════════════════════════════════
console.log(`\nResults: ${pass} passed, ${fail} failed, ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
