#!/usr/bin/env node
// test-quality-guardrails.js — pin dependency-free quality guardrails.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

let passed = 0;
let failed = 0;

function assert(name, condition, detail = '') {
  if (condition) {
    passed++;
    console.log(`  PASS: ${name}`);
  } else {
    failed++;
    console.log(`  FAIL: ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

console.log('=== Quality Guardrails Tests ===\n');

const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const guardrailSrc = fs.readFileSync(path.join(ROOT, 'scripts', 'quality-guardrails.mjs'), 'utf8');
const baseline = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts', 'quality-baseline.json'), 'utf8'));

assert('package.json exposes npm run quality',
  pkg.scripts?.quality === 'node scripts/quality-guardrails.mjs');
assert('quality guardrail syntax-checks JS/MJS files',
  guardrailSrc.includes("execFileSync(process.execPath, ['--check', file]"));
assert('quality guardrail tracks inline event attribute budget',
  guardrailSrc.includes('INLINE_EVENT_RE') && Object.hasOwn(baseline, 'inlineEventAttributes'));
assert('quality guardrail tracks window.* coupling budget',
  guardrailSrc.includes('WINDOW_REF_RE') && Object.hasOwn(baseline, 'windowReferences'));
assert('quality guardrail tracks large-module budget',
  guardrailSrc.includes('LARGE_FILE_LINE_LIMIT') &&
    Object.hasOwn(baseline, 'largeJsFilesOver800Lines') &&
    Object.hasOwn(baseline, 'maxJsFileLines'));
assert('quality guardrail exits non-zero on failures',
  guardrailSrc.includes('process.exit(failed > 0 ? 1 : 0)'));

console.log(`\nResults: ${passed} passed, ${failed} failed, ${passed + failed} total`);
process.exit(failed > 0 ? 1 : 0);
