#!/usr/bin/env node
// test-wearables-runtime-config.js — Self-host OAuth client_id override (issue #145)
//
// Covers the helper layer that lets self-hosters override the maintainer's
// hardcoded OAuth client_id via *_CLIENT_ID env vars surfaced through
// /api/proxy `wearable_runtime_config`. End-to-end behavior (the actual
// fetch round-trip) is exercised by the live dev-server + Vercel proxy.
//
// Run: node tests/test-wearables-runtime-config.js  (or via npm test)

globalThis.window = globalThis.window || globalThis;
function _ls() {
  const s = new Map();
  return { getItem: k => s.has(k) ? s.get(k) : null, setItem: (k, v) => s.set(k, String(v)),
    removeItem: k => s.delete(k), clear: () => s.clear(),
    get length() { return s.size; }, key: i => Array.from(s.keys())[i] ?? null };
}
if (typeof globalThis.localStorage === 'undefined') globalThis.localStorage = _ls();
if (typeof globalThis.sessionStorage === 'undefined') globalThis.sessionStorage = _ls();

let pass = 0, fail = 0;
function assert(name, condition, detail) {
  if (condition) { pass++; console.log(`  PASS: ${name}`); }
  else { fail++; console.log(`  FAIL: ${name}${detail ? ' — ' + detail : ''}`); }
}

console.log('=== Wearable runtime-config tests ===\n');

const reg = await import('../js/wearable-adapters.js');

  // Snapshot hardcoded client_ids before any override touches them.
  const baseline = {};
  for (const a of reg.ADAPTERS) if (a?.oauth?.clientId) baseline[a.id] = a.oauth.clientId;

  // 1. Pre-override: getOAuthClientId returns the hardcoded value.
  reg._resetOAuthOverrides();
  assert('getOAuthClientId(oura) returns hardcoded baseline pre-override',
    reg.getOAuthClientId('oura') === baseline.oura);
  assert('getOAuthClientId(withings) returns hardcoded baseline pre-override',
    reg.getOAuthClientId('withings') === baseline.withings);
  assert('getOAuthClientId by adapter object equals by id',
    reg.getOAuthClientId(reg.adapterById('oura')) === reg.getOAuthClientId('oura'));

  // 2. applyOAuthOverrides — single override, single adapter affected.
  reg.applyOAuthOverrides({ oura: 'self-host-oura-id-123' });
  assert('Override wins for the targeted adapter',
    reg.getOAuthClientId('oura') === 'self-host-oura-id-123');
  assert('Override does not leak to other adapters',
    reg.getOAuthClientId('withings') === baseline.withings);

  // 3. applyOAuthOverrides — empty/whitespace strings are ignored, not
  //    treated as a deliberate "blank out". Otherwise an empty env var
  //    would silently clobber the maintainer fallback.
  reg.applyOAuthOverrides({ withings: '   ', polar: '' });
  assert('Empty string override is ignored',
    reg.getOAuthClientId('withings') === baseline.withings);
  assert('Whitespace-only override is ignored',
    reg.getOAuthClientId('polar') === baseline.polar);

  // 4. applyOAuthOverrides — leading/trailing whitespace on a real value
  //    is trimmed (env vars in .env files often pick up stray spaces).
  reg.applyOAuthOverrides({ polar: '  polar-self-id-xyz  ' });
  assert('Override values are trimmed before application',
    reg.getOAuthClientId('polar') === 'polar-self-id-xyz');

  // 5. Non-string / non-object inputs are no-ops, not crashes.
  reg.applyOAuthOverrides(null);
  reg.applyOAuthOverrides(undefined);
  reg.applyOAuthOverrides('not-an-object');
  reg.applyOAuthOverrides({ oura: 42, fitbit: { nested: 'bad' } });
  assert('null override is a safe no-op',
    reg.getOAuthClientId('oura') === 'self-host-oura-id-123');
  assert('Non-string override value is ignored',
    reg.getOAuthClientId('fitbit') === baseline.fitbit);

  // 6. _resetOAuthOverrides restores baseline (used by tests; not by app).
  reg._resetOAuthOverrides();
  assert('_resetOAuthOverrides clears all overrides',
    reg.getOAuthClientId('oura') === baseline.oura);
  assert('_resetOAuthOverrides leaves other adapters at baseline',
    reg.getOAuthClientId('polar') === baseline.polar);

  // 7. Unknown adapter id returns null (not undefined, not a throw).
  assert('Unknown adapter id returns null',
    reg.getOAuthClientId('not-a-real-vendor') === null);

  // 8. The REPLACE_WITH_ pendingClient gate must respect overrides too —
  //    if a self-hoster sets WHOOP_CLIENT_ID, the "waiting on partner
  //    credentials" copy should NOT show. We re-check via the same
  //    helper used by wearables.js:renderAdapterRow.
  const whoopBaseline = reg.adapterById('whoop')?.oauth?.clientId || '';
  assert('WHOOP baseline is REPLACE_WITH_ (preserved gate behavior)',
    whoopBaseline.startsWith('REPLACE_WITH_'));
  reg.applyOAuthOverrides({ whoop: 'real-whoop-self-id' });
  const effectiveWhoop = reg.getOAuthClientId('whoop') || '';
  assert('Self-host override lifts the REPLACE_WITH_ gate',
    !effectiveWhoop.startsWith('REPLACE_WITH_') && effectiveWhoop === 'real-whoop-self-id');

  reg._resetOAuthOverrides();

console.log(`\nResults: ${pass} passed, ${fail} failed, ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
