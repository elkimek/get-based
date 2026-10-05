#!/usr/bin/env node
// Node-side test: pure helpers from js/lens-local-utils.js — chunking,
// MMR selection, cosine similarity. No worker, no OPFS, no model load.
//
// Run: node tests/test-lens-local-utils.js

import { chunkText, cosine, mmrSelect } from '../js/lens-local-utils.js';

const results: string[] = [];
let passed = 0, failed = 0;
function assert(name: string, cond: unknown, detail?: unknown) {
  if (cond) { passed++; results.push(`  PASS: ${name}`); }
  else { failed++; results.push(`  FAIL: ${name}${detail ? ' — ' + detail : ''}`); }
}

console.log('=== js/lens-local-utils.js tests ===\n');

// ── chunkText ────────────────────────────────────────────────────
assert('chunk: short text returns single chunk',
  JSON.stringify(chunkText('hello world this is fifty plus characters exactly here', 800, 50, 50))
    === '["hello world this is fifty plus characters exactly here"]');

assert('chunk: below min_size returns []',
  chunkText('short', 800, 50, 50).length === 0);

// 2400 chars / 800 chunk-size with 50-char overlap → 4 chunks
// (0-800, 750-1550, 1500-2300, 2250-2400).
assert('chunk: splits a long paragraph',
  chunkText('A'.repeat(2400), 800, 50, 50).length === 4,
  `got ${chunkText('A'.repeat(2400), 800, 50, 50).length}`);

// Put the sentence boundary past minSize so the chunker actually snaps.
// First 600 chars are filler, then a ". " sentence boundary around pos 600,
// then 500 more chars. Chunker should snap to the ". " near 600 rather
// than cut mid-stream at 800.
const longText = 'A'.repeat(600) + '. ' + 'B'.repeat(500);
const chunks = chunkText(longText, 800, 50, 50);
// chunkText calls .trim() on each chunk, so a trailing ". " gets
// trimmed to ".". Assert on the period — proves the snap happened.
assert('chunk: snaps to sentence boundary',
  chunks[0]!.endsWith('.') && chunks[0]!.length < longText.length,
  `first chunk ended: "${chunks[0]!.slice(-40)}"`);

assert('chunk: overlap preserved between consecutive chunks',
  (() => {
    const out = chunkText('word '.repeat(400), 800, 50, 50);
    if (out.length < 2) return false;
    // End of chunk[0] should appear in start of chunk[1] (overlap window).
    const tail = out[0]!.slice(-30);
    return out[1]!.includes(tail.slice(5));
  })());

// ── cosine ───────────────────────────────────────────────────────
assert('cosine: identical unit vectors → 1',
  Math.abs(cosine([1, 0, 0], [1, 0, 0]) - 1) < 1e-9);
assert('cosine: orthogonal → 0',
  Math.abs(cosine([1, 0, 0], [0, 1, 0])) < 1e-9);
assert('cosine: opposite → -1',
  Math.abs(cosine([1, 0, 0], [-1, 0, 0]) + 1) < 1e-9);

// Unit-normalized 45° pair
const a = [Math.SQRT1_2, Math.SQRT1_2, 0];
const b = [1, 0, 0];
assert('cosine: 45° pair ≈ √½',
  Math.abs(cosine(a, b) - Math.SQRT1_2) < 1e-9);

// ── mmrSelect ────────────────────────────────────────────────────
// Build 5 candidates where #0 and #1 are nearly identical, #2 is
// orthogonal, #3 is opposite-to-0, #4 is at 45°. With λ=0.5, MMR should
// pick 0 first, then the most-diverse remaining — #2 or #3 — rather
// than #1 which is a near-duplicate of #0.
const vecs = [
  [1, 0, 0, 0],
  [0.99, 0.14, 0, 0], // near-dupe of #0
  [0, 1, 0, 0],       // orthogonal
  [-1, 0, 0, 0],      // opposite
  [Math.SQRT1_2, Math.SQRT1_2, 0, 0], // 45° from #0
];
const candidates = [
  { i: 0, score: 0.95 },
  { i: 1, score: 0.94 },
  { i: 4, score: 0.70 },
  { i: 2, score: 0.50 },
  { i: 3, score: 0.10 },
];
const picked = mmrSelect(candidates, 3, 0.5, (i) => vecs[i]!);
assert('mmr: first pick is top-scored',
  picked[0]!.i === 0, `got ${picked[0]!.i}`);
assert('mmr: rejects near-duplicate #1',
  picked.every((p) => p.i !== 1) || picked.length === 1,
  `picked indices: ${picked.map((p) => p.i).join(',')}`);

// With λ=1.0 (pure relevance), MMR should behave like sort-by-score
// and keep the near-duplicate since relevance is the only signal.
const relOnly = mmrSelect(candidates, 3, 1.0, (i) => vecs[i]!);
assert('mmr λ=1: picks top-3 by score regardless of similarity',
  relOnly[0]!.i === 0 && relOnly[1]!.i === 1 && relOnly[2]!.i === 4,
  `got ${relOnly.map((p) => p.i).join(',')}`);

// With λ=0 (pure diversity), MMR penalises any similarity to chosen.
// Starting from #0, next pick must minimize similarity — #3 (opposite).
const divOnly = mmrSelect(candidates, 2, 0.0, (i) => vecs[i]!);
assert('mmr λ=0: second pick maximizes diversity from first',
  divOnly[1]!.i === 3, `got ${divOnly[1]!.i}`);

// ── Done ─────────────────────────────────────────────────────────
console.log(results.join('\n'));
console.log(`\nTotal: ${passed} passed, ${failed} failed.`);
process.exit(failed === 0 ? 0 : 1);
