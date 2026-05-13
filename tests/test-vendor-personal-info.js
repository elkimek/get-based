#!/usr/bin/env node
// test-vendor-personal-info.js — Coverage probe for the per-vendor
// `fetchXxxPersonalInfo` exports (Fitbit / Ultrahuman / Whoop) and the
// per-vendor `logDebug` helpers fired by the daily-range fetchers when
// individual sub-requests fail.
//
// These functions are too thin to merit deep behavioural assertions —
// each is a try/catch around one (or N parallel) GET requests routed
// through `/api/proxy` — but they were the dominant uncalled-function
// source after the AI-verdict consumer sweep. We stub global `fetch`
// to return a fixed shape (success vs error) without inspecting the
// proxied URL: each vendor's PersonalInfo only fires ONE GET, so a
// single global stub is enough.
//
// Run: node tests/test-vendor-personal-info.js  (or via npm test)

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

console.log('=== Vendor PersonalInfo Tests ===\n');

const origFetch = globalThis.fetch;
function stubAll(body, status = 200) {
  globalThis.fetch = async () => new Response(JSON.stringify(body),
    { status, headers: { 'content-type': 'application/json' } });
}

try {
  // ─── Fitbit ─────────────────────────────────────────────────────────
  console.log('Fitbit');
  const fb = await import('../js/wearables-fitbit.js');

  stubAll({ user: { email: 'fitbit@example.com', fullName: 'Fitbit User' } });
  const fbOk = await fb.fetchFitbitPersonalInfo('stub-token');
  assert('Fitbit personalInfo ok=true on success',
    fbOk?.ok === true, JSON.stringify(fbOk));
  assert('Fitbit personalInfo maps email',
    fbOk?.account?.email === 'fitbit@example.com');
  assert('Fitbit personalInfo maps fullName',
    fbOk?.account?.fullName === 'Fitbit User');

  stubAll({ user: { email: 'd@example.com', displayName: 'Display Name' } });
  const fbDisp = await fb.fetchFitbitPersonalInfo('stub-token');
  assert('Fitbit personalInfo falls back to displayName when fullName missing',
    fbDisp?.account?.fullName === 'Display Name');

  stubAll({ errors: [{ message: 'Token expired' }] }, 401);
  const fbErr = await fb.fetchFitbitPersonalInfo('stub-token');
  assert('Fitbit personalInfo ok=false on 401',
    fbErr?.ok === false, JSON.stringify(fbErr));
  assert('Fitbit personalInfo carries status code on error',
    fbErr?.status === 401);

  stubAll({ error: 'sub-request failed' }, 500);
  const fbRows = await fb.fetchFitbitDailyRange('stub-token', '2026-05-01', '2026-05-02');
  assert('Fitbit dailyRange returns array even when every sub-request 500s (logDebug fired)',
    Array.isArray(fbRows));

  // ─── Ultrahuman ─────────────────────────────────────────────────────
  console.log('\nUltrahuman');
  const uh = await import('../js/wearables-ultrahuman.js');

  stubAll({ email: 'uh@example.com', first_name: 'UH', last_name: 'User' });
  const uhOk = await uh.fetchUltrahumanPersonalInfo('stub-token');
  assert('Ultrahuman personalInfo ok=true on success',
    uhOk?.ok === true);
  assert('Ultrahuman personalInfo maps email',
    uhOk?.account?.email === 'uh@example.com');
  assert('Ultrahuman personalInfo maps first/last name',
    uhOk?.account?.firstName === 'UH' && uhOk?.account?.lastName === 'User');

  stubAll({ user: { email: 'nested@example.com', first_name: 'Nested', last_name: 'X' } });
  const uhNested = await uh.fetchUltrahumanPersonalInfo('stub-token');
  assert('Ultrahuman personalInfo unwraps nested .user shape',
    uhNested?.account?.email === 'nested@example.com');

  stubAll({ error: 'forbidden' }, 403);
  const uhErr = await uh.fetchUltrahumanPersonalInfo('stub-token');
  assert('Ultrahuman personalInfo ok=false on 403',
    uhErr?.ok === false);
  assert('Ultrahuman personalInfo carries status code on error',
    uhErr?.status === 403);

  stubAll({ error: 'metrics down' }, 500);
  const uhRows = await uh.fetchUltrahumanDailyRange('stub-token', '2026-05-01', '2026-05-02');
  assert('Ultrahuman dailyRange returns array when every day errors (logDebug fired)',
    Array.isArray(uhRows));

  // ─── Whoop ──────────────────────────────────────────────────────────
  console.log('\nWhoop');
  const wh = await import('../js/wearables-whoop.js');

  stubAll({ email: 'whoop@example.com', first_name: 'WH', last_name: 'User' });
  const whOk = await wh.fetchWhoopPersonalInfo('stub-token');
  assert('Whoop personalInfo ok=true on success',
    whOk?.ok === true, JSON.stringify(whOk));
  assert('Whoop personalInfo carries an account object',
    whOk?.account != null);

  stubAll({ error: 'unauthorized' }, 401);
  const whErr = await wh.fetchWhoopPersonalInfo('stub-token');
  assert('Whoop personalInfo ok=false on 401',
    whErr?.ok === false);

  // ─── Polar (logDebug coverage) ──────────────────────────────────────
  console.log('\nPolar (logDebug)');
  const polar = await import('../js/wearables-polar.js');
  stubAll({ error: 'down' }, 500);
  const polarRows = await polar.fetchPolarDailyRange('stub-token',
    '2026-05-01', '2026-05-02', { userId: 'stub-user' });
  assert('Polar dailyRange returns array when every sub-tx 500s (logDebug fired)',
    Array.isArray(polarRows));

} finally {
  globalThis.fetch = origFetch;
}

console.log(`\nResults: ${pass} passed, ${fail} failed, ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
