#!/usr/bin/env node
// test-dna-mtdna-subclades.js — mtDNA sub-haplogroup resolution (v1.23.0)
//
// Covers:
//   - 11 new sub-haplogroups (H1, H3, J1, J2, K1, T1, T2, U5a, U5b, U6, A2)
//   - parentHg field present
//   - Matcher tiebreaker: sub-clade wins over parent when both match fully
//   - Cumulative mutation inheritance (parent markers + derived markers)
//   - Part C: I control-region noise trimmed, B HAPE claim softened
//   - Haplogroup count updated
//
// Run: node tests/test-dna-mtdna-subclades.js  (or via npm test)

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

console.log('=== mtDNA Sub-haplogroup Tests ===\n');

const hapTable = JSON.parse(read('data/haplogroups.json'));
const dnaSrc = read('js/dna.js');

  // ═══════════════════════════════════════
  // 1. Sub-haplogroup entries present
  // ═══════════════════════════════════════
  console.log('%c 1. Sub-haplogroup Entries ', 'font-weight:bold;color:#f59e0b');

  const subs = ['H1', 'H3', 'J1', 'J2', 'K1', 'T1', 'T2', 'U5a', 'U5b', 'U6', 'A2'];
  for (const sub of subs) {
    const entry = hapTable.haplogroups[sub];
    assert(`${sub} exists`, entry != null);
    if (!entry) continue;
    assert(`${sub} has parentHg field`, typeof entry.parentHg === 'string');
    assert(`${sub} has ≥3 cumulative mutations`, Array.isArray(entry.mutations) && entry.mutations.length >= 3);
    assert(`${sub} has coupling matching a couplingLevels key`, hapTable.couplingLevels[entry.coupling] != null);
    assert(`${sub} has origin`, typeof entry.origin === 'string' && entry.origin.length > 0);
    assert(`${sub} has etc phenotype note`, typeof entry.etc === 'string' && entry.etc.length > 10);
  }

  // ═══════════════════════════════════════
  // 2. Cumulative mutation inheritance — each sub-clade carries parent's markers
  // ═══════════════════════════════════════
  console.log('%c 2. Cumulative Mutation Inheritance ', 'font-weight:bold;color:#f59e0b');

  for (const sub of subs) {
    const entry = hapTable.haplogroups[sub];
    const parent = hapTable.haplogroups[entry.parentHg];
    if (!parent) continue;
    const parentMuts = new Set(parent.mutations);
    const childMuts = new Set(entry.mutations);
    const missing = [...parentMuts].filter(m => !childMuts.has(m));
    assert(`${sub} inherits all ${parent.mutations.length} parent mutations from ${entry.parentHg}`,
      missing.length === 0,
      missing.length ? `missing: ${missing.join(', ')}` : '');
    assert(`${sub} has ≥1 derived mutation beyond parent`,
      entry.mutations.length > parent.mutations.length);
  }

  // ═══════════════════════════════════════
  // 3. Matcher tiebreaker present in source
  // ═══════════════════════════════════════
  console.log('%c 3. Matcher Tiebreaker ', 'font-weight:bold;color:#f59e0b');

  assert('resolveHaplogroup tracks bestMatchedCount', dnaSrc.includes('bestMatchedCount'));
  assert('resolveHaplogroup prefers higher matched count on equal scores',
    /score === bestScore.*matched\.length > bestMatchedCount/.test(dnaSrc.replace(/\s+/g, ' ')));

  // ═══════════════════════════════════════
  // 4. End-to-end: H1 mutations resolve to H1 (not H) via tiebreaker
  // ═══════════════════════════════════════
  console.log('%c 4. End-to-End Haplogroup Resolution ', 'font-weight:bold;color:#f59e0b');

  const dna = await import('../js/dna.js');

  // H1 = H's 2 mutations + H1's derived 3010A. Should resolve to H1 (3/3, matched=3)
  // beating H (2/2, matched=2) via the higher-matched-count tiebreaker.
  const h1Muts = ['2706A', '7028C', '3010A'].map(raw => ({ raw, position: 0, allele: '' }));
  const h1Resolved = dna.resolveHaplogroup(h1Muts, hapTable);
  assert('H1 mutations resolve to H1 (not H)', h1Resolved?.haplogroup === 'H1',
    `got ${h1Resolved?.haplogroup}`);

  // H3 = H + 6776C
  const h3Muts = ['2706A', '7028C', '6776C'].map(raw => ({ raw }));
  const h3Resolved = dna.resolveHaplogroup(h3Muts, hapTable);
  assert('H3 mutations resolve to H3 (not H)', h3Resolved?.haplogroup === 'H3',
    `got ${h3Resolved?.haplogroup}`);

  // J1: all 9 J markers + 3 J1-derived
  const j1Muts = ['295T', '489C', '4216C', '10398G', '11251G', '12612G', '13708A', '16069T', '16126C',
                  '3010A', '462T', '16261T'].map(raw => ({ raw }));
  const j1Resolved = dna.resolveHaplogroup(j1Muts, hapTable);
  assert('J1 cumulative mutations resolve to J1 (not J)', j1Resolved?.haplogroup === 'J1',
    `got ${j1Resolved?.haplogroup}`);

  // U5b: U + U5 + U5b cumulative
  const u5bMuts = ['11467G', '12308G', '12372A', '3197C', '9477A', '13617C', '16270T',
                   '5656G', '7768G', '150T'].map(raw => ({ raw }));
  const u5bResolved = dna.resolveHaplogroup(u5bMuts, hapTable);
  assert('U5b cumulative mutations resolve to U5b (not U)', u5bResolved?.haplogroup === 'U5b',
    `got ${u5bResolved?.haplogroup}`);

  // Negative case: bare J mutations (no J1/J2 derived) should still resolve to J,
  // not spuriously match a sub-clade. Bare J would score 9/12 = 0.75 on J1 and J2,
  // but 9/9 = 1.0 on J — J wins on score regardless of tiebreaker.
  const jBareMuts = ['295T', '489C', '4216C', '10398G', '11251G', '12612G', '13708A', '16069T', '16126C'].map(raw => ({ raw }));
  const jBareResolved = dna.resolveHaplogroup(jBareMuts, hapTable);
  assert('Bare J mutations still resolve to J (no spurious sub-clade match)',
    jBareResolved?.haplogroup === 'J',
    `got ${jBareResolved?.haplogroup}`);

  // Tiebreaker direct test: when H and H1 BOTH match fully, pick H1 (more matched).
  // Synthesize: a user with H1 mutations (parent + derived) — score is 1.0 for both,
  // but matched count is 2 for H and 3 for H1.
  const tieResolved = dna.resolveHaplogroup([{raw:'2706A'},{raw:'7028C'},{raw:'3010A'}], hapTable);
  assert('Equal-score tiebreaker picks more-specific sub-clade',
    tieResolved?.haplogroup === 'H1' && tieResolved?.matchedMutations === 3,
    `got ${tieResolved?.haplogroup} matched=${tieResolved?.matchedMutations}`);

  // ═══════════════════════════════════════
  // 5. Part C: existing haplogroup cleanup
  // ═══════════════════════════════════════
  console.log('%c 5. Part C Cleanup ', 'font-weight:bold;color:#f59e0b');

  const I = hapTable.haplogroups.I;
  assert('I haplogroup no longer carries 199C (control-region universal)',
    !I.mutations.includes('199C'));
  assert('I haplogroup no longer carries 204C',
    !I.mutations.includes('204C'));
  assert('I haplogroup no longer carries 250C',
    !I.mutations.includes('250C'));
  assert('I haplogroup keeps 1719A (true I-defining marker)',
    I.mutations.includes('1719A'));
  assert('I haplogroup keeps ≥5 diagnostic mutations post-trim',
    I.mutations.length >= 5);

  const B = hapTable.haplogroups.B;
  assert('B haplogroup HAPE claim softened (not phrased as "risk factor")',
    !B.etc.includes('Risk factor for high-altitude pulmonary edema'));
  assert('B haplogroup 9bp-deletion schema-gap documented',
    /9bp|not yet representable|schema/i.test(B.etc));

  // ═══════════════════════════════════════
  // 6. Metadata updated
  // ═══════════════════════════════════════
  console.log('%c 6. Metadata ', 'font-weight:bold;color:#f59e0b');

  const totalHg = Object.keys(hapTable.haplogroups).length;
  assert('_meta.haplogroupCount matches actual entry count',
    hapTable._meta.haplogroupCount === totalHg,
    `meta=${hapTable._meta.haplogroupCount} actual=${totalHg}`);
  assert('≥38 haplogroups total', totalHg >= 38);

  // ═══════════════════════════════════════
  // Results
  // ═══════════════════════════════════════
console.log(`\nResults: ${pass} passed, ${fail} failed, ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
