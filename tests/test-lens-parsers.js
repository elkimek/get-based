#!/usr/bin/env node
// test-lens-parsers.js — js/lens-local-parsers.js edge cases.
// Verifies extractFromFile() never throws on malformed input and returns
// sensible empty results so a user drag-dropping junk can't wedge the app.
//
// Covers:
//   empty.zip        — valid zip with no entries
//   zero-byte.md     — empty supported-extension file
//   corrupt.pdf      — garbage bytes with .pdf extension
//   unsupported.xyz  — extension we don't recognize
//   no-extension     — filename with no dot at all
//   .MD (caps)       — case-insensitivity
//   text whitespace  — raw bytes preserved
//
// Run: node tests/test-lens-parsers.js  (or via npm test)

import './_node-shim.js';

let passed = 0, failed = 0;
const results = [];
function assert(name, cond, detail) {
  if (cond) { passed++; results.push(`  PASS: ${name}`); }
  else { failed++; results.push(`  FAIL: ${name}${detail ? ' — ' + detail : ''}`); }
}

const { extractFromFile } = await import('../js/lens-local-parsers.js');

// ── zero-byte markdown ──
{
  const f = new File([''], 'empty.md', { type: 'text/markdown' });
  let out, err;
  try { out = await extractFromFile(f); } catch (e) { err = e; }
  assert('zero-byte .md does not throw', !err, err?.message);
  assert('zero-byte .md returns one entry with empty text',
    Array.isArray(out) && out.length === 1 && out[0].text === '',
    `got ${JSON.stringify(out)}`);
}

// ── unsupported extension ──
{
  const f = new File(['stuff'], 'notes.xyz', { type: 'application/octet-stream' });
  let out, err;
  try { out = await extractFromFile(f); } catch (e) { err = e; }
  assert('unsupported .xyz does not throw', !err, err?.message);
  assert('unsupported .xyz returns []', Array.isArray(out) && out.length === 0);
}

// ── no extension at all ──
{
  const f = new File(['hello world'], 'README', { type: '' });
  let out, err;
  try { out = await extractFromFile(f); } catch (e) { err = e; }
  assert('no-extension file does not throw', !err);
  assert('no-extension file returns []', Array.isArray(out) && out.length === 0);
}

// ── case-insensitive extension match ──
{
  const f = new File(['hello'], 'Notes.MD', { type: 'text/markdown' });
  const out = await extractFromFile(f);
  assert('.MD (caps) detected as markdown', out.length === 1 && out[0].text === 'hello');
}

// ── empty zip ── SKIPPED in Node ────────────────────────────────────
// JSZip references `document` in the unzip path. The zip path is still
// covered by the puppeteer suite; flagged here so a future Vitest
// browser-mode pass picks it up.
console.log('  SKIP: empty zip path — JSZip needs `document`; covered by puppeteer.');
console.log('  SKIP: empty zip returns [] — JSZip needs `document`; covered by puppeteer.');

// ── corrupt PDF ──
{
  const bad = new Uint8Array(128).fill(0x41);
  const f = new File([bad], 'bad.pdf', { type: 'application/pdf' });
  let out, err;
  try { out = await extractFromFile(f); } catch (e) { err = e; }
  const isEmpty = !err && Array.isArray(out) && out.length === 0;
  const threwNicely = err && typeof err.message === 'string';
  assert('corrupt pdf either rejects or returns []',
    isEmpty || threwNicely,
    `out=${JSON.stringify(out)} err=${err?.message}`);
  if (isEmpty === false && out && out[0]?.text) {
    assert('corrupt pdf text is not suspiciously large',
      out[0].text.length < 10_000,
      `got ${out[0].text.length} chars`);
  }
}

// ── text files with weird whitespace ──
{
  const f = new File(['  \n\n  '], 'whitespace.txt');
  const out = await extractFromFile(f);
  assert('whitespace-only .txt returns an entry', out.length === 1);
  assert('whitespace-only .txt preserves raw bytes', out[0].text === '  \n\n  ');
}

// ── JSON file ──
{
  const f = new File(['{"a":1}'], 'data.json');
  const out = await extractFromFile(f);
  assert('.json extracted as text', out.length === 1 && out[0].text === '{"a":1}');
}

console.log(results.join('\n'));
console.log(`\nResults: ${passed} passed, ${failed} failed, ${passed + failed} total`);
process.exit(failed > 0 ? 1 : 0);
