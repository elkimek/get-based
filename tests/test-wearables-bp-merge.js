#!/usr/bin/env node
// test-wearables-bp-merge.js — BP renders as one paired card (sys/dia).
// Covers: strip-render filter (dia hidden when sys present), reorder-mode
// filter symmetry, renderCard pairing format, edge case (dia-only surfaces),
// and the BP-form idempotency fix (clicking inside the form doesn't rebuild).
//
// Run: node tests/test-wearables-bp-merge.js  (or via npm test)
//
// All assertions here are source-inspection regexes against wearables.js /
// wearable-adapters.js / wearables-manual.js. The section-4 *live* DOM
// idempotency probe (openManualLogForm called twice → still one form) lives
// in tests/test-wearables-bp-merge-dom.js on the puppeteer runner.

import './_node-shim.js';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel.replace(/^\//, '')), 'utf-8');

let pass = 0, fail = 0;
function assert(name, condition, detail) {
  if (condition) { pass++; console.log(`  PASS: ${name}`); }
  else { fail++; console.log(`  FAIL: ${name}${detail ? ' — ' + detail : ''}`); }
}

console.log('=== BP Card Merge Tests ===\n');

const wearablesSrc = read('js/wearables.js');

// ═══════════════════════════════════════
// 1. Strip-render filter — dia hidden when sys present
// ═══════════════════════════════════════
console.log('1. Strip filter');

assert('renderWearableStrip flags hasSys before the displayOrder loop',
  /const hasSys = !!summary\.metrics\?\.bp_systolic/.test(wearablesSrc));
assert('displayOrder loop skips bp_diastolic when hasSys is true',
  /if \(id === 'bp_diastolic' && hasSys\) continue/.test(wearablesSrc));

// ═══════════════════════════════════════
// 2. renderCard receives pairedMetric for BP
// ═══════════════════════════════════════
console.log('2. renderCard pairing');

assert('Caller passes pairedMetric when rendering bp_systolic',
  /const pairedMetric = \(metricId === 'bp_systolic'\) \? summary\.metrics\?\.bp_diastolic : null/.test(wearablesSrc));
assert('renderCard accepts an opts arg with pairedMetric',
  /function renderCard\(metricId, canon, metric, showSourceBadge, sourceMaxDate, opts = \{\}\)/.test(wearablesSrc));
assert('renderCard derives isBPCard from metricId + pairedMetric',
  /const isBPCard = metricId === 'bp_systolic' && pairedMetric/.test(wearablesSrc));
assert("Card label flips to 'Blood pressure' when paired",
  /const cardLabel = isBPCard \? 'Blood pressure' : canon\.label/.test(wearablesSrc));
assert('Sub-label suppressed for paired BP card (no "sys" badge)',
  /const cardSub = isBPCard \? null : canon\.sub/.test(wearablesSrc));
assert('Value renders as sys/dia when paired',
  /const valueRead = isBPCard \? `\$\{sysRead\}\/\$\{diaRead \|\| '—'\}` : sysRead/.test(wearablesSrc));
assert('Baseline renders as sys/dia when paired',
  /const baselineRead = isBPCard\s*\?\s*`\$\{metric\.baseline \?\? '—'\}\/\$\{pairedMetric\.baseline \?\? '—'\}`/.test(wearablesSrc));
assert("Aria-label uses 'Blood pressure' for the paired card",
  /const canonRead = isBPCard\s*\?\s*'Blood pressure'/.test(wearablesSrc));

// ═══════════════════════════════════════
// 3. Reorder-mode filter symmetry
// ═══════════════════════════════════════
console.log('3. Reorder filter');

assert('moveWearableCard mirrors the same dia-skip when sys present',
  /const hasSysLocal = !!summary\.metrics\?\.bp_systolic[\s\S]{0,400}if \(id === 'bp_diastolic' && hasSysLocal\) continue/.test(wearablesSrc));

// ═══════════════════════════════════════
// 4. BP form idempotency (the dia-click bug fix) — source asserts
// ═══════════════════════════════════════
// The *live* DOM probe (openManualLogForm called twice → still one form)
// lives in test-wearables-bp-merge-dom.js.
console.log('4. Form idempotency (source)');

assert('openManualLogForm returns early when the form is already rendered',
  /openManualLogForm[\s\S]{0,500}if \(card\.querySelector\('\.wearable-log-form'\)\) return/.test(wearablesSrc));
assert('Idempotency guard has a comment explaining the dia-click bug',
  /clicks inside the form \(e\.g\. tapping the dia field on the[\s\S]{0,200}Without this guard we'd rebuild/.test(wearablesSrc));

// ═══════════════════════════════════════
// 5. Storage untouched — underlying metric storage didn't change
// ═══════════════════════════════════════
console.log('5. Storage untouched');

const adaptersSrc = read('js/wearable-adapters.js');
assert('CANONICAL_METRICS still keeps bp_systolic + bp_diastolic separate',
  /bp_systolic:\s*\{[^}]*ariaLabel: 'Blood pressure systolic'/.test(adaptersSrc) &&
  /bp_diastolic:\s*\{[^}]*ariaLabel: 'Blood pressure diastolic'/.test(adaptersSrc));

const manualSrc = read('js/wearables-manual.js');
assert('MANUAL_METRICS still lists both bp_systolic and bp_diastolic separately',
  /MANUAL_METRICS\s*=\s*\['weight', 'bp_systolic', 'bp_diastolic', 'rhr'\]/.test(manualSrc));

console.log(`\nResults: ${pass} passed, ${fail} failed, ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
