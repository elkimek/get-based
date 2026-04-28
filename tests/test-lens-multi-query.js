// test-lens-multi-query.js — Multi-query rewrite + RRF chunk fusion (#145 follow-up)
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

return (async function() {
  let pass = 0, fail = 0;
  function assert(name, condition, detail) {
    if (condition) { pass++; console.log(`%c PASS %c ${name}`, 'background:#22c55e;color:#fff;padding:2px 6px;border-radius:3px', '', detail || ''); }
    else { fail++; console.error(`%c FAIL %c ${name}`, 'background:#ef4444;color:#fff;padding:2px 6px;border-radius:3px', '', detail || ''); }
  }

  console.log('%c Lens multi-query tests ', 'background:#6366f1;color:#fff;font-size:14px;padding:4px 12px;border-radius:4px');

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
  // RRF: score per chunk = sum of 1/(60 + rank). A chunk that surfaces
  // at the same rank in multiple lists must outscore one that surfaces
  // only once even if at a slightly better rank.
  const A = { source: 'docA.md', text: 'alpha-text' };
  const B = { source: 'docB.md', text: 'beta-text' };
  const C = { source: 'docC.md', text: 'gamma-text' };

  {
    // Chunk A appears in BOTH lists at rank 1; should win.
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
    // topK cap respected.
    const fused = lens._fuseChunksRRFForTest([
      [A, B, C],
    ], 2);
    assert('topK cap respected', fused.length === 2);
  }
  {
    // Identical chunks across lists dedupe by source+text (not by ref).
    const A2 = { source: 'docA.md', text: 'alpha-text' };
    const fused = lens._fuseChunksRRFForTest([
      [A], [A2],
    ], 5);
    assert('dedup by source+text composite key', fused.length === 1);
  }
  {
    // Different source, same text → distinct chunks (provenance matters).
    const D = { source: 'docD.md', text: 'alpha-text' };
    const fused = lens._fuseChunksRRFForTest([
      [A], [D],
    ], 5);
    assert('same text from different sources NOT merged', fused.length === 2);
  }
  {
    // Empty / non-array inputs are no-op safe.
    const fused = lens._fuseChunksRRFForTest([null, undefined, [], [A]], 5);
    assert('null / empty lists ignored without crashing', fused.length === 1 && fused[0] === A);
  }
  {
    // Malformed chunks (no .text) skipped.
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
    // Round-trip: save false, read back false, save true, read back true.
    const before = lens.getLensConfig();
    lens.saveLensConfig({ multiQuery: false });
    const off = lens.getLensConfig();
    assert('multiQuery=false persists', off.multiQuery === false);
    lens.saveLensConfig({ multiQuery: true });
    const on = lens.getLensConfig();
    assert('multiQuery=true persists', on.multiQuery === true);
    // Restore original
    lens.saveLensConfig({ multiQuery: before.multiQuery });
  }

  console.log(`\nResults: ${pass} passed, ${fail} failed, ${pass + fail} total`);
})();
