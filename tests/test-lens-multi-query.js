#!/usr/bin/env node
// test-lens-multi-query.js — Multi-query rewrite + RRF chunk fusion.
//
// Covers the orchestration helpers that close the vocabulary-gap recall
// problem ("Black Seed Oil" → "Nigella Sativa"):
//   - _dedupeQueries:    case-insensitive variant dedup, preserves order,
//                        keeps first-seen casing
//   - _fuseChunksRRF:    reciprocal-rank fusion across multiple ranked
//                        chunk lists, dedup by source+text, top-K cap
//
// queryLensMulti's network/LLM round-trip is exercised end-to-end by the
// chat panel; isolation here keeps the test deterministic.
//
// Run: node tests/test-lens-multi-query.js  (or via npm test)

// lens.js transitively pulls in state.js, which does `window._labState
// = state` at module load. Vitest's setup file handles this globally;
// for standalone `node` runs we shim inline.
import './_node-shim.js';

let pass = 0, fail = 0;
function assert(name, condition, detail) {
  if (condition) { pass++; console.log(`  PASS: ${name}`); }
  else { fail++; console.log(`  FAIL: ${name}${detail ? ' — ' + detail : ''}`); }
}

console.log('=== Lens multi-query tests ===\n');

const lens = await import('../js/lens.js');

// ─── _dedupeQueries ─────────────────────────────────────────
{
  const out = lens._dedupeQueriesForTest(['Black Seed Oil insulin', 'Black seed oil insulin', 'Nigella Sativa']);
  assert('case-insensitive dedup keeps first occurrence',
    out.length === 2 && out[0] === 'Black Seed Oil insulin' && out[1] === 'Nigella Sativa');
}
{
  const out = lens._dedupeQueriesForTest(['  hello  ', 'hello', '', null, undefined, 'world']);
  assert('drops empty/null/whitespace duplicates',
    out.length === 2 && out[0] === 'hello' && out[1] === 'world',
    JSON.stringify(out));
}
{
  const out = lens._dedupeQueriesForTest([]);
  assert('empty input → empty output', out.length === 0);
}

// ─── _fuseChunksRRF ─────────────────────────────────────────
const A = { source: 'docA.md', text: 'alpha-text' };
const B = { source: 'docB.md', text: 'beta-text' };
const C = { source: 'docC.md', text: 'gamma-text' };

{
  const fused = lens._fuseChunksRRFForTest([
    [A, B],
    [A, C],
  ], 3);
  assert('chunk surfacing in multiple lists wins fusion',
    fused.length === 3 && fused[0] === A);
  assert('order after winner reflects single-list contributions',
    fused[1] === B || fused[1] === C);
}
{
  const fused = lens._fuseChunksRRFForTest([
    [A, B, C],
  ], 2);
  assert('topK cap respected', fused.length === 2);
}
{
  const A2 = { source: 'docA.md', text: 'alpha-text' };
  const fused = lens._fuseChunksRRFForTest([
    [A], [A2],
  ], 5);
  assert('dedup by source+text composite key', fused.length === 1);
}
{
  const D = { source: 'docD.md', text: 'alpha-text' };
  const fused = lens._fuseChunksRRFForTest([
    [A], [D],
  ], 5);
  assert('same text from different sources NOT merged', fused.length === 2);
}
{
  const fused = lens._fuseChunksRRFForTest([null, undefined, [], [A]], 5);
  assert('null / empty lists ignored without crashing', fused.length === 1 && fused[0] === A);
}
{
  const fused = lens._fuseChunksRRFForTest([
    [A, { source: 'bad' }, { text: 42 }, B],
  ], 5);
  assert('malformed chunks skipped', fused.length === 2);
}

// ─── Cache reset surface ────────────────────────────────────
{
  let didThrow = false;
  try { lens._resetRewriteCache(); } catch { didThrow = true; }
  assert('_resetRewriteCache is callable without args', !didThrow);
}

// ─── Config wiring ──────────────────────────────────────────
{
  const cfg = lens.getLensConfig();
  assert('config exposes multiQuery field',
    'multiQuery' in cfg, JSON.stringify(cfg));
  assert('multiQuery default is true', cfg.multiQuery === true);
}
{
  const before = lens.getLensConfig();
  lens.saveLensConfig({ multiQuery: false });
  const off = lens.getLensConfig();
  assert('multiQuery=false persists', off.multiQuery === false);
  lens.saveLensConfig({ multiQuery: true });
  const on = lens.getLensConfig();
  assert('multiQuery=true persists', on.multiQuery === true);
  lens.saveLensConfig({ multiQuery: before.multiQuery });
}

console.log(`\nResults: ${pass} passed, ${fail} failed, ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
