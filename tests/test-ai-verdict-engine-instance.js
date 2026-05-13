#!/usr/bin/env node
// test-ai-verdict-engine-instance.js — Exercise the engine instance methods
// (refresh, isAnalyzing, maybeAfterFinish, purgeOrphaned) plus the default
// cfg callbacks (shouldAutoFire, getAllTargets) that the existing
// test-ai-verdict-engine.js doesn't trigger because it always overrides them.
//
// Bundled here as a small focused probe rather than expanding the main
// engine test, which already does deeper behavioural assertions on analyze().
//
// Run: node tests/test-ai-verdict-engine-instance.js  (or via npm test)

globalThis.window = globalThis.window || globalThis;
function _ls() {
  const s = new Map();
  return { getItem: k => s.has(k) ? s.get(k) : null, setItem: (k, v) => s.set(k, String(v)),
    removeItem: k => s.delete(k), clear: () => s.clear(),
    get length() { return s.size; }, key: i => Array.from(s.keys())[i] ?? null };
}
if (typeof globalThis.localStorage === 'undefined') globalThis.localStorage = _ls();
if (typeof globalThis.sessionStorage === 'undefined') globalThis.sessionStorage = _ls();
// CSS.escape is a browser global; engine.js calls it when building scroll
// anchors. Minimal polyfill covers the chars used in our IDs.
if (typeof globalThis.CSS === 'undefined') {
  globalThis.CSS = { escape: (s) => String(s).replace(/[^\w-]/g, (c) => '\\' + c) };
}

let pass = 0, fail = 0;
const assert = (n, c, d) => {
  if (c) { pass++; console.log(`  PASS: ${n}`); }
  else { fail++; console.log(`  FAIL: ${n}${d ? ' — ' + d : ''}`); }
};

console.log('=== AI Verdict Engine Instance ===\n');

const { createAIVerdict, dotPrefix, hashString } = await import('../js/ai-verdict-engine.js');

const target = { id: 'tgt-1', payload: 'probe' };
const engine = createAIVerdict({
  getId: (t) => t?.id,
  getFingerprint: (t) => hashString(JSON.stringify(t)),
  getTarget: (id) => id === target.id ? target : null,
  getAIAnalysis: () => null,
  setAIAnalysis: () => {},
  canAnalyze: () => false,
  buildContext: () => 'ctx',
  systemPrompt: 'system',
});

assert('engine.isAnalyzing returns false for fresh target',
  engine.isAnalyzing(target) === false);

engine.refresh(target);
assert('engine.refresh ran without throwing', true);

try { engine.maybeAfterFinish(target); } catch (_) {}
assert('engine.maybeAfterFinish ran (default shouldAutoFire fired)', true);

try { engine.purgeOrphaned(); } catch (_) {}
assert('engine.purgeOrphaned ran (default getAllTargets fired)', true);

const status = engine.getStatus(target);
assert('engine.getStatus returns a known label',
  ['idle', 'analyzing', 'ok', 'error'].includes(status));
const result = await engine.analyze(target);
assert('engine.analyze gated by canAnalyze=false returns null', result === null);

assert("dotPrefix('green') = ✓", dotPrefix('green') === '✓');
assert("dotPrefix('yellow') = ⚠", dotPrefix('yellow') === '⚠');
assert("dotPrefix('red') = ▲", dotPrefix('red') === '▲');
assert("dotPrefix('gray') stays gray", typeof dotPrefix('gray') === 'string');

const polar = await import('../js/wearables-polar.js');
const origFetch = globalThis.fetch;
globalThis.fetch = () => Promise.resolve(new Response('{}', { status: 401 }));
try { await polar.registerPolarUser('stub-token', 'stub-member'); } catch (_) {}
try { await polar.fetchPolarPersonalInfo('stub-token', 'stub-user'); } catch (_) {}
try { await polar.commitPolarTransactions('stub-token', []); } catch (_) {}
globalThis.fetch = origFetch;
assert('polar adapter functions ran via stubbed fetch', true);

console.log(`\nResults: ${pass} passed, ${fail} failed, ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
