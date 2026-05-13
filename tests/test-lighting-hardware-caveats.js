#!/usr/bin/env node
// test-lighting-hardware-caveats.js — Guards against the load-bearing
// PWM/TRIAC caveat block being silently dropped from any AI-analysis
// surface. Without these caveats the model recommends "dimmable LED"
// as a flicker fix — which is the #1 cause of household PWM flicker.
//
// Two layers:
//   1. Content — the constant itself contains the canonical strings.
//   2. Wiring  — every importing module both imports AND spreads the
//      constant into a prompt array (catches accidental import-only).
//
// Run: node tests/test-lighting-hardware-caveats.js

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { LIGHTING_HARDWARE_CAVEATS, LIGHTING_HARDWARE_CAVEATS_TEXT } from '../js/lighting-hardware-caveats.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let pass = 0, fail = 0;
function assert(name, condition, detail) {
  if (condition) { pass++; console.log(`  PASS: ${name}`); }
  else { fail++; console.log(`  FAIL: ${name}${detail ? ' — ' + detail : ''}`); }
}

console.log('=== Lighting Hardware Caveats Tests ===\n');

// ─── 1. Caveat constant itself contains the canonical strings ────────
assert('LIGHTING_HARDWARE_CAVEATS is a non-empty array',
  Array.isArray(LIGHTING_HARDWARE_CAVEATS) && LIGHTING_HARDWARE_CAVEATS.length >= 5);
assert('LIGHTING_HARDWARE_CAVEATS_TEXT is the joined string',
  typeof LIGHTING_HARDWARE_CAVEATS_TEXT === 'string' &&
  LIGHTING_HARDWARE_CAVEATS_TEXT.includes(LIGHTING_HARDWARE_CAVEATS[0]));

// Canonical claims that MUST survive any future edit. These are the
// load-bearing ones — if any disappears, the prompt loses a guarantee
// the model relies on.
const canonical = [
  { name: 'mentions PWM',                   needle: /\bPWM\b/ },
  { name: 'mentions TRIAC',                 needle: /\bTRIAC\b/ },
  { name: 'flags dimmable LED as #1 PWM',   needle: /dimmable LEDs? .*#?1.*(PWM|flicker)/i },
  { name: 'mentions flicker scoring',       needle: /flicker/i },
  { name: 'mentions non-dimming alternatives (incandescent OR halogen)',
                                            needle: /\b(incandescent|halogen)\b/i },
  { name: 'mentions blackout / light-blocking for sleep rooms',
                                            needle: /\b(blackout|light-blocking|tap(e|ing))\b/i },
];
for (const c of canonical) {
  assert(`Caveat block ${c.name}`, c.needle.test(LIGHTING_HARDWARE_CAVEATS_TEXT));
}

let bad = LIGHTING_HARDWARE_CAVEATS.filter(s => typeof s !== 'string' || s.length === 0);
assert('Every caveat entry is a non-empty string', bad.length === 0,
  `bad entries: ${bad.length}`);

// ─── 2. Every importer wires the constant into its prompt ────────────
// Static check — read each module's source from disk and assert that:
//   (a) it imports LIGHTING_HARDWARE_CAVEATS (or _TEXT),
//   (b) it spreads / includes the constant somewhere (not just imported
//       and then dropped).
// The 7 importing AI-analysis modules. These are listed in CLAUDE.md
// memory + audited regularly; if a new AI surface is added that
// recommends fixtures, it MUST be added here.
const importers = [
  'js/light-audit-ai-analysis.js',
  'js/light-burden-ai-analysis.js',
  'js/light-screen-ai-analysis.js',
  'js/light-today-ai.js',
  'js/light-env-ai-analysis.js',
  'js/sun-onboarding-ai.js',
  'js/light-tools-ai-analysis.js',
];

for (const relPath of importers) {
  const absPath = path.join(ROOT, relPath);
  let src;
  try { src = fs.readFileSync(absPath, 'utf-8'); }
  catch (e) { src = ''; }
  assert(`${relPath} loads`, src && src.length > 0);
  if (!src) continue;

  const importsConst = /import\s*\{[^}]*\bLIGHTING_HARDWARE_CAVEATS(?:_TEXT)?\b[^}]*\}\s*from\s*['"]\.\/lighting-hardware-caveats\.js['"]/.test(src);
  assert(`${relPath} imports LIGHTING_HARDWARE_CAVEATS`, importsConst);

  const usesConst = /\.\.\.LIGHTING_HARDWARE_CAVEATS\b|LIGHTING_HARDWARE_CAVEATS_TEXT\b/.test(src);
  assert(`${relPath} actually uses the imported caveats (spread or _TEXT splice)`, usesConst);
}

console.log(`\nResults: ${pass} passed, ${fail} failed, ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
